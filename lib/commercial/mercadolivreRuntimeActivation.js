/**
 * PATCH Comercial 05H — Mercado Livre Runtime Controlled Activation
 *
 * Governança de ativação reversível do provider Mercado Livre público.
 * Não decide winner, ranking ou recomendação.
 */

import {
  COMMERCIAL_PROVIDER_IDS,
  getCommercialProviderById,
  getCommercialProviderOperationalMetadata,
  isMercadoLivreCommercialProviderRuntimeEnabled,
  MERCADOLIVRE_COMMERCIAL_PROVIDER_ENABLED_ENV,
} from "../productSourceAdapter/commercialProviderRegistry.js";
import { getCommercialRuntimeMode } from "../productSourceAdapter/commercialRuntimeMode.js";
import { hasMercadoLivreAccessToken } from "../productSourceAdapter/adapters/mercadoLivreClient.js";

export const MERCADOLIVRE_RUNTIME_ACTIVATION_VERSION = "05H";
export {
  isMercadoLivreCommercialProviderRuntimeEnabled,
  MERCADOLIVRE_COMMERCIAL_PROVIDER_ENABLED_ENV,
};

export const MERCADOLIVRE_RUNTIME_ACTIVATION_MODES = Object.freeze({
  DISABLED: "disabled",
  CONTROLLED: "controlled",
  SHADOW: "shadow",
});

export const MERCADOLIVRE_RUNTIME_REASON_CODES = Object.freeze({
  PROVIDER_DISABLED: "provider_disabled",
  MISSING_TOKEN: "missing_token",
  AUTH_FAILED: "auth_failed",
  RATE_LIMITED: "rate_limited",
  TIMEOUT: "timeout",
  PROVIDER_ERROR: "provider_error",
  EMPTY_RESPONSE: "empty_response",
  CIRCUIT_BREAKER_OPEN: "circuit_breaker_open",
  BUDGET_BLOCKED: "budget_blocked",
  DEV_DRY_RUN: "dev_dry_run",
});

/**
 * @param {Record<string, string|undefined>} [env]
 */
export function resolveMercadoLivreAuthMode(env = process.env) {
  if (hasMercadoLivreAccessToken(env)) return "oauth_bearer";
  return "public_api";
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
export function getMercadoLivreCommercialRegistryMetadata(env = process.env) {
  const registryEntry = getCommercialProviderById(COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC, env);
  const operational = getCommercialProviderOperationalMetadata(
    COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
    env
  );
  const runtimeEnabled = isMercadoLivreCommercialProviderRuntimeEnabled(env);

  return {
    version: MERCADOLIVRE_RUNTIME_ACTIVATION_VERSION,
    providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
    legacyProviderId: "mercadolivre",
    enabled: runtimeEnabled,
    registryStaticEnabled: registryEntry?.enabled === true,
    billingTier: operational?.billingTier || "free_external",
    runtimeCapabilities: Object.freeze(["search", "controlled_runtime"]),
    supportsControlled: operational?.supportsControlled === true,
    supportsShadow: operational?.supportsShadow === true,
    requiresAuth: operational?.requiresAuth === true,
    supportsBearerToken: true,
    timeoutMs: operational?.timeoutMs ?? 10_000,
    sourceType: "public_api",
    normalizationContractVersion: "adapter_v1",
    authMode: resolveMercadoLivreAuthMode(env),
    activationEnv: MERCADOLIVRE_COMMERCIAL_PROVIDER_ENABLED_ENV,
    providerType: registryEntry?.providerType || "search",
    registryVersion: registryEntry?.version || null,
  };
}

/**
 * @param {number} [status]
 */
export function mapMercadoLivreHttpStatusToReasonCode(status = 0) {
  if (status === 401) return MERCADOLIVRE_RUNTIME_REASON_CODES.AUTH_FAILED;
  if (status === 403) return MERCADOLIVRE_RUNTIME_REASON_CODES.AUTH_FAILED;
  if (status === 429) return MERCADOLIVRE_RUNTIME_REASON_CODES.RATE_LIMITED;
  if (status >= 500) return MERCADOLIVRE_RUNTIME_REASON_CODES.PROVIDER_ERROR;
  return MERCADOLIVRE_RUNTIME_REASON_CODES.PROVIDER_ERROR;
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function buildMercadoLivreRuntimeActivationDiagnostics(input = {}) {
  return {
    version: MERCADOLIVRE_RUNTIME_ACTIVATION_VERSION,
    enabled: input.enabled === true,
    activationMode: input.activationMode || MERCADOLIVRE_RUNTIME_ACTIVATION_MODES.DISABLED,
    providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
    authMode: input.authMode || resolveMercadoLivreAuthMode(),
    registryPosition: input.registryPosition ?? null,
    invocationSource: input.invocationSource || null,
    runtimeMode: input.runtimeMode || getCommercialRuntimeMode(),
    costGuardDecision: input.costGuardDecision || null,
    cacheStatus: input.cacheStatus || null,
    dedupStatus: input.dedupStatus || null,
    budgetDecision: input.budgetDecision || null,
    circuitState: input.circuitState || null,
    requestExecuted: input.requestExecuted === true,
    resultCount: Number.isFinite(input.resultCount) ? input.resultCount : 0,
    normalizationStatus: input.normalizationStatus || null,
    alignmentStatus: input.alignmentStatus || null,
    fallbackUsed: input.fallbackUsed === true,
    reasonCode: input.reasonCode || null,
  };
}

/**
 * @param {Record<string, unknown>|null} [payload]
 */
export function buildMercadoLivreRuntimeActivationTracePatch(payload = null) {
  if (!payload) return null;

  const diagnostics = buildMercadoLivreRuntimeActivationDiagnostics(payload);

  return {
    mercadolivre_runtime_activation: diagnostics,
    mercadolivre_runtime_activation_full: {
      version: MERCADOLIVRE_RUNTIME_ACTIVATION_VERSION,
      metadata: getMercadoLivreCommercialRegistryMetadata(),
      diagnostics,
      payload,
    },
  };
}

/**
 * @param {Record<string, unknown>} [extra]
 */
export function buildMercadoLivreProviderDisabledResult(extra = {}) {
  return {
    ok: false,
    products: [],
    count: 0,
    error: "provider_disabled",
    reasonCode: MERCADOLIVRE_RUNTIME_REASON_CODES.PROVIDER_DISABLED,
    provider: "mercadolivre",
    providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
    externalCallExecuted: false,
    ...extra,
  };
}
