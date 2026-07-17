/**
 * PATCH 11A — Social Conversation Behavior Layer
 *
 * Governed behavior contract for social/emotional/mixed/clarification modes.
 * Defines principles — not fixed responses.
 */

import {
  MIA_HUMAN_OBJECTIVES,
  MIA_INTERACTION_MODES,
} from "./miaIntentRecognitionLayer.js";
import {
  enrichBehaviorContractWithHumanExperience,
  experienceContractToVerbalizationInstructions,
} from "./miaHumanConversationExperience.js";
import { perceptionContractToVerbalizationInstructions } from "./miaSocialResponsePerception.js";
import { mixedVerbalizationToInstructions } from "./miaMixedVerbalization.js";

const FORBIDDEN_BEHAVIORS = Object.freeze([
  "force_product_recommendation",
  "list_platform_capabilities",
  "institutional_pitch",
  "claim_human_experiences",
  "forced_commerce_redirect",
  "artificial_engagement_question",
]);

function resolveTone(interactionMode = "", message = "") {
  const length = String(message || "").trim().split(/\s+/).filter(Boolean).length;
  if (interactionMode === MIA_INTERACTION_MODES.EMOTIONAL_SUPPORT) {
    return length <= 8 ? "warm_concise" : "warm_proportional";
  }
  if (length <= 3) return "warm_concise";
  if (length <= 10) return "natural_light";
  return "natural_proportional";
}

function resolveAskFollowUp(recognition = {}) {
  if (recognition.requiresClarification) return true;
  if (recognition.interactionMode === MIA_INTERACTION_MODES.CLARIFICATION) return true;
  if (recognition.humanObjective === MIA_HUMAN_OBJECTIVES.CLARIFY_MESSAGE) return true;
  return false;
}

/**
 * Build governed behavior contract for verbalization.
 *
 * @param {object} recognition - output of recognizeMiaIntent()
 * @returns {object}
 */
export function buildSocialConversationBehaviorContract(recognition = {}, options = {}) {
  const interactionMode = recognition.interactionMode || MIA_INTERACTION_MODES.COMMERCE;
  const isMixed = interactionMode === MIA_INTERACTION_MODES.MIXED;
  const isSocial =
    interactionMode === MIA_INTERACTION_MODES.SOCIAL ||
    interactionMode === MIA_INTERACTION_MODES.EMOTIONAL_SUPPORT ||
    interactionMode === MIA_INTERACTION_MODES.CLARIFICATION;

  const acknowledgeHuman =
    isMixed ||
    interactionMode === MIA_INTERACTION_MODES.EMOTIONAL_SUPPORT ||
    recognition.emotionalRelevance >= 0.35 ||
    recognition.socialRelevance >= 0.45;

  const redirectToCommerce =
    isMixed ||
    (recognition.commercialIntent === true &&
      interactionMode === MIA_INTERACTION_MODES.COMMERCE);

  const responseBehavior = {
    acknowledge: acknowledgeHuman,
    answerDirectly: true,
    askFollowUp: resolveAskFollowUp(recognition),
    redirectToCommerce,
    preservePersonality: true,
    proportionalLength: true,
    tone: resolveTone(interactionMode, recognition.resolvedQuery),
    forbidden: [...FORBIDDEN_BEHAVIORS],
  };

  if (isSocial) {
    responseBehavior.redirectToCommerce = false;
    responseBehavior.forbidden.push("end_with_shopping_offer");
  }

  if (isMixed) {
    responseBehavior.humanFirst = true;
    responseBehavior.continueCommercialPipeline = true;
    responseBehavior.forbidden = responseBehavior.forbidden.filter(
      (item) => item !== "force_product_recommendation"
    );
  }

  if (interactionMode === MIA_INTERACTION_MODES.EMOTIONAL_SUPPORT) {
    responseBehavior.empathyLevel = "proportional_light";
    responseBehavior.forbidden.push("diagnose", "excessive_discourse");
  }

  const baseContract = {
    interactionMode,
    humanObjective: recognition.humanObjective || null,
    commercialObjective: recognition.commercialObjective || null,
    commercialSearchQuery: recognition.commercialSearchQuery || null,
    conversationObjective: recognition.conversationObjective || null,
    primaryIntent: recognition.primaryIntent || null,
    commercialIntent: !!recognition.commercialIntent,
    preserveCommerceContext: !!recognition.preserveCommerceContext,
    domainReentry: recognition.domainReentry || "only_on_user_request",
    requiresClarification: !!recognition.requiresClarification,
    socialFamilies: recognition.socialFamilies || null,
    emotionalRelevance: recognition.emotionalRelevance ?? null,
    responseBehavior,
  };

  return enrichBehaviorContractWithHumanExperience(baseContract, {
    recognition,
    authority: options.authority || null,
    message: options.message || recognition.resolvedQuery || "",
    conversationMessages: options.conversationMessages || [],
  });
}

