/**
 * PATCH 8.2 — Provider attempt request-scoped tracker.
 */

import {
  MIA_PROVIDER_EXECUTION_PATHS,
  MIA_PROVIDER_RUNTIME_MODES,
} from "./miaProviderAttemptCatalog.js";
import { normalizeProviderAttemptId } from "./miaProviderIdCatalog.js";
import {
  resolveContributedResults,
  resolveFailureCategoryForAttempt,
  resolveHttpStatusGroup,
  resolveProviderAttemptStatus,
  resolveResponseUsable,
  resolveSkipReason,
} from "./miaProviderAttemptClassifier.js";
import {
  resolveProviderConfigStatus,
  resolveProviderFamily,
} from "./miaProviderIdCatalog.js";

/**
 * @param {string} requestId
 * @param {string} providerId
 * @param {number} attemptIndex
 * @param {string} eventName
 * @param {string} eventVersion
 */
export function buildProviderAttemptDedupKey(
  requestId,
  providerId,
  attemptIndex,
  eventName,
  eventVersion
) {
  return `${requestId}|${normalizeProviderAttemptId(providerId)}|${attemptIndex}|${eventName}|${eventVersion}`;
}

/**
 * @param {object} [seed]
 */
export function createProviderAttemptAnalyticsBucket(seed = {}) {
  return {
    active: false,
    attempts: [],
    attemptCounters: {},
    endpoint: seed.endpoint || "/api/chat-gpt4o",
    requestId: seed.requestId ?? null,
    analyticsContext: seed.analyticsContext || {},
    controlledTest: !!seed.controlledTest,
  };
}

/**
 * @param {ReturnType<typeof createProviderAttemptAnalyticsBucket>|null|undefined} bucket
 */
export function activateProviderAttemptAnalyticsBucket(bucket) {
  if (!bucket) return bucket;
  bucket.active = true;
  return bucket;
}

/**
 * @param {ReturnType<typeof createProviderAttemptAnalyticsBucket>|null|undefined} bucket
 * @param {string} providerId
 */
function nextAttemptIndex(bucket, providerId) {
  const normalized = normalizeProviderAttemptId(providerId);
  const current = bucket.attemptCounters[normalized] || 0;
  const next = current + 1;
  bucket.attemptCounters[normalized] = next;
  return next;
}

/**
 * @param {ReturnType<typeof createProviderAttemptAnalyticsBucket>|null|undefined} bucket
 * @param {object} input
 */
export function recordProviderAttemptObservation(bucket, input = {}) {
  if (!bucket?.active) return null;

  const providerId = normalizeProviderAttemptId(input.providerId);
  const attemptIndex =
    Number(input.attemptIndex) > 0
      ? Number(input.attemptIndex)
      : nextAttemptIndex(bucket, providerId);

  const rawCount = input.rawResultsCount ?? input.resultCount ?? null;
  const normalizedCount = input.normalizedResultsCount ?? rawCount;

  const attemptStatus = resolveProviderAttemptStatus({
    skipped: input.skipped,
    ok: input.ok,
    resultCount: normalizedCount,
    error: input.error,
    timedOut: input.timedOut,
    cancelled: input.cancelled,
  });

  const observation = {
    dedupKey: buildProviderAttemptDedupKey(
      bucket.requestId || "unknown",
      providerId,
      attemptIndex,
      input.eventName || "mia_provider_attempt",
      input.eventVersion || "8.2.0"
    ),
    finalized: false,
    emitted: false,
    providerId,
    providerFamily: resolveProviderFamily(providerId),
    runtimeMode: input.runtimeMode || MIA_PROVIDER_RUNTIME_MODES.UNKNOWN,
    executionPath: input.executionPath || MIA_PROVIDER_EXECUTION_PATHS.UNKNOWN,
    attemptIndex,
    providerPriority: input.providerPriority ?? null,
    providerConfigStatus: resolveProviderConfigStatus(providerId, {
      enabled: input.providerEnabled,
      stub: input.providerStub,
    }),
    attemptStatus,
    skipReason: input.skipped
      ? resolveSkipReason(input.blockedReason, input.error)
      : null,
    failureCategory: resolveFailureCategoryForAttempt(
      attemptStatus,
      input.error,
      { timedOut: input.timedOut }
    ),
    httpStatusGroup: resolveHttpStatusGroup(input.httpStatusCode, {
      networkError: input.networkError,
    }),
    httpStatusCode: Number.isFinite(Number(input.httpStatusCode))
      ? Number(input.httpStatusCode)
      : null,
    durationMs:
      Number.isFinite(Number(input.durationMs)) && Number(input.durationMs) >= 0
        ? Math.round(Number(input.durationMs))
        : null,
    rawResultsCount:
      rawCount == null ? null : Math.max(0, Number(rawCount) || 0),
    normalizedResultsCount:
      normalizedCount == null ? null : Math.max(0, Number(normalizedCount) || 0),
    postMergeResultsCount: null,
    postDedupResultsCount: null,
    contributedResults: resolveContributedResults(attemptStatus, normalizedCount),
    contributedToFinalSet: false,
    winnerProvider: false,
    fallbackTriggered: !!input.fallbackTriggered,
    fallbackFromProvider: input.fallbackFromProvider
      ? normalizeProviderAttemptId(input.fallbackFromProvider)
      : null,
    fallbackToProvider: input.fallbackToProvider
      ? normalizeProviderAttemptId(input.fallbackToProvider)
      : null,
    retryAttempt: !!input.retryAttempt,
    retryIndex: Math.max(0, Number(input.retryIndex) || 0),
    responseUsable: resolveResponseUsable(attemptStatus, normalizedCount),
    endpoint: input.endpoint || bucket.endpoint,
    source: "server",
    shadowObserved: !!input.shadowObserved,
    startedAt: input.startedAt ?? Date.now(),
  };

  const existing = bucket.attempts.find((item) => item.dedupKey === observation.dedupKey);
  if (existing) {
    if (existing.finalized) return existing;
    Object.assign(existing, observation, { finalized: existing.finalized, emitted: existing.emitted });
    return existing;
  }

  bucket.attempts.push(observation);
  return observation;
}

