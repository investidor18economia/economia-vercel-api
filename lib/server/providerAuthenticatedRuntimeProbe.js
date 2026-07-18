/**
 * SERVER-ONLY — DO NOT IMPORT FROM CLIENT COMPONENTS
 *
 * PATCH Comercial 05J.8 — Provider Authenticated Runtime Probe (validation only)
 *
 * Provider-agnostic authenticated probe orchestration.
 * Does not alter Commercial Runtime behavior — validates vault → refresh → HTTP path.
 */

import {
  evaluateProviderBudgetPermission,
  getProviderCircuitState,
} from "../commercial/providerBudgetCircuitBreaker.js";
import { PROVIDER_CREDENTIAL_READINESS } from "./providerCredentialVault.js";
import { sanitizeProviderCredentialDiagnostics } from "./providerCredentialSanitization.js";

export const PROVIDER_AUTHENTICATED_RUNTIME_PROBE_VERSION = "05J.8";

export const PROVIDER_AUTHENTICATED_RUNTIME_PROBE_CLASSIFICATIONS = Object.freeze({
  AUTHENTICATED_SUCCESS: "authenticated_success",
  CREDENTIAL_MISSING: "credential_missing",
  CREDENTIAL_EXPIRED: "credential_expired",
  REFRESH_SUCCESS: "refresh_success",
  REFRESH_FAILED: "refresh_failed",
  PROVIDER_401: "provider_401",
  PROVIDER_403: "provider_403",
  PROVIDER_429: "provider_429",
  PROVIDER_TIMEOUT: "provider_timeout",
  PROVIDER_SERVER_ERROR: "provider_server_error",
  PROVIDER_UNKNOWN_ERROR: "provider_unknown_error",
  VAULT_NOT_CONFIGURED: "vault_not_configured",
  LEGACY_TOKEN_BLOCKED: "legacy_token_blocked",
  PROBE_BLOCKED: "probe_blocked",
});

