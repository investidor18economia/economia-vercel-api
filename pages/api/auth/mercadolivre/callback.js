/**
 * PATCH Comercial 05J.4 — callback OAuth Mercado Livre (secure, no token exposure)
 */

import { processMercadoLivreOAuthCallback } from "../../../../lib/productSourceAdapter/adapters/mercadoLivreOAuth.js";
import { withMiaObservability } from "../../../../lib/miaObservability.js";
import { logAudit } from "../../../../lib/miaLogger.js";

async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, errorCode: "method_not_allowed" });
  }

  const result = await processMercadoLivreOAuthCallback({
    env: process.env,
    query: req.query,
    cookieHeader: req.headers.cookie || "",
  });

  for (const [headerName, headerValue] of Object.entries(result.headers || {})) {
    if (headerValue != null) res.setHeader(headerName, headerValue);
  }

  logAudit({
    event: "oauth_callback",
    reasonCode: result.body?.errorCode || (result.body?.ok ? "oauth_callback_ok" : "oauth_callback_failed"),
    operation: "mercadolivre_oauth_callback",
    status: result.statusCode,
  });

  return res.status(result.statusCode).json(result.body);
}

export default withMiaObservability(handler, { endpoint: "/api/auth/mercadolivre/callback" });
