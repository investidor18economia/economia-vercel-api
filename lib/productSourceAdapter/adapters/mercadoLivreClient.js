/**
 * PATCH Comercial 2B — Mercado Livre real client (isolado, sem plug na MIA)
 *
 * Busca pública via /sites/{siteId}/search.
 * OAuth env vars são validadas para readiness; secret nunca entra em logs/output.
 */

const ML_API_BASE = "https://api.mercadolibre.com";
const DEFAULT_SITE_ID = "MLB";
const MAX_SEARCH_LIMIT = 50;

const ENV_KEYS = Object.freeze([
  "MERCADOLIVRE_CLIENT_ID",
  "MERCADOLIVRE_CLIENT_SECRET",
  "MERCADOLIVRE_REDIRECT_URI",
]);

function readEnv(env = process.env) {
  return {
    clientId: String(env?.MERCADOLIVRE_CLIENT_ID || "").trim(),
    clientSecret: String(env?.MERCADOLIVRE_CLIENT_SECRET || "").trim(),
    redirectUri: String(env?.MERCADOLIVRE_REDIRECT_URI || "").trim(),
    siteId: String(env?.MERCADOLIVRE_SITE_ID || DEFAULT_SITE_ID).trim() || DEFAULT_SITE_ID,
    accessToken: String(env?.MERCADOLIVRE_ACCESS_TOKEN || "").trim(),
  };
}

function clampLimit(limit = 12) {
  const parsed = Number.parseInt(String(limit), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 12;
  return Math.min(parsed, MAX_SEARCH_LIMIT);
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
export function validateMercadoLivreEnv(env = process.env) {
  const config = readEnv(env);
  const missing = [];

  for (const key of ENV_KEYS) {
    const value = String(env?.[key] || "").trim();
    if (!value) missing.push(key);
  }

  return {
    ok: missing.length === 0,
    missing,
    siteId: config.siteId,
    hasClientId: !!config.clientId,
    hasClientSecret: !!config.clientSecret,
    hasRedirectUri: !!config.redirectUri,
    hasAccessToken: !!config.accessToken,
  };
}

export function hasMercadoLivreAccessToken(env = process.env) {
  return !!readEnv(env).accessToken;
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
export function buildMercadoLivreRequestHeaders(env = process.env) {
  const config = readEnv(env);
  const headers = {
    Accept: "application/json",
  };

  if (config.accessToken) {
    headers.Authorization = `Bearer ${config.accessToken}`;
  }

  return headers;
}

function sanitizeMercadoLivreSensitiveOutput(value = "", config = readEnv()) {
  let safe = sanitizeForOutput(value, config.clientSecret);
  safe = sanitizeForOutput(safe, config.accessToken);
  safe = sanitizeForOutput(safe, config.clientId);
  return safe;
}

/**
 * @param {string} query
 * @param {number} [limit]
 * @param {Record<string, string|undefined>} [env]
 */
export function buildMercadoLivreSearchUrl(query = "", limit = 12, env = process.env) {
  const config = readEnv(env);
  const siteId = config.siteId || DEFAULT_SITE_ID;
  const cap = clampLimit(limit);
  const q = encodeURIComponent(String(query || "").trim());
  return `${ML_API_BASE}/sites/${siteId}/search?q=${q}&limit=${cap}`;
}

/**
 * @param {string} query
 * @param {number} [limit]
 * @param {Record<string, string|undefined>} [env]
 */
export function buildMercadoLivreProductsSearchUrl(query = "", limit = 12, env = process.env) {
  const config = readEnv(env);
  const siteId = config.siteId || DEFAULT_SITE_ID;
  const cap = clampLimit(limit);
  const q = encodeURIComponent(String(query || "").trim());
  return `${ML_API_BASE}/products/search?site_id=${encodeURIComponent(siteId)}&q=${q}&limit=${cap}`;
}

/**
 * @param {unknown} response
 * @returns {Record<string, unknown>[]}
 */
export function mapMercadoLivreApiResponseToItems(response = null) {
  if (!response || typeof response !== "object") return [];

  const results = Array.isArray(response.results) ? response.results : [];

  return results
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      id: item.id ?? null,
      title: item.title ?? "",
      price: item.price ?? null,
      currency_id: item.currency_id ?? "BRL",
      permalink: item.permalink ?? null,
      thumbnail: item.thumbnail ?? null,
      condition: item.condition ?? null,
      available_quantity: item.available_quantity ?? null,
      seller:
        item.seller && typeof item.seller === "object"
          ? {
              id: item.seller.id ?? null,
              nickname: item.seller.nickname ?? null,
            }
          : null,
      shipping:
        item.shipping && typeof item.shipping === "object"
          ? {
              free_shipping: !!item.shipping.free_shipping,
              mode: item.shipping.mode ?? null,
            }
          : null,
      attributes: Array.isArray(item.attributes)
        ? item.attributes.map((attr) => ({
            id: attr?.id ?? null,
            name: attr?.name ?? null,
            value_name: attr?.value_name ?? null,
          }))
        : [],
      category_id: item.category_id ?? null,
    }));
}

