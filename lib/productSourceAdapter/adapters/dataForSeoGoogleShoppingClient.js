/**
 * SERVER-ONLY — DO NOT IMPORT FROM CLIENT COMPONENTS
 *
 * PATCH Comercial 05L.2 — DataForSEO Google Shopping / Merchant API client
 *
 * Standard execution model: task_post → poll task_get/advanced → parse items.
 * Neutral B2B data provider — no affiliate fields influence downstream logic.
 */

import axios from "axios";
import { COMMERCIAL_PROVIDER_IDS } from "../commercialProviderRegistry.js";

export const DATAFORSEO_GOOGLE_SHOPPING_CLIENT_VERSION = "05L.2";

export const DATAFORSEO_API_BASE = "https://api.dataforseo.com";
export const DATAFORSEO_TASK_POST_PATH = "/v3/merchant/google/products/task_post";
export const DATAFORSEO_TASK_GET_PATH = "/v3/merchant/google/products/task_get/advanced";

export const DATAFORSEO_BRAZIL_LOCATION_CODE = 2076;
export const DATAFORSEO_BRAZIL_LANGUAGE_CODE = "pt";
export const DATAFORSEO_DEFAULT_SE_DOMAIN = "google.com.br";

export const DATAFORSEO_LOGIN_ENV = "DATAFORSEO_LOGIN";
export const DATAFORSEO_PASSWORD_ENV = "DATAFORSEO_PASSWORD";
export const DATAFORSEO_LOCATION_CODE_ENV = "DATAFORSEO_LOCATION_CODE";
export const DATAFORSEO_LANGUAGE_CODE_ENV = "DATAFORSEO_LANGUAGE_CODE";
export const DATAFORSEO_POLL_INTERVAL_MS_ENV = "DATAFORSEO_POLL_INTERVAL_MS";
export const DATAFORSEO_POLL_MAX_MS_ENV = "DATAFORSEO_POLL_MAX_MS";
export const DATAFORSEO_REQUEST_TIMEOUT_MS_ENV = "DATAFORSEO_REQUEST_TIMEOUT_MS";

export const DATAFORSEO_TASK_STATUS = Object.freeze({
  CREATED: 20100,
  OK: 20000,
  HANDED: 40601,
  IN_QUEUE: 40602,
  AUTH_FAILED: 40100,
  NO_RESULTS: 40102,
  TASK_FAILED: 40103,
  RATE_LIMITED: 40202,
  PAYMENT_REQUIRED: 40200,
  INSUFFICIENT_FUNDS: 40210,
});

export const DATAFORSEO_REASON_CODES = Object.freeze({
  NOT_CONFIGURED: "dataforseo_not_configured",
  AUTH_FAILED: "dataforseo_auth_failed",
  RATE_LIMITED: "dataforseo_rate_limited",
  TIMEOUT: "dataforseo_timeout",
  TASK_CREATED: "dataforseo_task_created",
  TASK_PENDING: "dataforseo_task_pending",
  TASK_FAILED: "dataforseo_task_failed",
  POLLING_TIMEOUT: "dataforseo_polling_timeout",
  INVALID_PAYLOAD: "dataforseo_invalid_payload",
  EMPTY_RESULT: "dataforseo_empty_result",
  HTTP_ERROR: "dataforseo_http_error",
  PROVIDER_ERROR: "dataforseo_provider_error",
  SUCCESS: "dataforseo_success",
});

const DEFAULT_REQUEST_TIMEOUT_MS = 12_000;
const DEFAULT_POLL_INTERVAL_MS = 1_500;
const DEFAULT_POLL_MAX_MS = 25_000;
const DEFAULT_DEPTH = 40;

const PENDING_TASK_STATUS_CODES = new Set([
  DATAFORSEO_TASK_STATUS.HANDED,
  DATAFORSEO_TASK_STATUS.IN_QUEUE,
]);

const SECRET_ENV_KEYS = Object.freeze([
  DATAFORSEO_LOGIN_ENV,
  DATAFORSEO_PASSWORD_ENV,
]);

