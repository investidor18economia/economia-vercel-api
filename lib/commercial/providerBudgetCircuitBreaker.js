/**
 * PATCH Comercial 05F — Provider Budget & Circuit Breaker
 *
 * Governança operacional in-memory por processo antes de fetch externo.
 * Não decide winner, ranking ou prioridade comercial.
 */

import { createHash } from "node:crypto";
import {
  getCommercialProviderBillingProfile,
} from "./providerCostAudit.js";
import {
  evaluateExternalProviderExecutionPolicy,
  recordExternalCallAccountingEvent,
  resolveProviderExternalClass,
  getActiveExternalCallAccounting,
  getActiveRequestExecutionEnv,
} from "./externalProviderExecutionPolicy.js";

export const PROVIDER_BUDGET_CIRCUIT_VERSION = "05F";

export const PROVIDER_BUDGET_DECISIONS = Object.freeze({
  ALLOW: "allow",
  BLOCK_BUDGET_EXHAUSTED: "block_budget_exhausted",
  ALLOW_UNMETERED_INTERNAL: "allow_unmetered_internal",
  ALLOW_BUDGET_DISABLED: "allow_budget_disabled",
  BLOCK_CIRCUIT_OPEN: "block_circuit_open",
  BLOCK_HALF_OPEN_EXHAUSTED: "block_half_open_exhausted",
  BLOCK_UNKNOWN_EXTERNAL_POLICY: "block_unknown_external_policy",
});

export const PROVIDER_CIRCUIT_STATES = Object.freeze({
  CLOSED: "closed",
  OPEN: "open",
  HALF_OPEN: "half_open",
});

export const PROVIDER_BUDGET_CIRCUIT_REASON_CODES = Object.freeze({
  BUDGET_EXHAUSTED: "budget_exhausted",
  CIRCUIT_OPEN: "circuit_open",
  HALF_OPEN_EXHAUSTED: "half_open_exhausted",
  INTERNAL_UNMETERED: "internal_unmetered",
  BUDGET_DISABLED: "budget_disabled",
  UNKNOWN_EXTERNAL_BLOCKED: "unknown_external_blocked",
  ALLOWED: "allowed",
});

export const COMMERCIAL_PROVIDER_BUDGET_ENABLED_ENV = "COMMERCIAL_PROVIDER_BUDGET_ENABLED";
export const COMMERCIAL_PROVIDER_DEFAULT_MAX_CALLS_PER_WINDOW_ENV =
  "COMMERCIAL_PROVIDER_DEFAULT_MAX_CALLS_PER_WINDOW";
export const COMMERCIAL_PROVIDER_BUDGET_WINDOW_MS_ENV = "COMMERCIAL_PROVIDER_BUDGET_WINDOW_MS";
export const COMMERCIAL_PROVIDER_CIRCUIT_ENABLED_ENV = "COMMERCIAL_PROVIDER_CIRCUIT_ENABLED";
export const COMMERCIAL_PROVIDER_CIRCUIT_FAILURE_THRESHOLD_ENV =
  "COMMERCIAL_PROVIDER_CIRCUIT_FAILURE_THRESHOLD";
export const COMMERCIAL_PROVIDER_CIRCUIT_OPEN_MS_ENV = "COMMERCIAL_PROVIDER_CIRCUIT_OPEN_MS";
export const COMMERCIAL_PROVIDER_CIRCUIT_HALF_OPEN_MAX_PROBES_ENV =
  "COMMERCIAL_PROVIDER_CIRCUIT_HALF_OPEN_MAX_PROBES";

const DEFAULT_MAX_CALLS_PER_WINDOW = 100;
const DEFAULT_WINDOW_MS = 86_400_000;
const DEFAULT_FAILURE_THRESHOLD = 3;
const DEFAULT_CIRCUIT_OPEN_MS = 60_000;
const DEFAULT_HALF_OPEN_MAX_PROBES = 1;

const providerStates = new Map();
const budgetCircuitEvents = [];
const MAX_EVENT_LOG = 200;

function cleanText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function hashProviderId(providerId = "") {
  return createHash("sha256").update(cleanText(providerId).toLowerCase()).digest("hex").slice(0, 16);
}

