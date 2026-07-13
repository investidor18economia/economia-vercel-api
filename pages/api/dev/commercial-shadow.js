/**
 * PATCH Comercial 4E-A — endpoint DEV do Commercial Runtime Shadow
 *
 * Não usado pela MIA. Bloqueado em production sem DEV_API_SECRET.
 */

import { fetchGoogleShoppingLegacyResult } from "../../../lib/productSourceAdapter/adapters/googleShoppingAdapter.js";
import {
  COMMERCIAL_RUNTIME_SHADOW_VERSION,
  buildCommercialShadowDiagnostics,
  buildCommercialShadowPayload,
  executeCommercialRuntimeShadow,
  isCommercialRuntimeShadowEnabled,
  normalizeLegacyCommercialOfferForShadow,
} from "../../../lib/productSourceAdapter/commercialRuntimeShadow.js";
import {
  isDevEndpointAllowed,
  resolveDevCommercialEndpointGuard,
} from "../../../lib/commercial/devCommercialCostGuard.js";
import { COMMERCIAL_PROVIDER_IDS } from "../../../lib/productSourceAdapter/commercialProviderRegistry.js";

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
  if (!query) {
    return res.status(400).json({
      ok: false,
      error: "missing_query",
      hint: "Use ?q=termo",
      shadowVersion: COMMERCIAL_RUNTIME_SHADOW_VERSION,
    });
  }

  const endpointGuard = resolveDevCommercialEndpointGuard(req, {
    invocationSource: "dev_commercial_shadow",
    providerId: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
    endpoint: "commercial-shadow",
    plannedRequest: { query, limit: 5 },
    endpointLevelDryRun: true,
  });

  if (endpointGuard.blocked) {
    return res.status(endpointGuard.statusCode).json(endpointGuard.body);
  }

  if (endpointGuard.shouldReturnDryRunResponse) {
    return res.status(200).json({
      ...endpointGuard.body,
      shadowVersion: COMMERCIAL_RUNTIME_SHADOW_VERSION,
      shadowEnabled: isCommercialRuntimeShadowEnabled(),
      shadowPipelineSkipped: true,
      legacyOffer: null,
      shadowOffer: null,
      sameOffer: false,
    });
  }

  try {
    const costGuardContext = endpointGuard.costGuardContext;
    const legacyResult = await fetchGoogleShoppingLegacyResult(query, 5, { costGuardContext });
    const legacyProduct = legacyResult.products?.[0] || null;
    const legacyOffer = normalizeLegacyCommercialOfferForShadow(legacyProduct);

    const shadowExecution = await executeCommercialRuntimeShadow({
      query,
      winner: legacyProduct,
      legacyOffer: legacyProduct,
      force: true,
      costGuardContext,
    });

    const payload =
      shadowExecution.payload ||
      buildCommercialShadowPayload({
        query,
        winner: legacyProduct,
        legacyOffer,
        shadowOffer: null,
      });

    const diagnostics =
      shadowExecution.diagnostics || buildCommercialShadowDiagnostics(payload);

    return res.status(200).json({
      ok: true,
      shadowVersion: COMMERCIAL_RUNTIME_SHADOW_VERSION,
      shadowEnabled: isCommercialRuntimeShadowEnabled(),
      sameOffer: payload.sameOffer,
      legacyOffer: payload.legacyOffer,
      shadowOffer: payload.shadowOffer,
      diagnostics,
      legacyProviderResult: {
        ok: legacyResult.ok,
        count: legacyResult.products?.length || 0,
        error: legacyResult.error || null,
      },
      shadowPipeline: shadowExecution.pipelineResult
        ? {
            ok: shadowExecution.pipelineResult.ok,
            offerCount: shadowExecution.pipelineResult.offerCount,
            error: shadowExecution.pipelineResult.error || null,
          }
        : null,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "commercial_shadow_dev_error",
      message: String(err?.message || "shadow_error").slice(0, 120),
      shadowVersion: COMMERCIAL_RUNTIME_SHADOW_VERSION,
    });
  }
}
