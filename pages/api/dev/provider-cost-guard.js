/**
 * PATCH Comercial 05B — DEV endpoint: Provider Cost Guard
 *
 * Simula decisões do guard. Não chama APIs externas.
 */

import {
  PROVIDER_COST_GUARD_VERSION,
  buildDevEndpointProviderCostGuardContext,
  buildFunctionalProviderCostGuardContext,
  buildObservabilityProviderCostGuardContext,
  buildProviderCostGuardDevPayload,
  evaluateProviderCostGuardForProvider,
  isPaidProviderObservabilityOptInEnabled,
  PAID_PROVIDER_OBSERVABILITY_OPT_IN_ENV,
} from "../../../lib/commercial/providerCostGuard.js";
import { COMMERCIAL_PROVIDER_IDS } from "../../../lib/productSourceAdapter/commercialProviderRegistry.js";
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

function parseBoolean(value = "") {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "true" || raw === "1";
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

  const providerId = String(req.query.provider || COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE).trim();
  const scenario = String(req.query.scenario || "observability").trim().toLowerCase();
  const runtimeMode = getCommercialRuntimeMode(req.query.mode);

  let context;
  if (scenario === "functional") {
    context = buildFunctionalProviderCostGuardContext({
      invocationSource: "dev_provider_cost_guard",
      runtimeMode,
    });
  } else if (scenario === "dev") {
    context = buildDevEndpointProviderCostGuardContext({
      invocationSource: "dev_provider_cost_guard",
      runtimeMode,
    });
  } else {
    context = buildObservabilityProviderCostGuardContext({
      invocationSource: "dev_provider_cost_guard",
      runtimeMode,
    });
  }

  if (parseBoolean(req.query.optIn)) {
    context.hasExplicitPaidProviderOptIn = true;
  }

  const decision = evaluateProviderCostGuardForProvider(providerId, context);

  res.status(200).json({
    ok: true,
    version: PROVIDER_COST_GUARD_VERSION,
    callsExternalApis: false,
    providerId,
    scenario,
    runtimeMode,
    optInEnv: PAID_PROVIDER_OBSERVABILITY_OPT_IN_ENV,
    optInEnabled: isPaidProviderObservabilityOptInEnabled(process.env),
    decision: buildProviderCostGuardDevPayload(decision),
  });
  return;
}
