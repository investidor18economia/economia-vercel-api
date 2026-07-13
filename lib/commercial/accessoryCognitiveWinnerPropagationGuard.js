/**
 * PATCH Comercial 4E-B.6 — Accessory Cognitive Winner Propagation Guard
 *
 * Impede que o winner cognitivo (produto principal) contamine card, payload
 * comercial, runner-up e response builder em queries de acessório.
 * Não altera Decision Engine, ranking, Router ou Commercial Runtime.
 */

import { detectAccessoryIntent } from "./accessoryIntentLockGuard.js";
import { isOfferCompatibleWithAccessoryIntent } from "../productSourceAdapter/accessoryCommercialRuntimeEnforcement.js";

export const ACCESSORY_COGNITIVE_WINNER_PROPAGATION_GUARD_VERSION = "4E-B.6";

function cleanText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function productDisplayName(product = null) {
  if (!product) return "";
  if (typeof product === "string") return cleanText(product);
  return cleanText(
    product.product_name ||
      product.title ||
      product.trustedSpecs?.official_name ||
      product.official_name ||
      ""
  );
}

function isAccessoryQuery(query = "") {
  return detectAccessoryIntent(query).isAccessoryIntent === true;
}

/**
 * @param {{ query?: string, winnerProduct?: Record<string, unknown>|string|null, productName?: string }} input
 */
export function shouldBlockAccessoryWinnerPropagation(input = {}) {
  const query = cleanText(input.query || "");
  if (!isAccessoryQuery(query)) {
    return false;
  }

  const candidate = cleanText(input.productName || productDisplayName(input.winnerProduct));
  if (!candidate) {
    return false;
  }

  return !isOfferCompatibleWithAccessoryIntent({ query, offer: { title: candidate } });
}

/**
 * @param {{
 *   query?: string,
 *   winnerProduct?: Record<string, unknown>|null,
 *   cardProduct?: Record<string, unknown>|null,
 *   prices?: Array<Record<string, unknown>>,
 *   selectedOfferTitle?: string,
 *   reply?: string,
 *   responsePath?: string,
 * }} input
 */
export function buildAccessoryWinnerPropagationDecision(input = {}) {
  const query = cleanText(input.query || "");
  const winnerBefore = productDisplayName(input.winnerProduct);
  const cardProductBefore =
    productDisplayName(input.cardProduct) || productDisplayName(input.prices?.[0]);
  const selectedOfferTitle = cleanText(input.selectedOfferTitle || "");
  const accessoryIntent = isAccessoryQuery(query);

  const blockedByWinner = shouldBlockAccessoryWinnerPropagation({
    query,
    winnerProduct: input.winnerProduct,
    productName: winnerBefore,
  });
  const blockedByCard = shouldBlockAccessoryWinnerPropagation({
    query,
    productName: cardProductBefore,
  });
  const blocked = accessoryIntent && (blockedByWinner || blockedByCard);

  if (!accessoryIntent) {
    return {
      blocked: false,
      reason: "not_accessory_query",
      winnerBefore,
      winnerAfter: winnerBefore || null,
      cardProductBefore,
      cardProductAfter: cardProductBefore || null,
      runnerUpBlocked: false,
      responseAdjusted: false,
    };
  }

  if (!blocked) {
    return {
      blocked: false,
      reason: "compatible_propagation_surface",
      winnerBefore,
      winnerAfter: winnerBefore || null,
      cardProductBefore,
      cardProductAfter: cardProductBefore || null,
      runnerUpBlocked: false,
      responseAdjusted: false,
    };
  }

  let cardProductAfter = null;
  if (
    selectedOfferTitle &&
    isOfferCompatibleWithAccessoryIntent({ query, offer: { title: selectedOfferTitle } })
  ) {
    cardProductAfter = selectedOfferTitle;
  } else if (
    cardProductBefore &&
    isOfferCompatibleWithAccessoryIntent({ query, offer: { title: cardProductBefore } })
  ) {
    cardProductAfter = cardProductBefore;
  }

  return {
    blocked: true,
    reason: "accessory_query_incompatible_cognitive_winner",
    winnerBefore,
    winnerAfter: null,
    cardProductBefore,
    cardProductAfter,
    runnerUpBlocked: true,
    responseAdjusted: false,
  };
}

function resolveCompatibleOfferTitle(query = "", selectedOfferTitle = "", prices = []) {
  const selected = cleanText(selectedOfferTitle);
  if (
    selected &&
    isOfferCompatibleWithAccessoryIntent({ query, offer: { title: selected } })
  ) {
    return selected;
  }

  for (const price of prices) {
    const name = productDisplayName(price);
    if (name && isOfferCompatibleWithAccessoryIntent({ query, offer: { title: name } })) {
      return name;
    }
  }

  return "";
}

