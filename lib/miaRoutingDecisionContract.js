/**
 * PATCH 2 — Routing Decision Contract
 * Normalizes existing signals into route permissions (not product decisions).
 */

import {
  isAboutMiaFamilyQuery,
  isAcknowledgementFamilyQuery,
  isAlternativeExplorationFamilyQuery,
  isAnchoredShortFollowUpQuery,
  isAntiRegretFamilyQuery,
  isComprehensionFamilyQuery,
  isComprehensionSuccessFamilyQuery,
  isConfidenceChallengeFamilyQuery,
  isConversationalConfusionFamilyQuery,
  isUserConfusionFamilyQuery,
  isConstraintChangeFamilyQuery,
  isDecisionConfirmationFamilyQuery,
  isGreetingFamilyQuery,
  isSecondBestDiscoveryFamilyQuery,
  isSocialValidationFamilyQuery,
  isSoftDisagreementFamilyQuery,
} from "./miaCognitiveRouter.js";
import { extractBudget, isAnchoredDelegationChoiceRequest, isEmotionalAntiRegretDesire } from "./miaRoutingSafety.js";
import { detectsLegitimateDecisionContextChange } from "./miaExplicitRecommendationChangeProtocol.js";
import { detectsPostChangeRecoverySignal } from "./miaPostChangeRecoveryLayer.js";
import { detectsFinalDecisionScopeQuery } from "./miaFinalDecisionScopeGuard.js";
import {
  MIA_INTERACTION_MODES,
  shouldBypassDefaultProductSearch,
} from "./miaIntentRecognitionLayer.js";
import {
  COMMERCIAL_PERMISSION,
  suppressCommercialSignalsForAuthority,
} from "./miaIntentAuthority.js";

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
 * PATCH 7.9X-D.2 — ANTI_REGRET routing hold authority.
 * Must run before generic contextAction=decision → context_question intercept.
 */
function applyAntiRegretRoutingHoldIfEligible(
  rd,
  { hasAnchor, signals, cognitiveRoutingSignal, userMessage, reason = "anti_regret_conversational_routing_hold" }
) {
  const antiRegretRoutingHold =
    !signals.hasClearNewCommercialSearch &&
    !signals.isExplicitComparison &&
    !signals.wantsNew &&
    (
      cognitiveRoutingSignal?.isAntiRegret === true ||
      isEmotionalAntiRegretDesire(userMessage) ||
      (
        (
          cognitiveRoutingSignal?.turnType === "CONVERSATIONAL" ||
          cognitiveRoutingSignal?.turnType === "OBJECTION"
        ) &&
        isAntiRegretFamilyQuery(userMessage)
      )
    );

  if (!antiRegretRoutingHold) return false;

  rd.mode = hasAnchor ? "context_hold" : "conversational";
  rd.conversationAct = "anti_regret";
  rd.allowNewSearch = false;
  rd.allowCommercialFallback = false;
  rd.allowReplaceWinner = false;
  rd.allowRerank = false;
  rd.shouldPreserveAnchor = hasAnchor;
  rd.shouldReturnSessionContext = true;
  rd.responsePathHint = hasAnchor ? "anti_regret_anchored" : "anti_regret_reply";
  rd.reasons.push(reason);
  return true;
}

/**
 * PATCH 7.9K — CONSTRAINT_CHANGE routing hold authority.
 * Re-evaluate same decision with new criteria — not a fresh commercial search.
 */
function applyExplicitRecommendationChangeRoutingHoldIfEligible(
  rd,
  {
    hasAnchor,
    signals,
    userMessage,
    reason = "explicit_recommendation_change_routing_hold",
  }
) {
  const explicitChangeHold =
    hasAnchor &&
    !signals.hasClearNewCommercialSearch &&
    !signals.isExplicitComparison &&
    !signals.wantsNew &&
    detectsLegitimateDecisionContextChange(userMessage, { hasActiveAnchor: hasAnchor });

  if (!explicitChangeHold) return false;

  rd.mode = "explicit_recommendation_change";
  rd.conversationAct = "decision_context_change";
  rd.allowNewSearch = false;
  rd.allowCommercialFallback = false;
  rd.allowReplaceWinner = true;
  rd.allowRerank = true;
  rd.shouldPreserveAnchor = false;
  rd.shouldReturnSessionContext = true;
  rd.responsePathHint = "explicit_recommendation_change_reply";
  rd.reasons.push(reason);
  return true;
}

/**
 * PATCH 7.9K — CONSTRAINT_CHANGE routing hold authority.
 * Re-evaluate same decision with new criteria — not a fresh commercial search.
 */
