/**
 * PATCH Comercial 05J.2 — Mercado Livre 403 Response & Protected Fetch Audit
 *
 * Captura sanitizada, classificação de forbidden e diagnóstico de protected fetch.
 * Não altera winner, ranking, selection ou cognição.
 */

import { COMMERCIAL_PROVIDER_IDS } from "../productSourceAdapter/commercialProviderRegistry.js";
import { COMMERCIAL_RUNTIME_MODES } from "../productSourceAdapter/commercialRuntimeMode.js";
import { isMercadoLivreOAuthTokenPersistenceConfigured } from "./mercadolivreOAuthTokenPersistence.js";

export const MERCADOLIVRE_403_PROTECTED_FETCH_AUDIT_VERSION = "05J.2";

export const MERCADOLIVRE_FORBIDDEN_CLASSIFICATIONS = Object.freeze({
  PUBLIC_ENDPOINT_AUTH_REQUIRED: "public_endpoint_auth_required",
  INVALID_ACCESS_TOKEN: "invalid_access_token",
  EXPIRED_ACCESS_TOKEN: "expired_access_token",
  FORBIDDEN_IP_OR_GEO: "forbidden_ip_or_geo",
  FORBIDDEN_USER_AGENT_OR_HEADER: "forbidden_user_agent_or_header",
  RATE_LIMITED_FORBIDDEN: "rate_limited_forbidden",
  ENDPOINT_ACCESS_RESTRICTED: "endpoint_access_restricted",
  PROVIDER_POLICY_FORBIDDEN: "provider_policy_forbidden",
  GENERIC_FORBIDDEN: "generic_forbidden",
  UNKNOWN_FORBIDDEN: "unknown_forbidden",
});

export const MERCADOLIVRE_ENDPOINT_TYPES = Object.freeze({
  SITE_SEARCH: "site_search",
  CATALOG_PRODUCTS_SEARCH: "catalog_products_search",
  PRODUCT_BY_ID: "product_by_id",
  UNKNOWN: "unknown",
});

export const MERCADOLIVRE_DEFAULT_USER_AGENT = "MIA-Commercial-Runtime/05J.2";

export const COMMERCIAL_ML_AUTHENTICATED_PROBE_ENABLED_ENV =
  "COMMERCIAL_ML_AUTHENTICATED_PROBE_ENABLED";

const MAX_BODY_PREVIEW_LEN = 500;

function cleanText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function readHeader(headers = {}, name = "") {
  if (!headers || typeof headers !== "object") return "";
  const target = cleanText(name).toLowerCase();
  if (typeof headers.get === "function") {
    return cleanText(headers.get(name) || headers.get(target) || "");
  }
  for (const [key, value] of Object.entries(headers)) {
    if (cleanText(key).toLowerCase() === target) {
      return cleanText(Array.isArray(value) ? value[0] : value);
    }
  }
  return "";
}

function hasVaultCredentialSource(env = process.env) {
  return isMercadoLivreOAuthTokenPersistenceConfigured(env);
}

function buildPublicSearchUrl(query = "", limit = 1, env = process.env) {
  const siteId = String(env?.MERCADOLIVRE_SITE_ID || "MLB").trim() || "MLB";
  const cap = Math.max(1, Number.parseInt(String(limit), 10) || 1);
  return `https://api.mercadolibre.com/sites/${encodeURIComponent(siteId)}/search?q=${encodeURIComponent(String(query || "").trim())}&limit=${cap}`;
}

/**
 * @param {Record<string, string|undefined>} [config]
 */
