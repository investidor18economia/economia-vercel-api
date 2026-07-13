/**
 * PATCH Comercial 05J.4 — Mercado Livre OAuth state protection (signed HttpOnly cookie)
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const MERCADOLIVRE_OAUTH_STATE_VERSION = "05J.4";
export const MERCADOLIVRE_OAUTH_STATE_SECRET_ENV = "MERCADOLIVRE_OAUTH_STATE_SECRET";
export const MERCADOLIVRE_OAUTH_STATE_COOKIE_NAME = "mia_ml_oauth_state";
export const MERCADOLIVRE_OAUTH_STATE_COOKIE_PATH = "/api/auth/mercadolivre";
export const MERCADOLIVRE_OAUTH_STATE_MAX_AGE_SECONDS = 600;

export const MERCADOLIVRE_OAUTH_STATE_ERROR_CODES = Object.freeze({
  OAUTH_STATE_MISSING: "oauth_state_missing",
  OAUTH_STATE_INVALID: "oauth_state_invalid",
  OAUTH_STATE_EXPIRED: "oauth_state_expired",
  OAUTH_STATE_REUSED: "oauth_state_reused",
  OAUTH_CONFIGURATION_INCOMPLETE: "oauth_configuration_incomplete",
});

function cleanText(value = "") {
  return String(value ?? "").trim();
}

export function readMercadoLivreOAuthStateSecret(env = process.env) {
  return cleanText(env?.[MERCADOLIVRE_OAUTH_STATE_SECRET_ENV]);
}

export function isMercadoLivreOAuthStateSecretConfigured(env = process.env) {
  return readMercadoLivreOAuthStateSecret(env).length >= 16;
}

function signStatePayload(state = "", issuedAtMs = 0, secret = "") {
  return createHmac("sha256", secret).update(`${state}:${issuedAtMs}`).digest("hex");
}

function safeEqual(left = "", right = "") {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function encodeCookieValue(state = "", issuedAtMs = 0, signature = "") {
  return `${state}.${issuedAtMs}.${signature}`;
}

function decodeCookieValue(raw = "") {
  const text = cleanText(raw);
  const parts = text.split(".");
  if (parts.length !== 3) return null;
  const [state, issuedAtRaw, signature] = parts;
  const issuedAtMs = Number.parseInt(String(issuedAtRaw), 10);
  if (!state || !Number.isFinite(issuedAtMs) || !signature) return null;
  return { state, issuedAtMs, signature };
}

export function parseCookieHeader(cookieHeader = "") {
  const cookies = {};
  for (const chunk of String(cookieHeader || "").split(";")) {
    const separatorIndex = chunk.indexOf("=");
    if (separatorIndex <= 0) continue;
    const name = chunk.slice(0, separatorIndex).trim();
    const value = chunk.slice(separatorIndex + 1).trim();
    if (name) cookies[name] = decodeURIComponent(value);
  }
  return cookies;
}

export function isProductionLikeRuntime(env = process.env) {
  return cleanText(env.NODE_ENV).toLowerCase() === "production" || cleanText(env.VERCEL) === "1";
}

/**
 * @param {Record<string, string|undefined>} [options]
 */
