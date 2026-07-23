/**
 * PATCH 9.1 — Recommendation Decision Analytics
 *
 * Observational only — fire-and-forget; never alters cognitive decisions.
 */

import { assembleAnalyticsInsertRow, isAnalyticsUuid } from "./miaAnalyticsPayload.js";
import { getSharedRequestState } from "./miaSharedRequestState.js";
import { shouldEnterCommercialSearchAnalyticsDomain } from "./miaCommercialSearchClassifier.js";
import { MIA_RECOMMENDATION_DECISION_CATALOG_VERSION } from "./miaRecommendationDecisionCatalog.js";
import {
  activateRecommendationDecisionTracker,
  buildRecommendationDecisionDedupKey,
  createRecommendationDecisionTracker,
  finalizeRecommendationDecisionTracker,
  isRecommendationDecisionTrackerEmitEligible,
  markRecommendationDecisionTrackerEmitted,
} from "./miaRecommendationDecisionTracker.js";

export const MIA_RECOMMENDATION_DECISION_ANALYTICS_VERSION =
  MIA_RECOMMENDATION_DECISION_CATALOG_VERSION;
export const MIA_RECOMMENDATION_DECISION_ANALYTICS_EVENT = "mia_recommendation_decision";
export const MIA_RECOMMENDATION_DECISION_ANALYTICS_CATEGORY = "recommendation_decision";
export const MIA_RECOMMENDATION_DECISION_TEST_ANALYTICS_CATEGORY =
  "recommendation_decision_test";

const FORBIDDEN_METADATA_KEYS = new Set([
  "user_email",
  "email",
  "query",
  "query_text",
  "product_name",
  "title",
  "link",
  "url",
  "offer_url",
  "thumbnail",
  "prices",
  "offers",
  "ranking_snapshot",
  "display_products",
  "payload",
  "secret",
  "token",
  "authorization",
  "stack",
  "stack_trace",
]);

function sanitizeMetadataValue(value, depth = 0) {
  if (depth > 4) return null;
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const trimmed = value.slice(0, 120);
    if (/bearer\s+/i.test(trimmed)) return "[redacted]";
    if (/api[_-]?key/i.test(trimmed)) return "[redacted]";
    if (/https?:\/\//i.test(trimmed)) return "[redacted]";
    return trimmed;
  }
  if (Array.isArray(value)) return null;
  if (typeof value === "object") {
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      const normalizedKey = String(key).toLowerCase();
      if (FORBIDDEN_METADATA_KEYS.has(normalizedKey)) continue;
      out[key] = sanitizeMetadataValue(nested, depth + 1);
    }
    return out;
  }
  return null;
}

function getRecommendationDecisionAnalyticsBucket() {
  const sharedState = getSharedRequestState();
  if (!sharedState) return null;
  if (!sharedState.recommendationDecisionAnalytics) {
    sharedState.recommendationDecisionAnalytics = createRecommendationDecisionTracker({
      requestId: sharedState.requestId || null,
      analyticsContext: sharedState.responseAnalytics?.analyticsContext || {},
      endpoint: sharedState.analyticsContext?.endpoint || "/api/chat-gpt4o",
    });
  }
  return sharedState.recommendationDecisionAnalytics;
}

function sharedStateDedupStore() {
  const sharedState = getSharedRequestState();
  if (!sharedState) return {};
  if (!sharedState.recommendationDecisionAnalyticsDedup) {
    sharedState.recommendationDecisionAnalyticsDedup = {};
  }
  return sharedState.recommendationDecisionAnalyticsDedup;
}

function shouldEmitRecommendationDecisionEvent(requestId) {
  const dedupKey = buildRecommendationDecisionDedupKey(
    requestId || "unknown",
    MIA_RECOMMENDATION_DECISION_ANALYTICS_EVENT,
    MIA_RECOMMENDATION_DECISION_ANALYTICS_VERSION
  );
  const store = sharedStateDedupStore();
  if (store[dedupKey]) return false;
  store[dedupKey] = true;
  return true;
}

/**
 * @param {{ commercialPermission?: string, interactionMode?: string, requestId?: string|null, analyticsContext?: object }} [input]
 */
