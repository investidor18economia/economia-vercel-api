/**
 * PATCH 9 — Price Alert Delivery Audit Logs
 *
 * Observabilidade interna de dry run, send gate, cron, e2e e admin test.
 * Side-effect não bloqueante; nunca expõe secrets.
 */

import { parseNumericPrice } from "./productSourceAdapter/normalizeProduct.js";
import {
  getSupabaseAdminClient,
  getSupabaseAdminConfigError,
} from "./supabaseClient.js";

export const MIA_PRICE_ALERT_DELIVERY_LOGS_VERSION = "9.0.0";

export const PRICE_ALERT_DELIVERY_EVENTS = Object.freeze({
  DRY_RUN_STARTED: "dry_run_started",
  DRY_RUN_ALERT_CHECKED: "dry_run_alert_checked",
  DRY_RUN_OFFER_NOT_FOUND: "dry_run_offer_not_found",
  DRY_RUN_PROVIDER_ERROR: "dry_run_provider_error",
  DRY_RUN_COMPLETED: "dry_run_completed",

  SEND_GATE_ALERT_CHECKED: "send_gate_alert_checked",
  SEND_GATE_EMAIL_ATTEMPTED: "send_gate_email_attempted",
  SEND_GATE_EMAIL_SENT: "send_gate_email_sent",
  SEND_GATE_EMAIL_FAILED: "send_gate_email_failed",
  SEND_GATE_EMAIL_SKIPPED: "send_gate_email_skipped",
  SEND_GATE_ANTISPAM_BLOCKED: "send_gate_antispam_blocked",

  CRON_STARTED: "cron_started",
  CRON_SEND_DISABLED: "cron_send_disabled",
  CRON_COMPLETED: "cron_completed",
  CRON_FAILED: "cron_failed",

  E2E_VALIDATE_RUN: "e2e_validate_run",
  E2E_CONTROLLED_SEND_SENT: "e2e_controlled_send_sent",
  E2E_CONTROLLED_SEND_FAILED: "e2e_controlled_send_failed",

  ADMIN_TEST_VALIDATE_RUN: "admin_test_validate_run",
  ADMIN_TEST_MOCK_RUN: "admin_test_mock_run",
  ADMIN_TEST_CONTROLLED_SEND_SENT: "admin_test_controlled_send_sent",
  ADMIN_TEST_CONTROLLED_SEND_FAILED: "admin_test_controlled_send_failed",
});

