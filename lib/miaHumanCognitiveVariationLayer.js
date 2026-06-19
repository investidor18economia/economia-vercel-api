/**
 * PATCH 9.1I — Human Cognitive Variation Layer
 *
 * Reorganiza blocos cognitivos já gerados sem alterar conteúdo, winner ou raciocínio.
 */

import { extractBudget } from "./miaRoutingSafety.js";
import { findInventedSpecViolations } from "./miaProductExplanationBuilder.js";
import { INSIGHT_MARKER_PATTERN } from "./miaExpertInsightGenerationLayer.js";
import { cleanupMiaHumanLanguage } from "./miaAntiAiLanguageCleanupLayer.js";

export const HUMAN_COGNITIVE_VARIATION_VERSION = "9.1I.1";

export const NARRATIVE_PATTERNS = Object.freeze({
  DIRECT_DECISION_FIRST: "DIRECT_DECISION_FIRST",
  EVIDENCE_FIRST: "EVIDENCE_FIRST",
  RISK_FIRST: "RISK_FIRST",
  BUDGET_FIRST: "BUDGET_FIRST",
  COMPACT_CONSULTANT: "COMPACT_CONSULTANT",
  STANDARD: "STANDARD",
});

export const COGNITIVE_VARIATION_FLAGS = Object.freeze({
  MISSING_VARIATION: "MISSING_VARIATION",
  WINNER_CHANGED: "WINNER_CHANGED",
  EVIDENCE_LOST: "EVIDENCE_LOST",
  INSIGHT_LOST: "INSIGHT_LOST",
  TRADEOFF_LOST: "TRADEOFF_LOST",
  CONTENT_LOST: "CONTENT_LOST",
  INVENTED_CONTENT: "INVENTED_CONTENT",
  REGRESSION_9_1X: "REGRESSION_9_1X",
});

const EVIDENCE_MARKER_PATTERN =
  /(?:um )?detalhe que muita gente ignora|tem um ponto que ajudou|quase ningu[eé]m presta aten[cç][aã]o|é exatamente aqui que ele ganha for[cç]a|foi esse detalhe que fez diferen[cç]a|muitos acabam olhando s[oó] pre[cç]o e esquecem que/i;

const RECOVERY_INTERACTION_TYPES = new Set([
  "contradiction_recovery",
  "user_confusion_recovery",
  "escalated_confusion_recovery",
  "post_change_recovery",
  "final_decision_scope",
]);

