/**
 * PATCH 12D — Central endpoint exposure policy.
 * No cognition — environment gates, internal auth, method guards, safe errors.
 */

import { validateCronSecret } from "./miaPriceAlertCron.js";
import { validateMiaAdminApiKey } from "./miaPriceAlertDryRun.js";

export const MIA_DEV_ROUTES_ENABLED_ENV = "MIA_DEV_ROUTES_ENABLED";
export const MIA_LEGACY_ECONOMIA_ENABLED_ENV = "MIA_LEGACY_ECONOMIA_ENABLED";
export const MIA_INTERNAL_API_SECRET_ENV = "API_SHARED_KEY";

export const ENDPOINT_REASON_CODES = Object.freeze({
  NOT_FOUND: "endpoint_not_found",
  METHOD_NOT_ALLOWED: "endpoint_method_not_allowed",
  INTERNAL_AUTH_REQUIRED: "internal_api_auth_required",
  INTERNAL_AUTH_INVALID: "internal_api_auth_invalid",
  CRON_AUTH_REQUIRED: "cron_auth_required",
  CRON_AUTH_INVALID: "cron_auth_invalid",
  ADMIN_AUTH_REQUIRED: "admin_auth_required",
  ADMIN_AUTH_INVALID: "admin_auth_invalid",
  LEGACY_DISABLED: "legacy_endpoint_disabled",
  USER_SESSION_REQUIRED: "user_session_required",
  USER_SESSION_INVALID: "user_session_invalid",
  USER_SESSION_FORBIDDEN: "user_session_forbidden",
});

function parseBoolean(value, defaultValue = false) {
  if (value == null || value === "") return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return defaultValue;
}

export function resolveVercelEnvironment(env = process.env) {
  const vercelEnv = String(env.VERCEL_ENV || "").trim().toLowerCase();
  if (vercelEnv) return vercelEnv;
  return String(env.NODE_ENV || "development").trim().toLowerCase() || "development";
}

export function isProductionRuntime(env = process.env) {
  return resolveVercelEnvironment(env) === "production";
}

export function isPreviewRuntime(env = process.env) {
  return resolveVercelEnvironment(env) === "preview";
}

export function isProductionLikeRuntime(env = process.env) {
  const runtime = resolveVercelEnvironment(env);
  return runtime === "production" || runtime === "preview";
}

export function isDevRouteEnabled(env = process.env) {
  return parseBoolean(env[MIA_DEV_ROUTES_ENABLED_ENV], false);
}

export function isLegacyEconomiaEnabled(env = process.env) {
  return parseBoolean(env[MIA_LEGACY_ECONOMIA_ENABLED_ENV], false);
}

export function applyInternalSecurityHeaders(res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
}

export function buildPolicyError(statusCode, error, reasonCode, extra = {}) {
  return {
    statusCode,
    payload: {
      error,
      reasonCode,
      ...extra,
    },
  };
}

export function sendPolicyError(res, response, options = {}) {
  applyInternalSecurityHeaders(res);
  if (options.allowHeader) {
    res.setHeader("Allow", options.allowHeader);
  }
  return res.status(response.statusCode).json(response.payload);
}

export function sendNotFound(res, reasonCode = ENDPOINT_REASON_CODES.NOT_FOUND) {
  applyInternalSecurityHeaders(res);
  return res.status(404).json({
    error: "not_found",
    reasonCode,
  });
}

export function validateHttpMethod(req, allowedMethods = []) {
  const method = String(req?.method || "GET").toUpperCase();
  const allowed = allowedMethods.map((entry) => String(entry).toUpperCase());
  if (allowed.includes(method)) {
    return { ok: true, method };
  }
  return {
    ok: false,
    allowHeader: allowed.join(", "),
    response: buildPolicyError(
      405,
      "method_not_allowed",
      ENDPOINT_REASON_CODES.METHOD_NOT_ALLOWED,
      {
        reply: "Esse método não é suportado para esta rota.",
      }
    ),
  };
}

export function extractBearerToken(req = {}) {
  const authHeader = String(req.headers?.authorization || "").trim();
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  return "";
}

export function extractInternalApiKey(req = {}) {
  return String(req.headers?.["x-api-key"] || "").trim();
}

