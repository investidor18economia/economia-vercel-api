/**
 * PATCH Comercial 05E — Conditional Provider Fetch
 *
 * Execução progressiva entre providers comerciais com short-circuit seguro.
 * Não decide winner, ranking ou produto — apenas suficiência comercial.
 */

import { createHash } from "node:crypto";
import {
  calculateCommercialAlignment,
} from "../productSourceAdapter/commercialQueryProductAlignmentLayer.js";
import {
  isBrokenCommercialOffer,
} from "../productSourceAdapter/commercialSelectionEngine.js";
import {
  listEnabledCommercialProviders,
} from "../productSourceAdapter/commercialProviderRegistry.js";
import {
  buildMultiProviderPriorityPlan,
  readMultiProviderPriorityConfig,
} from "./multiProviderPriorityEngine.js";
import { COMMERCIAL_RUNTIME_MODES } from "../productSourceAdapter/commercialRuntimeMode.js";
import { observeConditionalProviderAttempt } from "../miaProviderAttemptAnalytics.js";

export const CONDITIONAL_PROVIDER_FETCH_VERSION = "05E";

export const CONDITIONAL_PROVIDER_FETCH_DECISION = Object.freeze({
  SUFFICIENT: "sufficient",
  INSUFFICIENT: "insufficient",
});

export const CONDITIONAL_PROVIDER_FETCH_REASON_CODES = Object.freeze({
  USABLE_OFFERS: "usable_offers",
  BELOW_MIN_USABLE_OFFERS: "below_min_usable_offers",
  NO_USABLE_OFFERS: "no_usable_offers",
  EMPTY_RESULT: "empty_result",
  PROVIDER_ERROR: "provider_error",
  TIMEOUT: "timeout",
  COST_GUARD_BLOCKED: "cost_guard_blocked",
  DRY_RUN: "dry_run",
  INVALID_CONTRACT: "invalid_contract",
  MISALIGNED_OFFERS: "misaligned_offers",
  SKIPPED_PRIOR_SUFFICIENT: "skipped_prior_sufficient",
  DISABLED_ALL_FETCHED: "disabled_all_fetched",
});

export const CONDITIONAL_PROVIDER_FETCH_ENABLED_ENV = "CONDITIONAL_PROVIDER_FETCH_ENABLED";
export const COMMERCIAL_SUFFICIENCY_MIN_USABLE_OFFERS_ENV =
  "COMMERCIAL_SUFFICIENCY_MIN_USABLE_OFFERS";
export const COMMERCIAL_SUFFICIENCY_MIN_ALIGNMENT_SCORE_ENV =
  "COMMERCIAL_SUFFICIENCY_MIN_ALIGNMENT_SCORE";

const DEFAULT_MIN_USABLE_OFFERS = 1;
const DEFAULT_MIN_ALIGNMENT_SCORE = 35;

const conditionalFetchEvents = [];
const MAX_EVENT_LOG = 200;

