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
  if (!query) {
    return res.status(400).json({
      ok: false,
      error: "missing_query",
      hint: "Use ?q=termo",
      shadowVersion: COMMERCIAL_RUNTIME_SHADOW_VERSION,
    });
  }

  try {
    const legacyResult = await fetchGoogleShoppingLegacyResult(query, 5);
    const legacyProduct = legacyResult.products?.[0] || null;
    const legacyOffer = normalizeLegacyCommercialOfferForShadow(legacyProduct);

    const shadowExecution = await executeCommercialRuntimeShadow({
      query,
      winner: legacyProduct,
      legacyOffer: legacyProduct,
      force: true,
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
