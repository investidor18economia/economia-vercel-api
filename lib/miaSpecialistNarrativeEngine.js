/**
 * PATCH 9.2A — Specialist Narrative Engine
 *
 * Melhora ritmo, hierarquia e escaneabilidade sobre blocos já gerados.
 * Não altera cognição, winner, evidência, insight ou tradeoff.
 */

import { extractBudget } from "./miaRoutingSafety.js";
import { findInventedSpecViolations } from "./miaProductExplanationBuilder.js";
import { INSIGHT_MARKER_PATTERN } from "./miaExpertInsightGenerationLayer.js";
import { cleanupMiaHumanLanguage } from "./miaAntiAiLanguageCleanupLayer.js";
import {
  classifyCognitiveBlock,
  splitReplyIntoCognitiveBlocks,
} from "./miaHumanCognitiveVariationLayer.js";

export const SPECIALIST_NARRATIVE_ENGINE_VERSION = "9.2A.1";

export const NARRATIVE_CLOSING_STYLES = Object.freeze({
  PROFILE_FIT: "PROFILE_FIT",
  BUDGET_FIT: "BUDGET_FIT",
  DIRECT: "DIRECT",
  REASSURANCE: "REASSURANCE",
  CONTINUITY: "CONTINUITY",
  SCENARIO: "SCENARIO",
});

export const NARRATIVE_ENGINE_FLAGS = Object.freeze({
  WINNER_CHANGED: "WINNER_CHANGED",
  TRADEOFF_LOST: "TRADEOFF_LOST",
  EVIDENCE_LOST: "EVIDENCE_LOST",
  INSIGHT_LOST: "INSIGHT_LOST",
  CONTENT_LOST: "CONTENT_LOST",
  INVENTED_CONTENT: "INVENTED_CONTENT",
  OVER_FRAGMENTED: "OVER_FRAGMENTED",
  CLOSING_MISSING: "CLOSING_MISSING",
});

const EVIDENCE_MARKER_PATTERN =
  /(?:um )?detalhe que muita gente ignora|tem um ponto que ajudou|quase ningu[eé]m presta aten[cç][aã]o|é exatamente aqui que ele ganha for[cç]a|foi esse detalhe que fez diferen[cç]a|muitos acabam olhando s[oó] pre[cç]o e esquecem que/i;

const CLOSING_MARKER_PATTERN =
  /\b(por esse perfil|pensando no que voc[eê]|faz mais sentido|a escolha fica|continua valendo|eu iria nele|eu manteria|direto ao ponto|encaixa melhor|fica mais coerente)\b/i;

const MAX_PARAGRAPH_CHARS = 200;
const MAX_SENTENCES_PER_CHUNK = 2;

