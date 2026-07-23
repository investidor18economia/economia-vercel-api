/**
 * PATCH 7.1 — Response Reliability Analytics
 *
 * Pure classification of final user-visible response outcomes.
 * Observability only — never alters runtime behavior.
 */

import { resolveResponsePathRegistry } from "./miaRuntimePrecedence.js";
import { DATA_LAYER_RESPONSE_CLASSIFICATIONS } from "./miaDataLayerResolutionClassifier.js";

export const MIA_RESPONSE_OUTCOMES = Object.freeze({
  SUCCESS: "SUCCESS",
  PARTIAL_SUCCESS: "PARTIAL_SUCCESS",
  FALLBACK: "FALLBACK",
  NO_RESULT: "NO_RESULT",
  ERROR: "ERROR",
  TIMEOUT: "TIMEOUT",
  CANCELLED: "CANCELLED",
});

export const MIA_RESPONSE_VALIDITY = Object.freeze({
  VALID: "valid",
  PARTIAL: "partial",
  INVALID: "invalid",
  INTERRUPTED: "interrupted",
});

const ERROR_RESPONSE_PATHS = new Set([
  "image_identification_failed",
  "image_search_error",
  "commercial_provider_unavailable",
  "unknown_response_path_fail_closed",
]);

const NO_RESULT_RESPONSE_PATHS = new Set([
  "commercial_resolution_incomplete",
  "commercial_new_search_no_result",
  "image_search_no_offers",
]);

const FALLBACK_RESPONSE_PATHS = new Set([
  "commercial_only_fallback",
  "contract_violation_governed_fallback",
]);

const PARTIAL_RESPONSE_PATHS = new Set([
  "comparison_anchored_incomplete",
  "legitimate_search_reset_awaiting_query",
]);

