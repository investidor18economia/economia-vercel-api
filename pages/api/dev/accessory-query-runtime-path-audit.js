/**
 * PATCH Comercial 4E-B.6-AUDIT — DEV endpoint: Accessory Query Runtime Path Audit
 *
 * Não usado pela MIA. Bloqueado em production sem DEV_API_SECRET.
 */

import {
  ACCESSORY_QUERY_RUNTIME_PATH_AUDIT_VERSION,
  auditAccessoryQueryRuntimePath,
  buildAccessoryQueryRuntimePathDevPayload,
  summarizeAccessoryQueryRuntimePathAudits,
} from "../../../lib/commercial/accessoryQueryRuntimePathAudit.js";
import { getCommercialRuntimeMode } from "../../../lib/productSourceAdapter/commercialRuntimeMode.js";

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
    res.status(403).json({
      ok: false,
      error: "forbidden_in_production",
    });
    return;
  }

  const query = String(req.query.q || "").trim();
  const mode = getCommercialRuntimeMode(req.query.mode || "controlled");

  if (!query) {
    res.status(400).json({
      ok: false,
      error: "missing_query",
      hint: "Use ?q=pelicula%20iphone%2013&mode=controlled",
      version: ACCESSORY_QUERY_RUNTIME_PATH_AUDIT_VERSION,
    });
    return;
  }

  const report = await auditAccessoryQueryRuntimePath({ query, mode });
  const payload = buildAccessoryQueryRuntimePathDevPayload(report);

  res.status(200).json({
    ok: true,
    version: ACCESSORY_QUERY_RUNTIME_PATH_AUDIT_VERSION,
    mode,
    audit: payload,
    summary: summarizeAccessoryQueryRuntimePathAudits([report]),
  });
  return;
}
