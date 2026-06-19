/**
 * PATCH 9.1J — Argument Memory Engine
 *
 * Memória argumentativa local por sessão/conversa.
 * Evita repetição mecânica entre turnos sem alterar winner, ranking ou decisão.
 */

import { findInventedSpecViolations } from "./miaProductExplanationBuilder.js";
import { cleanupMiaHumanLanguage } from "./miaAntiAiLanguageCleanupLayer.js";
import {
  classifyCognitiveBlock,
  splitReplyIntoCognitiveBlocks,
} from "./miaHumanCognitiveVariationLayer.js";

export const ARGUMENT_MEMORY_ENGINE_VERSION = "9.1J.2";

export const ARGUMENT_RESPONSE_MODES = Object.freeze({
  FIRST_RECOMMENDATION: "FIRST_RECOMMENDATION",
  CONFIRMATION_COMPACT: "CONFIRMATION_COMPACT",
  DEEPEN_SECONDARY: "DEEPEN_SECONDARY",
  PRIORITY_SHIFT: "PRIORITY_SHIFT",
  NEW_SEARCH: "NEW_SEARCH",
  COMPARISON_FOLLOWUP: "COMPARISON_FOLLOWUP",
  MAINTAIN: "MAINTAIN",
});

export const ARGUMENT_MEMORY_FLAGS = Object.freeze({
  WINNER_CHANGED: "WINNER_CHANGED",
  TRADEOFF_LOST: "TRADEOFF_LOST",
  INVENTED_ARGUMENT: "INVENTED_ARGUMENT",
  OVER_COMPRESSED: "OVER_COMPRESSED",
  REPETITION_NOT_DETECTED: "REPETITION_NOT_DETECTED",
});

const STOPWORDS = new Set([
  "para",
  "com",
  "como",
  "mais",
  "muito",
  "essa",
  "esse",
  "esta",
  "este",
  "sobre",
  "quando",
  "porque",
  "ainda",
  "mesmo",
  "ponto",
  "busca",
  "escolha",
  "produto",
]);

const CONFIRMATION_QUERY =
  /\b(vale a pena|tem certeza|confirma|mesmo\?|mesmo\s*$|continua valendo|n[aã]o mudaria|ainda iria|segue valendo|top ent[aã]o|pensando melhor|mant[eé]m essa|ainda escolheria|e pensando melhor)\b/i;

const CERTAINTY_PUSH =
  /\b(tem certeza|mas e\?|de verdade|confia|garante|certeza absoluta)\b/i;

const COMPARISON_REPEAT =
  /\b(compara|comparar|diferen[cç]a|versus|vs\.?|melhor que|pior que)\b/i;

const CONTINUITY_FRAMES = Object.freeze([
  (winner) => `Sim — e o ponto principal continua valendo${winner ? ` para o ${winner}` : ""}:`,
  (winner) => `Não mudaria a escolha${winner ? ` pelo ${winner}` : ""}; o que pesa aqui é:`,
  (winner) => `Pensando de novo, eu manteria${winner ? ` o ${winner}` : " a escolha"} porque`,
]);

