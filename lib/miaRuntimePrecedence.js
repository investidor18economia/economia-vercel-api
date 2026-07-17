/**
 * PATCH 11A.8 / 11A.8A — Runtime Precedence & Early-Return Enforcement
 *
 * Precedence table, response path registry, decision envelope,
 * early-return authorization, technical path contract and
 * commercial degraded governance.
 *
 * MIA owns the intelligence. The LLM only verbalizes.
 */

import { COMMERCIAL_PERMISSION } from "./miaIntentAuthority.js";
import { MIA_INTERACTION_MODES } from "./miaIntentRecognitionLayer.js";

import { EXPLICIT_CATALOG_PATH_ENTRIES } from "./miaResponsePathCatalog.js";

export const RUNTIME_PRECEDENCE_VERSION = "11A.9.1";

export const RUNTIME_CLASSES = Object.freeze({
  TRANSPORT: "transport",
  FUNCTIONAL: "functional",
  DEGRADED: "degraded",
});

export const PRECEDENCE_STAGES = Object.freeze({
  TRANSPORT: "transport",
  SAFETY: "safety",
  INTENT_RECOGNITION: "intent_recognition",
  INTENT_AUTHORITY: "intent_authority",
  SEMANTIC_CONTINUATION: "semantic_continuation",
  ROUTING_AUTHORITY: "routing_authority",
  COMMERCIAL_ENTRY_GATE: "commercial_entry_gate",
  BEHAVIOR_CONTRACT: "behavior_contract",
  FINALIZER: "finalizer",
  SEMANTIC_STATE_TRANSITION: "semantic_state_transition",
  HTTP_RESPONSE: "http_response",
});

const SOCIAL_PATH_PREFIXES = [
  "social_",
  "greeting",
  "farewell",
  "non_commercial_",
  "about_mia",
  "emotional_",
  "acknowledgement",
  "comprehension",
  "soft_disagreement",
  "decision_confirmation",
  "anti_regret",
  "confidence_challenge",
  "social_validation",
  "second_best_discovery",
  "alternative_exploration",
  "constraint_change",
  "governed_social",
  "user_confusion",
  "contradiction_recovery",
  "post_change_recovery",
];

const MIXED_PATH_PREFIXES = ["mixed_", "governed_social_intent_flow"];

const COMMERCIAL_PATH_PREFIXES = [
  "return_seguro",
  "commercial_",
  "context_decision",
  "comparison_anchored_establish",
  "comparison_early",
  "comparison_followup",
  "comparison_final",
  "legacy_llm",
  "first_answer",
  "priority_followup",
  "explicit_recommendation_change",
  "final_decision_scope",
];

const CLARIFICATION_PATH_PREFIXES = [
  "comparison_same_product",
  "comparison_anchored_incomplete",
  "comparison_flow_crash_guard",
  "needs_clarification",
  "commercial_resolution_incomplete",
  "contract_anchored_hold",
];

const COMMERCIAL_DEGRADED_PATH_PREFIXES = [
  "search_guidance",
  "commercial_new_search_no_result",
  "commercial_provider_unavailable",
  "impossible_purchase",
  "commercial_weak_purchase_range",
];

const IMAGE_TRANSPORT_PATHS = new Set([
  "image_identification_failed",
  "image_search_error",
]);

const IMAGE_PRE_COGNITIVE_FUNCTIONAL_PATHS = new Set([
  "image_search_no_offers",
  "image_search_success",
]);

const COMMERCIAL_DEGRADED_REGISTRY_DEFAULTS = Object.freeze({
  runtimeClass: RUNTIME_CLASSES.FUNCTIONAL,
  category: "commercial_degraded",
  functionalConversationResponse: true,
  degradationRequired: true,
  requiresIntentAuthority: true,
  requiresFinalRouting: true,
  commercialGateRequired: true,
  requiresBehaviorContract: false,
  stateTransitionRequired: true,
  semanticStateMutationAllowed: true,
  providersAllowed: true,
  winnerAllowed: false,
  cardsAllowed: false,
  pricesAllowed: false,
  allowedEarlyReturn: true,
});

const PROVIDER_FREE_PATHS = new Set([
  "social_governed",
  "governed_social_intent_flow",
  "non_commercial_identity",
  "non_commercial_greeting",
  "non_commercial_acknowledgement",
  "about_mia_flow",
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
  "social_conversation_flow",
  "emotional_support_flow",
  "clarification_flow",
  "comparison_same_product_clarification",
  "comparison_anchored_incomplete",
  "contradiction_recovery_reorganize",
  "user_confusion_recovery_simplify",
  "post_change_recovery_reorganize",
  "farewell_flow",
  "cso_verbalizer_early",
  "context_direct_reply_early",
  "contract_violation_governed_fallback",
]);

