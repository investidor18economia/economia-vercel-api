/**
 * PATCH 5.8 — Universal Follow-Up Understanding Audit
 *
 * Módulo puro de auditoria — sem side effects.
 *
 * Mapeia a compreensão atual da MIA para follow-ups curtos, ambíguos e
 * conversacionais pós-recomendação, identificando:
 *   - qual família cognitiva foi detectada vs. qual deveria ter sido;
 *   - riscos de fallback, perda de âncora, busca nova indevida e troca de winner;
 *   - dependências legacy por família.
 *
 * NÃO altera nenhum fluxo, nenhuma resposta, nenhum winner.
 */

// ─────────────────────────────────────────────────────────────
// Famílias de follow-up universais
// ─────────────────────────────────────────────────────────────

export const FOLLOWUP_FAMILIES = Object.freeze({
  ACKNOWLEDGEMENT:            "ACKNOWLEDGEMENT",           // ok, entendi, beleza — âncora preservada
  ACKNOWLEDGEMENT_FALLBACK:   "ACKNOWLEDGEMENT_FALLBACK",  // caiu em CONVERSATIONAL/UNKNOWN — risco
  MINIMAL_EXPLANATION:        "MINIMAL_EXPLANATION",       // por quê? como assim? — deve virar EXPLANATION_REQUEST
  CONFIDENCE_CHALLENGE:       "CONFIDENCE_CHALLENGE",      // tem certeza? sério? — subtipo confidence_challenge
  DECISION_DEFENSE:           "DECISION_DEFENSE",          // ainda vale? continua fazendo sentido?
  ALTERNATIVE_COMPARISON:     "ALTERNATIVE_COMPARISON",    // e esse? e o outro? tem outro melhor?
  OBJECTION:                  "OBJECTION",                 // não gostei, acho caro
  PRIORITY_SHIFT:             "PRIORITY_SHIFT",            // mas eu jogo, quero câmera, e se for pra durar?
  SYMBOL_ONLY:                "SYMBOL_ONLY",               // ? ?? ... hmm — deve degradar com segurança
  UNKNOWN_WITH_ANCHOR:        "UNKNOWN_WITH_ANCHOR",       // UNKNOWN + âncora = risco alto
  UNKNOWN_NO_ANCHOR:          "UNKNOWN_NO_ANCHOR",         // UNKNOWN sem âncora = baixo risco
  OTHER:                      "OTHER",
});

// ─────────────────────────────────────────────────────────────
// Flags diagnósticas (não corrigem — apenas identificam)
// ─────────────────────────────────────────────────────────────

export const FOLLOWUP_FLAGS = Object.freeze({
  FOLLOWUP_ACKNOWLEDGEMENT_FALLBACK_RISK:      "FOLLOWUP_ACKNOWLEDGEMENT_FALLBACK_RISK",
  FOLLOWUP_MINIMAL_EXPLANATION_MISCLASSIFIED:  "FOLLOWUP_MINIMAL_EXPLANATION_MISCLASSIFIED",
  FOLLOWUP_CONFIDENCE_CHALLENGE_MISCLASSIFIED: "FOLLOWUP_CONFIDENCE_CHALLENGE_MISCLASSIFIED",
  FOLLOWUP_ALTERNATIVE_MISCLASSIFIED:          "FOLLOWUP_ALTERNATIVE_MISCLASSIFIED",
  FOLLOWUP_OBJECTION_UNSUPPORTED:              "FOLLOWUP_OBJECTION_UNSUPPORTED",
  FOLLOWUP_PRIORITY_SHIFT_UNSUPPORTED:         "FOLLOWUP_PRIORITY_SHIFT_UNSUPPORTED",
  FOLLOWUP_SYMBOL_ONLY_UNSAFE:                 "FOLLOWUP_SYMBOL_ONLY_UNSAFE",
  FOLLOWUP_ANCHOR_LOSS_RISK:                   "FOLLOWUP_ANCHOR_LOSS_RISK",
  FOLLOWUP_NEW_SEARCH_RISK:                    "FOLLOWUP_NEW_SEARCH_RISK",
  FOLLOWUP_WINNER_CHANGE_RISK:                 "FOLLOWUP_WINNER_CHANGE_RISK",
  FOLLOWUP_LEGACY_DEPENDENCY:                  "FOLLOWUP_LEGACY_DEPENDENCY",
  FOLLOWUP_CLASSIFICATION_OK:                  "FOLLOWUP_CLASSIFICATION_OK",
});

