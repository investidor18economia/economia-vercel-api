/**
 * PATCH 9.2E — Conversational Closing Engine
 *
 * Encerra respostas com sensação consultiva após compressão (9.2D).
 * Não altera winner, decisão, tradeoff, evidência ou insight.
 */

import { extractBudget } from "./miaRoutingSafety.js";
import { findInventedSpecViolations } from "./miaProductExplanationBuilder.js";
import { INSIGHT_MARKER_PATTERN } from "./miaExpertInsightGenerationLayer.js";
import { cleanupMiaHumanLanguage } from "./miaAntiAiLanguageCleanupLayer.js";
import {
  splitReplyIntoCognitiveBlocks,
} from "./miaHumanCognitiveVariationLayer.js";
import {
  detectRepeatedConcepts,
} from "./miaRepetitionCompressionGuard.js";
import { hasSpecialistClosing } from "./miaSpecialistNarrativeEngine.js";
import {
  buildIntentDiscoveryProbe,
  hasIntentInformationGap,
  resolveIntentDiscoveryProfile,
} from "./miaUserIntentDiscoveryLayer.js";

export const CONVERSATIONAL_CLOSING_ENGINE_VERSION = "9.2E.1";

export const CLOSING_MODES = Object.freeze({
  DECISION_LOCKED_CLOSE: "DECISION_LOCKED_CLOSE",
  BUDGET_AWARE_CLOSE: "BUDGET_AWARE_CLOSE",
  TRADEOFF_ACCEPTANCE_CLOSE: "TRADEOFF_ACCEPTANCE_CLOSE",
  FOLLOW_UP_CONTINUITY_CLOSE: "FOLLOW_UP_CONTINUITY_CLOSE",
  INTENT_DISCOVERY_CLOSE: "INTENT_DISCOVERY_CLOSE",
  UNCERTAINTY_CLOSE: "UNCERTAINTY_CLOSE",
});

export const CLOSING_ENGINE_FLAGS = Object.freeze({
  WINNER_CHANGED: "WINNER_CHANGED",
  TRADEOFF_LOST: "TRADEOFF_LOST",
  EVIDENCE_LOST: "EVIDENCE_LOST",
  INSIGHT_LOST: "INSIGHT_LOST",
  INVENTED_CONTENT: "INVENTED_CONTENT",
  FALSE_CERTAINTY: "FALSE_CERTAINTY",
  ARGUMENT_REPEATED: "ARGUMENT_REPEATED",
  CLOSING_MISSING: "CLOSING_MISSING",
  REDUNDANT_CLOSING: "REDUNDANT_CLOSING",
});

const EVIDENCE_MARKER_PATTERN =
  /(?:um )?detalhe que muita gente ignora|tem um ponto que ajudou|quase ningu[eé]m presta aten[cç][aã]o|é exatamente aqui que ele ganha for[cç]a|foi esse detalhe que fez diferen[cç]a|muitos acabam olhando s[oó] pre[cç]o e esquecem que/i;

const ADEQUATE_CLOSING_PATTERN =
  /\b(por isso,? eu manteria|eu manteria essa escolha|n[aã]o mudaria a recomenda[cç][aã]o|faz sentido seguir|continua coerente|recalibrar a escolha|fecharia a an[aá]lise|pr[oó]ximo passo|para afinar melhor|liga mais para|o que pesa mais pra voc[eê])\b/i;

const USEFUL_FINAL_QUESTION_PATTERN =
  /\?\s*$/;

const INTENT_DISCOVERY_QUESTION_PATTERN =
  /\b(liga mais para|pesa mais pra voc[eê]|prioridade aqui|ajuda a ajustar|refinar daqui|afinar melhor|me conta|uso principal)\b/i;

const FALSE_CERTAINTY_PATTERN =
  /\b(sem d[uú]vida absoluta|[eé] perfeito|n[aã]o tem erro|certeza total|melhor do mundo|n[aã]o tem como errar|garantid[oa]|imposs[ií]vel errar)\b/i;