const RESPONSE_PATH_REGISTRY = Object.freeze({
  social_governed: {
    category: "social",
    requiresIntentAuthority: true,
    requiresCommercialDeny: true,
    behaviorContractRequired: true,
    finalizerRequired: true,
    stateTransitionRequired: true,
    validatorRequired: true,
    providersAllowed: false,
    allowedEarlyReturn: true,
  },
  governed_social_intent_flow: {
    category: "social",
    requiresIntentAuthority: true,
    mixedFinalizerRequired: true,
    stateTransitionRequired: true,
    providersAllowed: false,
    allowedEarlyReturn: true,
  },
  comparison_same_product_clarification: {
    category: "clarification",
    requiresIntentAuthority: true,
    comparisonContractRequired: true,
    stateTransitionRequired: true,
    providersAllowed: false,
    allowedEarlyReturn: true,
  },
  comparison_anchored_incomplete: {
    category: "clarification",
    requiresIntentAuthority: true,
    comparisonContractRequired: true,
    stateTransitionRequired: true,
    providersAllowed: false,
    allowedEarlyReturn: true,
  },
  return_seguro: {
    category: "commercial",
    requiresIntentAuthority: true,
    commercialGateRequired: true,
    firstAnswerContractRequired: true,
    stateTransitionRequired: true,
    providersAllowed: true,
    allowedEarlyReturn: true,
  },
  cso_verbalizer_early: {
    category: "cso",
    requiresIntentAuthority: true,
    requiresCommercialDeny: true,
    behaviorContractRequired: true,
    csoResponseAuthorized: true,
    stateTransitionRequired: true,
    providersAllowed: false,
    allowedEarlyReturn: true,
  },
  context_direct_reply_early: {
    category: "clarification",
    requiresIntentAuthority: true,
    mixedFinalizerRequired: true,
    stateTransitionRequired: true,
    providersAllowed: false,
    allowedEarlyReturn: true,
  },
  contract_violation_governed_fallback: {
    category: "fallback",
    requiresIntentAuthority: false,
    stateTransitionRequired: true,
    providersAllowed: false,
    allowedEarlyReturn: true,
  },
  // PATCH 11A.8A — Image transport (pre-cognitive, semantic-state-neutral)
  image_identification_failed: {
    runtimeClass: RUNTIME_CLASSES.TRANSPORT,
    category: "transport",
    functionalConversationResponse: false,
    preCognitive: true,
    requiresIntentAuthority: false,
    requiresFinalRouting: false,
    commercialGateRequired: false,
    requiresBehaviorContract: false,
    stateTransitionRequired: false,
    semanticStateMutationAllowed: false,
    providersAllowed: false,
    winnerAllowed: false,
    cardsAllowed: false,
    pricesAllowed: false,
    allowedEarlyReturn: true,
  },
  image_search_error: {
    runtimeClass: RUNTIME_CLASSES.TRANSPORT,
    category: "transport",
    functionalConversationResponse: false,
    preCognitive: true,
    requiresIntentAuthority: false,
    requiresFinalRouting: false,
    commercialGateRequired: false,
    requiresBehaviorContract: false,
    stateTransitionRequired: false,
    semanticStateMutationAllowed: false,
    providersAllowed: false,
    winnerAllowed: false,
    cardsAllowed: false,
    pricesAllowed: false,
    allowedEarlyReturn: true,
  },
  // PATCH 11A.8A — Image pre-cognitive functional
  image_search_no_offers: {
    runtimeClass: RUNTIME_CLASSES.FUNCTIONAL,
    category: "commercial_degraded",
    functionalConversationResponse: true,
    preCognitive: true,
    degradationRequired: true,
    requiresIntentAuthority: false,
    requiresFinalRouting: false,
    commercialGateRequired: false,
    stateTransitionRequired: false,
    semanticStateMutationAllowed: true,
    providersAllowed: true,
    winnerAllowed: false,
    cardsAllowed: false,
    pricesAllowed: false,
    allowedEarlyReturn: true,
  },
  image_search_success: {
    runtimeClass: RUNTIME_CLASSES.FUNCTIONAL,
    category: "commercial",
    functionalConversationResponse: true,
    preCognitive: true,
    requiresIntentAuthority: false,
    requiresFinalRouting: false,
    commercialGateRequired: false,
    stateTransitionRequired: false,
    semanticStateMutationAllowed: true,
    providersAllowed: true,
    winnerAllowed: true,
    cardsAllowed: true,
    pricesAllowed: true,
    allowedEarlyReturn: true,
  },
  // PATCH 11A.8A — Commercial degraded / no-result paths
  search_guidance: {
    ...COMMERCIAL_DEGRADED_REGISTRY_DEFAULTS,
    providersAllowed: false,
    degradationReasonDefault: "search_guidance",
  },
  commercial_new_search_no_result: {
    ...COMMERCIAL_DEGRADED_REGISTRY_DEFAULTS,
    degradationReasonDefault: "no_result",
  },
  commercial_provider_unavailable: {
    ...COMMERCIAL_DEGRADED_REGISTRY_DEFAULTS,
    degradationReasonDefault: "provider_unavailable",
  },
  impossible_purchase: {
    ...COMMERCIAL_DEGRADED_REGISTRY_DEFAULTS,
    providersAllowed: false,
    degradationReasonDefault: "impossible_purchase",
  },
  commercial_weak_purchase_range: {
    ...COMMERCIAL_DEGRADED_REGISTRY_DEFAULTS,
    winnerAllowed: true,
    cardsAllowed: true,
    pricesAllowed: true,
    degradationReasonDefault: "weak_purchase_range",
  },
  // PATCH 11A.8B — Normal commercial paths (explicit registry)
  legacy_llm_search: {
    runtimeClass: RUNTIME_CLASSES.FUNCTIONAL,
    category: "commercial",
    functionalConversationResponse: true,
    requiresIntentAuthority: true,
    requiresFinalRouting: true,
    commercialGateRequired: true,
    stateTransitionRequired: true,
    providersAllowed: true,
    winnerAllowed: true,
    cardsAllowed: true,
    pricesAllowed: true,
    allowedEarlyReturn: true,
  },
  commercial_success: {
    runtimeClass: RUNTIME_CLASSES.FUNCTIONAL,
    category: "commercial",
    functionalConversationResponse: true,
    requiresIntentAuthority: true,
    requiresFinalRouting: true,
    commercialGateRequired: true,
    stateTransitionRequired: true,
    providersAllowed: true,
    winnerAllowed: true,
    cardsAllowed: true,
    pricesAllowed: true,
    allowedEarlyReturn: true,
  },
  comparison_success: {
    runtimeClass: RUNTIME_CLASSES.FUNCTIONAL,
    category: "commercial",
    functionalConversationResponse: true,
    requiresIntentAuthority: true,
    requiresFinalRouting: true,
    commercialGateRequired: true,
    comparisonContractRequired: true,
    stateTransitionRequired: true,
    providersAllowed: true,
    winnerAllowed: true,
    cardsAllowed: true,
    pricesAllowed: true,
    allowedEarlyReturn: true,
  },
  specific_product_result: {
    runtimeClass: RUNTIME_CLASSES.FUNCTIONAL,
    category: "commercial",
    functionalConversationResponse: true,
    requiresIntentAuthority: true,
    requiresFinalRouting: true,
    commercialGateRequired: true,
    stateTransitionRequired: true,
    providersAllowed: true,
    winnerAllowed: true,
    cardsAllowed: true,
    pricesAllowed: true,
    allowedEarlyReturn: true,
  },
  commercial_continuation: {
    runtimeClass: RUNTIME_CLASSES.FUNCTIONAL,
    category: "commercial",
    functionalConversationResponse: true,
    requiresIntentAuthority: true,
    requiresFinalRouting: true,
    commercialGateRequired: true,
    stateTransitionRequired: true,
    providersAllowed: true,
    winnerAllowed: true,
    cardsAllowed: true,
    pricesAllowed: true,
    allowedEarlyReturn: true,
  },
  non_commercial_governed_fallback: {
    runtimeClass: RUNTIME_CLASSES.FUNCTIONAL,
    category: "fallback",
    functionalConversationResponse: true,
    responsePathRegistryMode: "explicit",
    requiresIntentAuthority: true,
    requiresCommercialDeny: true,
    commercialGateRequired: false,
    stateTransitionRequired: true,
    providersAllowed: false,
    winnerAllowed: false,
    cardsAllowed: false,
    pricesAllowed: false,
    allowedEarlyReturn: true,
  },
  ...EXPLICIT_CATALOG_PATH_ENTRIES,
});

