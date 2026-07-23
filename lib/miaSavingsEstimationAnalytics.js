/**
 * PATCH 10.2 — Savings Estimation Analytics
 *
 * Observational only — derived from mia_offer_set metadata; never alters prices or ranking.
 */

import { assembleAnalyticsInsertRow, isAnalyticsUuid } from "./miaAnalyticsPayload.js";
import { MIA_SAVINGS_ESTIMATION_CATALOG_VERSION } from "./miaSavingsEstimationCatalog.js";
import {
  buildPriceIntelligenceFromOfferSetMetadata,
} from "./miaPriceIntelligenceClassifier.js";
import {
  buildSavingsEstimationsFromOfferSetMetadata,
} from "./miaSavingsEstimationClassifier.js";

export const MIA_SAVINGS_ESTIMATION_ANALYTICS_VERSION = MIA_SAVINGS_ESTIMATION_CATALOG_VERSION;
export const MIA_SAVINGS_ESTIMATION_ANALYTICS_EVENT = "mia_savings_estimation";
export const MIA_SAVINGS_ESTIMATION_ANALYTICS_CATEGORY = "savings_estimation";
export const MIA_SAVINGS_ESTIMATION_TEST_ANALYTICS_CATEGORY = "savings_estimation_test";

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
  "image",
  "description",
  "raw_offer",
  "raw_payload",
  "cookie",
  "headers",
]);

/**
 * @param {string} requestId
 * @param {string} eventName
 * @param {string} eventVersion
 * @param {string} calculationMethod
 * @param {string} baselineType
 */
