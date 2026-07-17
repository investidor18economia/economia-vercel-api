/**
 * PATCH 11A.9 — Explicit functional response path catalog
 *
 * Every production-emitted functional path must appear here.
 * Prefix matching is diagnostic-only (fail-closed), not authorization.
 */

export const RESPONSE_PATH_CATALOG_VERSION = "11A.9.1";

export function createSocialFlowPathConfig(overrides = {}) {
  return {
    runtimeClass: "functional",
    category: "social",
    functionalConversationResponse: true,
    responsePathRegistryMode: "explicit",
    requiresIntentAuthority: true,
    requiresCommercialDeny: true,
    behaviorContractRequired: true,
    finalizerRequired: true,
    stateTransitionRequired: true,
    providersAllowed: false,
    winnerAllowed: false,
    cardsAllowed: false,
    pricesAllowed: false,
    allowedEarlyReturn: true,
    ...overrides,
  };
}

export function createClarificationPathConfig(overrides = {}) {
  return {
    runtimeClass: "functional",
    category: "clarification",
    functionalConversationResponse: true,
    responsePathRegistryMode: "explicit",
    requiresIntentAuthority: true,
    stateTransitionRequired: true,
    providersAllowed: false,
    winnerAllowed: false,
    cardsAllowed: false,
    pricesAllowed: false,
    allowedEarlyReturn: true,
    ...overrides,
  };
}

export function createCommercialPathConfig(overrides = {}) {
  return {
    runtimeClass: "functional",
    category: "commercial",
    functionalConversationResponse: true,
    responsePathRegistryMode: "explicit",
    requiresIntentAuthority: true,
    requiresFinalRouting: true,
    commercialGateRequired: true,
    stateTransitionRequired: true,
    providersAllowed: true,
    winnerAllowed: true,
    cardsAllowed: true,
    pricesAllowed: true,
    allowedEarlyReturn: true,
    ...overrides,
  };
}

export function createComparisonPathConfig(overrides = {}) {
  return createCommercialPathConfig({
    comparisonContractRequired: true,
    ...overrides,
  });
}

export function createFallbackPathConfig(overrides = {}) {
  return {
    runtimeClass: "functional",
    category: "fallback",
    functionalConversationResponse: true,
    responsePathRegistryMode: "explicit",
    requiresIntentAuthority: false,
    stateTransitionRequired: true,
    providersAllowed: false,
    winnerAllowed: false,
    cardsAllowed: false,
    pricesAllowed: false,
    allowedEarlyReturn: true,
    ...overrides,
  };
}

const SOCIAL_FLOW_PATHS = [
  "non_commercial_identity",
  "non_commercial_greeting",
  "non_commercial_acknowledgement",
  "about_mia_flow",
  "social_conversation_flow",
  "emotional_support_flow",
  "clarification_flow",
  "greeting_flow",
  "comprehension_flow",
  "acknowledgement_flow",
  "soft_disagreement_flow",
  "decision_confirmation_flow",
  "anti_regret_flow",
  "confidence_challenge_flow",
  "social_validation_flow",
  "second_best_discovery_flow",
  "alternative_exploration_flow",
  "constraint_change_flow",
  "farewell_flow",
  "contradiction_recovery_reorganize",
  "user_confusion_recovery_simplify",
  "post_change_recovery_reorganize",
  "legacy_social_flow",
  "non_commercial_authority_fast_branch",
  "social_governed",
];

const CLARIFICATION_PATHS = [
  "needs_clarification",
  "comparison_flow_crash_guard",
  "contract_anchored_hold",
  "commercial_resolution_incomplete",
  "general_answer",
  "legitimate_search_reset_awaiting_query",
  "anchored_reaction_hold",
];

const COMMERCIAL_PATHS = [
  "final_decision_scope_reply",
  "explicit_recommendation_change_reply",
  "comparison_anchored_establish",
  "comparison_followup_forced",
  "comparison_followup_locked",
  "comparison_followup",
  "legacy_llm_comparison",
  "context_decision_no_search",
  "comparison_early_not_found",
  "comparison_early_explicit",
  "commercial_only_fallback",
  "priority_followup_short",
];

function buildCatalogEntries() {
  const entries = {};

  for (const path of SOCIAL_FLOW_PATHS) {
    entries[path] = createSocialFlowPathConfig();
  }

  for (const path of CLARIFICATION_PATHS) {
    entries[path] = createClarificationPathConfig(
      path === "comparison_flow_crash_guard"
        ? { comparisonContractRequired: true }
        : {}
    );
  }

  for (const path of COMMERCIAL_PATHS) {
    entries[path] = path.startsWith("comparison")
      ? createComparisonPathConfig()
      : path === "commercial_only_fallback"
        ? createCommercialPathConfig({
            providersAllowed: false,
            winnerAllowed: false,
            cardsAllowed: false,
            pricesAllowed: false,
          })
        : createCommercialPathConfig();
  }

  return entries;
}

export const EXPLICIT_CATALOG_PATH_ENTRIES = Object.freeze(buildCatalogEntries());

export const EMITTED_FUNCTIONAL_RESPONSE_PATHS = Object.freeze([
  ...SOCIAL_FLOW_PATHS,
  ...CLARIFICATION_PATHS,
  ...COMMERCIAL_PATHS,
  "governed_social_intent_flow",
  "comparison_same_product_clarification",
  "comparison_anchored_incomplete",
  "return_seguro",
  "cso_verbalizer_early",
  "context_direct_reply_early",
  "contract_violation_governed_fallback",
  "non_commercial_governed_fallback",
  "image_identification_failed",
  "image_search_error",
  "image_search_no_offers",
  "image_search_success",
  "search_guidance",
  "commercial_new_search_no_result",
  "commercial_provider_unavailable",
  "impossible_purchase",
  "commercial_weak_purchase_range",
  "legacy_llm_search",
  "commercial_success",
  "comparison_success",
  "specific_product_result",
  "commercial_continuation",
]);

export function isExplicitCatalogPath(responsePath = "") {
  const path = String(responsePath || "").trim().toLowerCase();
  return !!EXPLICIT_CATALOG_PATH_ENTRIES[path];
}
