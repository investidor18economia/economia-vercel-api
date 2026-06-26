/**
 * PATCH Comercial 4E-B — Commercial Runtime Controlled Activation
 *
 * Ativa o pipeline multi-provider como fonte oficial da oferta comercial
 * apenas em modo controlled, com fallback automático para o legado.
 */

import { hasValidCommercialPrice } from "../miaCommercialFallbackDisplay.js";
import { calculateCommercialAlignment } from "./commercialQueryProductAlignmentLayer.js";
import { COMMERCIAL_PROVIDER_IDS } from "./commercialProviderRegistry.js";
import {
  areSameCommercialShadowOffers,
  normalizeLegacyCommercialOfferForShadow,
  normalizeShadowSelectedOffer,
  runCommercialShadowPipeline,
} from "./commercialRuntimeShadow.js";
import {
  getCommercialRuntimeMode,
  isCommercialRuntimeControlled,
  isCommercialRuntimeLegacy,
  isCommercialRuntimeShadow,
} from "./commercialRuntimeMode.js";
import {
  buildAccessoryCommercialRuntimeDiagnostics,
  enforceAccessoryCommercialRuntimeSelection,
  shouldEnforceAccessoryCommercialRuntime,
} from "./accessoryCommercialRuntimeEnforcement.js";

export const COMMERCIAL_RUNTIME_ACTIVATION_VERSION = "4E-B.1";
const ACTIVATION_PIPELINE_TIMEOUT_MS = 15000;

function cleanText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function withActivationTimeout(promise, ms = ACTIVATION_PIPELINE_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("shadow_timeout")), ms);
    }),
  ]);
}

