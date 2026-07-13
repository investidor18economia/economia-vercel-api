/**
 * PATCH Comercial 05E — DEV endpoint: Conditional Provider Fetch
 *
 * Simula execução condicional com providers sintéticos. Não chama APIs externas.
 */

import {
  CONDITIONAL_PROVIDER_FETCH_VERSION,
  buildConditionalProviderFetchDevPayload,
  executeConditionalProviderFetch,
  resetConditionalProviderFetchEventsForTests,
} from "../../../lib/commercial/conditionalProviderFetch.js";

function isDevEndpointAllowed(req) {
  if (process.env.NODE_ENV !== "production") return true;

  const secret = String(process.env.DEV_API_SECRET || "").trim();
  if (!secret) return false;

  const provided = String(
    req.headers["x-dev-api-secret"] || req.query.secret || ""
  ).trim();

  return provided === secret;
}

function buildValidProduct(title = "item") {
  return {
    product_name: title,
    price: "R$ 100",
    numericPrice: 100,
    link: `https://example.com/${encodeURIComponent(title)}`,
    thumbnail: null,
    source: "mock",
    provider: "provider_primary",
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

  resetConditionalProviderFetchEventsForTests();
  const scenario = String(req.query.scenario || "sufficient").trim().toLowerCase();
  const query = String(req.query.query || "iphone 13").trim();
  const fetchCounts = { provider_primary: 0, provider_secondary: 0 };

  const makeFetch = (providerId, resultFactory) => async () => {
    fetchCounts[providerId] = (fetchCounts[providerId] || 0) + 1;
    return resultFactory();
  };

  let primaryResult;
  let secondaryResult;

  if (scenario === "empty") {
    primaryResult = { ok: false, products: [], error: "empty_response", count: 0 };
    secondaryResult = { ok: true, products: [buildValidProduct(query)], count: 1 };
  } else if (scenario === "error") {
    primaryResult = { ok: false, products: [], error: "provider_error", count: 0 };
    secondaryResult = { ok: true, products: [buildValidProduct(query)], count: 1 };
  } else if (scenario === "blocked") {
    primaryResult = { ok: false, products: [], error: "cost_guard_blocked", count: 0 };
    secondaryResult = { ok: true, products: [buildValidProduct(query)], count: 1 };
  } else {
    primaryResult = { ok: true, products: [buildValidProduct(query)], count: 1 };
    secondaryResult = { ok: true, products: [buildValidProduct(`${query} alt`)], count: 1 };
  }

  const execution = await executeConditionalProviderFetch({
    query,
    providers: [
      {
        providerId: "provider_primary",
        resultKey: "primary",
        fetch: makeFetch("provider_primary", () => primaryResult),
      },
      {
        providerId: "provider_secondary",
        resultKey: "secondary",
        fetch: makeFetch("provider_secondary", () => secondaryResult),
      },
    ],
  });

  res.status(200).json({
    ok: true,
    version: CONDITIONAL_PROVIDER_FETCH_VERSION,
    callsExternalApis: false,
    scenario,
    fetchCounts,
    execution: {
      shortCircuitApplied: execution.shortCircuitApplied,
      providersAttempted: execution.providersAttempted,
      providersSkipped: execution.providersSkipped,
      externalCallsPrevented: execution.externalCallsPrevented,
    },
    payload: buildConditionalProviderFetchDevPayload(execution),
  });
}
