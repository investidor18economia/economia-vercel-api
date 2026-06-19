/**
 * PATCH 9.1E — Comparison Experience Layer
 *
 * Transforma decisão comparativa em experiência escaneável.
 * Não altera winner, ranking, routing ou decision engine.
 */

import {
  buildStructuredExplanationFacts,
  findInventedSpecViolations,
} from "./miaProductExplanationBuilder.js";
import { resolveTradeoffCommunicationSources } from "./miaTradeoffCommunicationLayer.js";
import { cleanupMiaHumanLanguage } from "./miaAntiAiLanguageCleanupLayer.js";

export const COMPARISON_EXPERIENCE_LAYER_VERSION = "9.1E.1";

export const COMPARISON_EXPERIENCE_FLAGS = Object.freeze({
  MISSING_WINNER_CALLOUT: "MISSING_WINNER_CALLOUT",
  MISSING_AXIS_ROWS: "MISSING_AXIS_ROWS",
  MISSING_VERDICT: "MISSING_VERDICT",
  NOT_SCANNABLE: "NOT_SCANNABLE",
  PROSE_WALL: "PROSE_WALL",
  TRADEOFF_WORD_LEAK: "TRADEOFF_WORD_LEAK",
  INVENTED_SPEC: "INVENTED_SPEC",
  BROKE_9_1D: "BROKE_9_1D",
  REGRESSION_8X: "REGRESSION_8X",
});

const RECOVERY_INTERACTION_TYPES = new Set([
  "contradiction_recovery",
  "user_confusion_recovery",
  "escalated_confusion_recovery",
  "post_change_recovery",
  "final_decision_scope",
]);

const AXIS_ROWS = Object.freeze([
  { axis: "camera", emoji: "📸", label: "Câmera" },
  { axis: "battery", emoji: "🔋", label: "Bateria" },
  { axis: "longevity", emoji: "⏳", label: "Vai durar mais anos?" },
  { axis: "value", emoji: "💰", label: "Menor custo" },
  { axis: "performance", emoji: "⚡", label: "Desempenho" },
  { axis: "screen", emoji: "🖥️", label: "Tela" },
  { axis: "comfort", emoji: "🪑", label: "Conforto" },
  { axis: "storage", emoji: "💾", label: "Armazenamento" },
]);

const GENERIC_PROSE_PATTERNS = Object.freeze([
  /^o .+ oferece/i,
  /^já o .+/i,
  /^por outro lado/i,
  /^porém,/i,
]);

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function stripTrailingPeriod(text = "") {
  return cleanText(text).replace(/[.!?]+$/, "");
}

function lowercaseLead(text = "") {
  const body = cleanText(text);
  if (!body) return "";
  return body.charAt(0).toLowerCase() + body.slice(1);
}

function seedFromText(text = "") {
  return Array.from(String(text || "")).reduce(
    (acc, char) => acc + char.charCodeAt(0),
    0
  );
}

function pickVariant(items = [], seed = "") {
  const list = items.filter(Boolean);
  if (!list.length) return "";
  return list[seedFromText(seed) % list.length];
}

function resolveProductName(product = null) {
  if (!product || typeof product !== "object") return "";
  return cleanText(
    product.trustedSpecs?.official_name ||
      product.official_name ||
      product.productName ||
      product.product_name ||
      product.title ||
      ""
  );
}

function resolveAxisScore(product = null, axis = "") {
  const scores =
    product?.scoreEngine?.scores ||
    product?.scores ||
    product?.trustedSpecs?.scores ||
    {};

  const raw = scores[axis];
  if (raw == null || Number.isNaN(Number(raw))) return null;
  return Number(raw);
}

const GENERIC_GAIN_PATTERNS = Object.freeze([
  /tranquilidade para manter o equipamento por mais tempo/i,
  /margem de tranquilidade quando o uso deixa de ser básico/i,
  /folga no uso exigente do dia a dia/i,
]);

const GENERIC_SACRIFICE_PATTERNS = Object.freeze([
  /autonomia acima da média da categoria/i,
  /preço ainda mais baixo em opções mais básicas/i,
  /o custo tende a pesar mais na comparação/i,
]);

function isGenericComparisonConsequence(text = "") {
  const body = cleanText(text);
  if (!body) return true;
  return (
    GENERIC_GAIN_PATTERNS.some((pattern) => pattern.test(body)) ||
    GENERIC_SACRIFICE_PATTERNS.some((pattern) => pattern.test(body))
  );
}

function cleanList(value, max = 2) {
  if (Array.isArray(value)) {
    return value.map((entry) => cleanText(entry)).filter(Boolean).slice(0, max);
  }
  if (typeof value === "string" && value.trim()) {
    return [cleanText(value)].slice(0, max);
  }
  return [];
}

