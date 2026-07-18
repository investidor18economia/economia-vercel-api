/**
 * PATCH 8 — Vercel Cron: Daily Price Alert Check
 */

import { supabase } from "../../../lib/supabaseClient";
import {
  MIA_PRICE_ALERT_CRON_VERSION,
  parseCronDebugFlag,
  runPriceAlertsDailyCron,
  validateCronSecret,
} from "../../../lib/miaPriceAlertCron.js";
import { withMiaObservability } from "../../../lib/miaObservability.js";
import { logAudit } from "../../../lib/miaLogger.js";

async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      cron: true,
      error: "method_not_allowed",
      version: MIA_PRICE_ALERT_CRON_VERSION,
    });
  }

  const auth = validateCronSecret(req);
  if (!auth.ok) {
    logAudit({
      event: "cron_rejected",
      reasonCode: auth.code || "cron_auth_invalid",
      operation: "price_alerts_daily_check",
      status: auth.status || 401,
    });
    return res.status(auth.status).json({
      ok: false,
      cron: true,
      code: auth.code,
      message: auth.error,
      version: MIA_PRICE_ALERT_CRON_VERSION,
    });
  }

  const startedAt = Date.now();
  try {
    const report = await runPriceAlertsDailyCron({
      supabase,
      debug: parseCronDebugFlag(req.query?.debug),
    });
    const status = report.ok ? 200 : report.code === "send_disabled" ? 503 : 503;
    logAudit({
      event: "cron_complete",
      reasonCode: report.code || (report.ok ? "cron_ok" : "cron_failed"),
      operation: "price_alerts_daily_check",
      status,
      durationMs: Date.now() - startedAt,
      processed: report.summary?.total_alerts_checked ?? null,
      sent: report.summary?.sent_count ?? null,
      failed: report.summary?.failed_count ?? null,
    });
    return res.status(status).json(report);
  } catch (err) {
    logAudit({
      event: "cron_failed",
      reasonCode: "cron_internal_error",
      operation: "price_alerts_daily_check",
      status: 500,
      durationMs: Date.now() - startedAt,
      message: err?.message || "unexpected_error",
    });
    return res.status(500).json({
      ok: false,
      cron: true,
      dry_run: false,
      send_mode: true,
      source: "vercel_cron",
      code: "cron_internal_error",
      message: String(err?.message || "unexpected_error").slice(0, 160),
      version: MIA_PRICE_ALERT_CRON_VERSION,
      summary: {
        total_alerts_checked: 0,
        eligible_count: 0,
        sent_count: 0,
        skipped_count: 0,
        failed_count: 0,
      },
    });
  }
}

export default withMiaObservability(handler, { endpoint: "/api/cron/price-alerts-daily-check" });