/**
 * @param {unknown} response
 * @returns {Record<string, unknown>[]}
 */
export function mapMercadoLivreCatalogApiResponseToItems(response = null) {
  if (!response || typeof response !== "object") return [];

  const results = Array.isArray(response.results) ? response.results : [];

  return results
    .filter((product) => product && typeof product === "object")
    .map((product) => {
      const picture =
        product.thumbnail ||
        product.picture ||
        (Array.isArray(product.pictures) && product.pictures.length
          ? product.pictures[0]?.secure_url || product.pictures[0]?.url
          : null);

      return {
        id: product.id ?? null,
        title: product.name || product.title || "",
        price:
          product.price ??
          product.buy_box_winner?.price ??
          product.suggested_price ??
          null,
        currency_id: product.currency_id ?? "BRL",
        permalink: product.permalink || product.url || null,
        thumbnail: picture,
        condition: product.condition ?? null,
        available_quantity: product.available_quantity ?? null,
        seller: null,
        shipping: null,
        attributes: Array.isArray(product.attributes)
          ? product.attributes.map((attr) => ({
              id: attr?.id ?? null,
              name: attr?.name ?? null,
              value_name: attr?.value_name ?? null,
            }))
          : [],
        category_id: product.domain_id || product.category_id || null,
        catalog_product: true,
      };
    });
}

async function executeMercadoLivreSearchRequest({
  url,
  env,
  fetcher,
  config,
  cap,
  trimmedQuery,
  mapResponse,
}) {
  try {
    const response = await fetcher(url, {
      method: "GET",
      headers: buildMercadoLivreRequestHeaders(env),
    });

    if (!response?.ok) {
      const safeErrorBodyPreview = await readSafeErrorBodyPreview(response, config);
      return {
        ok: false,
        items: [],
        error: "http_error",
        count: 0,
        ...buildMercadoLivreHttpErrorDiagnostics(
          response?.status ?? 0,
          url,
          safeErrorBodyPreview,
          config,
          response?.statusText
        ),
      };
    }

    const payload = await response.json();
    const items = mapResponse(payload).slice(0, cap);

    if (!items.length) {
      return {
        ok: false,
        items: [],
        error: "empty_response",
        count: 0,
        requestUrl: sanitizeRequestUrl(url, config),
      };
    }

    return {
      ok: true,
      items,
      error: null,
      count: items.length,
      siteId: config.siteId,
      query: trimmedQuery,
      requestUrl: sanitizeRequestUrl(url, config),
    };
  } catch (err) {
    const message = sanitizeMercadoLivreSensitiveOutput(
      err?.message || "provider_error",
      config
    );
    return {
      ok: false,
      items: [],
      error: "provider_error",
      message,
      count: 0,
      requestUrl: sanitizeRequestUrl(url, config),
    };
  }
}

function sanitizeForOutput(value = "", secret = "") {
  const text = String(value || "");
  if (!secret) return text;
  return text.split(secret).join("[REDACTED]");
}

function sanitizeRequestUrl(url = "", env = process.env) {
  return sanitizeMercadoLivreSensitiveOutput(String(url || ""), readEnv(env));
}

