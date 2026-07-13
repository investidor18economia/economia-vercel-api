/**
 * PATCH Comercial 05J.4 / 05J.5.1 — Mercado Livre OAuth sanitization (no secret leakage)
 */

import {
  redactProviderSensitiveString,
  sanitizeProviderSensitiveDiagnostics,
} from "../server/providerCredentialSanitization.js";

export const MERCADOLIVRE_OAUTH_SANITIZATION_VERSION = "05J.5.1";

function cleanText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function redactString(value = "") {
  return redactProviderSensitiveString(value);
}

/**
 * @param {unknown} value
 * @param {Set<object>} [seen]
 */
export function sanitizeMercadoLivreOAuthValue(value, seen = new Set()) {
  return sanitizeProviderSensitiveDiagnostics(value, seen);
}

/**
 * @param {unknown} payload
 */
export function sanitizeMercadoLivreOAuthPayload(payload = {}) {
  return sanitizeMercadoLivreOAuthValue(payload);
}

/**
 * @param {unknown} payload
 */
export function sanitizeMercadoLivreOAuthForLog(payload = {}) {
  return sanitizeMercadoLivreOAuthPayload(payload);
}

/**
 * @param {unknown} payload
 */
export function sanitizeMercadoLivreOAuthForHttpResponse(payload = {}) {
  return sanitizeMercadoLivreOAuthPayload(payload);
}

/**
 * @param {string} message
 * @param {Record<string, string|undefined>} [env]
 */
export function sanitizeMercadoLivreOAuthErrorMessage(message = "", env = process.env) {
  let safe = redactString(message);
  for (const key of ["MERCADOLIVRE_CLIENT_SECRET", "MERCADOLIVRE_ACCESS_TOKEN", "MERCADOLIVRE_REFRESH_TOKEN"]) {
    const secret = cleanText(env?.[key]);
    if (secret) safe = safe.split(secret).join("[REDACTED]");
  }
  return safe;
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function buildMercadoLivreOAuthSafeErrorResponse(input = {}) {
  return sanitizeMercadoLivreOAuthForHttpResponse({
    ok: false,
    errorCode: cleanText(input.errorCode) || "oauth_error",
    message: sanitizeMercadoLivreOAuthErrorMessage(input.message || "OAuth request failed."),
    requestId: cleanText(input.requestId) || null,
    nextStep: cleanText(input.nextStep) || "Review OAuth configuration and retry securely.",
  });
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function buildMercadoLivreOAuthSafeSuccessResponse(input = {}) {
  return sanitizeMercadoLivreOAuthForHttpResponse({
    ok: true,
    authorizationCompleted: true,
    accessTokenReceived: input.accessTokenReceived === true,
    refreshTokenReceived: input.refreshTokenReceived === true,
    expiresInReceived: input.expiresInReceived === true,
    tokenTypeReceived: input.tokenTypeReceived === true,
    tokenPersistenceStatus: cleanText(input.tokenPersistenceStatus) || "not_configured",
    nextStep:
      cleanText(input.nextStep) ||
      "Configure secure token persistence before using the integration.",
  });
}