function normalizePath(value = "") {
  return String(value || "").trim().toLowerCase();
}

function pathMatchesPrefix(path = "", prefixes = []) {
  const normalized = normalizePath(path);
  return prefixes.some((prefix) => normalized.includes(prefix));
}

function buildPrefixDiagnosticRegistry(path = "", prefixCategory = "") {
  return {
    category: "prefix_diagnostic",
    registryKey: path,
    prefixFallbackUsed: true,
    prefixDiagnosticCategory: prefixCategory,
    failClosed: true,
    explicitRegistryRequired: true,
    requiresIntentAuthority: true,
    stateTransitionRequired: true,
    providersAllowed: false,
    allowedEarlyReturn: false,
  };
}

export function resolveResponsePathRegistry(responsePath = "") {
  const path = normalizePath(responsePath);
  if (!path) {
    return {
      category: "unknown",
      requiresIntentAuthority: true,
      stateTransitionRequired: true,
      providersAllowed: false,
      allowedEarlyReturn: true,
    };
  }

  if (RESPONSE_PATH_REGISTRY[path]) {
    return { ...RESPONSE_PATH_REGISTRY[path], registryKey: path };
  }

  if (PROVIDER_FREE_PATHS.has(path)) {
    return {
      category: "social",
      registryKey: path,
      requiresIntentAuthority: true,
      requiresCommercialDeny: true,
      behaviorContractRequired: true,
      finalizerRequired: true,
      stateTransitionRequired: true,
      providersAllowed: false,
      allowedEarlyReturn: true,
    };
  }

  if (pathMatchesPrefix(path, CLARIFICATION_PATH_PREFIXES)) {
    return buildPrefixDiagnosticRegistry(path, "clarification");
  }

  if (pathMatchesPrefix(path, COMMERCIAL_DEGRADED_PATH_PREFIXES)) {
    return buildPrefixDiagnosticRegistry(path, "commercial_degraded");
  }

  if (pathMatchesPrefix(path, MIXED_PATH_PREFIXES)) {
    return buildPrefixDiagnosticRegistry(path, "mixed");
  }

  if (pathMatchesPrefix(path, COMMERCIAL_PATH_PREFIXES)) {
    return buildPrefixDiagnosticRegistry(path, "commercial");
  }

  if (pathMatchesPrefix(path, SOCIAL_PATH_PREFIXES)) {
    return buildPrefixDiagnosticRegistry(path, "social");
  }

  return {
    category: "unknown",
    registryKey: path,
    runtimeClass: RUNTIME_CLASSES.FUNCTIONAL,
    requiresIntentAuthority: true,
    stateTransitionRequired: true,
    providersAllowed: false,
    allowedEarlyReturn: false,
    failClosed: true,
  };
}

export function listExplicitResponsePathRegistryKeys() {
  return Object.keys(RESPONSE_PATH_REGISTRY).sort();
}

export function isPrefixFallbackRegistry(registry = {}) {
  return registry.prefixFallbackUsed === true || registry.category === "prefix_diagnostic";
}

export function isImageTransportPath(responsePath = "") {
  return IMAGE_TRANSPORT_PATHS.has(normalizePath(responsePath));
}

export function isPreCognitiveFunctionalPath(responsePath = "") {
  return IMAGE_PRE_COGNITIVE_FUNCTIONAL_PATHS.has(normalizePath(responsePath));
}

