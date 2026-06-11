/**
 * PATCH 6.4 — Response Contract Coverage Audit
 *
 * Módulo puro — sem side effects.
 *
 * Mede se variações semânticas de intenção chegam corretamente
 * ao contrato de resposta esperado, identificando o estágio
 * onde a intenção escapou quando o caminho está incompleto.
 *
 * Pipeline auditado:
 *   User Query
 *     → Cognitive Router (turnType)
 *     → Intent Bridge (finalIntent)
 *     → Routing Decision (routingDecision)
 *     → directReply early return (bypass risk)
 *     → Prompt Contract (_richExpContextModeSelected)
 *     → Final Response (finalReply)
 *
 * NÃO altera nenhum comportamento, prompt, router, ranking ou winner.
 */

// ─────────────────────────────────────────────────────────────
// Flags de cobertura
// ─────────────────────────────────────────────────────────────

export const COVERAGE_FLAGS = Object.freeze({
  CONTRACT_COVERAGE_OK:                "CONTRACT_COVERAGE_OK",
  SEMANTIC_FAMILY_MISMATCH:            "SEMANTIC_FAMILY_MISMATCH",
  COGNITIVE_TURN_MISMATCH:             "COGNITIVE_TURN_MISMATCH",
  CONTRACT_NOT_ACTIVATED:              "CONTRACT_NOT_ACTIVATED",
  WRONG_CONTRACT_ACTIVATED:            "WRONG_CONTRACT_ACTIVATED",
  DIRECT_REPLY_EARLY_BYPASS:           "DIRECT_REPLY_EARLY_BYPASS",
  WELCOME_FALLBACK_LEAK:               "WELCOME_FALLBACK_LEAK",
  ANCHOR_LOST:                         "ANCHOR_LOST",
  UNAUTHORIZED_ALTERNATIVE:            "UNAUTHORIZED_ALTERNATIVE",
  WINNER_CHANGED_WITHOUT_PERMISSION:   "WINNER_CHANGED_WITHOUT_PERMISSION",
  PRIORITY_SHIFT_NOT_RECOGNIZED:       "PRIORITY_SHIFT_NOT_RECOGNIZED",
  OBJECTION_NOT_RECOGNIZED:            "OBJECTION_NOT_RECOGNIZED",
  EXPLANATION_NOT_RECOGNIZED:          "EXPLANATION_NOT_RECOGNIZED",
  REFINEMENT_NOT_RECOGNIZED:           "REFINEMENT_NOT_RECOGNIZED",
  CONFIDENCE_CHALLENGE_NOT_RECOGNIZED: "CONFIDENCE_CHALLENGE_NOT_RECOGNIZED",
  ACKNOWLEDGEMENT_NOT_RECOGNIZED:      "ACKNOWLEDGEMENT_NOT_RECOGNIZED",
});

// ─────────────────────────────────────────────────────────────
// Mapeamentos canônicos: família semântica → turnType / contrato
// ─────────────────────────────────────────────────────────────

/**
 * Família semântica → turnType esperado do Cognitive Router.
 * CONFIDENCE_CHALLENGE é subtype de EXPLANATION_REQUEST.
 */
export const FAMILY_TURN_TYPE_MAP = Object.freeze({
  CONFIDENCE_CHALLENGE:    "EXPLANATION_REQUEST",
  EXPLANATION_REQUEST:     "EXPLANATION_REQUEST",
  OBJECTION_PRICE:         "OBJECTION",
  OBJECTION:               "OBJECTION",
  REFINEMENT:              "REFINEMENT",
  ALTERNATIVE_EXPLORATION: "REFINEMENT",
  PRIORITY_SHIFT:          "PRIORITY_SHIFT",
  ACKNOWLEDGEMENT:         "REACTION",
  REACTION:                "REACTION",
});

/**
 * Família semântica → contrato de resposta esperado.
 * null = nenhum contrato específico ainda (diagnóstico apenas).
 */
export const FAMILY_CONTRACT_MAP = Object.freeze({
  CONFIDENCE_CHALLENGE:    "confidence_challenge_defense",
  EXPLANATION_REQUEST:     "explanation_anchored",
  OBJECTION_PRICE:         "objection_response_contract",
  OBJECTION:               "objection_response_contract",
  REFINEMENT:              "refinement_followup_response_contract",
  ALTERNATIVE_EXPLORATION: "refinement_followup_response_contract",
  PRIORITY_SHIFT:          null,
  ACKNOWLEDGEMENT:         "decision_generic",
  REACTION:                "decision_generic",
});

