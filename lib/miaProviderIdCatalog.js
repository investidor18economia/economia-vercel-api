/**
 * PATCH 8.2 — Stable provider_id catalog and legacy alias mapping.
 *
 * Data Layer is NOT a provider in 8.2 (observability belongs to PATCH 6.4).
 */

import { COMMERCIAL_PROVIDER_IDS } from "./productSourceAdapter/commercialProviderRegistry.js";
import {
  MIA_PROVIDER_CONFIG_STATUSES,
  MIA_PROVIDER_FAMILIES,
} from "./miaProviderAttemptCatalog.js";

export const MIA_PROVIDER_ID_CATALOG_VERSION = "8.2.0";

/** @type {ReadonlySet<string>} */
export const MIA_KNOWN_PROVIDER_IDS = Object.freeze(
  new Set([
    COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
    COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO,
    COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
    COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE,
    COMMERCIAL_PROVIDER_IDS.AMAZON,
    "supabase_cache",
  ])
);

const LEGACY_ALIAS_MAP = Object.freeze({
  mercadolivre: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
  mercado_livre: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
  mercadolivre_public: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
  supabasecache: "supabase_cache",
  supabase_cache: "supabase_cache",
  serpapi: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
  google: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
  google_shopping: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
  google_shopping_dataforseo: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO,
  dataforseo: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO,
  apify: COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE,
  apify_mercadolivre: COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE,
  amazon: COMMERCIAL_PROVIDER_IDS.AMAZON,
});

const PROVIDER_FAMILY_MAP = Object.freeze({
  [COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING]: MIA_PROVIDER_FAMILIES.SEARCH_ENGINE,
  [COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO]: MIA_PROVIDER_FAMILIES.DATA_PROVIDER,
  [COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC]: MIA_PROVIDER_FAMILIES.MARKETPLACE,
  [COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE]: MIA_PROVIDER_FAMILIES.SCRAPER,
  [COMMERCIAL_PROVIDER_IDS.AMAZON]: MIA_PROVIDER_FAMILIES.MARKETPLACE,
  supabase_cache: MIA_PROVIDER_FAMILIES.CACHE,
});

const PROVIDER_CONFIG_STATUS_MAP = Object.freeze({
  [COMMERCIAL_PROVIDER_IDS.AMAZON]: MIA_PROVIDER_CONFIG_STATUSES.STUB,
});

/**
 * @param {string} [rawId]
 */
export function normalizeProviderAttemptId(rawId = "") {
  const key = String(rawId || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (!key) return "unknown";
  return LEGACY_ALIAS_MAP[key] || key;
}

/**
 * @param {string} [providerId]
 */
export function resolveProviderFamily(providerId = "") {
  const normalized = normalizeProviderAttemptId(providerId);
  return PROVIDER_FAMILY_MAP[normalized] || MIA_PROVIDER_FAMILIES.UNKNOWN;
}

/**
 * @param {string} [providerId]
 * @param {{ enabled?: boolean, stub?: boolean }} [hints]
 */
export function resolveProviderConfigStatus(providerId = "", hints = {}) {
  if (hints.stub === true) return MIA_PROVIDER_CONFIG_STATUSES.STUB;
  if (hints.enabled === false) return MIA_PROVIDER_CONFIG_STATUSES.DISABLED;
  if (hints.enabled === true) return MIA_PROVIDER_CONFIG_STATUSES.ENABLED;

  const normalized = normalizeProviderAttemptId(providerId);
  if (PROVIDER_CONFIG_STATUS_MAP[normalized]) {
    return PROVIDER_CONFIG_STATUS_MAP[normalized];
  }
  return MIA_PROVIDER_CONFIG_STATUSES.UNKNOWN;
}

/**
 * @param {string} [providerId]
 */
export function isKnownProviderAttemptId(providerId = "") {
  return MIA_KNOWN_PROVIDER_IDS.has(normalizeProviderAttemptId(providerId));
}
