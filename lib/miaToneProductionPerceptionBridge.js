/**
 * PATCH 8.1B.8 — Tone Production Perception Bridge
 *
 * Wiring downstream: Tone Profile → semantic family → response path → perceived response.
 * Não cria famílias, não altera ranking, winner, anchor ou decision engine.
 */

import { TONE_PROFILES } from "./miaConversationalTone.js";
import {
  isGreetingFamilyQuery,
  isAcknowledgementFamilyQuery,
  isComprehensionFamilyQuery,
  isComprehensionSuccessFamilyQuery,
  isSoftDisagreementFamilyQuery,
  isConfidenceChallengeFamilyQuery,
  isSocialValidationFamilyQuery,
  isAntiRegretFamilyQuery,
  isAlternativeExplorationFamilyQuery,
  isSecondBestDiscoveryFamilyQuery,
  isConstraintChangeFamilyQuery,
  isDecisionConfirmationFamilyQuery,
} from "./miaCognitiveRouter.js";

export const TONE_FAMILY_TO_FLOW = Object.freeze({
  GREETING: "greeting_flow",
  ACKNOWLEDGEMENT: "acknowledgement_flow",
  COMPREHENSION_FAILURE: "comprehension_flow",
  COMPREHENSION_SUCCESS: "comprehension_flow",
  SOFT_DISAGREEMENT: "soft_disagreement_flow",
  CONFIDENCE_CHALLENGE: "confidence_challenge_flow",
  SOCIAL_VALIDATION: "social_validation_flow",
  ANTI_REGRET: "anti_regret_flow",
  CONSTRAINT_CHANGE: "constraint_change_flow",
  SECOND_BEST_DISCOVERY: "second_best_discovery_flow",
  ALTERNATIVE_EXPLORATION: "alternative_exploration_flow",
  DECISION_CONFIRMATION: "decision_confirmation_flow",
});

const TONE_FLOW_KEY = Object.freeze({
  GREETING: "greeting",
  ACKNOWLEDGEMENT: "acknowledgement",
  COMPREHENSION_FAILURE: "comprehension",
  COMPREHENSION_SUCCESS: "comprehension",
  SOFT_DISAGREEMENT: "soft_disagreement",
  CONFIDENCE_CHALLENGE: "confidence_challenge",
  SOCIAL_VALIDATION: "social_validation",
  ANTI_REGRET: "anti_regret",
  CONSTRAINT_CHANGE: "constraint_change",
  SECOND_BEST_DISCOVERY: "second_best_discovery",
  ALTERNATIVE_EXPLORATION: "alternative_exploration",
  DECISION_CONFIRMATION: "decision_confirmation",
});

/** Caminhos ancorados válidos quando tom está ativo e família semântica reconhecida. */
const TONE_ANCHORED_PATH_BY_FAMILY = Object.freeze({
  COMPREHENSION_FAILURE: [
    "context_explanation_anchored",
    "comprehension_anchored",
    "comprehension_reply",
  ],
  ANTI_REGRET: ["decision_context", "anti_regret_anchored", "anti_regret_reply"],
  DECISION_CONFIRMATION: [
    "decision_context",
    "decision_confirmation_anchored",
    "decision_confirmation_reply",
  ],
  CONFIDENCE_CHALLENGE: [
    "context_hold",
    "confidence_challenge_anchored",
    "confidence_challenge_reply",
    "context_explanation_anchored",
  ],
  GREETING: ["context_hold", "conversational", "greeting_reply"],
  SOFT_DISAGREEMENT: ["decision_context", "soft_disagreement_anchored"],
});

const SEMANTIC_FAMILY_DETECTORS = [
  ["GREETING", isGreetingFamilyQuery],
  ["COMPREHENSION_FAILURE", isComprehensionFamilyQuery],
  ["COMPREHENSION_SUCCESS", isComprehensionSuccessFamilyQuery],
  ["ANTI_REGRET", isAntiRegretFamilyQuery],
  ["DECISION_CONFIRMATION", isDecisionConfirmationFamilyQuery],
  ["CONFIDENCE_CHALLENGE", isConfidenceChallengeFamilyQuery],
  ["SOCIAL_VALIDATION", isSocialValidationFamilyQuery],
  ["SOFT_DISAGREEMENT", isSoftDisagreementFamilyQuery],
  ["CONSTRAINT_CHANGE", isConstraintChangeFamilyQuery],
  ["SECOND_BEST_DISCOVERY", isSecondBestDiscoveryFamilyQuery],
  ["ALTERNATIVE_EXPLORATION", isAlternativeExplorationFamilyQuery],
  ["ACKNOWLEDGEMENT", isAcknowledgementFamilyQuery],
];

