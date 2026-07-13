/**
 * PATCH Comercial 2A/2B — Mercado Livre adapter (mock padrão; real mode explícito)
 *
 * Adapter isolado e plugável seguindo ProductSourceAdapter V1.
 * Registrado como disabled — não usado em produção neste patch.
 */

import {
  ADAPTER_CONTRACT_VERSION,
} from "../adapterContract.js";
import {
  dedupeProducts,
} from "../dedupeProducts.js";
import {
  formatBrlPrice,
  normalizeRawProductsBase,
  parseNumericPrice,
} from "../normalizeProduct.js";
import {
  PRODUCT_SOURCE_IDS,
} from "../normalizedProduct.js";
import {
  COMMERCIAL_PROVIDER_IDS,
  isCommercialProviderEnabled,
} from "../commercialProviderRegistry.js";
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
  buildMercadoLivreProviderDisabledResult,
  getMercadoLivreCommercialRegistryMetadata,
} from "../../commercial/mercadolivreRuntimeActivation.js";
import {
  buildMercadoLivreSearchExecutionTelemetry,
  recordCommercialProviderExecutionStage,
} from "../../commercial/mercadolivreControlledFetchPathAudit.js";
import {
  searchMercadoLivreCatalogProducts,
  searchMercadoLivreProducts,
} from "./mercadoLivreClient.js";

/** Identificador legível do provider Mercado Livre nos produtos normalizados. */
export const MERCADO_LIVRE_PROVIDER = "mercadolivre";

/**
 * Resposta mock representando payload típico da API de busca do Mercado Livre.
 * @param {string} query
 * @param {number} limit
 * @returns {Promise<Record<string, unknown>[]>}
 */
export async function fetchMercadoLivreMockSearch(query = "", limit = 12) {
  const q = String(query || "").trim().toLowerCase();
  const cap = Number.isFinite(limit) ? Math.max(1, limit) : 12;

  const catalog = [
    {
      id: "MLB1001",
      title: "Notebook Gamer Acer Nitro 5 Intel Core I5 16gb 512gb Ssd",
      price: 4999.9,
      currency_id: "BRL",
      permalink: "https://produto.mercadolivre.com.br/MLB1001-notebook-acer",
      thumbnail: "https://http2.mlstatic.com/notebook-acer.jpg",
      condition: "new",
      available_quantity: 12,
      seller: { id: 441122, nickname: "LOJA_OFICIAL" },
      shipping: { free_shipping: true, mode: "me2" },
      attributes: [{ id: "BRAND", name: "Marca", value_name: "Acer" }],
      category_id: "MLB1648",
    },
    {
      id: "MLB1002",
      title: "Samsung Galaxy A55 5G 128gb Dual Sim Azul",
      price: 1799,
      currency_id: "BRL",
      permalink: "https://produto.mercadolivre.com.br/MLB1002-galaxy-a55",
      thumbnail: null,
      condition: "new",
      available_quantity: 25,
      seller: { id: 998877, nickname: "CELULARES_BR" },
      shipping: { free_shipping: false, mode: "me2" },
      attributes: [{ id: "BRAND", name: "Marca", value_name: "Samsung" }],
      category_id: "MLB1055",
    },
    {
      id: "MLB1002B",
      title: "Samsung Galaxy A55 5G 128gb Dual Sim Azul",
      price: 1799,
      currency_id: "BRL",
      permalink: "https://produto.mercadolivre.com.br/MLB1002-galaxy-a55",
      thumbnail: "https://http2.mlstatic.com/galaxy-a55.jpg",
      condition: "new",
      available_quantity: 25,
      seller: { id: 554433, nickname: "OUTRA_LOJA" },
      shipping: { free_shipping: true, mode: "me2" },
      attributes: [
        { id: "BRAND", name: "Marca", value_name: "Samsung" },
        { id: "COLOR", name: "Cor", value_name: "Azul" },
      ],
      category_id: "MLB1055",
    },
    {
      id: "MLB9999",
      title: "x",
      price: null,
      currency_id: "BRL",
      permalink: null,
      thumbnail: null,
    },
  ];

  const filtered = q
    ? catalog.filter(
        (item) =>
          String(item.title || "")
            .toLowerCase()
            .includes(q) || String(item.id || "").toLowerCase().includes(q)
      )
    : catalog;

  return filtered.slice(0, cap);
}