function humanizeStrengthGain(text = "") {
  return stripTrailingPeriod(text)
    .replace(/^tende a ajudar com\s+/i, "")
    .replace(/\s+no uso cotidiano$/i, "")
    .trim();
}

function formatGainLine(text = "", seed = "") {
  const body = humanizeStrengthGain(text);
  if (!body) return "";
  if (/^ganha\b/i.test(body)) return `✅ ${body}`;
  return `✅ ${pickVariant(
    [(entry) => `ganha ${lowercaseLead(entry)}`, (entry) => `você leva ${lowercaseLead(entry)}`],
    seed
  )(body)}`;
}

function formatSacrificeLine(text = "", seed = "", index = 0) {
  const body = stripTrailingPeriod(text);
  if (!body) return "";
  if (/^(pode|vale|n[aã]o [eé]|nao e)\b/i.test(body)) {
    const cleaned = body.replace(/^pode pesar na decisão:\s*/i, "");
    return index === 0
      ? `⚠️ ${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}`
      : `⚠️ também ${lowercaseLead(cleaned)}`;
  }
  if (/leva vantagem em\b/i.test(body)) {
    return index === 0 ? `⚠️ ${body}` : `⚠️ também ${lowercaseLead(body)}`;
  }
  if (/\b(menor|mais lento|mais pesad|limitad|n[aã]o [eé]|pode ser)\b/i.test(body)) {
    return index === 0
      ? `⚠️ ${body.charAt(0).toUpperCase()}${body.slice(1)}`
      : `⚠️ também ${lowercaseLead(body)}`;
  }
  const frame =
    index === 0
      ? (entry) => `abre mão de ${lowercaseLead(entry)}`
      : (entry) => `não terá ${lowercaseLead(entry)}`;
  return index === 0 ? `⚠️ ${frame(body)}` : `⚠️ também ${frame(body).replace(/^em troca,\s*/i, "")}`;
}

export function shouldApplyComparisonExperience(input = {}) {
  const intent = cleanText(input.intent || "").toLowerCase();
  if (intent && intent !== "comparison") {
    return false;
  }

  if (input.sessionContext?.lastInteractionType && RECOVERY_INTERACTION_TYPES.has(input.sessionContext.lastInteractionType)) {
    return false;
  }

  const products = Array.isArray(input.products) ? input.products : [];
  const winner = input.winner || input.runnerUp || null;
  if (products.length < 2 && !winner) {
    return false;
  }

  return true;
}

export function resolveComparisonExperienceSources(input = {}) {
  const products = Array.isArray(input.products) ? input.products.filter(Boolean) : [];
  const winner =
    input.winner ||
    products.find(
      (product) =>
        resolveProductName(product) &&
        resolveProductName(product) === resolveProductName(input.decisionWinner)
    ) ||
    products[0] ||
    null;

  const runnerUp =
    input.runnerUp ||
    input.alternative ||
    products.find((product) => resolveProductName(product) !== resolveProductName(winner)) ||
    products[1] ||
    null;

  const winnerName = resolveProductName(winner);
  const runnerUpName = resolveProductName(runnerUp);

  const priorityAxis = cleanText(
    input.priority ||
      input.primaryAxis ||
      input.comparisonIntentMode?.priority ||
      ""
  );

  const axisRows = [];
  for (const config of AXIS_ROWS) {
    const winnerScore = resolveAxisScore(winner, config.axis);
    const runnerScore = resolveAxisScore(runnerUp, config.axis);
    if (winnerScore == null && runnerScore == null) continue;

    const w = winnerScore ?? 0;
    const r = runnerScore ?? 0;
    if (Math.abs(w - r) < 2.5) continue;

    const leader = w >= r ? winner : runnerUp;
    axisRows.push({
      axis: config.axis,
      emoji: config.emoji,
      label: config.label,
      leaderName: resolveProductName(leader),
      gap: Math.abs(w - r),
      winnerLeads: w >= r,
    });
  }

  axisRows.sort((a, b) => {
    if (priorityAxis) {
      if (a.axis === priorityAxis && b.axis !== priorityAxis) return -1;
      if (b.axis === priorityAxis && a.axis !== priorityAxis) return 1;
    }
    return b.gap - a.gap;
  });

  const structuredFacts = winner
    ? buildStructuredExplanationFacts({
        product: {
          ...winner,
          isDataLayerProduct: !!winner.trustedSpecs,
        },
        query: input.query || "",
        trustedSpecs: winner.trustedSpecs || null,
        hasDataLayer: !!winner.trustedSpecs,
      })
    : null;

  const tradeoffSources = structuredFacts
    ? resolveTradeoffCommunicationSources({
        structuredFacts,
        primaryAxis: priorityAxis,
        decisionMemory: {
          lastWinnerAdvantages: priorityAxis ? [priorityAxis] : [],
          lastWinnerSacrifices: axisRows.find((row) => !row.winnerLeads)?.axis
            ? [axisRows.find((row) => !row.winnerLeads).axis]
            : [],
        },
      })
    : { gains: [], sacrifices: [] };


  const gains = tradeoffSources.gains
    .filter((entry) => !isGenericComparisonConsequence(entry))
    .slice(0, 2);

  const sacrifices = cleanList(winner?.trustedSpecs?.weaknesses, 2).filter(
    (entry) => !isGenericComparisonConsequence(entry)
  );

  if (sacrifices.length < 2) {
    for (const entry of tradeoffSources.sacrifices) {
      if (sacrifices.length >= 2) break;
      if (entry && !isGenericComparisonConsequence(entry) && !sacrifices.includes(entry)) {
        sacrifices.push(entry);
      }
    }
  }

  if (sacrifices.length < 2) {
    const runnerWeaknesses = cleanList(runnerUp?.trustedSpecs?.weaknesses, 1);
    for (const entry of runnerWeaknesses) {
      if (sacrifices.length >= 2) break;
      if (entry && !isGenericComparisonConsequence(entry)) {
        sacrifices.push(`${runnerUpName} ainda leva vantagem onde ${lowercaseLead(entry)}`);
      }
    }
  }

  if (gains.length === 0) {
    for (const entry of cleanList(winner?.trustedSpecs?.strengths, 2).map(humanizeStrengthGain)) {
      if (gains.length >= 2) break;
      if (entry && !isGenericComparisonConsequence(entry)) gains.push(entry);
    }
  }

  if (sacrifices.length === 0) {
    for (const row of axisRows.filter((entry) => !entry.winnerLeads).slice(0, 2)) {
      sacrifices.push(`mais destaque em ${row.label.toLowerCase()} fica com ${row.leaderName}`);
    }
  }

  return {
    winner,
    runnerUp,
    winnerName,
    runnerUpName,
    priorityAxis,
    axisRows: axisRows.slice(0, 3),
    gains: gains.slice(0, 2),
    sacrifices: sacrifices.slice(0, 2),
    allowedEvidence: [winnerName, runnerUpName].filter(Boolean).join(" "),
  };
}

