/**
 * PATCH 9.2S — Authority Bridge Layer
 *
 * Deriva razões de autoridade e contrato de fechamento a partir da decisão,
 * tradeoffs e sensações — sem templates genéricos de encerramento.
 */

import { extractBudget } from "./miaRoutingSafety.js";

export const AUTHORITY_BRIDGE_VERSION = "9.2S.1";

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function capitalizeLead(text = "") {
  const body = cleanText(text);
  if (!body) return "";
  return body.charAt(0).toUpperCase() + body.slice(1);
}

function resolveDominance(searchCognition = {}) {
  const assertiveness = cleanText(searchCognition.assertiveness || "").toLowerCase();
  if (searchCognition.dominance === "clear" || assertiveness === "high") return "clear";
  if (assertiveness === "low") return "low";
  return "moderate";
}

function buildAxisAlignmentReason(winner = "", primaryAxis = "", query = "") {
  const axis = cleanText(primaryAxis);
  const product = cleanText(winner);
  if (!product || !axis) return null;

  const axisLabels = {
    performance: "desempenho no uso que você descreveu",
    camera: "câmera e registro no uso que você descreveu",
    battery: "autonomia no uso que você descreveu",
    screen: "experiência de tela no uso que você descreveu",
    longevity: "longevidade no uso que você descreveu",
    value: "custo-benefício no uso que você descreveu",
    storage: "espaço no uso que você descreveu",
  };

  const axisLabel = axisLabels[axis] || "o que pesa mais na busca";
  return {
    type: "decision_alignment",
    reason: `${product} continua alinhado a ${axisLabel}`,
    derivedFrom: `winner:${product}|axis:${axis}|query:${query.slice(0, 40)}`,
    weight: 0.9,
  };
}

function buildSensationSupportReason(sensation = {}, primaryAxis = "") {
  if (!sensation?.sensation) return null;
  return {
    type: "sensation_support",
    reason: sensation.sensation,
    derivedFrom: sensation.sourceToken || sensation.perceptionClass || "sensation",
    perceptionClass: sensation.perceptionClass || "",
    weight: Number(sensation.confidence || 0.7),
  };
}

function buildTradeoffAcceptanceReason(sacrifice = {}, sensation = null) {
  const safeSacrifice = sacrifice && typeof sacrifice === "object" ? sacrifice : {};
  const text = cleanText(safeSacrifice.text || (typeof sacrifice === "string" ? sacrifice : ""));
  if (!text || text.length < 8 || /^o$/i.test(text)) return null;

  const frictionHint =
    sensation?.perceptionClass === "friction" || sensation?.perceptionClass === "adaptation"
      ? sensation.sensation
      : "";

  return {
    type: "tradeoff_acceptance",
    reason: frictionHint
      ? `mesmo com ${text.toLowerCase()}, ${frictionHint}`
      : `mesmo com ${text.toLowerCase()}, o ganho principal ainda pesa mais no seu caso`,
    derivedFrom: safeSacrifice.token || safeSacrifice.field || "tradeoff_sacrifice",
    sacrificeText: text,
    weight: 0.75,
  };
}

/**
 * @param {{
 *   winner?: string,
 *   winnerName?: string,
 *   dominance?: string,
 *   searchCognition?: Record<string, unknown>,
 *   tradeoffs?: { gains?: string[], sacrifices?: string[] },
 *   sensations?: Array<Record<string, unknown>>,
 *   confidence?: number,
 *   primaryAxis?: string,
 *   query?: string,
 *   querySignals?: Record<string, unknown>,
 * }} input
 */
