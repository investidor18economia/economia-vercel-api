/**
 * PATCH 7.3 — Latency Reliability Analytics
 *
 * Server-side INSERT into analytics_events (mirrors PATCH 7.1/7.2 pattern).
 * Observational only — fire-and-forget; never alters runtime behavior.
 */

import { assembleAnalyticsInsertRow, isAnalyticsUuid } from "./miaAnalyticsPayload.js";
import { getSharedRequestState } from "./miaSharedRequestState.js";
import {
  MIA_LATENCY_BANDS,
  MIA_LATENCY_THRESHOLD_MS,
} from "./miaLatencyStageCatalog.js";
import {
  buildLatencyDedupKey,
  createLatencyTracker,
  finalizeLatencyMeasurement,
  markResponseReady,
} from "./miaLatencyTracker.js";

export const MIA_LATENCY_ANALYTICS_VERSION = "7.3.0";
export const MIA_LATENCY_ANALYTICS_EVENT = "mia_latency_event";
export const MIA_LATENCY_ANALYTICS_CATEGORY = "reliability_latency";
export const MIA_LATENCY_TEST_ANALYTICS_CATEGORY = "reliability_latency_test";

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
]);

function sanitizeMetadataValue(value, depth = 0) {
  if (depth > 4) return null;
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.slice(0, 500);
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeMetadataValue(item, depth + 1));
  }
  if (typeof value === "object") {
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      const normalizedKey = String(key).toLowerCase();
      if (FORBIDDEN_METADATA_KEYS.has(normalizedKey)) continue;
      if (normalizedKey.includes("secret") || normalizedKey.includes("password")) continue;
      if (normalizedKey.includes("stack")) continue;
      out[key] = sanitizeMetadataValue(nested, depth + 1);
    }
    return out;
  }
  return null;
}

function getLatencyAnalyticsBucket() {
  const sharedState = getSharedRequestState();
  if (!sharedState) return null;
  if (!sharedState.latencyAnalytics) {
    sharedState.latencyAnalytics = createLatencyTracker({
      requestStartedAt: sharedState.responseAnalytics?.pipelineStartedAt ?? Date.now(),
    });
  }
  return sharedState.latencyAnalytics;
}

function shouldEmitLatencyEvent(requestId) {
  const bucket = getLatencyAnalyticsBucket();
  if (bucket?.emitted) return false;
  const dedupKey = buildLatencyDedupKey(
    requestId || "unknown",
    MIA_LATENCY_ANALYTICS_EVENT,
    MIA_LATENCY_ANALYTICS_VERSION
  );
  const store = sharedStateDedupStore();
  if (store[dedupKey]) return false;
  store[dedupKey] = true;
  if (bucket) {
    bucket.emitted = true;
  }
  return true;
}

function sharedStateDedupStore() {
  const sharedState = getSharedRequestState();
  if (!sharedState) return {};
  if (!sharedState.latencyAnalyticsDedup) {
    sharedState.latencyAnalyticsDedup = {};
  }
  return sharedState.latencyAnalyticsDedup;
}

/**
 * Documented baseline band — not used for runtime decisions.
 *
 * @param {number|null|undefined} totalMs
 */
export function classifyLatencyBand(totalMs) {
  const ms = Number(totalMs);
  if (!Number.isFinite(ms) || ms < 0) return null;
  if (ms < MIA_LATENCY_THRESHOLD_MS.FAST) return MIA_LATENCY_BANDS.FAST;
  if (ms < MIA_LATENCY_THRESHOLD_MS.ACCEPTABLE) return MIA_LATENCY_BANDS.ACCEPTABLE;
  if (ms < MIA_LATENCY_THRESHOLD_MS.SLOW) return MIA_LATENCY_BANDS.SLOW;
  return MIA_LATENCY_BANDS.CRITICAL;
}

/**
 * @param {number|null|undefined} totalMs
 */
export function isSlowRequest(totalMs) {
  const ms = Number(totalMs);
  return Number.isFinite(ms) && ms >= MIA_LATENCY_THRESHOLD_MS.ACCEPTABLE;
}

function readDataLayerDurationReference(body = {}) {
  const summary =
    body?.data_layer_usage_analytics ||
    body?.dataLayerUsageAnalytics?.summary ||
    body?.dataLayerUsageAnalytics ||
    null;
  const queryDurationMs =
    summary?.query_duration_ms ?? summary?.metadata?.query_duration_ms ?? null;
  return {
    data_layer_query_duration_ms: Number.isFinite(Number(queryDurationMs))
      ? Math.max(0, Math.round(Number(queryDurationMs)))
      : null,
    data_layer_correlation_present: !!summary,
  };
}

