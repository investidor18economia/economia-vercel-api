/**
 * PATCH 9.1F — Anti-AI Language Cleanup Layer
 *
 * Detecta e naturaliza padrões linguísticos artificiais nas respostas da MIA.
 * Não altera winner, ranking, routing ou decision engine.
 */

import { findInventedSpecViolations } from "./miaProductExplanationBuilder.js";

export const ANTI_AI_LANGUAGE_CLEANUP_VERSION = "9.1F.1";

export const ANTI_AI_LANGUAGE_FLAGS = Object.freeze({
  AI_CLICHE_DETECTED: "AI_CLICHE_DETECTED",
  GENERIC_LANGUAGE_DETECTED: "GENERIC_LANGUAGE_DETECTED",
  ABSTRACT_LANGUAGE_DETECTED: "ABSTRACT_LANGUAGE_DETECTED",
  TECHNICAL_JARGON_DETECTED: "TECHNICAL_JARGON_DETECTED",
  TRADEOFF_WORD_LEAK: "TRADEOFF_WORD_LEAK",
  MEANING_CHANGED: "MEANING_CHANGED",
  WINNER_CHANGED: "WINNER_CHANGED",
  CARD_MISMATCH: "CARD_MISMATCH",
  BROKE_COMPARISON_LAYOUT: "BROKE_COMPARISON_LAYOUT",
  BROKE_TRADEOFF_BLOCK: "BROKE_TRADEOFF_BLOCK",
  BROKE_INTENT_DISCOVERY: "BROKE_INTENT_DISCOVERY",
  RESPONSE_TOO_AGGRESSIVE: "RESPONSE_TOO_AGGRESSIVE",
  RESPONSE_TOO_MARKETING: "RESPONSE_TOO_MARKETING",
  REGRESSION_8X: "REGRESSION_8X",
  REGRESSION_9_1A_E: "REGRESSION_9_1A_E",
});

const AI_CLICHE_PATTERNS = Object.freeze([
  /\bestou aqui para ajudar\b/i,
  /\bposso te ajudar\b/i,
  /\bposso ajudar\b/i,
  /\bposso te auxiliar\b/i,
  /\bespero ter ajudado\b/i,
  /\bfico à disposição\b/i,
  /\bfico a disposicao\b/i,
  /\bsinta-se à vontade\b/i,
  /\bcomo assistente\b/i,
  /\bfico feliz em ajudar\b/i,
]);

const GENERIC_LANGUAGE_PATTERNS = Object.freeze([
  /\bde forma geral\b/i,
  /\bno geral\b/i,
  /\bé uma ótima opção\b/i,
  /\be uma otima opcao\b/i,
  /\bcusto-benefício interessante\b/i,
  /\bcusto beneficio interessante\b/i,
  /\bexperiência equilibrada\b/i,
  /\bexperiencia equilibrada\b/i,
  /\bse destaca principalmente por\b/i,
  /\bessa opção se destaca\b/i,
  /\besta opcao se destaca\b/i,
  /\bexcelente escolha\b/i,
  /\bótima pergunta\b/i,
  /\botima pergunta\b/i,
]);

const ABSTRACT_LANGUAGE_PATTERNS = Object.freeze([
  /\btende a ajudar com\b/i,
  /\bpode contribuir para\b/i,
  /\boferece uma experiência\b/i,
  /\boferece uma experiencia\b/i,
  /\bproporciona uma experiência\b/i,
  /\bproporciona uma experiencia\b/i,
  /\bno uso cotidiano\b/i,
  /\buso diário do dia a dia\b/i,
  /\bcenário de uso\b/i,
  /\bcenario de uso\b/i,
  /\bum ganho prático perceptível\b/i,
  /\bum ganho pratico perceptivel\b/i,
  /\bmenos preocupação com autonomia em uso cotidiano\b/i,
  /\bmenos preocupacao com autonomia em uso cotidiano\b/i,
  /\bsem depender de detalhe técnico isolado\b/i,
  /\bsem depender de detalhe tecnico isolado\b/i,
]);

const TECHNICAL_JARGON_PATTERNS = Object.freeze([
  /\btradeoff\b/i,
  /\bdecisão otimizada\b/i,
  /\bdecisao otimizada\b/i,
  /\bcritério dominante\b/i,
  /\bcriterio dominante\b/i,
  /\beixo principal\b/i,
  /\bconsequência percebida\b/i,
  /\bconsequencia percebida\b/i,
]);

