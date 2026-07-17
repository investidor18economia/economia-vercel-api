/**
 * PATCH Comercial 05L.2 — DataForSEO Google Shopping adapter
 *
 * Provider independente de SerpAPI (google_shopping).
 * Integra Cost Guard, Dedup, Cache, Budget/Circuit sem alterar inteligência cognitiva.
 */

import {
  buildProviderCostGuardBlockedResult,
  evaluateProviderCostGuardForProvider,
  PROVIDER_COST_GUARD_PROVIDER_IDS,
} from "../../commercial/providerCostGuard.js";
import {
  executeCommercialRequestWithDeduplication,
} from "../../commercial/commercialRequestDeduplication.js";
import {
  executeWithUniversalCommercialCache,
} from "../../commercial/universalCommercialCache.js";
import {
  executeCommercialProviderProtectedFetch,
} from "../../commercial/providerBudgetCircuitBreaker.js";
import {
  isDataForSeoCommercialProviderRuntimeEnabled,
} from "../commercialProviderRegistry.js";
import {
  ADAPTER_CONTRACT_VERSION,
} from "../adapterContract.js";
import {
  dedupeProducts,
} from "../dedupeProducts.js";
import {
  normalizeRawProductBase,
  normalizeRawProductsBase,
} from "../normalizeProduct.js";
import {
  PRODUCT_SOURCE_IDS,
} from "../normalizedProduct.js";
import {
  searchDataForSeoGoogleShoppingProducts,
  DATAFORSEO_REASON_CODES,
} from "./dataForSeoGoogleShoppingClient.js";

export const DATAFORSEO_GOOGLE_SHOPPING_ADAPTER_VERSION = "05L.2";
export const DATAFORSEO_GOOGLE_SHOPPING_PROVIDER =
  PRODUCT_SOURCE_IDS.GOOGLE_SHOPPING_DATAFORSEO;

export const googleShoppingDataForSeoAdapter = Object.freeze({
  id: DATAFORSEO_GOOGLE_SHOPPING_PROVIDER,
  displayName: "Google Shopping (DataForSEO)",
  version: ADAPTER_CONTRACT_VERSION,
  enabled: false,
  async fetchProducts({ query = "", limit = 12, categoryHint = "", env = process.env } = {}) {
    return fetchDataForSeoGoogleShoppingAdapterResult({
      query,
      limit,
      categoryHint,
      env,
    });
  },
  normalizeItem(raw = {}, context = {}) {
    return normalizeRawProductBase(raw, {
      ...context,
      provider: DATAFORSEO_GOOGLE_SHOPPING_PROVIDER,
      rawSource: DATAFORSEO_GOOGLE_SHOPPING_PROVIDER,
    });
  },
});

function buildDisabledProviderResult() {
  return {
    ok: false,
    provider: DATAFORSEO_GOOGLE_SHOPPING_PROVIDER,
    products: [],
    error: "provider_disabled",
    reasonCode: "provider_disabled",
    count: 0,
    blockedBeforeFetch: true,
  };
}

/**
 * @param {{
 *   query?: string,
 *   limit?: number,
 *   categoryHint?: string,
 *   fetcher?: Function,
 *   costGuardContext?: Record<string, unknown>|null,
 *   commercialRequestDedupContext?: Record<string, unknown>|null,
 *   invocationLayer?: string,
 *   env?: Record<string, string|undefined>,
 * }} input
 */
