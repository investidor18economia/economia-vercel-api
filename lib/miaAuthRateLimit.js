/**
 * PATCH 3.3A.1 — Distributed auth rate-limit key derivation.
 * Counters live in Postgres (mia_auth_rate_limits) via RPC — not in process memory.
 */

import crypto from "crypto";
import { resolveClientIp } from "./miaPerimeterRateLimit.js";

export const MIA_AUTH_RATE_LIMIT_SECRET_ENV = "MIA_AUTH_RATE_LIMIT_SECRET";
export const MIA_AUTH_REQUEST_WINDOW_SECONDS = 15 * 60;
export const MIA_AUTH_REQUEST_WINDOW_MS = MIA_AUTH_REQUEST_WINDOW_SECONDS * 1000;
export const MIA_AUTH_REQUEST_MAX_PER_EMAIL = 3;
export const MIA_AUTH_REQUEST_MAX_PER_IP = 12;

export const MIA_AUTH_RATE_LIMIT_SCOPES = {
  REQUEST_EMAIL: "request_email",
  REQUEST_ORIGIN: "request_origin",
};

function resolveAuthRateLimitSecret(env = process.env) {
  return String(
    env[MIA_AUTH_RATE_LIMIT_SECRET_ENV] ||
      env.MIA_AUTH_CHALLENGE_SECRET ||
      env.MIA_USER_SESSION_SECRET ||
      ""
  ).trim();
}

export function hashAuthRateLimitKey(prefix, value, env = process.env) {
  const secret = resolveAuthRateLimitSecret(env);
  const normalized = String(value || "").trim();
  if (!secret || !normalized) return "";
  return crypto
    .createHmac("sha256", secret)
    .update(`mia-auth-rate-v1:${prefix}:${normalized}`)
    .digest("hex")
    .slice(0, 64);
}

export function buildAuthRequestRateLimitKeys({ emailNormalized, req } = {}, env = process.env) {
  const originValue = resolveClientIp(req) || "unknown";
  return {
    emailKeyHash: hashAuthRateLimitKey(MIA_AUTH_RATE_LIMIT_SCOPES.REQUEST_EMAIL, emailNormalized, env),
    originKeyHash: hashAuthRateLimitKey(MIA_AUTH_RATE_LIMIT_SCOPES.REQUEST_ORIGIN, originValue, env),
  };
}

export function parseAuthRateLimitRpcResult(result = {}) {
  if (result?.ok === false && result?.reason_code === "auth_rate_limited") {
    return {
      ok: false,
      scope: result.scope || "email",
      retryAfterSeconds: Number(result.retry_after_seconds) || 60,
    };
  }
  return { ok: true, retryAfterSeconds: 0 };
}

/**
 * Fixed-window bucket helper mirroring Postgres mia_auth_consume_rate_limit.
 * Used by unit/concurrency tests without a database.
 */
export function evaluateDistributedRateLimitBucket(
  store,
  { scope, keyHash, windowSeconds, maxRequests, nowMs = Date.now() } = {}
) {
  const windowStartMs =
    Math.floor(nowMs / 1000 / windowSeconds) * windowSeconds * 1000;
  const bucketKey = `${scope}:${keyHash}:${windowStartMs}`;
  const currentCount = Number(store.get(bucketKey) || 0) + 1;
  store.set(bucketKey, currentCount);

  if (currentCount > maxRequests) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((windowStartMs + windowSeconds * 1000 - nowMs) / 1000)
    );
    return { allowed: false, scope, retryAfterSeconds, count: currentCount };
  }

  return { allowed: true, retryAfterSeconds: 0, count: currentCount };
}