const DEEPEN_FRAMES = Object.freeze([
  "Se a dúvida é consistência, vale olhar por outro ângulo:",
  "Além do que já comentei, outro ponto que reforça a escolha é:",
  "Para deixar mais claro sem repetir o mesmo argumento:",
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

function normalizeKey(value = "") {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, "");
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

function signatureTokens(text = "") {
  return normalizeKey(text)
    .split(" ")
    .filter((word) => word.length > 4 && !STOPWORDS.has(word));
}

export function buildArgumentSignatureHash(text = "") {
  const tokens = signatureTokens(text);
  if (!tokens.length) return "";
  return tokens.slice(0, 12).sort().join("|");
}

export function normalizeArgumentMemory(memory = null) {
  const safe = memory && typeof memory === "object" ? memory : {};
  return {
    version: safe.version || ARGUMENT_MEMORY_ENGINE_VERSION,
    productKey: cleanText(safe.productKey || safe.lastWinnerName || ""),
    axisKey: cleanText(safe.axisKey || safe.lastPriority || ""),
    decisionContextKey: cleanText(safe.decisionContextKey || ""),
    turns: Number(safe.turns || 0),
    repetitionPressure: safe.repetitionPressure || "low",
    usedAxes: Array.isArray(safe.usedAxes) ? safe.usedAxes.slice(-8) : [],
    signatures: Array.isArray(safe.signatures) ? safe.signatures.slice(-24) : [],
    lastQuery: cleanText(safe.lastQuery || ""),
  };
}

export function extractArgumentSignatures(input = {}) {
  const reply = preserveReplyStructure(input.reply || "");
  const blocks = splitReplyIntoCognitiveBlocks(reply);
  const winner = cleanText(input.winnerName || input.productName || "");
  const axisKey = cleanText(input.primaryAxis || input.axisKey || "");

  const signatures = blocks.map((block) => ({
    argumentType: block.type,
    evidenceField: input.evidenceField || "",
    evidenceHash: block.type === "evidence" ? buildArgumentSignatureHash(block.text) : "",
    insightHash: block.type === "insight" ? buildArgumentSignatureHash(block.text) : "",
    tradeoffKey: block.type === "tradeoff" ? buildArgumentSignatureHash(block.text) : "",
    textHash: buildArgumentSignatureHash(block.text),
    productKey: winner,
    axisKey,
  }));

  return {
    productKey: winner,
    axisKey,
    decisionContextKey: `${normalizeKey(winner)}:${normalizeKey(axisKey)}`,
    signatures,
    blocks,
  };
}

function signatureOverlap(a = "", b = "") {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const wordsA = a.split("|").filter(Boolean);
  const wordsB = b.split("|").filter(Boolean);
  if (!wordsA.length || !wordsB.length) return 0;
  const hits = wordsA.filter((w) => wordsB.includes(w)).length;
  return hits / Math.min(wordsA.length, wordsB.length);
}

export function detectRepeatedArguments(current = {}, previousMemory = null) {
  const memory = normalizeArgumentMemory(previousMemory);
  const currentSigs = Array.isArray(current.signatures) ? current.signatures : [];
  const previousSigs = memory.signatures || [];

  const repeated = [];
  const fresh = [];

  for (const sig of currentSigs) {
    const hash = sig.textHash || sig.evidenceHash || sig.insightHash || sig.tradeoffKey;
    const match = previousSigs.find((prev) => {
      const prevHash = prev.textHash || prev.evidenceHash || prev.insightHash || prev.tradeoffKey;
      return signatureOverlap(hash, prevHash) >= 0.68;
    });

    if (match && ["evidence", "insight", "decision", "authority", "stakes", "support"].includes(sig.argumentType)) {
      repeated.push({ ...sig, matched: match });
    } else {
      fresh.push(sig);
    }
  }

  const repetitionScore = repeated.length;
  const repetitionPressure =
    repetitionScore >= 3 ? "high" : repetitionScore >= 1 ? "medium" : "low";

  return {
    repeated,
    fresh,
    repetitionScore,
    repetitionPressure,
    sameProduct: !!memory.productKey && memory.productKey === current.productKey,
    sameAxis: !!memory.axisKey && memory.axisKey === current.axisKey,
  };
}

export function selectFreshArgumentMode(input = {}) {
  const query = cleanText(input.query || "");
  const memory = normalizeArgumentMemory(input.previousMemory);
  const winner = cleanText(input.winnerName || input.productName || "");
  const axis = cleanText(input.primaryAxis || "");

  if (!memory.turns) {
    return ARGUMENT_RESPONSE_MODES.FIRST_RECOMMENDATION;
  }

  if (input.commercialOfferReset) {
    return ARGUMENT_RESPONSE_MODES.NEW_SEARCH;
  }

  if (memory.productKey && winner && normalizeKey(memory.productKey) !== normalizeKey(winner)) {
    return ARGUMENT_RESPONSE_MODES.NEW_SEARCH;
  }

  if (
    input.allowNewSearch &&
    memory.lastQuery &&
    normalizeKey(query) !== normalizeKey(memory.lastQuery) &&
    !input.isFollowUp
  ) {
    return ARGUMENT_RESPONSE_MODES.NEW_SEARCH;
  }

  if (axis && memory.axisKey && normalizeKey(axis) !== normalizeKey(memory.axisKey)) {
    return ARGUMENT_RESPONSE_MODES.PRIORITY_SHIFT;
  }

  if (COMPARISON_REPEAT.test(query) && input.isFollowUp) {
    return ARGUMENT_RESPONSE_MODES.COMPARISON_FOLLOWUP;
  }

  if (CERTAINTY_PUSH.test(query)) {
    return ARGUMENT_RESPONSE_MODES.DEEPEN_SECONDARY;
  }

  if (CONFIRMATION_QUERY.test(query) || (input.isFollowUp && memory.turns > 0)) {
    return ARGUMENT_RESPONSE_MODES.CONFIRMATION_COMPACT;
  }

  return ARGUMENT_RESPONSE_MODES.MAINTAIN;
}

function isRepeatedAgainstMemory(block = {}, memory = null) {
  const hash = buildArgumentSignatureHash(block.text);
  const previous = normalizeArgumentMemory(memory).signatures || [];
  return previous.some((prev) =>
    signatureOverlap(hash, prev.textHash || prev.evidenceHash || prev.insightHash) >= 0.68
  );
}

function isRepeatedBlock(block = {}, repeated = []) {
  const hash = buildArgumentSignatureHash(block.text);
  return repeated.some((entry) => signatureOverlap(hash, entry.textHash || entry.evidenceHash || entry.insightHash) >= 0.68);
}

function ensureWinnerInReply(text = "", winnerName = "") {
  const winner = cleanText(winnerName);
  const body = cleanText(text);
  if (!winner || !body) return body;
  if (normalizeKey(body).includes(normalizeKey(winner))) return body;
  return `Para o ${winner}, ${body.charAt(0).toLowerCase()}${body.slice(1)}`;
}

function buildContinuityLead(mode = "", context = {}) {
  const seed = `${context.query || ""}-${context.winnerName || ""}-${mode}`;
  if (mode === ARGUMENT_RESPONSE_MODES.DEEPEN_SECONDARY) {
    return pickVariant(DEEPEN_FRAMES, seed);
  }
  const frame = pickVariant(CONTINUITY_FRAMES, seed);
  return typeof frame === "function" ? frame(context.winnerName || "") : frame;
}

function expandBlocksForMemory(blocks = [], reply = "") {
  if (blocks.length > 1) return blocks;

  const body = preserveReplyStructure(reply || blocks[0]?.text || "");
  if (!body || body.length < 180) return blocks;

  const parts = body
    .split(
      /\n\s*\n+|(?=\s*✅)|(?=(?:Um detalhe que muita gente ignora|Tem um ponto que ajudou|Na prática,|O detalhe que pesa|Isso importa porque))/i
    )
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (parts.length <= 1) return blocks;

  return parts.map((text) => ({
    type: classifyCognitiveBlock(text),
    text,
  }));
}

function isFollowUpCompactionMode(mode = "") {
  return (
    mode === ARGUMENT_RESPONSE_MODES.CONFIRMATION_COMPACT ||
    mode === ARGUMENT_RESPONSE_MODES.DEEPEN_SECONDARY ||
    mode === ARGUMENT_RESPONSE_MODES.COMPARISON_FOLLOWUP
  );
}

function dedupeTradeoffBlocks(blocks = []) {
  const tradeoffs = blocks.filter((block) => block.type === "tradeoff");
  if (tradeoffs.length <= 1) return blocks;

  const preferred =
    tradeoffs.find((block) => /✅/.test(block.text || "")) ||
    tradeoffs.find((block) => /⚠️/.test(block.text || "")) ||
    tradeoffs[0];

  let replaced = false;
  return blocks.filter((block) => {
    if (block.type !== "tradeoff") return true;
    if (!replaced) {
      replaced = true;
      return block === preferred;
    }
    return false;
  });
}

function shouldRollbackOverCompression(originalLength = 0, textLength = 0, mode = "") {
  if (!textLength) return true;
  if (isFollowUpCompactionMode(mode)) {
    return textLength < Math.max(90, Math.round(originalLength * 0.12));
  }
  return originalLength > 120 && textLength < originalLength * 0.45;
}

function transformBlocksForMode(blocks = [], mode = "", context = {}) {
  const repetition = detectRepeatedArguments(
    extractArgumentSignatures({ ...context, reply: blocks.map((b) => b.text).join("\n\n") }),
    context.previousMemory
  );

  if (
    mode === ARGUMENT_RESPONSE_MODES.FIRST_RECOMMENDATION ||
    mode === ARGUMENT_RESPONSE_MODES.NEW_SEARCH ||
    mode === ARGUMENT_RESPONSE_MODES.PRIORITY_SHIFT ||
    mode === ARGUMENT_RESPONSE_MODES.MAINTAIN
  ) {
    return blocks;
  }

  const keepTypes = new Set(["decision", "tradeoff", "intent"]);
  const compactMode = isFollowUpCompactionMode(mode);
  const filtered = [];
  let continuityUsed = false;

  for (const block of blocks) {
    if (keepTypes.has(block.type)) {
      if (block.type === "decision" && !continuityUsed) {
        const lead = buildContinuityLead(mode, context);
        const body = block.text.replace(/^[^:]*:\s*/, "").trim();
        filtered.push({
          type: "decision",
          text: `${lead} ${body}`.trim(),
        });
        continuityUsed = true;
      } else if (block.type === "tradeoff") {
        const existingIndex = filtered.findIndex((entry) => entry.type === "tradeoff");
        if (existingIndex < 0) {
          filtered.push(block);
        } else if (
          !/✅/.test(filtered[existingIndex].text || "") &&
          /✅/.test(block.text || "")
        ) {
          filtered[existingIndex] = block;
        }
      } else {
        filtered.push(block);
      }
      continue;
    }

    if (
      compactMode &&
      ["authority", "stakes", "support"].includes(block.type) &&
      (isRepeatedBlock(block, repetition.repeated) || isRepeatedAgainstMemory(block, context.previousMemory))
    ) {
      continue;
    }

    if (isRepeatedBlock(block, repetition.repeated) || isRepeatedAgainstMemory(block, context.previousMemory)) {
      if (block.type === "evidence" || block.type === "insight" || block.type === "authority" || block.type === "stakes") {
        continue;
      }
    }

    if (mode === ARGUMENT_RESPONSE_MODES.CONFIRMATION_COMPACT) {
      if (
        (block.type === "evidence" || block.type === "insight") &&
        isRepeatedAgainstMemory(block, context.previousMemory)
      ) {
        continue;
      }
      if (block.type === "evidence" || block.type === "insight") continue;
    }

    filtered.push(block);
  }

  if (mode === ARGUMENT_RESPONSE_MODES.DEEPEN_SECONDARY) {
    const secondary = blocks.filter(
      (block) =>
        !isRepeatedBlock(block, repetition.repeated) &&
        ["authority", "stakes", "evidence", "insight"].includes(block.type)
    );
    if (secondary.length && !filtered.some((b) => b.type === "authority" || b.type === "stakes")) {
      filtered.splice(
        filtered.findIndex((b) => b.type === "tradeoff"),
        0,
        secondary[0]
      );
    }
  }

  const deduped = dedupeTradeoffBlocks(
    filtered.length ? filtered : blocks.filter((b) => keepTypes.has(b.type))
  );

  if (
    isFollowUpCompactionMode(mode) &&
    /✅/.test(blocks.map((block) => block.text).join(" ")) &&
    !deduped.some((block) => block.type === "tradeoff" && /✅/.test(block.text || ""))
  ) {
    const sourceTradeoff =
      blocks.find((block) => block.type === "tradeoff" && /✅/.test(block.text || "")) ||
      blocks.find((block) => /✅/.test(block.text || ""));
    if (sourceTradeoff) {
      const withoutTradeoff = deduped.filter((block) => block.type !== "tradeoff");
      return [...withoutTradeoff, sourceTradeoff];
    }
  }

  return deduped;
}

export function buildArgumentMemorySnapshot(input = {}) {
  const current = extractArgumentSignatures(input);
  const previous = normalizeArgumentMemory(input.previousMemory);
  const mode = input.mode || selectFreshArgumentMode(input);
  const repetition = detectRepeatedArguments(current, previous);

  const shouldReset =
    mode === ARGUMENT_RESPONSE_MODES.NEW_SEARCH ||
    mode === ARGUMENT_RESPONSE_MODES.PRIORITY_SHIFT;

  const base = shouldReset
    ? normalizeArgumentMemory(null)
    : previous;

  const usedAxes = Array.from(
    new Set([...(base.usedAxes || []), current.axisKey].filter(Boolean))
  ).slice(-8);

  const mergedSignatures = shouldReset
    ? current.signatures
    : [...(base.signatures || []), ...current.signatures].slice(-24);

  return {
    version: ARGUMENT_MEMORY_ENGINE_VERSION,
    productKey: current.productKey,
    axisKey: current.axisKey,
    decisionContextKey: current.decisionContextKey,
    turns: shouldReset ? 1 : Number(base.turns || 0) + 1,
    repetitionPressure: repetition.repetitionPressure,
    usedAxes,
    signatures: mergedSignatures,
    lastQuery: cleanText(input.query || ""),
    lastWinnerName: current.productKey,
    lastPriority: current.axisKey,
    lastMode: mode,
  };
}

export function shouldApplyArgumentMemory(input = {}) {
  if (input.responsePath && input.responsePath !== "return_seguro") return false;
  if (input.intent === "comparison") return false;
  if (!preserveReplyStructure(input.reply || "")) return false;
  return true;
}

export function applyArgumentMemory(input = {}) {
  if (!shouldApplyArgumentMemory(input)) {
    return {
      ok: false,
      text: cleanText(input.reply || ""),
      memory: normalizeArgumentMemory(input.previousMemory),
      mode: null,
      error: "suppressed",
    };
  }

  const originalReply = preserveReplyStructure(input.reply || "");
  const previousMemory = normalizeArgumentMemory(input.previousMemory);
  const mode = selectFreshArgumentMode({ ...input, previousMemory });
  const snapshot = extractArgumentSignatures({ ...input, reply: originalReply });
  const sourceBlocks = expandBlocksForMemory(snapshot.blocks, originalReply);
  const blocks = transformBlocksForMode(sourceBlocks, mode, {
    ...input,
    previousMemory,
    mode,
  });

  const winner = cleanText(input.winnerName || input.productName || "");
  const text = ensureWinnerInReply(
    blocks.map((b) => b.text).join("\n\n").trim(),
    winner
  );

  if (shouldRollbackOverCompression(originalReply.length, text.length, mode)) {
    return {
      ok: false,
      text: originalReply,
      memory: buildArgumentMemorySnapshot({ ...input, reply: originalReply, mode, previousMemory }),
      mode,
      error: "over_compressed",
    };
  }

  if (winner && !normalizeKey(text).includes(normalizeKey(winner))) {
    return {
      ok: false,
      text: originalReply,
      memory: previousMemory,
      mode,
      error: "winner_changed",
    };
  }

  if (!/✅/.test(text) && /✅/.test(originalReply)) {
    return {
      ok: false,
      text: originalReply,
      memory: previousMemory,
      mode,
      error: "tradeoff_lost",
    };
  }

  const violations = findInventedSpecViolations(text, input.allowedEvidence || winner);
  if (violations.length > 0) {
    return {
      ok: false,
      text: originalReply,
      memory: previousMemory,
      mode,
      error: "invented_argument",
    };
  }

  const memory = buildArgumentMemorySnapshot({
    ...input,
    reply: text,
    mode,
    previousMemory,
  });

  return {
    ok: true,
    text,
    memory,
    mode,
    repetition: detectRepeatedArguments(snapshot, previousMemory),
    error: null,
  };
}

export function finalizeReplyWithArgumentMemory(input = {}) {
  const applied = applyArgumentMemory(input);
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

export function measureFollowUpCompaction(before = "", after = "") {
  const beforeBody = preserveReplyStructure(before);
  const afterBody = preserveReplyStructure(after);
  if (!beforeBody || !afterBody) {
    return {
      charRatio: 1,
      blockReduction: 0,
      isShorter: false,
      tokenOverlap: 1,
    };
  }

  const beforeBlocks = splitReplyIntoCognitiveBlocks(beforeBody);
  const afterBlocks = splitReplyIntoCognitiveBlocks(afterBody);
  const charRatio = afterBody.length / beforeBody.length;

  const beforeTokens = new Set(signatureTokens(beforeBody));
  const afterTokens = signatureTokens(afterBody);
  const hits = afterTokens.filter((token) => beforeTokens.has(token)).length;
  const tokenOverlap = afterTokens.length
    ? hits / afterTokens.length
    : 1;

  return {
    charRatio,
    blockReduction: beforeBlocks.length - afterBlocks.length,
    isShorter: afterBody.length < beforeBody.length * 0.92,
    tokenOverlap,
  };
}

export function isFollowUpLessRepetitive(before = "", after = "") {
  if (preserveReplyStructure(before) === preserveReplyStructure(after)) return false;

  const metrics = measureFollowUpCompaction(before, after);
  if (metrics.isShorter && metrics.charRatio <= 0.9) return true;
  if (metrics.blockReduction >= 1) return true;
  if (metrics.charRatio <= 0.82) return true;

  const beforeTokens = new Set(signatureTokens(before));
  const afterTokens = signatureTokens(after);
  if (!afterTokens.length) return false;

  const subsetLike =
    afterTokens.every((token) => beforeTokens.has(token)) &&
    afterTokens.length < beforeTokens.size * 0.9;
  if (subsetLike && metrics.isShorter) return true;

  const union = new Set([...beforeTokens, ...afterTokens]);
  let hits = 0;
  for (const token of afterTokens) {
    if (beforeTokens.has(token)) hits++;
  }
  const jaccard = union.size ? hits / union.size : 1;
  return jaccard < 0.82;
}

export function auditArgumentMemory(before = "", after = "", context = {}) {
  const flags = [];
  const winner = cleanText(context.winnerName || "");

  if (winner && !normalizeKey(after).includes(normalizeKey(winner))) {
    flags.push(ARGUMENT_MEMORY_FLAGS.WINNER_CHANGED);
  }

  if (/✅/.test(before) && !/✅/.test(after)) {
    flags.push(ARGUMENT_MEMORY_FLAGS.TRADEOFF_LOST);
  }

  if (findInventedSpecViolations(after, context.allowedEvidence || winner).length > 0) {
    flags.push(ARGUMENT_MEMORY_FLAGS.INVENTED_ARGUMENT);
  }

  if (context.expectLessRepetition && !isFollowUpLessRepetitive(before, after)) {
    flags.push(ARGUMENT_MEMORY_FLAGS.REPETITION_NOT_DETECTED);
  }

  return flags;
}

export function buildArgumentMemoryAuditRecord(input = {}) {
  const before = cleanText(input.before || input.reply || "");
  const result = finalizeReplyWithArgumentMemory(input);
  const flags = auditArgumentMemory(before, result.text || before, {
    winnerName: input.winnerName || "",
    allowedEvidence: input.allowedEvidence || "",
    expectLessRepetition: !!input.expectLessRepetition,
  });

  return {
    mode: result.mode,
    memory: result.memory,
    ok: result.ok && flags.length === 0,
    flags,
    text: result.text || before,
  };
}
