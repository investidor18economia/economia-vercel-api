/**
 * PATCH 11A.6 — Mixed Verbalization Quality & Natural Transition
 *
 * Structured contract, policies and validation for human+commercial turns.
 * MIA owns the intelligence. The LLM only verbalizes.
 */

import {
  MIA_HUMAN_OBJECTIVES,
  MIA_INTERACTION_MODES,
} from "./miaIntentRecognitionLayer.js";
import {
  hasFirstAnswerStructure,
  matchesStrictFirstAnswerContract,
} from "./miaFirstAnswerResponseContract.js";

export const MIXED_VERBALIZATION_VERSION = "11A.6F";

export const HUMAN_POLARITY = Object.freeze({
  NEGATIVE: "negative",
  NEUTRAL: "neutral",
  POSITIVE: "positive",
});

export const COMMERCIAL_COMPLETION_MINIMUM = Object.freeze({
  CLARIFICATION: "clarification",
  COMPARISON: "comparison",
  RECOMMENDATION: "recommendation_full",
  STANDARD: "standard",
});

export const HUMAN_ACKNOWLEDGEMENT_DEPTH = Object.freeze({
  OMIT: "omit",
  MINIMAL: "minimal",
  BRIEF: "brief",
});

export const RESPONSE_ORDERING = Object.freeze({
  HUMAN_THEN_COMMERCIAL: "human_then_commercial",
  COMMERCIAL_DIRECT_WITH_HUMAN_NOTE: "commercial_direct_with_human_note",
  CLARIFICATION_AFTER_HUMAN: "clarification_after_human",
  COMMERCIAL_THEN_POSITIVE_ACK: "commercial_then_positive_acknowledgement",
});

export const TRANSITION_PROFILE = Object.freeze({
  SEAMLESS: "seamless",
  DIRECT: "direct",
  BRIEF_BRIDGE: "brief_bridge",
  CLARIFICATION_BRIDGE: "clarification_bridge",
  NO_EXPLICIT_BRIDGE: "no_explicit_bridge",
});

const DIRECTNESS_PATTERN =
  /\b(s[oó]\s+me\s+diz|compara\s+logo|sem\s+muita\s+conversa|direto\s+ao\s+ponto|vai\s+direto|me\s+fala\s+qual|qual\s+[eé]\s+melhor|logo\s+ess[ea]s?\s+dois|sem\s+enrola)\b/i;

const MECHANICAL_TRANSITION_PATTERN =
  /\b(mas vamos(?:\s+[àa]s)?\s+compras|agora falando|sobre sua solicita(?:ç|c)[ãa]o|de qualquer forma|de qualquer modo|sobre o produto|sobre sua compra|falando do|vamos [àa] compra|sobre a compra|quanto [àa] compra|mas vamos l[aá]|entendo\.?\s*agora,? sobre)\b/i;

const ANTI_CONSUMPTION_MIXED_PATTERN =
  /\b(vai te animar|pode te animar|melhorar seu dia|melhorar o dia|melhorar (?:esse|este) dia|aliviar (?:isso|esse|o cansa[cç]o|a frustra[cç][ãa]o)|se presentear para esquecer|compra vai|produto novo pode|celular novo (?:vai|pode)|te distrair|esquecer (?:isso|tudo)|merece se presentear|animar (?:voc[eê]|vc|seu dia)|resolver (?:isso|o dia|a situa[cç][ãa]o)|encontrar algo para aliviar)\b/i;

const GENERIC_HUMAN_ACK_PATTERN =
  /^(entendo|imagino|espero que|sinto muito|que pena|poxa|pois [eé])\b/i;

const INSTITUTIONAL_COMMERCIAL_HEADER_PATTERN =
  /\b(agora,? sobre (?:o|a|sua)|falando (?:do|da|de)|quanto [àa] (?:sua )?(?:compra|solicita[cç][ãa]o|busca|necessidade))\b/i;

const UNAUTHORIZED_SOCIAL_QUESTION_PATTERN =
  /\b(quer conversar|quer que eu continue|mais alguma coisa|como (?:voc[eê]|vc) est[aá]|como foi seu dia)\b/i;

const TOPIC_ANCHOR_GROUPS = Object.freeze([
  { key: "cansaco", pattern: /\b(cansad\w*|exaust\w*|esgotad\w*|pesad\w*|corrido|puxad\w*)\w*/i },
  { key: "desanimo", pattern: /\b(desanim\w*|desmotiv\w*|down|baixo astral)\w*/i },
  { key: "frustracao", pattern: /\b(pessimo|p[eé]ssimo|horrivel|horr[ií]vel|ruim|frustrad\w*|irritad\w*|estress\w*)\w*/i },
  { key: "dia_pesado", pattern: /\b(dia (?:foi|est[aá]|t[aá]) (?:pesad\w*|ruim|puxad\w*|dif[ií]cil))\w*/i },
  { key: "agradecimento", pattern: /\b(valeu|obrigad\w*|tmj|brigad\w*|deu certo)\w*/i },
  { key: "entusiasmo", pattern: /\b(feliz|animad\w*|finalmente|consegui|deu tudo certo|deu certo)\w*/i },
]);

const COMMERCIAL_BODY_START_PATTERN =
  /^(?:eu iria no|minha escolha|recomendo|entre (?:o|a)|para (?:escolher|comparar|essa|esse)|sobre (?:o|a) )/i;

const COMMERCIAL_CONTINUATION_PATTERN =
  /\b(vale mais a pena|qual [eé] melhor|s[oó] me diz|compara|compare|melhor op[cç][ãa]o|qual deles|qual desses|entre os dois|entre esses)\b/i;