/**
 * @param {{
 *   text?: () => Promise<string>,
 *   json?: () => Promise<unknown>,
 * }} response
 * @param {ReturnType<typeof readEnv>} config
 * @param {number} [maxLen]
 */
async function readSafeErrorBodyPreview(response = {}, config = readEnv(), maxLen = 400) {
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

  body = sanitizeMercadoLivreSensitiveOutput(body, config);

  if (body.length > maxLen) {
    return `${body.slice(0, maxLen)}...`;
  }

  return body;
}

/**
 * @param {number} status
 * @param {string} url
 * @param {Awaited<ReturnType<typeof readSafeErrorBodyPreview>>} safeErrorBodyPreview
 * @param {ReturnType<typeof readEnv>} config
 * @param {string} [statusText]
 */
export function buildMercadoLivreHttpErrorDiagnostics(
  status = 0,
  url = "",
  safeErrorBodyPreview = "",
  config = readEnv(),
  statusText = ""
) {
  return {
    httpStatus: status,
    httpStatusText: String(statusText || "").trim(),
    safeErrorBodyPreview: String(safeErrorBodyPreview || ""),
    requestUrl: sanitizeRequestUrl(url, config),
    status,
  };
}

/**
 * @param {string} query
 * @param {number} [limit]
 * @param {{
 *   env?: Record<string, string|undefined>,
 *   fetcher?: (url: string, init?: RequestInit) => Promise<{ ok: boolean, status?: number, json: () => Promise<unknown> }>,
 * }} [options]
 */
export async function searchMercadoLivreProducts(query = "", limit = 12, options = {}) {
  const env = options.env || process.env;
  const fetcher = options.fetcher || globalThis.fetch;
  const validation = validateMercadoLivreEnv(env);
  const config = readEnv(env);
  const cap = clampLimit(limit);

  if (!validation.ok) {
    return {
      ok: false,
      items: [],
      error: "missing_env",
      missing: validation.missing,
      count: 0,
    };
  }

  const trimmedQuery = String(query || "").trim();
  if (!trimmedQuery) {
    return {
      ok: false,
      items: [],
      error: "missing_query",
      count: 0,
    };
  }

  const url = buildMercadoLivreSearchUrl(trimmedQuery, cap, env);

  return executeMercadoLivreSearchRequest({
    url,
    env,
    fetcher,
    config,
    cap,
    trimmedQuery,
    mapResponse: mapMercadoLivreApiResponseToItems,
  });
}

/**
 * @param {string} query
 * @param {number} [limit]
 * @param {{
 *   env?: Record<string, string|undefined>,
 *   fetcher?: (url: string, init?: RequestInit) => Promise<{ ok: boolean, status?: number, json: () => Promise<unknown> }>,
 * }} [options]
 */
export async function searchMercadoLivreCatalogProducts(query = "", limit = 12, options = {}) {
  const env = options.env || process.env;
  const fetcher = options.fetcher || globalThis.fetch;
  const validation = validateMercadoLivreEnv(env);
  const config = readEnv(env);
  const cap = clampLimit(limit);

  if (!validation.ok) {
    return {
      ok: false,
      items: [],
      error: "missing_env",
      missing: validation.missing,
      count: 0,
    };
  }

  const trimmedQuery = String(query || "").trim();
  if (!trimmedQuery) {
    return {
      ok: false,
      items: [],
      error: "missing_query",
      count: 0,
    };
  }

  const url = buildMercadoLivreProductsSearchUrl(trimmedQuery, cap, env);

  return executeMercadoLivreSearchRequest({
    url,
    env,
    fetcher,
    config,
    cap,
    trimmedQuery,
    mapResponse: mapMercadoLivreCatalogApiResponseToItems,
  });
}

function normalizeMercadoLivreProductId(productId = "") {
  return String(productId || "").trim();
}

export function buildMercadoLivreProductUrl(productId = "") {
  const id = normalizeMercadoLivreProductId(productId);
  return `${ML_API_BASE}/products/${encodeURIComponent(id)}`;
}

export function buildMercadoLivreProductItemsUrl(productId = "") {
  const id = normalizeMercadoLivreProductId(productId);
  return `${ML_API_BASE}/products/${encodeURIComponent(id)}/items`;
}

