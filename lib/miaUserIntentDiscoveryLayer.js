/**
 * PATCH 9.1B — User Intent Discovery Layer
 *
 * Após busca genérica, recomenda + explica + descobre intenção real.
 * Não altera winner, ranking, routing ou decision engine.
 */

import { extractBudget } from "./miaRoutingSafety.js";
import { cleanupMiaHumanLanguage } from "./miaAntiAiLanguageCleanupLayer.js";

export const USER_INTENT_DISCOVERY_LAYER_VERSION = "9.1B.1";

export const INTENT_DISCOVERY_FLAGS = Object.freeze({
  GENERIC_FIXED_QUESTION: "GENERIC_FIXED_QUESTION",
  INTERROGATION_TONE: "INTERROGATION_TONE",
  DISCOVERY_WHEN_PRIORITY_KNOWN: "DISCOVERY_WHEN_PRIORITY_KNOWN",
  DISCOVERY_IN_RECOVERY: "DISCOVERY_IN_RECOVERY",
  DISCOVERY_IN_COMPARISON: "DISCOVERY_IN_COMPARISON",
  MISSING_DISCOVERY_ON_GAP: "MISSING_DISCOVERY_ON_GAP",
  FORM_LIKE_QUESTION: "FORM_LIKE_QUESTION",
});

const BANNED_PROBE_PATTERNS = Object.freeze([
  /^qual seu uso\??$/i,
  /^qual o seu uso\??$/i,
  /^qual será o uso\??$/i,
  /^me informe seu uso/i,
  /^preencha/i,
  /^selecione/i,
]);

const INTERROGATION_PATTERNS = Object.freeze([
  /^qual seu uso/i,
  /^qual o uso/i,
  /^informe/i,
  /^preciso saber/i,
]);

const CATEGORY_DISCOVERY_PROFILES = Object.freeze([
  {
    id: "mobile",
    pattern: /\b(celular|smartphone|iphone|android)\b/i,
    options: [
      { axis: "camera", label: "câmera e fotos" },
      { axis: "battery", label: "bateria" },
      { axis: "performance", label: "desempenho e jogos" },
      { axis: "longevity", label: "durabilidade" },
    ],
  },
  {
    id: "portable_computer",
    pattern: /\b(notebook|laptop)\b/i,
    options: [
      { axis: "study", label: "estudo" },
      { axis: "work", label: "trabalho" },
      { axis: "performance", label: "programas mais pesados" },
      { axis: "value", label: "custo-benefício" },
    ],
  },
  {
    id: "desktop_gaming",
    pattern: /\b(pc gamer|computador gamer)\b/i,
    options: [
      { axis: "gaming", label: "jogos específicos" },
      { axis: "performance", label: "desempenho geral" },
      { axis: "value", label: "melhor retorno pelo preço" },
    ],
  },
  {
    id: "display",
    pattern: /\b(tv|televis[aã]o|smart tv|monitor)\b/i,
    options: [
      { axis: "media", label: "filmes e streaming" },
      { axis: "gaming", label: "jogos" },
      { axis: "work", label: "trabalho ou estudo" },
      { axis: "screen", label: "qualidade de imagem" },
    ],
  },
  {
    id: "audio",
    pattern: /\b(fone|headphone|headset|earbud)\b/i,
    options: [
      { axis: "comfort", label: "conforto no dia a dia" },
      { axis: "battery", label: "autonomia" },
      { axis: "value", label: "custo-benefício" },
    ],
  },
  {
    id: "seating",
    pattern: /\b(cadeira)\b/i,
    options: [
      { axis: "comfort", label: "conforto prolongado" },
      { axis: "ergonomics", label: "ergonomia" },
      { axis: "value", label: "custo-benefício" },
    ],
  },
  {
    id: "peripheral",
    pattern: /\b(mouse|teclado|keyboard)\b/i,
    options: [
      { axis: "gaming", label: "jogos" },
      { axis: "work", label: "trabalho" },
      { axis: "value", label: "custo-benefício" },
    ],
  },
  {
    id: "camera_device",
    pattern: /\b(c[aâ]mera|camera)\b/i,
    options: [
      { axis: "camera", label: "qualidade de foto e vídeo" },
      { axis: "portability", label: "portabilidade" },
      { axis: "value", label: "custo-benefício" },
    ],
  },
  {
    id: "generic",
    pattern: /.*/,
    options: [
      { axis: "performance", label: "desempenho" },
      { axis: "value", label: "custo-benefício" },
      { axis: "longevity", label: "durabilidade" },
    ],
  },
]);

