/**
 * PATCH 11A / 11B — Intent Recognition Layer
 *
 * Central authority for human interaction intent before verbalization.
 * MIA owns the intelligence; the LLM only verbalizes governed behavior.
 *
 * PATCH 11B — ENTITY ≠ INTENT: entity mention alone never authorizes commerce.
 * No phrase-specific hardcodes — operates on generalized signal categories.
 */

import {
  isAboutMiaFamilyQuery,
  isGreetingFamilyQuery,
  isAcknowledgementFamilyQuery,
  isSocialValidationFamilyQuery,
  isComprehensionFamilyQuery,
  isComprehensionSuccessFamilyQuery,
  isSoftDisagreementFamilyQuery,
} from "./miaCognitiveRouter.js";

export const MIA_INTERACTION_MODES = Object.freeze({
  COMMERCE: "commerce",
  SOCIAL: "social",
  EMOTIONAL_SUPPORT: "emotional_support",
  MIXED: "mixed",
  CLARIFICATION: "clarification",
  IDENTITY: "identity",
  SAFETY: "safety",
});

export const MIA_HUMAN_OBJECTIVES = Object.freeze({
  INITIATE_CONTACT: "initiate_contact",
  CREATE_CONNECTION: "create_connection",
  EXPRESS_FEELING: "express_feeling",
  RECEIVE_ACKNOWLEDGMENT: "receive_acknowledgment",
  CLOSE_INTERACTION: "close_interaction",
  CONTINUE_CONVERSATION: "continue_conversation",
  PURCHASE_HELP: "purchase_help",
  MIXED_HUMAN_COMMERCE: "mixed_human_commerce",
  CLARIFY_MESSAGE: "clarify_message",
  LEARN_ABOUT_MIA: "learn_about_mia",
});

const COMMERCIAL_TOKEN_PATTERN =
  /\b(comprar|compro|comprei|preco|preço|produto|produtos|recomenda|recomende|indica|indique|busca|buscar|procurar|procuro|quero|preciso|precisamos|escolher|notebook|celular|smartphone|tv|monitor|cadeira|mouse|teclado|camera|gamer|oferta|promo|barato|barata|comparar|compare|compara|versus|\bvs\b|vale a pena|custo beneficio|custo-beneficio|orcamento|orçamento)\b/;

const HIGH_RISK_PATTERN =
  /\b(suicid|me matar|quero morrer|nao quero viver|não quero viver|autolesao|autolesão|automutil|me cortar|overdose|emergencia medica|emergência médica|infarto|ataque cardiaco|ataque cardíaco)\b/;

const FIRST_PERSON_PATTERN = /\b(eu|me|minha|minha|meu|to|tô|tava|estou|estava|sou|fui|andei|andamos)\b/;

const TEMPORAL_LIFE_PATTERN =
  /\b(hoje|ontem|amanha|amanhã|semana|dia|rotina|vida|clima|calor|frio|chuva|madrugada|tarde|noite)\b/;

const STATE_DESCRIPTOR_PATTERN =
  /\b(cansad\w*|cansativ\w*|cansando|cansa|corrido|puxad\w*|desanimad\w*|animad\w*|feliz|trist\w*|estressad\w*|exaust\w*|desgastad\w*|sobrecarregad\w*|sem cabeca|sem cabeça|desmotivad\w*|empolgad\w*|ansios\w*|preocupad\w*|irritad\w*|desconfort\w*|pesad\w*|dificil|pessimo|ruim|bom)\b/;

const REACTION_INTERJECTION_PATTERN =
  /^(kkk+|rs+|haha+|hehe+|pois e|pois eh|pois é|ne|ue|ueh|hmm+|hum+|ah+|oh+|e ai|e aí|eae|opa|show|massa|legal|top|demais|verdade|real|exato|justo|justamente|pois|sim|claro|hein|ne|ta|ta)$/;

const INFORMAL_EXHAUSTION_PATTERN =
  /\b(mo cansad\w*|muito cansad\w*|cansad\w*|sem cabeca|sem cabeça)\b/;

const LAUGHTER_INLINE_PATTERN = /\b(kkk+|rs+|haha+|hehe+)\b/;

