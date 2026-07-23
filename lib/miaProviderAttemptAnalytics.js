/**
 * PATCH 8.2 — Provider Attempt Analytics
 *
 * Observational only — fire-and-forget; never alters provider pipeline decisions.
 */

import { assembleAnalyticsInsertRow, isAnalyticsUuid } from "./miaAnalyticsPayload.js";
import { getSharedRequestState } from "./miaSharedRequestState.js";
import { shouldEnterCommercialSearchAnalyticsDomain } from "./miaCommercialSearchClassifier.js";
import {
  MIA_PROVIDER_ATTEMPT_CATALOG_VERSION,
  MIA_PROVIDER_EXECUTION_PATHS,
  MIA_PROVIDER_RUNTIME_MODES,
} from "./miaProviderAttemptCatalog.js";
import {
  resolveProviderAnalyticsRuntimeMode,
} from "./miaProviderAttemptClassifier.js";
import { normalizeProviderAttemptId } from "./miaProviderIdCatalog.js";
import {
  activateProviderAttemptAnalyticsBucket,
  applyProviderContributionFromResponse,
  buildProviderAttemptDedupKey,
  createProviderAttemptAnalyticsBucket,
  listFinalizedProviderAttemptObservations,
  markProviderAttemptObservationEmitted,
  recordProviderAttemptObservation,
} from "./miaProviderAttemptTracker.js";
import {
  materializeShadowProviderAttemptsFromConditionalExecution,
} from "./miaProviderShadowTraceAdapter.js";

export const MIA_PROVIDER_ATTEMPT_ANALYTICS_VERSION = MIA_PROVIDER_ATTEMPT_CATALOG_VERSION;
export const MIA_PROVIDER_ATTEMPT_ANALYTICS_EVENT = "mia_provider_attempt";
export const MIA_PROVIDER_ATTEMPT_ANALYTICS_CATEGORY = "provider_attempt";
export const MIA_PROVIDER_ATTEMPT_TEST_ANALYTICS_CATEGORY = "provider_attempt_test";

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
]);

function sanitizeMetadataValue(value, depth = 0) {
  if (depth > 4) return null;
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const trimmed = value.slice(0, 500);
    if (/bearer\s+/i.test(trimmed)) return "[redacted]";
    if (/api[_-]?key/i.test(trimmed)) return "[redacted]";
    if (/secret/i.test(trimmed)) return "[redacted]";
    return trimmed;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeMetadataValue(item, depth + 1));
  }
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

function getProviderAttemptAnalyticsBucket() {
  const sharedState = getSharedRequestState();
  if (!sharedState) return null;
  if (!sharedState.providerAttemptAnalytics) {
    sharedState.providerAttemptAnalytics = createProviderAttemptAnalyticsBucket({
      requestId: sharedState.requestId || null,
      analyticsContext: sharedState.responseAnalytics?.analyticsContext || {},
      endpoint: sharedState.analyticsContext?.endpoint || "/api/chat-gpt4o",
    });
  }
  return sharedState.providerAttemptAnalytics;
}

function sharedStateDedupStore() {
  const sharedState = getSharedRequestState();
  if (!sharedState) return {};
  if (!sharedState.providerAttemptAnalyticsDedup) {
    sharedState.providerAttemptAnalyticsDedup = {};
  }
  return sharedState.providerAttemptAnalyticsDedup;
}

function shouldEmitProviderAttemptEvent(observation) {
  if (!observation?.dedupKey) return false;
  const store = sharedStateDedupStore();
  if (store[observation.dedupKey]) return false;
  store[observation.dedupKey] = true;
  return true;
}

/**
 * @param {{ commercialPermission?: string, interactionMode?: string }} [input]
 */
export function initializeProviderAttemptAnalyticsTracking(input = {}) {
  const bucket = getProviderAttemptAnalyticsBucket();
  if (!bucket) return null;

  const allowed = shouldEnterCommercialSearchAnalyticsDomain({
    commercialPermission: input.commercialPermission,
    interactionMode: input.interactionMode,
  });
  if (!allowed) return bucket;

  bucket.requestId = input.requestId ?? bucket.requestId;
  bucket.analyticsContext =
    input.analyticsContext || bucket.analyticsContext || {};
  activateProviderAttemptAnalyticsBucket(bucket);
  return bucket;
}

/**
 * @param {object} input
 */
export function observeLegacyProviderAttempt(input = {}) {
  const bucket = getProviderAttemptAnalyticsBucket();
  if (!bucket?.active) return null;

  return recordProviderAttemptObservation(bucket, {
    ...input,
    eventName: MIA_PROVIDER_ATTEMPT_ANALYTICS_EVENT,
    eventVersion: MIA_PROVIDER_ATTEMPT_ANALYTICS_VERSION,
    runtimeMode: input.runtimeMode || resolveProviderAnalyticsRuntimeMode(),
    executionPath: input.executionPath || MIA_PROVIDER_EXECUTION_PATHS.LEGACY_CHAIN,
    providerId: normalizeProviderAttemptId(input.providerId),
  });
}