const MARKETING_PATTERNS = Object.freeze([
  /\bproduto imperdível\b/i,
  /\boferta imperdível\b/i,
  /\bcompra certeira garantida\b/i,
  /\bmelhor do mercado\b/i,
]);

const STRUCTURED_LINE_PREFIX =
  /^(🏆|👉|✅|⚠️|📸|🔋|⏳|💰|⚡|🖥️|🪑|💾|O que você ganha:|O que abre mão:)/;

const PHRASE_REWRITES = Object.freeze([
  [/tende a ajudar com\s+/gi, ""],
  [/\bpode contribuir para\b/gi, "ajuda em"],
  [/\boferece uma experiência\b/gi, "entrega"],
  [/\boferece uma experiencia\b/gi, "entrega"],
  [/\bproporciona uma experiência\b/gi, "entrega"],
  [/\bproporciona uma experiencia\b/gi, "entrega"],
  [/\bse destaca principalmente por\b/gi, "pesa mais por"],
  [/\bessa opção se destaca principalmente por\b/gi, "aqui pesa"],
  [/\besta opção se destaca principalmente por\b/gi, "aqui pesa"],
  [/\bde forma geral,?\s*/gi, "Na prática, "],
  [/\bno geral,?\s*/gi, "No conjunto, "],
  [/\bum ganho prático perceptível no uso cotidiano,?\s*sem depender de detalhe técnico isolado/gi, "ganho perceptível no uso real"],
  [/\bum ganho pratico perceptivel no uso cotidiano,?\s*sem depender de detalhe tecnico isolado/gi, "ganho perceptível no uso real"],
  [
    /\bmenos preocupação com autonomia em uso cotidiano\b/gi,
    "menos dependência do carregador no dia a dia",
  ],
  [
    /\bmenos preocupacao com autonomia em uso cotidiano\b/gi,
    "menos dependencia do carregador no dia a dia",
  ],
  [/\bmenos preocupação com autonomia\b/gi, "menos dependência do carregador"],
  [/\bmenos preocupacao com autonomia\b/gi, "menos dependencia do carregador"],
  [/\bno uso cotidiano\b/gi, "no dia a dia"],
  [/\buso cotidiano\b/gi, "uso diário"],
  [/\bcenário de uso\b/gi, "uso real"],
  [/\bcenario de uso\b/gi, "uso real"],
  [/\bexperiência equilibrada\b/gi, "conjunto equilibrado"],
  [/\bexperiencia equilibrada\b/gi, "conjunto equilibrado"],
  [/\bum tradeoff perceptível\b/gi, "uma renúncia clara"],
  [/\bum tradeoff perceptivel\b/gi, "uma renuncia clara"],
  [/\btradeoffs?\b/gi, "escolhas"],
  [/\btradeoff\b/gi, "escolha"],
  [/\bdecisão otimizada\b/gi, "decisão mais segura"],
  [/\bdecisao otimizada\b/gi, "decisao mais segura"],
  [/\bé uma ótima opção custo-benefício\b/gi, "faz sentido pelo preço"],
  [/\be uma otima opcao custo beneficio\b/gi, "faz sentido pelo preço"],
  [/\s{2,}/g, " "],
]);

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeForCompare(value = "") {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function applyPhraseRewrites(text = "") {
  let body = String(text || "");
  for (const [pattern, replacement] of PHRASE_REWRITES) {
    body = body.replace(pattern, replacement);
  }
  return body.trim();
}

function stripAiClicheSentences(text = "") {
  const chunks = String(text || "").split(/\n\s*\n/);
  const cleaned = chunks
    .map((chunk) => {
      const sentences = chunk.split(/(?<=[.!?])\s+/);
      const kept = sentences.filter(
        (sentence) =>
          sentence.trim() &&
          !AI_CLICHE_PATTERNS.some((pattern) => pattern.test(sentence))
      );
      return kept.join(" ").trim();
    })
    .filter(Boolean);
  return cleaned.join("\n\n");
}

function removeAiClicheContent(text = "") {
  let body = stripAiClicheSentences(String(text || ""));
  for (const pattern of AI_CLICHE_PATTERNS) {
    body = body.replace(new RegExp(`[^.!?\\n]*${pattern.source}[^.!?\\n]*[.!?]?`, "gi"), "").trim();
  }
  return body.replace(/\n{3,}/g, "\n\n").trim();
}

function cleanupLine(line = "") {
  const raw = String(line || "");
  if (!raw.trim()) return raw;

  const prefixMatch = raw.match(/^((?:🏆|👉|✅|⚠️)\s*)/);
  const emojiAxisMatch = raw.match(/^((?:📸|🔋|⏳|💰|⚡|🖥️|🪑|💾)\s+[^\n]+?\n)?/);

  if (prefixMatch) {
    const prefix = prefixMatch[1];
    const body = raw.slice(prefix.length);
    return `${prefix}${applyPhraseRewrites(body)}`;
  }

  if (/^(O que você ganha:|O que abre mão:)/.test(raw)) {
    return raw;
  }

  if (emojiAxisMatch && raw.includes("\n")) {
    const lines = raw.split("\n");
    return lines.map((entry) => cleanupLine(entry)).join("\n");
  }

  return applyPhraseRewrites(raw);
}

export function detectAntiAiLanguageFlags(text = "") {
  const flags = [];
  const body = String(text || "");

  if (AI_CLICHE_PATTERNS.some((pattern) => pattern.test(body))) {
    flags.push(ANTI_AI_LANGUAGE_FLAGS.AI_CLICHE_DETECTED);
  }
  if (GENERIC_LANGUAGE_PATTERNS.some((pattern) => pattern.test(body))) {
    flags.push(ANTI_AI_LANGUAGE_FLAGS.GENERIC_LANGUAGE_DETECTED);
  }
  if (ABSTRACT_LANGUAGE_PATTERNS.some((pattern) => pattern.test(body))) {
    flags.push(ANTI_AI_LANGUAGE_FLAGS.ABSTRACT_LANGUAGE_DETECTED);
  }
  if (TECHNICAL_JARGON_PATTERNS.some((pattern) => pattern.test(body))) {
    flags.push(ANTI_AI_LANGUAGE_FLAGS.TECHNICAL_JARGON_DETECTED);
  }
  if (/\btradeoff\b/i.test(body)) {
    flags.push(ANTI_AI_LANGUAGE_FLAGS.TRADEOFF_WORD_LEAK);
  }
  if (MARKETING_PATTERNS.some((pattern) => pattern.test(body))) {
    flags.push(ANTI_AI_LANGUAGE_FLAGS.RESPONSE_TOO_MARKETING);
  }

  return flags;
}

export function hasStructuredMiaBlocks(text = "") {
  const body = String(text || "");
  return (
    (/✅/.test(body) && /⚠️/.test(body)) ||
    (/🏆/.test(body) && /👉/.test(body)) ||
    /\?\s*$/.test(body.trim())
  );
}

export function preservesStructuredMiaBlocks(before = "", after = "") {
  const prev = String(before || "");
  const next = String(after || "");

  if (/✅/.test(prev) && !/✅/.test(next)) return false;
  if (/⚠️/.test(prev) && !/⚠️/.test(next)) return false;
  if (/🏆/.test(prev) && !/🏆/.test(next)) return false;
  if (/👉/.test(prev) && !/👉/.test(next)) return false;

  const prevProbe =
    /\?\s*$/.test(prev.trim()) ||
    /\b(liga mais|pesa mais|ajustar melhor|refinar daqui)\b/i.test(prev);
  const nextProbe =
    /\?\s*$/.test(next.trim()) ||
    /\b(liga mais|pesa mais|ajustar melhor|refinar daqui)\b/i.test(next);
  if (prevProbe && !nextProbe) return false;

  return true;
}

/**
 * @param {string} text
 * @param {{
 *   allowedEvidence?: string,
 *   winnerName?: string,
 *   preserveStructure?: boolean,
 * }} [context]
 */
export function cleanupMiaHumanLanguage(text = "", context = {}) {
  const original = String(text || "").trim();
  if (!original) {
    return { text: "", applied: false, flags: [], error: "empty" };
  }

  const paragraphs = original.split(/\n\s*\n/);
  const cleanedParagraphs = paragraphs
    .map((paragraph) => {
      const lines = paragraph.split("\n");
      const cleanedLines = lines.map((line) => cleanupLine(line)).filter(Boolean);
      return stripAiClicheSentences(cleanedLines.join("\n"));
    })
    .filter(Boolean);

  let result = cleanedParagraphs.join("\n\n").trim();
  result = applyPhraseRewrites(result);
  result = removeAiClicheContent(result);

  const beforeFlags = detectAntiAiLanguageFlags(original);
  const afterFlags = detectAntiAiLanguageFlags(result);
  const originalWasPureCliche = beforeFlags.includes(ANTI_AI_LANGUAGE_FLAGS.AI_CLICHE_DETECTED) &&
    beforeFlags.length === 1 &&
    AI_CLICHE_PATTERNS.some((pattern) => pattern.test(original));

  if (
    context.preserveStructure !== false &&
    !preservesStructuredMiaBlocks(original, result)
  ) {
    return {
      text: original,
      applied: false,
      flags: beforeFlags,
      error: "structure_break",
    };
  }

  if (context.winnerName) {
    const winnerNorm = normalizeForCompare(context.winnerName);
    const beforeHasWinner = normalizeForCompare(original).includes(winnerNorm);
    const afterHasWinner = normalizeForCompare(result).includes(winnerNorm);
    if (beforeHasWinner && !afterHasWinner) {
      return {
        text: original,
        applied: false,
        flags: beforeFlags,
        error: "winner_changed",
      };
    }
  }

  const violations = findInventedSpecViolations(
    result,
    context.allowedEvidence || ""
  );
  if (violations.length > 0) {
    return {
      text: original,
      applied: false,
      flags: beforeFlags,
      error: "invented_spec",
    };
  }

  if (!result && originalWasPureCliche) {
    return {
      text: "",
      applied: true,
      flags: [],
      beforeFlags,
      error: null,
    };
  }

  if (!result || (result.length < Math.max(20, original.length * 0.45) && !originalWasPureCliche)) {
    return {
      text: original,
      applied: false,
      flags: beforeFlags,
      error: "meaning_changed",
    };
  }

  return {
    text: result,
    applied: result !== original,
    flags: afterFlags,
    beforeFlags,
    error: null,
  };
}

export function auditAntiAiLanguage(text = "", context = {}) {
  const flags = detectAntiAiLanguageFlags(text);

  if (context.expectClean && flags.length > 0) {
    return flags;
  }

  if (context.allowedEvidence && findInventedSpecViolations(text, context.allowedEvidence).length > 0) {
    flags.push(ANTI_AI_LANGUAGE_FLAGS.MEANING_CHANGED);
  }

  if (context.expectStructure && !preservesStructuredMiaBlocks(context.before || text, text)) {
    if (context.before && /✅/.test(context.before) && !/✅/.test(text)) {
      flags.push(ANTI_AI_LANGUAGE_FLAGS.BROKE_TRADEOFF_BLOCK);
    }
    if (context.before && /🏆/.test(context.before) && !/🏆/.test(text)) {
      flags.push(ANTI_AI_LANGUAGE_FLAGS.BROKE_COMPARISON_LAYOUT);
    }
    if (
      context.before &&
      /\?\s*$/.test(String(context.before).trim()) &&
      !/\?\s*$/.test(String(text).trim())
    ) {
      flags.push(ANTI_AI_LANGUAGE_FLAGS.BROKE_INTENT_DISCOVERY);
    }
  }

  return flags;
}

export function buildAntiAiLanguageAuditRecord(input = {}) {
  const before = String(input.before || input.text || "");
  const cleaned = cleanupMiaHumanLanguage(before, {
    allowedEvidence: input.allowedEvidence || "",
    winnerName: input.winnerName || "",
    preserveStructure: true,
  });

  const flags = auditAntiAiLanguage(cleaned.text, {
    expectClean: true,
    allowedEvidence: input.allowedEvidence || "",
    before,
    expectStructure: true,
  });

  return {
    query: input.query || "",
    category: input.category || "",
    beforeFlags: detectAntiAiLanguageFlags(before),
    afterFlags: flags,
    cleanupApplied: cleaned.applied,
    abstractRemoved: detectAntiAiLanguageFlags(before).includes(
      ANTI_AI_LANGUAGE_FLAGS.ABSTRACT_LANGUAGE_DETECTED
    )
      ? !flags.includes(ANTI_AI_LANGUAGE_FLAGS.ABSTRACT_LANGUAGE_DETECTED)
      : true,
    text: cleaned.text,
    before,
    ok: cleaned.applied && flags.length === 0,
  };
}
