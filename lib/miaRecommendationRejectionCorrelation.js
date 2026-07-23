/**
 * PATCH 9.3 — Rejection signal correlation helpers
 */

import {
  MIA_REJECTION_CORRELATION_CONFIDENCE,
  MIA_REJECTION_CORRELATION_METHODS,
  MIA_REJECTION_FIVE_MINUTES_MS,
  MIA_REJECTION_ONE_MINUTE_MS,
  MIA_REJECTION_SAME_TURN_MS,
  MIA_REJECTION_SESSION_WINDOW_MS,
  MIA_REJECTION_TIME_BUCKETS,
} from "./miaRecommendationRejectionCatalog.js";

/**
 * @param {string|null|undefined} decisionRequestId
 * @param {object} [options]
 */
export function resolveRejectionCorrelation(decisionRequestId = null, options = {}) {
  if (decisionRequestId) {
    return {
      correlation_method: options.decisionTransition
        ? MIA_REJECTION_CORRELATION_METHODS.DECISION_TRANSITION
        : MIA_REJECTION_CORRELATION_METHODS.REQUEST_ID,
      correlation_confidence: MIA_REJECTION_CORRELATION_CONFIDENCE.HIGH,
      decision_request_id: decisionRequestId,
    };
  }

  if (options.sessionLifecycle) {
    return {
      correlation_method: MIA_REJECTION_CORRELATION_METHODS.SESSION_LIFECYCLE,
      correlation_confidence: MIA_REJECTION_CORRELATION_CONFIDENCE.MEDIUM,
      decision_request_id: null,
    };
  }

  if (options.sessionLinked && options.productLinked) {
    return {
      correlation_method: MIA_REJECTION_CORRELATION_METHODS.SESSION_PRODUCT_WINDOW,
      correlation_confidence: MIA_REJECTION_CORRELATION_CONFIDENCE.MEDIUM,
      decision_request_id: null,
    };
  }

  if (options.sessionLinked) {
    return {
      correlation_method: MIA_REJECTION_CORRELATION_METHODS.SESSION_SEQUENCE,
      correlation_confidence: MIA_REJECTION_CORRELATION_CONFIDENCE.LOW,
      decision_request_id: null,
    };
  }

  return {
    correlation_method: MIA_REJECTION_CORRELATION_METHODS.UNRESOLVED,
    correlation_confidence: MIA_REJECTION_CORRELATION_CONFIDENCE.UNRESOLVED,
    decision_request_id: null,
  };
}

/**
 * @param {number|null|undefined} secondsSinceDecision
 * @param {boolean} [sameSession]
 */
export function classifyRejectionTimeBucket(secondsSinceDecision = null, sameSession = true) {
  if (secondsSinceDecision == null || !Number.isFinite(secondsSinceDecision)) {
    return sameSession
      ? MIA_REJECTION_TIME_BUCKETS.SAME_SESSION
      : MIA_REJECTION_TIME_BUCKETS.UNKNOWN;
  }

  const ms = secondsSinceDecision * 1000;
  if (ms <= MIA_REJECTION_SAME_TURN_MS) return MIA_REJECTION_TIME_BUCKETS.SAME_TURN;
  if (ms <= MIA_REJECTION_ONE_MINUTE_MS) return MIA_REJECTION_TIME_BUCKETS.UP_TO_1_MIN;
  if (ms <= MIA_REJECTION_FIVE_MINUTES_MS) return MIA_REJECTION_TIME_BUCKETS.UP_TO_5_MIN;
  if (ms <= MIA_REJECTION_SESSION_WINDOW_MS) return MIA_REJECTION_TIME_BUCKETS.UP_TO_30_MIN;
  if (sameSession) return MIA_REJECTION_TIME_BUCKETS.SAME_SESSION;
  return MIA_REJECTION_TIME_BUCKETS.LATER;
}

/**
 * @param {number|null|undefined} decisionAtMs
 * @param {number|null|undefined} signalAtMs
 */
export function computeRejectionSecondsSinceDecision(decisionAtMs = null, signalAtMs = null) {
  if (!Number.isFinite(decisionAtMs) || !Number.isFinite(signalAtMs)) return null;
  return Math.round(Math.max(0, signalAtMs - decisionAtMs) / 1000);
}
