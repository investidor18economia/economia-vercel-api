/**
 * MIA Cognitive Authority — PATCH 5.2A
 *
 * Primeira camada de autoridade controlada do Cognitive Router.
 *
 * Escopo ESTRITO — apenas dois casos seguros:
 *   - VALUE_QUESTION  com âncora ativa
 *   - EXPLANATION_REQUEST com âncora ativa
 *
 * Princípios (docs/mia_engineering_rules_md_complete.md):
 *   - MIA owns the intelligence. The LLM only verbalizes.
 *   - Arquitetura primeiro. Governável, explícito, inspecionável.
 *   - Não substitui buildRoutingDecision.
 *   - Não cria nova lógica de winner.
 *   - Apenas bloqueia nova busca e preserva âncora para turnos explicativos/valorativos.
 *
 * Por que VALUE_QUESTION e EXPLANATION_REQUEST são seguros:
 *   - Nunca envolvem escolha de produto novo.
 *   - Sempre se referem ao produto já recomendado.
 *   - Bloquear nova busca nesses casos nunca piora a qualidade — só evita troca indevida.
 *   - O winner continua vindo da âncora/contrato existente.
 */

// ─────────────────────────────────────────────────────────────
// Constantes do escopo de autoridade
// ─────────────────────────────────────────────────────────────

export const COGNITIVE_AUTHORITY_SCOPE = Object.freeze({
  VALUE_EXPLANATION_ANCHOR_HOLD: "VALUE_EXPLANATION_ANCHOR_HOLD",
  NOT_APPLIED: "NOT_APPLIED",
});

// Turn types que ativam autoridade (imutável — não expandir sem patch dedicado)
const AUTHORITY_TURN_TYPES = new Set(["VALUE_QUESTION", "EXPLANATION_REQUEST"]);

// ─────────────────────────────────────────────────────────────
// Guards de segurança
// ─────────────────────────────────────────────────────────────

function hasReliableAnchor(lastBestProduct, sessionContext) {
  const fromLastBest = lastBestProduct?.product_name;
  const fromSession = sessionContext?.lastBestProduct?.product_name;
  return !!(fromLastBest || fromSession);
}

