/**
 * PATCH 10.4 — Anti-Regret Foundation Analytics
 *
 * Observational only — derived from decision, offer_set, price intelligence, savings,
 * and optionally correlated acceptance/rejection signals. Never alters decisions or responses.
 */

import { assembleAnalyticsInsertRow, isAnalyticsUuid } from "./miaAnalyticsPayload.js";
import { getSharedRequestState } from "./miaSharedRequestState.js";
import { MIA_ANTI_REGRET_FOUNDATION_CATALOG_VERSION } from "./miaAntiRegretFoundationCatalog.js";
import {
  buildAntiRegretFoundationMetadata,
} from "./miaAntiRegretFoundationClassifier.js";
import {
  buildPriceIntelligenceFromOfferSetMetadata,
} from "./miaPriceIntelligenceClassifier.js";
import { buildWinnerVsMinimumEstimation } from "./miaSavingsEstimationClassifier.js";

export const MIA_ANTI_REGRET_FOUNDATION_ANALYTICS_VERSION =
  MIA_ANTI_REGRET_FOUNDATION_CATALOG_VERSION;
export const MIA_ANTI_REGRET_FOUNDATION_ANALYTICS_EVENT = "mia_anti_regret_foundation";
export const MIA_ANTI_REGRET_FOUNDATION_ANALYTICS_CATEGORY = "anti_regret";
export const MIA_ANTI_REGRET_FOUNDATION_TEST_ANALYTICS_CATEGORY = "anti_regret_test";

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
  "message",
  "response",
  "prompt",
  "telefone",
  "phone",
]);