function applyConstraintChangeRoutingHoldIfEligible(
  rd,
  {
    hasAnchor,
    signals,
    cognitiveRoutingSignal,
    userMessage,
    reason = "constraint_change_conversational_routing_hold",
  }
) {
  const constraintChangeRoutingHold =
    !signals.isExplicitComparison &&
    !signals.wantsNew &&
    (
      cognitiveRoutingSignal?.isConstraintChange === true ||
      (
        (
          cognitiveRoutingSignal?.turnType === "CONVERSATIONAL" ||
          cognitiveRoutingSignal?.turnType === "PRIORITY_SHIFT" ||
          cognitiveRoutingSignal?.turnType === "REFINEMENT" ||
          cognitiveRoutingSignal?.turnType === "FOLLOW_UP"
        ) &&
        isConstraintChangeFamilyQuery(userMessage)
      )
    );

  if (!constraintChangeRoutingHold) return false;

  rd.mode = hasAnchor ? "context_hold" : "conversational";
  rd.conversationAct = "constraint_change";
  rd.allowNewSearch = false;
  rd.allowCommercialFallback = false;
  rd.allowReplaceWinner = false;
  rd.allowRerank = true;
  rd.shouldPreserveAnchor = hasAnchor;
  rd.shouldReturnSessionContext = true;
  rd.responsePathHint = hasAnchor ? "constraint_change_anchored" : "constraint_change_reply";
  rd.reasons.push(reason);
  return true;
}

/**
 * PATCH 7.9X-G.2 — SOFT_DISAGREEMENT routing hold authority.
 * Must run before generic contextAction=decision → context_question intercept.
 */
function applySoftDisagreementRoutingHoldIfEligible(
  rd,
  {
    hasAnchor,
    signals,
    cognitiveRoutingSignal,
    userMessage,
    reason = "soft_disagreement_conversational_routing_hold",
  }
) {
  const softDisagreementRoutingHold =
    !signals.hasClearNewCommercialSearch &&
    !signals.isExplicitComparison &&
    !signals.wantsNew &&
    (
      cognitiveRoutingSignal?.isSoftDisagreement === true ||
      (
        (
          cognitiveRoutingSignal?.turnType === "CONVERSATIONAL" ||
          cognitiveRoutingSignal?.turnType === "OBJECTION"
        ) &&
        isSoftDisagreementFamilyQuery(userMessage)
      )
    );

  if (!softDisagreementRoutingHold) return false;

  rd.mode = hasAnchor ? "context_hold" : "conversational";
  rd.conversationAct = "soft_disagreement";
  rd.allowNewSearch = false;
  rd.allowCommercialFallback = false;
  rd.allowReplaceWinner = false;
  rd.allowRerank = false;
  rd.shouldPreserveAnchor = hasAnchor;
  rd.shouldReturnSessionContext = true;
  rd.responsePathHint = hasAnchor ? "soft_disagreement_anchored" : "soft_disagreement_reply";
  rd.reasons.push(reason);
  return true;
}

/**
 * PATCH 8.4D — Final decision scope hold (refocus/attribute within active context).
 */
function applyFinalDecisionScopeRoutingHoldIfEligible(
  rd,
  {
    hasAnchor,
    signals,
    userMessage,
    sessionContext,
    reason = "final_decision_scope_routing_hold",
  }
) {
  const finalScopeHold =
    hasAnchor &&
    !signals.hasClearNewCommercialSearch &&
    !signals.isExplicitComparison &&
    !signals.wantsNew &&
    detectsFinalDecisionScopeQuery(userMessage, {
      hasActiveAnchor: hasAnchor,
      sessionContext,
    });

  if (!finalScopeHold) return false;

  rd.mode = "final_decision_scope_hold";
  rd.conversationAct = "final_decision_scope";
  rd.allowNewSearch = false;
  rd.allowCommercialFallback = false;
  rd.allowReplaceWinner = false;
  rd.allowRerank = false;
  rd.shouldPreserveAnchor = true;
  rd.shouldReturnSessionContext = true;
  rd.responsePathHint = "final_decision_scope_reply";
  rd.reasons.push(reason);
  return true;
}

/**
 * PATCH 8.4C — Post-change recovery precedes generic contradiction recovery.
 */
function applyPostChangeRecoveryRoutingHoldIfEligible(
  rd,
  {
    hasAnchor,
    signals,
    userMessage,
    sessionContext,
    reason = "post_change_recovery_routing_hold",
  }
) {
  const postChangeRecoveryHold =
    hasAnchor &&
    !signals.hasClearNewCommercialSearch &&
    !signals.isExplicitComparison &&
    !signals.wantsNew &&
    detectsPostChangeRecoverySignal(userMessage, {
      hasActiveAnchor: hasAnchor,
      sessionContext,
    });

  if (!postChangeRecoveryHold) return false;

  rd.mode = "post_change_recovery_hold";
  rd.conversationAct = "post_change_recovery";
  rd.allowNewSearch = false;
  rd.allowCommercialFallback = false;
  rd.allowReplaceWinner = false;
  rd.allowRerank = false;
  rd.shouldPreserveAnchor = true;
  rd.shouldReturnSessionContext = true;
  rd.responsePathHint = "post_change_recovery_reorganize";
  rd.reasons.push(reason);
  return true;
}

