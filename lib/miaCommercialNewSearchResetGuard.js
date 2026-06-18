/**
 * PATCH Comercial 3C-B — Commercial New Search Reset Guard
 *
 * Impede reutilização indevida de oferta anterior em nova busca comercial.
 * Downstream do routing; não altera Router, ranking ou Decision Engine.
 */

export const COMMERCIAL_NEW_SEARCH_RESET_GUARD_VERSION = "3C-B.1";

const FOLLOW_UP_MARKERS = Object.freeze([
  /\bmais barato\b/,
  /\boutr[oa]\s+melhor\b/,
  /\boutr[oa]\s+op(?:c|ç)[aã]o\b/,
  /\bsegund[oa]\s+(?:op(?:c|ç)[aã]o|melhor|colocad[oa])\b/,
  /\bvale a pena\b/,
  /\be a bateria\b/,
  /\be a c[âa]mera\b/,
  /\be a tela\b/,
  /\bqual o ponto fraco\b/,
  /\bponto fraco\b/,
  /\bcompara com\b/,
  /\bcomparar com\b/,
  /\bme mostra (?:uma|outra)\b/,
  /\btem algo parecido\b/,
  /\bparecido com\b/,
  /\bmesmo perfil\b/,
  /\bcontinua valendo\b/,
  /\be esse\b/,
  /\be essa\b/,
  /\bdesse\b/,
  /\bdessa\b/,
  /\bop(?:c|ç)[aã]o com mais\b/,
  /\bcom mais bateria\b/,
  /\bcom mais mem[oó]ria\b/,
  /\bbackup\b/,
  /\bplano b\b/,
]);

const COMMERCIAL_CORE_PATTERNS = Object.freeze([
  { core: "notebook", category: "notebook", pattern: /\b(notebook|laptop|macbook|chromebook)\b/ },
  { core: "cadeira", category: "chair", pattern: /\b(cadeira|cadeiras)\b/ },
  { core: "monitor", category: "monitor", pattern: /\b(monitor|monitores)\b/ },
  { core: "tv", category: "tv", pattern: /\b(tv|televis[aã]o|smart tv)\b/ },
  { core: "iphone", category: "phone", pattern: /\b(iphone|apple iphone)\b/ },
  { core: "celular", category: "phone", pattern: /\b(celular|smartphone|galaxy|redmi|motorola|xiaomi)\b/ },
  { core: "fone", category: "audio", pattern: /\b(fone|headset|earbud|airpods)\b/ },
  { core: "mouse", category: "mouse", pattern: /\b(mouse|mouses)\b/ },
  { core: "teclado", category: "keyboard", pattern: /\b(teclado|teclados)\b/ },
  { core: "geladeira", category: "fridge", pattern: /\b(geladeira|frigerador|freezer)\b/ },
  { core: "console", category: "console", pattern: /\b(ps5|playstation|xbox|console)\b/ },
  { core: "notebook_trabalho", category: "notebook", pattern: /\b(notebook|laptop).*(trabalho|office)\b/ },
  { core: "tv_55", category: "tv", pattern: /\b(tv|smart tv).*(55|polegadas)\b/ },
]);

const OFFER_CATEGORY_PATTERNS = Object.freeze({
  notebook: /\b(notebook|laptop|macbook|chromebook|loq|ideapad|nitro|victus|pavilion)\b/i,
  chair: /\b(cadeira|chair|ergon[oô]mica|gamer)\b/i,
  monitor: /\b(monitor|ultragear|odyssey)\b/i,
  tv: /\b(tv|smart tv|televis[aã]o|uhd|4k)\b/i,
  phone: /\b(celular|smartphone|iphone|galaxy|redmi|motorola|moto)\b/i,
  audio: /\b(fone|headset|earbud|airpods|bluetooth)\b/i,
  mouse: /\b(mouse|logitech|rapoo)\b/i,
  keyboard: /\b(teclado|keyboard|keychron)\b/i,
  fridge: /\b(geladeira|frigerador|freezer|brastemp|electrolux)\b/i,
  console: /\b(ps5|playstation|xbox|series s|series x|console)\b/i,
});

function normalizeCommercialText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeCommercialText(value = "") {
  return normalizeCommercialText(value).split(" ").filter(Boolean);
}

function countWords(value = "") {
  return tokenizeCommercialText(value).length;
}

/**
 * @param {string} query
 * @returns {{ core: string|null, category: string|null, tokens: string[] }}
 */
