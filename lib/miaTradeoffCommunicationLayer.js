/**
 * PATCH 9.1D — Tradeoff Communication Layer
 *
 * Transforma vantagens e renúncias em ganhos/perdas percebidos na primeira recomendação.
 * Não altera winner, ranking, routing ou decision engine.
 */

import { findInventedSpecViolations } from "./miaProductExplanationBuilder.js";
import { cleanupMiaHumanLanguage } from "./miaAntiAiLanguageCleanupLayer.js";
import { resolveUserFacingDataLayerText } from "./miaDataLayerHumanizationGuard.js";

export const TRADEOFF_COMMUNICATION_LAYER_VERSION = "9.1D.1";

export const TRADEOFF_COMMUNICATION_FLAGS = Object.freeze({
  MISSING_GAIN: "MISSING_GAIN",
  MISSING_SACRIFICE: "MISSING_SACRIFICE",
  TRADEOFF_WORD_LEAK: "TRADEOFF_WORD_LEAK",
  GENERIC_TRADEOFF_BLOCK: "GENERIC_TRADEOFF_BLOCK",
  INVENTED_SPEC: "INVENTED_SPEC",
  TECHNICAL_OVERLOAD: "TECHNICAL_OVERLOAD",
  AI_CLICHE: "AI_CLICHE",
  HARD_CODED_PRODUCT_LOGIC: "HARD_CODED_PRODUCT_LOGIC",
  BROKE_9_1A: "BROKE_9_1A",
  BROKE_9_1B: "BROKE_9_1B",
  BROKE_9_1C: "BROKE_9_1C",
  REGRESSION_8X: "REGRESSION_8X",
});

const AXIS_GAIN_LABELS = Object.freeze({
  performance: "mais folga no uso exigente do dia a dia",
  camera: "fotos e vídeos mais consistentes no uso real",
  battery: "mais autonomia prática longe da tomada",
  screen: "experiência visual mais confortável no cotidiano",
  longevity: "mais segurança para usar o produto por mais tempo",
  value: "melhor retorno pelo que você vai gastar",
  storage: "mais margem para apps, arquivos e mídia",
  comfort: "mais conforto no uso prolongado",
});

const AXIS_SACRIFICE_LABELS = Object.freeze({
  performance: "desempenho máximo frente aos concorrentes mais novos",
  camera: "câmera no topo absoluto da categoria",
  battery: "autonomia acima da média da categoria",
  screen: "tela mais fluida ou premium",
  longevity: "recursos mais novos de geração recente",
  value: "preço ainda mais baixo em opções mais básicas",
  storage: "capacidade máxima sem pagar a mais",
  comfort: "conforto premium de modelos mais caros",
});

const AI_CLICHE_PATTERNS = Object.freeze([
  /como assistente/i,
  /excelente escolha/i,
  /ótima opção/i,
  /otima opcao/i,
]);

const TECHNICAL_OVERLOAD_PATTERNS = Object.freeze([
  /\b(?:snapdragon|mediatek|dimensity|exynos|apple a\d+)\b/i,
  /\b(?:rtx|gtx)\s*\d/i,
  /\b\d+\s*mah\b/i,
  /\b\d+\s*mp\b/i,
  /\b(?:ois|amoled|120hz|144hz)\b/i,
]);

const GENERIC_BLOCK_PATTERNS = Object.freeze([
  /^produto bom\.?$/i,
  /^vale a pena\.?$/i,
  /^recomendo\.?$/i,
]);

