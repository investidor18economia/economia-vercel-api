/**
 * PATCH Comercial 4E-B.1 — Accessory Commercial Runtime Enforcement
 *
 * Garante que queries de acessório no runtime controlled recebam ofertas compatíveis.
 * Não altera winner cognitivo, Router, Decision Engine ou resposta textual.
 */

import {
  detectAccessoryIntent,
  normalizeAccessoryIntentQuery,
} from "../commercial/accessoryIntentLockGuard.js";
import {
  calculateCommercialAlignment,
  detectCommercialAccessorySignals,
} from "./commercialQueryProductAlignmentLayer.js";
import { selectCommercialOffers } from "./commercialSelectionEngine.js";

export const ACCESSORY_COMMERCIAL_RUNTIME_ENFORCEMENT_VERSION = "4E-B.1";

function cleanText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function offerTitle(offer = null) {
  if (!offer || typeof offer !== "object") return "";
  return cleanText(offer.title || offer.product_name || "");
}

/**
 * @param {string} query
 */
export function shouldEnforceAccessoryCommercialRuntime(query = "") {
  return detectAccessoryIntent(query).isAccessoryIntent === true;
}

/**
 * @param {{ query?: string, offer?: Record<string, unknown>|string|null }} input
 */
export function isOfferCompatibleWithAccessoryIntent(input = {}) {
  const query = cleanText(input.query || "");
  const offer = input.offer;

  if (!shouldEnforceAccessoryCommercialRuntime(query)) {
    return true;
  }

  const title = typeof offer === "string" ? offer : offerTitle(offer);
  if (!title) return false;

  const alignment = calculateCommercialAlignment({
    query,
    offer: { title },
  });

  if (!alignment.offerHasAccessorySignals) {
    return false;
  }

  if (alignment.alignmentReason === "main_offer_for_accessory_query") {
    return false;
  }

  const intent = detectAccessoryIntent(query);
  const normalizedOffer = normalizeAccessoryIntentQuery(title);
  const sharedAccessorySignals = alignment.queryAccessorySignals.filter((signal) =>
    alignment.offerAccessorySignals.includes(signal)
  );

  if (sharedAccessorySignals.length > 0) {
    return true;
  }

  for (const signal of intent.matchedSignals) {
    const normalizedSignal = normalizeAccessoryIntentQuery(signal);
    if (normalizedSignal && normalizedOffer.includes(normalizedSignal)) {
      return true;
    }
  }

  const offerAccessorySignals = detectCommercialAccessorySignals(title);
  return offerAccessorySignals.some((signal) =>
    intent.matchedSignals.some((matched) => {
      const normalizedMatched = normalizeAccessoryIntentQuery(matched);
      const normalizedSignal = normalizeAccessoryIntentQuery(signal.replace(/_/g, " "));
      return (
        normalizedOffer.includes(normalizedMatched) ||
        normalizedOffer.includes(normalizedSignal)
      );
    })
  );
}

/**
 * @param {{ query?: string, offers?: Array<Record<string, unknown>> }} input
 */
export function filterAccessoryCompatibleOffers(input = {}) {
  const query = cleanText(input.query || "");
  const offers = Array.isArray(input.offers) ? input.offers : [];

  if (!shouldEnforceAccessoryCommercialRuntime(query)) {
    return offers;
  }

  return offers.filter((offer) => isOfferCompatibleWithAccessoryIntent({ query, offer }));
}

/**
 * @param {{
 *   query?: string,
 *   selectedOffer?: Record<string, unknown>|null,
 *   alternativeOffers?: Array<Record<string, unknown>>,
 *   candidateOffers?: Array<Record<string, unknown>>,
 *   legacyOffer?: Record<string, unknown>|null,
 * }} input
 */
