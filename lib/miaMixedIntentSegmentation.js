/**
 * PATCH 11A.3 — Mixed Intent Segmentation & Commercial Query Extraction
 *
 * Separates human, commercial and conversational dimensions from a single
 * user message before any provider/search/winner decision.
 *
 * MIA owns the intelligence. The LLM only verbalizes.
 */

import {
  MIA_INTERACTION_MODES,
  detectActiveCommercialAsk,
} from "./miaIntentRecognitionLayer.js";
import { COMMERCIAL_PERMISSION } from "./miaIntentAuthority.js";
import { extractComparisonTermsFromQuery } from "./miaComparisonFlowCrashGuard.js";

export const MIXED_SEGMENTATION_VERSION = "11A.3";

const DISCOURSE_SPLIT_PATTERN =
  /\s*(?:[,;!?]\s*|\s+(?:mas|porem|porém|so|só|agora|entao|então|e agora|depois|entretanto|todavia|porem)\s+)/i;

const NARRATIVE_CONNECTOR_PATTERN =
  /\b(mas|porem|porém|so|só|agora|entao|então|depois|hoje|ontem|foi|estou|to|tô|ta|tá|cansad\w*|desanim\w*|feliz|pessimo|péssimo|horrivel|horrível|dificil|difícil|valeu|obrigad\w*)\b/i;

const COMMERCIAL_VERB_PATTERN =
  /\b(preciso|precisamos|quero|queria|procuro|procurar|buscar|busco|escolher|comprar|compro|recomend\w*|indique|indica|compare|comparar|compara|melhor|vale\s+(?:\w+\s+)*a\s+pena)\b/i;

const CATEGORY_TOKEN_PATTERN =
  /\b(celular(?:es)?|smartphone(?:s)?|iphone(?:s)?|notebook(?:s)?|laptop(?:s)?|tv|televis(?:ao|ão|ões)|monitor(?:es)?|mouse(?:s)?|teclado(?:s)?|fone(?:s)?|headset(?:s)?|tablet(?:s)?|cadeira(?:s)?|geladeira(?:s)?|camera(?:s)?|câmera(?:s)?|console(?:s)?|playstation|xbox|galaxy|samsung|motorola|xiaomi)\b/gi;

const FILLER_STRIP_PATTERN =
  /\b(preciso|precisamos|quero|queria|procuro|procurar|buscar|busco|escolher|comprar|compro|recomend\w*|indique|indica|compare|comparar|compara|um|uma|uns|umas|de|do|da|dos|das|o|a|os|as|me|pra|para|por|novo|nova|melhor|qual|quais|voce|você|vc|ai|aí|agora|so|só|mas|porem|porém)\b/gi;

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu, " ")
    .replace(/[?!.,;:…]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value = "") {
  return normalizeText(value).split(" ").filter(Boolean);
}

