/**
 * PATCH 5.6B — Cognitive Intent Authority Bridge
 *
 * Ponte segura entre o Cognitive Router e o sistema de intent legacy.
 * Para turnTypes estáveis e com confiança suficiente, o resultado do
 * Cognitive Router sobrescreve o `intent` produzido por `detectIntent()`.
 *
 * ESCOPO RESTRITO:
 *   - Apenas turnTypes na ALLOWLIST são bridgeados.
 *   - Requer confidence >= THRESHOLD.
 *   - NÃO altera winner, ranking, Data Layer ou verbalização.
 *   - NÃO resolve frases específicas (opera sobre intenção classificada).
 *
 * Módulo puro — sem side effects, sem acesso ao handler, testável de forma isolada.
 */

// ─────────────────────────────────────────────────────────────
// Constantes exportadas (usadas nos testes e no handler)
// ─────────────────────────────────────────────────────────────

/**
 * Confiança mínima para que a ponte seja aplicada.
 * Alinhado com os thresholds do resolveTurnTypeFromSignals (mínimo EXPLANATION_REQUEST = 0.83).
 */
export const COGNITIVE_BRIDGE_CONFIDENCE_THRESHOLD = 0.75;

/**
 * Mapeamento de turnType cognitivo → intent legacy.
 *
 * "decision"  → faz contextAction="decision", entra no branch contextual
 *               (rich explanation path, anchor hold)
 * "refinement"→ refinamento dentro do contexto atual
 * "comparison"→ comparação explícita
 * "search"    → nova busca comercial
 *
 * EXPLANATION_REQUEST e VALUE_QUESTION mapeiam para "decision" porque:
 *   - Não podem virar nova busca
 *   - Devem manter o âncora
 *   - O branch "decision" é o que aciona o rich explanation path
 */
export const COGNITIVE_TO_LEGACY_INTENT_MAP = Object.freeze({
  EXPLANATION_REQUEST: "decision",
  VALUE_QUESTION:      "decision",
  REFINEMENT:          "refinement",
  COMPARISON:          "comparison",
  NEW_SEARCH:          "search",
});

/**
 * Conjunto de turnTypes para os quais a ponte está autorizada.
 * Todos têm confiança >= 0.78 no router e cobertura de testes validada.
 *
 * NÃO incluídos (ficam com legacy):
 *   CONVERSATIONAL, REACTION, OBJECTION, PRIORITY_SHIFT,
 *   FOLLOW_UP, COMPARISON_FOLLOWUP, COMMERCIAL_QUESTION, UNKNOWN
 */
export const COGNITIVE_BRIDGE_ALLOWLIST = new Set(
  Object.keys(COGNITIVE_TO_LEGACY_INTENT_MAP)
);

// ─────────────────────────────────────────────────────────────
// Função principal
// ─────────────────────────────────────────────────────────────

/**
 * Tenta mapear o resultado do Cognitive Router para um intent legacy.
 *
 * @param {object|null} cognitiveTurn - Resultado de classifyMiaTurn()
 * @returns {{
 *   active: boolean,
 *   intent: string|null,
 *   reason: string,
 *   cognitiveTurnType?: string,
 *   confidence?: number
 * }}
 */
export function mapCognitiveTurnToLegacyIntent(cognitiveTurn) {
  if (!cognitiveTurn) {
    return { active: false, intent: null, reason: "no_cognitive_turn" };
  }

  const { turnType, confidence } = cognitiveTurn;

  if (!COGNITIVE_BRIDGE_ALLOWLIST.has(turnType)) {
    return {
      active: false,
      intent: null,
      reason: "turn_type_not_in_allowlist",
      cognitiveTurnType: turnType,
      confidence,
    };
  }

  if (typeof confidence !== "number" || confidence < COGNITIVE_BRIDGE_CONFIDENCE_THRESHOLD) {
    return {
      active: false,
      intent: null,
      reason: "low_confidence",
      cognitiveTurnType: turnType,
      confidence,
    };
  }

  const mappedIntent = COGNITIVE_TO_LEGACY_INTENT_MAP[turnType];
  if (!mappedIntent) {
    return {
      active: false,
      intent: null,
      reason: "no_mapping",
      cognitiveTurnType: turnType,
      confidence,
    };
  }

  return {
    active: true,
    intent: mappedIntent,
    reason: "safe_cognitive_turn_authority",
    cognitiveTurnType: turnType,
    confidence,
  };
}