export function initializeRecommendationDecisionAnalyticsTracking(input = {}) {
  const bucket = getRecommendationDecisionAnalyticsBucket();
  if (!bucket) return null;

  const allowed = shouldEnterCommercialSearchAnalyticsDomain({
    commercialPermission: input.commercialPermission,
    interactionMode: input.interactionMode,
  });
  if (!allowed) return bucket;

  bucket.requestId = input.requestId ?? bucket.requestId;
  bucket.analyticsContext = input.analyticsContext || bucket.analyticsContext || {};
  activateRecommendationDecisionTracker(bucket);
  return bucket;
}

/**
 * @param {{
 *   requestId?: string|null,
 *   analyticsContext?: object,
 *   metadata?: Record<string, unknown>|null,
 *   controlledTest?: boolean,
 * }} input
 */
export function buildRecommendationDecisionAnalyticsPayload(input = {}) {
  const analyticsContext = input.analyticsContext || {};
  const metadata = sanitizeMetadataValue({
    event_version: MIA_RECOMMENDATION_DECISION_ANALYTICS_VERSION,
    request_id: input.requestId ?? null,
    ...(input.metadata || {}),
  });

  const category = input.controlledTest
    ? MIA_RECOMMENDATION_DECISION_TEST_ANALYTICS_CATEGORY
    : MIA_RECOMMENDATION_DECISION_ANALYTICS_CATEGORY;

  return {
    payload: assembleAnalyticsInsertRow({
      event_name: MIA_RECOMMENDATION_DECISION_ANALYTICS_EVENT,
      visitor_id: isAnalyticsUuid(analyticsContext.visitor_id)
        ? analyticsContext.visitor_id
        : null,
      session_id: isAnalyticsUuid(analyticsContext.session_id)
        ? analyticsContext.session_id
        : null,
      conversation_id: isAnalyticsUuid(analyticsContext.conversation_id)
        ? analyticsContext.conversation_id
        : null,
      user_id: isAnalyticsUuid(analyticsContext.user_id) ? analyticsContext.user_id : null,
      category,
      query_text: null,
      metadata,
    }),
    summary: sanitizeMetadataValue({
      event_version: MIA_RECOMMENDATION_DECISION_ANALYTICS_VERSION,
      decision_source: metadata?.decision_source ?? null,
      winner_present: metadata?.winner_present ?? false,
      runner_up_present: metadata?.runner_up_present ?? false,
      decision_valid: metadata?.decision_valid ?? false,
      winner_rank: metadata?.winner_rank ?? null,
      score_gap: metadata?.score_gap ?? null,
      request_id: input.requestId ?? null,
    }),
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {Parameters<typeof buildRecommendationDecisionAnalyticsPayload>[0]} input
 */
export async function emitRecommendationDecisionAnalytics(supabase, input = {}) {
  if (!supabase) {
    return { ok: false, code: "missing_supabase_client" };
  }

  try {
    const built = buildRecommendationDecisionAnalyticsPayload(input);
    const { error } = await supabase.from("analytics_events").insert(built.payload);

    if (error) {
      console.warn("[MIA Recommendation Decision Analytics] insert failed:", {
        event: built.payload.event_name,
        code: String(error.code || "insert_error").slice(0, 80),
      });
      return {
        ok: false,
        code: "analytics_insert_failed",
        error: String(error.message || "insert_failed").slice(0, 160),
        summary: built.summary,
      };
    }

    return {
      ok: true,
      event_name: built.payload.event_name,
      summary: built.summary,
    };
  } catch (err) {
    console.warn("[MIA Recommendation Decision Analytics] unexpected error:", {
      message: String(err?.message || "unknown_error").slice(0, 120),
    });
    return {
      ok: false,
      code: "analytics_internal_error",
      error: String(err?.message || "unknown_error").slice(0, 160),
    };
  }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {Parameters<typeof buildRecommendationDecisionAnalyticsPayload>[0]} input
 */
export function scheduleRecommendationDecisionAnalytics(supabase, input = {}) {
  void emitRecommendationDecisionAnalytics(supabase, input).catch(() => {});
}

/**
 * @param {Record<string, unknown>|null|undefined} summary
 */
export function buildRecommendationDecisionRecommendationMetadata(summary = null) {
  if (!summary || typeof summary !== "object") return {};
  return sanitizeMetadataValue({
    recommendation_decision_request_id: summary.request_id ?? null,
    recommendation_decision_event_version:
      summary.event_version ?? MIA_RECOMMENDATION_DECISION_ANALYTICS_VERSION,
    recommendation_decision_source: summary.decision_source ?? null,
    recommendation_decision_winner_present: summary.winner_present ?? false,
    recommendation_decision_runner_up_present: summary.runner_up_present ?? false,
    recommendation_decision_valid: summary.decision_valid ?? false,
    recommendation_decision_winner_rank: summary.winner_rank ?? null,
    recommendation_decision_score_gap: summary.score_gap ?? null,
    recommendation_decision_winner_product_family: summary.winner_product_family ?? null,
    recommendation_decision_runner_up_rank: summary.runner_up_rank ?? null,
    recommendation_decision_runner_up_product_family: summary.runner_up_product_family ?? null,
    recommendation_decision_runner_up_in_display: summary.runner_up_in_display_products ?? null,
    recommendation_decision_score_gap_bucket: summary.score_gap_bucket ?? null,
    recommendation_decision_runner_up_competitiveness:
      summary.runner_up_competitiveness ?? null,
  });
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {object} input
 */
export function observeRecommendationDecisionAnalytics(supabase, input = {}) {
  const bucket = getRecommendationDecisionAnalyticsBucket();
  if (!bucket?.active) return null;

  const metadata = finalizeRecommendationDecisionTracker(bucket, {
    ...input,
    eventVersion: MIA_RECOMMENDATION_DECISION_ANALYTICS_VERSION,
  });
  if (!metadata) return null;
  if (!isRecommendationDecisionTrackerEmitEligible(bucket)) return bucket.summary;

  const requestId = input.requestId || bucket.requestId || null;
  if (!shouldEmitRecommendationDecisionEvent(requestId)) return bucket.summary;

  markRecommendationDecisionTrackerEmitted(bucket);

  const built = buildRecommendationDecisionAnalyticsPayload({
    requestId,
    analyticsContext: input.analyticsContext || bucket.analyticsContext,
    metadata,
    controlledTest: input.controlledTest,
  });

  bucket.summary = built.summary;
  bucket.summary = {
    ...built.summary,
    request_id: requestId,
    winner_product_family: metadata.winner_product_family ?? null,
    runner_up_product_family: metadata.runner_up_product_family ?? null,
    runner_up_rank: metadata.runner_up_rank ?? null,
    runner_up_in_display_products: metadata.runner_up_in_display_products ?? null,
    runner_up_in_delivery: metadata.runner_up_in_delivery ?? null,
    score_gap: metadata.score_gap ?? null,
    score_gap_bucket: metadata.score_gap_bucket ?? null,
    runner_up_competitiveness: metadata.runner_up_competitiveness ?? null,
    candidate_count: metadata.candidate_count ?? null,
    display_count: metadata.display_count ?? null,
    budget_constraint: metadata.budget_constraint ?? null,
    category_constraint: metadata.category_constraint ?? null,
    brand_constraint: metadata.brand_constraint ?? null,
    anchor_preserved: metadata.anchor_preserved ?? null,
    new_search: metadata.new_search ?? null,
    reset_applied: metadata.reset_applied ?? null,
  };
  bucket.decisionMetadata = metadata;

  scheduleRecommendationDecisionAnalytics(supabase, {
    requestId,
    analyticsContext: input.analyticsContext || bucket.analyticsContext,
    metadata: built.payload.metadata,
    controlledTest: input.controlledTest,
  });

  return built.summary;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 */
export function instrumentRecommendationDecisionAnalyticsForDelivery(supabase) {
  void supabase;
  const bucket = getRecommendationDecisionAnalyticsBucket();
  return bucket?.summary || null;
}

/**
 * @returns {Record<string, unknown>|null}
 */
export function getRecommendationDecisionMetadataSnapshot() {
  const bucket = getRecommendationDecisionAnalyticsBucket();
  return bucket?.decisionMetadata || bucket?.summary || null;
}

export {
  buildRecommendationDecisionDedupKey,
  createRecommendationDecisionTracker,
  finalizeRecommendationDecisionTracker,
} from "./miaRecommendationDecisionTracker.js";

export {
  MIA_DECISION_SOURCES,
  MIA_DECISION_ROUTING_MODES,
  MIA_DECISION_RUNTIME_MODES,
} from "./miaRecommendationDecisionCatalog.js";

export { buildRecommendationDecisionMetadata } from "./miaRecommendationDecisionClassifier.js";
