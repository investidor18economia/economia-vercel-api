/**
 * PATCH 10.1F — Commercial API Exhaustion Fallback Display
 *
 * Camada de apresentação para ausência de oferta comercial.
 * Não altera winner, ranking, scoring, Data Layer ou decisão.
 */

import { sanitizeDisplaySource } from "./miaFirstAnswerResponseContract.js";

export const COMMERCIAL_FALLBACK_DISPLAY_VERSION = "10.1F.1";

export const COMMERCIAL_FALLBACK_TYPES = Object.freeze({
  NONE: "none",
  DATA_LAYER_WITHOUT_OFFER: "data_layer_without_offer",
  TECHNICAL_SOURCE_MASKED: "technical_source_masked",
  NO_URL: "no_url",
  API_EXHAUSTION: "api_exhaustion",
});

const DATA_LAYER_SOURCE_LABEL = "Data Layer MIA";
const VALIDATED_KNOWLEDGE_LABEL = "Conhecimento validado da MIA";

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isTechnicalSource(source = "") {
  const raw = cleanText(source).toLowerCase();
  if (!raw) return true;
  return (
    raw === "query_product_anchor" ||
    raw === "query_product_anchor_provider" ||
    /query_product_anchor|product_anchor/i.test(raw)
  );
}

function isDataLayerBackedSource(source = "") {
  const raw = cleanText(source).toLowerCase();
  return (
    isTechnicalSource(source) ||
    raw === DATA_LAYER_SOURCE_LABEL.toLowerCase() ||
    raw === "resultado"
  );
}

export function hasValidCommercialPrice(price) {
  if (price == null || price === "") return false;

  if (typeof price === "number" && !Number.isNaN(price) && price > 0) {
    return true;
  }

  const priceStr = String(price).trim();
  if (!priceStr) return false;

  let raw = priceStr.replace(/^R\s?\$\s?/i, "").trim();
  let num;

  if (/,\d{1,2}$/.test(raw)) {
    num = parseFloat(raw.replace(/\./g, "").replace(",", "."));
  } else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
    num = parseFloat(raw.replace(/\./g, ""));
  } else if (/^\d+\.\d{1,2}$/.test(raw)) {
    num = parseFloat(raw);
  } else {
    const digits = raw.replace(/[^\d.,]/g, "");
    if (!digits) return false;
    num = parseFloat(digits.replace(/\./g, "").replace(",", "."));
  }

  return !Number.isNaN(num) && num > 0;
}

export function deriveCommercialDisplayContext(price = {}, extra = {}) {
  const source = price.source || extra.source || "";
  const hasUrl = Boolean(cleanText(price.link));
  const hasPrice = hasValidCommercialPrice(price.price);
  const hasStore =
    Boolean(cleanText(source)) &&
    !isDataLayerBackedSource(source) &&
    !isTechnicalSource(source);

  return {
    winner: cleanText(extra.winner || price.product_name || ""),
    commercialStatus: cleanText(
      extra.commercialStatus || price.commercialStatus || price.offer_status || ""
    ),
    hasOffer: hasPrice && hasUrl,
    hasPrice,
    hasStore,
    hasUrl,
    source,
    category: cleanText(extra.category || price.category || ""),
    dataLayerPrimary:
      !!extra.dataLayerPrimary ||
      !!price.dataLayerPrimary ||
      !!price.specificProductQueryAnchor ||
      !!extra.specificProductQueryAnchor,
    specificProductQueryAnchor:
      !!price.specificProductQueryAnchor || !!extra.specificProductQueryAnchor,
  };
}

/**
 * @param {{
 *   winner?: string,
 *   commercialStatus?: string,
 *   hasOffer?: boolean,
 *   hasPrice?: boolean,
 *   hasStore?: boolean,
 *   hasUrl?: boolean,
 *   source?: string,
 *   category?: string,
 *   dataLayerPrimary?: boolean,
 *   specificProductQueryAnchor?: boolean,
 * }} context
 */
