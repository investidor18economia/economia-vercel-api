/**
 * PATCH 8.3C — Recommendation Stability Guard
 *
 * Quando discussion set ativo, decision engine e verbalização só podem
 * operar sobre allowedProducts = discussionSet (genérico, sem hardcode).
 */

import { namesLikelyMatch, scopeProductsToAllowedSet } from "./miaDecisionConsistencyFixes.js";
import {
  buildAnchoredDiscussionSetProducts,
  detectsAnchoredComparisonIntent,
  hasActiveDiscussionSet,
} from "./miaDiscussionSetEnforcement.js";
import {
  hasActiveFinalDecisionScope,
  resolveFinalDecisionScopeProducts,
} from "./miaFinalDecisionScopeGuard.js";

function normalizeProductLabel(name = "") {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Discussion set persistido ou prospectivo (turno de estabelecimento).
 */
export function resolveEffectiveDiscussionSet({
  sessionContext = {},
  query = "",
  anchorProduct = null,
  catalogProducts = [],
} = {}) {
  const locked = Array.isArray(sessionContext?.lastComparisonProducts)
    ? sessionContext.lastComparisonProducts.filter((p) => p?.product_name)
    : [];

  if (locked.length >= 2) {
    return locked;
  }

  const anchor = anchorProduct || sessionContext?.lastBestProduct;
  if (anchor?.product_name && detectsAnchoredComparisonIntent(query, { hasActiveAnchor: true })) {
    const built = buildAnchoredDiscussionSetProducts({
      anchorProduct: anchor,
      query,
      rememberedProducts: catalogProducts,
    });
    if (built.length >= 2) return built;
  }

  return [];
}

/**
 * Enriquece candidatos textuais com dados do catálogo quando há match.
 */
export function enrichDiscussionSetFromCatalog(discussionSet = [], catalogProducts = []) {
  const catalog = Array.isArray(catalogProducts) ? catalogProducts : [];
  const set = Array.isArray(discussionSet) ? discussionSet : [];

  return set.map((item) => {
    const match = catalog.find((c) =>
      namesLikelyMatch(c?.product_name, item?.product_name)
    );
    if (!match) return { ...item };
    return {
      ...match,
      ...item,
      product_name: match.product_name || item.product_name,
      price: match.price ?? item.price ?? null,
      link: match.link ?? item.link ?? null,
      thumbnail: match.thumbnail ?? item.thumbnail ?? null,
      source: match.source || item.source || "discussion_set",
    };
  });
}

/**
 * allowedProducts = discussionSet quando ativo; senão catálogo normal.
 */
export function resolveAllowedProductsForDecision({
  sessionContext = {},
  query = "",
  anchorProduct = null,
  catalogProducts = [],
} = {}) {
  const catalog = Array.isArray(catalogProducts) ? catalogProducts.filter(Boolean) : [];
  const discussionSet = resolveEffectiveDiscussionSet({
    sessionContext,
    query,
    anchorProduct,
    catalogProducts: catalog,
  });

  const discussionSetActive =
    discussionSet.length >= 2 ||
    hasActiveDiscussionSet(sessionContext) ||
    !!sessionContext?.comparisonContextLocked;

  if (!discussionSetActive || discussionSet.length < 2) {
    if (hasActiveFinalDecisionScope(sessionContext)) {
      const scoped = resolveFinalDecisionScopeProducts(sessionContext, catalog);
      if (scoped.length >= 1) {
        return {
          allowedProducts: scoped,
          discussionSetActive: scoped.length >= 2,
          discussionSet: scoped.length >= 2 ? scoped : [],
          finalDecisionScopeActive: true,
        };
      }
    }

    return {
      allowedProducts: catalog,
      discussionSetActive: false,
      discussionSet: [],
    };
  }

  const allowedProducts = enrichDiscussionSetFromCatalog(discussionSet, catalog);
  return {
    allowedProducts,
    discussionSetActive: true,
    discussionSet: allowedProducts,
  };
}

export { scopeProductsToAllowedSet } from "./miaDecisionConsistencyFixes.js";

export function filterRankingSnapshotToAllowedProducts(snapshot = [], allowedProducts = []) {
  if (!Array.isArray(snapshot) || snapshot.length === 0) return snapshot;
  const allowed = Array.isArray(allowedProducts) ? allowedProducts : [];
  if (allowed.length < 2) return snapshot;

  const filtered = snapshot.filter((item) =>
    allowed.some((p) => namesLikelyMatch(p?.product_name, item?.product_name))
  );

  return filtered.length > 0 ? filtered : snapshot;
}

export function formatAllowedProductsForPrompt(allowedProducts = [], anchorProduct = null) {
  const list = Array.isArray(allowedProducts) ? allowedProducts : [];
  if (!list.length) return "Nenhum produto estruturado no conjunto de discussão.";

  const anchorName = anchorProduct?.product_name || "";
  return list
    .map((p, index) => {
      const title = String(p.product_name || "").trim();
      const price = p.price ? ` | ${p.price}` : "";
      const isAnchor =
        anchorName && namesLikelyMatch(title, anchorName) ? " [recomendação atual]" : "";
      return `${index + 1}. ${title}${price}${isAnchor}`;
    })
    .join("\n");
}

const PRODUCT_MENTION_PATTERNS = [
  /\b(?:samsung|galaxy|iphone|motorola|moto|xiaomi|redmi|realme|oppo|vivo|asus|lenovo|dell|hp|acer|lg|sony|philips|logitech|razer|hyperx)\s+[a-z0-9][\w\s\-+]{2,40}/gi,
  /\bsmartphone\s+[a-z]+\s+\d+/gi,
  /\bnotebook\s+[a-z]+\s+\d+/gi,
  /\bmonitor\s+[a-z]+\s+\d+/gi,
];

function extractLikelyProductMentions(reply = "") {
  const text = String(reply || "");
  const mentions = new Set();

  for (const pattern of PRODUCT_MENTION_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = re.exec(text)) !== null) {
      const chunk = String(match[0] || "").trim();
      if (chunk.length >= 4) mentions.add(chunk);
    }
  }

  const numbered = text.match(/\d+\.\s+([^\n|]+)/g) || [];
  for (const line of numbered) {
    const name = line.replace(/^\d+\.\s+/, "").split("|")[0].trim();
    if (name.length >= 4) mentions.add(name);
  }

  return [...mentions];
}

