/**
 * PATCH 8.2 — Shadow trace → safe provider attempt subset adapter.
 *
 * Does NOT persist raw trace, payloads, URLs, tokens, or product lists.
 */

import { MIA_PROVIDER_EXECUTION_PATHS, MIA_PROVIDER_RUNTIME_MODES } from "./miaProviderAttemptCatalog.js";
import { normalizeProviderAttemptId } from "./miaProviderIdCatalog.js";
import { resolveProviderAttemptStatus } from "./miaProviderAttemptClassifier.js";

/**
 * @param {object|null|undefined} attempt
 * @param {number} [sequenceIndex]
 */
function mapConditionalAttemptToObservation(attempt, sequenceIndex = 0) {
  if (!attempt || typeof attempt !== "object") return null;

  const providerId = normalizeProviderAttemptId(attempt.providerId);
  const resultCount = Math.max(
    0,
    Number(attempt.resultCount ?? attempt.usableOfferCount) || 0
  );
  const skipped = attempt.skipped === true || attempt.fetched === false;
  const attemptStatus = resolveProviderAttemptStatus({
    skipped,
    ok: !skipped && (attempt.resultStatus === "ok" || resultCount > 0),
    resultCount,
    error: attempt.resultStatus,
  });

  return {
    providerId,
    attemptIndex: Number(attempt.sequenceIndex ?? sequenceIndex) + 1,
    providerPriority: Number(attempt.sequenceIndex ?? sequenceIndex) + 1,
    runtimeMode: MIA_PROVIDER_RUNTIME_MODES.SHADOW,
    executionPath: MIA_PROVIDER_EXECUTION_PATHS.SHADOW_ONLY,
    skipped,
    ok: attemptStatus === "SUCCESS" || attemptStatus === "EMPTY" ? attemptStatus === "SUCCESS" : false,
    resultCount,
    error: skipped ? attempt.reasonCode || attempt.resultStatus : attempt.resultStatus,
    blockedReason: attempt.reasonCode || null,
    durationMs: null,
    shadowObserved: true,
    fallbackTriggered: false,
  };
}

/**
 * Materialize safe observations from conditional provider fetch execution (shadow).
 *
 * @param {object|null|undefined} conditionalExecution
 */
export function materializeShadowProviderAttemptsFromConditionalExecution(conditionalExecution) {
  if (!conditionalExecution || typeof conditionalExecution !== "object") return [];

  const observations = [];

  for (const attempt of conditionalExecution.attempts || []) {
    const mapped = mapConditionalAttemptToObservation(attempt);
    if (mapped) observations.push(mapped);
  }

  for (const skipped of conditionalExecution.skipped || []) {
    observations.push({
      providerId: normalizeProviderAttemptId(skipped.providerId),
      attemptIndex: Number(skipped.sequenceIndex ?? observations.length) + 1,
      providerPriority: Number(skipped.sequenceIndex ?? observations.length) + 1,
      runtimeMode: MIA_PROVIDER_RUNTIME_MODES.SHADOW,
      executionPath: MIA_PROVIDER_EXECUTION_PATHS.SHADOW_ONLY,
      skipped: true,
      ok: false,
      resultCount: 0,
      error: skipped.reasonCode || "provider_skipped",
      blockedReason: skipped.reasonCode || null,
      durationMs: null,
      shadowObserved: true,
      fallbackTriggered: false,
    });
  }

  return observations;
}

/**
 * @param {object|null|undefined} shadowPipelineTrace
 */
export function materializeShadowProviderAttemptsFromPipelineTrace(shadowPipelineTrace) {
  if (!shadowPipelineTrace || typeof shadowPipelineTrace !== "object") return [];

  const resultKeys = [
    ["googleResult", "google_shopping"],
    ["googleDataForSeoResult", "google_shopping_dataforseo"],
    ["mercadolivreResult", "mercadolivre_public"],
    ["apifyResult", "apify_mercadolivre"],
  ];

  const observations = [];
  for (const [traceKey, defaultProviderId] of resultKeys) {
    const result = shadowPipelineTrace[traceKey];
    if (!result || typeof result !== "object") continue;

    const resultCount = Array.isArray(result.products) ? result.products.length : Number(result.count) || 0;
    const attemptStatus = resolveProviderAttemptStatus({
      skipped: result.skipped === true || result.error === "provider_disabled",
      ok: result.ok,
      resultCount,
      error: result.error,
    });

    observations.push({
      providerId: normalizeProviderAttemptId(result.provider || defaultProviderId),
      runtimeMode: MIA_PROVIDER_RUNTIME_MODES.SHADOW,
      executionPath: MIA_PROVIDER_EXECUTION_PATHS.SHADOW_ONLY,
      skipped: attemptStatus === "SKIPPED",
      ok: result.ok,
      resultCount,
      error: result.error,
      durationMs: null,
      shadowObserved: true,
    });
  }

  return observations;
}
