/**
 * PATCH Comercial 05D — DEV endpoint: Universal Commercial Cache
 *
 * Simula cache com providers sintéticos. Não chama APIs externas.
 */

import {
  UNIVERSAL_COMMERCIAL_CACHE_VERSION,
  buildUniversalCommercialCacheDevPayload,
  buildUniversalCommercialCacheKey,
  clearUniversalCommercialCache,
  executeWithUniversalCommercialCache,
  getUniversalCommercialCacheEntry,
} from "../../../lib/commercial/universalCommercialCache.js";
import {
  buildFunctionalProviderCostGuardContext,
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

  const action = String(req.query.action || "stats").trim().toLowerCase();
  const query = String(req.query.query || "iphone 13").trim();
  const providerId = String(req.query.provider || "paid_provider_a").trim();
  const scenario = String(req.query.scenario || "hit").trim().toLowerCase();

  if (action === "clear") {
    clearUniversalCommercialCache();
    res.status(200).json({
      ok: true,
      version: UNIVERSAL_COMMERCIAL_CACHE_VERSION,
      callsExternalApis: false,
      cleared: true,
      payload: buildUniversalCommercialCacheDevPayload(),
    });
    return;
  }

  const functionalContext = buildFunctionalProviderCostGuardContext({
    invocationSource: "dev_universal_commercial_cache",
  });
  const key = buildUniversalCommercialCacheKey({
    providerId,
    query,
    limit: 5,
    costGuardContext: functionalContext,
  });

  let fetchCount = 0;
  const execute = async () => {
    fetchCount += 1;
    return buildSyntheticResult(providerId, query);
  };

  if (scenario === "miss") {
    clearUniversalCommercialCache();
    await executeWithUniversalCommercialCache({
      providerId,
      query,
      limit: 5,
      costGuardContext: functionalContext,
      invocationSource: "dev_cache_miss",
      execute,
    });
  } else if (scenario === "stale") {
    clearUniversalCommercialCache();
    await executeWithUniversalCommercialCache({
      providerId,
      query,
      limit: 5,
      costGuardContext: functionalContext,
      env: { COMMERCIAL_CACHE_TTL_MS: "1" },
      invocationSource: "dev_cache_stale_write",
      execute,
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    fetchCount = 0;
    await executeWithUniversalCommercialCache({
      providerId,
      query,
      limit: 5,
      costGuardContext: functionalContext,
      env: { COMMERCIAL_CACHE_TTL_MS: "1" },
      invocationSource: "dev_cache_stale_read",
      execute,
    });
  } else {
    clearUniversalCommercialCache();
    await executeWithUniversalCommercialCache({
      providerId,
      query,
      limit: 5,
      costGuardContext: functionalContext,
      invocationSource: "dev_cache_write",
      execute,
    });
    fetchCount = 0;
    await executeWithUniversalCommercialCache({
      providerId,
      query: `  ${query.toUpperCase()}  `,
      limit: 5,
      costGuardContext: functionalContext,
      invocationSource: "dev_cache_hit",
      execute,
    });
  }

  res.status(200).json({
    ok: true,
    version: UNIVERSAL_COMMERCIAL_CACHE_VERSION,
    callsExternalApis: false,
    action,
    scenario,
    keyHash: getUniversalCommercialCacheEntry(key)?.keyHash || null,
    fetchCount,
    payload: buildUniversalCommercialCacheDevPayload(),
  });
}
