/**
 * PATCH 7.4 — Health snapshot builder (SQL-derived metrics → consolidated view).
 *
 * No runtime INSERT — used by tests and optional API consumers.
 */

import {
  MIA_HEALTH_ANALYTICS_VERSION,
  MIA_HEALTH_PILLARS,
  MIA_HEALTH_THRESHOLD_BASELINE,
} from "./miaHealthStatusCatalog.js";
import { classifyHealthStatus } from "./miaHealthStatusClassifier.js";

function asRate(value, total) {
  const v = Number(value);
  const t = Number(total);
  if (!Number.isFinite(v) || !Number.isFinite(t) || t <= 0) return null;
  return Math.round((v / t) * 10000) / 10000;
}

function asMs(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

/**
 * @param {{
 *   requestVolume?: number,
 *   successCount?: number,
 *   partialSuccessCount?: number,
 *   errorOutcomeCount?: number,
 *   fallbackCount?: number,
 *   errorEventCount?: number,
 *   requestsWithError?: number,
 *   recoveredErrorCount?: number,
 *   unrecoveredErrorCount?: number,
 *   unknownErrorCount?: number,
 *   latencySampleSize?: number,
 *   latencyP95Ms?: number|null,
 *   latencyP99Ms?: number|null,
 *   slowRequestCount?: number,
 *   analyticsGapCount?: number,
 *   generatedAt?: string,
 * }} input
 */
export function buildHealthSnapshot(input = {}) {
  const requestVolume = Number(input.requestVolume) || 0;
  const sampleSize = requestVolume;

  const successRate = asRate(input.successCount, requestVolume);
  const partialSuccessRate = asRate(input.partialSuccessCount, requestVolume);
  const errorRate = asRate(input.errorOutcomeCount, requestVolume);
  const fallbackRate = asRate(input.fallbackCount, requestVolume);

  const errorEventRate = asRate(input.requestsWithError, requestVolume);
  const recoveredErrorRate = asRate(input.recoveredErrorCount, input.errorEventCount);
  const unrecoveredErrorRate = asRate(input.unrecoveredErrorCount, input.errorEventCount);
  const unknownErrorRate = asRate(input.unknownErrorCount, input.errorEventCount);

  const latencySample = Number(input.latencySampleSize) || 0;
  const slowRequestRate = asRate(input.slowRequestCount, latencySample);
  const analyticsGapRate = asRate(input.analyticsGapCount, requestVolume);

  const availabilityRate =
    requestVolume > 0
      ? asRate(requestVolume - (Number(input.errorOutcomeCount) || 0), requestVolume)
      : null;

  const reliabilityRate =
    successRate != null && partialSuccessRate != null
      ? Math.min(1, Math.round((successRate + partialSuccessRate) * 10000) / 10000)
      : successRate;

  const stabilityRate =
    errorRate != null && fallbackRate != null
      ? Math.max(0, Math.round((1 - errorRate - fallbackRate) * 10000) / 10000)
      : null;

  const performanceRate =
    slowRequestRate != null
      ? Math.max(0, Math.round((1 - slowRequestRate) * 10000) / 10000)
      : null;

  const indicators = {
    availability_rate: availabilityRate,
    success_rate: successRate,
    partial_success_rate: partialSuccessRate,
    error_rate: errorRate ?? errorEventRate,
    recovered_error_rate: recoveredErrorRate,
    unrecovered_error_rate: unrecoveredErrorRate,
    latency_p95: asMs(input.latencyP95Ms),
    latency_p99: asMs(input.latencyP99Ms),
    slow_request_rate: slowRequestRate,
    unknown_error_rate: unknownErrorRate,
    request_volume: requestVolume,
    analytics_gap_rate: analyticsGapRate,
  };

  const healthStatus = classifyHealthStatus({
    sampleSize,
    ...indicators,
  });

  return {
    health_status: healthStatus,
    availability: {
      pillar: MIA_HEALTH_PILLARS.AVAILABILITY,
      rate: availabilityRate,
      request_volume: requestVolume,
    },
    reliability: {
      pillar: MIA_HEALTH_PILLARS.RELIABILITY,
      success_rate: successRate,
      partial_success_rate: partialSuccessRate,
      rate: reliabilityRate,
    },
    stability: {
      pillar: MIA_HEALTH_PILLARS.STABILITY,
      rate: stabilityRate,
      error_rate: indicators.error_rate,
      fallback_rate: fallbackRate,
      unknown_error_rate: unknownErrorRate,
    },
    performance: {
      pillar: MIA_HEALTH_PILLARS.PERFORMANCE,
      rate: performanceRate,
      latency_p95: indicators.latency_p95,
      latency_p99: indicators.latency_p99,
      slow_request_rate: slowRequestRate,
      latency_sample_size: latencySample,
    },
    indicators,
    generated_at: input.generatedAt || new Date().toISOString(),
    sample_size: sampleSize,
    event_version: MIA_HEALTH_ANALYTICS_VERSION,
    thresholds_reference: MIA_HEALTH_THRESHOLD_BASELINE,
    derivation: "sql_consolidated",
    persistence: "none_runtime_event",
  };
}

/**
 * @param {ReturnType<typeof buildHealthSnapshot>|null|undefined} snapshot
 */
export function buildHealthRecommendationMetadata(snapshot = null) {
  if (!snapshot || typeof snapshot !== "object") return {};
  return {
    health_event_version: snapshot.event_version ?? null,
    health_status: snapshot.health_status ?? null,
    availability_rate: snapshot.indicators?.availability_rate ?? null,
    success_rate: snapshot.indicators?.success_rate ?? null,
    error_rate: snapshot.indicators?.error_rate ?? null,
    slow_request_rate: snapshot.indicators?.slow_request_rate ?? null,
    sample_size: snapshot.sample_size ?? null,
  };
}