const PASSIVE_BROWSING_PATTERN =
  /\b(só olhando|so olhando|só vendo|so vendo|só curioso|so curioso|só curiosa|so curiosa|só conversar|so conversar|só bater papo|so bater papo|só trocar ideia|so trocar ideia|to só|tô só|ta só|tá só|só descansando|so descansando|descansando|passando aqui|modo relax)\b/;

const DESIRE_TO_CHAT_PATTERN =
  /\b(só queria conversar|so queria conversar|queria conversar|bater papo|trocar ideia|falar um pouco|conversar um pouco)\b/;

const POST_PURCHASE_ACK_PATTERN =
  /\b(comprei|compramos|fechei|peguei|deu certo|deu boa|chegou|funcionou|gostei do produto|fechei a compra)\b/;

const INFORMAL_GREETING_PATTERN =
  /^(o+i+|e+a+e*|eae|opa|fala|salve|bom dia+|boa tarde+|boa noite+|bom dia|boa tarde|boa noite)\b/;

const WEATHER_LIFE_COMMENTARY_PATTERN =
  /\b(calor|frio|chuva|tempo|clima|sem(?:ana)?)\b/;

const COMPLIMENT_PATTERN =
  /\b(engracad|engraçad|inteligent|espert|mandou bem|boa mia|brab[ao]|incrivel|incrível|legal demais|gostei de voce|gostei de vc)\b/;

const FAREWELL_PATTERN =
  /\b(tchau|ate logo|até logo|ate mais|até mais|falou|flw|fui|vou nessa|to indo|tô indo|boa noite pra voce|boa noite pra você)\b/;

