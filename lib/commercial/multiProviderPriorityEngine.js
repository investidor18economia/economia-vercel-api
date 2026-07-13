/**
 * PATCH Comercial 05I — Multi-Provider Priority Engine
 *
 * Ordenação operacional determinística de providers comerciais.
 * Não decide winner, produto, reasoning ou recomendação.
 */

import {
  buildUniversalCommercialCacheKey,
  getUniversalCommercialCacheEntry,
} from "./universalCommercialCache.js";
import {
  evaluateProviderBudgetPermission,
  getProviderCircuitState,
  PROVIDER_CIRCUIT_STATES,
} from "./providerBudgetCircuitBreaker.js";
import { getCommercialProviderBillingProfile } from "./providerCostAudit.js";
import {
  COMMERCIAL_RUNTIME_MODES,
  getCommercialRuntimeMode,
} from "../productSourceAdapter/commercialRuntimeMode.js";
import {
  listCommercialProviderOperationalMetadata,
} from "../productSourceAdapter/commercialProviderRegistry.js";

export const MULTI_PROVIDER_PRIORITY_ENGINE_VERSION = "05I";

export const MULTI_PROVIDER_PRIORITY_ENABLED_ENV = "COMMERCIAL_PROVIDER_PRIORITY_ENABLED";
export const MULTI_PROVIDER_PRIORITY_STRATEGY_ENV = "COMMERCIAL_PROVIDER_PRIORITY_STRATEGY";

export const MULTI_PROVIDER_PRIORITY_STRATEGIES = Object.freeze({
  REGISTRY_ORDER: "registry_order",
  COST_BALANCED: "cost_balanced",
});

export const MULTI_PROVIDER_PRIORITY_SKIP_REASONS = Object.freeze({
  PROVIDER_DISABLED: "provider_disabled",
  SKIPPED_UNSUPPORTED_RUNTIME: "skipped_unsupported_runtime",
  CIRCUIT_OPEN: "circuit_open",
  BUDGET_EXHAUSTED: "budget_exhausted",
  MISSING_REQUIRED_AUTH: "missing_required_auth",
  INVALID_METADATA: "invalid_metadata",
  UNKNOWN_BILLING_TIER: "unknown_billing_tier",
});

const BILLING_TIER_PREFERENCE = Object.freeze({
  internal: 80,
  free_external: 50,
  paid_external: 0,
  unknown: -40,
});

