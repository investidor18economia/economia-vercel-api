/**
 * PATCH Comercial 2F — probe isolado do fluxo Mercado Livre por PRODUCT_ID
 */

import {
  isDevEndpointAllowed,
  resolveDevCommercialEndpointGuard,
} from "../../../lib/commercial/devCommercialCostGuard.js";
import {
  hasMercadoLivreAccessToken,
  probeMercadoLivreProductFlow,
  redactMercadoLivreSecrets,
  validateMercadoLivreEnv,
} from "../../../lib/productSourceAdapter/adapters/mercadoLivreClient.js";

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

  const productId = String(req.query.productId || "").trim();
  const sampleLimit = Number.parseInt(String(req.query.sampleLimit || "5"), 10);

  if (!productId) {
    return res.status(400).json({
      ok: false,
      error: "missing_product_id",
      hint: "Use ?productId=MLB1234567890",
    });
  }

  const endpointGuard = resolveDevCommercialEndpointGuard(req, {
    invocationSource: "dev_mercadolivre_product_flow",
    providerId: "mercadolivre_public",
    billingTier: "free_external",
    endpoint: "mercadolivre-product-flow",
    plannedRequest: { productId, sampleLimit },
    endpointLevelDryRun: true,
  });

  if (endpointGuard.blocked) {
    return res.status(endpointGuard.statusCode).json(endpointGuard.body);
  }

  if (endpointGuard.shouldReturnDryRunResponse) {
    return res.status(200).json({
      ...endpointGuard.body,
      hasAccessToken: hasMercadoLivreAccessToken(process.env),
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
    const probe = await probeMercadoLivreProductFlow(productId, {
      sampleLimit: Number.isFinite(sampleLimit) ? sampleLimit : 5,
    });

    const payload = {
      ...probe,
      hasAccessToken: hasMercadoLivreAccessToken(process.env),
    };

    const safeJson = redactMercadoLivreSecrets(JSON.stringify(payload), process.env);
    return res.status(probe.ok ? 200 : 502).json(JSON.parse(safeJson));
  } catch (err) {
    const message = redactMercadoLivreSecrets(String(err?.message || "provider_error"), process.env);
    return res.status(500).json({
      ok: false,
      error: "provider_error",
      message,
    });
  }
}
