/**
 * PATCH Comercial 4D — Multi-Provider Commercial Selection Engine
 *
 * Seleciona a melhor oferta comercial entre ofertas já normalizadas e deduplicadas.
 * Não altera winner cognitivo, ranking, Router ou Decision Engine.
 */

import { parseNumericPrice } from "./normalizeProduct.js";
import {
  calculateCommercialAlignment,
  getCommercialAlignmentSelectionAdjustment,
} from "./commercialQueryProductAlignmentLayer.js";

export const COMMERCIAL_SELECTION_ENGINE_VERSION = "4D.2";
export const TOP_ALTERNATIVE_OFFERS = 3;

const SCORE_WEIGHTS = Object.freeze({
  price: 40,
  quality: 25,
  completeness: 20,
  providerConfidence: 15,
});

const RELEVANT_SCORE_TIE_EPSILON = 0.75;

function cleanText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function cloneOffer(offer = {}) {
  return {
    source: offer.source ?? "",
    title: offer.title ?? "",
    price: offer.price ?? null,
    image: offer.image ?? null,
    url: offer.url ?? "",
    ...(offer.brand != null ? { brand: offer.brand } : {}),
    ...(offer.seller != null ? { seller: offer.seller } : {}),
    ...(offer.category != null ? { category: offer.category } : {}),
    ...(offer.provider != null ? { provider: offer.provider } : {}),
    ...(offer.externalId != null ? { externalId: offer.externalId } : {}),
  };
}

export function isValidCommercialOfferUrl(url = "") {
  const raw = cleanText(url);
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return /^https?:\/\//i.test(raw);
  }
}

export function isBrokenCommercialOffer(offer = {}) {
  const title = cleanText(offer.title);
  const price = parseNumericPrice(offer.price);

  if (!title || title.length < 3) return true;
  if (!isValidCommercialOfferUrl(offer.url)) return true;
  if (price == null || price <= 0) return true;

  return false;
}

function scorePriceComponent(price, priceBounds = {}) {
  const numericPrice = parseNumericPrice(price);
  if (numericPrice == null || numericPrice <= 0) return 0;

  const minPrice = priceBounds.min;
  const maxPrice = priceBounds.max;

  if (minPrice == null || maxPrice == null || minPrice === maxPrice) {
    return SCORE_WEIGHTS.price;
  }

  const ratio = (maxPrice - numericPrice) / (maxPrice - minPrice);
  return Math.max(0, Math.min(SCORE_WEIGHTS.price, ratio * SCORE_WEIGHTS.price));
}

function scoreQualityComponent(offer = {}) {
  let score = 0;
  const title = cleanText(offer.title);

  if (title.length >= 12) score += 10;
  else if (title.length >= 8) score += 6;

  if (isValidCommercialOfferUrl(offer.url)) score += 8;
  if (cleanText(offer.image)) score += 7;

  return Math.min(SCORE_WEIGHTS.quality, score);
}

function scoreCompletenessComponent(offer = {}) {
  let fields = 0;
  if (parseNumericPrice(offer.price) != null) fields += 1;
  if (cleanText(offer.image)) fields += 1;
  if (isValidCommercialOfferUrl(offer.url)) fields += 1;
  if (cleanText(offer.source)) fields += 1;

  return (fields / 4) * SCORE_WEIGHTS.completeness;
}

function scoreProviderConfidenceComponent(offer = {}) {
  let points = 0;
  if (cleanText(offer.source)) points += 4;
  if (cleanText(offer.seller)) points += 3;
  if (cleanText(offer.category)) points += 3;
  if (cleanText(offer.brand)) points += 3;
  if (cleanText(offer.externalId)) points += 2;

  return Math.min(SCORE_WEIGHTS.providerConfidence, points);
}

/**
 * @param {Record<string, unknown>} offer
 * @param {{ min?: number|null, max?: number|null }} [priceBounds]
 */
export function buildCommercialOfferScore(offer = {}, priceBounds = {}) {
  const price = scorePriceComponent(offer.price, priceBounds);
  const quality = scoreQualityComponent(offer);
  const completeness = scoreCompletenessComponent(offer);
  const providerConfidence = scoreProviderConfidenceComponent(offer);

  return {
    total: price + quality + completeness + providerConfidence,
    breakdown: {
      price,
      quality,
      completeness,
      providerConfidence,
    },
    numericPrice: parseNumericPrice(offer.price),
  };
}

