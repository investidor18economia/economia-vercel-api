/**
 * PATCH Comercial 05J.4 — inicia OAuth Mercado Livre (state-protected)
 */

import { buildMercadoLivreOAuthStartResult } from "../../../../lib/productSourceAdapter/adapters/mercadoLivreOAuth.js";
import { withMiaObservability } from "../../../../lib/miaObservability.js";
import { logAudit } from "../../../../lib/miaLogger.js";

async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, errorCode: "method_not_allowed" });
  }

  const result = buildMercadoLivreOAuthStartResult({ env: process.env });

  for (const [headerName, headerValue] of Object.entries(result.headers || {})) {
    if (headerValue != null) res.setHeader(headerName, headerValue);
  }

  logAudit({
    event: "oauth_start",
    reasonCode: result.body?.errorCode || "oauth_start_ok",
    operation: "mercadolivre_oauth_start",
    status: result.statusCode,
  });

  if (result.body) {
    return res.status(result.statusCode).json(result.body);
  }

  return res.status(result.statusCode).end();
}

export default withMiaObservability(handler, { endpoint: "/api/auth/mercadolivre/start" });
