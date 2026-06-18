/**
 * PATCH 8.3B — Discussion Set Enforcement
 *
 * Cria e preserva conjuntos de comparação ancorados (winner + produto citado)
 * sem abrir nova busca comercial nem hardcode de produtos/categorias.
 */

import { isAnchoredComparisonOrProductReference } from "./miaRoutingSafety.js";

const ANCHORED_COMPARISON_EXTRA_PATTERNS = [
  /\b(to|tô|estou)\s+entre\s+(esse|essa|este|esta|isso|ele|ela)\s+e\b/,
  /\b(esse|essa|este|esta|isso)\s+ou\b/,
  /\bou\s+(esse|essa|este|esta|isso)\b/,
  /\bou\s+(esse|essa|este|esta|isso)\b/,
  /\b(esse|essa|este|esta|isso)\s+contra\b/,
  /\bcontra\s+(esse|essa|este|esta|isso)\b/,
  /\bcompar(a|ar|ando)\s+(esse|essa|este|esta|isso)\s+com\b/,
  /\bcompar(a|ar|ando)\s+com\b/,
  /\b(esse|essa|este|esta|isso)\s+vale\s+mais\s+que\b/,
  /\bvale\s+mais\s+(esse|essa|este|esta|isso)\s+ou\b/,
  /\b(e\s+)?(esse|essa|este|esta|isso)\s+contra\b/,
  /\bpensando\s+(tambem|também)\s+no\b/,
  /\be\s+se\s+eu\s+pegar\b/,
  /\bpegaria\s+qual\b/,
  /\bpegava\s+qual\b/,
  /\bqual\s+compensa\s+mais\b.{0,40}\b(ou|e)\b/,
  /\b(entre\s+)?(ele|ela)\s+e\b/,
];

