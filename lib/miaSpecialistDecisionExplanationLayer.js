/**
 * PATCH 9.1A — Specialist Decision Explanation Layer
 *
 * Enriquece a primeira recomendação com explicação especializada de decisão.
 * Não altera winner, ranking, routing ou decision engine.
 */

import { extractBudget } from "./miaRoutingSafety.js";
import {
  buildStructuredExplanationFacts,
  findInventedSpecViolations,
  hasUsableDataLayerContent,
} from "./miaProductExplanationBuilder.js";
import { containsArchitectureLeak } from "./miaCommercialExplanationVerbalizer.js";

export const SPECIALIST_DECISION_EXPLANATION_VERSION = "9.1A.1";

export const SPECIALIST_DECISION_FLAGS = Object.freeze({
  GENERIC_DECISION_EXPLANATION: "GENERIC_DECISION_EXPLANATION",
  MISSING_BUDGET_UNDERSTANDING: "MISSING_BUDGET_UNDERSTANDING",
  MISSING_DECISION_REASON: "MISSING_DECISION_REASON",
  ABSTRACT_CONSEQUENCE_WITHOUT_DECISION:
    "ABSTRACT_CONSEQUENCE_WITHOUT_DECISION",
  INVENTED_SPEC: "INVENTED_SPEC",
  HARD_CODED_PRODUCT_LOGIC: "HARD_CODED_PRODUCT_LOGIC",
  TOO_LONG_REVIEW: "TOO_LONG_REVIEW",
  AI_CLICHE: "AI_CLICHE",
  WINNER_CHANGED: "WINNER_CHANGED",
  CARD_REPLY_MISMATCH: "CARD_REPLY_MISMATCH",
  REGRESSION_8X: "REGRESSION_8X",
});

const AXIS_LABELS = Object.freeze({
  performance: "desempenho no uso diário",
  camera: "câmera e fotos",
  battery: "autonomia",
  screen: "tela",
  longevity: "longevidade e suporte",
  value: "custo-benefício",
  storage: "armazenamento",
});

const CATEGORY_TERMS = Object.freeze({
  celular: "celular",
  smartphone: "celular",
  notebook: "notebook",
  laptop: "notebook",
  tv: "TV",
  monitor: "monitor",
  fone: "fone",
  cadeira: "cadeira",
  console: "console",
  camera: "câmera",
  camara: "câmera",
  mouse: "mouse",
  teclado: "teclado",
});

const AI_CLICHE_PATTERNS = Object.freeze([
  /como assistente/i,
  /espero ter ajudado/i,
  /fico feliz em ajudar/i,
  /excelente escolha/i,
  /ótima pergunta/i,
  /otima pergunta/i,
]);

const ABSTRACT_CONSEQUENCE_PATTERNS = Object.freeze([
  /tarefas exigentes sem sentir/i,
  /sem sentir que o aparelho está no limite cedo demais/i,
  /menos sensação de limite quando o aparelho é exigido/i,
]);

const GENERIC_JUSTIFICATION_PATTERNS = Object.freeze([
  /\bpra essa busca,\s*o\b.*\bencaixa melhor\b/i,
  /\baparece como a opção mais alinhada\b/i,
  /\bparece uma opção interessante para quem está comparando ofertas\b/i,
  /\bparece a opção mais coerente dentro do contexto\b/i,
]);

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanProductName(value = "") {
  return cleanText(value);
}