/**
 * Constrói o objeto de auditoria para o pipelineTracer.
 * Inclui fromIntent e toIntent para diagnóstico de delta.
 *
 * @param {object} bridgeResult - Resultado de mapCognitiveTurnToLegacyIntent()
 * @param {string} fromIntent   - Intent original (antes da ponte)
 * @returns {object}
 */
export function buildCognitiveBridgeAudit(bridgeResult, fromIntent) {
  if (!bridgeResult.active) {
    return {
      active: false,
      reason: bridgeResult.reason,
      cognitiveTurnType: bridgeResult.cognitiveTurnType ?? null,
      confidence: bridgeResult.confidence ?? null,
    };
  }

  return {
    active: true,
    fromIntent,
    toIntent: bridgeResult.intent,
    cognitiveTurnType: bridgeResult.cognitiveTurnType,
    confidence: bridgeResult.confidence,
    reason: bridgeResult.reason,
  };
}

// ─────────────────────────────────────────────────────────────
// PATCH 5.6D — Cognitive ContextAction Guard
// ─────────────────────────────────────────────────────────────

/**
 * turnTypes cobertos pelo guard neste patch.
 * Somente EXPLANATION_REQUEST e VALUE_QUESTION — os demais ficam para patches futuros.
 */
const _GUARD_SCOPE_TURN_TYPES = new Set(["EXPLANATION_REQUEST", "VALUE_QUESTION"]);

/**
 * contextActions incompatíveis com os turnTypes cobertos pelo guard.
 * Quando um desses aparece após a bridge, é sinal de desalinhamento.
 * "analysis" não está aqui porque é uma rota contextual ainda aceitável.
 */
const _INCOMPATIBLE_CONTEXT_ACTIONS = new Set([
  "conversation",
  "search",
  "refinement",
  "comparison",
]);

/**
 * Rota segura de fallback quando o guard precisa corrigir.
 * "decision" aciona o branch contextual do handler e o rich explanation path.
 */
const _SAFE_CONTEXT_ACTION = "decision";

/**
 * PATCH 5.6D — Blinda o contextAction final quando o Cognitive Router
 * assumiu autoridade via bridge e o contextAction saiu incompatível.
 *
 * Atua somente quando:
 *   - bridge foi aplicada (bridgeApplied = true)
 *   - cognitiveTurnType é EXPLANATION_REQUEST ou VALUE_QUESTION
 *   - contextAction atual está no conjunto incompatível
 *
 * Módulo puro — sem side effects, testável de forma isolada.
 *
 * @param {object} input
 * @param {string}      input.contextAction       - contextAction calculado por detectContextAction()
 * @param {object|null} input.bridgeAudit         - Saída de buildCognitiveBridgeAudit()
 * @param {object|null} input.cognitiveTurnEarly  - Resultado de classifyMiaTurn() early
 * @param {string}      [input.finalIntent]       - intent atual (para diagnóstico)
 * @returns {{
 *   contextAction: string,
 *   applied: boolean,
 *   reason: string,
 *   fromContextAction: string,
 *   toContextAction: string|null,
 *   cognitiveTurnType: string|null,
 *   bridgeApplied: boolean
 * }}
 */
export function guardContextActionWithCognitiveBridge({
  contextAction      = "",
  bridgeAudit        = null,
  cognitiveTurnEarly = null,
  finalIntent        = "",
} = {}) {
  const cognitiveTurnType = cognitiveTurnEarly?.turnType ?? null;
  const bridgeApplied     = !!bridgeAudit?.active;

  // Guard não atua se a bridge não foi aplicada
  if (!bridgeApplied) {
    return {
      contextAction,
      applied: false,
      reason: "bridge_not_applied",
      fromContextAction: contextAction,
      toContextAction: null,
      cognitiveTurnType,
      bridgeApplied,
    };
  }

  // Guard não atua fora do escopo deste patch
  if (!_GUARD_SCOPE_TURN_TYPES.has(cognitiveTurnType)) {
    return {
      contextAction,
      applied: false,
      reason: "turn_type_not_supported",
      fromContextAction: contextAction,
      toContextAction: null,
      cognitiveTurnType,
      bridgeApplied,
    };
  }

  // contextAction já é compatível — não precisa de correção
  if (!_INCOMPATIBLE_CONTEXT_ACTIONS.has(contextAction)) {
    return {
      contextAction,
      applied: false,
      reason: "context_action_already_aligned",
      fromContextAction: contextAction,
      toContextAction: null,
      cognitiveTurnType,
      bridgeApplied,
    };
  }

  // Guard aplica — corrige para rota contextual segura
  return {
    contextAction: _SAFE_CONTEXT_ACTION,
    applied: true,
    reason: "cognitive_bridge_context_action_correction",
    fromContextAction: contextAction,
    toContextAction: _SAFE_CONTEXT_ACTION,
    cognitiveTurnType,
    bridgeApplied,
  };
}

