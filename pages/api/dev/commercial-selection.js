/**
 * PATCH Comercial 4D — endpoint DEV do Commercial Selection Engine
 *
 * Não usado pela MIA. Bloqueado em production sem DEV_API_SECRET.
 */

import { fetchGoogleShoppingAdapterResult } from "../../../lib/productSourceAdapter/adapters/googleShoppingAdapter.js";
import { searchApifyMercadoLivreProducts } from "../../../lib/productSourceAdapter/adapters/apifyMercadoLivreClient.js";
import { isDevEndpointAllowed, resolveDevCommercialEndpointGuard } from "../../../lib/commercial/devCommercialCostGuard.js";
import {
  clampMergeLimitPerProvider,
  mergeCommercialOfferBundle,
} from "../../../lib/productSourceAdapter/commercialOfferMergeLayer.js";
import { deduplicateCommercialOfferBundle } from "../../../lib/productSourceAdapter/commercialDeduplicationLayer.js";
import {
  COMMERCIAL_SELECTION_ENGINE_VERSION,
  selectCommercialOffers,
} from "../../../lib/productSourceAdapter/commercialSelectionEngine.js";

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
      selectionVersion: COMMERCIAL_SELECTION_ENGINE_VERSION,
    });
  }

  const endpointGuard = resolveDevCommercialEndpointGuard(req, {
    invocationSource: "dev_commercial_selection",
    providerId: "google_shopping",
    endpoint: "commercial-selection",
    plannedRequest: { query, limit },
    endpointLevelDryRun: true,
  });

  if (endpointGuard.blocked) {
    return res.status(endpointGuard.statusCode).json(endpointGuard.body);
  }

  if (endpointGuard.shouldReturnDryRunResponse) {
    return res.status(200).json({
      ...endpointGuard.body,
      selectionVersion: COMMERCIAL_SELECTION_ENGINE_VERSION,
      query,
      selectedOffer: null,
      offers: [],
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

    const deduped = deduplicateCommercialOfferBundle(merged.offers);
    const selection = selectCommercialOffers({ query, offers: deduped.offers });
    const ok = !!selection.selectedOffer;

    return res.status(ok ? 200 : 502).json({
      ok,
      selectionVersion: COMMERCIAL_SELECTION_ENGINE_VERSION,
      query,
      limitPerProvider: limit,
      offerCount: deduped.offers.length,
      selectedOffer: selection.selectedOffer,
      alternativeOffers: selection.alternativeOffers,
      diagnostics: {
        ...selection.diagnostics,
        mergeCount: merged.diagnostics.mergedCount,
        dedupe: deduped.diagnostics,
        providersUsed: merged.providersUsed,
      },
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
      error: "selection_dev_error",
      message: String(err?.message || "provider_error"),
      selectionVersion: COMMERCIAL_SELECTION_ENGINE_VERSION,
    });
  }
}