export function sanitizeMercadoLivreErrorBody(body = "", config = {}) {
  let safe = String(body || "");
  const secrets = [
    config?.accessToken,
    config?.clientSecret,
    config?.clientId,
  ].filter(Boolean);

  for (const secret of secrets) {
    safe = safe.split(String(secret)).join("[REDACTED]");
  }

  safe = safe.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]");
  safe = safe.replace(/access_token=[^&\s"]+/gi, "access_token=[REDACTED]");
  safe = safe.replace(/"access_token"\s*:\s*"[^"]+"/gi, '"access_token":"[REDACTED]"');

  if (safe.length > MAX_BODY_PREVIEW_LEN) {
    return `${safe.slice(0, MAX_BODY_PREVIEW_LEN)}...`;
  }
  return safe;
}

/**
 * @param {Headers|Record<string, string|string[]>|null} [headers]
 */
export function extractSafeMercadoLivreResponseHeaders(headers = null) {
  return {
    contentType: readHeader(headers, "content-type") || null,
    requestIdHeader:
      readHeader(headers, "x-request-id") ||
      readHeader(headers, "x-correlation-id") ||
      readHeader(headers, "x-amzn-requestid") ||
      null,
    retryAfterHeader: readHeader(headers, "retry-after") || null,
  };
}

/**
 * @param {Record<string, string|undefined>} [headers]
 * @param {Record<string, string|undefined>} [env]
 */
export function validateMercadoLivreRequestHeaders(headers = {}, env = process.env) {
  const authHeader = cleanText(headers.Authorization || headers.authorization || "");
  const hasBearerPrefix = /^Bearer\s/i.test(authHeader);
  const bearerValue = hasBearerPrefix ? authHeader.replace(/^Bearer\s+/i, "").trim() : "";
  const invalidEmptyBearer = hasBearerPrefix && !bearerValue;

  return {
    ok: !invalidEmptyBearer,
    acceptSent: cleanText(headers.Accept || headers.accept || "") === "application/json",
    userAgentSent: !!cleanText(headers["User-Agent"] || headers["user-agent"] || ""),
    authHeaderSent: !!bearerValue,
    invalidEmptyBearer,
    authorizationWouldBeSent: !!bearerValue,
  };
}

function parseJsonBodyPreview(preview = "") {
  const text = cleanText(preview);
  if (!text.startsWith("{") && !text.startsWith("[")) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function inferEndpointType(url = "") {
  const safe = cleanText(url);
  if (safe.includes("/sites/") && safe.includes("/search")) {
    return MERCADOLIVRE_ENDPOINT_TYPES.SITE_SEARCH;
  }
  if (safe.includes("/products/search")) {
    return MERCADOLIVRE_ENDPOINT_TYPES.CATALOG_PRODUCTS_SEARCH;
  }
  if (safe.includes("/products/")) {
    return MERCADOLIVRE_ENDPOINT_TYPES.PRODUCT_BY_ID;
  }
  return MERCADOLIVRE_ENDPOINT_TYPES.UNKNOWN;
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function classifyMercadoLivreForbiddenResponse(input = {}) {
  const status = Number(input.httpStatus || 0);
  const preview = cleanText(input.safeErrorBodyPreview || "");
  const parsed = input.parsedBody || parseJsonBodyPreview(preview);
  const message = cleanText(
    parsed?.message || parsed?.error_description || parsed?.cause?.[0]?.message || preview
  ).toLowerCase();
  const errorCode = cleanText(parsed?.error || parsed?.code || "").toLowerCase();
  const combined = `${message} ${errorCode} ${preview}`.toLowerCase();

  if (status === 429 || input.retryAfterHeader) {
    return MERCADOLIVRE_FORBIDDEN_CLASSIFICATIONS.RATE_LIMITED_FORBIDDEN;
  }

  if (/invalid.*token|token.*invalid|bad.*token|wrong.*token/.test(combined)) {
    return MERCADOLIVRE_FORBIDDEN_CLASSIFICATIONS.INVALID_ACCESS_TOKEN;
  }
  if (/expired.*token|token.*expired/.test(combined)) {
    return MERCADOLIVRE_FORBIDDEN_CLASSIFICATIONS.EXPIRED_ACCESS_TOKEN;
  }
  if (
    /authentication|authenticate|authorization required|login required|unauthorized|credentials/.test(
      combined
    )
  ) {
    return MERCADOLIVRE_FORBIDDEN_CLASSIFICATIONS.PUBLIC_ENDPOINT_AUTH_REQUIRED;
  }
  if (/geo|country|region|blocked ip|forbidden ip|access denied from/.test(combined)) {
    return MERCADOLIVRE_FORBIDDEN_CLASSIFICATIONS.FORBIDDEN_IP_OR_GEO;
  }
  if (/user-agent|user agent|header|missing header/.test(combined)) {
    return MERCADOLIVRE_FORBIDDEN_CLASSIFICATIONS.FORBIDDEN_USER_AGENT_OR_HEADER;
  }
  if (/policy|not allowed|access restricted|forbidden resource|disabled endpoint/.test(combined)) {
    return MERCADOLIVRE_FORBIDDEN_CLASSIFICATIONS.PROVIDER_POLICY_FORBIDDEN;
  }
  if (/scope|permission|not authorized to|insufficient privileges/.test(combined)) {
    return MERCADOLIVRE_FORBIDDEN_CLASSIFICATIONS.ENDPOINT_ACCESS_RESTRICTED;
  }
  if (status === 403) {
    return MERCADOLIVRE_FORBIDDEN_CLASSIFICATIONS.GENERIC_FORBIDDEN;
  }
  if (status === 401) {
    return MERCADOLIVRE_FORBIDDEN_CLASSIFICATIONS.PUBLIC_ENDPOINT_AUTH_REQUIRED;
  }
  return MERCADOLIVRE_FORBIDDEN_CLASSIFICATIONS.UNKNOWN_FORBIDDEN;
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function inspectMercadoLivreForbiddenResponse(input = {}) {
  const safeErrorBodyPreview = sanitizeMercadoLivreErrorBody(
    input.safeErrorBodyPreview || "",
    input.config || {
      accessToken: "",
      clientSecret: String(input.env?.MERCADOLIVRE_CLIENT_SECRET || "").trim(),
      clientId: String(input.env?.MERCADOLIVRE_CLIENT_ID || "").trim(),
    }
  );
  const parsedBody = parseJsonBodyPreview(safeErrorBodyPreview);
  const safeHeaders = extractSafeMercadoLivreResponseHeaders(input.responseHeaders || null);
  const classification = classifyMercadoLivreForbiddenResponse({
    httpStatus: input.httpStatus,
    safeErrorBodyPreview,
    parsedBody,
    retryAfterHeader: safeHeaders.retryAfterHeader,
  });

  const providerErrorCode = cleanText(parsedBody?.error || parsedBody?.code || "") || null;
  const providerErrorMessage =
    cleanText(parsedBody?.message || parsedBody?.error_description || "") || null;

  const reasonCode =
    input.httpStatus === 401
      ? MERCADOLIVRE_FORBIDDEN_CLASSIFICATIONS.PUBLIC_ENDPOINT_AUTH_REQUIRED
      : input.httpStatus === 429
        ? "rate_limited"
        : classification;

  return {
    version: MERCADOLIVRE_403_PROTECTED_FETCH_AUDIT_VERSION,
    httpStatus: Number(input.httpStatus || 0) || null,
    httpStatusText: cleanText(input.httpStatusText || "") || null,
    safeErrorBodyPreview,
    providerErrorCode,
    providerErrorMessage,
    requestIdHeader: safeHeaders.requestIdHeader,
    retryAfterHeader: safeHeaders.retryAfterHeader,
    contentType: safeHeaders.contentType,
    responseUrl: sanitizeMercadoLivreErrorBody(cleanText(input.responseUrl || ""), input.config),
    redirectOccurred: input.redirectOccurred === true,
    authHeaderSent: input.authHeaderSent === true,
    userAgentSent: input.userAgentSent === true,
    endpointType: input.endpointType || inferEndpointType(input.requestUrl || input.responseUrl),
    classification,
    reasonCode,
  };
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function buildMercadoLivreProtectedFetchDiagnostics(input = {}) {
  const budgetBefore = input.budgetBefore || null;
  const budgetAfter = input.budgetAfter || null;
  const circuitBefore = input.circuitBefore || null;
  const circuitAfter = input.circuitAfter || null;
  const providerResult = input.providerResult || {};

  return {
    version: MERCADOLIVRE_403_PROTECTED_FETCH_AUDIT_VERSION,
    protectedFetchEntered: input.protectedFetchEntered === true || providerResult.protectedFetchEntered === true,
    budgetEvaluated: input.budgetEvaluated === true || !!providerResult.budgetCircuitDecision,
    circuitEvaluated: input.circuitEvaluated === true || !!providerResult.budgetCircuitDecision,
    externalCallRecorded:
      input.externalCallRecorded === true || providerResult.externalCallRecorded === true,
    httpRequestStarted:
      providerResult.httpRequestStarted === true ||
      providerResult.executionTelemetry?.httpRequestStarted === true,
    httpResponseReceived:
      providerResult.httpRequestCompleted === true ||
      providerResult.executionTelemetry?.httpRequestCompleted === true,
    providerFailureRecorded: input.providerFailureRecorded === true,
    budgetBefore,
    budgetAfter,
    circuitBefore,
    circuitAfter,
    safeForbiddenDiagnostics: input.safeForbiddenDiagnostics || providerResult.safeForbiddenDiagnostics || null,
    finalForbiddenClassification:
      input.finalForbiddenClassification ||
      providerResult.safeForbiddenDiagnostics?.classification ||
      providerResult.reasonCode ||
      null,
  };
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function validateMercadoLivreProbeProtectionStack(input = {}) {
  const providerResult = input.providerResult || {};
  const issues = [];

  if (providerResult.protectedFetchEntered !== true) {
    issues.push("protected_fetch_not_entered");
  }
  if (providerResult.externalCallRecorded !== true && providerResult.httpRequestStarted === true) {
    issues.push("external_call_not_recorded");
  }
  if (
    providerResult.httpRequestStarted === true &&
    input.budgetBefore &&
    input.budgetAfter &&
    input.budgetAfter.callsUsed <= input.budgetBefore.callsUsed
  ) {
    issues.push("budget_not_incremented_after_http");
  }

  return {
    version: MERCADOLIVRE_403_PROTECTED_FETCH_AUDIT_VERSION,
    ok: issues.length === 0,
    issues,
  };
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function buildMercadoLivrePublicProbePlan(input = {}) {
  const env = input.env || process.env;
  const query = cleanText(input.query || "iPhone 13") || "iPhone 13";

  return {
    version: MERCADOLIVRE_403_PROTECTED_FETCH_AUDIT_VERSION,
    mode: "public_no_token",
    probeEnabled: String(env.COMMERCIAL_ML_CONTROLLED_PROBE_ENABLED || "").toLowerCase() === "true",
    query,
    maxExternalCalls: 1,
    runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
    providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
    authMode: "public_api",
    accessTokenConfigured: hasVaultCredentialSource(env),
    blockedProviders: [
      COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
      COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE,
    ],
    apifyExternalLimitation: "monthly_free_tier_exhausted_until_2026-07-22",
    sampleSearchUrlSanitized: buildPublicSearchUrl(query, 1, env),
    requiredEnv: {
      COMMERCIAL_ML_CONTROLLED_PROBE_ENABLED: "true",
      COMMERCIAL_RUNTIME_MODE: "controlled",
      COMMERCIAL_PROVIDER_MERCADOLIVRE_ENABLED: "true",
      COMMERCIAL_DEV_REAL_EXTERNAL_CALLS_ENABLED: "true",
      SERPAPI_KEY: "",
      APIFY_API_TOKEN: "",
      MERCADOLIVRE_SITE_ID: "MLB",
    },
    requiredFlags: ["--real", "--allow-external", "--max-calls=1"],
    cancelHint: "Omit --real or unset COMMERCIAL_ML_CONTROLLED_PROBE_ENABLED.",
  };
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function buildMercadoLivreAuthenticatedProbePlan(input = {}) {
  const env = input.env || process.env;
  const query = cleanText(input.query || "iPhone 13") || "iPhone 13";
  const vaultConfigured = hasVaultCredentialSource(env);

  return {
    version: MERCADOLIVRE_403_PROTECTED_FETCH_AUDIT_VERSION,
    mode: "vault_authenticated",
    probeEnabled:
      vaultConfigured &&
      String(env[COMMERCIAL_ML_AUTHENTICATED_PROBE_ENABLED_ENV] || "").toLowerCase() === "true",
    authorized: vaultConfigured,
    query,
    maxExternalCalls: 1,
    runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
    providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
    authMode: "oauth_bearer_vault",
    accessTokenConfigured: vaultConfigured,
    blockedProviders: [
      COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
      COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE,
    ],
    apifyExternalLimitation: "monthly_free_tier_exhausted_until_2026-07-22",
    sampleSearchUrlSanitized: buildPublicSearchUrl(query, 1, env),
    requiredEnv: {
      COMMERCIAL_ML_AUTHENTICATED_PROBE_ENABLED: "true",
      MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_ENABLED: "true",
      PROVIDER_CREDENTIAL_VAULT_ENCRYPTION_KEY: "(must be configured — never logged)",
      COMMERCIAL_RUNTIME_MODE: "controlled",
      COMMERCIAL_PROVIDER_MERCADOLIVRE_ENABLED: "true",
      COMMERCIAL_DEV_REAL_EXTERNAL_CALLS_ENABLED: "true",
      SERPAPI_KEY: "",
      APIFY_API_TOKEN: "",
    },
    requiredFlags: ["--real", "--allow-external", "--authenticated", "--max-calls=1"],
    cancelHint:
      "Requires Provider Credential Vault configured and COMMERCIAL_ML_AUTHENTICATED_PROBE_ENABLED=true. Use scripts/run-mia-mercadolivre-vault-authenticated-probe.js for vault-authenticated probes.",
  };
}
