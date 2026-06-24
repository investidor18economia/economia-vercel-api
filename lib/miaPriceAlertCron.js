/**
 * PATCH 8 — Vercel Cron Daily Price Alert Check
 *
 * Autenticação de cron + limite de processamento + orquestração segura.
 * Reutiliza send gate do PATCH 4 sem bypass.
 */

import {
  hasResendApiKey,
  isSendEnvEnabled,
  runPriceAlertsSend,
} from "./miaPriceAlertSendGate.js";
import {
  PRICE_ALERT_DELIVERY_EVENTS,
  attemptPriceAlertDeliveryLog,
  emitPriceAlertDeliveryLog,
  resolveDeliverySeverity,
} from "./miaPriceAlertDeliveryLogs.js";
import { getSupabaseAdminConfigError } from "./supabaseClient.js";

export const MIA_PRICE_ALERT_CRON_VERSION = "8.0.0";
export const MIA_PRICE_ALERT_CRON_DEFAULT_LIMIT = 10;
export const MIA_PRICE_ALERT_CRON_MAX_LIMIT = 25;
export const MIA_PRICE_ALERT_CRON_SOURCE = "vercel_cron";
export const MIA_PRICE_ALERT_CRON_SCHEDULE_UTC = "0 12 * * *";
export const MIA_PRICE_ALERT_CRON_PATH = "/api/cron/price-alerts-daily-check";

export function clampCronAlertLimit(value) {
  const envLimit = process.env.MIA_PRICE_ALERT_CRON_LIMIT;
  const raw = value ?? envLimit ?? MIA_PRICE_ALERT_CRON_DEFAULT_LIMIT;
  const parsed = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return MIA_PRICE_ALERT_CRON_DEFAULT_LIMIT;
  }
  return Math.min(parsed, MIA_PRICE_ALERT_CRON_MAX_LIMIT);
}

/**
 * @param {Record<string, unknown>} req
 */
export function validateCronSecret(req = {}) {
  const configured = String(process.env.MIA_CRON_SECRET || "").trim();
  if (!configured) {
    return {
      ok: false,
      status: 503,
      code: "cron_secret_not_configured",
      error: "MIA_CRON_SECRET não configurada no ambiente",
    };
  }

  const authHeader = String(req.headers?.authorization || "").trim();
  let provided = "";

  if (authHeader.toLowerCase().startsWith("bearer ")) {
    provided = authHeader.slice(7).trim();
  }

  if (!provided) {
    const querySource =
      req.method === "POST" ? { ...(req.query || {}), ...(req.body || {}) } : req.query || {};
    provided = String(querySource.cron_secret || "").trim();
  }

  if (!provided || provided !== configured) {
    return {
      ok: false,
      status: 401,
      code: "invalid_cron_secret",
      error: "Chave de cron inválida ou ausente",
    };
  }

  return { ok: true };
}