function normalizeMessage(message = "") {
  return String(message || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu, " ")
    .replace(/[?!.,;:…]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenCount(message = "") {
  const q = normalizeMessage(message);
  if (!q) return 0;
  return q.split(" ").filter(Boolean).length;
}

function hasCommercialTokens(message = "") {
  return COMMERCIAL_TOKEN_PATTERN.test(normalizeMessage(message));
}

function detectActiveCommercialAsk(message = "") {
  const q = normalizeMessage(message);
  if (
    DESIRE_TO_CHAT_PATTERN.test(q) ||
    /\b(so|só)\s+queria\s+conversar\b/.test(q) ||
    /\bqueria\s+(só|so)\s+conversar\b/.test(q)
  ) {
    return false;
  }
  return /\b(preciso|precisamos|quero|queria\s+(comprar|um|uma|trocar|escolher|procurar|buscar)|procuro|procurar|procure|buscar|busco|busque|escolher|comparar|compare|compara|versus|\bvs\b|vale\s+(?:\w+\s+)*a\s+pena|recomend\w*|indique|indica|melhor preco|melhor preço|oferta|promo\w*|me ajuda|ajuda com|ajudar com|ajuda a escolher|quanto custa|quanto e|quanto é|qual o preco|qual o preço|onde\s+(?:compr\w*|encontr\w*|achar\w*)|preciso trocar)\b/.test(
    q
  );
}

export { detectActiveCommercialAsk };

const RESEARCH_PROCESS_VERB_PATTERN =
  /\b(pesquisar|pesquisa|procurar|procura|escolher|decidir|comparar|opcoes|opções|olhar|buscar|busca)\b/;

const POSSESSIVE_REPORT_PATTERN =
  /\b(meu|minha|meus|minhas)\b.{0,48}\b(velh\w*|trav\w*|queim\w*|parou|pifou|estrag\w*|morreu|lento|nao funciona|não funciona|nao liga|não liga|pif\w*)\b/;

const AESTHETIC_OPINION_PATTERN =
  /\b(acho|achei|parece|adorei|curti|gostei)\b|\b(bonit\w*|lind\w*|fei\w*|elegante|interessante|design legal|design bonito)\b/;

const DEMONSTRATIVE_PATTERN = /\b(esse|essa|este|esta|o|a|um|uma)\b/;

const CATEGORY_COMMENTARY_PATTERN =
  /\b(e|é|ta|tá)\s+(car\w*|complicad\w*|pessoal|chato|difícil|dificil)\b|\b(muito car\w*|muito pessoal|da medo|da preguic\w*|da preguiça)\b|\b(da|dá)\s+(muita\s+)?dor de cabeca\b|\b(da|dá)\s+(muita\s+)?dor de cabeça\b/;

const NARRATIVE_PRODUCT_MENTION_PATTERN =
  /\b(vi|viu|comprei|ganhei|recebi)\b.{0,40}\b(hoje|ontem|semana|agora)\b/;

const EXPERTISE_CHAT_WITHOUT_ASK_PATTERN =
  /\b(voce|vc)\s+entende\s+de\b|\b(desabaf\w*|confus\w* com tantas|conversar sobre)\b/;

const EXPLICIT_COMMERCIAL_QUESTION_PATTERN =
  /\b(qual|quais|quanto custa|onde (compr|encontr|achar)|me recomend|me indica|me ajuda a escolher|me ajuda a comprar)\b/;

/**
 * PATCH 11B — Detect product/category entity mention without commercial authorization.
 * Category-agnostic semantic families (not product-name lists).
 */
export function detectConversationalEntityMentionFrame(message = "") {
  const q = normalizeMessage(message);
  if (!q) return false;

  if (detectActiveCommercialAsk(message)) return false;

  if (
    EXPLICIT_COMMERCIAL_QUESTION_PATTERN.test(q) &&
    (/\b(ate|até|abaixo|menos de|barat|caro|melhor|vale|custo|reais|r\$)\b/.test(q) ||
      /\d/.test(q))
  ) {
    return false;
  }

  if (/\b(quero comprar|preciso de|preciso comprar|procuro|busco|buscar)\b/.test(q)) {
    return false;
  }

  if (
    /\b(cansad\w*|cansando|chega|nao aguento|não aguento|enjo\w*|preguic\w*)\b/.test(q) &&
    RESEARCH_PROCESS_VERB_PATTERN.test(q)
  ) {
    return true;
  }

  if (
    RESEARCH_PROCESS_VERB_PATTERN.test(q) &&
    /\b(complicad\w*|dificil|difícil|medo|preguic\w*|cans\w*|dor de cabeca|dor de cabeça)\b/.test(q)
  ) {
    return true;
  }

  if (
    /\b(comprar|compra|escolher|decidir)\b/.test(q) &&
    /\b(complicad\w*|dificil|difícil|medo|preguic\w*|cans\w*|dor de cabeca|dor de cabeça)\b/.test(q)
  ) {
    return true;
  }

  if (AESTHETIC_OPINION_PATTERN.test(q) && DEMONSTRATIVE_PATTERN.test(q)) {
    return true;
  }

  if (
    /\b(bonit\w*|lind\w*|design legal|elegante|interessante)\b/.test(q) &&
    !/\b(recomend|indica|quanto custa|preco|preço|comprar|procuro|busco|melhor opcao|melhor opção)\b/.test(q)
  ) {
    return true;
  }

  if (POSSESSIVE_REPORT_PATTERN.test(q)) {
    return true;
  }

  if (CATEGORY_COMMENTARY_PATTERN.test(q)) {
    return true;
  }

  if (NARRATIVE_PRODUCT_MENTION_PATTERN.test(q)) {
    return true;
  }

  if (EXPERTISE_CHAT_WITHOUT_ASK_PATTERN.test(q)) {
    return true;
  }

  if (PASSIVE_BROWSING_PATTERN.test(q)) {
    return true;
  }

  if (/\b(so|só)\s+(convers|coment|falando|olhando|vendo)\b/.test(q)) {
    return true;
  }

  if (/\bconversando\b/.test(q) && /\b(so|só|estou|to|tô)\b/.test(q)) {
    return true;
  }

  return false;
}

export function shouldTreatCategoryMentionAsCommercialSignal(
  message = "",
  { hasBudget = false, hasCategory = false } = {}
) {
  if (!message || !hasCategory) return false;
  if (detectConversationalEntityMentionFrame(message)) return false;
  return detectActiveCommercialAsk(message) || !!hasBudget;
}

function detectHighRiskSignal(message = "") {
  return HIGH_RISK_PATTERN.test(normalizeMessage(message));
}

function detectExistingSocialFamilySignals(message = "", cognitiveSignals = {}) {
  const q = normalizeMessage(message);
  return {
    greeting: !!(
      cognitiveSignals.isGreeting ||
      isGreetingFamilyQuery(message) ||
      INFORMAL_GREETING_PATTERN.test(q)
    ),
    acknowledgement: !!(cognitiveSignals.isAcknowledgement || isAcknowledgementFamilyQuery(message)),
    socialValidation: !!(cognitiveSignals.isSocialValidation || isSocialValidationFamilyQuery(message)),
    aboutMia: !!(cognitiveSignals.isAboutMia || isAboutMiaFamilyQuery(message)),
    comprehension:
      !!(cognitiveSignals.isComprehension || isComprehensionFamilyQuery(message)),
    comprehensionSuccess:
      !!(cognitiveSignals.isComprehensionSuccess || isComprehensionSuccessFamilyQuery(message)),
    softDisagreement:
      !!(cognitiveSignals.isSoftDisagreement || isSoftDisagreementFamilyQuery(message)),
    compliment: COMPLIMENT_PATTERN.test(q),
    farewell: FAREWELL_PATTERN.test(q),
    reaction: REACTION_INTERJECTION_PATTERN.test(q) || LAUGHTER_INLINE_PATTERN.test(q),
    passiveBrowsing: PASSIVE_BROWSING_PATTERN.test(q),
    desireToChat: DESIRE_TO_CHAT_PATTERN.test(q),
    postPurchaseAck:
      POST_PURCHASE_ACK_PATTERN.test(q) &&
      (isAcknowledgementFamilyQuery(message) ||
        /\b(valeu|obrigad\w*|tmj|deu certo)\b/.test(q)),
  };
}

function detectHumanDimensionSignal(message = "") {
  const q = normalizeMessage(message);
  if (!q || detectHighRiskSignal(q)) return false;

  if (PASSIVE_BROWSING_PATTERN.test(q) || DESIRE_TO_CHAT_PATTERN.test(q)) return true;
  if (REACTION_INTERJECTION_PATTERN.test(q)) return true;
  if (LAUGHTER_INLINE_PATTERN.test(q) && tokenCount(q) <= 6) return true;
  if (WEATHER_LIFE_COMMENTARY_PATTERN.test(q) && tokenCount(q) <= 12) return true;

  const hasLifeFrame =
    TEMPORAL_LIFE_PATTERN.test(q) ||
    /\b(viver|rotina|trabalho|expediente|correria)\b/.test(q);
  const hasPersonalState =
    FIRST_PERSON_PATTERN.test(q) &&
    (STATE_DESCRIPTOR_PATTERN.test(q) || hasLifeFrame);

  if (hasPersonalState) return true;

  if (
    (TEMPORAL_LIFE_PATTERN.test(q) || /\b(viver|vida)\b/.test(q)) &&
    STATE_DESCRIPTOR_PATTERN.test(q)
  ) {
    return true;
  }

  if (hasLifeFrame && FIRST_PERSON_PATTERN.test(q) && tokenCount(q) <= 14) {
    return true;
  }

  if (INFORMAL_EXHAUSTION_PATTERN.test(q) && FIRST_PERSON_PATTERN.test(q)) {
    return true;
  }

  if (/\b(que|q)\s+(semana|dia)\b/.test(q) && tokenCount(q) <= 6) {
    return true;
  }

  return detectEmotionalDimension(message);
}

function detectCasualCommentarySignal(message = "") {
  const q = normalizeMessage(message);
  if (!q) return false;
  if (detectConversationalEntityMentionFrame(message)) return true;
  if (hasCommercialTokens(q) && detectActiveCommercialAsk(message)) return false;
  if (hasCommercialTokens(q) && detectHumanDimensionSignal(message)) return true;
  if (hasCommercialTokens(q)) return false;
  return detectHumanDimensionSignal(message);
}

function detectEmotionalDimension(message = "") {
  const q = normalizeMessage(message);
  if (!q || detectHighRiskSignal(q)) return false;
  return (
    (FIRST_PERSON_PATTERN.test(q) || /\b(to|tô|ta|tá|estou)\b/.test(q)) &&
    STATE_DESCRIPTOR_PATTERN.test(q)
  );
}

function detectLightEmotionalSignal(message = "") {
  const q = normalizeMessage(message);
  if (!q || detectHighRiskSignal(q)) return false;
  if (hasCommercialTokens(q)) return false;
  return detectEmotionalDimension(message);
}

function scoreCommercialRelevance(message = "", signals = {}, sessionContext = {}) {
  const families = detectExistingSocialFamilySignals(message, {});

  if (
    detectConversationalEntityMentionFrame(message) &&
    !detectActiveCommercialAsk(message)
  ) {
    let entityOnlyScore = 0;
    if (signals.isExplicitComparison) entityOnlyScore += 0.5;
    if (signals.newBudgetInOriginalMessage) entityOnlyScore += 0.3;
    return Math.min(1, entityOnlyScore);
  }

  let score = 0;

  if (signals.hasClearNewCommercialSearch) score += 0.55;
  if (signals.isExplicitComparison) score += 0.5;
  if (signals.explicitProductOnlyQuery) score += 0.45;
  if (signals.wantsNew) score += 0.35;
  if (signals.newBudgetInOriginalMessage) score += 0.3;
  if (signals.newCategoryInOriginalMessage) score += 0.35;
  if (hasCommercialTokens(message)) score += 0.4;

  if (families.postPurchaseAck && !signals.hasClearNewCommercialSearch && !signals.isExplicitComparison) {
    score = Math.min(score, 0.2);
  }

  const category =
    sessionContext?.lastCategory ||
    sessionContext?.lastProductMentioned ||
    "";
  if (category && hasCommercialTokens(message)) score += 0.1;

  if (detectActiveCommercialAsk(message)) {
    score = Math.max(score, 0.55);
  }

  return Math.min(1, score);
}

function scoreSocialRelevance(message = "", cognitiveSignals = {}) {
  const families = detectExistingSocialFamilySignals(message, cognitiveSignals);
  let score = 0;

  if (families.greeting) score += 0.85;
  if (families.acknowledgement) score += 0.8;
  if (/\b(valeu|obrigad\w*|tmj|brigad\w*)\b/.test(normalizeMessage(message))) score += 0.75;
  if (families.socialValidation || families.compliment) score += 0.75;
  if (families.farewell) score += 0.7;
  if (families.reaction) score += 0.65;
  if (families.postPurchaseAck) score += 0.78;
  if (families.passiveBrowsing || families.desireToChat) score += 0.7;
  if (detectCasualCommentarySignal(message)) score += 0.6;
  if (score < 0.45 && detectHumanDimensionSignal(message)) score += 0.55;

  return Math.min(1, score);
}

function scoreEmotionalRelevance(message = "") {
  if (detectLightEmotionalSignal(message)) return 0.72;
  if (detectEmotionalDimension(message) && hasCommercialTokens(message)) return 0.45;
  return 0;
}

function scoreContinuityRelevance(message = "", sessionContext = {}, hasActiveAnchor = false) {
  let score = 0;
  if (hasActiveAnchor) score += 0.45;
  if (sessionContext?.lastBestProduct?.product_name) score += 0.2;
  if (Array.isArray(sessionContext?.lastProducts) && sessionContext.lastProducts.length > 0) {
    score += 0.15;
  }
  if (tokenCount(message) <= 4) score += 0.2;
  return Math.min(1, score);
}

function deriveHumanObjective({
  interactionMode,
  socialFamilies = {},
  commercialRelevance = 0,
}) {
  if (interactionMode === MIA_INTERACTION_MODES.IDENTITY) {
    return MIA_HUMAN_OBJECTIVES.LEARN_ABOUT_MIA;
  }
  if (interactionMode === MIA_INTERACTION_MODES.MIXED) {
    return MIA_HUMAN_OBJECTIVES.MIXED_HUMAN_COMMERCE;
  }
  if (interactionMode === MIA_INTERACTION_MODES.CLARIFICATION) {
    return MIA_HUMAN_OBJECTIVES.CLARIFY_MESSAGE;
  }
  if (interactionMode === MIA_INTERACTION_MODES.EMOTIONAL_SUPPORT) {
    return MIA_HUMAN_OBJECTIVES.EXPRESS_FEELING;
  }
  if (socialFamilies.greeting) return MIA_HUMAN_OBJECTIVES.INITIATE_CONTACT;
  if (socialFamilies.acknowledgement) return MIA_HUMAN_OBJECTIVES.RECEIVE_ACKNOWLEDGMENT;
  if (socialFamilies.farewell) return MIA_HUMAN_OBJECTIVES.CLOSE_INTERACTION;
  if (commercialRelevance >= 0.45) return MIA_HUMAN_OBJECTIVES.PURCHASE_HELP;
  if (socialFamilies.desireToChat || socialFamilies.passiveBrowsing) {
    return MIA_HUMAN_OBJECTIVES.CONTINUE_CONVERSATION;
  }
  return MIA_HUMAN_OBJECTIVES.CREATE_CONNECTION;
}

function derivePrimaryIntent({
  interactionMode,
  socialFamilies = {},
  commercialRelevance = 0,
}) {
  if (interactionMode === MIA_INTERACTION_MODES.IDENTITY) return "about_mia";
  if (interactionMode === MIA_INTERACTION_MODES.MIXED) return "mixed_intent";
  if (interactionMode === MIA_INTERACTION_MODES.CLARIFICATION) return "clarification";
  if (interactionMode === MIA_INTERACTION_MODES.EMOTIONAL_SUPPORT) return "emotional_support";
  if (interactionMode === MIA_INTERACTION_MODES.SOCIAL) {
    if (socialFamilies.greeting) return "greeting";
    if (socialFamilies.acknowledgement || socialFamilies.postPurchaseAck) return "acknowledgement";
    if (socialFamilies.socialValidation || socialFamilies.compliment) return "social_validation";
    if (socialFamilies.comprehension || socialFamilies.comprehensionSuccess) return "comprehension";
    if (socialFamilies.softDisagreement) return "soft_disagreement";
    return "social_conversation";
  }
  if (commercialRelevance >= 0.45) return "commerce";
  return "general";
}

function resolveInteractionMode({
  message = "",
  commercialRelevance = 0,
  socialRelevance = 0,
  emotionalRelevance = 0,
  continuityRelevance = 0,
  socialFamilies = {},
  hasActiveAnchor = false,
  cognitiveTurn = null,
}) {
  if (detectHighRiskSignal(message)) {
    return {
      interactionMode: MIA_INTERACTION_MODES.SAFETY,
      confidence: 0.9,
      ambiguity: 0.1,
      requiresClarification: false,
      reasons: ["high_risk_signal_detected"],
    };
  }

  if (socialFamilies.aboutMia && commercialRelevance < 0.45) {
    return {
      interactionMode: MIA_INTERACTION_MODES.IDENTITY,
      confidence: 0.88,
      ambiguity: 0.12,
      requiresClarification: false,
      reasons: ["identity_intent_detected"],
    };
  }

  if (socialFamilies.postPurchaseAck && !detectActiveCommercialAsk(message)) {
    return {
      interactionMode: MIA_INTERACTION_MODES.SOCIAL,
      confidence: 0.86,
      ambiguity: 0.14,
      requiresClarification: false,
      reasons: ["post_purchase_acknowledgement"],
    };
  }

  const hasMixed =
    commercialRelevance >= 0.35 &&
    (socialRelevance >= 0.35 ||
      emotionalRelevance >= 0.35 ||
      detectEmotionalDimension(message) ||
      detectHumanDimensionSignal(message));

  if (hasMixed) {
    return {
      interactionMode: MIA_INTERACTION_MODES.MIXED,
      confidence: Math.min(0.92, 0.65 + commercialRelevance * 0.2),
      ambiguity: 0.2,
      requiresClarification: false,
      reasons: ["mixed_human_and_commercial_intent"],
    };
  }

  if (commercialRelevance >= 0.45) {
    return {
      interactionMode: MIA_INTERACTION_MODES.COMMERCE,
      confidence: Math.min(0.95, 0.6 + commercialRelevance * 0.35),
      ambiguity: 0.15,
      requiresClarification: false,
      reasons: ["commercial_intent_dominant"],
    };
  }

  if (emotionalRelevance >= 0.55 && emotionalRelevance >= socialRelevance) {
    return {
      interactionMode: MIA_INTERACTION_MODES.EMOTIONAL_SUPPORT,
      confidence: 0.82,
      ambiguity: 0.18,
      requiresClarification: false,
      reasons: ["light_emotional_disclosure_detected"],
    };
  }

  if (socialRelevance >= 0.45) {
    return {
      interactionMode: MIA_INTERACTION_MODES.SOCIAL,
      confidence: Math.min(0.9, 0.55 + socialRelevance * 0.35),
      ambiguity: 0.15,
      requiresClarification: false,
      reasons: ["social_intent_dominant"],
    };
  }

  const shortAmbiguous =
    tokenCount(message) <= 4 &&
    !hasCommercialTokens(message) &&
    (continuityRelevance >= 0.45 || hasActiveAnchor);

  const turnType = cognitiveTurn?.turnType || "";
  const turnAmbiguous =
    turnType === "UNKNOWN" ||
    turnType === "FOLLOW_UP" ||
    turnType === "REACTION";

  if ((shortAmbiguous || turnAmbiguous) && continuityRelevance >= 0.35) {
    return {
      interactionMode: MIA_INTERACTION_MODES.CLARIFICATION,
      confidence: 0.68,
      ambiguity: 0.72,
      requiresClarification: true,
      reasons: ["ambiguous_message_with_available_context"],
    };
  }

  if (tokenCount(message) <= 3 && !hasCommercialTokens(message) && !hasActiveAnchor) {
    if (socialRelevance < 0.45 && emotionalRelevance < 0.45) {
      return {
        interactionMode: MIA_INTERACTION_MODES.CLARIFICATION,
        confidence: 0.55,
        ambiguity: 0.85,
        requiresClarification: true,
        reasons: ["short_incomplete_message_without_context"],
      };
    }
  }

  if (
    detectConversationalEntityMentionFrame(message) &&
    !detectActiveCommercialAsk(message)
  ) {
    return {
      interactionMode: MIA_INTERACTION_MODES.SOCIAL,
      confidence: 0.74,
      ambiguity: 0.18,
      requiresClarification: false,
      reasons: ["conversational_entity_mention_without_commercial_ask"],
    };
  }

  return {
    interactionMode: MIA_INTERACTION_MODES.SOCIAL,
    confidence: 0.52,
    ambiguity: 0.62,
    requiresClarification: false,
    reasons: ["no_dominant_commercial_ask_default_social"],
  };
}

/**
 * Build enriched cognitive routing signal for buildRoutingDecision.
 */
export function buildCognitiveRoutingSignalFromTurn(cognitiveTurn = null, hasActiveAnchor = false) {
  if (!cognitiveTurn) return null;

  const signals = cognitiveTurn.signals || {};
  return {
    turnType: cognitiveTurn.turnType,
    confidence: cognitiveTurn.confidence,
    hasActiveAnchor,
    isGreeting: signals.isGreeting === true,
    isAcknowledgement: signals.isAcknowledgement === true,
    isAboutMia: signals.isAboutMia === true,
    isComprehension: signals.isComprehension === true,
    isComprehensionSuccess: signals.isComprehensionSuccess === true,
    isSoftDisagreement: signals.isSoftDisagreement === true,
    isDecisionConfirmation: signals.isDecisionConfirmation === true,
    isAntiRegret: signals.isAntiRegret === true,
    isConfidenceChallenge: signals.isConfidenceChallenge === true,
    isSocialValidation: signals.isSocialValidation === true,
    isSecondBestDiscovery: signals.isSecondBestDiscovery === true,
    isAlternativeExploration: signals.isAlternativeExploration === true,
    isConstraintChange: signals.isConstraintChange === true,
    isConversationalConfusion: signals.isConversationalConfusion === true,
    isAnchoredShortFollowUp: signals.isAnchoredShortFollowUp === true,
  };
}

/**
 * Recognize predominant human intent for the current turn.
 *
 * @param {object} input
 * @returns {object} intent recognition contract
 */
export function recognizeMiaIntent(input = {}) {
  const {
    userMessage = "",
    resolvedQuery = "",
    sessionContext = {},
    signals = {},
    cognitiveTurn = null,
    hasActiveAnchor = false,
    detectedIntent = "",
  } = input;

  const message = String(userMessage || "").trim();
  const cognitiveSignals = cognitiveTurn?.signals || {};
  const socialFamilies = detectExistingSocialFamilySignals(message, cognitiveSignals);

  const commercialRelevance = scoreCommercialRelevance(message, signals, sessionContext);
  const socialRelevance = scoreSocialRelevance(message, cognitiveSignals);
  const emotionalRelevance = scoreEmotionalRelevance(message);
  const continuityRelevance = scoreContinuityRelevance(message, sessionContext, hasActiveAnchor);

  const modeResolution = resolveInteractionMode({
    message,
    commercialRelevance,
    socialRelevance,
    emotionalRelevance,
    continuityRelevance,
    socialFamilies,
    hasActiveAnchor,
    cognitiveTurn,
  });

  let interactionMode = modeResolution.interactionMode;

  // Existing specialized families keep their dedicated flows when not mixed/commercial.
  if (
    interactionMode === MIA_INTERACTION_MODES.COMMERCE &&
    modeResolution.confidence < 0.5 &&
    (socialRelevance >= 0.45 || emotionalRelevance >= 0.45)
  ) {
    interactionMode =
      emotionalRelevance >= socialRelevance
        ? MIA_INTERACTION_MODES.EMOTIONAL_SUPPORT
        : MIA_INTERACTION_MODES.SOCIAL;
  }

  if (
    detectedIntent === "greeting" &&
    interactionMode !== MIA_INTERACTION_MODES.MIXED &&
    commercialRelevance < 0.45
  ) {
    interactionMode = MIA_INTERACTION_MODES.SOCIAL;
  }

  const primaryIntent = derivePrimaryIntent({
    interactionMode,
    socialFamilies,
    commercialRelevance,
  });

  const humanObjective = deriveHumanObjective({
    interactionMode,
    socialFamilies,
    commercialRelevance,
  });

  const preserveCommerceContext =
    hasActiveAnchor &&
    (continuityRelevance >= 0.35 || commercialRelevance >= 0.2);

  const domainReentry =
    interactionMode === MIA_INTERACTION_MODES.SOCIAL ||
    interactionMode === MIA_INTERACTION_MODES.EMOTIONAL_SUPPORT
      ? preserveCommerceContext
        ? "preserve_when_user_returns"
        : "only_on_user_request"
      : interactionMode === MIA_INTERACTION_MODES.MIXED
        ? "continue_commercial_now"
        : "active";

  const legacyIntentOverride =
    interactionMode === MIA_INTERACTION_MODES.COMMERCE ||
    interactionMode === MIA_INTERACTION_MODES.SAFETY
      ? null
      : primaryIntent;

  return {
    primaryIntent,
    secondaryIntent:
      interactionMode === MIA_INTERACTION_MODES.MIXED && emotionalRelevance >= 0.35
        ? "emotional_support"
        : null,
    interactionMode,
    humanObjective,
    commercialRelevance,
    socialRelevance,
    emotionalRelevance,
    continuityRelevance,
    ambiguity: modeResolution.ambiguity,
    confidence: modeResolution.confidence,
    requiresClarification: modeResolution.requiresClarification,
    commercialIntent: commercialRelevance >= 0.45,
    preserveCommerceContext,
    domainReentry,
    legacyIntentOverride,
    socialFamilies,
    reasons: modeResolution.reasons,
    resolvedQuery: resolvedQuery || message,
  };
}

export function intentRecognitionToTrace(recognition = {}) {
  if (!recognition) return null;
  return {
    primaryIntent: recognition.primaryIntent,
    secondaryIntent: recognition.secondaryIntent,
    interactionMode: recognition.interactionMode,
    humanObjective: recognition.humanObjective,
    commercialRelevance: recognition.commercialRelevance,
    socialRelevance: recognition.socialRelevance,
    emotionalRelevance: recognition.emotionalRelevance,
    continuityRelevance: recognition.continuityRelevance,
    ambiguity: recognition.ambiguity,
    confidence: recognition.confidence,
    requiresClarification: recognition.requiresClarification,
    commercialIntent: recognition.commercialIntent,
    preserveCommerceContext: recognition.preserveCommerceContext,
    domainReentry: recognition.domainReentry,
    reasons: recognition.reasons,
  };
}

export function isNonCommercialInteractionMode(interactionMode = "") {
  return (
    interactionMode === MIA_INTERACTION_MODES.SOCIAL ||
    interactionMode === MIA_INTERACTION_MODES.EMOTIONAL_SUPPORT ||
    interactionMode === MIA_INTERACTION_MODES.CLARIFICATION ||
    interactionMode === MIA_INTERACTION_MODES.IDENTITY
  );
}

export function shouldBypassDefaultProductSearch(recognition = {}) {
  if (!recognition) return false;
  if (recognition.interactionMode === MIA_INTERACTION_MODES.SAFETY) return false;
  if (recognition.interactionMode === MIA_INTERACTION_MODES.MIXED) return false;
  if (recognition.interactionMode === MIA_INTERACTION_MODES.COMMERCE) return false;
  return isNonCommercialInteractionMode(recognition.interactionMode);
}
