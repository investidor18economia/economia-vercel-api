/**
 * PATCH 11A.7 — Continuity & Semantic State Governance
 *
 * Governed read/write over multi-turn semantic session state.
 * Continuity preserves context — it never creates intent.
 *
 * DOC 11A-GOV compliant:
 * Intent Recognition decides current intent; state only informs eligibility.
 */

import {
  MIA_INTERACTION_MODES,
  detectActiveCommercialAsk,
} from "./miaIntentRecognitionLayer.js";
import { resolveMixedContinuationEligibility } from "./miaMixedVerbalization.js";
import { hasClearNewCommercialSearchIntent } from "./miaRoutingSafety.js";
import {
  isCommercialFollowUpContinuationSignal,
  detectTopicSwitch,
} from "./miaCommercialFollowUpContinuity.js";

export const SEMANTIC_STATE_GOVERNANCE_VERSION = "11A.7";

const COMMERCIAL_CONTINUATION_PATTERN =
  /\b(vale mais(?:\s+a\s+pena)?|qual vale mais|qual [eé] melhor|s[oó] me diz|compara|compare|melhor op[cç][ãa]o|qual deles|qual desses|entre os dois|entre esses|mais barato|runner.?up|segundo lugar|e a c[aâ]mera|e o pre[cç]o|quanto custa|qto custa|qual o pre[cç]o|e quanto|e o valor|segunda op[cç][ãa]o|segundo colocado|plano b|e bateria|e c[aâ]mera|por que esse|vale a pena|qual dos dois|onde encontro|onde comprar)\b/i;

const COMPARISON_REFERENCE_PATTERN =
  /\b(compara|compare|versus|\bvs\b|qual deles|qual dos dois|qual tem|melhor|c[aâ]mera|bateria|pre[cç]o|segundo|primeiro|eixo|tradeoff)\b/i;

const FAREWELL_PATTERN =
  /\b(tchau|ate logo|até logo|ate mais|até mais|falou|flw|fui|vou nessa|boa noite|vou dormir)\b/i;

const NON_COMMERCIAL_MODES = new Set([
  MIA_INTERACTION_MODES.SOCIAL,
  MIA_INTERACTION_MODES.EMOTIONAL_SUPPORT,
  MIA_INTERACTION_MODES.CLARIFICATION,
  MIA_INTERACTION_MODES.IDENTITY,
  MIA_INTERACTION_MODES.SAFETY,
]);

const TRANSITION_TYPES = Object.freeze({
  PRESERVE: "preserve",
  SOCIAL_GOVERNED: "social_governed",
  COMMERCIAL_PIPELINE: "commercial_pipeline",
  COMPARISON_PIPELINE: "comparison_pipeline",
  MIXED_FINALIZE: "mixed_finalize",
  CONTEXT_DECISION: "context_decision",
  NEW_SEARCH: "new_search",
  POST_PURCHASE: "post_purchase",
  FAREWELL: "farewell",
  SESSION_RESET: "session_reset",
  INVALIDATE_COMMERCIAL: "invalidate_commercial",
});

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasProductName(product) {
  return !!String(product?.product_name || "").trim();
}

function normalizeProductList(list = []) {
  if (!Array.isArray(list)) return [];
  return list.filter((item) => hasProductName(item));
}

function resolveComparisonProducts(sessionContext = {}) {
  const locked = !!sessionContext.comparisonContextLocked;
  const comparisonProducts = normalizeProductList(sessionContext.lastComparisonProducts);
  if (comparisonProducts.length >= 2) {
    return { products: comparisonProducts, locked, source: "lastComparisonProducts" };
  }
  if (locked && comparisonProducts.length >= 1) {
    return { products: comparisonProducts, locked, source: "lastComparisonProducts_partial" };
  }
  return { products: [], locked: false, source: "none" };
}

function readProvenance(sessionContext = {}) {
  const existing = sessionContext.semanticStateProvenance || {};
  return {
    version: existing.version || null,
    turnIndex: Number.isFinite(existing.turnIndex) ? existing.turnIndex : 0,
    commercialAnchor: existing.commercialAnchor || null,
    comparison: existing.comparison || null,
    mixed: existing.mixed || null,
    conversational: existing.conversational || null,
    lastTransition: existing.lastTransition || null,
  };
}

