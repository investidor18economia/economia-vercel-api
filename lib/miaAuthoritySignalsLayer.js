/**
 * PATCH 9.1C — Authority Signals Layer
 *
 * Insere sinal de autoridade humano na primeira recomendação.
 * Não altera winner, ranking, routing ou decision engine.
 */

import { extractBudget } from "./miaRoutingSafety.js";
import {
  extractConsequenceTexts,
  translateDataLayerFieldsToConsequences,
} from "./miaConsequenceTranslationLayer.js";
import { findInventedSpecViolations } from "./miaProductExplanationBuilder.js";
import { cleanupMiaHumanLanguage } from "./miaAntiAiLanguageCleanupLayer.js";

export const AUTHORITY_SIGNALS_LAYER_VERSION = "9.1C.1";

export const AUTHORITY_SIGNAL_FLAGS = Object.freeze({
  MISSING_AUTHORITY_SIGNAL: "MISSING_AUTHORITY_SIGNAL",
  AUTHORITY_SIGNAL_TOO_GENERIC: "AUTHORITY_SIGNAL_TOO_GENERIC",
  INVENTED_SPEC: "INVENTED_SPEC",
  TECHNICAL_OVERLOAD: "TECHNICAL_OVERLOAD",
  AI_CLICHE: "AI_CLICHE",
  HARD_CODED_PRODUCT_LOGIC: "HARD_CODED_PRODUCT_LOGIC",
  CATEGORY_LOCKED_TO_SMARTPHONE: "CATEGORY_LOCKED_TO_SMARTPHONE",
  WINNER_CHANGED: "WINNER_CHANGED",
  CARD_MISMATCH: "CARD_MISMATCH",
  REGRESSION_8X: "REGRESSION_8X",
  BROKE_9_1A: "BROKE_9_1A",
  BROKE_9_1B: "BROKE_9_1B",
});

const AI_CLICHE_PATTERNS = Object.freeze([
  /como assistente/i,
  /sou especialista/i,
  /confie em mim/i,
  /excelente escolha/i,
  /ótima pergunta/i,
  /otima pergunta/i,
]);

const TECHNICAL_OVERLOAD_PATTERNS = Object.freeze([
  /\b(?:snapdragon|mediatek|dimensity|exynos|apple a\d+)\b/i,
  /\b(?:rtx|gtx)\s*\d/i,
  /\b\d+\s*mah\b/i,
  /\b\d+\s*mp\b/i,
  /\b(?:ois|amoled|oled|lcd ips)\b/i,
]);

const SMARTPHONE_HARDCODE_PATTERNS = Object.freeze([
  /\biphone\s*\d/i,
  /\bgalaxy\s*[saz]\d/i,
  /\bredmi\s*note/i,
  /\bmoto\s*g\d/i,
]);

const USEFUL_AUTHORITY_MARKERS = Object.freeze([
  /muita gente/i,
  /costuma enganar/i,
  /detalhe que/i,
  /n[aã]o aparece/i,
  /an[uú]ncio/i,
  /nessa faixa/i,
  /depois de alguns meses/i,
  /consist[eê]ncia/i,
  /arrepend/i,
  /separar/i,
  /separar uma boa compra/i,
  /uso real/i,
  /ficha t[eé]cnica/i,
  /n[uú]mero mais chamativo/i,
  /olha s[oó] o pre[cç]o/i,
]);

const GENERIC_DECORATIVE_PATTERNS = Object.freeze([
  /^produto de qualidade\.?$/i,
  /^excelente op[cç][aã]o\.?$/i,
  /^muito bom produto\.?$/i,
  /^recomendo fortemente\.?$/i,
]);

