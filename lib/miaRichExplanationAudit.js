/**
 * MIA Rich Explanation Activation Audit
 *
 * PATCH 5.3A — Auditoria de ativação do caminho rico de explicação.
 *
 * Módulo de diagnóstico puro. NÃO altera nenhum comportamento,
 * resposta, decisão, card, winner ou routing.
 *
 * Responde:
 *  1. O Rich Explanation Path foi ativado?
 *  2. Se não, por quê?
 *  3. O guard anti-alucinação sobrescreveu a resposta rica?
 *  4. Os inputs de contexto (lastAxis, lastMainConsequence, lastTradeoff) estavam preenchidos?
 *
 * Ativado apenas quando MIA_DEBUG=true via logRichExplanationAudit().
 */

// ─────────────────────────────────────────────────────────────
// Flags de diagnóstico
// ─────────────────────────────────────────────────────────────

export const RICH_EXPLANATION_FLAGS = Object.freeze({
  ACTIVATED: "RICH_EXPLANATION_ACTIVATED",
  NOT_ACTIVATED: "RICH_EXPLANATION_NOT_ACTIVATED",
  INPUTS_EMPTY: "RICH_EXPLANATION_INPUTS_EMPTY",
  INPUTS_PARTIAL: "RICH_EXPLANATION_INPUTS_PARTIAL",
  CORRECTION_OVERRIDES: "UNKNOWN_PRODUCT_CORRECTION_OVERRIDES_RICH_EXPLANATION",
  CORRECTION_APPLIED: "UNKNOWN_PRODUCT_CORRECTION_APPLIED",
  ANCHOR_MISSING: "ANCHOR_MISSING",
  COGNITIVE_TURN_NOT_EXPLANATION: "COGNITIVE_TURN_NOT_EXPLANATION_REQUEST",
  ROUTING_MODE_NOT_ANCHOR_HOLD: "ROUTING_MODE_NOT_COGNITIVE_ANCHOR_HOLD",
  CONTEXT_ACTION_INCOMPATIBLE: "CONTEXT_ACTION_NOT_COMPATIBLE",
  INTENT_PRESERVATION_NOT_APPLIED: "INTENT_PRESERVATION_NOT_APPLIED",
});

// ─────────────────────────────────────────────────────────────
// Construtor de auditoria (função pura, testável)
// ─────────────────────────────────────────────────────────────

/**
 * Monta o objeto de auditoria de ativação do Rich Explanation Path.
 *
 * Função pura — não produz side effects, não lança exceção,
 * nunca retorna null.
 *
 * @param {object} input
 * @param {string}  [input.originalQuery]
 * @param {string}  [input.resolvedQuery]
 * @param {object}  [input.cognitiveTurn]               — resultado de classifyMiaTurn
 * @param {object}  [input.routingDecision]
 * @param {string}  [input.contextAction]
 * @param {string}  [input.intent]
 * @param {object}  [input.anchorProduct]               — lastBestProduct resolvido
 * @param {boolean} [input.intentPreservationApplied]
 * @param {boolean} [input.cognitiveAuthorityApplied]
 * @param {boolean} [input.richExplanationPathActivated] — resultado de shouldUseRichExplanationPath
 * @param {string}  [input.contextModeSelected]         — "analysis" | "explanation_anchored" | "decision_generic"
 * @param {object}  [input.explanationCtx]              — resultado de buildExplanationContext
 * @param {boolean} [input.unknownProductCorrectionApplied]
 * @param {string}  [input.finalReply]
 * @returns {object} audit snapshot
 */
