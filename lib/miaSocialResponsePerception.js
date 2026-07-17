/**
 * PATCH 11A.5 — Social Response Perception & Personality Refinement
 *
 * Personality, specificity, closure and genericity policies for social turns.
 * MIA owns the intelligence; the LLM only verbalizes.
 */

import {
  MIA_HUMAN_OBJECTIVES,
  MIA_INTERACTION_MODES,
} from "./miaIntentRecognitionLayer.js";
import {
  FOLLOW_UP_POLICY,
  RESPONSE_DEPTH,
} from "./miaHumanConversationExperience.js";
import {
  buildBriefOfficialIdentityReply,
  containsStaleBrandReference,
  MIA_OFFICIAL_BRAND,
} from "./miaCompanyKnowledge.js";

export const SOCIAL_PERCEPTION_VERSION = "11A.5F";

export const SOCIAL_DISTANCE = Object.freeze({
  NEUTRAL_WARM: "neutral_warm",
  FRIENDLY_BRIEF: "friendly_brief",
  SUPPORTIVE_RESERVED: "supportive_reserved",
  LIGHT_PLAYFUL: "light_playful",
  PROFESSIONAL_CLEAR: "professional_clear",
});

export const CLOSURE_STYLE = Object.freeze({
  CLOSED: "closed",
  SOFT_CLOSED: "soft_closed",
  OPEN_NATURALLY: "open_naturally",
  QUESTION_REQUIRED: "question_required",
  NO_CLOSING: "no_closing",
});

export const RESPONSE_OPENING = Object.freeze({
  DIRECT_ACKNOWLEDGEMENT: "direct_acknowledgement",
  CONTEXTUAL_OBSERVATION: "contextual_observation",
  LIGHT_EMPATHY: "light_empathy",
  NATURAL_REACTION: "natural_reaction",
  NO_PREFACE: "no_preface",
});

export const EMOTIONAL_PERCEPTION_MODE = Object.freeze({
  ACKNOWLEDGE_ONLY: "acknowledge_only",
  ACKNOWLEDGE_LIGHT_SUPPORT: "acknowledge_and_light_support",
  ACKNOWLEDGE_OPTIONAL_CONTINUATION: "acknowledge_and_optional_continuation",
});

const GENERIC_PHRASE_PATTERN =
  /\b(entendo|imagino|espero que|estou por aqui|estou aqui|se precisar|se quiser|fico feliz em ajudar|que bom|poxa|pois é né|como posso ajudar|tudo certo por aqui)\b/gi;

const THERAPEUTIC_PATTERN =
  /\b(você deveria|tente|respir(?:ar|e)|medite|procure ajuda|terapia|autocuidado|força|coragem|lute|não desista|tudo vai passar|vai melhorar|fique bem logo)\b/i;

const TOXIC_POSITIVITY_PATTERN =
  /\b(vai dar tudo certo|fique positiv|tudo vai melhorar|pelo lado positivo|é só pensar positivo|sorria|anime se|espero que)\b/i;

const FALSE_INTIMACY_PATTERN =
  /\b(amigo|amiga|querido|querida|meu bem|lindo|linda|beijo|abraço virtual|te entendo demais)\b/i;

const FORCED_AVAILABILITY_PATTERN =
  /\b(estou por aqui|estou aqui|se quiser conversar|se precisar de algo|é só chamar|sempre que quiser|pode contar comigo)\b/i;

const OVER_SUPPORT_PATTERN =
  /\b(vou te ajudar|posso te ajudar|estou aqui para|não hesite|qualquer coisa|no que precisar|espero que)\b/i;

const OPENING_PATTERNS = [
  { pattern: /^poxa\b/i, label: "poxa" },
  { pattern: /^entendo\b/i, label: "entendo" },
  { pattern: /^imagino\b/i, label: "imagino" },
  { pattern: /^que bom\b/i, label: "que_bom" },
  { pattern: /^oi\b/i, label: "oi" },
  { pattern: /^ol[aá]\b/i, label: "ola" },
];

const CLOSING_PATTERNS = [
  { pattern: /estou por aqui\b/i, label: "estou_por_aqui" },
  { pattern: /se precisar\b/i, label: "se_precisar" },
  { pattern: /é só falar\b/i, label: "e_so_falar" },
  { pattern: /fico feliz em ajudar\b/i, label: "fico_feliz" },
];

const FORCED_QUESTION_CLOSING = /\?\s*$/;

