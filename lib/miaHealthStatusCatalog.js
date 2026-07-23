/**
 * PATCH 7.4 — Health status taxonomy (documental, non-enforcing).
 */

export const MIA_HEALTH_STATUSES = Object.freeze({
  HEALTHY: "HEALTHY",
  DEGRADED: "DEGRADED",
  UNSTABLE: "UNSTABLE",
  CRITICAL: "CRITICAL",
  INSUFFICIENT_DATA: "INSUFFICIENT_DATA",
});

export const MIA_HEALTH_PILLARS = Object.freeze({
  AVAILABILITY: "availability",
  RELIABILITY: "reliability",
  STABILITY: "stability",
  PERFORMANCE: "performance",
});

/** Baseline thresholds — operational documentation only, not runtime enforcement. */
export const MIA_HEALTH_THRESHOLD_BASELINE = Object.freeze({
  availability_rate_critical: 0.9,
  error_rate_unstable: 0.2,
  error_rate_critical: 0.35,
  slow_request_rate_degraded: 0.2,
  slow_request_rate_unstable: 0.4,
  unrecovered_error_rate_critical: 0.25,
  unknown_error_rate_unstable: 0.15,
  fallback_rate_unstable: 0.3,
  partial_success_rate_degraded: 0.4,
  latency_p99_ms_critical: 15000,
  min_sample_size: 1,
  min_sample_size_percentile: 5,
});

export const MIA_HEALTH_ANALYTICS_VERSION = "7.4.0";