// ─────────────────────────────────────────────────────────────
// Mapeamento de turno cognitivo → família detectada
// ─────────────────────────────────────────────────────────────

/**
 * Deriva a família de follow-up a partir do resultado de classifyMiaTurn().
 *
 * Módulo puro — não chama classifyMiaTurn.
 * O chamador deve fornecer o resultado já calculado.
 */
export function detectFollowUpFamily({
  cognitiveTurnType,
  cognitiveReasons = [],
  hasActiveAnchor   = false,
  originalQuery     = "",
}) {
  const norm = originalQuery.replace(/[\s?!.,;:]/g, "");
  if (!norm) return FOLLOWUP_FAMILIES.SYMBOL_ONLY;

  switch (cognitiveTurnType) {
    case "REACTION":
      return FOLLOWUP_FAMILIES.ACKNOWLEDGEMENT;

    case "CONVERSATIONAL":
      // Com âncora ativa, CONVERSATIONAL para "ok/entendi/beleza" é fallback —
      // deveria ter sido REACTION/ACKNOWLEDGEMENT.
      if (hasActiveAnchor) return FOLLOWUP_FAMILIES.ACKNOWLEDGEMENT_FALLBACK;
      return FOLLOWUP_FAMILIES.ACKNOWLEDGEMENT_FALLBACK;

    case "EXPLANATION_REQUEST": {
      const subtype = cognitiveReasons.find(r => r.startsWith("decision_explanation_subtype:"))
        ?.replace("decision_explanation_subtype:", "");
      if (subtype === "confidence_challenge") return FOLLOWUP_FAMILIES.CONFIDENCE_CHALLENGE;
      if (subtype === "decision_defense")     return FOLLOWUP_FAMILIES.DECISION_DEFENSE;
      // Cluster 1/2/3 — pedido explícito de explicação → MINIMAL_EXPLANATION
      return FOLLOWUP_FAMILIES.MINIMAL_EXPLANATION;
    }

    case "COMPARISON_FOLLOWUP":
    case "COMPARISON":
    case "REFINEMENT":
      return FOLLOWUP_FAMILIES.ALTERNATIVE_COMPARISON;

    case "FOLLOW_UP":
      // FOLLOW_UP para "e esse?/e o outro?" é parcialmente correto — preserva âncora
      // mas não é tão específico quanto COMPARISON_FOLLOWUP.
      return FOLLOWUP_FAMILIES.ALTERNATIVE_COMPARISON;

    case "OBJECTION":
      return FOLLOWUP_FAMILIES.OBJECTION;

    case "PRIORITY_SHIFT":
      return FOLLOWUP_FAMILIES.PRIORITY_SHIFT;

    case "VALUE_QUESTION":
      // VALUE_QUESTION para "acho caro" seria o alvo — mas o roteador provavelmente
      // não o detectou; se chegou aqui, está correto.
      return FOLLOWUP_FAMILIES.OBJECTION; // semanticamente adjacente

    case "UNKNOWN":
      if (hasActiveAnchor) return FOLLOWUP_FAMILIES.UNKNOWN_WITH_ANCHOR;
      return FOLLOWUP_FAMILIES.UNKNOWN_NO_ANCHOR;

    default:
      return FOLLOWUP_FAMILIES.OTHER;
  }
}

// ─────────────────────────────────────────────────────────────
// Classificação esperada por família — usada nos testes
// ─────────────────────────────────────────────────────────────

/**
 * Retorna se a família detectada é compatível com a família esperada.
 *
 * Considera correspondências parciais aceitáveis (ex: FOLLOW_UP → ALTERNATIVE_COMPARISON).
 */
