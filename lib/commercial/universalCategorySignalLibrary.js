/**
 * PATCH Comercial 4E-B.9 — Universal Category Signal Library
 *
 * Normaliza e consolida sinais de categoria/intenção já produzidos upstream.
 * Observability-first — não decide winner, não gera reasoning, não gera texto.
 */

import { GOVERNED_FALLBACK_PAYLOAD_BUILDER_VERSION } from "./governedFallbackPayloadBuilder.js";
import { UNIVERSAL_GOVERNED_FALLBACK_REASONING_VERSION } from "./universalGovernedFallbackReasoning.js";

export const UNIVERSAL_CATEGORY_SIGNAL_LIBRARY_VERSION = "4E-B.9";

export const UNIVERSAL_CATEGORY_SIGNAL_TYPE = "universal_category_signals";

export const SIGNAL_SOURCES = Object.freeze({
  QUERY: "query",
  GOVERNED_FALLBACK_PAYLOAD: "governed_fallback_payload",
  UNIVERSAL_GOVERNED_REASONING: "universal_governed_fallback_reasoning",
  ACCESSORY_INTENT: "accessory_intent_detection",
  COMMERCIAL_ALIGNMENT: "commercial_alignment",
  COMMERCIAL_INTENT: "commercial_intent_snapshot",
  EXPLICIT_OFFER: "explicit_offer_signals",
  DATA_LAYER: "data_layer",
});

export const RELATIONSHIP_ROLES = Object.freeze({
  STANDALONE_ITEM: "standalone_item",
  COMPATIBILITY_CONTEXT: "compatibility_context",
  UPSTREAM_CONTEXT_ONLY: "upstream_context_only",
  UNKNOWN: "unknown",
});

export const COMPATIBILITY_ROLES = Object.freeze({
  NONE: "none",
  CONTEXT_REFERENCE: "context_reference",
  EXPLICIT_FROM_UPSTREAM: "explicit_from_upstream",
  UNKNOWN: "unknown",
});

function cleanText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function namesEqual(a = "", b = "") {
  const left = cleanText(a).toLowerCase();
  const right = cleanText(b).toLowerCase();
  return !!left && !!right && left === right;
}

function asSignalRecord(id, value, source, confidence = "medium", meta = {}) {
  return {
    id,
    value: value ?? null,
    source,
    confidence,
    normalized: true,
    ...meta,
  };
}

function cloneValue(value) {
  if (value == null) return null;
  if (typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value));
}

function resolveItemIdentity(name = "", source = "unknown") {
  const productName = cleanText(name);
  if (!productName) return null;
  return { productName, source };
}

function collectExistingSignals(payload = {}, reasoning = {}) {
  return {
    payload: {
      query: payload.query || null,
      selectedProductName: payload.selectedProduct?.productName || null,
      relatedMainProductName: payload.relatedMainProduct?.productName || null,
      identifiedVertical: payload.commercialIntent?.identifiedVertical || null,
      accessoryIntent: payload.commercialIntent?.accessoryIntent || null,
      queryCore: payload.commercialSignals?.queryCore || null,
      offerCore: payload.commercialSignals?.offerCore || null,
      alignmentReason: payload.commercialSignals?.alignmentReason || null,
      explicitOfferSignals: payload.commercialSignals?.explicitOfferSignals || [],
      hasDataLayer: payload.governance?.hasDataLayer === true,
    },
    reasoning: {
      selectedCommercialItemName: reasoning.selectedCommercialItem?.productName || null,
      upstreamReferenceName: reasoning.upstreamReference?.productName || null,
      verbalizationFocusName: reasoning.verbalizationFocus?.productName || null,
      forbiddenFocusProductName: reasoning.verbalizationFocus?.forbiddenFocusProductName || null,
      requestedItemIdentity: reasoning.requestedItemIdentity || null,
      categorySignals: reasoning.categorySignals || null,
      shouldUseFallbackReasoning: reasoning.shouldUseFallbackReasoning === true,
    },
  };
}