/**
 * @param {{
 *   requestId?: string|null,
 *   analyticsContext?: object,
 *   query?: string|null,
 *   intent?: string|null,
 *   responsePath?: string|null,
 *   httpStatus?: number,
 *   endpoint?: string|null,
 *   body?: Record<string, unknown>|null,
 *   responseOutcome?: string|null,
 *   errorPresent?: boolean,
 *   provider?: string|null,
 *   controlledTest?: boolean,
 *   latencyTracker?: ReturnType<typeof createLatencyTracker>|null,
 * }} input
 */
export function buildLatencyAnalyticsPayload(input = {}) {
  const analyticsContext = input.analyticsContext || {};
  const tracker = input.latencyTracker || getLatencyAnalyticsBucket();
  markResponseReady(tracker);
  const measurement = finalizeLatencyMeasurement(tracker);
  const dataLayerRef = readDataLayerDurationReference(input.body || {});
  const totalDurationMs = measurement.total_duration_ms;
  const latencyBand = classifyLatencyBand(totalDurationMs);

  const metadata = sanitizeMetadataValue({
    event_version: MIA_LATENCY_ANALYTICS_VERSION,
    request_id: input.requestId ?? null,
    endpoint: input.endpoint || "/api/chat-gpt4o",
    http_status: Number(input.httpStatus) || 200,
    response_path: input.responsePath ?? null,
    intent: input.intent ?? null,
    response_outcome: input.responseOutcome ?? null,
    error_present: !!input.errorPresent,
    total_duration_ms: totalDurationMs,
    latency_band: latencyBand,
    slow_request: isSlowRequest(totalDurationMs),
    stages: measurement.stages,
    measurement_gaps: measurement.measurement_gaps,
    measurement_gap_count: measurement.measurement_gaps.length,
    provider: input.provider ?? null,
    response_duration_ms_reference: totalDurationMs,
    data_layer_query_duration_ms: dataLayerRef.data_layer_query_duration_ms,
    data_layer_correlation_present: dataLayerRef.data_layer_correlation_present,
    delta_note:
      "total_duration_ms is end-to-end server latency (request start → response ready). PATCH 6.4 query_duration_ms covers Data Layer subset only.",
    controlled_test: !!input.controlledTest,
    not_market_real: !!input.controlledTest,
  });

  const category = input.controlledTest
    ? MIA_LATENCY_TEST_ANALYTICS_CATEGORY
    : MIA_LATENCY_ANALYTICS_CATEGORY;

  return {
    payload: assembleAnalyticsInsertRow({
      event_name: MIA_LATENCY_ANALYTICS_EVENT,
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
      query_text: String(input.query || "").slice(0, 500) || null,
      metadata,
    }),
    summary: {
      event_version: MIA_LATENCY_ANALYTICS_VERSION,
      total_duration_ms: totalDurationMs,
      latency_band: latencyBand,
      slow_request: isSlowRequest(totalDurationMs),
      response_path: input.responsePath ?? null,
      http_status: Number(input.httpStatus) || 200,
      measurement_gap_count: measurement.measurement_gaps.length,
    },
  };
}

/**
 * @param {Record<string, unknown>|null|undefined} summary
 */
export function buildLatencyRecommendationMetadata(summary = null) {
  if (!summary || typeof summary !== "object") return {};
  return sanitizeMetadataValue({
    latency_event_version: summary.event_version ?? null,
    total_duration_ms: summary.total_duration_ms ?? null,
    latency_band: summary.latency_band ?? null,
    slow_request: summary.slow_request ?? null,
    response_path: summary.response_path ?? null,
  });
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {Parameters<typeof buildLatencyAnalyticsPayload>[0]} input
 * @param {{ payload: object, summary: object }|null} [prebuilt]
 */
export async function emitLatencyAnalytics(supabase, input = {}, prebuilt = null) {
  if (!supabase) {
    return { ok: false, code: "missing_supabase_client" };
  }

  if (!shouldEmitLatencyEvent(input.requestId)) {
    return { ok: false, code: "latency_event_deduplicated" };
  }

  try {
    const built = prebuilt || buildLatencyAnalyticsPayload(input);
    const { error } = await supabase.from("analytics_events").insert(built.payload);

    if (error) {
      console.warn("[MIA Latency Analytics] insert failed:", {
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
    console.warn("[MIA Latency Analytics] unexpected error:", {
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
 * @param {Parameters<typeof buildLatencyAnalyticsPayload>[0]} input
 * @param {{ payload: object, summary: object }|null} [prebuilt]
 */
export function scheduleLatencyAnalytics(supabase, input = {}, prebuilt = null) {
  void emitLatencyAnalytics(supabase, input, prebuilt).catch(() => {});
}