function normalizeReasonCode(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeResponsePath(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function extractReplyText(body = {}) {
  if (!body || typeof body !== "object") return "";
  return String(body.reply || body.message || body.text || "").trim();
}

function countResponseProducts(body = {}) {
  if (!body || typeof body !== "object") return 0;
  const prices = Array.isArray(body.prices) ? body.prices.length : 0;
  const products = Array.isArray(body.products) ? body.products.length : 0;
  const displayProducts = Array.isArray(body.displayProducts) ? body.displayProducts.length : 0;
  return Math.max(prices, products, displayProducts);
}

function readDataLayerSummary(body = {}) {
  const summary =
    body.data_layer_usage_analytics ||
    body.dataLayerUsageAnalytics?.summary ||
    body.dataLayerUsageAnalytics ||
    null;
  if (!summary || typeof summary !== "object") return null;
  return summary;
}

function hasTimeoutSignal({ reasonCode = "", responsePath = "" } = {}) {
  const reason = normalizeReasonCode(reasonCode);
  const path = normalizeResponsePath(responsePath);
  return reason.includes("timeout") || path.includes("timeout");
}

function hasCancelledSignal({ reasonCode = "", responsePath = "" } = {}) {
  const reason = normalizeReasonCode(reasonCode);
  const path = normalizeResponsePath(responsePath);
  return (
    reason.includes("cancel") ||
    reason.includes("abort") ||
    path.includes("cancelled") ||
    path.includes("canceled")
  );
}

function hasErrorSignal({
  httpStatus = 200,
  reasonCode = "",
  responsePath = "",
  body = {},
} = {}) {
  const status = Number(httpStatus) || 200;
  if (status >= 400) return true;

  const path = normalizeResponsePath(responsePath);
  if (ERROR_RESPONSE_PATHS.has(path)) return true;
  if (path.endsWith("_failed") || path.endsWith("_error")) return true;

  const reason = normalizeReasonCode(reasonCode);
  if (reason.includes("internal_error") || reason.includes("auth_invalid")) return true;

  if (body?.error && !extractReplyText(body)) return true;
  return false;
}

function hasNoResultSignal({ responsePath = "", body = {}, commercialIntent = false } = {}) {
  const path = normalizeResponsePath(responsePath);
  if (NO_RESULT_RESPONSE_PATHS.has(path)) return true;
  if (path.includes("no_result") || path.includes("no_offers")) return true;

  const productCount = countResponseProducts(body);
  const replyText = extractReplyText(body);
  if (commercialIntent && productCount === 0 && !replyText) return true;
  return false;
}

function hasFallbackSignal({ responsePath = "", body = {}, dataLayerSummary = null } = {}) {
  const path = normalizeResponsePath(responsePath);
  if (FALLBACK_RESPONSE_PATHS.has(path)) return true;
  if (path.includes("governed_fallback") || path.includes("only_fallback")) return true;

  const classification =
    dataLayerSummary?.response_classification ||
    dataLayerSummary?.data_layer_response_classification ||
    null;
  if (classification === DATA_LAYER_RESPONSE_CLASSIFICATIONS.FALLBACK_ONLY) {
    return countResponseProducts(body) > 0 || !!extractReplyText(body);
  }
  return false;
}

function hasPartialSuccessSignal({
  responsePath = "",
  body = {},
  dataLayerSummary = null,
  degradationRequired = false,
} = {}) {
  const path = normalizeResponsePath(responsePath);
  if (PARTIAL_RESPONSE_PATHS.has(path)) return true;

  const classification =
    dataLayerSummary?.response_classification ||
    dataLayerSummary?.data_layer_response_classification ||
    null;
  if (classification === DATA_LAYER_RESPONSE_CLASSIFICATIONS.PARTIAL_DATA_LAYER) {
    return true;
  }

  if (degradationRequired && (countResponseProducts(body) > 0 || !!extractReplyText(body))) {
    return true;
  }

  if (dataLayerSummary?.hybrid_response === true || dataLayerSummary?.fallback_used === true) {
    return countResponseProducts(body) > 0 || !!extractReplyText(body);
  }

  return false;
}

/**
 * Maps runtime signals to the PATCH 7.1 outcome taxonomy.
 *
 * @param {{
 *   httpStatus?: number,
 *   responsePath?: string|null,
 *   body?: Record<string, unknown>|null,
 *   reasonCode?: string|null,
 *   commercialIntent?: boolean,
 *   responseInterrupted?: boolean,
 * }} ctx
 * @returns {keyof typeof MIA_RESPONSE_OUTCOMES}
 */
export function classifyResponseOutcome(ctx = {}) {
  const body = ctx.body && typeof ctx.body === "object" ? ctx.body : {};
  const responsePath = ctx.responsePath || "";
  const dataLayerSummary = readDataLayerSummary(body);
  const registry = resolveResponsePathRegistry(responsePath);
  const commercialIntent =
    !!ctx.commercialIntent ||
    registry.category === "commercial" ||
    registry.category === "commercial_degraded" ||
    registry.category === "fallback";

  if (hasTimeoutSignal(ctx)) {
    return MIA_RESPONSE_OUTCOMES.TIMEOUT;
  }

  if (hasCancelledSignal(ctx) || ctx.responseInterrupted) {
    return MIA_RESPONSE_OUTCOMES.CANCELLED;
  }

  if (hasErrorSignal({ ...ctx, body })) {
    return MIA_RESPONSE_OUTCOMES.ERROR;
  }

  if (hasNoResultSignal({ responsePath, body, commercialIntent })) {
    return MIA_RESPONSE_OUTCOMES.NO_RESULT;
  }

  if (hasFallbackSignal({ responsePath, body, dataLayerSummary })) {
    return MIA_RESPONSE_OUTCOMES.FALLBACK;
  }

  if (
    hasPartialSuccessSignal({
      responsePath,
      body,
      dataLayerSummary,
      degradationRequired: !!registry.degradationRequired,
    })
  ) {
    return MIA_RESPONSE_OUTCOMES.PARTIAL_SUCCESS;
  }

  return MIA_RESPONSE_OUTCOMES.SUCCESS;
}

/**
 * @param {keyof typeof MIA_RESPONSE_OUTCOMES} outcome
 */
export function deriveResponseValidity(outcome) {
  switch (outcome) {
    case MIA_RESPONSE_OUTCOMES.SUCCESS:
    case MIA_RESPONSE_OUTCOMES.FALLBACK:
      return MIA_RESPONSE_VALIDITY.VALID;
    case MIA_RESPONSE_OUTCOMES.PARTIAL_SUCCESS:
      return MIA_RESPONSE_VALIDITY.PARTIAL;
    case MIA_RESPONSE_OUTCOMES.TIMEOUT:
    case MIA_RESPONSE_OUTCOMES.CANCELLED:
      return MIA_RESPONSE_VALIDITY.INTERRUPTED;
    case MIA_RESPONSE_OUTCOMES.ERROR:
    case MIA_RESPONSE_OUTCOMES.NO_RESULT:
    default:
      return MIA_RESPONSE_VALIDITY.INVALID;
  }
}

/**
 * Boolean flags for SQL dashboards (one-hot by outcome).
 *
 * @param {keyof typeof MIA_RESPONSE_OUTCOMES} outcome
 */
export function deriveResponseOutcomeFlags(outcome) {
  return {
    outcome_success: outcome === MIA_RESPONSE_OUTCOMES.SUCCESS,
    outcome_partial_success: outcome === MIA_RESPONSE_OUTCOMES.PARTIAL_SUCCESS,
    outcome_fallback: outcome === MIA_RESPONSE_OUTCOMES.FALLBACK,
    outcome_no_result: outcome === MIA_RESPONSE_OUTCOMES.NO_RESULT,
    outcome_error: outcome === MIA_RESPONSE_OUTCOMES.ERROR,
    outcome_timeout: outcome === MIA_RESPONSE_OUTCOMES.TIMEOUT,
    outcome_cancelled: outcome === MIA_RESPONSE_OUTCOMES.CANCELLED,
  };
}

export function summarizeResponseDelivery(body = {}) {
  const replyText = extractReplyText(body);
  const productCount = countResponseProducts(body);
  return {
    reply_present: replyText.length > 0,
    reply_length: replyText.length,
    products_in_response: productCount,
    has_offer_payload: productCount > 0,
  };
}