export function resolveGateDenyCommercialPath({
  responsePath = "",
  intentAuthority = null,
  commercialEntryGate = null,
} = {}) {
  const path = normalizePath(responsePath);
  const registry = resolveResponsePathRegistry(path);
  const isCommercialDegraded =
    registry.category === "commercial_degraded" ||
    pathMatchesPrefix(path, COMMERCIAL_DEGRADED_PATH_PREFIXES);

  if (!isCommercialDegraded) {
    return { suppressed: false, normalizedResponsePath: path, reasonCode: null };
  }

  if (intentAuthority?.commercialPermission === COMMERCIAL_PERMISSION.DENY) {
    return {
      suppressed: true,
      normalizedResponsePath: "non_commercial_governed_fallback",
      reasonCode: "commercial_degraded_path_suppressed_on_gate_deny",
    };
  }

  if (commercialEntryGate?.commercialEntryAllowed === false) {
    return {
      suppressed: true,
      normalizedResponsePath: "non_commercial_governed_fallback",
      reasonCode: "commercial_entry_denied",
    };
  }

  return { suppressed: false, normalizedResponsePath: path, reasonCode: null };
}

function inferDegradationReasonCode(responsePath = "", degradation = {}, registry = null) {
  if (degradation.reasonCode) return degradation.reasonCode;
  const rules = registry || resolveResponsePathRegistry(responsePath);
  if (rules.degradationReasonDefault) return rules.degradationReasonDefault;
  const path = normalizePath(responsePath);
  if (path.includes("no_result")) return "no_result";
  if (path.includes("provider_unavailable")) return "provider_unavailable";
  if (path.includes("impossible_purchase")) return "impossible_purchase";
  if (path.includes("weak_purchase")) return "weak_purchase_range";
  if (path.includes("search_guidance")) return "search_guidance";
  return "commercial_degraded";
}

function stripCommercialDegradedPayload(body = {}, registry = {}) {
  let normalizedBody = { ...(body || {}) };
  let winnerStripped = false;
  let cardsStripped = false;
  let pricesStripped = false;

  if (!registry.winnerAllowed) {
    if (normalizedBody.winner != null) {
      normalizedBody.winner = null;
      winnerStripped = true;
    }
    if (normalizedBody.session_context) {
      normalizedBody = {
        ...normalizedBody,
        session_context: {
          ...normalizedBody.session_context,
          lastBestProduct: null,
          lastProducts: Array.isArray(normalizedBody.session_context.lastProducts)
            ? normalizedBody.session_context.lastProducts.length > 0
              ? []
              : normalizedBody.session_context.lastProducts
            : [],
        },
      };
      winnerStripped = true;
    }
  }

  if (!registry.pricesAllowed) {
    if (Array.isArray(normalizedBody.prices) && normalizedBody.prices.length > 0) {
      normalizedBody = { ...normalizedBody, prices: [] };
      pricesStripped = true;
      cardsStripped = true;
    } else {
      normalizedBody = {
        ...normalizedBody,
        prices: Array.isArray(normalizedBody.prices) ? normalizedBody.prices : [],
      };
    }
  }

  return {
    body: normalizedBody,
    winnerStripped,
    cardsStripped,
    pricesStripped,
  };
}

export function buildRuntimeDecisionEnvelope({
  responsePath = "",
  runtimeClass = null,
  intentAuthority = null,
  intentRecognition = null,
  routingDecision = null,
  commercialEntryGate = null,
  contracts = {},
  finalization = {},
  semanticState = {},
  legacy = {},
  cso = {},
  degradation = {},
  providerAccounting = {},
} = {}) {
  const registry = resolveResponsePathRegistry(responsePath);
  const reasonCode = inferDegradationReasonCode(responsePath, degradation, registry);

  return {
    version: RUNTIME_PRECEDENCE_VERSION,
    responsePath: normalizePath(responsePath),
    runtimeClass: runtimeClass || registry.runtimeClass || RUNTIME_CLASSES.FUNCTIONAL,
    interactionMode:
      intentRecognition?.interactionMode ||
      intentAuthority?.interactionMode ||
      null,
    primaryIntent:
      intentRecognition?.primaryIntent || intentAuthority?.primaryIntent || null,
    authority: {
      source: intentAuthority?.source || null,
      authoritative: !!intentAuthority?.authoritative,
      commercialPermission: intentAuthority?.commercialPermission || null,
    },
    routing: {
      mode: routingDecision?.mode || null,
      allowNewSearch: routingDecision?.allowNewSearch ?? null,
      allowRerank: routingDecision?.allowRerank ?? null,
      finalDecisionPresent:
        !!routingDecision?.finalAuthority ||
        !!routingDecision?.mode ||
        registry.preCognitive === true,
      finalAuthority: !!routingDecision?.finalAuthority || !!routingDecision?.mode,
    },
    commercialEntry: {
      allowed: commercialEntryGate?.commercialEntryAllowed ?? null,
      reasonCode: commercialEntryGate?.reasonCode || null,
      applied: commercialEntryGate != null,
    },
    degradation: {
      active: !!degradation.active || !!registry.degradationRequired,
      reasonCode: degradation.active || registry.degradationRequired ? reasonCode : null,
      providerAttempted: degradation.providerAttempted ?? null,
      providerSucceeded: degradation.providerSucceeded ?? null,
      resultCount:
        degradation.resultCount ??
        (Array.isArray(degradation._prices) ? degradation._prices.length : null),
    },
    contracts: {
      behaviorPresent: !!contracts.behaviorPresent,
      mixedPresent: !!contracts.mixedPresent,
      firstAnswerPresent: !!contracts.firstAnswerPresent,
      comparisonPresent: !!contracts.comparisonPresent,
    },
    finalization: {
      required: !!finalization.required,
      applied: !!finalization.applied,
      validatorApplied: !!finalization.validatorApplied,
      skippedReason: finalization.skippedReason || null,
    },
    semanticState: {
      transitionRequired: !!semanticState.transitionRequired,
      transitionApplied: !!semanticState.transitionApplied,
      provenanceApplied: !!semanticState.provenanceApplied,
    },
    providerAccounting: {
      providerCallCountBefore: providerAccounting.providerCallCountBefore ?? null,
      providerCallCountAfter: providerAccounting.providerCallCountAfter ?? null,
      providerCallDelta: providerAccounting.providerCallDelta ?? null,
      providerAttempted: providerAccounting.providerAttempted ?? null,
      providerBlockedByGate: providerAccounting.providerBlockedByGate ?? null,
    },
    legacy: {
      signalUsed: !!legacy.signalUsed,
      suggestedIntent: legacy.suggestedIntent || null,
      decisionUsed: !!legacy.decisionUsed,
      suppressed: !!legacy.suppressed,
    },
    cso: {
      signalUsed: !!cso.signalUsed,
      responseAuthorized: !!cso.responseAuthorized,
      suppressed: !!cso.suppressed,
      suppressionReason: cso.suppressionReason || null,
    },
  };
}

