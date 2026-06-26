/**
 * PATCH 10.1A — Specific Product Resolution Lock
 *
 * Trava genérica: quando a query resolve fortemente para um produto do catálogo,
 * esse produto permanece anchor/card principal — ranking/fallback não substituem.
 */

import { detectAccessoryIntent } from "./commercial/accessoryIntentLockGuard.js";

export const SPECIFIC_PRODUCT_RESOLUTION_LOCK_VERSION = "10.1A.1";

const LOCK_THRESHOLD = 700;
const AMBIGUITY_GAP = 40;

const NUMERIC_TOKEN = /^(?:\d+[a-z]{0,3}|[a-z]\d{2,})$/i;

const BRAND_PREFIX_STOP = new Set([
  "samsung",
  "apple",
  "google",
  "motorola",
  "xiaomi",
  "redmi",
  "lg",
  "sony",
  "asus",
  "lenovo",
  "dell",
  "hp",
  "multilaser",
  "positivo",
  "realme",
  "poco",
  "infinix",
]);

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeQuery(value = "") {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,;:]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeProductKey(value = "") {
  return normalizeQuery(value)
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAliases(raw = "") {
  if (Array.isArray(raw)) {
    return raw.map((entry) => cleanText(entry)).filter(Boolean);
  }
  const text = cleanText(raw);
  if (!text) return [];
  if (text.startsWith("[") && text.endsWith("]")) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.map((entry) => cleanText(entry)).filter(Boolean);
      }
    } catch {
      return [];
    }
  }
  return text.split(/[;,|]/).map((entry) => cleanText(entry)).filter(Boolean);
}

function getCoreFamilyTokens(familyKey = "") {
  const tokens = normalizeProductKey(familyKey).split(" ").filter(Boolean);
  if (!tokens.length) return [];

  let start = 0;
  if (tokens[0] && BRAND_PREFIX_STOP.has(tokens[0])) {
    start = 1;
  }

  const core = tokens.slice(start);
  return core.length ? core : tokens;
}

function productIdentityKey(product = {}) {
  const specs = product.trustedSpecs || {};
  return normalizeProductKey(
    specs.official_name ||
      specs.product_name ||
      product.product_name ||
      product.normalizedName ||
      ""
  );
}

/**
 * Buscas genéricas não devem travar produto específico.
 */
export function isGenericProductSearchQuery(query = "") {
  const q = normalizeQuery(query);
  if (!q) return true;

  const genericIntent =
    /\b(ate|ate|abaixo de|menos de|barato|barata|bom|boa|melhor|melhores|custo beneficio|custo-beneficio|recomend|indica|qual comprar|vale a pena|economico|econômico)\b/.test(
      q
    );

  const hasModelSignal =
    /\b[a-z]{1,6}\s*\d{1,3}[a-z]{0,4}\b/i.test(q) ||
    /\b\d{1,3}\s*(pro|plus|ultra|fe|max|lite)\b/i.test(q) ||
    /\b(iphone|pixel|galaxy|moto|redmi|poco|xbox|ps5|macbook|ipad)\s+[\w\d]/i.test(q);

  if (genericIntent && !hasModelSignal) return true;

  if (
    /^(samsung|apple|iphone|xiaomi|motorola|lg|google)\s+(bom|boa|barato|barata|melhor)\b/i.test(
      q
    )
  ) {
    return true;
  }

  if (
    /^(celular|smartphone|notebook|tv|monitor|geladeira|mouse|teclado)\b/i.test(q) &&
    genericIntent
  ) {
    return true;
  }

  return false;
}

/**
 * Match forte usando metadados do produto — sem token solto tipo "15".
 */
export function scoreStrongSpecificProductMatch(product = {}, query = "") {
  const q = normalizeProductKey(query);
  if (!q) return { score: 0, source: null };

  const specs = product.trustedSpecs || {};
  const officialName = cleanText(specs.official_name || product.product_name || "");
  const officialKey = normalizeProductKey(officialName);
  const familyKey = normalizeProductKey(
    product.familyKey || specs.model_family || officialKey
  );
  const aliases = parseAliases(specs.aliases);

  if (officialKey && officialKey === q) {
    return { score: 1000, source: "official_exact" };
  }

  for (const alias of aliases) {
    const aliasKey = normalizeProductKey(alias);
    if (aliasKey && aliasKey === q) {
      return { score: 980, source: "alias_exact" };
    }
  }

  const coreTokens = getCoreFamilyTokens(familyKey);
  if (coreTokens.length >= 2 && coreTokens.every((token) => q.includes(token))) {
    const hasNonNumeric = coreTokens.some((token) => !NUMERIC_TOKEN.test(token));
    if (hasNonNumeric) {
      return { score: 900, source: "family_core_tokens" };
    }
  }

  const compactFamily = familyKey.replace(/\s+/g, "");
  const compactQuery = q.replace(/\s+/g, "");
  if (compactFamily.length >= 5 && compactQuery.includes(compactFamily)) {
    return { score: 880, source: "family_compact" };
  }
  if (compactQuery.length >= 5 && compactFamily.includes(compactQuery)) {
    return { score: 860, source: "query_in_family" };
  }

  if (officialKey.length >= 8 && (q.includes(officialKey) || officialKey.includes(q))) {
    const officialTokens = officialKey
      .split(" ")
      .filter((token) => token.length >= 2 && !NUMERIC_TOKEN.test(token));
    const matched = officialTokens.filter((token) => q.includes(token)).length;
    if (officialTokens.length >= 2 && matched >= officialTokens.length - 1) {
      return { score: 750, source: "official_partial" };
    }
  }

  const searchText = normalizeProductKey(
    [
      specs.search_text,
      specs.detail_id,
      specs.brand,
      specs.model,
      ...aliases,
    ]
      .filter(Boolean)
      .join(" ")
  );
  if (searchText.length >= 6 && searchText.includes(q) && q.length >= 5) {
    return { score: 720, source: "search_text" };
  }

  const detailId = normalizeProductKey(specs.detail_id || "");
  if (detailId.length >= 5 && (detailId === q || q.includes(detailId))) {
    return { score: 710, source: "detail_id" };
  }

  return { score: 0, source: null };
}