function isPostPurchaseRecognition(intentRecognition = {}) {
  return (
    !!intentRecognition?.socialFamilies?.postPurchaseAck ||
    (intentRecognition?.primaryIntent === "acknowledgement" &&
      /\b(comprei|compramos|fechei|peguei|deu certo)\b/i.test(
        normalizeText(intentRecognition?.rawMessage || "")
      ))
  );
}

function isFarewellMessage(message = "") {
  return FAREWELL_PATTERN.test(normalizeText(message));
}

function hasComparisonReference(message = "") {
  return COMPARISON_REFERENCE_PATTERN.test(normalizeText(message));
}

function hasCommercialContinuationSignal(message = "") {
  return (
    detectActiveCommercialAsk(message) ||
    COMMERCIAL_CONTINUATION_PATTERN.test(normalizeText(message)) ||
    isCommercialFollowUpContinuationSignal(message)
  );
}

function inferCommercialAnchorValidity(sessionContext = {}, options = {}) {
  const anchor = hasProductName(sessionContext.lastBestProduct)
    ? sessionContext.lastBestProduct
    : null;
  if (!anchor) {
    const ranking = normalizeProductList(sessionContext.lastRankingSnapshot);
    if (ranking.length >= 1 && (options.commercialFollowUpReuse || options.allowCompletedDecisionReuse)) {
      return { valid: true, reason: "ranking_snapshot_anchor" };
    }
    return { valid: false, reason: "missing_anchor" };
  }
  if (
    sessionContext.decisionCompleted &&
    !options.allowCompletedDecisionReuse &&
    !options.commercialFollowUpReuse
  ) {
    return { valid: false, reason: "decision_completed" };
  }
  if (sessionContext.commercialAnchorInvalidated) {
    return { valid: false, reason: "invalidated" };
  }
  return { valid: true, reason: "anchor_present" };
}

function inferComparisonValidity(sessionContext = {}, message = "") {
  const { products, locked } = resolveComparisonProducts(sessionContext);
  if (products.length >= 2) {
    return {
      valid: true,
      reason: locked ? "locked_comparison" : "comparison_products",
      products,
      locked,
    };
  }
  if (locked && products.length >= 1 && hasComparisonReference(message)) {
    return { valid: true, reason: "locked_partial_with_reference", products, locked };
  }
  return { valid: false, reason: "insufficient_products", products, locked };
}

function inferMixedValidity(sessionContext = {}, intentRecognition = {}) {
  const mixedState = sessionContext.mixedConversationalState || {};
  const hasMixedHistory =
    !!mixedState.lastMixedFinalizeApplied ||
    !!mixedState.humanAcknowledgementSatisfied ||
    !!mixedState.lastDualCompletionPassed;
  const currentMixed =
    intentRecognition?.interactionMode === MIA_INTERACTION_MODES.MIXED;
  if (!hasMixedHistory && !currentMixed) {
    return { valid: false, reason: "no_mixed_history" };
  }
  if (sessionContext.mixedStateInvalidated) {
    return { valid: false, reason: "invalidated" };
  }
  return {
    valid: true,
    reason: currentMixed ? "current_mixed_turn" : "mixed_history",
    humanAcknowledgementSatisfied: !!mixedState.humanAcknowledgementSatisfied,
    commercialContinuationExpected: !!mixedState.commercialContinuationExpected,
  };
}