export function buildFullHumanConversationInstructions(contract = {}) {
  return [
    behaviorContractToVerbalizationInstructions(contract),
    experienceContractToVerbalizationInstructions(contract),
    contract.perceptionVersion ? perceptionContractToVerbalizationInstructions(contract) : "",
    contract.mixedVerbalizationVersion ? mixedVerbalizationToInstructions(contract) : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function behaviorContractToVerbalizationInstructions(contract = {}) {
  const rb = contract.responseBehavior || {};
  const lines = [
    "Comportamento governado (obrigatório):",
    `- Modo de interação: ${contract.interactionMode || "commerce"}`,
    `- Objetivo humano: ${contract.humanObjective || "n/a"}`,
    `- Objetivo comercial: ${contract.commercialObjective || "n/a"}`,
    `- Query comercial (referência verbal): ${contract.commercialSearchQuery || "n/a"}`,
    `- Reconhecer dimensão humana: ${rb.acknowledge ? "sim" : "não"}`,
    `- Responder diretamente: ${rb.answerDirectly ? "sim" : "não"}`,
    `- Pergunta de continuidade: ${rb.askFollowUp ? "somente se natural/necessária" : "evitar"}`,
    `- Redirecionar para compras: ${rb.redirectToCommerce ? "permitido conforme intenção" : "proibido"}`,
    `- Tom: ${rb.tone || "natural_light"}`,
    "- Não inventar experiências pessoais, corpo, rotina ou emoções humanas reais.",
    "- Não encerrar com oferta genérica de produtos ou lista de capacidades.",
  ];

  if (contract.requiresClarification) {
    lines.push("- Mensagem ambígua: use histórico recente quando houver evidência; peça esclarecimento só se necessário.");
  }

  if (rb.humanFirst) {
    lines.push("- Intenção mista: acolha brevemente a parte humana e continue o atendimento comercial.");
  }

  if (rb.empathyLevel) {
    lines.push(`- Empatia: ${rb.empathyLevel}; sem diagnóstico e sem exagero.`);
  }

  return lines.join("\n");
}

export function resolveSocialConversationPromptRole(recognition = {}) {
  const mode = recognition.interactionMode;
  if (mode === MIA_INTERACTION_MODES.EMOTIONAL_SUPPORT) return "emotional_support_reply";
  if (mode === MIA_INTERACTION_MODES.MIXED) return "mixed_intent_reply";
  if (mode === MIA_INTERACTION_MODES.CLARIFICATION) return "clarification_reply";
  if (recognition.socialFamilies?.farewell) return "farewell_reply";
  if (recognition.primaryIntent === "greeting") return "greeting_reply";
  if (recognition.primaryIntent === "acknowledgement") return "acknowledgement_reply";
  if (recognition.primaryIntent === "social_validation") return "social_validation_reply";
  if (recognition.primaryIntent === "about_mia") return "about_mia_reply";
  return "social_conversation_reply";
}