/**
 * @param {object} input
 */
export function observeConditionalProviderAttempt(input = {}) {
  const bucket = getProviderAttemptAnalyticsBucket();
  if (!bucket?.active) return null;

  return recordProviderAttemptObservation(bucket, {
    ...input,
    eventName: MIA_PROVIDER_ATTEMPT_ANALYTICS_EVENT,
    eventVersion: MIA_PROVIDER_ATTEMPT_ANALYTICS_VERSION,
    runtimeMode: input.runtimeMode || resolveProviderAnalyticsRuntimeMode(),
    executionPath:
      input.executionPath || MIA_PROVIDER_EXECUTION_PATHS.CONTROLLED_MULTI_PROVIDER,
    providerId: normalizeProviderAttemptId(input.providerId),
  });
}

/**
 * @param {object|null|undefined} conditionalExecution
 * @param {{ runtimeMode?: string }} [context]
 */
export function observeShadowConditionalProviderExecution(conditionalExecution, context = {}) {
  const bucket = getProviderAttemptAnalyticsBucket();
  if (!bucket?.active) return [];

  const observations = materializeShadowProviderAttemptsFromConditionalExecution(
    conditionalExecution
  );
  return observations.map((item) =>
    recordProviderAttemptObservation(bucket, {
      ...item,
      eventName: MIA_PROVIDER_ATTEMPT_ANALYTICS_EVENT,
      eventVersion: MIA_PROVIDER_ATTEMPT_ANALYTICS_VERSION,
      runtimeMode: context.runtimeMode || MIA_PROVIDER_RUNTIME_MODES.SHADOW,
      executionPath: MIA_PROVIDER_EXECUTION_PATHS.SHADOW_ONLY,
    })
  );
}

/**
 * @param {{
 *   requestId?: string|null,
 *   analyticsContext?: object,
 *   observation?: object,
 *   controlledTest?: boolean,
 * }} input
 */
