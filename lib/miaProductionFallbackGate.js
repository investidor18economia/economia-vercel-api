/**
 * PATCH 8.1B.1 — Production Fallback Gate
 *
 * Generic mechanism: when a conversational family is already recognized,
 * institutional directReply / general_answer fallback must not win.
 *
 * Does NOT expand vocabulary. Does NOT decide ranking/winner/anchor authority.
 */

import {
  MIA_TURN_TYPES,
  isAboutMiaFamilyQuery,
  isGreetingFamilyQuery,
  isAcknowledgementFamilyQuery,
  isComprehensionFamilyQuery,
  isComprehensionSemanticFamilyQuery,
  isSoftDisagreementFamilyQuery,
  isDecisionConfirmationFamilyQuery,
  isAntiRegretFamilyQuery,
  isConfidenceChallengeFamilyQuery,
  isSocialValidationFamilyQuery,
  isSecondBestDiscoveryFamilyQuery,
  isAlternativeExplorationFamilyQuery,
  isConstraintChangeFamilyQuery,
  getDominantMasTailIntent,
} from "./miaCognitiveRouter.js";
import { detectGenericConversationalFallback } from "./miaConversationalFamilyClosureStandard.js";

const FAMILY_SIGNAL_KEYS = Object.freeze([
  "isGreeting",
  "isAcknowledgement",
  "isComprehension",
  "isAboutMia",
  "isSoftDisagreement",
  "isDecisionConfirmation",
  "isAntiRegret",
  "isConfidenceChallenge",
  "isSocialValidation",
  "isSecondBestDiscovery",
  "isAlternativeExploration",
  "isConstraintChange",
]);

const FAMILY_QUERY_DETECTORS = Object.freeze([
  ["greeting", (q, o) => isGreetingFamilyQuery(q)],
  ["acknowledgement", (q) => isAcknowledgementFamilyQuery(q)],
  ["comprehension", (q) => isComprehensionFamilyQuery(q) || isComprehensionSemanticFamilyQuery(q)],
  ["about_mia", (q, o) => isAboutMiaFamilyQuery(q, o)],
  ["soft_disagreement", (q) => isSoftDisagreementFamilyQuery(q)],
  ["decision_confirmation", (q) => isDecisionConfirmationFamilyQuery(q)],
  ["anti_regret", (q) => isAntiRegretFamilyQuery(q)],
  ["confidence_challenge", (q) => isConfidenceChallengeFamilyQuery(q)],
  ["social_validation", (q) => isSocialValidationFamilyQuery(q)],
  ["second_best_discovery", (q) => isSecondBestDiscoveryFamilyQuery(q)],
  ["alternative_exploration", (q) => isAlternativeExplorationFamilyQuery(q)],
  ["constraint_change", (q) => isConstraintChangeFamilyQuery(q)],
]);

const FAMILY_MODE_INTENT = Object.freeze({
  greeting: { mode: "greeting", intent: "greeting" },
  acknowledgement: { mode: "acknowledgement", intent: "acknowledgement" },
  comprehension: { mode: "comprehension", intent: "comprehension" },
  about_mia: { mode: "about_mia", intent: "about_mia" },
  soft_disagreement: { mode: "soft_disagreement", intent: "soft_disagreement" },
  decision_confirmation: { mode: "decision_confirmation", intent: "decision_confirmation" },
  anti_regret: { mode: "anti_regret", intent: "anti_regret" },
  confidence_challenge: { mode: "confidence_challenge", intent: "confidence_challenge" },
  social_validation: { mode: "social_validation", intent: "social_validation" },
  second_best_discovery: { mode: "second_best_discovery", intent: "second_best_discovery" },
  alternative_exploration: { mode: "alternative_exploration", intent: "alternative_exploration" },
  constraint_change: { mode: "constraint_change", intent: "constraint_change" },
});

const CONVERSATIONAL_ROUTING_ACTS = new Set([
  "greeting",
  "acknowledgement",
  "about_mia",
  "comprehension",
  "soft_disagreement",
  "decision_confirmation",
  "anti_regret",
  "confidence_challenge",
  "social_validation",
  "second_best_discovery",
  "alternative_exploration",
  "constraint_change",
  "cognitive_explanation_anchored",
  "contextual_follow_up",
  "comparison_axis_followup",
  "challenge_or_reaction",
  "anchored_reaction",
  "context_question",
  "anti_regret",
]);