function sanitizeMetadataValue(value, depth = 0) {
  if (depth > 4) return null;
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const trimmed = value.slice(0, 120);
    if (/bearer\s+/i.test(trimmed)) return "[redacted]";
    if (/https?:\/\//i.test(trimmed)) return "[redacted]";
    if (/@/.test(trimmed)) return "[redacted]";
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

/**
 * @param {string} requestId
 * @param {string} decisionRequestId
 * @param {string} eventName
 * @param {string} eventVersion
 */
export function buildAntiRegretFoundationDedupKey(
  requestId,
  decisionRequestId,
  eventName,
  eventVersion
) {
  return `${requestId}|${decisionRequestId}|${eventName}|${eventVersion}`;
}

const globalDedupStore = {};

function shouldEmitAntiRegretFoundationEvent(requestId, decisionRequestId) {
  const dedupKey = buildAntiRegretFoundationDedupKey(
    requestId || "unknown",
    decisionRequestId || requestId || "unknown",
    MIA_ANTI_REGRET_FOUNDATION_ANALYTICS_EVENT,
    MIA_ANTI_REGRET_FOUNDATION_ANALYTICS_VERSION
  );
  if (globalDedupStore[dedupKey]) return false;
  globalDedupStore[dedupKey] = true;
  return true;
}

function sharedStateDedupStore() {
  const sharedState = getSharedRequestState();
  if (!sharedState) return globalDedupStore;
  if (!sharedState.antiRegretFoundationAnalyticsDedup) {
    sharedState.antiRegretFoundationAnalyticsDedup = {};
  }
  return sharedState.antiRegretFoundationAnalyticsDedup;
}

function shouldEmitAntiRegretFoundationEventScoped(requestId, decisionRequestId) {
  const dedupKey = buildAntiRegretFoundationDedupKey(
    requestId || "unknown",
    decisionRequestId || requestId || "unknown",
    MIA_ANTI_REGRET_FOUNDATION_ANALYTICS_EVENT,
    MIA_ANTI_REGRET_FOUNDATION_ANALYTICS_VERSION
  );
  const store = sharedStateDedupStore();
  if (store[dedupKey]) return false;
  store[dedupKey] = true;
  globalDedupStore[dedupKey] = true;
  return true;
}

/**
 * @param {Record<string, unknown>|null|undefined} decisionSummary
 * @param {Record<string, unknown>|null|undefined} decisionMetadata
 */
export function resolveDecisionMetadataForAntiRegret(decisionSummary = null, decisionMetadata = null) {
  if (decisionMetadata && typeof decisionMetadata === "object") return decisionMetadata;
  if (!decisionSummary || typeof decisionSummary !== "object") return {};
  return {
    runner_up_present: decisionSummary.runner_up_present ?? null,
    runner_up_competitiveness: decisionSummary.runner_up_competitiveness ?? null,
    score_gap_bucket: decisionSummary.score_gap_bucket ?? null,
    score_gap: decisionSummary.score_gap ?? null,
    winner_present: decisionSummary.winner_present ?? null,
    decision_valid: decisionSummary.decision_valid ?? null,
    candidate_count: decisionSummary.candidate_count ?? null,
    display_count: decisionSummary.display_count ?? null,
    conversation_turn_count: decisionSummary.conversation_turn_count ?? null,
  };
}

/**
 * @param {{
 *   requestId?: string|null,
 *   analyticsContext?: object,
 *   offerSetMetadata?: Record<string, unknown>|null,
 *   decisionMetadata?: Record<string, unknown>|null,
 *   decisionSummary?: Record<string, unknown>|null,
 *   acceptanceSignals?: object[],
 *   rejectionSignals?: object[],
 *   alertStage?: string|null,
 *   controlledTest?: boolean,
 *   source?: string|null,
 * }} input
 */
export function buildAntiRegretFoundationAnalyticsPayload(input = {}) {
  const analyticsContext = input.analyticsContext || {};
  const requestId = input.requestId ?? null;
  const decisionRequestId = input.decisionRequestId ?? requestId ?? null;
  const offerSetMetadata = input.offerSetMetadata || {};
  const decisionMetadata = resolveDecisionMetadataForAntiRegret(
    input.decisionSummary,
    input.decisionMetadata
  );

  const priceIntel = buildPriceIntelligenceFromOfferSetMetadata(offerSetMetadata, {
    requestId,
    decisionRequestId,
  });
  const savings = buildWinnerVsMinimumEstimation(offerSetMetadata, priceIntel, {
    requestId,
    decisionRequestId,
  });

  const foundation = buildAntiRegretFoundationMetadata({
    requestId,
    decisionRequestId,
    offerSetMetadata,
    decisionMetadata,
    priceIntelligenceMetadata: priceIntel,
    savingsMetadata: savings,
    acceptanceSignals: input.acceptanceSignals,
    rejectionSignals: input.rejectionSignals,
    alertStage: input.alertStage ?? null,
    source: input.source ?? null,
  });

  const category = input.controlledTest
    ? MIA_ANTI_REGRET_FOUNDATION_TEST_ANALYTICS_CATEGORY
    : MIA_ANTI_REGRET_FOUNDATION_ANALYTICS_CATEGORY;

  const metadata = sanitizeMetadataValue({
    event_version: MIA_ANTI_REGRET_FOUNDATION_ANALYTICS_VERSION,
    ...foundation,
  });
  delete metadata.foundation_valid;

  return {
    payload: assembleAnalyticsInsertRow({
      event_name: MIA_ANTI_REGRET_FOUNDATION_ANALYTICS_EVENT,
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
      event_version: MIA_ANTI_REGRET_FOUNDATION_ANALYTICS_VERSION,
      request_id: requestId,
      decision_request_id: decisionRequestId,
      anti_regret_score: metadata?.anti_regret_score ?? null,
      anti_regret_confidence: metadata?.anti_regret_confidence ?? null,
      observed_pattern: metadata?.observed_pattern ?? null,
      signal_count: metadata?.signal_count ?? 0,
      conflict_detected: metadata?.conflict_detected ?? false,
      foundation_valid: foundation.foundation_valid,
    }),
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {Parameters<typeof buildAntiRegretFoundationAnalyticsPayload>[0]} input
 */
export async function emitAntiRegretFoundationAnalytics(supabase, input = {}) {
  if (!supabase) {
    return { ok: false, code: "missing_supabase_client", summary: null };
  }

  try {
    const built = buildAntiRegretFoundationAnalyticsPayload(input);
    const requestId = input.requestId ?? null;
    const decisionRequestId = input.decisionRequestId ?? requestId ?? null;

    if (!requestId || !built.summary?.foundation_valid) {
      return { ok: false, code: "ineligible_foundation", summary: built.summary };
    }
    if (!shouldEmitAntiRegretFoundationEventScoped(requestId, decisionRequestId)) {
      return { ok: false, code: "dedup_skipped", summary: built.summary };
    }

    const { error } = await supabase.from("analytics_events").insert(built.payload);
    if (error) {
      console.warn("[MIA Anti-Regret Foundation Analytics] insert failed:", {
        event: built.payload.event_name,
        code: String(error.code || "insert_error").slice(0, 80),
      });
      return {
        ok: false,
        code: "analytics_insert_failed",
        summary: built.summary,
      };
    }

    return {
      ok: true,
      event_name: built.payload.event_name,
      summary: built.summary,
    };
  } catch (err) {
    console.warn("[MIA Anti-Regret Foundation Analytics] unexpected error:", {
      message: String(err?.message || "unknown_error").slice(0, 120),
    });
    return {
      ok: false,
      code: "analytics_internal_error",
      summary: null,
    };
  }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {Parameters<typeof buildAntiRegretFoundationAnalyticsPayload>[0]} input
 */
export function scheduleAntiRegretFoundationAnalytics(supabase, input = {}) {
  void emitAntiRegretFoundationAnalytics(supabase, input).catch(() => {});
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {{
 *   decisionRequestId?: string|null,
 *   analyticsContext?: object,
 *   controlledTest?: boolean,
 * }} input
 */
export function scheduleAntiRegretFoundationFromPostDecisionSignal(supabase, input = {}) {
  const decisionRequestId = input.decisionRequestId ?? null;
  if (!supabase || !decisionRequestId) return;

  void (async () => {
    const dedupKey = buildAntiRegretFoundationDedupKey(
      decisionRequestId,
      decisionRequestId,
      MIA_ANTI_REGRET_FOUNDATION_ANALYTICS_EVENT,
      MIA_ANTI_REGRET_FOUNDATION_ANALYTICS_VERSION
    );
    if (globalDedupStore[dedupKey]) return;

    const { data: rows } = await supabase
      .from("analytics_events")
      .select("event_name,metadata")
      .eq("event_name", "mia_anti_regret_foundation")
      .eq("metadata->>decision_request_id", decisionRequestId)
      .limit(1);
    if ((rows || []).length > 0) return;

    const correlated = await fetchCorrelatedSignalsForDecision(supabase, decisionRequestId);
    if (!correlated.offerSetMetadata && !correlated.decisionMetadata) return;

    await emitAntiRegretFoundationAnalytics(supabase, {
      requestId: decisionRequestId,
      decisionRequestId,
      analyticsContext: input.analyticsContext,
      offerSetMetadata: correlated.offerSetMetadata,
      decisionMetadata: correlated.decisionMetadata,
      acceptanceSignals: correlated.acceptanceSignals,
      rejectionSignals: correlated.rejectionSignals,
      alertStage: correlated.alertStage ?? null,
      controlledTest: input.controlledTest,
      source: "post_decision_correlated",
    });
  })().catch(() => {});
}

async function fetchCorrelatedSignalsForDecision(supabase, decisionRequestId) {
  if (!supabase || !decisionRequestId) {
    return { acceptanceSignals: [], rejectionSignals: [], offerSetMetadata: null, decisionMetadata: null };
  }

  try {
    const { data: rows } = await supabase
      .from("analytics_events")
      .select("event_name,metadata,created_at")
      .in("event_name", [
        "mia_recommendation_acceptance_signal",
        "mia_recommendation_rejection_signal",
        "mia_offer_set",
        "mia_recommendation_decision",
        "mia_price_alert_lifecycle",
      ])
      .or(
        `metadata->>request_id.eq.${decisionRequestId},metadata->>decision_request_id.eq.${decisionRequestId}`
      )
      .order("created_at", { ascending: true })
      .limit(40);

    const acceptanceSignals = [];
    const rejectionSignals = [];
    let offerSetMetadata = null;
    let decisionMetadata = null;
    let alertStage = null;

    for (const row of rows || []) {
      const meta = row.metadata || {};
      if (row.event_name === "mia_recommendation_acceptance_signal") {
        acceptanceSignals.push(meta);
      } else if (row.event_name === "mia_recommendation_rejection_signal") {
        rejectionSignals.push(meta);
      } else if (row.event_name === "mia_offer_set" && meta.request_id === decisionRequestId) {
        offerSetMetadata = meta;
      } else if (
        row.event_name === "mia_recommendation_decision" &&
        meta.request_id === decisionRequestId
      ) {
        decisionMetadata = meta;
      } else if (
        row.event_name === "mia_price_alert_lifecycle" &&
        meta.decision_request_id === decisionRequestId
      ) {
        alertStage = meta.lifecycle_stage ?? alertStage;
      }
    }

    return { acceptanceSignals, rejectionSignals, offerSetMetadata, decisionMetadata, alertStage };
  } catch {
    return {
      acceptanceSignals: [],
      rejectionSignals: [],
      offerSetMetadata: null,
      decisionMetadata: null,
      alertStage: null,
    };
  }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {{
 *   requestId?: string|null,
 *   analyticsContext?: object,
 *   offerSetMetadata?: Record<string, unknown>|null,
 *   decisionMetadata?: Record<string, unknown>|null,
 *   decisionSummary?: Record<string, unknown>|null,
 *   controlledTest?: boolean,
 * }} input
 */
export function instrumentAntiRegretFoundationFromOfferSet(supabase, input = {}) {
  if (!input.offerSetMetadata || typeof input.offerSetMetadata !== "object") return null;

  const requestId = input.requestId ?? null;
  const winnerPresent = input.offerSetMetadata.winner_present === true;
  const sampleCount = Number(input.offerSetMetadata.price_sample_count) || 0;
  if (!requestId || (!winnerPresent && sampleCount <= 0)) return null;

  const built = buildAntiRegretFoundationAnalyticsPayload({
    requestId,
    decisionRequestId: requestId,
    analyticsContext: input.analyticsContext,
    offerSetMetadata: input.offerSetMetadata,
    decisionMetadata: input.decisionMetadata,
    decisionSummary: input.decisionSummary,
    controlledTest: input.controlledTest,
    source: "offer_set_derived",
  });
  if (!built.summary?.foundation_valid) return null;

  scheduleAntiRegretFoundationAnalytics(supabase, {
    requestId,
    decisionRequestId: requestId,
    analyticsContext: input.analyticsContext,
    offerSetMetadata: input.offerSetMetadata,
    decisionMetadata: input.decisionMetadata,
    decisionSummary: input.decisionSummary,
    controlledTest: input.controlledTest,
    source: "offer_set_derived",
  });

  return built.summary;
}

export {
  MIA_ANTI_REGRET_SIGNAL_POLARITY,
  MIA_ANTI_REGRET_SIGNAL_SOURCE,
  MIA_ANTI_REGRET_CONFIDENCE,
  MIA_ANTI_REGRET_OBSERVED_PATTERN,
} from "./miaAntiRegretFoundationCatalog.js";

export {
  buildAntiRegretFoundationMetadata,
  collectObservationalSignals,
  computeAntiRegretScoreFromSignals,
  detectObjectiveConflicts,
  mapPostDecisionSignals,
  resolveAntiRegretConfidence,
  resolveObservedPattern,
} from "./miaAntiRegretFoundationClassifier.js";

// Re-export for tests — price intel helper used internally
export { buildPriceIntelligenceFromOfferSetMetadata } from "./miaPriceIntelligenceClassifier.js";
