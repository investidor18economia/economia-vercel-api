/**
 * PATCH 10.3 — Price Alert Lifecycle Analytics
 *
 * Observational only — never alters alert creation, checks, or notifications.
 */

import { assembleAnalyticsInsertRow, isAnalyticsUuid } from "./miaAnalyticsPayload.js";
import { MIA_PRICE_ALERT_LIFECYCLE_CATALOG_VERSION } from "./miaPriceAlertLifecycleCatalog.js";
import {
  buildActiveLifecycleMetadata,
  buildCheckedLifecycleMetadata,
  buildCreatedLifecycleMetadata,
  buildFailedLifecycleMetadata,
  buildNotificationLifecycleMetadata,
  buildPriceAlertLifecycleMetadata,
  buildRequestedLifecycleMetadata,
  buildTargetReachedLifecycleMetadata,
} from "./miaPriceAlertLifecycleClassifier.js";
import { MIA_ALERT_LIFECYCLE_STAGE } from "./miaPriceAlertLifecycleCatalog.js";

export const MIA_PRICE_ALERT_LIFECYCLE_ANALYTICS_VERSION =
  MIA_PRICE_ALERT_LIFECYCLE_CATALOG_VERSION;
export const MIA_PRICE_ALERT_LIFECYCLE_ANALYTICS_EVENT = "mia_price_alert_lifecycle";
export const MIA_PRICE_ALERT_LIFECYCLE_ANALYTICS_CATEGORY = "price_alert_lifecycle";
export const MIA_PRICE_ALERT_LIFECYCLE_TEST_ANALYTICS_CATEGORY = "price_alert_lifecycle_test";

const FORBIDDEN_METADATA_KEYS = new Set([
  "user_email",
  "email",
  "phone",
  "name",
  "query",
  "query_text",
  "prompt",
  "message",
  "response",
  "product_name",
  "product_title",
  "title",
  "description",
  "url",
  "link",
  "image",
  "image_url",
  "offer_url",
  "thumbnail",
  "raw_offer",
  "raw_provider_payload",
  "raw_payload",
  "email_subject",
  "email_body",
  "secret",
  "token",
  "authorization",
  "cookie",
  "headers",
  "stack",
  "stack_trace",
]);

/**
 * @param {string} alertId
 * @param {string} eventName
 * @param {string} eventVersion
 * @param {string} lifecycleStage
 * @param {string} occurrenceKey
 */
export function buildPriceAlertLifecycleDedupKey(
  alertId,
  eventName,
  eventVersion,
  lifecycleStage,
  occurrenceKey
) {
  return `${alertId || "unknown"}|${eventName}|${eventVersion}|${lifecycleStage}|${occurrenceKey || "default"}`;
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
    if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(trimmed)) return "[redacted]";
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

function shouldEmitLifecycleEvent(alertId, lifecycleStage, occurrenceKey) {
  const dedupKey = buildPriceAlertLifecycleDedupKey(
    alertId || "unknown",
    MIA_PRICE_ALERT_LIFECYCLE_ANALYTICS_EVENT,
    MIA_PRICE_ALERT_LIFECYCLE_ANALYTICS_VERSION,
    lifecycleStage || "UNKNOWN",
    occurrenceKey || "default"
  );
  if (globalDedupStore[dedupKey]) return false;
  globalDedupStore[dedupKey] = true;
  return true;
}

/**
 * @param {{
 *   metadata?: Record<string, unknown>|null,
 *   analyticsContext?: object,
 *   controlledTest?: boolean,
 * }} input
 */