const OVERLAP_REJECT_THRESHOLD = 0.68;

const CLOSING_FRAMES = Object.freeze({
  [CLOSING_MODES.DECISION_LOCKED_CLOSE]: [
    () => "Por isso, eu manteria essa escolha.",
    (winner) => `Por isso, eu manteria o ${winner}.`,
    () => "Com o que você trouxe, eu fecharia a análise nessa direção.",
  ],
  [CLOSING_MODES.BUDGET_AWARE_CLOSE]: [
    () => "Dentro dessa faixa, faz sentido seguir nele.",
    (winner) => `Dentro dessa faixa, faz sentido seguir no ${winner}.`,
    () => "Pensando no limite que você colocou, essa direção continua coerente.",
  ],
  [CLOSING_MODES.TRADEOFF_ACCEPTANCE_CLOSE]: [
    () => "Mesmo com esse ponto fraco, a escolha continua coerente pelo que pesa mais no seu caso.",
    () => "Com essa renúncia em mente, ainda faz sentido fechar nessa opção.",
    (winner) => `Mesmo com esse tradeoff, o ${winner} continua alinhado ao que você priorizou.`,
  ],
  [CLOSING_MODES.FOLLOW_UP_CONTINUITY_CLOSE]: [
    () => "Eu não mudaria a recomendação por esse ponto.",
    () => "Para o que você trouxe agora, o encaixe continua valendo.",
    (winner) => `Eu manteria o ${winner} para o cenário que você descreveu agora.`,
  ],
  [CLOSING_MODES.UNCERTAINTY_CLOSE]: [
    () => "Se sua prioridade mudar, aí vale recalibrar a escolha.",
    () => "Se algum ponto ainda te incomodar, vale pesar o que pesa mais antes de fechar.",
    () => "Com essa dúvida em aberto, o próximo passo é alinhar o que mais pesa para você.",
  ],
});

const SHORT_CLOSING_FRAMES = Object.freeze({
  [CLOSING_MODES.DECISION_LOCKED_CLOSE]: [
    () => "Eu manteria essa escolha.",
    (winner) => `Eu manteria o ${winner}.`,
  ],
  [CLOSING_MODES.BUDGET_AWARE_CLOSE]: [() => "Dentro dessa faixa, seguiria nele."],
  [CLOSING_MODES.FOLLOW_UP_CONTINUITY_CLOSE]: [() => "Eu manteria a mesma recomendação."],
});

const META_FALLBACK_CLOSINGS = [
  () => "Por aqui, eu fecharia a análise nessa direção.",
  () => "Esse é o próximo passo que eu seguiria com o que você trouxe até aqui.",
];

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

function pickVariant(items = [], seed = "", winnerName = "") {
  const list = items.filter(Boolean);
  if (!list.length) return "";
  const frame = list[seedFromText(seed) % list.length];
  if (typeof frame === "function") {
    return frame.length > 0 ? frame(winnerName || "modelo recomendado") : frame();
  }
  return String(frame || "");
}

function joinHumanList(items = []) {
  const list = items.filter(Boolean);
  if (list.length <= 1) return list[0] || "";
  if (list.length === 2) return `${list[0]} ou ${list[1]}`;
  return `${list.slice(0, -1).join(", ")} ou ${list[list.length - 1]}`;
}

