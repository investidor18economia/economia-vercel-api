/**
 * PATCH Comercial 05K — DEV endpoint: Commercial Runtime Production Freeze
 *
 * Read-only manifest/validation. Não chama APIs externas.
 */

import {
  COMMERCIAL_RUNTIME_PRODUCTION_FREEZE_VERSION,
  buildCommercialRuntimeFreezeDevPayload,
} from "../../../lib/commercial/commercialRuntimeProductionFreeze.js";
import { isDevEndpointAllowed } from "../../../lib/commercial/devCommercialCostGuard.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  if (!isDevEndpointAllowed(req)) {
    return res.status(403).json({ ok: false, error: "forbidden_in_production" });
  }

  const payload = buildCommercialRuntimeFreezeDevPayload(process.env);

  return res.status(200).json({
    ok: true,
    version: COMMERCIAL_RUNTIME_PRODUCTION_FREEZE_VERSION,
    callsExternalApis: false,
    ...payload,
  });
}