export function requireInternalApiKey(req, env = process.env) {
  const configured = String(env[MIA_INTERNAL_API_SECRET_ENV] || "").trim();
  const provided = extractInternalApiKey(req);

  if (!configured) {
    return {
      ok: false,
      response: buildPolicyError(
        503,
        "internal_api_not_configured",
        ENDPOINT_REASON_CODES.INTERNAL_AUTH_REQUIRED
      ),
    };
  }

  if (!provided || provided !== configured) {
    return {
      ok: false,
      response: buildPolicyError(
        401,
        "invalid_api_key",
        ENDPOINT_REASON_CODES.INTERNAL_AUTH_INVALID
      ),
    };
  }

  return { ok: true };
}

export function requireCronAuthorization(req, env = process.env) {
  const previous = process.env.MIA_CRON_SECRET;
  if (env?.MIA_CRON_SECRET != null) {
    process.env.MIA_CRON_SECRET = env.MIA_CRON_SECRET;
  }
  try {
    const auth = validateCronSecret({ ...req, headers: req.headers || {}, query: req.query || {} });
    if (auth.ok) return { ok: true };

    const reasonCode =
      auth.code === "invalid_cron_secret"
        ? ENDPOINT_REASON_CODES.CRON_AUTH_INVALID
        : ENDPOINT_REASON_CODES.CRON_AUTH_REQUIRED;

    return {
      ok: false,
      response: buildPolicyError(auth.status || 401, auth.code || "cron_auth_failed", reasonCode),
    };
  } finally {
    if (env?.MIA_CRON_SECRET != null) {
      if (previous == null) delete process.env.MIA_CRON_SECRET;
      else process.env.MIA_CRON_SECRET = previous;
    }
  }
}

export function requireAdminAuthorization(req, env = process.env) {
  const previous = process.env.MIA_ADMIN_API_KEY;
  if (env?.MIA_ADMIN_API_KEY != null) {
    process.env.MIA_ADMIN_API_KEY = env.MIA_ADMIN_API_KEY;
  }
  try {
    const auth = validateMiaAdminApiKey(req);
    if (auth.ok) return { ok: true };

    const reasonCode =
      auth.code === "invalid_admin_api_key"
        ? ENDPOINT_REASON_CODES.ADMIN_AUTH_INVALID
        : ENDPOINT_REASON_CODES.ADMIN_AUTH_REQUIRED;

    return {
      ok: false,
      response: buildPolicyError(auth.status || 401, auth.code || "admin_auth_failed", reasonCode),
    };
  } finally {
    if (env?.MIA_ADMIN_API_KEY != null) {
      if (previous == null) delete process.env.MIA_ADMIN_API_KEY;
      else process.env.MIA_ADMIN_API_KEY = previous;
    }
  }
}

export function assertDevRouteEnabled(env = process.env) {
  return isDevRouteEnabled(env);
}

export function gateDevRoute(req, res, env = process.env) {
  if (!isDevRouteEnabled(env)) {
    return { blocked: true, response: sendNotFound(res) };
  }

  if (isProductionRuntime(env)) {
    const secret = String(env.DEV_API_SECRET || "").trim();
    const provided = String(
      req?.headers?.["x-dev-api-secret"] || req?.query?.secret || ""
    ).trim();
    if (!secret || provided !== secret) {
      return { blocked: true, response: sendNotFound(res) };
    }
  }

  return { blocked: false };
}

export function gateLegacyEconomiaEndpoint(env = process.env) {
  if (isLegacyEconomiaEnabled(env)) {
    return { blocked: false };
  }
  return {
    blocked: true,
    response: buildPolicyError(
      404,
      "legacy_endpoint_disabled",
      ENDPOINT_REASON_CODES.LEGACY_DISABLED,
      {
        reply: "Este endpoint legado está desativado.",
      }
    ),
  };
}

export function gateLegacyInternalEndpoint(env = process.env) {
  if (isDevRouteEnabled(env)) {
    return { blocked: false };
  }
  return {
    blocked: true,
    response: buildPolicyError(
      404,
      "not_found",
      ENDPOINT_REASON_CODES.NOT_FOUND
    ),
  };
}

export function isDevApiPath(pathname = "") {
  const path = String(pathname || "");
  return (
    path.startsWith("/api/dev/") ||
    path.startsWith("/api/debug/") ||
    path.startsWith("/api/test/") ||
    path === "/api/test-mia" ||
    path === "/api/test-economia" ||
    path === "/api/test-serp" ||
    path === "/api/env" ||
    path === "/api/pages/api/test-economia" ||
    path === "/mia-test"
  );
}

export function shouldBlockDevPath(pathname = "", env = process.env) {
  if (!isDevApiPath(pathname)) return false;
  return !isDevRouteEnabled(env);
}
