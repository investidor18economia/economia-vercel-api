/**
 * PATCH Comercial 05D — Universal Commercial Cache Layer
 *
 * Cache in-memory por processo para reutilizar resultados comerciais recentes entre requests.
 * Não substitui Request Dedup (05C) nem Commercial Offer Dedup.
 */

import { createHash } from "node:crypto";
import {
  buildCommercialRequestDedupKey,
  normalizeCommercialRequestDedupInput,
} from "./commercialRequestDeduplication.js";

export const UNIVERSAL_COMMERCIAL_CACHE_VERSION = "05D";

export const UNIVERSAL_COMMERCIAL_CACHE_STATUS = Object.freeze({
  HIT: "hit",
  MISS: "miss",
  STALE: "stale",
  BYPASS: "bypass",
  WRITE: "write",
  SKIP_WRITE: "skip_write",
});

export const UNIVERSAL_COMMERCIAL_CACHE_REASON_CODES = Object.freeze({
  DISABLED: "disabled",
  FRESH_HIT: "fresh_hit",
  STALE_ENTRY: "stale_entry",
  NOT_CACHEABLE: "not_cacheable",
  COST_GUARD_BLOCKED: "cost_guard_blocked",
  DRY_RUN: "dry_run",
  ERROR_RESULT: "error_result",
  TIMEOUT: "timeout",
  AUTH_ERROR: "auth_error",
  INVALID_RESULT: "invalid_result",
  WRITE_SUCCESS: "write_success",
  WRITE_EMPTY: "write_empty",
});

export const COMMERCIAL_CACHE_ENABLED_ENV = "COMMERCIAL_CACHE_ENABLED";
export const COMMERCIAL_CACHE_TTL_MS_ENV = "COMMERCIAL_CACHE_TTL_MS";
export const COMMERCIAL_CACHE_EMPTY_TTL_MS_ENV = "COMMERCIAL_EMPTY_CACHE_TTL_MS";
export const COMMERCIAL_CACHE_MAX_ENTRIES_ENV = "COMMERCIAL_CACHE_MAX_ENTRIES";

const DEFAULT_OFFERS_TTL_MS = 300_000;
const DEFAULT_EMPTY_TTL_MS = 45_000;
const DEFAULT_MAX_ENTRIES = 500;

const cacheStore = new Map();
const cacheEvents = [];
const MAX_EVENT_LOG = 200;