function splitIntoSegments(message = "") {
  const raw = String(message || "").trim();
  if (!raw) return [];

  const parts = raw
    .split(DISCOURSE_SPLIT_PATTERN)
    .map((p) => p.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts : [raw];
}

function scoreSegmentCommercial(segment = "") {
  const q = normalizeText(segment);
  if (!q) return 0;
  let score = 0;
  if (COMMERCIAL_VERB_PATTERN.test(q)) score += 0.45;
  if (detectActiveCommercialAsk(segment)) score += 0.5;
  if (CATEGORY_TOKEN_PATTERN.test(q)) score += 0.4;
  if (extractComparisonTermsFromQuery(segment).length >= 2) score += 0.55;
  if (/\b(ate|até)\s*\d+\b/.test(q)) score += 0.25;
  if (NARRATIVE_CONNECTOR_PATTERN.test(q) && !COMMERCIAL_VERB_PATTERN.test(q)) score -= 0.35;
  if (/^(hoje|ontem)\b/.test(q) && !CATEGORY_TOKEN_PATTERN.test(q)) score -= 0.4;
  return Math.max(0, Math.min(1, score));
}

function scoreSegmentHuman(segment = "") {
  const q = normalizeText(segment);
  if (!q) return 0;
  let score = 0;
  if (/^(boa noite|bom dia|boa tarde|oi|ola|olá|valeu|obrigad\w*|tmj|kkk|haha)\b/.test(q)) score += 0.7;
  if (/\b(cansad\w*|desanim\w*|feliz|pessimo|péssimo|horrivel|horrível|dificil|difícil|dia|semana)\b/.test(q)) {
    score += 0.55;
  }
  if (/^(hoje|ontem)\b/.test(q) && !COMMERCIAL_VERB_PATTERN.test(q)) score += 0.5;
  if (/^(só queria|so queria|só passando|so passando)\b/.test(q)) score += 0.65;
  if (COMMERCIAL_VERB_PATTERN.test(q)) score -= 0.2;
  return Math.max(0, Math.min(1, score));
}

function cleanComparisonTerm(term = "") {
  return normalizeText(term)
    .replace(
      /\b(comparar|compare|compara|comparacao|comparação|agora|entao|então|depois|valeu)\b/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

function extractCategoryLabel(segment = "", detectProductCategory = () => null) {
  const match = String(segment || "").match(CATEGORY_TOKEN_PATTERN);
  if (match?.[0]) {
    const token = normalizeText(match[0]);
    if (token === "smartphone" || token === "smartphones") return "celular";
    if (token === "televisao" || token === "televisoes") return "tv";
    return token;
  }

  const category = detectProductCategory(segment);
  const categoryLabels = {
    phone: "celular",
    notebook: "notebook",
    tv: "tv",
    monitor: "monitor",
    chair: "cadeira",
    audio: "fone",
    tablet: "tablet",
    console: "console",
    computer: "computador",
    storage: "ssd",
    fridge: "geladeira",
    washer: "maquina de lavar",
    kitchen: "fogao",
    car_part: "pneu",
  };
  if (category && categoryLabels[category]) {
    return categoryLabels[category];
  }

  return null;
}

function buildCommercialSearchQueryFromSegment(segment = "", detectProductCategory = () => null) {
  const comparisonTerms = extractComparisonTermsFromQuery(segment)
    .map(cleanComparisonTerm)
    .filter(Boolean);
  if (comparisonTerms.length >= 2) {
    return comparisonTerms.join(" vs ");
  }

  const categoryLabel = extractCategoryLabel(segment, detectProductCategory);
  if (categoryLabel) {
    return categoryLabel;
  }

  const stripped = normalizeText(segment)
    .replace(FILLER_STRIP_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (stripped && tokenize(stripped).length <= 4) {
    return stripped;
  }

  return null;
}

/**
 * Whether mixed segmentation should run for this turn.
 */
export function shouldApplyMixedSegmentation({
  intentRecognition = null,
  intentAuthority = null,
} = {}) {
  if (!intentRecognition || !intentAuthority?.authoritative) return false;
  if (intentAuthority.commercialPermission === COMMERCIAL_PERMISSION.DENY) return false;

  if (intentRecognition.interactionMode === MIA_INTERACTION_MODES.MIXED) return true;

  if (intentAuthority.commercialPermission === COMMERCIAL_PERMISSION.MIXED) return true;

  const segments = splitIntoSegments(intentRecognition.resolvedQuery || "");
  if (segments.length < 2) return false;

  const hasHuman = segments.some((s) => scoreSegmentHuman(s) >= 0.45);
  const hasCommercial = segments.some((s) => scoreSegmentCommercial(s) >= 0.35);
  return hasHuman && hasCommercial;
}

/**
 * Segment a mixed message into human / commercial / conversational dimensions.
 */
export function segmentMixedIntent({
  userMessage = "",
  intentRecognition = null,
  intentAuthority = null,
  hasActiveAnchor = false,
  sessionContext = {},
  detectProductCategory = () => null,
  extractBudget = () => null,
} = {}) {
  const rawMessage = String(userMessage || "").trim();
  const segments = splitIntoSegments(rawMessage);

  const scored = segments.map((text, index) => ({
    text,
    index,
    humanScore: scoreSegmentHuman(text),
    commercialScore: scoreSegmentCommercial(text),
  }));

  const humanSegments = scored
    .filter((s) => s.humanScore >= 0.35 && s.humanScore >= s.commercialScore)
    .map((s) => s.text);

  const commercialSegments = scored
    .filter((s) => s.commercialScore >= 0.35 && s.commercialScore > s.humanScore)
    .map((s) => s.text);

  const primaryCommercialSegment =
    scored
      .slice()
      .sort((a, b) => b.commercialScore - a.commercialScore)[0]?.text || "";

  const comparisonTerms = extractComparisonTermsFromQuery(primaryCommercialSegment)
    .map(cleanComparisonTerm)
    .filter(Boolean);
  const commercialCategory = extractCategoryLabel(primaryCommercialSegment, detectProductCategory);
  const commercialSearchQuery = buildCommercialSearchQueryFromSegment(
    primaryCommercialSegment,
    detectProductCategory
  );
  const budget = extractBudget(primaryCommercialSegment) || extractBudget(rawMessage);

  const humanObjective =
    intentRecognition?.humanObjective ||
    intentAuthority?.humanObjective ||
    (humanSegments.length > 0 ? "express_feeling" : null);

  const commercialObjective = comparisonTerms.length >= 2
    ? "comparison"
    : commercialCategory
      ? "product_search"
      : detectActiveCommercialAsk(primaryCommercialSegment)
        ? "purchase_help"
        : null;

  return {
    version: MIXED_SEGMENTATION_VERSION,
    rawMessage,
    segmented: true,
    segmentCount: segments.length,
    humanDimension: {
      segments: humanSegments,
      objective: humanObjective,
      emotionalPresent: humanSegments.length > 0,
      text: humanSegments.join(" ").trim() || null,
    },
    commercialDimension: {
      segments: commercialSegments,
      objective: commercialObjective,
      commercialCategory,
      commercialEntities: comparisonTerms.length >= 2 ? comparisonTerms : commercialCategory ? [commercialCategory] : [],
      commercialConstraints: {
        budget: budget || null,
      },
      commercialSearchQuery,
      comparisonTerms: comparisonTerms.length >= 2 ? comparisonTerms : [],
      isComparison: comparisonTerms.length >= 2,
    },
    conversationalDimension: {
      hasActiveAnchor,
      preserveCommerceContext: !!intentRecognition?.preserveCommerceContext,
      continuityRelevance: intentRecognition?.continuityRelevance ?? null,
      sessionHasProducts: Array.isArray(sessionContext?.lastProducts) && sessionContext.lastProducts.length > 0,
    },
    interactionMode: intentRecognition?.interactionMode || null,
    commercialPermission: intentAuthority?.commercialPermission || null,
  };
}

/**
 * Validate extracted commercial query before provider/ranking use.
 */
export function validateCommercialSearchQuery(
  commercialSearchQuery = "",
  rawMessage = "",
  segmentation = null
) {
  const query = String(commercialSearchQuery || "").trim();
  const raw = String(rawMessage || "").trim();

  if (!query) {
    return { valid: false, reason: "empty_commercial_query" };
  }

  if (isInvalidCommercialQueryAsRawMessage(query, raw)) {
    return { valid: false, reason: "query_equals_raw_message" };
  }

  const queryTokens = tokenize(query);
  const rawTokens = tokenize(raw);

  if (queryTokens.length >= 8 && queryTokens.length / Math.max(rawTokens.length, 1) > 0.75) {
    return { valid: false, reason: "query_too_narrative" };
  }

  if (
    NARRATIVE_CONNECTOR_PATTERN.test(query) &&
    !segmentation?.commercialDimension?.isComparison &&
    queryTokens.length > 4
  ) {
    return { valid: false, reason: "query_contains_narrative_connectors" };
  }

  const commercialDensity =
    (segmentation?.commercialDimension?.commercialEntities?.length || 0) +
    (segmentation?.commercialDimension?.commercialCategory ? 1 : 0);

  if (queryTokens.length > 5 && commercialDensity === 0) {
    return { valid: false, reason: "low_commercial_density" };
  }

  return { valid: true, reason: "commercial_query_valid" };
}

export function isInvalidCommercialQueryAsRawMessage(commercialSearchQuery = "", rawMessage = "") {
  const q = normalizeText(commercialSearchQuery);
  const r = normalizeText(rawMessage);
  if (!q || !r) return false;
  if (q === r) return true;

  const qTokens = tokenize(q);
  const rTokens = tokenize(r);
  if (qTokens.length === 0 || rTokens.length === 0) return false;

  const overlap = qTokens.filter((t) => rTokens.includes(t)).length;
  const overlapRatio = overlap / qTokens.length;

  return qTokens.length >= 6 && overlapRatio >= 0.85 && qTokens.length >= rTokens.length * 0.7;
}

export function isWinnerContaminatedByRawMessage(
  winnerName = "",
  rawMessage = "",
  commercialSearchQuery = ""
) {
  const winner = normalizeText(winnerName);
  const raw = normalizeText(rawMessage);
  const commercial = normalizeText(commercialSearchQuery);

  if (!winner || !raw) return false;
  if (winner === raw) return true;

  if (raw.includes(winner) && winner.length >= 20) return true;

  if (commercial && winner !== commercial && raw.includes(winner) && tokenize(winner).length >= 5) {
    return true;
  }

  return isInvalidCommercialQueryAsRawMessage(winner, raw);
}

export function sanitizeWinnerProduct(
  winner = null,
  { rawMessage = "", commercialSearchQuery = "" } = {}
) {
  if (!winner?.product_name) return winner;
  if (
    isWinnerContaminatedByRawMessage(
      winner.product_name,
      rawMessage,
      commercialSearchQuery
    )
  ) {
    return null;
  }
  return winner;
}

export function resolveCommercialPipelineQuery({
  commercialSearchQueryForProviders = null,
  resolvedQuery = "",
  rawMessage = "",
  mixedSegmentationApplied = false,
  mixedIntentSegmentation = null,
  validation = null,
} = {}) {
  if (commercialSearchQueryForProviders) {
    return commercialSearchQueryForProviders;
  }

  if (mixedIntentSegmentation) {
    const extracted =
      mixedIntentSegmentation.commercialDimension?.commercialSearchQuery || null;
    if (validation?.valid === true && extracted) {
      return extracted;
    }
    if (extracted && !isInvalidCommercialQueryAsRawMessage(extracted, rawMessage)) {
      return extracted;
    }
    return null;
  }

  if (mixedSegmentationApplied) {
    return null;
  }

  const fallback = String(resolvedQuery || "").trim();
  if (fallback && isInvalidCommercialQueryAsRawMessage(fallback, rawMessage)) {
    return null;
  }
  return fallback || null;
}

export function applyMixedSegmentationToResolvedQuery({
  segmentation = null,
  rawMessage = "",
  validation = null,
} = {}) {
  if (!segmentation || validation?.valid !== true) {
    return {
      resolvedQuery: rawMessage,
      commercialSearchQuery: null,
      applied: false,
    };
  }

  const commercialSearchQuery =
    segmentation.commercialDimension?.commercialSearchQuery || null;

  return {
    resolvedQuery: commercialSearchQuery || rawMessage,
    commercialSearchQuery,
    applied: !!commercialSearchQuery,
    humanObjective: segmentation.humanDimension?.objective || null,
    commercialObjective: segmentation.commercialDimension?.objective || null,
    conversationObjective: segmentation.conversationalDimension?.preserveCommerceContext
      ? "preserve_context"
      : null,
  };
}

export function mixedSegmentationToTrace(segmentation = null, validation = null) {
  if (!segmentation) return null;
  return {
    version: segmentation.version,
    segmentCount: segmentation.segmentCount,
    humanObjective: segmentation.humanDimension?.objective,
    commercialObjective: segmentation.commercialDimension?.objective,
    commercialSearchQuery: segmentation.commercialDimension?.commercialSearchQuery,
    commercialCategory: segmentation.commercialDimension?.commercialCategory,
    comparisonTerms: segmentation.commercialDimension?.comparisonTerms,
    humanSegments: segmentation.humanDimension?.segments,
    commercialSegments: segmentation.commercialDimension?.segments,
    validation: validation || null,
  };
}