function buildAccessoryIntentBlockedLock(query = "", accessoryIntent = null) {
  return {
    active: false,
    version: SPECIFIC_PRODUCT_RESOLUTION_LOCK_VERSION,
    query,
    lockedProduct: null,
    matchSource: null,
    matchScore: 0,
    reason: "accessory_intent_guard",
    accessoryIntent: accessoryIntent || detectAccessoryIntent(query),
  };
}

/**
 * @param {{ query?: string, products?: Array<Record<string, unknown>> }} input
 */
export function resolveSpecificProductLock(input = {}) {
  const query = cleanText(input.query || "");
  const products = Array.isArray(input.products) ? input.products : [];

  const accessoryIntent = detectAccessoryIntent(query);
  if (accessoryIntent.isAccessoryIntent) {
    return buildAccessoryIntentBlockedLock(query, accessoryIntent);
  }

  if (!query || !products.length || isGenericProductSearchQuery(query)) {
    return {
      active: false,
      version: SPECIFIC_PRODUCT_RESOLUTION_LOCK_VERSION,
      query,
      lockedProduct: null,
      matchSource: null,
      matchScore: 0,
      reason: !query ? "empty_query" : !products.length ? "no_products" : "generic_query",
    };
  }

  const ranked = products
    .map((product) => {
      const scored = scoreStrongSpecificProductMatch(product, query);
      return {
        product,
        score: scored.score,
        source: scored.source,
      };
    })
    .filter((entry) => entry.score >= LOCK_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) {
    return {
      active: false,
      version: SPECIFIC_PRODUCT_RESOLUTION_LOCK_VERSION,
      query,
      lockedProduct: null,
      matchSource: null,
      matchScore: 0,
      reason: "no_strong_match",
    };
  }

  const best = ranked[0];
  const second = ranked[1];
  if (
    second &&
    best.score - second.score < AMBIGUITY_GAP &&
    best.score < 950
  ) {
    return {
      active: false,
      version: SPECIFIC_PRODUCT_RESOLUTION_LOCK_VERSION,
      query,
      lockedProduct: null,
      matchSource: null,
      matchScore: best.score,
      reason: "ambiguous_match",
    };
  }

  return {
    active: true,
    version: SPECIFIC_PRODUCT_RESOLUTION_LOCK_VERSION,
    query,
    lockedProduct: best.product,
    matchSource: best.source,
    matchScore: best.score,
    reason: null,
  };
}

function mergeLockedProductWithCandidates(lockedProduct = {}, products = []) {
  const lockedKey = productIdentityKey(lockedProduct);
  const enriched =
    products.find((product) => productIdentityKey(product) === lockedKey) ||
    lockedProduct;

  return {
    ...lockedProduct,
    ...enriched,
    product_name:
      cleanText(
        lockedProduct.product_name ||
          enriched.product_name ||
          lockedProduct.trustedSpecs?.official_name ||
          ""
      ) || enriched.product_name,
    trustedSpecs: enriched.trustedSpecs || lockedProduct.trustedSpecs || null,
    isDataLayerProduct:
      enriched.isDataLayerProduct ?? lockedProduct.isDataLayerProduct ?? false,
    specificProductLocked: true,
  };
}

function buildQueryAnchoredProduct(officialName = "", query = "") {
  const name = cleanText(officialName);
  const familyKey = normalizeProductKey(name).split(" ").slice(0, 5).join(" ").trim();
  return {
    product_name: name,
    price: null,
    link: null,
    thumbnail: null,
    source: "query_product_anchor",
    provider: "query_product_anchor",
    category: "",
    familyKey,
    normalizedName: normalizeProductKey(name),
    trustedSpecs: {
      official_name: name,
      category: "",
    },
    isDataLayerProduct: false,
    specificProductQueryAnchor: true,
  };
}

/**
 * Bootstrap da trava quando ranking/SERP trocam o produto citado.
 * @param {{
 *   query?: string,
 *   products?: Array<Record<string, unknown>>,
 *   resolveIdentity?: (query: string) => { officialName?: string }|null,
 * }} input
 */