export function buildPriceAlertLifecycleAnalyticsPayload(input = {}) {
  const analyticsContext = input.analyticsContext || {};
  const metadata = sanitizeMetadataValue({
    event_version: MIA_PRICE_ALERT_LIFECYCLE_ANALYTICS_VERSION,
    ...(input.metadata || {}),
  });

  const category = input.controlledTest
    ? MIA_PRICE_ALERT_LIFECYCLE_TEST_ANALYTICS_CATEGORY
    : MIA_PRICE_ALERT_LIFECYCLE_ANALYTICS_CATEGORY;

  return {
    payload: assembleAnalyticsInsertRow({
      event_name: MIA_PRICE_ALERT_LIFECYCLE_ANALYTICS_EVENT,
      visitor_id: isAnalyticsUuid(analyticsContext.visitor_id)
        ? analyticsContext.visitor_id
        : null,
      session_id: isAnalyticsUuid(analyticsContext.session_id)
        ? analyticsContext.session_id
        : null,
      conversation_id: isAnalyticsUuid(analyticsContext.conversation_id)
        ? analyticsContext.conversation_id
        : null,
      user_id: isAnalyticsUuid(metadata?.user_id)
        ? metadata.user_id
        : isAnalyticsUuid(analyticsContext.user_id)
          ? analyticsContext.user_id
          : null,
      category,
      query_text: null,
      metadata,
    }),
    summary: sanitizeMetadataValue({
      event_version: MIA_PRICE_ALERT_LIFECYCLE_ANALYTICS_VERSION,
      alert_id: metadata?.alert_id ?? null,
      lifecycle_stage: metadata?.lifecycle_stage ?? null,
      alert_status: metadata?.alert_status ?? null,
      creation_success: metadata?.creation_success ?? null,
      target_reached: metadata?.target_reached ?? null,
    }),
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {Parameters<typeof buildPriceAlertLifecycleAnalyticsPayload>[0]} input
 */
export async function emitPriceAlertLifecycleAnalytics(supabase, input = {}) {
  if (!supabase) {
    return { ok: false, code: "missing_supabase_client" };
  }

  try {
    const built = buildPriceAlertLifecycleAnalyticsPayload(input);
    const meta = built.payload.metadata || {};
    const alertId = meta.alert_id ?? null;
    const stage = meta.lifecycle_stage ?? null;
    const occurrenceKey = meta.lifecycle_occurrence_key ?? null;

    if (
      !shouldEmitLifecycleEvent(
        String(alertId || meta.user_id || "anonymous"),
        String(stage),
        String(occurrenceKey)
      )
    ) {
      return { ok: false, code: "dedup_skipped", summary: built.summary };
    }

    const { error } = await supabase.from("analytics_events").insert(built.payload);
    if (error) {
      console.warn("[MIA Price Alert Lifecycle Analytics] insert failed:", {
        stage,
        code: String(error.code || "insert_error").slice(0, 80),
      });
      return {
        ok: false,
        code: "analytics_insert_failed",
        error: String(error.message || "insert_failed").slice(0, 160),
        summary: built.summary,
      };
    }

    return { ok: true, event_name: built.payload.event_name, summary: built.summary };
  } catch (err) {
    console.warn("[MIA Price Alert Lifecycle Analytics] unexpected error:", {
      message: String(err?.message || "unknown_error").slice(0, 120),
    });
    return { ok: false, code: "analytics_internal_error" };
  }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {Parameters<typeof buildPriceAlertLifecycleAnalyticsPayload>[0]} input
 */
export function schedulePriceAlertLifecycleAnalytics(supabase, input = {}) {
  void emitPriceAlertLifecycleAnalytics(supabase, input).catch(() => {});
}

function emitStage(supabase, metadata, analyticsContext, controlledTest) {
  schedulePriceAlertLifecycleAnalytics(supabase, {
    metadata,
    analyticsContext,
    controlledTest,
  });
  return metadata;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {{
 *   body?: Record<string, unknown>,
 *   userId?: string|null,
 *   sessionId?: string|null,
 *   alertRow?: Record<string, unknown>|null,
 *   duplicate?: boolean,
 *   failed?: boolean,
 *   failureReason?: string|null,
 *   failureStage?: string|null,
 *   controlledTest?: boolean,
 * }} input
 */
export function instrumentPriceAlertLifecycleFromCreation(supabase, input = {}) {
  const analyticsContext = {
    session_id: input.sessionId ?? null,
    user_id: input.userId ?? null,
  };
  const body = input.body || {};

  emitStage(
    supabase,
    buildRequestedLifecycleMetadata(body, {
      userId: input.userId,
      sessionId: input.sessionId,
      requestAttemptId: input.requestAttemptId,
    }),
    analyticsContext,
    input.controlledTest
  );

  if (input.failed) {
    return emitStage(
      supabase,
      buildFailedLifecycleMetadata({
        userId: input.userId,
        sessionId: input.sessionId,
        failureStage: input.failureStage,
        failureReason: input.failureReason,
      }),
      analyticsContext,
      input.controlledTest
    );
  }

  const alertRow = input.alertRow || {};
  emitStage(
    supabase,
    buildCreatedLifecycleMetadata(alertRow, body, {
      userId: input.userId,
      sessionId: input.sessionId,
      duplicate: input.duplicate === true,
    }),
    analyticsContext,
    input.controlledTest
  );

  if (!input.duplicate && alertRow.id) {
    emitStage(
      supabase,
      buildActiveLifecycleMetadata(alertRow),
      analyticsContext,
      input.controlledTest
    );
  }

  return alertRow.id ?? null;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {{
 *   alert?: Record<string, unknown>,
 *   evaluation?: Record<string, unknown>,
 *   checkSource?: string|null,
 *   dryRun?: boolean,
 *   controlledTest?: boolean,
 * }} input
 */
export function instrumentPriceAlertLifecycleFromCheck(supabase, input = {}) {
  const alert = input.alert || {};
  const evaluation = input.evaluation || {};
  if (!alert.id && !evaluation.alert_id) return null;

  const analyticsContext = { user_id: alert.user_id ?? evaluation.user_id ?? null };

  emitStage(
    supabase,
    buildCheckedLifecycleMetadata(alert, evaluation, {
      checkSource: input.checkSource,
      dryRun: input.dryRun,
    }),
    analyticsContext,
    input.controlledTest
  );

  if (evaluation.eligible_for_email === true) {
    emitStage(
      supabase,
      buildTargetReachedLifecycleMetadata(alert, evaluation),
      analyticsContext,
      input.controlledTest
    );
  }

  return evaluation.alert_id ?? alert.id ?? null;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {{
 *   alert?: Record<string, unknown>,
 *   evaluation?: Record<string, unknown>,
 *   stage?: string,
 *   success?: boolean,
 *   failureReason?: string|null,
 *   attempt?: number|null,
 *   controlledTest?: boolean,
 * }} input
 */
export function instrumentPriceAlertLifecycleFromNotification(supabase, input = {}) {
  const stage = input.stage;
  if (
    !stage ||
    stage === MIA_ALERT_LIFECYCLE_STAGE.NOTIFICATION_DELIVERED
  ) {
    return null;
  }

  const alert = input.alert || {};
  const evaluation = input.evaluation || {};
  if (!alert.id) return null;

  schedulePriceAlertLifecycleAnalytics(supabase, {
    metadata: buildNotificationLifecycleMetadata(alert, evaluation, {
      stage,
      success: input.success,
      failureReason: input.failureReason,
      attempt: input.attempt,
    }),
    analyticsContext: { user_id: alert.user_id ?? null },
    controlledTest: input.controlledTest,
  });

  return alert.id;
}

export {
  MIA_ALERT_LIFECYCLE_STAGE,
  MIA_ALERT_STATUS,
  MIA_ALERT_SOURCE,
  MIA_ALERT_TARGET_REALISM,
  MIA_ALERT_CREATION_FAILURE_REASON,
  MIA_ALERT_LIFECYCLE_RESERVED,
} from "./miaPriceAlertLifecycleCatalog.js";

export {
  buildPriceAlertLifecycleMetadata,
  resolveAlertSourceFromCreateInput,
  resolveTargetRealism,
} from "./miaPriceAlertLifecycleClassifier.js";
