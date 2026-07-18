/**
 * SERVER-ONLY — DO NOT IMPORT FROM CLIENT COMPONENTS
 *
 * PATCH Comercial 05K.3 — Mercado Livre OAuth credential validation probe
 */

import { createHash } from "node:crypto";

import {
  inspectMercadoLivreForbiddenResponse,
  MERCADOLIVRE_ENDPOINT_TYPES,
} from "./mercadolivre403ProtectedFetchAudit.js";
import {
  buildMercadoLivreSearchUrl,
  searchMercadoLivreProducts,
} from "../productSourceAdapter/adapters/mercadoLivreClient.js";
import { COMMERCIAL_PROVIDER_IDS } from "../productSourceAdapter/commercialProviderRegistry.js";
import {
  getProviderCredentialMetadata,
  PROVIDER_CREDENTIAL_READINESS,
  PROVIDER_CREDENTIAL_TYPE_OAUTH_TOKENS,
  readProviderCredentialPayload,
} from "../server/providerCredentialVault.js";
import { getSupabaseAdminClient } from "../supabaseClient.js";
import {
  buildMercadoLivreOAuthCredentialStatusDiagnostics,
  isMercadoLivreOAuthTokenPersistenceConfigured,
  resolveMercadoLivreRuntimeAccessToken,
} from "./mercadolivreOAuthTokenPersistence.js";
import {
  inspectMercadoLivreOAuthEnvironmentAlignment,
  MERCADOLIVRE_OAUTH_VAULT_ENVIRONMENT_ENV,
  resolveMercadoLivreOAuthVaultEnvironment,
  summarizeMercadoLivreVaultRecordsAcrossEnvironments,
} from "./mercadolivreOAuthCredentialEnvironment.js";
import { MERCADOLIVRE_OAUTH_START_PATH } from "./mercadolivreOAuthTokenReadinessAudit.js";

export const MERCADOLIVRE_OAUTH_CREDENTIAL_VALIDATION_PROBE_VERSION = "05K.3";

export const MERCADOLIVRE_OAUTH_CREDENTIAL_VALIDATION_PROBE_ENABLED_ENV =
  "COMMERCIAL_ML_OAUTH_CREDENTIAL_VALIDATION_PROBE_ENABLED";

export const MERCADOLIVRE_OAUTH_VALIDATION_CLASSIFICATIONS = Object.freeze({
  OAUTH_CREDENTIAL_VALID: "oauth_credential_valid",
  OAUTH_CREDENTIAL_MISSING: "oauth_credential_missing",
  OAUTH_CREDENTIAL_EXPIRED: "oauth_credential_expired",
  OAUTH_REFRESH_FAILED: "oauth_refresh_failed",
  OAUTH_PROVIDER_401: "oauth_provider_401",
  OAUTH_PROVIDER_403: "oauth_provider_403",
  OAUTH_PROVIDER_TIMEOUT: "oauth_provider_timeout",
  OAUTH_VALIDATION_ENDPOINT_RESTRICTED: "oauth_validation_endpoint_restricted",
  OAUTH_UNKNOWN_FAILURE: "oauth_unknown_failure",
});

export const MERCADOLIVRE_SEARCH_REPROBE_CLASSIFICATIONS = Object.freeze({
  TOKEN_VALID_SEARCH_OPERATIONAL: "integration_operational",
  TOKEN_VALID_SEARCH_RESTRICTED: "token_valid_search_restricted",
  APP_PERMISSION_MISSING: "app_permission_missing",
  APP_CERTIFICATION_REQUIRED: "app_certification_required",
  EXTERNAL_POLICY_RESTRICTION: "external_policy_restriction",
  TOKEN_INVALID: "token_invalid",
});

export const MERCADOLIVRE_PROVIDER_OPERATIONAL_DECISIONS = Object.freeze({
  OPERATIONAL: "OPERATIONAL",
  AUTH_INCOMPLETE: "AUTH_INCOMPLETE",
  EXTERNAL_PERMISSION_BLOCKED: "EXTERNAL_PERMISSION_BLOCKED",
  CERTIFICATION_REQUIRED: "CERTIFICATION_REQUIRED",
  TEMPORARILY_DISABLED: "TEMPORARILY_DISABLED",
});

const ML_USERS_ME_URL = "https://api.mercadolibre.com/users/me";
const MAX_BODY_PREVIEW = 400;