export function normalizeSemanticSessionState(sessionContext = {}, options = {}) {
  const message = options.message || "";
  const commercialFollowUpReuse =
    options.commercialFollowUpReuse ||
    isCommercialFollowUpContinuationSignal(message);
  const topicSwitch = detectTopicSwitch(message);
  const provenance = readProvenance(sessionContext);
  const commercialAnchorCheck = inferCommercialAnchorValidity(sessionContext, {
    ...options,
    commercialFollowUpReuse,
  });
  const comparisonResolved = resolveComparisonProducts(sessionContext);
  const comparisonCheck = inferComparisonValidity(sessionContext, options.message || "");

  const commercial = {
    anchor: commercialAnchorCheck.valid ? sessionContext.lastBestProduct : null,
    lastProducts: normalizeProductList(sessionContext.lastProducts),
    lastRankingSnapshot: Array.isArray(sessionContext.lastRankingSnapshot)
      ? sessionContext.lastRankingSnapshot
      : [],
    lastCommercialQuery:
      sessionContext.lastQuery ||
      sessionContext.commercialSearchQuery ||
      sessionContext.lastCommercialQuery ||
      "",
    lastCategory: sessionContext.lastCategory || "",
    lastPriority: sessionContext.lastPriority || "",
    lastAxis: sessionContext.lastContextualAxis || sessionContext.lastAxis || "",
    decisionCompleted: !!sessionContext.decisionCompleted,
    valid: commercialAnchorCheck.valid,
    invalidReason: commercialAnchorCheck.valid ? null : commercialAnchorCheck.reason,
  };

  const comparison = {
    products: comparisonCheck.products,
    locked: comparisonCheck.locked,
    axis: sessionContext.lastContextualAxis || sessionContext.lastPriority || "",
    valid: comparisonCheck.valid,
    invalidReason: comparisonCheck.valid ? null : comparisonCheck.reason,
    source: comparisonResolved.source,
  };

  const mixedState = sessionContext.mixedConversationalState || {};
  const mixedCheck = inferMixedValidity(sessionContext, options.intentRecognition || {});

  const mixed = {
    active: mixedCheck.valid,
    humanObjective:
      options.intentRecognition?.humanObjective ||
      sessionContext.lastHumanObjective ||
      null,
    commercialObjective:
      options.intentRecognition?.commercialObjective ||
      sessionContext.lastCommercialObjective ||
      null,
    humanAcknowledgementSatisfied: !!mixedState.humanAcknowledgementSatisfied,
    commercialContinuationExpected:
      !!mixedState.commercialContinuationExpected ||
      !!mixedCheck.commercialContinuationExpected,
    valid: mixedCheck.valid,
    invalidReason: mixedCheck.valid ? null : mixedCheck.reason,
  };

  const conversational = {
    lastConversationalIntent: sessionContext.lastConversationalIntent || null,
    lastInteractionType: sessionContext.lastInteractionType || "",
    lastIntent: sessionContext.lastIntent || "",
    valid: !!(
      sessionContext.lastConversationalIntent ||
      sessionContext.lastInteractionType ||
      sessionContext.lastIntent
    ),
  };

  return {
    version: SEMANTIC_STATE_GOVERNANCE_VERSION,
    commercial,
    comparison,
    mixed,
    conversational,
    provenance,
    validity: {
      commercialAnchorValid: commercial.valid,
      comparisonValid: comparison.valid,
      mixedValid: mixed.valid,
      conversationalValid: conversational.valid,
    },
    legacy: sessionContext,
  };
}

