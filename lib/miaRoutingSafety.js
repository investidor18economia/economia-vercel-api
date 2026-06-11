/**
 * PATCH 1 — Routing safety helpers (budget parse, anchor, new-search signals).
 * Pure functions — no ranking or decision logic.
 */

export function parseBudgetAmount(raw = "") {
  const token = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/r\$\s*/g, "")
    .replace(/\s+/g, "");

  if (!token) return NaN;

  // Brazilian thousands: 2.000, 3.500, 1.999
  if (/^\d{1,3}(\.\d{3})+$/.test(token)) {
    return parseInt(token.replace(/\./g, ""), 10);
  }

  // Thousands + optional decimal cents: 2.500,50
  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(token)) {
    const [whole, dec] = token.split(",");
    const wholeNum = parseInt(whole.replace(/\./g, ""), 10);
    return wholeNum + parseInt(dec, 10) / Math.pow(10, dec.length);
  }

  // Decimal comma: 1999,90
  if (/^\d+,\d{1,2}$/.test(token)) {
    return parseFloat(token.replace(",", "."));
  }

  // Plain integer
  if (/^\d+$/.test(token)) {
    return parseInt(token, 10);
  }

  // Decimal dot (not thousand groups): 2000.5
  if (/^\d+\.\d{1,2}$/.test(token) && !/^\d{1,3}\.\d{3}$/.test(token)) {
    return parseFloat(token);
  }

  const fallback = parseFloat(token.replace(",", "."));
  return Number.isNaN(fallback) ? NaN : fallback;
}

export function extractBudget(text = "") {
  const q = String(text || "").toLowerCase();

  const patterns = [
    /at[eé]\s*r?\$?\s*(\d+(?:[.,]\d+)*)\s*(mil)?/i,
    /abaixo\s*de\s*r?\$?\s*(\d+(?:[.,]\d+)*)\s*(mil)?/i,
    /menos\s*de\s*r?\$?\s*(\d+(?:[.,]\d+)*)\s*(mil)?/i,
    /no\s*m[aá]ximo\s*r?\$?\s*(\d+(?:[.,]\d+)*)\s*(mil)?/i,
    /por\s*at[eé]\s*r?\$?\s*(\d+(?:[.,]\d+)*)\s*(mil)?/i
  ];

  for (const pattern of patterns) {
    const match = q.match(pattern);
    if (!match) continue;

    let value = parseBudgetAmount(match[1]);
    if (Number.isNaN(value)) continue;
    if (match[2]) value *= 1000;
    return value;
  }

  return null;
}

const CATEGORY_SEARCH_PATTERN =
  /\b(celular|smartphone|iphone|android|notebook|laptop|tv|monitor|fone|headset|cadeira|pc gamer|computador|console|ps5|xbox|geladeira|fogao|fogão|microondas|air fryer|maquina de lavar|máquina de lavar)\b/;

const EXPLICIT_SEARCH_VERB_PATTERN =
  /\b(ate|até|por menos de|abaixo de|na faixa de|quero|procura|procurar|buscar|me mostra|me indique|indica|recomenda|recomende)\b/;

/**
 * Reuses the same signals already used in the chat handler (no new phrase lists).
 */
export function hasClearNewCommercialSearchIntent({
  query = "",
  resolvedQuery = "",
  explicitProductOnlyQuery = false,
  wantsNew = false,
  detectProductCategory = () => "",
  wantsNewProduct = () => false
} = {}) {
  const normalizedQuery = String(query || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  return !!(
    explicitProductOnlyQuery ||
    wantsNew ||
    wantsNewProduct(query) ||
    wantsNewProduct(resolvedQuery) ||
    detectProductCategory(query) ||
    detectProductCategory(resolvedQuery) ||
    extractBudget(query) ||
    extractBudget(resolvedQuery) ||
    CATEGORY_SEARCH_PATTERN.test(normalizedQuery) ||
    EXPLICIT_SEARCH_VERB_PATTERN.test(normalizedQuery)
  );
}

/**
 * When a session anchor exists, enriched resolvedQuery must not alone trigger new_search
 * (e.g. "loucura" → "celular até 2000 loucura"). Priority/axis follow-ups are not new searches.
 */
export function resolveClearNewCommercialSearchForRouting({
  query = "",
  resolvedQuery = "",
  hasAnchor = false,
  looksLikeShortPriorityFollowUp = false,
  looksLikeAmbiguousFollowUp = false,
  isExplicitComparison = false,
  explicitProductOnlyQuery = false,
  wantsNew = false,
  detectProductCategory = () => "",
  wantsNewProduct = () => false
} = {}) {
  if (isExplicitComparison) {
    return false;
  }

  if (looksLikeShortPriorityFollowUp && hasAnchor) {
    return false;
  }

  const onOriginal = (q) =>
    hasClearNewCommercialSearchIntent({
      query: q,
      resolvedQuery: q,
      explicitProductOnlyQuery: explicitProductOnlyQuery && q === query,
      wantsNew: wantsNewProduct(q),
      detectProductCategory,
      wantsNewProduct
    });

  if (hasAnchor) {
    return onOriginal(query);
  }

  return hasClearNewCommercialSearchIntent({
    query,
    resolvedQuery,
    explicitProductOnlyQuery,
    wantsNew,
    detectProductCategory,
    wantsNewProduct
  });
}

export function pickAuthoritativeLastBestProduct(
  sessionLastBest = null,
  rememberedProducts = []
) {
  if (sessionLastBest?.product_name) {
    return sessionLastBest;
  }

  const list = Array.isArray(rememberedProducts) ? rememberedProducts : [];
  return list.length ? list[list.length - 1] : null;
}

export function pickAuthoritativeLastProductMentioned(
  sessionLastBest = null,
  sessionMentioned = "",
  rememberedProducts = []
) {
  if (sessionLastBest?.product_name) {
    return sessionLastBest.product_name;
  }
  if (sessionMentioned) {
    return sessionMentioned;
  }
  const list = Array.isArray(rememberedProducts) ? rememberedProducts : [];
  return list[list.length - 1]?.product_name || "";
}