/**
 * PATCH 8.3F — Contradiction recovery routing hold (before comprehension).
 */
function applyContradictionRecoveryRoutingHoldIfEligible(
  rd,
  {
    hasAnchor,
    signals,
    cognitiveRoutingSignal,
    userMessage,
    reason = "contradiction_recovery_routing_hold",
  }
) {
  const contradictionRecoveryHold =
    hasAnchor &&
    !signals.hasClearNewCommercialSearch &&
    !signals.isExplicitComparison &&
    !signals.wantsNew &&
    (
      cognitiveRoutingSignal?.turnType === "CONVERSATIONAL_CONFUSION" ||
      signals.isConversationalConfusion === true ||
      isConversationalConfusionFamilyQuery(userMessage, { hasActiveAnchor: hasAnchor })
    );

  if (!contradictionRecoveryHold) return false;

  rd.mode = "contradiction_recovery_hold";
  rd.conversationAct = "contradiction_recovery";
  rd.allowNewSearch = false;
  rd.allowCommercialFallback = false;
  rd.allowReplaceWinner = false;
  rd.allowRerank = false;
  rd.shouldPreserveAnchor = true;
  rd.shouldReturnSessionContext = true;
  rd.responsePathHint = "contradiction_recovery_reorganize";
  rd.reasons.push(reason);
  return true;
}

/**
 * PATCH 8.3G — User confusion recovery routing hold (after contradiction, before comprehension).
 */
function applyUserConfusionRecoveryRoutingHoldIfEligible(
  rd,
  {
    hasAnchor,
    signals,
    cognitiveRoutingSignal,
    userMessage,
    reason = "user_confusion_recovery_routing_hold",
  }
) {
  const userConfusionRecoveryHold =
    hasAnchor &&
    !signals.hasClearNewCommercialSearch &&
    !signals.isExplicitComparison &&
    !signals.wantsNew &&
    !signals.isConversationalConfusion &&
    (
      cognitiveRoutingSignal?.turnType === "EXPLANATION_REQUEST" ||
      isUserConfusionFamilyQuery(userMessage, { hasActiveAnchor: hasAnchor })
    );

  if (!userConfusionRecoveryHold) return false;

  rd.mode = "user_confusion_recovery_hold";
  rd.conversationAct = "comprehension_recovery";
  rd.allowNewSearch = false;
  rd.allowCommercialFallback = false;
  rd.allowReplaceWinner = false;
  rd.allowRerank = false;
  rd.shouldPreserveAnchor = true;
  rd.shouldReturnSessionContext = true;
  rd.responsePathHint = "user_confusion_recovery_simplify";
  rd.reasons.push(reason);
  return true;
}

/**
 * PATCH 7.9X-H.3 / 8.1B.2 — COMPREHENSION routing hold authority.
 * Must run before acknowledgement hold and cognitive_explanation intercept.
 * Covers FAILURE (re-explain) and SUCCESS (confirm understanding).
 */
function applyComprehensionRoutingHoldIfEligible(
  rd,
  {
    hasAnchor,
    signals,
    cognitiveRoutingSignal,
    userMessage,
    reason = "comprehension_conversational_routing_hold",
  }
) {
  const comprehensionRoutingHold =
    !signals.hasClearNewCommercialSearch &&
    !signals.isExplicitComparison &&
    !signals.wantsNew &&
    (
      cognitiveRoutingSignal?.isComprehension === true ||
      cognitiveRoutingSignal?.isComprehensionSuccess === true ||
      (
        (
          cognitiveRoutingSignal?.turnType === "CONVERSATIONAL" ||
          cognitiveRoutingSignal?.turnType === "EXPLANATION_REQUEST" ||
          cognitiveRoutingSignal?.turnType === "REACTION"
        ) &&
        (
          isComprehensionFamilyQuery(userMessage) ||
          isComprehensionSuccessFamilyQuery(userMessage)
        )
      )
    );

  if (!comprehensionRoutingHold) return false;

  rd.mode = hasAnchor ? "context_hold" : "conversational";
  rd.conversationAct = "comprehension";
  rd.allowNewSearch = false;
  rd.allowCommercialFallback = false;
  rd.allowReplaceWinner = false;
  rd.allowRerank = false;
  rd.shouldPreserveAnchor = hasAnchor;
  rd.shouldReturnSessionContext = true;
  rd.responsePathHint = hasAnchor ? "comprehension_anchored" : "comprehension_reply";
  rd.reasons.push(reason);
  return true;
}