/**
 * Normaliza item no shape Mercado Livre → NormalizedProduct.
 *
 * @param {Record<string, unknown>} raw
 * @param {Record<string, unknown>} context
 */
export function normalizeMercadoLivreItem(raw = {}, context = {}) {
  if (!raw || typeof raw !== "object") return null;

  const categoryFromAttributes =
    Array.isArray(raw.attributes) && raw.attributes.length
      ? String(raw.attributes.find((a) => a?.id === "CATEGORY")?.value_name || "").trim()
      : "";

  const numericPrice = parseNumericPrice(raw.price);
  const priceLabel =
    typeof raw.price === "string" && /R\$/i.test(String(raw.price))
      ? String(raw.price).trim()
      : formatBrlPrice(numericPrice);

  return normalizeRawProductsBase(
    [
      {
        ...raw,
        title: raw.title || raw.product_name,
        price: priceLabel,
        numericPrice,
        currency: raw.currency_id || raw.currency || "BRL",
        category: raw.category_id || categoryFromAttributes || context.categoryHint || "",
      },
    ],
    {
      ...context,
      provider: MERCADO_LIVRE_PROVIDER,
      source: MERCADO_LIVRE_PROVIDER,
      rawSource: MERCADO_LIVRE_PROVIDER,
      categoryHint: context.categoryHint || raw.category_id || "",
      externalId: raw.id || context.externalId || null,
    },
    { limit: 1 }
  )[0] || null;
}

/**
 * @param {{
 *   query?: string,
 *   limit?: number,
 *   categoryHint?: string,
 *   fetcher?: Function,
 *   real?: boolean,
 *   realOptions?: Record<string, unknown>,
 * }} input
 */
export async function fetchMercadoLivreAdapterResult({
  query = "",
  limit = 12,
  categoryHint = "",
  fetcher = fetchMercadoLivreMockSearch,
  real = false,
  realOptions = {},
} = {}) {
  try {
    let rawProducts = [];

    if (real === true) {
      const searchMode = String(realOptions.searchMode || "items").trim().toLowerCase();
      const searchFn =
        searchMode === "products"
          ? searchMercadoLivreCatalogProducts
          : searchMercadoLivreProducts;
      const searchResult = await searchFn(query, limit, realOptions);
      if (!searchResult.ok) {
        return {
          ok: false,
          provider: MERCADO_LIVRE_PROVIDER,
          products: [],
          error: searchResult.error || "provider_error",
          count: 0,
          searchMode,
          httpStatus: searchResult.httpStatus,
          httpStatusText: searchResult.httpStatusText,
          safeErrorBodyPreview: searchResult.safeErrorBodyPreview,
          requestUrl: searchResult.requestUrl,
          status: searchResult.status,
        };
      }
      rawProducts = searchResult.items;
    } else {
      rawProducts = await fetcher(query, limit);
    }

    if (!Array.isArray(rawProducts)) {
      return {
        ok: false,
        provider: MERCADO_LIVRE_PROVIDER,
        products: [],
        error: "invalid_response",
        count: 0,
      };
    }

    const normalized = [];
    for (const raw of rawProducts) {
      const item = normalizeMercadoLivreItem(raw, { query, categoryHint });
      if (item) normalized.push(item);
      if (normalized.length >= limit) break;
    }

    if (!normalized.length) {
      return {
        ok: false,
        provider: MERCADO_LIVRE_PROVIDER,
        products: [],
        error: "empty_or_unusable",
        count: 0,
      };
    }

    return {
      ok: true,
      provider: MERCADO_LIVRE_PROVIDER,
      products: normalized,
      error: null,
      count: normalized.length,
      searchMode: real === true ? String(realOptions.searchMode || "items").trim().toLowerCase() : "mock",
    };
  } catch {
    return {
      ok: false,
      provider: MERCADO_LIVRE_PROVIDER,
      products: [],
      error: "provider_error",
      count: 0,
    };
  }
}

