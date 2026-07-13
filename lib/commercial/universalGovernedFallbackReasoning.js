/**
 * PATCH Comercial 4E-B.7 — Universal Governed Fallback Reasoning
 *
 * Transforma governedFallbackPayload em reasoning estruturado e seguro.
 * Não gera texto final, não consulta LLM, não altera prompt ou resposta.
 * A MIA decide upstream; este módulo apenas formaliza limites de verbalização.
 */

import { GOVERNED_FALLBACK_PAYLOAD_BUILDER_VERSION } from "./governedFallbackPayloadBuilder.js";

export const UNIVERSAL_GOVERNED_FALLBACK_REASONING_VERSION = "4E-B.7";

export const UNIVERSAL_GOVERNED_FALLBACK_REASONING_TYPE = "universal_governed_fallback";

export const VERBALIZATION_FOCUS_TARGETS = Object.freeze({
  SELECTED_COMMERCIAL_ITEM: "selected_commercial_item",
  NONE: "none",
});

export const UPSTREAM_REFERENCE_ROLES = Object.freeze({
  CONTEXT_ONLY: "context_only",
  NOT_WINNER: "not_winner_fallback",
  NOT_VERBALIZATION_FOCUS: "not_verbalization_focus",
});

const UNSAFE_REASONING_BOUNDARIES = Object.freeze([
  "technical_specification",
  "technical_advantage",
  "technical_disadvantage",
  "performance_claim",
  "durability_claim",
  "real_world_quality_claim",
  "unverified_compatibility",
  "competitor_comparison",
  "ranking_superiority",
  "review_or_rating",
  "benchmark_claim",
  "invented_tradeoff",
]);

const SAFE_REASONING_SIGNAL_IDS = Object.freeze({
  SELECTED_MATCHES_COMMERCIAL_INTENT: "selected_matches_commercial_intent",
  VERBALIZE_SELECTED_NOT_UPSTREAM: "verbalize_selected_not_upstream",
  UPSTREAM_IS_CONTEXT_ONLY: "upstream_is_context_only",
  NO_DATA_LAYER_AUDIT: "no_data_layer_audit",
  TRANSPARENCY_REQUIRED: "transparency_required",
  LIMITED_CONFIDENCE: "limited_confidence_without_data_layer",
  AVOID_UNAUDITED_TECHNICAL_QUALITY: "avoid_unaudited_technical_quality",
  FOCUS_ON_REQUESTED_ITEM: "focus_on_requested_item",
  EXPLICIT_OFFER_SIGNALS_ONLY: "explicit_offer_signals_only",
});

function cleanText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function itemIdentity(name = "", source = "selected_commercial_item") {
  const productName = cleanText(name);
  if (!productName) return null;
  return {
    productName,
    source,
  };
}

function namesEqual(a = "", b = "") {
  const left = cleanText(a).toLowerCase();
  const right = cleanText(b).toLowerCase();
  return !!left && !!right && left === right;
}

function hasDistinctUpstreamReference(payload = {}) {
  const selectedName = cleanText(payload.selectedProduct?.productName);
  const upstreamName = cleanText(payload.relatedMainProduct?.productName);
  return !!upstreamName && !namesEqual(selectedName, upstreamName);
}

function resolveRequestedItemIdentity(payload = {}) {
  const query = cleanText(payload.query);
  const selectedName = cleanText(payload.selectedProduct?.productName);
  const queryCore = cleanText(payload.commercialSignals?.queryCore);
  const accessoryIntent = payload.commercialIntent?.accessoryIntent || {};

  if (accessoryIntent.isAccessoryIntent && query) {
    return {
      identitySource: "commercial_intent_query",
      query,
      normalizedQuery: cleanText(payload.normalizedQuery || query.toLowerCase()),
      matchedIntentSignals: accessoryIntent.matchedSignals || [],
      alignsWithSelectedItem: !!selectedName,
    };
  }

  if (queryCore) {
    return {
      identitySource: "commercial_query_core",
      query,
      normalizedQuery: cleanText(payload.normalizedQuery || query.toLowerCase()),
      queryCore,
      alignsWithSelectedItem: !!selectedName,
    };
  }

  return {
    identitySource: "query",
    query,
    normalizedQuery: cleanText(payload.normalizedQuery || query.toLowerCase()),
    alignsWithSelectedItem: !!selectedName,
  };
}

