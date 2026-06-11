/**
 * MIA Cognitive Final Audit — PATCH 5.1C / PATCH 5.2A
 *
 * Função pura de auditoria final em shadow mode.
 *
 * Compara o que o Cognitive Router classificou com o que o
 * pipeline antigo decidiu e o que realmente aconteceu no final.
 *
 * Princípios (docs/mia_engineering_rules_md_complete.md):
 *   - Governável, explícito, inspetável.
 *   - Logs apenas via MIA_DEBUG ou MIA_DECISION_AUDIT.
 *   - NÃO altera fluxo, winner, card, resposta ou ranking.
 *   - shadowOnly: sempre true.
 */

// ─────────────────────────────────────────────────────────────
// Gate de ativação — seguindo padrão existente do projeto
// (lib/miaDecisionConsistencyAudit.js usa o mesmo padrão)
// ─────────────────────────────────────────────────────────────

export function isCognitiveFinalAuditEnabled() {
  return (
    process.env.MIA_DEBUG === "true" ||
    process.env.MIA_DECISION_AUDIT === "true"
  );
}

// ─────────────────────────────────────────────────────────────
// Helpers de normalização (independentes)
// ─────────────────────────────────────────────────────────────

function normKey(name = "") {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function productsDiverge(a = "", b = "") {
  const ka = normKey(a);
  const kb = normKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return false;
  return !(ka.includes(kb) || kb.includes(ka));
}

function pickProductName(p) {
  if (!p) return null;
  if (typeof p === "string") return p.trim() || null;
  return (
    p.product_name ||
    p.official_name ||
    p.title ||
    null
  );
}

// ─────────────────────────────────────────────────────────────
// Mapeamento de turnType cognitivo → routingMode esperado
// Usado para detectar COGNITIVE_VS_ROUTING_MISMATCH
// ─────────────────────────────────────────────────────────────

const COGNITIVE_TO_ROUTING_AFFINITY = {
  NEW_SEARCH:          ["new_search", "direct", "fresh_search", "force_new"],
  FOLLOW_UP:           ["anchored_reaction", "anchored_hold", "context_lock", "refinement"],
  REFINEMENT:          ["refinement", "priority_change_reopen", "anchored_hold"],
  COMPARISON:          ["comparison_early_explicit", "comparison"],
  COMPARISON_FOLLOWUP: ["comparison_context_lock", "comparison_early_explicit"],
  PRIORITY_SHIFT:      ["priority_change_reopen", "refinement"],
  REACTION:            ["anchored_reaction", "anchored_hold", "general_answer"],
  OBJECTION:           ["anchored_hold", "refinement", "anchored_reaction"],
  EXPLANATION_REQUEST: ["anchored_hold", "anchored_reaction"],
  VALUE_QUESTION:      ["anchored_hold", "anchored_reaction", "context_lock", "refinement"],
  COMMERCIAL_QUESTION: ["anchored_hold", "direct", "refinement"],
  CONVERSATIONAL:      ["general_answer", "guidance_needed", "budget_guide"],
  UNKNOWN:             [],
};

function isRoutingAffinityMismatch(turnType, routingMode) {
  if (!turnType || !routingMode) return false;
  const expected = COGNITIVE_TO_ROUTING_AFFINITY[turnType];
  if (!expected) return false;
  if (expected.length === 0) return false;
  // Verifica se o routingMode possui alguma das afinidades esperadas
  const modeNorm = normKey(routingMode);
  return !expected.some((aff) => modeNorm.includes(normKey(aff)));
}

// ─────────────────────────────────────────────────────────────
// Gerador de divergence flags
// ─────────────────────────────────────────────────────────────

function buildDivergenceFlags({
  cognitiveTurnType,
  detectedIntent,
  routingMode,
  shouldPreserveAnchor,
  responsePath,
  anchorBefore,
  finalWinner,
  pricesFirstProduct,
  winnerVerbalizado,
}) {
  const flags = [];

  // 1a. Sub-flag específico: VALUE_QUESTION com detectedIntent=refinement
  // Detectado independentemente da afinidade de rota — é sempre um sinal de
  // classificação insuficiente no pipeline antigo. Implica COGNITIVE_VS_ROUTING_MISMATCH.
  if (
    cognitiveTurnType === "VALUE_QUESTION" &&
    (detectedIntent === "refinement" || detectedIntent === "context_analysis") &&
    (routingMode === "refinement" || routingMode === "anchored_hold")
  ) {
    flags.push("COGNITIVE_VS_ROUTING_MISMATCH");
    flags.push("VALUE_QUESTION_REROUTED_AS_REFINEMENT");
  }

  // 1. Cognitive Router vs Routing Decision não concordam
  if (isRoutingAffinityMismatch(cognitiveTurnType, routingMode)) {
    flags.push("COGNITIVE_VS_ROUTING_MISMATCH");

    // Sub-tipo específico: VALUE_QUESTION tratada como refinement (routing level)
    if (
      cognitiveTurnType === "VALUE_QUESTION" &&
      routingMode === "refinement"
    ) {
      // já adicionado acima se aplicável
      if (!flags.includes("VALUE_QUESTION_REROUTED_AS_REFINEMENT")) {
        flags.push("VALUE_QUESTION_REROUTED_AS_REFINEMENT");
      }
    }

    // Sub-tipo: COMPARISON_FOLLOWUP perdida
    if (
      cognitiveTurnType === "COMPARISON_FOLLOWUP" &&
      !routingMode?.includes("comparison")
    ) {
      flags.push("COMPARISON_FOLLOWUP_LOST");
    }

    // Sub-tipo: Nova busca enquanto âncora ativa
    if (
      cognitiveTurnType === "NEW_SEARCH" &&
      anchorBefore &&
      routingMode === "anchored_hold"
    ) {
      flags.push("NEW_SEARCH_WHILE_ANCHOR_ACTIVE");
    }
  }

  // 2. Âncora deveria ter sido preservada mas mudou
  if (
    shouldPreserveAnchor &&
    anchorBefore &&
    finalWinner &&
    productsDiverge(anchorBefore, finalWinner)
  ) {
    flags.push("ANCHOR_EXPECTED_BUT_CHANGED");
  }

  // 3. Card (prices[0]) diferente do texto verbalizado
  if (
    pricesFirstProduct &&
    winnerVerbalizado &&
    productsDiverge(pricesFirstProduct, winnerVerbalizado)
  ) {
    flags.push("CARD_TEXT_WINNER_MISMATCH");
  }

  // 4. Path final não identificado
  if (!responsePath || responsePath === "unknown") {
    flags.push("UNKNOWN_FINAL_PATH");
  }

  return flags;
}

// ─────────────────────────────────────────────────────────────
// Função principal — export
// ─────────────────────────────────────────────────────────────

/**
 * Constrói o objeto de auditoria final cognitiva.
 * Pura — não tem efeitos colaterais.
 * Nunca retorna null.
 *
 * @param {object} input
 * @param {object}  [input.cognitiveTurnEarly]     - resultado de classifyMiaTurn (early)
 * @param {object}  [input.cognitiveTurnWithCso]   - resultado de classifyMiaTurn (com CSO)
 * @param {string}  [input.originalQuery]
 * @param {string}  [input.resolvedQuery]
 * @param {string}  [input.detectedIntent]         - do pipeline existente
 * @param {string}  [input.contextAction]          - do pipeline existente
 * @param {object}  [input.routingDecision]        - objeto routingDecision completo
 * @param {string}  [input.responsePath]           - label do path final
 * @param {object}  [input.anchorBefore]           - lastBestProduct antes da resposta
 * @param {object}  [input.finalSessionContext]    - session_context do payload final
 * @param {Array}   [input.prices]                 - array de prices do payload final
 * @param {string}  [input.reply]                  - texto da resposta final
 * @param {object}  [input.decisionSnapshot]       - snapshot do miaDecisionConsistencyAudit
 * @param {object}  [input.cognitiveAuthority]     - resultado de applyCognitiveAuthorityToRoutingDecision (PATCH 5.2A)
 * @param {object}  [input.intentPreservation]     - resultado de applyIntentPreservation (PATCH 5.2B)
 * @returns {object} audit — objeto de auditoria, nunca null
 */
export function buildCognitiveFinalAudit(input = {}) {
  const {
    cognitiveTurnEarly = null,
    cognitiveTurnWithCso = null,
    originalQuery = "",
    resolvedQuery = "",
    detectedIntent = "",
    contextAction = "",
    routingDecision = {},
    responsePath = "",
    anchorBefore = null,
    finalSessionContext = null,
    prices: pricesRaw = [],
    reply = "",
    decisionSnapshot = null,
    cognitiveAuthority = null,
    intentPreservation = null,
  } = input;

  // Garantir que prices é sempre um array
  const prices = Array.isArray(pricesRaw) ? pricesRaw : [];

  // Derivar dados do pipeline existente
  const rd = routingDecision || {};
  const routingMode = rd.mode || null;
  const shouldPreserveAnchor = rd.permissions?.shouldPreserveAnchor ?? rd.shouldPreserveAnchor ?? null;
  const allowNewSearch = rd.permissions?.allowNewSearch ?? rd.allowNewSearch ?? null;
  const allowRerank = rd.permissions?.allowRerank ?? rd.allowRerank ?? null;

  // Produto âncora antes da resposta
  const anchorBeforeName = pickProductName(anchorBefore) || null;

  // Produto final (vencedor real após toda a pipeline)
  const finalWinnerName =
    pickProductName(finalSessionContext?.lastBestProduct) ||
    decisionSnapshot?.winner_real ||
    pickProductName(prices[0]) ||
    null;

  // Primeiro produto em prices
  const pricesFirstProduct = pickProductName(prices[0]) || null;

  // Produto verbalizado na resposta
  const winnerVerbalizado = decisionSnapshot?.winner_verbalizado || null;

  // Âncora preservada?
  const anchorPreserved =
    anchorBeforeName && finalWinnerName
      ? !productsDiverge(anchorBeforeName, finalWinnerName)
      : null;

  // Cognitive turn types (usar withCso quando disponível, fallback para early)
  const cognitiveEarlyTurnType = cognitiveTurnEarly?.turnType || null;
  const cognitiveCsoTurnType = cognitiveTurnWithCso?.turnType || null;
  const primaryCognitiveTurnType = cognitiveCsoTurnType || cognitiveEarlyTurnType || null;

  // Divergence flags
  const divergenceFlags = buildDivergenceFlags({
    cognitiveTurnType: primaryCognitiveTurnType,
    detectedIntent,
    routingMode,
    shouldPreserveAnchor,
    responsePath,
    anchorBefore: anchorBeforeName,
    finalWinner: finalWinnerName,
    pricesFirstProduct,
    winnerVerbalizado,
  });

  // Flags do decisionSnapshot existente (compatibilidade)
  const legacyDivergences = decisionSnapshot?.divergences || [];

  return {
    // Identificação do turno
    originalQuery,
    resolvedQuery,
    // Classificação cognitiva
    cognitiveEarlyTurnType,
    cognitiveCsoTurnType,
    primaryCognitiveTurnType,
    cognitiveEarlyConfidence: cognitiveTurnEarly?.confidence ?? null,
    cognitiveCsoConfidence: cognitiveTurnWithCso?.confidence ?? null,
    cognitiveEarlyReasons: cognitiveTurnEarly?.reasons || [],
    cognitiveCsoReasons: cognitiveTurnWithCso?.reasons || [],
    // Pipeline antigo
    detectedIntent,
    contextAction,
    routingMode,
    routingDecisionShouldPreserveAnchor: shouldPreserveAnchor,
    routingDecisionAllowNewSearch: allowNewSearch,
    routingDecisionAllowRerank: allowRerank,
    responsePath: responsePath || "unknown",
    // Produtos
    anchorBefore: anchorBeforeName,
    finalWinner: finalWinnerName,
    pricesFirstProduct,
    winnerVerbalizado,
    anchorPreserved,
    // Flags
    divergenceFlags,
    legacyDivergences,
    hasDivergence: divergenceFlags.length > 0,
    // PATCH 5.2A — autoridade cognitiva aplicada neste turno
    cognitiveAuthority: cognitiveAuthority || null,
    // PATCH 5.2B — preservação de intenção aplicada neste turno
    intentPreservation: intentPreservation || null,
    // Metadados
    shadowOnly: true,
    auditVersion: "5.2B",
  };
}

/**
 * Log da auditoria final — apenas quando debug ativo.
 */
export function logCognitiveFinalAudit(audit) {
  if (!isCognitiveFinalAuditEnabled()) return;
  if (!audit) return;

  // Registrar preservação de intenção aplicada (PATCH 5.2B)
  if (audit.intentPreservation?.active) {
    console.log(
      "[MIA_INTENT_PRESERVATION] ✓ Preservação ativa:",
      JSON.stringify({
        intent: audit.intentPreservation.intent,
        reason: audit.intentPreservation.reason,
        anchor: audit.intentPreservation.anchor,
        modeUpgraded: audit.intentPreservation.modeUpgraded,
        previousMode: audit.intentPreservation.previousMode,
      }, null, 2)
    );
  }

  // Registrar autoridade cognitiva aplicada (PATCH 5.2A)
  if (audit.cognitiveAuthority?.applied) {
    console.log(
      "[MIA_COGNITIVE_AUTHORITY] ✓ Autoridade aplicada:",
      JSON.stringify({
        scope: audit.cognitiveAuthority.scope,
        turnType: audit.cognitiveAuthority.turnType,
        reason: audit.cognitiveAuthority.reason,
        anchor: audit.cognitiveAuthority.anchor,
        previousMode: audit.cognitiveAuthority.previousMode,
      }, null, 2)
    );
  }

  if (audit.hasDivergence) {
    console.log(
      "[MIA_COGNITIVE_FINAL_AUDIT] ⚠️ DIVERGÊNCIAS:",
      JSON.stringify({
        primaryCognitiveTurnType: audit.primaryCognitiveTurnType,
        routingMode: audit.routingMode,
        responsePath: audit.responsePath,
        divergenceFlags: audit.divergenceFlags,
        anchorPreserved: audit.anchorPreserved,
        originalQuery: audit.originalQuery,
      }, null, 2)
    );
  } else {
    console.log(
      "[MIA_COGNITIVE_FINAL_AUDIT] ✓ ok:",
      audit.primaryCognitiveTurnType,
      "→", audit.responsePath,
      "| winner:", audit.finalWinner || "n/a"
    );
  }
}
