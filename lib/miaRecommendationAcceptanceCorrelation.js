/**
 * PATCH 9.2 — Acceptance signal correlation helpers
 */

import {
  MIA_ACCEPTANCE_CORRELATION_CONFIDENCE,
  MIA_ACCEPTANCE_CORRELATION_METHODS,
  MIA_ACCEPTANCE_FIVE_MINUTES_MS,
  MIA_ACCEPTANCE_ONE_MINUTE_MS,
  MIA_ACCEPTANCE_SAME_TURN_MS,
  MIA_ACCEPTANCE_SESSION_PRODUCT_WINDOW_MS,
  MIA_ACCEPTANCE_TIME_BUCKETS,
} from "./miaRecommendationAcceptanceCatalog.js";

/**
 * @param {string|null|undefined} decisionRequestId
 * @param {object} [options]
 */
export function resolveAcceptanceCorrelation(decisionRequestId = null, options = {}) {
  if (decisionRequestId) {
    return {
      correlation_method: MIA_ACCEPTANCE_CORRELATION_METHODS.REQUEST_ID,
      correlation_confidence: MIA_ACCEPTANCE_CORRELATION_CONFIDENCE.HIGH,
      decision_request_id: decisionRequestId,
    };
  }

  if (options.sessionLinked && options.productLinked) {
    return {
      correlation_method: MIA_ACCEPTANCE_CORRELATION_METHODS.SESSION_PRODUCT_WINDOW,
      correlation_confidence: MIA_ACCEPTANCE_CORRELATION_CONFIDENCE.MEDIUM,
      decision_request_id: null,
    };
  }

  if (options.sessionLinked) {
    return {
      correlation_method: MIA_ACCEPTANCE_CORRELATION_METHODS.SESSION_SEQUENCE,
      correlation_confidence: MIA_ACCEPTANCE_CORRELATION_CONFIDENCE.LOW,
      decision_request_id: null,
    };
  }

  return {
    correlation_method: MIA_ACCEPTANCE_CORRELATION_METHODS.UNRESOLVED,
    correlation_confidence: MIA_ACCEPTANCE_CORRELATION_CONFIDENCE.UNRESOLVED,
    decision_request_id: null,
  };
}

/**
 * @param {number|null|undefined} secondsSinceDecision
 * @param {boolean} [sameSession]
 */
export function classifyAcceptanceTimeBucket(secondsSinceDecision = null, sameSession = true) {
  if (secondsSinceDecision == null || !Number.isFinite(secondsSinceDecision)) {
    return sameSession
      ? MIA_ACCEPTANCE_TIME_BUCKETS.SAME_SESSION
      : MIA_ACCEPTANCE_TIME_BUCKETS.UNKNOWN;
  }

  const ms = secondsSinceDecision * 1000;
  if (ms <= MIA_ACCEPTANCE_SAME_TURN_MS) return MIA_ACCEPTANCE_TIME_BUCKETS.SAME_TURN;
  if (ms <= MIA_ACCEPTANCE_ONE_MINUTE_MS) return MIA_ACCEPTANCE_TIME_BUCKETS.UP_TO_1_MIN;
  if (ms <= MIA_ACCEPTANCE_FIVE_MINUTES_MS) return MIA_ACCEPTANCE_TIME_BUCKETS.UP_TO_5_MIN;
  if (ms <= MIA_ACCEPTANCE_SESSION_PRODUCT_WINDOW_MS) return MIA_ACCEPTANCE_TIME_BUCKETS.UP_TO_30_MIN;
  if (sameSession) return MIA_ACCEPTANCE_TIME_BUCKETS.SAME_SESSION;
  return MIA_ACCEPTANCE_TIME_BUCKETS.LATER;
}

/**
 * @param {number|null|undefined} decisionAtMs
 * @param {number|null|undefined} signalAtMs
 */
export function computeSecondsSinceDecision(decisionAtMs = null, signalAtMs = null) {
  if (!Number.isFinite(decisionAtMs) || !Number.isFinite(signalAtMs)) return null;
  const delta = Math.max(0, signalAtMs - decisionAtMs);
  return Math.round(delta / 1000);
}

export { MIA_ACCEPTANCE_SESSION_PRODUCT_WINDOW_MS };
