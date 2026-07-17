/**
 * PATCH 11B.1 — Commercial Follow-up Continuity
 *
 * Contextual commercial intent: short follow-ups inherit authority from valid
 * prior commercial state. ENTITY ≠ INTENT (11B) preserved for cold messages.
 *
 * MIA owns the intelligence. The LLM only verbalizes.
 */

import { detectActiveCommercialAsk, detectConversationalEntityMentionFrame } from "./miaIntentRecognitionLayer.js";

export const COMMERCIAL_FOLLOW_UP_VERSION = "11B.1";

export const COMMERCIAL_FOLLOW_UP_TYPES = Object.freeze({
  PRICE_FOLLOW_UP: "price_follow_up",
  RUNNER_UP_FOLLOW_UP: "runner_up_follow_up",
  ATTRIBUTE_FOLLOW_UP: "attribute_follow_up",
  COMPARISON_FOLLOW_UP: "comparison_follow_up",
  JUSTIFICATION_FOLLOW_UP: "justification_follow_up",
  AVAILABILITY_FOLLOW_UP: "availability_follow_up",
  ALTERNATIVE_FOLLOW_UP: "alternative_follow_up",
  CONSTRAINT_REFINEMENT: "constraint_refinement",
  CONFIRMATION_FOLLOW_UP: "confirmation_follow_up",
  TOPIC_SWITCH: "topic_switch",
  AMBIGUOUS_REFERENCE: "ambiguous_reference",
  NONE: "none",
});

const TOPIC_SWITCH_PATTERN =
  /\b(mudando de assunto|mudar de assunto|esquece(?:\s+o|\s+a|\s+os|\s+as)?|vamos conversar sobre outra|agora quero falar de|obrigad\w*[, ]+(?:era\s+)?s[oó]\s+isso|so queria conversar|s[oó] queria conversar|nao quero mais falar de|não quero mais falar de)\b/;

const PRICE_FOLLOW_UP_PATTERN =
  /\b(quanto custa|qto custa|qual o pre[cç]o|qual o valor|e quanto|e o pre[cç]o|e o valor|por quanto|t[aá] por quanto|est[aá] por quanto|quanto [eé]|qual [eé] o pre[cç]o|onde est[aá] mais barato|onde [eé] mais barato)\b/;

const RUNNER_UP_FOLLOW_UP_PATTERN =
  /\b(segunda op[cç][ãa]o|segundo colocado|segunda alternativa|e o segundo|e a segunda|e o outro|e a outra|plano b|runner.?up|segundo lugar|pr[oó]xim[oa] da lista|outra op[cç][ãa]o|tem (?:uma )?alternativa|tem alternativa|qual era o outro|qual [eé] a outra|quem ficou em segundo|e o pr[oó]ximo)\b/;

const ATTRIBUTE_FOLLOW_UP_PATTERN =
  /\b(e a bateria|e bateria|e a c[aâ]mera|e c[aâ]mera|e o pre[cç]o|tem nfc|tem 5g|[eé] resistente|quanto de mem[oó]ria|e a mem[oó]ria|e o armazenamento|e a tela|e desempenho|e performance|autonomia|durabilidade)\b/;

const JUSTIFICATION_FOLLOW_UP_PATTERN =
  /\b(vale a pena|vale mesmo|e bom mesmo|[eé] boa escolha|voce compraria|voc[eê] compraria|tem defeito|ponto fraco|por que esse|por que essa|por que voce|por que voc[eê]|qual o problema|tem algum problema|voce iria nele|voc[eê] iria nele)\b/;

const COMPARISON_FOLLOW_UP_PATTERN =
  /\b(qual dos dois|qual das duas|qual [eé] melhor entre|qual tem mais|qual [eé] mais barato|qual [eé] mais caro|qual voce escolheria|qual voc[eê] escolheria|esse [eé] melhor|essa [eé] melhor|ganha do outro|entre os dois|entre esses)\b/;

const AVAILABILITY_FOLLOW_UP_PATTERN =
  /\b(onde encontro|onde comprar|onde acho|tem onde|tem loja|tem estoque|onde vende)\b/;