export function suppressLegacyDecisionConflict({
  legacyIntent = "",
  intentAuthority = null,
} = {}) {
  if (!legacyIntent || !intentAuthority?.authoritative) {
    return {
      suppressed: false,
      legacyDecisionUsed: false,
      reasonCode: null,
    };
  }

  const legacyCommercial =
    legacyIntent === "search" ||
    legacyIntent === "comparison" ||
    legacyIntent === "decision" ||
    legacyIntent === "new_search";

  const authorityDeny =
    intentAuthority.commercialPermission === COMMERCIAL_PERMISSION.DENY;
  const authorityMixed =
    intentAuthority.commercialPermission === COMMERCIAL_PERMISSION.MIXED;

  if (legacyCommercial && (authorityDeny || authorityMixed)) {
    return {
      suppressed: true,
      legacyDecisionUsed: false,
      reasonCode: "intent_authority_wins_over_legacy",
    };
  }

  return { suppressed: false, legacyDecisionUsed: false, reasonCode: null };
}

export function evaluateCsoSubordination({
  responsePath = "",
  intentAuthority = null,
  intentRecognition = null,
  csoAttempt = false,
} = {}) {
  if (!csoAttempt) {
    return { responseAuthorized: false, suppressed: false, suppressionReason: null };
  }

  const permission = intentAuthority?.commercialPermission;
  const mode = intentRecognition?.interactionMode || intentAuthority?.interactionMode;
  const path = normalizePath(responsePath);

  if (
    permission === COMMERCIAL_PERMISSION.ALLOW ||
    permission === COMMERCIAL_PERMISSION.MIXED ||
    mode === MIA_INTERACTION_MODES.MIXED ||
    mode === MIA_INTERACTION_MODES.COMMERCE
  ) {
    return {
      responseAuthorized: false,
      suppressed: true,
      suppressionReason: "authoritative_mixed_or_commercial_path",
    };
  }

  if (path.includes("cso") && permission === COMMERCIAL_PERMISSION.DENY) {
    return {
      responseAuthorized: true,
      suppressed: false,
      suppressionReason: null,
    };
  }

  if (!intentAuthority?.authoritative) {
    return {
      responseAuthorized: false,
      suppressed: true,
      suppressionReason: "missing_intent_authority",
    };
  }

  return {
    responseAuthorized: permission === COMMERCIAL_PERMISSION.DENY,
    suppressed: permission !== COMMERCIAL_PERMISSION.DENY,
    suppressionReason:
      permission !== COMMERCIAL_PERMISSION.DENY
        ? "cso_requires_non_commercial_authority"
        : null,
  };
}

export function authorizeRuntimeEarlyReturn({
  responsePath = "",
  envelope = {},
  registry = null,
} = {}) {
  const rules = registry || resolveResponsePathRegistry(responsePath);
  const missingRequirements = [];
  const reasonCodes = [];

  if (rules.requiresIntentAuthority && !envelope.authority?.authoritative) {
    if (!rules.preCognitive) {
      missingRequirements.push("intent_authority");
    }
  }

  if (
    rules.requiresFinalRouting &&
    !envelope.routing?.finalDecisionPresent
  ) {
    missingRequirements.push("final_routing");
  }

  if (
    rules.requiresCommercialDeny &&
    envelope.authority?.commercialPermission !== COMMERCIAL_PERMISSION.DENY
  ) {
    missingRequirements.push("commercial_deny");
  }

  if (rules.commercialGateRequired && !rules.preCognitive) {
    if (envelope.commercialEntry?.applied !== true) {
      missingRequirements.push("commercial_gate");
    }
  }

  if (rules.behaviorContractRequired && !envelope.contracts?.behaviorPresent) {
    missingRequirements.push("behavior_contract");
  }

  if (rules.mixedFinalizerRequired && !envelope.contracts?.mixedPresent) {
    if (envelope.interactionMode === MIA_INTERACTION_MODES.MIXED) {
      missingRequirements.push("mixed_contract");
    }
  }

  if (
    rules.firstAnswerContractRequired &&
    !envelope.contracts?.firstAnswerPresent &&
    (Array.isArray(envelope._prices) ? envelope._prices.length : 0) > 0
  ) {
    missingRequirements.push("first_answer_contract");
  }

  if (
    rules.comparisonContractRequired &&
    !envelope.contracts?.comparisonPresent
  ) {
    missingRequirements.push("comparison_contract");
  }

  if (rules.stateTransitionRequired && !envelope.semanticState?.transitionApplied) {
    if (!rules.preCognitive) {
      missingRequirements.push("state_transition");
    }
  }

  if (rules.finalizerRequired && !envelope.finalization?.applied) {
    missingRequirements.push("finalizer");
  }

  if (rules.csoResponseAuthorized === false && envelope.cso?.responseAuthorized) {
    missingRequirements.push("cso_unauthorized");
  }

  if (envelope.legacy?.decisionUsed) {
    missingRequirements.push("legacy_decision_used");
    reasonCodes.push("legacy_decision_blocked");
  }

  if (rules.failClosed) {
    missingRequirements.push("unknown_response_path");
  }

  const allowed =
    missingRequirements.length === 0 &&
    rules.allowedEarlyReturn !== false &&
    !rules.failClosed;

  if (allowed) reasonCodes.push("early_return_authorized");
  else reasonCodes.push("early_return_blocked");

  return {
    allowed,
    missingRequirements,
    reasonCodes,
    normalizedPath: normalizePath(responsePath),
    registryKey: rules.registryKey || normalizePath(responsePath),
  };
}

