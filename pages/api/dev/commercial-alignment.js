/**
 * PATCH Comercial 4D-A — endpoint DEV do Commercial Query/Product Alignment
 *
 * Não usado pela MIA. Bloqueado em production sem DEV_API_SECRET.
 */

import { fetchGoogleShoppingAdapterResult } from "../../../lib/productSourceAdapter/adapters/googleShoppingAdapter.js";
import { searchApifyMercadoLivreProducts } from "../../../lib/productSourceAdapter/adapters/apifyMercadoLivreClient.js";
import {
  clampMergeLimitPerProvider,
  mergeCommercialOfferBundle,
} from "../../../lib/productSourceAdapter/commercialOfferMergeLayer.js";
import { deduplicateCommercialOfferBundle } from "../../../lib/productSourceAdapter/commercialDeduplicationLayer.js";
import {
  COMMERCIAL_QUERY_PRODUCT_ALIGNMENT_VERSION,
  alignCommercialOffersForQuery,
} from "../../../lib/productSourceAdapter/commercialQueryProductAlignmentLayer.js";
import { selectCommercialOffers } from "../../../lib/productSourceAdapter/commercialSelectionEngine.js";

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
      alignmentVersion: COMMERCIAL_QUERY_PRODUCT_ALIGNMENT_VERSION,
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
    const aligned = alignCommercialOffersForQuery(query, deduped.offers);
    const selection = selectCommercialOffers({ query, offers: deduped.offers });
    const ok = !!selection.selectedOffer;

    return res.status(ok ? 200 : 502).json({
      ok,
      alignmentVersion: COMMERCIAL_QUERY_PRODUCT_ALIGNMENT_VERSION,
      query,
      limitPerProvider: limit,
      selectedOffer: selection.selectedOffer,
      alternativeOffers: selection.alternativeOffers,
      offerCount: deduped.offers.length,
      alignmentDiagnostics: {
        alignedCount: aligned.filter((entry) => entry.alignment?.isAligned).length,
        misalignedCount: aligned.filter((entry) => entry.alignment && !entry.alignment.isAligned)
          .length,
        preservedAmbiguousCount: aligned.filter(
          (entry) => entry.alignment?.confidence === "low"
        ).length,
      },
      offers: aligned.map((entry) => ({
        ...entry.offer,
        alignment: entry.alignment,
        selectionAdjustment: entry.selectionAdjustment,
      })),
      selectionDiagnostics: selection.diagnostics,
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
      error: "alignment_dev_error",
      message: String(err?.message || "provider_error"),
      alignmentVersion: COMMERCIAL_QUERY_PRODUCT_ALIGNMENT_VERSION,
    });
  }
}
