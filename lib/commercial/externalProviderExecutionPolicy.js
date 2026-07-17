/**
 * PATCH 11A.9A — External Provider Execution Policy & Call Accounting
 *
 * Deterministic test isolation and external call instrumentation.
 * Credentials present ≠ authorization to execute.
 */

import { getCommercialProviderBillingProfile } from "./providerCostAudit.js";

export const EXTERNAL_PROVIDER_EXECUTION_POLICY_VERSION = "11A.9A.1";

export const MIA_TEST_MODE_ENV = "MIA_TEST_MODE";
export const MIA_EXTERNAL_PROVIDER_CALLS_ENABLED_ENV = "MIA_EXTERNAL_PROVIDER_CALLS_ENABLED";
export const MIA_PAID_PROVIDER_CALLS_ENABLED_ENV = "MIA_PAID_PROVIDER_CALLS_ENABLED";

export const EXTERNAL_PROVIDER_CLASSES = Object.freeze({
  INTERNAL: "internal",
  FREE_EXTERNAL: "free_external",
  PAID_EXTERNAL: "paid_external",
  UNKNOWN_EXTERNAL: "unknown_external",
  DISABLED: "disabled",
});

export const EXTERNAL_BLOCK_REASON_CODES = Object.freeze({
  INTERNAL_ALLOWED: "internal_allowed",
  BLOCKED_BY_TEST_POLICY: "blocked_by_test_policy",
  BLOCKED_BY_PAID_EXECUTION_POLICY: "blocked_by_paid_execution_policy",
  BLOCKED_BY_SHADOW_POLICY: "blocked_by_shadow_policy",
  BLOCKED_BY_MISSING_CREDENTIALS: "blocked_by_missing_credentials",
  BLOCKED_BY_PROVIDER_DISABLED: "blocked_by_provider_disabled",
  BLOCKED_BY_BUDGET: "blocked_by_budget",
  BLOCKED_BY_CIRCUIT: "blocked_by_circuit",
  BLOCKED_BY_ENVIRONMENT: "blocked_by_environment",
  BLOCKED_BY_COMMERCIAL_GATE: "blocked_by_commercial_gate",
  BLOCKED_BY_PROVIDER_POLICY: "blocked_by_provider_policy",
  AUTHORIZED_EXPLICIT: "authorized_explicit",
  AUTHORIZED_FUNCTIONAL: "authorized_functional",
});

export const SHADOW_EXECUTION_POLICY = Object.freeze({
  providerExecutionAllowed: false,
  paidExternalExecutionAllowed: false,
  requiresExplicitOverride: true,
});

function cleanText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseBooleanEnv(value, defaultValue = false) {
  if (value == null || value === "") return defaultValue;
  const raw = String(value).trim().toLowerCase();
  if (raw === "false" || raw === "0" || raw === "no") return false;
  if (raw === "true" || raw === "1" || raw === "yes") return true;
  return defaultValue;
}

export function isMiaTestMode(env = process.env) {
  if (parseBooleanEnv(env?.[MIA_TEST_MODE_ENV], false)) return true;
  if (cleanText(env?.NODE_ENV).toLowerCase() === "test") return true;
  if (parseBooleanEnv(env?.MIA_RUNTIME_ENFORCEMENT_STRICT, false)) return true;
  return false;
}

export function isExternalProviderCallsEnabled(env = process.env) {
  return parseBooleanEnv(env?.[MIA_EXTERNAL_PROVIDER_CALLS_ENABLED_ENV], false);
}

export function isPaidProviderCallsEnabled(env = process.env) {
  return parseBooleanEnv(env?.[MIA_PAID_PROVIDER_CALLS_ENABLED_ENV], false);
}

export function resolveProviderExternalClass(providerId = "", env = process.env) {
  const profile = getCommercialProviderBillingProfile(cleanText(providerId));
  const tier = cleanText(profile?.tier || "unknown");
  if (tier === "disabled") return EXTERNAL_PROVIDER_CLASSES.DISABLED;
  if (tier === "internal") return EXTERNAL_PROVIDER_CLASSES.INTERNAL;
  if (tier === "free_external") return EXTERNAL_PROVIDER_CLASSES.FREE_EXTERNAL;
  if (tier === "paid_external") return EXTERNAL_PROVIDER_CLASSES.PAID_EXTERNAL;
  return EXTERNAL_PROVIDER_CLASSES.UNKNOWN_EXTERNAL;
}

