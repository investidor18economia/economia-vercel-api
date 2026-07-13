/**
 * PATCH Comercial 05J.3 — Mercado Livre OAuth Token Readiness Audit
 *
 * Local-only readiness diagnostics for authenticated probe preparation.
 * Never logs or returns access tokens, refresh tokens, or client secrets.
 */

import { createHash } from "node:crypto";

import {
  buildMercadoLivreAuthenticatedProbePlan as buildProtectedAuthenticatedProbePlan,
  COMMERCIAL_ML_AUTHENTICATED_PROBE_ENABLED_ENV,
  validateMercadoLivreRequestHeaders,
} from "./mercadolivre403ProtectedFetchAudit.js";
import { buildMultiProviderPriorityPlan } from "./multiProviderPriorityEngine.js";
import { evaluateProviderBudgetPermission, getProviderCircuitState } from "./providerBudgetCircuitBreaker.js";
import {
  buildFunctionalProviderCostGuardContext,
  evaluateProviderCostGuardForProvider,
} from "./providerCostGuard.js";
import {
  buildMercadoLivreAuthorizationUrl,
  validateMercadoLivreOAuthEnv,
} from "../productSourceAdapter/adapters/mercadoLivreOAuth.js";
import {
  buildMercadoLivreRequestHeaders,
  validateMercadoLivreEnv,
} from "../productSourceAdapter/adapters/mercadoLivreClient.js";
import { COMMERCIAL_PROVIDER_IDS } from "../productSourceAdapter/commercialProviderRegistry.js";
import { COMMERCIAL_RUNTIME_MODES } from "../productSourceAdapter/commercialRuntimeMode.js";

export const MERCADOLIVRE_OAUTH_TOKEN_READINESS_AUDIT_VERSION = "05J.3";

export const MERCADOLIVRE_OAUTH_READINESS_CLASSIFICATIONS = Object.freeze({
  READY_VALID_TOKEN_PRESENT: "READY_VALID_TOKEN_PRESENT",
  READY_TOKEN_PRESENT_EXPIRY_UNKNOWN: "READY_TOKEN_PRESENT_EXPIRY_UNKNOWN",
  TOKEN_MISSING: "TOKEN_MISSING",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  TOKEN_FORMAT_INVALID: "TOKEN_FORMAT_INVALID",
  REFRESH_TOKEN_AVAILABLE: "REFRESH_TOKEN_AVAILABLE",
  REFRESH_TOKEN_MISSING: "REFRESH_TOKEN_MISSING",
  OAUTH_CONFIG_INCOMPLETE: "OAUTH_CONFIG_INCOMPLETE",
  CALLBACK_NOT_PERSISTING_TOKEN: "CALLBACK_NOT_PERSISTING_TOKEN",
  REDIRECT_URI_MISMATCH_RISK: "REDIRECT_URI_MISMATCH_RISK",
  STATE_VALIDATION_MISSING: "STATE_VALIDATION_MISSING",
  SECRET_EXPOSURE_RISK: "SECRET_EXPOSURE_RISK",
  AUTHENTICATED_PROBE_NOT_SAFE: "AUTHENTICATED_PROBE_NOT_SAFE",
  UNKNOWN_READINESS: "UNKNOWN_READINESS",
});

export const MERCADOLIVRE_OAUTH_ENV_KEYS = Object.freeze({
  CLIENT_ID: "MERCADOLIVRE_CLIENT_ID",
  CLIENT_SECRET: "MERCADOLIVRE_CLIENT_SECRET",
  REDIRECT_URI: "MERCADOLIVRE_REDIRECT_URI",
  ACCESS_TOKEN: "MERCADOLIVRE_ACCESS_TOKEN",
  REFRESH_TOKEN: "MERCADOLIVRE_REFRESH_TOKEN",
  SITE_ID: "MERCADOLIVRE_SITE_ID",
  TOKEN_EXPIRES_IN: "MERCADOLIVRE_TOKEN_EXPIRES_IN",
  TOKEN_ISSUED_AT: "MERCADOLIVRE_TOKEN_ISSUED_AT",
  TOKEN_CREATED_AT: "MERCADOLIVRE_TOKEN_CREATED_AT",
  TOKEN_EXPIRES_AT: "MERCADOLIVRE_TOKEN_EXPIRES_AT",
});

export const MERCADOLIVRE_OAUTH_CALLBACK_PATH = "/api/auth/mercadolivre/callback";
export const MERCADOLIVRE_OAUTH_START_PATH = "/api/auth/mercadolivre/start";