function cleanText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function sanitizePreview(body = "", secrets = []) {
  let safe = String(body || "");
  for (const secret of secrets.filter(Boolean)) {
    safe = safe.split(String(secret)).join("[REDACTED]");
  }
  safe = safe.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]");
  safe = safe.replace(/APP_USR-[A-Za-z0-9._-]+/g, "[REDACTED_TOKEN]");
  if (safe.length > MAX_BODY_PREVIEW) return `${safe.slice(0, MAX_BODY_PREVIEW)}...`;
  return safe;
}

function fingerprint(value = "") {
  const normalized = cleanText(value);
  if (!normalized) return null;
  return createHash("sha256").update(normalized).digest("hex").slice(0, 8);
}

/**
 * @param {unknown} payload
 */
export function sanitizeMercadoLivreUsersMePayload(payload = null) {
  if (!payload || typeof payload !== "object") {
    return { authenticated: false, userId: null, siteId: null, countryId: null };
  }

  const statusValue = payload.status;
  const statusText =
    statusValue == null
      ? null
      : typeof statusValue === "object"
        ? cleanText(statusValue.site_status || statusValue.list?.allow || "")
        : String(statusValue);

  return {
    authenticated: true,
    userId: payload.id != null ? String(payload.id) : null,
    siteId: payload.site_id != null ? String(payload.site_id) : null,
    countryId: payload.country_id != null ? String(payload.country_id) : null,
    status: statusText || null,
  };
}

/**
 * @param {Record<string, unknown>} [input]
 */