function parseBooleanEnv(value, defaultValue = true) {
  if (value == null || value === "") return defaultValue;
  const raw = String(value).trim().toLowerCase();
  if (raw === "false" || raw === "0" || raw === "no") return false;
  if (raw === "true" || raw === "1" || raw === "yes") return true;
  return defaultValue;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function envKeyForProvider(providerId = "", suffix = "") {
  const normalized = cleanText(providerId).toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  return `COMMERCIAL_PROVIDER_${normalized}_${suffix}`;
}

function recordBudgetCircuitEvent(event = {}) {
  budgetCircuitEvents.push({
    at: Date.now(),
    ...event,
  });
  if (budgetCircuitEvents.length > MAX_EVENT_LOG) {
    budgetCircuitEvents.splice(0, budgetCircuitEvents.length - MAX_EVENT_LOG);
  }
}

function createEmptyProviderState() {
  return {
    budget: {
      windowStartedAt: Date.now(),
      callsUsed: 0,
      blockedByBudget: 0,
    },
    circuit: {
      state: PROVIDER_CIRCUIT_STATES.CLOSED,
      consecutiveFailures: 0,
      openUntil: 0,
      halfOpenProbesUsed: 0,
      lastFailureAt: null,
      lastSuccessAt: null,
    },
  };
}

function getOrCreateProviderState(providerId = "") {
  const key = cleanText(providerId).toLowerCase();
  if (!providerStates.has(key)) {
    providerStates.set(key, createEmptyProviderState());
  }
  return providerStates.get(key);
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
export function readProviderBudgetCircuitConfig(env = process.env) {
  return {
    budgetEnabled: parseBooleanEnv(env?.[COMMERCIAL_PROVIDER_BUDGET_ENABLED_ENV], true),
    circuitEnabled: parseBooleanEnv(env?.[COMMERCIAL_PROVIDER_CIRCUIT_ENABLED_ENV], true),
    defaultMaxCallsPerWindow: parsePositiveInt(
      env?.[COMMERCIAL_PROVIDER_DEFAULT_MAX_CALLS_PER_WINDOW_ENV],
      DEFAULT_MAX_CALLS_PER_WINDOW
    ),
    defaultWindowMs: parsePositiveInt(
      env?.[COMMERCIAL_PROVIDER_BUDGET_WINDOW_MS_ENV],
      DEFAULT_WINDOW_MS
    ),
    defaultFailureThreshold: parsePositiveInt(
      env?.[COMMERCIAL_PROVIDER_CIRCUIT_FAILURE_THRESHOLD_ENV],
      DEFAULT_FAILURE_THRESHOLD
    ),
    defaultCircuitOpenMs: parsePositiveInt(
      env?.[COMMERCIAL_PROVIDER_CIRCUIT_OPEN_MS_ENV],
      DEFAULT_CIRCUIT_OPEN_MS
    ),
    defaultHalfOpenMaxProbes: parsePositiveInt(
      env?.[COMMERCIAL_PROVIDER_CIRCUIT_HALF_OPEN_MAX_PROBES_ENV],
      DEFAULT_HALF_OPEN_MAX_PROBES
    ),
  };
}

/**
 * @param {string} providerId
 * @param {Record<string, string|undefined>} [env]
 */
export function resolveProviderBudgetPolicy(providerId = "", env = process.env) {
  const globalConfig = readProviderBudgetCircuitConfig(env);
  const billing = getCommercialProviderBillingProfile(providerId);
  const tier = billing?.tier || "unknown";
  const metered = tier !== "internal" && tier !== "disabled";

  const maxCallsPerWindow = parsePositiveInt(
    env?.[envKeyForProvider(providerId, "MAX_CALLS_PER_WINDOW")],
    globalConfig.defaultMaxCallsPerWindow
  );
  const windowMs = parsePositiveInt(
    env?.[envKeyForProvider(providerId, "BUDGET_WINDOW_MS")],
    globalConfig.defaultWindowMs
  );
  const circuitFailureThreshold = parsePositiveInt(
    env?.[envKeyForProvider(providerId, "CIRCUIT_FAILURE_THRESHOLD")],
    globalConfig.defaultFailureThreshold
  );
  const circuitOpenMs = parsePositiveInt(
    env?.[envKeyForProvider(providerId, "CIRCUIT_OPEN_MS")],
    globalConfig.defaultCircuitOpenMs
  );
  const halfOpenMaxProbes = parsePositiveInt(
    env?.[envKeyForProvider(providerId, "HALF_OPEN_MAX_PROBES")],
    globalConfig.defaultHalfOpenMaxProbes
  );

  return {
    providerId: cleanText(providerId).toLowerCase(),
    billingTier: tier,
    metered,
    maxCallsPerWindow,
    windowMs,
    circuitFailureThreshold,
    circuitOpenMs,
    halfOpenMaxProbes,
    budgetEnabled: globalConfig.budgetEnabled,
    circuitEnabled: globalConfig.circuitEnabled,
  };
}

/**
 * @param {string} providerId
 */
export function buildProviderBudgetKey(providerId = "") {
  return `${PROVIDER_BUDGET_CIRCUIT_VERSION}::${cleanText(providerId).toLowerCase()}`;
}

function resetBudgetWindowIfExpired(state, policy, now = Date.now()) {
  if (!state?.budget) return;
  if (now - state.budget.windowStartedAt >= policy.windowMs) {
    state.budget.windowStartedAt = now;
    state.budget.callsUsed = 0;
    state.budget.blockedByBudget = 0;
  }
}

/**
 * @param {Record<string, unknown>} state
 * @param {number} [now]
 */
export function transitionProviderCircuitState(state, targetState = "", now = Date.now()) {
  if (!state?.circuit) return state;
  state.circuit.state = targetState;
  if (targetState === PROVIDER_CIRCUIT_STATES.OPEN) {
    state.circuit.halfOpenProbesUsed = 0;
  }
  if (targetState === PROVIDER_CIRCUIT_STATES.HALF_OPEN) {
    state.circuit.halfOpenProbesUsed = 0;
    state.circuit.openUntil = 0;
  }
  if (targetState === PROVIDER_CIRCUIT_STATES.CLOSED) {
    state.circuit.consecutiveFailures = 0;
    state.circuit.halfOpenProbesUsed = 0;
    state.circuit.openUntil = 0;
    state.circuit.lastSuccessAt = now;
  }
  return state;
}

function openProviderCircuit(state, policy, now = Date.now()) {
  transitionProviderCircuitState(state, PROVIDER_CIRCUIT_STATES.OPEN, now);
  state.circuit.openUntil = now + policy.circuitOpenMs;
  state.circuit.lastFailureAt = now;
}

function maybeTransitionOpenToHalfOpen(state, policy, now = Date.now()) {
  if (state.circuit.state !== PROVIDER_CIRCUIT_STATES.OPEN) return;
  if (now >= state.circuit.openUntil) {
    transitionProviderCircuitState(state, PROVIDER_CIRCUIT_STATES.HALF_OPEN, now);
  }
}

/**
 * @param {string} providerId
 */
export function getProviderCircuitState(providerId = "") {
  const state = getOrCreateProviderState(providerId);
  return {
    providerId: cleanText(providerId).toLowerCase(),
    state: state.circuit.state,
    consecutiveFailures: state.circuit.consecutiveFailures,
    openUntil: state.circuit.openUntil,
    halfOpenProbesUsed: state.circuit.halfOpenProbesUsed,
    lastFailureAt: state.circuit.lastFailureAt,
    lastSuccessAt: state.circuit.lastSuccessAt,
  };
}

/**
 * @param {{
 *   providerId?: string,
 *   invocationSource?: string,
 *   env?: Record<string, string|undefined>,
 *   now?: number,
 *   failClosedUnknownExternal?: boolean,
 * }} input
 */
export function evaluateProviderBudgetPermission(input = {}) {
  const providerId = cleanText(input.providerId).toLowerCase();
  const policy = resolveProviderBudgetPolicy(providerId, input.env);
  const now = Number.isFinite(input.now) ? input.now : Date.now();
  const state = getOrCreateProviderState(providerId);
  resetBudgetWindowIfExpired(state, policy, now);

  const baseDiagnostics = {
    providerId,
    providerKeyHash: hashProviderId(providerId),
    billingTier: policy.billingTier,
    callsUsed: state.budget.callsUsed,
    callsRemaining: Math.max(0, policy.maxCallsPerWindow - state.budget.callsUsed),
    maxCalls: policy.maxCallsPerWindow,
    windowStartedAt: state.budget.windowStartedAt,
    windowEndsAt: state.budget.windowStartedAt + policy.windowMs,
    circuitState: state.circuit.state,
    consecutiveFailures: state.circuit.consecutiveFailures,
    failureThreshold: policy.circuitFailureThreshold,
    openUntil: state.circuit.openUntil || null,
    halfOpenProbe: state.circuit.state === PROVIDER_CIRCUIT_STATES.HALF_OPEN,
    invocationSource: input.invocationSource || null,
  };

  if (!policy.budgetEnabled && !policy.circuitEnabled) {
    return {
      ...baseDiagnostics,
      decision: PROVIDER_BUDGET_DECISIONS.ALLOW_BUDGET_DISABLED,
      reasonCode: PROVIDER_BUDGET_CIRCUIT_REASON_CODES.BUDGET_DISABLED,
      shouldCallProvider: true,
      externalCallPrevented: false,
    };
  }

  if (!policy.metered) {
    return {
      ...baseDiagnostics,
      decision: PROVIDER_BUDGET_DECISIONS.ALLOW_UNMETERED_INTERNAL,
      reasonCode: PROVIDER_BUDGET_CIRCUIT_REASON_CODES.INTERNAL_UNMETERED,
      shouldCallProvider: true,
      externalCallPrevented: false,
    };
  }

  if (policy.circuitEnabled) {
    maybeTransitionOpenToHalfOpen(state, policy, now);

    if (state.circuit.state === PROVIDER_CIRCUIT_STATES.OPEN) {
      return {
        ...baseDiagnostics,
        decision: PROVIDER_BUDGET_DECISIONS.BLOCK_CIRCUIT_OPEN,
        reasonCode: PROVIDER_BUDGET_CIRCUIT_REASON_CODES.CIRCUIT_OPEN,
        shouldCallProvider: false,
        externalCallPrevented: true,
        circuitStateBefore: PROVIDER_CIRCUIT_STATES.OPEN,
        circuitStateAfter: PROVIDER_CIRCUIT_STATES.OPEN,
      };
    }

    if (
      state.circuit.state === PROVIDER_CIRCUIT_STATES.HALF_OPEN &&
      state.circuit.halfOpenProbesUsed >= policy.halfOpenMaxProbes
    ) {
      openProviderCircuit(state, policy, now);
      return {
        ...baseDiagnostics,
        decision: PROVIDER_BUDGET_DECISIONS.BLOCK_HALF_OPEN_EXHAUSTED,
        reasonCode: PROVIDER_BUDGET_CIRCUIT_REASON_CODES.HALF_OPEN_EXHAUSTED,
        shouldCallProvider: false,
        externalCallPrevented: true,
        circuitStateBefore: PROVIDER_CIRCUIT_STATES.HALF_OPEN,
        circuitStateAfter: PROVIDER_CIRCUIT_STATES.OPEN,
      };
    }
  }

  if (policy.budgetEnabled && state.budget.callsUsed >= policy.maxCallsPerWindow) {
    state.budget.blockedByBudget += 1;
    return {
      ...baseDiagnostics,
      decision: PROVIDER_BUDGET_DECISIONS.BLOCK_BUDGET_EXHAUSTED,
      reasonCode: PROVIDER_BUDGET_CIRCUIT_REASON_CODES.BUDGET_EXHAUSTED,
      shouldCallProvider: false,
      externalCallPrevented: true,
      callsUsed: state.budget.callsUsed,
      callsRemaining: 0,
    };
  }

  return {
    ...baseDiagnostics,
    decision: PROVIDER_BUDGET_DECISIONS.ALLOW,
    reasonCode: PROVIDER_BUDGET_CIRCUIT_REASON_CODES.ALLOWED,
    shouldCallProvider: true,
    externalCallPrevented: false,
    circuitStateBefore: state.circuit.state,
    circuitStateAfter: state.circuit.state,
  };
}

/**
 * @param {string} providerId
 * @param {Record<string, unknown>} [meta]
 */
export function recordProviderExternalCall(providerId = "", meta = {}) {
  const policy = resolveProviderBudgetPolicy(providerId, meta.env);
  if (!policy.metered || !policy.budgetEnabled) return null;

  const state = getOrCreateProviderState(providerId);
  resetBudgetWindowIfExpired(state, policy, meta.now);
  state.budget.callsUsed += 1;

  if (state.circuit.state === PROVIDER_CIRCUIT_STATES.HALF_OPEN) {
    state.circuit.halfOpenProbesUsed += 1;
  }

  recordBudgetCircuitEvent({
    providerId,
    type: "external_call_started",
    callsUsed: state.budget.callsUsed,
    circuitState: state.circuit.state,
    invocationSource: meta.invocationSource || null,
  });

  return {
    providerId,
    callsUsed: state.budget.callsUsed,
    circuitState: state.circuit.state,
  };
}

const TECHNICAL_FAILURE_ERRORS = new Set([
  "timeout",
  "provider_error",
  "http_error",
  "http_forbidden",
  "auth_failed",
  "invalid_response",
  "missing_env",
  "rate_limited",
]);

/**
 * @param {Record<string, unknown>|null} result
 */
export function isProviderTechnicalFailureResult(result = null) {
  if (!result || typeof result !== "object") return true;
  if (result.threw === true) return true;
  const error = cleanText(result.error || "");
  if (TECHNICAL_FAILURE_ERRORS.has(error)) return true;
  if (result.httpStatus === 401 || result.httpStatus === 403) return true;
  if (result.httpStatus >= 500) return true;
  return false;
}

/**
 * @param {string} providerId
 * @param {Record<string, unknown>|null} result
 * @param {Record<string, unknown>} [meta]
 */
export function recordProviderCallSuccess(providerId = "", result = null, meta = {}) {
  const policy = resolveProviderBudgetPolicy(providerId, meta.env);
  if (!policy.circuitEnabled || !policy.metered) return null;

  const state = getOrCreateProviderState(providerId);
  const now = Number.isFinite(meta.now) ? meta.now : Date.now();
  const circuitStateBefore = state.circuit.state;

  if (isProviderTechnicalFailureResult(result)) {
    return recordProviderCallFailure(providerId, result, meta);
  }

  state.circuit.consecutiveFailures = 0;
  state.circuit.lastSuccessAt = now;

  if (state.circuit.state === PROVIDER_CIRCUIT_STATES.HALF_OPEN) {
    transitionProviderCircuitState(state, PROVIDER_CIRCUIT_STATES.CLOSED, now);
  }

  recordBudgetCircuitEvent({
    providerId,
    type: "success",
    circuitStateBefore,
    circuitStateAfter: state.circuit.state,
    consecutiveFailures: state.circuit.consecutiveFailures,
  });

  return getProviderCircuitState(providerId);
}

/**
 * @param {string} providerId
 * @param {Record<string, unknown>|null} result
 * @param {Record<string, unknown>} [meta]
 */
export function recordProviderCallFailure(providerId = "", result = null, meta = {}) {
  const policy = resolveProviderBudgetPolicy(providerId, meta.env);
  if (!policy.circuitEnabled || !policy.metered) return null;

  const state = getOrCreateProviderState(providerId);
  const now = Number.isFinite(meta.now) ? meta.now : Date.now();
  const circuitStateBefore = state.circuit.state;

  if (!isProviderTechnicalFailureResult(result)) {
    return recordProviderCallSuccess(providerId, result, meta);
  }

  state.circuit.consecutiveFailures += 1;
  state.circuit.lastFailureAt = now;

  if (state.circuit.state === PROVIDER_CIRCUIT_STATES.HALF_OPEN) {
    openProviderCircuit(state, policy, now);
  } else if (state.circuit.consecutiveFailures >= policy.circuitFailureThreshold) {
    openProviderCircuit(state, policy, now);
  }

  recordBudgetCircuitEvent({
    providerId,
    type: "failure",
    circuitStateBefore,
    circuitStateAfter: state.circuit.state,
    consecutiveFailures: state.circuit.consecutiveFailures,
    error: cleanText(result?.error || "provider_error").slice(0, 80),
  });

  return getProviderCircuitState(providerId);
}

/**
 * @param {string} providerId
 * @param {Record<string, unknown>|null} result
 * @param {Record<string, unknown>} [meta]
 */
export function recordProviderCallOutcome(providerId = "", result = null, meta = {}) {
  if (isProviderTechnicalFailureResult(result)) {
    return recordProviderCallFailure(providerId, result, meta);
  }
  return recordProviderCallSuccess(providerId, result, meta);
}

/**
 * @param {string} providerId
 * @param {Record<string, unknown>} permission
 * @param {Record<string, unknown>} [extra]
 */
export function buildProviderBudgetCircuitBlockedResult(
  providerId = "",
  permission = {},
  extra = {}
) {
  const error =
    permission.reasonCode === PROVIDER_BUDGET_CIRCUIT_REASON_CODES.CIRCUIT_OPEN ||
    permission.reasonCode === PROVIDER_BUDGET_CIRCUIT_REASON_CODES.HALF_OPEN_EXHAUSTED
      ? "circuit_breaker_open"
      : permission.reasonCode === PROVIDER_BUDGET_CIRCUIT_REASON_CODES.BUDGET_EXHAUSTED
        ? "budget_blocked"
        : "provider_budget_circuit_blocked";

  return {
    ok: false,
    products: [],
    count: 0,
    error,
    provider: providerId,
    budgetBlocked: permission.reasonCode === PROVIDER_BUDGET_CIRCUIT_REASON_CODES.BUDGET_EXHAUSTED,
    circuitState: permission.circuitState || null,
    reasonCode: permission.reasonCode || null,
    budgetCircuitDecision: permission,
    externalCallPrevented: true,
    ...extra,
  };
}

/**
 * @param {{
 *   providerId?: string,
 *   invocationSource?: string,
 *   env?: Record<string, string|undefined>,
 *   now?: number,
 *   failClosedUnknownExternal?: boolean,
 *   extraBlockedFields?: Record<string, unknown>,
 *   executeExternalFetch?: Function,
 * }} input
 */
export async function executeCommercialProviderProtectedFetch(input = {}) {
  const executeExternalFetch =
    typeof input.executeExternalFetch === "function" ? input.executeExternalFetch : async () => null;

  const env = input.env || getActiveRequestExecutionEnv();
  const providerId = cleanText(input.providerId);
  const externalAccounting = input.externalCallAccounting || getActiveExternalCallAccounting();

  const externalPolicy = evaluateExternalProviderExecutionPolicy({
    providerId,
    env,
    explicitExternalAuthorization: input.explicitExternalAuthorization === true,
    explicitPaidAuthorization: input.explicitPaidAuthorization === true,
    isObservabilityOnly: input.isObservabilityOnly === true,
    shadowMode: input.shadowMode === true,
    shadowProviderExecutionOverride: input.shadowProviderExecutionOverride === true,
  });

  recordExternalCallAccountingEvent(externalAccounting, {
    providerId,
    providerClass: resolveProviderExternalClass(providerId, env),
    allowed: externalPolicy.allowed,
    blocked: !externalPolicy.allowed,
    executed: false,
    reasonCode: externalPolicy.reasonCode,
    category: externalPolicy.category,
    authorizationSource: "protected_fetch_boundary",
    requestId: input.requestId || null,
  });

  if (!externalPolicy.allowed) {
    recordBudgetCircuitEvent({
      providerId,
      type: "blocked_by_external_policy",
      reasonCode: externalPolicy.reasonCode,
      externalCallPrevented: true,
    });
    return {
      ok: false,
      products: [],
      count: 0,
      error:
        externalPolicy.reasonCode === "blocked_by_test_policy"
          ? "test_policy_blocked"
          : "external_policy_blocked",
      provider: providerId,
      externalExecutionPolicy: externalPolicy,
      externalCallPrevented: true,
      ...(input.extraBlockedFields || {}),
    };
  }

  const permission = evaluateProviderBudgetPermission({
    providerId: input.providerId,
    invocationSource: input.invocationSource,
    env,
    now: input.now,
    failClosedUnknownExternal: input.failClosedUnknownExternal,
  });

  recordExternalCallAccountingEvent(externalAccounting, {
    providerId,
    providerClass: resolveProviderExternalClass(providerId, env),
    allowed: permission.shouldCallProvider === true,
    blocked: permission.shouldCallProvider !== true,
    executed: false,
    reasonCode: permission.reasonCode || null,
    category:
      permission.reasonCode === "budget_exhausted"
        ? "budget"
        : permission.reasonCode === "circuit_open"
          ? "circuit"
          : "budget_circuit",
    authorizationSource: "budget_circuit_guard",
    requestId: input.requestId || null,
    incrementConsidered: false,
  });

  if (!permission.shouldCallProvider) {
    recordBudgetCircuitEvent({
      providerId: input.providerId,
      type: "blocked_before_fetch",
      decision: permission.decision,
      reasonCode: permission.reasonCode,
      externalCallPrevented: true,
    });
    return buildProviderBudgetCircuitBlockedResult(
      input.providerId,
      permission,
      input.extraBlockedFields || {}
    );
  }

  recordProviderExternalCall(input.providerId, {
    invocationSource: input.invocationSource,
    env,
    now: input.now,
  });

  recordExternalCallAccountingEvent(externalAccounting, {
    providerId,
    providerClass: resolveProviderExternalClass(providerId, env),
    allowed: true,
    blocked: false,
    executed: true,
    reasonCode: "external_fetch_executed",
    category: "executed",
    authorizationSource: "protected_fetch_boundary",
    requestId: input.requestId || null,
    incrementConsidered: false,
  });

  const result = await executeExternalFetch();
  recordProviderCallOutcome(input.providerId, result, {
    env: input.env,
    now: input.now,
  });

  const enriched =
    result && typeof result === "object"
      ? {
          ...result,
          protectedFetchEntered: true,
          budgetCircuitDecision: permission,
          externalCallRecorded: true,
        }
      : {
          ok: false,
          products: [],
          count: 0,
          error: "provider_error",
          protectedFetchEntered: true,
          budgetCircuitDecision: permission,
          externalCallRecorded: true,
        };

  return enriched;
}

export function resetProviderBudgetState(providerId = "") {
  if (!providerId) return false;
  const state = getOrCreateProviderState(providerId);
  state.budget = {
    windowStartedAt: Date.now(),
    callsUsed: 0,
    blockedByBudget: 0,
  };
  return true;
}

export function resetProviderCircuitState(providerId = "") {
  if (!providerId) return false;
  const state = getOrCreateProviderState(providerId);
  transitionProviderCircuitState(state, PROVIDER_CIRCUIT_STATES.CLOSED);
  return true;
}

export function resetProviderBudgetCircuitState(providerId = "") {
  if (providerId) {
    providerStates.delete(cleanText(providerId).toLowerCase());
    return true;
  }
  providerStates.clear();
  budgetCircuitEvents.length = 0;
  return true;
}

/**
 * @param {string} providerId
 * @param {number} openUntil
 */
export function setProviderCircuitOpenUntilForTests(providerId = "", openUntil = 0) {
  const state = getOrCreateProviderState(providerId);
  transitionProviderCircuitState(state, PROVIDER_CIRCUIT_STATES.OPEN);
  state.circuit.openUntil = openUntil;
}

export function buildProviderBudgetCircuitDiagnostics(providerId = null) {
  const config = readProviderBudgetCircuitConfig();
  const entries = providerId
    ? [[cleanText(providerId).toLowerCase(), getOrCreateProviderState(providerId)]]
    : [...providerStates.entries()];

  return {
    version: PROVIDER_BUDGET_CIRCUIT_VERSION,
    scope: "in_memory_per_process",
    distributed: false,
    budgetEnabled: config.budgetEnabled,
    circuitEnabled: config.circuitEnabled,
    providerCount: entries.length,
    eventCount: budgetCircuitEvents.length,
    recentEvents: budgetCircuitEvents.slice(-20),
    providers: entries.map(([id, state]) => ({
      providerId: id,
      providerKeyHash: hashProviderId(id),
      callsUsed: state.budget.callsUsed,
      blockedByBudget: state.budget.blockedByBudget,
      windowStartedAt: state.budget.windowStartedAt,
      circuitState: state.circuit.state,
      consecutiveFailures: state.circuit.consecutiveFailures,
      openUntil: state.circuit.openUntil || null,
      halfOpenProbesUsed: state.circuit.halfOpenProbesUsed,
    })),
  };
}

export function buildProviderBudgetCircuitDevPayload(providerId = null) {
  return {
    version: PROVIDER_BUDGET_CIRCUIT_VERSION,
    config: readProviderBudgetCircuitConfig(),
    diagnostics: buildProviderBudgetCircuitDiagnostics(providerId),
    events: budgetCircuitEvents.slice(-50),
  };
}

export function buildProviderBudgetCircuitTracePatch() {
  return {
    provider_budget_circuit_breaker: buildProviderBudgetCircuitDiagnostics(),
    provider_budget_circuit_breaker_full: buildProviderBudgetCircuitDevPayload(),
  };
}

export function shouldAllowProviderHalfOpenProbe(providerId = "", env = process.env) {
  const permission = evaluateProviderBudgetPermission({ providerId, env });
  const state = getOrCreateProviderState(providerId);
  return (
    state.circuit.state === PROVIDER_CIRCUIT_STATES.HALF_OPEN &&
    permission.shouldCallProvider === true
  );
}