/**
 * @param {unknown} payload
 */
export function mapMercadoLivreProductDetailResponse(payload = null) {
  if (!payload || typeof payload !== "object") return null;

  const pictures = Array.isArray(payload.pictures)
    ? payload.pictures
        .map((picture) => picture?.secure_url || picture?.url || null)
        .filter(Boolean)
    : [];

  return {
    id: payload.id ?? null,
    name: payload.name || payload.title || "",
    domain_id: payload.domain_id || payload.category_id || null,
    pictures,
    attributes: Array.isArray(payload.attributes) ? payload.attributes : [],
    status: payload.status ?? null,
  };
}

/**
 * @param {unknown} payload
 * @returns {Record<string, unknown>[]}
 */
export function mapMercadoLivreProductItemsResponse(payload = null) {
  if (!payload) return [];

  if (Array.isArray(payload)) {
    return payload
      .map((entry) => mapMercadoLivreProductItemEntry(entry))
      .filter(Boolean);
  }

  const collections = [payload.results, payload.items, payload.entries].find(Array.isArray);
  if (!collections) return [];

  return collections
    .map((entry) => mapMercadoLivreProductItemEntry(entry))
    .filter(Boolean);
}

function mapMercadoLivreProductItemEntry(entry = null) {
  if (entry == null) return null;

  if (typeof entry === "string" || typeof entry === "number") {
    return {
      id: String(entry),
      title: "",
      price: null,
      currency_id: "BRL",
      permalink: null,
      thumbnail: null,
      condition: null,
      seller: null,
    };
  }

  if (typeof entry !== "object") return null;

  return {
    id: entry.id ?? entry.item_id ?? null,
    title: entry.title || entry.name || "",
    price: entry.price ?? entry.base_price ?? null,
    currency_id: entry.currency_id ?? "BRL",
    permalink: entry.permalink ?? null,
    thumbnail: entry.thumbnail ?? entry.secure_thumbnail ?? null,
    condition: entry.condition ?? null,
    seller:
      entry.seller && typeof entry.seller === "object"
        ? {
            id: entry.seller.id ?? null,
            nickname: entry.seller.nickname ?? null,
          }
        : null,
  };
}

export function mapMercadoLivreProductDetailToNormalizedRaw(product = null) {
  if (!product) return null;

  return {
    id: product.id,
    title: product.name,
    thumbnail: product.pictures?.[0] ?? null,
    category_id: product.domain_id,
    attributes: product.attributes,
    catalog_product: true,
  };
}

export function mapMercadoLivreProductItemToNormalizedRaw(item = null) {
  if (!item) return null;

  return {
    id: item.id,
    title: item.title,
    price: item.price,
    currency_id: item.currency_id,
    permalink: item.permalink,
    thumbnail: item.thumbnail,
    condition: item.condition,
    seller: item.seller,
  };
}

async function executeMercadoLivreJsonGet({ url, env, fetcher, config }) {
  try {
    const response = await fetcher(url, {
      method: "GET",
      headers: buildMercadoLivreRequestHeaders(env),
    });

    if (!response?.ok) {
      const safeErrorBodyPreview = await readSafeErrorBodyPreview(response, config);
      return {
        ok: false,
        payload: null,
        error: "http_error",
        ...buildMercadoLivreHttpErrorDiagnostics(
          response?.status ?? 0,
          url,
          safeErrorBodyPreview,
          config,
          response?.statusText
        ),
      };
    }

    const payload = await response.json();
    return {
      ok: true,
      payload,
      error: null,
      requestUrl: sanitizeRequestUrl(url, config),
    };
  } catch (err) {
    return {
      ok: false,
      payload: null,
      error: "provider_error",
      message: sanitizeMercadoLivreSensitiveOutput(err?.message || "provider_error", config),
      requestUrl: sanitizeRequestUrl(url, config),
    };
  }
}

/**
 * @param {string} productId
 * @param {{
 *   env?: Record<string, string|undefined>,
 *   fetcher?: Function,
 * }} [options]
 */