// ─────────────────────────────────────────────────────────────
// PATCH 5.6C — Cognitive Bridge Impact Audit
// ─────────────────────────────────────────────────────────────

/**
 * Modos de routing que são claramente incompatíveis com turnTypes de contexto.
 * Se um desses modos aparecer para um turno que deveria preservar âncora, é divergência.
 */
const _CONTEXT_SKIP_MODES = new Set([
  "general_answer",
  "casual_chat",
  "guidance_needed",
  "empty",
]);

/**
 * Mapeamento interno: turnType → contextAction esperado após bridge.
 * Reflete o comportamento de detectContextAction() quando o intent bridgeado é passado.
 *
 * @param {string} turnType
 * @returns {string|null}
 */
function _expectedContextActionForTurnType(turnType) {
  const map = {
    EXPLANATION_REQUEST: "decision",
    VALUE_QUESTION:      "decision",
    REFINEMENT:          "refinement",
    COMPARISON:          "comparison",
    NEW_SEARCH:          "search",
  };
  return map[turnType] ?? null;
}

/**
 * PATCH 5.6C — Audita o impacto real da ponte cognitive → legacy.
 *
 * Compara a intenção original do legacy com o estado final após bridge,
 * contextAction e routingDecision, e detecta divergências remanescentes.
 *
 * Módulo puro — sem side effects.
 *
 * @param {object} input
 * @param {object|null} input.bridgeAudit          - Saída de buildCognitiveBridgeAudit()
 * @param {object|null} input.cognitiveTurnEarly   - Resultado de classifyMiaTurn() early
 * @param {string}      input.finalIntent          - intent atual (após bridge)
 * @param {string}      input.contextActionFinal   - contextAction final do handler
 * @param {string}      input.routingDecisionMode  - routingDecision.mode final (pós PATCH 5.3B)
 * @param {boolean}     [input.hasActiveAnchor]    - se há âncora ativa na sessão
 * @returns {object}
 */