/**
 * PATCH 11A.1 — Intent Authority routing hold (precedes hasClearNewCommercialSearch).
 */
function applyIntentAuthorityRoutingHoldIfEligible(
  rd,
  {
    hasAnchor,
    intentAuthority,
    reason = "intent_authority_non_commercial_routing_hold",
  }
) {
  if (
    !intentAuthority?.authoritative ||
    intentAuthority.commercialPermission !== COMMERCIAL_PERMISSION.DENY
  ) {
    return false;
  }

  const act = intentAuthority.primaryIntent || intentAuthority.legacyIntentOverride || "social_conversation";
  const hintByAct = {
    greeting: hasAnchor ? "greeting_anchored" : "greeting_open",
    acknowledgement: hasAnchor ? "acknowledgement_anchored" : "acknowledgement_reply",
    social_validation: hasAnchor ? "social_validation_anchored" : "social_validation_reply",
    about_mia: hasAnchor ? "about_mia_anchored" : "about_mia_reply",
    emotional_support: hasAnchor ? "emotional_support_anchored" : "emotional_support_reply",
    clarification: hasAnchor ? "clarification_anchored" : "clarification_reply",
    social_conversation: hasAnchor ? "social_conversation_anchored" : "social_conversation_reply",
  };

  rd.mode = hasAnchor ? "context_hold" : "conversational";
  rd.conversationAct = act;
  rd.allowNewSearch = false;
  rd.allowCommercialFallback = false;
  rd.allowReplaceWinner = false;
  rd.allowRerank = false;
  rd.shouldPreserveAnchor = hasAnchor;
  rd.shouldReturnSessionContext = true;
  rd.responsePathHint = hintByAct[act] || hintByAct.social_conversation;
  rd.reasons.push(reason);
  return true;
}

/**
 * PATCH 11A — Intent Recognition routing hold (before default search fallthrough).
 */
