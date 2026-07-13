/**
 * PATCH Comercial 4A — Apify Mercado Livre client (isolado, sem plug na MIA)
 *
 * Provider comercial externo via Actor Apify.
 * Não decide winner, ranking ou recomendação — apenas dados comerciais brutos.
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

export const APIFY_MERCADOLIVRE_CLIENT_VERSION = "4A.1";
export const APIFY_MERCADOLIVRE_ACTOR_ID = "karamelo~mercadolivre-scraper-brasil-portugues";
export const APIFY_MERCADOLIVRE_SOURCE = "apify_mercadolivre";

const APIFY_API_BASE = "https://api.apify.com/v2";
export const DEFAULT_MAX_RESULTS = 5;
const MAX_ALLOWED_RESULTS = 5;
const DEFAULT_TIMEOUT_MS = 120_000;
const ENV_TOKEN_KEY = "APIFY_API_TOKEN";

function readEnv(env = process.env) {
  return {
    token: String(env?.[ENV_TOKEN_KEY] || "").trim(),
  };
}

export function clampApifyMaxResults(maxResults = DEFAULT_MAX_RESULTS) {
  const parsed = Number.parseInt(String(maxResults), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_MAX_RESULTS;
  return Math.min(parsed, MAX_ALLOWED_RESULTS);
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
export function validateApifyMercadoLivreEnv(env = process.env) {
  const config = readEnv(env);
  const missing = [];

  if (!config.token) missing.push(ENV_TOKEN_KEY);

  return {
    ok: missing.length === 0,
    missing,
    hasToken: !!config.token,
  };
}

export function hasApifyMercadoLivreToken(env = process.env) {
  return validateApifyMercadoLivreEnv(env).hasToken;
}

function sanitizeForOutput(value = "", token = "") {
  const text = String(value || "");
  if (!token) return text;
  return text.split(token).join("[REDACTED]");
}

export function redactApifyMercadoLivreSecrets(value = "", env = process.env) {
  return sanitizeForOutput(value, readEnv(env).token);
}

/**
 * @param {unknown} rawPrice
 */
export function parseApifyMercadoLivrePrice(rawPrice) {
  if (rawPrice == null || rawPrice === "") return null;

  if (typeof rawPrice === "number" && !Number.isNaN(rawPrice) && rawPrice > 0) {
    return rawPrice;
  }

  const text = String(rawPrice).trim();
  if (!text) return null;

  const digits = text.replace(/[^\d.,]/g, "");
  if (!digits) return null;

  let num;
  if (/,\d{1,2}$/.test(digits)) {
    num = parseFloat(digits.replace(/\./g, "").replace(",", "."));
  } else if (/^\d{1,3}(\.\d{3})+$/.test(digits)) {
    num = parseFloat(digits.replace(/\./g, ""));
  } else {
    num = parseFloat(digits.replace(/\./g, "").replace(",", "."));
  }

  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function pickApifyItemUrl(item = {}) {
  return cleanText(
    item.produtoLink || item.zProdutoLink || item.produto_link || item.url || ""
  );
}

function pickApifyItemTitle(item = {}) {
  return cleanText(item.eTituloProduto || item.title || item.titulo || "");
}

function pickApifyItemImage(item = {}) {
  return cleanText(item.imagemLink || item.image || item.thumbnail || "") || null;
}

function pickApifyItemBrand(item = {}) {
  return cleanText(item.produtoMarca || item.brand || item.marca || "") || null;
}

function pickApifyItemSeller(item = {}) {
  return cleanText(item.Vendedor || item.vendedor || item.seller || "") || null;
}

function pickApifyItemCategory(item = {}) {
  return (
    cleanText(item.produtoDomainID || item.produtoCategoryID || item.category || "") ||
    null
  );
}

/**
 * @param {Record<string, unknown>} [item]
 */
export function isApifyMercadoLivreProductUsable(item = {}) {
  const title = pickApifyItemTitle(item);
  const url = pickApifyItemUrl(item);
  const price = parseApifyMercadoLivrePrice(item.novoPreco ?? item.price ?? item.preco);
  return !!(title && url && price != null);
}

/**
 * @param {Record<string, unknown>} [item]
 */
export function mapApifyMercadoLivreItemToNormalizedProduct(item = {}) {
  const title = pickApifyItemTitle(item);
  const url = pickApifyItemUrl(item);
  const price = parseApifyMercadoLivrePrice(item.novoPreco ?? item.price ?? item.preco);

  if (!title || !url || price == null) return null;

  return {
    title,
    price,
    image: pickApifyItemImage(item),
    url,
    brand: pickApifyItemBrand(item),
    seller: pickApifyItemSeller(item),
    category: pickApifyItemCategory(item),
    source: APIFY_MERCADOLIVRE_SOURCE,
  };
}

/**
 * @param {unknown[]} items
 * @param {number} [maxResults]
 */
export function mapApifyMercadoLivreItemsToNormalizedProducts(
  items = [],
  maxResults = DEFAULT_MAX_RESULTS
) {
  const cap = clampApifyMaxResults(maxResults);
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => mapApifyMercadoLivreItemToNormalizedProduct(item))
    .filter(Boolean)
    .slice(0, cap);
}

