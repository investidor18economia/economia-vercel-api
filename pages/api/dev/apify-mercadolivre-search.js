/**
 * PATCH Comercial 4A — endpoint DEV isolado Apify Mercado Livre
 *
 * Não usado pela MIA. Bloqueado em production sem DEV_API_SECRET.
 */

import {
  hasApifyMercadoLivreToken,
  redactApifyMercadoLivreSecrets,
  searchApifyMercadoLivreProducts,
  validateApifyMercadoLivreEnv,
  clampApifyMaxResults,
  APIFY_MERCADOLIVRE_SOURCE,
} from "../../../lib/productSourceAdapter/adapters/apifyMercadoLivreClient.js";

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
  const limit = clampApifyMaxResults(
    Number.parseInt(String(req.query.limit || "5"), 10)
  );

  if (!query) {
    return res.status(400).json({
      ok: false,
      error: "missing_query",
      hint: "Use ?q=termo&limit=5",
      provider: APIFY_MERCADOLIVRE_SOURCE,
      hasToken: hasApifyMercadoLivreToken(process.env),
      maxResults: limit,
    });
  }

  const envValidation = validateApifyMercadoLivreEnv(process.env);
  if (!envValidation.ok) {
    return res.status(503).json({
      ok: false,
      error: "missing_env",
      missing: envValidation.missing,
      provider: APIFY_MERCADOLIVRE_SOURCE,
      hasToken: false,
      maxResults: limit,
    });
  }

  try {
    const result = await searchApifyMercadoLivreProducts(query, limit);

    const payload = {
      ok: result.ok,
      provider: result.provider,
      count: result.count,
      products: result.products,
      error: result.error,
      hasToken: result.hasToken ?? hasApifyMercadoLivreToken(process.env),
      maxResults: result.maxResults ?? limit,
      query: result.query ?? query,
      httpStatus: result.httpStatus ?? null,
      httpStatusText: result.httpStatusText ?? null,
      safeErrorBodyPreview: result.safeErrorBodyPreview ?? null,
      requestUrl: result.requestUrl ?? null,
      rawItemCount: result.rawItemCount ?? null,
    };

    const safeJson = redactApifyMercadoLivreSecrets(JSON.stringify(payload), process.env);
    return res.status(result.ok ? 200 : 502).json(JSON.parse(safeJson));
  } catch (err) {
    const message = redactApifyMercadoLivreSecrets(
      String(err?.message || "provider_error"),
      process.env
    );
    return res.status(500).json({
      ok: false,
      error: "provider_error",
      message,
      provider: APIFY_MERCADOLIVRE_SOURCE,
      hasToken: hasApifyMercadoLivreToken(process.env),
      maxResults: limit,
    });
  }
}
