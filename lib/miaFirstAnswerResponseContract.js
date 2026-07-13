/**
 * PATCH 10.1B — First Answer Structure + Source Display Cleanup
 *
 * Camada de apresentação/contrato da primeira resposta comercial.
 * Não altera winner, ranking, scoring ou Product Resolution Lock (10.1A).
 */

import { humanizeDataLayerText } from "./miaDataLayerHumanizationGuard.js";
import {
  containsBannedConsequenceGenericPhrase,
  translateDataLayerFieldsToConsequences,
} from "./miaConsequenceTranslationLayer.js";
import { renderTradeoffPresentationBlock } from "./miaSpecialistPresentationContract.js";
import {
  logComparativeRunnerUpAudit,
  resolveComparativeRunnerUpReasoning,
} from "./miaComparativeRunnerUpReasoning.js";
import {
  logGenericQueryClarificationClosingAudit,
  resolveGenericQueryClarificationClosing,
} from "./miaGenericQueryClarificationClosing.js";
import {
  buildAccessoryWinnerPropagationDiagnostics,
  sanitizeAccessoryCommercialPayload,
} from "./commercial/accessoryCognitiveWinnerPropagationGuard.js";

export const FIRST_ANSWER_RESPONSE_CONTRACT_VERSION = "10.1B.4";

const FIRST_ANSWER_RESPONSE_PATHS = new Set([
  "return_seguro",
  "commercial_only_fallback",
  "legacy_llm_search",
]);

const TECHNICAL_SOURCE_MAP = Object.freeze({
  query_product_anchor: "Data Layer MIA",
  query_product_anchor_provider: "Data Layer MIA",
});

const NEUTRAL_SACRIFICE =
  "O ponto de atenção é confirmar preço, garantia e condição da oferta antes de decidir.";

const BANNED_REPLY_PATTERNS = Object.freeze([
  /risco de arrependimento quando o uso real não cobre o que a busca pediu/gi,
  /pode não combinar com o perfil de uso descrito/gi,
  /vale comparar preço, garantia, prazo de entrega, reputação/gi,
]);

const FALSE_SACRIFICE_PATTERNS = Object.freeze([
  /menos sensação de limite/i,
  /menos microinterrup/i,
  /sem sentir que o aparelho está no limite/i,
  /mais folga operacional/i,
  /mais conforto no uso/i,
  /mais fluidez no cotidiano/i,
]);

const GENERIC_OPENING_PATTERNS = Object.freeze([
  /aparece como a opção mais alinhada/i,
  /parece uma opção interessante para quem está comparando ofertas/i,
  /boa opção equilibrada/i,
  /bem equilibrada, com bom desempenho para o dia a dia/i,
]);

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function preserveReplyStructure(value = "") {
  return String(value || "")
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

function normalizeSingleLineSection(value = "") {
  return cleanText(value);
}

function capitalizeLead(text = "") {
  const body = cleanText(text);
  if (!body) return "";
  return body.charAt(0).toUpperCase() + body.slice(1);
}

function humanizeFieldText(text = "") {
  const raw = cleanText(text);
  if (!raw) return "";
  const humanized = humanizeDataLayerText(raw);
  if (humanized.ok && humanized.text) return humanized.text;
  if (!containsBannedConsequenceGenericPhrase(raw) && raw.length >= 8) {
    return capitalizeLead(raw.replace(/[_|]/g, " "));
  }
  return "";
}

function cleanList(value, max = 3) {
  if (Array.isArray(value)) {
    return value.map((entry) => cleanText(entry)).filter(Boolean).slice(0, max);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/[;|,]/)
      .map((entry) => cleanText(entry))
      .filter(Boolean)
      .slice(0, max);
  }
  return [];
}

export function sanitizeDisplaySource(source = "") {
  const raw = cleanText(source);
  if (!raw) return "Data Layer MIA";
  const key = raw.toLowerCase();
  if (TECHNICAL_SOURCE_MAP[key]) return TECHNICAL_SOURCE_MAP[key];
  if (/query_product_anchor|product_anchor/i.test(key)) return "Data Layer MIA";
  return raw;
}

export function sanitizeFirstAnswerPrices(prices = []) {
  if (!Array.isArray(prices)) return [];
  return prices.map((price) => ({
    ...price,
    source: sanitizeDisplaySource(price?.source),
    offer_status: price?.link ? price.offer_status || "available" : "offer_pending",
  }));
}

