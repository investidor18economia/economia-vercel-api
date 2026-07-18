/**
 * SERVER-ONLY — DO NOT IMPORT FROM CLIENT COMPONENTS
 *
 * PATCH Comercial 05J.8 — Mercado Livre Vault Authenticated Runtime Probe (thin adapter)
 */

import { buildMultiProviderPriorityPlan } from "./multiProviderPriorityEngine.js";
import {
  evaluateProviderBudgetPermission,
  getProviderCircuitState,
} from "./providerBudgetCircuitBreaker.js";
import {
  buildFunctionalProviderCostGuardContext,
  evaluateProviderCostGuardForProvider,
} from "./providerCostGuard.js";
import {
  createCommercialProviderExecutionLifecycle,
  recordCommercialProviderExecutionStage,
} from "./mercadolivreControlledFetchPathAudit.js";
import {
  buildMercadoLivreProtectedFetchDiagnostics,
  validateMercadoLivreProbeProtectionStack,
} from "./mercadolivre403ProtectedFetchAudit.js";
import {
  executeProviderAuthenticatedRuntimeProbe,
  PROVIDER_AUTHENTICATED_RUNTIME_PROBE_VERSION,
} from "../server/providerAuthenticatedRuntimeProbe.js";
import {
  resolveProviderCredentialEnvironment,
  PROVIDER_CREDENTIAL_TYPE_OAUTH_TOKENS,
} from "../server/providerCredentialVault.js";
import {
  isMercadoLivreOAuthTokenPersistenceConfigured,
  resolveMercadoLivreRuntimeAccessToken,
} from "./mercadolivreOAuthTokenPersistence.js";
import { fetchMercadoLivreCommercialAdapterResult } from "../productSourceAdapter/adapters/mercadoLivreAdapter.js";
import { COMMERCIAL_PROVIDER_IDS } from "../productSourceAdapter/commercialProviderRegistry.js";
import { COMMERCIAL_RUNTIME_MODES } from "../productSourceAdapter/commercialRuntimeMode.js";

export const MERCADOLIVRE_VAULT_AUTHENTICATED_RUNTIME_PROBE_VERSION = "05J.8";
export const COMMERCIAL_ML_VAULT_AUTHENTICATED_PROBE_ENABLED_ENV =
  "COMMERCIAL_ML_VAULT_AUTHENTICATED_PROBE_ENABLED";

function cleanText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function snapshotBudget(env) {
  const permission = evaluateProviderBudgetPermission({
    providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
    env,
  });
  return {
    callsUsed: permission.callsUsed,
    callsRemaining: permission.callsRemaining,
    circuitState: permission.circuitState,
    decision: permission.decision,
    reasonCode: permission.reasonCode,
  };
}