export function buildClosingSignals(input = {}) {
  const query = cleanText(input.query || "");
  const searchCognition = input.searchCognition || {};
  const querySignals = input.querySignals || {};
  const decisionMemory = input.decisionMemory || {};
  const reply = preserveReplyStructure(input.reply || "");
  const blocks = splitReplyIntoCognitiveBlocks(reply);
  const lastBlock = blocks[blocks.length - 1] || null;

  const hasTradeoff =
    input.hasTradeoff ??
    (/✅/.test(reply) || !!cleanText(decisionMemory.lastTradeoff || ""));
  const hasEvidence =
    input.hasEvidence ??
    blocks.some((block) => block.type === "evidence" || EVIDENCE_MARKER_PATTERN.test(block.text || ""));
  const hasInsight =
    input.hasInsight ??
    blocks.some((block) => block.type === "insight" || INSIGHT_MARKER_PATTERN.test(block.text || ""));

  const assertiveness = cleanText(searchCognition.assertiveness || "").toLowerCase();
  const lowConfidence =
    assertiveness === "low" ||
    input.lowConfidence === true ||
    querySignals.indecisive === true;

  const highConfidence =
    assertiveness === "high" ||
    searchCognition.dominance === "clear" ||
    (!lowConfidence && hasTradeoff && hasEvidence);

  return {
    query,
    category: cleanText(input.category || ""),
    winnerName: cleanText(input.winnerName || input.productName || ""),
    primaryAxis: cleanText(input.primaryAxis || searchCognition.primaryAxis || ""),
    hasExplicitBudget:
      input.hasExplicitBudget ??
      (!!extractBudget(query) || /\borçamento\b|\bat[eé]\s*\d|\d\s*k\b/i.test(query)),
    rushed:
      input.rushed ??
      querySignals.rushed ??
      /\b(r[aá]pido|urgente|qual compra|direto ao ponto|rapido)\b/i.test(query),
    indecisive:
      input.indecisive ??
      querySignals.indecisive ??
      /\b(n[aã]o sei|indecis|medo|errar|arrepender|insegur|t[oô] com d[uú]vida)\b/i.test(query),
    isFollowUp: !!input.isFollowUp,
    argumentMemoryTurns: Number(input.previousMemory?.turns || input.argumentMemory?.turns || 0),
    priorityShift: !!(
      input.priorityShift ||
      input.previousMemory?.priorityShift ||
      input.argumentMemory?.priorityShift
    ),
    lowConfidence,
    highConfidence,
    hasTradeoff,
    hasEvidence,
    hasInsight,
    needsIntentDiscovery:
      input.needsIntentDiscovery ??
      hasIntentInformationGap({
        query,
        category: input.category || "",
        querySignals,
        activePriority: input.primaryAxis || "",
        budget: extractBudget(query),
      }),
    hasUsefulFinalQuestion: hasUsefulFinalQuestion(reply, blocks),
    hasAdequateClosing: hasAdequateConversationalClosing(reply, blocks),
    endsAbruptly: endsAbruptly(blocks),
    lastBlockType: lastBlock?.type || "support",
    blockCount: blocks.length,
  };
}

export function hasUsefulFinalQuestion(reply = "", blocks = null) {
  const body = preserveReplyStructure(reply);
  if (!body) return false;

  const sourceBlocks = blocks || splitReplyIntoCognitiveBlocks(body);
  const lastBlock = sourceBlocks[sourceBlocks.length - 1];
  const tail = body.slice(Math.max(0, body.length - 240));

  if (!USEFUL_FINAL_QUESTION_PATTERN.test(body)) return false;
  if (lastBlock?.type === "intent") return true;
  if (INTENT_DISCOVERY_QUESTION_PATTERN.test(tail)) return true;
  if (/(prioriza|antes de fechar|me conta)/i.test(tail)) return true;

  return false;
}

export function hasAdequateConversationalClosing(reply = "", blocks = null) {
  const body = preserveReplyStructure(reply);
  if (!body) return false;

  const sourceBlocks = blocks || splitReplyIntoCognitiveBlocks(body);

  if (hasUsefulFinalQuestion(body, sourceBlocks)) return true;

  const tail = body.slice(Math.max(0, body.length - 220));
  if (ADEQUATE_CLOSING_PATTERN.test(tail)) return true;

  const lastBlock = sourceBlocks[sourceBlocks.length - 1];
  const lastText = cleanText(lastBlock?.text || "");
  if (lastBlock?.type === "closing" && ADEQUATE_CLOSING_PATTERN.test(lastText)) {
    return true;
  }

  return false;
}

