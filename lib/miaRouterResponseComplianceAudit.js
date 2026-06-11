/**
 * PATCH 6.0 — Router-to-Response Compliance Audit
 *
 * Módulo puro de auditoria. Sem side effects. Sem alterações de comportamento.
 *
 * Objetivo: detectar onde o caminho
 *   Router → Routing → Prompt → Resposta
 * deixou de respeitar a decisão do Cognitive Router.
 *
 * Camadas auditadas:
 *   1. Router → Routing: o routingDecision honrou o turnType cognitivo?
 *   2. Routing → Reply:  a resposta honrou as restrições do routingDecision?
 *   3. Cross-layer:      há contradições entre intent, mode e flags de risco?
 *
 * NÃO altera resposta, winner, ranking, Data Layer, prompt, busca ou bridge.
 */

// ─────────────────────────────────────────────────────────────
// Flags de compliance
// ─────────────────────────────────────────────────────────────

export const COMPLIANCE_FLAGS = Object.freeze({
  // ── Críticas ─────────────────────────────────────────────────
  /** Router classificou o turno mas o pipeline final seguiu outra intenção. */
  ROUTER_CLASSIFICATION_IGNORED: "ROUTER_CLASSIFICATION_IGNORED",

  /** Response path incompatível com as restrições do routingDecision. */
  RESPONSE_PATH_DIVERGED: "RESPONSE_PATH_DIVERGED",

  /**
   * Contexto de confidence_challenge ou explanation_request mas a resposta
   * sugeriu um produto alternativo ao winner — possível violação de anchor.
   */
  UNAUTHORIZED_ALTERNATIVE_AFTER_EXPLANATION:
    "UNAUTHORIZED_ALTERNATIVE_AFTER_EXPLANATION",

  /**
   * Turno classificado como OBJECTION mas a resposta trocou o produto
   * sem allowReplaceWinner estar ativo.
   */
  OBJECTION_FORCED_RERANK: "OBJECTION_FORCED_RERANK",

  /** Turno classificado como REFINEMENT mas a resposta virou welcome/help. */
  REFINEMENT_FELL_TO_WELCOME: "REFINEMENT_FELL_TO_WELCOME",

  /**
   * Winner trocado na resposta sem que routingDecision.allowReplaceWinner
   * estivesse habilitado.
   */
  WINNER_CHANGED_WITHOUT_PERMISSION: "WINNER_CHANGED_WITHOUT_PERMISSION",

  // ── Informativas ─────────────────────────────────────────────
  /** Resposta de explicação inclui menção a alternativa (não necessariamente proibida). */
  EXPLANATION_WITH_ALTERNATIVE: "EXPLANATION_WITH_ALTERNATIVE",

  /** Resposta de objeção discutiu preço (esperado para OBJECTION). */
  OBJECTION_WITH_PRICE_DISCUSSION: "OBJECTION_WITH_PRICE_DISCUSSION",

  /** Resposta de refinement trouxe alternativa válida (comportamento correto). */
  REFINEMENT_WITH_VALID_ALTERNATIVE: "REFINEMENT_WITH_VALID_ALTERNATIVE",

  /** Resposta detectada como padrão welcome/help. */
  WELCOME_RESPONSE_DETECTED: "WELCOME_RESPONSE_DETECTED",

  /** Nenhuma violação crítica detectada. */
  COMPLIANCE_OK: "COMPLIANCE_OK",
});

/** Conjunto de flags consideradas críticas (violações potencialmente reais). */
export const CRITICAL_COMPLIANCE_FLAGS = new Set([
  COMPLIANCE_FLAGS.ROUTER_CLASSIFICATION_IGNORED,
  COMPLIANCE_FLAGS.RESPONSE_PATH_DIVERGED,
  COMPLIANCE_FLAGS.UNAUTHORIZED_ALTERNATIVE_AFTER_EXPLANATION,
  COMPLIANCE_FLAGS.OBJECTION_FORCED_RERANK,
  COMPLIANCE_FLAGS.REFINEMENT_FELL_TO_WELCOME,
  COMPLIANCE_FLAGS.WINNER_CHANGED_WITHOUT_PERMISSION,
]);

// ─────────────────────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────────────────────