export function buildSavingsEstimationDedupKey(
  requestId,
  eventName,
  eventVersion,
  calculationMethod,
  baselineType
) {
  return `${requestId}|${eventName}|${eventVersion}|${calculationMethod}|${baselineType}`;
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

function shouldEmitSavingsEstimationEvent(requestId, calculationMethod, baselineType) {
  const dedupKey = buildSavingsEstimationDedupKey(
    requestId || "unknown",
    MIA_SAVINGS_ESTIMATION_ANALYTICS_EVENT,
    MIA_SAVINGS_ESTIMATION_ANALYTICS_VERSION,
    calculationMethod || "UNKNOWN",
    baselineType || "UNKNOWN"
  );
  if (globalDedupStore[dedupKey]) return false;
  globalDedupStore[dedupKey] = true;
  return true;
}

/**
 * @param {{
 *   requestId?: string|null,
 *   analyticsContext?: object,
 *   offerSetMetadata?: Record<string, unknown>|null,
 *   priceIntelligenceMetadata?: Record<string, unknown>|null,
 *   controlledTest?: boolean,
 * }} input
 */
export function buildSavingsEstimationAnalyticsPayloads(input = {}) {
  const analyticsContext = input.analyticsContext || {};
  const requestId = input.requestId ?? null;
  const offerSetMetadata = input.offerSetMetadata || {};
  const priceIntelMetadata =
    input.priceIntelligenceMetadata ||
    buildPriceIntelligenceFromOfferSetMetadata(offerSetMetadata, {
      requestId,
      decisionRequestId: requestId,
    });

  const estimations = buildSavingsEstimationsFromOfferSetMetadata(
    offerSetMetadata,
    priceIntelMetadata,
    { requestId, decisionRequestId: requestId }
  );

  const category = input.controlledTest
    ? MIA_SAVINGS_ESTIMATION_TEST_ANALYTICS_CATEGORY
    : MIA_SAVINGS_ESTIMATION_ANALYTICS_CATEGORY;

  return estimations.map((estimation) => {
    const metadata = sanitizeMetadataValue({
      event_version: MIA_SAVINGS_ESTIMATION_ANALYTICS_VERSION,
      ...estimation,
    });
    delete metadata.estimation_valid;

    return {
      payload: assembleAnalyticsInsertRow({
        event_name: MIA_SAVINGS_ESTIMATION_ANALYTICS_EVENT,
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
        event_version: MIA_SAVINGS_ESTIMATION_ANALYTICS_VERSION,
        request_id: requestId,
        savings_type: metadata?.savings_type ?? null,
        savings_nature: metadata?.savings_nature ?? null,
        savings_confidence: metadata?.savings_confidence ?? null,
        calculation_method: metadata?.calculation_method ?? null,
        baseline_type: metadata?.baseline_type ?? null,
        savings_amount: metadata?.savings_amount ?? null,
        savings_valid: metadata?.savings_valid ?? false,
      }),
    };
  });
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {Parameters<typeof buildSavingsEstimationAnalyticsPayloads>[0]} input
 */
export async function emitSavingsEstimationAnalytics(supabase, input = {}) {
  if (!supabase) {
    return { ok: false, code: "missing_supabase_client", summaries: [] };
  }

  try {
    const builtList = buildSavingsEstimationAnalyticsPayloads(input);
    const summaries = [];

    for (const built of builtList) {
      const method = built.payload.metadata?.calculation_method ?? "UNKNOWN";
      const baseline = built.payload.metadata?.baseline_type ?? "UNKNOWN";
      const requestId = input.requestId ?? null;

      if (!requestId || !shouldEmitSavingsEstimationEvent(requestId, method, baseline)) {
        continue;
      }

      const { error } = await supabase.from("analytics_events").insert(built.payload);
      if (error) {
        console.warn("[MIA Savings Estimation Analytics] insert failed:", {
          event: built.payload.event_name,
          method,
          code: String(error.code || "insert_error").slice(0, 80),
        });
        continue;
      }
      summaries.push(built.summary);
    }

    return {
      ok: summaries.length > 0,
      event_name: MIA_SAVINGS_ESTIMATION_ANALYTICS_EVENT,
      summaries,
    };
  } catch (err) {
    console.warn("[MIA Savings Estimation Analytics] unexpected error:", {
      message: String(err?.message || "unknown_error").slice(0, 120),
    });
    return {
      ok: false,
      code: "analytics_internal_error",
      summaries: [],
    };
  }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {Parameters<typeof buildSavingsEstimationAnalyticsPayloads>[0]} input
 */
export function scheduleSavingsEstimationAnalytics(supabase, input = {}) {
  void emitSavingsEstimationAnalytics(supabase, input).catch(() => {});
}

/**
 * Emit savings estimations derived from finalized offer_set metadata (same request).
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {{
 *   requestId?: string|null,
 *   analyticsContext?: object,
 *   offerSetMetadata?: Record<string, unknown>|null,
 *   controlledTest?: boolean,
 * }} input
 */
export function instrumentSavingsEstimationAnalyticsFromOfferSet(supabase, input = {}) {
  if (!input.offerSetMetadata || typeof input.offerSetMetadata !== "object") return null;

  const requestId = input.requestId ?? null;
  const intelligenceValid =
    (Number(input.offerSetMetadata.price_sample_count) || 0) > 0 ||
    input.offerSetMetadata.winner_present === true;
  if (!requestId || !intelligenceValid) return null;

  const builtList = buildSavingsEstimationAnalyticsPayloads({
    requestId,
    analyticsContext: input.analyticsContext,
    offerSetMetadata: input.offerSetMetadata,
    controlledTest: input.controlledTest,
  });
  if (builtList.length === 0) return null;

  scheduleSavingsEstimationAnalytics(supabase, {
    requestId,
    analyticsContext: input.analyticsContext,
    offerSetMetadata: input.offerSetMetadata,
    controlledTest: input.controlledTest,
  });

  return builtList.map((built) => built.summary);
}

export {
  MIA_SAVINGS_TYPE,
  MIA_SAVINGS_BASELINE_TYPE,
  MIA_SAVINGS_CALCULATION_METHOD,
  MIA_SAVINGS_CONFIDENCE,
  MIA_SAVINGS_NATURE,
  MIA_SAVINGS_ELIGIBILITY_REASON,
  MIA_SAVINGS_COMPARISON_DIRECTION,
} from "./miaSavingsEstimationCatalog.js";

export {
  buildSavingsEstimationsFromOfferSetMetadata,
  buildWinnerVsMinimumEstimation,
  buildUiAssumptionEstimation,
  resolveSavingsConfidenceFromEvidence,
  resolveComparisonDirection,
} from "./miaSavingsEstimationClassifier.js";