export function validateRuntimeResponseInvariants({
  responsePath = "",
  envelope = {},
  body = {},
  authorization = {},
  registry = null,
  strict = false,
} = {}) {
  const rules = registry || resolveResponsePathRegistry(responsePath);
  const violations = [];
  const prices = Array.isArray(body?.prices) ? body.prices : [];

  if (!authorization?.allowed) {
    violations.push("earlyReturnUnauthorized");
  }

  if (!envelope.authority?.authoritative && rules.requiresIntentAuthority && !rules.preCognitive) {
    violations.push("missingIntentAuthority");
  }

  if (rules.requiresFinalRouting && !envelope.routing?.finalDecisionPresent) {
    violations.push("missingFinalRouting");
  }

  if (
    rules.requiresCommercialDeny &&
    envelope.authority?.commercialPermission !== COMMERCIAL_PERMISSION.DENY
  ) {
    violations.push("authorityPathMismatch");
  }

  if (rules.providersAllowed === false && prices.length > 0) {
    violations.push("providerFreePathCalledProvider");
  }

  if (rules.commercialGateRequired && !rules.preCognitive) {
    if (envelope.commercialEntry?.applied !== true) {
      violations.push("commercialGateMissing");
    } else if (
      rules.providersAllowed &&
      prices.length > 0 &&
      envelope.commercialEntry?.allowed !== true
    ) {
      violations.push("commercialGateMissing");
    }
  }

  if (rules.degradationRequired && !envelope.degradation?.active) {
    violations.push("degradationMissing");
  }

  if (rules.winnerAllowed === false && body?.winner != null) {
    violations.push("invalidWinnerOnDegradedPath");
  }

  if (rules.pricesAllowed === false && prices.length > 0) {
    violations.push("invalidPricesOnNoResultPath");
  }

  if (rules.stateTransitionRequired && !rules.preCognitive && !envelope.semanticState?.transitionApplied) {
    violations.push("stateTransitionMissing");
  }

  if (
    rules.stateTransitionRequired &&
    !rules.preCognitive &&
    !envelope.semanticState?.provenanceApplied &&
    body?.session_context &&
    !body.session_context.semanticStateProvenance
  ) {
    violations.push("provenanceMissing");
  }

  if (envelope.legacy?.decisionUsed) {
    violations.push("legacyDecisionWon");
  }

  if (envelope.cso?.suppressed && envelope.cso?.responseAuthorized) {
    violations.push("csoUnauthorizedReturn");
  }

  let correctedBody = body;
  let corrected = false;

  if (violations.includes("providerFreePathCalledProvider")) {
    correctedBody = { ...(correctedBody || body), prices: [] };
    corrected = true;
  }

  if (violations.includes("invalidWinnerOnDegradedPath")) {
    correctedBody = { ...correctedBody, winner: null };
    corrected = true;
  }

  if (violations.includes("invalidPricesOnNoResultPath")) {
    correctedBody = { ...correctedBody, prices: [] };
    corrected = true;
  }

  if (strict && violations.length) {
    throw new Error(`runtime_invariant_violation:${violations.join(",")}`);
  }

  return {
    valid: violations.length === 0 || corrected,
    violations,
    corrected,
    body: correctedBody,
  };
}

export function runtimePrecedenceToTrace({
  envelope = {},
  authorization = {},
  invariants = {},
  responsePath = "",
  earlyReturnId = null,
  precedenceStageReached = PRECEDENCE_STAGES.HTTP_RESPONSE,
  legacySuppression = null,
  csoEvaluation = null,
  technicalPathAuthorized = null,
  functionalPathAuthorized = null,
  directHttpBypassPrevented = true,
  unknownPathBlocked = false,
  commercialDegradedPathSuppressed = false,
  normalizedResponsePath = null,
  payloadInvariantAudit = {},
} = {}) {
  const registry = resolveResponsePathRegistry(responsePath);
  return {
    version: RUNTIME_PRECEDENCE_VERSION,
    earlyReturnId: earlyReturnId || authorization.registryKey || normalizePath(responsePath),
    responsePath: normalizePath(responsePath),
    normalizedResponsePath: normalizedResponsePath || normalizePath(responsePath),
    runtimeClass: envelope.runtimeClass || registry.runtimeClass || RUNTIME_CLASSES.FUNCTIONAL,
    precedenceStageReached,
    technicalPathAuthorized:
      technicalPathAuthorized ?? registry.runtimeClass === RUNTIME_CLASSES.TRANSPORT,
    functionalPathAuthorized:
      functionalPathAuthorized ?? registry.functionalConversationResponse !== false,
    intentAuthorityPresent: !!envelope.authority?.authoritative,
    finalRoutingDecisionPresent: !!envelope.routing?.finalDecisionPresent,
    routingAuthorityPresent: !!envelope.routing?.mode || !!envelope.routing?.finalAuthority,
    commercialGateApplied: envelope.commercialEntry?.applied === true,
    commercialEntryAllowed: envelope.commercialEntry?.allowed,
    degradationActive: !!envelope.degradation?.active,
    degradationReason: envelope.degradation?.reasonCode || null,
    providerCallDelta: envelope.providerAccounting?.providerCallDelta ?? null,
    providerAttempted: envelope.degradation?.providerAttempted ?? null,
    providerBlockedByGate: envelope.providerAccounting?.providerBlockedByGate ?? null,
    winnerStripped: !!payloadInvariantAudit.winnerStripped,
    cardsStripped: !!payloadInvariantAudit.cardsStripped,
    pricesStripped: !!payloadInvariantAudit.pricesStripped,
    contractsPresent: {
      behavior: !!envelope.contracts?.behaviorPresent,
      mixed: !!envelope.contracts?.mixedPresent,
      firstAnswer: !!envelope.contracts?.firstAnswerPresent,
      comparison: !!envelope.contracts?.comparisonPresent,
    },
    finalizerApplied: !!envelope.finalization?.applied,
    stateTransitionApplied: !!envelope.semanticState?.transitionApplied,
    provenanceApplied: !!envelope.semanticState?.provenanceApplied,
    earlyReturnAuthorized: !!authorization.allowed,
    missingRequirements: authorization.missingRequirements || [],
    legacyDecisionSuppressed: !!legacySuppression?.suppressed,
    csoReturnSuppressed: !!csoEvaluation?.suppressed,
    csoSuppressionReason: csoEvaluation?.suppressionReason || null,
    invariantViolations: invariants.violations || [],
    invariantCorrected: !!invariants.corrected,
    unknownPathBlocked,
    commercialDegradedPathSuppressed,
    directHttpBypassPrevented,
    envelopeSummary: {
      interactionMode: envelope.interactionMode,
      commercialPermission: envelope.authority?.commercialPermission,
      routingMode: envelope.routing?.mode,
    },
  };
}