function buildSafeReasoningSignals(payload = {}, context = {}) {
  const signals = [];
  const push = (id, message, evidence = []) => {
    signals.push({
      id,
      message,
      evidence: Array.isArray(evidence) ? evidence.filter(Boolean) : [],
    });
  };

  const selectedName = cleanText(payload.selectedProduct?.productName);
  const alignment = payload.commercialSignals || {};
  const accessoryIntent = payload.commercialIntent?.accessoryIntent || {};

  if (selectedName) {
    push(
      SAFE_REASONING_SIGNAL_IDS.SELECTED_MATCHES_COMMERCIAL_INTENT,
      "O item comercial selecionado deve orientar a verbalização porque representa a oferta escolhida pelo runtime comercial.",
      [
        selectedName,
        alignment.alignmentReason || null,
        alignment.isAligned === true ? "aligned" : null,
      ]
    );
  }

  if (context.hasDistinctUpstream) {
    push(
      SAFE_REASONING_SIGNAL_IDS.VERBALIZE_SELECTED_NOT_UPSTREAM,
      "A resposta deve falar sobre o item comercial selecionado, não sobre a referência cognitiva upstream.",
      [selectedName, payload.relatedMainProduct?.productName || null]
    );
    push(
      SAFE_REASONING_SIGNAL_IDS.UPSTREAM_IS_CONTEXT_ONLY,
      "A referência upstream existe apenas como contexto e não deve dominar a resposta.",
      [payload.relatedMainProduct?.productName || null, payload.relatedMainProduct?.role || null]
    );
  }

  if (accessoryIntent.isAccessoryIntent) {
    push(
      SAFE_REASONING_SIGNAL_IDS.FOCUS_ON_REQUESTED_ITEM,
      "A intenção comercial detectada aponta para um item solicitado distinto do produto principal relacionado.",
      accessoryIntent.matchedSignals || []
    );
  }

  if (payload.governance?.hasDataLayer !== true) {
    push(
      SAFE_REASONING_SIGNAL_IDS.NO_DATA_LAYER_AUDIT,
      "O produto não possui auditoria completa no Data Layer.",
      [payload.governance?.knowledgeSource || "governed_fallback"]
    );
    push(
      SAFE_REASONING_SIGNAL_IDS.LIMITED_CONFIDENCE,
      "A confiança da recomendação deve permanecer limitada pela ausência de Data Layer.",
      [payload.governance?.confidence || "medium"]
    );
    push(
      SAFE_REASONING_SIGNAL_IDS.AVOID_UNAUDITED_TECHNICAL_QUALITY,
      "A linguagem deve evitar afirmar qualidade técnica não auditada.",
      UNSAFE_REASONING_BOUNDARIES.slice(0, 6)
    );
  }

  if (payload.transparency?.transparencyRequired === true) {
    push(
      SAFE_REASONING_SIGNAL_IDS.TRANSPARENCY_REQUIRED,
      "A recomendação deve ser apresentada com transparência sobre a origem do conhecimento.",
      [payload.transparency?.knowledgeSourceLabel || null]
    );
  }

  const explicitSignals = payload.commercialSignals?.explicitOfferSignals || [];
  if (explicitSignals.length > 0) {
    push(
      SAFE_REASONING_SIGNAL_IDS.EXPLICIT_OFFER_SIGNALS_ONLY,
      "Somente sinais explícitos presentes na oferta selecionada podem sustentar inferências futuras.",
      explicitSignals.map((signal) => signal.token || signal.id).filter(Boolean)
    );
  }

  return signals;
}

function resolveVerbalizationFocus(payload = {}, selectedCommercialItem = null) {
  const selectedName = cleanText(selectedCommercialItem?.productName);
  const upstreamName = cleanText(payload.relatedMainProduct?.productName);

  if (!selectedName) {
    return {
      target: VERBALIZATION_FOCUS_TARGETS.NONE,
      productName: null,
      reason: "missing_selected_commercial_item",
      mustNotUseUpstreamReference: !!upstreamName,
    };
  }

  return {
    target: VERBALIZATION_FOCUS_TARGETS.SELECTED_COMMERCIAL_ITEM,
    productName: selectedName,
    reason: hasDistinctUpstreamReference(payload)
      ? "selected_commercial_item_over_upstream_reference"
      : "selected_commercial_item",
    mustNotUseUpstreamReference: hasDistinctUpstreamReference(payload),
    forbiddenFocusProductName: hasDistinctUpstreamReference(payload) ? upstreamName : null,
  };
}