const GENERIC_CONSEQUENCE_PATTERNS = Object.freeze([
  /um ganho pr[aá]tico percept[ií]vel no uso cotidiano/i,
  /sem depender de detalhe t[eé]cnico isolado/i,
  /uma ren[uú]ncia percept[ií]vel que vale pesar/i,
  /um tradeoff percept[ií]vel que vale pesar/i,
  /tradeoff/i,
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

function capitalizeLead(text = "") {
  const body = cleanText(text);
  if (!body) return "";
  return body.charAt(0).toUpperCase() + body.slice(1);
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

function cleanList(value, max = 2) {
  if (Array.isArray(value)) {
    return value.map((entry) => cleanText(entry)).filter(Boolean).slice(0, max);
  }
  if (typeof value === "string" && value.trim()) {
    return [cleanText(value)].slice(0, max);
  }
  return [];
}

function normalizeForOverlap(text = "") {
  return cleanText(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ");
}

function isGenericConsequence(text = "") {
  const body = cleanText(text);
  if (!body) return true;
  return GENERIC_CONSEQUENCE_PATTERNS.some((pattern) => pattern.test(body));
}

function sanitizeTradeoffLanguage(text = "") {
  return cleanText(text)
    .replace(/\bum tradeoff percept[ií]vel\b/gi, "uma renúncia perceptível")
    .replace(/\btradeoffs?\b/gi, "escolhas")
    .replace(/\btradeoff\b/gi, "escolha");
}

function filterUsefulConsequences(values = [], max = 2) {
  const unique = [];
  for (const entry of cleanList(values, max + 2)) {
    const sanitized = sanitizeTradeoffLanguage(entry);
    if (!sanitized || isGenericConsequence(sanitized)) continue;
    if (unique.some((item) => normalizeForOverlap(item) === normalizeForOverlap(sanitized))) {
      continue;
    }
    unique.push(sanitized);
    if (unique.length >= max) break;
  }
  return unique;
}

function overlapsExistingBlocks(candidate = "", existing = []) {
  const normalized = normalizeForOverlap(candidate);
  if (!normalized || normalized.length < 20) return false;

  const existingHasFormattedTradeoff = existing.some(
    (block) => /✅/.test(block) && /⚠️/.test(block)
  );
  if (!existingHasFormattedTradeoff) {
    return existing.some((block) => {
      const prev = normalizeForOverlap(block);
      if (!prev) return false;
      return prev.includes(normalized) || normalized.includes(prev);
    });
  }

  return existing.some((block) => {
    const prev = normalizeForOverlap(block);
    if (!prev) return false;
    if (prev.includes(normalized) || normalized.includes(prev)) return true;

    const words = normalized.split(" ").filter((w) => w.length > 4);
    const prevWords = prev.split(" ").filter((w) => w.length > 4);
    if (words.length < 4 || prevWords.length < 4) return false;
    const overlap = words.filter((w) => prevWords.includes(w)).length;
    return overlap / Math.min(words.length, prevWords.length) >= 0.72;
  });
}

function humanizeAxisLabel(label = "") {
  return cleanText(label)
    .replace(/^menos destaque em\s+/i, "")
    .replace(/^desempenho$/i, "performance")
    .replace(/^câmera$/i, "camera")
    .replace(/^camera$/i, "camera")
    .replace(/^custo-benefício$/i, "value")
    .replace(/^custo beneficio$/i, "value")
    .toLowerCase();
}

function humanizeIdealForGain(text = "") {
  const body = stripTrailingPeriod(text);
  if (!body) return "";

  if (/^mais alinhamento para\b/i.test(body)) return body;

  if (/^(quem|para quem)\b/i.test(body)) {
    return `mais alinhamento para ${lowercaseLead(body)}`;
  }

  if (/^precisa de\b/i.test(body)) {
    return `mais alinhamento para quem ${lowercaseLead(body)}`;
  }

  if (/^assiste\b/i.test(body)) {
    return `mais alinhamento para quem ${lowercaseLead(body)}`;
  }

  if (/^(uso|perfil)\b/i.test(body)) {
    return `mais alinhamento para ${lowercaseLead(body)}`;
  }

  return body;
}

function humanizeStrengthGain(text = "") {
  const body = stripTrailingPeriod(text);
  if (!body) return "";

  return body
    .replace(/^tende a ajudar com\s+/i, "")
    .replace(/\s+no uso cotidiano$/i, "")
    .trim();
}

function formatGainLine(text = "", seed = "") {
  const body = humanizeIdealForGain(stripTrailingPeriod(text));
  if (!body) return "";

  if (/^(ganha|você leva|fica com|leva|mais alinhamento)\b/i.test(body)) {
    const normalized =
      body.charAt(0).toLowerCase() === body.charAt(0)
        ? body
        : body.charAt(0).toLowerCase() + body.slice(1);
    return normalized.startsWith("mais alinhamento")
      ? `✅ ganha ${normalized}`
      : `✅ ${normalized}`;
  }

  const frames = [
    (entry) => `ganha ${lowercaseLead(entry)}`,
    (entry) => `você leva ${lowercaseLead(entry)}`,
    (entry) => `fica com ${lowercaseLead(entry)}`,
  ];

  return `✅ ${pickVariant(frames, seed)(body)}`;
}

function formatSacrificeLine(text = "", seed = "", index = 0) {
  const body = stripTrailingPeriod(sanitizeTradeoffLanguage(text));
  if (!body) return "";

  if (/^(abre mão|em troca|não terá|também não terá)\b/i.test(body)) {
    return index === 0 ? `⚠️ ${body}` : `⚠️ também ${lowercaseLead(body)}`;
  }

  if (
    /^(pode|vale|n[aã]o [eé]|nao e|n[aã]o acompanha|nao acompanha|h[aá]|risco)\b/i.test(
      body
    )
  ) {
    const cleaned = body
      .replace(/^pode pesar na decisão:\s*/i, "")
      .replace(/^pode pesar:\s*/i, "");
    return index === 0
      ? `⚠️ ${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}`
      : `⚠️ também ${lowercaseLead(cleaned)}`;
  }

  const frames =
    index === 0
      ? [
          (entry) => `abre mão de ${lowercaseLead(entry)}`,
          (entry) => `em troca, abre mão de ${lowercaseLead(entry)}`,
          (entry) => `não terá ${lowercaseLead(entry)}`,
        ]
      : [
          (entry) => `não terá ${lowercaseLead(entry)}`,
          (entry) => `abre mão de ${lowercaseLead(entry)}`,
          (entry) => `fica sem ${lowercaseLead(entry)}`,
        ];

  const line = pickVariant(frames, `${seed}-${index}`)(body);
  return index === 0 ? `⚠️ ${line}` : `⚠️ também ${line.replace(/^em troca,\s*/i, "")}`;
}

/**
 * @param {{
 *   structuredFacts?: Record<string, unknown>|null,
 *   searchCognition?: Record<string, unknown>,
 *   decisionMemory?: Record<string, unknown>,
 *   primaryAxis?: string,
 * }} input
 */
export function resolveTradeoffCommunicationSources(input = {}) {
  const structuredFacts = input.structuredFacts || {};
  const decisionMemory = input.decisionMemory || {};
  const searchCognition = input.searchCognition || {};
  const primaryAxis = cleanText(input.primaryAxis || searchCognition.primaryAxis || "");

  const gains = filterUsefulConsequences(structuredFacts.strengthConsequences, 2).map(
    humanizeStrengthGain
  );
  const idealFor = filterUsefulConsequences(structuredFacts.idealForConsequences, 1).map(
    humanizeIdealForGain
  );

  for (const entry of idealFor) {
    if (gains.length >= 2) break;
    if (!gains.some((gain) => normalizeForOverlap(gain).includes(normalizeForOverlap(entry).slice(0, 16)))) {
      gains.push(entry);
    }
  }

  if (gains.length === 0 && primaryAxis && AXIS_GAIN_LABELS[primaryAxis]) {
    gains.push(AXIS_GAIN_LABELS[primaryAxis]);
  }

  if (gains.length === 0) {
    const impact = stripTrailingPeriod(searchCognition?.consequenceChain?.impact || "");
    if (impact) gains.push(impact);
  }

  const winnerAdvantages = cleanList(decisionMemory.lastWinnerAdvantages, 2).map((entry) => {
    const axis = humanizeAxisLabel(entry);
    return AXIS_GAIN_LABELS[axis] || `mais destaque em ${lowercaseLead(entry)}`;
  });

  for (const entry of winnerAdvantages) {
    if (gains.length >= 2) break;
    if (!gains.some((gain) => normalizeForOverlap(gain) === normalizeForOverlap(entry))) {
      gains.push(entry);
    }
  }

  const sacrifices = filterUsefulConsequences(structuredFacts.weaknessConsequences, 2);
  const avoidIf = filterUsefulConsequences(structuredFacts.avoidIfConsequences, 1);
  for (const entry of avoidIf) {
    if (sacrifices.length >= 2) break;
    sacrifices.push(entry);
  }

  const honest = sanitizeTradeoffLanguage(
    stripTrailingPeriod(
      resolveUserFacingDataLayerText(searchCognition?.tradeoffHonest || "") ||
        resolveUserFacingDataLayerText(searchCognition?.narrativeBlocks?.tradeoffHonest || "") ||
        resolveUserFacingDataLayerText(decisionMemory?.lastTradeoff || "") ||
        ""
    )
  );
  if (honest && !isGenericConsequence(honest) && sacrifices.length < 2) {
    sacrifices.push(honest.replace(/^ponto de atenção:\s*/i, ""));
  }

  const winnerSacrifices = cleanList(decisionMemory.lastWinnerSacrifices, 2).map((entry) => {
    const axis = humanizeAxisLabel(entry);
    return AXIS_SACRIFICE_LABELS[axis] || `menos destaque em ${lowercaseLead(entry)}`;
  });

  for (const entry of winnerSacrifices) {
    if (sacrifices.length >= 2) break;
    if (
      !sacrifices.some(
        (item) =>
          normalizeForOverlap(item) === normalizeForOverlap(entry) ||
          normalizeForOverlap(item).includes(normalizeForOverlap(entry).slice(0, 24))
      )
    ) {
      sacrifices.push(entry);
    }
  }

  if (sacrifices.length === 0 && primaryAxis && AXIS_SACRIFICE_LABELS[primaryAxis]) {
    sacrifices.push(`parte do que concorrentes mais novos entregam melhor em ${primaryAxis}`);
  }

  const dedupedSacrifices = [];
  for (const entry of sacrifices) {
    const key = normalizeForOverlap(entry);
    if (dedupedSacrifices.some((item) => normalizeForOverlap(item) === key)) continue;
    dedupedSacrifices.push(entry);
  }

  return {
    gains: gains.slice(0, 2),
    sacrifices: dedupedSacrifices.slice(0, 2),
    primaryAxis,
  };
}

export function shouldApplyTradeoffCommunication(input = {}) {
  if (input.responsePath && input.responsePath !== "return_seguro") {
    return false;
  }

  const recoveryTypes = new Set([
    "contradiction_recovery",
    "user_confusion_recovery",
    "escalated_confusion_recovery",
    "post_change_recovery",
    "final_decision_scope",
  ]);

  if (recoveryTypes.has(input.sessionContext?.lastInteractionType)) {
    return false;
  }

  if (input.intent === "comparison") return false;

  return true;
}

export function containsTradeoffWord(text = "") {
  return /\btradeoff\b/i.test(cleanText(text));
}

export function isTradeoffCommunicationUseful(text = "") {
  const body = cleanText(text);
  if (!body || body.length < 40) return false;
  if (GENERIC_BLOCK_PATTERNS.some((pattern) => pattern.test(body))) return false;

  const hasGain = /✅|\bganha\b|\bvocê leva\b|\bfica com\b/i.test(body);
  const hasSacrifice = /⚠️|\babre mão\b|\bnão terá\b|\bem troca\b|\bfica sem\b/i.test(body);

  return hasGain && hasSacrifice;
}

/**
 * @param {{
 *   structuredFacts?: Record<string, unknown>|null,
 *   searchCognition?: Record<string, unknown>,
 *   decisionMemory?: Record<string, unknown>,
 *   query?: string,
 *   primaryAxis?: string,
 *   existingParagraphs?: string[],
 *   allowedEvidence?: string,
 *   responsePath?: string,
 *   sessionContext?: Record<string, unknown>,
 *   intent?: string,
 * }} input
 */
export function buildTradeoffCommunicationBlock(input = {}) {
  if (!shouldApplyTradeoffCommunication(input)) {
    return { ok: false, block: "", sources: null, error: "suppressed" };
  }

  const query = cleanText(input.query || "");
  const seed = `${query}-${input.primaryAxis || ""}`;
  const sources = resolveTradeoffCommunicationSources(input);
  const existing = Array.isArray(input.existingParagraphs) ? input.existingParagraphs : [];

  if (sources.gains.length === 0 || sources.sacrifices.length === 0) {
    return { ok: false, block: "", sources, error: "insufficient_sources" };
  }

  const intro = pickVariant(
    [
      "Se você seguir por esse caminho:",
      "Na prática, a escolha fica assim:",
      "Resumindo o que você ganha e o que abre mão:",
    ],
    seed
  );

  const gainLines = sources.gains
    .map((entry, index) => formatGainLine(entry, `${seed}-gain-${index}`))
    .filter(Boolean);
  const sacrificeLines = sources.sacrifices
    .map((entry, index) => formatSacrificeLine(entry, `${seed}-sac-${index}`, index))
    .filter(Boolean);

  const uniqueSacrificeLines = [];
  const seenSacrifices = new Set();
  for (const line of sacrificeLines) {
    const key = normalizeForOverlap(line.replace(/^⚠️\s*(?:também\s*)?/i, ""));
    if (seenSacrifices.has(key)) continue;
    seenSacrifices.add(key);
    uniqueSacrificeLines.push(line);
  }

  const block = [intro, "", ...gainLines, "", ...uniqueSacrificeLines].join("\n");

  if (overlapsExistingBlocks(block, existing)) {
    return { ok: false, block: "", sources, error: "duplicate_block" };
  }

  if (!isTradeoffCommunicationUseful(block)) {
    return { ok: false, block: "", sources, error: "not_useful" };
  }

  if (containsTradeoffWord(block)) {
    return { ok: false, block: "", sources, error: "tradeoff_word_leak" };
  }

  if (findInventedSpecViolations(block, input.allowedEvidence || "").length > 0) {
    return { ok: false, block: "", sources, error: "invented_spec" };
  }

  if (TECHNICAL_OVERLOAD_PATTERNS.some((pattern) => pattern.test(block))) {
    return { ok: false, block: "", sources, error: "technical_overload" };
  }

  if (AI_CLICHE_PATTERNS.some((pattern) => pattern.test(block))) {
    return { ok: false, block: "", sources, error: "ai_cliche" };
  }

  return {
    ok: true,
    block: cleanupMiaHumanLanguage(block, {
      allowedEvidence: input.allowedEvidence || "",
      preserveStructure: true,
    }).text || block,
    sources,
    error: null,
  };
}

export function auditTradeoffCommunication(text = "", context = {}) {
  const flags = [];
  const body = cleanText(text);

  if (context.expectBlock && !isTradeoffCommunicationUseful(body)) {
    if (!/✅|\bganha\b/i.test(body)) flags.push(TRADEOFF_COMMUNICATION_FLAGS.MISSING_GAIN);
    if (!/⚠️|\babre mão\b|\bnão terá\b/i.test(body)) {
      flags.push(TRADEOFF_COMMUNICATION_FLAGS.MISSING_SACRIFICE);
    }
  }

  if (containsTradeoffWord(body)) {
    flags.push(TRADEOFF_COMMUNICATION_FLAGS.TRADEOFF_WORD_LEAK);
  }

  if (body && !isTradeoffCommunicationUseful(body)) {
    flags.push(TRADEOFF_COMMUNICATION_FLAGS.GENERIC_TRADEOFF_BLOCK);
  }

  if (findInventedSpecViolations(body, context.allowedEvidence || "").length > 0) {
    flags.push(TRADEOFF_COMMUNICATION_FLAGS.INVENTED_SPEC);
  }

  if (TECHNICAL_OVERLOAD_PATTERNS.some((pattern) => pattern.test(body))) {
    flags.push(TRADEOFF_COMMUNICATION_FLAGS.TECHNICAL_OVERLOAD);
  }

  if (AI_CLICHE_PATTERNS.some((pattern) => pattern.test(body))) {
    flags.push(TRADEOFF_COMMUNICATION_FLAGS.AI_CLICHE);
  }

  return flags;
}

export function extractTradeoffBlockFromReply(reply = "") {
  const chunks = String(reply || "")
    .split(/\n\s*\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  const formattedChunk = chunks.find(
    (chunk) =>
      /✅/.test(chunk) &&
      /⚠️/.test(chunk) &&
      isTradeoffCommunicationUseful(chunk)
  );
  if (formattedChunk) return formattedChunk;

  const inlineMatch = String(reply || "").match(
    /(?:Se você seguir por esse caminho|Na prática, a escolha fica assim|Resumindo o que você ganha e o que abre mão):[\s\S]*?(?=(?:\n\n(?:Me ajuda|Pra refinar|Um detalhe|Se quiser)|$))/i
  );
  if (inlineMatch && isTradeoffCommunicationUseful(inlineMatch[0])) {
    return inlineMatch[0].trim();
  }

  return "";
}

export function buildTradeoffCommunicationAuditRecord(input = {}) {
  const built = buildTradeoffCommunicationBlock(input);
  const flags = auditTradeoffCommunication(built.block, {
    expectBlock: true,
    allowedEvidence: input.allowedEvidence || "",
  });

  return {
    query: input.query || "",
    category: input.category || "",
    tradeoffBlockDetected: built.ok,
    gainDetected: built.ok && /✅|\bganha\b/i.test(built.block),
    sacrificeDetected: built.ok && /⚠️|\babre mão\b|\bnão terá\b/i.test(built.block),
    tradeoffWordLeak: flags.includes(TRADEOFF_COMMUNICATION_FLAGS.TRADEOFF_WORD_LEAK),
    inventedSpecDetected: flags.includes(TRADEOFF_COMMUNICATION_FLAGS.INVENTED_SPEC),
    flags,
    block: built.block,
    ok: built.ok && flags.length === 0,
  };
}
