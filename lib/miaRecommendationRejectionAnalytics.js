/**
 * PATCH 9.3 — Recommendation Rejection / Abandonment Signal Analytics
 *
 * Observational derived layer — never alters decisions or user behavior.
 */

import { assembleAnalyticsInsertRow, isAnalyticsUuid } from "./miaAnalyticsPayload.js";
import { shouldEnterCommercialSearchAnalyticsDomain } from "./miaCommercialSearchClassifier.js";
import { MIA_RECOMMENDATION_REJECTION_CATALOG_VERSION } from "./miaRecommendationRejectionCatalog.js";
import {
  classifyRejectionFromCognitiveTurn,
  classifyRejectionFromDecisionTransition,
  classifyRejectionFromFollowUp,
  classifyRejectionFromNewSearch,
  classifyRejectionFromSocialExit,
  finalizeRejectionSignalObservation,
} from "./miaRecommendationRejectionClassifier.js";
import {
  classifyRejectionTimeBucket,
  computeRejectionSecondsSinceDecision,
  resolveRejectionCorrelation,
} from "./miaRecommendationRejectionCorrelation.js";
import {
  buildRejectionSignalDedupKey,
  createRejectionSignalDedupStore,
  markRejectionSignalDedup,
} from "./miaRecommendationRejectionTracker.js";

export const MIA_RECOMMENDATION_REJECTION_ANALYTICS_VERSION =
  MIA_RECOMMENDATION_REJECTION_CATALOG_VERSION;
export const MIA_RECOMMENDATION_REJECTION_ANALYTICS_EVENT =
  "mia_recommendation_rejection_signal";
export const MIA_RECOMMENDATION_REJECTION_ANALYTICS_CATEGORY =
  "recommendation_rejection_signal";
export const MIA_RECOMMENDATION_REJECTION_TEST_ANALYTICS_CATEGORY =
  "recommendation_rejection_signal_test";