export function evaluateCredentialReadiness(providerId = "", env = process.env) {
  const profile = getCommercialProviderBillingProfile(cleanText(providerId));
  const keys = Array.isArray(profile?.envKeys) ? profile.envKeys : [];
  if (!keys.length) {
    return { ready: true, required: false, missingKeys: [] };
  }
  const missingKeys = keys.filter((key) => !cleanText(env?.[key]));
  return {
    ready: missingKeys.length === 0,
    required: true,
    missingKeys,
  };
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function resolveExternalProviderExecutionPolicy(input = {}) {
  const env = input.env || getActiveRequestExecutionEnv();
  const providerId = cleanText(input.providerId);
  const providerClass = resolveProviderExternalClass(providerId, env);
  const testMode = isMiaTestMode(env);
  const externalCallsEnabled =
    input.explicitExternalAuthorization === true || isExternalProviderCallsEnabled(env);
  const paidCallsEnabled =
    input.explicitPaidAuthorization === true || isPaidProviderCallsEnabled(env);
  const shadowMode = input.shadowMode === true || input.isObservabilityOnly === true;
  const credentials = evaluateCredentialReadiness(providerId, env);

  const base = {
    version: EXTERNAL_PROVIDER_EXECUTION_POLICY_VERSION,
    providerId: providerId || null,
    providerClass,
    testMode,
    shadowMode,
    credentialPresent: credentials.required ? credentials.ready : null,
    credentialReadiness: credentials.ready ? "ready" : credentials.required ? "missing" : "not_required",
    externalCallsEnabled,
    paidCallsEnabled,
  };

  if (providerClass === EXTERNAL_PROVIDER_CLASSES.DISABLED) {
    return finalizePolicy(base, {
      allowed: false,
      reasonCode: EXTERNAL_BLOCK_REASON_CODES.BLOCKED_BY_PROVIDER_DISABLED,
      category: "provider_disabled",
      providerExecutionAllowed: false,
      providerExecutionAvoided: true,
    });
  }

  if (providerClass === EXTERNAL_PROVIDER_CLASSES.INTERNAL) {
    return finalizePolicy(base, {
      allowed: true,
      reasonCode: EXTERNAL_BLOCK_REASON_CODES.INTERNAL_ALLOWED,
      category: "internal",
      providerExecutionAllowed: true,
      providerExecutionAvoided: false,
    });
  }

  if (credentials.required && !credentials.ready && input.enforceCredentialReadiness === true) {
    return finalizePolicy(base, {
      allowed: false,
      reasonCode: EXTERNAL_BLOCK_REASON_CODES.BLOCKED_BY_MISSING_CREDENTIALS,
      category: "credentials",
      providerExecutionAllowed: false,
      providerExecutionAvoided: true,
      missingCredentialKeys: credentials.missingKeys,
    });
  }

  if (testMode) {
    if (providerClass === EXTERNAL_PROVIDER_CLASSES.PAID_EXTERNAL && !paidCallsEnabled) {
      return finalizePolicy(base, {
        allowed: false,
        reasonCode: EXTERNAL_BLOCK_REASON_CODES.BLOCKED_BY_TEST_POLICY,
        category: "test_policy",
        providerExecutionAllowed: false,
        providerExecutionAvoided: true,
      });
    }
    if (
      (providerClass === EXTERNAL_PROVIDER_CLASSES.FREE_EXTERNAL ||
        providerClass === EXTERNAL_PROVIDER_CLASSES.UNKNOWN_EXTERNAL) &&
      !externalCallsEnabled
    ) {
      return finalizePolicy(base, {
        allowed: false,
        reasonCode: EXTERNAL_BLOCK_REASON_CODES.BLOCKED_BY_TEST_POLICY,
        category: "test_policy",
        providerExecutionAllowed: false,
        providerExecutionAvoided: true,
      });
    }
  }

  if (providerClass === EXTERNAL_PROVIDER_CLASSES.PAID_EXTERNAL && shadowMode && !paidCallsEnabled) {
    return finalizePolicy(base, {
      allowed: false,
      reasonCode: EXTERNAL_BLOCK_REASON_CODES.BLOCKED_BY_PAID_EXECUTION_POLICY,
      category: "paid_policy",
      providerExecutionAllowed: false,
      providerExecutionAvoided: true,
    });
  }

  return finalizePolicy(base, {
    allowed: true,
    reasonCode:
      externalCallsEnabled || paidCallsEnabled
        ? EXTERNAL_BLOCK_REASON_CODES.AUTHORIZED_EXPLICIT
        : EXTERNAL_BLOCK_REASON_CODES.AUTHORIZED_FUNCTIONAL,
    category: "functional",
    providerExecutionAllowed: true,
    providerExecutionAvoided: false,
  });
}

function finalizePolicy(base, extra = {}) {
  return {
    ...base,
    allowed: extra.allowed === true,
    reasonCode: extra.reasonCode || EXTERNAL_BLOCK_REASON_CODES.BLOCKED_BY_PROVIDER_POLICY,
    category: extra.category || "policy",
    providerExecutionAllowed: extra.providerExecutionAllowed === true,
    paidExternalExecutionAllowed: extra.paidExternalExecutionAllowed === true,
    providerExecutionAvoided: extra.providerExecutionAvoided === true,
    shadowExecutionPolicy: extra.shadowExecutionPolicy || null,
    missingCredentialKeys: extra.missingCredentialKeys || [],
  };
}

export function createExternalCallAccounting() {
  return {
    considered: 0,
    authorized: 0,
    blocked: 0,
    executed: 0,
    paidConsidered: 0,
    paidAuthorized: 0,
    paidBlocked: 0,
    paidExecuted: 0,
    blockedByTestPolicy: 0,
    providers: [],
  };
}

let activeExternalCallAccounting = null;
let activeRequestExecutionEnv = null;

export function bindActiveRequestExecutionEnv(env = null) {
  activeRequestExecutionEnv = env || null;
  return activeRequestExecutionEnv;
}

export function getActiveRequestExecutionEnv() {
  return activeRequestExecutionEnv || process.env;
}

export function clearActiveRequestExecutionEnv() {
  activeRequestExecutionEnv = null;
}

export function bindActiveExternalCallAccounting(enforcementCtx = null) {
  activeExternalCallAccounting =
    enforcementCtx?.externalCallAccounting ||
    enforcementCtx?.providerAccounting?.externalCallAccounting ||
    null;
  return activeExternalCallAccounting;
}

export function getActiveExternalCallAccounting() {
  return activeExternalCallAccounting;
}

export function clearActiveExternalCallAccounting() {
  activeExternalCallAccounting = null;
}

/**
 * @param {Record<string, unknown>|null} accounting
 * @param {Record<string, unknown>} event
 */
export function recordExternalCallAccountingEvent(accounting, event = {}) {
  if (!accounting) return;

  const incrementConsidered = event.incrementConsidered !== false;
  const providerClass = event.providerClass || resolveProviderExternalClass(event.providerId);
  const isPaid = providerClass === EXTERNAL_PROVIDER_CLASSES.PAID_EXTERNAL;
  const executed = event.executed === true;
  const blocked = event.blocked === true || event.allowed === false;
  const authorized = event.allowed === true && !blocked;

  if (incrementConsidered) accounting.considered += 1;
  if (isPaid && incrementConsidered) accounting.paidConsidered += 1;

  if (authorized) accounting.authorized += 1;
  if (blocked) accounting.blocked += 1;
  if (executed) accounting.executed += 1;

  if (isPaid && authorized) accounting.paidAuthorized += 1;
  if (isPaid && blocked) accounting.paidBlocked += 1;
  if (isPaid && executed) accounting.paidExecuted += 1;

  if (event.reasonCode === EXTERNAL_BLOCK_REASON_CODES.BLOCKED_BY_TEST_POLICY) {
    accounting.blockedByTestPolicy += 1;
  }

  accounting.providers.push({
    providerId: event.providerId || null,
    providerClass,
    allowed: event.allowed === true,
    blocked,
    executed,
    reasonCode: event.reasonCode || null,
    category: event.category || null,
    authorizationSource: event.authorizationSource || null,
    requestId: event.requestId || null,
  });
}

export function buildExternalPolicyBlockedResult(providerId = "", policy = {}, extra = {}) {
  return {
    ok: false,
    products: [],
    count: 0,
    error:
      policy.reasonCode === EXTERNAL_BLOCK_REASON_CODES.BLOCKED_BY_MISSING_CREDENTIALS
        ? "missing_credentials"
        : policy.reasonCode === EXTERNAL_BLOCK_REASON_CODES.BLOCKED_BY_TEST_POLICY
          ? "test_policy_blocked"
          : policy.reasonCode === EXTERNAL_BLOCK_REASON_CODES.BLOCKED_BY_SHADOW_POLICY
            ? "shadow_policy_blocked"
            : "external_policy_blocked",
    provider: providerId,
    externalPolicyBlocked: true,
    externalExecutionPolicy: policy,
    externalCallPrevented: true,
    ...extra,
  };
}

export const evaluateExternalProviderExecutionPolicy = resolveExternalProviderExecutionPolicy;

export function externalCallAccountingToTrace(accounting = null) {
  const acct = accounting || createExternalCallAccounting();
  return {
    version: EXTERNAL_PROVIDER_EXECUTION_POLICY_VERSION,
    externalCallConsideredCount: acct.considered || 0,
    externalCallAuthorizedCount: acct.authorized || 0,
    externalCallBlockedCount: acct.blocked || 0,
    externalCallExecutedCount: acct.executed || 0,
    paidExternalCallConsideredCount: acct.paidConsidered || 0,
    paidExternalCallAuthorizedCount: acct.paidAuthorized || 0,
    paidExternalCallBlockedCount: acct.paidBlocked || 0,
    paidExternalCallExecutedCount: acct.paidExecuted || 0,
    blockedByTestPolicyCount: acct.blockedByTestPolicy || 0,
    providers: acct.providers || [],
  };
}