export function finalizeGovernedRuntimeResponse({
  responsePath = "",
  body = {},
  intentAuthority = null,
  intentRecognition = null,
  routingDecision = null,
  commercialEntryGate = null,
  contracts = {},
  finalization = {},
  semanticState = {},
  legacy = {},
  cso = {},
  degradation = {},
  providerAccounting = {},
  strict = false,
} = {}) {
  const registry = resolveResponsePathRegistry(responsePath);
  const envelope = buildRuntimeDecisionEnvelope({
    responsePath,
    runtimeClass: registry.runtimeClass,
    intentAuthority,
    intentRecognition,
    routingDecision: routingDecision
      ? { ...routingDecision, finalAuthority: true }
      : registry.preCognitive
        ? { finalAuthority: true, mode: "pre_cognitive" }
        : null,
    commercialEntryGate,
    contracts,
    finalization,
    semanticState,
    legacy,
    cso,
    degradation,
    providerAccounting,
  });

  envelope._prices = Array.isArray(body?.prices) ? body.prices : [];

  const authorization = authorizeRuntimeEarlyReturn({
    responsePath,
    envelope,
    registry,
  });

  const invariants = validateRuntimeResponseInvariants({
    responsePath,
    envelope,
    body,
    authorization,
    registry,
    strict,
  });

  return {
    body: invariants.body,
    envelope,
    authorization,
    invariants,
    trace: runtimePrecedenceToTrace({
      envelope,
      authorization,
      invariants,
      responsePath,
      legacySuppression: legacy,
      csoEvaluation: cso,
    }),
  };
}

export function finalizeCommercialDegradedResponse({
  responsePath = "",
  body = {},
  intentAuthority = null,
  intentRecognition = null,
  routingDecision = null,
  commercialEntryGate = null,
  contracts = {},
  finalization = {},
  semanticState = {},
  legacy = {},
  cso = {},
  degradation = {},
  providerAccounting = {},
  strict = false,
} = {}) {
  const gateDeny = resolveGateDenyCommercialPath({
    responsePath,
    intentAuthority,
    commercialEntryGate,
  });
  if (gateDeny.suppressed) {
    const fallbackBody = {
      reply: body?.reply || "",
      prices: [],
      session_context: body?.session_context || {},
    };
    const fallbackResult = finalizeGovernedRuntimeResponse({
      responsePath: gateDeny.normalizedResponsePath,
      body: fallbackBody,
      intentAuthority,
      intentRecognition,
      routingDecision,
      commercialEntryGate,
      contracts: { behaviorPresent: true, ...contracts },
      finalization: { required: true, applied: true, validatorApplied: true, ...finalization },
      semanticState,
      legacy,
      cso,
      providerAccounting: {
        ...providerAccounting,
        providerCallDelta: 0,
        providerBlockedByGate: true,
      },
      strict,
    });
    return {
      ...fallbackResult,
      gateDenySuppressed: true,
      normalizedResponsePath: gateDeny.normalizedResponsePath,
      trace: runtimePrecedenceToTrace({
        envelope: fallbackResult.envelope,
        authorization: fallbackResult.authorization,
        invariants: fallbackResult.invariants,
        responsePath: gateDeny.normalizedResponsePath,
        commercialDegradedPathSuppressed: true,
        normalizedResponsePath: gateDeny.normalizedResponsePath,
        providerAccounting: { providerCallDelta: 0, providerBlockedByGate: true },
      }),
    };
  }

  const registry = resolveResponsePathRegistry(responsePath);
  const reasonCode = inferDegradationReasonCode(responsePath, degradation, registry);
  const stripped = stripCommercialDegradedPayload(body, registry);
  let normalizedBody = {
    ...stripped.body,
    mia_debug: {
      ...(stripped.body?.mia_debug || {}),
      commercialResultStatus:
        reasonCode === "no_result" || reasonCode === "commercial_new_search_no_result"
          ? "no_result"
          : "degraded",
      degradation: {
        active: true,
        reasonCode,
        providerAttempted: degradation.providerAttempted ?? registry.providersAllowed === true,
        providerSucceeded: degradation.providerSucceeded ?? false,
        resultCount: Array.isArray(stripped.body?.prices) ? stripped.body.prices.length : 0,
      },
      runtime_provenance: {
        responsePath: normalizePath(responsePath),
        authoritySource: intentAuthority?.source || null,
        finalRoutingSource: routingDecision?.mode ? "finalRoutingDecision" : null,
        commercialGateReason: commercialEntryGate?.reasonCode || null,
        degradationReason: reasonCode,
        providerAttempted: degradation.providerAttempted ?? null,
        stateTransitionType: semanticState?.transitionType || "commercial_degraded",
        previousStatePreserved: semanticState?.previousStatePreserved ?? true,
        newCommercialStateCreated: semanticState?.newCommercialStateCreated ?? false,
      },
    },
  };

  const result = finalizeGovernedRuntimeResponse({
    responsePath,
    body: normalizedBody,
    intentAuthority,
    intentRecognition,
    routingDecision,
    commercialEntryGate,
    contracts,
    finalization: {
      required: true,
      applied: true,
      validatorApplied: true,
      ...finalization,
    },
    semanticState,
    legacy,
    cso,
    degradation: {
      active: true,
      reasonCode,
      providerAttempted: degradation.providerAttempted,
      providerSucceeded: degradation.providerSucceeded,
      resultCount: Array.isArray(normalizedBody.prices) ? normalizedBody.prices.length : 0,
    },
    providerAccounting,
    strict,
  });

  return {
    ...result,
    body: result.body,
    gateDenySuppressed: false,
    payloadInvariantAudit: stripped,
    trace: runtimePrecedenceToTrace({
      envelope: result.envelope,
      authorization: result.authorization,
      invariants: result.invariants,
      responsePath,
      payloadInvariantAudit: stripped,
    }),
  };
}