export function buildMercadoLivreOAuthStateCookieAttributes(options = {}) {
  const env = options.env || process.env;
  const secure = options.secure ?? isProductionLikeRuntime(env);
  const maxAge = Number.isFinite(options.maxAgeSeconds)
    ? options.maxAgeSeconds
    : MERCADOLIVRE_OAUTH_STATE_MAX_AGE_SECONDS;

  const attributes = [
    `${MERCADOLIVRE_OAUTH_STATE_COOKIE_NAME}=${encodeURIComponent(String(options.value || ""))}`,
    "HttpOnly",
    `Path=${MERCADOLIVRE_OAUTH_STATE_COOKIE_PATH}`,
    `Max-Age=${maxAge}`,
    "SameSite=Lax",
  ];

  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

export function buildMercadoLivreOAuthStateClearCookie(env = process.env) {
  const secure = isProductionLikeRuntime(env);
  const attributes = [
    `${MERCADOLIVRE_OAUTH_STATE_COOKIE_NAME}=`,
    "HttpOnly",
    `Path=${MERCADOLIVRE_OAUTH_STATE_COOKIE_PATH}`,
    "Max-Age=0",
    "SameSite=Lax",
  ];
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function createMercadoLivreOAuthState(input = {}) {
  const env = input.env || process.env;
  const nowMs = Number.isFinite(input.nowMs) ? input.nowMs : Date.now();
  const secret = readMercadoLivreOAuthStateSecret(env);

  if (!isMercadoLivreOAuthStateSecretConfigured(env)) {
    return {
      ok: false,
      errorCode: MERCADOLIVRE_OAUTH_STATE_ERROR_CODES.OAUTH_CONFIGURATION_INCOMPLETE,
      state: null,
      setCookieHeader: null,
    };
  }

  const state = randomBytes(32).toString("hex");
  const signature = signStatePayload(state, nowMs, secret);
  const cookieValue = encodeCookieValue(state, nowMs, signature);
  const setCookieHeader = buildMercadoLivreOAuthStateCookieAttributes({
    env,
    value: cookieValue,
    maxAgeSeconds: MERCADOLIVRE_OAUTH_STATE_MAX_AGE_SECONDS,
  });

  return {
    ok: true,
    errorCode: null,
    state,
    issuedAtMs: nowMs,
    maxAgeSeconds: MERCADOLIVRE_OAUTH_STATE_MAX_AGE_SECONDS,
    setCookieHeader,
  };
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function validateMercadoLivreOAuthState(input = {}) {
  const env = input.env || process.env;
  const nowMs = Number.isFinite(input.nowMs) ? input.nowMs : Date.now();
  const queryState = cleanText(input.queryState);
  const cookieHeader = String(input.cookieHeader || "");
  const secret = readMercadoLivreOAuthStateSecret(env);
  const clearCookieHeader = buildMercadoLivreOAuthStateClearCookie(env);

  if (!isMercadoLivreOAuthStateSecretConfigured(env)) {
    return {
      ok: false,
      errorCode: MERCADOLIVRE_OAUTH_STATE_ERROR_CODES.OAUTH_CONFIGURATION_INCOMPLETE,
      clearCookieHeader,
    };
  }

  if (!queryState) {
    return {
      ok: false,
      errorCode: MERCADOLIVRE_OAUTH_STATE_ERROR_CODES.OAUTH_STATE_MISSING,
      clearCookieHeader,
    };
  }

  const cookies = parseCookieHeader(cookieHeader);
  const rawCookie = cookies[MERCADOLIVRE_OAUTH_STATE_COOKIE_NAME];
  if (!rawCookie) {
    return {
      ok: false,
      errorCode: MERCADOLIVRE_OAUTH_STATE_ERROR_CODES.OAUTH_STATE_REUSED,
      clearCookieHeader,
    };
  }

  const decoded = decodeCookieValue(rawCookie);
  if (!decoded) {
    return {
      ok: false,
      errorCode: MERCADOLIVRE_OAUTH_STATE_ERROR_CODES.OAUTH_STATE_INVALID,
      clearCookieHeader,
    };
  }

  const expectedSignature = signStatePayload(decoded.state, decoded.issuedAtMs, secret);
  if (!safeEqual(decoded.signature, expectedSignature)) {
    return {
      ok: false,
      errorCode: MERCADOLIVRE_OAUTH_STATE_ERROR_CODES.OAUTH_STATE_INVALID,
      clearCookieHeader,
    };
  }

  const ageMs = nowMs - decoded.issuedAtMs;
  if (ageMs < 0 || ageMs > MERCADOLIVRE_OAUTH_STATE_MAX_AGE_SECONDS * 1000) {
    return {
      ok: false,
      errorCode: MERCADOLIVRE_OAUTH_STATE_ERROR_CODES.OAUTH_STATE_EXPIRED,
      clearCookieHeader,
    };
  }

  if (!safeEqual(queryState, decoded.state)) {
    return {
      ok: false,
      errorCode: MERCADOLIVRE_OAUTH_STATE_ERROR_CODES.OAUTH_STATE_INVALID,
      clearCookieHeader,
    };
  }

  return {
    ok: true,
    errorCode: null,
    clearCookieHeader,
    state: decoded.state,
    issuedAtMs: decoded.issuedAtMs,
  };
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function buildMercadoLivreOAuthStateDiagnostics(input = {}) {
  const env = input.env || process.env;
  return {
    version: MERCADOLIVRE_OAUTH_STATE_VERSION,
    stateSecretConfigured: isMercadoLivreOAuthStateSecretConfigured(env),
    cookieName: MERCADOLIVRE_OAUTH_STATE_COOKIE_NAME,
    cookiePath: MERCADOLIVRE_OAUTH_STATE_COOKIE_PATH,
    maxAgeSeconds: MERCADOLIVRE_OAUTH_STATE_MAX_AGE_SECONDS,
    secureCookieInProduction: isProductionLikeRuntime(env),
    sameSite: "Lax",
    httpOnly: true,
  };
}
