/**
 * PATCH Comercial 05J.4 — inicia OAuth Mercado Livre (state-protected)
 */

import { buildMercadoLivreOAuthStartResult } from "../../../../lib/productSourceAdapter/adapters/mercadoLivreOAuth.js";

export default function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, errorCode: "method_not_allowed" });
  }

  const result = buildMercadoLivreOAuthStartResult({ env: process.env });

  for (const [headerName, headerValue] of Object.entries(result.headers || {})) {
    if (headerValue != null) res.setHeader(headerName, headerValue);
  }

  if (result.body) {
    return res.status(result.statusCode).json(result.body);
  }

  return res.status(result.statusCode).end();
}
