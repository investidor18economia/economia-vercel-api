/**
 * PATCH 10.1D — Generic Query Clarification Closing
 *
 * Pergunta final contextual em buscas genéricas com lacuna de uso/prioridade.
 * Não altera winner, ranking ou decisão.
 */

import { extractBudget } from "./miaRoutingSafety.js";
import { isGenericProductSearchQuery } from "./miaSpecificProductResolutionLock.js";
import { resolveIntentDiscoveryProfile } from "./miaUserIntentDiscoveryLayer.js";

export const GENERIC_QUERY_CLARIFICATION_CLOSING_VERSION = "10.1D.1";

const FIRST_ANSWER_RESPONSE_PATHS = new Set([
  "return_seguro",
  "commercial_only_fallback",
  "legacy_llm_search",
]);

const FOLLOW_UP_QUERY_PATTERNS = Object.freeze([
  /^(e|mas|então|entao|e a|e o|e pra|e para|e se|sobre|quanto a|qual a|vale a pena)\b/i,
  /^(segundo|terceiro|outro|outra|alternativa|plano b)\b/i,
  /\b(runner up|runner-up|segunda opção|segunda opcao)\b/i,
]);

const COMPARISON_QUERY_PATTERNS = Object.freeze([
  /\b(compare|comparar|comparação|comparacao|versus| vs | x )\b/i,
  /\b(diferença|diferenca|qual melhor entre)\b/i,
]);

const ENVIRONMENT_GAP_PATTERNS = Object.freeze({
  display: /\b(sala|quarto|escritório|escritorio|ambiente claro|luz|iluminação|iluminacao)\b/i,
  seating: /\b(horas|dia|diário|diario|home office|escritório|escritorio)\b/i,
});

const CATEGORY_USAGE_VERBS = Object.freeze({
  mobile: "usa",
  portable_computer: "precisa",
  display: "vai usar",
  seating: "pretende usar",
  peripheral: "usa",
  audio: "usa",
  camera_device: "usa",
  desktop_gaming: "joga",
  generic: "usa",
});

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
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

