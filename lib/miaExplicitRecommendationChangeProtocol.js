/**
 * PATCH 8.3E — Explicit Recommendation Change Protocol
 *
 * Modela DECISION_CONTEXT_CHANGE: prioridades mudaram e a recomendação pode mudar
 * com explicação explícita — distinto de reavaliação comparativa ("qual é mais seguro?").
 */

import { namesLikelyMatch } from "./miaDecisionConsistencyFixes.js";
import { isConstraintChangeFamilyQuery } from "./miaCognitiveRouter.js";
import { isAnchoredSpendingAversion, extractBudget } from "./miaRoutingSafety.js";
import { resolveAllowedProductsForDecision } from "./miaRecommendationStabilityGuard.js";
import { buildRankingSnapshot } from "./miaRoutingGuardrails.js";

function normalizeChangeText(message = "") {
  return String(message || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePriceValue(price = "") {
  const digits = String(price || "").replace(/[^\d]/g, "");
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function hasCommercialReopen(q) {
  if (!q) return false;
  if (
    /\b(quero|preciso|busco|procurar|procura|me acha|me indica|me recomenda)\s+(um\s+)?(celular|smartphone|notebook|tv|monitor|mouse|teclado|cadeira|pc)\b/.test(
      q
    )
  ) {
    return true;
  }
  if (/\b(celular|notebook|smartphone)\s+(ate|até)\s+\d/.test(q)) return true;
  return false;
}

function isHypotheticalConstraintExploration(q) {
  return /^e se(\s+eu)?\b/.test(q) || /^e se for\b/.test(q);
}

function isComparativeReevaluationOnly(q) {
  return (
    /\bqual\b/.test(q) &&
    !/\b(minha prioridade|mudei de ideia|agora quero|agora priorizo|agora valorizo)\b/.test(q)
  );
}

function hasDeclarativeIntentVerb(q) {
  return (
    /\b(quero|preciso|agora quero|prefiro|posso|vou|acho que vou)\b/.test(q) &&
    !/\bnao quero\b/.test(q)
  );
}

function isDeclarativeBudgetDownShift(q) {
  return (
    /\bnao quero investir tanto\b/.test(q) ||
    /\bacho que vou gastar menos\b/.test(q) ||
    hasDeclarativeIntentVerb(q) &&
      /\b(gastar|pagar)\s+(o\s+)?minimo\b/.test(q) ||
    hasDeclarativeIntentVerb(q) &&
      /\b(gastar|pagar)\s+menos\b/.test(q) ||
    hasDeclarativeIntentVerb(q) &&
      /\b(economizar|economia)\b/.test(q) ||
    /\b(ta|esta)\s+pesad[oa]\s+no\s+bolso\b/.test(q) ||
    /\bquero algo mais barato\b/.test(q) ||
    /\bvou reduzir (o )?orcamento\b/.test(q) ||
    /\bqro gastar menos\b/.test(q) ||
    /\bvalorizo mais custo.beneficio\b/.test(q)
  );
}

function isDeclarativeBudgetUpShift(q) {
  return (
    hasDeclarativeIntentVerb(q) && /\b(gastar|pagar)\s+mais\b/.test(q) ||
    /\bvou aumentar (o )?orcamento\b/.test(q) ||
    /\bvou parcelar\b/.test(q) ||
    /\btenho mais (dinheiro|verba)\b/.test(q)
  );
}

const ATTR_TOKENS =
  /\b(bateria|autonomia|camera|desempenho|performance|longevidade|durabilidade|custo.beneficio|custo beneficio|conforto|silencio)\b/;

function isDeclarativeAttributePriorityShift(q) {
  return (
    /\b(agora|agora sim)\b.*\b(prioridade|priorizo|importa mais|pesa mais|foco|focar)\b/.test(q) &&
    ATTR_TOKENS.test(q)
  ) ||
    /\b(agora prioridade e|minha prioridade e|priorizo)\b/.test(q) && ATTR_TOKENS.test(q) ||
    /\bquero (mais )?(bateria|camera|desempenho|longevidade)\b/.test(q);
}

function isDeclarativePreferenceRecalibration(q) {
  return (
    /\b(mudei de ideia|agora estou pensando diferente|minha prioridade mudou|meu foco mudou|acho que exagerei no orcamento)\b/.test(
      q
    ) &&
    /\b(prioridade|foco|orcamento|gastar|economizar|criterio|decisao|pensando)\b/.test(q)
  );
}

function isDeclarativeConstraintReveal(q) {
  if (/\bnao quero\b/.test(q)) return false;
  return (
    /\b(quero|preciso|agora|prefiro|vou|minha prioridade|mudei de ideia|pensei melhor|agora valorizo)\b/.test(
      q
    ) && !/^e se\b/.test(q)
  );
}

/**
 * Mudança legítima de contexto decisório que autoriza troca de winner.
 */
export function detectsLegitimateDecisionContextChange(
  message = "",
  { hasActiveAnchor = false } = {}
) {
  if (!hasActiveAnchor) return false;
  const q = normalizeChangeText(message);
  if (!q || q.length < 4) return false;
  if (hasCommercialReopen(q)) return false;
  if (isAnchoredSpendingAversion(message)) return false;
  if (extractBudget(message) !== null) return false;
  if (isHypotheticalConstraintExploration(q)) return false;
  if (isComparativeReevaluationOnly(q)) return false;

  if (
    isDeclarativeBudgetDownShift(q) ||
    isDeclarativeBudgetUpShift(q) ||
    isDeclarativeAttributePriorityShift(q) ||
    isDeclarativePreferenceRecalibration(q)
  ) {
    return true;
  }

  if (isConstraintChangeFamilyQuery(message) && isDeclarativeConstraintReveal(q)) {
    return true;
  }

  return false;
}

export function isDecisionContextChangeFamilyQuery(message = "", options = {}) {
  return detectsLegitimateDecisionContextChange(message, options);
}

const CRITERION_LABELS = {
  value: "menor custo",
  battery: "bateria/autonomia",
  camera: "câmera/fotos",
  performance: "desempenho",
  longevity: "longevidade",
  storage: "armazenamento",
  comfort: "conforto",
  efficiency: "eficiência",
  premium: "maior investimento",
  balance: "equilíbrio geral",
};

function criterionLabel(key = "") {
  const k = String(key || "").toLowerCase().trim();
  return CRITERION_LABELS[k] || k || "equilíbrio geral";
}

/**
 * Infere o eixo decisório anterior e o novo a partir da mensagem + sessão.
 */
export function inferDecisionContextShift(message = "", sessionContext = {}) {
  const q = normalizeChangeText(message);
  const previousCriterion =
    sessionContext?.lastAxis ||
    sessionContext?.lastPriority ||
    sessionContext?.lastContextualAxis ||
    "balance";
  let newCriterion = previousCriterion;
  let kind = "criterion_shift";

  if (isDeclarativeBudgetDownShift(q)) {
    newCriterion = "value";
    kind = "budget_down";
  } else if (isDeclarativeBudgetUpShift(q)) {
    newCriterion = "premium";
    kind = "budget_up";
  } else if (/\b(bateria|autonomia)\b/.test(q)) {
    newCriterion = "battery";
    kind = "attribute_priority";
  } else if (/\b(camera|foto)\b/.test(q)) {
    newCriterion = "camera";
    kind = "attribute_priority";
  } else if (/\b(desempenho|performance)\b/.test(q)) {
    newCriterion = "performance";
    kind = "attribute_priority";
  } else if (/\b(longevidade|durabilidade|durar mais)\b/.test(q)) {
    newCriterion = "longevity";
    kind = "attribute_priority";
  } else if (/\b(custo.beneficio|custo beneficio|valorizo)\b/.test(q)) {
    newCriterion = "value";
    kind = "criterion_shift";
  }

  return {
    previousCriterion,
    newCriterion,
    kind,
    previousLabel: criterionLabel(previousCriterion),
    newLabel: criterionLabel(newCriterion),
  };
}

function rankProductsForShift(products = [], shift = {}) {
  const list = [...products].filter((p) => p?.product_name);
  if (!list.length) return [];

  if (shift.kind === "budget_down" || shift.newCriterion === "value") {
    return list.sort((a, b) => {
      const pa = parsePriceValue(a.price);
      const pb = parsePriceValue(b.price);
      if (pa != null && pb != null && pa !== pb) return pa - pb;
      if (pa != null && pb == null) return -1;
      if (pa == null && pb != null) return 1;
      return 0;
    });
  }

  if (shift.kind === "budget_up" || shift.newCriterion === "premium") {
    return list.sort((a, b) => {
      const pa = parsePriceValue(a.price);
      const pb = parsePriceValue(b.price);
      if (pa != null && pb != null && pa !== pb) return pb - pa;
      if (pa != null && pb == null) return -1;
      if (pa == null && pb != null) return 1;
      return 0;
    });
  }

  return list;
}

/**
 * Reranqueia catálogo escopado e resolve novo winner.
 */
export function resolveRecommendationAfterContextChange({
  catalogProducts = [],
  previousWinner = null,
  shift = {},
  allowedProducts = null,
} = {}) {
  let list = Array.isArray(catalogProducts) ? catalogProducts.filter(Boolean) : [];

  if (Array.isArray(allowedProducts) && allowedProducts.length >= 1) {
    list = list.filter((p) =>
      allowedProducts.some((a) => namesLikelyMatch(a?.product_name, p?.product_name))
    );
    if (!list.length) list = [...allowedProducts];
  }

  const rankedProducts = rankProductsForShift(list, shift);
  const newWinner = rankedProducts[0] || previousWinner || null;
  const prevName = previousWinner?.product_name || "";
  const newName = newWinner?.product_name || "";

  return {
    newWinner,
    previousWinner,
    rankedProducts,
    winnerChanged:
      !!prevName &&
      !!newName &&
      !namesLikelyMatch(prevName, newName),
  };
}

/**
 * Resposta com causa, impacto, troca e veredito — sem template fixo de produto.
 */
export function buildExplicitRecommendationChangeReply({
  previousWinner = null,
  newWinner = null,
  shift = {},
  winnerChanged = false,
  sessionContext = {},
} = {}) {
  const prevName = String(previousWinner?.product_name || "").trim();
  const newName = String(newWinner?.product_name || prevName).trim();
  const parts = [];

  parts.push("Sua prioridade mudou.");

  if (shift.previousLabel && shift.newLabel && shift.previousLabel !== shift.newLabel) {
    parts.push(
      `Antes eu estava priorizando ${shift.previousLabel}. Agora estou priorizando ${shift.newLabel}.`
    );
  } else if (shift.newLabel) {
    parts.push(`Agora estou priorizando ${shift.newLabel}.`);
  }

  if (winnerChanged && prevName && newName) {
    parts.push(`Por isso a recomendação mudou de ${prevName} para ${newName}.`);
    parts.push(`Com as novas prioridades, eu recomendo ${newName}.`);
  } else if (newName) {
    const reason =
      sessionContext?.lastMainConsequence ||
      sessionContext?.lastDecisionReason ||
      `ele continua alinhado com ${shift.newLabel || "o novo critério"}`;
    parts.push(
      `Mesmo com esse novo critério, ${newName} continua sendo a escolha mais coerente — ${reason}.`
    );
    parts.push(`Com as novas prioridades, eu recomendo ${newName}.`);
  } else {
    parts.push(
      "Consigo recalibrar a recomendação, mas preciso ter opções comparadas no contexto atual."
    );
  }

  return parts.join(" ");
}

/**
 * PATCH 8.4B — Persiste winner verbalizado na sessão (incl. discussion set locked).
 */
export function persistExplicitRecommendationChangeToSession(
  sessionContext = {},
  {
    newWinner = null,
    rankedProducts = [],
    previousWinner = null,
    winnerChanged = false,
    shift = {},
  } = {}
) {
  const out = { ...(sessionContext || {}) };
  if (!newWinner?.product_name) return out;

  const serializedWinner = { ...newWinner };
  out.lastBestProduct = serializedWinner;
  out.lastProductMentioned = serializedWinner.product_name;

  if (Array.isArray(rankedProducts) && rankedProducts.length) {
    out.lastProducts = rankedProducts;
    out.lastRankingSnapshot = buildRankingSnapshot(rankedProducts, serializedWinner);
  }

  if (winnerChanged && Array.isArray(out.lastComparisonProducts) && out.lastComparisonProducts.length >= 2) {
    const prevName = previousWinner?.product_name || "";
    let nextSet = out.lastComparisonProducts.map((p) => {
      if (prevName && namesLikelyMatch(p?.product_name, prevName)) {
        return serializedWinner;
      }
      return p;
    });
    if (!nextSet.some((p) => namesLikelyMatch(p?.product_name, serializedWinner.product_name))) {
      nextSet = [
        serializedWinner,
        ...nextSet.filter((p) => !namesLikelyMatch(p?.product_name, serializedWinner.product_name)),
      ].slice(0, 2);
    }
    out.lastComparisonProducts = nextSet;
    out.comparisonContextLocked = true;
  }

  if (shift?.newCriterion) {
    out.lastPreviousAxis = shift.previousCriterion || sessionContext?.lastAxis || "";
    out.lastPreviousPriority =
      shift.previousCriterion || sessionContext?.lastPriority || "";
    out.lastPriority = shift.newCriterion;
    out.lastAxis = shift.newCriterion;
    out.lastContextualAxis = shift.newCriterion;
  }

  if (winnerChanged && previousWinner?.product_name) {
    out.lastDecisionChange = {
      previousWinner: { ...previousWinner },
      newWinner: { ...serializedWinner },
      previousCriterion: shift.previousCriterion || sessionContext?.lastPriority || "",
      newCriterion: shift.newCriterion || "",
      previousLabel: shift.previousLabel || "",
      newLabel: shift.newLabel || "",
      winnerChanged: true,
      changeKind: shift.kind || "criterion_shift",
    };
    out.lastDecisionReason = `prioridade: ${shift.newLabel || shift.newCriterion || "recalibrada"}`;
  }

  return out;
}

export function buildExplicitChangeFromSession({
  message = "",
  sessionContext = {},
  query = "",
} = {}) {
  const { allowedProducts } = resolveAllowedProductsForDecision({
    sessionContext,
    query: message || query,
    anchorProduct: sessionContext?.lastBestProduct,
    catalogProducts: sessionContext?.lastProducts || [],
  });

  const shift = inferDecisionContextShift(message, sessionContext);
  const useCatalogRerank =
    shift.kind === "budget_down" ||
    shift.kind === "budget_up" ||
    shift.newCriterion === "value" ||
    shift.newCriterion === "premium";
  const fullCatalog =
    sessionContext?.lastProducts || sessionContext?.lastRankingSnapshot || [];
  const catalog = useCatalogRerank
    ? fullCatalog
    : allowedProducts?.length >= 1
      ? allowedProducts
      : fullCatalog;

  const resolved = resolveRecommendationAfterContextChange({
    catalogProducts: catalog,
    previousWinner: sessionContext?.lastBestProduct,
    shift,
    allowedProducts:
      useCatalogRerank || !allowedProducts?.length ? null : allowedProducts,
  });

  const reply = buildExplicitRecommendationChangeReply({
    previousWinner: sessionContext?.lastBestProduct,
    newWinner: resolved.newWinner,
    shift,
    winnerChanged: resolved.winnerChanged,
    sessionContext,
  });

  const sessionOut = persistExplicitRecommendationChangeToSession(sessionContext, {
    newWinner: resolved.newWinner,
    rankedProducts: resolved.rankedProducts,
    previousWinner: sessionContext?.lastBestProduct,
    winnerChanged: resolved.winnerChanged,
    shift,
  });

  return { ...resolved, shift, reply, allowedProducts, sessionOut };
}