function resolveRelationshipRole(payload = {}, reasoning = {}) {
  const upstream = cleanText(
    payload.relatedMainProduct?.productName || reasoning.upstreamReference?.productName
  );
  const selected = cleanText(
    payload.selectedProduct?.productName || reasoning.selectedCommercialItem?.productName
  );
  const accessoryIntent = payload.commercialIntent?.accessoryIntent?.isAccessoryIntent === true;

  if (upstream && selected && !namesEqual(upstream, selected) && accessoryIntent) {
    return RELATIONSHIP_ROLES.COMPATIBILITY_CONTEXT;
  }
  if (upstream && selected && !namesEqual(upstream, selected)) {
    return RELATIONSHIP_ROLES.UPSTREAM_CONTEXT_ONLY;
  }
  if (selected) {
    return RELATIONSHIP_ROLES.STANDALONE_ITEM;
  }
  return RELATIONSHIP_ROLES.UNKNOWN;
}

function resolveCompatibilityRole(payload = {}, reasoning = {}, relationshipRole = "") {
  const upstream = cleanText(
    payload.relatedMainProduct?.productName || reasoning.upstreamReference?.productName
  );
  if (!upstream) return COMPATIBILITY_ROLES.NONE;
  if (relationshipRole === RELATIONSHIP_ROLES.COMPATIBILITY_CONTEXT) {
    return COMPATIBILITY_ROLES.EXPLICIT_FROM_UPSTREAM;
  }
  if (relationshipRole === RELATIONSHIP_ROLES.UPSTREAM_CONTEXT_ONLY) {
    return COMPATIBILITY_ROLES.CONTEXT_REFERENCE;
  }
  return COMPATIBILITY_ROLES.UNKNOWN;
}

function resolveCategoryIdentity(payload = {}, reasoning = {}) {
  const vertical = cleanText(payload.commercialIntent?.identifiedVertical || "");
  const explicitOfferSignals = payload.commercialSignals?.explicitOfferSignals || [];
  const categoryFromOffer = explicitOfferSignals.find((signal) => signal.category)?.category || null;

  if (vertical) {
    return {
      value: vertical,
      source: SIGNAL_SOURCES.COMMERCIAL_INTENT,
      confidence: "medium",
      inferred: false,
    };
  }

  if (categoryFromOffer) {
    return {
      value: categoryFromOffer,
      source: SIGNAL_SOURCES.EXPLICIT_OFFER,
      confidence: "low",
      inferred: false,
    };
  }

  return {
    value: null,
    source: null,
    confidence: "unknown",
    inferred: false,
  };
}

function detectAmbiguity(payload = {}, reasoning = {}, query = "") {
  const signals = [];
  const q = cleanText(query || payload.query || reasoning.query || "");
  const tokens = q.split(/\s+/).filter(Boolean);
  const accessoryIntent = payload.commercialIntent?.accessoryIntent || {};
  const categoryIdentity = resolveCategoryIdentity(payload, reasoning);
  const upstream = cleanText(
    payload.relatedMainProduct?.productName || reasoning.upstreamReference?.productName
  );
  const selected = cleanText(
    payload.selectedProduct?.productName || reasoning.selectedCommercialItem?.productName
  );

  if (tokens.length <= 2 && q) {
    signals.push(
      asSignalRecord("short_query", q, SIGNAL_SOURCES.QUERY, "low", {
        reason: "query_too_short_for_confident_classification",
      })
    );
  }

  if (!categoryIdentity.value) {
    signals.push(
      asSignalRecord("missing_category_identity", null, SIGNAL_SOURCES.GOVERNED_FALLBACK_PAYLOAD, "unknown", {
        reason: "no_explicit_vertical_or_offer_category_signal",
      })
    );
  }

  if (accessoryIntent.isAccessoryIntent && !selected) {
    signals.push(
      asSignalRecord("accessory_without_selected_item", true, SIGNAL_SOURCES.ACCESSORY_INTENT, "low", {
        reason: "accessory_intent_without_selected_commercial_item",
      })
    );
  }

  if (upstream && selected && namesEqual(upstream, selected)) {
    signals.push(
      asSignalRecord("upstream_equals_selected", true, SIGNAL_SOURCES.GOVERNED_FALLBACK_PAYLOAD, "low", {
        reason: "potential_upstream_contamination",
      })
    );
  }

  if (!accessoryIntent.isAccessoryIntent && tokens.length <= 3) {
    signals.push(
      asSignalRecord("generic_short_commercial_query", q, SIGNAL_SOURCES.QUERY, "low", {
        reason: "generic_term_without_explicit_intent_envelope",
      })
    );
  }

  return signals;
}