export async function fetchDataForSeoGoogleShoppingAdapterResult({
  query = "",
  limit = 12,
  categoryHint = "",
  fetcher = searchDataForSeoGoogleShoppingProducts,
  costGuardContext = null,
  commercialRequestDedupContext = null,
  invocationLayer = "dataforseo_google_shopping_adapter",
  env = process.env,
} = {}) {
  if (!isDataForSeoCommercialProviderRuntimeEnabled(env)) {
    return buildDisabledProviderResult();
  }

  return executeCommercialRequestWithDeduplication({
    providerId: PROVIDER_COST_GUARD_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO,
    query,
    limit,
    categoryHint,
    costGuardContext,
    commercialRequestDedupContext,
    invocationSource: invocationLayer,
    layer: invocationLayer,
    execute: async () =>
      executeWithUniversalCommercialCache({
        providerId: PROVIDER_COST_GUARD_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO,
        query,
        limit,
        categoryHint,
        costGuardContext,
        invocationSource: invocationLayer,
        layer: invocationLayer,
        execute: async () => {
          const guardDecision = evaluateProviderCostGuardForProvider(
            PROVIDER_COST_GUARD_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO,
            {
              ...(costGuardContext || {}),
              providerId: PROVIDER_COST_GUARD_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO,
              skipCostGuard: costGuardContext?.skipCostGuard,
              env,
            }
          );

          if (!guardDecision.shouldCallProvider) {
            return {
              ...buildProviderCostGuardBlockedResult(
                PROVIDER_COST_GUARD_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO,
                guardDecision,
                {
                  provider: DATAFORSEO_GOOGLE_SHOPPING_PROVIDER,
                }
              ),
              costGuardDecision: guardDecision,
            };
          }

          try {
            return await executeCommercialProviderProtectedFetch({
              providerId: PROVIDER_COST_GUARD_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO,
              invocationSource: invocationLayer,
              extraBlockedFields: { provider: DATAFORSEO_GOOGLE_SHOPPING_PROVIDER },
              env,
              executeExternalFetch: async () => {
                const clientResult = await fetcher({
                  query,
                  limit,
                  env,
                });

                if (!clientResult || typeof clientResult !== "object") {
                  return {
                    ok: false,
                    provider: DATAFORSEO_GOOGLE_SHOPPING_PROVIDER,
                    products: [],
                    error: "invalid_response",
                    reasonCode: DATAFORSEO_REASON_CODES.INVALID_PAYLOAD,
                    count: 0,
                  };
                }

                if (!clientResult.ok) {
                  return {
                    ok: false,
                    provider: DATAFORSEO_GOOGLE_SHOPPING_PROVIDER,
                    products: [],
                    error: clientResult.error || "provider_error",
                    reasonCode: clientResult.reasonCode || DATAFORSEO_REASON_CODES.PROVIDER_ERROR,
                    httpStatus: clientResult.httpStatus ?? null,
                    count: 0,
                    diagnostics: clientResult.diagnostics || null,
                  };
                }

                const rawProducts = Array.isArray(clientResult.products)
                  ? clientResult.products
                  : [];

                const normalized = normalizeRawProductsBase(
                  rawProducts,
                  {
                    provider: DATAFORSEO_GOOGLE_SHOPPING_PROVIDER,
                    query,
                    categoryHint,
                    rawSource: DATAFORSEO_GOOGLE_SHOPPING_PROVIDER,
                    source: DATAFORSEO_GOOGLE_SHOPPING_PROVIDER,
                  },
                  { limit }
                );

                if (!normalized.length) {
                  return {
                    ok: false,
                    provider: DATAFORSEO_GOOGLE_SHOPPING_PROVIDER,
                    products: [],
                    error: "rate_limited_or_empty",
                    reasonCode: DATAFORSEO_REASON_CODES.EMPTY_RESULT,
                    count: 0,
                    diagnostics: clientResult.diagnostics || null,
                  };
                }

                return {
                  ok: true,
                  provider: DATAFORSEO_GOOGLE_SHOPPING_PROVIDER,
                  products: normalized,
                  error: null,
                  reasonCode: DATAFORSEO_REASON_CODES.SUCCESS,
                  count: normalized.length,
                  diagnostics: clientResult.diagnostics || null,
                };
              },
            });
          } catch (err) {
            return {
              ok: false,
              provider: DATAFORSEO_GOOGLE_SHOPPING_PROVIDER,
              products: [],
              error: err?.response?.status === 429 ? "rate_limited" : "provider_error",
              reasonCode:
                err?.response?.status === 429
                  ? DATAFORSEO_REASON_CODES.RATE_LIMITED
                  : DATAFORSEO_REASON_CODES.PROVIDER_ERROR,
              count: 0,
            };
          }
        },
      }),
  });
}

export function dedupeDataForSeoGoogleShoppingProducts(products = [], limit = 12) {
  return dedupeProducts(products, { limit });
}