export function isFalseSacrificeText(text = "") {
  const body = cleanText(text);
  if (!body) return true;
  if (FALSE_SACRIFICE_PATTERNS.some((pattern) => pattern.test(body))) return true;
  if (/^menos .+(limite|interrup|atrito|espera)/i.test(body)) return true;
  return false;
}

export function sanitizeSacrificeItems(items = []) {
  const cleaned = (Array.isArray(items) ? items : [])
    .map((entry) => cleanText(entry))
    .filter(Boolean)
    .filter((entry) => !isFalseSacrificeText(entry))
    .filter((entry) => !containsBannedConsequenceGenericPhrase(entry));

  if (!cleaned.length) return [NEUTRAL_SACRIFICE];
  return cleaned.slice(0, 2);
}

export function sanitizeGainItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((entry) => humanizeFieldText(entry))
    .filter(Boolean)
    .filter((entry) => entry.length >= 8)
    .filter((entry) => !containsBannedConsequenceGenericPhrase(entry))
    .filter((entry) => !isFalseSacrificeText(entry))
    .slice(0, 3);
}

function dedupeWeightedPhraseInParagraph(text = "") {
  let body = cleanText(text);
  if (!body) return "";
  let seen = false;
  body = body.replace(/pesa mais do que parece/gi, (match) => {
    if (seen) return "";
    seen = true;
    return match;
  });
  body = body.replace(/bom desempenho para o dia a dia/gi, (match, offset) => {
    if (body.toLowerCase().indexOf("bom desempenho para o dia a dia") !== offset) {
      return "";
    }
    return match;
  });
  return body.replace(/\s+/g, " ").replace(/\s+([,.!?])/g, "$1").trim();
}

function dedupeWeightedPhrase(text = "") {
  const body = preserveReplyStructure(text);
  if (!body) return "";

  return body
    .split(/\n\s*\n/)
    .map((paragraph) => dedupeWeightedPhraseInParagraph(paragraph))
    .filter(Boolean)
    .join("\n\n");
}

export function sanitizeFirstAnswerReplyText(reply = "") {
  let body = preserveReplyStructure(reply);
  if (!body) return "";

  for (const pattern of BANNED_REPLY_PATTERNS) {
    body = body.replace(pattern, "").trim();
  }

  body = dedupeWeightedPhrase(body);
  return preserveReplyStructure(body);
}

export function extractGainsAndSacrificesFromProduct(product = {}) {
  const specs = product.trustedSpecs || product || {};
  const translated = translateDataLayerFieldsToConsequences(specs);
  const isQueryAnchor =
    product?.specificProductQueryAnchor === true ||
    /query_product_anchor/i.test(String(product?.source || "")) ||
    /query_product_anchor/i.test(String(product?.provider || ""));

  const fromPresentation = {
    gains: cleanList(product?.presentation?.tradeoff?.gains, 3),
    sacrifices: cleanList(product?.presentation?.tradeoff?.sacrifices, 2),
  };

  let gains = sanitizeGainItems([
    ...fromPresentation.gains,
    ...cleanList(translated.strengths?.map((item) => item?.consequence || item), 3),
    ...cleanList(translated.idealFor?.map((item) => item?.consequence || item), 2),
  ]);

  const sacrifices = sanitizeSacrificeItems([
    ...fromPresentation.sacrifices,
    ...cleanList(translated.weaknesses?.map((item) => item?.consequence || item), 2),
    ...cleanList(translated.avoidIf?.map((item) => item?.consequence || item), 2),
    ...cleanList(translated.riskNotes?.map((item) => item?.consequence || item), 1),
  ]);

  if (isQueryAnchor) {
    gains = sanitizeGainItems([
      "Atende diretamente o modelo que você citou nesta busca",
      ...gains.filter((entry) => !/bom desempenho para o dia a dia/i.test(entry)),
    ]);
  }

  if (!gains.length) {
    gains.push("Combina com o foco principal desta busca");
  }

  return {
    gains: gains.slice(0, 3),
    sacrifices: sacrifices.slice(0, 2),
  };
}

function stripTradeoffTail(text = "") {
  return cleanText(text)
    .replace(/\n\n✅[\s\S]*$/u, "")
    .replace(/\n\n⚠️[\s\S]*$/u, "")
    .replace(/\n\nEsse é o próximo passo[\s\S]*$/i, "")
    .replace(/\n\nPor aqui, eu fecharia[\s\S]*$/i, "")
    .replace(/\n\nMesmo com[\s\S]*$/i, "")
    .trim();
}