export const mercadoLivreAdapter = Object.freeze({
  id: PRODUCT_SOURCE_IDS.MERCADO_LIVRE,
  displayName: "Mercado Livre",
  version: ADAPTER_CONTRACT_VERSION,
  enabled: false,
  async fetchProducts({ query = "", limit = 12, categoryHint = "", real = false, realOptions = {} } = {}) {
    return fetchMercadoLivreAdapterResult({ query, limit, categoryHint, real, realOptions });
  },
  normalizeItem(raw = {}, context = {}) {
    return normalizeMercadoLivreItem(raw, context);
  },
});

export function dedupeMercadoLivreProducts(products = [], limit = 12) {
  return dedupeProducts(products, { limit });
}

function normalizeMercadoLivreSearchResult(rawProducts = [], { query = "", categoryHint = "", limit = 12 } = {}) {
  const normalized = [];
  for (const raw of rawProducts) {
    const item = normalizeMercadoLivreItem(raw, { query, categoryHint });
    if (item) normalized.push(item);
    if (normalized.length >= limit) break;
  }
  return normalized;
}

function buildMercadoLivreCommercialNeutralResult(error = "provider_error", extra = {}) {
  return {
    ok: false,
    provider: MERCADO_LIVRE_PROVIDER,
    providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
    products: [],
    count: 0,
    error,
    ...extra,
  };
}

/**
 * @param {{
 *   query?: string,
 *   limit?: number,
 *   categoryHint?: string,
 *   searchMode?: string,
 *   fetcher?: Function,
 *   costGuardContext?: Record<string, unknown>|null,
 *   commercialRequestDedupContext?: Record<string, unknown>|null,
 *   invocationLayer?: string,
 *   env?: Record<string, string|undefined>,
 *   executionLifecycle?: Record<string, unknown>|null,
 * }} input
 */
