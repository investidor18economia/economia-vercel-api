/**
 * PATCH 6.4 — Data Layer Usage & Effectiveness Analytics
 *
 * Pure classification logic for commercial Data Layer resolution states.
 * Does not alter runtime behavior — observability only.
 */

export const DATA_LAYER_RESPONSE_CLASSIFICATIONS = Object.freeze({
  FULL_DATA_LAYER: "FULL_DATA_LAYER",
  PARTIAL_DATA_LAYER: "PARTIAL_DATA_LAYER",
  FALLBACK_ONLY: "FALLBACK_ONLY",
  NO_COMMERCIAL_RESULT: "NO_COMMERCIAL_RESULT",
});

export const DATA_LAYER_FALLBACK_KINDS = Object.freeze({
  NONE: "none",
  NECESSARY: "necessary",
  EXPECTED: "expected",
  AVOIDABLE: "avoidable",
});

/**
 * @param {{
 *   productsUsedCount?: number,
 *   dataLayerUsedAsPrimarySource?: boolean,
 *   dataLayerProductsInResponse?: number,
 *   hybridEnrichCount?: number,
 *   intelligentFallbackUsed?: boolean,
 *   hasPriorityFollowUp?: boolean,
 * }} ctx
 * @returns {keyof typeof DATA_LAYER_RESPONSE_CLASSIFICATIONS|null}
 */
export function classifyDataLayerResponse(ctx = {}) {
  const productsUsedCount = Number(ctx.productsUsedCount) || 0;
  const dataLayerProductsInResponse = Number(ctx.dataLayerProductsInResponse) || 0;
  const hybridEnrichCount = Number(ctx.hybridEnrichCount) || 0;
  const intelligentFallbackUsed = !!ctx.intelligentFallbackUsed;

  if (productsUsedCount <= 0) {
    return DATA_LAYER_RESPONSE_CLASSIFICATIONS.NO_COMMERCIAL_RESULT;
  }

  const responseUsesDataLayer =
    !!ctx.dataLayerUsedAsPrimarySource ||
    (!!ctx.hasPriorityFollowUp && dataLayerProductsInResponse > 0);

  if (!responseUsesDataLayer) {
    return DATA_LAYER_RESPONSE_CLASSIFICATIONS.FALLBACK_ONLY;
  }

  const nonDlProductsInResponse = Math.max(0, productsUsedCount - dataLayerProductsInResponse);
  const hasHybrid = hybridEnrichCount > 0;
  const partialByComposition = nonDlProductsInResponse > 0;

  if (hasHybrid || partialByComposition || intelligentFallbackUsed) {
    return DATA_LAYER_RESPONSE_CLASSIFICATIONS.PARTIAL_DATA_LAYER;
  }

  return DATA_LAYER_RESPONSE_CLASSIFICATIONS.FULL_DATA_LAYER;
}

/**
 * @param {{
 *   responseClassification?: string|null,
 *   dataLayerUsedAsPrimarySource?: boolean,
 *   candidatesRaw?: number,
 *   candidatesAfterIsolation?: number,
 *   hybridEnrichCount?: number,
 *   intelligentFallbackUsed?: boolean,
 * }} ctx
 * @returns {keyof typeof DATA_LAYER_FALLBACK_KINDS}
 */
export function classifyFallbackKind(ctx = {}) {
  const classification = ctx.responseClassification || null;
  const hybridEnrichCount = Number(ctx.hybridEnrichCount) || 0;
  const candidatesRaw = Number(ctx.candidatesRaw) || 0;
  const candidatesAfterIsolation = Number(ctx.candidatesAfterIsolation) || 0;

  if (classification === DATA_LAYER_RESPONSE_CLASSIFICATIONS.NO_COMMERCIAL_RESULT) {
    return DATA_LAYER_FALLBACK_KINDS.NONE;
  }

  if (classification === DATA_LAYER_RESPONSE_CLASSIFICATIONS.FULL_DATA_LAYER && hybridEnrichCount === 0) {
    return DATA_LAYER_FALLBACK_KINDS.NONE;
  }

  if (classification === DATA_LAYER_RESPONSE_CLASSIFICATIONS.FALLBACK_ONLY) {
    if (candidatesRaw === 0) {
      return DATA_LAYER_FALLBACK_KINDS.NECESSARY;
    }
    if (candidatesRaw > 0 && candidatesAfterIsolation === 0) {
      return DATA_LAYER_FALLBACK_KINDS.AVOIDABLE;
    }
    return DATA_LAYER_FALLBACK_KINDS.NECESSARY;
  }

  if (hybridEnrichCount > 0) {
    return DATA_LAYER_FALLBACK_KINDS.EXPECTED;
  }

  if (ctx.intelligentFallbackUsed) {
    return DATA_LAYER_FALLBACK_KINDS.NECESSARY;
  }

  return DATA_LAYER_FALLBACK_KINDS.NONE;
}

/**
 * @param {unknown[]} products
 * @returns {number}
 */
export function countDataLayerProductsInList(products = []) {
  if (!Array.isArray(products)) return 0;
  return products.filter((product) => !!product?.isDataLayerProduct).length;
}

/**
 * @param {unknown[]} products
 * @returns {number}
 */
export function countHybridEnrichedProducts(products = []) {
  if (!Array.isArray(products)) return 0;
  return products.filter((product) => !!product?.commercialEnriched).length;
}

/**
 * Derives boolean flags used by dashboards from a classification.
 *
 * @param {string|null|undefined} classification
 */
export function deriveDataLayerResolutionFlags(classification) {
  return {
    data_layer_used:
      classification === DATA_LAYER_RESPONSE_CLASSIFICATIONS.FULL_DATA_LAYER ||
      classification === DATA_LAYER_RESPONSE_CLASSIFICATIONS.PARTIAL_DATA_LAYER,
    fallback_used:
      classification === DATA_LAYER_RESPONSE_CLASSIFICATIONS.FALLBACK_ONLY ||
      classification === DATA_LAYER_RESPONSE_CLASSIFICATIONS.PARTIAL_DATA_LAYER,
    hybrid_response: classification === DATA_LAYER_RESPONSE_CLASSIFICATIONS.PARTIAL_DATA_LAYER,
    full_coverage: classification === DATA_LAYER_RESPONSE_CLASSIFICATIONS.FULL_DATA_LAYER,
    partial_coverage: classification === DATA_LAYER_RESPONSE_CLASSIFICATIONS.PARTIAL_DATA_LAYER,
    no_coverage: classification === DATA_LAYER_RESPONSE_CLASSIFICATIONS.NO_COMMERCIAL_RESULT,
    fallback_only: classification === DATA_LAYER_RESPONSE_CLASSIFICATIONS.FALLBACK_ONLY,
  };
}
