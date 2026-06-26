/**
 * PATCH Comercial 4E-B.2 — Non-Data-Layer Card Trust Label Fix
 *
 * Ajusta rótulos visuais de confiança do card com base em knowledgeMetadata.
 * Não recalcula origem no cliente — consome metadata do guard 4E-A.3.
 */

import { resolveOfferCardPresentation } from "./miaCommercialFallbackDisplay.js";

export const COMMERCIAL_CARD_TRUST_LABELS_VERSION = "4E-B.2";

export const DATA_LAYER_CARD_BADGE = "✓ Produto disponível na base da MIA";
export const DATA_LAYER_CARD_SOURCE_LABEL = "Conhecimento validado da MIA";
export const DATA_LAYER_CARD_SUBTITLE =
  "A MIA continua analisando este produto com base no Data Layer.";

export const GOVERNED_FALLBACK_CARD_BADGE = "• Análise comercial assistida";
export const GOVERNED_FALLBACK_CARD_SOURCE_LABEL = "Análise comercial assistida";
export const GOVERNED_FALLBACK_CARD_SUBTITLE =
  "A MIA ainda não auditou esta categoria por completo.";

const FALSE_DATA_LAYER_TRUST_MARKERS = Object.freeze([
  "produto disponível na base da mia",
  "conhecimento validado da mia",
  "continua analisando este produto com base no data layer",
  "data layer mia",
]);

/**
 * @param {Record<string, unknown>|null|undefined} knowledgeMetadata
 */
export function shouldApplyGovernedFallbackCardTrustLabels(knowledgeMetadata = null) {
  return knowledgeMetadata?.transparencyRequired === true;
}

/**
 * @param {unknown} value
 */
export function containsFalseDataLayerTrustCopy(value = "") {
  const raw = String(value || "").toLowerCase();
  if (!raw) return false;
  return FALSE_DATA_LAYER_TRUST_MARKERS.some((marker) => raw.includes(marker));
}

/**
 * @param {Record<string, unknown>|null|undefined} knowledgeMetadata
 */
export function shouldPreserveDataLayerCardTrustLabels(knowledgeMetadata = null) {
  return knowledgeMetadata?.isAudited === true;
}

/**
 * @param {{
 *   presentation?: Record<string, unknown>|null,
 *   knowledgeMetadata?: Record<string, unknown>|null,
 * }} input
 */
export function applyCommercialCardTrustLabels(input = {}) {
  const presentation = input.presentation && typeof input.presentation === "object"
    ? { ...input.presentation }
    : {};
  const knowledgeMetadata = input.knowledgeMetadata || null;

  if (shouldPreserveDataLayerCardTrustLabels(knowledgeMetadata)) {
    return {
      presentation,
      trustLabelMode: "data_layer",
    };
  }

  if (!shouldApplyGovernedFallbackCardTrustLabels(knowledgeMetadata)) {
    return {
      presentation,
      trustLabelMode: "neutral",
    };
  }

  const hasFalseTrustCopy =
    containsFalseDataLayerTrustCopy(presentation.badge) ||
    containsFalseDataLayerTrustCopy(presentation.subtitle) ||
    containsFalseDataLayerTrustCopy(presentation.sourceLabel) ||
    presentation.useDataLayerPresentation === true;

  if (!hasFalseTrustCopy) {
    return {
      presentation,
      trustLabelMode: "governed_fallback",
    };
  }

  if (
    presentation.badge ||
    presentation.useDataLayerPresentation ||
    containsFalseDataLayerTrustCopy(presentation.badge)
  ) {
    presentation.badge = GOVERNED_FALLBACK_CARD_BADGE;
  }

  if (presentation.subtitle && containsFalseDataLayerTrustCopy(presentation.subtitle)) {
    presentation.subtitle = GOVERNED_FALLBACK_CARD_SUBTITLE;
  } else if (presentation.priceUnavailable && presentation.useDataLayerPresentation) {
    presentation.subtitle = GOVERNED_FALLBACK_CARD_SUBTITLE;
  }

  if (containsFalseDataLayerTrustCopy(presentation.sourceLabel)) {
    presentation.sourceLabel = GOVERNED_FALLBACK_CARD_SOURCE_LABEL;
  } else if (presentation.useDataLayerPresentation && !presentation.sourceLabel) {
    presentation.sourceLabel = GOVERNED_FALLBACK_CARD_SOURCE_LABEL;
  }

  return {
    presentation,
    trustLabelMode: "governed_fallback",
  };
}

/**
 * @param {Record<string, unknown>} offerCard
 * @param {Record<string, unknown>|null|undefined} knowledgeMetadata
 */
export function resolveOfferCardPresentationWithTrustLabels(
  offerCard = {},
  knowledgeMetadata = null
) {
  const base = resolveOfferCardPresentation(offerCard);
  const { presentation, trustLabelMode } = applyCommercialCardTrustLabels({
    presentation: base,
    knowledgeMetadata,
  });

  return {
    ...presentation,
    trustLabelMode,
  };
}

/**
 * @param {Record<string, unknown>} presentation
 */
export function collectCardTrustLabelText(presentation = {}) {
  return [
    presentation.badge,
    presentation.subtitle,
    presentation.sourceLabel,
    presentation.priceText,
    presentation.ctaText,
  ]
    .filter(Boolean)
    .join(" ");
}
