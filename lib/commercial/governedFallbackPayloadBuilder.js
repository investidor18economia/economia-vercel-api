/**
 * PATCH Comercial 4E-B.6 — Governed Fallback Payload Builder
 *
 * Constrói payload estruturado e governado para caminhos sem Data Layer.
 * Não gera texto, não consulta LLM, não toma decisões, não infere specs.
 * A MIA decide upstream; este módulo apenas estrutura o que já foi decidido.
 */

import { detectAccessoryIntent } from "./accessoryIntentLockGuard.js";
import {
  buildCommercialKnowledgeMetadata,
  detectCommercialKnowledgeSource,
  resolveArchitecturalDataLayerPresence,
} from "./nonDataLayerCommercialResponseGuard.js";
import {
  detectCommercialVerticalFromText,
  detectNonDataLayerCommercialIntent,
} from "./nonDataLayerFallbackCandidateIsolation.js";
import { calculateCommercialAlignment } from "../productSourceAdapter/commercialQueryProductAlignmentLayer.js";
import { buildCommercialRuntimeActivationDiagnostics } from "../productSourceAdapter/commercialRuntimeActivation.js";
import { getCommercialRuntimeMode } from "../productSourceAdapter/commercialRuntimeMode.js";
import { extractExplicitProductSignals } from "../miaGovernedFallbackIntelligenceLayer.js";

export const GOVERNED_FALLBACK_PAYLOAD_BUILDER_VERSION = "4E-B.6";

export const GOVERNED_FALLBACK_PAYLOAD_ORIGINS = Object.freeze({
  BUILDER: "governed_fallback_payload_builder",
  DATA_SOURCE: "commercial_runtime",
});

export const GOVERNED_FALLBACK_GOVERNANCE_LEVELS = Object.freeze({
  GOVERNED_FALLBACK: "governed_fallback",
  DATA_LAYER: "data_layer",
});

function cleanText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function productName(product = null) {
  if (!product) return "";
  if (typeof product === "string") return cleanText(product);
  return cleanText(
    product.product_name ||
      product.title ||
      product.trustedSpecs?.official_name ||
      product.official_name ||
      ""
  );
}

function normalizeSelectedProduct(product = null) {
  if (!product || typeof product !== "object") {
    return {
      productName: null,
      price: null,
      link: null,
      source: null,
      provider: null,
      commercialProvider: null,
      thumbnail: null,
    };
  }

  return {
    productName: productName(product) || null,
    price: product.price ?? null,
    link: cleanText(product.link || product.url || "") || null,
    source: cleanText(product.source || "") || null,
    provider: cleanText(product.provider || product.commercialProvider || "") || null,
    commercialProvider: cleanText(product.commercialProvider || product.provider || "") || null,
    thumbnail: cleanText(product.thumbnail || product.image || "") || null,
  };
}

function normalizeRelatedProductReference(input = {}) {
  const selectedName = productName(input.selectedProduct);
  const related = input.relatedProductReference || input.cognitiveWinnerProduct || null;
  const relatedName = productName(related);

  if (!relatedName || relatedName === selectedName) {
    return null;
  }

  return {
    productName: relatedName,
    source: cleanText(related?.source || input.relatedProductSource || "upstream_context") || null,
    role: cleanText(input.relatedProductRole || "context_reference") || "context_reference",
  };
}

function resolveDecisionOrigin(activation = null) {
  if (!activation || typeof activation !== "object") {
    return {
      origin: "commercial_runtime",
      mode: getCommercialRuntimeMode() || "unknown",
      usedNewPipeline: null,
      fallbackToLegacy: null,
      fallbackReason: null,
    };
  }

  return {
    origin: activation.usedNewPipeline ? "commercial_runtime_pipeline" : "commercial_runtime_legacy",
    mode: activation.mode || getCommercialRuntimeMode() || "unknown",
    usedNewPipeline: activation.usedNewPipeline === true,
    fallbackToLegacy: activation.fallbackToLegacy === true,
    fallbackReason: cleanText(activation.fallbackReason || "") || null,
  };
}