const ANCHORED_CONTEXTUAL_TURN_TYPES = new Set([
  MIA_TURN_TYPES.EXPLANATION_REQUEST,
  MIA_TURN_TYPES.OBJECTION,
  MIA_TURN_TYPES.ALTERNATIVE_REQUEST,
  MIA_TURN_TYPES.PRIORITY_SHIFT,
  MIA_TURN_TYPES.REFINEMENT,
  MIA_TURN_TYPES.FOLLOW_UP,
  MIA_TURN_TYPES.VALUE_QUESTION,
  MIA_TURN_TYPES.REACTION,
  MIA_TURN_TYPES.CONVERSATIONAL,
  MIA_TURN_TYPES.COMMERCIAL_QUESTION,
  MIA_TURN_TYPES.ABOUT_MIA,
]);

const CONVERSATIONAL_ROUTING_HINTS = new Set([
  "greeting_open",
  "greeting_anchored",
  "acknowledgement_reply",
  "acknowledgement_anchored",
  "about_mia_reply",
  "about_mia_anchored",
  "comprehension_reply",
  "comprehension_anchored",
  "soft_disagreement_reply",
  "soft_disagreement_anchored",
  "decision_confirmation_reply",
  "decision_confirmation_anchored",
  "anti_regret_reply",
  "anti_regret_anchored",
  "confidence_challenge_reply",
  "confidence_challenge_anchored",
  "social_validation_reply",
  "social_validation_anchored",
  "second_best_discovery_reply",
  "second_best_discovery_anchored",
  "alternative_exploration_reply",
  "alternative_exploration_anchored",
  "constraint_change_reply",
  "constraint_change_anchored",
  "cognitive_explanation_anchored",
  "anchored_contextual_follow_up",
  "contextual_follow_up",
  "comparison_axis_followup",
]);

const INSTITUTIONAL_ROUTING_HINTS = new Set([
  "general_answer",
  "explicit_new_search",
  "default_product_search",
  "new_commercial_search",
  "context_hold",
  "context_decision",
]);

/**
 * @param {object} [contextResolution]
 * @returns {boolean}
 */
export function isInstitutionalGenericDirectReply(contextResolution = {}) {
  const text = contextResolution?.directReply;
  if (!text || typeof text !== "string") return false;
  return detectGenericConversationalFallback(text);
}

const SIGNAL_TO_FAMILY = Object.freeze({
  isGreeting: "greeting",
  isAcknowledgement: "acknowledgement",
  isComprehension: "comprehension",
  isAboutMia: "about_mia",
  isSoftDisagreement: "soft_disagreement",
  isDecisionConfirmation: "decision_confirmation",
  isAntiRegret: "anti_regret",
  isConfidenceChallenge: "confidence_challenge",
  isSocialValidation: "social_validation",
  isSecondBestDiscovery: "second_best_discovery",
  isAlternativeExploration: "alternative_exploration",
  isConstraintChange: "constraint_change",
});

function detectFamilyFromSignals(signals = {}) {
  for (const key of FAMILY_SIGNAL_KEYS) {
    if (signals[key] === true) {
      return { family: SIGNAL_TO_FAMILY[key] || key, source: `signal:${key}` };
    }
  }
  return null;
}

const MAS_TAIL_TO_FAMILY = Object.freeze({
  ANTI_REGRET: "anti_regret",
  CONFIDENCE_CHALLENGE: "confidence_challenge",
  SOCIAL_VALIDATION: "social_validation",
  COMPREHENSION_FAILURE: "comprehension",
  SOFT_DISAGREEMENT: "soft_disagreement",
  CONSTRAINT_CHANGE: "constraint_change",
  SECOND_BEST_DISCOVERY: "second_best_discovery",
  ALTERNATIVE_EXPLORATION: "alternative_exploration",
  DECISION_CONFIRMATION: "decision_confirmation",
});

function detectFamilyFromQueries(query = "", hasActiveAnchor = false) {
  const masTail = getDominantMasTailIntent(query);
  if (masTail && MAS_TAIL_TO_FAMILY[masTail]) {
    return { family: MAS_TAIL_TO_FAMILY[masTail], source: `mas_tail:${masTail}` };
  }

  const opts = { hasActiveAnchor };
  for (const [family, detector] of FAMILY_QUERY_DETECTORS) {
    if (detector(query, opts)) {
      return { family, source: "family_query" };
    }
  }
  return null;
}