function resolveUpstreamReference(payload = {}) {
  const related = payload.relatedMainProduct;
  if (!related?.productName) {
    return null;
  }

  return {
    productName: cleanText(related.productName),
    source: cleanText(related.source || "upstream_context") || "upstream_context",
    role: cleanText(related.role || "context_reference") || "context_reference",
    governanceRoles: [
      UPSTREAM_REFERENCE_ROLES.CONTEXT_ONLY,
      UPSTREAM_REFERENCE_ROLES.NOT_WINNER,
      UPSTREAM_REFERENCE_ROLES.NOT_VERBALIZATION_FOCUS,
    ],
    mustNotReplaceSelectedItem: hasDistinctUpstreamReference(payload),
    mustNotBecomeVerbalizationFocus: true,
  };
}

function buildCategorySignals(payload = {}) {
  const vertical = cleanText(payload.commercialIntent?.identifiedVertical || "") || null;
  const explicitOfferSignals = payload.commercialSignals?.explicitOfferSignals || [];
  const queryAccessorySignals = payload.commercialSignals?.queryAccessorySignals || [];
  const offerAccessorySignals = payload.commercialSignals?.offerAccessorySignals || [];

  return {
    identifiedVertical: vertical,
    accessoryIntent: payload.commercialIntent?.accessoryIntent || {
      isAccessoryIntent: false,
      confidence: 0,
      matchedSignals: [],
    },
    queryCore: cleanText(payload.commercialSignals?.queryCore || "") || null,
    offerCore: cleanText(payload.commercialSignals?.offerCore || "") || null,
    queryAccessorySignals,
    offerAccessorySignals,
    explicitOfferSignals,
    alignmentScore: payload.commercialSignals?.alignmentScore ?? null,
    isAligned: payload.commercialSignals?.isAligned === true,
    alignmentReason: cleanText(payload.commercialSignals?.alignmentReason || "") || null,
  };
}

/**
 * @param {Record<string, unknown>} governedFallbackPayload
 */
export function shouldBuildUniversalGovernedFallbackReasoning(governedFallbackPayload = {}) {
  if (governedFallbackPayload.enabled === false) return false;
  if (governedFallbackPayload.skipped === true) return false;
  if (governedFallbackPayload.governance?.hasDataLayer === true) return false;
  return governedFallbackPayload.governance?.level === "governed_fallback";
}

/**
 * @param {Record<string, unknown>} governedFallbackPayload
 */
export function buildUniversalGovernedFallbackReasoning(governedFallbackPayload = {}) {
  const payload = governedFallbackPayload || {};
  const shouldUse = shouldBuildUniversalGovernedFallbackReasoning(payload);

  if (!shouldUse) {
    return {
      version: UNIVERSAL_GOVERNED_FALLBACK_REASONING_VERSION,
      reasoningType: UNIVERSAL_GOVERNED_FALLBACK_REASONING_TYPE,
      shouldUseFallbackReasoning: false,
      skipped: true,
      skipReason:
        payload.skipReason ||
        (payload.governance?.hasDataLayer ? "data_layer_present" : "payload_not_enabled"),
      payloadVersion: payload.version || GOVERNED_FALLBACK_PAYLOAD_BUILDER_VERSION,
      query: cleanText(payload.query || "") || null,
    };
  }

  const selectedCommercialItem = itemIdentity(
    payload.selectedProduct?.productName,
    "commercial_runtime_selected_offer"
  );
  const context = {
    hasDistinctUpstream: hasDistinctUpstreamReference(payload),
  };
  const verbalizationFocus = resolveVerbalizationFocus(payload, selectedCommercialItem);
  const upstreamReference = resolveUpstreamReference(payload);

  return {
    version: UNIVERSAL_GOVERNED_FALLBACK_REASONING_VERSION,
    reasoningType: UNIVERSAL_GOVERNED_FALLBACK_REASONING_TYPE,
    shouldUseFallbackReasoning: true,
    skipped: false,
    payloadVersion: payload.version || GOVERNED_FALLBACK_PAYLOAD_BUILDER_VERSION,
    query: cleanText(payload.query || "") || null,
    dataLayerStatus: {
      hasDataLayer: false,
      isAudited: payload.governance?.isAudited === true,
      knowledgeSource: payload.governance?.knowledgeSource || "governed_fallback",
    },
    commercialRuntimeStatus: {
      active: true,
      decisionOrigin: payload.provenance?.decisionOrigin || null,
      runtimeMode: payload.provenance?.runtimeMode || null,
      usedNewPipeline: payload.provenance?.usedNewPipeline === true,
      fallbackToLegacy: payload.provenance?.fallbackToLegacy === true,
      responsePath: payload.runtimeContext?.responsePath || null,
    },
    selectedCommercialItem: selectedCommercialItem
      ? {
          ...selectedCommercialItem,
          price: payload.selectedProduct?.price ?? null,
          source: payload.selectedProduct?.source ?? null,
          provider: payload.selectedProduct?.provider ?? null,
        }
      : null,
    requestedItemIdentity: resolveRequestedItemIdentity(payload),
    upstreamReference,
    categorySignals: buildCategorySignals(payload),
    safeReasoningSignals: buildSafeReasoningSignals(payload, context),
    unsafeReasoningBoundaries: [...UNSAFE_REASONING_BOUNDARIES],
    verbalizationFocus,
    confidenceBoundary: {
      level: "limited",
      reason: "no_data_layer_audit",
      allowedConfidence: payload.governance?.confidence || "medium",
      mustAvoidTechnicalSuperiorityClaims: true,
      mustAvoidInventedSpecs: true,
      mustAvoidInventedTradeoffs: true,
    },
    transparencyRequirement: {
      required: payload.transparency?.transparencyRequired === true,
      auditNoticeRequired: payload.transparency?.auditNoticeRequired === true,
      knowledgeSourceLabel: payload.transparency?.knowledgeSourceLabel || "Governed Fallback",
      knowledgeMetadata: payload.transparency?.knowledgeMetadata || null,
    },
    provenance: {
      reasoningOrigin: "universal_governed_fallback_reasoning",
      payloadOrigin: payload.provenance?.payloadOrigin || null,
      dataOrigin: payload.provenance?.dataOrigin || null,
      decisionOrigin: payload.provenance?.decisionOrigin || null,
    },
  };
}

