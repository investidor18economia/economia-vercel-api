/**
 * MIA Intent Preservation Layer — PATCH 5.2B
 *
 * Camada de preservação de intenção para EXPLANATION_REQUEST.
 *
 * Problema que resolve:
 *   O CSO verbalizer (bloco anterior) consegue lidar com VALUE_QUESTION
 *   porque o classificador LLM reconhece "vale a pena?" como uma intent
 *   conversacional válida. Para EXPLANATION_REQUEST ("por que você recomendou?"),
 *   o classificador LLM não produz um convStrat → o CSO verbalizer não dispara →
 *   o fluxo cai no `directReply` genérico ("Posso te ajudar com compras...").
 *
 * O que esta camada faz:
 *   Se EXPLANATION_REQUEST com âncora confiável for detectado E o CSO verbalizer
 *   não o resolveu (o fluxo chegou até aqui), esta camada:
 *   1. Limpa `directReply` para evitar o early return genérico (linha 25415)
 *   2. Muda `routingDecision.mode` de "context_hold" para "cognitive_anchor_hold"
 *      para evitar o response hardcoded de shouldSkipCommercialProductPipeline
 *      (linha 26902), permitindo que o data layer rode e o LLM seja chamado
 *      com o contexto do produto âncora
 *
 * Princípios:
 *   - NÃO cria respostas prontas.
 *   - NÃO usa listas de frases ou regex como mecanismo principal.
 *   - Trabalha exclusivamente sobre a intenção já classificada pelo Cognitive Router.
 *   - NÃO afeta VALUE_QUESTION (esse é resolvido pelo CSO verbalizer antes).
 *   - NÃO afeta outros turnTypes.
 *   - Cirúrgico: apenas desbloqueia o caminho que já existe no sistema.
 */

// ─────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────

// Modos de routingDecision que disparam respostas hardcoded em shouldSkipCommercialProductPipeline.
// Para EXPLANATION_REQUEST, precisamos sair desses modos para que o LLM seja chamado.
const HARDCODED_PIPELINE_SKIP_MODES = new Set([
  "anchored_reaction",
  "context_decision",
  "context_hold",
]);

// ─────────────────────────────────────────────────────────────
// Guards internos (sem phrase-matching)
// ─────────────────────────────────────────────────────────────

function hasReliableAnchor(lastBestProduct, sessionContext) {
  return !!(
    lastBestProduct?.product_name ||
    sessionContext?.lastBestProduct?.product_name
  );
}

function isPreservationCase(cognitiveTurn, lastBestProduct, sessionContext) {
  if (!cognitiveTurn) return false;
  // Apenas EXPLANATION_REQUEST
  if (cognitiveTurn.turnType !== "EXPLANATION_REQUEST") return false;
  // Âncora confiável obrigatória
  if (!hasReliableAnchor(lastBestProduct, sessionContext)) return false;
  // Confiança mínima
  if ((cognitiveTurn.confidence ?? 0) < 0.6) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────
// Lógica do patch a aplicar em contextResolution
// ─────────────────────────────────────────────────────────────

function buildContextResolutionPatch(contextResolution) {
  const patch = {};
  // Limpar directReply genérico para evitar o early return em 25415.
  // Não importa o conteúdo do directReply — para EXPLANATION_REQUEST com âncora,
  // qualquer directReply seria indevido (seria uma resposta hardcoded sem âncora).
  if (contextResolution?.directReply) {
    patch.directReply = null;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

// ─────────────────────────────────────────────────────────────
// Lógica do patch a aplicar em routingDecision
// ─────────────────────────────────────────────────────────────

function buildRoutingDecisionPatch(routingDecision, lastBestProduct, sessionContext) {
  // Só precisamos mudar o mode se ele estiver em um dos modos de response hardcoded.
  // "context_hold" é o caso típico quando buildContextResolution retorna shouldSkipProductSearch=true.
  if (!HARDCODED_PIPELINE_SKIP_MODES.has(routingDecision?.mode)) {
    return null;
  }

  const anchor =
    routingDecision?.anchorProduct ||
    lastBestProduct ||
    sessionContext?.lastBestProduct ||
    null;

  return {
    // Mudar para cognitive_anchor_hold para:
    // 1. shouldSkipCommercialProductPipeline retorna false (não dispara hardcoded reply)
    // 2. Continua preservando permissões de anchor hold
    mode: "cognitive_anchor_hold",
    conversationAct: "explanation_request_anchor_hold",
    // Manter permissões de hold — garantia explícita mesmo se context_hold já as tinha
    allowNewSearch: false,
    allowCommercialFallback: false,
    allowReplaceWinner: false,
    allowRerank: false,
    shouldPreserveAnchor: true,
    anchorProduct: anchor,
    // Adicionar reason explicativa
    reasons: [
      ...(routingDecision?.reasons || []),
      "intent_preservation_explanation_request_mode_upgrade",
    ],
  };
}

// ─────────────────────────────────────────────────────────────
// Função principal — export
// ─────────────────────────────────────────────────────────────

/**
 * Aplica a camada de preservação de intenção para EXPLANATION_REQUEST.
 *
 * Pura — não tem efeitos colaterais.
 * Retorna patches para contextResolution e routingDecision que o chamador aplica.
 *
 * @param {object} input
 * @param {object}  input.cognitiveTurn       - resultado de classifyMiaTurn (early ou withCso)
 * @param {object}  input.routingDecision     - routingDecision atual
 * @param {object}  [input.sessionContext]    - session context do request
 * @param {object}  [input.lastBestProduct]   - produto âncora ativo
 * @param {object}  [input.contextResolution] - contextResolution atual
 * @returns {{ preservedIntent, preservationApplied, preservationReason, metadata, contextResolutionPatch, routingDecisionPatch }}
 */
export function applyIntentPreservation(input = {}) {
  const {
    cognitiveTurn = null,
    routingDecision = null,
    sessionContext = {},
    lastBestProduct = null,
    contextResolution = {},
  } = input;

  const notApplied = {
    preservedIntent: null,
    preservationApplied: false,
    preservationReason: null,
    metadata: {
      intentPreservation: {
        active: false,
        intent: null,
        reason: null,
      },
    },
    contextResolutionPatch: null,
    routingDecisionPatch: null,
  };

  if (!isPreservationCase(cognitiveTurn, lastBestProduct, sessionContext)) {
    const reason = cognitiveTurn
      ? `turn_type_${cognitiveTurn.turnType}_not_in_preservation_scope`
      : "no_cognitive_turn";
    return { ...notApplied, preservationReason: reason };
  }

  const crPatch = buildContextResolutionPatch(contextResolution);
  const rdPatch = buildRoutingDecisionPatch(routingDecision, lastBestProduct, sessionContext);

  const anchor =
    lastBestProduct?.product_name ||
    sessionContext?.lastBestProduct?.product_name ||
    null;

  const metadata = {
    intentPreservation: {
      active: true,
      intent: "EXPLANATION_REQUEST",
      reason: "explanation_request_with_active_anchor",
      confidence: cognitiveTurn.confidence,
      anchor,
      hadDirectReply: !!(contextResolution?.directReply),
      previousMode: routingDecision?.mode || null,
      modeUpgraded: rdPatch !== null,
    },
  };

  return {
    preservedIntent: "EXPLANATION_REQUEST",
    preservationApplied: true,
    preservationReason: "explanation_request_with_active_anchor",
    metadata,
    contextResolutionPatch: crPatch,
    routingDecisionPatch: rdPatch,
  };
}