function isSafeAuthorityCase(cognitiveTurn, lastBestProduct, sessionContext) {
  if (!cognitiveTurn) return false;
  if (!AUTHORITY_TURN_TYPES.has(cognitiveTurn.turnType)) return false;
  if (!hasReliableAnchor(lastBestProduct, sessionContext)) return false;
  // Não aplicar com baixa confiança — protege contra classificações incertas
  if ((cognitiveTurn.confidence ?? 0) < 0.6) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────
// Função principal — export
// ─────────────────────────────────────────────────────────────

/**
 * Aplica autoridade cognitiva controlada ao routingDecision.
 *
 * NÃO muta o objeto original — retorna uma cópia enriquecida.
 * NÃO altera winner, card, ranking ou verbalização.
 * NÃO é chamada quando earlyClearNewCommercialSearch é true.
 *
 * @param {object} input
 * @param {object}  input.cognitiveTurn       - resultado de classifyMiaTurn
 * @param {object}  input.routingDecision     - routingDecision atual
 * @param {object}  [input.sessionContext]    - session context do request
 * @param {object}  [input.lastBestProduct]   - produto âncora ativo
 * @param {string}  [input.originalQuery]
 * @param {string}  [input.resolvedQuery]
 * @param {boolean} [input.earlyClearNewCommercialSearch] - se true, bloqueia autoridade
 * @returns {{ routingDecision, applied, reason, authorityScope, cognitiveAuthority }}
 */
export function applyCognitiveAuthorityToRoutingDecision(input = {}) {
  const {
    cognitiveTurn = null,
    routingDecision = null,
    sessionContext = {},
    lastBestProduct = null,
    originalQuery = "",
    resolvedQuery = "",
    earlyClearNewCommercialSearch = false,
  } = input;

  // Guard: se não há routingDecision, retornar como-está
  if (!routingDecision) {
    return {
      routingDecision,
      applied: false,
      reason: "no_routing_decision",
      authorityScope: COGNITIVE_AUTHORITY_SCOPE.NOT_APPLIED,
      cognitiveAuthority: null,
    };
  }

  // Guard: se há sinal forte de nova busca explícita, não interferir
  if (earlyClearNewCommercialSearch) {
    return {
      routingDecision,
      applied: false,
      reason: "early_clear_new_commercial_search_active",
      authorityScope: COGNITIVE_AUTHORITY_SCOPE.NOT_APPLIED,
      cognitiveAuthority: null,
    };
  }

  // Guard: verificar se caso é seguro para aplicar autoridade
  if (!isSafeAuthorityCase(cognitiveTurn, lastBestProduct, sessionContext)) {
    return {
      routingDecision,
      applied: false,
      reason: cognitiveTurn
        ? `turn_type_${cognitiveTurn.turnType}_not_in_authority_scope`
        : "no_cognitive_turn",
      authorityScope: COGNITIVE_AUTHORITY_SCOPE.NOT_APPLIED,
      cognitiveAuthority: null,
    };
  }

  // Guard: se o routingDecision já está em modo seguro, não sobrescrever desnecessariamente
  // (evita adicionar reasons redundantes em casos que o pipeline já pegou corretamente)
  const alreadySafe =
    !routingDecision.allowNewSearch &&
    routingDecision.shouldPreserveAnchor &&
    !routingDecision.allowRerank;

  if (alreadySafe) {
    const anchor = lastBestProduct?.product_name || sessionContext?.lastBestProduct?.product_name;
    return {
      routingDecision,
      applied: false,
      reason: "routing_decision_already_in_safe_anchor_hold",
      authorityScope: COGNITIVE_AUTHORITY_SCOPE.NOT_APPLIED,
      cognitiveAuthority: {
        applied: false,
        scope: COGNITIVE_AUTHORITY_SCOPE.NOT_APPLIED,
        turnType: cognitiveTurn.turnType,
        reason: "routing_already_safe",
        confidence: cognitiveTurn.confidence,
        anchor,
      },
    };
  }

  // Aplicar autoridade — clonar routingDecision para não mutar o original
  const updatedRoutingDecision = {
    ...routingDecision,
    // Permissões de anchor hold
    allowNewSearch: false,
    allowCommercialFallback: false,
    allowReplaceWinner: false,
    allowRerank: false,
    shouldPreserveAnchor: true,
    // Preservar anchorProduct já existente ou usar lastBestProduct
    anchorProduct: routingDecision.anchorProduct || lastBestProduct || sessionContext?.lastBestProduct || null,
    // Atualizar mode para refletir o hold cognitivo
    mode: "cognitive_anchor_hold",
    conversationAct: cognitiveTurn.turnType === "VALUE_QUESTION"
      ? "value_question_anchor_hold"
      : "explanation_request_anchor_hold",
    responsePathHint: "anchored_context",
    // Preservar reasons existentes e adicionar razão cognitiva
    reasons: [
      ...(routingDecision.reasons || []),
      `cognitive_authority_${cognitiveTurn.turnType.toLowerCase()}_anchor_hold`,
    ],
  };

  const anchor =
    updatedRoutingDecision.anchorProduct?.product_name ||
    lastBestProduct?.product_name ||
    sessionContext?.lastBestProduct?.product_name ||
    null;

  const reasonCode = cognitiveTurn.turnType === "VALUE_QUESTION"
    ? "value_question_with_active_anchor"
    : "explanation_request_with_active_anchor";

  const cognitiveAuthority = {
    applied: true,
    scope: COGNITIVE_AUTHORITY_SCOPE.VALUE_EXPLANATION_ANCHOR_HOLD,
    turnType: cognitiveTurn.turnType,
    reason: reasonCode,
    confidence: cognitiveTurn.confidence,
    anchor,
    previousMode: routingDecision.mode,
    previousAllowNewSearch: routingDecision.allowNewSearch,
    previousShouldPreserveAnchor: routingDecision.shouldPreserveAnchor,
  };

  return {
    routingDecision: updatedRoutingDecision,
    applied: true,
    reason: reasonCode,
    authorityScope: COGNITIVE_AUTHORITY_SCOPE.VALUE_EXPLANATION_ANCHOR_HOLD,
    cognitiveAuthority,
  };
}