/**
 * @param {Record<string, unknown>} reasoning
 */
export function buildUniversalGovernedFallbackReasoningDiagnostics(reasoning = {}) {
  return {
    version: reasoning.version || UNIVERSAL_GOVERNED_FALLBACK_REASONING_VERSION,
    reasoningType: reasoning.reasoningType || UNIVERSAL_GOVERNED_FALLBACK_REASONING_TYPE,
    shouldUseFallbackReasoning: reasoning.shouldUseFallbackReasoning === true,
    skipped: reasoning.skipped === true,
    skipReason: reasoning.skipReason || null,
    query: reasoning.query || null,
    selectedCommercialItemName: reasoning.selectedCommercialItem?.productName || null,
    upstreamReferenceName: reasoning.upstreamReference?.productName || null,
    verbalizationFocusTarget: reasoning.verbalizationFocus?.target || null,
    verbalizationFocusProductName: reasoning.verbalizationFocus?.productName || null,
    forbiddenFocusProductName: reasoning.verbalizationFocus?.forbiddenFocusProductName || null,
    transparencyRequired: reasoning.transparencyRequirement?.required === true,
    confidenceBoundaryLevel: reasoning.confidenceBoundary?.level || null,
    safeReasoningSignalCount: Array.isArray(reasoning.safeReasoningSignals)
      ? reasoning.safeReasoningSignals.length
      : 0,
    unsafeBoundaryCount: Array.isArray(reasoning.unsafeReasoningBoundaries)
      ? reasoning.unsafeReasoningBoundaries.length
      : 0,
  };
}

/**
 * @param {Record<string, unknown>} reasoning
 */
export function buildUniversalGovernedFallbackReasoningDevPayload(reasoning = {}) {
  return {
    version: reasoning.version || UNIVERSAL_GOVERNED_FALLBACK_REASONING_VERSION,
    reasoningType: reasoning.reasoningType || UNIVERSAL_GOVERNED_FALLBACK_REASONING_TYPE,
    shouldUseFallbackReasoning: reasoning.shouldUseFallbackReasoning === true,
    skipped: reasoning.skipped === true,
    query: reasoning.query || null,
    selectedCommercialItem: reasoning.selectedCommercialItem || null,
    requestedItemIdentity: reasoning.requestedItemIdentity || null,
    upstreamReference: reasoning.upstreamReference || null,
    verbalizationFocus: reasoning.verbalizationFocus || null,
    safeReasoningSignals: reasoning.safeReasoningSignals || [],
    unsafeReasoningBoundaries: reasoning.unsafeReasoningBoundaries || [],
    confidenceBoundary: reasoning.confidenceBoundary || null,
    transparencyRequirement: reasoning.transparencyRequirement || null,
    categorySignals: reasoning.categorySignals || null,
    provenance: reasoning.provenance || null,
    diagnostics: buildUniversalGovernedFallbackReasoningDiagnostics(reasoning),
  };
}
