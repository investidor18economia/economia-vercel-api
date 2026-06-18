/**
 * PATCH 8.3F — Contradiction Recovery Layer
 *
 * Modela intenção REASONING_BREAKDOWN / CONVERSATIONAL_CONFUSION:
 * perda de confiança no raciocínio atual — não falha simples de clareza.
 */

import { namesLikelyMatch } from "./miaDecisionConsistencyFixes.js";
import { detectsEscalatedUserConfusionDiscourse } from "./miaEscalatedConfusionSignals.js";
import { resolveAllowedProductsForDecision } from "./miaRecommendationStabilityGuard.js";

function normalizeRecoveryText(message = "") {
  return String(message || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasRecoveryCommercialReopen(q) {
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

function hasActiveDiscussionContext(sessionContext = {}) {
  const locked = Array.isArray(sessionContext?.lastComparisonProducts)
    ? sessionContext.lastComparisonProducts
    : [];
  return locked.length >= 2 || !!sessionContext?.comparisonContextLocked;
}

function parsePriceValue(price = "") {
  const digits = String(price || "").replace(/[^\d]/g, "");
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
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

/**
 * Intenção: usuário perdeu a linha da decisão ou acredita que houve contradição.
 * Requer âncora ativa — sem âncora, não é recovery de decisão.
 */
export function detectsReasoningBreakdownSignal(
  message = "",
  { hasActiveAnchor = false, sessionContext = null } = {}
) {
  if (!hasActiveAnchor) return false;
  const q = normalizeRecoveryText(message);
  if (!q || q.length < 2) return false;
  if (hasRecoveryCommercialReopen(q)) return false;

  // Clareza pura (sem sinal de quebra de confiança) → família COMPREHENSION
  if (/^(nao entendi|nao compreendi|nao peguei|nao percebi)$/.test(q)) return false;
  if (
    /^(explica melhor|explica de outro jeito|pode explicar|simplifica|como assim|repete)$/.test(
      q
    )
  ) {
    return false;
  }

  const trustAccusation =
    /\b(voce|vc) (me )?(confundiu|embaralhou|contradisse|contradisse|enrolou)\b/.test(q) ||
    /\b(me )?(confundiu|embaralhou)\b/.test(q) ||
    /\b(sua|a) (explicacao|recomendacao|resposta) (ficou )?(inconsistente|confusa|contraditoria|contradisse)\b/.test(
      q
    ) ||
    /\b(mudou de ideia|trocou de ideia|virou outra coisa|mudou d ideia)\b/.test(q) ||
    /\b(recomendacao atual diverge|diverge da anterior|inconsistente com o que)\b/.test(q);

  const flipFlopPerception =
    /\b(mas )?antes (era|falou|disse|era outro|recomendou)\b/.test(q) ||
    /\b(nao era o outro|era o outro|mas nao era)\b/.test(q) ||
    /\b(voce|vc) (falou|disse|recomendou) (outro|diferente)\b/.test(q);

  const trackLoss =
    /\b(fiquei|to|estou|agora fiquei|agora to) (mais )?(perdid|perdido|bugad|buguei|embanan)/.test(
      q
    ) ||
    /\bagora (buguei|bugado|perdi)\b/.test(q) ||
    /\b(nao to acompanhando|nao estou acompanhando|perdi o fio|nao to entendendo)\b/.test(
      q
    ) ||
    /\b(agora )?(complicou|embaralhou tudo)\b/.test(q) ||
    /\b(nao fez sentido|nao faz sentido o que)\b/.test(q) ||
    /\b(to mais confuso|ficou mais confuso)\b/.test(q);

  // PATCH 8.5C — pure tracking loss → 8.3G user confusion recovery (not 8.3F)
  if (detectsEscalatedUserConfusionDiscourse(message)) {
    return false;
  }

  const clarifyAfterBreakdown =
    /\b(entao )?qual (e|eu compro|eu pego|seria|fica) (afinal|mesmo|agora)\b/.test(q) ||
    /\bqual e afinal\b/.test(q) ||
    /^entao qual\b/.test(q);

  const reactiveBreakdown =
    (q.length <= 12 && /^(ue|ué|pera|pera ai|pera ae)$/.test(q)) ||
    (q.length <= 24 && /^mas antes\b/.test(q));

  const discussionContext = hasActiveDiscussionContext(sessionContext || {});
  const disorientationInComparison =
    discussionContext &&
    (trackLoss ||
      /\b(nao to acompanhando|perdi o fio|qual e afinal)\b/.test(q) ||
      reactiveBreakdown);

  if (trustAccusation || flipFlopPerception) return true;
  if (disorientationInComparison) return true;
  if (clarifyAfterBreakdown && discussionContext) return true;
  if (reactiveBreakdown && discussionContext) return true;

  return false;
}

export function isConversationalConfusionFamilyQuery(message = "", options = {}) {
  return detectsReasoningBreakdownSignal(message, options);
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

function describeAlternativeRole(anchor = null, alternative = null, explanationCtx = {}) {
  const altName = alternative?.product_name || "";
  if (!altName) return "";

  const anchorPrice = parsePriceValue(anchor?.price);
  const altPrice = parsePriceValue(alternative?.price);

  if (anchorPrice != null && altPrice != null && altPrice < anchorPrice) {
    return `${altName} entrou principalmente como alternativa de custo menor.`;
  }

  const sacrifices = Array.isArray(explanationCtx?.lastWinnerSacrifices)
    ? explanationCtx.lastWinnerSacrifices
    : [];
  if (sacrifices.length > 0) {
    return `${altName} apareceu para comparar um tradeoff real: ${sacrifices[0]}.`;
  }

  return `${altName} está no par para você comparar com a referência atual.`;
}

/**
 * Reorganiza raciocínio a partir do estado real — sem template fixo de produto.
 */
export function buildContradictionRecoveryReply({
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
    return "Você tem razão — vamos organizar. Me diz qual produto ou critério ficou confuso que eu reorganizo a decisão com clareza.";
  }

  const others = scoped.filter(
    (p) => p?.product_name && !namesLikelyMatch(p.product_name, anchorName)
  );

  const parts = ["Você tem razão — vamos organizar o que está em jogo aqui."];

  if (others.length >= 1) {
    const names = [anchorName, ...others.map((p) => p.product_name)].join(" e ");
    parts.push(`Estamos comparando ${names}.`);
  }

  parts.push(`${anchorName} continua sendo minha recomendação principal.`);

  if (others.length === 1) {
    parts.push(describeAlternativeRole(anchor, others[0], explanationCtx));
  } else if (others.length > 1) {
    parts.push(
      `As outras opções no par (${others.map((p) => p.product_name).join(", ")}) servem só para comparar com essa referência.`
    );
  }

  const axis = axisLabel(
    explanationCtx?.lastAxis ||
      sessionContext?.lastAxis ||
      sessionContext?.lastPriority ||
      ""
  );

  if (explanationCtx?.lastDecisionReason) {
    parts.push(explanationCtx.lastDecisionReason);
  } else if (explanationCtx?.lastConsequence) {
    parts.push(
      `O critério que sustenta a escolha (${axis}): ${explanationCtx.lastConsequence}`
    );
  } else if (explanationCtx?.lastTradeoff) {
    parts.push(`Tradeoff registrado: ${explanationCtx.lastTradeoff}`);
  }

  parts.push(`Minha recomendação continua sendo o ${anchorName}.`);

  return parts.join(" ");
}