function endsAbruptly(blocks = []) {
  const last = blocks[blocks.length - 1];
  if (!last) return true;

  if (last.type === "closing" && ADEQUATE_CLOSING_PATTERN.test(last.text || "")) {
    return false;
  }

  if (last.type === "intent" && /\?\s*$/.test(last.text || "")) return false;

  if (hasUsefulFinalQuestion(blocks.map((b) => b.text).join("\n\n"), blocks)) {
    return false;
  }

  if (last.type === "support" && hasSpecialistClosing(last.text || "") && !ADEQUATE_CLOSING_PATTERN.test(last.text || "")) {
    return true;
  }

  return (
    last.type === "tradeoff" ||
    last.type === "evidence" ||
    last.type === "insight" ||
    last.type === "support"
  );
}

export function selectClosingMode(signals = {}) {
  if (signals.hasUsefulFinalQuestion) return null;

  if (signals.needsIntentDiscovery && !signals.hasAdequateClosing) {
    return CLOSING_MODES.INTENT_DISCOVERY_CLOSE;
  }

  if (signals.isFollowUp && signals.argumentMemoryTurns > 0) {
    return CLOSING_MODES.FOLLOW_UP_CONTINUITY_CLOSE;
  }

  if (signals.indecisive || signals.lowConfidence) {
    return CLOSING_MODES.UNCERTAINTY_CLOSE;
  }

  if (signals.priorityShift) {
    return CLOSING_MODES.UNCERTAINTY_CLOSE;
  }

  if (signals.hasExplicitBudget) {
    return CLOSING_MODES.BUDGET_AWARE_CLOSE;
  }

  if (signals.hasTradeoff && signals.lastBlockType === "tradeoff") {
    return CLOSING_MODES.TRADEOFF_ACCEPTANCE_CLOSE;
  }

  if (signals.highConfidence) {
    return CLOSING_MODES.DECISION_LOCKED_CLOSE;
  }

  return CLOSING_MODES.DECISION_LOCKED_CLOSE;
}

function buildIntentDiscoveryClosing(input = {}, signals = {}) {
  const built = buildIntentDiscoveryProbe({
    query: signals.query,
    category: signals.category || input.category || "",
    primaryAxis: signals.primaryAxis,
    activePriority: signals.primaryAxis,
  });

  const probe = cleanText(typeof built === "string" ? built : built?.probe || "");
  if (probe) {
    return probe.endsWith("?") ? probe : `${probe}?`;
  }

  const profile = resolveIntentDiscoveryProfile(signals.category, signals.query);
  const options = (profile?.options || []).filter((entry) => entry.axis !== signals.primaryAxis).slice(0, 3);
  const labels = options.map((entry) => entry.label);
  if (labels.length < 2) {
    return "Se quiser afinar melhor, me conta o que pesa mais para você nessa escolha?";
  }

  return `Agora, para afinar melhor: você liga mais para ${joinHumanList(labels)}?`;
}

export function buildConversationalClosing(input = {}, signals = {}, mode = null) {
  const selectedMode = mode || selectClosingMode(signals);
  if (!selectedMode) return "";

  if (selectedMode === CLOSING_MODES.INTENT_DISCOVERY_CLOSE) {
    return cleanText(buildIntentDiscoveryClosing(input, signals));
  }

  const frames =
    signals.rushed && SHORT_CLOSING_FRAMES[selectedMode]
      ? SHORT_CLOSING_FRAMES[selectedMode]
      : CLOSING_FRAMES[selectedMode] || CLOSING_FRAMES[CLOSING_MODES.DECISION_LOCKED_CLOSE];

  const seed = `${signals.query || ""}-${signals.winnerName || ""}-${selectedMode}-${signals.isFollowUp}`;
  const frame = pickVariant(frames, seed, signals.winnerName || "");
  return cleanText(frame);
}

