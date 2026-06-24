/**
 * PATCH 8 — Vercel Cron: Daily Price Alert Check
 *
 * Executa send gate do PATCH 4 1x/dia (09:00 BRT / 12:00 UTC).
 * Protegido por MIA_CRON_SECRET. Sem bypass de travas de envio.
 */

import { supabase } from "../../../lib/supabaseClient";
import {
  MIA_PRICE_ALERT_CRON_VERSION,
  parseCronDebugFlag,
  runPriceAlertsDailyCron,
  validateCronSecret,
} from "../../../lib/miaPriceAlertCron.js";

export default async function handler(req, res) {
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
    return res.status(auth.status).json({
      ok: false,
      cron: true,
      code: auth.code,
      message: auth.error,
      version: MIA_PRICE_ALERT_CRON_VERSION,
    });
  }

  try {
    const report = await runPriceAlertsDailyCron({
      supabase,
      debug: parseCronDebugFlag(req.query?.debug),
    });
    const status = report.ok ? 200 : report.code === "send_disabled" ? 503 : 503;
    return res.status(status).json(report);
  } catch (err) {
    console.error("[MIA PriceAlert Cron] unexpected error:", err?.message || err);
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