function collectMercadoLivreVaultProbeBlockers(input = {}) {
  const env = input.env || process.env;
  const blockers = [];

  if (String(env.SERPAPI_KEY || "").trim()) blockers.push("SERPAPI_KEY_must_be_empty");
  if (String(env.APIFY_API_TOKEN || "").trim()) blockers.push("APIFY_API_TOKEN_must_be_empty");

  const googleGuard = evaluateProviderCostGuardForProvider(COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING, {
    ...buildFunctionalProviderCostGuardContext({
      runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
      isManualAudit: true,
    }),
    env,
  });
  const apifyGuard = evaluateProviderCostGuardForProvider(COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE, {
    ...buildFunctionalProviderCostGuardContext({
      runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
      isManualAudit: true,
    }),
    env,
  });
  if (googleGuard.shouldCallProvider) blockers.push("google_shopping_would_execute");
  if (apifyGuard.shouldCallProvider) blockers.push("apify_mercadolivre_would_execute");

  const priorityPlan = buildMultiProviderPriorityPlan({
    runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
    env,
    invocationSource: "mercadolivre_vault_authenticated_probe",
  });
  if (priorityPlan.orderedProviders.some((entry) => entry.providerId !== COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC)) {
    blockers.push("priority_plan_includes_non_ml_provider");
  }

  const budget = evaluateProviderBudgetPermission({
    providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
    env,
  });
  const circuit = getProviderCircuitState(COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC);
  if (!budget.shouldCallProvider) blockers.push("budget_blocked");
  if (circuit.state === "open") blockers.push("circuit_open");

  return blockers;
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function buildMercadoLivreVaultAuthenticatedRuntimeProbePlan(input = {}) {
  const env = input.env || process.env;
  const vaultConfigured = isMercadoLivreOAuthTokenPersistenceConfigured(env);
  const probeEnabled =
    cleanText(env?.[COMMERCIAL_ML_VAULT_AUTHENTICATED_PROBE_ENABLED_ENV]).toLowerCase() === "true";

  return {
    version: MERCADOLIVRE_VAULT_AUTHENTICATED_RUNTIME_PROBE_VERSION,
    probeEngineVersion: PROVIDER_AUTHENTICATED_RUNTIME_PROBE_VERSION,
    mode: "vault_authenticated_only",
    vaultConfigured,
    probeEnabled,
    providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
    environment: resolveProviderCredentialEnvironment(env),
    credentialType: PROVIDER_CREDENTIAL_TYPE_OAUTH_TOKENS,
    forbidLegacyEnvToken: true,
    requiredEnv: {
      COMMERCIAL_ML_VAULT_AUTHENTICATED_PROBE_ENABLED: "true",
      MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_ENABLED: "true",
      PROVIDER_CREDENTIAL_ENCRYPTION_KEY: "(configured)",
      SUPABASE_SERVICE_ROLE_KEY: "(configured)",
      MERCADOLIVRE_ACCESS_TOKEN: "(must be unset when vault active)",
      COMMERCIAL_RUNTIME_MODE: "controlled",
      COMMERCIAL_PROVIDER_MERCADOLIVRE_ENABLED: "true",
    },
    requiredFlags: ["--real", "--allow-external", "--vault-authenticated", "--max-calls=1"],
    extraBlockers: collectMercadoLivreVaultProbeBlockers(input),
  };
}

/**
 * @param {Record<string, unknown>} [input]
 */
export async function executeMercadoLivreVaultAuthenticatedRuntimeProbe(input = {}) {
  const env = input.env || process.env;
  const query = cleanText(input.query || "iPhone 13") || "iPhone 13";
  const limit = Number.isFinite(input.limit) ? Math.max(1, input.limit) : 1;
  const vaultConfigured = isMercadoLivreOAuthTokenPersistenceConfigured(env);
  const probeEnabled =
    cleanText(env?.[COMMERCIAL_ML_VAULT_AUTHENTICATED_PROBE_ENABLED_ENV]).toLowerCase() === "true";
  const lifecycle = createCommercialProviderExecutionLifecycle({
    providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
    runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
    invocationSource: "mercadolivre_vault_authenticated_probe",
  });

  const budgetBefore = snapshotBudget(env);
  const circuitBefore = getProviderCircuitState(COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC);

  recordCommercialProviderExecutionStage(lifecycle, {
    stage: "conditional_slot_started",
    reasonCode: "vault_authenticated_probe_started",
  });

  const probeResult = await executeProviderAuthenticatedRuntimeProbe({
    env,
    providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
    environment: resolveProviderCredentialEnvironment(env),
    credentialType: PROVIDER_CREDENTIAL_TYPE_OAUTH_TOKENS,
    query,
    vaultConfigured,
    probeEnabled,
    forbidLegacyEnvToken: true,
    runtimeModeControlled: String(env.COMMERCIAL_RUNTIME_MODE || "") === COMMERCIAL_RUNTIME_MODES.CONTROLLED,
    providerRuntimeEnabled:
      String(env.COMMERCIAL_PROVIDER_MERCADOLIVRE_ENABLED || "").toLowerCase() === "true",
    realExecution: input.realExecution === true,
    externalCallsAuthorized: input.externalCallsAuthorized === true,
    requiredFlags: ["--real", "--allow-external", "--vault-authenticated"],
    extraBlockers: collectMercadoLivreVaultProbeBlockers(input),
    budgetBefore,
    async resolveRuntimeCredentials(probeInput = {}) {
      return resolveMercadoLivreRuntimeAccessToken({
        env: probeInput.env || env,
        store: probeInput.store || input.store,
        nowMs: probeInput.nowMs || input.nowMs,
        fetcher: probeInput.fetcher || input.fetcher,
      });
    },
    async executeAuthenticatedFetch(probeInput = {}) {
      const credentialResolution = probeInput.credentialResolution || {};
      if (!credentialResolution.ok || !credentialResolution.accessToken) {
        return {
          ok: false,
          provider: "mercadolivre",
          providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
          products: [],
          count: 0,
          error: credentialResolution.reasonCode || "credential_missing",
          reasonCode: credentialResolution.reasonCode || "credential_missing",
          blockedBeforeFetch: true,
          httpRequestStarted: false,
          httpRequestCompleted: false,
        };
      }

      recordCommercialProviderExecutionStage(lifecycle, {
        stage: "budget_allowed",
        reasonCode: budgetBefore.reasonCode,
      });
      recordCommercialProviderExecutionStage(lifecycle, {
        stage: "circuit_allowed",
        reasonCode: circuitBefore.state,
      });

      return fetchMercadoLivreCommercialAdapterResult({
        query,
        limit,
        env,
        credentialStore: input.store,
        nowMs: input.nowMs,
        fetcher: input.fetcher,
        invocationLayer: "mercadolivre_vault_authenticated_probe",
        executionLifecycle: lifecycle,
        costGuardContext: buildFunctionalProviderCostGuardContext({
          invocationSource: "mercadolivre_vault_authenticated_probe",
          runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
          env,
          isManualAudit: true,
        }),
      });
    },
  });

  const adapterResult = probeResult.adapterResult || {};
  const budgetAfter = snapshotBudget(env);
  const circuitAfter = getProviderCircuitState(COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC);

  recordCommercialProviderExecutionStage(lifecycle, {
    stage: "completed",
    reasonCode: probeResult.classification,
    externalCallExecuted: adapterResult.executionTelemetry?.httpRequestStarted === true,
  });

  const protectedFetchDiagnostics = buildMercadoLivreProtectedFetchDiagnostics({
    protectedFetchEntered: adapterResult.protectedFetchEntered,
    externalCallRecorded: adapterResult.externalCallRecorded,
    providerFailureRecorded: probeResult.ok !== true,
    budgetBefore,
    budgetAfter,
    circuitBefore,
    circuitAfter,
    providerResult: adapterResult,
    safeForbiddenDiagnostics: null,
    finalForbiddenClassification: probeResult.classification,
  });

  const protectionValidation = validateMercadoLivreProbeProtectionStack({
    providerResult: adapterResult,
    budgetBefore,
    budgetAfter,
  });

  return {
    ...probeResult,
    mode: "vault_authenticated_only",
    query,
    lifecycle,
    protectedFetchDiagnostics,
    protectionValidation,
    budgetBefore,
    budgetAfter,
    circuitBefore,
    circuitAfter,
  };
}