function cleanText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function hasLegacyAccessTokenEnv(env = process.env) {
  return !!cleanText(env?.MERCADOLIVRE_ACCESS_TOKEN);
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function validateProviderAuthenticatedRuntimeProbePreconditions(input = {}) {
  const env = input.env || process.env;
  const blockers = [];

  if (input.vaultConfigured !== true) {
    blockers.push("vault_not_configured");
  }
  if (input.probeEnabled !== true) {
    blockers.push("probe_not_enabled");
  }
  if (input.vaultConfigured === true && input.forbidLegacyEnvToken === true && hasLegacyAccessTokenEnv(env)) {
    blockers.push("legacy_env_token_forbidden_when_vault_active");
  }
  if (input.runtimeModeControlled !== true) {
    blockers.push("runtime_mode_not_controlled");
  }
  if (input.providerRuntimeEnabled !== true) {
    blockers.push("provider_runtime_disabled");
  }
  if (input.realExecution !== true) {
    blockers.push("real_execution_not_authorized");
  }
  if (input.externalCallsAuthorized !== true) {
    blockers.push("external_calls_not_authorized");
  }
  for (const blocker of input.extraBlockers || []) {
    if (blocker) blockers.push(String(blocker));
  }

  return {
    ok: blockers.length === 0,
    blockers,
    authorized: blockers.length === 0,
  };
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function buildProviderAuthenticatedRuntimeProbePlan(input = {}) {
  const env = input.env || process.env;
  const providerId = cleanText(input.providerId);
  const query = cleanText(input.query || "iPhone 13") || "iPhone 13";
  const preconditions = validateProviderAuthenticatedRuntimeProbePreconditions(input);

  const budget = evaluateProviderBudgetPermission({
    providerId,
    env,
  });
  const circuit = getProviderCircuitState(providerId);

  return sanitizeProviderCredentialDiagnostics({
    version: PROVIDER_AUTHENTICATED_RUNTIME_PROBE_VERSION,
    providerId,
    environment: input.environment || null,
    credentialType: input.credentialType || null,
    query,
    authorized: preconditions.authorized,
    blockers: preconditions.blockers,
    maxExternalCalls: 1,
    credentialSource: input.vaultConfigured ? "vault" : "unknown",
    vaultOnly: input.forbidLegacyEnvToken === true,
    budgetState: budget.decision || null,
    circuitState: circuit.state || null,
    requiredFlags: input.requiredFlags || [],
  });
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function classifyProviderAuthenticatedRuntimeProbeResult(input = {}) {
  const adapterResult = input.adapterResult && typeof input.adapterResult === "object" ? input.adapterResult : {};
  const credentialResolution =
    input.credentialResolution && typeof input.credentialResolution === "object"
      ? input.credentialResolution
      : {};

  if (credentialResolution.refreshDiagnostics?.refreshAttempted === true) {
    if (credentialResolution.readiness === PROVIDER_CREDENTIAL_READINESS.MISSING) {
      return PROVIDER_AUTHENTICATED_RUNTIME_PROBE_CLASSIFICATIONS.CREDENTIAL_MISSING;
    }
    if (credentialResolution.refreshDiagnostics?.refreshSucceeded !== true) {
      return PROVIDER_AUTHENTICATED_RUNTIME_PROBE_CLASSIFICATIONS.REFRESH_FAILED;
    }
    if (adapterResult.ok === true) {
      return PROVIDER_AUTHENTICATED_RUNTIME_PROBE_CLASSIFICATIONS.REFRESH_SUCCESS;
    }
    return PROVIDER_AUTHENTICATED_RUNTIME_PROBE_CLASSIFICATIONS.REFRESH_FAILED;
  }

  if (!credentialResolution.ok) {
    if (credentialResolution.readiness === PROVIDER_CREDENTIAL_READINESS.MISSING) {
      return PROVIDER_AUTHENTICATED_RUNTIME_PROBE_CLASSIFICATIONS.CREDENTIAL_MISSING;
    }
    if (credentialResolution.refreshDiagnostics?.refreshAttempted === true) {
      return PROVIDER_AUTHENTICATED_RUNTIME_PROBE_CLASSIFICATIONS.REFRESH_FAILED;
    }
    if (credentialResolution.readiness === PROVIDER_CREDENTIAL_READINESS.EXPIRED) {
      return PROVIDER_AUTHENTICATED_RUNTIME_PROBE_CLASSIFICATIONS.CREDENTIAL_EXPIRED;
    }
    if (String(credentialResolution.reasonCode || "").startsWith("refresh_")) {
      return PROVIDER_AUTHENTICATED_RUNTIME_PROBE_CLASSIFICATIONS.REFRESH_FAILED;
    }
    return PROVIDER_AUTHENTICATED_RUNTIME_PROBE_CLASSIFICATIONS.CREDENTIAL_MISSING;
  }

  const httpStatus = Number.parseInt(String(adapterResult.httpStatus ?? adapterResult.status ?? 0), 10);
  if (adapterResult.error === "timeout" || adapterResult.reasonCode === "timeout") {
    return PROVIDER_AUTHENTICATED_RUNTIME_PROBE_CLASSIFICATIONS.PROVIDER_TIMEOUT;
  }
  if (httpStatus === 401) {
    return PROVIDER_AUTHENTICATED_RUNTIME_PROBE_CLASSIFICATIONS.PROVIDER_401;
  }
  if (httpStatus === 403) {
    return PROVIDER_AUTHENTICATED_RUNTIME_PROBE_CLASSIFICATIONS.PROVIDER_403;
  }
  if (httpStatus === 429) {
    return PROVIDER_AUTHENTICATED_RUNTIME_PROBE_CLASSIFICATIONS.PROVIDER_429;
  }
  if (httpStatus >= 500) {
    return PROVIDER_AUTHENTICATED_RUNTIME_PROBE_CLASSIFICATIONS.PROVIDER_SERVER_ERROR;
  }
  if (adapterResult.ok === true) {
    return PROVIDER_AUTHENTICATED_RUNTIME_PROBE_CLASSIFICATIONS.AUTHENTICATED_SUCCESS;
  }
  return PROVIDER_AUTHENTICATED_RUNTIME_PROBE_CLASSIFICATIONS.PROVIDER_UNKNOWN_ERROR;
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function buildProviderAuthenticatedRuntimeProbeDiagnostics(input = {}) {
  const adapterResult = input.adapterResult && typeof input.adapterResult === "object" ? input.adapterResult : {};
  const credentialResolution =
    input.credentialResolution && typeof input.credentialResolution === "object"
      ? input.credentialResolution
      : {};
  const budgetBefore = input.budgetBefore || null;
  const budgetAfter = input.budgetAfter || null;

  return sanitizeProviderCredentialDiagnostics({
    version: PROVIDER_AUTHENTICATED_RUNTIME_PROBE_VERSION,
    providerId: input.providerId || null,
    environment: input.environment || null,
    credentialType: input.credentialType || null,
    credentialSource: credentialResolution.source || "vault",
    credentialStatus: credentialResolution.readiness || null,
    credentialVersion: credentialResolution.credentialVersion ?? null,
    refreshPerformed: credentialResolution.refreshDiagnostics?.refreshAttempted === true,
    refreshReason: credentialResolution.refreshDiagnostics?.refreshReasonCode || null,
    refreshSucceeded: credentialResolution.refreshDiagnostics?.refreshSucceeded === true,
    authenticationCompleted: adapterResult.ok === true,
    providerResponseClassification: input.classification || null,
    httpStatus: adapterResult.httpStatus ?? adapterResult.status ?? null,
    authHeaderSent: adapterResult.executionTelemetry?.httpRequestStarted === true,
    budgetState: budgetAfter?.decision || budgetBefore?.decision || null,
    cacheHit: adapterResult.universalCommercialCacheHit === true,
    dedupHit: adapterResult.requestDeduplicated === true,
    reasonCode: adapterResult.reasonCode || credentialResolution.reasonCode || null,
    resultCount: adapterResult.count ?? null,
    latencyMs: input.latencyMs ?? null,
  });
}

/**
 * @param {Record<string, unknown>} [input]
 */
export async function executeProviderAuthenticatedRuntimeProbe(input = {}) {
  const startedAt = Date.now();
  const plan = buildProviderAuthenticatedRuntimeProbePlan(input);

  if (!plan.authorized) {
    const classification =
      input.vaultConfigured !== true
        ? PROVIDER_AUTHENTICATED_RUNTIME_PROBE_CLASSIFICATIONS.VAULT_NOT_CONFIGURED
        : input.forbidLegacyEnvToken === true && hasLegacyAccessTokenEnv(input.env || process.env)
          ? PROVIDER_AUTHENTICATED_RUNTIME_PROBE_CLASSIFICATIONS.LEGACY_TOKEN_BLOCKED
          : PROVIDER_AUTHENTICATED_RUNTIME_PROBE_CLASSIFICATIONS.PROBE_BLOCKED;

    return {
      ok: false,
      classification,
      plan,
      diagnostics: buildProviderAuthenticatedRuntimeProbeDiagnostics({
        ...input,
        classification,
        latencyMs: Date.now() - startedAt,
      }),
      adapterResult: null,
      credentialResolution: null,
    };
  }

  let credentialResolution = null;
  if (typeof input.resolveRuntimeCredentials === "function") {
    credentialResolution = await input.resolveRuntimeCredentials(input);
  }

  let adapterResult = null;
  if (typeof input.executeAuthenticatedFetch === "function") {
    adapterResult = await input.executeAuthenticatedFetch({
      ...input,
      credentialResolution,
    });
  }

  const classification = classifyProviderAuthenticatedRuntimeProbeResult({
    adapterResult,
    credentialResolution,
  });

  const successClassifications = new Set([
    PROVIDER_AUTHENTICATED_RUNTIME_PROBE_CLASSIFICATIONS.AUTHENTICATED_SUCCESS,
    PROVIDER_AUTHENTICATED_RUNTIME_PROBE_CLASSIFICATIONS.REFRESH_SUCCESS,
  ]);

  return {
    ok: successClassifications.has(classification),
    classification,
    plan,
    diagnostics: buildProviderAuthenticatedRuntimeProbeDiagnostics({
      ...input,
      adapterResult,
      credentialResolution,
      classification,
      latencyMs: Date.now() - startedAt,
    }),
    adapterResult: sanitizeProviderCredentialDiagnostics({
      ok: adapterResult?.ok === true,
      provider: adapterResult?.provider || null,
      providerId: adapterResult?.providerId || null,
      count: adapterResult?.count ?? null,
      error: adapterResult?.error || null,
      reasonCode: adapterResult?.reasonCode || null,
      httpStatus: adapterResult?.httpStatus ?? null,
      httpStatusText: adapterResult?.httpStatusText ?? null,
      requestUrl: adapterResult?.requestUrl ?? null,
      executionTelemetry: adapterResult?.executionTelemetry || null,
      universalCommercialCacheHit: adapterResult?.universalCommercialCacheHit === true,
      requestDeduplicated: adapterResult?.requestDeduplicated === true,
      protectedFetchEntered: adapterResult?.protectedFetchEntered === true,
      externalCallRecorded: adapterResult?.externalCallRecorded === true,
    }),
    credentialResolution: sanitizeProviderCredentialDiagnostics({
      ok: credentialResolution?.ok === true,
      source: credentialResolution?.source || null,
      readiness: credentialResolution?.readiness || null,
      reasonCode: credentialResolution?.reasonCode || null,
      expiresAt: credentialResolution?.expiresAt ?? null,
      credentialVersion: credentialResolution?.credentialVersion ?? null,
      refreshDiagnostics: credentialResolution?.refreshDiagnostics || null,
      accessTokenPresent: !!credentialResolution?.accessToken,
    }),
  };
}