const TECHNICAL_SPEC_TERMS =
  /\b(chipset|processador|ram|memoria|bateria|tela|hz|latencia|benchmark|fps|nvme|tdp|desempenho|armazenamento)\b/;

function normalizeQuery(message = "") {
  return String(message || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function inferFromCognitiveSignals(cognitiveTurn = null) {
  const sig = cognitiveTurn?.signals || {};
  if (sig.isGreeting) return "GREETING";
  if (sig.isComprehension && !sig.isComprehensionSuccess) return "COMPREHENSION_FAILURE";
  if (sig.isComprehensionSuccess) return "COMPREHENSION_SUCCESS";
  if (sig.isAntiRegret) return "ANTI_REGRET";
  if (sig.isDecisionConfirmation) return "DECISION_CONFIRMATION";
  if (sig.isConfidenceChallenge) return "CONFIDENCE_CHALLENGE";
  if (sig.isSocialValidation) return "SOCIAL_VALIDATION";
  if (sig.isSoftDisagreement) return "SOFT_DISAGREEMENT";
  if (sig.isConstraintChange) return "CONSTRAINT_CHANGE";
  if (sig.isSecondBestDiscovery) return "SECOND_BEST_DISCOVERY";
  if (sig.isAlternativeExploration) return "ALTERNATIVE_EXPLORATION";
  if (sig.isAcknowledgement) return "ACKNOWLEDGEMENT";
  return null;
}

function inferFromConversationAct(conversationAct = "") {
  const act = String(conversationAct || "");
  const map = {
    greeting: "GREETING",
    comprehension: "COMPREHENSION_FAILURE",
    anti_regret: "ANTI_REGRET",
    decision_confirmation: "DECISION_CONFIRMATION",
    confidence_challenge: "CONFIDENCE_CHALLENGE",
    social_validation: "SOCIAL_VALIDATION",
    soft_disagreement: "SOFT_DISAGREEMENT",
    constraint_change: "CONSTRAINT_CHANGE",
    second_best_discovery: "SECOND_BEST_DISCOVERY",
    alternative_exploration: "ALTERNATIVE_EXPLORATION",
    acknowledgement: "ACKNOWLEDGEMENT",
  };
  return map[act] || null;
}

export function isToneSemanticFamilyActive(message = "", family = "") {
  const fn = SEMANTIC_FAMILY_DETECTORS.find(([name]) => name === family)?.[1];
  return fn ? fn(message) : false;
}

/**
 * Infere família semântica dominante para mensagens com tom adaptativo.
 * Precedência: detector semântico → sinais cognitivos → conversationAct.
 */
export function inferToneDominantFamily(message = "", cognitiveTurn = null, toneContext = null) {
  for (const [family, fn] of SEMANTIC_FAMILY_DETECTORS) {
    if (fn(message)) return family;
  }

  const fromSignals = inferFromCognitiveSignals(cognitiveTurn);
  if (fromSignals) return fromSignals;

  const fromAct = inferFromConversationAct(toneContext?.conversationAct);
  if (fromAct) return fromAct;

  return null;
}

export function resolveToneProductionFlowPath(dominantFamily = null) {
  if (!dominantFamily || dominantFamily === "TONE_ADAPTATION_GUARD") return null;
  return TONE_FAMILY_TO_FLOW[dominantFamily] || null;
}

export function resolveToneFlowHandlerKey(dominantFamily = null) {
  if (!dominantFamily) return null;
  return TONE_FLOW_KEY[dominantFamily] || null;
}

export function isToneProfileActive(toneProfile = "") {
  return !!toneProfile && toneProfile !== TONE_PROFILES.NEUTRAL_DEFAULT;
}

export function isToneAwareAnchoredProductionPath(
  actualPath = "",
  dominantFamily = null,
  toneProfile = "",
  message = ""
) {
  if (!actualPath || !dominantFamily || !isToneProfileActive(toneProfile)) return false;

  const allowed = TONE_ANCHORED_PATH_BY_FAMILY[dominantFamily];
  if (allowed?.includes(actualPath)) return true;

  if (
    dominantFamily === "CONFIDENCE_CHALLENGE" &&
    actualPath === "context_hold" &&
    toneProfile === TONE_PROFILES.TECHNICAL &&
    TECHNICAL_SPEC_TERMS.test(normalizeQuery(message)) &&
    /\b(desse|deste|desta|dessa|modelo|produto)\b/.test(normalizeQuery(message))
  ) {
    return true;
  }

  if (
    dominantFamily === "GREETING" &&
    actualPath === "context_hold" &&
    toneProfile === TONE_PROFILES.FORMAL_POLITE &&
    /\b(bom dia|boa tarde|boa noite)\b/.test(normalizeQuery(message))
  ) {
    return true;
  }

  return false;
}

export function isToneAwareProductionPath(
  actualPath = "",
  dominantFamily = null,
  toneProfile = "",
  message = ""
) {
  if (!actualPath) return false;

  const expectedFlow = resolveToneProductionFlowPath(dominantFamily);
  if (expectedFlow && actualPath === expectedFlow) return true;

  if (actualPath.endsWith("_flow") && isToneProfileActive(toneProfile) && dominantFamily) {
    return actualPath === expectedFlow || !expectedFlow;
  }

  return isToneAwareAnchoredProductionPath(actualPath, dominantFamily, toneProfile, message);
}

export function evaluateToneAdaptationPerception(ctx = {}) {
  const {
    toneProfile = TONE_PROFILES.NEUTRAL_DEFAULT,
    dominantFamily = null,
    responsePathActual = "",
    containsGenericFallback = false,
    userMessage = "",
  } = ctx;

  const resolvedDominant =
    dominantFamily && dominantFamily !== "TONE_ADAPTATION_GUARD"
      ? dominantFamily
      : inferToneDominantFamily(userMessage, ctx.cognitiveTurn, {
          conversationAct: ctx.conversationAct,
        });

  const expectedFlow = resolveToneProductionFlowPath(resolvedDominant);
  const toneActive = isToneProfileActive(toneProfile);

  const responsePathOk =
    !containsGenericFallback &&
    (responsePathActual === expectedFlow ||
      isToneAwareProductionPath(
        responsePathActual,
        resolvedDominant,
        toneProfile,
        userMessage
      ) ||
      (responsePathActual.endsWith("_flow") && toneActive && !!resolvedDominant));

  const containsFamilySpecificLanguage =
    !containsGenericFallback &&
    (responsePathOk ||
      responsePathActual.endsWith("_flow") ||
      isToneAwareAnchoredProductionPath(
        responsePathActual,
        resolvedDominant,
        toneProfile,
        userMessage
      ));

  let userPerception = "NÃO";
  if (containsGenericFallback) {
    userPerception = "NÃO";
  } else if (responsePathOk && containsFamilySpecificLanguage) {
    if (toneActive || responsePathActual.endsWith("_flow")) {
      userPerception = "SIM";
    } else {
      userPerception = "PARCIAL";
    }
  } else if (toneActive && resolvedDominant) {
    userPerception = "PARCIAL";
  }

  return {
    resolvedDominant,
    expectedFlow,
    responsePathOk,
    containsFamilySpecificLanguage,
    userPerception,
    toneActive,
  };
}

export function promoteToneDominantResponsePath({
  message = "",
  cognitiveTurn = null,
  routingDecision = null,
  familyFlowChecks = [],
}) {
  const dominant = inferToneDominantFamily(message, cognitiveTurn, {
    conversationAct: routingDecision?.conversationAct,
  });
  if (!dominant) return null;

  const flowPath = resolveToneProductionFlowPath(dominant);
  const flowKey = resolveToneFlowHandlerKey(dominant);
  if (!flowPath || !flowKey) return null;

  const check = familyFlowChecks.find((item) => item.key === flowKey);
  if (check?.gate || isToneSemanticFamilyActive(message, dominant)) {
    return { flowPath, flowKey, dominantFamily: dominant };
  }

  return null;
}