export async function getMercadoLivreProductById(productId = "", options = {}) {
  const env = options.env || process.env;
  const fetcher = options.fetcher || globalThis.fetch;
  const validation = validateMercadoLivreEnv(env);
  const config = readEnv(env);
  const id = normalizeMercadoLivreProductId(productId);

  if (!validation.ok) {
    return {
      ok: false,
      error: "missing_env",
      missing: validation.missing,
      productId: id,
    };
  }

  if (!id) {
    return {
      ok: false,
      error: "missing_product_id",
      productId: "",
    };
  }

  const url = buildMercadoLivreProductUrl(id);
  const response = await executeMercadoLivreJsonGet({ url, env, fetcher, config });
  if (!response.ok) {
    return {
      ...response,
      productId: id,
    };
  }

  const product = mapMercadoLivreProductDetailResponse(response.payload);
  if (!product?.id) {
    return {
      ok: false,
      error: "empty_response",
      productId: id,
      requestUrl: response.requestUrl,
    };
  }

  return {
    ok: true,
    error: null,
    productId: product.id,
    productName: product.name,
    productPictures: product.pictures,
    product,
    requestUrl: response.requestUrl,
  };
}

/**
 * @param {string} productId
 * @param {{
 *   env?: Record<string, string|undefined>,
 *   fetcher?: Function,
 * }} [options]
 */
export async function getMercadoLivreProductItemsById(productId = "", options = {}) {
  const env = options.env || process.env;
  const fetcher = options.fetcher || globalThis.fetch;
  const validation = validateMercadoLivreEnv(env);
  const config = readEnv(env);
  const id = normalizeMercadoLivreProductId(productId);

  if (!validation.ok) {
    return {
      ok: false,
      error: "missing_env",
      missing: validation.missing,
      productId: id,
      items: [],
      count: 0,
    };
  }

  if (!id) {
    return {
      ok: false,
      error: "missing_product_id",
      productId: "",
      items: [],
      count: 0,
    };
  }

  const url = buildMercadoLivreProductItemsUrl(id);
  const response = await executeMercadoLivreJsonGet({ url, env, fetcher, config });
  if (!response.ok) {
    return {
      ...response,
      productId: id,
      items: [],
      count: 0,
    };
  }

  const items = mapMercadoLivreProductItemsResponse(response.payload);
  return {
    ok: true,
    error: null,
    productId: id,
    items,
    count: items.length,
    requestUrl: response.requestUrl,
  };
}

function pickMercadoLivreProbeDiagnostics(result = {}) {
  if (!result || result.ok) return null;
  return {
    error: result.error ?? null,
    httpStatus: result.httpStatus ?? null,
    httpStatusText: result.httpStatusText ?? null,
    safeErrorBodyPreview: result.safeErrorBodyPreview ?? null,
    requestUrl: result.requestUrl ?? null,
    message: result.message ?? null,
  };
}

function extractMercadoLivreProbePrices(items = []) {
  return items
    .map((item) => item?.price)
    .filter((price) => price != null && price !== "");
}

/**
 * @param {string} productId
 * @param {{ env?: Record<string, string|undefined>, fetcher?: Function, sampleLimit?: number }} [options]
 */
export async function probeMercadoLivreProductFlow(productId = "", options = {}) {
  const sampleLimit = Number.isFinite(options.sampleLimit) ? Math.max(1, options.sampleLimit) : 5;
  const productResult = await getMercadoLivreProductById(productId, options);
  const itemsResult = await getMercadoLivreProductItemsById(productId, options);
  const sampleItems = (itemsResult.items || []).slice(0, sampleLimit);

  return {
    ok: productResult.ok && itemsResult.ok,
    productId: normalizeMercadoLivreProductId(productId),
    productName: productResult.productName ?? null,
    productPictures: productResult.productPictures ?? [],
    itemsCount: itemsResult.count ?? 0,
    sampleItems,
    prices: extractMercadoLivreProbePrices(sampleItems),
    productDiagnostics: pickMercadoLivreProbeDiagnostics(productResult),
    itemsDiagnostics: pickMercadoLivreProbeDiagnostics(itemsResult),
  };
}

export function redactMercadoLivreSecrets(value = "", env = process.env) {
  return sanitizeMercadoLivreSensitiveOutput(value, readEnv(env));
}
