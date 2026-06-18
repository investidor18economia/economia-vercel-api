/**
 * PATCH 8.5B — Legitimate Search Reset Guard
 *
 * Intenção: LEGITIMATE_SEARCH_RESET — encerrar thread decisória atual e reabrir busca.
 * Sem listas de frases fechadas; usa famílias semânticas de discurso + bloqueadores existentes.
 */

import {
  isComprehensionFamilyQuery,
  isComprehensionSemanticFamilyQuery,
  isConversationalConfusionFamilyQuery,
  isUserConfusionFamilyQuery,
  isDecisionConfirmationFamilyQuery,
  isAlternativeExplorationFamilyQuery,
  isSecondBestDiscoveryFamilyQuery,
  isAntiRegretFamilyQuery,
  isConfidenceChallengeFamilyQuery,
  isSocialValidationFamilyQuery,
  isConstraintChangeFamilyQuery,
  isAnchoredShortFollowUpQuery,
} from "./miaCognitiveRouter.js";
import {
  extractBudget,
  isAnchoredComparisonOrProductReference,
  isAnchoredDecisionChoiceRequest,
  isAnchoredSpendingAversion,
  isEmotionalAntiRegretDesire,
  isNegativeNonCommercialDesire,
} from "./miaRoutingSafety.js";

export const LEGITIMATE_SEARCH_RESET_GUARD_VERSION = "8.5B.2";

/**
 * Thread comercial ativa — mais amplo que lastBestProduct isolado.
 */
export function hasActiveCommercialThreadForReset(
  sessionContext = {},
  incomingSessionContext = {}
) {
  const sc = sessionContext || {};
  const inc = incomingSessionContext || {};

  return !!(
    sc.lastBestProduct?.product_name ||
    inc.lastBestProduct?.product_name ||
    sc.comparisonContextLocked ||
    inc.comparisonContextLocked ||
    (Array.isArray(sc.lastComparisonProducts) && sc.lastComparisonProducts.length >= 2) ||
    (Array.isArray(inc.lastComparisonProducts) && inc.lastComparisonProducts.length >= 2) ||
    (sc.lastDecisionChange && typeof sc.lastDecisionChange === "object") ||
    (inc.lastDecisionChange && typeof inc.lastDecisionChange === "object") ||
    (Array.isArray(sc.lastProducts) && sc.lastProducts.length > 0) ||
    (Array.isArray(inc.lastProducts) && inc.lastProducts.length > 0)
  );
}

const CATEGORY_SEARCH_PATTERN =
  /\b(celular|smartphone|iphone|android|notebook|laptop|tv|monitor|fone|headset|cadeira|pc gamer|computador|console|ps5|xbox|geladeira|fogao|microondas|mouse|teclado|camera|camara)\b/i;

