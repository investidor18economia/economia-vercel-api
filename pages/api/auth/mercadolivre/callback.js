/**
 * PATCH Comercial 05J.4 — callback OAuth Mercado Livre (secure, no token exposure)
 */

import { processMercadoLivreOAuthCallback } from "../../../../lib/productSourceAdapter/adapters/mercadoLivreOAuth.js";

export default async function handler(req, res) {
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

  return res.status(result.statusCode).json(result.body);
}
