/**
 * PATCH 10.1 — Price Intelligence Analytics
 *
 * Observational only — derived from mia_offer_set metadata; never alters prices or ranking.
 */

import { assembleAnalyticsInsertRow, isAnalyticsUuid } from "./miaAnalyticsPayload.js";
import { shouldEnterCommercialSearchAnalyticsDomain } from "./miaCommercialSearchClassifier.js";
import { MIA_PRICE_INTELLIGENCE_CATALOG_VERSION } from "./miaPriceIntelligenceCatalog.js";
import { buildPriceIntelligenceFromOfferSetMetadata } from "./miaPriceIntelligenceClassifier.js";

export const MIA_PRICE_INTELLIGENCE_ANALYTICS_VERSION = MIA_PRICE_INTELLIGENCE_CATALOG_VERSION;
export const MIA_PRICE_INTELLIGENCE_ANALYTICS_EVENT = "mia_price_intelligence";
export const MIA_PRICE_INTELLIGENCE_ANALYTICS_CATEGORY = "price_intelligence";
export const MIA_PRICE_INTELLIGENCE_TEST_ANALYTICS_CATEGORY = "price_intelligence_test";

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
  "payload",
  "secret",
  "token",
  "authorization",
  "stack",
  "stack_trace",
]);

/**
 * @param {string} requestId
 * @param {string} eventName
 * @param {string} eventVersion
 */
export function buildPriceIntelligenceDedupKey(requestId, eventName, eventVersion) {
  return `${requestId}|${eventName}|${eventVersion}`;
}

function sanitizeMetadataValue(value, depth = 0) {
  if (depth > 4) return null;
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const trimmed = value.slice(0, 120);
    if (/bearer\s+/i.test(trimmed)) return "[redacted]";
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

const globalDedupStore = {};

function shouldEmitPriceIntelligenceEvent(requestId) {
  const dedupKey = buildPriceIntelligenceDedupKey(
    requestId || "unknown",
    MIA_PRICE_INTELLIGENCE_ANALYTICS_EVENT,
    MIA_PRICE_INTELLIGENCE_ANALYTICS_VERSION
  );
  if (globalDedupStore[dedupKey]) return false;
  globalDedupStore[dedupKey] = true;
  return true;
}

/**
 * @param {{ commercialPermission?: string, interactionMode?: string }} [input]
 */
export function isPriceIntelligenceDomainAllowed(input = {}) {
  return shouldEnterCommercialSearchAnalyticsDomain({
    commercialPermission: input.commercialPermission,
    interactionMode: input.interactionMode,
  });
}

/**
 * @param {{
 *   requestId?: string|null,
 *   analyticsContext?: object,
 *   offerSetMetadata?: Record<string, unknown>|null,
 *   controlledTest?: boolean,
 * }} input
 */
export function buildPriceIntelligenceAnalyticsPayload(input = {}) {
  const analyticsContext = input.analyticsContext || {};
  const requestId = input.requestId ?? null;
  const intelligence = buildPriceIntelligenceFromOfferSetMetadata(input.offerSetMetadata || {}, {
    requestId,
    decisionRequestId: requestId,
  });

  const metadata = sanitizeMetadataValue({
    event_version: MIA_PRICE_INTELLIGENCE_ANALYTICS_VERSION,
    ...intelligence,
  });

  const category = input.controlledTest
    ? MIA_PRICE_INTELLIGENCE_TEST_ANALYTICS_CATEGORY
    : MIA_PRICE_INTELLIGENCE_ANALYTICS_CATEGORY;

  return {
    payload: assembleAnalyticsInsertRow({
      event_name: MIA_PRICE_INTELLIGENCE_ANALYTICS_EVENT,
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
      event_version: MIA_PRICE_INTELLIGENCE_ANALYTICS_VERSION,
      request_id: requestId,
      price_quality: metadata?.price_quality ?? null,
      price_confidence: metadata?.price_confidence ?? null,
      winner_price_position: metadata?.winner_price_position ?? null,
      price_sample_count: metadata?.price_sample_count ?? null,
      intelligence_valid: metadata?.intelligence_valid ?? false,
    }),
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {Parameters<typeof buildPriceIntelligenceAnalyticsPayload>[0]} input
 */
export async function emitPriceIntelligenceAnalytics(supabase, input = {}) {
  if (!supabase) {
    return { ok: false, code: "missing_supabase_client" };
  }

  try {
    const built = buildPriceIntelligenceAnalyticsPayload(input);
    const { error } = await supabase.from("analytics_events").insert(built.payload);

    if (error) {
      console.warn("[MIA Price Intelligence Analytics] insert failed:", {
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
    console.warn("[MIA Price Intelligence Analytics] unexpected error:", {
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
 * @param {Parameters<typeof buildPriceIntelligenceAnalyticsPayload>[0]} input
 */
export function schedulePriceIntelligenceAnalytics(supabase, input = {}) {
  void emitPriceIntelligenceAnalytics(supabase, input).catch(() => {});
}

/**
 * Emit price intelligence derived from finalized offer_set metadata (same request).
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {{
 *   requestId?: string|null,
 *   analyticsContext?: object,
 *   offerSetMetadata?: Record<string, unknown>|null,
 *   controlledTest?: boolean,
 *   commercialPermission?: string|null,
 *   interactionMode?: string|null,
 * }} input
 */
export function instrumentPriceIntelligenceAnalyticsFromOfferSet(supabase, input = {}) {
  if (!input.offerSetMetadata || typeof input.offerSetMetadata !== "object") return null;

  if (
    !isPriceIntelligenceDomainAllowed({
      commercialPermission: input.commercialPermission,
      interactionMode: input.interactionMode,
    })
  ) {
    return null;
  }

  const requestId = input.requestId ?? null;
  if (!requestId || !shouldEmitPriceIntelligenceEvent(requestId)) return null;

  const intelligenceValid =
    (Number(input.offerSetMetadata.price_sample_count) || 0) > 0 ||
    input.offerSetMetadata.winner_present === true;
  if (!intelligenceValid) return null;

  const built = buildPriceIntelligenceAnalyticsPayload({
    requestId,
    analyticsContext: input.analyticsContext,
    offerSetMetadata: input.offerSetMetadata,
    controlledTest: input.controlledTest,
  });

  schedulePriceIntelligenceAnalytics(supabase, {
    requestId,
    analyticsContext: input.analyticsContext,
    offerSetMetadata: input.offerSetMetadata,
    controlledTest: input.controlledTest,
  });

  return built.summary;
}

export {
  MIA_PRICE_QUALITY,
  MIA_PRICE_CONFIDENCE,
  MIA_WINNER_PRICE_POSITION,
  MIA_SHIPPING_COVERAGE,
} from "./miaPriceIntelligenceCatalog.js";

export {
  buildPriceIntelligenceFromOfferSetMetadata,
  resolveWinnerPricePosition,
  resolvePriceQuality,
  resolvePriceConfidence,
  resolveShippingCoverage,
} from "./miaPriceIntelligenceClassifier.js";