function normalizeDiscussionText(message = "") {
  return String(message || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function namesLikelyMatch(a = "", b = "") {
  const ka = normalizeDiscussionText(a);
  const kb = normalizeDiscussionText(b);
  if (!ka || !kb) return false;
  return ka === kb || ka.includes(kb) || kb.includes(ka);
}

/**
 * Intenção: comparar recomendação atual com outro produto específico.
 */
export function detectsAnchoredComparisonIntent(message = "", { hasActiveAnchor = false } = {}) {
  if (!hasActiveAnchor) return false;
  const text = normalizeDiscussionText(message);
  if (!text) return false;

  if (isAnchoredComparisonOrProductReference(message)) return true;

  return ANCHORED_COMPARISON_EXTRA_PATTERNS.some((pattern) => pattern.test(text));
}

function cleanCandidateName(raw = "") {
  return String(raw || "")
    .replace(/\b(o|a|os|as|um|uma|de|do|da|pra|para|entre|com|contra|ou|e)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extrai candidato textual citado pelo usuário (sem depender de catálogo real).
 */
export function extractMentionedProductCandidate(query = "", anchorName = "") {
  const text = normalizeDiscussionText(query);
  if (!text) return null;

  const patterns = [
    /\b(?:em duvida|indeciso|dividido|to entre|estou entre)\s+entre\s+(?:esse|essa|este|esta|isso|ele|ela)\s+e\s+(?:o|a)?\s*(.+)$/,
    /\bentre\s+(?:esse|essa|este|esta|isso|ele|ela)\s+e\s+(?:o|a)?\s*(.+)$/,
    /\b(?:esse|essa|este|esta|isso)\s+ou\s+(?:o|a)?\s*(.+)$/,
    /\bou\s+(?:o|a)?\s*(.+?)\s*(?:\?|$)/,
    /\b(?:esse|essa|este|esta|isso)\s+contra\s+(?:o|a)?\s*(.+)$/,
    /\bcontra\s+(?:o|a)?\s*(.+)$/,
    /\bcompar(?:a|ar|ando)\s+(?:esse|essa|este|esta|isso)\s+com\s+(?:o|a)?\s*(.+)$/,
    /\bcompar(?:a|ar|ando)\s+com\s+(?:o|a)?\s*(.+)$/,
    /\b(?:pensando|tambem|também)\s+(?:no|na)\s+(?:o|a)?\s*(.+)$/,
    /\be\s+se\s+eu\s+pegar\s+(?:o|a)?\s*(.+)$/,
    /\b(?:vale\s+mais|melhor)\s+(?:o|a)?\s*(.+?)\s+ou\s+(?:esse|essa|este|esta|isso)\b/,
    /\b(?:vale\s+mais|melhor)\s+(?:esse|essa|este|esta|isso)\s+ou\s+(?:o|a)?\s*(.+)$/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const candidate = cleanCandidateName(match?.[1] || "");
    if (candidate.length >= 3 && !namesLikelyMatch(candidate, anchorName)) {
      return candidate;
    }
  }

  const namedTail = text.match(
    /\b(?:o|a|um|uma)\s+([a-z][a-z0-9]*(?:\s+[a-z0-9]+){1,4})\s*$/
  );
  if (namedTail?.[1]) {
    const candidate = cleanCandidateName(namedTail[1]);
    if (candidate.length >= 3 && !namesLikelyMatch(candidate, anchorName)) {
      return candidate;
    }
  }

  return null;
}

function pickRememberedMatch(candidate = "", rememberedProducts = []) {
  const list = Array.isArray(rememberedProducts) ? rememberedProducts : [];
  return (
    list.find((p) => namesLikelyMatch(p?.product_name, candidate)) || null
  );
}

function serializeDiscussionProduct(product = {}, fallbackName = "") {
  const name = String(product?.product_name || fallbackName || "").trim();
  if (!name) return null;
  return {
    product_name: name,
    price: product?.price ?? null,
    link: product?.link ?? null,
    thumbnail: product?.thumbnail ?? null,
    source: product?.source || "discussion_set",
    category: product?.category || "",
  };
}

/**
 * Monta discussion set: anchor (winner) + produto citado (match ou candidato textual).
 */
export function buildAnchoredDiscussionSetProducts({
  anchorProduct = null,
  query = "",
  rememberedProducts = [],
} = {}) {
  const anchor = serializeDiscussionProduct(anchorProduct);
  if (!anchor?.product_name) return [];

  const candidateName = extractMentionedProductCandidate(query, anchor.product_name);
  if (!candidateName) return [anchor];

  const memoryMatch = pickRememberedMatch(candidateName, rememberedProducts);
  const compared = serializeDiscussionProduct(memoryMatch, candidateName);
  if (!compared?.product_name) return [anchor];

  if (namesLikelyMatch(anchor.product_name, compared.product_name)) {
    return [anchor];
  }

  return [anchor, compared];
}

/**
 * Persiste lastComparisonProducts + comparisonContextLocked na sessão.
 */
export function mergeDiscussionSetIntoSessionContext(
  sessionContext = {},
  {
    anchorProduct = null,
    query = "",
    rememberedProducts = [],
    preserveExisting = true,
  } = {}
) {
  const out = { ...(sessionContext || {}) };
  const built = buildAnchoredDiscussionSetProducts({
    anchorProduct: anchorProduct || out.lastBestProduct,
    query,
    rememberedProducts:
      rememberedProducts?.length > 0
        ? rememberedProducts
        : out.lastProducts || [],
  });

  if (built.length < 2) {
    if (
      preserveExisting &&
      Array.isArray(out.lastComparisonProducts) &&
      out.lastComparisonProducts.length >= 2
    ) {
      return out;
    }
    return out;
  }

  out.lastComparisonProducts = built;
  out.comparisonContextLocked = true;
  out.lastComparisonQuery = query || out.lastComparisonQuery || out.lastQuery || "";
  out.lastInteractionType = "comparison";
  out.lastIntent = "comparison";

  if (!out.lastProductMentioned && anchorProduct?.product_name) {
    out.lastProductMentioned = anchorProduct.product_name;
  }

  return out;
}

export function hasActiveDiscussionSet(sessionContext = {}) {
  const locked = Array.isArray(sessionContext?.lastComparisonProducts)
    ? sessionContext.lastComparisonProducts
    : [];
  return locked.length >= 2 || !!sessionContext?.comparisonContextLocked;
}
