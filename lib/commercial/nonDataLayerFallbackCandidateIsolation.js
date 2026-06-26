/**
 * PATCH Comercial 4E-B.3 — Non-Data-Layer Fallback Candidate Isolation
 *
 * Impede que queries sem Data Layer confiável sejam contaminadas por candidatos
 * do Data Layer de outra categoria. Não altera Decision Engine, Router ou ranking.
 */

import { detectAccessoryIntent } from "./accessoryIntentLockGuard.js";
import {
  buildCommercialKnowledgeMetadata,
  hasArchitecturalDataLayerContent,
} from "./nonDataLayerCommercialResponseGuard.js";
import {
  calculateCommercialAlignment,
  extractCommercialQueryCore,
  normalizeCommercialCoreText,
} from "../productSourceAdapter/commercialQueryProductAlignmentLayer.js";

export const NON_DATA_LAYER_FALLBACK_CANDIDATE_ISOLATION_VERSION = "4E-B.3";

const KNOWN_VERTICALS = Object.freeze([
  "tv",
  "monitor",
  "chair",
  "webcam",
  "steering_wheel",
  "microphone",
  "printer",
  "console",
  "notebook",
  "phone",
  "audio",
  "tablet",
  "computer",
]);

/**
 * Regras ordenadas por especificidade — category-agnostic, sem marcas/modelos fixos.
 */
const COMMERCIAL_VERTICAL_RULES = Object.freeze([
  { vertical: "tv", pattern: /\b(tv|televis|smart tv|televisao|televisão)\b/i },
  { vertical: "monitor", pattern: /\bmonitor\b/i },
  { vertical: "chair", pattern: /\b(cadeira|cadeiras|chair|ergonom)\b/i },
  { vertical: "webcam", pattern: /\bwebcam\b/i },
  { vertical: "steering_wheel", pattern: /\bvolante\b/i },
  { vertical: "microphone", pattern: /\bmicrofone\b/i },
  { vertical: "printer", pattern: /\bimpressora\b/i },
  { vertical: "console", pattern: /\b(ps5|playstation|xbox|console|series s|series x)\b/i },
  { vertical: "notebook", pattern: /\b(notebook|laptop|macbook|chromebook|ideapad|vivobook)\b/i },
  {
    vertical: "phone",
    pattern:
      /\b(iphone|galaxy|smartphone|celular|moto g|moto e|redmi note|redmi|poco|realme|s\d{2}\s?fe|a\d{2}|m\d{2})\b/i,
  },
  { vertical: "audio", pattern: /\b(fone|headset|earbud|airpods|bluetooth)\b/i },
  { vertical: "tablet", pattern: /\b(tablet|ipad)\b/i },
  { vertical: "computer", pattern: /\b(pc gamer|computador|desktop|cpu gamer)\b/i },
]);

const VERTICAL_CATEGORY_ALIASES = Object.freeze({
  televisao: "tv",
  televisão: "tv",
  smartphone: "phone",
  celular: "phone",
  laptop: "notebook",
  cadeira: "chair",
  chair: "chair",
  volante: "steering_wheel",
  webcam: "webcam",
  microfone: "microphone",
  impressora: "printer",
});

function cleanText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeVertical(value = "") {
  const raw = normalizeCommercialCoreText(value);
  if (!raw) return null;
  if (KNOWN_VERTICALS.includes(raw)) return raw;
  return VERTICAL_CATEGORY_ALIASES[raw] || null;
}

/**
 * @param {string} text
 */
export function detectCommercialVerticalFromText(text = "") {
  const normalized = normalizeCommercialCoreText(text);
  if (!normalized) return null;

  for (const rule of COMMERCIAL_VERTICAL_RULES) {
    if (rule.pattern.test(normalized)) {
      return rule.vertical;
    }
  }

  return null;
}

/**
 * @param {Record<string, unknown>} candidate
 */
export function resolveCandidateCommercialVertical(candidate = {}) {
  const category = normalizeVertical(
    candidate.category || candidate.trustedSpecs?.category || ""
  );
  if (category) return category;

  return detectCommercialVerticalFromText(
    candidate.product_name || candidate.official_name || ""
  );
}

/**
 * @param {string} query
 * @param {Record<string, unknown>} [context]
 */