function detectFamilyFromRouting(routingDecision = {}) {
  const act = routingDecision?.conversationAct || "";
  if (act && CONVERSATIONAL_ROUTING_ACTS.has(act)) {
    return { family: act, source: `routing_act:${act}` };
  }

  const hint = String(routingDecision?.responsePathHint || "");
  if (hint && CONVERSATIONAL_ROUTING_HINTS.has(hint)) {
    return {
      family: hint.replace(/_(reply|anchored|open)$/, ""),
      source: `routing_hint:${hint}`,
    };
  }

  if (hint && !INSTITUTIONAL_ROUTING_HINTS.has(hint) && /_reply$|_anchored$|_open$/.test(hint)) {
    return { family: hint.replace(/_(reply|anchored|open)$/, ""), source: `routing_hint:${hint}` };
  }

  return null;
}

function detectFamilyFromTurnType(cognitiveTurn = {}, hasActiveAnchor = false) {
  const turnType = cognitiveTurn?.turnType || "";
  if (!turnType || turnType === MIA_TURN_TYPES.UNKNOWN || turnType === MIA_TURN_TYPES.NEW_SEARCH) {
    return null;
  }

  if (hasActiveAnchor && ANCHORED_CONTEXTUAL_TURN_TYPES.has(turnType)) {
    return { family: turnType.toLowerCase(), source: `turn_type:${turnType}` };
  }

  if (turnType === MIA_TURN_TYPES.ABOUT_MIA) {
    return { family: "about_mia", source: `turn_type:${turnType}` };
  }

  return null;
}

function resolveModeIntent(familyKey = "") {
  if (FAMILY_MODE_INTENT[familyKey]) return FAMILY_MODE_INTENT[familyKey];

  const normalized = String(familyKey || "").replace(/-/g, "_");
  if (FAMILY_MODE_INTENT[normalized]) return FAMILY_MODE_INTENT[normalized];

  return { mode: normalized || "conversational", intent: null };
}

/**
 * Detect whether a conversational family is already recognized by Router/Routing.
 *
 * @param {{
 *   query?: string,
 *   hasActiveAnchor?: boolean,
 *   cognitiveTurn?: object|null,
 *   routingDecision?: object|null,
 * }} input
 */
export function detectRecognizedConversationalFamily(input = {}) {
  const {
    query = "",
    hasActiveAnchor = false,
    cognitiveTurn = null,
    routingDecision = null,
  } = input;

  const candidates = [
    detectFamilyFromSignals(cognitiveTurn?.signals),
    detectFamilyFromQueries(query, hasActiveAnchor),
    detectFamilyFromRouting(routingDecision),
    detectFamilyFromTurnType(cognitiveTurn, hasActiveAnchor),
  ].filter(Boolean);

  if (!candidates.length) {
    return { recognized: false, family: null, source: null, mode: null, intent: null };
  }

  const winner = candidates[0];
  const mapped = resolveModeIntent(winner.family);

  return {
    recognized: true,
    family: winner.family,
    source: winner.source,
    mode: mapped.mode,
    intent: mapped.intent,
    candidates,
  };
}

/**
 * @param {{
 *   query?: string,
 *   hasActiveAnchor?: boolean,
 *   clearNewCommercialSearch?: boolean,
 *   cognitiveTurn?: object|null,
 *   routingDecision?: object|null,
 *   contextResolution?: object|null,
 * }} input
 */
export function applyProductionFallbackGate(input = {}) {
  const {
    query = "",
    hasActiveAnchor = false,
    clearNewCommercialSearch = false,
    cognitiveTurn = null,
    routingDecision = null,
    contextResolution = null,
  } = input;

  const detection = detectRecognizedConversationalFamily({
    query,
    hasActiveAnchor,
    cognitiveTurn,
    routingDecision,
  });

  if (clearNewCommercialSearch || !detection.recognized) {
    return {
      applied: false,
      detection,
      shouldBypassGeneralAnswerFallback: detection.recognized === true,
    };
  }

  const hasInstitutionalDirectReply = isInstitutionalGenericDirectReply(contextResolution);
  const patch = {
    directReply: null,
    clearContext: false,
  };

  if (
    detection.mode &&
    (!contextResolution?.mode || contextResolution.mode === "general_answer")
  ) {
    patch.mode = detection.mode;
  }

  return {
    applied: hasInstitutionalDirectReply,
    detection,
    shouldBypassGeneralAnswerFallback: true,
    contextResolutionPatch: hasInstitutionalDirectReply ? patch : null,
    intentPatch: detection.intent || null,
  };
}

/**
 * Whether the legacy general_answer JSON fallback (post-directReply) must be skipped.
 */
export function shouldBypassInstitutionalGeneralAnswerFallback(
  recognition = {},
  { intentPreservationApplied = false, isAnchoredContextualTurn = false } = {}
) {
  if (intentPreservationApplied || isAnchoredContextualTurn) return true;
  return recognition?.recognized === true;
}