export function buildCognitiveBridgeImpactAudit({
  bridgeAudit         = null,
  cognitiveTurnEarly  = null,
  finalIntent         = "",
  contextActionFinal  = "",
  routingDecisionMode = "",
  hasActiveAnchor     = false,
} = {}) {
  const auditVersion = "5.6C";

  const legacyIntentOriginal = bridgeAudit?.fromIntent ?? finalIntent;
  const bridgeApplied        = !!bridgeAudit?.active;
  const bridgeReason         = bridgeAudit?.reason ?? "no_bridge_audit";
  const cognitiveTurnType    = cognitiveTurnEarly?.turnType ?? null;
  const cognitiveConfidence  = cognitiveTurnEarly?.confidence ?? null;
  const bridgedIntent        = bridgeApplied ? (bridgeAudit.toIntent ?? null) : null;

  const inAllowlist    = COGNITIVE_BRIDGE_ALLOWLIST.has(cognitiveTurnType);
  const highConfidence = typeof cognitiveConfidence === "number" &&
                         cognitiveConfidence >= COGNITIVE_BRIDGE_CONFIDENCE_THRESHOLD;

  const remainingDivergenceFlags = [];

  // ── Flag: COMPARISON_FOLLOWUP — excluído por design, não é erro ──
  if (cognitiveTurnType === "COMPARISON_FOLLOWUP") {
    remainingDivergenceFlags.push("COMPARISON_FOLLOWUP_UNBRIDGED");
  }

  // ── Flags de não-ativação da bridge ──

  if (!bridgeApplied) {
    if (inAllowlist && highConfidence && cognitiveTurnType !== "COMPARISON_FOLLOWUP") {
      // Estava apto para bridge mas não foi aplicada — anomalia
      remainingDivergenceFlags.push("BRIDGE_NOT_APPLIED_SAFE_TURN");
    } else if (inAllowlist && !highConfidence && cognitiveTurnType !== "COMPARISON_FOLLOWUP") {
      remainingDivergenceFlags.push("LOW_CONFIDENCE_NO_BRIDGE");
    } else if (!inAllowlist && cognitiveTurnType && cognitiveTurnType !== "COMPARISON_FOLLOWUP") {
      remainingDivergenceFlags.push("TURN_TYPE_NOT_ALLOWLISTED");
    }
  }

  // ── Flags de impacto pós-bridge ──

  if (bridgeApplied) {
    // 1. Intent final deve corresponder ao mapeamento esperado
    const expectedIntent = COGNITIVE_TO_LEGACY_INTENT_MAP[cognitiveTurnType];
    if (expectedIntent && finalIntent !== expectedIntent) {
      remainingDivergenceFlags.push("FINAL_INTENT_MISMATCH");
    }

    // 2. contextAction final deve ser compatível com o turnType
    const expectedContextAction = _expectedContextActionForTurnType(cognitiveTurnType);
    if (expectedContextAction && contextActionFinal !== expectedContextAction) {
      remainingDivergenceFlags.push("CONTEXT_ACTION_MISMATCH");
    }

    // 3. Routing mode não deve ser um modo "skip context" para turnTypes com âncora
    const isContextHoldTurn =
      cognitiveTurnType === "EXPLANATION_REQUEST" ||
      cognitiveTurnType === "VALUE_QUESTION";
    if (isContextHoldTurn && hasActiveAnchor && _CONTEXT_SKIP_MODES.has(routingDecisionMode)) {
      remainingDivergenceFlags.push("ROUTING_MODE_MISMATCH");
    }
  }

  const alignedWithCognitiveTurn = remainingDivergenceFlags.length === 0 ||
    (remainingDivergenceFlags.length === 1 &&
     remainingDivergenceFlags[0] === "COMPARISON_FOLLOWUP_UNBRIDGED");

  return {
    auditVersion,
    legacyIntentOriginal,
    bridgeApplied,
    bridgeReason,
    cognitiveTurnType,
    cognitiveConfidence,
    bridgedIntent,
    finalIntent,
    contextActionFinal,
    routingDecisionModeFinal: routingDecisionMode,
    hasActiveAnchor,
    alignedWithCognitiveTurn,
    remainingDivergenceFlags,
  };
}

// ─────────────────────────────────────────────────────────────
// PATCH 5.6E — Routing Mode Alignment Audit
// ─────────────────────────────────────────────────────────────

/**
 * Modos que são claramente incompatíveis com turnTypes de context-hold.
 * (Subset ampliado de _CONTEXT_SKIP_MODES para auditoria de mode)
 */
const _MODE_INCOMPATIBLE_CONTEXT_HOLD = new Set([
  "general_answer",
  "casual_chat",
  "guidance_needed",
  "empty",
]);

/**
 * Modos que preservam âncora — incompatíveis com NEW_SEARCH.
 */
const _MODE_ANCHOR_PRESERVING = new Set([
  "cognitive_anchor_hold",
  "context_answer",
  "context_hold",
  "anchored_reaction",
]);

/**
 * Resolve a "família" de mode esperada para um dado turnType.
 * Usado para documentar a expectativa no audit sem criar lógica de correção.
 *
 * @param {string} turnType
 * @param {boolean} hasActiveAnchor
 * @returns {string}
 */
function _expectedModeFamilyForTurnType(turnType, hasActiveAnchor) {
  switch (turnType) {
    case "EXPLANATION_REQUEST":
      return hasActiveAnchor ? "context_explanation_anchored" : "context_explanation";
    case "VALUE_QUESTION":
      return "context_decision";
    case "NEW_SEARCH":
      return "new_search";
    case "COMPARISON":
      return "comparison";
    case "REFINEMENT":
      return "refinement";
    case "COMPARISON_FOLLOWUP":
      return "comparison_followup";
    default:
      return "unchecked";
  }
}