export function isComparisonExperienceScannable(text = "") {
  const body = cleanText(text);
  if (!body || body.length < 80) return false;

  const hasWinnerCallout = /🏆|minha escolha|iria de|iria no/i.test(body);
  const hasAxisMarker = /✅/.test(body) && (/(📸|🔋|⏳|💰|⚡|🖥️|🪑|💾)/.test(body) || /\n/.test(body));
  const hasVerdict = /👉|iria de|meu veredito|minha escolha/i.test(body);

  return hasWinnerCallout && hasAxisMarker && hasVerdict;
}

export function containsComparisonTradeoffWord(text = "") {
  return /\btradeoff\b/i.test(cleanText(text));
}

export function buildComparisonExperienceReply(input = {}) {
  if (!shouldApplyComparisonExperience(input)) {
    return { ok: false, reply: input.reply || "", sources: null, error: "suppressed" };
  }

  const sources = resolveComparisonExperienceSources(input);
  if (!sources.winnerName || !sources.runnerUpName) {
    return { ok: false, reply: input.reply || "", sources, error: "missing_products" };
  }

  if (sources.axisRows.length === 0 && sources.gains.length === 0) {
    return { ok: false, reply: input.reply || "", sources, error: "insufficient_sources" };
  }

  const seed = `${input.query || ""}-${sources.winnerName}-${sources.runnerUpName}`;
  const lines = [];

  lines.push(`🏆 Minha escolha: ${sources.winnerName}`);
  lines.push("");

  for (const row of sources.axisRows) {
    lines.push(`${row.emoji} ${row.label}`);
    lines.push(`✅ ${row.leaderName}`);
    lines.push("");
  }

  const verdictIntro = pickVariant(
    [
      "Se eu estivesse comprando hoje pensando no conjunto da obra:",
      "Fechando a comparação pensando no uso real:",
      "Resumindo a decisão entre os dois:",
    ],
    seed
  );

  lines.push(verdictIntro);
  lines.push(`👉 iria de ${sources.winnerName}.`);
  lines.push("");

  if (sources.gains.length > 0 || sources.sacrifices.length > 0) {
    lines.push("O que você ganha:");
    for (const [index, gain] of sources.gains.entries()) {
      const formatted = formatGainLine(gain, `${seed}-gain-${index}`);
      if (formatted) lines.push(formatted);
    }
    lines.push("");

    if (sources.sacrifices.length > 0) {
      lines.push("O que abre mão:");
      for (const [index, sacrifice] of sources.sacrifices.entries()) {
        const formatted = formatSacrificeLine(sacrifice, `${seed}-sac-${index}`, index);
        if (formatted) lines.push(formatted);
      }
    }
  }

  const reply = lines.join("\n").trim();
  const cleanedReply =
    cleanupMiaHumanLanguage(reply, {
      allowedEvidence: sources.allowedEvidence,
      winnerName: sources.winnerName,
      preserveStructure: true,
    }).text || reply;

  if (!isComparisonExperienceScannable(cleanedReply)) {
    return { ok: false, reply: input.reply || "", sources, error: "not_scannable" };
  }

  if (containsComparisonTradeoffWord(cleanedReply)) {
    return { ok: false, reply: input.reply || "", sources, error: "tradeoff_word_leak" };
  }

  if (findInventedSpecViolations(cleanedReply, sources.allowedEvidence).length > 0) {
    return { ok: false, reply: input.reply || "", sources, error: "invented_spec" };
  }

  return {
    ok: true,
    reply: cleanedReply,
    sources,
    error: null,
  };
}