export function buildRichExplanationActivationAudit(input = {}) {
  // Guard: null explícito não aciona default — normalizar aqui
  const safeInput = (input && typeof input === "object") ? input : {};
  const {
    originalQuery = "",
    resolvedQuery = "",
    cognitiveTurn = null,
    routingDecision = {},
    contextAction = "",
    intent = "",
    anchorProduct = null,
    intentPreservationApplied = false,
    cognitiveAuthorityApplied = false,
    richExplanationPathActivated = false,
    contextModeSelected = "unknown",
    explanationCtx = {},
    unknownProductCorrectionApplied = false,
    finalReply = "",
    // PATCH 5.3B — campos de persistência do modo cognitivo
    routingModeBeforeRebuild = null,
    routingModePersistenceApplied = false,
    // PATCH 5.5D — subtype ativo da explicação pós-decisão
    decisionExplanationSubtype = null,
  } = safeInput;

  const flags = [];

  // ── Flag principal: ativação ─────────────────────────────
  if (richExplanationPathActivated) {
    flags.push(RICH_EXPLANATION_FLAGS.ACTIVATED);
  } else {
    flags.push(RICH_EXPLANATION_FLAGS.NOT_ACTIVATED);

    // Diagnóstico: por que não ativou?
    if (routingDecision?.mode !== "cognitive_anchor_hold") {
      flags.push(RICH_EXPLANATION_FLAGS.ROUTING_MODE_NOT_ANCHOR_HOLD);
    }
    if (!(anchorProduct?.product_name)) {
      flags.push(RICH_EXPLANATION_FLAGS.ANCHOR_MISSING);
    }
    if (cognitiveTurn?.turnType && cognitiveTurn.turnType !== "EXPLANATION_REQUEST") {
      flags.push(RICH_EXPLANATION_FLAGS.COGNITIVE_TURN_NOT_EXPLANATION);
    }
    if (!intentPreservationApplied) {
      flags.push(RICH_EXPLANATION_FLAGS.INTENT_PRESERVATION_NOT_APPLIED);
    }
  }

  // ── Qualidade dos inputs de contexto ─────────────────────
  const inputScore = (explanationCtx?.hasAxis ? 1 : 0) +
                     (explanationCtx?.hasConsequence ? 1 : 0) +
                     (explanationCtx?.hasTradeoff ? 1 : 0);
  if (inputScore === 0) {
    flags.push(RICH_EXPLANATION_FLAGS.INPUTS_EMPTY);
  } else if (inputScore < 3) {
    flags.push(RICH_EXPLANATION_FLAGS.INPUTS_PARTIAL);
  }

  // ── Guard anti-alucinação ────────────────────────────────
  if (unknownProductCorrectionApplied) {
    if (richExplanationPathActivated) {
      // Mais crítico: explicação rica gerada mas sobrescrita pelo guard
      flags.push(RICH_EXPLANATION_FLAGS.CORRECTION_OVERRIDES);
    } else {
      flags.push(RICH_EXPLANATION_FLAGS.CORRECTION_APPLIED);
    }
  }

  const hasCriticalFlag =
    flags.includes(RICH_EXPLANATION_FLAGS.CORRECTION_OVERRIDES) ||
    (flags.includes(RICH_EXPLANATION_FLAGS.NOT_ACTIVATED) &&
      flags.includes(RICH_EXPLANATION_FLAGS.ROUTING_MODE_NOT_ANCHOR_HOLD));

  // PATCH 5.5D — subtype pós-decisão: prefer explicit arg, fallback para cognitiveTurn.signals
  const _pdSubtype =
    decisionExplanationSubtype ||
    cognitiveTurn?.signals?.decisionExplanation?.subtype ||
    null;
  // PATCH 5.5D — categoria unificada (só presente quando há subtype pós-decisão)
  const _pdCategory =
    cognitiveTurn?.signals?.decisionExplanation?.category || null;

  return {
    auditVersion: "5.5D",
    // ── Inputs do turno ────────────────────────────────────
    originalQuery: (originalQuery || "").slice(0, 120),
    resolvedQuery: (resolvedQuery || "").slice(0, 120),
    cognitiveTurnType: cognitiveTurn?.turnType || null,
    cognitiveConfidence: cognitiveTurn?.confidence ?? null,
    // ── Subtype pós-decisão (PATCH 5.5D) ──────────────────
    postDecisionExplanationSubtype: _pdSubtype,
    postDecisionExplanationCategory: _pdCategory,
    // ── Estado do routing ──────────────────────────────────
    routingMode: routingDecision?.mode || null,
    contextAction: contextAction || null,
    intent: intent || null,
    // ── Âncora ────────────────────────────────────────────
    hasAnchor: !!(anchorProduct?.product_name),
    anchorName: anchorProduct?.product_name || null,
    // ── Camadas de ativação ────────────────────────────────
    intentPreservationApplied,
    cognitiveAuthorityApplied,
    shouldUseRichExplanationPath: richExplanationPathActivated,
    explanationPathReason: richExplanationPathActivated
      ? "routingDecision.mode === cognitive_anchor_hold"
      : `mode_was_${routingDecision?.mode || "unknown"}`,
    contextModeSelected,
    // ── Inputs de contexto (base 3) ───────────────────────
    hasLastAxis: !!(explanationCtx?.hasAxis),
    hasLastMainConsequence: !!(explanationCtx?.hasConsequence),
    hasLastTradeoff: !!(explanationCtx?.hasTradeoff),
    inputRichness: inputScore, // 0=vazio, 1=parcial, 2=parcial, 3=completo
    lastAxis: explanationCtx?.lastAxis || null,
    lastMainConsequencePreview: explanationCtx?.lastConsequence
      ? String(explanationCtx.lastConsequence).slice(0, 60)
      : null,
    lastTradeoffPreview: explanationCtx?.lastTradeoff
      ? String(explanationCtx.lastTradeoff).slice(0, 60)
      : null,
    // ── Memória de decisão enriquecida (PATCH 5.5) ────────
    decisionMemory: {
      hasLastAxis:            !!(explanationCtx?.hasAxis),
      hasLastMainConsequence: !!(explanationCtx?.hasConsequence),
      hasLastTradeoff:        !!(explanationCtx?.hasTradeoff),
      hasLastDecisionReason:  !!(explanationCtx?.hasDecisionReason),
      winnerAdvantagesCount:  explanationCtx?.winnerAdvantagesCount  ?? 0,
      winnerSacrificesCount:  explanationCtx?.winnerSacrificesCount  ?? 0,
    },
    // ── Guard anti-alucinação ─────────────────────────────
    responseMentionsUnknownProduct: unknownProductCorrectionApplied,
    unknownProductCorrectionApplied,
    // ── Resposta final ────────────────────────────────────
    finalReplyPreview: finalReply ? String(finalReply).slice(0, 100) : null,
    // ── Persistência do modo (PATCH 5.3B) ────────────────
    routingModeBeforeRebuild,
    routingModePersistenceApplied,
    // ── Diagnóstico ───────────────────────────────────────
    flags,
    hasCriticalFlag,
  };
}