const CONSTRAINT_REFINEMENT_PATTERN =
  /\b(quero mais bateria|mais barato|sem iphone|so samsung|s[oó] samsung|prefiro samsung|prefiro motorola|com 256|com 128|quero menor|quero maior|precisa ter|mas preciso|sem \w+|com c[aâ]mera melhor|bateria melhor)\b/;

const CONFIRMATION_FOLLOW_UP_PATTERN =
  /\b(esse mesmo|essa mesma|confirmado|pode ser esse|fechou esse|vou dele|vou nessa)\b/;

const SOCIAL_REACTION_PATTERN =
  /^(legal|entendi|pois [eé]|ok|beleza|blz|show|massa|top|verdade|sim|claro|obrigad\w*|valeu|kkk+|rs+|haha+)$/;

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,;:…]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasProductName(product) {
  return !!String(product?.product_name || "").trim();
}

function normalizeRanking(snapshot = []) {
  if (!Array.isArray(snapshot)) return [];
  return snapshot.filter((item) => hasProductName(item));
}

export function detectTopicSwitch(message = "") {
  const q = normalizeText(message);
  if (!q) return false;
  return TOPIC_SWITCH_PATTERN.test(q);
}

export function classifyCommercialFollowUpType(message = "") {
  const q = normalizeText(message);
  if (!q) return COMMERCIAL_FOLLOW_UP_TYPES.NONE;

  if (detectTopicSwitch(q)) return COMMERCIAL_FOLLOW_UP_TYPES.TOPIC_SWITCH;
  if (SOCIAL_REACTION_PATTERN.test(q)) return COMMERCIAL_FOLLOW_UP_TYPES.NONE;

  if (PRICE_FOLLOW_UP_PATTERN.test(q)) return COMMERCIAL_FOLLOW_UP_TYPES.PRICE_FOLLOW_UP;
  if (RUNNER_UP_FOLLOW_UP_PATTERN.test(q)) return COMMERCIAL_FOLLOW_UP_TYPES.RUNNER_UP_FOLLOW_UP;
  if (COMPARISON_FOLLOW_UP_PATTERN.test(q)) return COMMERCIAL_FOLLOW_UP_TYPES.COMPARISON_FOLLOW_UP;
  if (JUSTIFICATION_FOLLOW_UP_PATTERN.test(q)) return COMMERCIAL_FOLLOW_UP_TYPES.JUSTIFICATION_FOLLOW_UP;
  if (ATTRIBUTE_FOLLOW_UP_PATTERN.test(q)) return COMMERCIAL_FOLLOW_UP_TYPES.ATTRIBUTE_FOLLOW_UP;
  if (AVAILABILITY_FOLLOW_UP_PATTERN.test(q)) return COMMERCIAL_FOLLOW_UP_TYPES.AVAILABILITY_FOLLOW_UP;
  if (CONSTRAINT_REFINEMENT_PATTERN.test(q)) return COMMERCIAL_FOLLOW_UP_TYPES.CONSTRAINT_REFINEMENT;
  if (CONFIRMATION_FOLLOW_UP_PATTERN.test(q)) return COMMERCIAL_FOLLOW_UP_TYPES.CONFIRMATION_FOLLOW_UP;

  if (detectActiveCommercialAsk(message) && !detectConversationalEntityMentionFrame(message)) {
    return COMMERCIAL_FOLLOW_UP_TYPES.CONFIRMATION_FOLLOW_UP;
  }

  if (/^e\s+(esse|essa|ele|ela|isso)\b/.test(q) && q.split(/\s+/).length <= 6) {
    return COMMERCIAL_FOLLOW_UP_TYPES.AMBIGUOUS_REFERENCE;
  }

  return COMMERCIAL_FOLLOW_UP_TYPES.NONE;
}

export function hasValidCommercialSessionContext(sessionContext = {}) {
  if (hasProductName(sessionContext.lastBestProduct)) return true;
  if (normalizeRanking(sessionContext.lastRankingSnapshot).length >= 1) return true;
  if (Array.isArray(sessionContext.lastComparisonProducts) && sessionContext.lastComparisonProducts.length >= 2) {
    return true;
  }
  if (Array.isArray(sessionContext.lastProducts) && sessionContext.lastProducts.length >= 1) return true;
  return false;
}