export async function auditMercadoLivreOAuthVaultCredentialState(input = {}) {
  const env = input.env || process.env;
  const nowMs = Number.isFinite(input.nowMs) ? input.nowMs : Date.now();
  const alignment = inspectMercadoLivreOAuthEnvironmentAlignment(env);
  const vaultEnvironment = resolveMercadoLivreOAuthVaultEnvironment(env);
  const runtimeMetadata = await buildMercadoLivreOAuthCredentialStatusDiagnostics({
    env,
    store: input.store,
    nowMs,
  });

  let rows = [];
  const client = getSupabaseAdminClient();
  if (client) {
    const { data } = await client
      .from("provider_credentials")
      .select(
        "provider_id,environment,credential_type,status,credential_version,encryption_key_version,issued_at,expires_at,provider_account_id,scopes,updated_at"
      )
      .eq("provider_id", COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC)
      .eq("credential_type", PROVIDER_CREDENTIAL_TYPE_OAUTH_TOKENS);
    rows = data || [];
  }

  const vaultSummary = summarizeMercadoLivreVaultRecordsAcrossEnvironments({ env, rows });
  const payloadRead = await readProviderCredentialPayload({
    env,
    store: input.store,
    nowMs,
    providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
    environment: vaultEnvironment,
    credentialType: PROVIDER_CREDENTIAL_TYPE_OAUTH_TOKENS,
  });

  const metadata = await getProviderCredentialMetadata({
    env,
    store: input.store,
    nowMs,
    providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
    environment: vaultEnvironment,
    credentialType: PROVIDER_CREDENTIAL_TYPE_OAUTH_TOKENS,
  });

  return {
    version: MERCADOLIVRE_OAUTH_CREDENTIAL_VALIDATION_PROBE_VERSION,
    providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
    credentialType: PROVIDER_CREDENTIAL_TYPE_OAUTH_TOKENS,
    vaultConfigured: isMercadoLivreOAuthTokenPersistenceConfigured(env),
    alignment,
    runtimeMetadata,
    vaultSummary,
    credentialState: {
      recordFound: metadata.ok === true,
      status: metadata.status || null,
      readiness: metadata.readiness || PROVIDER_CREDENTIAL_READINESS.MISSING,
      credentialVersion: metadata.credentialVersion ?? null,
      encryptionKeyVersion: metadata.keyVersion ?? null,
      issuedAt: metadata.issuedAt ?? null,
      expiresAt: metadata.expiresAt ?? null,
      providerAccountPresent: vaultSummary.vaultRecord?.providerAccountPresent === true,
      scopesPresent: vaultSummary.vaultRecord?.scopesPresent === true,
      accessTokenPresent: payloadRead.ok === true && !!payloadRead.credentials?.accessToken,
      refreshTokenPresent: payloadRead.ok === true && !!payloadRead.credentials?.refreshToken,
      tokenTypePresent: payloadRead.ok === true && !!payloadRead.credentials?.tokenType,
      accessTokenFingerprint: fingerprint(payloadRead.credentials?.accessToken || ""),
      refreshTokenFingerprint: fingerprint(payloadRead.credentials?.refreshToken || ""),
    },
  };
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function buildMercadoLivreOAuthCompletionProcedure(input = {}) {
  const env = input.env || process.env;
  const alignment = inspectMercadoLivreOAuthEnvironmentAlignment(env);
  const redirectHost = alignment.redirectHost || "<host>";
  const startUrl = `https://${redirectHost}${MERCADOLIVRE_OAUTH_START_PATH}`;

  const steps = [
    `Open OAuth start: GET ${startUrl}`,
    "Authorize the Mercado Livre account in the browser.",
    "Complete callback and confirm response tokenPersistenceStatus=persisted.",
    "Query safe Vault metadata via scripts/test-mia-mercadolivre-oauth-credential-completion-audit.js.",
  ];

  if (alignment.divergenceRisk) {
    steps.push(
      `Set ${MERCADOLIVRE_OAUTH_VAULT_ENVIRONMENT_ENV}=production for local runtime when callback persists on Vercel production.`,
      "Alternatively complete OAuth from the same environment that runtime reads (development)."
    );
  }

  steps.push(
    "Run validation probe: node scripts/run-mia-mercadolivre-oauth-credential-validation-probe.js --real --allow-external --vault-authenticated --max-calls=2"
  );

  return {
    version: MERCADOLIVRE_OAUTH_CREDENTIAL_VALIDATION_PROBE_VERSION,
    required: alignment.divergenceRisk ? true : input.credentialMissing === true,
    steps,
    divergenceRisk: alignment.divergenceRisk,
    recommendedVaultEnvironmentOverride: alignment.divergenceRisk ? "production" : null,
  };
}

function classifyUsersMeResult(result = {}) {
  if (result.timeout) {
    return MERCADOLIVRE_OAUTH_VALIDATION_CLASSIFICATIONS.OAUTH_PROVIDER_TIMEOUT;
  }
  if (result.httpStatus === 401) {
    return MERCADOLIVRE_OAUTH_VALIDATION_CLASSIFICATIONS.OAUTH_PROVIDER_401;
  }
  if (result.httpStatus === 403) {
    return MERCADOLIVRE_OAUTH_VALIDATION_CLASSIFICATIONS.OAUTH_VALIDATION_ENDPOINT_RESTRICTED;
  }
  if (result.ok) {
    return MERCADOLIVRE_OAUTH_VALIDATION_CLASSIFICATIONS.OAUTH_CREDENTIAL_VALID;
  }
  return MERCADOLIVRE_OAUTH_VALIDATION_CLASSIFICATIONS.OAUTH_UNKNOWN_FAILURE;
}

function classifySearchReprobe(searchResult = {}, tokenValid = false) {
  if (!tokenValid) {
    return MERCADOLIVRE_SEARCH_REPROBE_CLASSIFICATIONS.TOKEN_INVALID;
  }
  if (searchResult.ok) {
    return MERCADOLIVRE_SEARCH_REPROBE_CLASSIFICATIONS.TOKEN_VALID_SEARCH_OPERATIONAL;
  }

  const preview = cleanText(searchResult.safeErrorBodyPreview || "").toLowerCase();
  if (preview.includes("policyagent") || preview.includes("pa_unauthorized_result_from_policies")) {
    return MERCADOLIVRE_SEARCH_REPROBE_CLASSIFICATIONS.APP_CERTIFICATION_REQUIRED;
  }
  if (searchResult.httpStatus === 403) {
    return MERCADOLIVRE_SEARCH_REPROBE_CLASSIFICATIONS.EXTERNAL_POLICY_RESTRICTION;
  }
  return MERCADOLIVRE_SEARCH_REPROBE_CLASSIFICATIONS.TOKEN_VALID_SEARCH_RESTRICTED;
}

function decideProviderOperationalState(input = {}) {
  if (!input.credentialPresent) {
    return MERCADOLIVRE_PROVIDER_OPERATIONAL_DECISIONS.AUTH_INCOMPLETE;
  }
  if (!input.tokenValid) {
    return input.refreshFailed
      ? MERCADOLIVRE_PROVIDER_OPERATIONAL_DECISIONS.AUTH_INCOMPLETE
      : MERCADOLIVRE_PROVIDER_OPERATIONAL_DECISIONS.AUTH_INCOMPLETE;
  }
  if (input.searchOperational) {
    return MERCADOLIVRE_PROVIDER_OPERATIONAL_DECISIONS.OPERATIONAL;
  }
  if (input.searchClassification === MERCADOLIVRE_SEARCH_REPROBE_CLASSIFICATIONS.APP_CERTIFICATION_REQUIRED) {
    return MERCADOLIVRE_PROVIDER_OPERATIONAL_DECISIONS.CERTIFICATION_REQUIRED;
  }
  if (input.searchClassification === MERCADOLIVRE_SEARCH_REPROBE_CLASSIFICATIONS.EXTERNAL_POLICY_RESTRICTION) {
    return MERCADOLIVRE_PROVIDER_OPERATIONAL_DECISIONS.EXTERNAL_PERMISSION_BLOCKED;
  }
  return MERCADOLIVRE_PROVIDER_OPERATIONAL_DECISIONS.TEMPORARILY_DISABLED;
}

/**
 * @param {Record<string, unknown>} [input]
 */
export async function executeMercadoLivreOAuthCredentialValidationProbe(input = {}) {
  const env = input.env || process.env;
  const query = cleanText(input.query || "Galaxy S24") || "Galaxy S24";
  const maxCalls = Number.isFinite(input.maxCalls) ? Math.max(1, input.maxCalls) : 2;
  const realExecution = input.realExecution === true;
  const externalAuthorized = input.externalCallsAuthorized === true;
  const vaultAuthenticated = input.vaultAuthenticated === true;
  const probeEnabled =
    cleanText(env?.[MERCADOLIVRE_OAUTH_CREDENTIAL_VALIDATION_PROBE_ENABLED_ENV]).toLowerCase() ===
    "true";

  const vaultAudit = await auditMercadoLivreOAuthVaultCredentialState(input);
  const completionProcedure = buildMercadoLivreOAuthCompletionProcedure({
    env,
    credentialMissing: vaultAudit.credentialState.readiness === PROVIDER_CREDENTIAL_READINESS.MISSING,
  });

  const blockers = [];
  if (!probeEnabled) blockers.push("probe_not_enabled");
  if (!realExecution) blockers.push("real_execution_not_authorized");
  if (!externalAuthorized) blockers.push("external_calls_not_authorized");
  if (!vaultAuthenticated) blockers.push("vault_authenticated_flag_missing");
  if (!vaultAudit.vaultConfigured) blockers.push("vault_not_configured");
  if (cleanText(env.MERCADOLIVRE_ACCESS_TOKEN)) {
    blockers.push("legacy_env_token_forbidden");
  }

  if (blockers.length) {
    return {
      version: MERCADOLIVRE_OAUTH_CREDENTIAL_VALIDATION_PROBE_VERSION,
      ok: false,
      blocked: true,
      blockers,
      vaultAudit,
      completionProcedure,
      validationClassification: null,
      searchReprobeClassification: null,
      providerDecision: MERCADOLIVRE_PROVIDER_OPERATIONAL_DECISIONS.AUTH_INCOMPLETE,
      externalCallsUsed: 0,
    };
  }

  const resolution = await resolveMercadoLivreRuntimeAccessToken({
    env,
    store: input.store,
    nowMs: input.nowMs,
    fetcher: input.fetcher,
  });

  let validationClassification = MERCADOLIVRE_OAUTH_VALIDATION_CLASSIFICATIONS.OAUTH_UNKNOWN_FAILURE;
  let usersMeResult = null;
  let searchReprobe = null;
  let externalCallsUsed = 0;

  if (!resolution.ok || !resolution.accessToken) {
    if (resolution.readiness === PROVIDER_CREDENTIAL_READINESS.MISSING) {
      validationClassification = MERCADOLIVRE_OAUTH_VALIDATION_CLASSIFICATIONS.OAUTH_CREDENTIAL_MISSING;
    } else if (resolution.readiness === PROVIDER_CREDENTIAL_READINESS.EXPIRED) {
      validationClassification =
        resolution.refreshDiagnostics?.refreshSucceeded === true
          ? MERCADOLIVRE_OAUTH_VALIDATION_CLASSIFICATIONS.OAUTH_CREDENTIAL_VALID
          : MERCADOLIVRE_OAUTH_VALIDATION_CLASSIFICATIONS.OAUTH_REFRESH_FAILED;
    } else if (resolution.reasonCode === "refresh_failed") {
      validationClassification = MERCADOLIVRE_OAUTH_VALIDATION_CLASSIFICATIONS.OAUTH_REFRESH_FAILED;
    } else {
      validationClassification = MERCADOLIVRE_OAUTH_VALIDATION_CLASSIFICATIONS.OAUTH_CREDENTIAL_MISSING;
    }
  } else if (externalCallsUsed < maxCalls) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = controller
      ? setTimeout(() => controller.abort(), 10_000)
      : null;

    try {
      const response = await (input.fetcher || globalThis.fetch)(ML_USERS_ME_URL, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${resolution.accessToken}`,
        },
        signal: controller?.signal,
      });
      externalCallsUsed += 1;
      const bodyText = await response.text();
      let parsed = null;
      try {
        parsed = JSON.parse(bodyText);
      } catch {
        parsed = null;
      }

      usersMeResult = {
        ok: response.ok,
        httpStatus: response.status,
        httpStatusText: response.statusText,
        sanitizedIdentity: sanitizeMercadoLivreUsersMePayload(parsed),
        authHeaderSent: true,
        endpoint: ML_USERS_ME_URL,
      };
      validationClassification = classifyUsersMeResult(usersMeResult);
    } catch (err) {
      usersMeResult = {
        ok: false,
        timeout: err?.name === "AbortError",
        httpStatus: null,
        sanitizedIdentity: sanitizeMercadoLivreUsersMePayload(null),
        authHeaderSent: true,
        endpoint: ML_USERS_ME_URL,
      };
      validationClassification = classifyUsersMeResult(usersMeResult);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  const tokenValid =
    validationClassification === MERCADOLIVRE_OAUTH_VALIDATION_CLASSIFICATIONS.OAUTH_CREDENTIAL_VALID;

  if (tokenValid && externalCallsUsed < maxCalls) {
    const searchResult = await searchMercadoLivreProducts(query, 1, {
      env,
      store: input.store,
      nowMs: input.nowMs,
      fetcher: input.fetcher,
    });
    externalCallsUsed += 1;

    const forbiddenDiagnostics =
      searchResult.safeForbiddenDiagnostics ||
      (searchResult.httpStatus === 403
        ? inspectMercadoLivreForbiddenResponse({
            httpStatus: searchResult.httpStatus,
            httpStatusText: searchResult.httpStatusText,
            safeErrorBodyPreview: searchResult.safeErrorBodyPreview,
            requestUrl: searchResult.requestUrl,
            authHeaderSent: searchResult.authHeaderSent,
            userAgentSent: searchResult.userAgentSent,
            endpointType: MERCADOLIVRE_ENDPOINT_TYPES.SITE_SEARCH,
            env,
          })
        : null);

    searchReprobe = {
      ok: searchResult.ok === true,
      httpStatus: searchResult.httpStatus ?? null,
      error: searchResult.error || null,
      requestUrl: buildMercadoLivreSearchUrl(query, 1, env),
      safeErrorBodyPreview: searchResult.safeErrorBodyPreview || null,
      authHeaderSent: searchResult.authHeaderSent === true,
      classification: classifySearchReprobe(searchResult, tokenValid),
      forbiddenDiagnostics,
    };
  }

  const searchReprobeClassification = searchReprobe?.classification || null;
  const providerDecision = decideProviderOperationalState({
    credentialPresent: vaultAudit.credentialState.recordFound || resolution.ok,
    tokenValid,
    refreshFailed:
      validationClassification === MERCADOLIVRE_OAUTH_VALIDATION_CLASSIFICATIONS.OAUTH_REFRESH_FAILED,
    searchOperational: searchReprobe?.ok === true,
    searchClassification: searchReprobeClassification,
  });

  return {
    version: MERCADOLIVRE_OAUTH_CREDENTIAL_VALIDATION_PROBE_VERSION,
    ok: tokenValid,
    blocked: false,
    blockers: [],
    vaultAudit,
    completionProcedure,
    credentialResolution: {
      source: resolution.source,
      readiness: resolution.readiness,
      reasonCode: resolution.reasonCode,
      expiresAt: resolution.expiresAt,
      credentialVersion: resolution.credentialVersion,
      refreshAttempted: resolution.refreshDiagnostics?.refreshAttempted === true,
      refreshSucceeded: resolution.refreshDiagnostics?.refreshSucceeded === true,
      refreshReasonCode: resolution.refreshDiagnostics?.refreshReasonCode || null,
    },
    validationClassification,
    usersMeResult,
    searchReprobe,
    searchReprobeClassification,
    providerDecision,
    externalCallsUsed,
    recommendDisableProductionFlag:
      providerDecision === MERCADOLIVRE_PROVIDER_OPERATIONAL_DECISIONS.EXTERNAL_PERMISSION_BLOCKED ||
      providerDecision === MERCADOLIVRE_PROVIDER_OPERATIONAL_DECISIONS.CERTIFICATION_REQUIRED,
    recommendedProductionFlag:
      providerDecision === MERCADOLIVRE_PROVIDER_OPERATIONAL_DECISIONS.EXTERNAL_PERMISSION_BLOCKED ||
      providerDecision === MERCADOLIVRE_PROVIDER_OPERATIONAL_DECISIONS.CERTIFICATION_REQUIRED
        ? "COMMERCIAL_PROVIDER_MERCADOLIVRE_ENABLED=false"
        : null,
  };
}