const FORBIDDEN_METADATA_KEYS = new Set([
  "user_email",
  "email",
  "resend_api_key",
  "api_key",
  "admin_key",
  "cron_secret",
  "mia_cron_secret",
  "mia_admin_api_key",
  "password",
  "token",
  "secret",
  "authorization",
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

export function maskDeliveryLogEmail(email = "") {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return null;
  const match = normalized.match(/^(.{2}).*(@.+)$/);
  if (!match) return null;
  return `${match[1]}***${match[2]}`;
}

export function isDeliveryLogsSchemaError(error = null) {
  const message = String(error?.message || error || "").toLowerCase();
  if (message.includes("permission denied")) return false;
  return (
    (message.includes("relation") && message.includes("does not exist")) ||
    (message.includes("column") && message.includes("does not exist")) ||
    (message.includes("price_alert_delivery_logs") &&
      (message.includes("does not exist") || message.includes("not found")))
  );
}

/**
 * Delivery logs sempre usam service_role no backend (nunca anon do browser).
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} fallbackSupabase
 * @param {{ deliveryLogClient?: import("@supabase/supabase-js").SupabaseClient|null }} options
 */
export function resolveDeliveryLogSupabaseClient(fallbackSupabase, options = {}) {
  if (options.deliveryLogClient) {
    return { client: options.deliveryLogClient, errorCode: null };
  }

  const adminClient = getSupabaseAdminClient();
  if (adminClient) {
    return { client: adminClient, errorCode: null };
  }

  const configError = getSupabaseAdminConfigError();
  if (configError) {
    return { client: null, errorCode: configError };
  }

  if (fallbackSupabase) {
    return { client: fallbackSupabase, errorCode: null };
  }

  return { client: null, errorCode: "missing_supabase_client" };
}

/**
 * @param {Record<string, unknown>} event
 */
export function buildPriceAlertDeliveryLogRow(event = {}) {
  const metadata = sanitizeMetadataValue(event.metadata || {});

  if (event.maskedEmail) {
    metadata.masked_email = maskDeliveryLogEmail(String(event.maskedEmail));
  }

  return {
    alert_id: event.alertId ?? event.alert_id ?? null,
    user_id: event.userId != null ? String(event.userId) : event.user_id ?? null,
    event_type: String(event.eventType ?? event.event_type ?? "").trim(),
    severity: String(event.severity || "info").slice(0, 32),
    source: event.source != null ? String(event.source).slice(0, 80) : null,
    mode: event.mode != null ? String(event.mode).slice(0, 80) : null,
    product_name: event.productName != null ? String(event.productName).slice(0, 300) : null,
    normalized_product_key:
      event.normalizedProductKey != null
        ? String(event.normalizedProductKey).slice(0, 200)
        : null,
    target_price: parseNumericPrice(event.targetPrice ?? event.target_price),
    found_price: parseNumericPrice(event.foundPrice ?? event.found_price),
    found_source: event.foundSource != null ? String(event.foundSource).slice(0, 120) : null,
    found_url: event.foundUrl != null ? String(event.foundUrl).slice(0, 500) : null,
    email_sent: event.emailSent === true || event.email_sent === true,
    resend_result_id:
      event.resendResultId != null ? String(event.resendResultId).slice(0, 120) : null,
    reason: event.reason != null ? String(event.reason).slice(0, 200) : null,
    error_code: event.errorCode != null ? String(event.errorCode).slice(0, 120) : null,
    error_message: event.errorMessage != null ? String(event.errorMessage).slice(0, 300) : null,
    metadata: metadata || {},
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {Record<string, unknown>} event
 * @param {{ enabled?: boolean }} options
 */
export async function recordPriceAlertDeliveryLog(supabase, event = {}, options = {}) {
  if (options.enabled === false) {
    return { ok: false, code: "delivery_logs_disabled" };
  }

  const eventType = String(event.eventType ?? event.event_type ?? "").trim();
  if (!eventType) {
    return { ok: false, code: "missing_event_type" };
  }

  const { client, errorCode } = resolveDeliveryLogSupabaseClient(supabase, options);
  if (!client) {
    return { ok: false, code: errorCode || "service_role_key_missing" };
  }

  try {
    const row = buildPriceAlertDeliveryLogRow(event);
    const { error } = await client.from("price_alert_delivery_logs").insert(row);

    if (error) {
      const permissionDenied = String(error.message || "")
        .toLowerCase()
        .includes("permission denied");
      console.warn("[MIA DeliveryLog] insert failed:", {
        event: row.event_type,
        code: String(error.code || "insert_error").slice(0, 80),
        permission_denied: permissionDenied,
      });
      return {
        ok: false,
        code: permissionDenied
          ? "delivery_logs_permission_denied"
          : isDeliveryLogsSchemaError(error)
            ? "delivery_logs_schema_required"
            : "delivery_log_insert_failed",
        error: String(error.message || "insert_failed").slice(0, 160),
      };
    }

    return { ok: true, event_type: row.event_type };
  } catch (err) {
    console.warn("[MIA DeliveryLog] unexpected error:", {
      event: eventType,
      message: String(err?.message || "unknown_error").slice(0, 120),
    });
    return {
      ok: false,
      code: "delivery_log_internal_error",
      error: String(err?.message || "unknown_error").slice(0, 160),
    };
  }
}

/**
 * Side-effect não bloqueante — nunca propaga exception.
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {Record<string, unknown>} event
 * @param {{ enabled?: boolean, recordFn?: Function }} options
 */
export async function emitPriceAlertDeliveryLog(supabase, event = {}, options = {}) {
  const recordFn = options.recordFn || recordPriceAlertDeliveryLog;
  try {
    return await recordFn(supabase, event, options);
  } catch (err) {
    console.warn("[MIA DeliveryLog] emit guard:", {
      event: event.eventType || event.event_type,
      message: String(err?.message || "emit_guard").slice(0, 120),
    });
    return { ok: false, code: "delivery_log_emit_guard", error: "emit_guard" };
  }
}

/**
 * Tenta inserir delivery log e devolve trace operacional (sem propagar exception).
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {Record<string, unknown>} event
 * @param {{ enabled?: boolean, recordFn?: Function }} options
 */
export async function attemptPriceAlertDeliveryLog(supabase, event = {}, options = {}) {
  if (options.enabled === false) {
    return {
      delivery_log_attempted: false,
      delivery_log_inserted: false,
      delivery_log_error: "delivery_logs_disabled",
      result: { ok: false, code: "delivery_logs_disabled" },
    };
  }

  const { client, errorCode } = resolveDeliveryLogSupabaseClient(supabase, options);
  if (!client) {
    const code = errorCode || "service_role_key_missing";
    return {
      delivery_log_attempted: false,
      delivery_log_inserted: false,
      delivery_log_error: code,
      result: { ok: false, code },
    };
  }

  const recordFn = options.recordFn || recordPriceAlertDeliveryLog;

  try {
    const result = await recordFn(client, event, { ...options, enabled: true });
    const inserted = result?.ok === true;
    const errorText = inserted
      ? null
      : String(result?.error || result?.code || "delivery_log_insert_failed").slice(0, 200);

    if (!inserted) {
      console.warn("[MIA DeliveryLog] attempt failed:", {
        event: event.eventType || event.event_type,
        code: String(result?.code || "insert_failed").slice(0, 80),
      });
    }

    return {
      delivery_log_attempted: true,
      delivery_log_inserted: inserted,
      delivery_log_error: errorText,
      result,
    };
  } catch (err) {
    const errorText = String(err?.message || "delivery_log_internal_error").slice(0, 200);
    console.warn("[MIA DeliveryLog] attempt guard:", {
      event: event.eventType || event.event_type,
      message: errorText.slice(0, 120),
    });
    return {
      delivery_log_attempted: true,
      delivery_log_inserted: false,
      delivery_log_error: errorText,
      result: { ok: false, code: "delivery_log_internal_error", error: errorText },
    };
  }
}

/**
 * @param {Record<string, unknown>} evaluation
 */
export function resolveDryRunDeliveryEventType(evaluation = {}) {
  if (evaluation.reason === "provider_error") {
    return PRICE_ALERT_DELIVERY_EVENTS.DRY_RUN_PROVIDER_ERROR;
  }
  if (evaluation.reason === "no_trusted_offer_found") {
    return PRICE_ALERT_DELIVERY_EVENTS.DRY_RUN_OFFER_NOT_FOUND;
  }
  return PRICE_ALERT_DELIVERY_EVENTS.DRY_RUN_ALERT_CHECKED;
}

/**
 * @param {boolean} eligibleForEmail
 * @param {Record<string, unknown>} evaluation
 * @param {{ ok?: boolean, reason?: string }} antiSpam
 */
export function resolveSendGateDeliveryEventType(eligibleForEmail, evaluation = {}, antiSpam = {}) {
  if (eligibleForEmail) {
    return PRICE_ALERT_DELIVERY_EVENTS.SEND_GATE_ALERT_CHECKED;
  }
  if (evaluation.eligible_for_email === true && antiSpam.ok === false) {
    return PRICE_ALERT_DELIVERY_EVENTS.SEND_GATE_ANTISPAM_BLOCKED;
  }
  return PRICE_ALERT_DELIVERY_EVENTS.SEND_GATE_EMAIL_SKIPPED;
}

export function resolveDeliverySeverity(eventType = "", fallback = "info") {
  if (eventType.includes("failed") || eventType.includes("error")) return "error";
  if (
    eventType.includes("skipped") ||
    eventType.includes("blocked") ||
    eventType.includes("not_found") ||
    eventType.includes("disabled")
  ) {
    return "warning";
  }
  return fallback;
}