export function detectNonDataLayerCommercialIntent(query = "", context = {}) {
  const normalizedQuery = normalizeCommercialCoreText(query);
  const accessory = detectAccessoryIntent(query);
  const detectedVertical =
    normalizeVertical(context.detectedVertical || context.categoryHint || "") ||
    detectCommercialVerticalFromText(query);
  const queryCore = extractCommercialQueryCore(query);

  return {
    query,
    queryCore,
    normalizedQuery,
    detectedCommercialIntent: detectedVertical || "general",
    detectedVertical,
    isAccessoryIntent: accessory.isAccessoryIntent === true,
    accessorySignals: accessory.matchedSignals || [],
    accessoryConfidence: accessory.confidence || 0,
    categoryHint: cleanText(context.categoryHint || ""),
  };
}

/**
 * @param {{
 *   query?: string,
 *   candidate?: Record<string, unknown>,
 *   commercialIntent?: Record<string, unknown>,
 * }} input
 */
export function assessDataLayerCandidateReliability(input = {}) {
  const query = cleanText(input.query || "");
  const candidate = input.candidate || {};
  const commercialIntent =
    input.commercialIntent || detectNonDataLayerCommercialIntent(query, input);
  const candidateName = cleanText(candidate.product_name || candidate.official_name || "");
  const trustedSpecs = candidate.trustedSpecs || null;
  const hasAuditedContent =
    candidate.isDataLayerProduct === true || hasArchitecturalDataLayerContent(trustedSpecs);

  if (!candidateName) {
    return { reliable: false, reason: "empty_candidate", confidence: "high" };
  }

  const alignment = calculateCommercialAlignment({
    query,
    offer: { title: candidateName },
  });

  if (commercialIntent.isAccessoryIntent) {
    if (
      alignment.alignmentReason === "main_offer_for_accessory_query" ||
      !alignment.offerHasAccessorySignals
    ) {
      return {
        reliable: false,
        reason: "accessory_query_main_product_blocked",
        confidence: "high",
        alignment,
        candidateVertical: resolveCandidateCommercialVertical(candidate),
      };
    }

    return {
      reliable: true,
      reason: "accessory_query_accessory_candidate",
      confidence: alignment.confidence || "medium",
      alignment,
      candidateVertical: resolveCandidateCommercialVertical(candidate),
    };
  }

  const queryVertical = commercialIntent.detectedVertical || null;
  const candidateVertical = resolveCandidateCommercialVertical(candidate);

  if (queryVertical && candidateVertical && queryVertical !== candidateVertical) {
    return {
      reliable: false,
      reason: "vertical_mismatch",
      confidence: "high",
      alignment,
      queryVertical,
      candidateVertical,
    };
  }

  if (alignment.confidence === "high" && !alignment.isAligned) {
    return {
      reliable: false,
      reason: "commercial_alignment_mismatch",
      confidence: "high",
      alignment,
      queryVertical,
      candidateVertical,
    };
  }

  if (!hasAuditedContent) {
    if (queryVertical && !candidateVertical) {
      return {
        reliable: false,
        reason: "no_audited_content_for_query_vertical",
        confidence: "medium",
        alignment,
        queryVertical,
        candidateVertical,
      };
    }

    if (alignment.overlap < 0.45) {
      return {
        reliable: false,
        reason: "no_reliable_data_layer_match",
        confidence: "medium",
        alignment,
        queryVertical,
        candidateVertical,
      };
    }
  }

  if (hasAuditedContent && alignment.isAligned) {
    return {
      reliable: true,
      reason: "audited_aligned_candidate",
      confidence: alignment.confidence || "high",
      alignment,
      queryVertical,
      candidateVertical,
    };
  }

  if (hasAuditedContent && queryVertical && candidateVertical === queryVertical) {
    return {
      reliable: true,
      reason: "audited_vertical_match",
      confidence: alignment.confidence || "medium",
      alignment,
      queryVertical,
      candidateVertical,
    };
  }

  if (hasAuditedContent && alignment.overlap >= 0.5) {
    return {
      reliable: true,
      reason: "audited_core_overlap",
      confidence: alignment.confidence || "medium",
      alignment,
      queryVertical,
      candidateVertical,
    };
  }

  return {
    reliable: false,
    reason: "no_reliable_data_layer_match",
    confidence: "high",
    alignment,
    queryVertical,
    candidateVertical,
  };
}

/**
 * @param {Record<string, unknown>} input
 */
