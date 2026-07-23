/**
 * PATCH 9.2 — Recommendation Acceptance Signal Analytics
 *
 * Observational derived layer — never alters decisions or user behavior.
 */

import { assembleAnalyticsInsertRow, isAnalyticsUuid } from "./miaAnalyticsPayload.js";
import { shouldEnterCommercialSearchAnalyticsDomain } from "./miaCommercialSearchClassifier.js";
import { MIA_RECOMMENDATION_ACCEPTANCE_CATALOG_VERSION } from "./miaRecommendationAcceptanceCatalog.js";
import {
  classifyAcceptanceSignalFromClientEvent,
  classifyAcceptanceSignalFromFollowUp,
} from "./miaRecommendationAcceptanceClassifier.js";
import {
  classifyAcceptanceTimeBucket,
  computeSecondsSinceDecision,
  resolveAcceptanceCorrelation,
} from "./miaRecommendationAcceptanceCorrelation.js";
import {
  buildAcceptanceSignalDedupKey,
  createAcceptanceSignalDedupStore,
  markAcceptanceSignalDedup,
} from "./miaRecommendationAcceptanceTracker.js";

export const MIA_RECOMMENDATION_ACCEPTANCE_ANALYTICS_VERSION =
  MIA_RECOMMENDATION_ACCEPTANCE_CATALOG_VERSION;
export const MIA_RECOMMENDATION_ACCEPTANCE_ANALYTICS_EVENT =
  "mia_recommendation_acceptance_signal";
export const MIA_RECOMMENDATION_ACCEPTANCE_ANALYTICS_CATEGORY =
  "recommendation_acceptance_signal";
export const MIA_RECOMMENDATION_ACCEPTANCE_TEST_ANALYTICS_CATEGORY =
  "recommendation_acceptance_signal_test";

const globalDedupStore = createAcceptanceSignalDedupStore();

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
  "message",
  "reply",
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

/**
 * @param {object} input
 */
export function buildAcceptanceSignalMetadata(input = {}) {
  const correlation = resolveAcceptanceCorrelation(input.decisionRequestId, {
    sessionLinked: !!input.sessionId,
    productLinked: !!input.productFamilyHash,
  });

  const secondsSinceDecision = computeSecondsSinceDecision(
    input.decisionAtMs,
    input.signalAtMs
  );
  const timeBucket = classifyAcceptanceTimeBucket(secondsSinceDecision, input.sameSession !== false);

  const signalValid =
    !!input.signalObserved &&
    correlation.correlation_confidence !== "UNRESOLVED" &&
    !!input.signalType;

  return sanitizeMetadataValue({
    event_version: MIA_RECOMMENDATION_ACCEPTANCE_ANALYTICS_VERSION,
    request_id: input.requestId ?? input.decisionRequestId ?? null,
    decision_request_id: correlation.decision_request_id,
    signal_type: input.signalType ?? null,
    signal_strength: input.signalStrength ?? null,
    signal_source: input.signalSource ?? null,
    signal_target: input.signalTarget ?? null,
    signal_observed: input.signalObserved !== false,
    correlation_method: correlation.correlation_method,
    correlation_confidence: correlation.correlation_confidence,
    decision_source: input.decisionSource ?? null,
    decision_event_version: input.decisionEventVersion ?? "9.1.0",
    product_family_hash: input.productFamilyHash ?? null,
    offer_fingerprint: input.offerFingerprint ?? null,
    provider_id: input.providerId ?? null,
    category: input.category ?? null,
    seconds_since_decision: secondsSinceDecision,
    time_bucket: timeBucket,
    same_turn: timeBucket === "same_turn",
    same_session: input.sameSession !== false,
    acceptance_proxy:
      input.acceptanceProxy === true ||
      input.signalStrength === "WEAK" ||
      input.signalStrength === "MEDIUM",
    purchase_confirmed: input.purchaseConfirmed === true,
    signal_valid: signalValid,
    dedup_key: input.dedupKey ?? null,
    source_event_name: input.sourceEventName ?? null,
    source_event_id: input.sourceEventId ?? null,
    source: "server",
  });
}

/**
 * @param {object} input
 */
