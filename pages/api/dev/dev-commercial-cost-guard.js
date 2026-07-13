/**
 * PATCH Comercial 05G — DEV endpoint: DEV Commercial Cost Guard diagnostics
 *
 * Simula decisões do guard DEV. Não chama APIs externas.
 */

import {
  DEV_COMMERCIAL_COST_GUARD_VERSION,
  DEV_COMMERCIAL_REAL_EXECUTION_OPT_IN_ENV,
  buildDevCommercialCostGuardDevPayload,
  evaluateDevCommercialExecutionPermission,
  isCommercialDevRealExternalCallsEnabled,
  isDevEndpointAllowed,
} from "../../../lib/commercial/devCommercialCostGuard.js";
import { COMMERCIAL_PROVIDER_IDS } from "../../../lib/productSourceAdapter/commercialProviderRegistry.js";

function parseBoolean(value = "") {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "true" || raw === "1";
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  if (!isDevEndpointAllowed(req)) {
    return res.status(403).json({
      ok: false,
      error: "forbidden_in_production",
      safetyMessage: "Endpoint DEV bloqueado em produção sem DEV_API_SECRET válido.",
    });
  }

  const providerId = String(req.query.provider || COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING).trim();
  const scenario = String(req.query.scenario || "dev_default").trim().toLowerCase();
  const billingTier = String(req.query.billingTier || "").trim();
  const environment =
    scenario === "production"
      ? "production"
      : process.env.NODE_ENV || "development";

  const env = { ...process.env };
  if (parseBoolean(req.query.envOptIn)) {
    env[DEV_COMMERCIAL_REAL_EXECUTION_OPT_IN_ENV] = "true";
  } else if (scenario === "dev_no_opt_in") {
    env[DEV_COMMERCIAL_REAL_EXECUTION_OPT_IN_ENV] = "false";
  }

  const requestOptIn =
    parseBoolean(req.query.requestOptIn) || parseBoolean(req.query.real);

  const permission = evaluateDevCommercialExecutionPermission({
    req,
    env,
    environment,
    providerId,
    billingTier: billingTier || undefined,
    invocationSource:
      scenario === "manual_script" ? "manual_script" : "dev_dev_commercial_cost_guard",
    isDevEndpoint: scenario !== "manual_script" && scenario !== "production_functional",
    isManualAudit: scenario === "manual_script",
    isSyntheticTest: scenario === "internal_synthetic" || billingTier === "internal",
    isTestEndpoint: scenario === "test_endpoint",
    requestOptIn,
    devGuardApplies: scenario !== "production_functional",
  });

  return res.status(200).json({
    ok: true,
    version: DEV_COMMERCIAL_COST_GUARD_VERSION,
    callsExternalApis: false,
    scenario,
    providerId,
    billingTier: permission.billingTier,
    environment,
    envOptInEnv: DEV_COMMERCIAL_REAL_EXECUTION_OPT_IN_ENV,
    envOptInEnabled: isCommercialDevRealExternalCallsEnabled(env),
    requestOptIn,
    devSecretValid: permission.hasDevSecret,
    decision: buildDevCommercialCostGuardDevPayload(permission),
  });
}
