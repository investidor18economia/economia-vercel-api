/**
 * PATCH 11A.1 — Intent Recognition Authority Enforcement
 *
 * Transforms recognizeMiaIntent() output into a binding authority contract
 * that downstream routing, context resolution and legacy heuristics must obey.
 *
 * MIA owns the intelligence. The LLM only verbalizes.
 */

import {
  MIA_INTERACTION_MODES,
  detectActiveCommercialAsk,
  detectConversationalEntityMentionFrame,
  isNonCommercialInteractionMode,
  shouldBypassDefaultProductSearch,
} from "./miaIntentRecognitionLayer.js";

export const INTENT_AUTHORITY_SOURCE = "mia_intent_recognition";
export const INTENT_AUTHORITY_VERSION = "11A.2";

export const COMMERCIAL_PERMISSION = Object.freeze({
  DENY: "deny",
  ALLOW: "allow",
  MIXED: "mixed",
});

const COMMERCIAL_INTENTS = new Set([
  "search",
  "comparison",
  "refinement",
  "decision",
  "context_analysis",
  "new_search",
]);

/**
 * Fail-closed commercial permission resolution (PATCH 11A.2).
 */
export function resolveCommercialPermissionFromRecognition(recognition = null) {
  if (!recognition) {
    return COMMERCIAL_PERMISSION.ALLOW;
  }

  const interactionMode = recognition.interactionMode || MIA_INTERACTION_MODES.COMMERCE;
  const message = recognition.resolvedQuery || "";
  const activeCommercialAsk = detectActiveCommercialAsk(message);
  const conversationalEntityOnly =
    detectConversationalEntityMentionFrame(message) && !activeCommercialAsk;
  const families = recognition.socialFamilies || {};
  const reasonCodes = Array.isArray(recognition.reasons) ? recognition.reasons : [];
  const primaryIntent = recognition.primaryIntent || "";

  if (interactionMode === MIA_INTERACTION_MODES.SAFETY) {
    return null;
  }

  if (conversationalEntityOnly) {
    return COMMERCIAL_PERMISSION.DENY;
  }

  if (
    families.postPurchaseAck ||
    reasonCodes.includes("post_purchase_acknowledgement") ||
    (primaryIntent === "acknowledgement" && !activeCommercialAsk)
  ) {
    return COMMERCIAL_PERMISSION.DENY;
  }

  if (activeCommercialAsk) {
    if (interactionMode === MIA_INTERACTION_MODES.MIXED) {
      return COMMERCIAL_PERMISSION.MIXED;
    }
    return COMMERCIAL_PERMISSION.ALLOW;
  }

  if (interactionMode === MIA_INTERACTION_MODES.MIXED) {
    return activeCommercialAsk ||
      recognition.commercialIntent === true ||
      recognition.commercialRelevance >= 0.35
      ? COMMERCIAL_PERMISSION.MIXED
      : COMMERCIAL_PERMISSION.DENY;
  }

  if (
    interactionMode === MIA_INTERACTION_MODES.COMMERCE &&
    (activeCommercialAsk ||
      recognition.commercialIntent === true ||
      recognition.commercialRelevance >= 0.35)
  ) {
    return COMMERCIAL_PERMISSION.ALLOW;
  }

  if (
    isNonCommercialInteractionMode(interactionMode) ||
    shouldBypassDefaultProductSearch(recognition)
  ) {
    if (activeCommercialAsk && recognition.commercialIntent === true) {
      return COMMERCIAL_PERMISSION.ALLOW;
    }
    return COMMERCIAL_PERMISSION.DENY;
  }

  if (activeCommercialAsk || recognition.commercialIntent === true) {
    return COMMERCIAL_PERMISSION.ALLOW;
  }

  return COMMERCIAL_PERMISSION.DENY;
}

/**
 * Build authoritative contract from intent recognition output.
 *
 * @param {object|null} recognition
 * @param {{ hasActiveAnchor?: boolean }} [options]
 * @returns {object|null}
 */
export function buildIntentAuthorityFromRecognition(
  recognition = null,
  { hasActiveAnchor = false } = {}
) {
  if (!recognition) return null;

  const interactionMode = recognition.interactionMode || MIA_INTERACTION_MODES.COMMERCE;

  if (interactionMode === MIA_INTERACTION_MODES.SAFETY) {
    return null;
  }

  const commercialPermission = resolveCommercialPermissionFromRecognition(recognition);

  if (commercialPermission == null) {
    return null;
  }

  const legacyIntentOverride =
    commercialPermission === COMMERCIAL_PERMISSION.DENY
      ? recognition.legacyIntentOverride || recognition.primaryIntent || "social_conversation"
      : recognition.legacyIntentOverride || null;

  return {
    source: INTENT_AUTHORITY_SOURCE,
    authoritative: true,
    shadowOnly: false,
    interactionMode,
    primaryIntent: recognition.primaryIntent || null,
    secondaryIntent: recognition.secondaryIntent || null,
    legacyIntentOverride,
    humanObjective: recognition.humanObjective || null,
    commercialPermission,
    preserveCommerceContext: !!recognition.preserveCommerceContext,
    preserveUntil: "response_branch_selected",
    confidence: recognition.confidence ?? null,
    reasonCodes: Array.isArray(recognition.reasons) ? [...recognition.reasons] : [],
    version: INTENT_AUTHORITY_VERSION,
    hasActiveAnchor,
  };
}