export function finalizeTechnicalRuntimeResponse({
  responsePath = "",
  body = {},
  providerAccounting = {},
  strict = false,
} = {}) {
  const registry = resolveResponsePathRegistry(responsePath);
  if (registry.runtimeClass !== RUNTIME_CLASSES.TRANSPORT && !registry.preCognitive) {
    if (strict) {
      throw new Error(`technical_runtime_path_mismatch:${normalizePath(responsePath)}`);
    }
  }

  let normalizedBody = { ...(body || {}) };
  if (!registry.semanticStateMutationAllowed) {
    normalizedBody = {
      reply: normalizedBody.reply,
      prices: Array.isArray(normalizedBody.prices) ? normalizedBody.prices : [],
    };
    if (normalizedBody.winner != null) normalizedBody.winner = null;
  }

  const prices = Array.isArray(normalizedBody.prices) ? normalizedBody.prices : [];
  const envelope = buildRuntimeDecisionEnvelope({
    responsePath,
    runtimeClass: registry.runtimeClass || RUNTIME_CLASSES.TRANSPORT,
    degradation: { active: false },
    providerAccounting: {
      ...providerAccounting,
      providerCallDelta: providerAccounting.providerCallDelta ?? 0,
    },
  });

  envelope._prices = prices;

  const authorization = authorizeRuntimeEarlyReturn({
    responsePath,
    envelope: {
      ...envelope,
      authority: { authoritative: false },
      semanticState: { transitionApplied: true, provenanceApplied: true },
    },
    registry,
  });

  const violations = [];
  if (prices.length > 0 && registry.pricesAllowed === false) {
    violations.push("transportPathWithPrices");
    normalizedBody = { ...normalizedBody, prices: [] };
  }
  if (normalizedBody.session_context && !registry.semanticStateMutationAllowed) {
    violations.push("transportPathSessionMutation");
    delete normalizedBody.session_context;
  }

  const invariants = {
    valid: violations.length === 0,
    violations,
    corrected: violations.length > 0,
    body: normalizedBody,
  };

  return {
    body: normalizedBody,
    envelope,
    authorization,
    invariants,
    trace: runtimePrecedenceToTrace({
      envelope,
      authorization,
      invariants,
      responsePath,
      technicalPathAuthorized: registry.runtimeClass === RUNTIME_CLASSES.TRANSPORT,
      functionalPathAuthorized: registry.functionalConversationResponse === true,
    }),
  };
}

export function finalizePreCognitiveFunctionalResponse({
  responsePath = "",
  body = {},
  degradation = {},
  providerAccounting = {},
  strict = false,
} = {}) {
  const registry = resolveResponsePathRegistry(responsePath);
  const reasonCode = inferDegradationReasonCode(responsePath, degradation, registry);
  let normalizedBody = { ...(body || {}) };

  if (registry.degradationRequired) {
    const stripped = stripCommercialDegradedPayload(normalizedBody, registry);
    normalizedBody = stripped.body;
  }

  const envelope = buildRuntimeDecisionEnvelope({
    responsePath,
    runtimeClass: registry.runtimeClass,
    routingDecision: { finalAuthority: true, mode: "pre_cognitive" },
    degradation: registry.degradationRequired
      ? {
          active: true,
          reasonCode,
          providerAttempted: degradation.providerAttempted ?? true,
          providerSucceeded: degradation.providerSucceeded ?? false,
        }
      : { active: false },
    providerAccounting,
  });

  envelope._prices = Array.isArray(normalizedBody.prices) ? normalizedBody.prices : [];

  const authorization = authorizeRuntimeEarlyReturn({
    responsePath,
    envelope: {
      ...envelope,
      authority: { authoritative: false },
      semanticState: { transitionApplied: true, provenanceApplied: true },
    },
    registry,
  });

  const invariants = validateRuntimeResponseInvariants({
    responsePath,
    envelope,
    body: normalizedBody,
    authorization,
    registry,
    strict,
  });

  return {
    body: invariants.body,
    envelope,
    authorization,
    invariants,
    trace: runtimePrecedenceToTrace({
      envelope,
      authorization,
      invariants,
      responsePath,
      technicalPathAuthorized: false,
      functionalPathAuthorized: true,
    }),
  };
}
