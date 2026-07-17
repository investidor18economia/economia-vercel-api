/**
 * PATCH ProductSourceAdapter V1 — NormalizedProduct contract
 *
 * Shape canônico para produtos comerciais vindos de qualquer fonte externa.
 * Downstream layers (ranking, decision) continuam usando este contrato no futuro.
 */

export const NORMALIZED_PRODUCT_VERSION = "1.0.0";

export const PRODUCT_SOURCE_IDS = Object.freeze({
  MERCADO_LIVRE: "mercado_livre",
  AMAZON: "amazon",
  SERP: "serp",
  GOOGLE_SHOPPING: "google_shopping",
  GOOGLE_SHOPPING_DATAFORSEO: "google_shopping_dataforseo",
  MANUAL: "manual",
  UNKNOWN: "unknown",
});

/**
 * @typedef {Object} NormalizedProduct
 * @property {string} product_name
 * @property {string} normalizedName
 * @property {string} familyKey
 * @property {string|null} price
 * @property {number|null} numericPrice
 * @property {string} currency
 * @property {string|null} link
 * @property {string|null} thumbnail
 * @property {string} source
 * @property {string} provider
 * @property {string|null} externalId
 * @property {string} category
 * @property {string} adapterVersion
 * @property {string|null} rawSource
 */

export function createEmptyNormalizedProduct(overrides = {}) {
  return {
    product_name: "",
    normalizedName: "",
    familyKey: "",
    price: null,
    numericPrice: null,
    currency: "BRL",
    link: null,
    thumbnail: null,
    source: "",
    provider: PRODUCT_SOURCE_IDS.UNKNOWN,
    externalId: null,
    category: "",
    adapterVersion: NORMALIZED_PRODUCT_VERSION,
    rawSource: null,
    ...overrides,
  };
}

export function isNormalizedProductUsable(product = null) {
  if (!product || typeof product !== "object") return false;
  const name = String(product.product_name || "").trim();
  if (name.length < 3) return false;
  if (/indispon/i.test(String(product.price || ""))) return false;
  return true;
}

export function isNormalizedProductShape(product = null) {
  if (!product || typeof product !== "object") return false;
  const required = [
    "product_name",
    "normalizedName",
    "familyKey",
    "price",
    "numericPrice",
    "currency",
    "link",
    "thumbnail",
    "source",
    "provider",
    "externalId",
    "category",
    "adapterVersion",
    "rawSource",
  ];
  return required.every((key) => Object.prototype.hasOwnProperty.call(product, key));
}
