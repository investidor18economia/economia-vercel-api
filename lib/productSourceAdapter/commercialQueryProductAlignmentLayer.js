/**
 * PATCH Comercial 4D-A — Commercial Query/Product Alignment Layer
 *
 * Mede compatibilidade entre query comercial e oferta.
 * Não altera winner cognitivo, ranking, Router ou Decision Engine.
 */

export const COMMERCIAL_QUERY_PRODUCT_ALIGNMENT_VERSION = "4D-A.1";
export const COMMERCIAL_ALIGNMENT_THRESHOLD = 70;

const CORE_STOPWORDS = Object.freeze([
  "para",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "com",
  "sem",
  "o",
  "a",
  "os",
  "as",
  "um",
  "uma",
  "uns",
  "umas",
  "e",
  "em",
  "no",
  "na",
  "por",
]);

const ACCESSORY_SIGNAL_RULES = Object.freeze([
  { token: "controle_remoto", pattern: /\bcontrole remoto\b/i },
  { token: "capa_protetora", pattern: /\bcapa protetora\b/i },
  { token: "capa", pattern: /\bcapa\b|\bcase\b/i },
  { token: "pelicula", pattern: /\bpel[ií]cula\b/i },
  { token: "suporte", pattern: /\bsuporte\b/i },
  { token: "carregador", pattern: /\bcarregador\b/i },
  { token: "cabo", pattern: /\bcabo\b/i },
  { token: "adaptador", pattern: /\badaptador\b/i },
  { token: "controle", pattern: /\bcontrole\b/i },
  { token: "almofada", pattern: /\balmofada\b/i },
  { token: "refil", pattern: /\brefil\b/i },
  { token: "peca", pattern: /\bpe[cç]a\b/i },
  { token: "reposicao", pattern: /\breposi[cç][aã]o\b/i },
  { token: "kit", pattern: /\bkit\b/i },
  { token: "bateria", pattern: /\bbateria\b/i },
  { token: "fonte", pattern: /\bfonte\b/i },
  { token: "dock", pattern: /\bdock\b/i },
  { token: "hub", pattern: /\bhub\b/i },
  { token: "mousepad", pattern: /\bmousepad\b/i },
  { token: "teclado", pattern: /\bteclado\b/i },
  { token: "fone", pattern: /\bfone\b|\bheadset\b/i },
  { token: "protetor", pattern: /\bprotetor\b/i },
  { token: "bolsa", pattern: /\bbolsa\b/i },
  { token: "estojo", pattern: /\bestojo\b/i },
]);

const REPLACEMENT_SIGNAL_RULES = Object.freeze([
  { token: "reposicao", pattern: /\breposi[cç][aã]o\b/i },
  { token: "peca", pattern: /\bpe[cç]a\b/i },
  { token: "refil", pattern: /\brefil\b/i },
]);

