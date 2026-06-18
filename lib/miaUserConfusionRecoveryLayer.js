/**
 * PATCH 8.3G — User Confusion Recovery Layer
 *
 * Modela EXPLANATION_BREAKDOWN / USER_CONFUSION:
 * falta de compreensão da explicação — não perda de confiança (8.3F).
 */

import { namesLikelyMatch } from "./miaDecisionConsistencyFixes.js";
import { detectsReasoningBreakdownSignal } from "./miaContradictionRecoveryLayer.js";
import {
  detectsEscalatedUserConfusionSignal,
} from "./miaEscalatedConfusionSignals.js";
import { resolveAllowedProductsForDecision } from "./miaRecommendationStabilityGuard.js";

function normalizeConfusionText(message = "") {
  return String(message || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasConfusionCommercialReopen(q) {
  if (!q) return false;
  if (
    /\b(quero|preciso|busco|buscar|procurar|procura|me acha|me indica|me recomenda)\s+(um\s+)?(celular|smartphone|notebook|tv|monitor|mouse|teclado|cadeira|pc)\b/.test(
      q
    )
  ) {
    return true;
  }
  if (/\b(celular|notebook|smartphone)\s+(ate|até)\s+\d/.test(q)) return true;
  return false;
}

function axisLabel(axis = "") {
  const map = {
    battery: "bateria",
    camera: "câmera",
    performance: "desempenho",
    value: "custo-benefício",
    longevity: "longevidade",
    screen: "tela",
    storage: "armazenamento",
  };
  const key = String(axis || "").toLowerCase().trim();
  return map[key] || key || "equilíbrio geral";
}

function parsePriceValue(price = "") {
  const digits = String(price || "").replace(/[^\d]/g, "");
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Intenção: usuário não reconstruiu o raciocínio da recomendação (clareza).
 * Exclui sinais de contradição/confiança (8.3F).
 */
export function detectsExplanationBreakdownSignal(
  message = "",
  { hasActiveAnchor = false, sessionContext = null } = {}
) {
  if (!hasActiveAnchor) return false;
  const q = normalizeConfusionText(message);
  if (!q || q.length < 2) return false;
  if (hasConfusionCommercialReopen(q)) return false;

  // PATCH 8.5C — escalated tracking loss precedes 8.3F exclusion
  if (detectsEscalatedUserConfusionSignal(message, { hasActiveAnchor, sessionContext })) {
    return true;
  }

  if (
    detectsReasoningBreakdownSignal(message, {
      hasActiveAnchor,
      sessionContext,
    })
  ) {
    return false;
  }

  const directFailure =
    /\bnao entendi\b/.test(q) ||
    /\bn entendi\b/.test(q) ||
    /\bnao (saquei|compreendi|percebi|acompanhei)\b/.test(q) ||
    /\bnao consegui (entender|acompanhar|seguir)\b/.test(q);

  const clarityGap =
    /\bnao ficou (tao )?claro\b/.test(q) ||
    /\bnao esta claro\b/.test(q) ||
    /\bnao ta claro\b/.test(q) ||
    /\bficou complicad/.test(q) ||
    /\bnao fez sentido\b/.test(q) ||
    /^como assim\b/.test(q) ||
    /\bracional (da|de) recomendacao nao ficou claro\b/.test(q) ||
    /\bnao compreendi sua explicacao\b/.test(q);

  const simplificationAsk =
    /\b(explica|explique) (melhor|de outro jeito|direito|simples)\b/.test(q) ||
    /\b(simplifica|pode simplificar|fala mais simples)\b/.test(q) ||
    /\b(pode explicar|por favor explica|teria como explicar)\b/.test(q) ||
    /\bentao me explica melhor\b/.test(q) ||
    /^resumindo\b/.test(q);

  const colloquialGap =
    /^boiei$/.test(q) ||
    /\bviajei\b/.test(q) ||
    /^que quer dizer\b/.test(q) ||
    /^repete\b/.test(q);

  const reactiveClarity =
    (q.length <= 12 && /^(ue|ué|pera|pera ai)$/.test(q)) ||
    (q.length <= 20 && /^hm$/.test(q));

  return (
    directFailure ||
    clarityGap ||
    simplificationAsk ||
    colloquialGap ||
    reactiveClarity
  );
}

export function isUserConfusionFamilyQuery(message = "", options = {}) {
  return detectsExplanationBreakdownSignal(message, options);
}

function pickAnchorProduct(allowedProducts = [], sessionContext = {}) {
  const list = Array.isArray(allowedProducts) ? allowedProducts : [];
  const anchorName = sessionContext?.lastBestProduct?.product_name || "";
  if (!anchorName) return list[0] || sessionContext?.lastBestProduct || null;
  return (
    list.find((p) => namesLikelyMatch(p?.product_name, anchorName)) ||
    sessionContext?.lastBestProduct ||
    list[0] ||
    null
  );
}

function buildPriorityBranches(anchor = null, alternative = null, explanationCtx = {}) {
  const axis = axisLabel(explanationCtx?.lastAxis || "");
  const anchorPrice = parsePriceValue(anchor?.price);
  const altPrice = parsePriceValue(alternative?.price);

  if (alternative?.product_name && anchorPrice != null && altPrice != null) {
    const cheaper =
      altPrice < anchorPrice ? alternative.product_name : anchor.product_name;
    const premium =
      altPrice < anchorPrice ? anchor.product_name : alternative.product_name;
    return [
      `Se sua prioridade for economizar: ${cheaper}.`,
      `Se sua prioridade for ${axis || "equilíbrio geral"} no longo prazo: ${premium}.`,
    ];
  }

  if (axis === "custo-benefício" || axis === "value") {
    return [
      alternative?.product_name
        ? `Se quiser gastar menos: ${alternative.product_name}.`
        : null,
      `Se quiser mais retorno no uso: ${anchor?.product_name || "a referência atual"}.`,
    ].filter(Boolean);
  }

  if (axis === "longevidade" || axis === "bateria" || axis === "performance") {
    return [
      `Se ${axis} for o que mais pesa: ${anchor?.product_name || "a referência atual"}.`,
      alternative?.product_name
        ? `Se quiser comparar outro perfil de uso: ${alternative.product_name}.`
        : null,
    ].filter(Boolean);
  }

  return [];
}

function describeAlternativeRole(anchor = null, alternative = null, explanationCtx = {}) {
  const altName = alternative?.product_name || "";
  if (!altName) return "";

  const anchorPrice = parsePriceValue(anchor?.price);
  const altPrice = parsePriceValue(alternative?.price);

  if (anchorPrice != null && altPrice != null && altPrice < anchorPrice) {
    return `${altName} entrou na conversa principalmente porque custa menos.`;
  }

  const sacrifices = Array.isArray(explanationCtx?.lastWinnerSacrifices)
    ? explanationCtx.lastWinnerSacrifices
    : [];
  if (sacrifices.length > 0) {
    return `${altName} apareceu para comparar um tradeoff: ${sacrifices[0]}.`;
  }

  return `${altName} entrou na conversa para você comparar com a referência atual.`;
}

/**
 * Explicação simplificada a partir do estado real — sem template fixo de produto.
 */
export function buildUserConfusionRecoveryReply({
  sessionContext = {},
  allowedProducts = [],
  explanationCtx = {},
  query = "",
} = {}) {
  const scoped =
    allowedProducts?.length >= 1
      ? allowedProducts
      : resolveAllowedProductsForDecision({
          sessionContext,
          query,
          anchorProduct: sessionContext?.lastBestProduct,
          catalogProducts: sessionContext?.lastProducts || [],
        }).allowedProducts;

  const anchor = pickAnchorProduct(scoped, sessionContext);
  const anchorName = String(anchor?.product_name || "").trim();
  if (!anchorName) {
    return "Vamos simplificar: me diz qual parte ficou confusa que eu reorganizo a explicação com clareza.";
  }

  const others = scoped.filter(
    (p) => p?.product_name && !namesLikelyMatch(p.product_name, anchorName)
  );

  const parts = ["Vamos simplificar."];

  parts.push(`${anchorName} é minha recomendação principal.`);

  if (others.length === 1) {
    parts.push(describeAlternativeRole(anchor, others[0], explanationCtx));
    const branches = buildPriorityBranches(anchor, others[0], explanationCtx);
    parts.push(...branches);
  } else if (others.length > 1) {
    parts.push(
      `Na conversa também estão: ${others.map((p) => p.product_name).join(", ")} — só para comparar com a referência.`
    );
  }

  if (explanationCtx?.lastConsequence) {
    parts.push(
      `Em uma frase: escolhi ${anchorName} porque ${explanationCtx.lastConsequence}`
    );
  } else if (explanationCtx?.lastDecisionReason) {
    parts.push(explanationCtx.lastDecisionReason);
  } else if (explanationCtx?.lastTradeoff) {
    parts.push(`Tradeoff principal: ${explanationCtx.lastTradeoff}`);
  }

  parts.push(`Por isso continuo recomendando o ${anchorName}.`);

  return parts.join(" ");
}