export function replyMentionsProductOutsideAllowedSet(reply = "", allowedProducts = []) {
  const allowed = Array.isArray(allowedProducts) ? allowedProducts : [];
  if (!reply || allowed.length < 1) return [];

  const mentions = extractLikelyProductMentions(reply);
  return mentions.filter(
    (m) => !allowed.some((p) => namesLikelyMatch(p?.product_name, m))
  );
}

/**
 * Resposta determinística para estabelecer comparação sem vazar catálogo.
 */
export function buildDiscussionSetEstablishmentReply({
  allowedProducts = [],
  anchorProduct = null,
} = {}) {
  const list = Array.isArray(allowedProducts) ? allowedProducts.filter((p) => p?.product_name) : [];
  if (list.length < 2) return null;

  const anchor =
    list.find((p) => namesLikelyMatch(p.product_name, anchorProduct?.product_name)) ||
    list[0];
  const other = list.find((p) => !namesLikelyMatch(p.product_name, anchor?.product_name));

  if (!anchor?.product_name || !other?.product_name) return null;

  const anchorTitle = anchor.product_name;
  const otherTitle = other.product_name;
  const otherHasCatalogData = !!(other.price || other.link || other.trustedSpecs);

  if (!otherHasCatalogData) {
    return (
      `Sobre o ${anchorTitle}, ele segue como minha referência aqui. ` +
      `Você quer comparar com o ${otherTitle}. ` +
      `Ainda não tenho dados completos no catálogo sobre o ${otherTitle}; ` +
      `se você tiver preço ou o que mais pesa pra você nele, fecho a comparação entre esses dois com mais precisão.`
    );
  }

  return (
    `Sobre o ${anchorTitle}, ele continua como minha referência. ` +
    `Vamos comparar só esses dois: ${anchorTitle} e ${otherTitle}. ` +
    `Me diz o que pesa mais pra você entre eles (preço, desempenho, bateria, etc.) que eu fecho a leitura dentro desse par.`
  );
}

export function buildDiscussionSetScopedInstruction(allowedProducts = [], anchorProduct = null) {
  const names = (allowedProducts || [])
    .map((p) => p?.product_name)
    .filter(Boolean)
    .join('" e "');

  if (!names) return "";

  const anchorName = anchorProduct?.product_name || allowedProducts[0]?.product_name || "";
  return `
🔒 CONJUNTO DE DISCUSSÃO TRAVADO (PATCH 8.3C)
- Você SÓ pode mencionar, comparar ou recomendar estes produtos: "${names}".
- PROIBIDO citar qualquer outro produto do catálogo, busca anterior ou mercado.
- Recomendação atual (âncora): "${anchorName}".
- Se um produto do par não tiver dados completos, diga isso — NÃO substitua por outro modelo parecido.
- NÃO liste opções extras. NÃO abra nova busca.`;
}
