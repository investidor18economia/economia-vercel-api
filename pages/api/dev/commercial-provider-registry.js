/**
 * PATCH Comercial 4B — endpoint DEV do Commercial Provider Registry
 *
 * Não usado pela MIA. Bloqueado em production sem DEV_API_SECRET.
 */

import {
  COMMERCIAL_PROVIDER_REGISTRY_VERSION,
  getCommercialProviderRegistrySummary,
} from "../../../lib/productSourceAdapter/commercialProviderRegistry.js";

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

  const summary = getCommercialProviderRegistrySummary();

  return res.status(200).json({
    ok: true,
    registryVersion: COMMERCIAL_PROVIDER_REGISTRY_VERSION,
    count: summary.count,
    enabledCount: summary.enabledCount,
    providers: summary.providers,
    enabledProviders: summary.enabledProviders,
  });
}