function buildPriceBounds(offers = []) {
  const prices = offers
    .map((offer) => parseNumericPrice(offer.price))
    .filter((price) => price != null && price > 0);

  if (!prices.length) {
    return { min: null, max: null };
  }

  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
  };
}

function areScoresTied(leftScore = 0, rightScore = 0) {
  return Math.abs(leftScore - rightScore) <= RELEVANT_SCORE_TIE_EPSILON;
}

/**
 * @param {{
 *   offers?: Array<Record<string, unknown>>,
 *   query?: string,
 * }} input
 */
export function selectCommercialOffers(input = {}) {
  const offers = Array.isArray(input.offers) ? input.offers.map(cloneOffer) : [];
  const query = cleanText(input.query || "");
  const eligible = [];
  const excluded = [];

  for (const offer of offers) {
    if (isBrokenCommercialOffer(offer)) {
      excluded.push({
        offer,
        reason: "broken_offer",
      });
      continue;
    }
    eligible.push(offer);
  }

  if (!eligible.length) {
    return {
      selectedOffer: null,
      alternativeOffers: [],
      diagnostics: {
        inputCount: offers.length,
        eligibleCount: 0,
        excludedCount: excluded.length,
        tieGroupSize: 0,
        topScore: null,
        selectionReason: "no_eligible_offers",
      },
    };
  }

  const priceBounds = buildPriceBounds(eligible);
  const scored = eligible.map((offer, index) => {
    const commercialScore = buildCommercialOfferScore(offer, priceBounds);
    const alignment = query ? calculateCommercialAlignment({ query, offer }) : null;
    const alignmentAdjustment = getCommercialAlignmentSelectionAdjustment(alignment);
    const total = commercialScore.total + alignmentAdjustment;

    return {
      offer,
      index,
      alignment,
      score: {
        ...commercialScore,
        total,
        alignmentAdjustment,
        alignment: alignment
          ? {
              alignmentScore: alignment.alignmentScore,
              isAligned: alignment.isAligned,
              alignmentReason: alignment.alignmentReason,
              confidence: alignment.confidence,
            }
          : null,
      },
    };
  });

  scored.sort((left, right) => {
    if (right.score.total !== left.score.total) {
      return right.score.total - left.score.total;
    }

    const leftPrice = left.score.numericPrice ?? Number.POSITIVE_INFINITY;
    const rightPrice = right.score.numericPrice ?? Number.POSITIVE_INFINITY;
    if (leftPrice !== rightPrice) return leftPrice - rightPrice;

    return left.index - right.index;
  });

  const topScore = scored[0].score.total;
  const tieGroup = scored.filter((entry) => areScoresTied(entry.score.total, topScore));
  const selectedEntry = tieGroup[0] || scored[0];

  const alternatives = [];
  for (const entry of scored) {
    if (entry === selectedEntry) continue;
    if (alternatives.length >= TOP_ALTERNATIVE_OFFERS) break;

    if (
      areScoresTied(entry.score.total, topScore) ||
      alternatives.length < TOP_ALTERNATIVE_OFFERS
    ) {
      alternatives.push({
        ...entry.offer,
        commercialScore: entry.score.total,
        scoreBreakdown: entry.score.breakdown,
        alignment: entry.score.alignment,
      });
    }
  }

  return {
    selectedOffer: {
      ...selectedEntry.offer,
      commercialScore: selectedEntry.score.total,
      scoreBreakdown: selectedEntry.score.breakdown,
      alignment: selectedEntry.score.alignment,
    },
    alternativeOffers: alternatives.slice(0, TOP_ALTERNATIVE_OFFERS),
    diagnostics: {
      inputCount: offers.length,
      eligibleCount: eligible.length,
      excludedCount: excluded.length,
      tieGroupSize: tieGroup.length,
      topScore,
      selectedScore: selectedEntry.score.total,
      selectionReason:
        tieGroup.length > 1 ? "top_score_with_relevant_tie" : "top_commercial_score",
      priceBounds,
      queryApplied: !!query,
    },
  };
}