function applyIntentRecognitionRoutingHoldIfEligible(
  rd,
  {
    hasAnchor,
    signals,
    intentRecognition,
    intentAuthority,
    reason = "intent_recognition_social_routing_hold",
  }
) {
  if (intentAuthority?.authoritative && intentAuthority.commercialPermission === COMMERCIAL_PERMISSION.DENY) {
    return applyIntentAuthorityRoutingHoldIfEligible(rd, { hasAnchor, intentAuthority, reason });
  }

  if (!intentRecognition || !shouldBypassDefaultProductSearch(intentRecognition)) {
    return false;
  }

  if (
    signals.hasClearNewCommercialSearch &&
    intentRecognition.interactionMode !== MIA_INTERACTION_MODES.CLARIFICATION &&
    intentRecognition.interactionMode !== MIA_INTERACTION_MODES.MIXED
  ) {
    return false;
  }

  if (signals.isExplicitComparison && intentRecognition.interactionMode !== MIA_INTERACTION_MODES.MIXED) {
    return false;
  }

  const mode = intentRecognition.interactionMode;
  const actByMode = {
    [MIA_INTERACTION_MODES.SOCIAL]: intentRecognition.primaryIntent || "social_conversation",
    [MIA_INTERACTION_MODES.EMOTIONAL_SUPPORT]: "emotional_support",
    [MIA_INTERACTION_MODES.CLARIFICATION]: "clarification",
    [MIA_INTERACTION_MODES.IDENTITY]: "about_mia",
  };

  const act = actByMode[mode] || "social_conversation";
  const hintByAct = {
    greeting: hasAnchor ? "greeting_anchored" : "greeting_open",
    acknowledgement: hasAnchor ? "acknowledgement_anchored" : "acknowledgement_reply",
    social_validation: hasAnchor ? "social_validation_anchored" : "social_validation_reply",
    about_mia: hasAnchor ? "about_mia_anchored" : "about_mia_reply",
    emotional_support: hasAnchor ? "emotional_support_anchored" : "emotional_support_reply",
    clarification: hasAnchor ? "clarification_anchored" : "clarification_reply",
    social_conversation: hasAnchor ? "social_conversation_anchored" : "social_conversation_reply",
  };

  rd.mode = hasAnchor ? "context_hold" : "conversational";
  rd.conversationAct = act;
  rd.allowNewSearch = false;
  rd.allowCommercialFallback = false;
  rd.allowReplaceWinner = false;
  rd.allowRerank = false;
  rd.shouldPreserveAnchor = hasAnchor;
  rd.shouldReturnSessionContext = true;
  rd.responsePathHint = hintByAct[act] || hintByAct.social_conversation;
  rd.reasons.push(reason);
  return true;
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
 *   { turnType, confidence, hasActiveAnchor, isGreeting? }
 * @param {object|null} params.intentRecognition — PATCH 11A: intent recognition contract
 * @param {object|null} params.intentAuthority — PATCH 11A.1: binding intent authority
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
  signals: inputSignals = {},
  cognitiveRoutingSignal = null,
  intentRecognition = null,
  intentAuthority = null,
} = {}) {
  const rd = createEmptyRoutingDecision();
  const signals = suppressCommercialSignalsForAuthority(intentAuthority, inputSignals);
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
  const anchoredComparisonEstablish =
    hasAnchor &&
    !signals.hasClearNewCommercialSearch &&
    !signals.wantsNew &&
    !signals.isExplicitComparison &&
    (
      cognitiveRoutingSignal?.turnType === "COMPARISON" ||
      !!signals.isAnchoredComparisonEstablishing
    );

  // PATCH 8.4B — explicit change precedes comparison_followup when discussion set locked
  if (
    applyExplicitRecommendationChangeRoutingHoldIfEligible(rd, {
      hasAnchor,
      signals,
      userMessage,
      reason: "explicit_recommendation_change_pre_comparison_followup",
    })
  ) {
    return rd;
  }

  // PATCH 8.4D — scoped refocus/attribute follow-up before comparison_followup
  if (
    applyFinalDecisionScopeRoutingHoldIfEligible(rd, {
      hasAnchor,
      signals,
      userMessage,
      sessionContext,
      reason: "final_decision_scope_pre_comparison_followup",
    })
  ) {
    return rd;
  }

  const comparisonFollowUp =
    !!signals.hasComparisonProducts &&
    !signals.hasClearNewCommercialSearch &&
    (!!signals.isComparisonContextFollowUp ||
      !!signals.isComparisonFollowUpLocked ||
      !!signals.looksLikeShortPriorityFollowUp ||
      !!contextResolution.lockedComparisonFollowUp);

  if (anchoredComparisonEstablish && !comparisonFollowUp) {
    rd.mode = "anchored_comparison_hold";
    rd.conversationAct = "anchored_comparison";
    rd.allowNewSearch = false;
    rd.allowCommercialFallback = false;
    rd.allowReplaceWinner = false;
    rd.allowRerank = false;
    rd.shouldPreserveAnchor = true;
    rd.shouldReturnSessionContext = true;
    rd.responsePathHint = "anchored_comparison_establish";
    rd.enforceDiscussionSetQuery = userMessage;
    rd.reasons.push("anchored_comparison_discussion_set_establish");
    return rd;
  }

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

  // PATCH 7.9Z.1 — ANCHORED_SHORT_FOLLOW_UP routing hold (before conversational family holds)
  const anchoredShortFollowUpHold =
    hasAnchor &&
    !decisiveNewEvidence &&
    !signals.wantsNew &&
    !signals.isExplicitComparison &&
    (
      !!signals.isAnchoredShortFollowUp ||
      cognitiveRoutingSignal?.isAnchoredShortFollowUp === true ||
      isAnchoredShortFollowUpQuery(userMessage, { hasActiveAnchor: hasAnchor })
    );

  if (anchoredShortFollowUpHold) {
    rd.mode = "context_hold";
    rd.conversationAct = "contextual_follow_up";
    rd.allowNewSearch = false;
    rd.allowCommercialFallback = false;
    rd.allowReplaceWinner = false;
    rd.allowRerank = false;
    rd.shouldPreserveAnchor = true;
    rd.shouldReturnSessionContext = true;
    rd.responsePathHint = "anchored_contextual_follow_up";
    rd.reasons.push("anchored_short_follow_up_continuity_hold");
    return rd;
  }

  // PATCH 7.8K — CONFIDENCE_CHALLENGE routing hold (before generic cognitive EXPLANATION_REQUEST hold)
  const confidenceChallengeRoutingHold =
    !signals.hasClearNewCommercialSearch &&
    !signals.isExplicitComparison &&
    !signals.wantsNew &&
    !anchoredShortFollowUpHold &&
    (
      cognitiveRoutingSignal?.isConfidenceChallenge === true ||
      (
        (
          cognitiveRoutingSignal?.turnType === "CONVERSATIONAL" ||
          cognitiveRoutingSignal?.turnType === "EXPLANATION_REQUEST"
        ) &&
        isConfidenceChallengeFamilyQuery(userMessage)
      )
    );

  if (confidenceChallengeRoutingHold) {
    rd.mode = hasAnchor ? "context_hold" : "conversational";
    rd.conversationAct = "confidence_challenge";
    rd.allowNewSearch = false;
    rd.allowCommercialFallback = false;
    rd.allowReplaceWinner = false;
    rd.allowRerank = false;
    rd.shouldPreserveAnchor = hasAnchor;
    rd.shouldReturnSessionContext = true;
    rd.responsePathHint = hasAnchor
      ? "confidence_challenge_anchored"
      : "confidence_challenge_reply";
    rd.reasons.push("confidence_challenge_conversational_routing_hold");
    return rd;
  }

  // PATCH 7.8O — SOCIAL_VALIDATION routing hold (before generic cognitive EXPLANATION_REQUEST hold)
  const socialValidationPure =
    cognitiveRoutingSignal?.isSocialValidation === true ||
    (
      (
        cognitiveRoutingSignal?.turnType === "CONVERSATIONAL" ||
        cognitiveRoutingSignal?.turnType === "EXPLANATION_REQUEST"
      ) &&
      isSocialValidationFamilyQuery(userMessage)
    );

  const socialValidationRoutingHold =
    socialValidationPure &&
    !signals.isExplicitComparison &&
    !signals.wantsNew;

  if (socialValidationRoutingHold) {
    rd.mode = hasAnchor ? "context_hold" : "conversational";
    rd.conversationAct = "social_validation";
    rd.allowNewSearch = false;
    rd.allowCommercialFallback = false;
    rd.allowReplaceWinner = false;
    rd.allowRerank = false;
    rd.shouldPreserveAnchor = hasAnchor;
    rd.shouldReturnSessionContext = true;
    rd.responsePathHint = hasAnchor
      ? "social_validation_anchored"
      : "social_validation_reply";
    rd.reasons.push("social_validation_conversational_routing_hold");
    return rd;
  }

  // PATCH 7.9C — SECOND_BEST_DISCOVERY routing hold (before default search / refinement fallthrough)
  const secondBestDiscoveryPure =
    cognitiveRoutingSignal?.isSecondBestDiscovery === true ||
    (
      (
        cognitiveRoutingSignal?.turnType === "CONVERSATIONAL" ||
        cognitiveRoutingSignal?.turnType === "ALTERNATIVE_REQUEST"
      ) &&
      isSecondBestDiscoveryFamilyQuery(userMessage)
    );

  const secondBestDiscoveryRoutingHold =
    secondBestDiscoveryPure &&
    !signals.isExplicitComparison &&
    !signals.wantsNew;

  if (secondBestDiscoveryRoutingHold) {
    rd.mode = hasAnchor ? "context_hold" : "conversational";
    rd.conversationAct = "second_best_discovery";
    rd.allowNewSearch = false;
    rd.allowCommercialFallback = false;
    rd.allowReplaceWinner = false;
    rd.allowRerank = false;
    rd.shouldPreserveAnchor = hasAnchor;
    rd.shouldReturnSessionContext = true;
    rd.responsePathHint = hasAnchor
      ? "second_best_discovery_anchored"
      : "second_best_discovery_reply";
    rd.reasons.push("second_best_discovery_conversational_routing_hold");
    return rd;
  }

  // PATCH 7.9G — ALTERNATIVE_EXPLORATION routing hold (before default search / refinement fallthrough)
  const alternativeExplorationPure =
    cognitiveRoutingSignal?.isAlternativeExploration === true ||
    (
      (
        cognitiveRoutingSignal?.turnType === "CONVERSATIONAL" ||
        cognitiveRoutingSignal?.turnType === "ALTERNATIVE_REQUEST"
      ) &&
      isAlternativeExplorationFamilyQuery(userMessage)
    );

  const alternativeExplorationRoutingHold =
    alternativeExplorationPure &&
    !signals.isExplicitComparison &&
    !signals.wantsNew;

  if (alternativeExplorationRoutingHold) {
    rd.mode = hasAnchor ? "context_hold" : "conversational";
    rd.conversationAct = "alternative_exploration";
    rd.allowNewSearch = false;
    rd.allowCommercialFallback = false;
    rd.allowReplaceWinner = false;
    rd.allowRerank = false;
    rd.shouldPreserveAnchor = hasAnchor;
    rd.shouldReturnSessionContext = true;
    rd.responsePathHint = hasAnchor
      ? "alternative_exploration_anchored"
      : "alternative_exploration_reply";
    rd.reasons.push("alternative_exploration_conversational_routing_hold");
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

  // PATCH 8.4C — post-change recovery before generic contradiction hold
  if (
    applyPostChangeRecoveryRoutingHoldIfEligible(rd, {
      hasAnchor,
      signals,
      userMessage,
      sessionContext,
      reason: "post_change_recovery_routing_hold_pre_comprehension",
    })
  ) {
    return rd;
  }

  // PATCH 8.3F — CONVERSATIONAL_CONFUSION before comprehension intercept
  if (
    applyContradictionRecoveryRoutingHoldIfEligible(rd, {
      hasAnchor,
      signals,
      cognitiveRoutingSignal,
      userMessage,
      reason: "contradiction_recovery_routing_hold_pre_comprehension",
    })
  ) {
    return rd;
  }

  // PATCH 8.3G — EXPLANATION_BREAKDOWN before generic comprehension intercept
  if (
    applyUserConfusionRecoveryRoutingHoldIfEligible(rd, {
      hasAnchor,
      signals,
      cognitiveRoutingSignal,
      userMessage,
      reason: "user_confusion_recovery_routing_hold_pre_comprehension",
    })
  ) {
    return rd;
  }

  // PATCH 7.9X-H.3 — COMPREHENSION_FAILURE before cognitive_explanation_anchored intercept
  if (
    applyComprehensionRoutingHoldIfEligible(rd, {
      hasAnchor,
      signals,
      cognitiveRoutingSignal,
      userMessage,
      reason: "comprehension_routing_hold_authority_pre_cognitive_explanation",
    })
  ) {
    return rd;
  }

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

  // PATCH 7.9X-D.2 — ANTI_REGRET before context_question/decision bridge intercept
  if (
    applyAntiRegretRoutingHoldIfEligible(rd, {
      hasAnchor,
      signals,
      cognitiveRoutingSignal,
      userMessage,
      reason: "anti_regret_routing_hold_authority_pre_decision",
    })
  ) {
    return rd;
  }

  // PATCH 8.3E — DECISION_CONTEXT_CHANGE with authorized winner replacement
  if (
    applyExplicitRecommendationChangeRoutingHoldIfEligible(rd, {
      hasAnchor,
      signals,
      userMessage,
      reason: "explicit_recommendation_change_pre_constraint_hold",
    })
  ) {
    return rd;
  }

  // PATCH 7.9K — CONSTRAINT_CHANGE before context_question / refinement / new_search
  if (
    applyConstraintChangeRoutingHoldIfEligible(rd, {
      hasAnchor,
      signals,
      cognitiveRoutingSignal,
      userMessage,
      reason: "constraint_change_routing_hold_authority_pre_decision",
    })
  ) {
    return rd;
  }

  // PATCH 7.9X-G.2 — SOFT_DISAGREEMENT before context_question / decision_context intercept
  if (
    applySoftDisagreementRoutingHoldIfEligible(rd, {
      hasAnchor,
      signals,
      cognitiveRoutingSignal,
      userMessage,
      reason: "soft_disagreement_routing_hold_authority_pre_decision",
    })
  ) {
    return rd;
  }

  // PATCH 7.9Z.3 — explicit new search beats bridge context_decision intercept
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
    rd.reasons.push("clear_new_commercial_search_authority_pre_context_decision");
    return rd;
  }

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

  // PATCH 7.6U-G — Anchored short delegation must not fall through to default search.
  if (
    hasAnchor &&
    isAnchoredDelegationChoiceRequest(userMessage) &&
    !signals.isExplicitComparison
  ) {
    rd.mode = "context_decision";
    rd.conversationAct = "anchored_delegation_choice";
    rd.allowNewSearch = false;
    rd.allowCommercialFallback = false;
    rd.allowReplaceWinner = false;
    rd.allowRerank = false;
    rd.shouldPreserveAnchor = true;
    rd.shouldReturnSessionContext = true;
    rd.responsePathHint = "decision_context";
    rd.reasons.push("anchored_delegation_choice_routing_guard");
    return rd;
  }

  // PATCH 8.0A — ABOUT_MIA routing hold (família institucional pura)
  const aboutMiaRoutingHold =
    !signals.hasClearNewCommercialSearch &&
    !signals.isExplicitComparison &&
    !signals.wantsNew &&
    (
      cognitiveRoutingSignal?.isAboutMia === true ||
      cognitiveRoutingSignal?.turnType === "ABOUT_MIA" ||
      isAboutMiaFamilyQuery(userMessage, { hasActiveAnchor: hasAnchor })
    );

  if (aboutMiaRoutingHold) {
    rd.mode = "conversational";
    rd.conversationAct = "about_mia";
    rd.allowNewSearch = false;
    rd.allowCommercialFallback = false;
    rd.allowReplaceWinner = false;
    rd.allowRerank = false;
    rd.shouldPreserveAnchor = hasAnchor;
    rd.shouldReturnSessionContext = true;
    rd.responsePathHint = hasAnchor ? "about_mia_anchored" : "about_mia_reply";
    rd.reasons.push("about_mia_institutional_routing_hold");
    return rd;
  }

  // PATCH 7.7C — GREETING routing hold (família pura, sem intenção comercial)
  const greetingRoutingHold =
    !signals.hasClearNewCommercialSearch &&
    !signals.isExplicitComparison &&
    !signals.wantsNew &&
    (
      cognitiveRoutingSignal?.isGreeting === true ||
      isGreetingFamilyQuery(userMessage)
    );

  if (greetingRoutingHold) {
    rd.mode = "conversational";
    rd.conversationAct = "greeting";
    rd.allowNewSearch = false;
    rd.allowCommercialFallback = false;
    rd.allowReplaceWinner = false;
    rd.allowRerank = false;
    rd.shouldPreserveAnchor = hasAnchor;
    rd.shouldReturnSessionContext = true;
    rd.responsePathHint = hasAnchor ? "greeting_anchored" : "greeting_open";
    rd.reasons.push("greeting_conversational_routing_hold");
    return rd;
  }

  // PATCH 8.1B.2 — COMPREHENSION hold before ACK (success must not fall to acknowledgement_flow)
  if (
    applyComprehensionRoutingHoldIfEligible(rd, {
      hasAnchor,
      signals,
      cognitiveRoutingSignal,
      userMessage,
      reason: "comprehension_conversational_routing_hold",
    })
  ) {
    return rd;
  }

  // PATCH 7.7F — ACKNOWLEDGEMENT routing hold (família pura, sem intenção comercial)
  const acknowledgementRoutingHold =
    !signals.hasClearNewCommercialSearch &&
    !signals.isExplicitComparison &&
    !signals.wantsNew &&
    !cognitiveRoutingSignal?.isComprehensionSuccess &&
    !isComprehensionSuccessFamilyQuery(userMessage) &&
    (
      cognitiveRoutingSignal?.isAcknowledgement === true ||
      isAcknowledgementFamilyQuery(userMessage) ||
      (
        cognitiveRoutingSignal?.turnType === "REACTION" &&
        isAcknowledgementFamilyQuery(userMessage)
      )
    );

  if (acknowledgementRoutingHold) {
    rd.mode = hasAnchor ? "context_hold" : "conversational";
    rd.conversationAct = "acknowledgement";
    rd.allowNewSearch = false;
    rd.allowCommercialFallback = false;
    rd.allowReplaceWinner = false;
    rd.allowRerank = false;
    rd.shouldPreserveAnchor = hasAnchor;
    rd.shouldReturnSessionContext = true;
    rd.responsePathHint = hasAnchor ? "acknowledgement_anchored" : "acknowledgement_reply";
    rd.reasons.push("acknowledgement_conversational_routing_hold");
    return rd;
  }

  // PATCH 7.7L — COMPREHENSION fallback hold (cold / non-explanation paths)
  if (
    applyComprehensionRoutingHoldIfEligible(rd, {
      hasAnchor,
      signals,
      cognitiveRoutingSignal,
      userMessage,
    })
  ) {
    return rd;
  }

  // PATCH 7.7P / 7.9X-G.2 — SOFT_DISAGREEMENT fallback hold (cold / non-decision paths)
  if (
    applySoftDisagreementRoutingHoldIfEligible(rd, {
      hasAnchor,
      signals,
      cognitiveRoutingSignal,
      userMessage,
    })
  ) {
    return rd;
  }

  // PATCH 7.8C — DECISION_CONFIRMATION routing hold (família pura, sem intenção comercial)
  const decisionConfirmationRoutingHold =
    !signals.hasClearNewCommercialSearch &&
    !signals.isExplicitComparison &&
    !signals.wantsNew &&
    (
      cognitiveRoutingSignal?.isDecisionConfirmation === true ||
      (
        (
          cognitiveRoutingSignal?.turnType === "CONVERSATIONAL" ||
          cognitiveRoutingSignal?.turnType === "FOLLOW_UP"
        ) &&
        isDecisionConfirmationFamilyQuery(userMessage)
      )
    );

  if (decisionConfirmationRoutingHold) {
    rd.mode = hasAnchor ? "context_hold" : "conversational";
    rd.conversationAct = "decision_confirmation";
    rd.allowNewSearch = false;
    rd.allowCommercialFallback = false;
    rd.allowReplaceWinner = false;
    rd.allowRerank = false;
    rd.shouldPreserveAnchor = hasAnchor;
    rd.shouldReturnSessionContext = true;
    rd.responsePathHint = hasAnchor
      ? "decision_confirmation_anchored"
      : "decision_confirmation_reply";
    rd.reasons.push("decision_confirmation_conversational_routing_hold");
    return rd;
  }

  // PATCH 11A.1 — authoritative non-commercial hold precedes commercial search promotion
  if (
    applyIntentAuthorityRoutingHoldIfEligible(rd, {
      hasAnchor,
      intentAuthority,
    })
  ) {
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

  // PATCH 11A — social/emotional/clarification hold before default product search
  if (
    applyIntentRecognitionRoutingHoldIfEligible(rd, {
      hasAnchor,
      signals,
      intentRecognition,
      intentAuthority,
    })
  ) {
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
