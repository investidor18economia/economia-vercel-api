/**
 * PATCH Comercial 05I — DEV endpoint: Multi-Provider Priority Engine
 *
 * Simula planos de prioridade. Não chama APIs externas.
 */

import {
  MULTI_PROVIDER_PRIORITY_ENGINE_VERSION,
  buildMultiProviderPriorityDevPayload,
  buildMultiProviderPriorityPlan,
  readMultiProviderPriorityConfig,
} from "../../../lib/commercial/multiProviderPriorityEngine.js";
import {
  COMMERCIAL_PROVIDER_IDS,
  MERCADOLIVRE_COMMERCIAL_PROVIDER_ENABLED_ENV,
} from "../../../lib/productSourceAdapter/commercialProviderRegistry.js";
import { COMMERCIAL_RUNTIME_MODES } from "../../../lib/productSourceAdapter/commercialRuntimeMode.js";
import { isDevEndpointAllowed } from "../../../lib/commercial/devCommercialCostGuard.js";

function parseBoolean(value = "") {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "true" || raw === "1";
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  if (!isDevEndpointAllowed(req)) {
    return res.status(403).json({ ok: false, error: "forbidden_in_production" });
  }

  const scenario = String(req.query.scenario || "controlled").trim().toLowerCase();
  const runtimeMode =
    scenario === "shadow"
      ? COMMERCIAL_RUNTIME_MODES.SHADOW
      : scenario === "legacy"
        ? COMMERCIAL_RUNTIME_MODES.LEGACY
        : COMMERCIAL_RUNTIME_MODES.CONTROLLED;

  const env = { ...process.env };
  if (parseBoolean(req.query.mercadolivreEnabled)) {
    env[MERCADOLIVRE_COMMERCIAL_PROVIDER_ENABLED_ENV] = "true";
  }
  if (req.query.strategy) {
    env.COMMERCIAL_PROVIDER_PRIORITY_STRATEGY = String(req.query.strategy).trim();
  }
  if (parseBoolean(req.query.priorityDisabled)) {
    env.COMMERCIAL_PROVIDER_PRIORITY_ENABLED = "false";
  }

  const plan = buildMultiProviderPriorityPlan({
    runtimeMode,
    invocationSource: "dev_multi_provider_priority_engine",
    query: String(req.query.q || "notebook").trim(),
    limit: Number.parseInt(String(req.query.limit || "5"), 10) || 5,
    env,
  });

  return res.status(200).json({
    ok: true,
    version: MULTI_PROVIDER_PRIORITY_ENGINE_VERSION,
    callsExternalApis: false,
    scenario,
    runtimeMode,
    config: readMultiProviderPriorityConfig(env),
    mercadolivreInShadow: plan.orderedProviders.some(
      (entry) => entry.providerId === COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC
    ),
    mercadolivreSkippedInShadow: plan.skippedProviders.some(
      (entry) =>
        entry.providerId === COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC &&
        entry.skipReason === "skipped_unsupported_runtime"
    ),
    plan: buildMultiProviderPriorityDevPayload(plan),
  });
}
