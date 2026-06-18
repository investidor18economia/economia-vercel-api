/**
 * PATCH 8.1A — Production Response Perception Audit (AUDIT ONLY)
 *
 * Full-stack trace: Router → Bridge/Contract → Routing → Response Path → User perception.
 * Regra 17: família só fecha quando a resposta final percebida não cai em fallback genérico.
 *
 * Usage: node scripts/test-mia-production-response-perception-audit.js
 */

import {
  classifyMiaTurn,
  MIA_TURN_TYPES,
  isGreetingFamilyQuery,
  isAcknowledgementFamilyQuery,
  isComprehensionFamilyQuery,
  isComprehensionSuccessFamilyQuery,
  isComprehensionSemanticFamilyQuery,
  isSoftDisagreementFamilyQuery,
  isConfidenceChallengeFamilyQuery,
  isSocialValidationFamilyQuery,
  isAntiRegretFamilyQuery,
  isAlternativeExplorationFamilyQuery,
  isSecondBestDiscoveryFamilyQuery,
  isConstraintChangeFamilyQuery,
  isDecisionConfirmationFamilyQuery,
  isAboutMiaFamilyQuery,
  getDominantMasTailIntent,
} from "../lib/miaCognitiveRouter.js";
import {
  mapCognitiveTurnToLegacyIntent,
  buildCognitiveBridgeAudit,
  guardContextActionWithCognitiveBridge,
} from "../lib/miaCognitiveBridge.js";
import {
  buildRoutingDecision,
  applyRoutingDecisionToContextResolution,
} from "../lib/miaRoutingDecisionContract.js";
import { resolveClearNewCommercialSearchForRouting } from "../lib/miaRoutingSafety.js";
import { buildRankingSnapshot } from "../lib/miaRoutingGuardrails.js";
import { detectGenericConversationalFallback } from "../lib/miaConversationalFamilyClosureStandard.js";
import {
  buildAboutMiaDeterministicFallback,
  isGenericInstitutionalFallbackReply,
} from "../lib/miaCompanyKnowledge.js";
import { deriveConversationalToneProfile } from "../lib/miaConversationalTone.js";
import {
  inferToneDominantFamily,
  resolveToneProductionFlowPath,
  evaluateToneAdaptationPerception,
  promoteToneDominantResponsePath,
} from "../lib/miaToneProductionPerceptionBridge.js";
import {
  applyProductionFallbackGate,
  detectRecognizedConversationalFamily,
  shouldBypassInstitutionalGeneralAnswerFallback,
  isInstitutionalGenericDirectReply,
} from "../lib/miaProductionFallbackGate.js";

const MOCK_WINNER = {
  product_name: "Produto Recomendado Atual",
  price: "R$ 1.899",
  finalScoreEngineScore: 841,
};

const MOCK_RUNNER_UP = {
  product_name: "Produto Segundo Colocado",
  price: "R$ 1.699",
  finalScoreEngineScore: 819,
};

const RANKING_SNAPSHOT = buildRankingSnapshot([MOCK_WINNER, MOCK_RUNNER_UP], MOCK_WINNER);

const GENERIC_WELCOME_DIRECT_REPLY =
  "Posso te ajudar com compras, comparação de produtos e decisão de custo-benefício.\n\nMe fala o produto que você quer analisar ou buscar.";

const EXTRA_FALLBACK_MARKERS = [
  "qual produto você quer",
  "me diga o que você quer comprar",
  "me diga o que voce quer comprar",
];

const CONTEXTUAL_DIRECT_REPLY_BYPASS_TURNS = new Set([
  "OBJECTION",
  "EXPLANATION_REQUEST",
  "FOLLOW_UP",
  "ALTERNATIVE_REQUEST",
  "PRIORITY_SHIFT",
  "COMPARISON",
  "REFINEMENT",
]);

const FAMILY_TO_PATH = {
  GREETING: "greeting_flow",
  ACKNOWLEDGEMENT: "acknowledgement_flow",
  COMPREHENSION_FAILURE: "comprehension_flow",
  COMPREHENSION_SUCCESS: "comprehension_flow",
  ABOUT_MIA: "about_mia_flow",
  ALTERNATIVE_EXPLORATION: "alternative_exploration_flow",
  SECOND_BEST_DISCOVERY: "second_best_discovery_flow",
  DECISION_CONFIRMATION: "decision_confirmation_flow",
  ANTI_REGRET: "anti_regret_flow",
  CONFIDENCE_CHALLENGE: "confidence_challenge_flow",
  SOCIAL_VALIDATION: "social_validation_flow",
  SOFT_DISAGREEMENT: "soft_disagreement_flow",
  CONSTRAINT_CHANGE: "constraint_change_flow",
  CROSS_FAMILY: null,
  INFORMAL_ABBREV_TYPO_COMPOUND: null,
  TONE_ADAPTATION_GUARD: null,
};

const COMPREHENSION_FAILURE_RE =
  /\b(nao entendi|não entendi|nao compreendi|nao percebi|nao consegui entender|explica melhor|explica de outro jeito|explica de novo|explica em portugues claro|pode explicar|pode simplificar|podia simplificar|simplifica|nao peguei|não peguei|fiquei confuso|fiquei perdido|como assim|detalha melhor|detalha de novo|repete|repete pf|boiei|nao entendi nada|nao ficou claro|ficou confuso|nao esta claro|nao ta claro|nao acompanhei|me perdi|fala mais simples|hein|hm|hum|que quer dizer|aff)\b/i;

const COMPREHENSION_SUCCESS_RE =
  /\b(agora entendi|faz sentido|saquei|ficou claro|entendi agora|entendi o ponto|captei|show entendi|boa entendi|blz entendi)\b/i;

