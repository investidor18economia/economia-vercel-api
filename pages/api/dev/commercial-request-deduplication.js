/**
 * PATCH Comercial 05C — DEV endpoint: Commercial Request Deduplication
 *
 * Prova deduplicação com providers sintéticos. Não chama APIs externas.
 */

import {
  COMMERCIAL_REQUEST_DEDUP_VERSION,
  buildCommercialRequestDedupDevPayload,
  createCommercialRequestDedupContext,
  executeCommercialRequestWithDeduplication,
  runWithCommercialRequestDedupContext,
} from "../../../lib/commercial/commercialRequestDeduplication.js";
import {
  buildFunctionalProviderCostGuardContext,
  buildObservabilityProviderCostGuardContext,
} from "../../../lib/commercial/providerCostGuard.js";

function isDevEndpointAllowed(req) {
  if (process.env.NODE_ENV !== "production") return true;

  const secret = String(process.env.DEV_API_SECRET || "").trim();
  if (!secret) return false;

  const provided = String(
    req.headers["x-dev-api-secret"] || req.query.secret || ""
  ).trim();

  return provided === secret;
}

function buildSyntheticResult(providerId = "", query = "") {
  return {
    ok: true,
    provider: providerId,
    query,
    products: [{ title: `${query} synthetic`, price: 100 }],
    count: 1,
  };
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

  const scenario = String(req.query.scenario || "equivalent").trim().toLowerCase();
  const query = String(req.query.query || "iphone 13").trim();
  const providerA = String(req.query.providerA || "paid_provider_a").trim();
  const providerB = String(req.query.providerB || "paid_provider_future").trim();
  const context = createCommercialRequestDedupContext({ requestId: "dev-dedup" });
  const fetchCounts = { [providerA]: 0, [providerB]: 0 };

  const makeExecutor = (providerId) => async () => {
    fetchCounts[providerId] = (fetchCounts[providerId] || 0) + 1;
    return buildSyntheticResult(providerId, query);
  };

  const functionalContext = buildFunctionalProviderCostGuardContext({
    invocationSource: "dev_commercial_request_deduplication",
  });

  await runWithCommercialRequestDedupContext(context, async () => {
    if (scenario === "different_query") {
      await executeCommercialRequestWithDeduplication({
        dedupContext: context,
        providerId: providerA,
        query: "iphone 13",
        costGuardContext: functionalContext,
        invocationSource: "dev_layer_a",
        execute: makeExecutor(providerA),
      });
      await executeCommercialRequestWithDeduplication({
        dedupContext: context,
        providerId: providerA,
        query: "iphone 13 pro",
        costGuardContext: functionalContext,
        invocationSource: "dev_layer_b",
        execute: makeExecutor(providerA),
      });
    } else if (scenario === "different_provider") {
      await executeCommercialRequestWithDeduplication({
        dedupContext: context,
        providerId: providerA,
        query,
        costGuardContext: functionalContext,
        invocationSource: "dev_layer_a",
        execute: makeExecutor(providerA),
      });
      await executeCommercialRequestWithDeduplication({
        dedupContext: context,
        providerId: providerB,
        query,
        costGuardContext: functionalContext,
        invocationSource: "dev_layer_b",
        execute: makeExecutor(providerB),
      });
    } else if (scenario === "incompatible_policy") {
      const observabilityContext = buildObservabilityProviderCostGuardContext({
        invocationSource: "dev_observability",
      });
      await executeCommercialRequestWithDeduplication({
        dedupContext: context,
        providerId: providerA,
        query,
        costGuardContext: functionalContext,
        invocationSource: "dev_functional",
        execute: makeExecutor(providerA),
      });
      await executeCommercialRequestWithDeduplication({
        dedupContext: context,
        providerId: providerA,
        query,
        costGuardContext: observabilityContext,
        invocationSource: "dev_observability",
        execute: makeExecutor(providerA),
      });
    } else {
      await Promise.all([
        executeCommercialRequestWithDeduplication({
          dedupContext: context,
          providerId: providerA,
          query,
          costGuardContext: functionalContext,
          invocationSource: "dev_layer_a",
          execute: makeExecutor(providerA),
        }),
        executeCommercialRequestWithDeduplication({
          dedupContext: context,
          providerId: providerA,
          query: `  ${query.toUpperCase()}  `,
          costGuardContext: functionalContext,
          invocationSource: "dev_layer_b",
          execute: makeExecutor(providerA),
        }),
      ]);
    }
  });

  res.status(200).json({
    ok: true,
    version: COMMERCIAL_REQUEST_DEDUP_VERSION,
    callsExternalApis: false,
    scenario,
    fetchCounts,
    payload: buildCommercialRequestDedupDevPayload(context),
  });
}