const TOPIC_ANCHOR_GROUPS = Object.freeze([
  { key: "calor", pattern: /\b(calcor|calor|quente|sol|temperatura)\b/i },
  { key: "trabalho", pattern: /\b(trabalho|expediente|escritorio|escritório|reuni)\w*/i },
  { key: "cansaco", pattern: /\b(cansad\w*|exaust\w*|esgotad\w*|pesad\w*|corrido|puxad\w*)\w*/i },
  { key: "desanimo", pattern: /\b(desanim\w*|desmotiv\w*|down|baixo astral)\w*/i },
  { key: "frustracao", pattern: /\b(frustrad\w*|irritad\w*|estress\w*|estresse)\w*/i },
  { key: "descanso", pattern: /\b(descans\w*|relax\w*|dormir|sono)\w*/i },
  { key: "cachorro", pattern: /\b(cachorro|dog|pet)\w*/i },
  { key: "chinelo", pattern: /\b(chinelo|sandalia|sandália)\w*/i },
  { key: "melhora", pattern: /\b(melhor|tranquil\w*|aliviad\w*|alivio|alívio)\w*/i },
  { key: "agradecimento", pattern: /\b(valeu|obrigad\w*|tmj|brigad\w*)\w*/i },
]);

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenCount(text = "") {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function extractContentAnchors(message = "") {
  const normalized = normalizeText(message);
  if (!normalized) return [];

  const anchors = new Set();
  for (const group of TOPIC_ANCHOR_GROUPS) {
    if (group.pattern.test(normalized)) {
      anchors.add(group.key);
    }
  }

  const tokens = normalized
    .split(" ")
    .filter((t) => t.length >= 4 && !/^(hoje|ontem|agora|muito|mesmo|isso|essa|esse)$/.test(t));
  for (const token of tokens.slice(0, 4)) {
    anchors.add(token);
  }

  return [...anchors];
}

export function extractRepetitionSignalsFromHistory(conversationMessages = []) {
  const messages = Array.isArray(conversationMessages) ? conversationMessages : [];
  const assistantReplies = messages
    .filter((m) => m?.role === "assistant" && String(m?.content || "").trim())
    .slice(-3)
    .map((m) => String(m.content).trim());

  const recentResponseOpeners = [];
  const recentResponseClosings = [];

  for (const reply of assistantReplies) {
    for (const item of OPENING_PATTERNS) {
      if (item.pattern.test(reply)) recentResponseOpeners.push(item.label);
    }
    for (const item of CLOSING_PATTERNS) {
      if (item.pattern.test(reply)) recentResponseClosings.push(item.label);
    }
  }

  const repetitionRisk =
    recentResponseOpeners.length >= 2 &&
    recentResponseOpeners[recentResponseOpeners.length - 1] ===
      recentResponseOpeners[recentResponseOpeners.length - 2]
      ? "high"
      : recentResponseClosings.length >= 2 &&
          recentResponseClosings[recentResponseClosings.length - 1] ===
            recentResponseClosings[recentResponseClosings.length - 2]
        ? "medium"
        : "low";

  return {
    recentResponseOpeners,
    recentResponseClosings,
    repetitionRisk,
  };
}

function readMessageContext(recognition = {}, message = "") {
  const normalized = normalizeText(message);
  return {
    isAcknowledgement:
      /\b(valeu|obrigad\w*|tmj|brigad\w*|ajudou muito|ajudou demais|thanks)\b/i.test(
        normalized
      ) ||
      recognition.primaryIntent === "acknowledgement" ||
      recognition.socialFamilies?.postPurchaseAck ||
      recognition.socialFamilies?.acknowledgement,
    isShortReaction:
      /^(boa|show|top|massa|a[ií]\s*sim|kkk+|kk|haha+|hehe+|hm+)$/i.test(normalized) ||
      (recognition.socialFamilies?.reaction && !recognition.socialFamilies?.greeting),
    isCasualComment:
      /\b(pois é|pois e|calor|trabalho|semana)\b/i.test(normalized) &&
      tokenCount(message) >= 2,
    isFarewell:
      /\b(falou|até depois|ate depois|até mais|ate mais|tchau|vou dormir|vou descansar|valeu, fui|, fui)\b/i.test(
        normalized
      ) ||
      recognition.socialFamilies?.farewell ||
      recognition.humanObjective === MIA_HUMAN_OBJECTIVES.CLOSE_INTERACTION,
    isIdentityQuestion:
      /\b(quem é você|quem e voce|o que você|só fala de compras|so fala de compras|só sabe falar|so sabe falar|sabe falar de compras|conversar normalmente|posso conversar|fala só de compra|trocar ideia)\b/i.test(
        normalized
      ) ||
      recognition.interactionMode === MIA_INTERACTION_MODES.IDENTITY ||
      recognition.primaryIntent === "about_mia" ||
      recognition.socialFamilies?.aboutMia,
    isEmotionalLight:
      /\b(cansad\w*|desanim\w*|frustr\w*|esgotad\w*|pesad\w*|puxad\w*|difícil|dificil|exaust\w*|estress\w*|desanima|tranquil\w*)\w*/i.test(
        normalized
      ) ||
      recognition.interactionMode === MIA_INTERACTION_MODES.EMOTIONAL_SUPPORT ||
      recognition.humanObjective === MIA_HUMAN_OBJECTIVES.EXPRESS_FEELING,
    isGreeting:
      recognition.primaryIntent === "greeting" || recognition.socialFamilies?.greeting,
  };
}

function resolveSocialDistance(recognition = {}, contract = {}, message = "") {
  const ctx = readMessageContext(recognition, message);
  if (ctx.isIdentityQuestion) {
    return SOCIAL_DISTANCE.PROFESSIONAL_CLEAR;
  }
  if (ctx.isEmotionalLight) {
    return SOCIAL_DISTANCE.SUPPORTIVE_RESERVED;
  }
  if (ctx.isGreeting) {
    return SOCIAL_DISTANCE.FRIENDLY_BRIEF;
  }
  if (ctx.isShortReaction || recognition.primaryIntent === "social_validation") {
    return SOCIAL_DISTANCE.LIGHT_PLAYFUL;
  }
  if (
    recognition.interactionMode === MIA_INTERACTION_MODES.EMOTIONAL_SUPPORT ||
    recognition.humanObjective === MIA_HUMAN_OBJECTIVES.EXPRESS_FEELING
  ) {
    return SOCIAL_DISTANCE.SUPPORTIVE_RESERVED;
  }
  return SOCIAL_DISTANCE.NEUTRAL_WARM;
}

function resolveClosureStyle(recognition = {}, contract = {}, message = "") {
  const ctx = readMessageContext(recognition, message);

  if (ctx.isIdentityQuestion) {
    return CLOSURE_STYLE.CLOSED;
  }
  if (ctx.isFarewell) {
    return CLOSURE_STYLE.CLOSED;
  }
  if (ctx.isAcknowledgement) {
    return CLOSURE_STYLE.CLOSED;
  }
  if (ctx.isShortReaction) {
    return CLOSURE_STYLE.NO_CLOSING;
  }
  if (ctx.isGreeting && tokenCount(message) <= 4) {
    return CLOSURE_STYLE.NO_CLOSING;
  }
  if (ctx.isCasualComment) {
    return CLOSURE_STYLE.SOFT_CLOSED;
  }
  if (contract.followUpPolicy === FOLLOW_UP_POLICY.CLARIFYING_REQUIRED) {
    return CLOSURE_STYLE.QUESTION_REQUIRED;
  }
  if (recognition.interactionMode === MIA_INTERACTION_MODES.EMOTIONAL_SUPPORT) {
    return CLOSURE_STYLE.SOFT_CLOSED;
  }
  if (contract.responseDepth === RESPONSE_DEPTH.MINIMAL) {
    return CLOSURE_STYLE.NO_CLOSING;
  }
  return CLOSURE_STYLE.SOFT_CLOSED;
}

function resolveResponseOpening(recognition = {}, contract = {}, message = "") {
  const ctx = readMessageContext(recognition, message);
  if (ctx.isShortReaction) {
    return RESPONSE_OPENING.NATURAL_REACTION;
  }
  if (ctx.isAcknowledgement) {
    return RESPONSE_OPENING.DIRECT_ACKNOWLEDGEMENT;
  }
  if (ctx.isGreeting && tokenCount(message) <= 2) {
    return RESPONSE_OPENING.NO_PREFACE;
  }
  if (ctx.isEmotionalLight || recognition.interactionMode === MIA_INTERACTION_MODES.EMOTIONAL_SUPPORT) {
    return RESPONSE_OPENING.LIGHT_EMPATHY;
  }
  if ((contract.contentAnchors || []).length > 0) {
    return RESPONSE_OPENING.CONTEXTUAL_OBSERVATION;
  }
  if (contract.responseDepth === RESPONSE_DEPTH.MINIMAL) {
    return RESPONSE_OPENING.NO_PREFACE;
  }
  return RESPONSE_OPENING.CONTEXTUAL_OBSERVATION;
}

function resolveMustReferenceUserContent(message = "", anchors = [], recognition = {}) {
  const ctx = readMessageContext(recognition, message);
  if (ctx.isShortReaction || ctx.isIdentityQuestion) {
    return false;
  }
  if (ctx.isCasualComment) {
    return true;
  }
  return tokenCount(message) >= 3 && anchors.length > 0;
}

function resolveEmotionalPerceptionMode(recognition = {}, contract = {}, message = "") {
  const ctx = readMessageContext(recognition, message);
  if (!ctx.isEmotionalLight && recognition.interactionMode !== MIA_INTERACTION_MODES.EMOTIONAL_SUPPORT) {
    return null;
  }
  if (contract.followUpPolicy === FOLLOW_UP_POLICY.NONE) {
    return EMOTIONAL_PERCEPTION_MODE.ACKNOWLEDGE_ONLY;
  }
  if (contract.followUpPolicy === FOLLOW_UP_POLICY.NATURAL) {
    return EMOTIONAL_PERCEPTION_MODE.ACKNOWLEDGE_OPTIONAL_CONTINUATION;
  }
  return EMOTIONAL_PERCEPTION_MODE.ACKNOWLEDGE_LIGHT_SUPPORT;
}

function resolvePersonalityPolicy(recognition = {}, contract = {}, message = "") {
  const ctx = readMessageContext(recognition, message);
  const socialDistance = resolveSocialDistance(recognition, contract, message);
  const warmth =
    socialDistance === SOCIAL_DISTANCE.SUPPORTIVE_RESERVED
      ? "warm_reserved"
      : socialDistance === SOCIAL_DISTANCE.LIGHT_PLAYFUL
        ? "warm_light"
        : "warm_balanced";
  const directness =
    contract.responseDepth === RESPONSE_DEPTH.MINIMAL ? "direct" : "clear_natural";
  const humorAllowance =
    socialDistance === SOCIAL_DISTANCE.LIGHT_PLAYFUL ? "light" : "none";
  const emojiAllowance =
    socialDistance === SOCIAL_DISTANCE.LIGHT_PLAYFUL ? "single_optional" : "none";

  return {
    warmth,
    directness,
    formality: socialDistance === SOCIAL_DISTANCE.PROFESSIONAL_CLEAR ? "neutral" : "informal_light",
    socialDistance,
    humorAllowance,
    emojiAllowance,
    emotionalIntensity: contract.emotionalIntensity || "none",
    identityVisibility: contract.identityVisibility || "implicit",
    verbosity: contract.responseDepth || RESPONSE_DEPTH.BRIEF,
    mirrorInformality: ctx.isShortReaction || recognition.socialFamilies?.reaction === true,
  };
}

export function enrichContractWithSocialPerception(
  contract = {},
  {
    recognition = null,
    message = "",
    conversationMessages = [],
  } = {}
) {
  const rec = recognition || {};
  const userMessage = message || contract.resolvedQuery || "";
  const ctx = readMessageContext(rec, userMessage);
  let workingContract = { ...contract };

  if (ctx.isShortReaction) {
    workingContract = {
      ...workingContract,
      responseDepth: RESPONSE_DEPTH.MINIMAL,
      followUpPolicy: FOLLOW_UP_POLICY.NONE,
    };
  }

  if (ctx.isFarewell) {
    workingContract = {
      ...workingContract,
      responseDepth:
        workingContract.responseDepth === RESPONSE_DEPTH.SUPPORTIVE
          ? RESPONSE_DEPTH.BRIEF
          : RESPONSE_DEPTH.MINIMAL,
      followUpPolicy: FOLLOW_UP_POLICY.NONE,
    };
  }

  if (ctx.isIdentityQuestion) {
    workingContract = {
      ...workingContract,
      identityVisibility: "explicit_when_relevant",
      responseDepth: RESPONSE_DEPTH.BRIEF,
      followUpPolicy: FOLLOW_UP_POLICY.NONE,
    };
  }

  const contentAnchors = extractContentAnchors(userMessage);
  const repetitionSignals = extractRepetitionSignalsFromHistory(conversationMessages);
  const mustReferenceUserContent = resolveMustReferenceUserContent(
    userMessage,
    contentAnchors,
    rec
  );
  const closureStyle = resolveClosureStyle(rec, workingContract, userMessage);
  const responseOpening = resolveResponseOpening(
    rec,
    { ...workingContract, contentAnchors },
    userMessage
  );
  const personalityPolicy = resolvePersonalityPolicy(rec, workingContract, userMessage);
  const emotionalPerceptionMode = resolveEmotionalPerceptionMode(
    rec,
    workingContract,
    userMessage
  );

  return {
    ...workingContract,
    perceptionVersion: SOCIAL_PERCEPTION_VERSION,
    contentAnchors,
    mustReferenceUserContent,
    closureStyle,
    responseOpening,
    personalityPolicy,
    emotionalPerceptionMode,
    repetitionSignals,
    userMessageForSpecificity: message || contract.resolvedQuery || null,
    shortReactionMode: ctx.isShortReaction,
    identityMode: ctx.isIdentityQuestion,
    farewellMode: ctx.isFarewell,
    semanticCompleteness: true,
  };
}

export function perceptionContractToVerbalizationInstructions(contract = {}) {
  const pp = contract.personalityPolicy || {};
  const lines = [
    "Percepção e personalidade governadas (obrigatório):",
    `- Distância social: ${pp.socialDistance || SOCIAL_DISTANCE.NEUTRAL_WARM}`,
    `- Calor: ${pp.warmth || "warm_balanced"}; objetividade: ${pp.directness || "clear_natural"}`,
    `- Abertura: ${contract.responseOpening || RESPONSE_OPENING.CONTEXTUAL_OBSERVATION}`,
    `- Encerramento: ${contract.closureStyle || CLOSURE_STYLE.SOFT_CLOSED}`,
    `- Referenciar conteúdo do usuário: ${contract.mustReferenceUserContent ? "sim — reaja ao que foi dito" : "opcional"}`,
  ];

  if (contract.contentAnchors?.length) {
    lines.push(
      `- Aspectos relevantes da mensagem: ${contract.contentAnchors.slice(0, 5).join(", ")}`
    );
  }

  if (contract.userMessageForSpecificity) {
    lines.push(`- Mensagem do usuário (referência): "${contract.userMessageForSpecificity}"`);
  }

  lines.push("- Não use frase genérica intercambiável como resposta principal.");
  lines.push("- Não invente sentimentos, rotina ou experiências humanas próprias.");
  lines.push("- Não soar terapêutica, motivacional ou institucional.");
  lines.push("- Não usar positividade forçada nem falsa intimidade.");

  if (contract.closureStyle === CLOSURE_STYLE.CLOSED) {
    lines.push("- Encerre de forma completa; sem pergunta e sem disponibilidade genérica.");
  } else if (contract.closureStyle === CLOSURE_STYLE.NO_CLOSING) {
    lines.push("- Resposta curta; sem fechamento artificial.");
  } else if (contract.closureStyle === CLOSURE_STYLE.SOFT_CLOSED) {
    lines.push("- Pode encerrar suavemente, mas sem 'estou por aqui' ou disponibilidade vazia.");
  }

  if (contract.emotionalPerceptionMode === EMOTIONAL_PERCEPTION_MODE.ACKNOWLEDGE_ONLY) {
    lines.push("- Emoção leve: reconheça sem conselho, diagnóstico ou prolongamento.");
  }

  if (pp.humorAllowance === "light") {
    lines.push("- Leveza permitida, sem exagero, gíria forçada ou emoji em excesso.");
  }

  if (contract.repetitionSignals?.repetitionRisk !== "low") {
    const avoid = [
      ...(contract.repetitionSignals?.recentResponseOpeners || []),
      ...(contract.repetitionSignals?.recentResponseClosings || []),
    ];
    if (avoid.length) {
      lines.push(`- Evite repetir abertura/fechamento recentes: ${avoid.slice(-3).join(", ")}`);
    }
  }

  return lines.join("\n");
}

function replyReferencesContent(reply = "", anchors = [], userMessage = "") {
  const normalized = normalizeText(reply);
  if (!normalized) return false;

  if (anchors.some((a) => normalized.includes(normalizeText(a)))) {
    return true;
  }

  const userNorm = normalizeText(userMessage);
  if (userNorm.length >= 2 && userNorm.length <= 8) {
    if (normalized.includes(userNorm)) return true;
    if (/^(kkk+|haha+|hehe+|rs+)$/.test(userNorm) && /kkk|haha|hehe|rs|pois|boa|show|sim/.test(normalized)) {
      return true;
    }
  }

  const userTokens = userNorm
    .split(" ")
    .filter((t) => t.length >= 5);
  const overlap = userTokens.filter((t) => normalized.includes(t)).length;
  return overlap >= 1;
}

function genericPhraseRatio(text = "") {
  const normalized = normalizeText(text);
  const matches = normalized.match(GENERIC_PHRASE_PATTERN) || [];
  const tokens = tokenCount(text);
  if (tokens === 0) return 1;
  return matches.length / Math.max(tokens, 1);
}

const CORRUPTED_TOKEN_PATTERN =
  /^poise[.!?]*$|^entao[.!?]*$|^poise[.!?]*\s*$|^kk[.!?]*$|^![.!?]*$|^sim[.]{2,}$/i;

const HUMANITY_CLAIM_PATTERN =
  /\b(sou (?:uma )?pessoa|sou humana|sou gente|tenho sentimentos|minha vida|meu dia pessoal)\b/i;

function splitSentences(text = "") {
  return String(text || "")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function validateSocialLinguisticIntegrity(reply = "", contract = {}) {
  const text = String(reply || "").trim();
  const violations = [];

  if (!text) {
    return { valid: false, violations: ["empty_reply"] };
  }

  if (/^[.!?]+$/.test(text) || /^[^a-zA-ZáàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ0-9]{1,2}[.!?]*$/.test(text)) {
    violations.push("malformed_token_violation");
  }

  if (CORRUPTED_TOKEN_PATTERN.test(text)) {
    violations.push("malformed_token_violation");
  }

  if (/[.!?]{2,}$/.test(text) || /\s{2,}/.test(text.replace(/\n/g, " "))) {
    violations.push("punctuation_integrity_violation");
  }

  if (contract.shortReactionMode) {
    if (tokenCount(text) > 8) {
      violations.push("semantic_incompleteness_violation");
    }
    if (FORCED_QUESTION_CLOSING.test(text)) {
      violations.push("question_violation");
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

export function validateIdentityResponse(reply = "", contract = {}, query = "") {
  const text = String(reply || "").trim();
  const normalized = normalizeText(text);
  const violations = [];

  if (!text) {
    return { valid: false, violations: ["empty_reply"] };
  }

  if (containsStaleBrandReference(text)) {
    violations.push("stale_brand_reference");
  }

  if (HUMANITY_CLAIM_PATTERN.test(normalized)) {
    violations.push("claims_humanity");
  }

  if (!/\bmia\b/i.test(text)) {
    violations.push("identity_accuracy_violation");
  }

  if (!/\bteilor\b/i.test(text) && contract.identityMode) {
    violations.push("identity_accuracy_violation");
  }

  const tokens = tokenCount(text);
  const isBriefQuery =
    contract.identityMode ||
    contract.personalityPolicy?.socialDistance === SOCIAL_DISTANCE.PROFESSIONAL_CLEAR;

  if (isBriefQuery && tokens > 35) {
    violations.push("identity_verbosity_violation");
  }

  if (
    isBriefQuery &&
    /\b(lista de capacidades|função é|minha função|assistente inteligente de compras do app)\b/i.test(
      normalized
    )
  ) {
    violations.push("institutional_pitch_violation");
  }

  if (
    contract.closureStyle === CLOSURE_STYLE.CLOSED &&
    FORCED_QUESTION_CLOSING.test(text)
  ) {
    violations.push("unnecessary_question_violation");
  }

  return {
    valid: violations.length === 0,
    violations,
    officialIdentity: MIA_OFFICIAL_BRAND.assistantName,
    officialCompany: MIA_OFFICIAL_BRAND.companyName,
  };
}

export function validateFarewellExtension(reply = "", contract = {}) {
  const text = String(reply || "").trim();
  const violations = [];

  if (!contract.farewellMode && !contract.socialFamilies?.farewell) {
    return { valid: true, violations: [] };
  }

  const sentences = splitSentences(text);
  if (sentences.length > 1) {
    violations.push("farewell_multiple_extension_violation");
  }

  const normalized = normalizeText(text);
  const ideaCount = [
    /descans/i.test(normalized),
    /sono|dormir/i.test(normalized),
    /noite/i.test(normalized),
    /at[eé]|falou|fui|tchau/i.test(normalized),
    /aproveite|otima|ótima|excelente/i.test(normalized),
  ].filter(Boolean).length;

  if (ideaCount >= 3) {
    violations.push("farewell_multiple_extension_violation");
  }

  if (/tenha uma|espero que|estou por aqui|se precisar/i.test(normalized)) {
    violations.push("farewell_availability_violation");
  }

  if (FORCED_QUESTION_CLOSING.test(text)) {
    violations.push("farewell_question_violation");
  }

  if (
    (contract.responseDepth === RESPONSE_DEPTH.MINIMAL ||
      contract.responseDepth === RESPONSE_DEPTH.BRIEF) &&
    tokenCount(text) > 12
  ) {
    violations.push("farewell_verbosity_violation");
  }

  if (/otima noite|ótima noite|excelente noite|maravilhosa noite/i.test(normalized)) {
    violations.push("farewell_enthusiasm_mismatch");
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

function buildShortReactionFallback(message = "") {
  const normalized = normalizeText(message);
  if (/^kkk+|^haha+|^hehe+|^rs+$/i.test(normalized)) return "Hehe!";
  if (/^boa$/i.test(normalized)) return "Boa!";
  if (/^show$/i.test(normalized)) return "Show!";
  if (/^pois e|^pois é/i.test(normalized)) return "Pois é.";
  if (/^a[ií]\s*sim$/i.test(normalized)) return "Aí sim.";
  if (/^hm+$/i.test(normalized)) return "Hm.";
  return "Pois é.";
}

export function validateSocialResponsePerception(reply = "", contract = {}) {
  const text = String(reply || "").trim();
  const normalized = normalizeText(text);
  const violations = [];

  if (!text) {
    return { valid: false, violations: ["empty_reply"] };
  }

  if (contract.mustReferenceUserContent) {
    if (
      !replyReferencesContent(
        text,
        contract.contentAnchors || [],
        contract.userMessageForSpecificity || ""
      )
    ) {
      violations.push("specificity_violation");
    }
  }

  if (contract.shortReactionMode) {
    if (tokenCount(text) > 5) {
      violations.push("generic_response_violation");
    }
    if (/parece que algo|algo te divertiu|interessante|curioso|divertiu/i.test(normalized)) {
      violations.push("generic_response_violation");
    }
  }

  const genericRatio = genericPhraseRatio(text);
  const tokens = tokenCount(text);
  if (
    (tokens <= 12 && genericRatio >= 0.34) ||
    (tokens <= 6 && genericRatio >= 0.2) ||
    /^(entendo|imagino|que bom|faz sentido)[.!]?$/.test(normalized)
  ) {
    violations.push("generic_response_violation");
  }

  if (
    contract.closureStyle === CLOSURE_STYLE.CLOSED &&
    (FORCED_QUESTION_CLOSING.test(text) || FORCED_AVAILABILITY_PATTERN.test(normalized))
  ) {
    violations.push("repetitive_closing_violation");
  }

  if (FORCED_AVAILABILITY_PATTERN.test(normalized)) {
    violations.push("forced_availability_violation");
  }

  if (THERAPEUTIC_PATTERN.test(normalized)) {
    violations.push("over_support_violation");
  }

  if (TOXIC_POSITIVITY_PATTERN.test(normalized)) {
    violations.push("toxic_positivity_violation");
  }

  if (FALSE_INTIMACY_PATTERN.test(normalized)) {
    violations.push("false_intimacy_violation");
  }

  if (
    contract.followUpPolicy === FOLLOW_UP_POLICY.NONE &&
    contract.closureStyle === CLOSURE_STYLE.CLOSED &&
    OVER_SUPPORT_PATTERN.test(normalized)
  ) {
    violations.push("forced_continuation");
  }

  if (
    contract.closureStyle !== CLOSURE_STYLE.QUESTION_REQUIRED &&
    contract.followUpPolicy !== FOLLOW_UP_POLICY.CLARIFYING_REQUIRED &&
    FORCED_QUESTION_CLOSING.test(text) &&
    (contract.closureStyle === CLOSURE_STYLE.CLOSED ||
      contract.closureStyle === CLOSURE_STYLE.NO_CLOSING ||
      contract.closureStyle === CLOSURE_STYLE.SOFT_CLOSED)
  ) {
    violations.push("unnecessary_question_violation");
  }

  const openingLabel = OPENING_PATTERNS.find((o) => o.pattern.test(text))?.label;
  if (
    openingLabel &&
    contract.repetitionSignals?.recentResponseOpeners?.includes(openingLabel)
  ) {
    violations.push("repetitive_opening_violation");
  }

  const closingLabel = CLOSING_PATTERNS.find((c) => c.pattern.test(text))?.label;
  if (
    closingLabel &&
    contract.repetitionSignals?.recentResponseClosings?.includes(closingLabel)
  ) {
    violations.push("repetitive_closing_violation");
  }

  for (const v of validateSocialLinguisticIntegrity(text, contract).violations) {
    violations.push(v);
  }

  if (contract.identityMode || contract.personalityPolicy?.socialDistance === SOCIAL_DISTANCE.PROFESSIONAL_CLEAR) {
    for (const v of validateIdentityResponse(text, contract, contract.userMessageForSpecificity || "").violations) {
      violations.push(v);
    }
  }

  if (contract.farewellMode || contract.socialFamilies?.farewell) {
    for (const v of validateFarewellExtension(text, contract).violations) {
      violations.push(v);
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

export function stripPerceptionViolations(text = "", contract = {}) {
  let out = String(text || "").trim();

  out = out
    .replace(/\n?\s*(?:Espero que)[^.?\n]{0,120}[.?!]?/gi, "")
    .replace(/\n?\s*(?:Às vezes,)[^.?\n]{0,120}[.?!]?/gi, "")
    .trim();

  if (
    contract.closureStyle === CLOSURE_STYLE.CLOSED ||
    contract.closureStyle === CLOSURE_STYLE.NO_CLOSING
  ) {
    out = out
      .replace(/\n?\s*(?:Se precisar|Se quiser|Se tiver|Estou por aqui|Estou aqui)[^.?\n]{0,80}[.?!]?/gi, "")
      .replace(/\n?\s*(?:Fico feliz em ajudar|É só falar|É só avisar)[^.?\n]{0,80}[.?!]?/gi, "")
      .trim();
  }

  if (contract.closureStyle === CLOSURE_STYLE.CLOSED && out.endsWith("?")) {
    out = out.replace(/\s*[^.!?\n]+\?\s*$/, "").trim();
  }

  return out;
}

export function buildSpecificGovernedFallback(contract = {}, { period = "" } = {}) {
  const anchors = contract.contentAnchors || [];
  const message = contract.userMessageForSpecificity || "";
  const depth = contract.responseDepth || RESPONSE_DEPTH.BRIEF;

  if (contract.farewellMode || contract.socialFamilies?.farewell || readMessageContext({}, message).isFarewell) {
    if (/dormir|descansar/i.test(message)) return "Boa noite — descanse bem.";
    if (/boa noite/i.test(message)) return "Boa noite!";
    return "Até mais!";
  }

  if (contract.primaryIntent === "greeting" || contract.socialFamilies?.greeting) {
    if (/boa noite/i.test(message)) return "Boa noite!";
    if (/bom dia/i.test(message)) return "Bom dia!";
    if (/boa tarde/i.test(message)) return "Boa tarde!";
    if (/eae|e ai|e aí|opa|oii|oi/i.test(message)) return "Opa!";
    return "Oi!";
  }

  if (
    contract.primaryIntent === "acknowledgement" ||
    contract.socialFamilies?.postPurchaseAck ||
    anchors.includes("agradecimento") ||
    /\b(valeu|obrigad\w*)\b/i.test(message)
  ) {
    if (/comprei|fechei|peguei|deu certo/i.test(message)) {
      return depth === RESPONSE_DEPTH.MINIMAL ? "Que bom!" : "Boa — ficou resolvido então.";
    }
    return depth === RESPONSE_DEPTH.MINIMAL ? "Por nada!" : "Imagina.";
  }

  if (
    contract.interactionMode === MIA_INTERACTION_MODES.IDENTITY ||
    contract.identityMode ||
    contract.personalityPolicy?.socialDistance === SOCIAL_DISTANCE.PROFESSIONAL_CLEAR
  ) {
    return buildBriefOfficialIdentityReply(message);
  }

  if (anchors.includes("calor")) return "Esse calor realmente aperta.";
  if (anchors.includes("trabalho") || anchors.includes("cansaco")) {
    return "Dia de trabalho pesado drena mesmo.";
  }
  if (anchors.includes("desanimo")) return "Dia meio arrastado pesa no astral.";
  if (anchors.includes("frustracao")) return "Frustração assim cansa.";
  if (anchors.includes("descanso")) return "Descanso bem-vindo.";
  if (anchors.includes("melhora")) return "Bom saber que melhorou um pouco.";
  if (anchors.includes("cachorro") && anchors.includes("chinelo")) {
    return "Cachorro e chinelo é combinação clássica.";
  }

  if (
    contract.shortReactionMode ||
    contract.socialFamilies?.reaction ||
    /^(kkk+|haha+|hehe+|rs+|boa|show|pois e|pois é|a[ií]\s*sim|hm+)$/i.test(message.trim())
  ) {
    return buildShortReactionFallback(message);
  }

  if (contract.interactionMode === MIA_INTERACTION_MODES.EMOTIONAL_SUPPORT) {
    return depth === RESPONSE_DEPTH.MINIMAL ? "Puxado." : "Dia pesado mesmo.";
  }

  return depth === RESPONSE_DEPTH.MINIMAL ? "Pois é." : "Faz sentido.";
}

export function socialPerceptionToTrace(contract = null, validation = null) {
  if (!contract) return null;
  return {
    version: contract.perceptionVersion || SOCIAL_PERCEPTION_VERSION,
    socialDistance: contract.personalityPolicy?.socialDistance,
    closureStyle: contract.closureStyle,
    responseOpening: contract.responseOpening,
    mustReferenceUserContent: contract.mustReferenceUserContent,
    contentAnchors: contract.contentAnchors,
    repetitionRisk: contract.repetitionSignals?.repetitionRisk,
    validation: validation || null,
  };
}
