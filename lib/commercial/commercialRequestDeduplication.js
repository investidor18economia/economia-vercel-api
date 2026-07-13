/**
 * PATCH Comercial 05C — Commercial Cross-Layer Request Deduplication
 *
 * Memória efêmera por request para evitar chamadas comerciais externas duplicadas.
 * Não substitui Commercial Offer Dedup. Não persiste entre requests.
 */

import { createHash } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

export const COMMERCIAL_REQUEST_DEDUP_VERSION = "05C";

export const COMMERCIAL_REQUEST_DEDUP_STATUS = Object.freeze({
  NEW_EXECUTION: "new_execution",
  IN_FLIGHT_REUSE: "in_flight_reuse",
  COMPLETED_REUSE: "completed_reuse",
});

const commercialRequestDedupStorage = new AsyncLocalStorage();

function cleanText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function cloneValue(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function hashCanonicalKey(key = "") {
  return createHash("sha256").update(String(key)).digest("hex").slice(0, 16);
}

/**
 * @param {Record<string, unknown>} [costGuardContext]
 */
export function buildCommercialRequestDedupPolicyFingerprint(costGuardContext = null) {
  if (
    !costGuardContext ||
    (costGuardContext._contextProvided !== true && costGuardContext.contextProvided !== true)
  ) {
    return "functional:runtime";
  }

  const mode = costGuardContext.isObservabilityOnly === true ? "observability" : "functional";
  const surface = costGuardContext.isDevEndpoint === true ? "dev" : "runtime";
  return `${mode}:${surface}`;
}

/**
 * @param {Record<string, unknown>} input
 */
export function normalizeCommercialRequestDedupInput(input = {}) {
  const query = cleanText(input.query || "");
  const normalizedQuery = query.toLowerCase().normalize("NFKC");
  const limit = Number.parseInt(String(input.limit ?? input.maxResults ?? 12), 10);

  return {
    providerId: cleanText(input.providerId || "").toLowerCase(),
    query,
    normalizedQuery,
    limit: Number.isFinite(limit) && limit > 0 ? limit : 12,
    market: cleanText(input.market || input.country || "br").toLowerCase() || "br",
    locale: cleanText(input.locale || "pt-br").toLowerCase() || "pt-br",
    categoryHint: cleanText(input.categoryHint || "") || "",
    policyFingerprint: buildCommercialRequestDedupPolicyFingerprint(input.costGuardContext || null),
  };
}

/**
 * @param {Record<string, unknown>} input
 */
export function buildCommercialRequestDedupKey(input = {}) {
  const normalized = normalizeCommercialRequestDedupInput(input);
  return [
    normalized.providerId,
    normalized.normalizedQuery,
    normalized.market,
    normalized.locale,
    String(normalized.limit),
    normalized.categoryHint,
    normalized.policyFingerprint,
  ].join("::");
}

/**
 * @param {Record<string, unknown>} [meta]
 */
export function createCommercialRequestDedupContext(meta = {}) {
  return {
    version: COMMERCIAL_REQUEST_DEDUP_VERSION,
    requestId: meta.requestId || null,
    createdAt: Date.now(),
    entries: new Map(),
    events: [],
  };
}

/**
 * @param {Record<string, unknown>|null} context
 */
export function enterCommercialRequestDedupContext(context = null) {
  if (context) {
    commercialRequestDedupStorage.enterWith(context);
  }
  return context;
}

/**
 * @param {Record<string, unknown>|null} context
 * @param {Function} fn
 */
export function runWithCommercialRequestDedupContext(context, fn) {
  return commercialRequestDedupStorage.run(context, fn);
}

export function getActiveCommercialRequestDedupContext() {
  return commercialRequestDedupStorage.getStore() || null;
}

function recordDedupEvent(context, event = {}) {
  if (!context?.events) return;
  context.events.push({
    at: Date.now(),
    ...event,
  });
}

function annotateReusedResult(result, entry = {}, status = "") {
  const cloned = cloneValue(result);
  if (!cloned || typeof cloned !== "object") return cloned;
  cloned.requestDeduplicated = true;
  cloned.savedExternalCall = true;
  cloned.dedupStatus = status;
  cloned.reusedFromLayer = entry.invocationSource || entry.layer || null;
  cloned.dedupKeyHash = entry.canonicalKeyHash || null;
  cloned.originalInvocationSource = entry.invocationSource || null;
  return cloned;
}

/**
 * @param {Record<string, unknown>|null} context
 * @param {string} key
 */
export function getReusableCommercialRequest(context = null, key = "") {
  if (!context?.entries || !key) return null;
  const entry = context.entries.get(key);
  if (!entry) return null;

  if (entry.status === "in_flight" && entry.promise) {
    return { type: "in_flight", promise: entry.promise, entry };
  }

  if (entry.status === "completed") {
    return { type: "completed", result: cloneValue(entry.result), entry };
  }

  return null;
}

/**
 * @param {Record<string, unknown>|null} context
 * @param {string} key
 * @param {Promise<unknown>} promise
 * @param {Record<string, unknown>} meta
 */
export function registerCommercialRequestPromise(context = null, key = "", promise = null, meta = {}) {
  if (!context?.entries || !key || !promise) return;
  const canonicalKeyHash = hashCanonicalKey(key);
  context.entries.set(key, {
    status: "in_flight",
    promise,
    result: null,
    canonicalKeyHash,
    providerId: meta.providerId || null,
    invocationSource: meta.invocationSource || null,
    layer: meta.layer || meta.invocationSource || null,
    policyFingerprint: meta.policyFingerprint || null,
    registeredAt: Date.now(),
  });

  recordDedupEvent(context, {
    providerId: meta.providerId || null,
    status: COMMERCIAL_REQUEST_DEDUP_STATUS.NEW_EXECUTION,
    hit: false,
    canonicalKeyHash,
    invocationSource: meta.invocationSource || null,
    externalCallPrevented: false,
  });
}

/**
 * @param {Record<string, unknown>|null} context
 * @param {string} key
 * @param {Record<string, unknown>} result
 * @param {Record<string, unknown>} meta
 */
export function registerCommercialRequestResult(context = null, key = "", result = {}, meta = {}) {
  if (!context?.entries || !key) return;
  const existing = context.entries.get(key) || {};
  context.entries.set(key, {
    ...existing,
    status: "completed",
    promise: null,
    result: cloneValue(result),
    completedAt: Date.now(),
    resultStatus: result?.error || (result?.ok === false ? "error_or_empty" : "ok"),
    providerId: meta.providerId || existing.providerId || null,
    invocationSource: existing.invocationSource || meta.invocationSource || null,
    layer: existing.layer || meta.layer || null,
    canonicalKeyHash: existing.canonicalKeyHash || hashCanonicalKey(key),
    policyFingerprint: meta.policyFingerprint || existing.policyFingerprint || null,
  });
}

/**
 * @param {{
 *   dedupContext?: Record<string, unknown>|null,
 *   commercialRequestDedupContext?: Record<string, unknown>|null,
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
 *   execute?: Function,
 * }} input
 */
export async function executeCommercialRequestWithDeduplication(input = {}) {
  const execute = typeof input.execute === "function" ? input.execute : async () => null;
  const context =
    input.dedupContext ||
    input.commercialRequestDedupContext ||
    getActiveCommercialRequestDedupContext();

  if (!context) {
    return execute();
  }

  const normalized = normalizeCommercialRequestDedupInput({
    providerId: input.providerId,
    query: input.query,
    limit: input.limit ?? input.maxResults,
    categoryHint: input.categoryHint,
    market: input.market,
    locale: input.locale,
    costGuardContext: input.costGuardContext,
  });
  const key = buildCommercialRequestDedupKey({
    providerId: input.providerId,
    query: input.query,
    limit: normalized.limit,
    categoryHint: input.categoryHint,
    market: input.market,
    locale: input.locale,
    costGuardContext: input.costGuardContext,
  });
  const canonicalKeyHash = hashCanonicalKey(key);
  const meta = {
    providerId: normalized.providerId,
    invocationSource: input.invocationSource || input.layer || "unspecified",
    layer: input.layer || input.invocationSource || "unspecified",
    policyFingerprint: normalized.policyFingerprint,
    canonicalKeyHash,
  };

  const reusable = getReusableCommercialRequest(context, key);
  if (reusable?.type === "completed") {
    recordDedupEvent(context, {
      providerId: meta.providerId,
      status: COMMERCIAL_REQUEST_DEDUP_STATUS.COMPLETED_REUSE,
      hit: true,
      canonicalKeyHash,
      invocationSource: meta.invocationSource,
      reusedFromLayer: reusable.entry?.layer || reusable.entry?.invocationSource || null,
      externalCallPrevented: true,
      resultStatus: reusable.entry?.resultStatus || null,
    });
    return annotateReusedResult(
      reusable.result,
      reusable.entry,
      COMMERCIAL_REQUEST_DEDUP_STATUS.COMPLETED_REUSE
    );
  }

  if (reusable?.type === "in_flight") {
    recordDedupEvent(context, {
      providerId: meta.providerId,
      status: COMMERCIAL_REQUEST_DEDUP_STATUS.IN_FLIGHT_REUSE,
      hit: true,
      canonicalKeyHash,
      invocationSource: meta.invocationSource,
      reusedFromLayer: reusable.entry?.layer || reusable.entry?.invocationSource || null,
      externalCallPrevented: true,
    });
    const result = await reusable.promise;
    return annotateReusedResult(
      result,
      reusable.entry,
      COMMERCIAL_REQUEST_DEDUP_STATUS.IN_FLIGHT_REUSE
    );
  }

  const promise = (async () => {
    const result = await execute();
    registerCommercialRequestResult(context, key, result, meta);
    return result;
  })();

  registerCommercialRequestPromise(context, key, promise, meta);
  return promise;
}

/**
 * @param {Record<string, unknown>|null} context
 */
export function buildCommercialRequestDedupDiagnostics(context = null) {
  if (!context) {
    return {
      version: COMMERCIAL_REQUEST_DEDUP_VERSION,
      active: false,
      eventCount: 0,
      externalCallsPrevented: 0,
    };
  }

  const events = Array.isArray(context.events) ? context.events : [];
  return {
    version: COMMERCIAL_REQUEST_DEDUP_VERSION,
    active: true,
    requestId: context.requestId || null,
    entryCount: context.entries?.size || 0,
    eventCount: events.length,
    externalCallsPrevented: events.filter((event) => event.externalCallPrevented === true).length,
    hits: events.filter((event) => event.hit === true).length,
    misses: events.filter((event) => event.hit !== true).length,
    recentEvents: events.slice(-20),
  };
}

/**
 * @param {Record<string, unknown>|null} context
 */
export function buildCommercialRequestDedupDevPayload(context = null) {
  const diagnostics = buildCommercialRequestDedupDiagnostics(context);
  return {
    version: COMMERCIAL_REQUEST_DEDUP_VERSION,
    diagnostics,
    events: context?.events || [],
    entries: context?.entries
      ? [...context.entries.entries()].map(([key, entry]) => ({
          keyHash: hashCanonicalKey(key),
          status: entry.status,
          providerId: entry.providerId || null,
          invocationSource: entry.invocationSource || null,
          resultStatus: entry.resultStatus || null,
        }))
      : [],
  };
}

/**
 * @param {Record<string, unknown>|null} context
 */
export function buildCommercialRequestDedupTracePatch(context = null) {
  if (!context) return null;
  const diagnostics = buildCommercialRequestDedupDiagnostics(context);
  return {
    commercial_request_deduplication: diagnostics,
    commercial_request_deduplication_full: buildCommercialRequestDedupDevPayload(context),
  };
}
