/**
 * PATCH Comercial 4C-A — endpoint DEV do Commercial Offer Merge Layer
 *
 * Não usado pela MIA. Bloqueado em production sem DEV_API_SECRET.
 */

import { fetchGoogleShoppingAdapterResult } from "../../../lib/productSourceAdapter/adapters/googleShoppingAdapter.js";
import { searchApifyMercadoLivreProducts } from "../../../lib/productSourceAdapter/adapters/apifyMercadoLivreClient.js";
import { isDevEndpointAllowed, resolveDevCommercialEndpointGuard } from "../../../lib/commercial/devCommercialCostGuard.js";
import {
  COMMERCIAL_OFFER_MERGE_LAYER_VERSION,
  clampMergeLimitPerProvider,
  mergeCommercialOfferBundle,
} from "../../../lib/productSourceAdapter/commercialOfferMergeLayer.js";

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
      mergeVersion: COMMERCIAL_OFFER_MERGE_LAYER_VERSION,
    });
  }

  const endpointGuard = resolveDevCommercialEndpointGuard(req, {
    invocationSource: "dev_commercial_offer_merge",
    providerId: "google_shopping",
    endpoint: "commercial-offer-merge",
    plannedRequest: { query, limit },
    endpointLevelDryRun: true,
  });

  if (endpointGuard.blocked) {
    return res.status(endpointGuard.statusCode).json(endpointGuard.body);
  }

  if (endpointGuard.shouldReturnDryRunResponse) {
    return res.status(200).json({
      ...endpointGuard.body,
      mergeVersion: COMMERCIAL_OFFER_MERGE_LAYER_VERSION,
      query,
      offers: [],
      mergedCount: 0,
    });
  }

  try {
    const costGuardContext = endpointGuard.costGuardContext;
    const [googleResult, apifyResult] = await Promise.all([
      fetchGoogleShoppingAdapterResult({ query, limit, costGuardContext }),
      searchApifyMercadoLivreProducts(query, limit, { costGuardContext }),
    ]);

    const merged = mergeCommercialOfferBundle({
      googleShoppingOffers: (googleResult.products || []).slice(0, limit),
      apifyMercadoLivreOffers: (apifyResult.products || []).slice(0, limit),
    });

    const ok = merged.offers.length > 0;

    return res.status(ok ? 200 : 502).json({
      ok,
      mergeVersion: COMMERCIAL_OFFER_MERGE_LAYER_VERSION,
      query,
      limitPerProvider: limit,
      providersUsed: merged.providersUsed,
      googleCount: merged.diagnostics.googleCount,
      apifyCount: merged.diagnostics.apifyCount,
      mergedCount: merged.diagnostics.mergedCount,
      offers: merged.offers,
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
      registryValidation: merged.registryValidation,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "merge_dev_error",
      message: String(err?.message || "provider_error"),
      mergeVersion: COMMERCIAL_OFFER_MERGE_LAYER_VERSION,
    });
  }
}