function detectSignalConflicts(payload = {}, reasoning = {}, normalized = {}) {
  const conflicts = [];
  const existing = collectExistingSignals(payload, reasoning);

  if (
    existing.reasoning.verbalizationFocusName &&
    existing.reasoning.upstreamReferenceName &&
    namesEqual(existing.reasoning.verbalizationFocusName, existing.reasoning.upstreamReferenceName)
  ) {
    conflicts.push({
      type: "verbalization_focus_equals_upstream",
      sources: [SIGNAL_SOURCES.UNIVERSAL_GOVERNED_REASONING, SIGNAL_SOURCES.GOVERNED_FALLBACK_PAYLOAD],
      preferredSourceReason: "selected_commercial_item_must_not_equal_upstream_reference",
    });
  }

  if (
    normalized.requestedItem?.productName &&
    normalized.upstreamReference?.productName &&
    namesEqual(normalized.requestedItem.productName, normalized.upstreamReference.productName) &&
    payload.commercialIntent?.accessoryIntent?.isAccessoryIntent
  ) {
    conflicts.push({
      type: "requested_item_collapsed_into_upstream",
      sources: [SIGNAL_SOURCES.ACCESSORY_INTENT, SIGNAL_SOURCES.GOVERNED_FALLBACK_PAYLOAD],
      preferredSourceReason: "requested_item_should_not_be_upstream_on_accessory_queries",
    });
  }

  if (
    existing.payload.selectedProductName &&
    existing.reasoning.selectedCommercialItemName &&
    !namesEqual(existing.payload.selectedProductName, existing.reasoning.selectedCommercialItemName)
  ) {
    conflicts.push({
      type: "selected_item_payload_reasoning_mismatch",
      sources: [SIGNAL_SOURCES.GOVERNED_FALLBACK_PAYLOAD, SIGNAL_SOURCES.UNIVERSAL_GOVERNED_REASONING],
      preferredSourceReason: "preserve_both_values_and_flag_conflict_without_reconciling",
    });
  }

  return conflicts;
}

function resolveConfidence(categoryIdentity = {}, ambiguitySignals = [], conflicts = []) {
  let level = categoryIdentity.confidence || "unknown";
  if (conflicts.length > 0) level = "low";
  if (ambiguitySignals.length >= 2) level = "low";
  if (ambiguitySignals.some((signal) => signal.confidence === "unknown")) level = "unknown";
  return {
    level,
    ambiguityLevel: ambiguitySignals.length >= 2 ? "high" : ambiguitySignals.length === 1 ? "medium" : "none",
    confidenceAdjustment: conflicts.length > 0 ? "reduced_due_to_conflict" : null,
  };
}

/**
 * @param {Record<string, unknown>} signals
 */
export function normalizeUniversalCategorySignals(signals = {}) {
  const requested = signals.requestedItem || null;
  const selected = signals.selectedCommercialItem || null;
  const upstream = signals.upstreamReference || null;

  return {
    requestedItem: requested ? cloneValue(requested) : null,
    selectedCommercialItem: selected ? cloneValue(selected) : null,
    upstreamReference: upstream ? cloneValue(upstream) : null,
    compatibilityReference: signals.compatibilityReference
      ? cloneValue(signals.compatibilityReference)
      : null,
    categoryIdentity: cloneValue(signals.categoryIdentity || null),
    relationshipRole: signals.relationshipRole || RELATIONSHIP_ROLES.UNKNOWN,
    compatibilityRole: signals.compatibilityRole || COMPATIBILITY_ROLES.UNKNOWN,
    commercialIntent: cloneValue(signals.commercialIntent || null),
    normalizedSignals: Array.isArray(signals.normalizedSignals)
      ? signals.normalizedSignals.map((entry) => cloneValue(entry))
      : [],
  };
}

/**
 * @param {Record<string, unknown>} signals
 */
