/**
 * PATCH Comercial 2B — endpoint isolado para teste manual Mercado Livre
 *
 * Não usado pela MIA. Bloqueado em production sem DEV_API_SECRET.
 */

import {
  fetchMercadoLivreAdapterResult,
} from "../../../lib/productSourceAdapter/adapters/mercadoLivreAdapter.js";
import {
  hasMercadoLivreAccessToken,
  redactMercadoLivreSecrets,
  validateMercadoLivreEnv,
} from "../../../lib/productSourceAdapter/adapters/mercadoLivreClient.js";

function isDevEndpointAllowed(req) {
  if (process.env.NODE_ENV !== "production") return true;

  const secret = String(process.env.DEV_API_SECRET || "").trim();
  if (!secret) return false;

  const provided = String(
    req.headers["x-dev-api-secret"] || req.query.secret || ""
  ).trim();

  return provided === secret;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  if (!isDevEndpointAllowed(req)) {
    return res.status(403).json({
      ok: false,
      error: "forbidden_in_production",
    });
  }

  const query = String(req.query.q || "").trim();
  const limit = Number.parseInt(String(req.query.limit || "12"), 10);
  const mode = String(req.query.mode || "items").trim().toLowerCase();

  if (!query) {
    return res.status(400).json({
      ok: false,
      error: "missing_query",
      hint: "Use ?q=termo&limit=12&mode=items|products",
    });
  }

  if (mode !== "items" && mode !== "products") {
    return res.status(400).json({
      ok: false,
      error: "invalid_mode",
      hint: "Use mode=items or mode=products",
    });
  }

  const envValidation = validateMercadoLivreEnv(process.env);
  if (!envValidation.ok) {
    return res.status(503).json({
      ok: false,
      error: "missing_env",
      missing: envValidation.missing,
    });
  }

  try {
    const result = await fetchMercadoLivreAdapterResult({
      query,
      limit: Number.isFinite(limit) ? limit : 12,
      real: true,
      realOptions: { searchMode: mode },
    });

    const payload = {
      ok: result.ok,
      provider: result.provider,
      count: result.count,
      products: result.products,
      error: result.error,
      siteId: process.env.MERCADOLIVRE_SITE_ID || "MLB",
      mode,
      searchMode: result.searchMode ?? mode,
      hasAccessToken: hasMercadoLivreAccessToken(process.env),
      httpStatus: result.httpStatus ?? null,
      httpStatusText: result.httpStatusText ?? null,
      safeErrorBodyPreview: result.safeErrorBodyPreview ?? null,
      requestUrl: result.requestUrl ?? null,
    };

    const safeJson = redactMercadoLivreSecrets(JSON.stringify(payload), process.env);
    return res.status(result.ok ? 200 : 502).json(JSON.parse(safeJson));
  } catch (err) {
    const message = redactMercadoLivreSecrets(String(err?.message || "provider_error"), process.env);
    return res.status(500).json({
      ok: false,
      error: "provider_error",
      message,
    });
  }
}
