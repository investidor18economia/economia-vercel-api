/**
 * PATCH Comercial 05A — DEV endpoint: Commercial Provider Cost Audit
 *
 * Não chama APIs externas. Bloqueado em production sem DEV_API_SECRET.
 */

import {
  PROVIDER_COST_AUDIT_VERSION,
  buildCommercialProviderCostAudit,
  buildCommercialProviderCostAuditDevPayload,
  buildCommercialProviderCostAuditDiagnostics,
} from "../../../lib/commercial/providerCostAudit.js";

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
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  if (!isDevEndpointAllowed(req)) {
    res.status(403).json({ ok: false, error: "forbidden_in_production" });
    return;
  }

  const audit = buildCommercialProviderCostAudit();

  res.status(200).json({
    ok: true,
    version: PROVIDER_COST_AUDIT_VERSION,
    callsExternalApis: false,
    audit: buildCommercialProviderCostAuditDevPayload(audit),
    diagnostics: buildCommercialProviderCostAuditDiagnostics(audit),
  });
  return;
}