const PATTERN_ORDERS = Object.freeze({
  [NARRATIVE_PATTERNS.DIRECT_DECISION_FIRST]: [
    "decision",
    "insight",
    "evidence",
    "tradeoff",
    "budget",
    "authority",
    "stakes",
    "support",
    "intent",
  ],
  [NARRATIVE_PATTERNS.EVIDENCE_FIRST]: [
    "decision",
    "evidence",
    "insight",
    "tradeoff",
    "budget",
    "authority",
    "stakes",
    "support",
    "intent",
  ],
  [NARRATIVE_PATTERNS.RISK_FIRST]: [
    "decision",
    "authority",
    "insight",
    "evidence",
    "tradeoff",
    "stakes",
    "budget",
    "support",
    "intent",
  ],
  [NARRATIVE_PATTERNS.BUDGET_FIRST]: [
    "budget",
    "decision",
    "evidence",
    "insight",
    "tradeoff",
    "authority",
    "stakes",
    "support",
    "intent",
  ],
  [NARRATIVE_PATTERNS.COMPACT_CONSULTANT]: [
    "decision",
    "evidence",
    "insight",
    "tradeoff",
    "budget",
    "intent",
    "authority",
    "stakes",
    "support",
  ],
  [NARRATIVE_PATTERNS.STANDARD]: [
    "budget",
    "decision",
    "evidence",
    "insight",
    "authority",
    "stakes",
    "tradeoff",
    "support",
    "intent",
  ],
});

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeForMatch(text = "") {
  return cleanText(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function seedFromText(text = "") {
  return Array.from(String(text || "")).reduce(
    (acc, char) => acc + char.charCodeAt(0),
    0
  );
}

export function classifyCognitiveBlock(text = "") {
  const body = cleanText(text);
  if (!body) return "support";

  if (/^✅|Resumindo o que você ganha|Na prática, a escolha fica assim|Se você seguir por esse caminho/i.test(body)) {
    return "tradeoff";
  }

  if (/\?\s*$/.test(body) && /(prioriza|peso mais|uso principal|me conta|antes de fechar|o que pesa|você pretende|qual desses)/i.test(body)) {
    return "intent";
  }

  if (EVIDENCE_MARKER_PATTERN.test(body)) return "evidence";
  if (INSIGHT_MARKER_PATTERN.test(body)) return "insight";

  if (
    /muita gente|costuma enganar|separar uma boa compra|n[uú]mero mais chamativo|ficha t[eé]cnica|vale lembrar que/i.test(
      body
    ) &&
    !EVIDENCE_MARKER_PATTERN.test(body) &&
    !INSIGHT_MARKER_PATTERN.test(body)
  ) {
    return "authority";
  }

  if (/Isso importa porque|O ponto principal|Na prática, a vantagem|Se você seguir por esse caminho/i.test(body)) {
    return "stakes";
  }

  if (
    /\b(com r\$|limite de r\$|faixa de r\$|at[eé]\s*r\$|orçamento|orcamento)\b/i.test(body) &&
    body.length < 200 &&
    !/\b(minha escolha|eu iria|ficou no topo)\b/i.test(body)
  ) {
    return "budget";
  }

  if (/\b(minha escolha|eu iria|ficou no topo|vence no ponto|decis[aã]o mais segura|venceu aqui)\b/i.test(body)) {
    return "decision";
  }

  return "support";
}

export function splitReplyIntoCognitiveBlocks(text = "") {
  const body = String(text || "").trim();
  if (!body) return [];

  const paragraphChunks = body
    .split(/\n\s*\n/)
    .map((entry) => cleanText(entry))
    .filter(Boolean);

  if (paragraphChunks.length > 1) {
    return paragraphChunks.map((entry) => ({
      type: classifyCognitiveBlock(entry),
      text: entry,
    }));
  }

  const segments = [];
  const splitPattern =
    /(?=(?:Com R\$|Dentro desse limite|Minha escolha|Eu iria|O [A-ZÁÉÍÓÚ][^.]{0,80} ficou no topo|Um detalhe que|Tem um ponto que|Quase ningu|É exatamente aqui|Foi esse detalhe|Muitos acabam|Isso costuma importar|Na prática, isso pesa|Para essa busca, isso muda|O que muita gente não conecta|Isso entra na decisão|Nessa faixa|O ponto que separa|O detalhe que pesa|Isso importa porque|O ponto principal|Na prática, a vantagem|Resumindo o que|Na prática, a escolha|Se você seguir|✅))/g;

  const parts = body.split(splitPattern).map((entry) => cleanText(entry)).filter(Boolean);
  for (const part of parts) {
    segments.push({
      type: classifyCognitiveBlock(part),
      text: part,
    });
  }

  return segments.length ? segments : [{ type: classifyCognitiveBlock(body), text: body }];
}

export function buildVariationSignals(input = {}) {
  const query = cleanText(input.query || "");
  const words = query.split(/\s+/).filter(Boolean);

  return {
    query,
    hasExplicitBudget:
      input.hasExplicitBudget ??
      (!!extractBudget(query) || /\borçamento\b|\bat[eé]\s*\d|\d\s*k\b/i.test(query)),
    rushed:
      input.rushed ??
      input.querySignals?.rushed ??
      /\b(r[aá]pido|urgente|qual compra|direto ao ponto|rapido)\b/i.test(query),
    shortQuery: words.length <= 4,
    indecisive:
      input.indecisive ??
      input.querySignals?.indecisive ??
      /\b(n[aã]o sei|indecis|medo|errar|arrepender|insegur|t[oô] com d[uú]vida)\b/i.test(query),
    lowConfidence:
      input.lowConfidence ??
      (input.searchCognition?.assertiveness === "low" ||
        input.searchCognition?.confidenceLevel === "low"),
    priceSensitive:
      input.priceSensitive ??
      input.querySignals?.priceSensitive ??
      /\b(barato|econom|custo[- ]benef[ií]cio|gastar pouco)\b/i.test(query),
    isFollowUp:
      input.isFollowUp ??
      (!!input.sessionContext?.lastBestProduct?.product_name && !input.routingDecision?.allowNewSearch),
    hasEvidence: !!input.hasEvidence,
    hasExpertInsight: !!input.hasExpertInsight,
    hasTradeoff: !!input.hasTradeoff,
    primaryAxis: cleanText(input.primaryAxis || input.searchCognition?.primaryAxis || ""),
    technical: /\b(spec|ghz|hz|mp|mah|ram|ssd|gpu|dpi|n[uú]cleo|processador)\b/i.test(query),
    informal: /\b(mano|vlw|top|massa|bom e barato|celuar|quero tv)\b/i.test(query),
    typoHeavy: /\b(celuar|notebok|monitr|cadiera)\b/i.test(query),
  };
}

export function selectNarrativePattern(signals = {}) {
  if (signals.isFollowUp) return NARRATIVE_PATTERNS.COMPACT_CONSULTANT;
  if (signals.rushed) return NARRATIVE_PATTERNS.DIRECT_DECISION_FIRST;
  if (signals.indecisive || signals.lowConfidence) return NARRATIVE_PATTERNS.RISK_FIRST;
  if (signals.hasExplicitBudget || signals.priceSensitive) return NARRATIVE_PATTERNS.BUDGET_FIRST;
  if (signals.shortQuery) return NARRATIVE_PATTERNS.DIRECT_DECISION_FIRST;
  if (signals.hasEvidence && signals.hasExpertInsight) return NARRATIVE_PATTERNS.EVIDENCE_FIRST;

  const fallbackVariants = [
    NARRATIVE_PATTERNS.STANDARD,
    NARRATIVE_PATTERNS.EVIDENCE_FIRST,
    NARRATIVE_PATTERNS.DIRECT_DECISION_FIRST,
  ];
  return fallbackVariants[seedFromText(signals.query || "") % fallbackVariants.length];
}

export function buildHumanCognitiveVariationPlan(blocks = [], pattern = NARRATIVE_PATTERNS.STANDARD) {
  const order = PATTERN_ORDERS[pattern] || PATTERN_ORDERS[NARRATIVE_PATTERNS.STANDARD];
  const grouped = Object.fromEntries(order.map((type) => [type, []]));

  for (const block of blocks) {
    const type = grouped[block.type] ? block.type : "support";
    grouped[type].push(block);
  }

  const planned = [];
  for (const type of order) {
    for (const block of grouped[type] || []) {
      planned.push(block);
    }
  }

  return {
    pattern,
    order,
    blocks: planned,
  };
}

function dedupeBlocks(blocks = []) {
  const seen = new Set();
  const output = [];

  for (const block of blocks) {
    const key = normalizeForMatch(block.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(block);
  }

  return output;
}

function verifyPreservation(originalBlocks = [], variedBlocks = [], context = {}) {
  const originalText = normalizeForMatch(originalBlocks.map((b) => b.text).join(" "));
  const variedText = normalizeForMatch(variedBlocks.map((b) => b.text).join(" "));

  for (const block of originalBlocks) {
    const norm = normalizeForMatch(block.text);
    if (norm.length < 24) continue;
    if (variedText.includes(norm)) continue;

    const words = norm.split(" ").filter((w) => w.length > 4);
    if (words.length < 4) {
      return { ok: false, reason: "content_lost", block: block.type };
    }
    const hits = words.filter((w) => variedText.includes(w)).length;
    if (hits / words.length < 0.72) {
      return { ok: false, reason: "content_lost", block: block.type };
    }
  }

  const winner = normalizeForMatch(context.winnerName || context.productName || "");
  if (winner && !variedText.includes(winner)) {
    return { ok: false, reason: "winner_changed" };
  }

  const hadEvidence = originalBlocks.some((b) => b.type === "evidence");
  const hasEvidence = variedBlocks.some((b) => b.type === "evidence");
  if (hadEvidence && !hasEvidence) {
    return { ok: false, reason: "evidence_lost" };
  }

  const hadInsight = originalBlocks.some((b) => b.type === "insight");
  const hasInsight = variedBlocks.some((b) => b.type === "insight");
  if (hadInsight && !hasInsight) {
    return { ok: false, reason: "insight_lost" };
  }

  const hadTradeoff = originalBlocks.some((b) => b.type === "tradeoff");
  const hasTradeoff = variedBlocks.some((b) => b.type === "tradeoff");
  if (hadTradeoff && !hasTradeoff) {
    return { ok: false, reason: "tradeoff_lost" };
  }

  if (originalText.length > 80 && variedText.length < originalText.length * 0.85) {
    return { ok: false, reason: "over_compressed" };
  }

  return { ok: true, reason: null };
}

export function shouldApplyHumanCognitiveVariation(input = {}) {
  if (input.responsePath && input.responsePath !== "return_seguro") return false;
  if (input.intent === "comparison") return false;
  if (RECOVERY_INTERACTION_TYPES.has(input.sessionContext?.lastInteractionType)) return false;
  if (!cleanText(input.reply || "") && !(input.paragraphs || []).length) return false;
  return true;
}

export function applyHumanCognitiveVariation(input = {}) {
  const originalReply = cleanText(input.reply || "");
  const sourceBlocks = Array.isArray(input.blocks)
    ? input.blocks
    : Array.isArray(input.paragraphs) && input.paragraphs.length
      ? input.paragraphs.map((entry) => ({
          type: classifyCognitiveBlock(entry),
          text: cleanText(entry),
        }))
      : splitReplyIntoCognitiveBlocks(originalReply);

  if (!sourceBlocks.length) {
    return { ok: false, text: originalReply, paragraphs: [], pattern: null, error: "empty" };
  }

  const blocks = dedupeBlocks(sourceBlocks);

  if (!shouldApplyHumanCognitiveVariation(input)) {
    return {
      ok: false,
      text: originalReply,
      paragraphs: sourceBlocks.map((b) => b.text),
      pattern: null,
      error: "suppressed",
    };
  }

  const signals = buildVariationSignals({
    ...input,
    hasEvidence: blocks.some((b) => b.type === "evidence"),
    hasExpertInsight: blocks.some((b) => b.type === "insight"),
    hasTradeoff: blocks.some((b) => b.type === "tradeoff"),
  });

  const pattern = input.pattern || selectNarrativePattern(signals);
  const plan = buildHumanCognitiveVariationPlan(blocks, pattern);

  const preservation = verifyPreservation(blocks, plan.blocks, input);
  if (!preservation.ok) {
    return {
      ok: false,
      text: originalReply,
      paragraphs: blocks.map((b) => b.text),
      pattern,
      signals,
      error: preservation.reason,
    };
  }

  const joined = plan.blocks.map((b) => b.text).join("\n\n");
  const violations = findInventedSpecViolations(
    joined,
    input.allowedEvidence || input.winnerName || ""
  );

  if (violations.length > 0) {
    return {
      ok: false,
      text: originalReply,
      paragraphs: blocks.map((b) => b.text),
      pattern,
      error: "invented_content",
    };
  }

  return {
    ok: true,
    text: joined,
    paragraphs: plan.blocks.map((b) => b.text),
    pattern,
    signals,
    blockOrder: plan.blocks.map((b) => b.type),
    error: null,
  };
}

export function finalizeReplyWithHumanCognitiveVariation(input = {}) {
  const varied = applyHumanCognitiveVariation(input);
  if (!varied.ok) return varied;

  const cleaned =
    cleanupMiaHumanLanguage(varied.text, {
      allowedEvidence: input.allowedEvidence || "",
      winnerName: input.winnerName || input.productName || "",
      preserveStructure: true,
    }).text || varied.text;

  return {
    ...varied,
    text: cleaned,
  };
}

export function extractBlockOrderFromReply(reply = "") {
  return splitReplyIntoCognitiveBlocks(reply).map((block) => block.type);
}

export function auditHumanCognitiveVariation(before = "", after = "", context = {}) {
  const flags = [];
  const beforeBlocks = splitReplyIntoCognitiveBlocks(before);
  const afterBlocks = splitReplyIntoCognitiveBlocks(after);

  const preservation = verifyPreservation(beforeBlocks, afterBlocks, context);
  if (!preservation.ok) {
    if (preservation.reason === "winner_changed") flags.push(COGNITIVE_VARIATION_FLAGS.WINNER_CHANGED);
    if (preservation.reason === "evidence_lost") flags.push(COGNITIVE_VARIATION_FLAGS.EVIDENCE_LOST);
    if (preservation.reason === "insight_lost") flags.push(COGNITIVE_VARIATION_FLAGS.INSIGHT_LOST);
    if (preservation.reason === "tradeoff_lost") flags.push(COGNITIVE_VARIATION_FLAGS.TRADEOFF_LOST);
    if (preservation.reason === "content_lost") flags.push(COGNITIVE_VARIATION_FLAGS.CONTENT_LOST);
  }

  if (context.expectVariation && normalizeForMatch(before) === normalizeForMatch(after)) {
    flags.push(COGNITIVE_VARIATION_FLAGS.MISSING_VARIATION);
  }

  if (findInventedSpecViolations(after, context.allowedEvidence || "").length > 0) {
    flags.push(COGNITIVE_VARIATION_FLAGS.INVENTED_CONTENT);
  }

  return flags;
}

export function buildHumanCognitiveVariationAuditRecord(input = {}) {
  const before = cleanText(input.before || "");
  const afterResult = finalizeReplyWithHumanCognitiveVariation(input);
  const flags = auditHumanCognitiveVariation(before, afterResult.text || before, {
    expectVariation: !!input.expectVariation,
    winnerName: input.winnerName || input.productName || "",
    allowedEvidence: input.allowedEvidence || "",
  });

  return {
    pattern: afterResult.pattern || null,
    blockOrder: afterResult.blockOrder || [],
    variationApplied: afterResult.ok,
    flags,
    text: afterResult.text || before,
    ok: afterResult.ok && flags.length === 0,
  };
}