/**
 * @param {Record<string, string|undefined>} [env]
 * @param {number} [maxResults]
 */
export function buildApifyMercadoLivreRunUrl(env = process.env, maxResults = DEFAULT_MAX_RESULTS) {
  const cap = clampApifyMaxResults(maxResults);
  return `${APIFY_API_BASE}/acts/${APIFY_MERCADOLIVRE_ACTOR_ID}/run-sync-get-dataset-items?format=json&limit=${cap}`;
}

function buildApifyMercadoLivreActorInput(query = "") {
  return {
    keyword: String(query || "").trim(),
    maxPages: 1,
    scrapeOfertas: false,
  };
}

/**
 * @param {unknown} payload
 */
export function extractApifyMercadoLivreDatasetItems(payload = null) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const candidates = [payload.items, payload.data, payload.results].find(Array.isArray);
    if (candidates) return candidates;
  }
  return [];
}

async function readSafeErrorBodyPreview(response = {}, token = "", maxLen = 400) {
  let body = "";

  try {
    if (typeof response.text === "function") {
      body = await response.text();
    } else if (typeof response.json === "function") {
      const data = await response.json();
      body = typeof data === "string" ? data : JSON.stringify(data);
    }
  } catch {
    body = "";
  }

  body = sanitizeForOutput(body, token);
  if (body.length > maxLen) return `${body.slice(0, maxLen)}...`;
  return body;
}

function isAbortError(err = null) {
  return (
    err?.name === "AbortError" ||
    /aborted|timeout/i.test(String(err?.message || ""))
  );
}

/**
 * @param {string} query
 * @param {number} [maxResults]
 * @param {{
 *   env?: Record<string, string|undefined>,
 *   fetcher?: typeof fetch,
 *   timeoutMs?: number,
 * }} [options]
 */