// Flag específica de "não reconhecido" por família
const _FAMILY_NOT_RECOGNIZED_FLAG = {
  CONFIDENCE_CHALLENGE:    COVERAGE_FLAGS.CONFIDENCE_CHALLENGE_NOT_RECOGNIZED,
  EXPLANATION_REQUEST:     COVERAGE_FLAGS.EXPLANATION_NOT_RECOGNIZED,
  OBJECTION_PRICE:         COVERAGE_FLAGS.OBJECTION_NOT_RECOGNIZED,
  OBJECTION:               COVERAGE_FLAGS.OBJECTION_NOT_RECOGNIZED,
  REFINEMENT:              COVERAGE_FLAGS.REFINEMENT_NOT_RECOGNIZED,
  ALTERNATIVE_EXPLORATION: COVERAGE_FLAGS.REFINEMENT_NOT_RECOGNIZED,
  PRIORITY_SHIFT:          COVERAGE_FLAGS.PRIORITY_SHIFT_NOT_RECOGNIZED,
  ACKNOWLEDGEMENT:         COVERAGE_FLAGS.ACKNOWLEDGEMENT_NOT_RECOGNIZED,
  REACTION:                COVERAGE_FLAGS.ACKNOWLEDGEMENT_NOT_RECOGNIZED,
};

// Comportamentos proibidos por contrato
const _CONTRACT_FORBIDDEN_BEHAVIORS = {
  "confidence_challenge_defense":           ["suggest_alternative", "change_winner", "open_search", "weaken_recommendation"],
  "objection_response_contract":            ["auto_swap_winner", "list_alternatives_spontaneously", "open_search", "rerank"],
  "refinement_followup_response_contract":  ["welcome_fallback", "ask_product_again", "ignore_anchor", "auto_change_winner"],
  "explanation_anchored":                   ["welcome_fallback", "lose_anchor", "open_new_search"],
  "decision_generic":                       [],
};

// Padrões de welcome/fallback (consistentes com miaRouterResponseComplianceAudit)
const _WELCOME_PATTERNS = [
  /posso te ajudar/,
  /me conta mais/,
  /o que voce procura/,
  /em que posso ajudar/,
  /como posso (te |)ajudar/,
  /estou aqui para ajudar/,
  /pode me contar/,
  /quer me dizer mais/,
  /me diz mais/,
  /qual e seu orcamento/,
  /qual seria o orcamento/,
  /me fala o produto/,
];

// Marcas de produtos para detecção de troca de winner
const _KNOWN_BRANDS = [
  "samsung", "motorola", "xiaomi", "apple", "iphone", "galaxy",
  "redmi", "poco", "realme", "oneplus", "asus", "lenovo", "lg",
  "nokia", "zte", "moto",
];

// ─────────────────────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────────────────────

