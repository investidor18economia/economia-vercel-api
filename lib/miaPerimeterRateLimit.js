/**
 * PATCH 12B — Perimeter rate limiting (technical flood protection only).
 * In-memory per process; shared state deferred to PATCH 12F.
 */

import crypto from "crypto";

export const PERIMETER_RATE_LIMIT_REASON_CODE = "perimeter_rate_limited";

export const MIA_PERIMETER_RATE_LIMIT_ENABLED_ENV = "MIA_PERIMETER_RATE_LIMIT_ENABLED";
export const MIA_PERIMETER_RATE_LIMIT_WINDOW_MS_ENV = "MIA_PERIMETER_RATE_LIMIT_WINDOW_MS";
export const MIA_PERIMETER_RATE_LIMIT_MAX_REQUESTS_ENV = "MIA_PERIMETER_RATE_LIMIT_MAX_REQUESTS";

const DEFAULT_ENABLED = true;
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 10;
const DEFAULT_MAX_ENTRIES = 5_000;

const defaultStore = new Map();

function parseBoolean(value, defaultValue) {
  if (value == null || value === "") return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return defaultValue;
}

function parsePositiveInt(value, defaultValue) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

export function resolvePerimeterRateLimitConfig(env = process.env) {
  return {
    enabled: parseBoolean(env[MIA_PERIMETER_RATE_LIMIT_ENABLED_ENV], DEFAULT_ENABLED),
    windowMs: parsePositiveInt(env[MIA_PERIMETER_RATE_LIMIT_WINDOW_MS_ENV], DEFAULT_WINDOW_MS),
    maxRequests: parsePositiveInt(
      env[MIA_PERIMETER_RATE_LIMIT_MAX_REQUESTS_ENV],
      DEFAULT_MAX_REQUESTS
    ),
    maxEntries: DEFAULT_MAX_ENTRIES,
  };
}

export function resolveClientIp(req = {}) {
  const forwarded = req.headers?.["x-forwarded-for"] || req.headers?.["X-Forwarded-For"];
  if (forwarded) {
    const first = String(forwarded).split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = req.headers?.["x-real-ip"] || req.headers?.["X-Real-Ip"];
  if (realIp) return String(realIp).trim();

  const socketIp = req.socket?.remoteAddress;
  if (socketIp) return String(socketIp).trim();

  return "unknown";
}

export function hashPerimeterClientIdentifier(ip, salt = "mia-perimeter-v1") {
  const normalizedIp = String(ip || "unknown").trim();
  return crypto.createHash("sha256").update(`${salt}:${normalizedIp}`).digest("hex").slice(0, 32);
}

function pruneExpiredEntries(store, now, windowMs) {
  for (const [key, entry] of store.entries()) {
    if (!entry || now - entry.windowStartedAt >= windowMs) {
      store.delete(key);
    }
  }
}

function enforceMaxEntries(store, maxEntries, now, windowMs) {
  if (store.size <= maxEntries) return;
  pruneExpiredEntries(store, now, windowMs);
  if (store.size <= maxEntries) return;

  const entries = [...store.entries()].sort(
    (left, right) => left[1].windowStartedAt - right[1].windowStartedAt
  );
  const removeCount = store.size - maxEntries;
  for (let index = 0; index < removeCount; index += 1) {
    store.delete(entries[index][0]);
  }
}

export function evaluatePerimeterRateLimit(input = {}, env = process.env, store = defaultStore) {
  try {
    const config = resolvePerimeterRateLimitConfig(env);
    if (!config.enabled) {
      return { allowed: true, limited: false, retryAfterSeconds: 0, reasonCode: null };
    }

    const ip = resolveClientIp(input.req);
    const identifierHash = hashPerimeterClientIdentifier(ip);
    const now = Date.now();

    pruneExpiredEntries(store, now, config.windowMs);
    enforceMaxEntries(store, config.maxEntries, now, config.windowMs);

    let entry = store.get(identifierHash);
    if (!entry || now - entry.windowStartedAt >= config.windowMs) {
      entry = { windowStartedAt: now, count: 0 };
    }

    if (entry.count >= config.maxRequests) {
      const retryAfterMs = config.windowMs - (now - entry.windowStartedAt);
      const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
      store.set(identifierHash, entry);
      return {
        allowed: false,
        limited: true,
        retryAfterSeconds,
        reasonCode: PERIMETER_RATE_LIMIT_REASON_CODE,
        identifierHash,
      };
    }

    entry.count += 1;
    store.set(identifierHash, entry);
    return {
      allowed: true,
      limited: false,
      retryAfterSeconds: 0,
      reasonCode: null,
      identifierHash,
    };
  } catch (error) {
    console.error("perimeter_rate_limit_error:", error?.message || error);
    return {
      allowed: true,
      limited: false,
      retryAfterSeconds: 0,
      reasonCode: "perimeter_rate_limit_fail_open",
      failOpen: true,
    };
  }
}

export function resetPerimeterRateLimitStore(store = defaultStore) {
  store.clear();
}

export function buildPerimeterRateLimit429Payload() {
  return {
    error: "rate_limited",
    reasonCode: PERIMETER_RATE_LIMIT_REASON_CODE,
    reply:
      "Você enviou várias mensagens em sequência. Aguarde alguns segundos e tente novamente.",
  };
}
