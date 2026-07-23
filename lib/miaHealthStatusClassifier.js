/**
 * PATCH 7.4 — Health status classifier (documental baseline, non-enforcing).
 */

import {
  MIA_HEALTH_STATUSES,
  MIA_HEALTH_THRESHOLD_BASELINE as T,
} from "./miaHealthStatusCatalog.js";

/**
 * @param {{
 *   sampleSize?: number,
 *   availability_rate?: number|null,
 *   success_rate?: number|null,
 *   partial_success_rate?: number|null,
 *   error_rate?: number|null,
 *   recovered_error_rate?: number|null,
 *   unrecovered_error_rate?: number|null,
 *   slow_request_rate?: number|null,
 *   unknown_error_rate?: number|null,
 *   latency_p99?: number|null,
 * }} metrics
 */
export function classifyHealthStatus(metrics = {}) {
  const sampleSize = Number(metrics.sampleSize) || 0;
  if (sampleSize < T.min_sample_size) {
    return MIA_HEALTH_STATUSES.INSUFFICIENT_DATA;
  }

  const availability = metrics.availability_rate;
  const errorRate = metrics.error_rate;
  const unrecovered = metrics.unrecovered_error_rate;
  const slowRate = metrics.slow_request_rate;
  const unknownRate = metrics.unknown_error_rate;
  const partialRate = metrics.partial_success_rate;
  const p99 = metrics.latency_p99;

  if (
    (availability != null && availability < T.availability_rate_critical) ||
    (unrecovered != null && unrecovered > T.unrecovered_error_rate_critical) ||
    (errorRate != null && errorRate > T.error_rate_critical) ||
    (p99 != null && sampleSize >= T.min_sample_size_percentile && p99 >= T.latency_p99_ms_critical)
  ) {
    return MIA_HEALTH_STATUSES.CRITICAL;
  }

  if (
    (errorRate != null && errorRate > T.error_rate_unstable) ||
    (slowRate != null && slowRate > T.slow_request_rate_unstable) ||
    (unknownRate != null && unknownRate > T.unknown_error_rate_unstable)
  ) {
    return MIA_HEALTH_STATUSES.UNSTABLE;
  }

  if (
    (partialRate != null && partialRate > T.partial_success_rate_degraded) ||
    (slowRate != null && slowRate > T.slow_request_rate_degraded) ||
    (metrics.recovered_error_rate != null &&
      metrics.recovered_error_rate > 0.3 &&
      (metrics.error_rate ?? 0) > 0.05)
  ) {
    return MIA_HEALTH_STATUSES.DEGRADED;
  }

  return MIA_HEALTH_STATUSES.HEALTHY;
}
