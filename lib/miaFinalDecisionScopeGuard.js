/**
 * PATCH 8.4D — Final Decision Scope Guard
 *
 * FINAL_DECISION_REFOCUS + ATTRIBUTE_FOLLOWUP_WITH_ACTIVE_DECISION:
 * follow-ups tardios permanecem no escopo do winner/discussion set/change history.
 */

import { namesLikelyMatch } from "./miaDecisionConsistencyFixes.js";
import { hasRecentDecisionChange, inferDecisionChangeFromSession } from "./miaPostChangeRecoveryLayer.js";

function enrichScopeProductsFromCatalog(scopeProducts = [], catalogProducts = []) {
  const catalog = Array.isArray(catalogProducts) ? catalogProducts : [];
  return (Array.isArray(scopeProducts) ? scopeProducts : []).map((item) => {
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
      source: match.source || item.source || "decision_scope",
    };
  });
}

function normalizeScopeText(message = "") {
  return String(message || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeNameKey(name = "") {
  return normalizeScopeText(name);
}

const ATTRIBUTE_PATTERN =
  /\b(bateria|autonomia|camera|foto|desempenho|performance|tela|display|armazenamento|memoria|durabilidade|longevidade|custo.beneficio|custo beneficio|preco|valor|uso pesado|jogos|jogar)\b/;

function axisLabel(axis = "") {
  const map = {
    battery: "bateria",
    camera: "câmera",
    performance: "desempenho",
    value: "custo-benefício",
    premium: "maior investimento",
    longevity: "longevidade",
    screen: "tela",
    storage: "armazenamento",
    balance: "equilíbrio geral",
  };
  const key = String(axis || "").toLowerCase().trim();
  return map[key] || key || "equilíbrio geral";
}

function extractQueriedAttribute(message = "") {
  const q = normalizeScopeText(message);
  if (/\b(bateria|autonomia)\b/.test(q)) return "battery";
  if (/\b(camera|foto)\b/.test(q)) return "camera";
  if (/\b(desempenho|performance|uso pesado|jogos|jogar)\b/.test(q)) return "performance";
  if (/\b(custo.beneficio|custo beneficio|valor|preco)\b/.test(q)) return "value";
  if (/\b(tela|display)\b/.test(q)) return "screen";
  if (/\b(armazenamento|memoria)\b/.test(q)) return "storage";
  if (/\b(durabilidade|longevidade)\b/.test(q)) return "longevity";
  return null;
}

function hasScopeCommercialReopen(q = "") {
  if (!q) return false;
  if (
    /\b(procura|procurar|busca|buscar|pesquisa|pesquisar|mostra|ver)\s+(outr[oa]s?|opcoes|modelos)\b/.test(q)
  ) {
    return true;
  }
  if (/\b(quero|preciso)\s+(ver|outr[oa]s?)\b/.test(q) && /\b(opcoes|modelos|produtos)\b/.test(q)) {
    return true;
  }
  if (/\b(comeca|comecar|recomeca|nova busca|do zero)\b/.test(q)) return true;
  if (/\b(quero|preciso)\s+(um|uma)\s+(celular|notebook|smartphone|tv|monitor)\b/.test(q)) {
    return true;
  }
  return false;
}

/**
 * Contexto decisório ativo — winner + discussion set ou histórico de troca.
 */
export function hasActiveFinalDecisionScope(sessionContext = {}) {
  const anchorName = sessionContext?.lastBestProduct?.product_name || "";
  if (!anchorName) return false;

  const lockedDiscussion =
    !!sessionContext?.comparisonContextLocked ||
    (Array.isArray(sessionContext?.lastComparisonProducts) &&
      sessionContext.lastComparisonProducts.length >= 2);

  if (lockedDiscussion) return true;
  if (hasRecentDecisionChange(sessionContext)) return true;

  return (
    sessionContext?.lastInteractionType === "explicit_recommendation_change" ||
    sessionContext?.lastInteractionType === "post_change_recovery" ||
    sessionContext?.lastIntent === "decision_context_change"
  );
}

export function detectsFinalDecisionRefocusQuery(
  message = "",
  { hasActiveAnchor = false } = {}
) {
  if (!hasActiveAnchor) return false;
  const q = normalizeScopeText(message);
  if (!q || hasScopeCommercialReopen(q)) return false;

  return (
    /\b(entao )?qual (e|eu) (afinal|mesmo|a escolha final)\b/.test(q) ||
    /\bqual (eu compro|comprar|pegar|seria|fica)\b/.test(q) ||
    /\bqual e sua (escolha|recomendacao) final\b/.test(q) ||
    /\b(resumindo|resumo).*(qual|compro|pegar|vai de)\b/.test(q) ||
    /\b(mantem|mantém|continua (sendo|valendo|esse))\b/.test(q) ||
    /\bainda (e esse|vale|compensa|valendo)\b/.test(q) ||
    /\bbeleza,? entao vai de qual\b/.test(q) ||
    /\bqual voce recomenda afinal\b/.test(q) ||
    /^entao qual\b/.test(q)
  );
}

export function detectsScopedAttributeFollowUpQuery(
  message = "",
  { hasActiveAnchor = false } = {}
) {
  if (!hasActiveAnchor) return false;
  const q = normalizeScopeText(message);
  if (!q || hasScopeCommercialReopen(q)) return false;

  const words = q.split(/\s+/).filter(Boolean);
  if (words.length > 8) return false;

  const shortAttribute =
    (/^(e\s+)?(a|o|sobre)\s+/.test(q) || /^e no\s+/.test(q)) &&
    ATTRIBUTE_PATTERN.test(q);

  const axisOnly = words.length <= 4 && ATTRIBUTE_PATTERN.test(q);

  return shortAttribute || axisOnly;
}

export function detectsFinalDecisionScopeQuery(
  message = "",
  { hasActiveAnchor = false, sessionContext = null } = {}
) {
  if (!hasActiveAnchor || !hasActiveFinalDecisionScope(sessionContext || {})) {
    return false;
  }

  return (
    detectsFinalDecisionRefocusQuery(message, { hasActiveAnchor }) ||
    detectsScopedAttributeFollowUpQuery(message, { hasActiveAnchor })
  );
}

/**
 * Produtos relevantes à decisão atual — nunca catálogo completo.
 */
export function resolveFinalDecisionScopeProducts(
  sessionContext = {},
  catalogProducts = []
) {
  const catalog = Array.isArray(catalogProducts) ? catalogProducts.filter(Boolean) : [];
  const seen = new Set();
  const ordered = [];

  const add = (product) => {
    const name = product?.product_name || "";
    if (!name) return;
    const key = normalizeNameKey(name);
    if (seen.has(key)) return;
    seen.add(key);
    ordered.push({ ...product });
  };

  add(sessionContext?.lastBestProduct);

  const change = inferDecisionChangeFromSession(sessionContext);
  if (change?.previousWinner) add(change.previousWinner);
  if (change?.newWinner) add(change.newWinner);

  for (const product of sessionContext?.lastComparisonProducts || []) {
    add(product);
  }

  if (ordered.length < 2 && Array.isArray(sessionContext?.lastRankingSnapshot)) {
    for (const entry of sessionContext.lastRankingSnapshot.slice(0, 3)) {
      add({
        product_name: entry?.product_name,
        price: entry?.price,
        link: entry?.link,
        thumbnail: entry?.thumbnail,
        source: entry?.source,
      });
      if (ordered.length >= 3) break;
    }
  }

  const enriched = enrichScopeProductsFromCatalog(
    ordered.filter((p) => p?.product_name),
    catalog
  );

  return enriched.length ? enriched : ordered.filter((p) => p?.product_name);
}

export function buildFinalDecisionRefocusReply({
  sessionContext = {},
  query = "",
} = {}) {
  const current = sessionContext?.lastBestProduct;
  const currentName = String(current?.product_name || "").trim();
  if (!currentName) {
    return "Com o contexto atual, preciso de um produto de referência para fechar a recomendação final.";
  }

  const change = inferDecisionChangeFromSession(sessionContext);
  const parts = [];

  if (change?.winnerChanged && change.previousWinner?.product_name) {
    const prevName = change.previousWinner.product_name;
    const prevLabel = change.previousLabel || axisLabel(change.previousCriterion || "");
    const newLabel = change.newLabel || axisLabel(change.newCriterion || "");
    parts.push(`Com o critério atual, minha recomendação final é ${currentName}.`);
    parts.push(
      `A troca aconteceu porque sua prioridade mudou de ${prevLabel} para ${newLabel}.`
    );
    parts.push(
      `Antes eu priorizava ${prevName}; agora, com o critério novo, continuo em ${currentName}.`
    );
  } else {
    parts.push(`Com o contexto atual, minha recomendação final é ${currentName}.`);
    const criterion = axisLabel(
      sessionContext?.lastPriority || sessionContext?.lastAxis || ""
    );
    if (criterion && criterion !== "equilíbrio geral") {
      parts.push(`Esse veredito segue o critério dominante agora: ${criterion}.`);
    }
    if (sessionContext?.lastDecisionReason) {
      parts.push(sessionContext.lastDecisionReason);
    }
  }

  parts.push(`Então, afinal, eu ficaria com ${currentName}.`);
  return parts.join(" ");
}

export function buildScopedAttributeFollowUpReply({
  sessionContext = {},
  query = "",
} = {}) {
  const current = sessionContext?.lastBestProduct;
  const currentName = String(current?.product_name || "").trim();
  if (!currentName) {
    return "Posso explicar o atributo, mas preciso saber qual produto de referência está em jogo.";
  }

  const attribute = extractQueriedAttribute(query);
  const attributeLabel = attribute ? axisLabel(attribute) : "esse ponto";

  const parts = [`Falando do ${currentName}, sobre ${attributeLabel}:`];

  if (sessionContext?.lastMainConsequence) {
    parts.push(
      `${currentName} continua coerente aqui porque ${sessionContext.lastMainConsequence}`
    );
  } else if (sessionContext?.lastDecisionReason) {
    parts.push(sessionContext.lastDecisionReason);
  } else {
    parts.push(
      `${currentName} segue como referência principal para esse eixo no contexto atual.`
    );
  }

  const comparisonLocked =
    !!sessionContext?.comparisonContextLocked &&
    (Array.isArray(sessionContext?.lastComparisonProducts) &&
      sessionContext.lastComparisonProducts.length >= 2);

  if (comparisonLocked) {
    const discussionOthers = (sessionContext.lastComparisonProducts || []).filter(
      (p) =>
        p?.product_name && !namesLikelyMatch(p.product_name, currentName)
    );
    if (discussionOthers.length === 1) {
      parts.push(
        `${discussionOthers[0].product_name} entrou só para comparar com a referência atual — não substitui a recomendação.`
      );
    } else if (discussionOthers.length > 1) {
      parts.push(
        `As outras opções no par (${discussionOthers.map((p) => p.product_name).join(", ")}) servem só para comparar.`
      );
    }
  }

  parts.push(`Minha recomendação final continua sendo ${currentName}.`);
  return parts.join(" ");
}

export function buildFinalDecisionScopeReply({
  sessionContext = {},
  query = "",
} = {}) {
  if (detectsFinalDecisionRefocusQuery(query, { hasActiveAnchor: true })) {
    return buildFinalDecisionRefocusReply({ sessionContext, query });
  }
  return buildScopedAttributeFollowUpReply({ sessionContext, query });
}