export function detectCommercialQueryCore(query = "") {
  const normalized = normalizeCommercialText(query);
  const tokens = tokenizeCommercialText(query);

  if (!normalized) {
    return { core: null, category: null, tokens: [] };
  }

  for (const entry of COMMERCIAL_CORE_PATTERNS) {
    if (entry.pattern.test(normalized)) {
      return {
        core: entry.core,
        category: entry.category,
        tokens,
      };
    }
  }

  const genericProductMatch = normalized.match(
    /\b(geladeira|fogao|fogão|microondas|ar condicionado|purificador|tablet|ipad|ssd|hd|lava e seca|maquina de lavar|máquina de lavar)\b/
  );
  if (genericProductMatch) {
    const token = genericProductMatch[1].replace(/\s+/g, "_");
    return { core: token, category: token, tokens };
  }

  return { core: null, category: null, tokens };
}

export function isLikelyCommercialFollowUp(query = "") {
  const normalized = normalizeCommercialText(query);
  if (!normalized) return false;

  if (FOLLOW_UP_MARKERS.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  if (countWords(normalized) <= 4 && !detectCommercialQueryCore(query).core) {
    return true;
  }

  return false;
}

function detectOfferCategory(previousOffer = {}) {
  const chunks = [
    previousOffer.category,
    previousOffer.product_name,
    previousOffer.source,
  ]
    .map((entry) => normalizeCommercialText(entry))
    .filter(Boolean)
    .join(" ");

  for (const [category, pattern] of Object.entries(OFFER_CATEGORY_PATTERNS)) {
    if (pattern.test(chunks)) return category;
  }

  return detectCommercialQueryCore(previousOffer.product_name || "").category;
}

function isDirectCommercialSearchQuery(query = "") {
  const normalized = normalizeCommercialText(query);
  const wordCount = countWords(normalized);
  const core = detectCommercialQueryCore(query);

  if (!core.core) return false;
  if (wordCount <= 6) return true;
  if (/\b(para|pra|barato|barata|gamer|sem fio|bluetooth|frost free|polegadas)\b/.test(normalized)) {
    return true;
  }
  return false;
}

function referencesPreviousOffer(query = "", previousOffer = {}) {
  const normalized = normalizeCommercialText(query);
  const previousName = normalizeCommercialText(previousOffer?.product_name || "");
  if (!normalized || !previousName) return false;

  const previousTokens = tokenizeCommercialText(previousName).filter((token) => token.length > 3);
  if (previousTokens.length === 0) return false;

  const hits = previousTokens.filter((token) => normalized.includes(token));
  return hits.length >= Math.min(2, previousTokens.length);
}

/**
 * @param {string} query
 * @param {{ product_name?: string, category?: string }|null} previousOffer
 */
export function isLikelyNewCommercialSearch(query = "", previousOffer = null) {
  if (!previousOffer?.product_name) return false;
  if (isLikelyCommercialFollowUp(query)) return false;

  const currentCore = detectCommercialQueryCore(query);
  if (!currentCore.core) return false;

  const previousCore =
    detectCommercialQueryCore(previousOffer.product_name || "").core
      ? detectCommercialQueryCore(previousOffer.product_name || "")
      : {
          core: detectOfferCategory(previousOffer),
          category: detectOfferCategory(previousOffer),
          tokens: [],
        };

  if (
    currentCore.category &&
    previousCore.category &&
    currentCore.category !== previousCore.category
  ) {
    return true;
  }

  if (
    currentCore.core &&
    previousCore.core &&
    currentCore.core !== previousCore.core &&
    !referencesPreviousOffer(query, previousOffer)
  ) {
    return true;
  }

  return isDirectCommercialSearchQuery(query) && !!currentCore.core;
}

/**
 * @param {{
 *   currentQuery?: string,
 *   previousOffer?: { product_name?: string, category?: string }|null,
 *   previousQuery?: string,
 *   routingDecision?: { allowNewSearch?: boolean, allowReplaceWinner?: boolean }|null,
 * }} input
 */
export function shouldResetCommercialOfferContext(input = {}) {
  const currentQuery = String(input.currentQuery || "").trim();
  const previousOffer = input.previousOffer || null;
  const previousQuery = String(input.previousQuery || "").trim();
  const routingDecision = input.routingDecision || null;
  const forceLegitimateSearchReset = !!input.forceLegitimateSearchReset;

  if (forceLegitimateSearchReset && previousOffer?.product_name) {
    return {
      shouldReset: true,
      confidence: "high",
      reason: "legitimate_search_reset_guard",
      currentCore: detectCommercialQueryCore(currentQuery).core,
      previousCore: detectCommercialQueryCore(previousOffer.product_name || "").core,
    };
  }

  const currentCore = detectCommercialQueryCore(currentQuery);
  const previousCoreFromQuery = detectCommercialQueryCore(previousQuery);
  const previousCoreFromOffer = previousOffer?.product_name
    ? {
        ...detectCommercialQueryCore(previousOffer.product_name),
        category: detectOfferCategory(previousOffer),
      }
    : { core: null, category: null, tokens: [] };

  const previousCore =
    previousCoreFromQuery.core || previousCoreFromQuery.category
      ? previousCoreFromQuery
      : previousCoreFromOffer;

  if (!previousOffer?.product_name) {
    return {
      shouldReset: false,
      confidence: "low",
      reason: "no_previous_offer",
      currentCore: currentCore.core,
      previousCore: previousCore.core,
    };
  }

  if (isLikelyCommercialFollowUp(currentQuery)) {
    return {
      shouldReset: false,
      confidence: "high",
      reason: "commercial_follow_up_preserved",
      currentCore: currentCore.core,
      previousCore: previousCore.core,
    };
  }

  if (
    currentCore.category &&
    previousCore.category &&
    currentCore.category !== previousCore.category
  ) {
    return {
      shouldReset: true,
      confidence: "high",
      reason: "commercial_category_divergence",
      currentCore: currentCore.core,
      previousCore: previousCore.core,
    };
  }

  if (
    currentCore.core &&
    previousCore.core &&
    currentCore.core !== previousCore.core &&
    !referencesPreviousOffer(currentQuery, previousOffer)
  ) {
    return {
      shouldReset: true,
      confidence: "medium",
      reason: "commercial_core_divergence",
      currentCore: currentCore.core,
      previousCore: previousCore.core,
    };
  }

  if (
    isDirectCommercialSearchQuery(currentQuery) &&
    currentCore.core &&
    previousCore.core &&
    currentCore.core !== previousCore.core
  ) {
    return {
      shouldReset: true,
      confidence: "high",
      reason: "direct_new_commercial_search",
      currentCore: currentCore.core,
      previousCore: previousCore.core,
    };
  }

  if (routingDecision?.allowNewSearch && currentCore.core && previousCore.core) {
    if (currentCore.core !== previousCore.core) {
      return {
        shouldReset: true,
        confidence: "medium",
        reason: "routing_allow_new_search_with_new_core",
        currentCore: currentCore.core,
        previousCore: previousCore.core,
      };
    }
  }

  return {
    shouldReset: false,
    confidence: "low",
    reason: "preserve_previous_commercial_offer",
    currentCore: currentCore.core,
    previousCore: previousCore.core,
  };
}

export function commercialOfferMatchesQueryCore(offer = {}, query = "") {
  const category = detectCommercialQueryCore(query).category;
  if (!category) return true;

  const offerCategory = detectOfferCategory(offer);
  if (!offerCategory) return true;

  return offerCategory === category;
}

export function buildCommercialNoResultReply(query = "") {
  const core = detectCommercialQueryCore(query);
  const label = core.core ? ` para ${query.trim()}` : "";
  return (
    `Não encontrei uma oferta confiável${label} agora. ` +
    `Prefiro não reaproveitar a recomendação anterior até ter um resultado real para esta busca.`
  );
}

/**
 * @param {Array<Record<string, unknown>>} displayProducts
 * @param {string} currentQuery
 * @param {{ shouldReset?: boolean, currentCore?: string|null }} resetDecision
 */
export function pickCommercialPresentationProduct(
  displayProducts = [],
  currentQuery = "",
  resetDecision = { shouldReset: false }
) {
  const list = Array.isArray(displayProducts) ? displayProducts : [];
  if (list.length === 0) return null;

  const category = detectCommercialQueryCore(currentQuery).category;
  if (resetDecision.shouldReset && category) {
    const aligned = list.find((product) =>
      commercialOfferMatchesQueryCore(product, currentQuery)
    );
    return aligned || null;
  }

  return list[0] || null;
}

export function resolveCommercialPresentationWinner({
  displayProducts = [],
  currentQuery = "",
  previousOffer = null,
  resetDecision = null,
  pickWinnerUnderContract = null,
  routingDecision = {},
} = {}) {
  const decision =
    resetDecision ||
    shouldResetCommercialOfferContext({
      currentQuery,
      previousOffer,
      previousQuery: "",
      routingDecision,
    });

  if (decision.shouldReset) {
    return pickCommercialPresentationProduct(displayProducts, currentQuery, decision);
  }

  if (typeof pickWinnerUnderContract === "function") {
    return (
      pickWinnerUnderContract(
        displayProducts,
        previousOffer,
        routingDecision
      ) ||
      displayProducts[0] ||
      null
    );
  }

  return displayProducts[0] || null;
}

export function shouldReusePreviousCommercialExplanation({
  currentQuery = "",
  previousOffer = null,
  previousQuery = "",
  candidateProduct = null,
  resetDecision = null,
} = {}) {
  const decision =
    resetDecision ||
    shouldResetCommercialOfferContext({
      currentQuery,
      previousOffer,
      previousQuery,
    });

  if (decision.shouldReset) return false;
  if (!candidateProduct?.product_name || !previousOffer?.product_name) return true;

  return (
    normalizeCommercialText(candidateProduct.product_name) ===
    normalizeCommercialText(previousOffer.product_name)
  );
}