function joinHumanList(items = []) {
  const list = items.filter(Boolean);
  if (!list.length) return "";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} ou ${list[1]}`;
  return `${list.slice(0, -1).join(", ")} ou ${list.at(-1)}`;
}

function selectDiscoveryOptions(profile, primaryAxis = "", query = "", max = 4) {
  const options = Array.isArray(profile?.options) ? profile.options : [];
  const filtered = options.filter((option) => option.axis !== primaryAxis);
  const pool = filtered.length >= 2 ? filtered : options;
  const seed = `${query}-${profile?.id || "generic"}-${primaryAxis}`;

  return [...pool]
    .sort((a, b) => seedFromText(`${seed}-${a.axis}`) - seedFromText(`${seed}-${b.axis}`))
    .slice(0, Math.min(max, pool.length));
}

function resolveDetectedBudget(query = "", budget = null) {
  if (budget != null && !Number.isNaN(Number(budget))) return Number(budget);
  return extractBudget(query);
}

function isFollowUpClarificationContext(input = {}) {
  const query = cleanText(input.query || "");
  const sessionContext = input.sessionContext || {};

  if (input.isFollowUp === true) return true;

  if (
    input.routingDecision?.allowNewSearch === false &&
    sessionContext?.lastBestProduct?.product_name
  ) {
    return true;
  }

  if (FOLLOW_UP_QUERY_PATTERNS.some((pattern) => pattern.test(query))) {
    return true;
  }

  if (sessionContext?.intentDiscoveryPending && sessionContext?.lastIntentDiscoveryProbe) {
    return true;
  }

  return false;
}

function isComparisonClarificationContext(input = {}) {
  const query = cleanText(input.query || "");
  const intent = cleanText(input.intent || input.sessionContext?.lastIntent || "").toLowerCase();
  if (intent === "comparison") return true;
  return COMPARISON_QUERY_PATTERNS.some((pattern) => pattern.test(query));
}

function hasKnownPrimaryUseContext(input = {}) {
  const query = cleanText(input.query || "").toLowerCase();

  if (
    /\b(camera|câmera|camara|foto|fotos|fotograf|video|vídeo|bateria|autonomia|jogo|jogos|jogar|gamer|gaming|trabalho|trabalhar|trampo|estudo|estudar|edição|edicao|programa|programação|programacao|design|render|multitarefa|dia a dia|casual|filmes|streaming|esportes|mobilidade|edição de imagem|edicao de imagem)\b/i.test(
      query
    )
  ) {
    return true;
  }

  const signals = input.querySignals || {};
  return !!(signals.gaming || signals.heavyUse || signals.casual || signals.batteryPriority || signals.awayFromHome);
}

function hasClarificationInformationGap(input = {}) {
  const query = cleanText(input.query || "");
  if (!isGenericProductSearchQuery(query)) return false;
  if (hasKnownPrimaryUseContext(input)) return false;

  const profile = resolveIntentDiscoveryProfile(input.category || "", query);
  if (profile.id === "generic") {
    if (cleanText(input.category || "")) return true;
    return /\b(celular|smartphone|notebook|laptop|tv|monitor|fone|cadeira|pc gamer|mouse|teclado|camera|câmera|samsung|iphone)\b/i.test(
      query
    );
  }

  return true;
}

function resolveMissingContextAxis(input = {}) {
  const query = cleanText(input.query || "");
  const profile = resolveIntentDiscoveryProfile(input.category || "", query);

  if (!hasKnownPrimaryUseContext(input)) {
    return {
      axis: "primary_use",
      reason: "uso principal ainda não foi informado",
      confidence: resolveDetectedBudget(query, input.budget) != null ? "high" : "medium",
    };
  }

  const primaryAxis = cleanText(input.primaryAxis || input.activePriority || "");

  if (!primaryAxis || primaryAxis === "performance") {
    const hasPrioritySignal =
      input.querySignals?.batteryPriority ||
      input.querySignals?.priceSensitive ||
      input.querySignals?.gaming ||
      input.querySignals?.longTerm;
    if (!hasPrioritySignal) {
      return {
        axis: "dominant_priority",
        reason: "prioridade dominante ainda não ficou clara",
        confidence: "medium",
      };
    }
  }

  if (profile.id === "display" && !ENVIRONMENT_GAP_PATTERNS.display.test(query)) {
    return {
      axis: "environment",
      reason: "ambiente de uso ainda não foi descrito",
      confidence: "medium",
    };
  }

  if (profile.id === "seating" && !ENVIRONMENT_GAP_PATTERNS.seating.test(query)) {
    return {
      axis: "environment",
      reason: "tempo de uso diário ainda não foi informado",
      confidence: "medium",
    };
  }

  if (resolveDetectedBudget(query, input.budget) == null && /\b(bom|boa|barat|melhor)\b/i.test(query)) {
    return {
      axis: "constraint",
      reason: "restrição de orçamento ainda não foi informada",
      confidence: "low",
    };
  }

  if (input.querySignals?.regretFear !== true && /\b(vale a pena|medo|arrepend|dúvida|duvida)\b/i.test(query)) {
    return null;
  }

  return null;
}

export function buildGenericQueryClarificationQuestion(input = {}) {
  const query = cleanText(input.query || "");
  const profile = resolveIntentDiscoveryProfile(input.category || "", query);
  const primaryAxis = cleanText(input.primaryAxis || input.activePriority || "");
  const missingAxis = input.missingContextAxis || "primary_use";
  const selected = selectDiscoveryOptions(profile, primaryAxis, query, 4);

  if (selected.length < 2) return "";

  const labels = selected.map((entry) => entry.label);
  const labelText = joinHumanList(labels);
  const usageVerb = CATEGORY_USAGE_VERBS[profile.id] || CATEGORY_USAGE_VERBS.generic;
  const budget = resolveDetectedBudget(query, input.budget);
  const seed = `${query}|${profile.id}|${missingAxis}|${primaryAxis}`;

  const templates =
    budget != null && missingAxis === "primary_use"
      ? [
          `Com esse orçamento, a escolha muda bastante dependendo se você prioriza ${labelText}. Qual desses pesa mais pra você?`,
          `Nessa faixa de preço, muda bastante se o foco é ${labelText}. Qual pesa mais pra você?`,
        ]
      : missingAxis === "environment" && profile.id === "display"
        ? [
            `Se você me disser se vai usar mais para ${labelText}, eu ajusto melhor a escolha?`,
          ]
        : missingAxis === "environment" && profile.id === "seating"
          ? [
              `Se você me disser quantas horas por dia pretende usar e se prioriza ${labelText}, eu ajusto melhor a escolha?`,
            ]
          : [
              `Se você me disser se ${usageVerb} mais para ${labelText}, eu ajusto melhor a escolha?`,
              `Se você me disser se o foco é ${labelText}, eu consigo ajustar melhor a recomendação?`,
              `Pra fechar com mais precisão, me diz se ${usageVerb} mais pensando em ${labelText}?`,
            ];

  return pickVariant(templates, seed);
}

export function shouldApplyGenericQueryClarificationClosing(input = {}) {
  const responsePath = String(input.responsePath || "");
  const query = cleanText(input.query || "");

  if (!FIRST_ANSWER_RESPONSE_PATHS.has(responsePath)) {
    return { apply: false, skippedReason: "non_first_answer_path" };
  }

  if (input.specificProductLockActive) {
    return { apply: false, skippedReason: "specific_product_lock" };
  }

  if (!isGenericProductSearchQuery(query)) {
    return { apply: false, skippedReason: "not_generic_query" };
  }

  if (isComparisonClarificationContext(input)) {
    return { apply: false, skippedReason: "comparison_intent" };
  }

  if (isFollowUpClarificationContext(input)) {
    return { apply: false, skippedReason: "follow_up_context" };
  }

  if (
    hasKnownPrimaryUseContext({
      query,
      querySignals: input.querySignals || {},
    })
  ) {
    return { apply: false, skippedReason: "use_already_known" };
  }

  if (!hasClarificationInformationGap(input)) {
    return { apply: false, skippedReason: "no_information_gap" };
  }

  const missing = resolveMissingContextAxis(input);
  if (!missing) {
    return { apply: false, skippedReason: "no_missing_context_axis" };
  }

  return { apply: true, skippedReason: null, missingContext: missing };
}

export function resolveGenericQueryClarificationClosing(input = {}) {
  const query = cleanText(input.query || "");
  const category = cleanText(input.category || "");
  const winner = cleanText(
    input.winnerProduct?.product_name ||
      input.winnerProduct?.trustedSpecs?.official_name ||
      input.winner ||
      ""
  );
  const gate = shouldApplyGenericQueryClarificationClosing(input);

  const baseAudit = {
    applied: false,
    query,
    category: category || resolveIntentDiscoveryProfile(category, query).id,
    winner: winner || null,
    specificProductLockActive: !!input.specificProductLockActive,
    detectedBudget: resolveDetectedBudget(query, input.budget),
    primaryAxis: cleanText(input.primaryAxis || input.activePriority || "") || null,
    missingContextAxis: null,
    question: null,
    skippedReason: gate.skippedReason || null,
    confidence: null,
  };

  if (!gate.apply) {
    return { applied: false, question: "", payload: null, audit: baseAudit };
  }

  const missingContextAxis = gate.missingContext?.axis || "primary_use";
  const question = buildGenericQueryClarificationQuestion({
    ...input,
    missingContextAxis,
  });

  if (!question) {
    return {
      applied: false,
      question: "",
      payload: null,
      audit: { ...baseAudit, skippedReason: "empty_question" },
    };
  }

  if (input.reply && input.reply.includes(question)) {
    return {
      applied: false,
      question: "",
      payload: null,
      audit: { ...baseAudit, skippedReason: "probe_already_in_reply" },
    };
  }

  const profile = resolveIntentDiscoveryProfile(category, query);
  const payload = {
    applied: true,
    question,
    category: profile.id,
    missingContextAxis,
    reason: gate.missingContext?.reason || "lacuna contextual relevante",
    confidence: gate.missingContext?.confidence || "medium",
    source: "generic_query_context_gap",
  };

  return {
    applied: true,
    question,
    payload,
    audit: {
      ...baseAudit,
      applied: true,
      category: profile.id,
      missingContextAxis,
      question,
      skippedReason: null,
      confidence: payload.confidence,
    },
  };
}

export function logGenericQueryClarificationClosingAudit(audit = {}) {
  console.log(
    "GENERIC_QUERY_CLARIFICATION_CLOSING_AUDIT",
    JSON.stringify({
      version: GENERIC_QUERY_CLARIFICATION_CLOSING_VERSION,
      applied: !!audit.applied,
      query: audit.query || null,
      category: audit.category || null,
      winner: audit.winner || null,
      specificProductLockActive: !!audit.specificProductLockActive,
      detectedBudget: audit.detectedBudget ?? null,
      primaryAxis: audit.primaryAxis || null,
      missingContextAxis: audit.missingContextAxis || null,
      question: audit.question || null,
      skippedReason: audit.skippedReason || null,
      confidence: audit.confidence || null,
    })
  );
}
