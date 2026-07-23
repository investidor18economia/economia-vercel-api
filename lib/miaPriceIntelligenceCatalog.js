/**
 * PATCH 10.1 — Price Intelligence taxonomies (observational).
 */

export const MIA_PRICE_INTELLIGENCE_CATALOG_VERSION = "10.1.0";

export const MIA_PRICE_QUALITY = Object.freeze({
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
  UNKNOWN: "UNKNOWN",
});

export const MIA_PRICE_CONFIDENCE = Object.freeze({
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
  UNKNOWN: "UNKNOWN",
});

export const MIA_WINNER_PRICE_POSITION = Object.freeze({
  LOWEST_PRICE: "LOWEST_PRICE",
  NEAR_LOWEST: "NEAR_LOWEST",
  MIDDLE: "MIDDLE",
  HIGH: "HIGH",
  UNKNOWN: "UNKNOWN",
});

export const MIA_SHIPPING_COVERAGE = Object.freeze({
  KNOWN: "KNOWN",
  PARTIAL: "PARTIAL",
  UNKNOWN: "UNKNOWN",
});

/** Winner within 5% of minimum in sample */
export const MIA_WINNER_NEAR_LOWEST_MAX_PERCENT = 5;
/** Winner within 20% of minimum — above near, below high */
export const MIA_WINNER_MIDDLE_MAX_PERCENT = 20;