function _normalize(text = "") {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function _isWelcome(normReply) {
  return _WELCOME_PATTERNS.some(p => p.test(normReply));
}

function _replyContainsAnchor(normReply, normAnchor) {
  if (!normAnchor) return false;
  const parts = normAnchor.split(/\s+/).filter(w => w.length > 2);
  return parts.length > 0 && parts.some(p => normReply.includes(p));
}

function _replyHasNonAnchorBrand(normReply, normAnchor) {
  return _KNOWN_BRANDS.some(b => normReply.includes(b) && (!normAnchor || !normAnchor.includes(b)));
}

// ─────────────────────────────────────────────────────────────
// Derivação de contrato esperado
// Espelha a lógica do ternário _richExpContextModeSelected no handler.
// ─────────────────────────────────────────────────────────────

/**
 * Deriva qual contrato seria ativado dado o estado cognitivo + routing.
 * Usado internamente e exportado para testes.
 *
 * @param {string}  turnType       - cognitiveTurn.turnType
 * @param {string}  subtype        - signals.decisionExplanation.subtype
 * @param {boolean} hasAnchor      - há âncora ativa?
 * @param {string}  routingMode    - routingDecision.mode
 * @returns {string}
 */
export function deriveActivatedContract(turnType, subtype, hasAnchor, routingMode) {
  const richExpActive = routingMode === "cognitive_anchor_hold";
  if (subtype === "confidence_challenge" && richExpActive) return "confidence_challenge_defense";
  if (turnType === "OBJECTION"   && hasAnchor) return "objection_response_contract";
  if (turnType === "REFINEMENT"  && hasAnchor) return "refinement_followup_response_contract";
  if (richExpActive) return "explanation_anchored";
  return "decision_generic";
}

// ─────────────────────────────────────────────────────────────
// Função principal
// ─────────────────────────────────────────────────────────────

/**
 * PATCH 6.4 — buildResponseContractCoverageAudit
 *
 * @param {object} input
 * @param {string}        [input.auditVersion]
 * @param {string}        [input.originalQuery]
 * @param {string}        [input.resolvedQuery]
 * @param {string}        [input.expectedSemanticFamily]   - família semântica esperada
 * @param {string|null}   [input.expectedContract]         - override (se diferente do mapa)
 * @param {string|null}   [input.actualCognitiveTurnType]  - de classifyMiaTurn().turnType
 * @param {string|null}   [input.actualDetectedFamily]     - família detectada (opcional)
 * @param {string|null}   [input.cognitiveSubtype]         - signals.decisionExplanation.subtype
 * @param {string|null}   [input.activatedContract]        - _richExpContextModeSelected (se disponível)
 * @param {string|null}   [input.contextAction]
 * @param {string|null}   [input.finalIntent]
 * @param {boolean}       [input.hasActiveAnchor]
 * @param {boolean}       [input.directReplyBypassed]      - contextResolution.directReply existia antes de interceptadores
 * @param {string}        [input.finalReply]
 * @param {object|null}   [input.routingDecision]
 * @param {string|null}   [input.winnerNameAnchor]
 * @returns {object}
 */
export function buildResponseContractCoverageAudit({
  auditVersion        = "6.4",
  originalQuery       = "",
  resolvedQuery       = "",
  expectedSemanticFamily = null,
  expectedContract    = null,
  actualCognitiveTurnType = null,
  actualDetectedFamily   = null,
  cognitiveSubtype       = null,
  activatedContract      = null,
  contextAction          = null,
  finalIntent            = null,
  hasActiveAnchor        = false,
  directReplyBypassed    = false,
  finalReply             = "",
  routingDecision        = null,
  winnerNameAnchor       = null,
} = {}) {

  const normReply  = _normalize(finalReply);
  const normAnchor = winnerNameAnchor ? _normalize(winnerNameAnchor) : null;

  // ── 1. Turno esperado vs real ─────────────────────────────
  const expectedTurnType = FAMILY_TURN_TYPE_MAP[expectedSemanticFamily] || null;

  const turnTypeMatchesFamily = (() => {
    if (!expectedTurnType) return true;
    if (actualCognitiveTurnType === expectedTurnType) return true;
    // ACKNOWLEDGEMENT aceita REACTION e CONVERSATIONAL como equivalentes
    if (["ACKNOWLEDGEMENT", "REACTION"].includes(expectedSemanticFamily) &&
        ["REACTION", "CONVERSATIONAL", "ACKNOWLEDGEMENT"].includes(actualCognitiveTurnType)) {
      return true;
    }
    return false;
  })();

  const intentStageOk = turnTypeMatchesFamily;

  // ── 2. Routing stage ──────────────────────────────────────
  const routingStageOk = !directReplyBypassed;

  // ── 3. Contrato esperado e ativado ────────────────────────
  const _expectedContract = expectedContract ?? FAMILY_CONTRACT_MAP[expectedSemanticFamily] ?? null;

  const _activatedContract = activatedContract
    ?? deriveActivatedContract(
        actualCognitiveTurnType,
        cognitiveSubtype,
        hasActiveAnchor,
        routingDecision?.mode ?? null
      );

  // Contrato OK quando: não há contrato esperado (família sem contrato)
  // OU contrato ativado é o esperado.
  const contractActivationOk = !_expectedContract || _activatedContract === _expectedContract;

  // ── 4. Response stage (só se há reply) ───────────────────
  const hasReply = normReply.length > 0;

  const welcomeDetected     = hasReply && _isWelcome(normReply);
  const anchorPresentInReply = hasReply && normAnchor ? _replyContainsAnchor(normReply, normAnchor) : null;
  const anchorLost          = hasReply && normAnchor &&
    anchorPresentInReply === false &&
    !!_expectedContract &&
    _expectedContract !== "decision_generic";

  const unauthorizedAlternative = hasReply && normAnchor &&
    routingDecision?.allowReplaceWinner === false &&
    !_replyContainsAnchor(normReply, normAnchor) &&
    _replyHasNonAnchorBrand(normReply, normAnchor);

  const responseStageOk = !welcomeDetected && !unauthorizedAlternative && !anchorLost;

  // ── 5. Cobertura global ───────────────────────────────────
  const contractCoverageOk =
    intentStageOk &&
    routingStageOk &&
    contractActivationOk &&
    (!hasReply || responseStageOk);

  // ── 6. Estágio de escape ──────────────────────────────────
  let escapedAtStage = "not_applicable";
  if (!contractCoverageOk) {
    if (!intentStageOk) {
      escapedAtStage = "cognitive_router";
    } else if (!routingStageOk) {
      escapedAtStage = "direct_reply_early";
    } else if (!contractActivationOk) {
      escapedAtStage = "prompt_contract";
    } else if (hasReply && !responseStageOk) {
      escapedAtStage = "final_response";
    } else {
      escapedAtStage = "unknown";
    }
  }

  // ── 7. Flags ──────────────────────────────────────────────
  const flags = [];

  if (contractCoverageOk) {
    flags.push(COVERAGE_FLAGS.CONTRACT_COVERAGE_OK);
  }

  if (!intentStageOk && expectedTurnType) {
    flags.push(COVERAGE_FLAGS.COGNITIVE_TURN_MISMATCH);
    const notRecognized = _FAMILY_NOT_RECOGNIZED_FLAG[expectedSemanticFamily];
    if (notRecognized && !flags.includes(notRecognized)) {
      flags.push(notRecognized);
    }
  }

  if (directReplyBypassed) {
    flags.push(COVERAGE_FLAGS.DIRECT_REPLY_EARLY_BYPASS);
  }

  if (intentStageOk && !contractActivationOk && _expectedContract) {
    if (_activatedContract && _activatedContract !== _expectedContract) {
      flags.push(COVERAGE_FLAGS.WRONG_CONTRACT_ACTIVATED);
    } else {
      flags.push(COVERAGE_FLAGS.CONTRACT_NOT_ACTIVATED);
    }
  }

  if (welcomeDetected) flags.push(COVERAGE_FLAGS.WELCOME_FALLBACK_LEAK);
  if (anchorLost)      flags.push(COVERAGE_FLAGS.ANCHOR_LOST);

  if (unauthorizedAlternative) {
    flags.push(COVERAGE_FLAGS.UNAUTHORIZED_ALTERNATIVE);
    flags.push(COVERAGE_FLAGS.WINNER_CHANGED_WITHOUT_PERMISSION);
  }

  return {
    auditVersion,
    originalQuery,
    resolvedQuery: resolvedQuery || originalQuery,

    expectedSemanticFamily,
    actualCognitiveTurnType,
    actualDetectedFamily: actualDetectedFamily || actualCognitiveTurnType,

    expectedContract:  _expectedContract,
    activatedContract: _activatedContract,

    contractCoverageOk,

    intentStageOk,
    routingStageOk,
    responseStageOk: hasReply ? responseStageOk : null,

    escapedAtStage,

    expectedForbiddenBehaviors:
      _CONTRACT_FORBIDDEN_BEHAVIORS[_expectedContract] ?? [],
    observedForbiddenBehaviors: [
      ...(welcomeDetected        ? ["welcome_fallback"]        : []),
      ...(unauthorizedAlternative ? ["unauthorized_alternative"] : []),
      ...(anchorLost             ? ["anchor_lost"]             : []),
    ],

    flags,

    _meta: {
      expectedTurnType,
      turnTypeMatchesFamily,
      contractActivationOk,
      welcomeDetected,
      anchorLost,
      directReplyBypassed,
      derivedActivatedContract: _activatedContract,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Utilitários para suites de teste
// ─────────────────────────────────────────────────────────────

/**
 * Agrega resultados de múltiplos audits em um relatório de cobertura.
 */
export function buildCoverageMatrixReport(audits = []) {
  const byFamily = {};

  for (const audit of audits) {
    const family = audit.expectedSemanticFamily || "UNKNOWN";
    if (!byFamily[family]) {
      byFamily[family] = { total: 0, covered: 0, gaps: [] };
    }
    byFamily[family].total++;
    if (audit.contractCoverageOk) {
      byFamily[family].covered++;
    } else {
      byFamily[family].gaps.push({
        query:          audit.originalQuery,
        escapedAtStage: audit.escapedAtStage,
        flags:          audit.flags,
        actualTurnType: audit.actualCognitiveTurnType,
      });
    }
  }

  const total   = audits.length;
  const covered = audits.filter(a => a.contractCoverageOk).length;
  const score   = total > 0 ? Math.round((covered / total) * 100) : 0;

  return {
    auditVersion: "6.4",
    total,
    covered,
    gaps: total - covered,
    score: `${score}%`,
    byFamily,
  };
}