/**
 * PATCH 5.6E — Audita o alinhamento de `routingDecision.mode` com o Cognitive Router.
 *
 * Compara o mode antes do rebuild (②), depois do rebuild, e após PATCH 5.3B,
 * detectando divergências residuais por turnType.
 *
 * Módulo puro — sem side effects.
 *
 * @param {object} input
 * @param {object|null} input.cognitiveTurnEarly          - Resultado de classifyMiaTurn() early
 * @param {object|null} input.bridgeAudit                 - Saída de buildCognitiveBridgeAudit()
 * @param {string}      input.finalIntent                 - intent final (após bridge)
 * @param {string}      input.contextActionFinal          - contextAction final
 * @param {string|null} input.modeBeforeRebuild           - routingDecision.mode antes de buildRoutingDecision ②
 * @param {string|null} input.modeAfterRebuild            - routingDecision.mode imediatamente após buildRoutingDecision ②
 * @param {string}      input.finalRoutingMode            - routingDecision.mode após PATCH 5.3B
 * @param {boolean}     [input.hasActiveAnchor]
 * @param {boolean}     [input.intentPreservationApplied]
 * @param {boolean}     [input.cognitiveAnchorHoldRestored] - se PATCH 5.3B restaurou o mode
 * @returns {object}
 */
export function buildRoutingModeAlignmentAudit({
  cognitiveTurnEarly            = null,
  bridgeAudit                   = null,
  finalIntent                   = "",
  contextActionFinal            = "",
  modeBeforeRebuild             = null,
  modeAfterRebuild              = null,
  finalRoutingMode              = "",
  hasActiveAnchor               = false,
  intentPreservationApplied     = false,
  cognitiveAnchorHoldRestored   = false,
} = {}) {
  const auditVersion      = "5.6E";
  const cognitiveTurnType = cognitiveTurnEarly?.turnType ?? null;
  const cognitiveConf     = cognitiveTurnEarly?.confidence ?? null;
  const bridgeApplied     = !!bridgeAudit?.active;

  const modeAfterRestore   = finalRoutingMode;
  const expectedModeFamily = _expectedModeFamilyForTurnType(cognitiveTurnType, hasActiveAnchor);

  // PATCH 5.6F — determina se o mode nasceu diretamente do sinal cognitivo
  // (ou seja, modeAfterRebuild já é cognitive_anchor_hold, sem precisar de restore)
  const _cognitiveExpectsAnchorHold =
    cognitiveTurnType === "EXPLANATION_REQUEST" && hasActiveAnchor;
  const modeBornCognitively =
    _cognitiveExpectsAnchorHold &&
    modeAfterRebuild === "cognitive_anchor_hold";
  const modeAuthoritySource =
    modeBornCognitively
      ? "cognitive_routing_signal"
      : cognitiveAnchorHoldRestored
        ? "5_3B_restore"
        : "legacy_build_routing";

  const remainingModeFlags = [];

  // ── Flags informativas de rebuild ──

  if (modeBeforeRebuild !== null && modeAfterRebuild !== null && modeBeforeRebuild !== modeAfterRebuild) {
    remainingModeFlags.push("MODE_REBUILT_DIFFERENTLY");
  }

  if (cognitiveAnchorHoldRestored) {
    remainingModeFlags.push("MODE_RESTORED_BY_5_3B");
  }

  // ── Flags de mismatch por turnType ──

  if (cognitiveTurnType === "EXPLANATION_REQUEST") {
    if (hasActiveAnchor && finalRoutingMode !== "cognitive_anchor_hold") {
      remainingModeFlags.push("MODE_EXPECTED_COGNITIVE_ANCHOR_HOLD");
    }
    if (_MODE_INCOMPATIBLE_CONTEXT_HOLD.has(finalRoutingMode)) {
      if (finalRoutingMode === "general_answer") remainingModeFlags.push("MODE_UNEXPECTED_GENERAL_ANSWER");
      else if (finalRoutingMode === "casual_chat") remainingModeFlags.push("MODE_UNEXPECTED_CASUAL_CHAT");
    }
  }

  if (cognitiveTurnType === "VALUE_QUESTION") {
    if (finalRoutingMode === "general_answer") remainingModeFlags.push("MODE_UNEXPECTED_GENERAL_ANSWER");
    if (finalRoutingMode === "casual_chat")    remainingModeFlags.push("MODE_UNEXPECTED_CASUAL_CHAT");
  }

  if (cognitiveTurnType === "NEW_SEARCH") {
    if (_MODE_ANCHOR_PRESERVING.has(finalRoutingMode)) {
      remainingModeFlags.push("MODE_UNEXPECTED_ANCHOR_PRESERVATION_ON_NEW_SEARCH");
    }
  }

  if (cognitiveTurnType === "COMPARISON" || cognitiveTurnType === "REFINEMENT") {
    if (_MODE_INCOMPATIBLE_CONTEXT_HOLD.has(finalRoutingMode)) {
      if (finalRoutingMode === "general_answer") remainingModeFlags.push("MODE_UNEXPECTED_GENERAL_ANSWER");
    }
  }

  // ── Alinhamento final ──
  // Flags puramente informativas não quebram alinhamento
  const _INFORMATIVE_ONLY = new Set(["MODE_REBUILT_DIFFERENTLY", "MODE_RESTORED_BY_5_3B"]);
  const criticalFlags = remainingModeFlags.filter(f => !_INFORMATIVE_ONLY.has(f));
  const alignedWithCognitiveTurn = criticalFlags.length === 0;

  return {
    auditVersion,
    cognitiveTurnType,
    cognitiveConfidence:        cognitiveConf,
    bridgeApplied,
    finalIntent,
    contextActionFinal,
    modeBeforeRebuild,
    modeAfterRebuild,
    modeAfterRestore,
    finalRoutingMode,
    anchorActive:               hasActiveAnchor,
    intentPreservationApplied,
    cognitiveAnchorHoldRestored,
    modeBornCognitively,
    modeAuthoritySource,
    expectedModeFamily,
    alignedWithCognitiveTurn,
    remainingModeFlags,
  };
}

