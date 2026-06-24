/**
 * PATCH 3 — Admin endpoint: Manual Price Alert Check Dry Run
 *
 * Simula checagem de alertas. Não envia e-mail. Não chama Resend.
 */

import { supabase } from "../../../lib/supabaseClient";
import {
  MIA_PRICE_ALERT_DRY_RUN_VERSION,
  runPriceAlertsDryRun,
  validateMiaAdminApiKey,
} from "../../../lib/miaPriceAlertDryRun.js";

function parseBooleanFlag(value, defaultValue = false) {
  if (value == null || value === "") return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const auth = validateMiaAdminApiKey(req);
  if (!auth.ok) {
    return res.status(auth.status).json({
      ok: false,
      error: auth.code,
      message: auth.error,
      version: MIA_PRICE_ALERT_DRY_RUN_VERSION,
    });
  }

  const querySource = req.method === "POST" ? { ...req.query, ...req.body } : req.query;
  const limit = querySource.limit;
  const alertId = querySource.alert_id || querySource.alertId || null;
  const update = parseBooleanFlag(querySource.update, false);
  const debug = parseBooleanFlag(querySource.debug, false);

  try {
    const report = await runPriceAlertsDryRun({
      supabase,
      limit,
      alertId,
      update,
      debug,
    });

    return res.status(report.ok ? 200 : 503).json(report);
  } catch (err) {
    console.error("[MIA PriceAlert DryRun] unexpected error:", err?.message || err);
    return res.status(500).json({
      ok: false,
      dry_run: true,
      error: "dry_run_internal_error",
      message: String(err?.message || "unexpected_error").slice(0, 160),
      version: MIA_PRICE_ALERT_DRY_RUN_VERSION,
    });
  }
}
