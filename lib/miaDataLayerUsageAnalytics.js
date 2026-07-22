/**
 * PATCH 6.4 — Data Layer Usage & Effectiveness Analytics
 *
 * Server-side INSERT into analytics_events (mirrors price-alert analytics pattern).
 * Side-effect non-blocking; never alters commercial pipeline decisions.
 */

import { assembleAnalyticsInsertRow, isAnalyticsUuid } from "./miaAnalyticsPayload.js";
import {
  classifyDataLayerResponse,
  classifyFallbackKind,
  countDataLayerProductsInList,
  countHybridEnrichedProducts,
  deriveDataLayerResolutionFlags,
  DATA_LAYER_RESPONSE_CLASSIFICATIONS,
} from "./miaDataLayerResolutionClassifier.js";

export const MIA_DATA_LAYER_USAGE_ANALYTICS_VERSION = "6.4.0";
export const MIA_DATA_LAYER_USAGE_ANALYTICS_EVENT = "data_layer_resolution";
export const MIA_DATA_LAYER_USAGE_ANALYTICS_CATEGORY = "data_layer_usage";
export const MIA_DATA_LAYER_USAGE_TEST_ANALYTICS_CATEGORY = "data_layer_usage_test";

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

function resolveWinnerBrand(products = [], selectedBestProduct = null) {
  const winner = selectedBestProduct || products[0] || null;
  return (
    winner?.trustedSpecs?.brand ||
    winner?.brand ||
    winner?.product_brand ||
    null
  );
}

function resolveModelFamily(products = [], selectedBestProduct = null) {
  const winner = selectedBestProduct || products[0] || null;
  return (
    winner?.trustedSpecs?.model_family ||
    winner?.model_family ||
    winner?.familyKey ||
    null
  );
}

function resolveFinalProvider(products = [], selectedBestProduct = null) {
  const winner = selectedBestProduct || products[0] || null;
  return winner?.commercialProvider || winner?.provider || winner?.source || null;
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
 *   query?: string,
 *   category?: string|null,
 *   intent?: string|null,
 *   responsePath?: string|null,
 *   dataLayerUsedAsPrimarySource?: boolean,
 *   hasPriorityFollowUp?: boolean,
 *   commercialSearchUnavailable?: boolean,
 *   products?: unknown[],
 *   displayProducts?: unknown[],
 *   selectedBestProduct?: Record<string, unknown>|null,
 *   searchMetrics?: {
 *     pipelineStartedAt?: number,
 *     candidatesRaw?: number,
 *     candidatesAfterIsolation?: number,
 *     isolationApplied?: boolean,
 *     isolationReason?: string|null,
 *     hybridEnrichCount?: number,
 *     intelligentFallbackUsed?: boolean,
 *   },
 *   winnerSource?: string|null,
 *   confidence?: string|null,
 *   controlledTest?: boolean,
 * }} input
 */