export function resolveSemanticContinuationEligibility({
  message = "",
  intentRecognition = null,
  intentAuthority = null,
  normalizedState = null,
  mixedSegmentationApplied = false,
  signals = {},
} = {}) {
  const state =
    normalizedState ||
    normalizeSemanticSessionState({}, { message, intentRecognition });
  const currentMode = intentRecognition?.interactionMode || "";
  const currentPrimary = intentRecognition?.primaryIntent || "";
  const reasonCodes = [];
  const stateUsed = [];
  const stateIgnored = [];

  const commercialAnchorPresent = !!state.commercial?.anchor?.product_name;
  const commercialAnchorValid = !!state.validity?.commercialAnchorValid;
  const comparisonValid = !!state.validity?.comparisonValid;
  const mixedStateValid = !!state.validity?.mixedValid;

  if (commercialAnchorValid) stateUsed.push("commercial.anchor");
  else if (commercialAnchorPresent) stateIgnored.push("commercial.anchor_stale");

  if (comparisonValid) stateUsed.push("comparison.products");
  else if (state.comparison?.products?.length) stateIgnored.push("comparison.products_stale");

  if (mixedStateValid) stateUsed.push("mixed.state");
  else if (state.mixed?.active) stateIgnored.push("mixed.state_stale");

  const postPurchase = isPostPurchaseRecognition(intentRecognition);
  const farewell = isFarewellMessage(message);
  const newSearchExplicit =
    !!signals.hasClearNewCommercialSearch ||
    hasClearNewCommercialSearchIntent(message, {
      hasActiveAnchor: commercialAnchorPresent,
    });

  const currentCommercialAsk = hasCommercialContinuationSignal(message);
  const currentComparisonRef = hasComparisonReference(message);

  let commercialContinuationEligible = false;
  let comparisonContinuationEligible = false;
  let mixedContinuationEligible = false;
  let socialContinuityEligible = false;
  let commercialExecutionFromContinuation = false;

  if (currentMode === MIA_INTERACTION_MODES.SAFETY) {
    reasonCodes.push("safety_blocks_continuation");
    return buildContinuationResult({
      eligible: false,
      continuationType: "none",
      commercialContinuationEligible,
      comparisonContinuationEligible,
      mixedContinuationEligible,
      socialContinuityEligible,
      commercialExecutionFromContinuation,
      commercialAnchorPresent,
      commercialAnchorValid,
      anchorPreserved: commercialAnchorPresent,
      anchorExecuted: false,
      stateUsed,
      stateIgnored,
      reasonCodes,
      postPurchase,
      decisionCompleted: !!state.commercial?.decisionCompleted,
    });
  }

  if (postPurchase) {
    reasonCodes.push("post_purchase_acknowledgement");
    return buildContinuationResult({
      eligible: false,
      continuationType: "social",
      commercialContinuationEligible: false,
      comparisonContinuationEligible: false,
      mixedContinuationEligible: false,
      socialContinuityEligible: true,
      commercialExecutionFromContinuation: false,
      commercialAnchorPresent,
      commercialAnchorValid,
      anchorPreserved: commercialAnchorPresent,
      anchorExecuted: false,
      stateUsed,
      stateIgnored,
      reasonCodes,
      postPurchase: true,
      decisionCompleted: true,
    });
  }

  if (farewell) {
    reasonCodes.push("farewell_closes_execution");
    return buildContinuationResult({
      eligible: false,
      continuationType: "social",
      socialContinuityEligible: true,
      commercialAnchorPresent,
      commercialAnchorValid,
      anchorPreserved: commercialAnchorPresent,
      anchorExecuted: false,
      stateUsed,
      stateIgnored,
      reasonCodes,
      postPurchase: false,
      decisionCompleted: !!state.commercial?.decisionCompleted,
    });
  }

  if (detectTopicSwitch(message)) {
    reasonCodes.push("topic_switch_suspends_commercial_continuation");
    return buildContinuationResult({
      eligible: false,
      continuationType: "social",
      socialContinuityEligible: true,
      commercialContinuationEligible: false,
      commercialExecutionFromContinuation: false,
      commercialAnchorPresent,
      commercialAnchorValid: false,
      anchorPreserved: commercialAnchorPresent,
      anchorExecuted: false,
      stateUsed,
      stateIgnored: [...stateIgnored, "commercial.anchor_topic_switch"],
      reasonCodes,
      postPurchase: false,
      decisionCompleted: !!state.commercial?.decisionCompleted,
    });
  }

  if (newSearchExplicit) {
    reasonCodes.push("explicit_new_search_invalidates_previous_anchor_authority");
    stateIgnored.push("commercial.anchor");
    return buildContinuationResult({
      eligible: true,
      continuationType: "commercial",
      commercialContinuationEligible: true,
      commercialExecutionFromContinuation: true,
      commercialAnchorPresent,
      commercialAnchorValid: false,
      anchorPreserved: false,
      anchorExecuted: true,
      stateUsed,
      stateIgnored,
      reasonCodes,
      postPurchase: false,
      decisionCompleted: false,
    });
  }

  const legacyMixedContinuation = resolveMixedContinuationEligibility({
    interactionMode: currentMode,
    message,
    sessionContext: state.legacy,
    mixedSegmentationApplied,
  });

  if (
    commercialAnchorValid &&
    currentCommercialAsk &&
    !postPurchase &&
    !farewell
  ) {
    commercialContinuationEligible = true;
    commercialExecutionFromContinuation = true;
    reasonCodes.push("valid_anchor_with_current_commercial_ask");
    if (
      mixedStateValid ||
      legacyMixedContinuation ||
      currentMode === MIA_INTERACTION_MODES.MIXED ||
      mixedSegmentationApplied
    ) {
      mixedContinuationEligible = true;
      reasonCodes.push("mixed_or_history_with_commercial_ask");
    }
  }

  if (currentMode === MIA_INTERACTION_MODES.MIXED || mixedSegmentationApplied) {
    mixedContinuationEligible = true;
    commercialContinuationEligible = true;
    commercialExecutionFromContinuation = true;
    reasonCodes.push("current_mixed_turn");
  }

  if (
    legacyMixedContinuation &&
    commercialAnchorValid &&
    currentCommercialAsk &&
    !commercialExecutionFromContinuation
  ) {
    mixedContinuationEligible = true;
    commercialContinuationEligible = true;
    commercialExecutionFromContinuation = true;
    reasonCodes.push("mixed_continuation_with_valid_anchor");
  } else if (legacyMixedContinuation && NON_COMMERCIAL_MODES.has(currentMode)) {
    reasonCodes.push("current_non_commercial_mode_preserves_anchor_only");
  }

  if (
    comparisonValid &&
    currentComparisonRef &&
    (currentMode === MIA_INTERACTION_MODES.COMMERCE ||
      currentMode === MIA_INTERACTION_MODES.MIXED ||
      commercialExecutionFromContinuation)
  ) {
    comparisonContinuationEligible = true;
    commercialContinuationEligible = true;
    commercialExecutionFromContinuation = true;
    reasonCodes.push("comparison_continuation");
  }

  if (
    currentMode === MIA_INTERACTION_MODES.COMMERCE &&
    commercialAnchorValid &&
    currentCommercialAsk &&
    !commercialExecutionFromContinuation
  ) {
    commercialContinuationEligible = true;
    commercialExecutionFromContinuation = true;
    reasonCodes.push("commercial_mode_with_anchor_and_ask");
  }

  if (
    NON_COMMERCIAL_MODES.has(currentMode) &&
    !commercialExecutionFromContinuation
  ) {
    socialContinuityEligible = !!state.conversational?.valid;
    reasonCodes.push("current_intent_overrides_state_execution");
    return buildContinuationResult({
      eligible: socialContinuityEligible,
      continuationType: "social",
      commercialContinuationEligible: false,
      comparisonContinuationEligible: false,
      mixedContinuationEligible: false,
      socialContinuityEligible,
      commercialExecutionFromContinuation: false,
      commercialAnchorPresent,
      commercialAnchorValid,
      anchorPreserved: commercialAnchorPresent,
      anchorExecuted: false,
      stateUsed,
      stateIgnored,
      reasonCodes,
      postPurchase: false,
      decisionCompleted: !!state.commercial?.decisionCompleted,
    });
  }

  const continuationType = mixedContinuationEligible
    ? "mixed"
    : comparisonContinuationEligible
      ? "comparison"
      : commercialContinuationEligible
        ? "commercial"
        : socialContinuityEligible
          ? "social"
          : "none";

  return buildContinuationResult({
    eligible:
      commercialContinuationEligible ||
      mixedContinuationEligible ||
      comparisonContinuationEligible ||
      socialContinuityEligible,
    continuationType,
    commercialContinuationEligible,
    comparisonContinuationEligible,
    mixedContinuationEligible,
    socialContinuityEligible,
    commercialExecutionFromContinuation,
    commercialAnchorPresent,
    commercialAnchorValid,
    anchorPreserved: commercialAnchorPresent,
    anchorExecuted: commercialExecutionFromContinuation,
    stateUsed,
    stateIgnored,
    reasonCodes,
    postPurchase: false,
    decisionCompleted: !!state.commercial?.decisionCompleted,
    intentAuthorityCommercialPermission: intentAuthority?.commercialPermission || null,
  });
}

