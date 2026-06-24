/**
 * PATCH 7 — Admin endpoint: Price Alert E2E Validation
 *
 * Modos: validate | controlled-e2e
 * Fluxo oficial de validação ponta a ponta. Sem agendamento automático.
 */

import { supabase } from "../../../lib/supabaseClient";
import {
  MIA_PRICE_ALERT_E2E_VALIDATION_VERSION,
  runControlledE2eMode,
  runE2EValidateMode,
  validateMiaAdminApiKey,
} from "../../../lib/miaPriceAlertE2EValidation.js";

function resolveRequestSource(req = {}) {
  return req.method === "POST" ? { ...req.query, ...req.body } : req.query || {};
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
      version: MIA_PRICE_ALERT_E2E_VALIDATION_VERSION,
    });
  }

  const source = resolveRequestSource(req);
  const mode = String(source.mode || "validate").trim().toLowerCase();

  try {
    if (mode === "validate") {
      return res.status(200).json(await runE2EValidateMode({ supabase }));
    }

    if (mode === "controlled-e2e" || mode === "controlled_e2e") {
      const report = await runControlledE2eMode({
        source,
        supabase,
      });
      const status = report.ok
        ? 200
        : report.code === "invalid_test_email"
          ? 400
          : 403;
      return res.status(status).json(report);
    }

    return res.status(400).json({
      ok: false,
      code: "invalid_mode",
      message: "mode deve ser validate ou controlled-e2e",
      version: MIA_PRICE_ALERT_E2E_VALIDATION_VERSION,
    });
  } catch (err) {
    console.error("[MIA PriceAlert E2E] unexpected error:", err?.message || err);
    return res.status(500).json({
      ok: false,
      error: "e2e_internal_error",
      message: String(err?.message || "unexpected_error").slice(0, 160),
      version: MIA_PRICE_ALERT_E2E_VALIDATION_VERSION,
    });
  }
}