function cleanText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isHttpUrl(value = "") {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
export function readDataForSeoClientConfig(env = process.env) {
  return {
    login: cleanText(env?.[DATAFORSEO_LOGIN_ENV] || ""),
    password: cleanText(env?.[DATAFORSEO_PASSWORD_ENV] || ""),
    locationCode: parsePositiveInt(
      env?.[DATAFORSEO_LOCATION_CODE_ENV],
      DATAFORSEO_BRAZIL_LOCATION_CODE
    ),
    languageCode: cleanText(env?.[DATAFORSEO_LANGUAGE_CODE_ENV] || DATAFORSEO_BRAZIL_LANGUAGE_CODE),
    seDomain: DATAFORSEO_DEFAULT_SE_DOMAIN,
    requestTimeoutMs: parsePositiveInt(
      env?.[DATAFORSEO_REQUEST_TIMEOUT_MS_ENV],
      DEFAULT_REQUEST_TIMEOUT_MS
    ),
    pollIntervalMs: parsePositiveInt(
      env?.[DATAFORSEO_POLL_INTERVAL_MS_ENV],
      DEFAULT_POLL_INTERVAL_MS
    ),
    pollMaxMs: parsePositiveInt(env?.[DATAFORSEO_POLL_MAX_MS_ENV], DEFAULT_POLL_MAX_MS),
  };
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
export function validateDataForSeoEnv(env = process.env) {
  const config = readDataForSeoClientConfig(env);
  const missing = [];
  if (!config.login) missing.push(DATAFORSEO_LOGIN_ENV);
  if (!config.password) missing.push(DATAFORSEO_PASSWORD_ENV);

  return {
    ok: missing.length === 0,
    missing,
    hasLogin: !!config.login,
    hasPassword: !!config.password,
    locationCode: config.locationCode,
    languageCode: config.languageCode,
  };
}

/**
 * @param {unknown} value
 */
export function redactDataForSeoSecrets(value) {
  if (value == null) return value;

  if (typeof value === "string") {
    let text = value;
    for (const key of SECRET_ENV_KEYS) {
      const secret = cleanText(process.env?.[key] || "");
      if (secret.length >= 4) {
        text = text.split(secret).join("[REDACTED]");
      }
    }
    text = text.replace(/Basic\s+[A-Za-z0-9+/=]+/gi, "Basic [REDACTED]");
    return text;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactDataForSeoSecrets(entry));
  }

  if (typeof value === "object") {
    const next = {};
    for (const [key, entry] of Object.entries(value)) {
      if (/password|authorization|login|credential|secret|token/i.test(key)) {
        next[key] = "[REDACTED]";
      } else {
        next[key] = redactDataForSeoSecrets(entry);
      }
    }
    return next;
  }

  return value;
}

/**
 * @param {Record<string, unknown>} diagnostics
 */
export function buildDataForSeoSanitizedDiagnostics(diagnostics = {}) {
  return redactDataForSeoSecrets({
    version: DATAFORSEO_GOOGLE_SHOPPING_CLIENT_VERSION,
    providerId: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO,
    ...diagnostics,
  });
}

function buildAuthHeader(login = "", password = "") {
  const token = Buffer.from(`${login}:${password}`, "utf8").toString("base64");
  return `Basic ${token}`;
}

function resolveDepth(limit = 12) {
  const parsed = Number.parseInt(String(limit ?? 12), 10);
  const bounded = Number.isFinite(parsed) && parsed > 0 ? parsed : 12;
  return Math.min(Math.max(bounded, 10), DEFAULT_DEPTH);
}

function extractTask(payload = {}) {
  const tasks = Array.isArray(payload?.tasks) ? payload.tasks : [];
  return tasks[0] || null;
}

function classifyTaskStatusCode(statusCode = 0) {
  const code = Number(statusCode);
  if (code === DATAFORSEO_TASK_STATUS.OK) return DATAFORSEO_REASON_CODES.SUCCESS;
  if (code === DATAFORSEO_TASK_STATUS.CREATED) return DATAFORSEO_REASON_CODES.TASK_CREATED;
  if (PENDING_TASK_STATUS_CODES.has(code)) return DATAFORSEO_REASON_CODES.TASK_PENDING;
  if (code === DATAFORSEO_TASK_STATUS.AUTH_FAILED) return DATAFORSEO_REASON_CODES.AUTH_FAILED;
  if (code === DATAFORSEO_TASK_STATUS.RATE_LIMITED) return DATAFORSEO_REASON_CODES.RATE_LIMITED;
  if (code === DATAFORSEO_TASK_STATUS.TASK_FAILED) return DATAFORSEO_REASON_CODES.TASK_FAILED;
  if (code === DATAFORSEO_TASK_STATUS.NO_RESULTS) return DATAFORSEO_REASON_CODES.EMPTY_RESULT;
  if (
    code === DATAFORSEO_TASK_STATUS.PAYMENT_REQUIRED ||
    code === DATAFORSEO_TASK_STATUS.INSUFFICIENT_FUNDS
  ) {
    return DATAFORSEO_REASON_CODES.PROVIDER_ERROR;
  }
  return DATAFORSEO_REASON_CODES.PROVIDER_ERROR;
}

function mapReasonToRuntimeError(reasonCode = "") {
  switch (reasonCode) {
    case DATAFORSEO_REASON_CODES.AUTH_FAILED:
      return "auth_failed";
    case DATAFORSEO_REASON_CODES.RATE_LIMITED:
      return "rate_limited";
    case DATAFORSEO_REASON_CODES.TIMEOUT:
    case DATAFORSEO_REASON_CODES.POLLING_TIMEOUT:
      return "timeout";
    case DATAFORSEO_REASON_CODES.EMPTY_RESULT:
      return "rate_limited_or_empty";
    case DATAFORSEO_REASON_CODES.INVALID_PAYLOAD:
      return "invalid_response";
    case DATAFORSEO_REASON_CODES.TASK_FAILED:
    case DATAFORSEO_REASON_CODES.PROVIDER_ERROR:
    case DATAFORSEO_REASON_CODES.HTTP_ERROR:
      return "provider_error";
    default:
      return "provider_error";
  }
}

function parseRatingValue(productRating = null) {
  if (!productRating || typeof productRating !== "object") return null;
  const raw = productRating.value;
  if (raw == null || raw === "") return null;
  const parsed = Number.parseFloat(String(raw));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseReviewCount(item = {}, productRating = null) {
  const direct = Number.parseInt(String(item?.reviews_count ?? ""), 10);
  if (Number.isFinite(direct) && direct >= 0) return direct;
  const votes = Number.parseInt(String(productRating?.votes_count ?? ""), 10);
  return Number.isFinite(votes) && votes >= 0 ? votes : null;
}

function resolveProductLink(item = {}) {
  const candidates = [item.shopping_url, item.url, item.product_url];
  for (const candidate of candidates) {
    if (isHttpUrl(candidate)) return String(candidate).trim();
  }
  return null;
}

function resolveProductImage(item = {}) {
  const images = Array.isArray(item?.product_images) ? item.product_images : [];
  for (const image of images) {
    if (isHttpUrl(image)) return String(image).trim();
  }
  return null;
}

function isPaidShoppingItemType(type = "") {
  const normalized = cleanText(type).toLowerCase();
  return (
    normalized === "google_shopping_paid" ||
    normalized.includes("sponsored") ||
    normalized.includes("paid")
  );
}

/**
 * @param {Record<string, unknown>} item
 * @param {{ sponsored?: boolean, itemType?: string }} [meta]
 */
export function mapDataForSeoShoppingItemToNormalizedRaw(item = {}, meta = {}) {
  if (!item || typeof item !== "object") return null;

  const title = cleanText(item.title || item.product_title || "");
  const seller = cleanText(item.seller || "");
  const link = resolveProductLink(item);
  const thumbnail = resolveProductImage(item);
  const numericPrice =
    typeof item.price === "number" && Number.isFinite(item.price) ? item.price : null;
  const currency = cleanText(item.currency || "BRL").toUpperCase() || "BRL";
  const productRating = item.product_rating || null;
  const rating = parseRatingValue(productRating);
  const reviewCount = parseReviewCount(item, productRating);
  const originalPrice =
    typeof item.old_price === "number" && Number.isFinite(item.old_price)
      ? item.old_price
      : null;

  if (!title || title.length < 4) return null;
  if (numericPrice == null || numericPrice <= 0) return null;
  if (!link) return null;
  if (!seller) return null;
  if (currency !== "BRL") return null;

  return {
    product_name: title,
    price: numericPrice,
    numericPrice,
    currency,
    link,
    thumbnail,
    source: seller,
    merchant: seller,
    provider: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO,
    availability: item.delivery_info ? "available" : null,
    original_price: originalPrice,
    rating,
    review_count: reviewCount,
    externalId: cleanText(item.product_id || item.data_docid || "") || null,
    sponsored: meta.sponsored === true || isPaidShoppingItemType(meta.itemType || item.type),
    item_type: cleanText(meta.itemType || item.type || ""),
  };
}

/**
 * @param {unknown[]} items
 * @param {number} [limit]
 */
export function extractDataForSeoShoppingProducts(items = [], limit = 12) {
  const boundedLimit = Number.isFinite(limit) && limit > 0 ? limit : 12;
  const collected = [];
  const seen = new Set();

  function pushCandidate(rawItem = {}, meta = {}) {
    const mapped = mapDataForSeoShoppingItemToNormalizedRaw(rawItem, meta);
    if (!mapped) return;
    const dedupeKey = `${mapped.link}|${mapped.product_name}|${mapped.merchant}`.toLowerCase();
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    collected.push(mapped);
  }

  for (const entry of items) {
    if (!entry || typeof entry !== "object") continue;
    const type = cleanText(entry.type || "");

    if (type === "google_shopping_serp") {
      pushCandidate(entry, { itemType: type, sponsored: false });
      continue;
    }

    if (type === "google_shopping_paid") {
      pushCandidate(entry, { itemType: type, sponsored: true });
      continue;
    }

    if (Array.isArray(entry.items)) {
      for (const nested of entry.items) {
        pushCandidate(nested, {
          itemType: cleanText(nested?.type || entry.type || ""),
          sponsored: isPaidShoppingItemType(nested?.type || entry.type),
        });
      }
    }
  }

  return collected.slice(0, boundedLimit);
}

/**
 * @param {Record<string, unknown>} taskResult
 * @param {number} [limit]
 */
export function mapDataForSeoTaskResultToProducts(taskResult = {}, limit = 12) {
  const resultBlocks = Array.isArray(taskResult?.result) ? taskResult.result : [];
  const allItems = [];

  for (const block of resultBlocks) {
    if (!block || typeof block !== "object") continue;
    const items = Array.isArray(block.items) ? block.items : [];
    allItems.push(...items);
  }

  return extractDataForSeoShoppingProducts(allItems, limit);
}

async function performDataForSeoRequest({
  method = "GET",
  path = "",
  body = null,
  config = {},
  fetcher = axios,
}) {
  const url = `${DATAFORSEO_API_BASE}${path}`;
  const headers = {
    Authorization: buildAuthHeader(config.login, config.password),
    "Content-Type": "application/json",
  };

  const response = await fetcher({
    method,
    url,
    headers,
    data: body ?? undefined,
    timeout: config.requestTimeoutMs,
    validateStatus: () => true,
  });

  return {
    httpStatus: response.status,
    payload: response.data,
  };
}

/**
 * @param {{
 *   query?: string,
 *   limit?: number,
 *   env?: Record<string, string|undefined>,
 *   fetcher?: Function,
 *   sleepFn?: Function,
 *   nowFn?: Function,
 * }} [input]
 */
export async function searchDataForSeoGoogleShoppingProducts(input = {}) {
  const env = input.env || process.env;
  const config = readDataForSeoClientConfig(env);
  const fetcher = input.fetcher || axios;
  const sleepFn = input.sleepFn || sleep;
  const nowFn = input.nowFn || Date.now;
  const query = cleanText(input.query || "");
  const limit = resolveDepth(input.limit);

  const baseDiagnostics = {
    query,
    limit,
    locationCode: config.locationCode,
    languageCode: config.languageCode,
    executionModel: "merchant_task_post_poll_task_get",
  };

  const envValidation = validateDataForSeoEnv(env);
  if (!envValidation.ok) {
    return {
      ok: false,
      products: [],
      error: "missing_env",
      reasonCode: DATAFORSEO_REASON_CODES.NOT_CONFIGURED,
      count: 0,
      diagnostics: buildDataForSeoSanitizedDiagnostics({
        ...baseDiagnostics,
        missingEnvKeys: envValidation.missing,
      }),
    };
  }

  if (!query) {
    return {
      ok: false,
      products: [],
      error: "invalid_response",
      reasonCode: DATAFORSEO_REASON_CODES.INVALID_PAYLOAD,
      count: 0,
      diagnostics: buildDataForSeoSanitizedDiagnostics({
        ...baseDiagnostics,
        detail: "empty_query",
      }),
    };
  }

  let taskId = null;
  let taskPostCost = null;

  try {
    const taskPostResponse = await performDataForSeoRequest({
      method: "POST",
      path: DATAFORSEO_TASK_POST_PATH,
      body: [
        {
          keyword: query,
          location_code: config.locationCode,
          language_code: config.languageCode,
          se_domain: config.seDomain,
          depth: limit,
          device: "desktop",
          priority: 1,
        },
      ],
      config,
      fetcher,
    });

    if (taskPostResponse.httpStatus === 401 || taskPostResponse.httpStatus === 403) {
      return {
        ok: false,
        products: [],
        error: "auth_failed",
        httpStatus: taskPostResponse.httpStatus,
        reasonCode: DATAFORSEO_REASON_CODES.AUTH_FAILED,
        count: 0,
        diagnostics: buildDataForSeoSanitizedDiagnostics({
          ...baseDiagnostics,
          httpStatus: taskPostResponse.httpStatus,
        }),
      };
    }

    if (taskPostResponse.httpStatus === 429) {
      return {
        ok: false,
        products: [],
        error: "rate_limited",
        httpStatus: 429,
        reasonCode: DATAFORSEO_REASON_CODES.RATE_LIMITED,
        count: 0,
        diagnostics: buildDataForSeoSanitizedDiagnostics(baseDiagnostics),
      };
    }

    const postPayload = taskPostResponse.payload;
    const postTask = extractTask(postPayload);
    const postStatusCode = Number(postTask?.status_code ?? postPayload?.status_code ?? 0);

    if (postStatusCode === DATAFORSEO_TASK_STATUS.RATE_LIMITED) {
      return {
        ok: false,
        products: [],
        error: "rate_limited",
        reasonCode: DATAFORSEO_REASON_CODES.RATE_LIMITED,
        count: 0,
        diagnostics: buildDataForSeoSanitizedDiagnostics({
          ...baseDiagnostics,
          taskStatusCode: postStatusCode,
        }),
      };
    }

    if (postStatusCode === DATAFORSEO_TASK_STATUS.AUTH_FAILED) {
      return {
        ok: false,
        products: [],
        error: "auth_failed",
        reasonCode: DATAFORSEO_REASON_CODES.AUTH_FAILED,
        count: 0,
        diagnostics: buildDataForSeoSanitizedDiagnostics({
          ...baseDiagnostics,
          taskStatusCode: postStatusCode,
        }),
      };
    }

    taskId = cleanText(postTask?.id || "");
    taskPostCost = postTask?.cost ?? postPayload?.cost ?? null;

    if (!taskId) {
      return {
        ok: false,
        products: [],
        error: "invalid_response",
        reasonCode: DATAFORSEO_REASON_CODES.INVALID_PAYLOAD,
        count: 0,
        diagnostics: buildDataForSeoSanitizedDiagnostics({
          ...baseDiagnostics,
          taskStatusCode: postStatusCode,
          detail: "missing_task_id",
        }),
      };
    }

    const pollStartedAt = nowFn();
    let lastReasonCode = DATAFORSEO_REASON_CODES.TASK_CREATED;
    let lastTaskStatusCode = postStatusCode;

    while (nowFn() - pollStartedAt <= config.pollMaxMs) {
      const taskGetResponse = await performDataForSeoRequest({
        method: "GET",
        path: `${DATAFORSEO_TASK_GET_PATH}/${taskId}`,
        config,
        fetcher,
      });

      if (taskGetResponse.httpStatus === 401 || taskGetResponse.httpStatus === 403) {
        return {
          ok: false,
          products: [],
          error: "auth_failed",
          httpStatus: taskGetResponse.httpStatus,
          reasonCode: DATAFORSEO_REASON_CODES.AUTH_FAILED,
          taskId,
          count: 0,
          diagnostics: buildDataForSeoSanitizedDiagnostics({
            ...baseDiagnostics,
            taskId,
          }),
        };
      }

      if (taskGetResponse.httpStatus >= 500) {
        return {
          ok: false,
          products: [],
          error: "provider_error",
          httpStatus: taskGetResponse.httpStatus,
          reasonCode: DATAFORSEO_REASON_CODES.HTTP_ERROR,
          taskId,
          count: 0,
          diagnostics: buildDataForSeoSanitizedDiagnostics({
            ...baseDiagnostics,
            taskId,
            httpStatus: taskGetResponse.httpStatus,
          }),
        };
      }

      const getPayload = taskGetResponse.payload;
      const getTask = extractTask(getPayload);
      const taskStatusCode = Number(getTask?.status_code ?? 0);
      lastTaskStatusCode = taskStatusCode;
      lastReasonCode = classifyTaskStatusCode(taskStatusCode);

      if (PENDING_TASK_STATUS_CODES.has(taskStatusCode)) {
        await sleepFn(config.pollIntervalMs);
        continue;
      }

      if (taskStatusCode === DATAFORSEO_TASK_STATUS.TASK_FAILED) {
        return {
          ok: false,
          products: [],
          error: "provider_error",
          reasonCode: DATAFORSEO_REASON_CODES.TASK_FAILED,
          taskId,
          count: 0,
          diagnostics: buildDataForSeoSanitizedDiagnostics({
            ...baseDiagnostics,
            taskId,
            taskStatusCode,
          }),
        };
      }

      if (taskStatusCode === DATAFORSEO_TASK_STATUS.NO_RESULTS) {
        return {
          ok: false,
          products: [],
          error: "rate_limited_or_empty",
          reasonCode: DATAFORSEO_REASON_CODES.EMPTY_RESULT,
          taskId,
          count: 0,
          diagnostics: buildDataForSeoSanitizedDiagnostics({
            ...baseDiagnostics,
            taskId,
            taskStatusCode,
          }),
        };
      }

      if (taskStatusCode !== DATAFORSEO_TASK_STATUS.OK) {
        return {
          ok: false,
          products: [],
          error: mapReasonToRuntimeError(lastReasonCode),
          reasonCode: lastReasonCode,
          taskId,
          count: 0,
          diagnostics: buildDataForSeoSanitizedDiagnostics({
            ...baseDiagnostics,
            taskId,
            taskStatusCode,
          }),
        };
      }

      const products = mapDataForSeoTaskResultToProducts(getTask, limit);
      if (!products.length) {
        return {
          ok: false,
          products: [],
          error: "rate_limited_or_empty",
          reasonCode: DATAFORSEO_REASON_CODES.EMPTY_RESULT,
          taskId,
          count: 0,
          diagnostics: buildDataForSeoSanitizedDiagnostics({
            ...baseDiagnostics,
            taskId,
            taskStatusCode,
            taskPostCost,
          }),
        };
      }

      return {
        ok: true,
        products,
        error: null,
        reasonCode: DATAFORSEO_REASON_CODES.SUCCESS,
        taskId,
        count: products.length,
        diagnostics: buildDataForSeoSanitizedDiagnostics({
          ...baseDiagnostics,
          taskId,
          taskStatusCode,
          taskPostCost,
          resultCount: products.length,
        }),
      };
    }

    return {
      ok: false,
      products: [],
      error: "timeout",
      reasonCode: DATAFORSEO_REASON_CODES.POLLING_TIMEOUT,
      taskId,
      count: 0,
      diagnostics: buildDataForSeoSanitizedDiagnostics({
        ...baseDiagnostics,
        taskId,
        taskStatusCode: lastTaskStatusCode,
        lastReasonCode,
        pollMaxMs: config.pollMaxMs,
      }),
    };
  } catch (err) {
    const message = cleanText(err?.message || "provider_error");
    const isTimeout =
      err?.code === "ECONNABORTED" || /timeout/i.test(message) || err?.response?.status === 408;

    return {
      ok: false,
      products: [],
      error: isTimeout ? "timeout" : "provider_error",
      reasonCode: isTimeout
        ? DATAFORSEO_REASON_CODES.TIMEOUT
        : DATAFORSEO_REASON_CODES.PROVIDER_ERROR,
      taskId,
      count: 0,
      diagnostics: buildDataForSeoSanitizedDiagnostics({
        ...baseDiagnostics,
        taskId,
        detail: message.slice(0, 120),
      }),
    };
  }
}