// ─────────────────────────────────────────────────────────────
// PATCH 5.7 — Unified Cognitive Router Final Audit
// ─────────────────────────────────────────────────────────────

/**
 * TurnTypes que ainda não têm cobertura cognitiva — são expected legacies,
 * não regressões. Não geram flag crítica.
 */
const _UNCHECKED_TURN_TYPES = new Set([
  "CONVERSATIONAL", "UNKNOWN", "REACTION", "OBJECTION",
  "PRIORITY_SHIFT", "FOLLOW_UP", "COMMERCIAL_QUESTION",
]);

/**
 * Flags que são informativas/esperadas e não bloqueiam `isUnifiedEnoughForNextPhase`.
 */
const _NON_CRITICAL_5_7 = new Set([
  "LEGACY_ALLOWED_FOR_UNSUPPORTED_TURN",
  "COMPARISON_FOLLOWUP_KNOWN_GAP",
  "RESTORE_STILL_REQUIRED",
]);

/**
 * PATCH 5.7 — Unified Cognitive Router Final Audit
 *
 * Sintetiza a autoridade cognitiva real sobre todos os pontos de routing,
 * identificando dependências legacy remanescentes e conflitos críticos.
 *
 * Módulo puro — sem side effects.
 *
 * @param {object} input
 * @param {object|null}  input.cognitiveTurnEarly          - classifyMiaTurn() early
 * @param {object|null}  input.bridgeAudit                 - buildCognitiveBridgeAudit() (5.6B)
 * @param {object|null}  input.contextActionGuardAudit     - guardContextActionWithCognitiveBridge() (5.6D)
 * @param {object|null}  input.modeAlignmentAudit          - buildRoutingModeAlignmentAudit() (5.6E/F)
 * @param {object|null}  input.routingDecision             - routingDecision final
 * @param {boolean}      [input.hasActiveAnchor]
 * @param {string|null}  [input.responsePath]              - se disponível
 * @param {boolean|null} [input.richExplanationPathActivated] - se disponível; derivado do mode se null
 * @param {string}       [input.contextActionFinal]        - contextAction final do handler
 * @returns {object}
 */