function formatBudgetValue(budget) {
  const value = Number(budget);
  if (!Number.isFinite(value) || value <= 0) return "";
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
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

function resolveCategoryTerm(category = "", query = "") {
  const normalized = cleanText(category).toLowerCase();
  if (CATEGORY_TERMS[normalized]) return CATEGORY_TERMS[normalized];

  const queryNorm = cleanText(query).toLowerCase();
  for (const [token, label] of Object.entries(CATEGORY_TERMS)) {
    if (queryNorm.includes(token)) return label;
  }

  return normalized || "produto";
}

function resolveAxisLabel(axis = "") {
  return AXIS_LABELS[cleanText(axis).toLowerCase()] || "equilíbrio geral";
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

function firstNonEmpty(values = []) {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return "";
}

function buildBudgetFrame({ budget = null, query = "", querySignals = {}, categoryTerm = "produto" } = {}) {
  const formatted = formatBudgetValue(budget);
  const seed = `${query}-${budget || "none"}`;

  if (formatted) {
    const frames = [
      `Com até R$ ${formatted}, a escolha precisa ser bem feita — nessa faixa aparece muito ${categoryTerm} que parece forte no anúncio e envelhece rápido.`,
      `Com esse orçamento de até R$ ${formatted}, o que pesa é equilibrar preço com segurança no uso.`,
      `Dentro desse limite de R$ ${formatted}, a diferença entre acertar e errar a compra aparece rápido.`,
      `Com R$ ${formatted} para gastar, dá para pegar algo bom — mas a escolha precisa ser criteriosa nessa faixa.`,
    ];
    return pickVariant(frames, seed);
  }

  if (querySignals?.priceSensitive || /\b(barato|barata|economizar|gastar pouco|custo[- ]benef[ií]cio)\b/i.test(query)) {
    const frames = [
      "Para gastar pouco sem errar, a escolha precisa ir além do preço mais baixo.",
      "Quando o foco é economizar, o risco aqui é pagar barato e sentir limitação cedo demais.",
      "Nessa busca por custo-benefício, o barato só vale se ainda fizer sentido no uso real.",
    ];
    return pickVariant(frames, seed);
  }

  return "";
}

function buildDecisionReason({
  productName = "",
  primaryAxis = "",
  structuredFacts = null,
  searchCognition = null,
  decisionMemory = null,
} = {}) {
  const axisLabel = resolveAxisLabel(primaryAxis);
  const strength =
    firstNonEmpty(structuredFacts?.strengthConsequences) ||
    firstNonEmpty([decisionMemory?.lastWinnerAdvantages?.[0]]) ||
    stripTrailingPeriod(searchCognition?.consequenceChain?.impact || "") ||
    stripTrailingPeriod(searchCognition?.narrativeBlocks?.mainConsequence || "");

  const linkedConsequence = stripTrailingPeriod(
    searchCognition?.consequenceChain?.consequence || ""
  );

  if (strength && linkedConsequence && !strength.toLowerCase().includes(linkedConsequence.toLowerCase().slice(0, 12))) {
    return {
      reason: `${strength.toLowerCase()} — ${lowercaseLead(linkedConsequence)}`,
      axisLabel,
    };
  }

  if (strength) {
    return { reason: lowercaseLead(strength), axisLabel };
  }

  if (linkedConsequence) {
    return { reason: lowercaseLead(linkedConsequence), axisLabel };
  }

  const memoryReason = stripTrailingPeriod(decisionMemory?.lastDecisionReason || "");
  if (memoryReason) {
    return { reason: lowercaseLead(memoryReason), axisLabel };
  }

  return {
    reason: `entregar mais segurança no ${axisLabel} dentro do que essa busca pede`,
    axisLabel,
  };
}

function buildDecisionParagraph({
  productName = "",
  primaryAxis = "",
  reason = "",
  axisLabel = "",
  query = "",
} = {}) {
  const seed = `${query}-${productName}-${primaryAxis}`;
  const name = cleanProductName(productName) || "este produto";
  const reasonBody = stripTrailingPeriod(reason);

  const variants = primaryAxis
    ? [
        `Eu iria no ${name} porque ele vence no ponto que mais pesa para essa busca — ${axisLabel}: ${reasonBody}.`,
        `Minha escolha aqui é o ${name}: ele entrega a decisão mais segura nessa busca porque ${reasonBody}.`,
        `O ${name} ficou no topo porque, para o que você pediu, ${reasonBody}.`,
      ]
    : [
        `Eu iria no ${name} porque ele entrega a decisão mais segura para essa busca: ${reasonBody}.`,
        `Minha escolha aqui é o ${name} — ${reasonBody}.`,
        `O ${name} venceu aqui porque ${reasonBody}.`,
      ];

  return capitalizeLead(pickVariant(variants, seed));
}

function buildStakesParagraph({
  structuredFacts = null,
  searchCognition = null,
  primaryAxis = "",
  query = "",
} = {}) {
  const idealFor = firstNonEmpty(structuredFacts?.idealForConsequences);
  const note = firstNonEmpty(structuredFacts?.noteConsequences);
  const impact = stripTrailingPeriod(searchCognition?.consequenceChain?.impact || "");
  const seed = `${query}-${primaryAxis}-stakes`;

  if (idealFor) {
    const frames = [
      `O ponto principal aqui não é só preço — é comprar algo que ainda faça sentido para quem ${lowercaseLead(idealFor)}.`,
      `Isso importa porque funciona melhor para quem ${lowercaseLead(idealFor)}.`,
      `Na prática, a vantagem é servir quem ${lowercaseLead(idealFor)} sem parecer limitado cedo demais.`,
    ];
    return capitalizeLead(pickVariant(frames, seed));
  }

  if (note) {
    return capitalizeLead(
      `O que faz diferença aqui é que ${lowercaseLead(note)} — e isso pesa direto na decisão.`
    );
  }

  if (impact) {
    const frames = [
      `Isso importa porque ${lowercaseLead(impact)} — e foi isso que pesou na escolha.`,
      `O que pesa na decisão é ${lowercaseLead(impact)}, não só o preço do anúncio.`,
      `Na prática, ${lowercaseLead(impact)} — por isso ele saiu na frente.`,
    ];
    return capitalizeLead(pickVariant(frames, seed));
  }

  const axisLabel = resolveAxisLabel(primaryAxis);
  if (primaryAxis) {
    return capitalizeLead(
      `O que pesa aqui não é só preço — é ter mais segurança em ${axisLabel} sem abrir mão do que a busca pede.`
    );
  }

  return capitalizeLead(
    "O que pesa aqui não é só preço — é comprar algo que ainda faça sentido por mais tempo."
  );
}

function buildTradeoffParagraph({
  structuredFacts = null,
  searchCognition = null,
  decisionMemory = null,
  query = "",
} = {}) {
  const weakness =
    firstNonEmpty(structuredFacts?.weaknessConsequences) ||
    firstNonEmpty(structuredFacts?.avoidIfConsequences) ||
    stripTrailingPeriod(searchCognition?.tradeoffHonest || "") ||
    stripTrailingPeriod(searchCognition?.narrativeBlocks?.tradeoffHonest || "") ||
    stripTrailingPeriod(decisionMemory?.lastTradeoff || "") ||
    firstNonEmpty(decisionMemory?.lastWinnerSacrifices?.map((entry) => `menos destaque em ${entry}`));

  if (!weakness) return "";

  const seed = `${query}-tradeoff`;
  const frames = [
    `A escolha que você faz ao pegar ele é ganhar mais segurança no uso, mas ${lowercaseLead(weakness)}.`,
    `O tradeoff aqui é claro: você ganha na decisão principal, mas ${lowercaseLead(weakness)}.`,
    `Vale saber antes de fechar: ${lowercaseLead(weakness)}.`,
  ];

  return capitalizeLead(pickVariant(frames, seed));
}

function finalizeExplanation(paragraphs = [], meta = {}) {
  const cleanParagraphs = paragraphs
    .map((paragraph) => capitalizeLead(cleanText(paragraph)))
    .filter(Boolean)
    .slice(0, 4);

  const text = cleanParagraphs.join("\n\n");
  const violations = findInventedSpecViolations(text, meta.allowedEvidence || "");

  if (!text || violations.length > 0 || containsArchitectureLeak(text)) {
    return {
      ok: false,
      text: "",
      paragraphs: [],
      error: violations.length
        ? "invented_spec_detected"
        : containsArchitectureLeak(text)
          ? "architecture_leak_detected"
          : "empty_explanation",
      violations,
    };
  }

  return {
    ok: true,
    text,
    paragraphs: cleanParagraphs,
    error: null,
    violations: [],
  };
}

/**
 * @param {{
 *   responsePath?: string,
 *   commercialOfferReset?: { shouldReset?: boolean },
 *   sessionContext?: Record<string, unknown>,
 *   routingDecision?: { allowNewSearch?: boolean },
 * }} input
 */
export function shouldApplySpecialistDecisionExplanation(input = {}) {
  if (input.responsePath && input.responsePath !== "return_seguro") {
    return false;
  }

  if (input.routingDecision?.allowNewSearch) return true;
  if (input.commercialOfferReset?.shouldReset) return true;

  const priorWinner = cleanProductName(
    input.sessionContext?.lastBestProduct?.product_name || ""
  );
  if (!priorWinner) return true;

  const priorQuery = cleanText(input.sessionContext?.lastQuery || "").toLowerCase();
  const currentQuery = cleanText(input.query || input.resolvedQuery || "").toLowerCase();
  if (priorQuery && currentQuery && priorQuery !== currentQuery) return true;

  return false;
}

/**
 * @param {{
 *   query?: string,
 *   budget?: number|null,
 *   category?: string,
 *   product?: Record<string, unknown>,
 *   searchCognition?: Record<string, unknown>,
 *   decisionMemory?: Record<string, unknown>,
 *   querySignals?: Record<string, unknown>,
 * }} input
 */
export function buildSpecialistDecisionExplanation(input = {}) {
  const query = cleanText(input.query || "");
  const product = input.product && typeof input.product === "object" ? input.product : {};
  const searchCognition = input.searchCognition || {};
  const decisionMemory = input.decisionMemory || {};
  const querySignals = input.querySignals || {};

  const productName =
    cleanProductName(product.trustedSpecs?.official_name) ||
    cleanProductName(product.product_name) ||
    "este produto";

  const budget = resolveBudgetFromQuery(query, input.budget);

  const categoryTerm = resolveCategoryTerm(input.category || product.category || "", query);
  const primaryAxis = cleanText(searchCognition.primaryAxis || input.activePriority || "");

  const structuredFacts = buildStructuredExplanationFacts({
    product,
    query,
    trustedSpecs: product.trustedSpecs || null,
    hasDataLayer:
      !!product.isDataLayerProduct ||
      hasUsableDataLayerContent(product.trustedSpecs || null),
  });

  const budgetFrame = buildBudgetFrame({
    budget,
    query,
    querySignals,
    categoryTerm,
  });

  const { reason } = buildDecisionReason({
    productName,
    primaryAxis,
    structuredFacts,
    searchCognition,
    decisionMemory,
  });

  const paragraphs = [];

  if (budgetFrame) paragraphs.push(budgetFrame);

  paragraphs.push(
    buildDecisionParagraph({
      productName,
      primaryAxis,
      reason,
      axisLabel: resolveAxisLabel(primaryAxis),
      query,
    })
  );

  paragraphs.push(
    buildStakesParagraph({
      structuredFacts,
      searchCognition,
      primaryAxis,
      query,
    })
  );

  const tradeoff = buildTradeoffParagraph({
    structuredFacts,
    searchCognition,
    decisionMemory,
    query,
  });
  if (tradeoff) paragraphs.push(tradeoff);

  return finalizeExplanation(paragraphs, {
    allowedEvidence: structuredFacts.allowedEvidence || productName,
    productName,
    budgetDetected: budget,
    category: categoryTerm,
    primaryAxis,
    hasDataLayer: structuredFacts.mode === "data_layer",
  });
}

export function auditSpecialistDecisionExplanation(text = "", context = {}) {
  const body = cleanText(text);
  const flags = [];
  const budgetInQuery =
    context.budgetDetected ??
    resolveBudgetFromQuery(context.query || "");

  if (!body) {
    flags.push(SPECIALIST_DECISION_FLAGS.MISSING_DECISION_REASON);
    return flags;
  }

  if (GENERIC_JUSTIFICATION_PATTERNS.some((pattern) => pattern.test(body))) {
    flags.push(SPECIALIST_DECISION_FLAGS.GENERIC_DECISION_EXPLANATION);
  }

  if (
    budgetInQuery &&
    !/\b(orçamento|orcamento|faixa|limite|at[eé]\s*r\$|r\$\s*\d|com\s+r\$)\b/i.test(body)
  ) {
    flags.push(SPECIALIST_DECISION_FLAGS.MISSING_BUDGET_UNDERSTANDING);
  }

  const hasDecisionReason =
    /\b(porque|por que|vence|escolha|decis[aã]o|peso|pesou|ficou no topo|minha escolha|eu iria)\b/i.test(
      body
    );
  if (!hasDecisionReason) {
    flags.push(SPECIALIST_DECISION_FLAGS.MISSING_DECISION_REASON);
  }

  if (
    ABSTRACT_CONSEQUENCE_PATTERNS.some((pattern) => pattern.test(body)) &&
    !/\b(porque|por que|peso|pesou|decis[aã]o|escolha|importa)\b/i.test(body)
  ) {
    flags.push(SPECIALIST_DECISION_FLAGS.ABSTRACT_CONSEQUENCE_WITHOUT_DECISION);
  }

  if (findInventedSpecViolations(body, context.allowedEvidence || "").length > 0) {
    flags.push(SPECIALIST_DECISION_FLAGS.INVENTED_SPEC);
  }

  if (AI_CLICHE_PATTERNS.some((pattern) => pattern.test(body))) {
    flags.push(SPECIALIST_DECISION_FLAGS.AI_CLICHE);
  }

  if (body.length > 1400) {
    flags.push(SPECIALIST_DECISION_FLAGS.TOO_LONG_REVIEW);
  }

  return flags;
}

export function buildSpecialistDecisionExplanationAuditRecord(input = {}) {
  const resolvedBudget = resolveBudgetFromQuery(input.query || "", input.budget);
  const result = buildSpecialistDecisionExplanation(input);
  const flags = auditSpecialistDecisionExplanation(result.text, {
    query: input.query,
    budgetDetected: resolvedBudget,
    allowedEvidence:
      input.product?.trustedSpecs?.official_name ||
      input.product?.product_name ||
      "",
  });

  return {
    query: input.query || "",
    category: input.category || "",
    budgetDetected: resolvedBudget,
    winner:
      input.product?.trustedSpecs?.official_name ||
      input.product?.product_name ||
      "",
    responsePath: input.responsePath || "return_seguro",
    specialistExplanationDetected: result.ok,
    budgetUnderstandingDetected: !flags.includes(
      SPECIALIST_DECISION_FLAGS.MISSING_BUDGET_UNDERSTANDING
    ),
    decisionReasonDetected: !flags.includes(
      SPECIALIST_DECISION_FLAGS.MISSING_DECISION_REASON
    ),
    genericJustificationDetected: flags.includes(
      SPECIALIST_DECISION_FLAGS.GENERIC_DECISION_EXPLANATION
    ),
    inventedSpecDetected: flags.includes(SPECIALIST_DECISION_FLAGS.INVENTED_SPEC),
    hardcodedProductDetected: flags.includes(
      SPECIALIST_DECISION_FLAGS.HARD_CODED_PRODUCT_LOGIC
    ),
    tooLongDetected: flags.includes(SPECIALIST_DECISION_FLAGS.TOO_LONG_REVIEW),
    tooVagueDetected: flags.includes(
      SPECIALIST_DECISION_FLAGS.ABSTRACT_CONSEQUENCE_WITHOUT_DECISION
    ),
    aiClicheDetected: flags.includes(SPECIALIST_DECISION_FLAGS.AI_CLICHE),
    winnerChanged: false,
    cardMismatch: false,
    flags,
    text: result.text,
    ok: result.ok && flags.length === 0,
  };
}