export function buildAuthorityBridge(input = {}) {
  const winner = cleanText(input.winner || input.winnerName || "");
  const query = cleanText(input.query || "");
  const primaryAxis = cleanText(
    input.primaryAxis || input.searchCognition?.primaryAxis || ""
  );
  const dominance = input.dominance || resolveDominance(input.searchCognition || {});
  const sensations = input.sensations || [];
  const sacrifices = (input.tradeoffs?.sacrifices || []).map((entry) =>
    typeof entry === "string" ? { text: entry } : entry
  );
  const topSensation = sensations[0] || null;
  const primarySacrifice = sacrifices[0] || null;

  const authorityReasons = [];

  const alignment = buildAxisAlignmentReason(winner, primaryAxis, query);
  if (alignment) authorityReasons.push(alignment);

  const sensationReason = buildSensationSupportReason(topSensation, primaryAxis);
  if (sensationReason) authorityReasons.push(sensationReason);

  const tradeoffReason = buildTradeoffAcceptanceReason(primarySacrifice, topSensation);
  if (tradeoffReason) authorityReasons.push(tradeoffReason);

  const budget = extractBudget(query);
  if (budget != null) {
    authorityReasons.push({
      type: "budget_fit",
      reason: `dentro da faixa que você colocou, a escolha ainda fecha o que pesa mais`,
      derivedFrom: `budget:${budget}`,
      weight: 0.65,
    });
  }

  const confidence =
    input.confidence ??
    Math.min(
      0.95,
      authorityReasons.reduce((acc, item) => acc + Number(item.weight || 0), 0) /
        Math.max(authorityReasons.length, 1)
    );

  const closingAuthority = {
    winnerName: winner,
    dominance,
    primaryAxis,
    confidence,
    acceptedTradeoffs: sacrifices.map((entry) => ({
      text: cleanText(entry.text || entry),
      token: cleanText(entry.token || ""),
      sensation: topSensation?.perceptionClass === "friction" ? topSensation.sensation : "",
    })),
    sustainingReasons: authorityReasons.filter((entry) => entry.type !== "tradeoff_acceptance"),
    tradeoffReason: tradeoffReason || null,
    derivedFromDecision: true,
    version: AUTHORITY_BRIDGE_VERSION,
  };

  return {
    ok: authorityReasons.length > 0,
    authorityReasons,
    closingAuthority,
    version: AUTHORITY_BRIDGE_VERSION,
  };
}

/**
 * Verbaliza fechamento a partir do contrato de autoridade — vocabulário derivado, não meta fallback.
 * @param {ReturnType<typeof buildAuthorityBridge>["closingAuthority"]} closingAuthority
 * @param {{ winnerName?: string }} [signals]
 */
export function verbalizeClosingFromAuthority(closingAuthority = {}, signals = {}) {
  if (!closingAuthority?.derivedFromDecision) return "";

  const winner = cleanText(closingAuthority.winnerName || signals.winnerName || "");
  const sustaining = closingAuthority.sustainingReasons || [];
  const tradeoff = closingAuthority.tradeoffReason;
  const alignment = sustaining.find((entry) => entry.type === "decision_alignment");
  const support = sustaining.find((entry) => entry.type === "sensation_support");

  if (tradeoff?.reason && alignment?.reason) {
    const winnerRef = winner ? `o ${winner}` : "essa escolha";
    return capitalizeLead(`${tradeoff.reason} — por isso eu manteria ${winnerRef}.`);
  }

  if (support?.reason && winner) {
    return capitalizeLead(
      `Por isso, eu manteria o ${winner}: ${support.reason}.`
    );
  }

  if (alignment?.reason) {
    return capitalizeLead(`${alignment.reason}.`);
  }

  return "";
}

export function classifyClosingOrigin(closingAuthority = {}, closingText = "") {
  if (!closingText) return "neutral";
  if (!closingAuthority?.derivedFromDecision) return "template";
  if (/pr[oó]ximo passo que eu seguiria com o que voc[eê] trouxe/i.test(closingText)) {
    return "template";
  }
  if (closingAuthority.tradeoffReason && /manteria|fecharia|continua alinhado/i.test(closingText)) {
    return "real";
  }
  if (/manteria|continua alinhado|ainda pesa mais/i.test(closingText)) {
    return "weak";
  }
  return "neutral";
}

export function isAuthorityDerivedClosing(closingAuthority = {}) {
  return Boolean(
    closingAuthority?.derivedFromDecision &&
      Array.isArray(closingAuthority.sustainingReasons) &&
      closingAuthority.sustainingReasons.length > 0
  );
}