export function buildDataLayerUsageAnalyticsPayload(input = {}) {
  const analyticsContext = input.analyticsContext || {};
  const products = Array.isArray(input.displayProducts)
    ? input.displayProducts
    : Array.isArray(input.products)
      ? input.products.slice(0, 3)
      : [];
  const searchMetrics = input.searchMetrics || {};
  const productsUsedCount = products.length;
  const dataLayerProductsInResponse = countDataLayerProductsInList(products);
  const hybridEnrichCount =
    Number(searchMetrics.hybridEnrichCount) || countHybridEnrichedProducts(products);

  const responseClassification = classifyDataLayerResponse({
    productsUsedCount,
    dataLayerUsedAsPrimarySource: !!input.dataLayerUsedAsPrimarySource,
    dataLayerProductsInResponse,
    hybridEnrichCount,
    intelligentFallbackUsed: !!searchMetrics.intelligentFallbackUsed,
    hasPriorityFollowUp: !!input.hasPriorityFollowUp,
  });

  const fallbackKind = classifyFallbackKind({
    responseClassification,
    dataLayerUsedAsPrimarySource: !!input.dataLayerUsedAsPrimarySource,
    candidatesRaw: searchMetrics.candidatesRaw,
    candidatesAfterIsolation: searchMetrics.candidatesAfterIsolation,
    hybridEnrichCount,
    intelligentFallbackUsed: !!searchMetrics.intelligentFallbackUsed,
  });

  const resolutionFlags = deriveDataLayerResolutionFlags(responseClassification);
  const queryDurationMs =
    searchMetrics.pipelineStartedAt != null
      ? Math.max(0, Date.now() - Number(searchMetrics.pipelineStartedAt))
      : null;

  const metadata = sanitizeMetadataValue({
    event_version: MIA_DATA_LAYER_USAGE_ANALYTICS_VERSION,
    request_id: input.requestId ?? null,
    response_classification: responseClassification,
    response_path: input.responsePath ?? null,
    intent: input.intent ?? null,
    data_layer_used: resolutionFlags.data_layer_used,
    fallback_used: resolutionFlags.fallback_used,
    hybrid_response: resolutionFlags.hybrid_response,
    full_coverage: resolutionFlags.full_coverage,
    partial_coverage: resolutionFlags.partial_coverage,
    no_coverage: resolutionFlags.no_coverage,
    fallback_only: resolutionFlags.fallback_only,
    data_layer_used_as_primary_source: !!input.dataLayerUsedAsPrimarySource,
    has_priority_follow_up: !!input.hasPriorityFollowUp,
    commercial_search_unavailable: !!input.commercialSearchUnavailable,
    candidates_found: Number(searchMetrics.candidatesRaw) || 0,
    candidates_after_isolation: Number(searchMetrics.candidatesAfterIsolation) || 0,
    candidates_used: productsUsedCount,
    data_layer_products_in_response: dataLayerProductsInResponse,
    isolation_applied: !!searchMetrics.isolationApplied,
    isolation_reason: searchMetrics.isolationReason ?? null,
    hybrid_enrich_count: hybridEnrichCount,
    intelligent_fallback_used: !!searchMetrics.intelligentFallbackUsed,
    fallback_kind: fallbackKind,
    query_duration_ms: queryDurationMs,
    winner_source: input.winnerSource ?? null,
    confidence: input.confidence ?? null,
    final_provider: resolveFinalProvider(products, input.selectedBestProduct),
    model_family: resolveModelFamily(products, input.selectedBestProduct),
    controlled_test: !!input.controlledTest,
    not_market_real: !!input.controlledTest,
  });

  const category = input.controlledTest
    ? MIA_DATA_LAYER_USAGE_TEST_ANALYTICS_CATEGORY
    : MIA_DATA_LAYER_USAGE_ANALYTICS_CATEGORY;

  return {
    payload: assembleAnalyticsInsertRow({
      event_name: MIA_DATA_LAYER_USAGE_ANALYTICS_EVENT,
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
      category: input.category || category,
      query_text: String(input.query || "").slice(0, 500) || null,
      product_name:
        input.selectedBestProduct?.product_name ||
        products[0]?.product_name ||
        null,
      product_brand: resolveWinnerBrand(products, input.selectedBestProduct),
      product_id: input.selectedBestProduct?.product_id || products[0]?.product_id || null,
      recommendation_name:
        input.selectedBestProduct?.product_name ||
        products[0]?.product_name ||
        null,
      offer_store: resolveFinalProvider(products, input.selectedBestProduct),
      offer_price:
        input.selectedBestProduct?.price ||
        input.selectedBestProduct?.numericPrice ||
        products[0]?.price ||
        products[0]?.numericPrice ||
        null,
      offer_url: input.selectedBestProduct?.link || products[0]?.link || null,
      metadata,
    }),
    summary: {
      event_version: MIA_DATA_LAYER_USAGE_ANALYTICS_VERSION,
      response_classification: responseClassification,
      data_layer_used: resolutionFlags.data_layer_used,
      fallback_used: resolutionFlags.fallback_used,
      hybrid_response: resolutionFlags.hybrid_response,
      fallback_kind: fallbackKind,
      candidates_found: Number(searchMetrics.candidatesRaw) || 0,
      candidates_used: productsUsedCount,
    },
  };
}

/**
 * Safe subset for frontend recommendation metadata (retrocompatible extension).
 *
 * @param {Record<string, unknown>|null|undefined} summary
 */
export function buildDataLayerUsageRecommendationMetadata(summary = null) {
  if (!summary || typeof summary !== "object") return {};
  return sanitizeMetadataValue({
    data_layer_event_version: summary.event_version ?? null,
    data_layer_response_classification: summary.response_classification ?? null,
    data_layer_used: summary.data_layer_used ?? null,
    fallback_used: summary.fallback_used ?? null,
    hybrid_response: summary.hybrid_response ?? null,
    fallback_kind: summary.fallback_kind ?? null,
  });
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {Parameters<typeof buildDataLayerUsageAnalyticsPayload>[0]} input
 */
export async function emitDataLayerUsageAnalytics(supabase, input = {}) {
  if (!supabase) {
    return { ok: false, code: "missing_supabase_client" };
  }

  try {
    const built = buildDataLayerUsageAnalyticsPayload(input);
    const { error } = await supabase.from("analytics_events").insert(built.payload);

    if (error) {
      console.warn("[MIA DataLayer Usage Analytics] insert failed:", {
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
      response_classification:
        built.summary.response_classification ||
        DATA_LAYER_RESPONSE_CLASSIFICATIONS.NO_COMMERCIAL_RESULT,
      summary: built.summary,
    };
  } catch (err) {
    console.warn("[MIA DataLayer Usage Analytics] unexpected error:", {
      message: String(err?.message || "unknown_error").slice(0, 120),
    });
    return {
      ok: false,
      code: "analytics_internal_error",
      error: String(err?.message || "unknown_error").slice(0, 160),
    };
  }
}
