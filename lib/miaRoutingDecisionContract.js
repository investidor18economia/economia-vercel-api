/**
 * PATCH 2 — Routing Decision Contract
 * Normalizes existing signals into route permissions (not product decisions).
 */

import { extractBudget } from "./miaRoutingSafety.js";

const REFINEMENT_CONTEXT_MODES = new Set([
  "refinement",
  "dynamic_reprioritization",
  "priority_change_reopen"
]);

export function createEmptyRoutingDecision() {
  return {
    mode: null,
    conversationAct: null,
    anchorProduct: null,
    anchorSource: null,
    priority: null,
    detectedBudget: null,
    allowNewSearch: false,
    allowCommercialFallback: false,
    allowReplaceWinner: false,
    allowRerank: false,
    shouldPreserveAnchor: true,
    shouldReturnSessionContext: true,
    responsePathHint: null,
    reasons: []
  };
}

function pickAnchorProduct(sessionContext = {}, incomingSessionContext = {}) {
  const fromSession =
    sessionContext?.lastBestProduct ||
    incomingSessionContext?.lastBestProduct ||
    null;

  if (!fromSession?.product_name) {
    return { product: null, source: null };
  }

  return {
    product: fromSession,
    source: sessionContext?.lastBestProduct?.product_name
      ? "session_context"
      : "incoming_session_context"
  };
}

function hasDecisiveNewEvidence(signals = {}) {
  return !!(
    signals.hasClearNewCommercialSearch ||
    signals.isExplicitComparison ||
    signals.explicitProductOnlyQuery ||
    signals.wantsNew ||
    signals.newBudgetInOriginalMessage ||
    signals.newCategoryInOriginalMessage ||
    signals.priorityChangeReopen
  );
}

/**
 * @param {object} params
 * @param {string} params.userMessage
 * @param {string} params.resolvedQuery
 * @param {object} params.contextResolution
 * @param {object} params.sessionContext
 * @param {object} params.incomingSessionContext
 * @param {string} params.intent
 * @param {string} params.contextAction
 * @param {number|null} params.detectedBudget
 * @param {string} params.detectedPriority
 * @param {object} params.signals — precomputed flags from handler (existing detectors)
 * @param {object|null} params.cognitiveRoutingSignal — PATCH 5.6F: sinal do Cognitive Router
 *   { turnType, confidence, hasActiveAnchor }
 */
