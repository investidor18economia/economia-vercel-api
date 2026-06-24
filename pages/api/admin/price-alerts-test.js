/**
 * PATCH 6 — Admin endpoint: Protected Price Alert Test
 *
 * Modos: validate | mock | controlled-send
 * Não altera alertas reais. Sem agendamento automático.
 */

import { supabase } from "../../../lib/supabaseClient";
import {
  MIA_PRICE_ALERT_ADMIN_TEST_VERSION,
  runAdminTestControlledSendMode,
  runAdminTestMockMode,
  runAdminTestValidateMode,
  validateMiaAdminApiKey,
} from "../../../lib/miaPriceAlertAdminTest.js";

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
      version: MIA_PRICE_ALERT_ADMIN_TEST_VERSION,
    });
  }

  const source = resolveRequestSource(req);
  const mode = String(source.mode || "validate").trim().toLowerCase();

  try {
    if (mode === "validate") {
      return res.status(200).json(await runAdminTestValidateMode({ supabase }));
    }

    if (mode === "mock") {
      return res.status(200).json(await runAdminTestMockMode({ ...source, supabase }));
    }

    if (mode === "controlled-send" || mode === "controlled_send") {
      const report = await runAdminTestControlledSendMode({
        source,
        supabase,
      });
      return res.status(report.ok ? 200 : report.code === "invalid_test_email" ? 400 : 403).json(
        report
      );
    }

    return res.status(400).json({
      ok: false,
      code: "invalid_mode",
      message: "mode deve ser validate, mock ou controlled-send",
      version: MIA_PRICE_ALERT_ADMIN_TEST_VERSION,
    });
  } catch (err) {
    console.error("[MIA PriceAlert AdminTest] unexpected error:", err?.message || err);
    return res.status(500).json({
      ok: false,
      error: "admin_test_internal_error",
      message: String(err?.message || "unexpected_error").slice(0, 160),
      version: MIA_PRICE_ALERT_ADMIN_TEST_VERSION,
    });
  }
}