function normalizeResetText(message = "") {
  return String(message || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Discurso de abandono/restart/pivot — família semântica, não frase isolada.
 */
export function detectsLegitimateSearchResetDiscourse(message = "") {
  const q = normalizeResetText(message);
  if (!q || q.length > 160) return false;

  const hasAnchoredObject =
    /\b(nesse|nele|nessa|nela|desse|dessa|deste|desta|esse produto|essa recomendacao|essa busca|isso aqui)\b/.test(
      q
    );

  const abandonmentDiscourse =
    /\b(esquece|esqueca|ignora|abandona|deixa (isso|essa|esse|pra la|quieto)|deixa pra la)\b/.test(
      q
    );

  const restartDiscourse =
    /\b(recomec\w*|reinici\w*|comecar do zero|comeca do zero|comeca\s+d\s+novo|do zero|zera|limpa|reseta|comeca de novo|comecar de novo|vamos comecar de novo)\b/.test(
      q
    );

  const pivotDiscourse =
    /\b(muda de assunto|mudar de assunto|outro assunto|outra coisa|falar de outra|mudar o foco|muda o foco|muda para|troca pra|sai de)\b/.test(
      q
    );

  const commercialRedirectDiscourse =
    /\b(procura|procurar|buscar|busca|pesquisar|pesquisa)\b.{0,24}\b(outra|outro|novo|nova|diferente)\b/.test(
      q
    ) ||
    /\b(quero|preciso)\b.{0,16}\b(outra coisa|outro assunto|procurar outra|buscar outra)\b/.test(q);

  const explicitResetNoun =
    /\b(nova busca|outro produto|outro tipo de produto|outro tipo|comecar do zero)\b/.test(q);

  const discourseHit =
    abandonmentDiscourse ||
    restartDiscourse ||
    pivotDiscourse ||
    commercialRedirectDiscourse ||
    explicitResetNoun;

  if (!discourseHit) return false;

  if (hasAnchoredObject && !(restartDiscourse || abandonmentDiscourse)) {
    return false;
  }

  return true;
}

/**
 * Bloqueadores: intenções que NÃO são reset legítimo (famílias já governadas).
 */
export function isLegitimateSearchResetBlocked(message = "") {
  const q = normalizeResetText(message);
  if (!q) return true;

  return (
    isComprehensionFamilyQuery(message) ||
    isComprehensionSemanticFamilyQuery(message) ||
    isConversationalConfusionFamilyQuery(message) ||
    isUserConfusionFamilyQuery(message) ||
    isAnchoredComparisonOrProductReference(message) ||
    isAnchoredDecisionChoiceRequest(message) ||
    isAnchoredSpendingAversion(message) ||
    isEmotionalAntiRegretDesire(message) ||
    isNegativeNonCommercialDesire(message) ||
    isAlternativeExplorationFamilyQuery(message) ||
    isSecondBestDiscoveryFamilyQuery(message) ||
    isDecisionConfirmationFamilyQuery(message) ||
    isAntiRegretFamilyQuery(message) ||
    isConfidenceChallengeFamilyQuery(message) ||
    isSocialValidationFamilyQuery(message) ||
    isConstraintChangeFamilyQuery(message) ||
    isAnchoredShortFollowUpQuery(message, { hasActiveAnchor: true })
  );
}

/**
 * LEGITIMATE_SEARCH_RESET — intenção humana de encerrar contexto atual.
 */
export function detectsLegitimateSearchResetIntent(message = "", { hasActiveAnchor = false } = {}) {
  if (!hasActiveAnchor) return false;
  if (isLegitimateSearchResetBlocked(message)) return false;
  return detectsLegitimateSearchResetDiscourse(message);
}

function hasCommercialTailInSource(
  src = "",
  { detectProductCategory = () => "" } = {}
) {
  const q = normalizeResetText(src);
  if (!q) return false;
  if (extractBudget(src) !== null) return true;
  if (detectProductCategory(src)) return true;
  if (CATEGORY_SEARCH_PATTERN.test(q) && /\b(ate|ate|quero|procura|busca|agora)\b/.test(q)) {
    return true;
  }
  if (
    /\b(agora quero|quero um|quero uma|procura um|procura uma)\b/.test(q) &&
    CATEGORY_SEARCH_PATTERN.test(q)
  ) {
    return true;
  }
  if (
    /\b(procura|procurar|buscar|busca|pesquisar|pesquisa)\b.{0,24}\b(outra|outro|novo|nova|diferente)\b/.test(
      q
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Reset com cauda comercial na mesma mensagem (categoria/orçamento/produto novo).
 * Avalia apenas o texto literal do usuário — resolvedQuery enriquecido por sessão
 * não conta como cauda comercial no mesmo turno.
 */
export function hasLegitimateSearchResetCommercialTail(
  message = "",
  _resolvedMessage = "",
  { detectProductCategory = () => "" } = {}
) {
  return hasCommercialTailInSource(message, { detectProductCategory });
}

export function buildLegitimateSearchResetSessionContext({
  lastQuery = "",
  lastIntent = "legitimate_search_reset",
} = {}) {
  return {
    lastQuery: String(lastQuery || "").trim(),
    lastCategory: "",
    lastProducts: [],
    lastBestProduct: null,
    lastIntent,
    lastPriority: "",
    lastTopic: "",
    lastProductMentioned: "",
    lastInteractionType: "legitimate_search_reset",
    lastAxis: "",
    lastMainConsequence: "",
    lastArchetype: "",
    lastBehaviorMode: "",
    lastTradeoff: "",
    lastDecisionReason: "",
    lastWinnerAdvantages: [],
    lastWinnerSacrifices: [],
    lastDecisionChange: null,
    lastPreviousAxis: "",
    lastPreviousPriority: "",
    lastComparisonProducts: [],
    lastComparisonQuery: "",
    comparisonContextLocked: false,
    contexts: [],
    activeContextKey: "",
    activeContextType: "",
    activeContextStrength: "",
    lastContextualAxis: "",
    miaArgumentMemory: null,
    lastArgumentMemoryTurn: 0,
    lastRankingSnapshot: [],
    lastRecommendation: null,
    lastConversationalIntent: "",
  };
}

export function buildLegitimateSearchResetAwaitingQueryReply() {
  return (
    "Entendi — vamos começar do zero.\n\n" +
    "Me diz o que você quer procurar agora (produto e, se quiser, até quanto pode gastar)."
  );
}

/**
 * Aplica reset sobre sessão existente preservando apenas metadados de turno.
 */
export function applyLegitimateSearchResetToSession(
  sessionContext = {},
  { lastQuery = "" } = {}
) {
  const cleared = buildLegitimateSearchResetSessionContext({ lastQuery });
  return {
    ...cleared,
    messages: Array.isArray(sessionContext.messages) ? sessionContext.messages : [],
  };
}