function cleanText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function hashKey(value = "") {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
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
export function readConditionalProviderFetchConfig(env = process.env) {
  return {
    enabled: parseBooleanEnv(env?.[CONDITIONAL_PROVIDER_FETCH_ENABLED_ENV], true),
    minUsableOffers: parsePositiveInt(
      env?.[COMMERCIAL_SUFFICIENCY_MIN_USABLE_OFFERS_ENV],
      DEFAULT_MIN_USABLE_OFFERS
    ),
    minAlignmentScore: parsePositiveInt(
      env?.[COMMERCIAL_SUFFICIENCY_MIN_ALIGNMENT_SCORE_ENV],
      DEFAULT_MIN_ALIGNMENT_SCORE
    ),
  };
}

function mapProductToOffer(product = {}) {
  return {
    title: cleanText(product.product_name || product.title || product.normalizedName || ""),
    price: product.price ?? product.numericPrice ?? null,
    url: cleanText(product.link || product.url || ""),
    image: product.thumbnail || product.image || null,
    source: product.source || product.provider || "",
    provider: product.provider || null,
  };
}

function recordConditionalFetchEvent(event = {}) {
  conditionalFetchEvents.push({
    at: Date.now(),
    ...event,
  });
  if (conditionalFetchEvents.length > MAX_EVENT_LOG) {
    conditionalFetchEvents.splice(0, conditionalFetchEvents.length - MAX_EVENT_LOG);
  }
}

function isDryRunResult(result = {}) {
  return result?.costGuardDecision?.decision === "dry_run";
}

function isBlockedResult(result = {}) {
  return result?.error === "cost_guard_blocked" || result?.costGuardDecision?.shouldCallProvider === false;
}

/**
 * @param {Record<string, unknown>} input
 */
export function evaluateCommercialResultSufficiency(input = {}) {
  const config = readConditionalProviderFetchConfig(input.env);
  const query = cleanText(input.query || "");
  const result = input.result || {};
  const minUsableOffers = input.minUsableOffers ?? config.minUsableOffers;
  const minAlignmentScore = input.minAlignmentScore ?? config.minAlignmentScore;

  if (!result || typeof result !== "object") {
    return {
      decision: CONDITIONAL_PROVIDER_FETCH_DECISION.INSUFFICIENT,
      reasonCode: CONDITIONAL_PROVIDER_FETCH_REASON_CODES.INVALID_CONTRACT,
      usableOfferCount: 0,
      totalOfferCount: 0,
      cacheHit: false,
    };
  }

  if (isDryRunResult(result)) {
    return {
      decision: CONDITIONAL_PROVIDER_FETCH_DECISION.INSUFFICIENT,
      reasonCode: CONDITIONAL_PROVIDER_FETCH_REASON_CODES.DRY_RUN,
      usableOfferCount: 0,
      totalOfferCount: 0,
      cacheHit: result.universalCommercialCacheHit === true,
      costGuardDecision: result.costGuardDecision || null,
    };
  }

  if (isBlockedResult(result)) {
    return {
      decision: CONDITIONAL_PROVIDER_FETCH_DECISION.INSUFFICIENT,
      reasonCode: CONDITIONAL_PROVIDER_FETCH_REASON_CODES.COST_GUARD_BLOCKED,
      usableOfferCount: 0,
      totalOfferCount: 0,
      cacheHit: result.universalCommercialCacheHit === true,
      costGuardDecision: result.costGuardDecision || null,
    };
  }

  if (result.error === "budget_blocked" || result.error === "circuit_breaker_open") {
    return {
      decision: CONDITIONAL_PROVIDER_FETCH_DECISION.INSUFFICIENT,
      reasonCode:
        result.error === "budget_blocked"
          ? "budget_blocked"
          : "circuit_breaker_open",
      usableOfferCount: 0,
      totalOfferCount: 0,
      cacheHit: result.universalCommercialCacheHit === true,
      budgetCircuitDecision: result.budgetCircuitDecision || null,
      circuitState: result.circuitState || null,
    };
  }

  const error = cleanText(result.error || "");
  if (error === "timeout") {
    return {
      decision: CONDITIONAL_PROVIDER_FETCH_DECISION.INSUFFICIENT,
      reasonCode: CONDITIONAL_PROVIDER_FETCH_REASON_CODES.TIMEOUT,
      usableOfferCount: 0,
      totalOfferCount: 0,
      cacheHit: result.universalCommercialCacheHit === true,
    };
  }

  if (error === "provider_error" || result.threw === true) {
    return {
      decision: CONDITIONAL_PROVIDER_FETCH_DECISION.INSUFFICIENT,
      reasonCode: CONDITIONAL_PROVIDER_FETCH_REASON_CODES.PROVIDER_ERROR,
      usableOfferCount: 0,
      totalOfferCount: 0,
      cacheHit: result.universalCommercialCacheHit === true,
    };
  }

  const products = Array.isArray(result.products) ? result.products : [];
  if (!products.length) {
    return {
      decision: CONDITIONAL_PROVIDER_FETCH_DECISION.INSUFFICIENT,
      reasonCode: CONDITIONAL_PROVIDER_FETCH_REASON_CODES.EMPTY_RESULT,
      usableOfferCount: 0,
      totalOfferCount: 0,
      cacheHit: result.universalCommercialCacheHit === true,
    };
  }

  const usableOffers = [];
  for (const product of products) {
    const offer = mapProductToOffer(product);
    if (isBrokenCommercialOffer(offer)) continue;

    if (query) {
      const alignment = calculateCommercialAlignment({ query, offer });
      const alignmentScore = alignment?.alignmentScore ?? alignment?.score ?? 0;
      if (alignmentScore < minAlignmentScore) continue;
    }

    usableOffers.push(offer);
  }

  if (usableOffers.length >= minUsableOffers) {
    return {
      decision: CONDITIONAL_PROVIDER_FETCH_DECISION.SUFFICIENT,
      reasonCode: CONDITIONAL_PROVIDER_FETCH_REASON_CODES.USABLE_OFFERS,
      usableOfferCount: usableOffers.length,
      totalOfferCount: products.length,
      cacheHit: result.universalCommercialCacheHit === true,
      requestDeduplicated: result.requestDeduplicated === true,
    };
  }

  if (usableOffers.length > 0) {
    return {
      decision: CONDITIONAL_PROVIDER_FETCH_DECISION.INSUFFICIENT,
      reasonCode: CONDITIONAL_PROVIDER_FETCH_REASON_CODES.BELOW_MIN_USABLE_OFFERS,
      usableOfferCount: usableOffers.length,
      totalOfferCount: products.length,
      cacheHit: result.universalCommercialCacheHit === true,
    };
  }

  return {
    decision: CONDITIONAL_PROVIDER_FETCH_DECISION.INSUFFICIENT,
    reasonCode: query
      ? CONDITIONAL_PROVIDER_FETCH_REASON_CODES.MISALIGNED_OFFERS
      : CONDITIONAL_PROVIDER_FETCH_REASON_CODES.NO_USABLE_OFFERS,
    usableOfferCount: 0,
    totalOfferCount: products.length,
    cacheHit: result.universalCommercialCacheHit === true,
  };
}

/**
 * @param {Record<string, unknown>} input
 */
export function shouldContinueCommercialProviderFetch(input = {}) {
  const sufficiency = input.sufficiency || evaluateCommercialResultSufficiency(input);
  return sufficiency.decision !== CONDITIONAL_PROVIDER_FETCH_DECISION.SUFFICIENT;
}

/**
 * @param {{
 *   providerIds?: string[],
 *   fetchBindings?: Record<string, unknown>,
 *   runtimeMode?: string,
 *   invocationSource?: string,
 *   query?: string,
 *   limit?: number,
 *   categoryHint?: string,
 *   env?: Record<string, string|undefined>,
 *   priorityPlan?: Record<string, unknown>|null,
 * }} [input]
 */
export function buildConditionalProviderFetchPlan(input = {}) {
  if (input.priorityPlan?.orderedProviders?.length) {
    return input.priorityPlan.orderedProviders.map((entry, sequenceIndex) => ({
      providerId: entry.providerId,
      sequenceIndex,
      enabled: true,
      fetchBinding: input.fetchBindings?.[entry.providerId] || null,
      priorityScore: entry.priorityScore ?? null,
      priorityTier: entry.priorityTier ?? null,
    }));
  }

  const config = readMultiProviderPriorityConfig(input.env);
  const runtimeMode = cleanText(input.runtimeMode);
  const shouldUsePriorityEngine =
    config.enabled &&
    runtimeMode &&
    runtimeMode !== COMMERCIAL_RUNTIME_MODES.LEGACY;

  if (shouldUsePriorityEngine) {
    const priorityPlan = buildMultiProviderPriorityPlan({
      runtimeMode,
      invocationSource: input.invocationSource || "conditional_provider_fetch",
      query: input.query,
      limit: input.limit,
      categoryHint: input.categoryHint,
      env: input.env,
    });

    return priorityPlan.orderedProviders.map((entry, sequenceIndex) => ({
      providerId: entry.providerId,
      sequenceIndex,
      enabled: true,
      fetchBinding: input.fetchBindings?.[entry.providerId] || null,
      priorityScore: entry.priorityScore ?? null,
      priorityTier: entry.priorityTier ?? null,
      priorityPlan,
    }));
  }

  const enabledProviders = Array.isArray(input.providerIds) && input.providerIds.length
    ? input.providerIds.map((providerId) => ({ id: providerId, enabled: true }))
    : listEnabledCommercialProviders(input.env);

  return enabledProviders
    .filter((provider) => provider.enabled !== false)
    .map((provider, sequenceIndex) => ({
      providerId: provider.id,
      sequenceIndex,
      enabled: true,
      fetchBinding: input.fetchBindings?.[provider.id] || null,
    }));
}

function buildSkippedProviderResult(providerId = "", reasonCode = "") {
  return {
    ok: false,
    products: [],
    error: "provider_skipped",
    skipped: true,
    providerId,
    skipReasonCode: reasonCode,
    count: 0,
  };
}

/**
 * @param {{
 *   query?: string,
 *   providers?: Array<{ providerId?: string, resultKey?: string, fetch?: Function }>,
 *   env?: Record<string, string|undefined>,
 *   minUsableOffers?: number,
 *   minAlignmentScore?: number,
 * }} input
 */
export async function executeConditionalProviderFetch(input = {}) {
  const config = readConditionalProviderFetchConfig(input.env);
  const providers = Array.isArray(input.providers) ? input.providers : [];
  const results = {};
  const attempts = [];
  const skipped = [];
  let shortCircuitApplied = false;
  let externalCallsPrevented = 0;

  if (!config.enabled) {
    for (const slot of providers) {
      const resultKey = slot.resultKey || slot.providerId;
      const result = await slot.fetch();
      results[resultKey] = result;
      attempts.push({
        providerId: slot.providerId,
        resultKey,
        sequenceIndex: attempts.length,
        fetched: true,
        skipped: false,
        reasonCode: CONDITIONAL_PROVIDER_FETCH_REASON_CODES.DISABLED_ALL_FETCHED,
      });
    }

    return {
      results,
      attempts,
      skipped,
      shortCircuitApplied: false,
      externalCallsPrevented: 0,
      providersPlanned: providers.length,
      providersAttempted: providers.length,
      providersSkipped: 0,
    };
  }

  for (let sequenceIndex = 0; sequenceIndex < providers.length; sequenceIndex += 1) {
    const slot = providers[sequenceIndex];
    const resultKey = slot.resultKey || slot.providerId;

    if (shortCircuitApplied) {
      const skippedResult = buildSkippedProviderResult(
        slot.providerId,
        CONDITIONAL_PROVIDER_FETCH_REASON_CODES.SKIPPED_PRIOR_SUFFICIENT
      );
      results[resultKey] = skippedResult;
      skipped.push({
        providerId: slot.providerId,
        resultKey,
        sequenceIndex,
        reasonCode: CONDITIONAL_PROVIDER_FETCH_REASON_CODES.SKIPPED_PRIOR_SUFFICIENT,
      });
      externalCallsPrevented += 1;
      recordConditionalFetchEvent({
        providerId: slot.providerId,
        sequenceIndex,
        resultStatus: "skipped",
        sufficiencyDecision: null,
        sufficiencyReasonCode: CONDITIONAL_PROVIDER_FETCH_REASON_CODES.SKIPPED_PRIOR_SUFFICIENT,
        shortCircuitApplied: true,
        nextProviderRequired: false,
        externalCallPrevented: true,
      });
      observeConditionalProviderAttempt({
        providerId: slot.providerId,
        providerPriority: sequenceIndex + 1,
        attemptIndex: sequenceIndex + 1,
        skipped: true,
        blockedReason: CONDITIONAL_PROVIDER_FETCH_REASON_CODES.SKIPPED_PRIOR_SUFFICIENT,
        error: CONDITIONAL_PROVIDER_FETCH_REASON_CODES.SKIPPED_PRIOR_SUFFICIENT,
      });
      continue;
    }

    const result = await slot.fetch();
    results[resultKey] = result;

    const sufficiency = evaluateCommercialResultSufficiency({
      query: input.query,
      result,
      env: input.env,
      minUsableOffers: input.minUsableOffers,
      minAlignmentScore: input.minAlignmentScore,
    });

    const attempt = {
      providerId: slot.providerId,
      resultKey,
      sequenceIndex,
      fetched: true,
      skipped: false,
      resultStatus: result?.error || (result?.ok ? "ok" : "unknown"),
      resultCount: Array.isArray(result?.products) ? result.products.length : 0,
      sufficiencyDecision: sufficiency.decision,
      sufficiencyReasonCode: sufficiency.reasonCode,
      usableOfferCount: sufficiency.usableOfferCount,
      cacheHit: sufficiency.cacheHit === true,
      requestDeduplicated: sufficiency.requestDeduplicated === true,
      costGuardDecision: sufficiency.costGuardDecision || result?.costGuardDecision || null,
      shortCircuitApplied: false,
      nextProviderRequired: sufficiency.decision !== CONDITIONAL_PROVIDER_FETCH_DECISION.SUFFICIENT,
    };
    attempts.push(attempt);

    recordConditionalFetchEvent({
      providerId: slot.providerId,
      sequenceIndex,
      resultStatus: attempt.resultStatus,
      resultCount: attempt.resultCount,
      sufficiencyDecision: sufficiency.decision,
      sufficiencyReasonCode: sufficiency.reasonCode,
      shortCircuitApplied: false,
      nextProviderRequired: attempt.nextProviderRequired,
      externalCallPrevented: false,
      cacheHit: sufficiency.cacheHit === true,
      costGuardDecision: attempt.costGuardDecision?.decision || null,
    });

    if (sufficiency.decision === CONDITIONAL_PROVIDER_FETCH_DECISION.SUFFICIENT) {
      shortCircuitApplied = true;
      attempts[attempts.length - 1].shortCircuitApplied = true;
      attempts[attempts.length - 1].nextProviderRequired = false;
      conditionalFetchEvents[conditionalFetchEvents.length - 1].shortCircuitApplied = true;
      conditionalFetchEvents[conditionalFetchEvents.length - 1].nextProviderRequired = false;
    }

    const _previousAttempt = attempts.length > 1 ? attempts[attempts.length - 2] : null;
    observeConditionalProviderAttempt({
      providerId: slot.providerId,
      providerPriority: sequenceIndex + 1,
      attemptIndex: sequenceIndex + 1,
      ok: result?.ok,
      resultCount: attempt.resultCount,
      rawResultsCount: attempt.resultCount,
      normalizedResultsCount: attempt.usableOfferCount ?? attempt.resultCount,
      error: result?.error || attempt.resultStatus,
      skipped: false,
      fallbackTriggered: !!_previousAttempt,
      fallbackFromProvider: _previousAttempt?.providerId || null,
      fallbackToProvider: _previousAttempt ? slot.providerId : null,
    });
  }

  if (shortCircuitApplied) {
    externalCallsPrevented = skipped.length;
  }

  return {
    results,
    attempts,
    skipped,
    shortCircuitApplied,
    externalCallsPrevented,
    providersPlanned: providers.length,
    providersAttempted: attempts.length,
    providersSkipped: skipped.length,
  };
}

/**
 * @param {Record<string, unknown>|null} execution
 */
export function buildConditionalProviderFetchDiagnostics(execution = null) {
  if (!execution) {
    return {
      version: CONDITIONAL_PROVIDER_FETCH_VERSION,
      enabled: readConditionalProviderFetchConfig().enabled,
      eventCount: 0,
      externalCallsPrevented: 0,
    };
  }

  return {
    version: CONDITIONAL_PROVIDER_FETCH_VERSION,
    enabled: readConditionalProviderFetchConfig().enabled,
    providersPlanned: execution.providersPlanned || 0,
    providersAttempted: execution.providersAttempted || 0,
    providersSkipped: execution.providersSkipped || 0,
    shortCircuitApplied: execution.shortCircuitApplied === true,
    externalCallsPrevented: execution.externalCallsPrevented || 0,
    attempts: execution.attempts || [],
    skipped: execution.skipped || [],
    recentEvents: conditionalFetchEvents.slice(-20),
  };
}

export function buildConditionalProviderFetchDevPayload(execution = null) {
  return {
    version: CONDITIONAL_PROVIDER_FETCH_VERSION,
    config: readConditionalProviderFetchConfig(),
    diagnostics: buildConditionalProviderFetchDiagnostics(execution),
    events: conditionalFetchEvents.slice(-50),
  };
}

/**
 * @param {Record<string, unknown>|null} execution
 */
export function buildConditionalProviderFetchTracePatch(execution = null) {
  const diagnostics = buildConditionalProviderFetchDiagnostics(execution);
  return {
    conditional_provider_fetch: diagnostics,
    conditional_provider_fetch_full: buildConditionalProviderFetchDevPayload(execution),
  };
}

export function resetConditionalProviderFetchEventsForTests() {
  conditionalFetchEvents.length = 0;
}

export function buildConditionalProviderFetchQueryHash(query = "") {
  return hashKey(cleanText(query).toLowerCase());
}