/**
 * @param {{
 *   product?: Record<string, unknown>|null,
 *   selectedProduct?: Record<string, unknown>|null,
 *   hasDataLayer?: boolean,
 *   trustedSpecs?: Record<string, unknown>|null,
 *   knowledgeMetadata?: Record<string, unknown>|null,
 * }} input
 */
export function shouldBuildGovernedFallbackPayload(input = {}) {
  if (input.enabled === false) return false;

  const product = input.selectedProduct || input.product || null;
  const hasDataLayer = resolveArchitecturalDataLayerPresence({
    product,
    trustedSpecs: input.trustedSpecs,
    hasDataLayer: input.hasDataLayer,
    knowledgeMetadata: input.knowledgeMetadata,
  });

  return hasDataLayer !== true;
}

/**
 * @param {{
 *   query?: string,
 *   selectedProduct?: Record<string, unknown>|null,
 *   product?: Record<string, unknown>|null,
 *   hasDataLayer?: boolean,
 *   trustedSpecs?: Record<string, unknown>|null,
 *   knowledgeMetadata?: Record<string, unknown>|null,
 *   categoryHint?: string,
 *   responsePath?: string,
 *   commercialRuntimeActivation?: Record<string, unknown>|null,
 *   relatedProductReference?: Record<string, unknown>|null,
 *   cognitiveWinnerProduct?: Record<string, unknown>|null,
 *   relatedProductRole?: string,
 *   relatedProductSource?: string,
 *   routing?: Record<string, unknown>|null,
 * }} input
 */
export function buildGovernedFallbackPayload(input = {}) {
  const query = cleanText(input.query || "");
  const selectedProduct = input.selectedProduct || input.product || null;
  const selected = normalizeSelectedProduct(selectedProduct);
  const shouldBuild = shouldBuildGovernedFallbackPayload(input);

  if (!shouldBuild) {
    return {
      version: GOVERNED_FALLBACK_PAYLOAD_BUILDER_VERSION,
      enabled: false,
      skipped: true,
      skipReason: "data_layer_present",
      query,
      governance: {
        level: GOVERNED_FALLBACK_GOVERNANCE_LEVELS.DATA_LAYER,
        hasDataLayer: true,
      },
    };
  }

  const knowledgeMetadata =
    input.knowledgeMetadata ||
    buildCommercialKnowledgeMetadata({
      product: selectedProduct,
      trustedSpecs: input.trustedSpecs,
      hasDataLayer: false,
    });
  const knowledgeSource = detectCommercialKnowledgeSource({
    product: selectedProduct,
    trustedSpecs: input.trustedSpecs,
    hasDataLayer: false,
    knowledgeMetadata,
  });
  const accessoryIntent = detectAccessoryIntent(query);
  const commercialIntentSnapshot = detectNonDataLayerCommercialIntent(query, {
    categoryHint: input.categoryHint || "",
    routing: input.routing || null,
  });
  const identifiedVertical =
    cleanText(input.categoryHint || "") ||
    detectCommercialVerticalFromText(query) ||
    detectCommercialVerticalFromText(selected.productName || "") ||
    null;
  const alignment = calculateCommercialAlignment({
    query,
    offer: { title: selected.productName || "" },
  });
  const explicitOfferSignals = selectedProduct
    ? extractExplicitProductSignals(selectedProduct).map((signal) => ({
        id: signal.id,
        token: signal.token,
        category: signal.category,
      }))
    : [];
  const decisionOrigin = resolveDecisionOrigin(input.commercialRuntimeActivation || null);
  const activationDiagnostics = input.commercialRuntimeActivation
    ? buildCommercialRuntimeActivationDiagnostics(input.commercialRuntimeActivation)
    : null;

  return {
    version: GOVERNED_FALLBACK_PAYLOAD_BUILDER_VERSION,
    enabled: true,
    skipped: false,
    query,
    normalizedQuery: accessoryIntent.normalizedQuery || query.toLowerCase(),
    governance: {
      level: GOVERNED_FALLBACK_GOVERNANCE_LEVELS.GOVERNED_FALLBACK,
      knowledgeSource: knowledgeSource.knowledgeSource,
      hasDataLayer: false,
      isAudited: knowledgeSource.isAudited === true,
      transparencyRequired: knowledgeSource.transparencyRequired === true,
      confidence: knowledgeSource.confidence || "medium",
    },
    provenance: {
      payloadOrigin: GOVERNED_FALLBACK_PAYLOAD_ORIGINS.BUILDER,
      dataOrigin: GOVERNED_FALLBACK_PAYLOAD_ORIGINS.DATA_SOURCE,
      decisionOrigin: decisionOrigin.origin,
      runtimeMode: decisionOrigin.mode,
      usedNewPipeline: decisionOrigin.usedNewPipeline,
      fallbackToLegacy: decisionOrigin.fallbackToLegacy,
      fallbackReason: decisionOrigin.fallbackReason,
    },
    commercialIntent: {
      identifiedVertical,
      accessoryIntent: {
        isAccessoryIntent: accessoryIntent.isAccessoryIntent === true,
        confidence: accessoryIntent.confidence,
        matchedSignals: accessoryIntent.matchedSignals || [],
      },
      intentSnapshot: commercialIntentSnapshot,
    },
    selectedProduct: selected,
    relatedMainProduct: normalizeRelatedProductReference(input),
    commercialSignals: {
      queryCore: alignment.queryCore || "",
      offerCore: alignment.offerCore || "",
      queryAccessorySignals: alignment.queryAccessorySignals || [],
      offerAccessorySignals: alignment.offerAccessorySignals || [],
      alignmentScore: alignment.alignmentScore,
      isAligned: alignment.isAligned,
      alignmentReason: alignment.alignmentReason,
      explicitOfferSignals,
    },
    runtimeContext: {
      responsePath: cleanText(input.responsePath || "") || null,
      activationDiagnostics,
    },
    transparency: {
      knowledgeMetadata,
      transparencyRequired: knowledgeMetadata.transparencyRequired === true,
      auditNoticeRequired: knowledgeMetadata.isAudited !== true,
      knowledgeSourceLabel:
        knowledgeMetadata.knowledgeSource === "data_layer" ? "Data Layer" : "Governed Fallback",
    },
  };
}