export function buildRoutingDecision({
  userMessage = "",
  resolvedQuery = "",
  contextResolution = {},
  sessionContext = {},
  incomingSessionContext = {},
  intent = "",
  contextAction = "",
  detectedBudget = null,
  detectedPriority = "",
  signals = {},
  cognitiveRoutingSignal = null,
} = {}) {
  const rd = createEmptyRoutingDecision();
  const { product: anchorProduct, source: anchorSource } = pickAnchorProduct(
    sessionContext,
    incomingSessionContext
  );
  const hasAnchor = !!anchorProduct?.product_name;

  rd.anchorProduct = anchorProduct;
  rd.anchorSource = anchorSource;
  rd.priority = detectedPriority || sessionContext?.lastPriority || "";
  rd.detectedBudget =
    detectedBudget ??
    extractBudget(userMessage) ??
    extractBudget(resolvedQuery) ??
    null;

  const decisiveNewEvidence = hasDecisiveNewEvidence(signals);
  const comparisonFollowUp =
    !!signals.hasComparisonProducts &&
    !signals.hasClearNewCommercialSearch &&
    (!!signals.isComparisonContextFollowUp ||
      !!signals.isComparisonFollowUpLocked ||
      !!signals.looksLikeShortPriorityFollowUp ||
      !!contextResolution.lockedComparisonFollowUp);

  if (comparisonFollowUp) {
    rd.mode = "comparison_followup";
    rd.conversationAct = "comparison_axis_followup";
    rd.allowNewSearch = false;
    rd.allowCommercialFallback = false;
    rd.allowReplaceWinner = false;
    rd.allowRerank = false;
    rd.shouldPreserveAnchor = true;
    rd.shouldReturnSessionContext = true;
    rd.responsePathHint = "comparison_followup";
    rd.reasons.push("comparison_context_with_axis_or_locked_followup");
    return rd;
  }

  // ─────────────────────────────────────────────────────────────
  // PATCH 5.6F — Cognitive Routing Mode Authority
  //
  // Quando o Cognitive Router detecta EXPLANATION_REQUEST com âncora
  // ativa e alta confiança, o mode é definido diretamente como
  // "cognitive_anchor_hold" — sem depender do restore posterior (5.3B).
  //
  // Condições de guarda (não aplica quando):
  //   - há sinal de nova busca explícita (hasClearNewCommercialSearch)
  //   - há sinal de comparison explícita (isExplicitComparison)
  //   - wantsNew (usuário quer produto diferente)
  //
  // PATCH 5.3B permanece como safety net.
  // ─────────────────────────────────────────────────────────────
  if (
    cognitiveRoutingSignal?.turnType === "EXPLANATION_REQUEST" &&
    typeof cognitiveRoutingSignal?.confidence === "number" &&
    cognitiveRoutingSignal.confidence >= 0.75 &&
    cognitiveRoutingSignal?.hasActiveAnchor &&
    !signals.hasClearNewCommercialSearch &&
    !signals.wantsNew &&
    !signals.isExplicitComparison
  ) {
    rd.mode = "cognitive_anchor_hold";
    rd.conversationAct = "cognitive_explanation_anchored";
    rd.allowNewSearch = false;
    rd.allowCommercialFallback = false;
    rd.allowReplaceWinner = false;
    rd.allowRerank = false;
    rd.shouldPreserveAnchor = true;
    rd.shouldReturnSessionContext = true;
    rd.responsePathHint = "context_explanation_anchored";
    rd.reasons.push("cognitive_explanation_request_anchored");
    return rd;
  }
  // ─────────────────────────────────────────────────────────────

  if (signals.isContextDecisionOnOriginal || contextAction === "decision") {
    rd.mode = "context_decision";
    rd.conversationAct = "context_question";
    rd.allowNewSearch = false;
    rd.allowCommercialFallback = false;
    rd.allowReplaceWinner = false;
    rd.allowRerank = false;
    rd.shouldPreserveAnchor = true;
    rd.shouldReturnSessionContext = true;
    rd.responsePathHint = "decision_context";
    rd.reasons.push("context_decision_on_original_message");
    return rd;
  }

  if (signals.isProductReferenceOnOriginal || contextAction === "analysis") {
    rd.mode = "context_decision";
    rd.conversationAct = "product_reference";
    rd.allowNewSearch = false;
    rd.allowCommercialFallback = false;
    rd.allowReplaceWinner = false;
    rd.allowRerank = false;
    rd.shouldPreserveAnchor = true;
    rd.shouldReturnSessionContext = true;
    rd.responsePathHint = "product_analysis_context";
    rd.reasons.push("product_reference_on_original_message");
    return rd;
  }

  if (
    hasAnchor &&
    signals.looksLikeAmbiguousFollowUp &&
    !decisiveNewEvidence &&
    !signals.looksLikeShortPriorityFollowUp
  ) {
    rd.mode = "anchored_reaction";
    rd.conversationAct = "challenge_or_reaction";
    rd.allowNewSearch = false;
    rd.allowCommercialFallback = false;
    rd.allowReplaceWinner = false;
    rd.allowRerank = false;
    rd.shouldPreserveAnchor = true;
    rd.shouldReturnSessionContext = true;
    rd.responsePathHint = "anchored_context";
    rd.reasons.push("anchored_ambiguous_followup_without_new_evidence");
    return rd;
  }

  const isRefinementMode =
    (REFINEMENT_CONTEXT_MODES.has(contextResolution?.mode) &&
      !signals.looksLikeAmbiguousFollowUp) ||
    (!!signals.looksLikeShortPriorityFollowUp && hasAnchor) ||
    (!!detectedPriority &&
      hasAnchor &&
      !signals.isContextDecisionOnOriginal &&
      !signals.looksLikeAmbiguousFollowUp);

  if (isRefinementMode && !decisiveNewEvidence) {
    rd.mode = "refinement";
    rd.conversationAct = "constraint_refinement";
    rd.allowNewSearch = true;
    rd.allowCommercialFallback = true;
    rd.allowReplaceWinner = true;
    rd.allowRerank = true;
    rd.shouldPreserveAnchor = false;
    rd.shouldReturnSessionContext = true;
    rd.responsePathHint = "refinement_search";
    rd.reasons.push("refinement_or_priority_axis_followup");
    return rd;
  }

  if (signals.hasClearNewCommercialSearch) {
    rd.mode = "new_search";
    rd.conversationAct = "explicit_new_search";
    rd.allowNewSearch = true;
    rd.allowCommercialFallback = true;
    rd.allowReplaceWinner = true;
    rd.allowRerank = true;
    rd.shouldPreserveAnchor = false;
    rd.shouldReturnSessionContext = true;
    rd.responsePathHint = "new_commercial_search";
    rd.reasons.push("clear_new_commercial_search_intent");
    return rd;
  }

  if (contextResolution?.shouldSkipProductSearch) {
    rd.mode = "context_hold";
    rd.conversationAct = contextResolution?.mode || "context_hold";
    rd.allowNewSearch = false;
    rd.allowCommercialFallback = false;
    rd.allowReplaceWinner = false;
    rd.allowRerank = false;
    rd.shouldPreserveAnchor = hasAnchor;
    rd.shouldReturnSessionContext = true;
    rd.responsePathHint = "context_hold";
    rd.reasons.push("context_resolution_should_skip_product_search");
    return rd;
  }

  rd.mode = intent === "comparison" ? "comparison_search" : "search";
  rd.conversationAct = contextAction || intent || "search";
  rd.allowNewSearch = true;
  rd.allowCommercialFallback = !hasAnchor || decisiveNewEvidence;
  rd.allowReplaceWinner = !hasAnchor || decisiveNewEvidence;
  rd.allowRerank = true;
  rd.shouldPreserveAnchor = hasAnchor && !decisiveNewEvidence;
  rd.shouldReturnSessionContext = true;
  rd.responsePathHint = "default_product_search";
  rd.reasons.push("default_search_path");
  return rd;
}