function parseNumericCommercialPrice(price) {
  if (typeof price === "number" && !Number.isNaN(price) && price > 0) {
    return price;
  }

  const raw = String(price ?? "").trim();
  if (!raw) return null;

  let normalized = raw.replace(/^R\s?\$\s?/i, "").trim();
  let parsed;

  if (/,\d{1,2}$/.test(normalized)) {
    parsed = parseFloat(normalized.replace(/\./g, "").replace(",", "."));
  } else {
    parsed = parseFloat(normalized.replace(/[^\d.,]/g, "").replace(",", "."));
  }

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function sanitizeCommercialSource(source = "") {
  const raw = cleanText(source);
  if (!raw) return "resultado";
  if (/google shopping|serpapi/i.test(raw)) return "Google Shopping";
  if (/mercado livre|mercadolivre|apify/i.test(raw)) return "Mercado Livre";
  return raw;
}

/**
 * @param {Record<string, unknown>|null} product
 */
export function mapLegacyProductToCardShape(product = null) {
  if (!product || typeof product !== "object") return null;

  const productName = cleanText(product.product_name || product.title || "");
  const link = cleanText(product.link || product.url || "");
  const price = product.price ?? null;

  if (!productName) return null;

  return {
    product_name: productName,
    price,
    numericPrice: product.numericPrice ?? parseNumericCommercialPrice(price),
    link,
    thumbnail: product.thumbnail || product.image || null,
    source: sanitizeCommercialSource(product.source || "resultado"),
    provider:
      product.commercialProvider ||
      product.provider ||
      product.source ||
      COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
    commercialProvider:
      product.commercialProvider ||
      product.provider ||
      product.source ||
      null,
  };
}

/**
 * @param {Record<string, unknown>|null} selectedOffer
 * @param {Record<string, unknown>|null} winnerProduct
 * @param {{ preferOfferTitle?: boolean }} [options]
 */
export function mapSelectedOfferToLegacyCardShape(
  selectedOffer = null,
  winnerProduct = null,
  options = {}
) {
  if (!selectedOffer || typeof selectedOffer !== "object") return null;

  const title = cleanText(selectedOffer.title || selectedOffer.product_name || "");
  const link = cleanText(selectedOffer.url || selectedOffer.link || "");
  const price = selectedOffer.price ?? null;
  const preferOfferTitle = options.preferOfferTitle === true;
  const winnerName = cleanText(
    preferOfferTitle
      ? title
      : winnerProduct?.product_name || winnerProduct?.title || title
  );

  if (!winnerName || !link || !hasValidCommercialPrice(price)) {
    return null;
  }

  const provider =
    selectedOffer.source ||
    selectedOffer.provider ||
    COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE;

  return {
    product_name: winnerName,
    price,
    numericPrice: parseNumericCommercialPrice(price),
    link,
    thumbnail: selectedOffer.image || selectedOffer.thumbnail || null,
    source: sanitizeCommercialSource(provider),
    provider,
    commercialProvider: provider,
  };
}

function validateSelectedOfferForActivation(query = "", offer = null) {
  const title = cleanText(offer?.title || offer?.product_name || "");
  const url = cleanText(offer?.url || offer?.link || "");
  const price = offer?.price;

  if (!title) return { ok: false, reason: "missing_title" };
  if (!url) return { ok: false, reason: "missing_url" };
  if (!hasValidCommercialPrice(price)) return { ok: false, reason: "missing_price" };

  const alignment = calculateCommercialAlignment({ query, offer });
  if (alignment?.isAligned === false) {
    return { ok: false, reason: "misaligned_offer" };
  }

  return { ok: true, alignment };
}

/**
 * @param {Record<string, unknown>} activation
 */
export function buildCommercialRuntimeActivationDiagnostics(activation = {}) {
  const legacyNorm = normalizeLegacyCommercialOfferForShadow(
    activation.legacyOffer || activation.legacyCard
  );
  const shadowNorm = activation.newPipelineOffer
    ? normalizeShadowSelectedOffer(activation.newPipelineOffer)
    : null;
  const officialNorm = activation.usedNewPipeline
    ? shadowNorm
    : legacyNorm;

  return {
    version: COMMERCIAL_RUNTIME_ACTIVATION_VERSION,
    mode: activation.mode || getCommercialRuntimeMode(),
    officialProvider:
      activation.officialProvider ||
      officialNorm?.provider ||
      legacyNorm?.provider ||
      null,
    usedNewPipeline: activation.usedNewPipeline === true,
    fallbackToLegacy: activation.fallbackToLegacy === true,
    fallbackReason: activation.fallbackReason || null,
    selectedOffer: officialNorm,
    legacyOffer: legacyNorm,
    shadowOffer: shadowNorm,
    sameOffer: areSameCommercialShadowOffers(legacyNorm, shadowNorm),
    accessoryRuntimeEnforcement: activation.accessoryRuntimeDiagnostics || null,
  };
}

function finalizeControlledCommercialOffer({
  query = "",
  legacySource = null,
  legacyCard = null,
  winnerProduct = null,
  pipelineResult = null,
  base = {},
}) {
  const enforcement = enforceAccessoryCommercialRuntimeSelection({
    query,
    selectedOffer: pipelineResult?.shadowOffer || null,
    alternativeOffers: pipelineResult?.alternativeOffers || [],
    candidateOffers: pipelineResult?.trace?.dedupe?.offers || [],
    legacyOffer: legacySource,
  });

  const accessoryRuntimeDiagnostics = buildAccessoryCommercialRuntimeDiagnostics(enforcement);
  const withEnforcement = {
    ...base,
    pipelineResult,
    accessoryEnforcement: enforcement,
    accessoryRuntimeDiagnostics,
  };

  if (enforcement.active && enforcement.suppressCommercialOffer) {
    return {
      ...withEnforcement,
      officialOffer: null,
      newPipelineOffer: pipelineResult?.shadowOffer || null,
      usedNewPipeline: false,
      fallbackToLegacy: true,
      fallbackReason: enforcement.fallbackReason || "accessory_no_compatible_offer",
    };
  }

  if (enforcement.active && enforcement.usedLegacyCompatibleOffer) {
    return {
      ...withEnforcement,
      officialOffer: legacyCard,
      newPipelineOffer: pipelineResult?.shadowOffer || null,
      usedNewPipeline: false,
      fallbackToLegacy: true,
      fallbackReason: enforcement.fallbackReason || "accessory_compatible_legacy",
    };
  }

  const effectiveOffer = enforcement.selectedOfferAfter || pipelineResult?.shadowOffer || null;

  if (!effectiveOffer) {
    return {
      ...withEnforcement,
      fallbackToLegacy: true,
      fallbackReason: pipelineResult?.error || "empty_selection",
    };
  }

  const validation = validateSelectedOfferForActivation(query, effectiveOffer);
  if (!validation.ok) {
    return {
      ...withEnforcement,
      newPipelineOffer: effectiveOffer,
      fallbackToLegacy: true,
      fallbackReason: validation.reason,
    };
  }

  const mapped = mapSelectedOfferToLegacyCardShape(
    effectiveOffer,
    winnerProduct || legacySource,
    { preferOfferTitle: enforcement.active || shouldEnforceAccessoryCommercialRuntime(query) }
  );

  if (!mapped) {
    return {
      ...withEnforcement,
      newPipelineOffer: effectiveOffer,
      fallbackToLegacy: true,
      fallbackReason: "invalid_card_shape",
    };
  }

  return {
    ...withEnforcement,
    officialOffer: mapped,
    newPipelineOffer: effectiveOffer,
    usedNewPipeline: true,
    fallbackToLegacy: false,
    fallbackReason: null,
    officialProvider: mapped.provider || null,
  };
}

/**
 * @param {{
 *   query?: string,
 *   legacyOffer?: Record<string, unknown>|null,
 *   winnerProduct?: Record<string, unknown>|null,
 *   mode?: string,
 *   limit?: number,
 *   fetchGoogle?: Function,
 *   fetchApify?: Function,
 *   timeoutMs?: number,
 * }} input
 */
export async function resolveOfficialCommercialOffer(input = {}) {
  const mode = getCommercialRuntimeMode(input.mode);
  const query = cleanText(input.query || "");
  const legacySource = input.legacyOffer || input.winnerProduct || null;
  const legacyCard = mapLegacyProductToCardShape(legacySource);

  const base = {
    mode,
    officialOffer: legacyCard,
    legacyOffer: legacySource,
    legacyCard,
    newPipelineOffer: null,
    usedNewPipeline: false,
    fallbackToLegacy: false,
    fallbackReason: null,
    officialProvider: legacyCard?.provider || null,
    pipelineResult: null,
  };

  if (isCommercialRuntimeLegacy(mode) || isCommercialRuntimeShadow(mode)) {
    return base;
  }

  if (!isCommercialRuntimeControlled(mode)) {
    return {
      ...base,
      fallbackToLegacy: true,
      fallbackReason: "unsupported_mode",
    };
  }

  if (!query) {
    return {
      ...base,
      fallbackToLegacy: true,
      fallbackReason: "empty_query",
    };
  }

  try {
    const pipelineResult = await withActivationTimeout(
      runCommercialShadowPipeline({
        query,
        limit: input.limit ?? 5,
        fetchGoogle: input.fetchGoogle,
        fetchApify: input.fetchApify,
      }),
      input.timeoutMs || ACTIVATION_PIPELINE_TIMEOUT_MS
    );

    base.pipelineResult = pipelineResult;

    return finalizeControlledCommercialOffer({
      query,
      legacySource,
      legacyCard,
      winnerProduct: input.winnerProduct || legacySource,
      pipelineResult,
      base,
    });
  } catch (err) {
    const reason = String(err?.message || "unexpected_error").slice(0, 80);
    return {
      ...base,
      fallbackToLegacy: true,
      fallbackReason: reason === "shadow_timeout" ? "timeout" : reason,
    };
  }
}

/**
 * @param {{
 *   query?: string,
 *   prices?: Array<Record<string, unknown>>,
 *   winnerProduct?: Record<string, unknown>|null,
 *   mode?: string,
 *   limit?: number,
 *   fetchGoogle?: Function,
 *   fetchApify?: Function,
 * }} input
 */
export async function resolveAndApplyCommercialRuntimeActivation(input = {}) {
  const prices = Array.isArray(input.prices) ? input.prices : [];
  const activation = await resolveOfficialCommercialOffer({
    query: input.query,
    legacyOffer: prices[0] || input.winnerProduct || null,
    winnerProduct: input.winnerProduct || prices[0] || null,
    mode: input.mode,
    limit: input.limit,
    fetchGoogle: input.fetchGoogle,
    fetchApify: input.fetchApify,
  });

  if (!prices.length) {
    return { prices, activation };
  }

  if (activation.accessoryEnforcement?.suppressCommercialOffer) {
    return { prices: [], activation };
  }

  if (!activation.officialOffer) {
    return { prices: [], activation };
  }

  const official = activation.officialOffer;
  const next = [...prices];
  next[0] = {
    ...next[0],
    product_name: next[0].product_name || official.product_name,
    price: official.price ?? next[0].price,
    numericPrice: official.numericPrice ?? next[0].numericPrice,
    link: official.link || next[0].link,
    thumbnail: official.thumbnail ?? next[0].thumbnail,
    source: official.source || next[0].source,
    provider: official.provider || next[0].provider,
    commercialProvider: official.commercialProvider || next[0].commercialProvider,
  };

  return { prices: next, activation };
}
