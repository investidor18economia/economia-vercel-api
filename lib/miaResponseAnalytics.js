/**
 * PATCH 7.1 — Response Reliability Analytics
 *
 * Server-side INSERT into analytics_events (mirrors PATCH 6.4 pattern).
 * Side-effect non-blocking; never alters pipeline decisions.
 */

import { assembleAnalyticsInsertRow, isAnalyticsUuid } from "./miaAnalyticsPayload.js";
import {
  classifyResponseOutcome,
  deriveResponseOutcomeFlags,
  deriveResponseValidity,
  MIA_RESPONSE_OUTCOMES,
  summarizeResponseDelivery,
} from "./miaResponseOutcomeClassifier.js";
import { resolveResponsePathRegistry } from "./miaRuntimePrecedence.js";

export const MIA_RESPONSE_ANALYTICS_VERSION = "7.1.0";
export const MIA_RESPONSE_ANALYTICS_EVENT = "mia_response_outcome";
export const MIA_RESPONSE_ANALYTICS_CATEGORY = "reliability_response";
export const MIA_RESPONSE_TEST_ANALYTICS_CATEGORY = "reliability_response_test";

const FORBIDDEN_METADATA_KEYS = new Set([
  "user_email",
  "email",
  "resend_api_key",
  "api_key",
  "admin_key",
  "password",
  "token",
  "secret",
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
      out[key] = sanitizeMetadataValue(nested, depth + 1);
    }
    return out;
  }
  return null;
}

function readDataLayerCorrelation(body = {}) {
  const summary =
    body?.data_layer_usage_analytics ||
    body?.dataLayerUsageAnalytics?.summary ||
    body?.dataLayerUsageAnalytics ||
    null;
  if (!summary || typeof summary !== "object") {
    return {
      data_layer_response_classification: null,
      data_layer_correlation_present: false,
    };
  }
  return {
    data_layer_response_classification:
      summary.response_classification || summary.data_layer_response_classification || null,
    data_layer_correlation_present: true,
  };
}

/**
 * @param {{
 *   requestId?: string|null,
 *   analyticsContext?: {
 *     session_id?: string|null,
 *     visitor_id?: string|null,
 *     conversation_id?: string|null,
 *     user_id?: string|null,
 *   },
 *   query?: string|null,
 *   intent?: string|null,
 *   responsePath?: string|null,
 *   httpStatus?: number,
 *   reasonCode?: string|null,
 *   endpoint?: string|null,
 *   body?: Record<string, unknown>|null,
 *   pipelineStartedAt?: number|null,
 *   commercialIntent?: boolean,
 *   responseInterrupted?: boolean,
 *   controlledTest?: boolean,
 * }} input
 */
export function buildResponseOutcomeAnalyticsPayload(input = {}) {
  const analyticsContext = input.analyticsContext || {};
  const body = input.body && typeof input.body === "object" ? input.body : {};
  const responsePath = input.responsePath ?? null;
  const httpStatus = Number(input.httpStatus) || 200;
  const registry = resolveResponsePathRegistry(responsePath || "");
  const outcome = classifyResponseOutcome({
    httpStatus,
    responsePath,
    body,
    reasonCode: input.reasonCode ?? null,
    commercialIntent: input.commercialIntent,
    responseInterrupted: input.responseInterrupted,
  });
  const validity = deriveResponseValidity(outcome);
  const outcomeFlags = deriveResponseOutcomeFlags(outcome);
  const delivery = summarizeResponseDelivery(body);
  const dataLayerCorrelation = readDataLayerCorrelation(body);
  const responseDurationMs =
    input.pipelineStartedAt != null
      ? Math.max(0, Date.now() - Number(input.pipelineStartedAt))
      : null;

  const metadata = sanitizeMetadataValue({
    event_version: MIA_RESPONSE_ANALYTICS_VERSION,
    request_id: input.requestId ?? null,
    endpoint: input.endpoint || "/api/chat-gpt4o",
    http_status: httpStatus,
    response_path: responsePath,
    response_path_category: registry.category || null,
    intent: input.intent ?? null,
    outcome,
    response_validity: validity,
    reason_code: input.reasonCode ?? null,
    response_duration_ms: responseDurationMs,
    commercial_intent: !!input.commercialIntent || registry.category === "commercial",
    ...outcomeFlags,
    ...delivery,
    ...dataLayerCorrelation,
    controlled_test: !!input.controlledTest,
    not_market_real: !!input.controlledTest,
  });

  const category = input.controlledTest
    ? MIA_RESPONSE_TEST_ANALYTICS_CATEGORY
    : MIA_RESPONSE_ANALYTICS_CATEGORY;

  return {
    payload: assembleAnalyticsInsertRow({
      event_name: MIA_RESPONSE_ANALYTICS_EVENT,
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
      event_version: MIA_RESPONSE_ANALYTICS_VERSION,
      outcome,
      response_validity: validity,
      response_path: responsePath,
      http_status: httpStatus,
      products_in_response: delivery.products_in_response,
      reply_present: delivery.reply_present,
    },
  };
}

/**
 * Safe subset for API response body (retrocompatible extension).
 *
 * @param {Record<string, unknown>|null|undefined} summary
 */
export function buildResponseOutcomeRecommendationMetadata(summary = null) {
  if (!summary || typeof summary !== "object") return {};
  return sanitizeMetadataValue({
    response_outcome_event_version: summary.event_version ?? null,
    response_outcome: summary.outcome ?? null,
    response_validity: summary.response_validity ?? null,
    response_path: summary.response_path ?? null,
    http_status: summary.http_status ?? null,
  });
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {Parameters<typeof buildResponseOutcomeAnalyticsPayload>[0]} input
 */
export async function emitResponseOutcomeAnalytics(supabase, input = {}) {
  if (!supabase) {
    return { ok: false, code: "missing_supabase_client" };
  }

  try {
    const built = buildResponseOutcomeAnalyticsPayload(input);
    const { error } = await supabase.from("analytics_events").insert(built.payload);

    if (error) {
      console.warn("[MIA Response Outcome Analytics] insert failed:", {
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
      outcome: built.summary.outcome || MIA_RESPONSE_OUTCOMES.SUCCESS,
      summary: built.summary,
    };
  } catch (err) {
    console.warn("[MIA Response Outcome Analytics] unexpected error:", {
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
 * Fire-and-forget wrapper — never blocks HTTP response.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {Parameters<typeof buildResponseOutcomeAnalyticsPayload>[0]} input
 */
export function scheduleResponseOutcomeAnalytics(supabase, input = {}) {
  void emitResponseOutcomeAnalytics(supabase, input).catch(() => {});
}