export function buildUnifiedCognitiveRouterAudit({
  cognitiveTurnEarly              = null,
  bridgeAudit                     = null,
  contextActionGuardAudit         = null,
  modeAlignmentAudit              = null,
  routingDecision                 = null,
  hasActiveAnchor                 = false,
  responsePath                    = null,
  richExplanationPathActivated    = null,
  contextActionFinal              = "",
} = {}) {
  const auditVersion       = "5.7";
  const cognitiveTurnType  = cognitiveTurnEarly?.turnType ?? null;
  const cognitiveConf      = cognitiveTurnEarly?.confidence ?? null;

  // ── Intent authority ──
  const legacyIntentOriginal  = bridgeAudit?.fromIntent ?? null;
  const bridgeApplied         = !!bridgeAudit?.active;
  const finalIntent           = bridgeApplied
    ? (bridgeAudit.toIntent ?? legacyIntentOriginal)
    : legacyIntentOriginal;
  const intentAuthoritySource = bridgeApplied
    ? "cognitive_bridge"
    : "legacy_detect_intent";

  // ── ContextAction authority ──
  const contextActionGuardApplied    = !!contextActionGuardAudit?.applied;
  const contextActionAuthoritySource = contextActionGuardApplied
    ? "cognitive_guard_5_6D"
    : "legacy_detect_context_action";

  // ── Routing mode authority ──
  const finalRoutingMode        = routingDecision?.mode ?? null;
  const routingModeAuthSource   = modeAlignmentAudit?.modeAuthoritySource ?? "legacy_build_routing";
  const modeBornCognitively     = !!modeAlignmentAudit?.modeBornCognitively;
  const cogAnchorHoldRestored   = !!modeAlignmentAudit?.cognitiveAnchorHoldRestored;

  // ── routingDecision fields ──
  const allowNewSearch       = routingDecision?.allowNewSearch       ?? null;
  const allowReplaceWinner   = routingDecision?.allowReplaceWinner   ?? null;
  const allowRerank          = routingDecision?.allowRerank          ?? null;
  const shouldPreserveAnchor = routingDecision?.shouldPreserveAnchor ?? null;

  // ── Rich explanation path ──
  const richExpActivated =
    richExplanationPathActivated !== null
      ? richExplanationPathActivated
      : (finalRoutingMode === "cognitive_anchor_hold");

  // ── Bridge allowlist ──
  const _SAFE_TURN_TYPES = new Set([
    "EXPLANATION_REQUEST", "VALUE_QUESTION", "REFINEMENT", "COMPARISON", "NEW_SEARCH",
  ]);
  const inBridgeAllowlist = _SAFE_TURN_TYPES.has(cognitiveTurnType);
  const highConfidence    = typeof cognitiveConf === "number" &&
                            cognitiveConf >= COGNITIVE_BRIDGE_CONFIDENCE_THRESHOLD;

  // ─────────────────────────────────────────────────────────────
  // Flags
  // ─────────────────────────────────────────────────────────────
  const remainingConflictFlags = [];

  // Intent still legacy when it shouldn't be
  if (inBridgeAllowlist && highConfidence && !bridgeApplied) {
    remainingConflictFlags.push("INTENT_STILL_LEGACY_FOR_SAFE_TURN");
  }

  // ContextAction still legacy for safe explanation turns
  if (
    (cognitiveTurnType === "EXPLANATION_REQUEST" || cognitiveTurnType === "VALUE_QUESTION") &&
    bridgeApplied && !contextActionGuardApplied &&
    contextActionFinal !== "decision" && contextActionFinal !== "analysis"
  ) {
    remainingConflictFlags.push("CONTEXT_ACTION_STILL_LEGACY_FOR_SAFE_TURN");
  }

  // Routing mode not cognitively controlled for EXPLANATION_REQUEST + anchor
  if (cognitiveTurnType === "EXPLANATION_REQUEST" && hasActiveAnchor && finalRoutingMode !== "cognitive_anchor_hold") {
    remainingConflictFlags.push("ROUTING_MODE_STILL_LEGACY_FOR_SAFE_TURN");
  }

  // allowNewSearch mismatch
  if (cognitiveTurnType === "EXPLANATION_REQUEST" && allowNewSearch === true) {
    remainingConflictFlags.push("ALLOW_NEW_SEARCH_MISMATCH");
  }
  if (cognitiveTurnType === "NEW_SEARCH" && allowNewSearch === false) {
    remainingConflictFlags.push("ALLOW_NEW_SEARCH_MISMATCH");
  }

  // allowReplaceWinner mismatch
  if (
    (cognitiveTurnType === "EXPLANATION_REQUEST" || cognitiveTurnType === "VALUE_QUESTION") &&
    hasActiveAnchor && allowReplaceWinner === true
  ) {
    remainingConflictFlags.push("ALLOW_REPLACE_WINNER_MISMATCH");
  }

  // shouldPreserveAnchor mismatch
  if (
    (cognitiveTurnType === "EXPLANATION_REQUEST" || cognitiveTurnType === "VALUE_QUESTION") &&
    hasActiveAnchor && shouldPreserveAnchor === false
  ) {
    remainingConflictFlags.push("SHOULD_PRESERVE_ANCHOR_MISMATCH");
  }

  // Rich explanation not activatable when it should be
  if (cognitiveTurnType === "EXPLANATION_REQUEST" && hasActiveAnchor && !richExpActivated) {
    remainingConflictFlags.push("RICH_EXPLANATION_NOT_ACTIVATABLE");
  }

  // responsePath mismatch (only when responsePath is known)
  if (
    responsePath !== null &&
    cognitiveTurnType === "EXPLANATION_REQUEST" &&
    (responsePath === "new_commercial_search" || responsePath === "default_product_search")
  ) {
    remainingConflictFlags.push("RESPONSE_PATH_MISMATCH");
  }

  // 5.3B restore still required (informative)
  if (cogAnchorHoldRestored) {
    remainingConflictFlags.push("RESTORE_STILL_REQUIRED");
  }

  // Known gaps — not errors
  if (cognitiveTurnType === "COMPARISON_FOLLOWUP") {
    remainingConflictFlags.push("COMPARISON_FOLLOWUP_KNOWN_GAP");
  }
  if (_UNCHECKED_TURN_TYPES.has(cognitiveTurnType)) {
    remainingConflictFlags.push("LEGACY_ALLOWED_FOR_UNSUPPORTED_TURN");
  }

  // ─────────────────────────────────────────────────────────────
  // Cognitive authority coverage
  // ─────────────────────────────────────────────────────────────
  const cognitiveAuthorityCoverage = [];
  if (bridgeApplied)           cognitiveAuthorityCoverage.push("intent");
  if (contextActionGuardApplied) cognitiveAuthorityCoverage.push("contextAction");
  if (modeBornCognitively)     cognitiveAuthorityCoverage.push("routingMode");
  if (allowNewSearch === false && bridgeApplied) cognitiveAuthorityCoverage.push("allowNewSearch");
  if (allowReplaceWinner === false && bridgeApplied) cognitiveAuthorityCoverage.push("allowReplaceWinner");
  if (shouldPreserveAnchor === true && bridgeApplied) cognitiveAuthorityCoverage.push("shouldPreserveAnchor");
  if (richExpActivated)        cognitiveAuthorityCoverage.push("richExplanationPath");

  // ─────────────────────────────────────────────────────────────
  // Remaining legacy dependencies
  // ─────────────────────────────────────────────────────────────
  const remainingLegacyDependencies = [];
  if (!bridgeApplied && inBridgeAllowlist) {
    remainingLegacyDependencies.push("detectIntent_legacy");
  }
  if (!contextActionGuardApplied) {
    remainingLegacyDependencies.push("detectContextAction_legacy");
  }
  if (!modeBornCognitively) {
    remainingLegacyDependencies.push(
      cogAnchorHoldRestored ? "patch_5_3B_restore" : "buildRoutingDecision_legacy_mode"
    );
  }

  // ─────────────────────────────────────────────────────────────
  // isUnifiedEnoughForNextPhase
  // ─────────────────────────────────────────────────────────────
  const criticalFlags = remainingConflictFlags.filter(f => !_NON_CRITICAL_5_7.has(f));
  const isUnifiedEnoughForNextPhase = criticalFlags.length === 0;

  return {
    auditVersion,
    cognitiveTurnType,
    cognitiveConfidence:          cognitiveConf,
    legacyIntentOriginal,
    finalIntent,
    intentAuthoritySource,
    contextActionFinal,
    contextActionAuthoritySource,
    contextActionGuardApplied,
    finalRoutingMode,
    routingModeAuthoritySource:   routingModeAuthSource,
    bridgeApplied,
    modeBornCognitively,
    cognitiveAnchorHoldRestored:  cogAnchorHoldRestored,
    allowNewSearch,
    allowReplaceWinner,
    allowRerank,
    shouldPreserveAnchor,
    responsePath,
    richExplanationPathActivated: richExpActivated,
    cognitiveAuthorityCoverage,
    remainingLegacyDependencies,
    remainingConflictFlags,
    isUnifiedEnoughForNextPhase,
  };
}