function cleanText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseBooleanEnv(value, defaultValue = true) {
  if (value == null || value === "") return defaultValue;
  const raw = String(value).trim().toLowerCase();
  if (raw === "false" || raw === "0" || raw === "no") return false;
  if (raw === "true" || raw === "1" || raw === "yes") return true;
  return defaultValue;
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
export function readMultiProviderPriorityConfig(env = process.env) {
  const strategyRaw = cleanText(env?.[MULTI_PROVIDER_PRIORITY_STRATEGY_ENV] || "")
    .toLowerCase();
  const strategy =
    strategyRaw === MULTI_PROVIDER_PRIORITY_STRATEGIES.REGISTRY_ORDER
      ? MULTI_PROVIDER_PRIORITY_STRATEGIES.REGISTRY_ORDER
      : MULTI_PROVIDER_PRIORITY_STRATEGIES.COST_BALANCED;

  return {
    enabled: parseBooleanEnv(env?.[MULTI_PROVIDER_PRIORITY_ENABLED_ENV], true),
    strategy,
  };
}

function resolveRuntimeMode(input = {}) {
  const explicit = cleanText(input.runtimeMode);
  if (explicit) return explicit;
  if (input.invocationSource?.includes("shadow")) {
    return COMMERCIAL_RUNTIME_MODES.SHADOW;
  }
  return getCommercialRuntimeMode(input.env);
}

function supportsRuntimeMode(metadata = {}, runtimeMode = "") {
  if (runtimeMode === COMMERCIAL_RUNTIME_MODES.SHADOW) {
    return metadata.supportsShadow === true;
  }
  if (runtimeMode === COMMERCIAL_RUNTIME_MODES.CONTROLLED) {
    return metadata.supportsControlled === true;
  }
  return metadata.supportsControlled === true;
}

function evaluateAuthReadiness(metadata = {}, env = process.env) {
  if (metadata.requiresAuth !== true) {
    return { ready: true, required: false, missingKeys: [] };
  }

  const keys = Array.isArray(metadata.authEnvKeys) ? metadata.authEnvKeys : [];
  const missingKeys = keys.filter((key) => !String(env?.[key] || "").trim());
  return {
    ready: missingKeys.length === 0,
    required: true,
    missingKeys,
  };
}

function resolveCacheOpportunity(metadata = {}, input = {}) {
  const query = cleanText(input.query);
  if (!query || !metadata.id) {
    return { hasFreshHit: false, cacheKey: null };
  }

  const cacheKey = buildUniversalCommercialCacheKey({
    providerId: metadata.id,
    query,
    limit: input.limit,
    categoryHint: input.categoryHint,
  });
  const entry = getUniversalCommercialCacheEntry(cacheKey);
  return {
    hasFreshHit: !!entry?.result,
    cacheKey,
  };
}

function resolveBudgetStatus(providerId = "", input = {}) {
  const decision = evaluateProviderBudgetPermission({
    providerId,
    invocationSource: input.invocationSource || "multi_provider_priority_engine",
    env: input.env,
  });

  return {
    decision: decision.decision || null,
    reasonCode: decision.reasonCode || null,
    shouldCallProvider: decision.shouldCallProvider === true,
    callsRemaining: decision.callsRemaining ?? null,
    circuitState: decision.circuitState || null,
  };
}

/**
 * @param {Record<string, unknown>} input
 */
export function evaluateProviderRuntimeEligibility(input = {}) {
  const metadata = input.metadata || {};
  const runtimeMode = resolveRuntimeMode(input);
  const env = input.env || process.env;
  const providerId = cleanText(metadata.id || input.providerId);
  const billingProfile = getCommercialProviderBillingProfile(providerId);
  const billingTier = cleanText(metadata.billingTier || billingProfile?.tier || "unknown");
  const auth = evaluateAuthReadiness(metadata, env);
  const budget = input.budgetStatus || resolveBudgetStatus(providerId, input);
  const circuitState = cleanText(
    input.circuitState || budget.circuitState || getProviderCircuitState(providerId).state
  );
  const cache = input.cacheOpportunity || resolveCacheOpportunity(metadata, input);

  const reasons = [];
  let eligible = true;
  let skipReason = null;

  if (!providerId || !metadata.id) {
    eligible = false;
    skipReason = MULTI_PROVIDER_PRIORITY_SKIP_REASONS.INVALID_METADATA;
    reasons.push("invalid_metadata");
  }

  if (eligible && metadata.enabled !== true) {
    eligible = false;
    skipReason = MULTI_PROVIDER_PRIORITY_SKIP_REASONS.PROVIDER_DISABLED;
    reasons.push("provider_disabled");
  }

  if (eligible && !supportsRuntimeMode(metadata, runtimeMode)) {
    eligible = false;
    skipReason = MULTI_PROVIDER_PRIORITY_SKIP_REASONS.SKIPPED_UNSUPPORTED_RUNTIME;
    reasons.push("skipped_unsupported_runtime");
  }

  if (eligible && auth.required && !auth.ready) {
    eligible = false;
    skipReason = MULTI_PROVIDER_PRIORITY_SKIP_REASONS.MISSING_REQUIRED_AUTH;
    reasons.push("missing_required_auth");
  }

  if (eligible && circuitState === PROVIDER_CIRCUIT_STATES.OPEN) {
    eligible = false;
    skipReason = MULTI_PROVIDER_PRIORITY_SKIP_REASONS.CIRCUIT_OPEN;
    reasons.push("circuit_open");
  }

  if (
    eligible &&
    budget.shouldCallProvider === false &&
    budget.reasonCode === "budget_exhausted"
  ) {
    eligible = false;
    skipReason = MULTI_PROVIDER_PRIORITY_SKIP_REASONS.BUDGET_EXHAUSTED;
    reasons.push("budget_exhausted");
  }

  if (eligible && billingTier === "unknown" && metadata.supportsControlled !== true) {
    eligible = false;
    skipReason = MULTI_PROVIDER_PRIORITY_SKIP_REASONS.UNKNOWN_BILLING_TIER;
    reasons.push("unknown_billing_tier");
  }

  return {
    providerId,
    eligible,
    skipReason,
    runtimeMode,
    runtimeSupported: supportsRuntimeMode(metadata, runtimeMode),
    enabled: metadata.enabled === true,
    billingTier,
    authReadiness: auth,
    budgetStatus: budget,
    circuitState,
    cacheOpportunity: cache,
    orderingReasons: reasons,
  };
}

/**
 * @param {Record<string, unknown>} input
 */
export function calculateProviderOperationalPriority(input = {}) {
  const eligibility = input.eligibility || evaluateProviderRuntimeEligibility(input);
  const metadata = input.metadata || {};
  const strategy =
    input.strategy || readMultiProviderPriorityConfig(input.env).strategy;
  const registryPosition = Number.isFinite(metadata.registryPosition)
    ? metadata.registryPosition
    : Number.isFinite(input.registryPosition)
      ? input.registryPosition
      : 999;

  if (!eligibility.eligible) {
    return {
      providerId: eligibility.providerId,
      eligible: false,
      priorityScore: -1,
      priorityTier: "skipped",
      skipReason: eligibility.skipReason,
      scoreComponents: {},
      orderingReasons: eligibility.orderingReasons,
    };
  }

  if (strategy === MULTI_PROVIDER_PRIORITY_STRATEGIES.REGISTRY_ORDER) {
    const score = 10_000 - registryPosition;
    return {
      providerId: eligibility.providerId,
      eligible: true,
      priorityScore: score,
      priorityTier: "registry_order",
      skipReason: null,
      scoreComponents: {
        registryPosition,
        strategy: MULTI_PROVIDER_PRIORITY_STRATEGIES.REGISTRY_ORDER,
      },
      orderingReasons: ["registry_order"],
    };
  }

  const billingTier = eligibility.billingTier || "unknown";
  const scoreComponents = {
    registryPosition,
    registryBase: 1_000 - registryPosition * 10,
    billingTierPreference: BILLING_TIER_PREFERENCE[billingTier] ?? BILLING_TIER_PREFERENCE.unknown,
    cacheBonus: eligibility.cacheOpportunity?.hasFreshHit ? 100 : 0,
    circuitBonus:
      eligibility.circuitState === PROVIDER_CIRCUIT_STATES.HALF_OPEN
        ? -40
        : eligibility.circuitState === PROVIDER_CIRCUIT_STATES.CLOSED
          ? 20
          : 0,
    budgetBonus:
      eligibility.budgetStatus?.callsRemaining > 0 ||
      eligibility.budgetStatus?.shouldCallProvider === true
        ? 10
        : 0,
    authBonus: eligibility.authReadiness?.ready ? 15 : 0,
    reliabilityBonus: Math.round((metadata.reliabilityScore || 0) / 10),
    latencyPenalty: -Math.round((metadata.latencyMs || 0) / 10_000),
    strategy: MULTI_PROVIDER_PRIORITY_STRATEGIES.COST_BALANCED,
  };

  const priorityScore = Object.entries(scoreComponents)
    .filter(([key]) => !["strategy", "registryPosition"].includes(key))
    .reduce((sum, [, value]) => sum + Number(value || 0), 0);

  const orderingReasons = [];
  if (scoreComponents.cacheBonus > 0) orderingReasons.push("cache_hit_priority");
  if (scoreComponents.billingTierPreference >= 50) orderingReasons.push("free_or_internal_preference");
  if (scoreComponents.circuitBonus < 0) orderingReasons.push("half_open_penalty");
  if (!orderingReasons.length) orderingReasons.push("cost_balanced_default");

  return {
    providerId: eligibility.providerId,
    eligible: true,
    priorityScore,
    priorityTier: "cost_balanced",
    skipReason: null,
    scoreComponents,
    orderingReasons,
  };
}

/**
 * @param {Record<string, unknown>} left
 * @param {Record<string, unknown>} right
 */
export function compareProviderPriority(left = {}, right = {}) {
  const leftScore = Number(left.priorityScore ?? -1);
  const rightScore = Number(right.priorityScore ?? -1);
  if (rightScore !== leftScore) return rightScore - leftScore;

  const leftPos = Number(left.registryPosition ?? 999);
  const rightPos = Number(right.registryPosition ?? 999);
  return leftPos - rightPos;
}

/**
 * @param {Record<string, unknown>} plan
 */
export function validateMultiProviderPriorityPlan(plan = {}) {
  const ordered = Array.isArray(plan.orderedProviders) ? plan.orderedProviders : [];
  const ids = ordered.map((entry) => entry.providerId).filter(Boolean);
  const unique = new Set(ids);

  return {
    ok: ids.length === unique.size,
    orderedCount: ordered.length,
    duplicateCount: ids.length - unique.size,
    hasEligible: ordered.some((entry) => entry.eligible === true),
  };
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function buildMultiProviderPriorityPlan(input = {}) {
  const config = readMultiProviderPriorityConfig(input.env);
  const runtimeMode = resolveRuntimeMode(input);
  const env = input.env || process.env;
  const providers =
    Array.isArray(input.providers) && input.providers.length
      ? input.providers
      : listCommercialProviderOperationalMetadata(env);

  const providerPlans = providers.map((metadata) => {
    const eligibility = evaluateProviderRuntimeEligibility({
      metadata,
      runtimeMode,
      env,
      query: input.query,
      limit: input.limit,
      categoryHint: input.categoryHint,
      invocationSource: input.invocationSource,
    });
    const priority = calculateProviderOperationalPriority({
      metadata,
      eligibility,
      strategy: config.strategy,
      env,
      registryPosition: metadata.registryPosition,
    });

    return {
      providerId: metadata.id,
      eligible: eligibility.eligible,
      priorityScore: priority.priorityScore,
      priorityTier: priority.priorityTier,
      registryPosition: metadata.registryPosition,
      runtimeSupported: eligibility.runtimeSupported,
      enabled: metadata.enabled === true,
      billingTier: eligibility.billingTier,
      costPreference: BILLING_TIER_PREFERENCE[eligibility.billingTier] ?? 0,
      circuitState: eligibility.circuitState,
      budgetStatus: eligibility.budgetStatus?.decision || null,
      authReadiness: eligibility.authReadiness?.ready === true,
      cacheOpportunity: eligibility.cacheOpportunity?.hasFreshHit === true,
      skipReason: eligibility.skipReason,
      orderingReasons: priority.orderingReasons || [],
      scoreComponents: priority.scoreComponents || {},
      supportsControlled: metadata.supportsControlled === true,
      supportsShadow: metadata.supportsShadow === true,
    };
  });

  const eligibleProviders = providerPlans.filter((entry) => entry.eligible === true);
  const skippedProviders = providerPlans.filter((entry) => entry.eligible !== true);
  const orderedProviders = [...eligibleProviders].sort(compareProviderPriority);

  const plan = {
    version: MULTI_PROVIDER_PRIORITY_ENGINE_VERSION,
    runtimeMode,
    strategy: config.enabled ? config.strategy : MULTI_PROVIDER_PRIORITY_STRATEGIES.REGISTRY_ORDER,
    priorityEnabled: config.enabled,
    invocationSource: input.invocationSource || null,
    registryProviders: providers.map((entry) => entry.id),
    eligibleProviders: eligibleProviders.map((entry) => entry.providerId),
    skippedProviders: skippedProviders.map((entry) => ({
      providerId: entry.providerId,
      skipReason: entry.skipReason,
    })),
    orderedProviders,
    providerPlans,
    decisionReasons: orderedProviders.flatMap((entry) => entry.orderingReasons || []),
    diagnostics: buildMultiProviderPriorityDiagnostics({
      runtimeMode,
      strategy: config.strategy,
      priorityEnabled: config.enabled,
      registryProviders: providers.map((entry) => entry.id),
      eligibleProviders,
      orderedProviders,
      skippedProviders,
      providerPlans,
    }),
  };

  plan.validation = validateMultiProviderPriorityPlan(plan);
  return plan;
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function buildMultiProviderPriorityDiagnostics(input = {}) {
  return {
    version: MULTI_PROVIDER_PRIORITY_ENGINE_VERSION,
    runtimeMode: input.runtimeMode || null,
    strategy: input.strategy || null,
    priorityEnabled: input.priorityEnabled === true,
    registryProviderCount: input.registryProviders?.length || 0,
    eligibleCount: input.eligibleProviders?.length || 0,
    skippedCount: input.skippedProviders?.length || 0,
    orderedProviderIds: (input.orderedProviders || []).map((entry) => entry.providerId),
    skippedProviderIds: (input.skippedProviders || []).map((entry) => entry.providerId),
    skipReasons: (input.skippedProviders || []).map((entry) => ({
      providerId: entry.providerId,
      skipReason: entry.skipReason,
    })),
    providerScores: (input.providerPlans || [])
      .filter((entry) => entry.eligible === true)
      .map((entry) => ({
        providerId: entry.providerId,
        priorityScore: entry.priorityScore,
        priorityTier: entry.priorityTier,
      })),
    capabilityDecisions: (input.providerPlans || []).map((entry) => ({
      providerId: entry.providerId,
      runtimeSupported: entry.runtimeSupported,
      supportsShadow: entry.supportsShadow,
      supportsControlled: entry.supportsControlled,
      eligible: entry.eligible,
      skipReason: entry.skipReason,
    })),
  };
}

/**
 * @param {Record<string, unknown>|null} [plan]
 */
export function buildMultiProviderPriorityDevPayload(plan = null) {
  return {
    version: MULTI_PROVIDER_PRIORITY_ENGINE_VERSION,
    config: readMultiProviderPriorityConfig(),
    plan,
    diagnostics: plan?.diagnostics || buildMultiProviderPriorityDiagnostics(),
  };
}

/**
 * @param {Record<string, unknown>|null} [plan]
 */
export function buildMultiProviderPriorityTracePatch(plan = null) {
  if (!plan) return null;

  return {
    multi_provider_priority_engine: plan.diagnostics || buildMultiProviderPriorityDiagnostics(plan),
    multi_provider_priority_engine_full: buildMultiProviderPriorityDevPayload(plan),
  };
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function buildOrderedProviderIdsFromPriorityPlan(input = {}) {
  const plan =
    input.priorityPlan ||
    buildMultiProviderPriorityPlan({
      runtimeMode: input.runtimeMode,
      invocationSource: input.invocationSource,
      query: input.query,
      limit: input.limit,
      categoryHint: input.categoryHint,
      env: input.env,
      providers: input.providers,
    });

  if (!plan.priorityEnabled) {
    return {
      plan,
      orderedProviderIds: (input.fallbackProviders || plan.registryProviders).filter(Boolean),
    };
  }

  return {
    plan,
    orderedProviderIds: plan.orderedProviders.map((entry) => entry.providerId),
  };
}