export function bootstrapSpecificProductLock(input = {}) {
  const query = cleanText(input.query || "");
  const products = Array.isArray(input.products) ? input.products : [];

  const accessoryIntent = detectAccessoryIntent(query);
  if (accessoryIntent.isAccessoryIntent) {
    return buildAccessoryIntentBlockedLock(query, accessoryIntent);
  }

  const baseLock = resolveSpecificProductLock({ query, products });
  if (baseLock.active) return baseLock;
  if (!query || isGenericProductSearchQuery(query)) return baseLock;

  const identity =
    typeof input.resolveIdentity === "function" ? input.resolveIdentity(query) : null;
  const anchorName = cleanText(identity?.officialName || "");
  if (!anchorName) return baseLock;

  const anchored = buildQueryAnchoredProduct(anchorName, query);
  const anchorScore = scoreStrongSpecificProductMatch(anchored, query);
  if (anchorScore.score < LOCK_THRESHOLD) return baseLock;

  const existing = products.find(
    (product) => scoreStrongSpecificProductMatch(product, query).score >= LOCK_THRESHOLD
  );
  if (existing) {
    return resolveSpecificProductLock({
      query,
      products: [existing, ...products.filter((product) => product !== existing)],
    });
  }

  const top = products[0];
  if (top && scoreStrongSpecificProductMatch(top, query).score >= LOCK_THRESHOLD) {
    return baseLock;
  }

  if (top && productIdentityKey(top) === productIdentityKey(anchored)) {
    return baseLock;
  }

  return {
    active: true,
    version: SPECIFIC_PRODUCT_RESOLUTION_LOCK_VERSION,
    query,
    lockedProduct: anchored,
    matchSource: "query_identity_anchor",
    matchScore: anchorScore.score,
    reason: null,
  };
}

/**
 * @param {Array<Record<string, unknown>>} products
 * @param {ReturnType<typeof resolveSpecificProductLock>} lock
 */
export function ensureLockedProductInCandidates(products = [], lock = {}) {
  if (!lock?.active || !lock.lockedProduct) return products;
  const applied = applySpecificProductLockToProducts(products, lock);
  return applied.products;
}

/**
 * @param {Array<Record<string, unknown>>} products
 * @param {ReturnType<typeof resolveSpecificProductLock>} lock
 */
export function applySpecificProductLockToProducts(products = [], lock = {}) {
  if (!lock?.active || !lock.lockedProduct) {
    return { products, changed: false };
  }

  const lockedKey = productIdentityKey(lock.lockedProduct);
  const mergedLocked = mergeLockedProductWithCandidates(lock.lockedProduct, products);
  const rest = products.filter((product) => productIdentityKey(product) !== lockedKey);

  return {
    products: [mergedLocked, ...rest],
    changed: true,
  };
}

/**
 * @param {{
 *   lock?: ReturnType<typeof resolveSpecificProductLock>,
 *   selectedBestProduct?: Record<string, unknown>|null,
 *   products?: Array<Record<string, unknown>>,
 * }} input
 */
export function enforceSpecificProductLockWinner(input = {}) {
  const lock = input.lock || {};
  const products = Array.isArray(input.products) ? input.products : [];
  let selectedBestProduct = input.selectedBestProduct || null;

  if (!lock.active || !lock.lockedProduct) {
    return {
      selectedBestProduct,
      preventedReplacement: false,
      beforeWinner: selectedBestProduct?.product_name || null,
      afterWinner: selectedBestProduct?.product_name || null,
    };
  }

  const beforeWinner = selectedBestProduct?.product_name || null;
  const lockedKey = productIdentityKey(lock.lockedProduct);
  const beforeKey = productIdentityKey(selectedBestProduct || {});

  if (beforeKey && beforeKey === lockedKey) {
    return {
      selectedBestProduct,
      preventedReplacement: false,
      beforeWinner,
      afterWinner: beforeWinner,
    };
  }

  const enforced = mergeLockedProductWithCandidates(lock.lockedProduct, products);
  return {
    selectedBestProduct: enforced,
    preventedReplacement: true,
    beforeWinner,
    afterWinner: enforced.product_name || null,
  };
}

export function logSpecificProductLockAudit(audit = {}) {
  console.log(
    "SPECIFIC_PRODUCT_LOCK_AUDIT",
    JSON.stringify({
      version: SPECIFIC_PRODUCT_RESOLUTION_LOCK_VERSION,
      active: !!audit.active,
      query: audit.query || "",
      lockedProduct:
        audit.lockedProduct ||
        audit.lockedProductName ||
        audit.lock?.lockedProduct?.product_name ||
        null,
      matchSource: audit.matchSource || audit.lock?.matchSource || null,
      matchScore: audit.matchScore ?? audit.lock?.matchScore ?? 0,
      beforeWinner: audit.beforeWinner || null,
      afterWinner: audit.afterWinner || null,
      preventedReplacement: !!audit.preventedReplacement,
      reason: audit.reason || audit.lock?.reason || null,
    })
  );
}