export function buildProviderAttemptAnalyticsPayload(input = {}) {
  const analyticsContext = input.analyticsContext || {};
  const observation = input.observation || {};

  const metadata = sanitizeMetadataValue({
    event_version: MIA_PROVIDER_ATTEMPT_ANALYTICS_VERSION,
    request_id: input.requestId ?? null,
    provider_id: observation.providerId ?? null,
    provider_family: observation.providerFamily ?? null,
    runtime_mode: observation.runtimeMode ?? null,
    execution_path: observation.executionPath ?? null,
    attempt_index: observation.attemptIndex ?? null,
    provider_priority: observation.providerPriority ?? null,
    provider_config_status: observation.providerConfigStatus ?? null,
    attempt_status: observation.attemptStatus ?? null,
    skip_reason: observation.skipReason ?? null,
    failure_category: observation.failureCategory ?? null,
    http_status_group: observation.httpStatusGroup ?? null,
    http_status_code: observation.httpStatusCode ?? null,
    duration_ms: observation.durationMs ?? null,
    raw_results_count: observation.rawResultsCount ?? null,
    normalized_results_count: observation.normalizedResultsCount ?? null,
    post_merge_results_count: observation.postMergeResultsCount ?? null,
    post_dedup_results_count: observation.postDedupResultsCount ?? null,
    contributed_results: observation.contributedResults ?? false,
    contributed_to_final_set: observation.contributedToFinalSet ?? false,
    winner_provider: observation.winnerProvider ?? false,
    fallback_triggered: observation.fallbackTriggered ?? false,
    fallback_from_provider: observation.fallbackFromProvider ?? null,
    fallback_to_provider: observation.fallbackToProvider ?? null,
    retry_attempt: observation.retryAttempt ?? false,
    retry_index: observation.retryIndex ?? 0,
    response_usable: observation.responseUsable ?? false,
    endpoint: observation.endpoint ?? "/api/chat-gpt4o",
    source: observation.source ?? "server",
    shadow_observed: observation.shadowObserved ?? false,
  });

  const category = input.controlledTest
    ? MIA_PROVIDER_ATTEMPT_TEST_ANALYTICS_CATEGORY
    : MIA_PROVIDER_ATTEMPT_ANALYTICS_CATEGORY;

  return {
    payload: assembleAnalyticsInsertRow({
      event_name: MIA_PROVIDER_ATTEMPT_ANALYTICS_EVENT,
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
      event_version: MIA_PROVIDER_ATTEMPT_ANALYTICS_VERSION,
      provider_id: metadata?.provider_id ?? null,
      attempt_status: metadata?.attempt_status ?? null,
      runtime_mode: metadata?.runtime_mode ?? null,
      execution_path: metadata?.execution_path ?? null,
      duration_ms: metadata?.duration_ms ?? null,
      request_id: input.requestId ?? null,
    }),
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {Parameters<typeof buildProviderAttemptAnalyticsPayload>[0]} input
 */
export async function emitProviderAttemptAnalytics(supabase, input = {}) {
  if (!supabase) {
    return { ok: false, code: "missing_supabase_client" };
  }

  try {
    const built = buildProviderAttemptAnalyticsPayload(input);
    const { error } = await supabase.from("analytics_events").insert(built.payload);

    if (error) {
      console.warn("[MIA Provider Attempt Analytics] insert failed:", {
        event: built.payload.event_name,
        provider: built.payload.metadata?.provider_id,
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
    console.warn("[MIA Provider Attempt Analytics] unexpected error:", {
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
 * @param {Parameters<typeof buildProviderAttemptAnalyticsPayload>[0]} input
 */
export function scheduleProviderAttemptAnalytics(supabase, input = {}) {
  void emitProviderAttemptAnalytics(supabase, input).catch(() => {});
}

/**
 * @param {Record<string, unknown>|null|undefined} summaries
 */
export function buildProviderAttemptRecommendationMetadata(summaries = null) {
  if (!Array.isArray(summaries) || !summaries.length) return {};
  return sanitizeMetadataValue({
    provider_attempt_event_version: MIA_PROVIDER_ATTEMPT_ANALYTICS_VERSION,
    provider_attempt_count: summaries.length,
    provider_attempt_ids: summaries.map((item) => item?.provider_id).filter(Boolean),
    provider_attempt_statuses: summaries.map((item) => item?.attempt_status).filter(Boolean),
  });
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {{
 *   requestId?: string|null,
 *   analyticsContext?: object,
 *   body?: Record<string, unknown>|null,
 *   controlledTest?: boolean,
 * }} input
 */
export function instrumentProviderAttemptAnalyticsForDelivery(supabase, input = {}) {
  const bucket = getProviderAttemptAnalyticsBucket();
  if (!bucket?.active || !bucket.attempts.length) return [];

  const body = input.body && typeof input.body === "object" ? input.body : {};
  const prices = Array.isArray(body.prices) ? body.prices : [];

  applyProviderContributionFromResponse(bucket, {
    prices,
    winnerSource: prices[0]?.source || prices[0]?.provider || null,
  });

  const requestId = input.requestId || bucket.requestId || null;
  const analyticsContext = input.analyticsContext || bucket.analyticsContext || {};
  const summaries = [];

  for (const observation of listFinalizedProviderAttemptObservations(bucket)) {
    if (!shouldEmitProviderAttemptEvent(observation)) continue;

    const built = buildProviderAttemptAnalyticsPayload({
      requestId,
      analyticsContext,
      observation,
      controlledTest: input.controlledTest,
    });

    scheduleProviderAttemptAnalytics(supabase, {
      requestId,
      analyticsContext,
      observation,
      controlledTest: input.controlledTest,
    });

    markProviderAttemptObservationEmitted(observation);
    summaries.push(built.summary);
  }

  return summaries;
}

export {
  buildProviderAttemptDedupKey,
  createProviderAttemptAnalyticsBucket,
  recordProviderAttemptObservation,
  markProviderAttemptObservationEmitted,
} from "./miaProviderAttemptTracker.js";

export {
  MIA_PROVIDER_ATTEMPT_STATUSES,
  MIA_PROVIDER_FAMILIES,
  MIA_PROVIDER_RUNTIME_MODES,
  MIA_PROVIDER_EXECUTION_PATHS,
  MIA_PROVIDER_CONFIG_STATUSES,
  MIA_PROVIDER_SKIP_REASONS,
  MIA_PROVIDER_FAILURE_CATEGORIES,
  MIA_PROVIDER_HTTP_STATUS_GROUPS,
} from "./miaProviderAttemptCatalog.js";

export {
  normalizeProviderAttemptId,
  resolveProviderFamily,
  isKnownProviderAttemptId,
} from "./miaProviderIdCatalog.js";

export {
  resolveProviderAttemptStatus,
  resolveFailureCategoryFromErrorCode,
  resolveHttpStatusGroup,
  resolveSkipReason,
} from "./miaProviderAttemptClassifier.js";

export {
  materializeShadowProviderAttemptsFromConditionalExecution,
  materializeShadowProviderAttemptsFromPipelineTrace,
} from "./miaProviderShadowTraceAdapter.js";