export function enforceAccessoryCommercialRuntimeSelection(input = {}) {
  const query = cleanText(input.query || "");
  const intent = detectAccessoryIntent(query);
  const active = shouldEnforceAccessoryCommercialRuntime(query);

  const base = {
    active,
    isAccessoryIntent: intent.isAccessoryIntent,
    matchedSignals: intent.matchedSignals,
    selectedOfferBefore: input.selectedOffer || null,
    selectedOfferAfter: input.selectedOffer || null,
    blockedIncompatibleOffer: false,
    fallbackReason: null,
    usedLegacyCompatibleOffer: false,
    suppressCommercialOffer: false,
  };

  if (!active) {
    return base;
  }

  const tryOffer = (offer) =>
    offer && isOfferCompatibleWithAccessoryIntent({ query, offer }) ? offer : null;

  let selected = tryOffer(input.selectedOffer);
  if (selected) {
    return {
      ...base,
      selectedOfferAfter: selected,
    };
  }

  if (input.selectedOffer) {
    base.blockedIncompatibleOffer = true;
  }

  for (const alternative of input.alternativeOffers || []) {
    selected = tryOffer(alternative);
    if (selected) {
      return {
        ...base,
        selectedOfferAfter: selected,
        fallbackReason: "accessory_compatible_alternative_offer",
      };
    }
  }

  const compatibleCandidates = filterAccessoryCompatibleOffers({
    query,
    offers: input.candidateOffers || [],
  });

  if (compatibleCandidates.length) {
    const selection = selectCommercialOffers({ query, offers: compatibleCandidates });
    selected = tryOffer(selection.selectedOffer);
    if (selected) {
      return {
        ...base,
        selectedOfferAfter: selected,
        fallbackReason: "accessory_compatible_reselection",
      };
    }
  }

  const legacyCompatible = tryOffer(
    input.legacyOffer
      ? { title: offerTitle(input.legacyOffer), ...input.legacyOffer }
      : null
  );

  if (legacyCompatible) {
    return {
      ...base,
      selectedOfferAfter: null,
      usedLegacyCompatibleOffer: true,
      fallbackReason: "accessory_compatible_legacy",
    };
  }

  return {
    ...base,
    selectedOfferAfter: null,
    blockedIncompatibleOffer: true,
    suppressCommercialOffer: true,
    fallbackReason: "accessory_no_compatible_offer",
  };
}

/**
 * @param {Record<string, unknown>} enforcement
 */
export function buildAccessoryCommercialRuntimeDiagnostics(enforcement = {}) {
  return {
    version: ACCESSORY_COMMERCIAL_RUNTIME_ENFORCEMENT_VERSION,
    active: enforcement.active === true,
    isAccessoryIntent: enforcement.isAccessoryIntent === true,
    matchedSignals: Array.isArray(enforcement.matchedSignals)
      ? enforcement.matchedSignals
      : [],
    selectedOfferBefore: enforcement.selectedOfferBefore
      ? {
          title: offerTitle(enforcement.selectedOfferBefore),
          url:
            enforcement.selectedOfferBefore.url ||
            enforcement.selectedOfferBefore.link ||
            null,
        }
      : null,
    selectedOfferAfter: enforcement.selectedOfferAfter
      ? {
          title: offerTitle(enforcement.selectedOfferAfter),
          url:
            enforcement.selectedOfferAfter.url ||
            enforcement.selectedOfferAfter.link ||
            null,
        }
      : null,
    blockedIncompatibleOffer: enforcement.blockedIncompatibleOffer === true,
    usedLegacyCompatibleOffer: enforcement.usedLegacyCompatibleOffer === true,
    suppressCommercialOffer: enforcement.suppressCommercialOffer === true,
    fallbackReason: enforcement.fallbackReason || null,
  };
}

/**
 * @param {Record<string, unknown>} diagnostics
 */
export function buildAccessoryRuntimeEnforcementDevPayload(diagnostics = {}) {
  return {
    active: diagnostics.active === true,
    blockedIncompatibleOffer: diagnostics.blockedIncompatibleOffer === true,
    suppressCommercialOffer: diagnostics.suppressCommercialOffer === true,
    fallbackReason: diagnostics.fallbackReason || null,
    isAccessoryIntent: diagnostics.isAccessoryIntent === true,
    matchedSignals: diagnostics.matchedSignals || [],
  };
}