export function applyComparisonExperienceToDecisionResult(input = {}) {
  const built = buildComparisonExperienceReply({
    reply: input.reply || input.decisionResult?.reply || "",
    winner: input.winner || input.decisionResult?.winner || null,
    runnerUp:
      input.runnerUp ||
      input.alternative ||
      input.decisionResult?.alternative ||
      input.decisionResult?.loser ||
      null,
    products: input.products || input.decisionResult?.productsUsed || [],
    proprietaryReasoning: input.proprietaryReasoning || input.decisionResult?.proprietaryReasoning || null,
    reasoningProfiles: input.reasoningProfiles || input.decisionResult?.reasoningProfiles || [],
    priority: input.priority || input.decisionResult?.priority || "",
    query: input.query || "",
    intent: input.intent || "comparison",
    comparisonIntentMode:
      input.comparisonIntentMode || input.decisionResult?.comparisonIntentMode || null,
    sessionContext: input.sessionContext || {},
  });

  if (built.ok && built.reply) {
    return built.reply;
  }

  return input.reply || input.decisionResult?.reply || "";
}

export function auditComparisonExperience(text = "", context = {}) {
  const flags = [];
  const body = cleanText(text);

  if (context.expectScannable && !isComparisonExperienceScannable(body)) {
    if (!/🏆|minha escolha/i.test(body)) {
      flags.push(COMPARISON_EXPERIENCE_FLAGS.MISSING_WINNER_CALLOUT);
    }
    if (!/✅/.test(body)) {
      flags.push(COMPARISON_EXPERIENCE_FLAGS.MISSING_AXIS_ROWS);
    }
    if (!/👉|iria de|iria no/i.test(body)) {
      flags.push(COMPARISON_EXPERIENCE_FLAGS.MISSING_VERDICT);
    }
    flags.push(COMPARISON_EXPERIENCE_FLAGS.NOT_SCANNABLE);
  }

  if (GENERIC_PROSE_PATTERNS.some((pattern) => pattern.test(body)) && body.length > 280) {
    flags.push(COMPARISON_EXPERIENCE_FLAGS.PROSE_WALL);
  }

  if (containsComparisonTradeoffWord(body)) {
    flags.push(COMPARISON_EXPERIENCE_FLAGS.TRADEOFF_WORD_LEAK);
  }

  if (findInventedSpecViolations(body, context.allowedEvidence || "").length > 0) {
    flags.push(COMPARISON_EXPERIENCE_FLAGS.INVENTED_SPEC);
  }

  return flags;
}

export function extractWinnerFromComparisonReply(reply = "") {
  const match =
    String(reply || "").match(/🏆\s*Minha escolha:\s*(.+?)(?:\n|$)/i) ||
    String(reply || "").match(/👉\s*iria de\s+(.+?)\./i);
  return match ? cleanText(match[1]) : "";
}

export function buildComparisonExperienceAuditRecord(input = {}) {
  const built = buildComparisonExperienceReply(input);
  const flags = auditComparisonExperience(built.reply, {
    expectScannable: true,
    allowedEvidence: built.sources?.allowedEvidence || "",
  });

  return {
    query: input.query || "",
    category: input.category || "",
    winnerName: built.sources?.winnerName || "",
    runnerUpName: built.sources?.runnerUpName || "",
    scannableDetected: isComparisonExperienceScannable(built.reply),
    axisRowsDetected: (built.sources?.axisRows || []).length,
    winnerCalloutDetected: /🏆|minha escolha/i.test(built.reply),
    verdictDetected: /👉|iria de/i.test(built.reply),
    tradeoffWordLeak: flags.includes(COMPARISON_EXPERIENCE_FLAGS.TRADEOFF_WORD_LEAK),
    inventedSpecDetected: flags.includes(COMPARISON_EXPERIENCE_FLAGS.INVENTED_SPEC),
    flags,
    reply: built.reply,
    ok: built.ok && flags.length === 0,
  };
}