function pickPrimaryGain(gains = [], winnerName = "") {
  const first = sanitizeGainItems(gains)[0];
  if (first) return first.replace(/\.$/, "");
  return `o ${winnerName} responde ao que você pediu`;
}

function pickConsequenceParagraph(gains = [], query = "") {
  const gain = pickPrimaryGain(gains);
  if (/modelo que você citou|foco principal/i.test(gain)) {
    return `Na prática, escolher o modelo certo evita cair em alternativa parecida que não era o que você pediu.`;
  }
  return `Na prática, ${gain.charAt(0).toLowerCase()}${gain.slice(1)} tende a aparecer no uso real — não só no anúncio.`;
}

function pickDominantReason(gains = [], sacrifices = []) {
  const gain = pickPrimaryGain(gains);
  if (gain && !/combina com o foco principal/i.test(gain)) return gain.replace(/\.$/, "");
  if (sacrifices[0] && sacrifices[0] !== NEUTRAL_SACRIFICE) {
    return "o ganho principal ainda pesa mais do que essa renúncia";
  }
  return "a combinação fecha melhor para esta busca";
}

function pickTradeoffSummary(sacrifices = []) {
  const item = sacrifices.find((entry) => entry !== NEUTRAL_SACRIFICE) || sacrifices[0];
  if (!item || item === NEUTRAL_SACRIFICE) return "esse ponto de atenção";
  return item.replace(/\.$/, "").toLowerCase();
}

function extractSacrificeSection(reply = "") {
  const body = String(reply || "");
  const parts = body.split(/O que voc[eê] abre m[aã]o/i);
  return parts.length > 1 ? parts.slice(1).join(" ") : "";
}

export function matchesStrictFirstAnswerContract(reply = "", winnerName = "") {
  const body = sanitizeFirstAnswerReplyText(reply);
  if (!body) return false;
  if (!/^Eu iria no .+ porque .+\./im.test(body)) return false;
  if (!/O que voc[eê] ganha/i.test(body)) return false;
  if (!/O que voc[eê] abre m[aã]o/i.test(body)) return false;
  if (!/Mesmo com.+eu manteria o/i.test(body)) return false;
  if (BANNED_REPLY_PATTERNS.some((pattern) => pattern.test(body))) return false;
  if (/•\s*\.(?:\s|$)/.test(body)) return false;
  if ((body.match(/O que voc[eê] ganha/gi) || []).length > 1) return false;
  if ((body.match(/Mesmo com/gi) || []).length > 1) return false;

  const sacrificeSection = extractSacrificeSection(body);
  if (sacrificeSection && isFalseSacrificeText(sacrificeSection)) return false;
  if (/menos sensação de limite/i.test(sacrificeSection)) return false;

  if (winnerName) {
    const firstToken = cleanText(winnerName).split(/\s+/)[0];
    if (firstToken && !body.toLowerCase().includes(firstToken.toLowerCase())) return false;
  }

  return true;
}