function closingConceptOverlap(closing = "", blocks = [], context = {}) {
  if (!cleanText(closing) || !blocks.length) return 0;

  const detection = detectRepeatedConcepts(
    [...blocks, { type: "closing", text: closing }],
    context
  );

  const closingIndex = blocks.length;
  const repeats = detection.repeated.filter((entry) => entry.blockIndex === closingIndex);
  if (!repeats.length) return 0;

  return Math.max(...repeats.map((entry) => entry.overlap));
}

function stripReplaceableTrailingClosing(blocks = []) {
  const trimmed = [...blocks];
  while (trimmed.length) {
    const last = trimmed[trimmed.length - 1];
    const isWeakClosing =
      last.type === "closing" ||
      (last.type === "support" && hasSpecialistClosing(last.text || "") && !ADEQUATE_CLOSING_PATTERN.test(last.text || ""));

    if (!isWeakClosing) break;
    trimmed.pop();
  }
  return trimmed;
}

export function needsConversationalClosing(reply = "", signals = null) {
  const body = preserveReplyStructure(reply);
  if (!body) return false;

  const builtSignals = signals || buildClosingSignals({ reply: body });
  if (builtSignals.hasUsefulFinalQuestion) return false;
  if (builtSignals.hasAdequateClosing && !builtSignals.endsAbruptly) return false;

  return builtSignals.endsAbruptly || !builtSignals.hasAdequateClosing;
}

export function applyConversationalClosing(input = {}) {
  const originalReply = preserveReplyStructure(input.reply || "");
  if (!originalReply) {
    return { ok: false, text: "", error: "empty" };
  }

  const signals = buildClosingSignals({ ...input, reply: originalReply });
  if (!needsConversationalClosing(originalReply, signals)) {
    return {
      ok: true,
      text: originalReply,
      applied: false,
      mode: null,
      signals,
      error: null,
    };
  }

  let mode = selectClosingMode(signals);
  if (!mode) {
    return {
      ok: true,
      text: originalReply,
      applied: false,
      mode: null,
      signals,
      error: null,
    };
  }

  let blocks = splitReplyIntoCognitiveBlocks(originalReply);
  blocks = stripReplaceableTrailingClosing(blocks);

  const context = {
    primaryAxis: signals.primaryAxis,
    winnerName: signals.winnerName,
    query: signals.query,
  };

  let closing = buildConversationalClosing(input, signals, mode);
  let overlap =
    mode === CLOSING_MODES.INTENT_DISCOVERY_CLOSE
      ? 0
      : closingConceptOverlap(closing, blocks, context);

  if (overlap >= OVERLAP_REJECT_THRESHOLD) {
    const fallbacks = [
      CLOSING_MODES.UNCERTAINTY_CLOSE,
      CLOSING_MODES.FOLLOW_UP_CONTINUITY_CLOSE,
      CLOSING_MODES.DECISION_LOCKED_CLOSE,
    ].filter((entry) => entry !== mode);

    for (const fallbackMode of fallbacks) {
      const candidate = buildConversationalClosing(input, signals, fallbackMode);
      const candidateOverlap = closingConceptOverlap(candidate, blocks, context);
      if (candidateOverlap < OVERLAP_REJECT_THRESHOLD) {
        closing = candidate;
        overlap = candidateOverlap;
        mode = fallbackMode;
        break;
      }
    }
  }

  if (!closing || overlap >= OVERLAP_REJECT_THRESHOLD) {
    closing = cleanText(pickVariant(META_FALLBACK_CLOSINGS, `${signals.query}-meta`));
    overlap = 0;
  }

  if (FALSE_CERTAINTY_PATTERN.test(closing)) {
    return {
      ok: false,
      text: originalReply,
      applied: false,
      mode,
      error: "false_certainty",
    };
  }

  const text = `${blocks.map((block) => block.text).join("\n\n")}\n\n${closing}`.trim();
  const safety = verifyClosingSafety(originalReply, text, input);

  if (!safety.ok) {
    return {
      ok: false,
      text: originalReply,
      applied: false,
      mode,
      signals,
      error: safety.reason,
      flags: safety.flags,
    };
  }

  return {
    ok: true,
    text,
    applied: true,
    mode,
    signals,
    closing,
    overlap,
    error: null,
  };
}