export function validateUniversalCategorySignals(signals = {}) {
  const issues = [];
  const normalized = normalizeUniversalCategorySignals(signals);

  if (
    normalized.upstreamReference?.productName &&
    normalized.requestedItem?.productName &&
    namesEqual(normalized.upstreamReference.productName, normalized.requestedItem.productName) &&
    normalized.commercialIntent?.accessoryIntent?.isAccessoryIntent
  ) {
    issues.push("upstream_reference_must_not_replace_requested_item");
  }

  if (
    normalized.upstreamReference?.productName &&
    normalized.selectedCommercialItem?.productName &&
    namesEqual(normalized.upstreamReference.productName, normalized.selectedCommercialItem.productName)
  ) {
    issues.push("upstream_reference_must_not_replace_selected_commercial_item");
  }

  if (
    normalized.categoryIdentity?.value &&
    normalized.categoryIdentity?.inferred === true
  ) {
    issues.push("category_identity_must_not_be_invented");
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * @param {{
 *   query?: string,
 *   governedFallbackPayload?: Record<string, unknown>|null,
 *   universalGovernedFallbackReasoning?: Record<string, unknown>|null,
 * }} input
 */
export function shouldBuildUniversalCategorySignals(input = {}) {
  const payload = input.governedFallbackPayload || null;
  const reasoning = input.universalGovernedFallbackReasoning || null;
  if (payload?.enabled === true || reasoning?.shouldUseFallbackReasoning === true) return true;
  if (cleanText(input.query || payload?.query || reasoning?.query)) return true;
  return false;
}

/**
 * @param {{
 *   universal?: Record<string, unknown>,
 *   existing?: Record<string, unknown>,
 * }} input
 */
export function compareUniversalCategorySignalsWithExistingSignals(input = {}) {
  const universal = input.universal || {};
  const existing = input.existing || {};
  const payloadExisting = existing.payload || {};
  const reasoningExisting = existing.reasoning || {};

  const missingInUniversal = [];
  const divergent = [];
  const preserved = [];

  const checks = [
    ["selectedCommercialItem", universal.selectedCommercialItem?.productName, payloadExisting.selectedProductName],
    ["upstreamReference", universal.upstreamReference?.productName, payloadExisting.relatedMainProductName],
    ["categoryIdentity", universal.categoryIdentity?.value, payloadExisting.identifiedVertical],
    ["verbalizationFocus", universal.selectedCommercialItem?.productName, reasoningExisting.verbalizationFocusName],
  ];

  for (const [field, universalValue, existingValue] of checks) {
    if (existingValue == null && universalValue == null) continue;
    if (existingValue != null && universalValue == null) {
      missingInUniversal.push({ field, existingValue });
      continue;
    }
    if (existingValue == null && universalValue != null) {
      preserved.push({ field, universalValue });
      continue;
    }
    if (!namesEqual(universalValue, existingValue)) {
      divergent.push({ field, universalValue, existingValue });
    } else {
      preserved.push({ field, universalValue });
    }
  }

  return {
    missingInUniversal,
    divergent,
    preserved,
    potentialUpstreamContamination:
      universal.upstreamReference?.productName &&
      universal.selectedCommercialItem?.productName &&
      namesEqual(
        universal.upstreamReference.productName,
        universal.selectedCommercialItem.productName
      ),
  };
}

/**
 * @param {{
 *   query?: string,
 *   governedFallbackPayload?: Record<string, unknown>|null,
 *   universalGovernedFallbackReasoning?: Record<string, unknown>|null,
 * }} input
 */
export function buildUniversalCategorySignals(input = {}) {
  const payload = input.governedFallbackPayload || {};
  const reasoning = input.universalGovernedFallbackReasoning || {};
  const query = cleanText(input.query || payload.query || reasoning.query || "");
  const active = shouldBuildUniversalCategorySignals(input);
  const hasDataLayer = payload.governance?.hasDataLayer === true;

  if (!active) {
    return {
      version: UNIVERSAL_CATEGORY_SIGNAL_LIBRARY_VERSION,
      signalType: UNIVERSAL_CATEGORY_SIGNAL_TYPE,
      isActive: false,
      skipped: true,
      skipReason: "insufficient_signal_inputs",
      query: query || null,
    };
  }

  const relationshipRole = resolveRelationshipRole(payload, reasoning);
  const compatibilityRole = resolveCompatibilityRole(payload, reasoning, relationshipRole);
  const categoryIdentity = resolveCategoryIdentity(payload, reasoning);
  const requestedItem = resolveItemIdentity(
    reasoning.requestedItemIdentity?.query || query,
    reasoning.requestedItemIdentity?.identitySource || SIGNAL_SOURCES.QUERY
  );
  const selectedCommercialItem = resolveItemIdentity(
    payload.selectedProduct?.productName || reasoning.selectedCommercialItem?.productName,
    SIGNAL_SOURCES.GOVERNED_FALLBACK_PAYLOAD
  );
  const upstreamReference = resolveItemIdentity(
    payload.relatedMainProduct?.productName || reasoning.upstreamReference?.productName,
    payload.relatedMainProduct?.source ||
      reasoning.upstreamReference?.source ||
      SIGNAL_SOURCES.GOVERNED_FALLBACK_PAYLOAD
  );
  const compatibilityReference =
    upstreamReference && compatibilityRole !== COMPATIBILITY_ROLES.NONE
      ? {
          ...upstreamReference,
          role: compatibilityRole,
          usage: "compatibility_or_context_only",
        }
      : null;

  const normalizedSignals = [
    asSignalRecord("requested_item", requestedItem?.productName || null, SIGNAL_SOURCES.QUERY, "medium"),
    asSignalRecord(
      "selected_commercial_item",
      selectedCommercialItem?.productName || null,
      SIGNAL_SOURCES.GOVERNED_FALLBACK_PAYLOAD,
      "medium"
    ),
    asSignalRecord(
      "upstream_reference",
      upstreamReference?.productName || null,
      SIGNAL_SOURCES.GOVERNED_FALLBACK_PAYLOAD,
      upstreamReference ? "medium" : "unknown"
    ),
    asSignalRecord("relationship_role", relationshipRole, SIGNAL_SOURCES.UNIVERSAL_GOVERNED_REASONING, "medium"),
    asSignalRecord("category_identity", categoryIdentity.value, categoryIdentity.source, categoryIdentity.confidence),
  ];

  const ambiguitySignals = detectAmbiguity(payload, reasoning, query);
  const conflicts = detectSignalConflicts(payload, reasoning, {
    requestedItem,
    selectedCommercialItem,
    upstreamReference,
    commercialIntent: payload.commercialIntent || null,
  });
  const confidence = resolveConfidence(categoryIdentity, ambiguitySignals, conflicts);
  const existingSignals = collectExistingSignals(payload, reasoning);
  const comparison = compareUniversalCategorySignalsWithExistingSignals({
    universal: {
      requestedItem,
      selectedCommercialItem,
      upstreamReference,
      categoryIdentity,
      commercialIntent: payload.commercialIntent || null,
    },
    existing: existingSignals,
  });

  const validation = validateUniversalCategorySignals({
    requestedItem,
    selectedCommercialItem,
    upstreamReference,
    compatibilityReference,
    categoryIdentity,
    relationshipRole,
    compatibilityRole,
    commercialIntent: payload.commercialIntent || null,
    normalizedSignals,
  });

  return {
    version: UNIVERSAL_CATEGORY_SIGNAL_LIBRARY_VERSION,
    signalType: UNIVERSAL_CATEGORY_SIGNAL_TYPE,
    isActive: true,
    skipped: false,
    query,
    requestedItem,
    requestedItemIdentity: cloneValue(reasoning.requestedItemIdentity || null),
    selectedCommercialItem,
    upstreamReference,
    compatibilityReference,
    relationshipRole,
    compatibilityRole,
    commercialIntent: {
      accessoryIntent: payload.commercialIntent?.accessoryIntent || {
        isAccessoryIntent: false,
        confidence: 0,
        matchedSignals: [],
      },
      intentSnapshot: payload.commercialIntent?.intentSnapshot || null,
      queryCore: payload.commercialSignals?.queryCore || null,
      offerCore: payload.commercialSignals?.offerCore || null,
    },
    categoryIdentity,
    categoryConfidence: confidence,
    sourceSignals: existingSignals,
    normalizedSignals,
    ambiguitySignals,
    safetyBoundaries: {
      upstreamMustNotBecomeRequestedItem: true,
      upstreamMustNotBecomeSelectedCommercialItem: true,
      upstreamMustNotBecomeCategoryIdentity: true,
      upstreamMustNotBecomeVerbalizationTarget: true,
    },
    dataLayerStatus: {
      hasDataLayer,
      governedFallbackActive: !hasDataLayer && payload.enabled === true,
      reasoningActive: reasoning.shouldUseFallbackReasoning === true,
    },
    provenance: {
      libraryOrigin: "universal_category_signal_library",
      payloadVersion: payload.version || GOVERNED_FALLBACK_PAYLOAD_BUILDER_VERSION,
      reasoningVersion: reasoning.version || UNIVERSAL_GOVERNED_FALLBACK_REASONING_VERSION,
      sourcesUsed: [
        SIGNAL_SOURCES.QUERY,
        SIGNAL_SOURCES.GOVERNED_FALLBACK_PAYLOAD,
        SIGNAL_SOURCES.UNIVERSAL_GOVERNED_REASONING,
        SIGNAL_SOURCES.ACCESSORY_INTENT,
        SIGNAL_SOURCES.COMMERCIAL_ALIGNMENT,
      ],
    },
    conflicts: {
      hasSignalConflict: conflicts.length > 0,
      conflictingSources: [...new Set(conflicts.flatMap((entry) => entry.sources || []))],
      items: conflicts,
      comparisonWithExistingSignals: comparison,
    },
    diagnostics: {
      ambiguityLevel: confidence.ambiguityLevel,
      confidenceLevel: confidence.level,
      confidenceAdjustment: confidence.confidenceAdjustment,
      validation,
    },
  };
}

/**
 * @param {Record<string, unknown>} signals
 */
export function buildUniversalCategorySignalDiagnostics(signals = {}) {
  return {
    version: signals.version || UNIVERSAL_CATEGORY_SIGNAL_LIBRARY_VERSION,
    signalType: signals.signalType || UNIVERSAL_CATEGORY_SIGNAL_TYPE,
    isActive: signals.isActive === true,
    skipped: signals.skipped === true,
    query: signals.query || null,
    requestedItemName: signals.requestedItem?.productName || null,
    selectedCommercialItemName: signals.selectedCommercialItem?.productName || null,
    upstreamReferenceName: signals.upstreamReference?.productName || null,
    categoryIdentity: signals.categoryIdentity?.value || null,
    relationshipRole: signals.relationshipRole || null,
    hasSignalConflict: signals.conflicts?.hasSignalConflict === true,
    ambiguityLevel: signals.diagnostics?.ambiguityLevel || null,
    confidenceLevel: signals.diagnostics?.confidenceLevel || null,
    validationValid: signals.diagnostics?.validation?.valid === true,
  };
}

/**
 * @param {Record<string, unknown>} signals
 */
export function buildUniversalCategorySignalDevPayload(signals = {}) {
  return {
    version: signals.version || UNIVERSAL_CATEGORY_SIGNAL_LIBRARY_VERSION,
    signalType: signals.signalType || UNIVERSAL_CATEGORY_SIGNAL_TYPE,
    isActive: signals.isActive === true,
    query: signals.query || null,
    requestedItem: signals.requestedItem || null,
    selectedCommercialItem: signals.selectedCommercialItem || null,
    upstreamReference: signals.upstreamReference || null,
    compatibilityReference: signals.compatibilityReference || null,
    relationshipRole: signals.relationshipRole || null,
    compatibilityRole: signals.compatibilityRole || null,
    categoryIdentity: signals.categoryIdentity || null,
    commercialIntent: signals.commercialIntent || null,
    normalizedSignals: signals.normalizedSignals || [],
    ambiguitySignals: signals.ambiguitySignals || [],
    conflicts: signals.conflicts || null,
    provenance: signals.provenance || null,
    dataLayerStatus: signals.dataLayerStatus || null,
    diagnostics: buildUniversalCategorySignalDiagnostics(signals),
    comparisonWithExistingSignals: signals.conflicts?.comparisonWithExistingSignals || null,
  };
}