// ─────────────────────────────────────────────────────────────
// Logger de auditoria (side effect — usar apenas em handlers)
// ─────────────────────────────────────────────────────────────

/**
 * Registra o audit snapshot no pipelineTracer e no console.
 * Deve ser chamado SOMENTE quando process.env.MIA_DEBUG === "true".
 *
 * @param {object} audit — resultado de buildRichExplanationActivationAudit
 * @param {object} [pipelineTracer] — instância do tracer (opcional)
 */
export function logRichExplanationAudit(audit, pipelineTracer = null) {
  if (!audit) return;

  // Registra no pipelineTracer para correlação com outros sinais
  if (pipelineTracer && typeof pipelineTracer.patch === "function") {
    pipelineTracer.patch({ rich_explanation_audit: audit });
  }

  // Log estruturado no console
  const urgency = audit.hasCriticalFlag ? "⚠️ " : "";
  const status = audit.shouldUseRichExplanationPath
    ? "✅ RICH PATH ATIVADO"
    : "❌ RICH PATH NÃO ATIVADO";

  console.log(
    `[MIA_RICH_EXPLANATION_AUDIT 5.3A] ${urgency}${status}`,
    JSON.stringify({
      query: audit.originalQuery,
      turnType: audit.cognitiveTurnType,
      // ── Rastreio de modo (PATCH 5.3B) ─────────────────────
      routingModeBeforeRebuild: audit.routingModeBeforeRebuild,
      routingModeAtRichExplanationCheck: audit.routingMode,
      routingModePersistenceApplied: audit.routingModePersistenceApplied,
      // ── Camadas de ativação ────────────────────────────────
      contextAction: audit.contextAction,
      intentPreservationApplied: audit.intentPreservationApplied,
      richPathActivated: audit.shouldUseRichExplanationPath,
      contextModeSelected: audit.contextModeSelected,
      inputRichness: `${audit.inputRichness}/3 (axis=${audit.hasLastAxis}, consequence=${audit.hasLastMainConsequence}, tradeoff=${audit.hasLastTradeoff})`,
      decisionMemory: audit.decisionMemory,
      unknownProductCorrectionApplied: audit.unknownProductCorrectionApplied,
      finalReplyPreview: audit.finalReplyPreview,
      flags: audit.flags,
    }, null, 2)
  );
}
