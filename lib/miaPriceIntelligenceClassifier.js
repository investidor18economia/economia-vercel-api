/**
 * PATCH 10.1 — Derive price intelligence from offer_set metadata (no recalculation).
 */

import {
  MIA_PRICE_CONFIDENCE,
  MIA_PRICE_QUALITY,
  MIA_SHIPPING_COVERAGE,
  MIA_WINNER_MIDDLE_MAX_PERCENT,
  MIA_WINNER_NEAR_LOWEST_MAX_PERCENT,
  MIA_WINNER_PRICE_POSITION,
} from "./miaPriceIntelligenceCatalog.js";

function num(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function bool(value) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return null;
}

/**
 * Classify winner price position using pre-computed offer_set fields only.
 * @param {Record<string, unknown>} offerSet
 */
export function resolveWinnerPricePosition(offerSet = {}) {
  const isLowest = bool(offerSet.winner_is_lowest_price);
  const deltaPercent = num(offerSet.winner_vs_minimum_delta_percent);
  const winnerPrice = num(offerSet.winner_price);
  const minPrice = num(offerSet.minimum_price);

  if (winnerPrice == null || minPrice == null) return MIA_WINNER_PRICE_POSITION.UNKNOWN;
  if (isLowest === true || deltaPercent === 0) return MIA_WINNER_PRICE_POSITION.LOWEST_PRICE;
  if (deltaPercent != null && deltaPercent <= MIA_WINNER_NEAR_LOWEST_MAX_PERCENT) {
    return MIA_WINNER_PRICE_POSITION.NEAR_LOWEST;
  }
  if (deltaPercent != null && deltaPercent <= MIA_WINNER_MIDDLE_MAX_PERCENT) {
    return MIA_WINNER_PRICE_POSITION.MIDDLE;
  }
  if (deltaPercent != null && deltaPercent > MIA_WINNER_MIDDLE_MAX_PERCENT) {
    return MIA_WINNER_PRICE_POSITION.HIGH;
  }
  return MIA_WINNER_PRICE_POSITION.UNKNOWN;
}

/**
 * @param {Record<string, unknown>} offerSet
 */
export function resolvePriceQuality(offerSet = {}) {
  const sampleCount = num(offerSet.price_sample_count) ?? 0;
  const providerCount = num(offerSet.provider_count) ?? 0;
  const incomplete = num(offerSet.offers_with_incomplete_data_count) ?? 0;
  const removedInvalid = num(offerSet.removed_invalid_count) ?? 0;
  const winnerPresent = bool(offerSet.winner_present);

  if (sampleCount === 0 && winnerPresent !== true) return MIA_PRICE_QUALITY.UNKNOWN;
  if (removedInvalid > 0 || (sampleCount === 0 && winnerPresent === true)) {
    return MIA_PRICE_QUALITY.LOW;
  }
  if (
    sampleCount >= 3 &&
    providerCount >= 2 &&
    incomplete === 0 &&
    removedInvalid === 0
  ) {
    return MIA_PRICE_QUALITY.HIGH;
  }
  if (sampleCount >= 1 && winnerPresent === true) return MIA_PRICE_QUALITY.MEDIUM;
  return MIA_PRICE_QUALITY.LOW;
}

/**
 * @param {Record<string, unknown>} offerSet
 */
export function resolvePriceConfidence(offerSet = {}) {
  const sampleCount = num(offerSet.price_sample_count) ?? 0;
  const providerCount = num(offerSet.provider_count) ?? 0;
  const complete = num(offerSet.offers_with_complete_data_count) ?? 0;
  const currency = offerSet.price_currency;

  if (sampleCount === 0) return MIA_PRICE_CONFIDENCE.UNKNOWN;
  if (sampleCount >= 3 && providerCount >= 2 && complete >= sampleCount && currency === "BRL") {
    return MIA_PRICE_CONFIDENCE.HIGH;
  }
  if (sampleCount >= 1 && currency === "BRL") return MIA_PRICE_CONFIDENCE.MEDIUM;
  return MIA_PRICE_CONFIDENCE.LOW;
}

/**
 * @param {Record<string, unknown>} offerSet
 */