export function verifyClosingSafety(before = "", after = "", context = {}) {
  const flags = [];
  const winner = cleanText(context.winnerName || context.productName || "");

  if (winner && !normalizeForMatch(after).includes(normalizeForMatch(winner))) {
    flags.push(CLOSING_ENGINE_FLAGS.WINNER_CHANGED);
  }

  if (/✅/.test(before) && !/✅/.test(after)) {
    flags.push(CLOSING_ENGINE_FLAGS.TRADEOFF_LOST);
  }

  if (EVIDENCE_MARKER_PATTERN.test(before) && !EVIDENCE_MARKER_PATTERN.test(after)) {
    flags.push(CLOSING_ENGINE_FLAGS.EVIDENCE_LOST);
  }

  if (INSIGHT_MARKER_PATTERN.test(before) && !INSIGHT_MARKER_PATTERN.test(after)) {
    flags.push(CLOSING_ENGINE_FLAGS.INSIGHT_LOST);
  }

  if (findInventedSpecViolations(after, context.allowedEvidence || winner).length > 0) {
    flags.push(CLOSING_ENGINE_FLAGS.INVENTED_CONTENT);
  }

  if (FALSE_CERTAINTY_PATTERN.test(after)) {
    flags.push(CLOSING_ENGINE_FLAGS.FALSE_CERTAINTY);
  }

  return {
    ok: flags.length === 0,
    flags,
    reason: flags[0] || null,
  };
}

export function shouldApplyConversationalClosing(input = {}) {
  if (input.responsePath && input.responsePath !== "return_seguro") return false;
  if (input.intent === "comparison") return false;
  if (!preserveReplyStructure(input.reply || "")) return false;
  return true;
}

export function finalizeReplyWithConversationalClosing(input = {}) {
  if (!shouldApplyConversationalClosing(input)) {
    return {
      ok: false,
      text: preserveReplyStructure(input.reply || ""),
      error: "suppressed",
    };
  }

  const applied = applyConversationalClosing(input);
  if (!applied.ok) return applied;

  const cleaned =
    cleanupMiaHumanLanguage(applied.text, {
      allowedEvidence: input.allowedEvidence || input.winnerName || "",
      winnerName: input.winnerName || input.productName || "",
      preserveStructure: true,
    }).text || applied.text;

  return {
    ...applied,
    text: preserveReplyStructure(cleaned),
  };
}

export function auditConversationalClosing(before = "", after = "", context = {}) {
  const flags = verifyClosingSafety(before, after, context).flags;
  const blocks = splitReplyIntoCognitiveBlocks(after);

  if (context.expectClosing && !hasAdequateConversationalClosing(after, blocks)) {
    flags.push(CLOSING_ENGINE_FLAGS.CLOSING_MISSING);
  }

  if (context.expectNoClosing && hasAdequateConversationalClosing(after, blocks)) {
    flags.push(CLOSING_ENGINE_FLAGS.REDUNDANT_CLOSING);
  }

  const closingTail = after.slice(Math.max(0, after.length - 180));
  const body = before.slice(0, Math.max(0, before.length - 180));
  if (
    context.expectNoArgumentRepeat &&
    closingTail &&
    normalizeForMatch(closingTail).length > 20 &&
    normalizeForMatch(body).includes(normalizeForMatch(closingTail).slice(0, 40))
  ) {
    flags.push(CLOSING_ENGINE_FLAGS.ARGUMENT_REPEATED);
  }

  return { flags };
}