/**
 * @param {Record<string, unknown>} payload
 */
export function buildGovernedFallbackPayloadDiagnostics(payload = {}) {
  return {
    enabled: payload.enabled === true,
    skipped: payload.skipped === true,
    skipReason: payload.skipReason || null,
    version: payload.version || GOVERNED_FALLBACK_PAYLOAD_BUILDER_VERSION,
    query: payload.query || null,
    governanceLevel: payload.governance?.level || null,
    hasDataLayer: payload.governance?.hasDataLayer === true,
    selectedProductName: payload.selectedProduct?.productName || null,
    relatedMainProductName: payload.relatedMainProduct?.productName || null,
    decisionOrigin: payload.provenance?.decisionOrigin || null,
    transparencyRequired: payload.transparency?.transparencyRequired === true,
    accessoryIntent: payload.commercialIntent?.accessoryIntent?.isAccessoryIntent === true,
  };
}

/**
 * @param {Record<string, unknown>} payload
 */
export function buildGovernedFallbackPayloadDevPayload(payload = {}) {
  return {
    version: payload.version || GOVERNED_FALLBACK_PAYLOAD_BUILDER_VERSION,
    enabled: payload.enabled === true,
    skipped: payload.skipped === true,
    query: payload.query || null,
    governance: payload.governance || null,
    provenance: payload.provenance || null,
    commercialIntent: payload.commercialIntent || null,
    selectedProduct: payload.selectedProduct || null,
    relatedMainProduct: payload.relatedMainProduct || null,
    commercialSignals: payload.commercialSignals || null,
    transparency: payload.transparency || null,
    diagnostics: buildGovernedFallbackPayloadDiagnostics(payload),
  };
}