const MIN_ACCESS_TOKEN_LEN = 16;
const ML_TOKEN_PREFIX_PATTERN = /^(APP_USR-|TEST-|TG-|MLB[A-Z0-9-]+-)/i;

function cleanText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function readEnvValue(env = process.env, key = "") {
  return cleanText(env?.[key] || "");
}

function parsePositiveInt(value = "") {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseTimestamp(value = "") {
  const text = cleanText(value);
  if (!text) return null;
  if (/^\d+$/.test(text)) {
    const numeric = Number.parseInt(text, 10);
    return numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function computeTokenFingerprint(token = "") {
  const normalized = cleanText(token);
  if (!normalized) return null;
  return createHash("sha256").update(normalized).digest("hex").slice(0, 8);
}

function normalizeAccessTokenForRuntime(raw = "") {
  let token = cleanText(raw);
  if (/^Bearer\s+/i.test(token)) {
    token = token.replace(/^Bearer\s+/i, "").trim();
  }
  return token;
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
export function inspectMercadoLivreOAuthConfiguration(env = process.env) {
  const oauthValidation = validateMercadoLivreOAuthEnv(env);
  const mlValidation = validateMercadoLivreEnv(env);
  const siteId = readEnvValue(env, MERCADOLIVRE_OAUTH_ENV_KEYS.SITE_ID) || "MLB";
  const redirectUri = readEnvValue(env, MERCADOLIVRE_OAUTH_ENV_KEYS.REDIRECT_URI);

  return {
    version: MERCADOLIVRE_OAUTH_TOKEN_READINESS_AUDIT_VERSION,
    oauthConfigComplete: oauthValidation.ok,
    clientIdPresent: mlValidation.hasClientId,
    clientSecretPresent: mlValidation.hasClientSecret,
    redirectUriPresent: mlValidation.hasRedirectUri,
    siteId,
    missingOAuthKeys: oauthValidation.missing || [],
    redirectUri,
  };
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
export function inspectMercadoLivreTokenPresence(env = process.env) {
  const rawAccessToken = readEnvValue(env, MERCADOLIVRE_OAUTH_ENV_KEYS.ACCESS_TOKEN);
  const normalizedAccessToken = normalizeAccessTokenForRuntime(rawAccessToken);
  const refreshToken = readEnvValue(env, MERCADOLIVRE_OAUTH_ENV_KEYS.REFRESH_TOKEN);

  return {
    accessTokenPresent: !!normalizedAccessToken,
    accessTokenLength: normalizedAccessToken ? normalizedAccessToken.length : 0,
    accessTokenFingerprint: computeTokenFingerprint(normalizedAccessToken),
    refreshTokenPresent: !!refreshToken,
    refreshTokenLength: refreshToken ? refreshToken.length : 0,
    refreshTokenFingerprint: computeTokenFingerprint(refreshToken),
  };
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
export function inspectMercadoLivreTokenMetadata(env = process.env) {
  const expiresIn = parsePositiveInt(readEnvValue(env, MERCADOLIVRE_OAUTH_ENV_KEYS.TOKEN_EXPIRES_IN));
  const issuedAt =
    parseTimestamp(readEnvValue(env, MERCADOLIVRE_OAUTH_ENV_KEYS.TOKEN_ISSUED_AT)) ||
    parseTimestamp(readEnvValue(env, MERCADOLIVRE_OAUTH_ENV_KEYS.TOKEN_CREATED_AT));
  const expiresAtDirect = parseTimestamp(readEnvValue(env, MERCADOLIVRE_OAUTH_ENV_KEYS.TOKEN_EXPIRES_AT));
  const expiresAtComputed =
    expiresAtDirect || (issuedAt && expiresIn ? issuedAt + expiresIn * 1000 : null);

  return {
    expiresInSeconds: expiresIn,
    issuedAtMs: issuedAt,
    expiresAtMs: expiresAtComputed,
    expiryMetadataPresent: !!(expiresIn || issuedAt || expiresAtDirect),
  };
}

/**
 * @param {string} token
 */
export function validateMercadoLivreAccessTokenShape(token = "") {
  const raw = String(token ?? "");
  const trimmed = cleanText(raw);

  if (!trimmed) {
    return {
      ok: false,
      present: false,
      reasonCode: MERCADOLIVRE_OAUTH_READINESS_CLASSIFICATIONS.TOKEN_MISSING,
      hasBearerPrefix: false,
      hasWhitespaceInside: /\s/.test(raw.replace(/^\s+|\s+$/g, "")),
      length: 0,
      matchesKnownPrefix: false,
    };
  }

  const hasBearerPrefix = /^Bearer\s+/i.test(trimmed);
  const normalized = normalizeAccessTokenForRuntime(trimmed);
  const hasWhitespaceInside = /\s/.test(normalized);
  const length = normalized.length;
  const matchesKnownPrefix = ML_TOKEN_PREFIX_PATTERN.test(normalized);
  const longEnough = length >= MIN_ACCESS_TOKEN_LEN;
  const ok = !hasBearerPrefix && !hasWhitespaceInside && longEnough;

  return {
    ok,
    present: true,
    reasonCode: ok
      ? null
      : MERCADOLIVRE_OAUTH_READINESS_CLASSIFICATIONS.TOKEN_FORMAT_INVALID,
    hasBearerPrefix,
    hasWhitespaceInside,
    length,
    matchesKnownPrefix,
    normalizedLength: length,
  };
}

/**
 * @param {Record<string, string|undefined>} [env]
 * @param {number} [nowMs]
 */
export function evaluateMercadoLivreTokenExpiry(env = process.env, nowMs = Date.now()) {
  const metadata = inspectMercadoLivreTokenMetadata(env);
  const presence = inspectMercadoLivreTokenPresence(env);

  if (!presence.accessTokenPresent) {
    return {
      accessTokenExpiryKnown: false,
      accessTokenExpired: false,
      expiresAtMs: null,
      remainingMs: null,
      reasonCode: MERCADOLIVRE_OAUTH_READINESS_CLASSIFICATIONS.TOKEN_MISSING,
    };
  }

  if (!metadata.expiryMetadataPresent || !metadata.expiresAtMs) {
    return {
      accessTokenExpiryKnown: false,
      accessTokenExpired: false,
      expiresAtMs: null,
      remainingMs: null,
      reasonCode: MERCADOLIVRE_OAUTH_READINESS_CLASSIFICATIONS.READY_TOKEN_PRESENT_EXPIRY_UNKNOWN,
    };
  }

  const remainingMs = metadata.expiresAtMs - nowMs;
  const accessTokenExpired = remainingMs <= 0;

  return {
    accessTokenExpiryKnown: true,
    accessTokenExpired,
    expiresAtMs: metadata.expiresAtMs,
    remainingMs,
    reasonCode: accessTokenExpired
      ? MERCADOLIVRE_OAUTH_READINESS_CLASSIFICATIONS.TOKEN_EXPIRED
      : MERCADOLIVRE_OAUTH_READINESS_CLASSIFICATIONS.READY_VALID_TOKEN_PRESENT,
  };
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function inspectMercadoLivreOAuthCallbackPersistence(input = {}) {
  const callbackSource = String(input.callbackSource || "");
  const exchangesCode = callbackSource.includes("exchangeMercadoLivreAuthorizationCode");
  const returnsAccessTokenField = /access_token\s*:/.test(callbackSource);
  const returnsRefreshTokenField = /refresh_token\s*:/.test(callbackSource);
  const returnsExpiresInField = /expires_in\s*:/.test(callbackSource);
  const persistsToEnv =
    callbackSource.includes("process.env.MERCADOLIVRE_ACCESS_TOKEN") ||
    callbackSource.includes("writeFile") ||
    callbackSource.includes("supabase") ||
    callbackSource.includes(".insert(");
  const validatesState =
    callbackSource.includes("req.query.state") || callbackSource.includes("query.state");

  return {
    exchangesCode,
    persistsToken: persistsToEnv,
    exposesAccessTokenInResponse: returnsAccessTokenField,
    exposesRefreshTokenInResponse: returnsRefreshTokenField,
    preservesExpiresInInResponse: returnsExpiresInField,
    validatesState,
    persistenceMode: persistsToEnv ? "automatic" : "manual_env_required",
  };
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function validateMercadoLivreOAuthStateProtection(input = {}) {
  const startSource = String(input.startSource || "");
  const callbackSource = String(input.callbackSource || "");
  const authorizationUrlBuilder = input.authorizationUrlBuilder || null;

  const startPassesState =
    startSource.includes("state") ||
    (typeof authorizationUrlBuilder === "function" &&
      String(authorizationUrlBuilder({}, { state: "probe-state" }).url || "").includes("state="));
  const callbackValidatesState =
    callbackSource.includes("req.query.state") || callbackSource.includes("query.state");

  return {
    stateValidationPresent: startPassesState && callbackValidatesState,
    startPassesState,
    callbackValidatesState,
    riskLevel: startPassesState && callbackValidatesState ? "low" : "medium",
  };
}

/**
 * @param {Record<string, string|undefined>} [env]
 * @param {Record<string, unknown>} [options]
 */
export function inspectMercadoLivreRedirectUriReadiness(env = process.env, options = {}) {
  const redirectUri = readEnvValue(env, MERCADOLIVRE_OAUTH_ENV_KEYS.REDIRECT_URI);
  const expectedCallbackPath = String(options.expectedCallbackPath || MERCADOLIVRE_OAUTH_CALLBACK_PATH);
  const authorization = buildMercadoLivreAuthorizationUrl(env);

  let authorizationRedirectUri = null;
  if (authorization.ok && authorization.url) {
    try {
      authorizationRedirectUri = new URL(authorization.url).searchParams.get("redirect_uri");
    } catch {
      authorizationRedirectUri = null;
    }
  }

  const endsWithExpectedPath = redirectUri.endsWith(expectedCallbackPath);
  const authorizationMatchesEnv =
    !authorizationRedirectUri || authorizationRedirectUri === redirectUri;

  return {
    redirectUriPresent: !!redirectUri,
    redirectUri,
    expectedCallbackPath,
    endsWithExpectedPath,
    authorizationRedirectUri,
    authorizationMatchesEnv,
    redirectUriConsistent: !!redirectUri && endsWithExpectedPath && authorizationMatchesEnv,
  };
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
export function inspectMercadoLivreAuthHeaderReadiness(env = process.env) {
  const rawToken = readEnvValue(env, MERCADOLIVRE_OAUTH_ENV_KEYS.ACCESS_TOKEN);
  const shape = validateMercadoLivreAccessTokenShape(rawToken);
  const runtimeEnv = {
    ...env,
    [MERCADOLIVRE_OAUTH_ENV_KEYS.ACCESS_TOKEN]: normalizeAccessTokenForRuntime(rawToken),
  };
  const headers = buildMercadoLivreRequestHeaders(runtimeEnv);
  const headerValidation = validateMercadoLivreRequestHeaders(headers, runtimeEnv);

  return {
    authHeaderWillBeSent: headerValidation.authorizationWouldBeSent === true,
    authHeaderSentWhenBuilt: headerValidation.authHeaderSent === true,
    invalidEmptyBearer: headerValidation.invalidEmptyBearer === true,
    userAgentSent: headerValidation.userAgentSent === true,
    tokenShapeValid: shape.ok,
    duplicateBearerRisk: /^Bearer\s+Bearer\s+/i.test(String(headers.Authorization || "")),
  };
}

/**
 * @param {unknown} diagnostics
 * @param {Record<string, string|undefined>} [env]
 */
export function sanitizeMercadoLivreOAuthDiagnostics(diagnostics = {}, env = process.env) {
  const secrets = [
    env?.[MERCADOLIVRE_OAUTH_ENV_KEYS.ACCESS_TOKEN],
    env?.[MERCADOLIVRE_OAUTH_ENV_KEYS.REFRESH_TOKEN],
    env?.[MERCADOLIVRE_OAUTH_ENV_KEYS.CLIENT_SECRET],
    env?.[MERCADOLIVRE_OAUTH_ENV_KEYS.CLIENT_ID],
  ].filter(Boolean);

  let serialized = JSON.stringify(diagnostics);
  for (const secret of secrets) {
    serialized = serialized.split(String(secret)).join("[REDACTED]");
  }
  serialized = serialized.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]");
  serialized = serialized.replace(/"access_token"\s*:\s*"[^"]+"/gi, '"access_token":"[REDACTED]"');
  serialized = serialized.replace(/"refresh_token"\s*:\s*"[^"]+"/gi, '"refresh_token":"[REDACTED]"');
  return JSON.parse(serialized);
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function classifyMercadoLivreOAuthReadiness(input = {}) {
  const env = input.env || process.env;
  const nowMs = Number.isFinite(input.nowMs) ? input.nowMs : Date.now();
  const callbackAudit = inspectMercadoLivreOAuthCallbackPersistence(input);
  const stateAudit = validateMercadoLivreOAuthStateProtection(input);
  const redirectAudit = inspectMercadoLivreRedirectUriReadiness(env, input);
  const oauthConfig = inspectMercadoLivreOAuthConfiguration(env);
  const tokenPresence = inspectMercadoLivreTokenPresence(env);
  const tokenShape = validateMercadoLivreAccessTokenShape(
    readEnvValue(env, MERCADOLIVRE_OAUTH_ENV_KEYS.ACCESS_TOKEN)
  );
  const tokenExpiry = evaluateMercadoLivreTokenExpiry(env, nowMs);
  const authHeader = inspectMercadoLivreAuthHeaderReadiness(env);

  const blockers = [];
  const warnings = [];
  const tags = [];

  if (!oauthConfig.oauthConfigComplete) {
    tags.push(MERCADOLIVRE_OAUTH_READINESS_CLASSIFICATIONS.OAUTH_CONFIG_INCOMPLETE);
    warnings.push("oauth_config_incomplete");
  }

  if (!tokenPresence.accessTokenPresent) {
    blockers.push("access_token_missing");
    tags.push(MERCADOLIVRE_OAUTH_READINESS_CLASSIFICATIONS.TOKEN_MISSING);
  } else if (!tokenShape.ok) {
    blockers.push("access_token_shape_invalid");
    tags.push(MERCADOLIVRE_OAUTH_READINESS_CLASSIFICATIONS.TOKEN_FORMAT_INVALID);
  } else if (tokenExpiry.accessTokenExpired) {
    blockers.push("access_token_expired");
    tags.push(MERCADOLIVRE_OAUTH_READINESS_CLASSIFICATIONS.TOKEN_EXPIRED);
  } else if (tokenExpiry.accessTokenExpiryKnown) {
    tags.push(MERCADOLIVRE_OAUTH_READINESS_CLASSIFICATIONS.READY_VALID_TOKEN_PRESENT);
  } else {
    tags.push(MERCADOLIVRE_OAUTH_READINESS_CLASSIFICATIONS.READY_TOKEN_PRESENT_EXPIRY_UNKNOWN);
  }

  if (tokenPresence.refreshTokenPresent) {
    tags.push(MERCADOLIVRE_OAUTH_READINESS_CLASSIFICATIONS.REFRESH_TOKEN_AVAILABLE);
  } else {
    tags.push(MERCADOLIVRE_OAUTH_READINESS_CLASSIFICATIONS.REFRESH_TOKEN_MISSING);
    warnings.push("refresh_token_missing");
  }

  if (!callbackAudit.persistsToken) {
    tags.push(MERCADOLIVRE_OAUTH_READINESS_CLASSIFICATIONS.CALLBACK_NOT_PERSISTING_TOKEN);
    warnings.push("callback_manual_persistence_required");
  }

  if (callbackAudit.exposesAccessTokenInResponse || callbackAudit.exposesRefreshTokenInResponse) {
    tags.push(MERCADOLIVRE_OAUTH_READINESS_CLASSIFICATIONS.SECRET_EXPOSURE_RISK);
    warnings.push("callback_exposes_tokens_in_http_response");
  }

  if (!redirectAudit.redirectUriConsistent && redirectAudit.redirectUriPresent) {
    tags.push(MERCADOLIVRE_OAUTH_READINESS_CLASSIFICATIONS.REDIRECT_URI_MISMATCH_RISK);
    warnings.push("redirect_uri_mismatch_risk");
  }

  if (!stateAudit.stateValidationPresent) {
    tags.push(MERCADOLIVRE_OAUTH_READINESS_CLASSIFICATIONS.STATE_VALIDATION_MISSING);
    warnings.push("oauth_state_validation_missing");
  }

  if (authHeader.duplicateBearerRisk) {
    blockers.push("duplicate_bearer_header_risk");
    tags.push(MERCADOLIVRE_OAUTH_READINESS_CLASSIFICATIONS.AUTHENTICATED_PROBE_NOT_SAFE);
  }

  let readinessClassification = MERCADOLIVRE_OAUTH_READINESS_CLASSIFICATIONS.UNKNOWN_READINESS;
  if (blockers.includes("access_token_missing")) {
    readinessClassification = MERCADOLIVRE_OAUTH_READINESS_CLASSIFICATIONS.TOKEN_MISSING;
  } else if (blockers.includes("access_token_shape_invalid")) {
    readinessClassification = MERCADOLIVRE_OAUTH_READINESS_CLASSIFICATIONS.TOKEN_FORMAT_INVALID;
  } else if (blockers.includes("access_token_expired")) {
    readinessClassification = MERCADOLIVRE_OAUTH_READINESS_CLASSIFICATIONS.TOKEN_EXPIRED;
  } else if (blockers.length) {
    readinessClassification = MERCADOLIVRE_OAUTH_READINESS_CLASSIFICATIONS.AUTHENTICATED_PROBE_NOT_SAFE;
  } else if (tokenExpiry.accessTokenExpiryKnown) {
    readinessClassification = MERCADOLIVRE_OAUTH_READINESS_CLASSIFICATIONS.READY_VALID_TOKEN_PRESENT;
  } else if (tokenShape.ok && tokenPresence.accessTokenPresent) {
    readinessClassification =
      MERCADOLIVRE_OAUTH_READINESS_CLASSIFICATIONS.READY_TOKEN_PRESENT_EXPIRY_UNKNOWN;
  }

  return {
    version: MERCADOLIVRE_OAUTH_TOKEN_READINESS_AUDIT_VERSION,
    readinessClassification,
    tags: [...new Set(tags)],
    blockers,
    warnings,
    oauthConfigComplete: oauthConfig.oauthConfigComplete,
    accessTokenPresent: tokenPresence.accessTokenPresent,
    accessTokenShapeValid: tokenShape.ok,
    accessTokenExpiryKnown: tokenExpiry.accessTokenExpiryKnown,
    accessTokenExpired: tokenExpiry.accessTokenExpired,
    refreshTokenPresent: tokenPresence.refreshTokenPresent,
    callbackPersistsToken: callbackAudit.persistsToken,
    stateValidationPresent: stateAudit.stateValidationPresent,
    redirectUriConsistent: redirectAudit.redirectUriConsistent,
    authHeaderWillBeSent: authHeader.authHeaderWillBeSent,
    protectedFetchReady: blockers.length === 0 && authHeader.authHeaderWillBeSent,
    probeReady: blockers.length === 0 && authHeader.authHeaderWillBeSent,
  };
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function buildMercadoLivreAuthenticatedProbePlan(input = {}) {
  const env = input.env || process.env;
  const query = cleanText(input.query || "iPhone 13") || "iPhone 13";
  const readiness = classifyMercadoLivreOAuthReadiness(input);
  const basePlan = buildProtectedAuthenticatedProbePlan({ env, query });
  const priorityPlan = buildMultiProviderPriorityPlan({
    runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
    env,
    invocationSource: "mercadolivre_authenticated_probe_plan",
  });
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
  const budget = evaluateProviderBudgetPermission({
    providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
    env,
  });
  const circuit = getProviderCircuitState(COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC);

  const probeBlockers = [...readiness.blockers];
  if (String(env.COMMERCIAL_RUNTIME_MODE || "") !== COMMERCIAL_RUNTIME_MODES.CONTROLLED) {
    probeBlockers.push("COMMERCIAL_RUNTIME_MODE!=controlled");
  }
  if (String(env.COMMERCIAL_PROVIDER_MERCADOLIVRE_ENABLED || "").toLowerCase() !== "true") {
    probeBlockers.push("COMMERCIAL_PROVIDER_MERCADOLIVRE_ENABLED!=true");
  }
  if (String(env[COMMERCIAL_ML_AUTHENTICATED_PROBE_ENABLED_ENV] || "").toLowerCase() !== "true") {
    probeBlockers.push(`${COMMERCIAL_ML_AUTHENTICATED_PROBE_ENABLED_ENV}!=true`);
  }
  if (String(env.SERPAPI_KEY || "").trim()) probeBlockers.push("SERPAPI_KEY_must_be_empty");
  if (String(env.APIFY_API_TOKEN || "").trim()) probeBlockers.push("APIFY_API_TOKEN_must_be_empty");
  if (googleGuard.shouldCallProvider) probeBlockers.push("google_shopping_would_execute");
  if (apifyGuard.shouldCallProvider) probeBlockers.push("apify_mercadolivre_would_execute");
  if (priorityPlan.orderedProviders.some((entry) => entry.providerId !== COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC)) {
    probeBlockers.push("priority_plan_includes_non_ml_provider");
  }
  if (!budget.shouldCallProvider) probeBlockers.push("budget_blocked");
  if (circuit.state === "open") probeBlockers.push("circuit_open");

  return {
    ...basePlan,
    version: MERCADOLIVRE_OAUTH_TOKEN_READINESS_AUDIT_VERSION,
    readinessClassification: readiness.readinessClassification,
    probeReady: probeBlockers.length === 0 && readiness.probeReady,
    blockers: probeBlockers,
    warnings: readiness.warnings,
    maxExternalCalls: 1,
    retryEnabled: false,
    protectedFetchReady: readiness.protectedFetchReady,
    protectionStack: {
      costGuardActive: true,
      budgetActive: budget.shouldCallProvider,
      circuitActive: circuit.state !== "open",
      cacheActive: true,
      dedupActive: true,
    },
    priorityOrder: priorityPlan.orderedProviders.map((entry) => entry.providerId),
    budgetSnapshot: {
      callsUsed: budget.callsUsed,
      callsRemaining: budget.callsRemaining,
      circuitState: budget.circuitState,
    },
    circuitSnapshot: circuit,
    oauthReadiness: sanitizeMercadoLivreOAuthDiagnostics(
      {
        oauthConfigComplete: readiness.oauthConfigComplete,
        accessTokenPresent: readiness.accessTokenPresent,
        accessTokenShapeValid: readiness.accessTokenShapeValid,
        accessTokenExpiryKnown: readiness.accessTokenExpiryKnown,
        accessTokenExpired: readiness.accessTokenExpired,
        refreshTokenPresent: readiness.refreshTokenPresent,
        callbackPersistsToken: readiness.callbackPersistsToken,
        stateValidationPresent: readiness.stateValidationPresent,
        redirectUriConsistent: readiness.redirectUriConsistent,
        authHeaderWillBeSent: readiness.authHeaderWillBeSent,
      },
      env
    ),
    cancelHint:
      "Unset COMMERCIAL_ML_AUTHENTICATED_PROBE_ENABLED or omit --real/--allow-external/--authenticated.",
  };
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function buildMercadoLivreOAuthReadinessReport(input = {}) {
  const env = input.env || process.env;
  const classification = classifyMercadoLivreOAuthReadiness(input);
  const tokenPresence = inspectMercadoLivreTokenPresence(env);
  const tokenShape = validateMercadoLivreAccessTokenShape(
    readEnvValue(env, MERCADOLIVRE_OAUTH_ENV_KEYS.ACCESS_TOKEN)
  );
  const tokenExpiry = evaluateMercadoLivreTokenExpiry(env, input.nowMs);
  const oauthConfig = inspectMercadoLivreOAuthConfiguration(env);
  const callbackAudit = inspectMercadoLivreOAuthCallbackPersistence(input);
  const stateAudit = validateMercadoLivreOAuthStateProtection(input);
  const redirectAudit = inspectMercadoLivreRedirectUriReadiness(env, input);
  const authHeader = inspectMercadoLivreAuthHeaderReadiness(env);
  const probePlan = buildMercadoLivreAuthenticatedProbePlan(input);

  return sanitizeMercadoLivreOAuthDiagnostics(
    {
      version: MERCADOLIVRE_OAUTH_TOKEN_READINESS_AUDIT_VERSION,
      classification,
      tokenPresence,
      tokenShape: {
        ok: tokenShape.ok,
        present: tokenShape.present,
        reasonCode: tokenShape.reasonCode,
        hasBearerPrefix: tokenShape.hasBearerPrefix,
        length: tokenShape.length,
        matchesKnownPrefix: tokenShape.matchesKnownPrefix,
      },
      tokenExpiry,
      oauthConfig: {
        oauthConfigComplete: oauthConfig.oauthConfigComplete,
        clientIdPresent: oauthConfig.clientIdPresent,
        clientSecretPresent: oauthConfig.clientSecretPresent,
        redirectUriPresent: oauthConfig.redirectUriPresent,
        siteId: oauthConfig.siteId,
        missingOAuthKeys: oauthConfig.missingOAuthKeys,
      },
      callbackAudit,
      stateAudit,
      redirectAudit,
      authHeader,
      probePlan: {
        probeReady: probePlan.probeReady,
        blockers: probePlan.blockers,
        warnings: probePlan.warnings,
        maxExternalCalls: probePlan.maxExternalCalls,
        retryEnabled: probePlan.retryEnabled,
      },
    },
    env
  );
}

export { normalizeAccessTokenForRuntime };
