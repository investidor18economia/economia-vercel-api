/**
 * PATCH Comercial 05F — DEV endpoint: Provider Budget & Circuit Breaker
 */

import {
  PROVIDER_BUDGET_CIRCUIT_VERSION,
  PROVIDER_CIRCUIT_STATES,
  buildProviderBudgetCircuitDevPayload,
  evaluateProviderBudgetPermission,
  executeCommercialProviderProtectedFetch,
  getProviderCircuitState,
  recordProviderCallOutcome,
  resetProviderBudgetCircuitState,
  setProviderCircuitOpenUntilForTests,
} from "../../../lib/commercial/providerBudgetCircuitBreaker.js";

function isDevEndpointAllowed(req) {
  if (process.env.NODE_ENV !== "production") return true;
  const secret = String(process.env.DEV_API_SECRET || "").trim();
  if (!secret) return false;
  return String(req.headers["x-dev-api-secret"] || req.query.secret || "").trim() === secret;
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

  const action = String(req.query.action || "stats").trim().toLowerCase();
  const providerId = String(req.query.provider || "paid_provider_a").trim();
  const scenario = String(req.query.scenario || "success").trim().toLowerCase();

  if (action === "reset") {
    resetProviderBudgetCircuitState(providerId || null);
    res.status(200).json({
      ok: true,
      version: PROVIDER_BUDGET_CIRCUIT_VERSION,
      callsExternalApis: false,
      reset: true,
      payload: buildProviderBudgetCircuitDevPayload(providerId),
    });
    return;
  }

  resetProviderBudgetCircuitState(providerId);
  const env = {
    COMMERCIAL_PROVIDER_BUDGET_ENABLED: "true",
    COMMERCIAL_PROVIDER_CIRCUIT_ENABLED: "true",
    COMMERCIAL_PROVIDER_DEFAULT_MAX_CALLS_PER_WINDOW: "2",
    COMMERCIAL_PROVIDER_BUDGET_WINDOW_MS: "60000",
    COMMERCIAL_PROVIDER_CIRCUIT_FAILURE_THRESHOLD: "2",
    COMMERCIAL_PROVIDER_CIRCUIT_OPEN_MS: "1000",
    COMMERCIAL_PROVIDER_CIRCUIT_HALF_OPEN_MAX_PROBES: "1",
  };

  let fetchCount = 0;
  const makeResult = () => {
    fetchCount += 1;
    if (scenario === "failure") {
      return { ok: false, products: [], error: "provider_error", count: 0 };
    }
    if (scenario === "empty") {
      return { ok: false, products: [], error: "empty_response", count: 0 };
    }
    return { ok: true, products: [{ title: "item", price: 10, url: "https://example.com/i" }], count: 1 };
  };

  if (scenario === "circuit_open") {
    await executeCommercialProviderProtectedFetch({
      providerId,
      env,
      executeExternalFetch: async () => makeResult(),
    });
    await executeCommercialProviderProtectedFetch({
      providerId,
      env,
      executeExternalFetch: async () => ({ ok: false, products: [], error: "timeout", count: 0 }),
    });
    const blocked = await executeCommercialProviderProtectedFetch({
      providerId,
      env,
      executeExternalFetch: async () => {
        fetchCount += 1;
        return makeResult();
      },
    });
    res.status(200).json({
      ok: true,
      version: PROVIDER_BUDGET_CIRCUIT_VERSION,
      callsExternalApis: false,
      scenario,
      fetchCount,
      blocked,
      payload: buildProviderBudgetCircuitDevPayload(providerId),
    });
    return;
  }

  if (scenario === "half_open_success") {
    await executeCommercialProviderProtectedFetch({ providerId, env, executeExternalFetch: async () => ({ ok: false, products: [], error: "provider_error" }) });
    await executeCommercialProviderProtectedFetch({ providerId, env, executeExternalFetch: async () => ({ ok: false, products: [], error: "provider_error" }) });
    setProviderCircuitOpenUntilForTests(providerId, Date.now() - 1);
    const probe = await executeCommercialProviderProtectedFetch({
      providerId,
      env,
      executeExternalFetch: async () => makeResult(),
    });
    res.status(200).json({
      ok: true,
      version: PROVIDER_BUDGET_CIRCUIT_VERSION,
      callsExternalApis: false,
      scenario,
      probe,
      circuit: getProviderCircuitState(providerId),
      payload: buildProviderBudgetCircuitDevPayload(providerId),
    });
    return;
  }

  const first = await executeCommercialProviderProtectedFetch({
    providerId,
    env,
    executeExternalFetch: async () => makeResult(),
  });
  const second = await executeCommercialProviderProtectedFetch({
    providerId,
    env,
    executeExternalFetch: async () => makeResult(),
  });
  const permission = evaluateProviderBudgetPermission({ providerId, env });

  res.status(200).json({
    ok: true,
    version: PROVIDER_BUDGET_CIRCUIT_VERSION,
    callsExternalApis: false,
    scenario,
    fetchCount,
    first,
    second,
    permission,
    payload: buildProviderBudgetCircuitDevPayload(providerId),
  });
}
