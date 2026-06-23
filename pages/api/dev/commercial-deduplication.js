/**
 * PATCH Comercial 4C-B — endpoint DEV do Commercial Deduplication Layer
 *
 * Não usado pela MIA. Bloqueado em production sem DEV_API_SECRET.
 */

import { fetchGoogleShoppingAdapterResult } from "../../../lib/productSourceAdapter/adapters/googleShoppingAdapter.js";
import { searchApifyMercadoLivreProducts } from "../../../lib/productSourceAdapter/adapters/apifyMercadoLivreClient.js";
import {
  clampMergeLimitPerProvider,
  mergeCommercialOfferBundle,
} from "../../../lib/productSourceAdapter/commercialOfferMergeLayer.js";
import {
  COMMERCIAL_DEDUPLICATION_LAYER_VERSION,
  deduplicateCommercialOfferBundle,
} from "../../../lib/productSourceAdapter/commercialDeduplicationLayer.js";

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
  const limit = clampMergeLimitPerProvider(
    Number.parseInt(String(req.query.limit || "5"), 10)
  );

  if (!query) {
    return res.status(400).json({
      ok: false,
      error: "missing_query",
      hint: "Use ?q=termo&limit=5",
      deduplicationVersion: COMMERCIAL_DEDUPLICATION_LAYER_VERSION,
    });
  }

  try {
    const [googleResult, apifyResult] = await Promise.all([
      fetchGoogleShoppingAdapterResult({ query, limit }),
      searchApifyMercadoLivreProducts(query, limit),
    ]);

    const merged = mergeCommercialOfferBundle({
      googleShoppingOffers: (googleResult.products || []).slice(0, limit),
      apifyMercadoLivreOffers: (apifyResult.products || []).slice(0, limit),
    });

    const deduped = deduplicateCommercialOfferBundle(merged.offers);
    const ok = deduped.offers.length > 0;

    return res.status(ok ? 200 : 502).json({
      ok,
      deduplicationVersion: COMMERCIAL_DEDUPLICATION_LAYER_VERSION,
      query,
      limitPerProvider: limit,
      beforeCount: deduped.diagnostics.beforeCount,
      afterCount: deduped.diagnostics.afterCount,
      duplicatesRemoved: deduped.diagnostics.duplicatesRemoved,
      variantFiltered: deduped.diagnostics.variantFiltered,
      removedTotal: deduped.diagnostics.removedTotal,
      providersUsed: merged.providersUsed,
      offers: deduped.offers,
      mergedOffers: merged.offers,
      providerResults: {
        google_shopping: {
          ok: googleResult.ok,
          error: googleResult.error || null,
          count: googleResult.count || 0,
        },
        apify_mercadolivre: {
          ok: apifyResult.ok,
          error: apifyResult.error || null,
          count: apifyResult.count || 0,
        },
      },
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "deduplication_dev_error",
      message: String(err?.message || "provider_error"),
      deduplicationVersion: COMMERCIAL_DEDUPLICATION_LAYER_VERSION,
    });
  }
}