const COMPARISON_BODY_PATTERN =
  /\b(minha escolha|comparando|entre (?:o|a|os|as)|o que voc[eê] ganha|tradeoff|abre m[aã]o)\b/i;

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenCount(value = "") {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function sentenceCount(value = "") {
  const body = String(value || "").trim();
  if (!body) return 0;
  return body.split(/[.!?]+/).filter((part) => part.trim().length > 3).length;
}

function detectTopicAnchors(message = "") {
  const text = String(message || "");
  return TOPIC_ANCHOR_GROUPS.filter((group) => group.pattern.test(text)).map(
    (group) => group.key
  );
}

function hasDirectnessSignal(message = "", contract = {}) {
  const source =
    message ||
    contract.resolvedQuery ||
    contract.rawUserMessage ||
    "";
  return DIRECTNESS_PATTERN.test(normalizeText(source));
}

function resolveHumanIntensity(recognition = {}, contract = {}) {
  const emotional = recognition.emotionalRelevance ?? contract.emotionalRelevance ?? 0;
  const anchors = detectTopicAnchors(
    contract.resolvedQuery || contract.rawUserMessage || ""
  );
  if (anchors.includes("entusiasmo") || anchors.includes("agradecimento")) return "light";
  if (emotional >= 0.65 || anchors.includes("frustracao") || anchors.includes("dia_pesado")) {
    return "moderate";
  }
  if (emotional >= 0.35 || anchors.includes("cansaco") || anchors.includes("desanimo")) {
    return "light";
  }
  return "none";
}

function resolveHumanAcknowledgementRequired(contract = {}, recognition = {}) {
  if (contract.interactionMode !== MIA_INTERACTION_MODES.MIXED) return false;
  const anchors = detectTopicAnchors(
    contract.resolvedQuery || contract.rawUserMessage || recognition.resolvedQuery || ""
  );
  if (anchors.length > 0) return true;
  if (contract.humanObjective && contract.humanObjective !== MIA_HUMAN_OBJECTIVES.PURCHASE_HELP) {
    return true;
  }
  return (recognition.emotionalRelevance ?? 0) >= 0.25;
}

function resolveHumanAcknowledgementDepth(contract = {}, recognition = {}, message = "") {
  if (!resolveHumanAcknowledgementRequired(contract, recognition)) {
    return HUMAN_ACKNOWLEDGEMENT_DEPTH.OMIT;
  }
  if (hasDirectnessSignal(message, contract)) {
    return HUMAN_ACKNOWLEDGEMENT_DEPTH.MINIMAL;
  }
  const anchors = detectTopicAnchors(message || contract.resolvedQuery || "");
  if (anchors.includes("agradecimento") && anchors.length === 1) {
    return HUMAN_ACKNOWLEDGEMENT_DEPTH.MINIMAL;
  }
  const intensity = resolveHumanIntensity(recognition, contract);
  if (intensity === "moderate") return HUMAN_ACKNOWLEDGEMENT_DEPTH.BRIEF;
  return HUMAN_ACKNOWLEDGEMENT_DEPTH.MINIMAL;
}

function resolveResponseOrdering(contract = {}, options = {}) {
  if (hasDirectnessSignal(options.message, contract)) {
    return RESPONSE_ORDERING.COMMERCIAL_DIRECT_WITH_HUMAN_NOTE;
  }
  if (options.clarificationRequired || contract.requiresClarification) {
    return RESPONSE_ORDERING.CLARIFICATION_AFTER_HUMAN;
  }
  const anchors = detectTopicAnchors(options.message || contract.resolvedQuery || "");
  if (
    anchors.includes("entusiasmo") &&
    contract.commercialObjective &&
    /compar/i.test(String(contract.commercialObjective))
  ) {
    return RESPONSE_ORDERING.HUMAN_THEN_COMMERCIAL;
  }
  return RESPONSE_ORDERING.HUMAN_THEN_COMMERCIAL;
}

function resolveTransitionProfile(ordering = "", options = {}) {
  if (options.clarificationRequired || ordering === RESPONSE_ORDERING.CLARIFICATION_AFTER_HUMAN) {
    return TRANSITION_PROFILE.CLARIFICATION_BRIDGE;
  }
  if (ordering === RESPONSE_ORDERING.COMMERCIAL_DIRECT_WITH_HUMAN_NOTE) {
    return TRANSITION_PROFILE.DIRECT;
  }
  if (ordering === RESPONSE_ORDERING.COMMERCIAL_THEN_POSITIVE_ACK) {
    return TRANSITION_PROFILE.NO_EXPLICIT_BRIDGE;
  }
  return TRANSITION_PROFILE.SEAMLESS;
}

function resolveCommercialAnswerDepth(options = {}) {
  if (options.clarificationRequired) return "clarification";
  if (options.comparisonActive) return "comparison_full";
  if (options.hasWinner) return "recommendation_full";
  return "standard";
}

function resolveMaxHumanUnits(depth = "") {
  if (depth === HUMAN_ACKNOWLEDGEMENT_DEPTH.BRIEF) return 2;
  if (depth === HUMAN_ACKNOWLEDGEMENT_DEPTH.MINIMAL) return 1;
  return 0;
}

export function resolveHumanPolarity(message = "", anchors = []) {
  const list = anchors.length ? anchors : detectTopicAnchors(message);
  if (list.includes("entusiasmo")) return HUMAN_POLARITY.POSITIVE;
  if (
    list.includes("frustracao") ||
    list.includes("desanimo") ||
    list.includes("cansaco") ||
    list.includes("dia_pesado")
  ) {
    return HUMAN_POLARITY.NEGATIVE;
  }
  if (list.includes("agradecimento")) return HUMAN_POLARITY.NEUTRAL;
  return HUMAN_POLARITY.NEUTRAL;
}

export function resolveMixedContinuationEligibility({
  interactionMode = "",
  message = "",
  sessionContext = null,
  mixedSegmentationApplied = false,
} = {}) {
  if (interactionMode === MIA_INTERACTION_MODES.MIXED || mixedSegmentationApplied) {
    return true;
  }
  const hasAnchor = !!sessionContext?.lastBestProduct?.product_name;
  const normalized = normalizeText(message);
  const hasCommercialAsk = COMMERCIAL_CONTINUATION_PATTERN.test(normalized);
  const hasHumanSignal =
    detectTopicAnchors(message).length > 0 ||
    /\b(cansad\w*|feliz|pesad\w*|puxad\w*|desanim\w*|finalmente)\w*/i.test(message);
  return hasAnchor && hasCommercialAsk && hasHumanSignal;
}

function resolveCompletionRequirements(mv = {}, options = {}) {
  const humanRequired =
    !!mv.humanAcknowledgementRequired &&
    !options.humanAcknowledgementAlreadySatisfied &&
    !(options.humanAcknowledgementResidualRequired === false);
  const commercialRequired = !!mv.commercialAnswerRequired;
  return {
    humanCompletionRequired: humanRequired,
    commercialCompletionRequired: commercialRequired,
    dualDimensionCompletionRequired: humanRequired && commercialRequired,
    humanCompletionMinimum: mv.humanAcknowledgementDepth || HUMAN_ACKNOWLEDGEMENT_DEPTH.MINIMAL,
    commercialCompletionMinimum:
      mv.commercialAnswerDepth === "clarification"
        ? COMMERCIAL_COMPLETION_MINIMUM.CLARIFICATION
        : mv.commercialAnswerDepth === "comparison_full"
          ? COMMERCIAL_COMPLETION_MINIMUM.COMPARISON
          : mv.commercialAnswerDepth === "recommendation_full"
            ? COMMERCIAL_COMPLETION_MINIMUM.RECOMMENDATION
            : COMMERCIAL_COMPLETION_MINIMUM.STANDARD,
    humanAcknowledgementAlreadySatisfied: !!options.humanAcknowledgementAlreadySatisfied,
    humanAcknowledgementResidualRequired:
      options.humanAcknowledgementResidualRequired ??
      (humanRequired && !options.humanAcknowledgementAlreadySatisfied),
    commercialContinuationRequired: !!options.commercialContinuationRequired,
  };
}

export function buildHumanSnapshot(contract = {}, message = "") {
  const mv = contract.mixedVerbalization || {};
  const anchors = mv.humanTopicAnchors || detectTopicAnchors(message || contract.rawUserMessage || "");
  return {
    humanObjective: mv.humanObjective || contract.humanObjective || null,
    humanPolarity: mv.humanPolarity || resolveHumanPolarity(message, anchors),
    humanIntensity: mv.humanIntensity || "none",
    humanContentAnchors: anchors,
    humanAcknowledgementDepth: mv.humanAcknowledgementDepth || HUMAN_ACKNOWLEDGEMENT_DEPTH.OMIT,
    humanAcknowledgementRequired: !!mv.humanAcknowledgementRequired,
  };
}

export function buildCommercialSnapshot({
  commercialObjective = "",
  commercialSearchQuery = "",
  winnerName = "",
  winnerProduct = null,
  runnerUp = null,
  commercialBody = "",
  structuredReply = "",
  clarificationQuestion = "",
  comparisonBody = "",
  responsePath = "",
  comparisonAxis = "",
  prices = [],
} = {}) {
  return {
    commercialObjective,
    commercialSearchQuery,
    winnerName: winnerName || winnerProduct?.product_name || "",
    winnerProduct,
    runnerUp,
    commercialBody: commercialBody || structuredReply || comparisonBody || "",
    structuredReply,
    clarificationQuestion,
    comparisonBody,
    responsePath,
    comparisonAxis,
    pricesCount: Array.isArray(prices) ? prices.length : 0,
  };
}

export function buildMixedResponseContext(
  contract = {},
  {
    message = "",
    sessionContext = null,
    commercialSnapshot = null,
    humanSnapshot = null,
    responsePath = "",
    mixedSegmentationApplied = false,
    clarificationRequired = false,
    comparisonActive = false,
  } = {}
) {
  const eligible =
    contract?.interactionMode === MIA_INTERACTION_MODES.MIXED ||
    resolveMixedContinuationEligibility({
      interactionMode: contract?.interactionMode,
      message,
      sessionContext,
      mixedSegmentationApplied,
    });

  if (!eligible || !contract) {
    return null;
  }

  const sessionMixed = sessionContext?.mixedConversationalState || {};
  const commercialContinuationRequired =
    !!sessionContext?.lastBestProduct?.product_name &&
    COMMERCIAL_CONTINUATION_PATTERN.test(normalizeText(message));

  let workingContract = contract;
  if (contract.interactionMode !== MIA_INTERACTION_MODES.MIXED) {
    workingContract = enrichContractWithMixedVerbalization(
      {
        ...contract,
        interactionMode: MIA_INTERACTION_MODES.MIXED,
        commercialObjective: contract.commercialObjective || "purchase_help",
        commercialSearchQuery:
          contract.commercialSearchQuery ||
          sessionContext?.lastQuery ||
          message,
      },
      {
        message,
        clarificationRequired,
        comparisonActive,
        hasWinner: !!commercialSnapshot?.winnerName || !!sessionContext?.lastBestProduct,
        commercialContinuationRequired,
        humanAcknowledgementAlreadySatisfied: !!sessionMixed.humanAcknowledgementSatisfied,
      }
    );
  }

  const mv = workingContract.mixedVerbalization || {};
  const completionRequirements = resolveCompletionRequirements(mv, {
    humanAcknowledgementAlreadySatisfied: !!sessionMixed.humanAcknowledgementSatisfied,
    humanAcknowledgementResidualRequired:
      !sessionMixed.humanAcknowledgementSatisfied && mv.humanAcknowledgementRequired,
    commercialContinuationRequired,
  });

  const snapshot =
    commercialSnapshot ||
    buildCommercialSnapshot({
      commercialObjective: mv.commercialObjective,
      commercialSearchQuery: mv.commercialSearchQuery,
      winnerName: sessionContext?.lastBestProduct?.product_name || "",
      winnerProduct: sessionContext?.lastBestProduct || null,
      responsePath,
    });

  return {
    contract: workingContract,
    humanSnapshot: humanSnapshot || buildHumanSnapshot(workingContract, message),
    commercialSnapshot: snapshot,
    completionRequirements,
    responsePath,
    rawUserMessage: message || workingContract.rawUserMessage || "",
  };
}

export function ensureMixedContractCoverage(mixedResponseContext = {}, responsePath = "") {
  const issues = [];
  if (!mixedResponseContext?.contract) {
    issues.push("mixedContractMissingAtFinalize");
  }
  if (!mixedResponseContext?.completionRequirements) {
    issues.push("completionRequirementsMissing");
  }
  if (!mixedResponseContext?.commercialSnapshot && mixedResponseContext?.completionRequirements?.commercialCompletionRequired) {
    issues.push("fallbackSnapshotMissing");
  }
  return {
    covered: issues.length === 0,
    issues,
    responsePath,
    mixedContractPresent: !!mixedResponseContext?.contract,
  };
}

function buildHumanAckGuidance(contract = {}, anchors = []) {
  if (!contract.humanAcknowledgementRequired) return "";
  const depth = contract.humanAcknowledgementDepth;
  const anchorHint =
    anchors.length > 0
      ? `Referencie brevemente: ${anchors.join(", ")}.`
      : "Referencie brevemente o conteúdo humano real da mensagem.";
  if (depth === HUMAN_ACKNOWLEDGEMENT_DEPTH.MINIMAL) {
    return `${anchorHint} Máximo 1 frase curta; sem repetir a mensagem inteira.`;
  }
  if (depth === HUMAN_ACKNOWLEDGEMENT_DEPTH.BRIEF) {
    return `${anchorHint} Até 2 frases curtas; sem acolhimento longo ou terapêutico.`;
  }
  return "";
}

/**
 * Enrich behavior contract with mixed verbalization decisions.
 */
export function enrichContractWithMixedVerbalization(
  contract = {},
  {
    recognition = null,
    message = "",
    clarificationRequired = false,
    comparisonActive = false,
    hasWinner = false,
    commercialContinuationRequired = false,
    humanAcknowledgementAlreadySatisfied = false,
  } = {}
) {
  if (contract.interactionMode !== MIA_INTERACTION_MODES.MIXED) {
    return contract;
  }

  const rec = recognition || {};
  const anchors = detectTopicAnchors(message || contract.resolvedQuery || rec.resolvedQuery || "");
  const humanPolarity = resolveHumanPolarity(message, anchors);
  const humanAcknowledgementRequired =
    resolveHumanAcknowledgementRequired(contract, rec) &&
    !humanAcknowledgementAlreadySatisfied;
  const humanAcknowledgementDepth = humanAcknowledgementRequired
    ? resolveHumanAcknowledgementDepth(contract, rec, message)
    : HUMAN_ACKNOWLEDGEMENT_DEPTH.OMIT;
  const responseOrdering = resolveResponseOrdering(contract, {
    message,
    clarificationRequired,
  });
  const transitionProfile = resolveTransitionProfile(responseOrdering, {
    clarificationRequired,
  });
  const humanIntensity = resolveHumanIntensity(rec, contract);
  const commercialAnswerDepth = resolveCommercialAnswerDepth({
    clarificationRequired,
    comparisonActive: comparisonActive || commercialContinuationRequired,
    hasWinner,
  });

  const completionRequirements = resolveCompletionRequirements(
    {
      humanAcknowledgementRequired,
      humanAcknowledgementDepth,
      commercialAnswerRequired: true,
      commercialAnswerDepth,
    },
    {
      humanAcknowledgementAlreadySatisfied,
      commercialContinuationRequired,
    }
  );

  const mixedVerbalization = {
    version: MIXED_VERBALIZATION_VERSION,
    humanObjective: contract.humanObjective || rec.humanObjective || null,
    humanIntensity,
    humanPolarity,
    humanTopicAnchors: anchors,
    humanAcknowledgementRequired,
    humanAcknowledgementDepth,
    humanAckGuidance: buildHumanAckGuidance(
      { humanAcknowledgementRequired, humanAcknowledgementDepth },
      anchors
    ),
    commercialObjective: contract.commercialObjective || rec.commercialObjective || null,
    commercialSearchQuery: contract.commercialSearchQuery || rec.commercialSearchQuery || null,
    commercialAnswerRequired: true,
    commercialAnswerDepth,
    responseOrdering,
    transitionProfile,
    mixedBalance: {
      humanWeight: humanAcknowledgementDepth === HUMAN_ACKNOWLEDGEMENT_DEPTH.BRIEF ? "low" : "minimal",
      commercialWeight: "primary",
      maxHumanUnits: resolveMaxHumanUnits(humanAcknowledgementDepth),
      commercialCompletenessRequired: true,
    },
    followUpPolicy: contract.followUpPolicy || null,
    antiConsumption: true,
    clarificationRequired: !!clarificationRequired,
    commercialQuestionAuthorized: !!clarificationRequired,
    commercialContinuationRequired: !!commercialContinuationRequired,
    humanAcknowledgementAlreadySatisfied: !!humanAcknowledgementAlreadySatisfied,
    ...completionRequirements,
    forbiddenBehaviors: [
      "emotional_consumption_suggestion",
      "mechanical_transition",
      "split_response",
      "over_acknowledgement",
      "unauthorized_social_question",
      "commercial_query_rewrite",
    ],
  };

  return {
    ...contract,
    mixedVerbalizationVersion: MIXED_VERBALIZATION_VERSION,
    mixedVerbalization,
    rawUserMessage: message || contract.resolvedQuery || rec.resolvedQuery || null,
  };
}

export function mixedVerbalizationToInstructions(contract = {}) {
  const mv = contract.mixedVerbalization;
  if (!mv) return "";

  const lines = [
    "Verbalização mista governada (obrigatório):",
    `- Ordem da resposta: ${mv.responseOrdering}`,
    `- Transição: ${mv.transitionProfile}`,
    `- Reconhecimento humano: ${mv.humanAcknowledgementRequired ? mv.humanAcknowledgementDepth : "omitido"}`,
    `- Objetivo humano: ${mv.humanObjective || "n/a"}`,
    `- Objetivo comercial: ${mv.commercialObjective || "n/a"}`,
    `- Query comercial (não alterar): ${mv.commercialSearchQuery || "n/a"}`,
    `- Profundidade comercial: ${mv.commercialAnswerDepth}`,
    `- Anti-consumo emocional: ${mv.antiConsumption ? "ativo" : "n/a"}`,
    `- Pergunta comercial: ${mv.commercialQuestionAuthorized ? "autorizada se necessária" : "somente se o pipeline exigir"}`,
  ];

  if (mv.humanAckGuidance) {
    lines.push(`- ${mv.humanAckGuidance}`);
  }

  if (mv.responseOrdering === RESPONSE_ORDERING.HUMAN_THEN_COMMERCIAL) {
    lines.push("- Estrutura: reconhecimento humano proporcional → atendimento comercial completo na mesma resposta.");
  }

  if (mv.responseOrdering === RESPONSE_ORDERING.COMMERCIAL_DIRECT_WITH_HUMAN_NOTE) {
    lines.push("- Usuário pediu objetividade: resposta comercial direta com reconhecimento mínimo integrado.");
  }

  if (mv.transitionProfile === TRANSITION_PROFILE.SEAMLESS) {
    lines.push("- Transição seamless: não use frase de ponte explícita entre humano e comercial.");
  }

  if (mv.transitionProfile === TRANSITION_PROFILE.DIRECT) {
    lines.push("- Transição direct: vá ao ponto comercial; reconhecimento humano ultra-breve se couber.");
  }

  if (mv.transitionProfile === TRANSITION_PROFILE.CLARIFICATION_BRIDGE) {
    lines.push("- Transição clarification_bridge: reconhecimento breve → pergunta comercial necessária.");
  }

  lines.push("- Preserve winner, reasoning, tradeoffs e comparação exatamente como decididos.");
  lines.push("- Não associe produto ou compra a alívio emocional.");
  lines.push("- Não use transições institucionais ('mas vamos às compras', 'agora falando do produto').");
  lines.push("- Resposta deve parecer uma única unidade discursiva, não dois blocos colados.");
  if (mv.humanCompletionRequired) {
    lines.push(`- Conclusão humana obrigatória (${mv.humanCompletionMinimum}).`);
  }
  if (mv.commercialCompletionRequired) {
    lines.push(`- Conclusão comercial obrigatória (${mv.commercialCompletionMinimum}).`);
  }
  if (mv.dualDimensionCompletionRequired) {
    lines.push("- Ambas as dimensões devem aparecer na resposta final.");
  }

  return lines.join("\n");
}

export function splitMixedReplySections(reply = "", { winnerName = "" } = {}) {
  const text = String(reply || "").trim();
  if (!text) {
    return { humanPrefix: "", commercialBody: "", splitIndex: -1 };
  }

  const paragraphs = text.split(/\n\n+/).map((part) => part.trim()).filter(Boolean);
  const winnerToken = cleanWinnerToken(winnerName);

  for (let index = 0; index < paragraphs.length; index += 1) {
    const paragraph = paragraphs[index];
    const normalized = normalizeText(paragraph);
    const looksCommercial =
      COMMERCIAL_BODY_START_PATTERN.test(normalized) ||
      /o que voc[eê] ganha/i.test(paragraph) ||
      /o que voc[eê] abre m[aã]o/i.test(paragraph) ||
      (winnerToken && normalized.includes(winnerToken));

    if (looksCommercial) {
      return {
        humanPrefix: paragraphs.slice(0, index).join("\n\n").trim(),
        commercialBody: paragraphs.slice(index).join("\n\n").trim(),
        splitIndex: index,
      };
    }
  }

  if (hasFirstAnswerStructure(text) || (winnerToken && normalizeText(text).includes(winnerToken))) {
    const firstSentenceEnd = text.search(/(?<=[.!?])\s+/);
    if (firstSentenceEnd > 0 && firstSentenceEnd < text.length * 0.35) {
      const maybeHuman = text.slice(0, firstSentenceEnd).trim();
      const maybeCommercial = text.slice(firstSentenceEnd).trim();
      if (
        maybeCommercial &&
        (hasFirstAnswerStructure(maybeCommercial) ||
          COMMERCIAL_BODY_START_PATTERN.test(normalizeText(maybeCommercial)))
      ) {
        return {
          humanPrefix: maybeHuman,
          commercialBody: maybeCommercial,
          splitIndex: 0,
        };
      }
    }
    return { humanPrefix: "", commercialBody: text, splitIndex: 0 };
  }

  return { humanPrefix: text, commercialBody: "", splitIndex: -1 };
}

function cleanWinnerToken(winnerName = "") {
  return normalizeText(String(winnerName || "").split(/\s+/)[0] || "");
}

export function mergeMixedReplySections(humanPrefix = "", commercialBody = "", contract = {}) {
  const human = String(humanPrefix || "").trim();
  const commercial = String(commercialBody || "").trim();
  if (!human) return commercial;
  if (!commercial) return human;

  const ordering = contract.mixedVerbalization?.responseOrdering || contract.responseOrdering;
  if (ordering === RESPONSE_ORDERING.COMMERCIAL_DIRECT_WITH_HUMAN_NOTE) {
    return `${commercial}\n\n${human}`.trim();
  }

  const transition = contract.mixedVerbalization?.transitionProfile || contract.transitionProfile;
  if (transition === TRANSITION_PROFILE.SEAMLESS || transition === TRANSITION_PROFILE.NO_EXPLICIT_BRIDGE) {
    return `${human}\n\n${commercial}`.trim();
  }

  return `${human}\n\n${commercial}`.trim();
}

function humanAcknowledgementPresent(humanPrefix = "", contract = {}, message = "") {
  const text = String(humanPrefix || "").trim();
  if (!text) return false;

  const depth =
    contract.mixedVerbalization?.humanAcknowledgementDepth || contract.humanAcknowledgementDepth;
  if (
    depth === HUMAN_ACKNOWLEDGEMENT_DEPTH.MINIMAL ||
    depth === HUMAN_ACKNOWLEDGEMENT_DEPTH.BRIEF
  ) {
    return sentenceCount(text) >= 1 && tokenCount(text) >= 1 && !MECHANICAL_TRANSITION_PATTERN.test(text);
  }

  const anchors = contract.mixedVerbalization?.humanTopicAnchors || detectTopicAnchors(message);
  if (anchors.length === 0) return tokenCount(text) >= 3;

  return (
    anchors.some((key) => {
      const group = TOPIC_ANCHOR_GROUPS.find((entry) => entry.key === key);
      return group ? group.pattern.test(text) : false;
    }) || tokenCount(text) >= 4
  );
}

function isGenericHumanAcknowledgement(humanPrefix = "") {
  const text = String(humanPrefix || "").trim();
  if (!text) return false;
  return GENERIC_HUMAN_ACK_PATTERN.test(text) && tokenCount(text) <= 6;
}

function detectSplitResponseViolation(reply = "", contract = {}) {
  const text = String(reply || "");
  if (!text) return false;

  const paragraphs = text.split(/\n\n+/).filter(Boolean);
  if (paragraphs.length >= 3) {
    const middle = paragraphs.slice(1, -1).join(" ");
    if (INSTITUTIONAL_COMMERCIAL_HEADER_PATTERN.test(middle)) return true;
  }

  if (MECHANICAL_TRANSITION_PATTERN.test(text)) return true;

  const closings = (text.match(/[.!?](?:\s|$)/g) || []).length;
  const hasSocialOpening = GENERIC_HUMAN_ACK_PATTERN.test(paragraphs[0] || "");
  const hasInstitutionalBridge = paragraphs.some((part, index) =>
    index > 0 && INSTITUTIONAL_COMMERCIAL_HEADER_PATTERN.test(part)
  );
  return hasSocialOpening && hasInstitutionalBridge && closings >= 3;
}

export function validateMixedConversationResponse(
  reply = "",
  contract = {},
  {
    winnerName = "",
    clarificationRequired = false,
    commercialReplySnapshot = "",
    strict = false,
  } = {}
) {
  const text = String(reply || "").trim();
  const mv = contract.mixedVerbalization || contract;
  const violations = [];

  if (contract.interactionMode !== MIA_INTERACTION_MODES.MIXED && !mv.version) {
    return { valid: true, violations: [], audit: { skipped: true } };
  }

  const { humanPrefix, commercialBody } = splitMixedReplySections(text, { winnerName });
  const message = contract.rawUserMessage || contract.resolvedQuery || "";

  if (mv.humanAcknowledgementRequired) {
    if (!humanAcknowledgementPresent(humanPrefix, contract, message)) {
      violations.push("missingHumanAcknowledgement");
    }
    if (isGenericHumanAcknowledgement(humanPrefix) && mv.humanAcknowledgementDepth !== HUMAN_ACKNOWLEDGEMENT_DEPTH.MINIMAL) {
      violations.push("genericHumanAcknowledgement");
    }
    const maxUnits = mv.mixedBalance?.maxHumanUnits ?? resolveMaxHumanUnits(mv.humanAcknowledgementDepth);
    if (sentenceCount(humanPrefix) > maxUnits + 1) {
      violations.push("overAcknowledgement");
    }
    if (tokenCount(humanPrefix) > (mv.humanAcknowledgementDepth === HUMAN_ACKNOWLEDGEMENT_DEPTH.BRIEF ? 35 : 18)) {
      violations.push("overAcknowledgement");
    }
  }

  if (mv.commercialAnswerRequired) {
    const commercialText = commercialBody || text;
    if (clarificationRequired) {
      if (!/\?\s*$/.test(commercialText.trim()) && !/\?\s/.test(commercialText)) {
        violations.push("missingCommercialClarification");
      }
    } else if (winnerName) {
      const winnerToken = cleanWinnerToken(winnerName);
      if (!normalizeText(commercialText).includes(winnerToken)) {
        violations.push("winnerMissing");
      }
      if (
        mv.commercialAnswerDepth === "recommendation_full" &&
        !hasFirstAnswerStructure(commercialText) &&
        !matchesStrictFirstAnswerContract(commercialText, winnerName) &&
        tokenCount(commercialText) < 40
      ) {
        violations.push("commercialAnswerTooShallow");
      }
    } else if (tokenCount(commercialText) < 12 && !clarificationRequired) {
      violations.push("missingCommercialAnswer");
    }
  }

  if (MECHANICAL_TRANSITION_PATTERN.test(text)) {
    violations.push("mechanicalTransition");
  }

  if (detectSplitResponseViolation(text, contract)) {
    violations.push("splitResponseViolation");
  }

  if (mv.antiConsumption && ANTI_CONSUMPTION_MIXED_PATTERN.test(normalizeText(text))) {
    violations.push("antiConsumptionViolation");
  }

  if (!mv.commercialQuestionAuthorized && UNAUTHORIZED_SOCIAL_QUESTION_PATTERN.test(normalizeText(text))) {
    violations.push("unauthorizedQuestion");
  }

  if (
    mv.responseOrdering === RESPONSE_ORDERING.HUMAN_THEN_COMMERCIAL &&
    commercialBody &&
    humanPrefix &&
    normalizeText(commercialBody).startsWith(normalizeText(humanPrefix))
  ) {
    violations.push("duplicateRecommendation");
  }

  if (commercialReplySnapshot && winnerName) {
    const snapshotToken = cleanWinnerToken(winnerName);
    if (snapshotToken && !normalizeText(text).includes(snapshotToken)) {
      violations.push("commercialAnswerNotPreserved");
    }
  }

  const valid = violations.length === 0;
  return {
    valid: strict ? valid : valid,
    violations: [...new Set(violations)],
    audit: {
      humanPrefix,
      commercialBody,
      humanAcknowledgementPresent: humanAcknowledgementPresent(humanPrefix, contract, message),
      responseOrdering: mv.responseOrdering,
      transitionProfile: mv.transitionProfile,
      humanAcknowledgementDepth: mv.humanAcknowledgementDepth,
    },
  };
}

export function stripMixedViolations(reply = "", contract = {}, violations = []) {
  let text = String(reply || "").trim();
  if (!text || !Array.isArray(violations) || !violations.length) return text;

  if (violations.includes("mechanicalTransition") || violations.includes("splitResponseViolation")) {
    text = text
      .replace(MECHANICAL_TRANSITION_PATTERN, " ")
      .replace(INSTITUTIONAL_COMMERCIAL_HEADER_PATTERN, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  if (violations.includes("antiConsumptionViolation")) {
    text = text.replace(ANTI_CONSUMPTION_MIXED_PATTERN, " ").replace(/\s+/g, " ").trim();
  }

  return text;
}

function buildStructuralHumanFallbackLine(contract = {}, humanSnapshot = null) {
  const mv = contract.mixedVerbalization || contract;
  const snapshot = humanSnapshot || {};
  if (!mv.humanAcknowledgementRequired && !snapshot.humanAcknowledgementRequired) return "";
  if (mv.humanAcknowledgementDepth === HUMAN_ACKNOWLEDGEMENT_DEPTH.OMIT) return "";

  const polarity = snapshot.humanPolarity || mv.humanPolarity || HUMAN_POLARITY.NEUTRAL;
  const anchors = snapshot.humanContentAnchors || mv.humanTopicAnchors || [];

  if (polarity === HUMAN_POLARITY.POSITIVE || anchors.includes("entusiasmo")) {
    return "Que bom.";
  }
  if (anchors.includes("agradecimento")) return "Imagina.";
  if (anchors.includes("cansaco") || anchors.includes("dia_pesado")) return "Entendo.";
  if (anchors.includes("frustracao") || anchors.includes("desanimo")) return "Puxado.";
  if (mv.humanAcknowledgementDepth === HUMAN_ACKNOWLEDGEMENT_DEPTH.MINIMAL) return "Entendo.";
  return "Entendo.";
}

function buildCommercialBodyFromSnapshot(snapshot = {}) {
  if (snapshot.commercialBody) return String(snapshot.commercialBody).trim();
  if (snapshot.structuredReply) return String(snapshot.structuredReply).trim();
  if (snapshot.comparisonBody) return String(snapshot.comparisonBody).trim();
  if (snapshot.clarificationQuestion) return String(snapshot.clarificationQuestion).trim();
  if (snapshot.winnerName) {
    return `Eu iria no ${snapshot.winnerName} com base no que encontrei para essa busca.`;
  }
  return "";
}

function detectCommercialCompletion(text = "", snapshot = {}, requirements = {}) {
  const body = String(text || "").trim();
  const { commercialBody } = splitMixedReplySections(body, {
    winnerName: snapshot.winnerName || "",
  });
  const commercialText = commercialBody || body;

  if (requirements.commercialCompletionMinimum === COMMERCIAL_COMPLETION_MINIMUM.CLARIFICATION) {
    return /\?\s/.test(commercialText) || /\?\s*$/.test(commercialText.trim());
  }

  if (requirements.commercialCompletionMinimum === COMMERCIAL_COMPLETION_MINIMUM.COMPARISON) {
    return (
      COMPARISON_BODY_PATTERN.test(commercialText) ||
      (!!snapshot.winnerName && normalizeText(commercialText).includes(cleanWinnerToken(snapshot.winnerName)))
    );
  }

  if (snapshot.winnerName) {
    return normalizeText(commercialText).includes(cleanWinnerToken(snapshot.winnerName)) ||
      hasFirstAnswerStructure(commercialText) ||
      tokenCount(commercialText) >= 24;
  }

  return tokenCount(commercialText) >= 12;
}

function detectHumanCompletion(text = "", contract = {}, humanSnapshot = {}, message = "") {
  const { humanPrefix } = splitMixedReplySections(text, {
    winnerName: contract.mixedVerbalization?.commercialSnapshot?.winnerName || "",
  });
  if (humanAcknowledgementPresent(humanPrefix, contract, message || humanSnapshot?.rawMessage || "")) {
    return true;
  }

  const ordering = contract.mixedVerbalization?.responseOrdering;
  if (ordering === RESPONSE_ORDERING.COMMERCIAL_DIRECT_WITH_HUMAN_NOTE) {
    const paragraphs = String(text || "")
      .split(/\n\n+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const trailing = paragraphs[paragraphs.length - 1] || "";
    if (
      paragraphs.length > 1 &&
      humanAcknowledgementPresent(trailing, contract, message || humanSnapshot?.rawMessage || "")
    ) {
      return true;
    }
  }

  return false;
}

function detectDuplicateCommercialOpening(text = "") {
  const matches = String(text || "").match(/\beu iria no\b/gi) || [];
  return matches.length > 1;
}

function stripDuplicateCommercialOpening(text = "") {
  const body = String(text || "").trim();
  if (!detectDuplicateCommercialOpening(body)) return body;
  const parts = body.split(/\n\n+/);
  let seenCommercial = false;
  const kept = [];
  for (const part of parts) {
    const isCommercial =
      COMMERCIAL_BODY_START_PATTERN.test(normalizeText(part)) ||
      /o que voc[eê] ganha/i.test(part);
    if (isCommercial && seenCommercial) continue;
    if (isCommercial) seenCommercial = true;
    kept.push(part);
  }
  return kept.join("\n\n").trim();
}

export function validateMixedDualDimensionCompletion(
  reply = "",
  mixedResponseContext = {},
  options = {}
) {
  const contract = mixedResponseContext?.contract || {};
  const mv = contract.mixedVerbalization || {};
  const requirements =
    mixedResponseContext?.completionRequirements ||
    resolveCompletionRequirements(mv, options);
  const snapshot = mixedResponseContext?.commercialSnapshot || {};
  const humanSnapshot = mixedResponseContext?.humanSnapshot || {};
  const message = mixedResponseContext?.rawUserMessage || contract.rawUserMessage || "";
  const text = stripDuplicateCommercialOpening(String(reply || "").trim());
  const violations = [];

  if (!mixedResponseContext?.contract) {
    violations.push("mixedContractMissingAtFinalize");
    return { valid: false, violations, audit: { dualCompletionPassed: false } };
  }

  const humanDetected = detectHumanCompletion(text, contract, humanSnapshot, message);
  const commercialDetected = detectCommercialCompletion(text, snapshot, requirements);

  if (requirements.humanCompletionRequired && !humanDetected) {
    violations.push("humanRequiredButMissing");
  }
  if (requirements.commercialCompletionRequired && !commercialDetected) {
    violations.push("commercialRequiredButMissing");
  }
  if (humanDetected && !commercialDetected && requirements.commercialCompletionRequired) {
    violations.push("humanPresentButCommercialEmpty");
  }
  if (commercialDetected && !humanDetected && requirements.humanCompletionRequired) {
    violations.push("commercialPresentButHumanMissing");
  }

  const polarity = humanSnapshot.humanPolarity || mv.humanPolarity;
  if (
    requirements.humanCompletionRequired &&
    polarity === HUMAN_POLARITY.POSITIVE &&
    humanDetected &&
    /\b(puxado|sinto muito|que pena)\b/i.test(normalizeText(text.split(/\n\n+/)[0] || ""))
  ) {
    violations.push("humanPolarityMismatch");
  }
  if (
    requirements.humanCompletionRequired &&
    polarity === HUMAN_POLARITY.NEGATIVE &&
    !humanDetected &&
    commercialDetected
  ) {
    violations.push("negativeHumanDimensionIgnored");
  }
  if (
    requirements.humanCompletionRequired &&
    polarity === HUMAN_POLARITY.POSITIVE &&
    !humanDetected &&
    commercialDetected
  ) {
    violations.push("positiveHumanDimensionIgnored");
  }
  if (requirements.commercialCompletionRequired && !snapshot.winnerName && !snapshot.clarificationQuestion && !snapshot.commercialBody && !snapshot.structuredReply) {
    violations.push("fallbackSnapshotMissing");
  }
  if (detectDuplicateCommercialOpening(text)) {
    violations.push("duplicateCommercialOpeningViolation");
  }

  const perception = validateMixedConversationResponse(text, contract, {
    winnerName: snapshot.winnerName || options.winnerName || "",
    clarificationRequired: !!mv.clarificationRequired || options.clarificationRequired,
    commercialReplySnapshot: snapshot.commercialBody || options.commercialReplySnapshot || "",
  });
  for (const violation of perception.violations || []) {
    if (
      violation === "missingHumanAcknowledgement" &&
      violations.includes("humanRequiredButMissing")
    ) {
      continue;
    }
    if (
      violation === "missingCommercialAnswer" &&
      violations.includes("commercialRequiredButMissing")
    ) {
      continue;
    }
    if (
      [
        "antiConsumptionViolation",
        "mechanicalTransition",
        "splitResponseViolation",
        "duplicateCommercialOpeningViolation",
        "duplicateRecommendation",
      ].includes(violation)
    ) {
      violations.push(violation);
    }
  }

  const dualCompletionPassed =
    (!requirements.humanCompletionRequired || humanDetected) &&
    (!requirements.commercialCompletionRequired || commercialDetected);

  const uniqueViolations = [...new Set(violations)];
  const criticalViolations = uniqueViolations.filter((violation) =>
    [
      "antiConsumptionViolation",
      "mechanicalTransition",
      "humanPolarityMismatch",
      "fallbackSnapshotMissing",
      "humanRequiredButMissing",
      "commercialRequiredButMissing",
    ].includes(violation)
  );
  const valid =
    dualCompletionPassed &&
    criticalViolations.filter(
      (violation) =>
        !(
          (violation === "humanRequiredButMissing" && humanDetected) ||
          (violation === "commercialRequiredButMissing" && commercialDetected)
        )
    ).length === 0;

  return {
    valid,
    violations: uniqueViolations,
    audit: {
      humanCompletionRequired: requirements.humanCompletionRequired,
      commercialCompletionRequired: requirements.commercialCompletionRequired,
      humanCompletionDetected: humanDetected,
      commercialCompletionDetected: commercialDetected,
      dualCompletionPassed,
      humanPolarity: polarity,
      responsePath: mixedResponseContext.responsePath || options.responsePath || "",
    },
  };
}

export function buildGovernedMixedFallbackReply(
  contract = {},
  {
    commercialBody = "",
    winnerName = "",
    clarificationQuestion = "",
    commercialSnapshot = null,
    humanSnapshot = null,
    completionRequirements = null,
  } = {}
) {
  const mv = contract.mixedVerbalization || contract;
  const requirements = completionRequirements || resolveCompletionRequirements(mv);
  const snapshot = commercialSnapshot || {};
  let commercial = String(commercialBody || "").trim();

  if (
    !commercial ||
    (tokenCount(commercial) < 20 &&
      !COMPARISON_BODY_PATTERN.test(commercial) &&
      !hasFirstAnswerStructure(commercial) &&
      !COMMERCIAL_BODY_START_PATTERN.test(normalizeText(commercial)))
  ) {
    commercial = buildCommercialBodyFromSnapshot({
      ...snapshot,
      winnerName: winnerName || snapshot.winnerName || "",
      clarificationQuestion: clarificationQuestion || snapshot.clarificationQuestion || "",
    });
  }

  const humanLine = requirements.humanCompletionRequired
    ? buildStructuralHumanFallbackLine(contract, humanSnapshot)
    : "";

  if (!humanLine) return commercial;
  if (!commercial && requirements.commercialCompletionRequired) {
    return humanLine;
  }
  if (!commercial) return humanLine;

  return mergeMixedReplySections(humanLine, commercial, contract);
}

export function completeMixedDualDimensions(
  reply = "",
  mixedResponseContext = {},
  options = {}
) {
  if (!mixedResponseContext?.contract) {
    return {
      reply: String(reply || ""),
      skipped: true,
      validation: { valid: true, audit: { skipped: true } },
      corrected: false,
    };
  }

  const contract = mixedResponseContext.contract;
  const coverage = ensureMixedContractCoverage(
    mixedResponseContext,
    mixedResponseContext.responsePath || options.responsePath || ""
  );

  let text = stripDuplicateCommercialOpening(String(reply || "").trim());
  let validation = validateMixedDualDimensionCompletion(text, mixedResponseContext, options);

  if (validation.valid) {
    return {
      reply: text,
      validation,
      corrected: false,
      coverage,
      mixedFinalizeApplied: true,
      mixedFallbackApplied: false,
    };
  }

  text = stripMixedViolations(text, contract, validation.violations);
  text = stripDuplicateCommercialOpening(text);
  validation = validateMixedDualDimensionCompletion(text, mixedResponseContext, options);
  if (validation.valid) {
    return {
      reply: text,
      validation,
      corrected: true,
      coverage,
      mixedFinalizeApplied: true,
      mixedFallbackApplied: false,
    };
  }

  const { humanPrefix, commercialBody } = splitMixedReplySections(text, {
    winnerName:
      mixedResponseContext.commercialSnapshot?.winnerName || options.winnerName || "",
  });

  const fallback = buildGovernedMixedFallbackReply(contract, {
    commercialBody: commercialBody || "",
    winnerName:
      mixedResponseContext.commercialSnapshot?.winnerName || options.winnerName || "",
    clarificationQuestion:
      mixedResponseContext.commercialSnapshot?.clarificationQuestion ||
      options.clarificationQuestion ||
      "",
    commercialSnapshot: mixedResponseContext.commercialSnapshot,
    humanSnapshot: mixedResponseContext.humanSnapshot,
    completionRequirements: mixedResponseContext.completionRequirements,
  });

  const fallbackValidation = validateMixedDualDimensionCompletion(
    fallback,
    mixedResponseContext,
    options
  );

  return {
    reply: stripDuplicateCommercialOpening(fallback),
    validation: fallbackValidation,
    corrected: true,
    usedFallback: true,
    coverage,
    mixedFinalizeApplied: true,
    mixedFallbackApplied: true,
  };
}

export function finalizeMixedConversationReply(
  reply = "",
  contract = {},
  options = {}
) {
  if (contract.interactionMode !== MIA_INTERACTION_MODES.MIXED && !options.mixedResponseContext) {
    return { reply: String(reply || ""), validation: { valid: true, skipped: true }, corrected: false };
  }

  const mixedResponseContext =
    options.mixedResponseContext ||
    buildMixedResponseContext(contract, {
      message: contract.rawUserMessage || options.message || "",
      commercialSnapshot: options.commercialSnapshot || buildCommercialSnapshot({
        winnerName: options.winnerName || "",
        commercialBody: options.commercialReplySnapshot || "",
        clarificationQuestion: options.clarificationQuestion || "",
        structuredReply: options.commercialReplySnapshot || "",
      }),
      responsePath: options.responsePath || "",
      clarificationRequired: !!options.clarificationRequired,
      comparisonActive: !!options.comparisonActive,
    });

  if (!mixedResponseContext) {
    return { reply: String(reply || ""), validation: { valid: true, skipped: true }, corrected: false };
  }

  return completeMixedDualDimensions(reply, mixedResponseContext, options);
}

export function mixedVerbalizationToTrace(contract = {}) {
  const mv = contract.mixedVerbalization;
  if (!mv) return null;
  return {
    version: mv.version,
    humanAcknowledgementRequired: mv.humanAcknowledgementRequired,
    humanAcknowledgementDepth: mv.humanAcknowledgementDepth,
    humanPolarity: mv.humanPolarity,
    responseOrdering: mv.responseOrdering,
    transitionProfile: mv.transitionProfile,
    commercialAnswerDepth: mv.commercialAnswerDepth,
    clarificationRequired: mv.clarificationRequired,
    humanCompletionRequired: mv.humanCompletionRequired,
    commercialCompletionRequired: mv.commercialCompletionRequired,
    dualDimensionCompletionRequired: mv.dualDimensionCompletionRequired,
  };
}

export function mixedDualCompletionToTrace(result = {}) {
  const audit = result.validation?.audit || {};
  return {
    mixedContractPresent: !!result.coverage?.mixedContractPresent,
    mixedFinalizeApplied: !!result.mixedFinalizeApplied,
    mixedFallbackApplied: !!result.mixedFallbackApplied,
    humanCompletionRequired: audit.humanCompletionRequired,
    commercialCompletionRequired: audit.commercialCompletionRequired,
    humanCompletionDetected: audit.humanCompletionDetected,
    commercialCompletionDetected: audit.commercialCompletionDetected,
    dualCompletionPassed: audit.dualCompletionPassed,
    humanPolarity: audit.humanPolarity,
    responsePath: audit.responsePath,
    violations: result.validation?.violations || [],
    corrected: !!result.corrected,
  };
}

export function attachMixedConversationalStateToSession(sessionContext = {}, completionResult = {}) {
  const audit = completionResult.validation?.audit || {};
  if (!audit.humanCompletionDetected && !audit.commercialCompletionDetected) {
    return sessionContext;
  }
  return {
    ...sessionContext,
    mixedConversationalState: {
      ...(sessionContext.mixedConversationalState || {}),
      humanAcknowledgementSatisfied: !!audit.humanCompletionDetected,
      lastDualCompletionPassed: !!audit.dualCompletionPassed,
      lastMixedFinalizeApplied: !!completionResult.mixedFinalizeApplied,
    },
  };
}