const RECOVERY_INTERACTION_TYPES = new Set([
  "contradiction_recovery",
  "user_confusion_recovery",
  "escalated_confusion_recovery",
  "post_change_recovery",
  "final_decision_scope",
]);

const HOLD_ROUTING_INTENTS = new Set([
  "comparison",
  "explicit_recommendation_change",
  "context_hold",
  "contradiction_recovery_hold",
  "user_confusion_recovery_hold",
  "post_change_recovery_hold",
  "final_decision_scope_hold",
  "legitimate_search_reset_hold",
]);

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
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} ou ${list[1]}`;
  return `${list.slice(0, -1).join(", ")} ou ${list.at(-1)}`;
}

export function resolveIntentDiscoveryProfile(category = "", query = "") {
  const haystack = cleanText(`${category} ${query}`).toLowerCase();
  for (const profile of CATEGORY_DISCOVERY_PROFILES) {
    if (profile.id === "generic") continue;
    if (profile.pattern.test(haystack)) return profile;
  }
  return CATEGORY_DISCOVERY_PROFILES.find((profile) => profile.id === "generic");
}

export function hasKnownUseIntent({
  query = "",
  querySignals = {},
  activePriority = "",
} = {}) {
  if (cleanText(activePriority)) return true;

  const q = cleanText(query).toLowerCase();
  if (
    /\b(camera|câmera|camara|foto|fotos|fotograf|video|vídeo|bateria|autonomia|jogo|jogos|jogar|gamer|gaming|trabalho|trabalhar|trampo|estudo|estudar|edição|edicao|programa|programação|programacao|design|render|multitarefa|dia a dia|casual|durar|longevidade|conforto|ergonomia|filmes|streaming|esportes)\b/i.test(
      q
    )
  ) {
    return true;
  }

  const signals = querySignals || {};
  return !!(
    signals.gaming ||
    signals.heavyUse ||
    signals.casual ||
    signals.batteryPriority ||
    signals.longTerm ||
    signals.awayFromHome
  );
}

export function hasIntentInformationGap(input = {}) {
  const query = cleanText(input.query || "");
  if (!query) return false;

  const profile = resolveIntentDiscoveryProfile(input.category || "", query);
  if (!profile || profile.id === "generic") {
    const hasCategoryToken =
      /\b(celular|smartphone|notebook|laptop|tv|monitor|fone|cadeira|pc gamer|mouse|teclado|camera|câmera)\b/i.test(
        query
      );
    if (!hasCategoryToken) return false;
  }

  if (hasKnownUseIntent(input)) return false;

  const hasBudget =
    input.budget != null ||
    extractBudget(query) != null ||
    /\b\d+\s*k\b/i.test(query);
  const hasGenericSearchShape =
    hasBudget ||
    /\b(bom|barato|quero|preciso|indica|recomenda|busco|procuro)\b/i.test(query);

  return hasGenericSearchShape;
}

export function shouldSuppressIntentDiscovery(input = {}) {
  const routingDecision = input.routingDecision || {};
  const sessionContext = input.sessionContext || {};
  const intent = cleanText(input.intent || sessionContext.lastIntent || "").toLowerCase();

  if (input.responsePath && input.responsePath !== "return_seguro") {
    return { suppress: true, reason: "non_initial_search_path" };
  }

  if (intent === "comparison" || HOLD_ROUTING_INTENTS.has(routingDecision.intent)) {
    return { suppress: true, reason: "comparison_or_hold" };
  }

  if (RECOVERY_INTERACTION_TYPES.has(sessionContext.lastInteractionType)) {
    return { suppress: true, reason: "recovery_context" };
  }

  if (routingDecision.allowNewSearch === false && sessionContext.lastBestProduct?.product_name) {
    return { suppress: true, reason: "anchored_follow_up" };
  }

  if (hasKnownUseIntent(input)) {
    return { suppress: true, reason: "priority_or_use_already_known" };
  }

  if (!hasIntentInformationGap(input)) {
    return { suppress: true, reason: "no_information_gap" };
  }

  return { suppress: false, reason: null };
}

function selectDiscoveryOptions(profile, primaryAxis = "", query = "", max = 3) {
  const options = Array.isArray(profile?.options) ? profile.options : [];
  const filtered = options.filter((option) => option.axis !== primaryAxis);
  const pool = filtered.length >= 2 ? filtered : options;
  const seed = `${query}-${profile?.id || "generic"}-${primaryAxis}`;

  const shuffled = [...pool].sort((a, b) => {
    const aScore = seedFromText(`${seed}-${a.axis}`);
    const bScore = seedFromText(`${seed}-${b.axis}`);
    return aScore - bScore;
  });

  return shuffled.slice(0, Math.min(max, shuffled.length));
}

export function buildIntentDiscoveryProbe(input = {}) {
  const query = cleanText(input.query || "");
  const profile = resolveIntentDiscoveryProfile(input.category || "", query);
  const primaryAxis = cleanText(input.primaryAxis || input.activePriority || "");
  const selected = selectDiscoveryOptions(profile, primaryAxis, query, 3);

  if (selected.length < 2) return "";

  const labels = selected.map((entry) => entry.label);
  const axisKeys = selected.map((entry) => entry.axis);
  const seed = `${query}-${profile.id}`;

  const bridges = [
    "Me ajuda a ajustar melhor:",
    "Pra refinar daqui:",
    "Um detalhe que muda bastante a escolha:",
    "Se quiser deixar a recomendação mais certeira:",
  ];

  const questions = [
    `você liga mais para ${joinHumanList(labels)}?`,
    `o que pesa mais pra você: ${joinHumanList(labels)}?`,
    `você usa mais pensando em ${joinHumanList(labels)}?`,
    `sua prioridade aqui é mais ${joinHumanList(labels)}?`,
  ];

  const bridge = pickVariant(bridges, seed);
  const question = pickVariant(questions, `${seed}-question`);

  return {
    probe: `${bridge} ${question.charAt(0).toLowerCase()}${question.slice(1)}`,
    axes: axisKeys,
    profileId: profile.id,
  };
}

function preserveReplyStructure(value = "") {
  return String(value || "")
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

export function appendUserIntentDiscovery(input = {}) {
  const reply = preserveReplyStructure(input.reply || "");
  if (!reply) {
    return { applied: false, reply: "", meta: null };
  }

  const suppression = shouldSuppressIntentDiscovery(input);
  if (suppression.suppress) {
    return {
      applied: false,
      reply,
      meta: {
        suppressed: true,
        reason: suppression.reason,
      },
    };
  }

  const built = buildIntentDiscoveryProbe(input);
  const probe = cleanText(typeof built === "string" ? built : built?.probe || "");
  if (!probe) {
    return { applied: false, reply, meta: { suppressed: true, reason: "empty_probe" } };
  }

  if (reply.includes(probe) || /\?\s*$/.test(reply)) {
    return { applied: false, reply, meta: { suppressed: true, reason: "probe_already_present" } };
  }

  return {
    applied: true,
    reply: cleanupMiaHumanLanguage(`${reply}\n\n${probe}`, {
      preserveStructure: true,
    }).text || `${reply}\n\n${probe}`,
    meta: {
      pending: true,
      probe,
      axes: built.axes || [],
      profileId: built.profileId || "",
      category: input.category || "",
      suppressed: false,
    },
  };
}

export function resolveIntentDiscoverySessionClear(input = {}) {
  if (
    hasKnownUseIntent({
      query: input.query || "",
      querySignals: input.querySignals || {},
      activePriority: input.activePriority || "",
    })
  ) {
    return {
      intentDiscoveryPending: false,
      intentDiscoveryResolved: true,
      lastIntentDiscoveryProbe: "",
    };
  }

  return null;
}

export function auditIntentDiscovery(text = "", context = {}) {
  const body = cleanText(text);
  const flags = [];

  if (!body) return flags;

  if (BANNED_PROBE_PATTERNS.some((pattern) => pattern.test(body))) {
    flags.push(INTENT_DISCOVERY_FLAGS.GENERIC_FIXED_QUESTION);
  }

  if (INTERROGATION_PATTERNS.some((pattern) => pattern.test(body))) {
    flags.push(INTENT_DISCOVERY_FLAGS.INTERROGATION_TONE);
  }

  if (/\b(preencha|formulário|formulario|campo obrigatório)\b/i.test(body)) {
    flags.push(INTENT_DISCOVERY_FLAGS.FORM_LIKE_QUESTION);
  }

  if (context.expectDiscovery && !/\?\s*$/.test(body) && !/\b(liga mais|pesa mais|prioridade|ajustar melhor|refinar)\b/i.test(body)) {
    flags.push(INTENT_DISCOVERY_FLAGS.MISSING_DISCOVERY_ON_GAP);
  }

  if (context.priorityKnown && /\b(liga mais|pesa mais|ajustar melhor|refinar daqui)\b/i.test(body)) {
    flags.push(INTENT_DISCOVERY_FLAGS.DISCOVERY_WHEN_PRIORITY_KNOWN);
  }

  if (context.inRecovery && /\b(liga mais|pesa mais|ajustar melhor|refinar daqui)\b/i.test(body)) {
    flags.push(INTENT_DISCOVERY_FLAGS.DISCOVERY_IN_RECOVERY);
  }

  if (context.inComparison && /\b(liga mais|pesa mais|ajustar melhor|refinar daqui)\b/i.test(body)) {
    flags.push(INTENT_DISCOVERY_FLAGS.DISCOVERY_IN_COMPARISON);
  }

  return flags;
}

export function buildIntentDiscoveryAuditRecord(input = {}) {
  const built = appendUserIntentDiscovery(input);
  const flags = auditIntentDiscovery(built.reply, {
    expectDiscovery: hasIntentInformationGap(input) && !shouldSuppressIntentDiscovery(input).suppress,
    priorityKnown: hasKnownUseIntent(input),
    inRecovery: RECOVERY_INTERACTION_TYPES.has(input.sessionContext?.lastInteractionType),
    inComparison: input.intent === "comparison",
  });

  return {
    query: input.query || "",
    category: input.category || "",
    intentInformationGapDetected: hasIntentInformationGap(input),
    discoveryApplied: built.applied,
    discoveryProbeDetected: /\?\s*$/.test(built.reply),
    contextualProbeDetected: built.applied && !flags.includes(INTENT_DISCOVERY_FLAGS.GENERIC_FIXED_QUESTION),
    interrogationToneDetected: flags.includes(INTENT_DISCOVERY_FLAGS.INTERROGATION_TONE),
    discoveryWhenPriorityKnown: flags.includes(INTENT_DISCOVERY_FLAGS.DISCOVERY_WHEN_PRIORITY_KNOWN),
    discoveryInRecovery: flags.includes(INTENT_DISCOVERY_FLAGS.DISCOVERY_IN_RECOVERY),
    flags,
    probe: built.meta?.probe || "",
    text: built.reply,
    ok:
      built.applied &&
      flags.length === 0 &&
      !flags.includes(INTENT_DISCOVERY_FLAGS.MISSING_DISCOVERY_ON_GAP),
  };
}