function buildContinuationResult(fields = {}) {
  return {
    eligible: !!fields.eligible,
    continuationType: fields.continuationType || "none",
    commercialContinuationEligible: !!fields.commercialContinuationEligible,
    comparisonContinuationEligible: !!fields.comparisonContinuationEligible,
    mixedContinuationEligible: !!fields.mixedContinuationEligible,
    socialContinuityEligible: !!fields.socialContinuityEligible,
    commercialExecutionFromContinuation: !!fields.commercialExecutionFromContinuation,
    commercialAnchorPresent: !!fields.commercialAnchorPresent,
    commercialAnchorValid: !!fields.commercialAnchorValid,
    anchorPreserved: !!fields.anchorPreserved,
    anchorExecuted: !!fields.anchorExecuted,
    mixedStateValid: !!fields.mixedStateValid,
    postPurchase: !!fields.postPurchase,
    decisionCompleted: !!fields.decisionCompleted,
    stateUsed: Array.isArray(fields.stateUsed) ? fields.stateUsed : [],
    stateIgnored: Array.isArray(fields.stateIgnored) ? fields.stateIgnored : [],
    reasonCodes: Array.isArray(fields.reasonCodes) ? fields.reasonCodes : [],
    intentAuthorityCommercialPermission:
      fields.intentAuthorityCommercialPermission || null,
  };
}

