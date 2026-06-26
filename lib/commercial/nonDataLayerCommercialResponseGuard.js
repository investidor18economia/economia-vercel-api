/**
 * PATCH Comercial 4E-A.3 — Non-Data-Layer Commercial Response Guard
 *
 * Identifica a origem arquitetural do conhecimento comercial (Data Layer vs Governed Fallback).
 * Não altera resposta, winner, ranking, selection ou Decision Engine.
 */

export const NON_DATA_LAYER_COMMERCIAL_RESPONSE_GUARD_VERSION = "4E-A.3";

export const COMMERCIAL_KNOWLEDGE_SOURCES = Object.freeze({
  DATA_LAYER: "data_layer",
  GOVERNED_FALLBACK: "governed_fallback",
});

const DATA_LAYER_FACT_MODES = Object.freeze(["data_layer"]);
const GOVERNED_FALLBACK_FACT_MODES = Object.freeze([
  "governed_fallback",
  "fallback_cautious",
  "fallback",
  "fallback_no_data_layer",
]);

function cleanList(value, max = 3) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry || "").trim())
      .filter(Boolean)
      .slice(0, max);
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()].slice(0, max);
  }
  return [];
}

function collectTrustedSpecNotes(trustedSpecs = {}) {
  return cleanList(
    [
      ...cleanList(trustedSpecs.notes, 2),
      ...cleanList(trustedSpecs.market_notes, 2),
      ...cleanList(trustedSpecs.strategic_notes, 2),
    ],
    3
  );
}

/**
 * Espelha a detecção arquitetural do Product Explanation Builder — sem LLM.
 * @param {Record<string, unknown>|null} trustedSpecs
 */
export function hasArchitecturalDataLayerContent(trustedSpecs = null) {
  if (!trustedSpecs || typeof trustedSpecs !== "object") return false;
  return (
    cleanList(trustedSpecs.strengths).length > 0 ||
    cleanList(trustedSpecs.weaknesses).length > 0 ||
    cleanList(trustedSpecs.ideal_for).length > 0 ||
    cleanList(trustedSpecs.avoid_if).length > 0 ||
    collectTrustedSpecNotes(trustedSpecs).length > 0 ||
    cleanList(trustedSpecs.risk_notes).length > 0
  );
}

/**
 * @param {{
 *   product?: Record<string, unknown>|null,
 *   trustedSpecs?: Record<string, unknown>|null,
 *   hasDataLayer?: boolean,
 *   factsMode?: string|null,
 *   knowledgeMetadata?: Record<string, unknown>|null,
 * }} input
 */
export function resolveArchitecturalDataLayerPresence(input = {}) {
  if (input.knowledgeMetadata?.knowledgeSource === COMMERCIAL_KNOWLEDGE_SOURCES.DATA_LAYER) {
    return true;
  }
  if (input.knowledgeMetadata?.knowledgeSource === COMMERCIAL_KNOWLEDGE_SOURCES.GOVERNED_FALLBACK) {
    return false;
  }

  if (typeof input.hasDataLayer === "boolean") {
    return input.hasDataLayer;
  }

  const factsMode = String(input.factsMode || "").trim();
  if (DATA_LAYER_FACT_MODES.includes(factsMode)) return true;
  if (GOVERNED_FALLBACK_FACT_MODES.includes(factsMode)) return false;

  const product = input.product && typeof input.product === "object" ? input.product : {};
  const trustedSpecs = input.trustedSpecs || product.trustedSpecs || null;

  if (product.isDataLayerProduct === true) return true;
  return hasArchitecturalDataLayerContent(trustedSpecs);
}

/**
 * @param {{
 *   product?: Record<string, unknown>|null,
 *   trustedSpecs?: Record<string, unknown>|null,
 *   hasDataLayer?: boolean,
 *   factsMode?: string|null,
 *   knowledgeMetadata?: Record<string, unknown>|null,
 * }} input
 */
export function detectCommercialKnowledgeSource(input = {}) {
  const hasDataLayer = resolveArchitecturalDataLayerPresence(input) === true;

  if (hasDataLayer) {
    return {
      knowledgeSource: COMMERCIAL_KNOWLEDGE_SOURCES.DATA_LAYER,
      isAudited: true,
      transparencyRequired: false,
      confidence: "high",
    };
  }

  return {
    knowledgeSource: COMMERCIAL_KNOWLEDGE_SOURCES.GOVERNED_FALLBACK,
    isAudited: false,
    transparencyRequired: true,
    confidence: "medium",
  };
}

/**
 * @param {{
 *   product?: Record<string, unknown>|null,
 *   trustedSpecs?: Record<string, unknown>|null,
 *   hasDataLayer?: boolean,
 *   factsMode?: string|null,
 *   knowledgeMetadata?: Record<string, unknown>|null,
 * }} input
 */
export function buildCommercialKnowledgeMetadata(input = {}) {
  const detected = detectCommercialKnowledgeSource(input);
  return {
    enabled: true,
    version: NON_DATA_LAYER_COMMERCIAL_RESPONSE_GUARD_VERSION,
    ...detected,
  };
}

/**
 * @param {Record<string, unknown>} input
 */
export function isDataLayerCommercialResponse(input = {}) {
  return (
    detectCommercialKnowledgeSource(input).knowledgeSource ===
    COMMERCIAL_KNOWLEDGE_SOURCES.DATA_LAYER
  );
}

/**
 * @param {Record<string, unknown>} input
 */
export function isGovernedFallbackCommercialResponse(input = {}) {
  return (
    detectCommercialKnowledgeSource(input).knowledgeSource ===
    COMMERCIAL_KNOWLEDGE_SOURCES.GOVERNED_FALLBACK
  );
}

/**
 * Rótulo legível para shadow / observabilidade.
 * @param {Record<string, unknown>} metadata
 */
export function formatCommercialKnowledgeSourceLabel(metadata = {}) {
  return metadata.knowledgeSource === COMMERCIAL_KNOWLEDGE_SOURCES.DATA_LAYER
    ? "Data Layer"
    : "Governed Fallback";
}

/**
 * Payload estável para endpoints DEV.
 * @param {Record<string, unknown>} metadata
 */
export function buildCommercialKnowledgeSourceDiagnostic(metadata = {}) {
  return {
    type: metadata.knowledgeSource || COMMERCIAL_KNOWLEDGE_SOURCES.GOVERNED_FALLBACK,
    isAudited: metadata.isAudited === true,
    transparencyRequired: metadata.transparencyRequired === true,
    confidence: metadata.confidence || "medium",
    enabled: metadata.enabled !== false,
    version: metadata.version || NON_DATA_LAYER_COMMERCIAL_RESPONSE_GUARD_VERSION,
  };
}
