/**
 * PATCH Comercial 05B — Provider Cost Guard
 *
 * Avalia permissão determinística antes de chamadas a providers comerciais.
 * Não decide winner, não gera reasoning, não altera resposta.
 */

import { COMMERCIAL_PROVIDER_IDS } from "../productSourceAdapter/commercialProviderRegistry.js";
import {
  getCommercialProviderBillingProfile,
  getCommercialProviderCostProfile,
} from "./providerCostAudit.js";
import {
  COMMERCIAL_RUNTIME_MODES,
  getCommercialRuntimeMode,
} from "../productSourceAdapter/commercialRuntimeMode.js";

export const PROVIDER_COST_GUARD_VERSION = "05B";

export const PROVIDER_COST_GUARD_DECISIONS = Object.freeze({
  ALLOW: "allow",
  BLOCK: "block",
  DRY_RUN: "dry_run",
  REQUIRE_OPT_IN: "require_opt_in",
});

export const PROVIDER_COST_GUARD_REASON_CODES = Object.freeze({
  PROVIDER_DISABLED: "provider_disabled",
  INTERNAL_ALLOWED: "internal_provider_allowed",
  FREE_EXTERNAL_ALLOWED: "free_external_allowed",
  PAID_FUNCTIONAL_ALLOWED: "paid_functional_allowed",
  PAID_OBSERVABILITY_BLOCKED: "paid_observability_blocked",
  PAID_OBSERVABILITY_ALLOWED_OPT_IN: "paid_observability_allowed_opt_in",
  DEV_PAID_DRY_RUN: "dev_paid_dry_run",
  DEV_PAID_BLOCKED: "dev_paid_blocked",
  UNKNOWN_EXTERNAL_BLOCKED: "unknown_external_blocked",
  LEGACY_FUNCTIONAL_DEFAULT_ALLOW: "legacy_functional_default_allow",
  COST_GUARD_SKIPPED: "cost_guard_skipped",
});

export const PAID_PROVIDER_OBSERVABILITY_OPT_IN_ENV =
  "COMMERCIAL_PAID_PROVIDERS_OBSERVABILITY_ENABLED";

