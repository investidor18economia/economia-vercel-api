/**
 * PATCH Comercial 4E-B — DEV endpoint: Commercial Runtime Controlled Activation
 *
 * Não usado pela MIA. Bloqueado em production sem DEV_API_SECRET.
 */

import { fetchGoogleShoppingLegacyResult } from "../../../lib/productSourceAdapter/adapters/googleShoppingAdapter.js";
import {
  COMMERCIAL_RUNTIME_ACTIVATION_VERSION,
  buildCommercialRuntimeActivationDiagnostics,
  mapLegacyProductToCardShape,
  resolveOfficialCommercialOffer,
} from "../../../lib/productSourceAdapter/commercialRuntimeActivation.js";
import {
  buildAccessoryRuntimeEnforcementDevPayload,
} from "../../../lib/productSourceAdapter/accessoryCommercialRuntimeEnforcement.js";
import {
  COMMERCIAL_RUNTIME_MODE_VERSION,
  getCommercialRuntimeMode,
} from "../../../lib/productSourceAdapter/commercialRuntimeMode.js";
import { normalizeLegacyCommercialOfferForShadow } from "../../../lib/productSourceAdapter/commercialRuntimeShadow.js";

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
      hint: "Use ?q=termo&mode=controlled",
      modeVersion: COMMERCIAL_RUNTIME_MODE_VERSION,
      activationVersion: COMMERCIAL_RUNTIME_ACTIVATION_VERSION,
    });
  }

  const mode = getCommercialRuntimeMode(req.query.mode);

  try {
    const legacyResult = await fetchGoogleShoppingLegacyResult(query, 5);
    const legacyProduct = legacyResult.products?.[0] || null;
    const legacyCard = mapLegacyProductToCardShape(legacyProduct);

    const activation = await resolveOfficialCommercialOffer({
      query,
      legacyOffer: legacyProduct,
      winnerProduct: legacyProduct,
      mode,
    });

    const diagnostics = buildCommercialRuntimeActivationDiagnostics(activation);

    return res.status(200).json({
      ok: true,
      modeVersion: COMMERCIAL_RUNTIME_MODE_VERSION,
      activationVersion: COMMERCIAL_RUNTIME_ACTIVATION_VERSION,
      mode,
      usedNewPipeline: activation.usedNewPipeline === true,
      fallbackToLegacy: activation.fallbackToLegacy === true,
      fallbackReason: activation.fallbackReason || null,
      officialOffer: activation.officialOffer || legacyCard,
      legacyOffer: normalizeLegacyCommercialOfferForShadow(legacyProduct),
      newPipelineOffer: activation.newPipelineOffer
        ? {
            title: activation.newPipelineOffer.title,
            price: activation.newPipelineOffer.price,
            url: activation.newPipelineOffer.url,
            source: activation.newPipelineOffer.source,
          }
        : null,
      diagnostics,
      accessoryRuntimeEnforcement: buildAccessoryRuntimeEnforcementDevPayload(
        activation.accessoryRuntimeDiagnostics || {}
      ),
      legacyProviderResult: {
        ok: legacyResult.ok,
        count: legacyResult.products?.length || 0,
        error: legacyResult.error || null,
      },
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "commercial_runtime_activation_dev_error",
      message: String(err?.message || "activation_error").slice(0, 120),
      modeVersion: COMMERCIAL_RUNTIME_MODE_VERSION,
      activationVersion: COMMERCIAL_RUNTIME_ACTIVATION_VERSION,
    });
  }
}
