/**
 * PATCH 9.1 — Recommendation decision request-scoped tracker.
 */

import { buildRecommendationDecisionMetadata } from "./miaRecommendationDecisionClassifier.js";

/**
 * @param {string} requestId
 * @param {string} eventName
 * @param {string} eventVersion
 */
export function buildRecommendationDecisionDedupKey(requestId, eventName, eventVersion) {
  return `${requestId}|${eventName}|${eventVersion}`;
}

/**
 * @param {object} [seed]
 */
export function createRecommendationDecisionTracker(seed = {}) {
  return {
    active: false,
    finalized: false,
    emitted: false,
    requestId: seed.requestId ?? null,
    analyticsContext: seed.analyticsContext || {},
    endpoint: seed.endpoint || "/api/chat-gpt4o",
    controlledTest: !!seed.controlledTest,
    summary: null,
  };
}

/**
 * @param {ReturnType<typeof createRecommendationDecisionTracker>|null|undefined} tracker
 */
export function activateRecommendationDecisionTracker(tracker) {
  if (!tracker) return tracker;
  tracker.active = true;
  return tracker;
}

/**
 * @param {ReturnType<typeof createRecommendationDecisionTracker>|null|undefined} tracker
 * @param {object} input
 */
export function finalizeRecommendationDecisionTracker(tracker, input = {}) {
  if (!tracker?.active || tracker.finalized) return null;

  const metadata = buildRecommendationDecisionMetadata(input);
  tracker.finalized = true;
  tracker.summary = {
    event_version: input.eventVersion ?? null,
    decision_source: metadata.decision_source,
    winner_present: metadata.winner_present,
    runner_up_present: metadata.runner_up_present,
    decision_valid: metadata.decision_valid,
    request_id: tracker.requestId,
  };
  return metadata;
}

/**
 * @param {ReturnType<typeof createRecommendationDecisionTracker>|null|undefined} tracker
 */
export function isRecommendationDecisionTrackerEmitEligible(tracker) {
  return !!tracker?.active && tracker.finalized && !tracker.emitted;
}

/**
 * @param {ReturnType<typeof createRecommendationDecisionTracker>|null|undefined} tracker
 */
export function markRecommendationDecisionTrackerEmitted(tracker) {
  if (!tracker) return;
  tracker.emitted = true;
}