export function parseCronDebugFlag(value) {
  if (value === true || value === 1) return true;
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function attachCronSendDisabledDeliveryDebug(response, trace, debug) {
  if (!debug) return response;

  const enriched = {
    ...response,
    delivery_log_attempted: trace.delivery_log_attempted,
    delivery_log_inserted: trace.delivery_log_inserted,
    delivery_log_error: trace.delivery_log_error,
  };

  if (trace.delivery_log_attempted && !trace.delivery_log_inserted) {
    enriched.debug_delivery_log = {
      event_type: PRICE_ALERT_DELIVERY_EVENTS.CRON_SEND_DISABLED,
      code: trace.result?.code || "delivery_log_insert_failed",
      error: trace.delivery_log_error,
    };
  }

  return enriched;
}

export async function recordCronSendDisabledDeliveryLog(options = {}) {
  if (options.deliveryLogs === false) {
    return {
      delivery_log_attempted: false,
      delivery_log_inserted: false,
      delivery_log_error: "delivery_logs_disabled",
      result: { ok: false, code: "delivery_logs_disabled" },
    };
  }

  const serviceRoleError = getSupabaseAdminConfigError();
  if (serviceRoleError && !options.deliveryLogClient && !options.recordDeliveryLog) {
    return {
      delivery_log_attempted: false,
      delivery_log_inserted: false,
      delivery_log_error: serviceRoleError,
      result: { ok: false, code: serviceRoleError },
    };
  }

  return attemptPriceAlertDeliveryLog(options.supabase, {
    eventType: PRICE_ALERT_DELIVERY_EVENTS.CRON_SEND_DISABLED,
    mode: "cron",
    source: MIA_PRICE_ALERT_CRON_SOURCE,
    severity: "warning",
    reason: "send_disabled",
    errorCode: "send_disabled",
  }, {
    recordFn: options.recordDeliveryLog,
    deliveryLogClient: options.deliveryLogClient,
    enabled: true,
  });
}

export async function buildCronSendDisabledResponse(options = {}) {
  const trace = await recordCronSendDisabledDeliveryLog(options);

  return attachCronSendDisabledDeliveryDebug(
    {
      ok: false,
      cron: true,
      dry_run: false,
      send_mode: true,
      source: MIA_PRICE_ALERT_CRON_SOURCE,
      code: "send_disabled",
      message: "MIA_PRICE_DROP_EMAIL_SEND_ENABLED is not true",
      version: MIA_PRICE_ALERT_CRON_VERSION,
      summary: {
        total_alerts_checked: 0,
        eligible_count: 0,
        sent_count: 0,
        skipped_count: 0,
        failed_count: 0,
      },
    },
    trace,
    options.debug === true
  );
}

export function buildCronMissingResendResponse() {
  return {
    ok: false,
    cron: true,
    dry_run: false,
    send_mode: true,
    source: MIA_PRICE_ALERT_CRON_SOURCE,
    code: "missing_resend_api_key",
    message: "RESEND_API_KEY is not configured",
    version: MIA_PRICE_ALERT_CRON_VERSION,
    summary: {
      total_alerts_checked: 0,
      eligible_count: 0,
      sent_count: 0,
      skipped_count: 0,
      failed_count: 0,
    },
  };
}

/**
 * @param {Record<string, unknown>} report
 */
export function formatCronDailyCheckResponse(report = {}) {
  const summary = report.summary || {};
  return {
    ok: report.ok !== false,
    cron: true,
    dry_run: false,
    send_mode: true,
    source: MIA_PRICE_ALERT_CRON_SOURCE,
    code: report.code,
    message: report.error || report.message,
    version: MIA_PRICE_ALERT_CRON_VERSION,
    send_gate_version: report.version,
    limit: report.limit,
    summary: {
      total_alerts_checked: summary.total_alerts_checked ?? 0,
      eligible_count: summary.eligible_count ?? 0,
      sent_count: summary.sent_count ?? 0,
      skipped_count: summary.skipped_count ?? 0,
      failed_count: summary.failed_count ?? 0,
    },
    results: report.results,
  };
}

/**
 * @param {{
 *   supabase: import("@supabase/supabase-js").SupabaseClient,
 *   limit?: number,
 *   fetchPipeline?: Function,
 *   sendEmail?: Function,
 *   deliveryLogs?: boolean,
 *   recordDeliveryLog?: Function,
 *   debug?: boolean,
 * }} options
 */
export async function runPriceAlertsDailyCron(options = {}) {
  async function logCronDelivery(event) {
    if (options.deliveryLogs === false || !options.supabase) return;
    await emitPriceAlertDeliveryLog(
      options.supabase,
      {
        ...event,
        mode: "cron",
        source: MIA_PRICE_ALERT_CRON_SOURCE,
        severity: event.severity || resolveDeliverySeverity(event.eventType),
      },
      { recordFn: options.recordDeliveryLog, enabled: options.deliveryLogs !== false }
    );
  }

  const limit = clampCronAlertLimit(options.limit);

  await logCronDelivery({
    eventType: PRICE_ALERT_DELIVERY_EVENTS.CRON_STARTED,
    metadata: { limit },
  });

  if (!isSendEnvEnabled()) {
    return await buildCronSendDisabledResponse(options);
  }

  if (!hasResendApiKey()) {
    await logCronDelivery({
      eventType: PRICE_ALERT_DELIVERY_EVENTS.CRON_FAILED,
      reason: "missing_resend_api_key",
      errorCode: "missing_resend_api_key",
    });
    return buildCronMissingResendResponse();
  }

  try {
    const report = await runPriceAlertsSend({
      supabase: options.supabase,
      alertLimit: limit,
      debug: false,
      analytics: true,
      deliveryLogs: options.deliveryLogs,
      deliveryLogSource: MIA_PRICE_ALERT_CRON_SOURCE,
      recordDeliveryLog: options.recordDeliveryLog,
      fetchPipeline: options.fetchPipeline,
      sendEmail: options.sendEmail,
    });

    await logCronDelivery({
      eventType: report.ok !== false ? PRICE_ALERT_DELIVERY_EVENTS.CRON_COMPLETED : PRICE_ALERT_DELIVERY_EVENTS.CRON_FAILED,
      metadata: report.summary || {},
      reason: report.code || null,
      errorCode: report.code || null,
    });

    return formatCronDailyCheckResponse({
      ...report,
      limit,
    });
  } catch (err) {
    await logCronDelivery({
      eventType: PRICE_ALERT_DELIVERY_EVENTS.CRON_FAILED,
      reason: "cron_execution_error",
      errorCode: "cron_execution_error",
      errorMessage: String(err?.message || "cron_execution_error").slice(0, 300),
    });
    throw err;
  }
}