const CATEGORY_BAND_NUANCE = Object.freeze([
  {
    pattern: /\b(celular|smartphone)\b/i,
    frames: [
      "nessa faixa, nem sempre vence quem tem o número mais chamativo no anúncio — vence quem entrega consistência depois de alguns meses",
      "o erro comum aqui é escolher pelo recurso mais chamativo e esquecer como o aparelho se comporta no uso real",
      "muita gente olha só o preço, mas o que pesa é a chance de continuar agradável de usar por mais tempo",
    ],
  },
  {
    pattern: /\b(notebook|laptop)\b/i,
    frames: [
      "nessa faixa, o que costuma enganar é configuração que parece completa no anúncio, mas limita cedo em multitarefa ou programas mais pesados",
      "muita gente compara só processador no papel; na prática, o conjunto de memória, armazenamento e refrigeração pesa mais",
      "o detalhe que separa uma boa compra de uma compra frustrada aqui é menos brilho de ficha e mais folga no uso real",
    ],
  },
  {
    pattern: /\b(tv|televis[aã]o|smart tv|monitor)\b/i,
    frames: [
      "nessa faixa, o anúncio costuma destacar tamanho e resolução, mas a experiência real depende bastante de software, painel e fluidez no dia a dia",
      "muita gente escolhe só pelo número na caixa; o que pesa depois é consistência de imagem e praticidade de uso",
      "o ponto que não aparece tão claro no anúncio é como a tela se comporta com streaming, jogos ou trabalho prolongado",
    ],
  },
  {
    pattern: /\b(cadeira)\b/i,
    frames: [
      "nessa faixa, foto bonita no anúncio engana — o que pesa mesmo é suporte, ergonomia e como a estrutura aguenta uso prolongado",
      "muita gente compra pela aparência; depois de algumas semanas, conforto e ajuste pesam mais do que parece",
    ],
  },
  {
    pattern: /\b(fone|headphone|mouse|teclado)\b/i,
    frames: [
      "nessa faixa, o preço baixo chama atenção, mas a diferença real aparece no conforto, durabilidade e consistência no uso diário",
      "muita gente compara só pelo valor; o detalhe que pesa depois é se o produto continua confortável e confiável com o tempo",
    ],
  },
  {
    pattern: /\b(c[aâ]mera|camera)\b/i,
    frames: [
      "nessa faixa, megapixel no anúncio impressiona, mas a consistência de foto e vídeo no uso real pesa mais do que o número isolado",
      "muita gente olha só a spec de destaque; o que separa boa compra de arrependimento é equilíbrio entre lente, estabilização e uso prático",
    ],
  },
  {
    pattern: /.*/,
    frames: [
      "nessa faixa, nem sempre vence quem parece mais completo no anúncio — vence quem entrega consistência no uso real",
      "muita gente olha só o preço, mas o que pesa é a chance de a compra continuar fazendo sentido depois de alguns meses",
      "o detalhe que costuma enganar aqui é brilho de ficha técnica sem equilíbrio real para o uso",
    ],
  },
]);

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
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

function firstNonEmpty(values = []) {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return "";
}

function resolveBudgetFromQuery(query = "", explicitBudget = null) {
  if (explicitBudget != null && Number.isFinite(Number(explicitBudget))) {
    return Number(explicitBudget);
  }
  const fromExtractor = extractBudget(query);
  if (fromExtractor != null) return fromExtractor;
  const shorthand = String(query || "").toLowerCase().match(/\b(\d+(?:[.,]\d+)?)\s*k\b/);
  if (!shorthand) return null;
  const base = Number(String(shorthand[1]).replace(",", "."));
  if (!Number.isFinite(base) || base <= 0) return null;
  return Math.round(base * 1000);
}

