/**
 * PATCH Comercial 4C-B — Commercial Deduplication & Variant Filtering
 *
 * Remove duplicatas e variantes incompatíveis de ofertas comerciais unificadas.
 * Não ranqueia, não seleciona winner e não altera Decision Engine.
 */

export const COMMERCIAL_DEDUPLICATION_LAYER_VERSION = "4C-B.1";

const TIER_MODIFIER_RULES = Object.freeze([
  { token: "pro", pattern: /\bpro\b/i },
  { token: "plus", pattern: /\bplus\b/i },
  { token: "ultra", pattern: /\bult(?:ra|a)\b/i },
  { token: "max", pattern: /\bmax\b/i },
  { token: "mini", pattern: /\bmini\b/i },
  { token: "fe", pattern: /\bfe\b/i },
  { token: "ti", pattern: /\bti\b/i },
  { token: "super", pattern: /\bsuper\b/i },
  { token: "oled", pattern: /\boled\b/i },
  { token: "qled", pattern: /\bqled\b/i },
  { token: "se", pattern: /\bse\b/i },
  { token: "lite", pattern: /\blite\b/i },
]);

const CONDITION_MODIFIER_RULES = Object.freeze([
  { token: "recondicionado", pattern: /\b(recondicionad[oa]s?|refurbished|renewed)\b/i },
  { token: "usado", pattern: /\b(usad[oa]s?|seminov[oa]s?|semi[\s-]?nov[oa]s?|used)\b/i },
  {
    token: "caixa_aberta",
    pattern: /\b(caixa aberta|open box|open-box|outlet)\b/i,
  },
]);

const CAPACITY_PATTERN = /\b(\d+(?:[.,]\d+)?\s*(?:gb|tb|g\b))\b/gi;