export function applyRoutingDecisionToContextResolution(
  routingDecision = {},
  contextResolution = {}
) {
  if (!routingDecision || !contextResolution) return contextResolution;

  if (!routingDecision.allowNewSearch) {
    contextResolution.shouldSkipProductSearch = true;
  } else {
    contextResolution.shouldSkipProductSearch = false;
    contextResolution.directReply = null;
    contextResolution.clearContext = false;
  }

  if (routingDecision.mode === "new_search" || routingDecision.mode === "refinement") {
    contextResolution.shouldSkipProductSearch = false;
    contextResolution.directReply = null;
    contextResolution.clearContext = false;
    if (
      contextResolution.mode === "general_answer" ||
      contextResolution.mode === "guidance_needed"
    ) {
      contextResolution.mode = routingDecision.mode === "refinement" ? "refinement" : "direct";
    }
  }

  return contextResolution;
}

export function routingDecisionToTrace(routingDecision = {}) {
  if (!routingDecision) return null;
  return {
    mode: routingDecision.mode,
    conversationAct: routingDecision.conversationAct,
    anchorProduct: routingDecision.anchorProduct?.product_name || null,
    anchorSource: routingDecision.anchorSource,
    priority: routingDecision.priority,
    detectedBudget: routingDecision.detectedBudget,
    allowNewSearch: routingDecision.allowNewSearch,
    allowCommercialFallback: routingDecision.allowCommercialFallback,
    allowReplaceWinner: routingDecision.allowReplaceWinner,
    allowRerank: routingDecision.allowRerank,
    shouldPreserveAnchor: routingDecision.shouldPreserveAnchor,
    shouldReturnSessionContext: routingDecision.shouldReturnSessionContext,
    responsePathHint: routingDecision.responsePathHint,
    reasons: routingDecision.reasons || []
  };
}