function cloneValue(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function hashKey(key = "") {
  return createHash("sha256").update(String(key)).digest("hex").slice(0, 16);
}

function parseBooleanEnv(value, defaultValue = true) {
  if (value == null || value === "") return defaultValue;
  const raw = String(value).trim().toLowerCase();
  if (raw === "false" || raw === "0" || raw === "no") return false;
  if (raw === "true" || raw === "1" || raw === "yes") return true;
  return defaultValue;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
export function readUniversalCommercialCacheConfig(env = process.env) {
  return {
    enabled: parseBooleanEnv(env?.[COMMERCIAL_CACHE_ENABLED_ENV], true),
    offersTtlMs: parsePositiveInt(env?.[COMMERCIAL_CACHE_TTL_MS_ENV], DEFAULT_OFFERS_TTL_MS),
    emptyTtlMs: parsePositiveInt(env?.[COMMERCIAL_CACHE_EMPTY_TTL_MS_ENV], DEFAULT_EMPTY_TTL_MS),
    maxEntries: parsePositiveInt(env?.[COMMERCIAL_CACHE_MAX_ENTRIES_ENV], DEFAULT_MAX_ENTRIES),
  };
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
export function isUniversalCommercialCacheEnabled(env = process.env) {
  return readUniversalCommercialCacheConfig(env).enabled;
}

/**
 * @param {Record<string, unknown>} input
 */
export function normalizeUniversalCommercialCacheInput(input = {}) {
  return normalizeCommercialRequestDedupInput(input);
}

/**
 * @param {Record<string, unknown>} input
 */
export function buildUniversalCommercialCacheKey(input = {}) {
  return `${UNIVERSAL_COMMERCIAL_CACHE_VERSION}::${buildCommercialRequestDedupKey(input)}`;
}

/**
 * @param {Record<string, unknown>} result
 */
export function classifyUniversalCommercialCacheResultType(result = {}) {
  const products = Array.isArray(result.products) ? result.products : [];
  if (result.ok === true && products.length > 0) return "offers";
  if (products.length === 0) return "empty";
  return "unknown";
}

/**
 * @param {Record<string, unknown>} result
 * @param {Record<string, unknown>} [config]
 */
export function resolveUniversalCommercialCacheTtl(result = {}, config = readUniversalCommercialCacheConfig()) {
  const resultType = classifyUniversalCommercialCacheResultType(result);
  if (resultType === "empty") return config.emptyTtlMs;
  return config.offersTtlMs;
}

/**
 * @param {Record<string, unknown>|null} entry
 * @param {number} [now]
 */
export function isUniversalCommercialCacheEntryFresh(entry = null, now = Date.now()) {
  if (!entry) return false;
  return Number.isFinite(entry.expiresAt) && now < entry.expiresAt;
}

function recordCacheEvent(event = {}) {
  cacheEvents.push({
    at: Date.now(),
    ...event,
  });
  if (cacheEvents.length > MAX_EVENT_LOG) {
    cacheEvents.splice(0, cacheEvents.length - MAX_EVENT_LOG);
  }
}

function evictExpiredEntries(now = Date.now()) {
  for (const [key, entry] of cacheStore.entries()) {
    if (!isUniversalCommercialCacheEntryFresh(entry, now)) {
      cacheStore.delete(key);
    }
  }
}

function evictOverflow(maxEntries = DEFAULT_MAX_ENTRIES) {
  if (cacheStore.size <= maxEntries) return;

  const sorted = [...cacheStore.entries()].sort(
    (a, b) => (a[1]?.createdAt || 0) - (b[1]?.createdAt || 0)
  );
  const removeCount = cacheStore.size - maxEntries;
  for (let i = 0; i < removeCount; i += 1) {
    cacheStore.delete(sorted[i][0]);
  }
}

/**
 * @param {string} key
 */
export function getUniversalCommercialCacheEntry(key = "") {
  if (!key) return null;
  const entry = cacheStore.get(key) || null;
  if (!entry) return null;

  if (!isUniversalCommercialCacheEntryFresh(entry)) {
    cacheStore.delete(key);
    return null;
  }

  return cloneValue(entry);
}

/**
 * @param {string} key
 * @param {Record<string, unknown>} result
 * @param {Record<string, unknown>} input
 */
export function setUniversalCommercialCacheEntry(key = "", result = {}, input = {}) {
  if (!key || !result) return null;

  const config = readUniversalCommercialCacheConfig(input.env);
  evictExpiredEntries();
  const normalized = normalizeUniversalCommercialCacheInput(input);
  const ttlMs = resolveUniversalCommercialCacheTtl(result, config);
  const now = Date.now();
  const entry = {
    key,
    keyHash: hashKey(key),
    result: cloneValue(result),
    providerId: normalized.providerId,
    policyFingerprint: normalized.policyFingerprint,
    createdAt: now,
    expiresAt: now + ttlMs,
    ttlMs,
    resultType: classifyUniversalCommercialCacheResultType(result),
    resultCount: Array.isArray(result.products) ? result.products.length : 0,
    source: input.source || "provider_fetch",
    provenance: {
      providerId: normalized.providerId,
      policyFingerprint: normalized.policyFingerprint,
      invocationSource: input.invocationSource || input.layer || null,
    },
  };

  cacheStore.set(key, entry);
  evictOverflow(config.maxEntries);
  return cloneValue(entry);
}

/**
 * @param {string} key
 */
export function deleteUniversalCommercialCacheEntry(key = "") {
  if (!key) return false;
  return cacheStore.delete(key);
}

export function clearUniversalCommercialCache() {
  cacheStore.clear();
}

const NON_CACHEABLE_ERRORS = new Set([
  "cost_guard_blocked",
  "provider_error",
  "timeout",
  "http_error",
  "missing_env",
  "invalid_response",
  "missing_query",
]);

const EMPTY_CACHEABLE_ERRORS = new Set([
  "rate_limited_or_empty",
  "empty_response",
  "empty_results",
]);

/**
 * @param {Record<string, unknown>|null} result
 * @param {Record<string, unknown>} [input]
 */
export function shouldCacheCommercialResult(result = null, input = {}) {
  if (!result || typeof result !== "object") {
    return { cacheable: false, reasonCode: UNIVERSAL_COMMERCIAL_CACHE_REASON_CODES.INVALID_RESULT };
  }

  if (result.requestDeduplicated === true || result.universalCommercialCacheHit === true) {
    return { cacheable: false, reasonCode: UNIVERSAL_COMMERCIAL_CACHE_REASON_CODES.NOT_CACHEABLE };
  }

  if (result.error === "cost_guard_blocked" || result.costGuardDecision?.shouldCallProvider === false) {
    const decision = result.costGuardDecision?.decision;
    if (decision === "dry_run") {
      return { cacheable: false, reasonCode: UNIVERSAL_COMMERCIAL_CACHE_REASON_CODES.DRY_RUN };
    }
    return { cacheable: false, reasonCode: UNIVERSAL_COMMERCIAL_CACHE_REASON_CODES.COST_GUARD_BLOCKED };
  }

  const error = String(result.error || "").trim();
  if (NON_CACHEABLE_ERRORS.has(error)) {
    if (error === "timeout") {
      return { cacheable: false, reasonCode: UNIVERSAL_COMMERCIAL_CACHE_REASON_CODES.TIMEOUT };
    }
    if (error === "missing_env") {
      return { cacheable: false, reasonCode: UNIVERSAL_COMMERCIAL_CACHE_REASON_CODES.AUTH_ERROR };
    }
    return { cacheable: false, reasonCode: UNIVERSAL_COMMERCIAL_CACHE_REASON_CODES.ERROR_RESULT };
  }

  const products = Array.isArray(result.products) ? result.products : [];
  if (result.ok === true && products.length > 0) {
    return { cacheable: true, reasonCode: UNIVERSAL_COMMERCIAL_CACHE_REASON_CODES.WRITE_SUCCESS };
  }

  if (products.length === 0 && (EMPTY_CACHEABLE_ERRORS.has(error) || error === "" || error === null)) {
    return { cacheable: true, reasonCode: UNIVERSAL_COMMERCIAL_CACHE_REASON_CODES.WRITE_EMPTY };
  }

  return { cacheable: false, reasonCode: UNIVERSAL_COMMERCIAL_CACHE_REASON_CODES.NOT_CACHEABLE };
}

function annotateCacheHitResult(result, entry = {}, status = UNIVERSAL_COMMERCIAL_CACHE_STATUS.HIT) {
  const cloned = cloneValue(result);
  if (!cloned || typeof cloned !== "object") return cloned;

  const ageMs = Math.max(0, Date.now() - (entry.createdAt || Date.now()));
  const expiresInMs = Math.max(0, (entry.expiresAt || Date.now()) - Date.now());

  cloned.universalCommercialCacheHit = true;
  cloned.savedExternalCall = true;
  cloned.universalCommercialCacheStatus = status;
  cloned.universalCommercialCacheKeyHash = entry.keyHash || null;
  cloned.universalCommercialCacheAgeMs = ageMs;
  cloned.universalCommercialCacheExpiresInMs = expiresInMs;
  cloned.universalCommercialCacheSource = entry.source || "provider_fetch";
  cloned.universalCommercialCacheProvenance = cloneValue(entry.provenance || null);
  return cloned;
}

/**
 * @param {{
 *   providerId?: string,
 *   query?: string,
 *   limit?: number,
 *   maxResults?: number,
 *   categoryHint?: string,
 *   market?: string,
 *   locale?: string,
 *   costGuardContext?: Record<string, unknown>|null,
 *   invocationSource?: string,
 *   layer?: string,
 *   env?: Record<string, string|undefined>,
 *   skipCache?: boolean,
 *   execute?: Function,
 * }} input
 */
export async function executeWithUniversalCommercialCache(input = {}) {
  const execute = typeof input.execute === "function" ? input.execute : async () => null;
  const config = readUniversalCommercialCacheConfig(input.env);

  if (input.skipCache === true || !config.enabled) {
    recordCacheEvent({
      providerId: input.providerId || null,
      status: UNIVERSAL_COMMERCIAL_CACHE_STATUS.BYPASS,
      reasonCode: UNIVERSAL_COMMERCIAL_CACHE_REASON_CODES.DISABLED,
      externalCallPrevented: false,
    });
    return execute();
  }

  const key = buildUniversalCommercialCacheKey({
    providerId: input.providerId,
    query: input.query,
    limit: input.limit ?? input.maxResults,
    categoryHint: input.categoryHint,
    market: input.market,
    locale: input.locale,
    costGuardContext: input.costGuardContext,
  });
  const keyHash = hashKey(key);
  const existing = cacheStore.get(key);

  if (existing && isUniversalCommercialCacheEntryFresh(existing)) {
    const ageMs = Math.max(0, Date.now() - existing.createdAt);
    const expiresInMs = Math.max(0, existing.expiresAt - Date.now());
    recordCacheEvent({
      providerId: input.providerId || null,
      status: UNIVERSAL_COMMERCIAL_CACHE_STATUS.HIT,
      reasonCode: UNIVERSAL_COMMERCIAL_CACHE_REASON_CODES.FRESH_HIT,
      keyHash,
      ageMs,
      ttlMs: existing.ttlMs,
      expiresInMs,
      resultCount: existing.resultCount,
      externalCallPrevented: true,
      cacheable: true,
      source: existing.source || null,
    });
    return annotateCacheHitResult(existing.result, existing, UNIVERSAL_COMMERCIAL_CACHE_STATUS.HIT);
  }

  if (existing && !isUniversalCommercialCacheEntryFresh(existing)) {
    cacheStore.delete(key);
    recordCacheEvent({
      providerId: input.providerId || null,
      status: UNIVERSAL_COMMERCIAL_CACHE_STATUS.STALE,
      reasonCode: UNIVERSAL_COMMERCIAL_CACHE_REASON_CODES.STALE_ENTRY,
      keyHash,
      externalCallPrevented: false,
    });
  } else {
    recordCacheEvent({
      providerId: input.providerId || null,
      status: UNIVERSAL_COMMERCIAL_CACHE_STATUS.MISS,
      keyHash,
      externalCallPrevented: false,
    });
  }

  const result = await execute();
  const cacheDecision = shouldCacheCommercialResult(result, input);

  if (cacheDecision.cacheable) {
    setUniversalCommercialCacheEntry(key, result, {
      ...input,
      source: "provider_fetch",
    });
    recordCacheEvent({
      providerId: input.providerId || null,
      status: UNIVERSAL_COMMERCIAL_CACHE_STATUS.WRITE,
      reasonCode: cacheDecision.reasonCode,
      keyHash,
      resultCount: Array.isArray(result?.products) ? result.products.length : 0,
      cacheable: true,
      externalCallPrevented: false,
    });
  } else {
    recordCacheEvent({
      providerId: input.providerId || null,
      status: UNIVERSAL_COMMERCIAL_CACHE_STATUS.SKIP_WRITE,
      reasonCode: cacheDecision.reasonCode,
      keyHash,
      cacheable: false,
      externalCallPrevented: false,
    });
  }

  return result;
}

/**
 * @param {Record<string, unknown>|null} [statsSource]
 */
export function buildUniversalCommercialCacheDiagnostics(statsSource = null) {
  const config = readUniversalCommercialCacheConfig();
  evictExpiredEntries();
  const events = Array.isArray(statsSource?.events) ? statsSource.events : cacheEvents;

  return {
    version: UNIVERSAL_COMMERCIAL_CACHE_VERSION,
    enabled: config.enabled,
    entryCount: cacheStore.size,
    maxEntries: config.maxEntries,
    offersTtlMs: config.offersTtlMs,
    emptyTtlMs: config.emptyTtlMs,
    distributed: false,
    scope: "in_memory_per_process",
    eventCount: events.length,
    hits: events.filter((event) => event.status === UNIVERSAL_COMMERCIAL_CACHE_STATUS.HIT).length,
    misses: events.filter((event) => event.status === UNIVERSAL_COMMERCIAL_CACHE_STATUS.MISS).length,
    stale: events.filter((event) => event.status === UNIVERSAL_COMMERCIAL_CACHE_STATUS.STALE).length,
    writes: events.filter((event) => event.status === UNIVERSAL_COMMERCIAL_CACHE_STATUS.WRITE).length,
    externalCallsPrevented: events.filter((event) => event.externalCallPrevented === true).length,
    recentEvents: events.slice(-20),
  };
}

export function buildUniversalCommercialCacheDevPayload() {
  evictExpiredEntries();
  return {
    version: UNIVERSAL_COMMERCIAL_CACHE_VERSION,
    diagnostics: buildUniversalCommercialCacheDiagnostics(),
    entries: [...cacheStore.entries()].map(([key, entry]) => ({
      keyHash: entry.keyHash || hashKey(key),
      providerId: entry.providerId || null,
      resultType: entry.resultType || null,
      resultCount: entry.resultCount || 0,
      ageMs: Math.max(0, Date.now() - (entry.createdAt || Date.now())),
      expiresInMs: Math.max(0, (entry.expiresAt || Date.now()) - Date.now()),
      policyFingerprint: entry.policyFingerprint || null,
    })),
    events: cacheEvents.slice(-50),
  };
}

export function buildUniversalCommercialCacheTracePatch() {
  return {
    universal_commercial_cache: buildUniversalCommercialCacheDiagnostics(),
    universal_commercial_cache_full: buildUniversalCommercialCacheDevPayload(),
  };
}

/**
 * Compatibilidade documentada: cache legacy SerpAPI em chat-gpt4o.js permanece intacto.
 * Este módulo cobre providers no nível de adapter com chave provider-aware.
 */
export function getUniversalCommercialCacheLegacyBridgeNote() {
  return {
    legacyCacheLocation: "pages/api/chat-gpt4o.js::COMMERCIAL_SEARCH_CACHE",
    legacyScope: "aggregated_multi_provider_query_limit",
    universalScope: "provider_aware_adapter_contract",
    migrationStatus: "coexistence",
  };
}