export function isFollowUpClassificationOk(detectedFamily, expectedFamily) {
  if (detectedFamily === expectedFamily) return true;
  if (!expectedFamily)                   return true; // nenhuma expectativa

  // Correspondências parcialmente aceitáveis
  // ACKNOWLEDGEMENT_FALLBACK NÃO é aceito para ACKNOWLEDGEMENT —
  // é uma degradação documentada, não uma classificação correta.
  const partialOk = {
    [FOLLOWUP_FAMILIES.ALTERNATIVE_COMPARISON]: new Set([
      FOLLOWUP_FAMILIES.ALTERNATIVE_COMPARISON,
    ]),
    [FOLLOWUP_FAMILIES.CONFIDENCE_CHALLENGE]: new Set([
      FOLLOWUP_FAMILIES.CONFIDENCE_CHALLENGE,
      FOLLOWUP_FAMILIES.DECISION_DEFENSE,
      FOLLOWUP_FAMILIES.MINIMAL_EXPLANATION,
    ]),
    [FOLLOWUP_FAMILIES.ACKNOWLEDGEMENT]: new Set([
      FOLLOWUP_FAMILIES.ACKNOWLEDGEMENT,
      // ACKNOWLEDGEMENT_FALLBACK intencionalmente excluído — é um gap, não ok
    ]),
  };

  return !!(partialOk[expectedFamily]?.has(detectedFamily));
}

// ─────────────────────────────────────────────────────────────
// Flags por família/estado
// ─────────────────────────────────────────────────────────────

function computeFollowUpFlags({
  detectedFamily,
  expectedFamily,
  classificationOk,
  cognitiveTurnType,
  hasActiveAnchor,
  allowNewSearch,
  allowReplaceWinner,
  shouldPreserveAnchor,
  intentAuthoritySource,
  contextActionAuthoritySource,
  originalQuery,
}) {
  const flags = [];

  // ── Família: ACKNOWLEDGEMENT_FALLBACK ─────────────────────
  if (detectedFamily === FOLLOWUP_FAMILIES.ACKNOWLEDGEMENT_FALLBACK) {
    flags.push(FOLLOWUP_FLAGS.FOLLOWUP_ACKNOWLEDGEMENT_FALLBACK_RISK);
  }

  // ── Família esperada mas não detectada ────────────────────
  if (expectedFamily && !classificationOk) {
    switch (expectedFamily) {
      case FOLLOWUP_FAMILIES.MINIMAL_EXPLANATION:
        flags.push(FOLLOWUP_FLAGS.FOLLOWUP_MINIMAL_EXPLANATION_MISCLASSIFIED);
        break;
      case FOLLOWUP_FAMILIES.CONFIDENCE_CHALLENGE:
        flags.push(FOLLOWUP_FLAGS.FOLLOWUP_CONFIDENCE_CHALLENGE_MISCLASSIFIED);
        break;
      case FOLLOWUP_FAMILIES.ALTERNATIVE_COMPARISON:
        flags.push(FOLLOWUP_FLAGS.FOLLOWUP_ALTERNATIVE_MISCLASSIFIED);
        break;
      case FOLLOWUP_FAMILIES.OBJECTION:
        flags.push(FOLLOWUP_FLAGS.FOLLOWUP_OBJECTION_UNSUPPORTED);
        break;
      case FOLLOWUP_FAMILIES.PRIORITY_SHIFT:
        flags.push(FOLLOWUP_FLAGS.FOLLOWUP_PRIORITY_SHIFT_UNSUPPORTED);
        break;
      default:
        break;
    }
  }

  // ── SYMBOL_ONLY seguro vs. unsafe ─────────────────────────
  if (detectedFamily === FOLLOWUP_FAMILIES.SYMBOL_ONLY) {
    // Símbolo após normalize = vazio. Se o backend não tratou isso,
    // poderia causar erro. Verificar se o turn retornou UNKNOWN com conf 0.
    if (cognitiveTurnType !== "UNKNOWN") {
      flags.push(FOLLOWUP_FLAGS.FOLLOWUP_SYMBOL_ONLY_UNSAFE);
    }
    // Se chegou como UNKNOWN (conf=0), é degradação segura — não adiciona flag de risco
  }

  // ── Riscos de routing (apenas quando info disponível) ─────
  if (allowNewSearch === true && hasActiveAnchor) {
    if (
      detectedFamily === FOLLOWUP_FAMILIES.ACKNOWLEDGEMENT ||
      detectedFamily === FOLLOWUP_FAMILIES.ACKNOWLEDGEMENT_FALLBACK ||
      detectedFamily === FOLLOWUP_FAMILIES.MINIMAL_EXPLANATION ||
      detectedFamily === FOLLOWUP_FAMILIES.CONFIDENCE_CHALLENGE
    ) {
      flags.push(FOLLOWUP_FLAGS.FOLLOWUP_NEW_SEARCH_RISK);
    }
  }

  if (allowReplaceWinner === true && hasActiveAnchor) {
    if (
      detectedFamily === FOLLOWUP_FAMILIES.ACKNOWLEDGEMENT ||
      detectedFamily === FOLLOWUP_FAMILIES.ACKNOWLEDGEMENT_FALLBACK ||
      detectedFamily === FOLLOWUP_FAMILIES.MINIMAL_EXPLANATION ||
      detectedFamily === FOLLOWUP_FAMILIES.CONFIDENCE_CHALLENGE
    ) {
      flags.push(FOLLOWUP_FLAGS.FOLLOWUP_WINNER_CHANGE_RISK);
    }
  }

  if (shouldPreserveAnchor === false && hasActiveAnchor) {
    if (
      detectedFamily === FOLLOWUP_FAMILIES.ACKNOWLEDGEMENT ||
      detectedFamily === FOLLOWUP_FAMILIES.ACKNOWLEDGEMENT_FALLBACK ||
      detectedFamily === FOLLOWUP_FAMILIES.MINIMAL_EXPLANATION ||
      detectedFamily === FOLLOWUP_FAMILIES.CONFIDENCE_CHALLENGE
    ) {
      flags.push(FOLLOWUP_FLAGS.FOLLOWUP_ANCHOR_LOSS_RISK);
    }
  }

  // ── Legacy dependency ─────────────────────────────────────
  if (
    intentAuthoritySource === "legacy_detect_intent" ||
    contextActionAuthoritySource === "legacy_detect_context_action"
  ) {
    if (
      detectedFamily !== FOLLOWUP_FAMILIES.SYMBOL_ONLY &&
      detectedFamily !== FOLLOWUP_FAMILIES.UNKNOWN_NO_ANCHOR
    ) {
      flags.push(FOLLOWUP_FLAGS.FOLLOWUP_LEGACY_DEPENDENCY);
    }
  }

  // ── All OK ─────────────────────────────────────────────────
  const _noRiskFlags = new Set([
    FOLLOWUP_FLAGS.FOLLOWUP_LEGACY_DEPENDENCY,
    FOLLOWUP_FLAGS.FOLLOWUP_ACKNOWLEDGEMENT_FALLBACK_RISK, // soft
  ]);
  const criticalOrMisclassified = flags.filter(f => !_noRiskFlags.has(f));
  if (classificationOk && criticalOrMisclassified.length === 0) {
    flags.push(FOLLOWUP_FLAGS.FOLLOWUP_CLASSIFICATION_OK);
  }

  return flags;
}