/**
 * @param {ReturnType<typeof createProviderAttemptAnalyticsBucket>|null|undefined} bucket
 * @param {string} dedupKey
 * @param {object} patch
 */
export function updateProviderAttemptObservation(bucket, dedupKey, patch = {}) {
  if (!bucket?.active || !dedupKey) return null;
  const target = bucket.attempts.find((item) => item.dedupKey === dedupKey);
  if (!target || target.finalized) return target;

  if (patch.durationMs != null) target.durationMs = Math.max(0, Math.round(Number(patch.durationMs) || 0));
  if (patch.attemptStatus != null) target.attemptStatus = patch.attemptStatus;
  if (patch.contributedToFinalSet != null) target.contributedToFinalSet = !!patch.contributedToFinalSet;
  if (patch.winnerProvider != null) target.winnerProvider = !!patch.winnerProvider;
  return target;
}

/**
 * Finalize observation — prevents double mutation.
 *
 * @param {object|null|undefined} observation
 */
export function finalizeProviderAttemptObservation(observation) {
  if (!observation || observation.finalized) return observation;
  observation.finalized = true;
  return observation;
}

/**
 * @param {ReturnType<typeof createProviderAttemptAnalyticsBucket>|null|undefined} bucket
 * @param {{ prices?: Array<{ source?: string, provider?: string }>, winnerSource?: string|null }} [input]
 */
export function applyProviderContributionFromResponse(bucket, input = {}) {
  if (!bucket?.active) return bucket;

  const prices = Array.isArray(input.prices) ? input.prices : [];
  const sources = new Set(
    prices
      .map((price) => normalizeProviderAttemptId(price?.provider || price?.source || ""))
      .filter(Boolean)
  );

  const winnerSource = input.winnerSource
    ? normalizeProviderAttemptId(input.winnerSource)
    : prices[0]
      ? normalizeProviderAttemptId(prices[0]?.provider || prices[0]?.source || "")
      : null;

  for (const observation of bucket.attempts) {
    if (observation.shadowObserved) {
      observation.winnerProvider = false;
      continue;
    }
    observation.contributedToFinalSet = sources.has(observation.providerId);
    observation.winnerProvider =
      !!winnerSource && observation.providerId === winnerSource && !observation.shadowObserved;
  }

  return bucket;
}

/**
 * @param {ReturnType<typeof createProviderAttemptAnalyticsBucket>|null|undefined} bucket
 */
export function listFinalizedProviderAttemptObservations(bucket) {
  if (!bucket?.active) return [];
  return bucket.attempts.filter((item) => !item.emitted);
}

/**
 * @param {object|null|undefined} observation
 */
export function markProviderAttemptObservationEmitted(observation) {
  if (!observation) return;
  observation.emitted = true;
  observation.finalized = true;
}