export async function fetchMercadoLivreCommercialAdapterResult({
  query = "",
  limit = 12,
  categoryHint = "",
  searchMode = "items",
  fetcher,
  costGuardContext = null,
  commercialRequestDedupContext = null,
  invocationLayer = "mercadolivre_commercial_adapter",
  env = process.env,
  executionLifecycle = null,
} = {}) {
  if (!isCommercialProviderEnabled(COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC, env)) {
    return {
      ...buildMercadoLivreProviderDisabledResult({
        provider: MERCADO_LIVRE_PROVIDER,
      }),
      adapterInvoked: true,
      executionTelemetry: buildMercadoLivreSearchExecutionTelemetry(
        { error: "provider_disabled", reasonCode: "provider_disabled", blockedBeforeFetch: true },
        { adapterInvoked: true }
      ),
    };
  }

  recordCommercialProviderExecutionStage(executionLifecycle, {
    stage: "adapter_invoked",
    providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
    invocationSource: invocationLayer,
  });

  const attachExecutionTelemetry = (payload = {}, searchResult = {}) => ({
    ...payload,
    adapterInvoked: true,
    clientInvoked: searchResult.clientInvoked === true || payload.clientInvoked === true,
    httpRequestStarted: searchResult.httpRequestStarted === true || payload.httpRequestStarted === true,
    httpRequestCompleted:
      searchResult.httpRequestCompleted === true || payload.httpRequestCompleted === true,
    blockedBeforeFetch:
      searchResult.blockedBeforeFetch === true || payload.blockedBeforeFetch === true,
    executionTelemetry: buildMercadoLivreSearchExecutionTelemetry(searchResult, {
      adapterInvoked: true,
      reasonCode: payload.reasonCode || searchResult.reasonCode || payload.error,
    }),
  });

  return executeCommercialRequestWithDeduplication({
    providerId: PROVIDER_COST_GUARD_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
    query,
    limit,
    categoryHint,
    costGuardContext,
    commercialRequestDedupContext,
    invocationSource: invocationLayer,
    layer: invocationLayer,
    execute: async () =>
      executeWithUniversalCommercialCache({
        providerId: PROVIDER_COST_GUARD_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
        query,
        limit,
        categoryHint,
        costGuardContext,
        invocationSource: invocationLayer,
        layer: invocationLayer,
        env,
        execute: async () => {
          const guardDecision = evaluateProviderCostGuardForProvider(
            PROVIDER_COST_GUARD_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
            {
              ...(costGuardContext || {}),
              providerId: PROVIDER_COST_GUARD_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
              env,
            }
          );

          if (!guardDecision.shouldCallProvider) {
            recordCommercialProviderExecutionStage(executionLifecycle, {
              stage: "cost_guard_blocked",
              reasonCode: guardDecision.reasonCode || "cost_guard_blocked",
              externalCallPrevented: true,
            });
            return attachExecutionTelemetry(
              {
                ...buildProviderCostGuardBlockedResult(
                  PROVIDER_COST_GUARD_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
                  guardDecision,
                  {
                    provider: MERCADO_LIVRE_PROVIDER,
                    providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
                  }
                ),
                costGuardDecision: guardDecision,
                blockedBeforeFetch: true,
              },
              { blockedBeforeFetch: true, reasonCode: guardDecision.reasonCode }
            );
          }

          const mode = String(searchMode || "items").trim().toLowerCase();
          const searchFn =
            mode === "products" ? searchMercadoLivreCatalogProducts : searchMercadoLivreProducts;

          return executeCommercialProviderProtectedFetch({
            providerId: PROVIDER_COST_GUARD_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
            invocationSource: invocationLayer,
            env,
            extraBlockedFields: {
              provider: MERCADO_LIVRE_PROVIDER,
              providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
            },
            executeExternalFetch: async () => {
              const searchResult = await searchFn(query, limit, {
                env,
                fetcher,
                onStage: (stage, meta = {}) => {
                  recordCommercialProviderExecutionStage(executionLifecycle, {
                    stage,
                    reasonCode: meta.reasonCode || null,
                    externalCallExecuted: stage === "http_request_started",
                    externalCallPrevented: stage === "cost_guard_blocked",
                  });
                },
              });

              if (!searchResult.ok) {
                return attachExecutionTelemetry(
                  buildMercadoLivreCommercialNeutralResult(searchResult.error || "provider_error", {
                    reasonCode: searchResult.reasonCode || searchResult.error || "provider_error",
                    httpStatus: searchResult.httpStatus ?? null,
                    httpStatusText: searchResult.httpStatusText ?? null,
                    safeErrorBodyPreview: searchResult.safeErrorBodyPreview ?? null,
                    safeForbiddenDiagnostics: searchResult.safeForbiddenDiagnostics ?? null,
                    requestUrl: searchResult.requestUrl ?? null,
                    searchMode: mode,
                    registryMetadata: getMercadoLivreCommercialRegistryMetadata(env),
                  }),
                  searchResult
                );
              }

              recordCommercialProviderExecutionStage(executionLifecycle, {
                stage: "normalization_started",
              });

              const normalized = normalizeMercadoLivreSearchResult(searchResult.items, {
                query,
                categoryHint,
                limit,
              });

              recordCommercialProviderExecutionStage(executionLifecycle, {
                stage: "normalization_completed",
                reasonCode: normalized.length ? null : "provider_normalization_empty",
              });

              if (!normalized.length) {
                return attachExecutionTelemetry(
                  buildMercadoLivreCommercialNeutralResult("empty_or_unusable", {
                    reasonCode: "provider_normalization_empty",
                    searchMode: mode,
                  }),
                  searchResult
                );
              }

              return attachExecutionTelemetry(
                {
                  ok: true,
                  provider: MERCADO_LIVRE_PROVIDER,
                  providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
                  products: normalized,
                  error: null,
                  count: normalized.length,
                  searchMode: mode,
                  registryMetadata: getMercadoLivreCommercialRegistryMetadata(env),
                },
                searchResult
              );
            },
          });
        },
      }),
  });
}
