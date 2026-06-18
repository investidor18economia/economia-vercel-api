/**
 * PATCH 4.6 — Decision consistency fixes (minimal, no routing/ranking changes).
 */

export function namesLikelyMatch(a = "", b = "") {
  const ka = String(a || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const kb = String(b || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!ka || !kb) return false;
  return ka === kb || ka.includes(kb) || kb.includes(ka);
}

/**
 * Restringe lista ao conjunto permitido (discussion set ativo).
 */
export function scopeProductsToAllowedSet(products = [], allowedProducts = []) {
  const list = Array.isArray(products) ? products.filter(Boolean) : [];
  const allowed = Array.isArray(allowedProducts) ? allowedProducts.filter(Boolean) : [];
  if (allowed.length < 2) return list;

  const scoped = list.filter((p) =>
    allowed.some((a) => namesLikelyMatch(p?.product_name, a?.product_name))
  );

  for (const a of allowed) {
    if (!scoped.some((p) => namesLikelyMatch(p?.product_name, a?.product_name))) {
      scoped.push(a);
    }
  }

  return scoped.slice(0, allowed.length);
}

/**
 * Decision Engine must explain the anchored winner, not products[0] blindly.
 */
export function resolveDecisionEngineWinners(
  products = [],
  anchorProduct = null,
  { allowedProducts = null } = {}
) {
  let list = Array.isArray(products) ? products.filter(Boolean) : [];

  if (Array.isArray(allowedProducts) && allowedProducts.length >= 2) {
    list = scopeProductsToAllowedSet(list, allowedProducts);
  }

  if (!list.length) {
    return { best: null, second: null };
  }

  const anchorName =
    anchorProduct?.product_name || String(anchorProduct || "").trim();
  if (!anchorName) {
    return { best: list[0], second: list[1] || null };
  }

  const idx = list.findIndex((p) =>
    namesLikelyMatch(p?.product_name, anchorName)
  );

  if (idx >= 0) {
    const best = list[idx];
    const second =
      list.find(
        (p, i) =>
          i !== idx && !namesLikelyMatch(p?.product_name, anchorName)
      ) || null;
    return { best, second };
  }

  if (anchorProduct?.product_name) {
    return {
      best: anchorProduct,
      second: list[0] || null
    };
  }

  return { best: list[0], second: list[1] || null };
}

export function didPriorityFollowUpChangeWinner(anchorProduct = null, followUpProduct = null) {
  if (!anchorProduct?.product_name || !followUpProduct?.product_name) {
    return false;
  }
  return !namesLikelyMatch(
    anchorProduct.product_name,
    followUpProduct.product_name
  );
}

/**
 * Closing line for priority_followup_short — aligned with rerank vs hold.
 */
export function buildPriorityFollowUpClosingLine({
  productTitle = "",
  priorityLabel = "",
  winnerChanged = false
} = {}) {
  const title = String(productTitle || "").trim();
  const label = String(priorityLabel || "sua prioridade").trim();

  if (winnerChanged && title) {
    return `Resumo: pensando em ${label}, o ${title} passa a ser a referência mais coerente aqui, sem buscar outro modelo agora.`;
  }

  return `Resumo: eu manteria esse produto como referência, sem buscar outro agora.`;
}

/**
 * Replaces generic "uso leve/intermediário" guard copy with session-aware text.
 */
export function buildContextUnknownProductCorrectionReply(
  anchorProduct = null,
  sessionContext = {}
) {
  const title = String(anchorProduct?.product_name || "").trim();
  if (!title) {
    return "Consigo analisar melhor, mas preciso que você me diga qual produto quer avaliar.";
  }

  const priority = String(
    sessionContext.lastPriority || sessionContext.lastAxis || ""
  ).toLowerCase();
  const consequence = String(
    sessionContext.lastMainConsequence || ""
  ).toLowerCase();

  if (
    priority === "performance" ||
    /desempenho|performance|jogo|pesad|folga/.test(consequence)
  ) {
    return `Sobre o ${title}, mantendo o que já vimos: ele segue fazendo sentido para uso mais pesado, com folga no dia a dia. Para tarefas extremas, eu ainda teria cautela.`;
  }

  if (priority === "battery" || /bateria|autonomia|mah/.test(consequence)) {
    return `Sobre o ${title}, mantendo o foco em bateria do contexto: ele continua coerente como referência de autonomia entre as opções que apareceram.`;
  }

  if (priority === "camera" || /camera|câmera|foto|video|vídeo/.test(consequence)) {
    return `Sobre o ${title}, no eixo de câmera do contexto: ele continua alinhado com o que já estava em jogo na conversa.`;
  }

  if (
    priority === "value" ||
    /custo|beneficio|benefício|econom|vale a pena/.test(consequence)
  ) {
    return `Sobre o ${title}, no custo-benefício do contexto: ele continua sendo a referência mais coerente entre as opções que apareceram.`;
  }

  return `Sobre o ${title}, eu manteria ele como referência do que já analisamos, sem trocar de produto agora.`;
}