function resolveTransitionType({
  responsePath = "",
  intentRecognition = null,
  continuationEligibility = null,
  prices = [],
  invalidations = [],
} = {}) {
  if (invalidations.includes("session_reset")) return TRANSITION_TYPES.SESSION_RESET;
  if (invalidations.includes("new_search")) return TRANSITION_TYPES.NEW_SEARCH;
  if (invalidations.includes("post_purchase")) return TRANSITION_TYPES.POST_PURCHASE;
  if (invalidations.includes("farewell")) return TRANSITION_TYPES.FAREWELL;
  if (invalidations.includes("invalidate_commercial")) {
    return TRANSITION_TYPES.INVALIDATE_COMMERCIAL;
  }
  const comparisonPath = String(responsePath || "");
  const blockedComparisonPipelinePaths = new Set([
    "comparison_anchored_incomplete",
    "comparison_same_product_clarification",
  ]);
  if (
    comparisonPath.includes("comparison") &&
    !blockedComparisonPipelinePaths.has(comparisonPath)
  ) {
    return TRANSITION_TYPES.COMPARISON_PIPELINE;
  }
  if (String(responsePath || "").includes("mixed") || continuationEligibility?.mixedContinuationEligible) {
    return TRANSITION_TYPES.MIXED_FINALIZE;
  }
  if (String(responsePath || "").includes("context_decision")) {
    return TRANSITION_TYPES.CONTEXT_DECISION;
  }
  if (
    Array.isArray(prices) &&
    prices.length &&
    (intentRecognition?.interactionMode === MIA_INTERACTION_MODES.COMMERCE ||
      intentRecognition?.interactionMode === MIA_INTERACTION_MODES.MIXED)
  ) {
    return TRANSITION_TYPES.COMMERCIAL_PIPELINE;
  }
  if (NON_COMMERCIAL_MODES.has(intentRecognition?.interactionMode)) {
    return TRANSITION_TYPES.SOCIAL_GOVERNED;
  }
  return TRANSITION_TYPES.PRESERVE;
}