export async function searchApifyMercadoLivreProducts(
  query = "",
  maxResults = DEFAULT_MAX_RESULTS,
  options = {}
) {
  const env = options.env || process.env;
  const fetcher = options.fetcher || globalThis.fetch;
  const costGuardContext = options.costGuardContext || null;
  const invocationLayer = options.invocationLayer || "apify_mercadolivre_client";

  return executeCommercialRequestWithDeduplication({
    providerId: PROVIDER_COST_GUARD_PROVIDER_IDS.APIFY_MERCADOLIVRE,
    query,
    limit: maxResults,
    costGuardContext,
    commercialRequestDedupContext: options.commercialRequestDedupContext || null,
    invocationSource: invocationLayer,
    layer: invocationLayer,
    execute: async () =>
      executeWithUniversalCommercialCache({
        providerId: PROVIDER_COST_GUARD_PROVIDER_IDS.APIFY_MERCADOLIVRE,
        query,
        limit: maxResults,
        costGuardContext,
        invocationSource: invocationLayer,
        layer: invocationLayer,
        env,
        execute: async () => {
          const guardDecision = evaluateProviderCostGuardForProvider(
            PROVIDER_COST_GUARD_PROVIDER_IDS.APIFY_MERCADOLIVRE,
            {
              ...(costGuardContext || {}),
              providerId: PROVIDER_COST_GUARD_PROVIDER_IDS.APIFY_MERCADOLIVRE,
              skipCostGuard: options.skipCostGuard === true,
              env,
            }
          );

          if (!guardDecision.shouldCallProvider) {
            return {
              ...buildProviderCostGuardBlockedResult(
                PROVIDER_COST_GUARD_PROVIDER_IDS.APIFY_MERCADOLIVRE,
                guardDecision,
                {
                  provider: APIFY_MERCADOLIVRE_SOURCE,
                  hasToken: validateApifyMercadoLivreEnv(env).hasToken,
                  maxResults: clampApifyMaxResults(maxResults),
                }
              ),
              costGuardDecision: guardDecision,
            };
          }

          const validation = validateApifyMercadoLivreEnv(env);
          const config = readEnv(env);
          const cap = clampApifyMaxResults(maxResults);
          const timeoutMs = Number.isFinite(options.timeoutMs)
            ? Math.max(1_000, options.timeoutMs)
            : DEFAULT_TIMEOUT_MS;

          if (!validation.ok) {
            return {
              ok: false,
              products: [],
              error: "missing_env",
              missing: validation.missing,
              count: 0,
              provider: APIFY_MERCADOLIVRE_SOURCE,
              hasToken: false,
              maxResults: cap,
            };
          }

          const trimmedQuery = String(query || "").trim();
          if (!trimmedQuery) {
            return {
              ok: false,
              products: [],
              error: "missing_query",
              count: 0,
              provider: APIFY_MERCADOLIVRE_SOURCE,
              hasToken: true,
              maxResults: cap,
            };
          }

          const url = buildApifyMercadoLivreRunUrl(env, cap);

          return executeCommercialProviderProtectedFetch({
            providerId: PROVIDER_COST_GUARD_PROVIDER_IDS.APIFY_MERCADOLIVRE,
            invocationSource: invocationLayer,
            env,
            extraBlockedFields: {
              provider: APIFY_MERCADOLIVRE_SOURCE,
              hasToken: true,
              maxResults: cap,
            },
            executeExternalFetch: async () => {
              const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
              const timeoutId = controller
                ? setTimeout(() => controller.abort(), timeoutMs)
                : null;

              try {
                const response = await fetcher(url, {
                  method: "POST",
                  headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${config.token}`,
                  },
                  body: JSON.stringify(buildApifyMercadoLivreActorInput(trimmedQuery)),
                  signal: controller?.signal,
                });

                if (!response?.ok) {
                  const safeErrorBodyPreview = await readSafeErrorBodyPreview(response, config.token);
                  return {
                    ok: false,
                    products: [],
                    error: "http_error",
                    count: 0,
                    provider: APIFY_MERCADOLIVRE_SOURCE,
                    hasToken: true,
                    maxResults: cap,
                    httpStatus: response?.status ?? 0,
                    httpStatusText: String(response?.statusText || "").trim(),
                    safeErrorBodyPreview,
                    requestUrl: sanitizeForOutput(url, config.token),
                  };
                }

                const payload = await response.json();
                const rawItems = extractApifyMercadoLivreDatasetItems(payload);
                const products = mapApifyMercadoLivreItemsToNormalizedProducts(rawItems, cap);

                if (!products.length) {
                  return {
                    ok: false,
                    products: [],
                    error: "empty_response",
                    count: 0,
                    provider: APIFY_MERCADOLIVRE_SOURCE,
                    hasToken: true,
                    maxResults: cap,
                    query: trimmedQuery,
                    requestUrl: sanitizeForOutput(url, config.token),
                    rawItemCount: rawItems.length,
                  };
                }

                return {
                  ok: true,
                  products,
                  error: null,
                  count: products.length,
                  provider: APIFY_MERCADOLIVRE_SOURCE,
                  hasToken: true,
                  maxResults: cap,
                  query: trimmedQuery,
                  requestUrl: sanitizeForOutput(url, config.token),
                  rawItemCount: rawItems.length,
                };
              } catch (err) {
                if (isAbortError(err)) {
                  return {
                    ok: false,
                    products: [],
                    error: "timeout",
                    count: 0,
                    provider: APIFY_MERCADOLIVRE_SOURCE,
                    hasToken: true,
                    maxResults: cap,
                    query: trimmedQuery,
                    requestUrl: sanitizeForOutput(url, config.token),
                  };
                }

                return {
                  ok: false,
                  products: [],
                  error: "provider_error",
                  message: sanitizeForOutput(err?.message || "provider_error", config.token),
                  count: 0,
                  provider: APIFY_MERCADOLIVRE_SOURCE,
                  hasToken: true,
                  maxResults: cap,
                  query: trimmedQuery,
                  requestUrl: sanitizeForOutput(url, config.token),
                };
              } finally {
                if (timeoutId) clearTimeout(timeoutId);
              }
            },
          });
        },
      }),
  });
}