const CLOSING_FRAMES = Object.freeze({
  [NARRATIVE_CLOSING_STYLES.DIRECT]: [
    () => "Direto ao ponto: por esse perfil, eu iria nele.",
    (winner) => `Direto ao ponto: eu iria no ${winner}.`,
  ],
  [NARRATIVE_CLOSING_STYLES.BUDGET_FIT]: [
    () => "Pensando no limite que você colocou, a escolha fica mais coerente.",
    (winner) => `Dentro desse perfil, o ${winner} encaixa melhor.`,
  ],
  [NARRATIVE_CLOSING_STYLES.REASSURANCE]: [
    () => "Pensando no que você descreveu, eu manteria essa escolha.",
    () => "Para o cenário que você trouxe, a decisão fica mais segura.",
  ],
  [NARRATIVE_CLOSING_STYLES.CONTINUITY]: [
    () => "Esse encaixe continua valendo para o seu caso.",
    () => "O ponto principal continua valendo para o que você descreveu.",
  ],
  [NARRATIVE_CLOSING_STYLES.SCENARIO]: [
    (axis) => `Para quem prioriza ${humanizeAxis(axis)}, a escolha fica mais coerente.`,
    () => "Pensando no uso que você descreveu, faz mais sentido.",
  ],
  [NARRATIVE_CLOSING_STYLES.PROFILE_FIT]: [
    (winner) => `Por esse perfil de uso, eu iria no ${winner}.`,
    () => "Por esse perfil de uso, eu iria nele.",
    () => "Pensando no que você descreveu, faz mais sentido.",
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

function pickVariant(items = [], seed = "") {
  const list = items.filter(Boolean);
  if (!list.length) return "";
  const frame = list[seedFromText(seed) % list.length];
  return typeof frame === "function" ? frame : frame;
}

function humanizeAxis(axis = "") {
  const map = {
    longevity: "durabilidade",
    performance: "desempenho",
    battery: "bateria",
    camera: "câmera",
    screen: "tela",
    comfort: "conforto",
    value: "custo-benefício",
  };
  return map[cleanText(axis).toLowerCase()] || cleanText(axis) || "uso";
}

function splitSentences(text = "") {
  return cleanText(text)
    .split(/(?<=[.!?…])\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function buildNarrativeSignals(input = {}) {
  const query = cleanText(input.query || "");
  const words = query.split(/\s+/).filter(Boolean);

  return {
    query,
    winnerName: cleanText(input.winnerName || input.productName || ""),
    primaryAxis: cleanText(input.primaryAxis || input.searchCognition?.primaryAxis || ""),
    hasExplicitBudget:
      input.hasExplicitBudget ??
      (!!extractBudget(query) || /\borçamento\b|\bat[eé]\s*\d|\d\s*k\b/i.test(query)),
    rushed:
      input.rushed ??
      input.querySignals?.rushed ??
      /\b(r[aá]pido|urgente|qual compra|direto ao ponto|rapido)\b/i.test(query),
    indecisive:
      input.indecisive ??
      input.querySignals?.indecisive ??
      /\b(n[aã]o sei|indecis|medo|errar|arrepender|insegur|t[oô] com d[uú]vida)\b/i.test(query),
    informal: /\b(mano|vlw|top|massa|bom e barato)\b/i.test(query),
    technical: /\b(spec|ghz|hz|mp|mah|ram|ssd|gpu|dpi|n[uú]cleo|processador)\b/i.test(query),
    isFollowUp: !!input.isFollowUp,
    argumentMemoryTurns: Number(input.previousMemory?.turns || input.argumentMemory?.turns || 0),
    lowConfidence: input.searchCognition?.assertiveness === "low",
    shortQuery: words.length <= 4,
  };
}

export function selectClosingStyle(signals = {}) {
  if (signals.isFollowUp && signals.argumentMemoryTurns > 0) {
    return NARRATIVE_CLOSING_STYLES.CONTINUITY;
  }
  if (signals.rushed) return NARRATIVE_CLOSING_STYLES.DIRECT;
  if (signals.hasExplicitBudget) return NARRATIVE_CLOSING_STYLES.BUDGET_FIT;
  if (signals.indecisive || signals.lowConfidence) return NARRATIVE_CLOSING_STYLES.REASSURANCE;
  if (signals.primaryAxis) return NARRATIVE_CLOSING_STYLES.SCENARIO;
  return NARRATIVE_CLOSING_STYLES.PROFILE_FIT;
}

export function hasSpecialistClosing(text = "") {
  const body = cleanText(text);
  if (!body) return false;
  const tail = body.slice(Math.max(0, body.length - 220));
  if (CLOSING_MARKER_PATTERN.test(tail)) return true;
  if (/\?\s*$/.test(body) && /(prioriza|peso mais|uso principal|me conta|antes de fechar)/i.test(tail)) {
    return true;
  }
  return false;
}

export function buildSpecialistClosing(signals = {}, blocks = []) {
  if (hasSpecialistClosing(blocks.map((b) => b.text).join("\n\n"))) {
    return null;
  }

  const lastBlock = blocks[blocks.length - 1];
  if (lastBlock?.type === "intent" && /\?\s*$/.test(lastBlock.text || "")) {
    return null;
  }

  const style = selectClosingStyle(signals);
  const frames = CLOSING_FRAMES[style] || CLOSING_FRAMES[NARRATIVE_CLOSING_STYLES.PROFILE_FIT];
  const seed = `${signals.query || ""}-${signals.winnerName || ""}-${style}`;
  const frame = pickVariant(frames, seed);

  if (typeof frame !== "function") {
    return cleanText(frame);
  }

  if (style === NARRATIVE_CLOSING_STYLES.SCENARIO && signals.primaryAxis) {
    return cleanText(frame(signals.primaryAxis));
  }

  if (frame.length > 0) {
    return cleanText(frame(signals.winnerName || "modelo recomendado"));
  }

  return cleanText(frame());
}

export function applyStrategicParagraphBreaks(text = "", blockType = "support") {
  const body = cleanText(text);
  if (!body) return [];

  if (blockType === "tradeoff" && /^✅/.test(body)) {
    return [body];
  }

  if (body.length <= MAX_PARAGRAPH_CHARS) {
    return [body];
  }

  const sentences = splitSentences(body);
  if (sentences.length <= 1) {
    return [body];
  }

  const chunks = [];
  let bucket = [];

  for (const sentence of sentences) {
    bucket.push(sentence);
    const joined = bucket.join(" ");
    if (bucket.length >= MAX_SENTENCES_PER_CHUNK || joined.length >= MAX_PARAGRAPH_CHARS) {
      chunks.push(joined);
      bucket = [];
    }
  }

  if (bucket.length) {
    chunks.push(bucket.join(" "));
  }

  return chunks.length ? chunks : [body];
}

export function buildNarrativeStructure(blocks = [], signals = {}) {
  const sections = [];
  let currentSection = null;

  for (const block of blocks) {
    const sectionKey =
      block.type === "decision" || block.type === "budget"
        ? "opening"
        : block.type === "tradeoff"
          ? "tradeoff"
          : block.type === "intent"
            ? "intent"
            : "body";

    if (!currentSection || currentSection.key !== sectionKey) {
      currentSection = { key: sectionKey, blocks: [] };
      sections.push(currentSection);
    }
    currentSection.blocks.push(block);
  }

  const closing = buildSpecialistClosing(signals, blocks);

  return {
    sections,
    closing,
    closingStyle: closing ? selectClosingStyle(signals) : null,
  };
}

export function applyNarrativeHierarchy(blocks = [], structure = null) {
  const planned = [];

  for (const block of blocks) {
    const chunks = applyStrategicParagraphBreaks(block.text, block.type);
    for (const chunk of chunks) {
      planned.push({
        type: block.type,
        text: chunk,
      });
    }
  }

  if (structure?.closing) {
    planned.push({
      type: "closing",
      text: structure.closing,
    });
  }

  return planned;
}

export function applyNarrativeFormatting(input = {}) {
  const originalReply = cleanText(input.reply || "");
  const sourceBlocks = splitReplyIntoCognitiveBlocks(originalReply);

  if (!sourceBlocks.length) {
    return {
      ok: false,
      text: originalReply,
      blocks: [],
      error: "empty",
    };
  }

  const signals = buildNarrativeSignals(input);
  const structure = buildNarrativeStructure(sourceBlocks, signals);
  const formattedBlocks = applyNarrativeHierarchy(sourceBlocks, structure);
  const text = formattedBlocks.map((block) => block.text).join("\n\n").trim();

  return {
    ok: true,
    text,
    blocks: formattedBlocks,
    structure,
    signals,
    error: null,
  };
}

function verifyNarrativePreservation(originalBlocks = [], formattedBlocks = [], context = {}) {
  const originalText = normalizeForMatch(originalBlocks.map((b) => b.text).join(" "));
  const formattedText = normalizeForMatch(
    formattedBlocks.filter((b) => b.type !== "closing").map((b) => b.text).join(" ")
  );

  for (const block of originalBlocks) {
    const norm = normalizeForMatch(block.text);
    if (norm.length < 24) continue;
    if (formattedText.includes(norm)) continue;

    const words = norm.split(" ").filter((w) => w.length > 4);
    if (words.length < 4) {
      return { ok: false, reason: "content_lost", block: block.type };
    }
    const hits = words.filter((w) => formattedText.includes(w)).length;
    if (hits / words.length < 0.72) {
      return { ok: false, reason: "content_lost", block: block.type };
    }
  }

  const winner = cleanText(context.winnerName || "");
  if (winner && !normalizeForMatch(formattedBlocks.map((b) => b.text).join(" ")).includes(normalizeForMatch(winner))) {
    return { ok: false, reason: "winner_changed" };
  }

  const hadEvidence = originalBlocks.some((b) => b.type === "evidence" || EVIDENCE_MARKER_PATTERN.test(b.text));
  const hasEvidence = formattedBlocks.some((b) => b.type === "evidence" || EVIDENCE_MARKER_PATTERN.test(b.text));
  if (hadEvidence && !hasEvidence) {
    return { ok: false, reason: "evidence_lost" };
  }

  const hadInsight = originalBlocks.some((b) => b.type === "insight" || INSIGHT_MARKER_PATTERN.test(b.text));
  const hasInsight = formattedBlocks.some((b) => b.type === "insight" || INSIGHT_MARKER_PATTERN.test(b.text));
  if (hadInsight && !hasInsight) {
    return { ok: false, reason: "insight_lost" };
  }

  const originalTradeoff = originalBlocks.filter((b) => b.type === "tradeoff").map((b) => b.text).join(" ");
  const formattedTradeoff = formattedBlocks.filter((b) => b.type === "tradeoff").map((b) => b.text).join(" ");
  if (/✅/.test(originalTradeoff) && !/✅/.test(formattedTradeoff)) {
    return { ok: false, reason: "tradeoff_lost" };
  }

  return { ok: true, reason: null };
}

export function measureNarrativeReadability(text = "") {
  const paragraphs = String(text || "")
    .split(/\n\s*\n/)
    .map((entry) => cleanText(entry))
    .filter(Boolean);

  const lengths = paragraphs.map((entry) => entry.length);
  const maxParagraphLength = lengths.length ? Math.max(...lengths) : 0;
  const avgParagraphLength = lengths.length
    ? Math.round(lengths.reduce((sum, len) => sum + len, 0) / lengths.length)
    : 0;

  return {
    paragraphCount: paragraphs.length,
    maxParagraphLength,
    avgParagraphLength,
    hasDoubleSpacing: /\n\s*\n/.test(String(text || "")),
  };
}

export function shouldApplySpecialistNarrative(input = {}) {
  if (input.responsePath && input.responsePath !== "return_seguro") return false;
  if (input.intent === "comparison") return false;
  if (!cleanText(input.reply || "")) return false;
  return true;
}

export function applySpecialistNarrative(input = {}) {
  if (!shouldApplySpecialistNarrative(input)) {
    return {
      ok: false,
      text: cleanText(input.reply || ""),
      error: "suppressed",
    };
  }

  const originalReply = cleanText(input.reply || "");
  const sourceBlocks = splitReplyIntoCognitiveBlocks(originalReply);
  const formatted = applyNarrativeFormatting(input);

  if (!formatted.ok) {
    return {
      ok: false,
      text: originalReply,
      error: formatted.error,
    };
  }

  const preservation = verifyNarrativePreservation(sourceBlocks, formatted.blocks, input);
  if (!preservation.ok) {
    return {
      ok: false,
      text: originalReply,
      error: preservation.reason,
      structure: formatted.structure,
    };
  }

  if (formatted.text.length > originalReply.length * 1.35) {
    return {
      ok: false,
      text: originalReply,
      error: "over_fragmented",
    };
  }

  const violations = findInventedSpecViolations(
    formatted.text,
    input.allowedEvidence || input.winnerName || ""
  );
  if (violations.length > 0) {
    return {
      ok: false,
      text: originalReply,
      error: "invented_content",
      violations,
    };
  }

  return {
    ok: true,
    text: formatted.text,
    blocks: formatted.blocks,
    structure: formatted.structure,
    readability: measureNarrativeReadability(formatted.text),
    error: null,
  };
}

export function finalizeReplyWithSpecialistNarrative(input = {}) {
  const applied = applySpecialistNarrative(input);
  if (!applied.ok) return applied;

  const cleanedBlocks = (applied.blocks || []).map((block) => {
    const cleaned = cleanupMiaHumanLanguage(block.text, {
      allowedEvidence: input.allowedEvidence || input.winnerName || "",
      winnerName: input.winnerName || input.productName || "",
      preserveStructure: true,
    });
    return cleaned.text || block.text;
  });

  const text = cleanedBlocks.filter(Boolean).join("\n\n").trim();

  return {
    ...applied,
    text,
    readability: measureNarrativeReadability(text),
  };
}

export function auditSpecialistNarrative(before = "", after = "", context = {}) {
  const flags = [];
  const winner = cleanText(context.winnerName || "");

  if (winner && !normalizeForMatch(after).includes(normalizeForMatch(winner))) {
    flags.push(NARRATIVE_ENGINE_FLAGS.WINNER_CHANGED);
  }

  if (/✅/.test(before) && !/✅/.test(after)) {
    flags.push(NARRATIVE_ENGINE_FLAGS.TRADEOFF_LOST);
  }

  if (EVIDENCE_MARKER_PATTERN.test(before) && !EVIDENCE_MARKER_PATTERN.test(after)) {
    flags.push(NARRATIVE_ENGINE_FLAGS.EVIDENCE_LOST);
  }

  if (INSIGHT_MARKER_PATTERN.test(before) && !INSIGHT_MARKER_PATTERN.test(after)) {
    flags.push(NARRATIVE_ENGINE_FLAGS.INSIGHT_LOST);
  }

  if (findInventedSpecViolations(after, context.allowedEvidence || winner).length > 0) {
    flags.push(NARRATIVE_ENGINE_FLAGS.INVENTED_CONTENT);
  }

  if (context.expectClosing && !hasSpecialistClosing(after)) {
    flags.push(NARRATIVE_ENGINE_FLAGS.CLOSING_MISSING);
  }

  const beforeMetrics = measureNarrativeReadability(before);
  const afterMetrics = measureNarrativeReadability(after);

  if (
    context.expectReadabilityGain &&
    afterMetrics.maxParagraphLength >= beforeMetrics.maxParagraphLength &&
    afterMetrics.paragraphCount <= beforeMetrics.paragraphCount
  ) {
    flags.push(NARRATIVE_ENGINE_FLAGS.OVER_FRAGMENTED);
  }

  return {
    flags,
    beforeMetrics,
    afterMetrics,
  };
}