export function applySemanticStateTransition({
  sessionContext = {},
  normalizedBefore = null,
  transition = {},
  intentRecognition = null,
  intentAuthority = null,
  responsePath = "",
  prices = [],
  continuationEligibility = null,
  turnIndex = null,
} = {}) {
  const before =
    normalizedBefore ||
    normalizeSemanticSessionState(sessionContext, { intentRecognition });
  const next = { ...(sessionContext || {}) };
  const invalidations = Array.isArray(transition.invalidations)
    ? [...transition.invalidations]
    : [];
  const reasonCodes = Array.isArray(transition.reasonCodes)
    ? [...transition.reasonCodes]
    : [];

  const transitionType =
    transition.type ||
    resolveTransitionType({
      responsePath,
      intentRecognition,
      continuationEligibility,
      prices,
      invalidations,
    });

  if (isPostPurchaseRecognition(intentRecognition)) {
    invalidations.push("post_purchase");
    next.decisionCompleted = true;
    next.commercialAnchorInvalidated = false;
    reasonCodes.push("decision_completed_post_purchase");
  }

  if (transitionType === TRANSITION_TYPES.NEW_SEARCH) {
    invalidations.push("new_search");
    next.commercialAnchorInvalidated = true;
    next.comparisonContextLocked = false;
    next.lastComparisonProducts = [];
    reasonCodes.push("previous_anchor_authority_reduced");
  }

  if (transitionType === TRANSITION_TYPES.FAREWELL) {
    invalidations.push("farewell");
    reasonCodes.push("farewell_preserves_history_only");
  }

  if (transitionType === TRANSITION_TYPES.SOCIAL_GOVERNED) {
    reasonCodes.push("social_transition_preserves_commercial_history");
  }

  if (transitionType === TRANSITION_TYPES.COMPARISON_PIPELINE) {
    const comparisonProducts = normalizeProductList(next.lastComparisonProducts);
    if (comparisonProducts.length >= 2) {
      next.comparisonContextLocked = true;
    }
  }

  if (transitionType === TRANSITION_TYPES.MIXED_FINALIZE) {
    next.mixedConversationalState = {
      ...(next.mixedConversationalState || {}),
      commercialContinuationExpected: !!continuationEligibility?.commercialContinuationEligible,
    };
  }

  if (intentRecognition?.humanObjective) {
    next.lastHumanObjective = intentRecognition.humanObjective;
  }
  if (intentRecognition?.commercialObjective) {
    next.lastCommercialObjective = intentRecognition.commercialObjective;
  }
  if (intentRecognition?.interactionMode) {
    next.lastInteractionMode = intentRecognition.interactionMode;
  }

  const provenanceTurn =
    turnIndex != null
      ? turnIndex
      : (before.provenance?.turnIndex || 0) + 1;

  next.semanticStateProvenance = {
    version: SEMANTIC_STATE_GOVERNANCE_VERSION,
    turnIndex: provenanceTurn,
    lastTransition: {
      type: transitionType,
      responsePath,
      authority: intentAuthority?.source || "intent_authority",
      reasonCodes,
      invalidations,
    },
    commercialAnchor: next.lastBestProduct?.product_name
      ? {
          source: transitionType,
          responsePath,
          authority:
            transitionType === TRANSITION_TYPES.COMMERCIAL_PIPELINE ||
            transitionType === TRANSITION_TYPES.COMPARISON_PIPELINE
              ? "validated_commercial_pipeline"
              : "preserved",
          productName: next.lastBestProduct.product_name,
          invalidated: !!next.commercialAnchorInvalidated,
        }
      : before.provenance?.commercialAnchor || null,
    comparison: next.lastComparisonProducts?.length
      ? {
          source: "comparison_pipeline",
          responsePath,
          count: next.lastComparisonProducts.length,
          locked: !!next.comparisonContextLocked,
        }
      : before.provenance?.comparison || null,
    mixed: next.mixedConversationalState
      ? {
          source: transitionType,
          responsePath,
          humanAcknowledgementSatisfied:
            !!next.mixedConversationalState.humanAcknowledgementSatisfied,
        }
      : before.provenance?.mixed || null,
    conversational: {
      lastInteractionType: next.lastInteractionType || null,
      lastConversationalIntent: next.lastConversationalIntent || null,
      responsePath,
    },
  };

  const normalizedAfter = normalizeSemanticSessionState(next, {
    intentRecognition,
    message: transition.message || "",
  });

  return {
    sessionContext: next,
    normalizedAfter,
    transitionAudit: {
      type: transitionType,
      invalidations,
      reasonCodes,
      preserved: {
        anchor: !!next.lastBestProduct?.product_name,
        comparison: Array.isArray(next.lastComparisonProducts)
          ? next.lastComparisonProducts.length
          : 0,
        mixed: !!next.mixedConversationalState,
      },
    },
  };
}

export function semanticStateGovernanceToTrace({
  normalizedBefore = null,
  normalizedAfter = null,
  continuationEligibility = null,
  transitionAudit = null,
} = {}) {
  return {
    version: SEMANTIC_STATE_GOVERNANCE_VERSION,
    semanticStateBefore: normalizedBefore
      ? {
          commercialAnchorValid: normalizedBefore.validity?.commercialAnchorValid,
          comparisonValid: normalizedBefore.validity?.comparisonValid,
          mixedValid: normalizedBefore.validity?.mixedValid,
        }
      : null,
    semanticStateAfter: normalizedAfter
      ? {
          commercialAnchorValid: normalizedAfter.validity?.commercialAnchorValid,
          comparisonValid: normalizedAfter.validity?.comparisonValid,
          mixedValid: normalizedAfter.validity?.mixedValid,
        }
      : null,
    continuationEligibility: continuationEligibility
      ? {
          eligible: continuationEligibility.eligible,
          continuationType: continuationEligibility.continuationType,
          commercialContinuationEligible:
            continuationEligibility.commercialContinuationEligible,
          mixedContinuationEligible: continuationEligibility.mixedContinuationEligible,
          comparisonContinuationEligible:
            continuationEligibility.comparisonContinuationEligible,
          commercialAnchorPresent: continuationEligibility.commercialAnchorPresent,
          anchorPreserved: continuationEligibility.anchorPreserved,
          anchorExecuted: continuationEligibility.anchorExecuted,
          stateUsed: continuationEligibility.stateUsed,
          stateIgnored: continuationEligibility.stateIgnored,
          reasonCodes: continuationEligibility.reasonCodes,
        }
      : null,
    stateTransition: transitionAudit || null,
  };
}

export { TRANSITION_TYPES };