function resolveRunnerUpProduct(sessionContext = {}) {
  const ranking = normalizeRanking(sessionContext.lastRankingSnapshot);
  if (ranking.length >= 2) {
    const runner =
      ranking.find((item) => Number(item.rank) === 2) ||
      ranking[1];
    if (hasProductName(runner)) {
      return { product: runner, source: "lastRankingSnapshot", rankingPosition: 2 };
    }
  }
  const products = Array.isArray(sessionContext.lastProducts) ? sessionContext.lastProducts : [];
  if (products.length >= 2 && hasProductName(products[1])) {
    return { product: products[1], source: "lastProducts", rankingPosition: 2 };
  }
  return { product: null, source: "none", rankingPosition: null };
}

function resolvePrimaryProduct(sessionContext = {}) {
  if (hasProductName(sessionContext.lastBestProduct)) {
    return {
      product: sessionContext.lastBestProduct,
      source: "lastBestProduct",
      rankingPosition: 1,
    };
  }
  const ranking = normalizeRanking(sessionContext.lastRankingSnapshot);
  if (ranking.length >= 1) {
    const winner = ranking.find((item) => Number(item.rank) === 1) || ranking[0];
    if (hasProductName(winner)) {
      return { product: winner, source: "lastRankingSnapshot", rankingPosition: 1 };
    }
  }
  return { product: null, source: "none", rankingPosition: null };
}

export function resolveCommercialFollowUpReference({
  message = "",
  sessionContext = {},
  followUpType = COMMERCIAL_FOLLOW_UP_TYPES.NONE,
} = {}) {
  const comparisonProducts = Array.isArray(sessionContext.lastComparisonProducts)
    ? sessionContext.lastComparisonProducts.filter((p) => hasProductName(p))
    : [];

  if (followUpType === COMMERCIAL_FOLLOW_UP_TYPES.RUNNER_UP_FOLLOW_UP) {
    return resolveRunnerUpProduct(sessionContext);
  }

  if (
    followUpType === COMMERCIAL_FOLLOW_UP_TYPES.COMPARISON_FOLLOW_UP &&
    comparisonProducts.length >= 2
  ) {
    return {
      product: comparisonProducts[0],
      comparisonProducts,
      source: "lastComparisonProducts",
      rankingPosition: null,
    };
  }

  return resolvePrimaryProduct(sessionContext);
}

function inferProviderRequired({ followUpType, resolvedProduct, sessionContext = {} }) {
  if (followUpType === COMMERCIAL_FOLLOW_UP_TYPES.PRICE_FOLLOW_UP) {
    const price = resolvedProduct?.product?.price;
    return !price || String(price).trim() === "";
  }
  if (followUpType === COMMERCIAL_FOLLOW_UP_TYPES.RUNNER_UP_FOLLOW_UP) {
    return !hasProductName(resolvedProduct?.product);
  }
  if (
    followUpType === COMMERCIAL_FOLLOW_UP_TYPES.JUSTIFICATION_FOLLOW_UP ||
    followUpType === COMMERCIAL_FOLLOW_UP_TYPES.ATTRIBUTE_FOLLOW_UP ||
    followUpType === COMMERCIAL_FOLLOW_UP_TYPES.CONFIRMATION_FOLLOW_UP
  ) {
    return false;
  }
  if (followUpType === COMMERCIAL_FOLLOW_UP_TYPES.CONSTRAINT_REFINEMENT) {
    return true;
  }
  if (followUpType === COMMERCIAL_FOLLOW_UP_TYPES.AVAILABILITY_FOLLOW_UP) {
    return !resolvedProduct?.product?.link;
  }
  if (followUpType === COMMERCIAL_FOLLOW_UP_TYPES.COMPARISON_FOLLOW_UP) {
    return false;
  }
  return false;
}