function normalizeForOverlap(text = "") {
  return cleanText(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ");
}

function overlapsExistingParagraphs(candidate = "", paragraphs = []) {
  const normalized = normalizeForOverlap(candidate);
  if (!normalized || normalized.length < 20) return true;

  return paragraphs.some((paragraph) => {
    const prev = normalizeForOverlap(paragraph);
    if (!prev) return false;
    if (prev.includes(normalized) || normalized.includes(prev)) return true;

    const words = normalized.split(" ").filter((w) => w.length > 4);
    const prevWords = prev.split(" ").filter((w) => w.length > 4);
    if (words.length < 4 || prevWords.length < 4) return false;
    const overlap = words.filter((w) => prevWords.includes(w)).length;
    return overlap / Math.min(words.length, prevWords.length) >= 0.65;
  });
}

/**
 * @param {{
 *   product?: Record<string, unknown>,
 *   structuredFacts?: Record<string, unknown>|null,
 *   searchCognition?: Record<string, unknown>,
 *   decisionMemory?: Record<string, unknown>,
 *   query?: string,
 *   category?: string,
 *   budget?: number|null,
 *   primaryAxis?: string,
 * }} input
 */
export function resolveAuthoritySignalSource(input = {}) {
  const product = input.product || {};
  const trustedSpecs = product.trustedSpecs || null;
  const structuredFacts = input.structuredFacts || null;
  const query = cleanText(input.query || "");
  const category = cleanText(`${input.category || ""} ${query}`);

  let translated = null;
  if (trustedSpecs) {
    translated = translateDataLayerFieldsToConsequences(trustedSpecs);
  }

  const riskInsight = firstNonEmpty(extractConsequenceTexts(translated?.riskNotes, 1));
  const marketInsight = firstNonEmpty(extractConsequenceTexts(translated?.notes, 1));
  const strategicInsight = firstNonEmpty(
    extractConsequenceTexts(structuredFacts?.noteConsequences, 1)
  );
  const weaknessInsight = firstNonEmpty(
    input.structuredFacts?.weaknessConsequences ||
      extractConsequenceTexts(translated?.weaknesses, 1)
  );

  if (riskInsight) {
    return { type: "risk_note", insight: riskInsight, source: "data_layer" };
  }

  if (marketInsight) {
    return { type: "market_note", insight: marketInsight, source: "data_layer" };
  }

  if (strategicInsight) {
    return { type: "strategic_note", insight: strategicInsight, source: "data_layer" };
  }

  if (weaknessInsight) {
    return {
      type: "hidden_factor",
      insight: weaknessInsight,
      source: "data_layer_weakness",
    };
  }

  const axis = cleanText(input.primaryAxis || input.searchCognition?.primaryAxis || "");
  const consequence = cleanText(input.searchCognition?.consequenceChain?.consequence || "");
  if (consequence && axis === "longevity") {
    return {
      type: "longevity_nuance",
      insight: consequence,
      source: "consequence_chain",
    };
  }

  const budget = resolveBudgetFromQuery(query, input.budget);
  if (budget || /\b(barato|econom|faixa|at[eé]\s*\d|2k|3k)\b/i.test(query)) {
    for (const profile of CATEGORY_BAND_NUANCE) {
      if (profile.pattern.test(category)) {
        const frame = pickVariant(profile.frames, `${query}-${category}-${budget || "none"}`);
        return { type: "band_nuance", insight: frame, source: "category_band" };
      }
    }
  }

  const genericFrame = pickVariant(
    CATEGORY_BAND_NUANCE.at(-1).frames,
    `${query}-generic`
  );
  return { type: "generic_purchase", insight: genericFrame, source: "generic_band" };
}

function buildAuthoritySignalParagraph(source = {}, context = {}) {
  const insight = cleanText(source.insight || "");
  if (!insight) return "";

  const seed = `${context.query || ""}-${source.type || ""}-${context.primaryAxis || ""}`;
  const openers = [
    "Um detalhe que muita gente ignora:",
    "Nessa faixa, o que costuma enganar:",
    "O ponto que separa uma boa compra de uma compra arrependida aqui:",
    "Isso não aparece tão claro no anúncio, mas",
    "Muita gente olha só o preço, mas",
    "O detalhe que pesa aqui:",
  ];

  const opener = pickVariant(openers, seed);

  if (source.type === "hidden_factor") {
    const bodies = [
      `muita gente só compara o destaque do anúncio e esquece que ${lowercaseLead(insight)}`,
      `o risco escondido nessa faixa é ${lowercaseLead(insight)}`,
      `o que separa escolha segura de escolha mediana aqui é saber que ${lowercaseLead(insight)}`,
    ];
    return capitalizeLead(`${opener} ${pickVariant(bodies, `${seed}-weak`)}.`);
  }

  if (source.type === "risk_note" || source.type === "market_note" || source.type === "strategic_note") {
    const bodies = [
      `${lowercaseLead(insight)} — e isso pesa mais do que parece na hora de comparar anúncios`,
      `${lowercaseLead(insight)}; é exatamente esse tipo de nuance que muda a decisão`,
      `vale lembrar que ${lowercaseLead(insight)}`,
    ];
    return capitalizeLead(`${opener} ${pickVariant(bodies, `${seed}-note`)}.`);
  }

  if (source.type === "band_nuance" || source.type === "generic_purchase" || source.type === "longevity_nuance") {
    const frames = [
      (body) => `Um detalhe que muita gente ignora: ${lowercaseLead(body)}.`,
      (body) => `Muita gente olha só o preço, mas ${lowercaseLead(body)}.`,
      (body) => capitalizeLead(body.endsWith(".") ? body : `${body}.`),
      (body) => `O ponto que separa uma boa compra de uma compra arrependida aqui: ${lowercaseLead(body)}.`,
    ];
    return pickVariant(frames, seed)(insight);
  }

  return capitalizeLead(`${opener} ${lowercaseLead(insight)}.`);
}

export function shouldApplyAuthoritySignal(input = {}) {
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

export function containsInventedAuthorityClaim(text = "", allowedEvidence = "") {
  return findInventedSpecViolations(text, allowedEvidence).length > 0;
}

export function isAuthoritySignalUseful(text = "") {
  const body = cleanText(text);
  if (!body || body.length < 40) return false;
  if (GENERIC_DECORATIVE_PATTERNS.some((pattern) => pattern.test(body))) return false;
  return USEFUL_AUTHORITY_MARKERS.some((pattern) => pattern.test(body));
}

/**
 * @param {{
 *   product?: Record<string, unknown>,
 *   structuredFacts?: Record<string, unknown>|null,
 *   searchCognition?: Record<string, unknown>,
 *   decisionMemory?: Record<string, unknown>,
 *   query?: string,
 *   category?: string,
 *   budget?: number|null,
 *   primaryAxis?: string,
 *   existingParagraphs?: string[],
 *   allowedEvidence?: string,
 *   responsePath?: string,
 *   sessionContext?: Record<string, unknown>,
 *   intent?: string,
 * }} input
 */
export function buildAuthoritySignal(input = {}) {
  if (!shouldApplyAuthoritySignal(input)) {
    return { ok: false, paragraph: "", source: null, error: "suppressed" };
  }

  const source = resolveAuthoritySignalSource(input);
  const paragraph = buildAuthoritySignalParagraph(source, input);
  const existing = Array.isArray(input.existingParagraphs) ? input.existingParagraphs : [];

  if (!paragraph || overlapsExistingParagraphs(paragraph, existing)) {
    return { ok: false, paragraph: "", source, error: "duplicate_or_empty" };
  }

  if (!isAuthoritySignalUseful(paragraph)) {
    return { ok: false, paragraph: "", source, error: "not_useful" };
  }

  if (containsInventedAuthorityClaim(paragraph, input.allowedEvidence || "")) {
    return { ok: false, paragraph: "", source, error: "invented_spec" };
  }

  if (TECHNICAL_OVERLOAD_PATTERNS.some((pattern) => pattern.test(paragraph))) {
    return { ok: false, paragraph: "", source, error: "technical_overload" };
  }

  if (SMARTPHONE_HARDCODE_PATTERNS.some((pattern) => pattern.test(paragraph))) {
    return { ok: false, paragraph: "", source, error: "hardcoded_product" };
  }

  if (AI_CLICHE_PATTERNS.some((pattern) => pattern.test(paragraph))) {
    return { ok: false, paragraph: "", source, error: "ai_cliche" };
  }

  return {
    ok: true,
    paragraph:
      cleanupMiaHumanLanguage(paragraph, {
        allowedEvidence: input.allowedEvidence || "",
        preserveStructure: true,
      }).text || paragraph,
    source,
    error: null,
  };
}

export function auditAuthoritySignal(text = "", context = {}) {
  const flags = [];
  const body = cleanText(text);

  if (context.expectAuthority && !isAuthoritySignalUseful(body)) {
    flags.push(AUTHORITY_SIGNAL_FLAGS.MISSING_AUTHORITY_SIGNAL);
  }

  if (body && !isAuthoritySignalUseful(body)) {
    flags.push(AUTHORITY_SIGNAL_FLAGS.AUTHORITY_SIGNAL_TOO_GENERIC);
  }

  if (containsInventedAuthorityClaim(body, context.allowedEvidence || "")) {
    flags.push(AUTHORITY_SIGNAL_FLAGS.INVENTED_SPEC);
  }

  if (TECHNICAL_OVERLOAD_PATTERNS.some((pattern) => pattern.test(body))) {
    flags.push(AUTHORITY_SIGNAL_FLAGS.TECHNICAL_OVERLOAD);
  }

  if (AI_CLICHE_PATTERNS.some((pattern) => pattern.test(body))) {
    flags.push(AUTHORITY_SIGNAL_FLAGS.AI_CLICHE);
  }

  if (SMARTPHONE_HARDCODE_PATTERNS.some((pattern) => pattern.test(body))) {
    flags.push(AUTHORITY_SIGNAL_FLAGS.CATEGORY_LOCKED_TO_SMARTPHONE);
  }

  return flags;
}

export function buildAuthoritySignalAuditRecord(input = {}) {
  const authority = buildAuthoritySignal(input);
  const flags = auditAuthoritySignal(authority.paragraph, {
    expectAuthority: true,
    allowedEvidence: input.allowedEvidence || "",
  });

  return {
    query: input.query || "",
    category: input.category || "",
    authoritySignalDetected: authority.ok,
    authoritySignalUseful: authority.ok && isAuthoritySignalUseful(authority.paragraph),
    sourceType: authority.source?.type || "",
    inventedSpecDetected: flags.includes(AUTHORITY_SIGNAL_FLAGS.INVENTED_SPEC),
    tooGenericDetected: flags.includes(AUTHORITY_SIGNAL_FLAGS.AUTHORITY_SIGNAL_TOO_GENERIC),
    technicalOverloadDetected: flags.includes(AUTHORITY_SIGNAL_FLAGS.TECHNICAL_OVERLOAD),
    flags,
    paragraph: authority.paragraph,
    ok: authority.ok && flags.length === 0,
  };
}