/**
 * Normalize routing signals when commercial permission is denied.
 */
export function suppressCommercialSignalsForAuthority(authority = null, signals = {}) {
  if (!authority?.authoritative || authority.commercialPermission !== COMMERCIAL_PERMISSION.DENY) {
    return { ...signals };
  }

  return {
    ...signals,
    hasClearNewCommercialSearch: false,
    isExplicitComparison: false,
    explicitProductOnlyQuery: false,
    wantsNew: false,
    newCategoryInOriginalMessage: false,
    newBudgetInOriginalMessage: false,
    isAnchoredComparisonEstablishing: false,
  };
}

/**
 * Apply authority to handler-visible intent/context before legacy overrides.
 */
export function applyIntentAuthorityToPipeline({
  authority = null,
  intent = "",
  contextAction = "",
  contextResolution = {},
  query = "",
} = {}) {
  const result = {
    intent,
    contextAction,
    contextResolutionPatch: null,
    divergences: [],
  };

  if (!authority?.authoritative) {
    return result;
  }

  if (authority.commercialPermission === COMMERCIAL_PERMISSION.DENY) {
    const mappedIntent = authority.legacyIntentOverride || authority.primaryIntent || "social_conversation";

    if (intent !== mappedIntent) {
      result.divergences.push({
        field: "intent",
        proposed: intent,
        preserved: mappedIntent,
        reason: "intent_authority_non_commercial",
      });
    }

    result.intent = mappedIntent;
    result.contextAction = "conversation";

    result.contextResolutionPatch = {
      directReply: null,
      clearContext: false,
      shouldSkipProductSearch: true,
      needsClarification: false,
    };

    const mappedMode =
      mappedIntent === "greeting"
        ? "greeting"
        : mappedIntent === "about_mia"
          ? "about_mia"
          : mappedIntent === "acknowledgement"
            ? "acknowledgement"
            : mappedIntent === "emotional_support"
              ? "emotional_support"
              : mappedIntent === "clarification"
                ? "clarification"
                : "social_conversation";

    if (
      !contextResolution?.mode ||
      contextResolution.mode === "general_answer" ||
      contextResolution.mode === "direct" ||
      contextResolution.mode === "new_or_direct"
    ) {
      result.contextResolutionPatch.mode = mappedMode;
    }

    // Never treat the raw human utterance as a commercial standalone query.
    result.contextResolutionPatch.standaloneQuery = query;
  } else if (authority.commercialPermission === COMMERCIAL_PERMISSION.MIXED) {
    if (authority.legacyIntentOverride && intent === "general_answer") {
      result.intent = authority.legacyIntentOverride;
    }
    result.contextAction = contextAction || "conversation";
  }

  return result;
}

/**
 * Block cognitive bridge from overriding authoritative non-commercial intent.
 */
/**
 * Reject legacy intent patches (e.g. production fallback) that would override authority.
 */
export function shouldRejectIntentPatch(authority = null, proposedIntent = "") {
  if (!authority?.authoritative || authority.commercialPermission !== COMMERCIAL_PERMISSION.DENY) {
    return false;
  }
  return COMMERCIAL_INTENTS.has(proposedIntent);
}

export function shouldBlockLegacyIntentOverride(authority = null, bridgeResult = null) {
  if (!authority?.authoritative || !bridgeResult?.active) {
    return false;
  }

  if (authority.commercialPermission !== COMMERCIAL_PERMISSION.DENY) {
    return false;
  }

  const proposed = bridgeResult.intent || "";
  return COMMERCIAL_INTENTS.has(proposed);
}

/**
 * Enforce routing decision invariants against authority (fail-closed correction).
 */