const globalDedupStore = createRejectionSignalDedupStore();

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
export function buildRejectionSignalMetadata(input = {}) {
  const correlation = resolveRejectionCorrelation(input.decisionRequestId, {
    sessionLinked: !!input.sessionId,
    productLinked: !!input.productFamilyHash,
    decisionTransition: input.decisionTransition === true,
    sessionLifecycle: input.sessionLifecycle === true,
  });

  const secondsSinceDecision = computeRejectionSecondsSinceDecision(
    input.decisionAtMs,
    input.signalAtMs
  );
  const timeBucket = classifyRejectionTimeBucket(
    secondsSinceDecision,
    input.sameSession !== false
  );

  const signalValid =
    !!input.signalObserved &&
    correlation.correlation_confidence !== "UNRESOLVED" &&
    !!input.signalType &&
    input.signalClass !== "INCONCLUSIVE" &&
    input.evidenceStrength !== "INCONCLUSIVE";

  return sanitizeMetadataValue({
    event_version: MIA_RECOMMENDATION_REJECTION_ANALYTICS_VERSION,
    request_id: input.requestId ?? null,
    decision_request_id: correlation.decision_request_id,
    previous_decision_request_id: input.previousDecisionRequestId ?? null,
    replacement_decision_request_id: input.replacementDecisionRequestId ?? null,
    signal_type: input.signalType ?? null,
    signal_class: input.signalClass ?? null,
    evidence_strength: input.evidenceStrength ?? null,
    signal_source: input.signalSource ?? null,
    signal_target: input.signalTarget ?? null,
    signal_reason: input.signalReason ?? null,
    signal_observed: input.signalObserved !== false,
    signal_outcome: input.signalOutcome ?? null,
    rejection_explicit: input.rejectionExplicit === true,
    refinement_present: input.refinementPresent === true,
    winner_rejected: input.winnerRejected === true,
    winner_replaced: input.winnerReplaced === true,
    alternative_requested: input.alternativeRequested === true,
    purchase_postponed: input.purchasePostponed === true,
    abandonment_observed: input.abandonmentObserved === true,
    abandonment_explicit: input.abandonmentExplicit === true,
    flow_continued: input.flowContinued ?? null,
    new_decision_created: input.newDecisionCreated === true,
    recovered_after_rejection: input.recoveredAfterRejection === true,
    correlation_method: correlation.correlation_method,
    correlation_confidence: correlation.correlation_confidence,
    decision_source: input.decisionSource ?? null,
    routing_mode: input.routingMode ?? null,
    runtime_mode: input.runtimeMode ?? null,
    product_family_hash: input.productFamilyHash ?? null,
    offer_fingerprint: input.offerFingerprint ?? null,
    provider_id: input.providerId ?? null,
    category: input.category ?? null,
    seconds_since_decision: secondsSinceDecision,
    time_bucket: timeBucket,
    same_turn: timeBucket === "same_turn",
    same_session: input.sameSession !== false,
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
export function buildRejectionSignalAnalyticsPayload(input = {}) {
  const metadata = buildRejectionSignalMetadata(input);
  const analyticsContext = input.analyticsContext || {};

  const category = input.controlledTest
    ? MIA_RECOMMENDATION_REJECTION_TEST_ANALYTICS_CATEGORY
    : MIA_RECOMMENDATION_REJECTION_ANALYTICS_CATEGORY;

  return {
    payload: assembleAnalyticsInsertRow({
      event_name: MIA_RECOMMENDATION_REJECTION_ANALYTICS_EVENT,
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
      event_version: MIA_RECOMMENDATION_REJECTION_ANALYTICS_VERSION,
      signal_type: metadata?.signal_type ?? null,
      signal_class: metadata?.signal_class ?? null,
      evidence_strength: metadata?.evidence_strength ?? null,
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
export async function emitRecommendationRejectionSignalAnalytics(supabase, input = {}) {
  if (!supabase) {
    return { ok: false, code: "missing_supabase_client" };
  }

  try {
    const built = buildRejectionSignalAnalyticsPayload(input);
    const { error } = await supabase.from("analytics_events").insert(built.payload);

    if (error) {
      console.warn("[MIA Rejection Signal Analytics] insert failed:", {
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
    console.warn("[MIA Rejection Signal Analytics] unexpected error:", {
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
export function scheduleRecommendationRejectionSignalAnalytics(supabase, input = {}) {
  void emitRecommendationRejectionSignalAnalytics(supabase, input).catch(() => {});
}

/**
 * @param {object} input
 */
export function shouldEmitRejectionSignal(input = {}) {
  if (!input.signalType) return { ok: false, dedupKey: null };
  if (input.signalObserved === false) return { ok: false, dedupKey: null };
  if (input.domainAllowed === false) return { ok: false, dedupKey: null };
  if (!input.decisionRequestId) return { ok: false, dedupKey: null };

  const dedupKey = buildRejectionSignalDedupKey(
    input.decisionRequestId,
    input.requestId || "unknown",
    input.signalType,
    input.signalTarget || "UNKNOWN",
    input.sourceEventId || "unknown",
    MIA_RECOMMENDATION_REJECTION_ANALYTICS_VERSION
  );

  if (!input.sourceEventId) return { ok: true, dedupKey };

  const allowed = markRejectionSignalDedup(globalDedupStore, dedupKey);
  return { ok: allowed, dedupKey };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {object} input
 */
export function observeRejectionSignalAnalytics(supabase, input = {}) {
  const gate = shouldEmitRejectionSignal(input);
  if (!gate.ok) return null;

  const built = buildRejectionSignalAnalyticsPayload({
    ...input,
    dedupKey: gate.dedupKey,
  });

  scheduleRecommendationRejectionSignalAnalytics(supabase, {
    ...input,
    metadata: built.payload.metadata,
  });

  return built.summary;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {object} classified
 * @param {object} input
 */
function observeClassifiedRejectionSignal(supabase, classified, input = {}) {
  if (!classified) return null;

  const finalized = finalizeRejectionSignalObservation({
    classified,
    decisionRequestId: input.decisionRequestId,
  });

  const sourceEventId =
    input.sourceEventId ||
    `rejection:${finalized.signal_type}:${input.requestId || "unknown"}`;

  return observeRejectionSignalAnalytics(supabase, {
    requestId: input.requestId || input.decisionRequestId,
    decisionRequestId: input.decisionRequestId,
    previousDecisionRequestId:
      finalized.previous_decision_request_id || input.previousDecisionRequestId || null,
    replacementDecisionRequestId:
      finalized.replacement_decision_request_id || input.replacementDecisionRequestId || null,
    sessionId: input.sessionId,
    analyticsContext: input.analyticsContext || {},
    signalType: finalized.signal_type,
    signalClass: finalized.signal_class,
    evidenceStrength: finalized.evidence_strength,
    signalSource: finalized.signal_source,
    signalTarget: finalized.signal_target,
    signalReason: finalized.signal_reason,
    signalOutcome: finalized.signal_outcome,
    signalObserved: finalized.signal_observed,
    rejectionExplicit: finalized.rejection_explicit,
    refinementPresent: finalized.refinement_present,
    winnerRejected: finalized.winner_rejected,
    winnerReplaced: finalized.winner_replaced,
    alternativeRequested: finalized.alternative_requested,
    purchasePostponed: finalized.purchase_postponed,
    abandonmentObserved: finalized.abandonment_observed,
    abandonmentExplicit: finalized.abandonment_explicit,
    flowContinued: finalized.flow_continued,
    newDecisionCreated: finalized.new_decision_created,
    recoveredAfterRejection: finalized.recovered_after_rejection,
    productFamilyHash: input.productFamilyHash ?? null,
    offerFingerprint: input.offerFingerprint ?? null,
    providerId: input.providerId ?? null,
    category: input.category ?? null,
    decisionSource: input.decisionSource ?? null,
    routingMode: input.routingMode ?? null,
    runtimeMode: input.runtimeMode ?? null,
    decisionAtMs: input.decisionAtMs ?? null,
    signalAtMs: input.signalAtMs ?? Date.now(),
    sameSession: input.sameSession !== false,
    sourceEventName: input.sourceEventName || "server_conversation",
    sourceEventId,
    decisionTransition: input.decisionTransition === true,
    sessionLifecycle: input.sessionLifecycle === true,
    domainAllowed: input.domainAllowed !== false,
  });
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {object} input
 */
export function observeRejectionSignalsFromTurnContext(supabase, input = {}) {
  if (!input.commercialDomain) return [];
  const decisionRequestId = input.decisionRequestId || null;
  if (!decisionRequestId) return [];

  const summaries = [];
  const baseInput = {
    decisionRequestId,
    requestId: input.requestId || decisionRequestId,
    sessionId: input.sessionId,
    analyticsContext: input.analyticsContext || {},
    decisionSource: input.decisionSource ?? null,
    decisionAtMs: input.decisionAtMs ?? null,
    signalAtMs: input.signalAtMs ?? Date.now(),
    productFamilyHash: input.winnerProductFamilyHash ?? null,
    category: input.category ?? null,
    routingMode: input.routingMode ?? null,
    runtimeMode: input.runtimeMode ?? null,
    commercialDomain: true,
  };

  const cognitive = classifyRejectionFromCognitiveTurn({
    turnType: input.cognitiveTurn?.turnType,
    reasons: input.cognitiveTurn?.reasons,
    normalizedQuery: input.userMessage || "",
  });
  if (cognitive) {
    const summary = observeClassifiedRejectionSignal(supabase, cognitive, {
      ...baseInput,
      sourceEventName: "server_cognitive_turn",
      sourceEventId: `cognitive:${input.cognitiveTurn?.turnType || "unknown"}:${baseInput.requestId}`,
    });
    if (summary) summaries.push(summary);
  }

  if (input.followUpType) {
    const followUp = classifyRejectionFromFollowUp(input.followUpType, {
      constraintRefinement: input.constraintRefinement,
    });
    if (followUp) {
      const summary = observeClassifiedRejectionSignal(supabase, followUp, {
        ...baseInput,
        sourceEventName: "server_conversation_follow_up",
        sourceEventId: `follow_up:${input.followUpType}:${baseInput.requestId}`,
      });
      if (summary) summaries.push(summary);
    }
  }

  const newSearch = classifyRejectionFromNewSearch({
    allowNewSearch: input.allowNewSearch,
    priorDecisionRequestId: decisionRequestId,
    refinementPresent: input.constraintRefinement?.detected === true,
  });
  if (newSearch) {
    const summary = observeClassifiedRejectionSignal(supabase, newSearch, {
      ...baseInput,
      sourceEventName: "server_new_search",
      sourceEventId: `new_search:${baseInput.requestId}`,
    });
    if (summary) summaries.push(summary);
  }

  const socialExit = classifyRejectionFromSocialExit({
    farewell: input.farewell === true,
    priorDecisionRequestId: decisionRequestId,
  });
  if (socialExit) {
    const summary = observeClassifiedRejectionSignal(supabase, socialExit, {
      ...baseInput,
      sourceEventName: "server_social_exit",
      sourceEventId: `farewell:${baseInput.requestId}`,
      sessionLifecycle: true,
    });
    if (summary) summaries.push(summary);
  }

  return summaries;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {object} input
 */
export function observeRejectionSignalFromDecisionTransition(supabase, input = {}) {
  if (!input.commercialDomain) return null;

  const classified = classifyRejectionFromDecisionTransition({
    previousDecisionRequestId: input.previousDecisionRequestId,
    replacementDecisionRequestId: input.replacementDecisionRequestId,
  });
  if (!classified) return null;

  return observeClassifiedRejectionSignal(supabase, classified, {
    decisionRequestId: input.previousDecisionRequestId,
    requestId: input.requestId || input.replacementDecisionRequestId,
    replacementDecisionRequestId: input.replacementDecisionRequestId,
    previousDecisionRequestId: input.previousDecisionRequestId,
    sessionId: input.sessionId,
    analyticsContext: input.analyticsContext || {},
    decisionSource: input.decisionSource ?? null,
    decisionAtMs: input.decisionAtMs ?? null,
    signalAtMs: input.signalAtMs ?? Date.now(),
    productFamilyHash: input.productFamilyHash ?? null,
    category: input.category ?? null,
    routingMode: input.routingMode ?? null,
    runtimeMode: input.runtimeMode ?? null,
    sourceEventName: "server_decision_transition",
    sourceEventId: `decision_transition:${input.previousDecisionRequestId}:${input.replacementDecisionRequestId}`,
    decisionTransition: true,
    commercialDomain: true,
  });
}

/**
 * @param {{ commercialPermission?: string, interactionMode?: string }} [input]
 */
export function isRejectionAnalyticsDomainAllowed(input = {}) {
  return shouldEnterCommercialSearchAnalyticsDomain({
    commercialPermission: input.commercialPermission,
    interactionMode: input.interactionMode,
  });
}

export {
  MIA_REJECTION_SIGNAL_TYPES,
  MIA_REJECTION_SIGNAL_CLASSES,
  MIA_REJECTION_EVIDENCE_STRENGTHS,
  MIA_REJECTION_SIGNAL_TARGETS,
  MIA_REJECTION_SIGNAL_REASONS,
  MIA_REJECTION_SIGNAL_OUTCOMES,
  MIA_REJECTION_SIGNAL_SOURCES,
  MIA_REJECTION_CORRELATION_METHODS,
  MIA_REJECTION_CORRELATION_CONFIDENCE,
  MIA_REJECTION_TIME_BUCKETS,
} from "./miaRecommendationRejectionCatalog.js";

export {
  buildRejectionSignalDedupKey,
  createRejectionSignalDedupStore,
} from "./miaRecommendationRejectionTracker.js";

export {
  classifyRejectionFromCognitiveTurn,
  classifyRejectionFromFollowUp,
  classifyRejectionFromNewSearch,
  classifyRejectionFromDecisionTransition,
  classifyRejectionFromSocialExit,
} from "./miaRecommendationRejectionClassifier.js";

export {
  resolveRejectionCorrelation,
  classifyRejectionTimeBucket,
  computeRejectionSecondsSinceDecision,
} from "./miaRecommendationRejectionCorrelation.js";