export function resolveShippingCoverage(offerSet = {}) {
  const sampleCount = num(offerSet.price_sample_count) ?? 0;
  const withShipping = num(offerSet.offers_with_shipping_count) ?? 0;

  if (sampleCount === 0) return MIA_SHIPPING_COVERAGE.UNKNOWN;
  if (withShipping >= sampleCount) return MIA_SHIPPING_COVERAGE.KNOWN;
  if (withShipping > 0) return MIA_SHIPPING_COVERAGE.PARTIAL;
  return MIA_SHIPPING_COVERAGE.UNKNOWN;
}

/**
 * Build full price intelligence metadata from finalized offer_set metadata.
 * Does NOT recalculate aggregates — only derives taxonomies from existing fields.
 * @param {Record<string, unknown>} offerSetMetadata
 * @param {{ requestId?: string|null, decisionRequestId?: string|null }} [context]
 */
export function buildPriceIntelligenceFromOfferSetMetadata(offerSetMetadata = {}, context = {}) {
  const offerSet = offerSetMetadata || {};
  const minPrice = num(offerSet.minimum_price);
  const maxPrice = num(offerSet.maximum_price);
  const sampleCount = num(offerSet.price_sample_count) ?? 0;

  let priceRange = null;
  let priceRangePercent = null;
  if (minPrice != null && maxPrice != null && minPrice > 0) {
    priceRange = Math.round((maxPrice - minPrice) * 100) / 100;
    priceRangePercent = Math.round(((maxPrice - minPrice) / minPrice) * 10000) / 100;
  }

  const promotionalObserved = (num(offerSet.offers_with_previous_price_count) ?? 0) > 0;
  const removedInvalid = num(offerSet.removed_invalid_count) ?? 0;
  const removedDuplicate = num(offerSet.removed_duplicate_count) ?? 0;
  const incomplete = num(offerSet.offers_with_incomplete_data_count) ?? 0;

  const invalidPriceObserved =
    removedInvalid > 0 || (sampleCount === 0 && (num(offerSet.delivered_offers_count) ?? 0) > 0);

  const singleProvider = bool(offerSet.single_provider_dependency) === true;
  const winnerProvider = offerSet.winner_provider_id ?? null;

  return {
    request_id: context.requestId ?? null,
    decision_request_id: context.decisionRequestId ?? context.requestId ?? null,
    offer_set_event_version: "8.3.0",
    price_quality: resolvePriceQuality(offerSet),
    price_confidence: resolvePriceConfidence(offerSet),
    winner_price_position: resolveWinnerPricePosition(offerSet),
    shipping_coverage: resolveShippingCoverage(offerSet),
    price_sample_count: sampleCount,
    provider_count: num(offerSet.provider_count),
    merchant_count: num(offerSet.merchant_count),
    raw_offers_count: num(offerSet.raw_offers_count),
    normalized_offers_count: num(offerSet.normalized_offers_count),
    eligible_offers_count: num(offerSet.eligible_offers_count),
    delivered_offers_count: num(offerSet.delivered_offers_count),
    removed_invalid_count: removedInvalid,
    removed_duplicate_count: removedDuplicate,
    removed_ineligible_count: num(offerSet.removed_ineligible_count),
    offers_with_complete_data_count: num(offerSet.offers_with_complete_data_count),
    offers_with_incomplete_data_count: incomplete,
    minimum_price: minPrice,
    maximum_price: maxPrice,
    average_price: num(offerSet.average_price),
    median_price: num(offerSet.median_price),
    price_range: priceRange,
    price_range_percent: priceRangePercent,
    winner_price: num(offerSet.winner_price),
    winner_is_lowest_price: bool(offerSet.winner_is_lowest_price),
    winner_vs_minimum_delta: num(offerSet.winner_vs_minimum_delta),
    winner_vs_minimum_delta_percent: num(offerSet.winner_vs_minimum_delta_percent),
    promotional_price_observed: promotionalObserved,
    promotional_comparison_valid: promotionalObserved && sampleCount > 0,
    invalid_price_observed: invalidPriceObserved,
    currency_known: offerSet.price_currency === "BRL",
    duplicate_price_observed: removedDuplicate > 0,
    missing_price_observed: sampleCount === 0,
    winner_provider_id: winnerProvider,
    lowest_price_provider_id: null,
    predominant_provider_id: singleProvider ? winnerProvider : null,
    search_path: offerSet.search_path ?? null,
    runtime_mode: offerSet.runtime_mode ?? null,
    winner_present: bool(offerSet.winner_present),
    intelligence_valid: sampleCount > 0 || bool(offerSet.winner_present) === true,
    source: "offer_set_derived",
  };
}