export function shouldIsolateFromDataLayerCandidates(input = {}) {
  const query = cleanText(input.query || "");
  const candidates = Array.isArray(input.candidates) ? input.candidates : [];
  const commercialIntent = detectNonDataLayerCommercialIntent(query, input);

  if (!candidates.length) {
    return {
      shouldIsolate: false,
      reason: "no_candidates",
      queryCore: commercialIntent.queryCore,
      detectedCommercialIntent: commercialIntent.detectedCommercialIntent,
      matchedDataLayerProduct: null,
      confidence: "high",
      commercialIntent,
      reliableCandidates: [],
    };
  }

  const reliableCandidates = candidates.filter(
    (candidate) =>
      assessDataLayerCandidateReliability({ query, candidate, commercialIntent }).reliable
  );

  if (reliableCandidates.length > 0) {
    return {
      shouldIsolate: false,
      reason: "reliable_candidates_present",
      queryCore: commercialIntent.queryCore,
      detectedCommercialIntent: commercialIntent.detectedCommercialIntent,
      matchedDataLayerProduct: reliableCandidates[0]?.product_name || null,
      confidence: "high",
      commercialIntent,
      reliableCandidates,
      blockedDataLayerCandidate: null,
      originalCandidate: candidates[0]?.product_name || null,
    };
  }

  const firstAssessment = assessDataLayerCandidateReliability({
    query,
    candidate: candidates[0],
    commercialIntent,
  });

  return {
    shouldIsolate: true,
    reason: firstAssessment.reason || "no_reliable_data_layer_match",
    queryCore: commercialIntent.queryCore,
    detectedCommercialIntent: commercialIntent.detectedCommercialIntent,
    matchedDataLayerProduct: null,
    confidence: firstAssessment.confidence || "high",
    commercialIntent,
    reliableCandidates: [],
    blockedDataLayerCandidate: candidates[0]?.product_name || null,
    originalCandidate: candidates[0]?.product_name || null,
  };
}

/**
 * @param {Record<string, unknown>} input
 */
export function filterDataLayerCandidatesForCommercialFallback(input = {}) {
  const query = cleanText(input.query || "");
  const candidates = Array.isArray(input.candidates) ? input.candidates : [];
  const assessment = shouldIsolateFromDataLayerCandidates({ ...input, query, candidates });
  const reliableCandidates = assessment.reliableCandidates || [];

  if (!assessment.shouldIsolate) {
    return {
      applied: false,
      reason: assessment.reason,
      query,
      candidates: reliableCandidates.length ? reliableCandidates : candidates,
      blockedDataLayerCandidate: null,
      originalCandidate: assessment.originalCandidate || candidates[0]?.product_name || null,
      finalCandidate:
        (reliableCandidates[0] || candidates[0])?.product_name || null,
      commercialIntent: assessment.commercialIntent,
      assessment,
    };
  }

  return {
    applied: true,
    reason: assessment.reason,
    query,
    candidates: [],
    blockedDataLayerCandidate: assessment.blockedDataLayerCandidate || null,
    originalCandidate: assessment.originalCandidate || null,
    finalCandidate: null,
    commercialIntent: assessment.commercialIntent,
    assessment,
  };
}

/**
 * @param {Record<string, unknown>} input
 */
export function buildFallbackCandidateIsolationDiagnostics(input = {}) {
  const knowledgeMetadata =
    input.knowledgeMetadata ||
    buildCommercialKnowledgeMetadata({
      product: {
        product_name:
          input.finalCandidate ||
          input.blockedDataLayerCandidate ||
          input.query ||
          "",
      },
      trustedSpecs: null,
      hasDataLayer: Array.isArray(input.candidates) && input.candidates.length > 0,
    });

  return {
    version: NON_DATA_LAYER_FALLBACK_CANDIDATE_ISOLATION_VERSION,
    applied: input.applied === true,
    reason: input.reason || null,
    query: input.query || null,
    blockedDataLayerCandidate: input.blockedDataLayerCandidate || null,
    originalCandidate: input.originalCandidate || null,
    finalCandidate: input.finalCandidate || null,
    detectedCommercialIntent:
      input.commercialIntent?.detectedCommercialIntent ||
      input.assessment?.detectedCommercialIntent ||
      null,
    queryCore: input.commercialIntent?.queryCore || input.assessment?.queryCore || null,
    knowledgeSource: knowledgeMetadata.knowledgeSource || null,
    transparencyRequired: knowledgeMetadata.transparencyRequired === true,
    isAccessoryIntent: input.commercialIntent?.isAccessoryIntent === true,
  };
}

/**
 * @param {Record<string, unknown>} diagnostics
 */
export function buildFallbackCandidateIsolationDevPayload(diagnostics = {}) {
  return {
    applied: diagnostics.applied === true,
    blockedDataLayerCandidate: diagnostics.blockedDataLayerCandidate || null,
    reason: diagnostics.reason || null,
    finalCandidate: diagnostics.finalCandidate || null,
    detectedCommercialIntent: diagnostics.detectedCommercialIntent || null,
    transparencyRequired: diagnostics.transparencyRequired === true,
  };
}