function cleanText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function resolveEnvironment(environment = "") {
  const env = cleanText(environment || process.env.NODE_ENV || "development").toLowerCase();
  return env || "development";
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
export function isPaidProviderObservabilityOptInEnabled(env = process.env) {
  const raw = String(env?.[PAID_PROVIDER_OBSERVABILITY_OPT_IN_ENV] || "")
    .trim()
    .toLowerCase();
  return raw === "true" || raw === "1";
}

/**
 * @param {Record<string, unknown>} [context]
 */
export function shouldEvaluateProviderCostGuard(context = {}) {
  if (context.skipCostGuard === true) return false;
  const providerId = cleanText(context.providerId);
  if (!providerId) return false;
  const profile = getCommercialProviderBillingProfile(providerId);
  if (!profile) return true;
  if (profile.tier === "disabled") return true;
  if (profile.tier === "internal") return false;
  return profile.tier === "paid_external" || profile.tier === "unknown";
}

/**
 * @param {Record<string, unknown>} input
 */
export function evaluateProviderCostPermission(input = {}) {
  return buildProviderCostGuardDecision(input);
}

/**
 * @param {Record<string, unknown>} input
 */
export function buildProviderCostGuardDecision(input = {}) {
  const providerId = cleanText(input.providerId);
  const billingProfile = getCommercialProviderBillingProfile(providerId);
  const billingTier =
    cleanText(input.billingTier) ||
    billingProfile?.tier ||
    getCommercialProviderCostProfile(providerId)?.tier ||
    "unknown";
  const runtimeMode = cleanText(input.runtimeMode || getCommercialRuntimeMode()) || COMMERCIAL_RUNTIME_MODES.LEGACY;
  const invocationSource = cleanText(input.invocationSource || "unspecified");
  const environment = resolveEnvironment(input.environment);
  const isObservabilityOnly = input.isObservabilityOnly === true;
  const isDevEndpoint = input.isDevEndpoint === true;
  const isManualAudit = input.isManualAudit === true;
  const hasExplicitPaidProviderOptIn =
    input.hasExplicitPaidProviderOptIn === true ||
    isPaidProviderObservabilityOptInEnabled(input.env || process.env);
  const hasReusableResult = input.hasReusableResult === true;
  const isPaidProvider = billingTier === "paid_external";
  const contextProvided = input.contextProvided === true || input._contextProvided === true;

  const base = {
    version: PROVIDER_COST_GUARD_VERSION,
    providerId: providerId || null,
    billingTier,
    runtimeMode,
    invocationSource,
    environment,
    isObservabilityOnly,
    isDevEndpoint,
    isManualAudit,
    isPaidProvider,
    optInStatus: hasExplicitPaidProviderOptIn ? "enabled" : "disabled",
    hasReusableResult,
    provenance: {
      guardOrigin: "provider_cost_guard",
      invocationSource,
      runtimeMode,
      environment,
    },
  };

  if (input.skipCostGuard === true) {
    return finalizeDecision(base, {
      decision: PROVIDER_COST_GUARD_DECISIONS.ALLOW,
      reasonCode: PROVIDER_COST_GUARD_REASON_CODES.COST_GUARD_SKIPPED,
      shouldCallProvider: true,
      externalCallPrevented: false,
    });
  }

  if (billingTier === "disabled") {
    return finalizeDecision(base, {
      decision: PROVIDER_COST_GUARD_DECISIONS.BLOCK,
      reasonCode: PROVIDER_COST_GUARD_REASON_CODES.PROVIDER_DISABLED,
      shouldCallProvider: false,
      externalCallPrevented: true,
    });
  }

  if (billingTier === "internal") {
    return finalizeDecision(base, {
      decision: PROVIDER_COST_GUARD_DECISIONS.ALLOW,
      reasonCode: PROVIDER_COST_GUARD_REASON_CODES.INTERNAL_ALLOWED,
      shouldCallProvider: true,
      externalCallPrevented: false,
    });
  }

  if (billingTier === "free_external") {
    return finalizeDecision(base, {
      decision: PROVIDER_COST_GUARD_DECISIONS.ALLOW,
      reasonCode: PROVIDER_COST_GUARD_REASON_CODES.FREE_EXTERNAL_ALLOWED,
      shouldCallProvider: true,
      externalCallPrevented: false,
    });
  }

  if (billingTier === "unknown") {
    return finalizeDecision(base, {
      decision: PROVIDER_COST_GUARD_DECISIONS.BLOCK,
      reasonCode: PROVIDER_COST_GUARD_REASON_CODES.UNKNOWN_EXTERNAL_BLOCKED,
      shouldCallProvider: false,
      externalCallPrevented: true,
    });
  }

  if (hasReusableResult) {
    return finalizeDecision(base, {
      decision: PROVIDER_COST_GUARD_DECISIONS.ALLOW,
      reasonCode: PROVIDER_COST_GUARD_REASON_CODES.PAID_FUNCTIONAL_ALLOWED,
      shouldCallProvider: false,
      externalCallPrevented: true,
      shouldRecordBlockedAttempt: false,
    });
  }

  if (isDevEndpoint || isManualAudit) {
    if (hasExplicitPaidProviderOptIn) {
      return finalizeDecision(base, {
        decision: PROVIDER_COST_GUARD_DECISIONS.ALLOW,
        reasonCode: PROVIDER_COST_GUARD_REASON_CODES.PAID_OBSERVABILITY_ALLOWED_OPT_IN,
        shouldCallProvider: true,
        externalCallPrevented: false,
      });
    }

    return finalizeDecision(base, {
      decision: PROVIDER_COST_GUARD_DECISIONS.DRY_RUN,
      reasonCode: PROVIDER_COST_GUARD_REASON_CODES.DEV_PAID_DRY_RUN,
      shouldCallProvider: false,
      externalCallPrevented: true,
    });
  }

  if (isObservabilityOnly) {
    if (hasExplicitPaidProviderOptIn) {
      return finalizeDecision(base, {
        decision: PROVIDER_COST_GUARD_DECISIONS.ALLOW,
        reasonCode: PROVIDER_COST_GUARD_REASON_CODES.PAID_OBSERVABILITY_ALLOWED_OPT_IN,
        shouldCallProvider: true,
        externalCallPrevented: false,
      });
    }

    return finalizeDecision(base, {
      decision: PROVIDER_COST_GUARD_DECISIONS.BLOCK,
      reasonCode: PROVIDER_COST_GUARD_REASON_CODES.PAID_OBSERVABILITY_BLOCKED,
      shouldCallProvider: false,
      externalCallPrevented: true,
    });
  }

  if (!contextProvided && isPaidProvider) {
    return finalizeDecision(base, {
      decision: PROVIDER_COST_GUARD_DECISIONS.ALLOW,
      reasonCode: PROVIDER_COST_GUARD_REASON_CODES.LEGACY_FUNCTIONAL_DEFAULT_ALLOW,
      shouldCallProvider: true,
      externalCallPrevented: false,
    });
  }

  return finalizeDecision(base, {
    decision: PROVIDER_COST_GUARD_DECISIONS.ALLOW,
    reasonCode: PROVIDER_COST_GUARD_REASON_CODES.PAID_FUNCTIONAL_ALLOWED,
    shouldCallProvider: true,
    externalCallPrevented: false,
  });
}

function finalizeDecision(base, extra = {}) {
  const shouldCallProvider = extra.shouldCallProvider === true;
  return {
    ...base,
    decision: extra.decision || PROVIDER_COST_GUARD_DECISIONS.BLOCK,
    reasonCode: extra.reasonCode || PROVIDER_COST_GUARD_REASON_CODES.UNKNOWN_EXTERNAL_BLOCKED,
    shouldCallProvider,
    shouldRecordBlockedAttempt: extra.shouldRecordBlockedAttempt !== false && !shouldCallProvider,
    externalCallPrevented: extra.externalCallPrevented === true,
    diagnostics: buildProviderCostGuardDiagnostics({
      ...base,
      ...extra,
      shouldCallProvider,
    }),
  };
}

/**
 * @param {Record<string, unknown>} decision
 */
export function buildProviderCostGuardDiagnostics(decision = {}) {
  return {
    version: decision.version || PROVIDER_COST_GUARD_VERSION,
    providerId: decision.providerId || null,
    decision: decision.decision || null,
    reasonCode: decision.reasonCode || null,
    billingTier: decision.billingTier || null,
    runtimeMode: decision.runtimeMode || null,
    invocationSource: decision.invocationSource || null,
    isObservabilityOnly: decision.isObservabilityOnly === true,
    isDevEndpoint: decision.isDevEndpoint === true,
    optInStatus: decision.optInStatus || null,
    shouldCallProvider: decision.shouldCallProvider === true,
    externalCallPrevented: decision.externalCallPrevented === true,
  };
}

/**
 * @param {Record<string, unknown>} decision
 */
export function buildProviderCostGuardDevPayload(decision = {}) {
  return {
    version: decision.version || PROVIDER_COST_GUARD_VERSION,
    decision,
    diagnostics: buildProviderCostGuardDiagnostics(decision),
  };
}

/**
 * @param {Record<string, unknown>} [overrides]
 */
export function buildObservabilityProviderCostGuardContext(overrides = {}) {
  return normalizeCostGuardContext({
    isObservabilityOnly: true,
    isDevEndpoint: false,
    invocationSource: "commercial_runtime_shadow_pipeline",
    runtimeMode: getCommercialRuntimeMode(),
    environment: process.env.NODE_ENV,
    hasExplicitPaidProviderOptIn: isPaidProviderObservabilityOptInEnabled(),
    ...overrides,
  });
}

/**
 * @param {Record<string, unknown>} [overrides]
 */
export function buildFunctionalProviderCostGuardContext(overrides = {}) {
  return normalizeCostGuardContext({
    isObservabilityOnly: false,
    isDevEndpoint: false,
    invocationSource: "commercial_runtime_functional",
    runtimeMode: getCommercialRuntimeMode(),
    environment: process.env.NODE_ENV,
    hasExplicitPaidProviderOptIn: isPaidProviderObservabilityOptInEnabled(),
    ...overrides,
  });
}

/**
 * @param {Record<string, unknown>} [overrides]
 */
export function buildDevEndpointProviderCostGuardContext(overrides = {}) {
  return normalizeCostGuardContext({
    isObservabilityOnly: true,
    isDevEndpoint: true,
    invocationSource: "dev_endpoint",
    runtimeMode: getCommercialRuntimeMode(),
    environment: process.env.NODE_ENV,
    hasExplicitPaidProviderOptIn: isPaidProviderObservabilityOptInEnabled(),
    ...overrides,
  });
}

/**
 * @param {Record<string, unknown>} context
 */
export function normalizeCostGuardContext(context = {}) {
  const env = context.env || process.env;
  const lockedDevOptIn = context._devCommercialCostGuardLocked === true;

  return {
    ...context,
    _contextProvided: true,
    runtimeMode: cleanText(context.runtimeMode || getCommercialRuntimeMode()),
    environment: resolveEnvironment(context.environment),
    hasExplicitPaidProviderOptIn: lockedDevOptIn
      ? context.hasExplicitPaidProviderOptIn === true
      : context.hasExplicitPaidProviderOptIn === true ||
        isPaidProviderObservabilityOptInEnabled(env),
  };
}

/**
 * @param {string} providerId
 * @param {Record<string, unknown>} [context]
 */
export function evaluateProviderCostGuardForProvider(providerId = "", context = {}) {
  const contextProvided =
    context._contextProvided === true || context.contextProvided === true;
  const payload = contextProvided ? normalizeCostGuardContext(context) : { ...context };

  return buildProviderCostGuardDecision({
    providerId,
    ...payload,
    contextProvided,
  });
}

/**
 * @param {string} providerId
 * @param {Record<string, unknown>} decision
 * @param {Record<string, unknown>} [extra]
 */
export function buildProviderCostGuardBlockedResult(providerId = "", decision = {}, extra = {}) {
  const profile = getCommercialProviderCostProfile(providerId);
  return {
    ok: false,
    products: [],
    count: 0,
    error: "cost_guard_blocked",
    provider: profile?.legacyIds?.[0] || providerId,
    costGuardBlocked: true,
    costGuardDecision: decision,
    ...extra,
  };
}

/**
 * @param {Record<string, unknown>|null} [decisions]
 */
export function buildProviderCostGuardTracePatch(decisions = null) {
  const items = Array.isArray(decisions)
    ? decisions
    : decisions
      ? [decisions]
      : [];

  if (!items.length) {
    return null;
  }

  return {
    provider_cost_guard: {
      version: PROVIDER_COST_GUARD_VERSION,
      decisionCount: items.length,
      blockedCount: items.filter((entry) => entry.externalCallPrevented === true).length,
      items: items.map((entry) => buildProviderCostGuardDiagnostics(entry)),
    },
    provider_cost_guard_full: items,
  };
}

export const PROVIDER_COST_GUARD_PROVIDER_IDS = Object.freeze({
  GOOGLE_SHOPPING: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
  MERCADOLIVRE_PUBLIC: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
  APIFY_MERCADOLIVRE: COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE,
});