// ─────────────────────────────────────────────────────────────
// Função principal de auditoria
// ─────────────────────────────────────────────────────────────

/**
 * PATCH 5.8 — buildFollowUpUnderstandingAudit
 *
 * Módulo puro — sem side effects.
 *
 * @param {object} input
 * @param {string}        input.originalQuery              - texto literal do usuário
 * @param {string}        [input.normalizedQuery]          - query após normalize (opcional)
 * @param {boolean}       [input.hasActiveAnchor]
 * @param {string|null}   [input.lastBestProduct]          - nome do produto âncora
 * @param {string|null}   [input.conversationArc]          - arco da conversa (CSO)
 * @param {object}        input.cognitiveTurnResult        - resultado de classifyMiaTurn()
 * @param {string|null}   [input.expectedFollowUpFamily]   - família esperada (para testes)
 * @param {string|null}   [input.legacyIntentOriginal]
 * @param {string|null}   [input.finalIntent]
 * @param {string|null}   [input.contextActionFinal]
 * @param {string|null}   [input.finalRoutingMode]
 * @param {string|null}   [input.responsePath]
 * @param {boolean|null}  [input.allowNewSearch]
 * @param {boolean|null}  [input.allowReplaceWinner]
 * @param {boolean|null}  [input.shouldPreserveAnchor]
 * @param {string|null}   [input.intentAuthoritySource]    - de buildUnifiedCognitiveRouterAudit
 * @param {string|null}   [input.contextActionAuthoritySource]
 * @returns {object}
 */