function _norm(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Verifica se a string normalizada do anchor aparece no reply normalizado. */
function _replyContainsAnchor(normReply, normAnchor) {
  if (!normReply || !normAnchor) return false;
  if (normReply.includes(normAnchor)) return true;
  // Fallback: palavras significativas do anchor (> 3 chars)
  const words = normAnchor.split(" ").filter(w => w.length > 3);
  return words.length > 0 && words.every(w => normReply.includes(w));
}

/** Verifica se o reply contém menção a marca de produto (heurística). */
function _replyHasBrandMention(normReply) {
  return /\b(samsung|galaxy|iphone|apple|xiaomi|redmi|poco|moto|motorola|oneplus|asus|lg|nokia|realme|oppo|vivo)\b/.test(
    normReply
  );
}

/**
 * Verifica se o reply menciona um produto diferente do anchor.
 * Conservador: só sinaliza quando há marca conhecida que não pertence ao anchor.
 */
function _replyHasNonAnchorBrand(normReply, normAnchor) {
  if (!normReply) return false;
  if (!_replyHasBrandMention(normReply)) return false;
  if (!normAnchor) return true; // sem anchor → qualquer brand é "não-anchor"
  // Remove tokens do anchor e verifica se marcas permanecem
  const anchorWords = normAnchor.split(" ").filter(w => w.length > 2);
  let remaining = normReply;
  for (const w of anchorWords) {
    remaining = remaining.replace(new RegExp(`\\b${w}\\b`, "g"), " ");
  }
  return _replyHasBrandMention(remaining);
}

/**
 * Detecta padrões semânticos de "sugestão de alternativa" no reply.
 * Alinhado com _checkUnauthorizedAlternative() do miaExplanationConsistencyAudit (5.5F).
 */
function _hasAlternativeSuggestionPattern(normReply) {
  return (
    /\btambem (e|seria) (uma?|um?) (boa|bom|excelente|otima|otimo|interessante) (opcao|alternativa|escolha)\b/.test(normReply) ||
    /\boutra (opcao|alternativa|possibilidade)\b/.test(normReply) ||
    /\bse (voce|vc|quiser|preferir)\b.{0,60}\b(outro|outra|diferente)\b/.test(normReply) ||
    /\bpode considerar (tambem|outro|outra|o |a )\b/.test(normReply) ||
    /\bem vez disso\b/.test(normReply) ||
    // PATCH 6.0: "Se preferir Android..." / "Se quiser algo mais barato..."
    /\bse preferir\b/.test(normReply)
  );
}

/**
 * Detecta padrões de resposta welcome/help — indica fallback indevido para
 * mensagem genérica de boas-vindas ou orientação sem resolver o turno.
 */
function _isWelcomeResponse(normReply) {
  return (
    /posso te ajudar/.test(normReply) ||
    /me conta mais/.test(normReply) ||
    /o que voce procura/.test(normReply) ||
    /em que posso ajudar/.test(normReply) ||
    /como posso (te |)ajudar/.test(normReply) ||
    /estou aqui para ajudar/.test(normReply) ||
    /pode me contar/.test(normReply) ||
    /quer me dizer mais/.test(normReply) ||
    /me diz mais/.test(normReply) ||
    /qual e seu orcamento/.test(normReply) ||
    /qual seria o orcamento/.test(normReply)
  );
}

/** Detecta menção de preço / contexto de custo no reply. */
function _hasPriceDiscussion(normReply) {
  return (
    /\b(preco|valor|custa|custo|r\$|reais|barato|caro|acessivel)\b/.test(normReply) ||
    /\b(custo beneficio|investimento|orcamento)\b/.test(normReply)
  );
}

// ─────────────────────────────────────────────────────────────
// Checadores individuais (funções puras)
// ─────────────────────────────────────────────────────────────

/**
 * LAYER 1 — ROUTER_CLASSIFICATION_IGNORED
 *
 * O Cognitive Router classificou o turno com confiança suficiente para a bridge,
 * mas o finalIntent/contextAction final não reflete o mapeamento esperado.
 *
 * Apenas para turnTypes na BRIDGE_ALLOWLIST (os demais legitimamente ficam no legacy).
 */
const _BRIDGE_MAP = {
  EXPLANATION_REQUEST: "decision",
  VALUE_QUESTION:      "decision",
  REFINEMENT:          "refinement",
  COMPARISON:          "comparison",
  NEW_SEARCH:          "search",
};
const _BRIDGE_CONFIDENCE_THRESHOLD = 0.75;

function _checkRouterClassificationIgnored({
  cognitiveTurnType,
  cognitiveConfidence,
  hasActiveAnchor,
  finalIntent,
  contextAction,
}) {
  const expectedIntent = _BRIDGE_MAP[cognitiveTurnType];
  if (!expectedIntent) return false; // turn type not in bridge allowlist → legacy is expected
  if (typeof cognitiveConfidence !== "number" || cognitiveConfidence < _BRIDGE_CONFIDENCE_THRESHOLD) return false;

  const finalIntentOk = finalIntent === expectedIntent;
  // For EXPLANATION_REQUEST/VALUE_QUESTION, contextAction="decision" is equally valid
  const isExplanationType = cognitiveTurnType === "EXPLANATION_REQUEST" || cognitiveTurnType === "VALUE_QUESTION";
  const contextActionOk = isExplanationType && contextAction === "decision";

  if (finalIntentOk || contextActionOk) return false;

  // Require anchor active for explanation types (without anchor, routing legitimately goes elsewhere)
  if (isExplanationType && !hasActiveAnchor) return false;

  return true;
}

/**
 * LAYER 1 — RESPONSE_PATH_DIVERGED
 *
 * O routingDecision definiu um modo de anchor-hold (sem nova busca)
 * mas as restrições internas são contraditórias, ou o finalIntent
 * evidencia uma busca que não deveria ter ocorrido.
 *
 * Condição A: modo é anchor-hold MAS allowNewSearch ficou true (contradição interna).
 * Condição B: allowNewSearch=false MAS finalIntent acabou como "search".
 */
const _ANCHOR_HOLD_MODES = new Set([
  "cognitive_anchor_hold",
  "context_decision",
  "anchored_reaction",
  "comparison_followup",
]);

function _checkResponsePathDiverged({ routingDecision, finalIntent }) {
  if (!routingDecision) return false;

  // Condição A: modo de anchor-hold mas allowNewSearch=true (contradição)
  const modeIsAnchorHold = _ANCHOR_HOLD_MODES.has(routingDecision.mode);
  if (modeIsAnchorHold && routingDecision.allowNewSearch === true) return true;

  // Condição B: routing disse "não fazer busca" mas intent final virou "search"
  if (routingDecision.allowNewSearch === false && finalIntent === "search") return true;

  return false;
}

/**
 * LAYER 2 — UNAUTHORIZED_ALTERNATIVE_AFTER_EXPLANATION
 *
 * Turno de explicação (confidence_challenge, explanation_request) mas a resposta
 * sugeriu ou mencionou um produto alternativo ao winner.
 *
 * Fontes de evidência (em ordem de confiabilidade):
 *   1. explanationConsistencyAudit.flags contém EXPLANATION_MENTIONS_UNAUTHORIZED_ALTERNATIVE
 *   2. Heurística direta no reply (padrões de sugestão de alternativa)
 */
function _checkUnauthorizedAlternativeAfterExplanation({
  cognitiveTurnType,
  normReply,
  routingDecision,
  explanationConsistencyAudit,
}) {
  const explanationTypes = new Set(["EXPLANATION_REQUEST", "VALUE_QUESTION"]);
  if (!explanationTypes.has(cognitiveTurnType)) return false;

  // Fonte 1 — consistency audit (5.5F)
  if (
    explanationConsistencyAudit?.flags?.includes(
      "EXPLANATION_MENTIONS_UNAUTHORIZED_ALTERNATIVE"
    )
  ) {
    return true;
  }

  // Fonte 2 — heurística: padrão de sugestão de alternativa + reply não está
  //            em modo de comparação/refinamento legítimo
  const isLegitimateAlternativeMode = new Set(["refinement", "comparison_search", "new_search"]).has(
    routingDecision?.mode
  );
  if (isLegitimateAlternativeMode) return false;

  return _hasAlternativeSuggestionPattern(normReply);
}

/**
 * LAYER 2 — OBJECTION_FORCED_RERANK
 *
 * Turno classificado como OBJECTION mas a resposta trocou o produto sem
 * que allowReplaceWinner estivesse autorizado.
 */
function _checkObjectionForcedRerank({
  cognitiveTurnType,
  hasActiveAnchor,
  normReply,
  normAnchor,
  routingDecision,
}) {
  if (cognitiveTurnType !== "OBJECTION") return false;
  if (!hasActiveAnchor || !normAnchor) return false;
  if (routingDecision?.allowReplaceWinner === true) return false; // rerank autorizado → ok

  // Se a resposta menciona um produto que não é o anchor → winner foi trocado indevidamente
  return _replyHasNonAnchorBrand(normReply, normAnchor);
}

/**
 * LAYER 2 — REFINEMENT_FELL_TO_WELCOME
 *
 * Turno classificado como REFINEMENT mas a resposta é um padrão
 * welcome/help em vez de busca ou sugestão alternativa.
 */
function _checkRefinementFellToWelcome({ cognitiveTurnType, normReply }) {
  if (cognitiveTurnType !== "REFINEMENT") return false;
  return _isWelcomeResponse(normReply);
}

/**
 * LAYER 2 — WINNER_CHANGED_WITHOUT_PERMISSION
 *
 * O routing proibiu a troca de winner (allowReplaceWinner=false) e havia
 * uma âncora, mas a resposta menciona um produto diferente da âncora.
 */
function _checkWinnerChangedWithoutPermission({
  hasActiveAnchor,
  normReply,
  normAnchor,
  routingDecision,
}) {
  if (!hasActiveAnchor || !normAnchor) return false;
  if (routingDecision?.allowReplaceWinner !== false) return false;
  // Se reply NÃO menciona o anchor MAS menciona outras marcas → winner trocado
  return (
    !_replyContainsAnchor(normReply, normAnchor) &&
    _replyHasBrandMention(normReply)
  );
}

// ─────────────────────────────────────────────────────────────
// Função principal
// ─────────────────────────────────────────────────────────────

/**
 * PATCH 6.0 — buildRouterResponseComplianceAudit
 *
 * Módulo puro — sem side effects.
 *
 * @param {object} input
 * @param {string}        input.cognitiveTurnType           - de classifyMiaTurn().turnType
 * @param {number}        [input.cognitiveConfidence]        - de classifyMiaTurn().confidence
 * @param {string[]}      [input.cognitiveReasons]           - de classifyMiaTurn().reasons
 * @param {boolean}       [input.hasActiveAnchor]
 * @param {string|null}   [input.finalIntent]               - intent final (pós-bridge)
 * @param {string|null}   [input.contextAction]             - contextAction final
 * @param {object|null}   [input.routingDecision]           - objeto de buildRoutingDecision()
 * @param {string}        [input.finalReply]                - texto da resposta final
 * @param {string|null}   [input.winnerNameAnchor]          - nome do produto âncora
 * @param {object|null}   [input.explanationConsistencyAudit] - de buildExplanationConsistencyAudit() (5.5F)
 * @param {object|null}   [input.unifiedCognitiveRouterAudit] - de buildUnifiedCognitiveRouterAudit() (5.7)
 * @returns {object}
 */
export function buildRouterResponseComplianceAudit({
  cognitiveTurnType         = "UNKNOWN",
  cognitiveConfidence       = 0,
  cognitiveReasons          = [],
  hasActiveAnchor           = false,
  finalIntent               = null,
  contextAction             = null,
  routingDecision           = null,
  finalReply                = "",
  winnerNameAnchor          = null,
  explanationConsistencyAudit = null,
  unifiedCognitiveRouterAudit = null,
} = {}) {
  const auditVersion = "6.0";

  const normReply  = _norm(finalReply);
  const normAnchor = _norm(winnerNameAnchor ?? "");

  // ── Layer 1: Router → Routing ────────────────────────────────
  const routerClassificationIgnored = _checkRouterClassificationIgnored({
    cognitiveTurnType,
    cognitiveConfidence,
    hasActiveAnchor,
    finalIntent,
    contextAction,
  });

  const responsePathDiverged = _checkResponsePathDiverged({
    routingDecision,
    finalIntent,
  });

  // ── Layer 2: Routing → Reply ─────────────────────────────────
  const unauthorizedAlternativeAfterExplanation = _checkUnauthorizedAlternativeAfterExplanation({
    cognitiveTurnType,
    normReply,
    routingDecision,
    explanationConsistencyAudit,
  });

  const objectionForcedRerank = _checkObjectionForcedRerank({
    cognitiveTurnType,
    hasActiveAnchor,
    normReply,
    normAnchor,
    routingDecision,
  });

  const refinementFellToWelcome = _checkRefinementFellToWelcome({
    cognitiveTurnType,
    normReply,
  });

  const winnerChangedWithoutPermission = _checkWinnerChangedWithoutPermission({
    hasActiveAnchor,
    normReply,
    normAnchor,
    routingDecision,
  });

  // ── Informativas ─────────────────────────────────────────────
  const isWelcomeDetected = _isWelcomeResponse(normReply);
  const hasAlternative    = _hasAlternativeSuggestionPattern(normReply);
  const hasPriceDiscussion = _hasPriceDiscussion(normReply);

  const isExplanationType = cognitiveTurnType === "EXPLANATION_REQUEST" || cognitiveTurnType === "VALUE_QUESTION";
  const isRefinementType  = cognitiveTurnType === "REFINEMENT";
  const isObjectionType   = cognitiveTurnType === "OBJECTION";

  const explanationWithAlternative  = isExplanationType && hasAlternative && !unauthorizedAlternativeAfterExplanation;
  const objectionWithPriceDiscussion = isObjectionType && hasPriceDiscussion;
  const refinementWithValidAlternative = isRefinementType && !refinementFellToWelcome;

  // ── Construção das flags ─────────────────────────────────────
  const criticalFlags = [];
  if (routerClassificationIgnored)             criticalFlags.push(COMPLIANCE_FLAGS.ROUTER_CLASSIFICATION_IGNORED);
  if (responsePathDiverged)                    criticalFlags.push(COMPLIANCE_FLAGS.RESPONSE_PATH_DIVERGED);
  if (unauthorizedAlternativeAfterExplanation) criticalFlags.push(COMPLIANCE_FLAGS.UNAUTHORIZED_ALTERNATIVE_AFTER_EXPLANATION);
  if (objectionForcedRerank)                   criticalFlags.push(COMPLIANCE_FLAGS.OBJECTION_FORCED_RERANK);
  if (refinementFellToWelcome)                 criticalFlags.push(COMPLIANCE_FLAGS.REFINEMENT_FELL_TO_WELCOME);
  if (winnerChangedWithoutPermission)          criticalFlags.push(COMPLIANCE_FLAGS.WINNER_CHANGED_WITHOUT_PERMISSION);

  const informativeFlags = [];
  if (isWelcomeDetected)             informativeFlags.push(COMPLIANCE_FLAGS.WELCOME_RESPONSE_DETECTED);
  if (explanationWithAlternative)    informativeFlags.push(COMPLIANCE_FLAGS.EXPLANATION_WITH_ALTERNATIVE);
  if (objectionWithPriceDiscussion)  informativeFlags.push(COMPLIANCE_FLAGS.OBJECTION_WITH_PRICE_DISCUSSION);
  if (refinementWithValidAlternative) informativeFlags.push(COMPLIANCE_FLAGS.REFINEMENT_WITH_VALID_ALTERNATIVE);

  const isCompliant = criticalFlags.length === 0;
  if (isCompliant) informativeFlags.push(COMPLIANCE_FLAGS.COMPLIANCE_OK);

  const flags = [...criticalFlags, ...informativeFlags];

  // ── Diagnósticos ─────────────────────────────────────────────
  const subtype = cognitiveReasons.find(r => r.startsWith("decision_explanation_subtype:"))
    ?.replace("decision_explanation_subtype:", "") ?? null;

  const diagnostics = {
    routingMode:            routingDecision?.mode ?? null,
    responsePathHint:       routingDecision?.responsePathHint ?? null,
    allowNewSearch:         routingDecision?.allowNewSearch ?? null,
    allowReplaceWinner:     routingDecision?.allowReplaceWinner ?? null,
    shouldPreserveAnchor:   routingDecision?.shouldPreserveAnchor ?? null,
    decisionExplanationSubtype: subtype,
    normReplyLength:        normReply.length,
    anchorDetectedInReply:  normAnchor ? _replyContainsAnchor(normReply, normAnchor) : null,
    brandMentionInReply:    _replyHasBrandMention(normReply),
    welcomePatternInReply:  isWelcomeDetected,
    alternativePatternInReply: hasAlternative,
    pipelineLayer1Ok:       !routerClassificationIgnored && !responsePathDiverged,
    pipelineLayer2Ok:       !unauthorizedAlternativeAfterExplanation &&
                            !objectionForcedRerank &&
                            !refinementFellToWelcome &&
                            !winnerChangedWithoutPermission,
  };

  return {
    auditVersion,
    cognitiveTurnType,
    cognitiveConfidence,
    hasActiveAnchor,
    finalIntent,
    contextAction,
    winnerNameAnchor,
    isCompliant,
    criticalFlags,
    informativeFlags,
    flags,
    diagnostics,
  };
}
