import { fetchSerpPrices } from "../../lib/prices";
import {
  buildDevCommercialCostGuardResponse,
  evaluateDevCommercialExecutionPermission,
} from "../../lib/commercial/devCommercialCostGuard.js";
import { COMMERCIAL_PROVIDER_IDS } from "../../lib/productSourceAdapter/commercialProviderRegistry.js";

export default async function handler(req, res) {
  try {
    const query = req.query.q || "iphone 14 pro";

    const permission = evaluateDevCommercialExecutionPermission({
      req,
      providerId: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
      invocationSource: "test_endpoint",
      isTestEndpoint: true,
      plannedRequest: { query, limit: 5 },
    });

    if (permission.shouldReturnDryRun === true) {
      return res.status(200).json({
        ...buildDevCommercialCostGuardResponse(permission, {
          endpoint: "test-serp",
          plannedRequest: { query, limit: 5 },
          hasSerpKey: !!process.env.SERPAPI_KEY,
          count: 0,
          prices: [],
        }),
      });
    }

    const prices = await fetchSerpPrices(query, 5);

    return res.status(200).json({
      ok: true,
      dryRun: false,
      externalCallExecuted: true,
      hasSerpKey: !!process.env.SERPAPI_KEY,
      count: prices.length,
      prices,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      hasSerpKey: !!process.env.SERPAPI_KEY,
      error: String(err),
    });
  }
}