function stripAccents(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function normalizeCommercialCoreText(text = "") {
  let body = stripAccents(String(text || "").toLowerCase())
    .replace(/[^\p{L}\p{N}\s+]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const stopword of CORE_STOPWORDS) {
    body = body.replace(new RegExp(`\\b${stopword}\\b`, "g"), " ");
  }

  return body.replace(/\s+/g, " ").trim();
}

/**
 * @param {string} query
 */
export function extractCommercialQueryCore(query = "") {
  return normalizeCommercialCoreText(query);
}

/**
 * @param {string|{ title?: string }} offer
 */
export function extractCommercialOfferCore(offer = "") {
  const title = typeof offer === "string" ? offer : offer?.title || "";
  return normalizeCommercialCoreText(title);
}

function matchSignalRules(text = "", rules = ACCESSORY_SIGNAL_RULES) {
  const normalized = normalizeCommercialCoreText(text);
  const matched = [];

  for (const rule of rules) {
    if (rule.pattern.test(normalized)) {
      matched.push(rule.token);
    }
  }

  return [...new Set(matched)];
}

/**
 * @param {string} text
 */
export function detectCommercialAccessorySignals(text = "") {
  return matchSignalRules(text, ACCESSORY_SIGNAL_RULES);
}

/**
 * @param {string} text
 */
export function detectCommercialReplacementSignals(text = "") {
  return matchSignalRules(text, REPLACEMENT_SIGNAL_RULES);
}

/**
 * @param {string} query
 */
export function isAccessoryIntent(query = "") {
  return detectCommercialAccessorySignals(query).length > 0;
}

function tokenize(core = "") {
  return normalizeCommercialCoreText(core)
    .split(/\s+/)
    .filter((token) => token.length >= 2);
}

function sharedTermRatio(queryTokens = [], offerTokens = []) {
  if (!queryTokens.length || !offerTokens.length) return 0;
  const offerSet = new Set(offerTokens);
  const shared = queryTokens.filter((token) => offerSet.has(token)).length;
  return shared / queryTokens.length;
}

function resolveAlignmentConfidence({
  queryTokens = [],
  offerTokens = [],
  overlap = 0,
  queryIsAccessoryIntent = false,
  offerHasAccessorySignals = false,
}) {
  if (queryIsAccessoryIntent !== offerHasAccessorySignals) {
    const hasSharedToken = queryTokens.some((token) => offerTokens.includes(token));
    if (hasSharedToken && overlap >= 0.35) return "high";
    if (hasSharedToken || overlap >= 0.5) return "medium";
  }

  if (queryTokens.length < 2) return "low";

  if (queryIsAccessoryIntent !== offerHasAccessorySignals) {
    return overlap >= 0.35 ? "high" : "medium";
  }

  if (overlap >= 0.7) return "high";
  if (overlap >= 0.45) return "medium";
  return "low";
}

/**
 * @param {{
 *   queryCore?: string,
 *   offerCore?: string,
 *   querySignals?: string[],
 *   offerSignals?: string[],
 *   queryIsAccessoryIntent?: boolean,
 * }} input
 */
export function buildCommercialAlignmentScore(input = {}) {
  const queryCore = input.queryCore || "";
  const offerCore = input.offerCore || "";
  const querySignals = input.querySignals || [];
  const offerSignals = input.offerSignals || [];
  const queryIsAccessoryIntent = !!input.queryIsAccessoryIntent;

  const queryTokens = tokenize(queryCore);
  const offerTokens = tokenize(offerCore);
  const overlap = sharedTermRatio(queryTokens, offerTokens);

  let score = Math.round(overlap * 80);
  const reasons = [];

  if (overlap >= 0.75) reasons.push("strong_core_overlap");
  else if (overlap >= 0.45) reasons.push("partial_core_overlap");
  else reasons.push("weak_core_overlap");

  const offerHasAccessorySignals = offerSignals.length > 0;

  if (!queryIsAccessoryIntent && offerHasAccessorySignals) {
    score -= 55;
    reasons.push("accessory_offer_for_main_query");
  } else if (queryIsAccessoryIntent && !offerHasAccessorySignals) {
    score -= 50;
    reasons.push("main_offer_for_accessory_query");
  } else if (queryIsAccessoryIntent && offerHasAccessorySignals) {
    const sharedAccessory = querySignals.filter((signal) => offerSignals.includes(signal));
    if (sharedAccessory.length) {
      score += 15;
      reasons.push("accessory_query_accessory_offer");
    }
  }

  const offerReplacementSignals = detectCommercialReplacementSignals(offerCore);
  const queryReplacementSignals = detectCommercialReplacementSignals(queryCore);
  if (
    offerReplacementSignals.length &&
    !queryReplacementSignals.length &&
    !queryIsAccessoryIntent
  ) {
    score -= 25;
    reasons.push("replacement_offer_without_query_intent");
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    overlap,
    reasons,
  };
}

/**
 * @param {{ query?: string, offer?: { title?: string }|string }} input
 */
export function calculateCommercialAlignment(input = {}) {
  const query = String(input.query || "");
  const offer = input.offer || {};
  const queryCore = extractCommercialQueryCore(query);
  const offerCore = extractCommercialOfferCore(offer);
  const querySignals = detectCommercialAccessorySignals(query);
  const offerSignals = detectCommercialAccessorySignals(
    typeof offer === "string" ? offer : offer?.title || ""
  );
  const queryIsAccessoryIntent = querySignals.length > 0;
  const offerHasAccessorySignals = offerSignals.length > 0;

  const alignment = buildCommercialAlignmentScore({
    queryCore,
    offerCore,
    querySignals,
    offerSignals,
    queryIsAccessoryIntent,
  });

  const confidence = resolveAlignmentConfidence({
    queryTokens: tokenize(queryCore),
    offerTokens: tokenize(offerCore),
    overlap: alignment.overlap,
    queryIsAccessoryIntent,
    offerHasAccessorySignals,
  });

  const isAligned =
    confidence === "low" ? true : alignment.score >= COMMERCIAL_ALIGNMENT_THRESHOLD;

  return {
    alignmentScore: alignment.score,
    isAligned,
    alignmentReason:
      confidence === "low" && !isAligned
        ? "ambiguous_preserved"
        : alignment.reasons[alignment.reasons.length - 1] || "core_overlap",
    queryCore,
    offerCore,
    queryIsAccessoryIntent,
    offerHasAccessorySignals,
    confidence,
    overlap: alignment.overlap,
    queryAccessorySignals: querySignals,
    offerAccessorySignals: offerSignals,
  };
}

export function getCommercialAlignmentSelectionAdjustment(alignment = null) {
  if (!alignment) return 0;
  if (alignment.confidence === "low") return 0;
  if (alignment.isAligned) {
    return Math.min(8, Math.max(0, alignment.alignmentScore - COMMERCIAL_ALIGNMENT_THRESHOLD) * 0.2);
  }

  if (alignment.confidence === "high") return -65;
  if (alignment.confidence === "medium") return -20;
  return 0;
}

/**
 * @param {string} query
 * @param {Array<Record<string, unknown>>} offers
 */
export function alignCommercialOffersForQuery(query = "", offers = []) {
  const list = Array.isArray(offers) ? offers : [];

  return list.map((offer) => {
    const alignment = calculateCommercialAlignment({ query, offer });
    return {
      offer,
      alignment,
      selectionAdjustment: getCommercialAlignmentSelectionAdjustment(alignment),
    };
  });
}
