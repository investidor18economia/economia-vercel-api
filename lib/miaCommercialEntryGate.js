/**
 * PATCH 11A.2 — Commercial Entry Gate
 *
 * Binding execution gate: when intent authority denies commerce,
 * no provider, ranking, winner or card pipeline may run.
 */

import {
  COMMERCIAL_PERMISSION,
  INTENT_AUTHORITY_SOURCE,
} from "./miaIntentAuthority.js";

export const COMMERCIAL_ENTRY_GATE_VERSION = "11A.2";

export const COMMERCIAL_BLOCKED_STAGES = Object.freeze([
  "commercial_search",
  "provider_fetch",
  "legacy_serpapi",
  "commercial_runtime",
  "commercial_runtime_shadow",
  "mercadolivre_public",
  "apify_mercadolivre",
  "google_shopping",
  "ranking",
  "winner_selection",
  "card_build",
  "offer_enrichment",
  "data_layer_search",
]);

export function createCommercialEntryGateTracker() {
  const state = {
    providerCallCountBefore: 0,
    providerCallCountAfter: 0,
    commercialBranchEntered: false,
    commercialRuntimeEntered: false,
    legacySearchEntered: false,
    rankingEntered: false,
    winnerCreated: false,
    cardsCreated: 0,
    blockedStages: [],
    providerCallsPrevented: 0,
    gateMs: 0,
  };

  return {
    state,
    recordProviderCall(stage = "provider_fetch") {
      state.providerCallCountAfter += 1;
      state.commercialBranchEntered = true;
      if (stage.includes("runtime")) state.commercialRuntimeEntered = true;
      if (stage.includes("legacy") || stage.includes("serp")) state.legacySearchEntered = true;
      if (stage.includes("ranking")) state.rankingEntered = true;
      if (stage.includes("winner")) state.winnerCreated = true;
      if (stage.includes("card")) state.cardsCreated += 1;
    },
    recordBlocked(stage = "commercial_search") {
      if (!state.blockedStages.includes(stage)) {
        state.blockedStages.push(stage);
      }
      state.providerCallsPrevented += 1;
    },
    toTrace() {
      return {
        ...state,
        providerCallDelta: state.providerCallCountAfter - state.providerCallCountBefore,
      };
    },
  };
}

export function evaluateCommercialEntryPermission({
  authority = null,
  routingDecision = null,
  intent = "",
  tracker = null,
} = {}) {
  const started = Date.now();
  const commercialPermission =
    authority?.commercialPermission ||
    (authority?.authoritative ? COMMERCIAL_PERMISSION.DENY : null);

  if (authority?.authoritative && commercialPermission === COMMERCIAL_PERMISSION.DENY) {
    const result = {
      allowed: false,
      commercialEntryAllowed: false,
      reasonCode: "intent_authority_commercial_deny",
      authoritySource: authority.source || INTENT_AUTHORITY_SOURCE,
      commercialPermission: COMMERCIAL_PERMISSION.DENY,
      blockedStages: [...COMMERCIAL_BLOCKED_STAGES],
      intentAuthorityVersion: authority.version || null,
      gateVersion: COMMERCIAL_ENTRY_GATE_VERSION,
    };
    if (tracker) {
      for (const stage of COMMERCIAL_BLOCKED_STAGES) {
        tracker.recordBlocked(stage);
      }
      tracker.state.gateMs = Date.now() - started;
    }
    return result;
  }

  if (
    authority?.authoritative &&
    commercialPermission === COMMERCIAL_PERMISSION.MIXED
  ) {
    const result = {
      allowed: true,
      commercialEntryAllowed: true,
      reasonCode: "intent_authority_mixed_commercial_allowed",
      authoritySource: authority.source || INTENT_AUTHORITY_SOURCE,
      commercialPermission: COMMERCIAL_PERMISSION.MIXED,
      blockedStages: [],
      gateVersion: COMMERCIAL_ENTRY_GATE_VERSION,
    };
    if (tracker) tracker.state.gateMs = Date.now() - started;
    return result;
  }

  const routingAllowsCommercial =
    routingDecision?.allowNewSearch === true ||
    routingDecision?.mode === "new_search" ||
    routingDecision?.mode === "search" ||
    routingDecision?.mode === "comparison_search" ||
    intent === "search" ||
    intent === "comparison";

  const result = {
    allowed: routingAllowsCommercial || commercialPermission === COMMERCIAL_PERMISSION.ALLOW,
    commercialEntryAllowed:
      commercialPermission !== COMMERCIAL_PERMISSION.DENY &&
      (commercialPermission === COMMERCIAL_PERMISSION.ALLOW ||
        commercialPermission === COMMERCIAL_PERMISSION.MIXED ||
        routingAllowsCommercial),
    reasonCode: routingAllowsCommercial
      ? "routing_commercial_allowed"
      : "routing_non_commercial",
    authoritySource: authority?.source || null,
    commercialPermission: commercialPermission || COMMERCIAL_PERMISSION.ALLOW,
    blockedStages: [],
    gateVersion: COMMERCIAL_ENTRY_GATE_VERSION,
  };

  if (tracker) tracker.state.gateMs = Date.now() - started;
  return result;
}