export function buildFirstAnswerStructuredReply({
  winnerName = "",
  query = "",
  gains = [],
  sacrifices = [],
  comparativeParagraph = "",
  clarificationParagraph = "",
} = {}) {
  const winner = cleanText(winnerName);
  if (!winner) return "";

  const safeGains = sanitizeGainItems(gains);
  const safeSacrifices = sanitizeSacrificeItems(sacrifices);
  const primaryGain = pickPrimaryGain(safeGains, winner);
  const openingGain =
    primaryGain.charAt(0).toLowerCase() + primaryGain.slice(1).replace(/\.$/, "");
  const opening = `Eu iria no ${winner} porque ${openingGain}.`;
  const consequence = pickConsequenceParagraph(safeGains, query);
  const tradeoffBlock = renderTradeoffPresentationBlock({
    gains: safeGains,
    sacrifices: safeSacrifices,
  });
  const closing = `Mesmo com ${pickTradeoffSummary(safeSacrifices)}, eu manteria o ${winner} porque ${pickDominantReason(safeGains, safeSacrifices)}.`;

  return [
    normalizeSingleLineSection(opening),
    normalizeSingleLineSection(comparativeParagraph),
    normalizeSingleLineSection(consequence),
    preserveReplyStructure(tradeoffBlock),
    normalizeSingleLineSection(closing),
    normalizeSingleLineSection(clarificationParagraph),
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

export function hasFirstAnswerStructure(reply = "") {
  const body = String(reply || "");
  return (
    /O que voc[eê] ganha/i.test(body) &&
    /O que voc[eê] abre m[aã]o/i.test(body) &&
    /Eu iria no|Minha escolha|ficou no topo|recomendo/i.test(body)
  );
}

export function isWeakFirstAnswerReply(reply = "", winnerName = "") {
  const body = cleanText(reply);
  if (!body || body.length < 90) return true;
  if (GENERIC_OPENING_PATTERNS.some((pattern) => pattern.test(body))) return true;
  if (BANNED_REPLY_PATTERNS.some((pattern) => pattern.test(body))) return true;
  if (!hasFirstAnswerStructure(body)) return true;
  if (winnerName && !body.toLowerCase().includes(cleanText(winnerName).split(" ")[0]?.toLowerCase())) {
    return false;
  }
  return false;
}

export function shouldApplyFirstAnswerResponseContract(responsePath = "") {
  return FIRST_ANSWER_RESPONSE_PATHS.has(String(responsePath || ""));
}

/**
 * @param {{
 *   reply?: string,
 *   prices?: Array<Record<string, unknown>>,
 *   presentation?: Record<string, unknown>|null,
 *   responsePath?: string,
 *   query?: string,
 *   winnerProduct?: Record<string, unknown>|null,
 *   rankedCandidates?: Array<Record<string, unknown>>,
 *   primaryAxis?: string,
 *   querySignals?: Record<string, unknown>,
 *   specificProductLockActive?: boolean,
 *   specificProductQueryAnchor?: boolean,
 *   dataLayerPrimary?: boolean,
 *   category?: string,
 *   intent?: string,
 *   activePriority?: string,
 *   sessionContext?: Record<string, unknown>|null,
 *   routingDecision?: Record<string, unknown>|null,
 *   isFollowUp?: boolean,
 * }} input
 */
export function applyFirstAnswerResponseContract(input = {}) {
  const responsePath = String(input.responsePath || "");
  const initialWinnerProduct = {
    ...(input.winnerProduct || input.prices?.[0] || {}),
    source:
      input.winnerProduct?.source ||
      input.prices?.[0]?.source ||
      "",
  };
  const sourceBefore = cleanText(
    input.prices?.[0]?.source || initialWinnerProduct?.source || ""
  );
  const prices = sanitizeFirstAnswerPrices(input.prices || []);
  const sourceAfter = cleanText(prices[0]?.source || "");

  let reply = sanitizeFirstAnswerReplyText(input.reply || "");
  const propagation = sanitizeAccessoryCommercialPayload({
    query: input.query || "",
    winnerProduct: input.winnerProduct || initialWinnerProduct,
    prices,
    reply,
    rankedCandidates: input.rankedCandidates || [],
    selectedOfferTitle: prices[0]?.product_name || "",
    responsePath,
  });
  if (propagation.blocked) {
    prices.splice(0, prices.length, ...(propagation.prices || []));
    if (propagation.reply) reply = propagation.reply;
  }
  const rankedCandidatesForRunnerUp = propagation.rankedCandidates || input.rankedCandidates || [];
  const winnerProduct = propagation.winnerProductForCommercial || initialWinnerProduct;
  const winnerName =
    cleanText(winnerProduct?.product_name || winnerProduct?.trustedSpecs?.official_name || "") ||
    cleanText(prices[0]?.product_name || "");
  const accessoryWinnerPropagationDiagnostics =
    buildAccessoryWinnerPropagationDiagnostics(propagation);
  let applied = false;
  let blockedBadTradeoff = false;
  let rebuilt = false;

  const tradeoffSource = {
    ...winnerProduct,
    presentation: input.presentation || winnerProduct?.presentation || null,
  };
  const { gains, sacrifices } = extractGainsAndSacrificesFromProduct(tradeoffSource);
  const rawSacrificeCandidates = [
    ...(input.presentation?.tradeoff?.sacrifices || []),
    ...sacrifices,
  ];
  blockedBadTradeoff = rawSacrificeCandidates.some((entry) => isFalseSacrificeText(entry));
  const filteredSacrifices = sanitizeSacrificeItems(rawSacrificeCandidates);

  const comparativeResult = resolveComparativeRunnerUpReasoning({
    query: input.query || "",
    winner: winnerProduct,
    rankedCandidates: rankedCandidatesForRunnerUp,
    primaryAxis: input.primaryAxis || "",
    querySignals: input.querySignals || {},
    specificProductLockActive: !!input.specificProductLockActive,
    specificProductQueryAnchor: !!input.specificProductQueryAnchor,
    dataLayerPrimary: !!input.dataLayerPrimary,
  });
  const comparativeParagraph = comparativeResult.applied ? comparativeResult.reason : "";
  logComparativeRunnerUpAudit(comparativeResult.audit);

  const clarificationResult = resolveGenericQueryClarificationClosing({
    query: input.query || "",
    reply,
    category: input.category || "",
    intent: input.intent || "",
    activePriority: input.activePriority || input.primaryAxis || "",
    primaryAxis: input.primaryAxis || "",
    querySignals: input.querySignals || {},
    winnerProduct,
    specificProductLockActive: !!input.specificProductLockActive,
    responsePath,
    sessionContext: input.sessionContext || null,
    routingDecision: input.routingDecision || null,
    isFollowUp: !!input.isFollowUp,
  });
  const clarificationParagraph = clarificationResult.applied ? clarificationResult.question : "";
  logGenericQueryClarificationClosingAudit(clarificationResult.audit);

  if (!shouldApplyFirstAnswerResponseContract(responsePath) || !winnerName) {
    return {
      applied: sourceBefore !== sourceAfter,
      reply,
      prices,
      presentation: input.presentation || null,
      audit: {
        applied: sourceBefore !== sourceAfter,
        winner: winnerName,
        sourceBefore,
        sourceAfter,
        gainsCount: gains.length,
        tradeoffsCount: filteredSacrifices.length,
        removedTechnicalSource: sourceBefore !== sourceAfter,
        blockedBadTradeoff,
        rebuilt,
        responsePath,
        comparativeRunnerUpApplied: !!comparativeResult.applied,
        comparativeRunnerUp: comparativeResult.audit?.runnerUp || null,
        clarificationClosingApplied: !!clarificationResult.applied,
      },
    };
  }

  if (!matchesStrictFirstAnswerContract(reply, winnerName)) {
    reply = buildFirstAnswerStructuredReply({
      winnerName,
      query: input.query || "",
      gains,
      sacrifices: filteredSacrifices,
      comparativeParagraph,
      clarificationParagraph,
    });
    applied = true;
    rebuilt = true;
  } else if (
    (comparativeParagraph && !reply.includes(comparativeParagraph)) ||
    (clarificationParagraph && !reply.includes(clarificationParagraph))
  ) {
    reply = buildFirstAnswerStructuredReply({
      winnerName,
      query: input.query || "",
      gains,
      sacrifices: filteredSacrifices,
      comparativeParagraph,
      clarificationParagraph,
    });
    applied = true;
    rebuilt = true;
  } else {
    reply = sanitizeFirstAnswerReplyText(reply);
    applied = true;
  }

  return {
    applied,
    reply,
    prices,
    presentation: input.presentation
      ? {
          ...input.presentation,
          tradeoff: {
            ...(input.presentation.tradeoff || {}),
            gains,
            sacrifices: filteredSacrifices,
          },
        }
      : null,
    audit: {
      applied,
      winner: winnerName,
      sourceBefore,
      sourceAfter,
      gainsCount: gains.length,
      tradeoffsCount: filteredSacrifices.length,
      removedTechnicalSource: sourceBefore !== sourceAfter,
      blockedBadTradeoff,
      rebuilt,
      responsePath,
      comparativeRunnerUpApplied: !!comparativeResult.applied,
      comparativeRunnerUp: comparativeResult.audit?.runnerUp || null,
      clarificationClosingApplied: !!clarificationResult.applied,
    },
    comparativeRunnerUp: comparativeResult.payload,
    genericQueryClarificationClosing: clarificationResult.payload,
  };
}

export function logFirstAnswerStructureContractAudit(audit = {}) {
  console.log(
    "FIRST_ANSWER_STRUCTURE_CONTRACT_AUDIT",
    JSON.stringify({
      version: FIRST_ANSWER_RESPONSE_CONTRACT_VERSION,
      applied: !!audit.applied,
      winner: audit.winner || null,
      sourceBefore: audit.sourceBefore || null,
      sourceAfter: audit.sourceAfter || null,
      gainsCount: audit.gainsCount ?? 0,
      tradeoffsCount: audit.tradeoffsCount ?? 0,
      removedTechnicalSource: !!audit.removedTechnicalSource,
      blockedBadTradeoff: !!audit.blockedBadTradeoff,
      rebuilt: !!audit.rebuilt,
      responsePath: audit.responsePath || "",
    })
  );
}
