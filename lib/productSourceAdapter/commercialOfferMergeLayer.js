/**
 * PATCH Comercial 4C-A — Commercial Offer Merge Layer
 *
 * Agrega ofertas normalizadas de múltiplos providers comerciais.
 * Não deduplica, filtra, ordena, ranqueia ou seleciona winner.
 */

import {
  COMMERCIAL_PROVIDER_IDS,
  getCommercialProviderById,
  getCommercialProviderRegistrySummary,
  isCommercialProviderEnabled,
} from "./commercialProviderRegistry.js";

export const COMMERCIAL_OFFER_MERGE_LAYER_VERSION = "4C-A.1";
export const DEFAULT_MERGE_LIMIT_PER_PROVIDER = 5;

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

/**
 * @param {Record<string, unknown>} [product]
 */
export function mapGoogleShoppingOfferToMergedOffer(product = {}) {
  return cloneOffer({
    source: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
    title: cleanText(product.product_name || product.title || product.normalizedName || ""),
    price: product.price ?? product.numericPrice ?? null,
    image: product.thumbnail || product.image || null,
    url: cleanText(product.link || product.url || ""),
    brand: product.brand ?? null,
    seller: product.seller ?? null,
    category: product.category ?? "",
    provider: product.provider ?? COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
    externalId: product.externalId ?? null,
  });
}

/**
 * @param {Record<string, unknown>} [product]
 */
export function mapApifyMercadoLivreOfferToMergedOffer(product = {}) {
  return cloneOffer({
    source: product.source || COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE,
    title: cleanText(product.title || product.product_name || ""),
    price: product.price ?? null,
    image: product.image || product.thumbnail || null,
    url: cleanText(product.url || product.link || ""),
    brand: product.brand ?? null,
    seller: product.seller ?? null,
    category: product.category ?? null,
    provider: COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE,
  });
}

function resolveProviderGate(options = {}) {
  if (options.providerEnabled && typeof options.providerEnabled === "object") {
    return {
      googleShopping:
        options.providerEnabled[COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING] !== false,
      apifyMercadoLivre:
        options.providerEnabled[COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE] !== false,
    };
  }

  return {
    googleShopping: isCommercialProviderEnabled(COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING),
    apifyMercadoLivre: isCommercialProviderEnabled(COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE),
  };
}

function mapOfferList(items = [], mapper = (entry) => entry) {
  if (!Array.isArray(items)) return [];
  return items.map((entry) => mapper(entry || {}));
}

/**
 * @param {string} providerId
 */
export function validateCommercialMergeProvider(providerId = "") {
  const provider = getCommercialProviderById(providerId);
  if (!provider) {
    return {
      ok: false,
      providerId,
      reason: "unknown_provider",
      enabled: false,
    };
  }

  return {
    ok: true,
    providerId: provider.id,
    reason: provider.enabled ? "enabled" : "disabled",
    enabled: provider.enabled === true,
    providerType: provider.providerType,
    version: provider.version,
  };
}

export function validateCommercialMergeRegistry() {
  const summary = getCommercialProviderRegistrySummary();
  const google = validateCommercialMergeProvider(COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING);
  const apify = validateCommercialMergeProvider(COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE);
  const unknown = validateCommercialMergeProvider("provider_inexistente");

  return {
    registryVersion: summary.version,
    googleShopping: google,
    apifyMercadoLivre: apify,
    unknownProvider: unknown,
    enabledProviders: summary.enabledProviders,
  };
}

/**
 * @param {{
 *   googleShoppingOffers?: unknown[],
 *   apifyMercadoLivreOffers?: unknown[],
 *   providerEnabled?: Record<string, boolean>,
 * }} input
 * @param {{ providerEnabled?: Record<string, boolean> }} [options]
 */
export function mergeCommercialOfferBundle(input = {}, options = {}) {
  const gate = resolveProviderGate({
    providerEnabled: options.providerEnabled || input.providerEnabled,
  });
  const registryValidation = validateCommercialMergeRegistry();

  const googleShoppingOffers = Array.isArray(input.googleShoppingOffers)
    ? input.googleShoppingOffers
    : [];
  const apifyMercadoLivreOffers = Array.isArray(input.apifyMercadoLivreOffers)
    ? input.apifyMercadoLivreOffers
    : [];

  const googleOffers = gate.googleShopping
    ? mapOfferList(googleShoppingOffers, mapGoogleShoppingOfferToMergedOffer)
    : [];
  const apifyOffers = gate.apifyMercadoLivre
    ? mapOfferList(apifyMercadoLivreOffers, mapApifyMercadoLivreOfferToMergedOffer)
    : [];

  const offers = [...googleOffers, ...apifyOffers];
  const providersUsed = [];

  if (gate.googleShopping && googleOffers.length) {
    providersUsed.push(COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING);
  }
  if (gate.apifyMercadoLivre && apifyOffers.length) {
    providersUsed.push(COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE);
  }

  return {
    offers,
    providersUsed,
    diagnostics: {
      googleCount: googleOffers.length,
      apifyCount: apifyOffers.length,
      mergedCount: offers.length,
      googleEnabled: gate.googleShopping,
      apifyEnabled: gate.apifyMercadoLivre,
      registryVersion: registryValidation.registryVersion,
    },
    registryValidation,
  };
}

/**
 * @param {{
 *   googleShoppingOffers?: unknown[],
 *   apifyMercadoLivreOffers?: unknown[],
 *   providerEnabled?: Record<string, boolean>,
 * }} input
 * @param {{ providerEnabled?: Record<string, boolean> }} [options]
 */
export function mergeCommercialOffers(input = {}, options = {}) {
  return mergeCommercialOfferBundle(input, options).offers;
}

export function clampMergeLimitPerProvider(limit = DEFAULT_MERGE_LIMIT_PER_PROVIDER) {
  const parsed = Number.parseInt(String(limit), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_MERGE_LIMIT_PER_PROVIDER;
  return Math.min(parsed, DEFAULT_MERGE_LIMIT_PER_PROVIDER);
}