export function buildFollowUpUnderstandingAudit({
  originalQuery                   = "",
  normalizedQuery                 = null,
  hasActiveAnchor                 = false,
  lastBestProduct                 = null,
  conversationArc                 = null,
  cognitiveTurnResult             = {},
  expectedFollowUpFamily          = null,
  legacyIntentOriginal            = null,
  finalIntent                     = null,
  contextActionFinal              = null,
  finalRoutingMode                = null,
  responsePath                    = null,
  allowNewSearch                  = null,
  allowReplaceWinner              = null,
  shouldPreserveAnchor            = null,
  intentAuthoritySource           = null,
  contextActionAuthoritySource    = null,
} = {}) {
  const auditVersion = "5.8";

  const cognitiveTurnType = cognitiveTurnResult?.turnType ?? "UNKNOWN";
  const cognitiveConfidence = cognitiveTurnResult?.confidence ?? 0;
  const cognitiveReasons  = cognitiveTurnResult?.reasons ?? [];

  // ── Follow-up family detection ────────────────────────────
  const detectedFollowUpFamily = detectFollowUpFamily({
    cognitiveTurnType,
    cognitiveReasons,
    hasActiveAnchor,
    originalQuery,
  });

  const classificationOk = isFollowUpClassificationOk(detectedFollowUpFamily, expectedFollowUpFamily);

  // ── Risk assessment ───────────────────────────────────────
  const fallbackRisk =
    detectedFollowUpFamily === FOLLOWUP_FAMILIES.ACKNOWLEDGEMENT_FALLBACK ||
    detectedFamily_isUnknownWithAnchor(detectedFollowUpFamily, hasActiveAnchor);

  const anchorLossRisk =
    hasActiveAnchor && (
      shouldPreserveAnchor === false ||
      detectedFollowUpFamily === FOLLOWUP_FAMILIES.UNKNOWN_WITH_ANCHOR
    );

  const newSearchRisk =
    allowNewSearch === true && hasActiveAnchor && (
      detectedFollowUpFamily === FOLLOWUP_FAMILIES.ACKNOWLEDGEMENT ||
      detectedFollowUpFamily === FOLLOWUP_FAMILIES.ACKNOWLEDGEMENT_FALLBACK ||
      detectedFollowUpFamily === FOLLOWUP_FAMILIES.MINIMAL_EXPLANATION ||
      detectedFollowUpFamily === FOLLOWUP_FAMILIES.CONFIDENCE_CHALLENGE
    );

  const winnerChangeRisk =
    allowReplaceWinner === true && hasActiveAnchor && (
      detectedFollowUpFamily === FOLLOWUP_FAMILIES.ACKNOWLEDGEMENT ||
      detectedFollowUpFamily === FOLLOWUP_FAMILIES.ACKNOWLEDGEMENT_FALLBACK
    );

  // ── Flags ─────────────────────────────────────────────────
  const anchorPreserved = hasActiveAnchor
    ? (shouldPreserveAnchor !== false && !newSearchRisk)
    : null;

  const flags = computeFollowUpFlags({
    detectedFamily:              detectedFollowUpFamily,
    expectedFamily:              expectedFollowUpFamily,
    classificationOk,
    cognitiveTurnType,
    hasActiveAnchor,
    allowNewSearch,
    allowReplaceWinner,
    shouldPreserveAnchor,
    intentAuthoritySource,
    contextActionAuthoritySource,
    originalQuery,
  });

  return {
    auditVersion,
    originalQuery,
    normalizedQuery,

    hasActiveAnchor,
    lastBestProduct,
    conversationArc,

    cognitiveTurnType,
    cognitiveConfidence,
    cognitiveReasons,

    detectedFollowUpFamily,
    expectedFollowUpFamily,

    legacyIntentOriginal,
    finalIntent,
    contextActionFinal,
    finalRoutingMode,
    responsePath,

    anchorPreserved,
    allowNewSearch,
    allowReplaceWinner,
    shouldPreserveAnchor,

    classificationOk,
    fallbackRisk,
    anchorLossRisk,
    newSearchRisk,
    winnerChangeRisk,

    flags,
  };
}

// ─────────────────────────────────────────────────────────────
// Helper interno
// ─────────────────────────────────────────────────────────────

function detectedFamily_isUnknownWithAnchor(family, hasActiveAnchor) {
  return family === FOLLOWUP_FAMILIES.UNKNOWN_WITH_ANCHOR;
}