export function assertCommercialPipelineAllowed(
  entryResult = {},
  stage = "commercial_search",
  { strict = false, tracker = null } = {}
) {
  if (entryResult?.allowed === false || entryResult?.commercialEntryAllowed === false) {
    if (tracker) tracker.recordBlocked(stage);
    if (entryResult.blockedStages && !entryResult.blockedStages.includes(stage)) {
      entryResult.blockedStages.push(stage);
    }
    if (strict) {
      throw new Error(`Commercial pipeline blocked at ${stage}: ${entryResult.reasonCode}`);
    }
    return false;
  }
  return true;
}

export function buildPreservedNonCommercialSessionContext({
  sessionContext = {},
  incomingSessionContext = {},
  hasAnchor = false,
} = {}) {
  const source = hasAnchor
    ? { ...incomingSessionContext, ...sessionContext }
    : { ...incomingSessionContext };

  return {
    ...source,
    lastBestProduct: source.lastBestProduct ?? null,
    lastProducts: Array.isArray(source.lastProducts) ? [...source.lastProducts] : [],
    lastComparisonProducts: Array.isArray(source.lastComparisonProducts)
      ? [...source.lastComparisonProducts]
      : source.lastComparisonProducts,
    comparisonContextLocked: !!source.comparisonContextLocked,
  };
}

export function resolveNonCommercialFlowFromAuthority(authority = null) {
  const intent =
    authority?.legacyIntentOverride ||
    authority?.primaryIntent ||
    "social_conversation";

  const roleByIntent = {
    greeting: "greeting_reply",
    acknowledgement: "acknowledgement_reply",
    social_conversation: "social_conversation_reply",
    emotional_support: "emotional_support_reply",
    clarification: "clarification_reply",
    about_mia: "about_mia_reply",
    social_validation: "social_validation_reply",
    comprehension: "comprehension_reply",
  };

  const sourceByIntent = {
    greeting: "greeting_flow",
    acknowledgement: "acknowledgement_flow",
    social_conversation: "social_conversation_flow",
    emotional_support: "emotional_support_flow",
    clarification: "clarification_flow",
    about_mia: "about_mia_flow",
    social_validation: "social_validation_flow",
    comprehension: "comprehension_flow",
  };

  return {
    intent,
    role: roleByIntent[intent] || "social_conversation_reply",
    source: sourceByIntent[intent] || "non_commercial_authority_fast_branch",
  };
}

export function commercialEntryGateToTrace(entryResult = null, tracker = null) {
  if (!entryResult) return null;
  return {
    allowed: entryResult.allowed,
    commercialEntryAllowed: entryResult.commercialEntryAllowed,
    reasonCode: entryResult.reasonCode,
    commercialPermission: entryResult.commercialPermission,
    blockedStages: entryResult.blockedStages,
    tracker: tracker?.toTrace?.() || null,
    gateVersion: entryResult.gateVersion,
  };
}

export function assertNonCommercialExecutionInvariants(
  {
    entryResult = null,
    tracker = null,
    routingDecision = null,
    prices = null,
    sessionOut = null,
    sessionBefore = null,
  } = {},
  { strict = false } = {}
) {
  const divergences = [];

  if (entryResult?.commercialEntryAllowed === false || entryResult?.allowed === false) {
    const trace = tracker?.toTrace?.() || {};
    if ((trace.providerCallDelta || 0) > 0) {
      divergences.push({ field: "providerCallDelta", issue: "must_be_zero" });
    }
    if (trace.commercialBranchEntered) {
      divergences.push({ field: "commercialBranchEntered", issue: "must_be_false" });
    }
    if (trace.rankingEntered) {
      divergences.push({ field: "rankingEntered", issue: "must_be_false" });
    }
    if (trace.winnerCreated) {
      divergences.push({ field: "winnerCreated", issue: "must_be_false" });
    }
    if ((trace.cardsCreated || 0) > 0) {
      divergences.push({ field: "cardsCreated", issue: "must_be_zero" });
    }
    if (routingDecision?.allowNewSearch === true) {
      divergences.push({ field: "allowNewSearch", issue: "must_be_false_on_deny" });
    }
    if (Array.isArray(prices) && prices.length > 0) {
      divergences.push({ field: "prices", issue: "must_be_empty" });
    }
    if (sessionBefore?.lastBestProduct?.product_name && sessionOut) {
      const before = sessionBefore.lastBestProduct.product_name;
      const after = sessionOut.lastBestProduct?.product_name;
      if (after && before !== after) {
        divergences.push({ field: "anchor", issue: "anchor_must_be_preserved" });
      }
    }
  }

  const result = { ok: divergences.length === 0, divergences };
  if (strict && !result.ok) {
    throw new Error(
      `Non-commercial execution invariant failed: ${divergences.map((d) => d.field).join(", ")}`
    );
  }
  return result;
}