export function enforceRoutingDecisionAgainstAuthority(
  routingDecision = {},
  authority = null,
  { hasAnchor = false } = {}
) {
  if (!authority?.authoritative || !routingDecision) {
    return { routingDecision, applied: false, divergences: [] };
  }

  const rd = { ...routingDecision };
  const divergences = [];
  let applied = false;

  if (authority.commercialPermission === COMMERCIAL_PERMISSION.DENY) {
    if (rd.allowNewSearch !== false) {
      divergences.push({ field: "allowNewSearch", proposed: rd.allowNewSearch, preserved: false });
      rd.allowNewSearch = false;
      applied = true;
    }
    if (rd.allowRerank !== false) {
      divergences.push({ field: "allowRerank", proposed: rd.allowRerank, preserved: false });
      rd.allowRerank = false;
      applied = true;
    }
    if (rd.allowReplaceWinner !== false) {
      divergences.push({ field: "allowReplaceWinner", proposed: rd.allowReplaceWinner, preserved: false });
      rd.allowReplaceWinner = false;
      applied = true;
    }
    if (rd.allowCommercialFallback !== false) {
      rd.allowCommercialFallback = false;
      applied = true;
    }
    if (rd.mode === "new_search" || rd.mode === "search" || rd.mode === "comparison_search") {
      divergences.push({ field: "mode", proposed: rd.mode, preserved: "conversational" });
      rd.mode = hasAnchor ? "context_hold" : "conversational";
      applied = true;
    }
    if (rd.responsePathHint === "new_commercial_search" || rd.responsePathHint === "default_product_search") {
      rd.responsePathHint = hasAnchor ? "social_conversation_anchored" : "social_conversation_reply";
      applied = true;
    }
    rd.shouldPreserveAnchor = hasAnchor ? true : rd.shouldPreserveAnchor;
    rd.shouldReturnSessionContext = true;
    if (!rd.conversationAct || rd.conversationAct === "explicit_new_search" || rd.conversationAct === "search") {
      rd.conversationAct = authority.primaryIntent || "social_conversation";
      applied = true;
    }
    if (applied) {
      rd.reasons = [...(rd.reasons || []), "intent_authority_enforcement_11A1"];
    }
  } else if (authority.commercialPermission === COMMERCIAL_PERMISSION.MIXED) {
    if (rd.mode === "search" && !rd.allowNewSearch) {
      rd.mode = "mixed_intent_hold";
      rd.conversationAct = "mixed_intent";
      applied = true;
    }
  }

  return { routingDecision: rd, applied, divergences };
}

/**
 * Build cognitiveAuthority trace object for pipeline/debug (non-null when authoritative).
 */
export function buildCognitiveAuthorityFromIntentAuthority(authority = null) {
  if (!authority?.authoritative) return null;

  return {
    applied: true,
    source: authority.source,
    scope: "INTENT_RECOGNITION_AUTHORITY",
    interactionMode: authority.interactionMode,
    commercialPermission: authority.commercialPermission,
    primaryIntent: authority.primaryIntent,
    legacyIntentOverride: authority.legacyIntentOverride,
    shadowOnly: false,
    authoritative: true,
    reason: "intent_recognition_authority_11A1",
    version: authority.version,
    reasonCodes: authority.reasonCodes,
    confidence: authority.confidence,
  };
}

/**
 * Validate authority consistency — throws in strict mode (tests).
 */
export function assertIntentAuthorityConsistency(
  {
    authority = null,
    intent = "",
    routingDecision = null,
    cognitiveAuthority = null,
  } = {},
  { strict = false } = {}
) {
  const divergences = [];

  if (authority?.authoritative) {
    if (cognitiveAuthority == null) {
      divergences.push({ field: "cognitiveAuthority", issue: "expected_non_null" });
    }
    if (authority.shadowOnly === true) {
      divergences.push({ field: "authority.shadowOnly", issue: "must_be_false" });
    }

    if (authority.commercialPermission === COMMERCIAL_PERMISSION.DENY) {
      if (intent === "search" || intent === "comparison") {
        divergences.push({ field: "intent", issue: "commercial_intent_on_non_commercial_authority", value: intent });
      }
      if (routingDecision?.allowNewSearch === true) {
        divergences.push({ field: "allowNewSearch", issue: "must_be_false" });
      }
      if (routingDecision?.allowRerank === true) {
        divergences.push({ field: "allowRerank", issue: "must_be_false" });
      }
      if (routingDecision?.mode === "new_search") {
        divergences.push({ field: "routingMode", issue: "must_not_be_new_search", value: routingDecision.mode });
      }
    }
  }

  const result = { ok: divergences.length === 0, divergences };

  if (strict && !result.ok) {
    throw new Error(
      `Intent authority divergence: ${divergences.map((d) => `${d.field}:${d.issue || d.value}`).join(", ")}`
    );
  }

  return result;
}

export function intentAuthorityToTrace(authority = null) {
  if (!authority) return null;
  return {
    source: authority.source,
    authoritative: authority.authoritative,
    shadowOnly: authority.shadowOnly,
    interactionMode: authority.interactionMode,
    primaryIntent: authority.primaryIntent,
    commercialPermission: authority.commercialPermission,
    legacyIntentOverride: authority.legacyIntentOverride,
    confidence: authority.confidence,
    version: authority.version,
    reasonCodes: authority.reasonCodes,
  };
}

export function shouldEarlyExitToGovernedSocialFlow(authority = null) {
  return (
    authority?.authoritative === true &&
    authority.commercialPermission === COMMERCIAL_PERMISSION.DENY
  );
}
