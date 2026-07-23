/**
 * PATCH 10.2 — Derive savings estimation from offer_set metadata (no recalculation of ranking/prices).
 */

import {
  computeEstimatedSavingsAmount,
  pickSavingsPercent,
} from "./miaEstimatedSavings.js";
import {
  MIA_SAVINGS_BASELINE_TYPE,
  MIA_SAVINGS_CALCULATION_METHOD,
  MIA_SAVINGS_COMPARISON_DIRECTION,
  MIA_SAVINGS_CONFIDENCE,
  MIA_SAVINGS_ELIGIBILITY_REASON,
  MIA_SAVINGS_NATURE,
  MIA_SAVINGS_OFFICIAL_CURRENCY,
  MIA_SAVINGS_TYPE,
} from "./miaSavingsEstimationCatalog.js";
import {
  MIA_PRICE_CONFIDENCE,
  MIA_PRICE_QUALITY,
  MIA_SHIPPING_COVERAGE,
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

function roundMoney(value) {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function roundPercent(value) {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

/**
 * @param {Record<string, unknown>} offerSet
 * @param {Record<string, unknown>} [priceIntel]
 */
export function resolveSavingsConfidenceFromEvidence(offerSet = {}, priceIntel = {}) {
  const sampleCount = num(offerSet.price_sample_count) ?? 0;
  const priceQuality = priceIntel.price_quality ?? null;
  const priceConfidence = priceIntel.price_confidence ?? null;
  const currencyKnown = offerSet.price_currency === MIA_SAVINGS_OFFICIAL_CURRENCY;
  const incomplete = num(offerSet.offers_with_incomplete_data_count) ?? 0;
  const shippingCoverage = priceIntel.shipping_coverage ?? null;

  if (sampleCount === 0) return MIA_SAVINGS_CONFIDENCE.UNKNOWN;
  if (
    sampleCount >= 3 &&
    priceQuality === MIA_PRICE_QUALITY.HIGH &&
    priceConfidence === MIA_PRICE_CONFIDENCE.HIGH &&
    currencyKnown &&
    incomplete === 0
  ) {
    return MIA_SAVINGS_CONFIDENCE.HIGH;
  }
  if (sampleCount >= 2 && currencyKnown && incomplete === 0) {
    return MIA_SAVINGS_CONFIDENCE.MEDIUM;
  }
  if (sampleCount >= 1 && currencyKnown) {
    if (shippingCoverage === MIA_SHIPPING_COVERAGE.UNKNOWN) return MIA_SAVINGS_CONFIDENCE.LOW;
    return MIA_SAVINGS_CONFIDENCE.MEDIUM;
  }
  return MIA_SAVINGS_CONFIDENCE.LOW;
}

/**
 * @param {number|null} referencePrice
 * @param {number|null} comparisonPrice
 */
export function resolveComparisonDirection(referencePrice, comparisonPrice) {
  if (referencePrice == null || comparisonPrice == null) {
    return MIA_SAVINGS_COMPARISON_DIRECTION.UNKNOWN;
  }
  if (referencePrice === comparisonPrice) return MIA_SAVINGS_COMPARISON_DIRECTION.EQUAL;
  if (referencePrice > comparisonPrice) return MIA_SAVINGS_COMPARISON_DIRECTION.REFERENCE_HIGHER;
  if (comparisonPrice > referencePrice) return MIA_SAVINGS_COMPARISON_DIRECTION.COMPARISON_HIGHER;
  return MIA_SAVINGS_COMPARISON_DIRECTION.UNKNOWN;
}

/**
 * Winner vs minimum — primary observed offer difference (8.3 precomputed fields).
 * @param {Record<string, unknown>} offerSet
 * @param {Record<string, unknown>} [priceIntel]
 * @param {{ requestId?: string|null, decisionRequestId?: string|null }} [context]
 */
export function buildWinnerVsMinimumEstimation(offerSet = {}, priceIntel = {}, context = {}) {
  const minimumPrice = num(offerSet.minimum_price);
  const winnerPrice = num(offerSet.winner_price);
  const sampleCount = num(offerSet.price_sample_count) ?? 0;
  const currency = offerSet.price_currency === MIA_SAVINGS_OFFICIAL_CURRENCY
    ? MIA_SAVINGS_OFFICIAL_CURRENCY
    : null;
  const winnerIsLowest = bool(offerSet.winner_is_lowest_price);
  const delta = num(offerSet.winner_vs_minimum_delta);
  const deltaPercent = num(offerSet.winner_vs_minimum_delta_percent);

  let eligible = false;
  let eligibilityReason = MIA_SAVINGS_ELIGIBILITY_REASON.UNKNOWN;

  if (sampleCount === 0 && bool(offerSet.winner_present) !== true) {
    eligibilityReason = MIA_SAVINGS_ELIGIBILITY_REASON.NO_VALID_PRICE;
  } else if (!currency) {
    eligibilityReason = MIA_SAVINGS_ELIGIBILITY_REASON.CURRENCY_MISMATCH;
  } else if (minimumPrice == null || minimumPrice <= 0) {
    eligibilityReason = MIA_SAVINGS_ELIGIBILITY_REASON.INVALID_REFERENCE_PRICE;
  } else if (winnerPrice == null || winnerPrice <= 0) {
    eligibilityReason = MIA_SAVINGS_ELIGIBILITY_REASON.INVALID_COMPARISON_PRICE;
  } else if (sampleCount < 1) {
    eligibilityReason = MIA_SAVINGS_ELIGIBILITY_REASON.INSUFFICIENT_OFFERS;
  } else {
    eligible = true;
    eligibilityReason = MIA_SAVINGS_ELIGIBILITY_REASON.VALID_COMPARABLE_PRICES;
  }

  const direction = resolveComparisonDirection(minimumPrice, winnerPrice);
  let savingsNature = MIA_SAVINGS_NATURE.UNKNOWN;
  let savingsAmount = null;
  let savingsPercent = null;

  if (eligible) {
    if (direction === MIA_SAVINGS_COMPARISON_DIRECTION.EQUAL || winnerIsLowest === true) {
      savingsNature = MIA_SAVINGS_NATURE.NO_SAVINGS_SIGNAL;
      savingsAmount = 0;
      savingsPercent = 0;
      eligibilityReason = MIA_SAVINGS_ELIGIBILITY_REASON.SAME_PRICE;
    } else if (direction === MIA_SAVINGS_COMPARISON_DIRECTION.COMPARISON_HIGHER) {
      savingsNature = MIA_SAVINGS_NATURE.OFFER_DIFFERENCE;
      savingsAmount = null;
      savingsPercent = null;
    } else {
      savingsNature = MIA_SAVINGS_NATURE.OFFER_DIFFERENCE;
      savingsAmount = roundMoney(Math.abs((minimumPrice ?? 0) - (winnerPrice ?? 0)));
      savingsPercent = deltaPercent != null ? roundPercent(Math.abs(deltaPercent)) : null;
    }
  }

  const confidence = eligible
    ? resolveSavingsConfidenceFromEvidence(offerSet, priceIntel)
    : MIA_SAVINGS_CONFIDENCE.UNKNOWN;

  return {
    request_id: context.requestId ?? null,
    decision_request_id: context.decisionRequestId ?? context.requestId ?? null,
    event_version: "10.2.0",
    source: "offer_set_derived",
    source_event_version: "8.3.0",
    offer_set_event_version: "8.3.0",
    price_intelligence_event_version: "10.1.0",
    savings_valid: eligible,
    savings_type: eligible ? MIA_SAVINGS_TYPE.OBSERVED : MIA_SAVINGS_TYPE.UNKNOWN,
    savings_nature: savingsNature,
    savings_confidence: confidence,
    baseline_type: MIA_SAVINGS_BASELINE_TYPE.MINIMUM_OFFER,
    calculation_method: MIA_SAVINGS_CALCULATION_METHOD.WINNER_VS_MINIMUM,
    comparison_direction: direction,
    reference_price: minimumPrice,
    comparison_price: winnerPrice,
    savings_amount: savingsAmount,
    savings_percent: savingsPercent,
    currency,
    savings_estimation_eligible: eligible,
    eligibility_reason: eligibilityReason,
    price_quality: priceIntel.price_quality ?? null,
    price_confidence: priceIntel.price_confidence ?? null,
    price_sample_count: sampleCount,
    winner_is_lowest_price: winnerIsLowest,
    winner_vs_minimum_delta: delta,
    winner_vs_minimum_delta_percent: deltaPercent,
    shipping_included: false,
    shipping_coverage: priceIntel.shipping_coverage ?? null,
    purchase_confirmed: false,
    historical_baseline_available: false,
    transactional_evidence_available: false,
    rounding_method: "round_half_up_2dp",
    search_path: offerSet.search_path ?? null,
    winner_provider_id: offerSet.winner_provider_id ?? null,
    estimation_valid:
      eligible &&
      (direction === MIA_SAVINGS_COMPARISON_DIRECTION.EQUAL ||
        direction === MIA_SAVINGS_COMPARISON_DIRECTION.COMPARISON_HIGHER ||
        direction === MIA_SAVINGS_COMPARISON_DIRECTION.REFERENCE_HIGHER),
  };
}

/**
 * Mirror miaEstimatedSavings UI rule server-side (observation only — UNVERIFIED).
 * @param {Record<string, unknown>} offerSet
 * @param {{ requestId?: string|null, decisionRequestId?: string|null }} [context]
 */
export function buildUiAssumptionEstimation(offerSet = {}, context = {}) {
  const winnerPrice = num(offerSet.winner_price);
  const currency = offerSet.price_currency === MIA_SAVINGS_OFFICIAL_CURRENCY
    ? MIA_SAVINGS_OFFICIAL_CURRENCY
    : null;

  let eligible = false;
  let eligibilityReason = MIA_SAVINGS_ELIGIBILITY_REASON.UNKNOWN;

  if (!currency) {
    eligibilityReason = MIA_SAVINGS_ELIGIBILITY_REASON.CURRENCY_MISMATCH;
  } else if (winnerPrice == null || winnerPrice <= 0) {
    eligibilityReason = MIA_SAVINGS_ELIGIBILITY_REASON.NO_VALID_PRICE;
  } else {
    eligible = true;
    eligibilityReason = MIA_SAVINGS_ELIGIBILITY_REASON.UNVERIFIED_ASSUMPTION;
  }

  let referencePrice = winnerPrice;
  let savingsAmount = null;
  let savingsPercent = null;

  if (eligible && winnerPrice != null) {
    savingsPercent = roundPercent(pickSavingsPercent(winnerPrice) * 100);
    savingsAmount = computeEstimatedSavingsAmount(winnerPrice);
  }

  return {
    request_id: context.requestId ?? null,
    decision_request_id: context.decisionRequestId ?? context.requestId ?? null,
    event_version: "10.2.0",
    source: "estimated_ui_assumption_observed",
    source_event_version: "8.3.0",
    offer_set_event_version: "8.3.0",
    price_intelligence_event_version: "10.1.0",
    savings_valid: eligible && savingsAmount != null,
    savings_type: MIA_SAVINGS_TYPE.UNVERIFIED,
    savings_nature: MIA_SAVINGS_NATURE.ESTIMATED_SAVINGS,
    savings_confidence: MIA_SAVINGS_CONFIDENCE.LOW,
    baseline_type: MIA_SAVINGS_BASELINE_TYPE.ESTIMATED_UI_ASSUMPTION,
    calculation_method: MIA_SAVINGS_CALCULATION_METHOD.PERCENTAGE_ASSUMPTION,
    comparison_direction: MIA_SAVINGS_COMPARISON_DIRECTION.UNKNOWN,
    reference_price: referencePrice,
    comparison_price: null,
    savings_amount: savingsAmount,
    savings_percent: savingsPercent,
    currency,
    savings_estimation_eligible: eligible,
    eligibility_reason: eligibilityReason,
    price_quality: null,
    price_confidence: null,
    price_sample_count: num(offerSet.price_sample_count),
    winner_is_lowest_price: bool(offerSet.winner_is_lowest_price),
    shipping_included: false,
    shipping_coverage: null,
    purchase_confirmed: false,
    historical_baseline_available: false,
    transactional_evidence_available: false,
    ui_assumption_percent_min: 4,
    ui_assumption_percent_max: 6,
    rounding_method: "ui_non_round_integer",
    search_path: offerSet.search_path ?? null,
    estimation_valid: eligible && savingsAmount != null,
  };
}

/**
 * Build all supported estimations for one commercial decision.
 * @param {Record<string, unknown>} offerSetMetadata
 * @param {Record<string, unknown>} [priceIntelMetadata]
 * @param {{ requestId?: string|null, decisionRequestId?: string|null }} [context]
 */
export function buildSavingsEstimationsFromOfferSetMetadata(
  offerSetMetadata = {},
  priceIntelMetadata = {},
  context = {}
) {
  const estimations = [];

  const winnerVsMin = buildWinnerVsMinimumEstimation(offerSetMetadata, priceIntelMetadata, context);
  if (winnerVsMin.estimation_valid || winnerVsMin.savings_estimation_eligible) {
    estimations.push(winnerVsMin);
  }

  const uiAssumption = buildUiAssumptionEstimation(offerSetMetadata, context);
  if (uiAssumption.estimation_valid) {
    estimations.push(uiAssumption);
  }

  return estimations;
}
