/**
 * PATCH 8.3 — Offer Set Analytics
 *
 * Observational only — fire-and-forget; never alters offer pipeline decisions.
 */

import { assembleAnalyticsInsertRow, isAnalyticsUuid } from "./miaAnalyticsPayload.js";
import { getSharedRequestState } from "./miaSharedRequestState.js";
import { shouldEnterCommercialSearchAnalyticsDomain } from "./miaCommercialSearchClassifier.js";
import { MIA_OFFER_SET_CATALOG_VERSION } from "./miaOfferSetCatalog.js";
import { instrumentPriceIntelligenceAnalyticsFromOfferSet } from "./miaPriceIntelligenceAnalytics.js";
import {
  activateOfferSetTracker,
  buildOfferSetDedupKey,
  createOfferSetTracker,
  finalizeOfferSetTracker,
  isOfferSetTrackerEmitEligible,
  markOfferSetTrackerEmitted,
  updateOfferSetTrackerFromPipeline,
  updateOfferSetTrackerFromSelection,
} from "./miaOfferSetTracker.js";

export const MIA_OFFER_SET_ANALYTICS_VERSION = MIA_OFFER_SET_CATALOG_VERSION;
export const MIA_OFFER_SET_ANALYTICS_EVENT = "mia_offer_set";
export const MIA_OFFER_SET_ANALYTICS_CATEGORY = "offer_set";
export const MIA_OFFER_SET_TEST_ANALYTICS_CATEGORY = "offer_set_test";

const FORBIDDEN_METADATA_KEYS = new Set([
  "user_email",
  "email",
  "resend_api_key",
  "api_key",
  "admin_key",
  "password",
  "token",
  "secret",
  "authorization",
  "cookie",
  "stack",
  "stack_trace",
  "query",
  "query_text",
  "product_name",
  "offer_url",
  "offer_price",
  "html",
  "payload",
  "headers",
  "url",
  "link",
  "title",
  "prices",
  "offers",
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
    if (/secret/i.test(trimmed)) return "[redacted]";
    if (/https?:\/\//i.test(trimmed)) return "[redacted]";
    return trimmed;
  }
  if (Array.isArray(value)) return null;
  if (typeof value === "object") {
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      const normalizedKey = String(key).toLowerCase();
      if (FORBIDDEN_METADATA_KEYS.has(normalizedKey)) continue;
      if (normalizedKey.includes("secret") || normalizedKey.includes("password")) continue;
      if (normalizedKey.includes("token") && normalizedKey !== "event_version") continue;
      if (normalizedKey.includes("stack")) continue;
      out[key] = sanitizeMetadataValue(nested, depth + 1);
    }
    return out;
  }
  return null;
}

function getOfferSetAnalyticsBucket() {
  const sharedState = getSharedRequestState();
  if (!sharedState) return null;
  if (!sharedState.offerSetAnalytics) {
    sharedState.offerSetAnalytics = createOfferSetTracker({
      requestId: sharedState.requestId || null,
      analyticsContext: sharedState.responseAnalytics?.analyticsContext || {},
      endpoint: sharedState.analyticsContext?.endpoint || "/api/chat-gpt4o",
    });
  }
  return sharedState.offerSetAnalytics;
}

function sharedStateDedupStore() {
  const sharedState = getSharedRequestState();
  if (!sharedState) return {};
  if (!sharedState.offerSetAnalyticsDedup) {
    sharedState.offerSetAnalyticsDedup = {};
  }
  return sharedState.offerSetAnalyticsDedup;
}

function shouldEmitOfferSetEvent(requestId) {
  const dedupKey = buildOfferSetDedupKey(
    requestId || "unknown",
    MIA_OFFER_SET_ANALYTICS_EVENT,
    MIA_OFFER_SET_ANALYTICS_VERSION
  );
  const store = sharedStateDedupStore();
  if (store[dedupKey]) return false;
  store[dedupKey] = true;
  return true;
}

/**
 * @param {{ commercialPermission?: string, interactionMode?: string, requestId?: string|null, analyticsContext?: object }} [input]
 */
export function initializeOfferSetAnalyticsTracking(input = {}) {
  const bucket = getOfferSetAnalyticsBucket();
  if (!bucket) return null;

  const allowed = shouldEnterCommercialSearchAnalyticsDomain({
    commercialPermission: input.commercialPermission,
    interactionMode: input.interactionMode,
  });
  if (!allowed) return bucket;

  bucket.requestId = input.requestId ?? bucket.requestId;
  bucket.analyticsContext = input.analyticsContext || bucket.analyticsContext || {};
  activateOfferSetTracker(bucket);
  return bucket;
}

/**
 * @param {object} input
 */
export function updateOfferSetAnalyticsFromPipeline(input = {}) {
  const bucket = getOfferSetAnalyticsBucket();
  if (!bucket?.active) return bucket;
  return updateOfferSetTrackerFromPipeline(bucket, {
    pipelineReached: true,
    ...input,
  });
}

/**
 * @param {object} input
 */
export function updateOfferSetAnalyticsFromSelection(input = {}) {
  const bucket = getOfferSetAnalyticsBucket();
  if (!bucket?.active) return bucket;
  return updateOfferSetTrackerFromSelection(bucket, input);
}

/**
 * @param {{
 *   requestId?: string|null,
 *   analyticsContext?: object,
 *   metadata?: Record<string, unknown>|null,
 *   controlledTest?: boolean,
 * }} input
 */