export function resolveCommercialFallbackDisplay(context = {}) {
  const sourceBefore = cleanText(context.source);
  const displaySource = sanitizeDisplaySource(sourceBefore);
  const dataLayerBacked =
    !!context.dataLayerPrimary ||
    !!context.specificProductQueryAnchor ||
    isDataLayerBackedSource(sourceBefore);
  const apiExhaustion = /rate_limit|quota|timeout|unavailable|exhaust|provider_error|forbidden/i.test(
    context.commercialStatus || ""
  );

  if (context.hasOffer) {
    return {
      applied: false,
      displayStatus: null,
      displaySubtitle: null,
      displaySource,
      displayCta: null,
      displayBadge: null,
      fallbackType: COMMERCIAL_FALLBACK_TYPES.NONE,
      sourceBefore,
      sourceAfter: displaySource,
    };
  }

  let fallbackType = COMMERCIAL_FALLBACK_TYPES.NONE;
  let displayStatus = null;
  let displaySubtitle = null;
  let displayCta = null;
  let displayBadge = null;
  let applied = false;

  if (isTechnicalSource(sourceBefore)) {
    fallbackType = COMMERCIAL_FALLBACK_TYPES.TECHNICAL_SOURCE_MASKED;
    applied = true;
  }

  if (apiExhaustion) {
    fallbackType = COMMERCIAL_FALLBACK_TYPES.API_EXHAUSTION;
    displayStatus = "Preço temporariamente indisponível";
    displaySubtitle =
      "A consulta comercial está temporariamente indisponível. A MIA continua analisando este produto com base no Data Layer.";
    applied = true;
  } else if (!context.hasPrice && dataLayerBacked) {
    fallbackType = COMMERCIAL_FALLBACK_TYPES.DATA_LAYER_WITHOUT_OFFER;
    displayStatus = "Preço temporariamente indisponível";
    displaySubtitle = "A MIA continua analisando este produto com base no Data Layer.";
    applied = true;
  } else if (!context.hasPrice) {
    displayStatus = "Preço temporariamente indisponível";
    displaySubtitle = "A MIA continua analisando este produto com base no Data Layer.";
    applied = true;
    fallbackType = COMMERCIAL_FALLBACK_TYPES.DATA_LAYER_WITHOUT_OFFER;
  }

  if (!context.hasUrl) {
    displayCta = context.hasPrice
      ? "Oferta indisponível neste momento"
      : "Nenhuma oferta atual encontrada";
    if (fallbackType === COMMERCIAL_FALLBACK_TYPES.NONE) {
      fallbackType = COMMERCIAL_FALLBACK_TYPES.NO_URL;
    }
    applied = true;
  }

  if (dataLayerBacked && !context.hasOffer) {
    displayBadge = "✓ Produto disponível na base da MIA";
    if (!displaySubtitle) {
      displaySubtitle = "A MIA continua analisando este produto com base no Data Layer.";
    }
    applied = true;
  }

  const resolvedDisplaySource = dataLayerBacked
    ? displaySource === DATA_LAYER_SOURCE_LABEL
      ? VALIDATED_KNOWLEDGE_LABEL
      : displaySource
    : displaySource;

  return {
    applied,
    displayStatus,
    displaySubtitle,
    displaySource: resolvedDisplaySource,
    displayCta,
    displayBadge,
    fallbackType,
    sourceBefore,
    sourceAfter: resolvedDisplaySource,
  };
}

export function resolveOfferCardPresentation(offerCard = {}, extra = {}) {
  const context = deriveCommercialDisplayContext(offerCard, extra);
  const display = resolveCommercialFallbackDisplay(context);
  const hasPrice = context.hasPrice;
  const hasUrl = context.hasUrl;

  const apiEnriched =
    offerCard.displayStatus ||
    offerCard.displaySubtitle ||
    offerCard.displayCta ||
    offerCard.displayBadge ||
    offerCard.commercial_fallback_display_applied;

  const priceText = hasPrice
    ? null
    : offerCard.displayStatus || display.displayStatus || "Preço temporariamente indisponível";

  const subtitle =
    offerCard.displaySubtitle ||
    display.displaySubtitle ||
    (!hasPrice && display.applied ? "A MIA continua analisando este produto com base no Data Layer." : null);

  const ctaText = hasUrl
    ? null
    : offerCard.displayCta || display.displayCta || "Nenhuma oferta atual encontrada";

  const badge = offerCard.displayBadge || display.displayBadge || null;

  const sourceLabel =
    offerCard.displaySource || display.displaySource || sanitizeDisplaySource(offerCard.source || "");

  const useDataLayerPresentation = context.hasOffer
    ? false
    : apiEnriched ||
      display.applied ||
      context.dataLayerPrimary ||
      isTechnicalSource(offerCard.source || "") ||
      isDataLayerBackedSource(offerCard.source || "");

  return {
    priceLabel: hasPrice ? "Valor encontrado" : null,
    priceText,
    priceUnavailable: !hasPrice,
    subtitle,
    badge,
    ctaText,
    sourceLabel,
    useDataLayerPresentation,
    fallbackType: offerCard.fallbackType || display.fallbackType || COMMERCIAL_FALLBACK_TYPES.NONE,
    applied: apiEnriched || display.applied,
  };
}

export function applyCommercialFallbackDisplayToPrices(prices = [], context = {}) {
  if (!Array.isArray(prices) || !prices.length) {
    return {
      applied: false,
      prices: [],
      audit: null,
    };
  }

  const audits = [];
  const enriched = prices.map((price) => {
    const itemContext = deriveCommercialDisplayContext(price, {
      ...context,
      winner: context.winner || price.product_name || "",
    });
    const display = resolveCommercialFallbackDisplay(itemContext);

    const audit = {
      applied: display.applied,
      winner: itemContext.winner,
      sourceBefore: display.sourceBefore,
      sourceAfter: display.sourceAfter,
      fallbackType: display.fallbackType,
      hasOffer: itemContext.hasOffer,
      hasPrice: itemContext.hasPrice,
      hasUrl: itemContext.hasUrl,
      displayStatus: display.displayStatus,
    };

    audits.push(audit);

    if (!display.applied) {
      return {
        ...price,
        source: display.displaySource || price.source,
      };
    }

    return {
      ...price,
      source: display.displaySource || price.source,
      displayStatus: display.displayStatus,
      displaySubtitle: display.displaySubtitle,
      displaySource: display.displaySource,
      displayCta: display.displayCta,
      displayBadge: display.displayBadge,
      fallbackType: display.fallbackType,
      commercial_fallback_display_applied: true,
    };
  });

  const primaryAudit = audits[0] || null;

  return {
    applied: audits.some((entry) => entry.applied),
    prices: enriched,
    audit: primaryAudit,
  };
}

export function logCommercialApiExhaustionFallbackAudit(audit = null) {
  if (!audit) return;
  console.log(
    "COMMERCIAL_API_EXHAUSTION_FALLBACK_AUDIT",
    JSON.stringify({
      version: COMMERCIAL_FALLBACK_DISPLAY_VERSION,
      ...audit,
    })
  );
}