function normalizeQuery(message = "") {
  return String(message || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectProductionGenericFallback(text = "") {
  if (detectGenericConversationalFallback(text)) return true;
  const q = normalizeQuery(text);
  return EXTRA_FALLBACK_MARKERS.some((m) => q.includes(normalizeQuery(m)));
}

function buildSessionContext(hasActiveAnchor) {
  if (!hasActiveAnchor) return {};
  return {
    lastBestProduct: MOCK_WINNER,
    lastRecommendation: { winner: MOCK_WINNER.product_name },
    lastProductMentioned: MOCK_WINNER.product_name,
    lastProducts: [MOCK_WINNER, MOCK_RUNNER_UP],
    lastRankingSnapshot: RANKING_SNAPSHOT,
    lastCategory: "produto",
    lastQuery: "produto ate 2500",
  };
}

function buildContextResolutionMirror(hasActiveAnchor) {
  return {
    mode: "general_answer",
    shouldSkipProductSearch: true,
    clearContext: !hasActiveAnchor,
    directReply: GENERIC_WELCOME_DIRECT_REPLY,
    lockedComparisonFollowUp: false,
  };
}

function buildIdealGreetingPreview(hasAnchor) {
  if (hasAnchor) {
    return "Opa! Continuamos naquele produto. Quer que eu explique melhor ou compare com outra opção?";
  }
  return "Oi! Me diz o que você está pensando em comprar que eu te ajudo a decidir.";
}

function resolveFinalResponsePreview(responsePathFinal, message, hasAnchor) {
  if (responsePathFinal === "context_resolution_direct_reply_early_return") {
    return GENERIC_WELCOME_DIRECT_REPLY;
  }
  if (responsePathFinal === "greeting_flow") {
    return buildIdealGreetingPreview(hasAnchor);
  }
  if (responsePathFinal === "about_mia_flow") {
    return buildAboutMiaDeterministicFallback(message);
  }
  if (responsePathFinal === "default_product_search") {
    return "(busca comercial — resultados de produto)";
  }
  if (responsePathFinal.endsWith("_flow")) {
    return `(path=${responsePathFinal} — verbalizer contextual governado)`;
  }
  return `(path=${responsePathFinal})`;
}

function applyProductionFamilyDirectReplyClearing({
  message,
  hasAnchor,
  clearNewSearch,
  cognitiveTurn,
  routingDecision,
  ctx,
  intentRef,
}) {
  let directReply = ctx.directReply;
  let effectiveIntent = intentRef.value;
  const rd = routingDecision;

  const clears = [
    {
      gate:
        !clearNewSearch &&
        (cognitiveTurn.signals?.isAboutMia === true ||
          isAboutMiaFamilyQuery(message, { hasActiveAnchor: hasAnchor }) ||
          rd.conversationAct === "about_mia" ||
          rd.responsePathHint === "about_mia_reply" ||
          rd.responsePathHint === "about_mia_anchored"),
      mode: "about_mia",
      intent: "about_mia",
    },
    {
      gate:
        !clearNewSearch &&
        (cognitiveTurn.signals?.isGreeting === true ||
          isGreetingFamilyQuery(message) ||
          (rd.mode === "conversational" && rd.conversationAct === "greeting")),
      mode: "greeting",
      intent: "greeting",
    },
    {
      gate:
        !clearNewSearch &&
        (cognitiveTurn.signals?.isComprehension === true ||
          cognitiveTurn.signals?.isComprehensionSuccess === true ||
          isComprehensionFamilyQuery(message) ||
          isComprehensionSuccessFamilyQuery(message) ||
          isComprehensionSemanticFamilyQuery(message) ||
          rd.conversationAct === "comprehension" ||
          rd.responsePathHint === "comprehension_reply" ||
          rd.responsePathHint === "comprehension_anchored"),
      mode: "comprehension",
      intent: "comprehension",
    },
    {
      gate:
        !clearNewSearch &&
        !cognitiveTurn.signals?.isComprehensionSuccess &&
        !isComprehensionSuccessFamilyQuery(message) &&
        (cognitiveTurn.signals?.isAcknowledgement === true ||
          isAcknowledgementFamilyQuery(message) ||
          rd.conversationAct === "acknowledgement" ||
          rd.responsePathHint === "acknowledgement_reply" ||
          rd.responsePathHint === "acknowledgement_anchored"),
      mode: "acknowledgement",
      intent: "acknowledgement",
    },
    {
      gate:
        !clearNewSearch &&
        (cognitiveTurn.signals?.isSoftDisagreement === true ||
          isSoftDisagreementFamilyQuery(message) ||
          rd.conversationAct === "soft_disagreement" ||
          rd.responsePathHint === "soft_disagreement_reply" ||
          rd.responsePathHint === "soft_disagreement_anchored"),
      mode: "soft_disagreement",
      intent: "soft_disagreement",
    },
    {
      gate:
        !clearNewSearch &&
        (cognitiveTurn.signals?.isDecisionConfirmation === true ||
          isDecisionConfirmationFamilyQuery(message) ||
          rd.conversationAct === "decision_confirmation" ||
          rd.responsePathHint === "decision_confirmation_reply" ||
          rd.responsePathHint === "decision_confirmation_anchored"),
      mode: "decision_confirmation",
      intent: "decision_confirmation",
    },
    {
      gate:
        !clearNewSearch &&
        (cognitiveTurn.signals?.isAntiRegret === true ||
          isAntiRegretFamilyQuery(message) ||
          rd.conversationAct === "anti_regret" ||
          rd.responsePathHint === "anti_regret_reply" ||
          rd.responsePathHint === "anti_regret_anchored"),
      mode: "anti_regret",
      intent: "anti_regret",
    },
    {
      gate:
        !clearNewSearch &&
        (cognitiveTurn.signals?.isConfidenceChallenge === true ||
          isConfidenceChallengeFamilyQuery(message) ||
          rd.conversationAct === "confidence_challenge" ||
          rd.responsePathHint === "confidence_challenge_reply" ||
          rd.responsePathHint === "confidence_challenge_anchored"),
      mode: "confidence_challenge",
      intent: "confidence_challenge",
    },
    {
      gate:
        cognitiveTurn.signals?.isSocialValidation === true ||
        isSocialValidationFamilyQuery(message) ||
        rd.conversationAct === "social_validation" ||
        rd.responsePathHint === "social_validation_reply" ||
        rd.responsePathHint === "social_validation_anchored",
      mode: "social_validation",
      intent: "social_validation",
    },
    {
      gate:
        cognitiveTurn.signals?.isSecondBestDiscovery === true ||
        isSecondBestDiscoveryFamilyQuery(message) ||
        rd.conversationAct === "second_best_discovery" ||
        rd.responsePathHint === "second_best_discovery_reply" ||
        rd.responsePathHint === "second_best_discovery_anchored",
      mode: "second_best_discovery",
      intent: "second_best_discovery",
    },
    {
      gate:
        cognitiveTurn.signals?.isAlternativeExploration === true ||
        isAlternativeExplorationFamilyQuery(message) ||
        rd.conversationAct === "alternative_exploration" ||
        rd.responsePathHint === "alternative_exploration_reply" ||
        rd.responsePathHint === "alternative_exploration_anchored",
      mode: "alternative_exploration",
      intent: "alternative_exploration",
    },
    {
      gate:
        cognitiveTurn.signals?.isConstraintChange === true ||
        isConstraintChangeFamilyQuery(message) ||
        rd.conversationAct === "constraint_change" ||
        rd.responsePathHint === "constraint_change_reply" ||
        rd.responsePathHint === "constraint_change_anchored" ||
        cognitiveTurn.turnType === MIA_TURN_TYPES.PRIORITY_SHIFT,
      mode: "constraint_change",
      intent: "constraint_change",
    },
  ];

  for (const item of clears) {
    if (!item.gate) continue;
    directReply = null;
    ctx.directReply = null;
    ctx.clearContext = false;
    if (!ctx.mode || ctx.mode === "general_answer") ctx.mode = item.mode;
    effectiveIntent = item.intent;
  }

  intentRef.value = effectiveIntent;
  return directReply;
}

function simulateHandlerResponsePath({
  message,
  hasAnchor,
  intent,
  contextResolution,
  cognitiveTurn,
  routingDecision,
  clearNewSearch,
}) {
  let ctx = { ...contextResolution };
  applyRoutingDecisionToContextResolution(routingDecision, ctx);

  let directReply = ctx.directReply;
  const intentRef = { value: intent };

  const shouldBypassDirectReplyForContextualTurn =
    hasAnchor &&
    !clearNewSearch &&
    CONTEXTUAL_DIRECT_REPLY_BYPASS_TURNS.has(cognitiveTurn.turnType);

  if (shouldBypassDirectReplyForContextualTurn) {
    directReply = null;
    ctx = { ...ctx, directReply: null, clearContext: false };
  }

  directReply = applyProductionFamilyDirectReplyClearing({
    message,
    hasAnchor,
    clearNewSearch,
    cognitiveTurn,
    routingDecision,
    ctx,
    intentRef,
  });
  let effectiveIntent = intentRef.value;

  const isGreetingResponsePath =
    !clearNewSearch &&
    (cognitiveTurn.signals?.isGreeting === true ||
      isGreetingFamilyQuery(message) ||
      (routingDecision.mode === "conversational" && routingDecision.conversationAct === "greeting"));

  const familyFlowChecks = [
    {
      key: "about_mia",
      gate:
        cognitiveTurn.signals?.isAboutMia === true ||
        isAboutMiaFamilyQuery(message, { hasActiveAnchor: hasAnchor }) ||
        routingDecision.conversationAct === "about_mia",
      path: "about_mia_flow",
    },
    {
      key: "comprehension",
      gate:
        !clearNewSearch &&
        (cognitiveTurn.signals?.isComprehension === true ||
          cognitiveTurn.signals?.isComprehensionSuccess === true ||
          isComprehensionFamilyQuery(message) ||
          isComprehensionSuccessFamilyQuery(message) ||
          isComprehensionSemanticFamilyQuery(message) ||
          routingDecision.conversationAct === "comprehension"),
      path: "comprehension_flow",
    },
    {
      key: "acknowledgement",
      gate:
        !clearNewSearch &&
        !cognitiveTurn.signals?.isComprehensionSuccess &&
        !isComprehensionSuccessFamilyQuery(message) &&
        (cognitiveTurn.signals?.isAcknowledgement === true ||
          isAcknowledgementFamilyQuery(message) ||
          routingDecision.conversationAct === "acknowledgement"),
      path: "acknowledgement_flow",
    },
    {
      key: "soft_disagreement",
      gate:
        !clearNewSearch &&
        (cognitiveTurn.signals?.isSoftDisagreement === true ||
          isSoftDisagreementFamilyQuery(message) ||
          routingDecision.conversationAct === "soft_disagreement"),
      path: "soft_disagreement_flow",
    },
    {
      key: "confidence_challenge",
      gate:
        !clearNewSearch &&
        (cognitiveTurn.signals?.isConfidenceChallenge === true ||
          isConfidenceChallengeFamilyQuery(message) ||
          routingDecision.conversationAct === "confidence_challenge"),
      path: "confidence_challenge_flow",
    },
    {
      key: "social_validation",
      gate:
        cognitiveTurn.signals?.isSocialValidation === true ||
        isSocialValidationFamilyQuery(message) ||
        routingDecision.conversationAct === "social_validation",
      path: "social_validation_flow",
    },
    {
      key: "anti_regret",
      gate:
        !clearNewSearch &&
        (cognitiveTurn.signals?.isAntiRegret === true ||
          isAntiRegretFamilyQuery(message) ||
          routingDecision.conversationAct === "anti_regret"),
      path: "anti_regret_flow",
    },
    {
      key: "constraint_change",
      gate:
        cognitiveTurn.signals?.isConstraintChange === true ||
        isConstraintChangeFamilyQuery(message) ||
        routingDecision.conversationAct === "constraint_change" ||
        cognitiveTurn.turnType === MIA_TURN_TYPES.PRIORITY_SHIFT,
      path: "constraint_change_flow",
    },
    {
      key: "second_best_discovery",
      gate:
        cognitiveTurn.signals?.isSecondBestDiscovery === true ||
        isSecondBestDiscoveryFamilyQuery(message) ||
        routingDecision.conversationAct === "second_best_discovery",
      path: "second_best_discovery_flow",
    },
    {
      key: "alternative_exploration",
      gate:
        cognitiveTurn.signals?.isAlternativeExploration === true ||
        isAlternativeExplorationFamilyQuery(message) ||
        routingDecision.conversationAct === "alternative_exploration",
      path: "alternative_exploration_flow",
    },
    {
      key: "decision_confirmation",
      gate:
        !clearNewSearch &&
        (cognitiveTurn.signals?.isDecisionConfirmation === true ||
          isDecisionConfirmationFamilyQuery(message) ||
          routingDecision.conversationAct === "decision_confirmation"),
      path: "decision_confirmation_flow",
    },
  ];

  if (isGreetingResponsePath) {
    return {
      responsePathFinal: "greeting_flow",
      finalResponsePreview: buildIdealGreetingPreview(hasAnchor),
      effectiveIntent: "greeting",
      handlerFamilyGate: "greeting",
    };
  }

  const dominantMas = getDominantMasTailIntent(message);
  const dominantKeyMap = {
    ALTERNATIVE_EXPLORATION: "alternative_exploration",
    SECOND_BEST_DISCOVERY: "second_best_discovery",
    ANTI_REGRET: "anti_regret",
    CONFIDENCE_CHALLENGE: "confidence_challenge",
    DECISION_CONFIRMATION: "decision_confirmation",
    SOFT_DISAGREEMENT: "soft_disagreement",
    CONSTRAINT_CHANGE: "constraint_change",
    SOCIAL_VALIDATION: "social_validation",
    COMPREHENSION_FAILURE: "comprehension",
  };
  if (dominantMas && dominantKeyMap[dominantMas]) {
    const dominantCheck = familyFlowChecks.find((c) => c.key === dominantKeyMap[dominantMas]);
    if (dominantCheck?.gate) {
      return {
        responsePathFinal: dominantCheck.path,
        finalResponsePreview: resolveFinalResponsePreview(dominantCheck.path, message, hasAnchor),
        effectiveIntent: dominantCheck.key,
        handlerFamilyGate: dominantCheck.key,
      };
    }
  }

  for (const check of familyFlowChecks) {
    if (check.gate) {
      return {
        responsePathFinal: check.path,
        finalResponsePreview: resolveFinalResponsePreview(check.path, message, hasAnchor),
        effectiveIntent: check.key,
        handlerFamilyGate: check.key,
      };
    }
  }

  const tonePromotion = promoteToneDominantResponsePath({
    message,
    cognitiveTurn,
    routingDecision,
    familyFlowChecks,
  });
  if (tonePromotion?.flowPath) {
    return {
      responsePathFinal: tonePromotion.flowPath,
      finalResponsePreview: resolveFinalResponsePreview(tonePromotion.flowPath, message, hasAnchor),
      effectiveIntent: tonePromotion.flowKey,
      handlerFamilyGate: tonePromotion.flowKey,
      toneBridgeApplied: true,
    };
  }

  // PATCH 8.1B.7 — institutional directReply loses to recognized conversational family (Regra 17)
  if (directReply && !ctx.lockedComparisonFollowUp) {
    const gateResult = applyProductionFallbackGate({
      query: message,
      hasActiveAnchor: hasAnchor,
      clearNewCommercialSearch: clearNewSearch,
      cognitiveTurn,
      routingDecision,
      contextResolution: ctx,
    });

    if (gateResult.contextResolutionPatch) {
      Object.assign(ctx, gateResult.contextResolutionPatch);
      directReply = ctx.directReply;
      if (gateResult.intentPatch) effectiveIntent = gateResult.intentPatch;
    }

    if (gateResult.shouldBypassGeneralAnswerFallback) {
      const recognition = detectRecognizedConversationalFamily({
        query: message,
        hasActiveAnchor: hasAnchor,
        cognitiveTurn,
        routingDecision,
      });
      const modeToKey = {
        confidence_challenge: "confidence_challenge",
        anti_regret: "anti_regret",
        soft_disagreement: "soft_disagreement",
        constraint_change: "constraint_change",
        social_validation: "social_validation",
        acknowledgement: "acknowledgement",
        comprehension: "comprehension",
        decision_confirmation: "decision_confirmation",
        second_best_discovery: "second_best_discovery",
        alternative_exploration: "alternative_exploration",
        about_mia: "about_mia",
        greeting: "greeting",
      };
      const flowKey = modeToKey[recognition.mode];
      const recognizedCheck = flowKey ? familyFlowChecks.find((c) => c.key === flowKey) : null;
      if (recognizedCheck?.gate) {
        return {
          responsePathFinal: recognizedCheck.path,
          finalResponsePreview: resolveFinalResponsePreview(recognizedCheck.path, message, hasAnchor),
          effectiveIntent: recognizedCheck.key,
          handlerFamilyGate: recognizedCheck.key,
          fallbackGateApplied: gateResult.applied,
        };
      }
    }

    if (directReply && !ctx.lockedComparisonFollowUp) {
      return {
        responsePathFinal: "context_resolution_direct_reply_early_return",
        finalResponsePreview: directReply,
        effectiveIntent,
        handlerFamilyGate: isGreetingResponsePath ? "greeting" : null,
        fallbackGateApplied: gateResult.applied,
      };
    }
  }

  if (clearNewSearch) {
    return {
      responsePathFinal: "default_product_search",
      finalResponsePreview: resolveFinalResponsePreview("default_product_search", message, hasAnchor),
      effectiveIntent,
      handlerFamilyGate: null,
    };
  }

  return {
    responsePathFinal: routingDecision.responsePathHint || routingDecision.mode || "unknown",
    finalResponsePreview: resolveFinalResponsePreview(
      routingDecision.responsePathHint || routingDecision.mode || "unknown",
      message,
      hasAnchor
    ),
    effectiveIntent,
    handlerFamilyGate: null,
  };
}

function matchesRouterFamily(expectedFamily, message, cognitiveTurn, hasAnchor) {
  const sig = cognitiveTurn.signals || {};
  switch (expectedFamily) {
    case "GREETING":
      return sig.isGreeting || isGreetingFamilyQuery(message);
    case "ACKNOWLEDGEMENT":
      return sig.isAcknowledgement || isAcknowledgementFamilyQuery(message);
    case "COMPREHENSION_FAILURE":
      return (
        (sig.isComprehension || isComprehensionFamilyQuery(message)) &&
        COMPREHENSION_FAILURE_RE.test(normalizeQuery(message))
      );
    case "COMPREHENSION_SUCCESS":
      return (
        (sig.isComprehensionSuccess ||
          sig.isComprehension ||
          isComprehensionSuccessFamilyQuery(message) ||
          isComprehensionSemanticFamilyQuery(message)) &&
        COMPREHENSION_SUCCESS_RE.test(message)
      );
    case "ABOUT_MIA":
      return sig.isAboutMia || isAboutMiaFamilyQuery(message, { hasActiveAnchor: hasAnchor });
    case "ALTERNATIVE_EXPLORATION":
      return sig.isAlternativeExploration || isAlternativeExplorationFamilyQuery(message);
    case "SECOND_BEST_DISCOVERY":
      return sig.isSecondBestDiscovery || isSecondBestDiscoveryFamilyQuery(message);
    case "DECISION_CONFIRMATION":
      return sig.isDecisionConfirmation || isDecisionConfirmationFamilyQuery(message);
    case "ANTI_REGRET":
      return sig.isAntiRegret || isAntiRegretFamilyQuery(message);
    case "CONFIDENCE_CHALLENGE":
      return sig.isConfidenceChallenge || isConfidenceChallengeFamilyQuery(message);
    case "SOCIAL_VALIDATION":
      return sig.isSocialValidation || isSocialValidationFamilyQuery(message);
    case "SOFT_DISAGREEMENT":
      return sig.isSoftDisagreement || isSoftDisagreementFamilyQuery(message);
    case "CONSTRAINT_CHANGE":
      return (
        sig.isConstraintChange ||
        isConstraintChangeFamilyQuery(message) ||
        cognitiveTurn.turnType === MIA_TURN_TYPES.PRIORITY_SHIFT
      );
    case "CROSS_FAMILY":
      return inferCrossFamilyDominant(message, cognitiveTurn) != null;
    case "INFORMAL_ABBREV_TYPO_COMPOUND":
      return inferNormalizationDominant(message, cognitiveTurn) != null;
    case "TONE_ADAPTATION_GUARD":
      return true;
    default:
      return false;
  }
}

function inferCrossFamilyDominant(message, cognitiveTurn) {
  const masTail = getDominantMasTailIntent(message);
  if (masTail) return masTail;

  const checks = [
    ["ALTERNATIVE_EXPLORATION", isAlternativeExplorationFamilyQuery],
    ["SECOND_BEST_DISCOVERY", isSecondBestDiscoveryFamilyQuery],
    ["ANTI_REGRET", isAntiRegretFamilyQuery],
    ["CONFIDENCE_CHALLENGE", isConfidenceChallengeFamilyQuery],
    ["SOCIAL_VALIDATION", isSocialValidationFamilyQuery],
    ["SOFT_DISAGREEMENT", isSoftDisagreementFamilyQuery],
    ["CONSTRAINT_CHANGE", isConstraintChangeFamilyQuery],
    ["DECISION_CONFIRMATION", isDecisionConfirmationFamilyQuery],
    ["COMPREHENSION_FAILURE", isComprehensionFamilyQuery],
    ["COMPREHENSION_SUCCESS", (m) => COMPREHENSION_SUCCESS_RE.test(m)],
    ["ACKNOWLEDGEMENT", isAcknowledgementFamilyQuery],
  ];
  for (const [family, fn] of checks) {
    if (fn(message)) return family;
  }
  const sig = cognitiveTurn.signals || {};
  if (sig.isAlternativeExploration) return "ALTERNATIVE_EXPLORATION";
  if (sig.isSecondBestDiscovery) return "SECOND_BEST_DISCOVERY";
  if (sig.isAntiRegret) return "ANTI_REGRET";
  if (sig.isConfidenceChallenge) return "CONFIDENCE_CHALLENGE";
  if (sig.isSocialValidation) return "SOCIAL_VALIDATION";
  if (sig.isSoftDisagreement) return "SOFT_DISAGREEMENT";
  if (sig.isConstraintChange) return "CONSTRAINT_CHANGE";
  if (sig.isDecisionConfirmation) return "DECISION_CONFIRMATION";
  if (sig.isComprehension) return "COMPREHENSION_FAILURE";
  if (sig.isAcknowledgement) return "ACKNOWLEDGEMENT";
  return null;
}

function inferNormalizationDominant(message, cognitiveTurn) {
  const cross = inferCrossFamilyDominant(message, cognitiveTurn);
  if (cross) return cross;

  const sig = cognitiveTurn?.signals || {};
  if (sig.isConfidenceChallenge) return "CONFIDENCE_CHALLENGE";
  if (sig.isAntiRegret) return "ANTI_REGRET";
  if (sig.isSoftDisagreement) return "SOFT_DISAGREEMENT";
  if (sig.isConstraintChange) return "CONSTRAINT_CHANGE";
  if (sig.isSocialValidation) return "SOCIAL_VALIDATION";
  if (sig.isAlternativeExploration) return "ALTERNATIVE_EXPLORATION";
  if (sig.isSecondBestDiscovery) return "SECOND_BEST_DISCOVERY";
  if (sig.isDecisionConfirmation) return "DECISION_CONFIRMATION";
  if (sig.isComprehension && !sig.isComprehensionSuccess) return "COMPREHENSION_FAILURE";
  if (sig.isComprehensionSuccess) return "COMPREHENSION_SUCCESS";
  if (sig.isAcknowledgement) return "ACKNOWLEDGEMENT";
  if (sig.isGreeting) return "GREETING";

  const q = normalizeQuery(message);
  const informal =
    /\b(vc|q|n|msm|slk|kkk|pf|vlw|ctza|sansung|ipone|opcao|qro|dms|fita)\b/.test(q) ||
    /[qk]{2,}/.test(q);
  if (informal) return "INFORMAL";
  return null;
}

function resolveExpectedPath(familyExpected, dominantFamily = null) {
  if (familyExpected === "TONE_ADAPTATION_GUARD") {
    return resolveToneProductionFlowPath(dominantFamily) || null;
  }
  if (familyExpected === "CROSS_FAMILY" || familyExpected === "INFORMAL_ABBREV_TYPO_COMPOUND") {
    return FAMILY_TO_PATH[dominantFamily] || null;
  }
  return FAMILY_TO_PATH[familyExpected] || null;
}

export function auditScenario(spec) {
  const {
    id,
    familyExpected,
    userMessage,
    contextType = "cold",
    dominantFamily = null,
  } = spec;

  const hasActiveAnchor = contextType === "anchored";
  const sessionContext = buildSessionContext(hasActiveAnchor);
  const contextResolution = buildContextResolutionMirror(hasActiveAnchor);
  const legacyIntent = familyExpected === "GREETING" ? "greeting" : "search";
  const legacyContextAction = legacyIntent === "greeting" ? "conversation" : "search";

  const cognitiveTurn = classifyMiaTurn({
    query: userMessage,
    originalQuery: userMessage,
    resolvedQuery: userMessage,
    sessionContext,
    hasActiveAnchor,
    detectedIntent: legacyIntent,
    contextAction: legacyContextAction,
    contextResolution,
  });

  const bridgeResult = mapCognitiveTurnToLegacyIntent(cognitiveTurn);
  const bridgeAudit = buildCognitiveBridgeAudit(bridgeResult, legacyIntent);
  const guardResult = guardContextActionWithCognitiveBridge({
    contextAction: legacyContextAction,
    bridgeAudit,
    cognitiveTurnEarly: cognitiveTurn,
    finalIntent: bridgeAudit.active ? bridgeAudit.toIntent : legacyIntent,
  });

  const clearNewSearch = resolveClearNewCommercialSearchForRouting({
    query: userMessage,
    resolvedQuery: userMessage,
    hasAnchor: hasActiveAnchor,
    looksLikeShortPriorityFollowUp: false,
    looksLikeAmbiguousFollowUp: false,
    isExplicitComparison: false,
    explicitProductOnlyQuery: false,
    wantsNew: false,
    detectProductCategory: () => "",
    wantsNewProduct: () => false,
  });

  const routingDecision = buildRoutingDecision({
    userMessage,
    resolvedQuery: userMessage,
    contextResolution,
    sessionContext,
    incomingSessionContext: sessionContext,
    intent: bridgeAudit.active ? bridgeAudit.toIntent : legacyIntent,
    contextAction: guardResult.contextAction,
    cognitiveRoutingSignal: {
      turnType: cognitiveTurn.turnType,
      confidence: cognitiveTurn.confidence,
      hasActiveAnchor,
      isGreeting: !!cognitiveTurn.signals?.isGreeting,
      isAcknowledgement: !!cognitiveTurn.signals?.isAcknowledgement,
      isComprehension: !!cognitiveTurn.signals?.isComprehension,
      isAboutMia: !!cognitiveTurn.signals?.isAboutMia,
      isSoftDisagreement: !!cognitiveTurn.signals?.isSoftDisagreement,
      isConfidenceChallenge: !!cognitiveTurn.signals?.isConfidenceChallenge,
      isSocialValidation: !!cognitiveTurn.signals?.isSocialValidation,
      isAntiRegret: !!cognitiveTurn.signals?.isAntiRegret,
      isConstraintChange: !!cognitiveTurn.signals?.isConstraintChange,
      isSecondBestDiscovery: !!cognitiveTurn.signals?.isSecondBestDiscovery,
      isAlternativeExploration: !!cognitiveTurn.signals?.isAlternativeExploration,
      isDecisionConfirmation: !!cognitiveTurn.signals?.isDecisionConfirmation,
    },
    signals: {
      hasClearNewCommercialSearch: clearNewSearch,
      isContextDecisionOnOriginal: false,
      isProductReferenceOnOriginal: false,
      looksLikeAmbiguousFollowUp: false,
      looksLikeShortPriorityFollowUp: false,
      isExplicitComparison: false,
      hasComparisonProducts: false,
      wantsNew: false,
    },
  });

  const openedNewSearch =
    routingDecision.mode === "new_search" ||
    (routingDecision.allowNewSearch === true &&
      routingDecision.mode !== "context_hold" &&
      routingDecision.mode !== "conversational" &&
      routingDecision.mode !== "anchored_reaction");

  const response = simulateHandlerResponsePath({
    message: userMessage,
    hasAnchor: hasActiveAnchor,
    intent: bridgeAudit.active ? bridgeAudit.toIntent : legacyIntent,
    contextResolution,
    cognitiveTurn,
    routingDecision,
    clearNewSearch,
  });

  const gateResult = applyProductionFallbackGate({
    query: userMessage,
    hasActiveAnchor,
    clearNewCommercialSearch: clearNewSearch,
    cognitiveTurn,
    routingDecision,
    contextResolution: {
      ...contextResolution,
      directReply:
        response.responsePathFinal === "context_resolution_direct_reply_early_return"
          ? GENERIC_WELCOME_DIRECT_REPLY
          : null,
      mode: contextResolution.mode,
    },
  });

  let finalResponseText = response.finalResponsePreview;
  let responsePathActual = response.responsePathFinal;

  if (gateResult.applied || (gateResult.shouldBypassGeneralAnswerFallback && response.responsePathFinal === "context_resolution_direct_reply_early_return")) {
    if (responsePathActual === "context_resolution_direct_reply_early_return") {
      responsePathActual = gateResult.detection?.mode
        ? `${gateResult.detection.mode}_flow`
        : "conversational_flow";
      finalResponseText = `(path=${responsePathActual} — fallback gate cleared institutional directReply)`;
    }
  }

  if (
    responsePathActual === "unknown" &&
    gateResult.shouldBypassGeneralAnswerFallback &&
    legacyIntent === "general_answer"
  ) {
    finalResponseText = `(path=conversational_flow — general_answer institutional fallback bypassed)`;
    responsePathActual = "conversational_flow";
  }

  const resolvedDominant =
    dominantFamily ||
    (familyExpected === "CROSS_FAMILY" || familyExpected === "INFORMAL_ABBREV_TYPO_COMPOUND"
      ? inferCrossFamilyDominant(userMessage, cognitiveTurn) ||
        inferNormalizationDominant(userMessage, cognitiveTurn)
      : familyExpected === "TONE_ADAPTATION_GUARD"
        ? inferToneDominantFamily(userMessage, cognitiveTurn, {
            conversationAct: routingDecision.conversationAct,
          }) || familyExpected
        : familyExpected);

  const expectedPath = resolveExpectedPath(familyExpected, resolvedDominant);
  const containsGenericFallback = detectProductionGenericFallback(finalResponseText);
  const toneResult = deriveConversationalToneProfile({
    originalMessage: userMessage,
    normalizedMessage: normalizeQuery(userMessage),
    turnType: cognitiveTurn.turnType,
    conversationAct: routingDecision.conversationAct,
    responsePathHint: routingDecision.responsePathHint,
  });

  const routerOk = matchesRouterFamily(familyExpected, userMessage, cognitiveTurn, hasActiveAnchor);
  const routingOk =
    !openedNewSearch ||
    familyExpected === "CONSTRAINT_CHANGE" ||
    clearNewSearch ||
    !hasActiveAnchor;
  const contractOk =
    routingOk &&
    (response.handlerFamilyGate != null ||
      responsePathActual !== "context_resolution_direct_reply_early_return" ||
      gateResult.applied ||
      familyExpected === "GREETING" ||
      (familyExpected === "TONE_ADAPTATION_GUARD" && response.toneBridgeApplied));

  let responsePathOk =
    expectedPath == null
      ? responsePathActual.endsWith("_flow") ||
        responsePathActual === "default_product_search"
      : responsePathActual === expectedPath ||
        (gateResult.shouldBypassGeneralAnswerFallback && responsePathActual.endsWith("_flow"));

  let containsFamilySpecificLanguage =
    !containsGenericFallback &&
    (responsePathActual.endsWith("_flow") ||
      responsePathActual === "default_product_search");

  const preservesAnchor =
    !hasActiveAnchor ||
    (routingDecision.shouldPreserveAnchor !== false && !contextResolution.clearContext);
  const preservesWinner = !hasActiveAnchor || routingDecision.allowReplaceWinner !== true;

  let userPerception = "NÃO";

  if (familyExpected === "TONE_ADAPTATION_GUARD") {
    const toneEval = evaluateToneAdaptationPerception({
      toneProfile: toneResult.toneProfile,
      dominantFamily: resolvedDominant,
      responsePathActual,
      containsGenericFallback,
      userMessage,
      cognitiveTurn,
      conversationAct: routingDecision.conversationAct,
    });
    responsePathOk = toneEval.responsePathOk;
    containsFamilySpecificLanguage = toneEval.containsFamilySpecificLanguage;
    userPerception = toneEval.userPerception;
    if (userPerception === "SIM" && hasActiveAnchor && !preservesAnchor) {
      userPerception = "PARCIAL";
    }
  } else {
    const finalResponseOk =
      !containsGenericFallback && responsePathOk && containsFamilySpecificLanguage;

    if (finalResponseOk && routerOk) {
      userPerception = hasActiveAnchor && !preservesAnchor ? "PARCIAL" : "SIM";
    } else if (routerOk && responsePathOk && !containsGenericFallback) {
      userPerception = "PARCIAL";
    } else if (containsGenericFallback) {
      userPerception = "NÃO";
    } else if (routerOk && !responsePathOk) {
      userPerception = "PARCIAL";
    }
  }

  const finalResponseOk =
    !containsGenericFallback && responsePathOk && containsFamilySpecificLanguage;

  const leakType = classifyLeakType({
    routerOk,
    routingOk,
    contractOk,
    responsePathOk,
    finalResponseOk,
    containsGenericFallback,
    preservesAnchor,
    preservesWinner,
    familyExpected,
    responsePathFinal: responsePathActual,
    openedNewSearch,
    hasActiveAnchor,
    gateRecognized: gateResult.shouldBypassGeneralAnswerFallback,
  });

  return {
    id,
    familyExpected,
    userMessage,
    contextType,
    originalMessage: userMessage,
    normalizedMessage: normalizeQuery(userMessage),
    toneProfile: toneResult.toneProfile,
    routerTurnType: cognitiveTurn.turnType,
    routerSignals: cognitiveTurn.signals,
    routingConversationAct: routingDecision.conversationAct,
    responsePathHint: routingDecision.responsePathHint,
    contractState: {
      bridgeActive: bridgeAudit.active,
      bridgeToIntent: bridgeAudit.toIntent,
      contextAction: guardResult.contextAction,
      directReplyCleared: response.responsePathFinal !== "context_resolution_direct_reply_early_return",
    },
    selectedRole: response.handlerFamilyGate || response.effectiveIntent,
    promptRole: response.responsePathFinal.replace(/_flow$/, "_reply"),
    responsePathActual,
    finalResponseText,
    containsGenericFallback,
    containsFamilySpecificLanguage,
    preservesAnchor,
    preservesWinner,
    userPerception,
    leakType,
    suspectedLayer: leakToLayer(leakType),
    notes: buildNotes({
      familyExpected,
      resolvedDominant,
      expectedPath,
      responsePathFinal: response.responsePathFinal,
      openedNewSearch,
      routerOk,
    }),
    routerOk,
    routingOk,
    contractOk,
    responsePathOk,
    finalResponseOk,
    dominantFamilyResolved: resolvedDominant,
    gateRecognized: gateResult.shouldBypassGeneralAnswerFallback,
    fallbackGateApplied: gateResult.applied,
  };
}

function classifyLeakType(ctx) {
  if (ctx.containsGenericFallback) {
    if (ctx.gateRecognized) return "PRODUCTION_FALLBACK_LEAK";
    return "GENERIC_RESPONSE_LEAK";
  }
  if (!ctx.routerOk) return "ROUTER_LEAK";
  if (!ctx.routingOk && ctx.hasActiveAnchor) return "ROUTING_LEAK";
  if (!ctx.preservesAnchor && ctx.hasActiveAnchor) return "ANCHOR_LOSS";
  if (!ctx.preservesWinner && ctx.hasActiveAnchor) return "WINNER_LOSS";
  if (!ctx.responsePathOk) return "RESPONSE_PATH_LEAK";
  if (!ctx.contractOk) return "CONTRACT_LEAK";
  if (!ctx.finalResponseOk) return "RESPONSE_BUILDER_LEAK";
  return null;
}

function leakToLayer(leakType) {
  const map = {
    ROUTER_LEAK: "Router",
    ROUTING_LEAK: "Routing",
    CONTRACT_LEAK: "Contract",
    RESPONSE_PATH_LEAK: "Response Path",
    VERBALIZER_LEAK: "Verbalizer",
    RESPONSE_BUILDER_LEAK: "Response Builder",
    PRODUCTION_FALLBACK_LEAK: "Response Path / Handler gate",
    GENERIC_RESPONSE_LEAK: "Response Path",
    ANCHOR_LOSS: "Session/Anchor",
    WINNER_LOSS: "Winner/Ranking",
    TONE_LEAK: "Tone Guard",
    NORMALIZATION_LEAK: "Normalizer",
  };
  return map[leakType] || "None";
}

function buildNotes(ctx) {
  const parts = [];
  if (ctx.expectedPath && ctx.responsePathFinal !== ctx.expectedPath) {
    parts.push(`expectedPath=${ctx.expectedPath} got=${ctx.responsePathFinal}`);
  }
  if (ctx.openedNewSearch) parts.push("openedNewSearch=true");
  if (!ctx.routerOk) parts.push("router mismatch");
  if (ctx.resolvedDominant && ctx.familyExpected !== ctx.resolvedDominant) {
    parts.push(`dominant=${ctx.resolvedDominant}`);
  }
  return parts.join("; ") || "";
}

function phrase(idBase, family, phrases, contexts = ["cold", "anchored"]) {
  const rows = [];
  for (const phraseText of phrases) {
    for (const contextType of contexts) {
      rows.push({
        id: `${idBase}-${contextType}-${normalizeQuery(phraseText).slice(0, 24).replace(/\s/g, "_")}`,
        familyExpected: family,
        userMessage: phraseText,
        contextType,
      });
    }
  }
  return rows;
}

const FAMILY_PHRASES = {
  GREETING: ["oi", "bom dia", "koe", "qual a boa?", "e aí", "salve", "opa", "hey"],
  ACKNOWLEDGEMENT: ["ok", "blz", "show", "beleza", "fechou", "pode seguir", "demorou", "valeu", "ta ligado", "tlgd", "tranquilo", "top", "fechado", "vlw"],
  COMPREHENSION_FAILURE: [
    "não entendi",
    "explica melhor",
    "simplifica pra mim",
    "não peguei",
    "fiquei confuso",
    "como assim?",
    "detalha melhor",
    "repete",
  ],
  COMPREHENSION_SUCCESS: [
    "agora entendi",
    "faz sentido",
    "saquei",
    "entendi o ponto",
    "captei",
    "entendi agora",
    "ficou claro",
    "show entendi",
  ],
  ABOUT_MIA: [
    "quem é você?",
    "vocês recebem comissão?",
    "posso confiar?",
    "isso é propaganda?",
    "o que é a MIA?",
    "como vocês funcionam?",
    "quem criou isso?",
    "vocês vendem meus dados?",
  ],
  ALTERNATIVE_EXPLORATION: [
    "mostra outra opção",
    "tem alternativa?",
    "e se eu não pegar esse?",
    "tem concorrente?",
    "tem outro?",
    "quero ver opções",
    "me mostra outra",
    "outra opção",
  ],
  SECOND_BEST_DISCOVERY: [
    "qual ficou em segundo?",
    "qual o plano b?",
    "quem quase ganhou?",
    "outra melhor opção?",
    "backup?",
    "segunda opção?",
    "runner up?",
    "quem ficou atrás?",
  ],
  DECISION_CONFIRMATION: [
    "vou nesse?",
    "fecho nele?",
    "então é esse?",
    "posso comprar?",
    "fecho?",
    "vou nele?",
    "compro esse?",
    "é esse mesmo?",
  ],
  ANTI_REGRET: [
    "não quero me arrepender",
    "tenho medo de errar",
    "não quero dor de cabeça",
    "posso comprar sem medo?",
    "tô cabreiro",
    "medo de errar",
    "não quero me ferrar",
    "receio de comprar",
  ],
  CONFIDENCE_CHALLENGE: [
    "tem certeza?",
    "você sustenta essa recomendação?",
    "continua valendo?",
    "você compraria?",
    "ainda recomenda?",
    "crava isso?",
    "mantém essa escolha?",
    "você manteria?",
  ],
  SOCIAL_VALIDATION: [
    "o pessoal gosta?",
    "muita gente recomenda?",
    "quem comprou se arrepende?",
    "tem reclamação?",
    "a galera aprova?",
    "o povo fala bem?",
    "quem tem gostou?",
    "tem review ruim?",
  ],
  SOFT_DISAGREEMENT: [
    "não me convenceu",
    "não curti muito",
    "sei lá",
    "tá puxado",
    "não bateu comigo",
    "não me ganhou",
    "tô na dúvida",
    "meio assim",
  ],
  CONSTRAINT_CHANGE: [
    "e se bateria for mais importante?",
    "quero gastar menos",
    "prioriza câmera",
    "agora até 1800",
    "prefiro gastar menos",
    "camera pesa mais",
    "baixa o orçamento",
    "orçamento menor",
  ],
};

const CROSS_FAMILY_PHRASES = [
  "blz, mas mostra outra opção",
  "entendi, mas não me convenceu",
  "gostei, mas tenho medo de errar",
  "quero gastar menos, tem outro?",
  "ok, mas tem certeza?",
  "faz sentido, mas o pessoal gosta?",
  "show, mas qual ficou em segundo?",
  "beleza, mas explica melhor",
  "saquei, mas não curti",
  "entendi, continua valendo?",
  "blz, tem alternativa?",
  "ok, posso comprar sem medo?",
  "faz sentido, mas tá puxado",
  "gostei, mas quero gastar menos",
  "entendi, mostra outra opção",
  "saquei, mas tenho medo",
  "show, o pessoal recomenda?",
  "beleza, você compraria?",
  "ok, qual plano b?",
  "blz, prioriza bateria",
  "entendi, mas tem reclamação?",
  "faz sentido, fecho nele?",
  "show, mas quem quase ganhou?",
  "saquei, mas não me convenceu totalmente",
];

const NORMALIZATION_PHRASES = [
  "vc acha q vale msm?",
  "kkkk slk esse ipone ta caro dms",
  "n quero me ferrar nesse sansung",
  "q fita, mostra outra opcao",
  "sla se compensa",
  "nao quero me arrepender dps",
  "tem ctza msm?",
  "o povo curte?",
  "mostra outra opçao pf",
  "blz entendi vlw",
  "n curti mt n",
  "qro gastar menos",
];

const TONE_PHRASES = [
  "POR FAVOR EXPLICA DIREITO",
  "tenho muito medo de errar",
  "preciso decidir rápido qual compro",
  "qual o chipset desse modelo?",
  "me explica como se eu não entendesse nada",
  "KKKK muito caro slk",
  "bom dia, poderia me ajudar?",
  "aff não entendi nada",
];

function buildScenarioCatalog() {
  const scenarios = [];
  for (const [family, phrases] of Object.entries(FAMILY_PHRASES)) {
    scenarios.push(...phrase(family.slice(0, 3), family, phrases));
  }
  for (const msg of CROSS_FAMILY_PHRASES) {
    scenarios.push({
      id: `CROSS-anchored-${normalizeQuery(msg).slice(0, 28).replace(/\s/g, "_")}`,
      familyExpected: "CROSS_FAMILY",
      userMessage: msg,
      contextType: "anchored",
    });
  }
  for (const msg of NORMALIZATION_PHRASES) {
    scenarios.push({
      id: `NORM-cold-${normalizeQuery(msg).slice(0, 28).replace(/\s/g, "_")}`,
      familyExpected: "INFORMAL_ABBREV_TYPO_COMPOUND",
      userMessage: msg,
      contextType: "cold",
    });
    scenarios.push({
      id: `NORM-anchored-${normalizeQuery(msg).slice(0, 28).replace(/\s/g, "_")}`,
      familyExpected: "INFORMAL_ABBREV_TYPO_COMPOUND",
      userMessage: msg,
      contextType: "anchored",
    });
  }
  for (const msg of TONE_PHRASES) {
    scenarios.push({
      id: `TONE-anchored-${normalizeQuery(msg).slice(0, 28).replace(/\s/g, "_")}`,
      familyExpected: "TONE_ADAPTATION_GUARD",
      userMessage: msg,
      contextType: "anchored",
    });
  }
  return scenarios;
}

export const SCENARIOS = buildScenarioCatalog();

export const SCENARIOS_HTTP_CRITICAL = [
  { familyExpected: "GREETING", userMessage: "oi", contextType: "cold" },
  { familyExpected: "GREETING", userMessage: "koe", contextType: "cold" },
  { familyExpected: "ABOUT_MIA", userMessage: "quem é você?", contextType: "cold" },
  { familyExpected: "ABOUT_MIA", userMessage: "posso confiar?", contextType: "cold" },
  { familyExpected: "ACKNOWLEDGEMENT", userMessage: "blz", contextType: "anchored" },
  { familyExpected: "COMPREHENSION_FAILURE", userMessage: "não entendi", contextType: "anchored" },
  { familyExpected: "COMPREHENSION_SUCCESS", userMessage: "faz sentido", contextType: "anchored" },
  { familyExpected: "ANTI_REGRET", userMessage: "não quero me arrepender", contextType: "anchored" },
  { familyExpected: "CONFIDENCE_CHALLENGE", userMessage: "continua valendo?", contextType: "anchored" },
  { familyExpected: "ALTERNATIVE_EXPLORATION", userMessage: "mostra outra opção", contextType: "anchored" },
  { familyExpected: "SECOND_BEST_DISCOVERY", userMessage: "qual ficou em segundo?", contextType: "anchored" },
  { familyExpected: "CONSTRAINT_CHANGE", userMessage: "quero gastar menos", contextType: "anchored" },
  { familyExpected: "CROSS_FAMILY", userMessage: "blz, mas mostra outra opção", contextType: "anchored" },
  { familyExpected: "SOCIAL_VALIDATION", userMessage: "o pessoal gosta?", contextType: "anchored" },
  { familyExpected: "SOFT_DISAGREEMENT", userMessage: "não me convenceu", contextType: "anchored" },
  { familyExpected: "DECISION_CONFIRMATION", userMessage: "fecho nele?", contextType: "anchored" },
  { familyExpected: "INFORMAL_ABBREV_TYPO_COMPOUND", userMessage: "vc acha q vale msm?", contextType: "anchored" },
  { familyExpected: "GREETING", userMessage: "bom dia", contextType: "anchored" },
  { familyExpected: "ANTI_REGRET", userMessage: "tenho medo de errar", contextType: "anchored" },
  { familyExpected: "CONFIDENCE_CHALLENGE", userMessage: "você compraria?", contextType: "anchored" },
];

function summarizeByFamily(records) {
  const byFamily = {};
  for (const r of records) {
    const key = r.familyExpected;
    if (!byFamily[key]) {
      byFamily[key] = {
        total: 0,
        router: 0,
        routing: 0,
        contract: 0,
        responsePath: 0,
        finalResponse: 0,
        sim: 0,
        partial: 0,
        no: 0,
        productionFallback: 0,
        genericLeak: 0,
        leakTypes: {},
      };
    }
    const b = byFamily[key];
    b.total++;
    if (r.routerOk) b.router++;
    if (r.routingOk) b.routing++;
    if (r.contractOk) b.contract++;
    if (r.responsePathOk) b.responsePath++;
    if (r.finalResponseOk) b.finalResponse++;
    if (r.userPerception === "SIM") b.sim++;
    if (r.userPerception === "PARCIAL") b.partial++;
    if (r.userPerception === "NÃO") b.no++;
    if (r.leakType === "PRODUCTION_FALLBACK_LEAK") b.productionFallback++;
    if (r.leakType === "GENERIC_RESPONSE_LEAK") b.genericLeak++;
    if (r.leakType) b.leakTypes[r.leakType] = (b.leakTypes[r.leakType] || 0) + 1;
  }
  return byFamily;
}

function pct(n, d) {
  return d ? `${((n / d) * 100).toFixed(1)}%` : "0%";
}

function runAudit() {
  console.log("PATCH 8.1A — Production Response Perception Audit (AUDIT ONLY)\n");
  console.log("Production changes: NONE | HTTP in this script: false\n");

  const records = SCENARIOS.map(auditScenario);
  const byFamily = summarizeByFamily(records);

  const total = records.length;
  const productionFallback = records.filter((r) => r.leakType === "PRODUCTION_FALLBACK_LEAK").length;
  const genericLeak = records.filter(
    (r) => r.leakType === "GENERIC_RESPONSE_LEAK" || r.containsGenericFallback
  ).length;
  const sim = records.filter((r) => r.userPerception === "SIM").length;
  const partial = records.filter((r) => r.userPerception === "PARCIAL").length;
  const no = records.filter((r) => r.userPerception === "NÃO").length;

  console.log(`── Cenários locais auditados: ${total} ──\n`);
  console.log(`User perception — SIM: ${sim} (${pct(sim, total)}) | PARCIAL: ${partial} | NÃO: ${no}`);
  console.log(`PRODUCTION_FALLBACK_LEAK: ${productionFallback}`);
  console.log(`GENERIC_RESPONSE_LEAK (total c/ fallback): ${genericLeak}\n`);

  console.log("── Resultado por família ──\n");
  for (const [family, stats] of Object.entries(byFamily).sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(
      `${family} (${stats.total}): Router ${pct(stats.router, stats.total)} | Routing ${pct(stats.routing, stats.total)} | Contract ${pct(stats.contract, stats.total)} | ResponsePath ${pct(stats.responsePath, stats.total)} | Final ${pct(stats.finalResponse, stats.total)} | Perception SIM ${pct(stats.sim, stats.total)} / PARCIAL ${stats.partial} / NÃO ${stats.no} | PFL ${stats.productionFallback}`
    );
  }

  const fullStackFamilies = Object.entries(byFamily)
    .filter(([, s]) => s.sim === s.total && s.productionFallback === 0)
    .map(([f]) => f);
  const internalOnlyFamilies = Object.entries(byFamily)
    .filter(([, s]) => s.router >= s.total * 0.9 && s.sim < s.total * 0.5)
    .map(([f]) => f);

  console.log("\n── Amostra de PRODUCTION_FALLBACK_LEAK (até 12) ──\n");
  for (const r of records.filter((x) => x.leakType === "PRODUCTION_FALLBACK_LEAK").slice(0, 12)) {
    console.log(
      `[${r.id}] ${r.familyExpected}/${r.contextType} "${r.userMessage}" → path=${r.responsePathActual} routerOk=${r.routerOk}`
    );
  }

  console.log("\n── FULL STACK REAL (percepção SIM em 100%) ──\n");
  console.log(fullStackFamilies.length ? fullStackFamilies.join(", ") : "(nenhuma família fechou 100%)");

  console.log("\n── Robustas internamente, fracas na resposta final ──\n");
  console.log(internalOnlyFamilies.length ? internalOnlyFamilies.join(", ") : "(nenhuma neste critério)");

  const dominantLeak = {};
  for (const r of records) {
    if (!r.leakType) continue;
    dominantLeak[r.leakType] = (dominantLeak[r.leakType] || 0) + 1;
  }
  console.log("\n── Causa raiz dominante (leak types) ──\n");
  for (const [k, v] of Object.entries(dominantLeak).sort((a, b) => b[1] - a[1])) {
    console.log(`${k}: ${v}`);
  }

  const coldFallback = records.filter(
    (r) => r.contextType === "cold" && r.containsGenericFallback
  ).length;
  const anchoredFallback = records.filter(
    (r) => r.contextType === "anchored" && r.containsGenericFallback
  ).length;
  console.log(`\n── Fallback genérico ainda aparece: cold=${coldFallback} anchored=${anchoredFallback} ──`);

  const veredict =
    productionFallback === 0 && no === 0
      ? "A) PRODUCTION RESPONSE PERCEPTION ROBUST"
      : "B) PRODUCTION RESPONSE PERCEPTION POSSUI GAP";

  console.log(`\n── VEREDITO ──\n${veredict}`);
  console.log("\nPróximo patch recomendado: PATCH 8.1B — Production Response Perception Fixes");
  console.log("HTTP smoke: node scripts/test-mia-production-response-perception-http-smoke.js (MIA_PERCEPTION_HTTP=1)\n");

  return {
    total,
    productionFallback,
    genericLeak,
    sim,
    partial,
    no,
    byFamily,
    fullStackFamilies,
    internalOnlyFamilies,
    veredict,
    records,
  };
}

const isMain = process.argv[1]?.includes("test-mia-production-response-perception-audit");
if (isMain) {
  runAudit();
  process.exit(0);
}