export function buildOfferSetAnalyticsPayload(input = {}) {
  const analyticsContext = input.analyticsContext || {};
  const metadata = sanitizeMetadataValue({
    event_version: MIA_OFFER_SET_ANALYTICS_VERSION,
    request_id: input.requestId ?? null,
    ...(input.metadata || {}),
  });

  const category = input.controlledTest
    ? MIA_OFFER_SET_TEST_ANALYTICS_CATEGORY
    : MIA_OFFER_SET_ANALYTICS_CATEGORY;

  return {
    payload: assembleAnalyticsInsertRow({
      event_name: MIA_OFFER_SET_ANALYTICS_EVENT,
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
      event_version: MIA_OFFER_SET_ANALYTICS_VERSION,
      offer_pipeline_status: metadata?.offer_pipeline_status ?? null,
      search_path: metadata?.search_path ?? null,
      delivered_offers_count: metadata?.delivered_offers_count ?? null,
      winner_present: metadata?.winner_present ?? false,
      winner_provider_id: metadata?.winner_provider_id ?? null,
      request_id: input.requestId ?? null,
    }),
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {Parameters<typeof buildOfferSetAnalyticsPayload>[0]} input
 */
export async function emitOfferSetAnalytics(supabase, input = {}) {
  if (!supabase) {
    return { ok: false, code: "missing_supabase_client" };
  }

  try {
    const built = buildOfferSetAnalyticsPayload(input);
    const { error } = await supabase.from("analytics_events").insert(built.payload);

    if (error) {
      console.warn("[MIA Offer Set Analytics] insert failed:", {
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
    console.warn("[MIA Offer Set Analytics] unexpected error:", {
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
 * @param {Parameters<typeof buildOfferSetAnalyticsPayload>[0]} input
 */
export function scheduleOfferSetAnalytics(supabase, input = {}) {
  void emitOfferSetAnalytics(supabase, input).catch(() => {});
}

/**
 * @param {Record<string, unknown>|null|undefined} summary
 */
export function buildOfferSetRecommendationMetadata(summary = null) {
  if (!summary || typeof summary !== "object") return {};
  return sanitizeMetadataValue({
    offer_set_event_version: summary.event_version ?? MIA_OFFER_SET_ANALYTICS_VERSION,
    offer_set_pipeline_status: summary.offer_pipeline_status ?? null,
    offer_set_search_path: summary.search_path ?? null,
    offer_set_delivered_count: summary.delivered_offers_count ?? null,
    offer_set_winner_present: summary.winner_present ?? false,
    offer_set_winner_provider_id: summary.winner_provider_id ?? null,
  });
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {{
 *   requestId?: string|null,
 *   analyticsContext?: object,
 *   body?: Record<string, unknown>|null,
 *   responsePath?: string|null,
 *   controlledTest?: boolean,
 *   commercialSearchSummary?: Record<string, unknown>|null,
 * }} input
 */
export function instrumentOfferSetAnalyticsForDelivery(supabase, input = {}) {
  const bucket = getOfferSetAnalyticsBucket();
  if (!bucket?.active || !bucket.pipelineReached) return null;

  const commercialSearchMetadata = input.commercialSearchSummary || {
    search_path: bucket.commercialSearchPath,
    runtime_mode: bucket.runtimeMode,
    search_result_status: bucket.fallbackUsed ? "FALLBACK_RESULT" : null,
  };

  const metadata = finalizeOfferSetTracker(bucket, {
    body: input.body,
    responsePath: input.responsePath,
    commercialSearchMetadata,
  });
  if (!metadata) return null;

  if (!isOfferSetTrackerEmitEligible(bucket)) return null;

  const requestId = input.requestId || bucket.requestId || null;
  if (!shouldEmitOfferSetEvent(requestId)) return null;

  markOfferSetTrackerEmitted(bucket);

  const built = buildOfferSetAnalyticsPayload({
    requestId,
    analyticsContext: input.analyticsContext || bucket.analyticsContext,
    metadata,
    controlledTest: input.controlledTest,
  });

  scheduleOfferSetAnalytics(supabase, {
    requestId,
    analyticsContext: input.analyticsContext || bucket.analyticsContext,
    metadata: built.payload.metadata,
    controlledTest: input.controlledTest,
  });

  const sharedState = getSharedRequestState();
  instrumentPriceIntelligenceAnalyticsFromOfferSet(supabase, {
    requestId,
    analyticsContext: input.analyticsContext || bucket.analyticsContext,
    offerSetMetadata: metadata,
    controlledTest: input.controlledTest,
    commercialPermission: sharedState?.commercialPermission || null,
    interactionMode: sharedState?.interactionMode || null,
  });

  return built.summary;
}

export {
  buildOfferSetDedupKey,
  createOfferSetTracker,
  updateOfferSetTrackerFromPipeline,
  updateOfferSetTrackerFromSelection,
  finalizeOfferSetTracker,
} from "./miaOfferSetTracker.js";

export {
  MIA_OFFER_PIPELINE_STATUSES,
  MIA_OFFER_TERMINATION_STAGES,
  MIA_OFFER_SET_SEARCH_PATHS,
  MIA_OFFER_SET_RUNTIME_MODES,
} from "./miaOfferSetCatalog.js";

export {
  resolveOfferPipelineStatus,
  resolveOfferSetSearchPath,
  resolveOfferTerminationStage,
  computeOfferPriceAggregates,
} from "./miaOfferSetClassifier.js";

export {
  buildMerchantKey,
  buildOfferFingerprint,
  parseOfferPrice,
  isOfferAnalyticallyComplete,
} from "./miaOfferIdentity.js";
