/**
 * PATCH 4 — Admin endpoint: Real Price Alert Send (gated)
 *
 * Envio real somente com admin key + send=true + confirm_send=true + env flags.
 * Não substitui dry run. Sem agendamento automático.
 */

import { supabase } from "../../../lib/supabaseClient";
import {
  MIA_PRICE_ALERT_SEND_GATE_VERSION,
  runPriceAlertsSend,
  validateSendAuthorization,
} from "../../../lib/miaPriceAlertSendGate.js";

function parseBooleanFlag(value, defaultValue = false) {
  if (value == null || value === "") return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const auth = validateSendAuthorization(req);
  if (!auth.ok) {
    return res.status(auth.status).json({
      ok: false,
      error: auth.code,
      message: auth.error,
      dry_run: false,
      send_mode: true,
      version: MIA_PRICE_ALERT_SEND_GATE_VERSION,
    });
  }

  const querySource = req.method === "POST" ? { ...req.query, ...req.body } : req.query;
  const limit = querySource.limit;
  const alertId = querySource.alert_id || querySource.alertId || null;
  const debug = parseBooleanFlag(querySource.debug, false);

  try {
    const report = await runPriceAlertsSend({
      supabase,
      limit,
      alertId,
      debug,
    });

    return res.status(report.ok ? 200 : 503).json(report);
  } catch (err) {
    console.error("[MIA PriceAlert Send] unexpected error:", err?.message || err);
    return res.status(500).json({
      ok: false,
      dry_run: false,
      send_mode: true,
      error: "send_internal_error",
      message: String(err?.message || "unexpected_error").slice(0, 160),
      version: MIA_PRICE_ALERT_SEND_GATE_VERSION,
    });
  }
}