function stripAccents(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function collapseSpaces(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cloneOffer(offer = {}) {
  return {
    source: offer.source ?? "",
    title: offer.title ?? "",
    price: offer.price ?? null,
    image: offer.image ?? null,
    url: offer.url ?? "",
    ...(offer.brand != null ? { brand: offer.brand } : {}),
    ...(offer.seller != null ? { seller: offer.seller } : {}),
    ...(offer.category != null ? { category: offer.category } : {}),
    ...(offer.provider != null ? { provider: offer.provider } : {}),
    ...(offer.externalId != null ? { externalId: offer.externalId } : {}),
  };
}

/**
 * @param {string} title
 */
export function normalizeCommercialOfferTitle(title = "") {
  return collapseSpaces(
    stripAccents(String(title || "").toLowerCase())
      .replace(/[|/\\]+/g, " ")
      .replace(/[^\p{L}\p{N}\s+.-]/gu, " ")
      .replace(/\s*\+\s*/g, " ")
      .replace(/\s+/g, " ")
  );
}

function extractCapacities(normalizedTitle = "") {
  const capacities = [];
  const text = String(normalizedTitle || "");
  const matches = text.matchAll(CAPACITY_PATTERN);

  for (const match of matches) {
    const raw = collapseSpaces(match[1] || "").replace(/\s+/g, "");
    if (!raw) continue;
    const normalized = raw
      .replace(/,/g, ".")
      .replace(/(\d)g\b/i, "$1gb")
      .toLowerCase();
    if (!capacities.includes(normalized)) capacities.push(normalized);
  }

  return capacities.sort();
}

function extractTokens(normalizedTitle = "", rules = []) {
  const tokens = [];
  let working = String(normalizedTitle || "");

  for (const rule of rules) {
    if (rule.pattern.test(working)) {
      tokens.push(rule.token);
      working = working.replace(rule.pattern, " ");
    }
  }

  return {
    tokens: [...new Set(tokens)].sort(),
    remainder: collapseSpaces(working.replace(CAPACITY_PATTERN, " ")),
  };
}

/**
 * @param {string} title
 */
export function extractCommercialVariantSignals(title = "") {
  const normalizedTitle = normalizeCommercialOfferTitle(title);
  const capacities = extractCapacities(normalizedTitle);

  let working = normalizedTitle.replace(CAPACITY_PATTERN, " ");

  const conditions = extractTokens(working, CONDITION_MODIFIER_RULES);
  working = conditions.remainder;

  const tiers = extractTokens(working, TIER_MODIFIER_RULES);
  working = tiers.remainder;

  const baseSignature = collapseSpaces(
    working
      .replace(/\b(de|da|do|para|com|sem|novo|nova|original|lacrado|lacrada)\b/g, " ")
      .replace(/\s+/g, " ")
  );

  return {
    normalizedTitle,
    baseSignature,
    tiers: tiers.tokens,
    conditions: conditions.tokens,
    capacities,
  };
}

/**
 * @param {string} title
 */
export function buildCommercialOfferSignature(title = "") {
  const signals = extractCommercialVariantSignals(title);
  const signature = [
    signals.baseSignature,
    signals.tiers.join(","),
    signals.conditions.join(","),
    signals.capacities.join(","),
  ].join("|");

  return {
    ...signals,
    signature,
  };
}

function normalizeCommercialOfferUrl(url = "") {
  const raw = collapseSpaces(url);
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    return `${parsed.hostname}${parsed.pathname}`.toLowerCase().replace(/\/+$/, "");
  } catch {
    return raw.toLowerCase();
  }
}

function profileCommercialOffer(offer = {}) {
  const title = offer.title || "";
  const signatureData = buildCommercialOfferSignature(title);

  return {
    offer: cloneOffer(offer),
    title,
    ...signatureData,
    urlKey: normalizeCommercialOfferUrl(offer.url || ""),
    isPlainBase: signatureData.tiers.length === 0,
  };
}

/**
 * @param {ReturnType<typeof profileCommercialOffer>} left
 * @param {ReturnType<typeof profileCommercialOffer>} right
 */
export function isCommercialDuplicate(left, right) {
  if (!left || !right) return false;

  if (left.urlKey && right.urlKey && left.urlKey === right.urlKey) {
    return true;
  }

  if (left.signature && left.signature === right.signature) {
    return true;
  }

  if (
    left.baseSignature &&
    left.baseSignature === right.baseSignature &&
    left.tiers.join(",") === right.tiers.join(",") &&
    left.conditions.join(",") === right.conditions.join(",") &&
    left.capacities.join(",") === right.capacities.join(",")
  ) {
    return true;
  }

  return false;
}

/**
 * @param {ReturnType<typeof profileCommercialOffer>} left
 * @param {ReturnType<typeof profileCommercialOffer>} right
 */
export function isCompatibleCommercialVariant(left, right) {
  if (!left || !right) return true;
  if (isCommercialDuplicate(left, right)) return true;

  if (!left.baseSignature || left.baseSignature !== right.baseSignature) {
    return true;
  }

  const leftTiers = left.tiers.join(",");
  const rightTiers = right.tiers.join(",");

  if (leftTiers && rightTiers && leftTiers !== rightTiers) {
    return false;
  }

  if (leftTiers !== rightTiers) {
    return false;
  }

  return true;
}

function shouldFilterTierVariant(profile, plainBaseExistsForSignature) {
  if (!profile?.baseSignature) return false;
  if (!profile.tiers.length) return false;
  return plainBaseExistsForSignature.has(profile.baseSignature) === true;
}

/**
 * @param {Array<Record<string, unknown>>} offers
 */
export function deduplicateCommercialOfferBundle(offers = []) {
  const input = Array.isArray(offers) ? offers : [];
  const profiles = input.map((offer) => profileCommercialOffer(offer || {}));

  const plainBaseExistsForSignature = new Set(
    profiles
      .filter((profile) => profile.baseSignature && profile.tiers.length === 0)
      .map((profile) => profile.baseSignature)
  );

  const kept = [];
  const seenDuplicateKeys = new Set();
  let duplicatesRemoved = 0;
  let variantFiltered = 0;

  for (const profile of profiles) {
    if (shouldFilterTierVariant(profile, plainBaseExistsForSignature)) {
      variantFiltered += 1;
      continue;
    }

    const duplicateKey = profile.urlKey || profile.signature || profile.baseSignature;
    const alreadySeen = kept.some((existing) => isCommercialDuplicate(existing, profile));

    if (alreadySeen) {
      duplicatesRemoved += 1;
      if (duplicateKey) seenDuplicateKeys.add(duplicateKey);
      continue;
    }

    const incompatibleWithKept =
      profile.baseSignature &&
      plainBaseExistsForSignature.has(profile.baseSignature) &&
      kept.some(
        (existing) =>
          existing.baseSignature === profile.baseSignature &&
          !isCompatibleCommercialVariant(existing, profile)
      );

    if (incompatibleWithKept) {
      variantFiltered += 1;
      continue;
    }

    kept.push(profile);
    if (duplicateKey) seenDuplicateKeys.add(duplicateKey);
  }

  return {
    offers: kept.map((profile) => profile.offer),
    diagnostics: {
      beforeCount: input.length,
      afterCount: kept.length,
      duplicatesRemoved,
      variantFiltered,
      removedTotal: input.length - kept.length,
    },
  };
}

/**
 * @param {Array<Record<string, unknown>>} offers
 */
export function deduplicateCommercialOffers(offers = []) {
  return deduplicateCommercialOfferBundle(offers).offers;
}