export function resolveContextualCommercialFollowUp({
  message = "",
  sessionContext = {},
  hasActiveAnchor = false,
} = {}) {
  const followUpType = classifyCommercialFollowUpType(message);

  if (followUpType === COMMERCIAL_FOLLOW_UP_TYPES.NONE) {
    return {
      version: COMMERCIAL_FOLLOW_UP_VERSION,
      detected: false,
      followUpType,
      contextualCommercialAuthorized: false,
      requiresClarification: false,
      reasonCode: "no_follow_up_signal",
    };
  }

  if (followUpType === COMMERCIAL_FOLLOW_UP_TYPES.TOPIC_SWITCH) {
    return {
      version: COMMERCIAL_FOLLOW_UP_VERSION,
      detected: true,
      followUpType,
      contextualCommercialAuthorized: false,
      requiresClarification: false,
      reasonCode: "topic_switch",
    };
  }

  const contextValid = hasValidCommercialSessionContext(sessionContext) || hasActiveAnchor;

  if (!contextValid) {
    const explicitAsk = detectActiveCommercialAsk(message);
    return {
      version: COMMERCIAL_FOLLOW_UP_VERSION,
      detected: true,
      followUpType,
      contextualCommercialAuthorized: false,
      requiresClarification: !explicitAsk,
      reasonCode: explicitAsk ? "explicit_ask_without_session" : "missing_commercial_context",
    };
  }

  const resolvedReference = resolveCommercialFollowUpReference({
    message,
    sessionContext,
    followUpType,
  });

  if (
    (followUpType === COMMERCIAL_FOLLOW_UP_TYPES.RUNNER_UP_FOLLOW_UP ||
      followUpType === COMMERCIAL_FOLLOW_UP_TYPES.PRICE_FOLLOW_UP ||
      followUpType === COMMERCIAL_FOLLOW_UP_TYPES.AMBIGUOUS_REFERENCE) &&
    !hasProductName(resolvedReference?.product) &&
    followUpType !== COMMERCIAL_FOLLOW_UP_TYPES.AMBIGUOUS_REFERENCE
  ) {
    return {
      version: COMMERCIAL_FOLLOW_UP_VERSION,
      detected: true,
      followUpType,
      contextualCommercialAuthorized: false,
      requiresClarification: true,
      reasonCode: "unresolved_reference",
    };
  }

  const providerRequired = inferProviderRequired({
    followUpType,
    resolvedProduct: resolvedReference,
    sessionContext,
  });

  return {
    version: COMMERCIAL_FOLLOW_UP_VERSION,
    detected: true,
    followUpType,
    contextualCommercialAuthorized: true,
    requiresClarification:
      followUpType === COMMERCIAL_FOLLOW_UP_TYPES.AMBIGUOUS_REFERENCE &&
      !hasProductName(resolvedReference?.product),
    reasonCode: "contextual_commercial_follow_up",
    resolvedReference,
    resolvedProduct: resolvedReference?.product || null,
    contextSource: resolvedReference?.source || null,
    rankingPosition: resolvedReference?.rankingPosition ?? null,
    providerRequired,
    preserveRankingSnapshot: true,
    reusePriorCommercialContext: !providerRequired,
  };
}

export function isCommercialFollowUpContinuationSignal(message = "") {
  const type = classifyCommercialFollowUpType(message);
  return (
    type !== COMMERCIAL_FOLLOW_UP_TYPES.NONE &&
    type !== COMMERCIAL_FOLLOW_UP_TYPES.TOPIC_SWITCH
  );
}

export function commercialFollowUpToTrace(followUp = null) {
  if (!followUp?.detected) return null;
  return {
    version: followUp.version,
    followUpType: followUp.followUpType,
    contextualCommercialAuthorized: followUp.contextualCommercialAuthorized,
    requiresClarification: followUp.requiresClarification,
    reasonCode: followUp.reasonCode,
    resolvedProductName: followUp.resolvedProduct?.product_name || null,
    contextSource: followUp.contextSource || null,
    rankingPosition: followUp.rankingPosition,
    providerRequired: followUp.providerRequired,
    reusePriorCommercialContext: followUp.reusePriorCommercialContext,
  };
}