function replyMentionsIncompatibleMainProduct(query = "", reply = "", mainProductName = "") {
  const text = cleanText(reply).toLowerCase();
  const main = cleanText(mainProductName).toLowerCase();
  if (!text || !main) return false;
  if (!text.includes(main)) return false;
  return !isOfferCompatibleWithAccessoryIntent({ query, offer: { title: mainProductName } });
}

/**
 * @param {string} query
 * @param {string|null} accessoryTitle
 */
export function buildAccessoryPropagationNeutralFallbackReply(query = "", accessoryTitle = null) {
  const title = cleanText(accessoryTitle);
  if (title) {
    return (
      `Encontrei uma opção compatível com sua busca: ${title}. ` +
      `Mantenho a leitura prudente com base apenas no que o anúncio deixa explícito.`
    );
  }

  return (
    "Para esta busca de acessório, não consegui montar uma oferta comercial segura " +
    "sem misturar com o produto principal. Se quiser, refine o termo ou peça outra opção compatível."
  );
}

function filterAccessoryCompatibleCandidates(query = "", candidates = []) {
  return (Array.isArray(candidates) ? candidates : []).filter((candidate) => {
    const name = productDisplayName(candidate);
    if (!name) return false;
    return isOfferCompatibleWithAccessoryIntent({ query, offer: { title: name } });
  });
}

/**
 * @param {{
 *   query?: string,
 *   winnerProduct?: Record<string, unknown>|null,
 *   prices?: Array<Record<string, unknown>>,
 *   reply?: string,
 *   rankedCandidates?: Array<Record<string, unknown>>,
 *   selectedOfferTitle?: string,
 *   responsePath?: string,
 * }} input
 */
export function sanitizeAccessoryCommercialPayload(input = {}) {
  const query = cleanText(input.query || "");
  const pricesIn = Array.isArray(input.prices) ? input.prices.map((entry) => ({ ...entry })) : [];
  const rankedIn = Array.isArray(input.rankedCandidates) ? [...input.rankedCandidates] : [];
  const responsePath = cleanText(input.responsePath || "");
  const compatibleTitle = resolveCompatibleOfferTitle(
    query,
    input.selectedOfferTitle,
    pricesIn
  );

  const decision = buildAccessoryWinnerPropagationDecision({
    query,
    winnerProduct: input.winnerProduct,
    prices: pricesIn,
    selectedOfferTitle: compatibleTitle || input.selectedOfferTitle,
    reply: input.reply,
    responsePath,
  });

  let prices = pricesIn;
  let reply = input.reply;
  let rankedCandidates = rankedIn;
  let winnerProductForCommercial = input.winnerProduct || null;
  let responseAdjusted = decision.responseAdjusted;

  if (!decision.blocked) {
    return {
      ...decision,
      prices,
      reply,
      rankedCandidates,
      winnerProductForCommercial,
      winnerProductInternal: input.winnerProduct || null,
      responseAdjusted,
    };
  }

  if (prices.length > 0) {
    const first = { ...prices[0] };
    const currentName = productDisplayName(first);
    if (!isOfferCompatibleWithAccessoryIntent({ query, offer: { title: currentName } })) {
      if (compatibleTitle) {
        first.product_name = compatibleTitle;
        prices = [first, ...prices.slice(1)];
      } else {
        prices = [];
      }
    }
  }

  rankedCandidates = filterAccessoryCompatibleCandidates(query, rankedIn);

  if (compatibleTitle && prices[0]) {
    winnerProductForCommercial = {
      ...(input.winnerProduct || prices[0] || {}),
      product_name: compatibleTitle,
    };
  } else {
    winnerProductForCommercial = null;
  }

  if (
    responsePath === "commercial_only_fallback" &&
    replyMentionsIncompatibleMainProduct(query, reply, decision.winnerBefore)
  ) {
    reply = buildAccessoryPropagationNeutralFallbackReply(query, compatibleTitle || null);
    responseAdjusted = true;
  } else if (responsePath === "commercial_only_fallback" && decision.blocked && !compatibleTitle) {
    reply = buildAccessoryPropagationNeutralFallbackReply(query, null);
    responseAdjusted = true;
  }

  return {
    ...decision,
    cardProductAfter: productDisplayName(prices[0]) || decision.cardProductAfter || null,
    prices,
    reply,
    rankedCandidates,
    winnerProductForCommercial,
    winnerProductInternal: input.winnerProduct || null,
    responseAdjusted,
  };
}

/**
 * @param {Record<string, unknown>} decision
 */
export function buildAccessoryWinnerPropagationDiagnostics(decision = {}) {
  return {
    blocked: decision.blocked === true,
    reason: decision.reason || null,
    winnerBefore: decision.winnerBefore || null,
    winnerAfter: decision.winnerAfter ?? null,
    cardProductBefore: decision.cardProductBefore || null,
    cardProductAfter: decision.cardProductAfter ?? null,
    runnerUpBlocked: decision.runnerUpBlocked === true,
    responseAdjusted: decision.responseAdjusted === true,
  };
}