export function buildAcceptanceSignalAnalyticsPayload(input = {}) {
  const metadata = buildAcceptanceSignalMetadata(input);
  const analyticsContext = input.analyticsContext || {};

  const category = input.controlledTest
    ? MIA_RECOMMENDATION_ACCEPTANCE_TEST_ANALYTICS_CATEGORY
    : MIA_RECOMMENDATION_ACCEPTANCE_ANALYTICS_CATEGORY;

  return {
    payload: assembleAnalyticsInsertRow({
      event_name: MIA_RECOMMENDATION_ACCEPTANCE_ANALYTICS_EVENT,
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
      event_version: MIA_RECOMMENDATION_ACCEPTANCE_ANALYTICS_VERSION,
      signal_type: metadata?.signal_type ?? null,
      signal_strength: metadata?.signal_strength ?? null,
      signal_target: metadata?.signal_target ?? null,
      correlation_method: metadata?.correlation_method ?? null,
      correlation_confidence: metadata?.correlation_confidence ?? null,
      decision_request_id: metadata?.decision_request_id ?? null,
      signal_valid: metadata?.signal_valid ?? false,
    }),
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {object} input
 */
export async function emitRecommendationAcceptanceSignalAnalytics(supabase, input = {}) {
  if (!supabase) {
    return { ok: false, code: "missing_supabase_client" };
  }

  try {
    const built = buildAcceptanceSignalAnalyticsPayload(input);
    const { error } = await supabase.from("analytics_events").insert(built.payload);

    if (error) {
      console.warn("[MIA Acceptance Signal Analytics] insert failed:", {
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
    console.warn("[MIA Acceptance Signal Analytics] unexpected error:", {
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
 * @param {object} input
 */
export function scheduleRecommendationAcceptanceSignalAnalytics(supabase, input = {}) {
  void emitRecommendationAcceptanceSignalAnalytics(supabase, input).catch(() => {});
}

/**
 * @param {object} input
 */
export function shouldEmitAcceptanceSignal(input = {}) {
  if (!input.signalType) return false;
  if (input.signalObserved === false) return false;
  if (input.domainAllowed === false) return false;

  const dedupKey = buildAcceptanceSignalDedupKey(
    input.decisionRequestId || input.requestId || "unknown",
    input.signalType,
    input.signalTarget || "UNKNOWN",
    input.sourceEventId || "unknown",
    MIA_RECOMMENDATION_ACCEPTANCE_ANALYTICS_VERSION
  );

  if (!input.sourceEventId) return { ok: true, dedupKey };

  const allowed = markAcceptanceSignalDedup(globalDedupStore, dedupKey);
  return { ok: allowed, dedupKey };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {object} input
 */
export function observeAcceptanceSignalAnalytics(supabase, input = {}) {
  const gate = shouldEmitAcceptanceSignal(input);
  if (!gate.ok) return null;

  const built = buildAcceptanceSignalAnalyticsPayload({
    ...input,
    dedupKey: gate.dedupKey,
  });

  scheduleRecommendationAcceptanceSignalAnalytics(supabase, {
    ...input,
    metadata: built.payload.metadata,
  });

  return built.summary;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {object} input
 */
export function observeAcceptanceSignalFromClientTrackEvent(supabase, input = {}) {
  const row = input.row || {};
  const metadata = row.metadata || {};
  const clientEventName = row.event_name || input.clientEventName || "";

  const allowedEvents = new Set([
    "mia_recommendation_shown",
    "offer_click",
    "favorite_created",
    "price_alert_created",
  ]);
  if (!allowedEvents.has(clientEventName)) return null;

  const decisionRequestId =
    metadata.decision_request_id || metadata.decisionRequestId || null;
  const decisionContext = metadata.decision_context || {};

  if (!decisionRequestId) {
    return null;
  }

  const classified = classifyAcceptanceSignalFromClientEvent(
    clientEventName,
    row,
    decisionContext
  );
  if (!classified) return null;

  const sourceEventId =
    metadata.acceptance_signal_id || metadata.signal_id || null;
  if (!sourceEventId) return null;

  return observeAcceptanceSignalAnalytics(supabase, {
    requestId: decisionRequestId,
    decisionRequestId,
    sessionId: row.session_id,
    analyticsContext: {
      visitor_id: row.visitor_id,
      session_id: row.session_id,
      conversation_id: row.conversation_id,
      user_id: row.user_id,
    },
    signalType: classified.signal_type,
    signalStrength: classified.signal_strength,
    signalSource: classified.signal_source,
    signalTarget: classified.signal_target,
    signalObserved: classified.signal_observed,
    productFamilyHash: classified.product_family_hash,
    offerFingerprint: classified.offer_fingerprint,
    providerId: classified.provider_id,
    category: classified.category,
    acceptanceProxy: classified.acceptance_proxy,
    purchaseConfirmed: classified.purchase_confirmed,
    decisionSource: decisionContext.decision_source ?? null,
    decisionEventVersion: decisionContext.decision_event_version ?? "9.1.0",
    decisionAtMs: decisionContext.decision_at_ms ?? null,
    signalAtMs: input.signalAtMs ?? Date.now(),
    sameSession: true,
    sourceEventName: clientEventName,
    sourceEventId,
    domainAllowed: true,
  });
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {object} input
 */
export function observeAcceptanceSignalFromConversationFollowUp(supabase, input = {}) {
  if (!input.commercialDomain) return null;

  const classified = classifyAcceptanceSignalFromFollowUp(
    input.followUpType,
    input
  );
  if (!classified) return null;

  const decisionRequestId = input.decisionRequestId || null;
  if (!decisionRequestId) return null;

  const sourceEventId = `follow_up:${input.followUpType}:${input.requestId || "unknown"}`;

  return observeAcceptanceSignalAnalytics(supabase, {
    requestId: input.requestId || decisionRequestId,
    decisionRequestId,
    sessionId: input.sessionId,
    analyticsContext: input.analyticsContext || {},
    signalType: classified.signal_type,
    signalStrength: classified.signal_strength,
    signalSource: classified.signal_source,
    signalTarget: classified.signal_target,
    signalObserved: classified.signal_observed,
    productFamilyHash: classified.product_family_hash,
    offerFingerprint: classified.offer_fingerprint,
    providerId: classified.provider_id,
    category: classified.category,
    acceptanceProxy: classified.acceptance_proxy,
    purchaseConfirmed: classified.purchase_confirmed,
    decisionSource: input.decisionSource ?? null,
    decisionEventVersion: input.decisionEventVersion ?? "9.1.0",
    decisionAtMs: input.decisionAtMs ?? null,
    signalAtMs: input.signalAtMs ?? Date.now(),
    sameSession: true,
    sourceEventName: "server_conversation_follow_up",
    sourceEventId,
    domainAllowed: true,
  });
}

/**
 * @param {{ commercialPermission?: string, interactionMode?: string }} [input]
 */
export function isAcceptanceAnalyticsDomainAllowed(input = {}) {
  return shouldEnterCommercialSearchAnalyticsDomain({
    commercialPermission: input.commercialPermission,
    interactionMode: input.interactionMode,
  });
}

export {
  MIA_ACCEPTANCE_SIGNAL_TYPES,
  MIA_ACCEPTANCE_SIGNAL_STRENGTHS,
  MIA_ACCEPTANCE_SIGNAL_TARGETS,
  MIA_ACCEPTANCE_SIGNAL_SOURCES,
  MIA_ACCEPTANCE_CORRELATION_METHODS,
  MIA_ACCEPTANCE_CORRELATION_CONFIDENCE,
  MIA_ACCEPTANCE_TIME_BUCKETS,
} from "./miaRecommendationAcceptanceCatalog.js";

export {
  buildAcceptanceSignalDedupKey,
  createAcceptanceSignalDedupStore,
} from "./miaRecommendationAcceptanceTracker.js";

export {
  classifyAcceptanceSignalFromClientEvent,
  classifyAcceptanceSignalFromFollowUp,
} from "./miaRecommendationAcceptanceClassifier.js";

export {
  resolveAcceptanceCorrelation,
  classifyAcceptanceTimeBucket,
  computeSecondsSinceDecision,
} from "./miaRecommendationAcceptanceCorrelation.js";
