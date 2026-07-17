/**
 * PATCH 1 — Routing safety helpers (budget parse, anchor, new-search signals).
 * Pure functions — no ranking or decision logic.
 */

import { detectsLegitimateSearchResetDiscourse, hasLegitimateSearchResetCommercialTail } from "./miaLegitimateSearchResetGuard.js";
import {
  detectActiveCommercialAsk,
  detectConversationalEntityMentionFrame,
} from "./miaIntentRecognitionLayer.js";
import {
  isAntiRegretFamilyQuery,
  isAnchoredShortFollowUpQuery,
  isConstraintChangeFamilyQuery,
  isConfidenceChallengeFamilyQuery,
  isSoftDisagreementFamilyQuery,
  isAlternativeExplorationFamilyQuery,
  isSecondBestDiscoveryFamilyQuery,
  isSocialValidationFamilyQuery,
  isComprehensionFamilyQuery,
  isComprehensionSemanticFamilyQuery,
  isAcknowledgementFamilyQuery,
  isDecisionConfirmationFamilyQuery,
} from "./miaCognitiveRouter.js";

export function parseBudgetAmount(raw = "") {
  const token = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/r\$\s*/g, "")
    .replace(/\s+/g, "");

  if (!token) return NaN;

  // Brazilian thousands: 2.000, 3.500, 1.999
  if (/^\d{1,3}(\.\d{3})+$/.test(token)) {
    return parseInt(token.replace(/\./g, ""), 10);
  }

  // Thousands + optional decimal cents: 2.500,50
  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(token)) {
    const [whole, dec] = token.split(",");
    const wholeNum = parseInt(whole.replace(/\./g, ""), 10);
    return wholeNum + parseInt(dec, 10) / Math.pow(10, dec.length);
  }

  // Decimal comma: 1999,90
  if (/^\d+,\d{1,2}$/.test(token)) {
    return parseFloat(token.replace(",", "."));
  }

  // Plain integer
  if (/^\d+$/.test(token)) {
    return parseInt(token, 10);
  }

  // Decimal dot (not thousand groups): 2000.5
  if (/^\d+\.\d{1,2}$/.test(token) && !/^\d{1,3}\.\d{3}$/.test(token)) {
    return parseFloat(token);
  }

  const fallback = parseFloat(token.replace(",", "."));
  return Number.isNaN(fallback) ? NaN : fallback;
}

export function extractBudget(text = "") {
  const q = String(text || "").toLowerCase();

  const patterns = [
    /at[eé]\s*r?\$?\s*(\d+(?:[.,]\d+)*)\s*(mil)?/i,
    /abaixo\s*de\s*r?\$?\s*(\d+(?:[.,]\d+)*)\s*(mil)?/i,
    /menos\s*de\s*r?\$?\s*(\d+(?:[.,]\d+)*)\s*(mil)?/i,
    /no\s*m[aá]ximo\s*r?\$?\s*(\d+(?:[.,]\d+)*)\s*(mil)?/i,
    /por\s*at[eé]\s*r?\$?\s*(\d+(?:[.,]\d+)*)\s*(mil)?/i
  ];

  for (const pattern of patterns) {
    const match = q.match(pattern);
    if (!match) continue;

    let value = parseBudgetAmount(match[1]);
    if (Number.isNaN(value)) continue;
    if (match[2]) value *= 1000;
    return value;
  }

  return null;
}

const CATEGORY_TOKEN_SOURCE =
  "celular|smartphone|iphone|android|notebook|laptop|tv|monitor|fone|headset|cadeira|pc gamer|computador|console|ps5|xbox|geladeira|fogao|microondas|air fryer|maquina de lavar|mouse|teclado|camera|camara";

const CATEGORY_SEARCH_PATTERN = new RegExp(`\\b(${CATEGORY_TOKEN_SOURCE})\\b`, "i");

const EXPLICIT_SEARCH_VERB_PATTERN =
  /\b(ate|até|por menos de|abaixo de|na faixa de|quero|procura|procurar|buscar|me mostra|me indique|indica|recomenda|recomende)\b/;

const ANCHORED_COMPARISON_INTENT_PATTERN =
  /\b(em duvida|indeciso|nao sei|estou dividido|fico dividido|fico em duvida|to em duvida|tô em duvida)\s+entre\b|\b(entre\s+(esse|essa|este|esta|isso|o mesmo|a mesma|esses|estes|essas|estas|eles|elas))\b|\b(esse|essa|este|esta|isso)\b.{0,72}\b(e|ou|versus|vs)\b|\bcompar(ar|ando|acao)\b.{0,48}\b(com|entre)\b/;

const ANCHORED_PRODUCT_REFERENCE_PATTERN = new RegExp(
  `\\b(o|a|um|uma|esse|essa|este|esta)\\s+(${CATEGORY_TOKEN_SOURCE})\\s+[a-z][a-z0-9]*(?:\\s+[a-z0-9]+){0,4}\\b`,
  "i"
);

const ANCHORED_NAMED_PRODUCT_PATTERN = new RegExp(
  `\\b(${CATEGORY_TOKEN_SOURCE})\\s+[a-z][a-z0-9]+(?:\\s+[a-z0-9]+){0,3}\\b`,
  "i"
);

/**
 * PATCH 7.6U-G — Short anchored delegation ("escolhe um pra mim") must not open new_search.
 * Category tokens mirror resolveClearNewCommercialSearch guards — not product-specific hardcodes.
 */
export function isAnchoredDelegationChoiceRequest(message = "") {
  const text = String(message || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  if (!text) return false;

  const hasDelegation =
    /\b(escolhe|decide|escolha|decida)\b.*\b(pra mim|por mim|ai)\b/.test(text) ||
    /\b(me fala|fala)\b.*\bum so\b/.test(text) ||
    /\b(um so|uma so)\b/.test(text);

  if (!hasDelegation) return false;

  const hasNewSearchIntent =
    /\b(ate|ate)\s*\d+/.test(text) ||
    CATEGORY_SEARCH_PATTERN.test(text) ||
    /\b(opcoes|procura|buscar|busca|pesquisa|outro|outra|alternativa)\b/.test(text);

  return !hasNewSearchIntent;
}

/**
 * PATCH 8.3A — Spending aversion on anchored winner ≠ new commercial search.
 * "nao quero gastar muito" evaluates cost of current recommendation, not a catalog reopen.
 */
export function isAnchoredSpendingAversion(message = "") {
  const text = normalizeRoutingText(message)
    .replace(/[?!.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!/\bnao quero\b/.test(text)) return false;

  const spendingAversion =
    /\bnao quero\s+gastar\s+(muito|tanto|demais)\b/.test(text) ||
    /\bnao quero\s+pagar\s+(muito|tanto|demais)\b/.test(text) ||
    /\bnao quero\s+investir\s+(muito|tanto|demais)\b/.test(text);

  if (!spendingAversion) return false;

  const explicitCommercialRedirect =
    /\b(procura|procurar|buscar|busca|mostra|me mostra|opcoes|outro|outra|alternativa)\b/.test(
      text
    ) ||
    /\bnao quero\s+(esse|essa|este|esta|isso)(\s+produto)?\b/.test(text) ||
    /\bnao quero gastar\s+mais\s+de\b/.test(text) ||
    /\bmenos de\s*r?\$?\s*\d/.test(text) ||
    extractBudget(text) !== null;

  return !explicitCommercialRedirect;
}

/**
 * PATCH 8.3A — Anchored decision choice/delegation ≠ explicit new search.
 * Covers binary and small-set choice follow-ups without category/budget reopen signals.
 */
export function isAnchoredDecisionChoiceRequest(message = "") {
  const text = normalizeRoutingText(message)
    .replace(/[?!.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text || text.length > 140) return false;
  if (isAnchoredDelegationChoiceRequest(message)) return true;

  const hasChoiceFrame =
    /\b(dos dois|das duas|deles|delas|dos 2|das 2|entre (esses|estes|essas|estas|eles|elas)|entre (esse|essa|este|esta)|se fosse (voce|vc)|pra voce|por voce|qual (dos|das|deles|delas)|entre eles|entre elas)\b/.test(
      text
    ) ||
    /\b(q|qual)\s+(dos|das)\s*\d\b/.test(text);

  const hasDecisionAsk =
    /\b(qual|quais|quem|q)\b.{0,48}\b(indica|indicaria|escolhe|escolheria|recomenda|recomendaria|preferiria|fica com|leva|levaria|faz mais sentido|vale mais|seria sua escolha|voce iria|vc iria|sua escolha|veredito|voce escolheria|vc escolheria|voce indicaria|vc indicaria)\b/.test(
      text
    ) ||
    /\b(indica|escolhe|recomenda|preferiria)\b.{0,24}\b(qual|quais|quem|q)\b/.test(text) ||
    /\b(vc|voce)\s+indica\b/.test(text) ||
    /\bqual\s+(voce|vc)\s+(escolheria|indicaria|recomendaria|prefere|iria)\b/.test(text) ||
    /\b(se fosse voce|se fosse vc)\b/.test(text);

  if (!hasDecisionAsk) return false;

  const hasNewSearchIntent =
    !!extractBudget(text) ||
    /\b(procura|procurar|buscar|busca|pesquisa|outro|outra|alternativa|mostra opcoes)\b/.test(
      text
    ) ||
    /\b(ate|ate)\s*\d+/.test(text) ||
    (CATEGORY_SEARCH_PATTERN.test(text) &&
      !isAnchoredComparisonOrProductReference(text));

  if (hasNewSearchIntent) return false;

  return hasChoiceFrame || text.length <= 90;
}

/**
 * PATCH 8.3A — Anchored comparison or product reference ≠ cold category search.
 */
export function isAnchoredComparisonOrProductReference(message = "") {
  const text = normalizeRoutingText(message)
    .replace(/[?!.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return false;

  if (ANCHORED_COMPARISON_INTENT_PATTERN.test(text)) return true;

  const hasProductReferenceContext =
    /\b(entre|duvida|indeciso|compar|esse|essa|este|esta|isso|dos dois|das duas|deles|delas)\b/.test(
      text
    );

  if (!hasProductReferenceContext) return false;

  return (
    ANCHORED_PRODUCT_REFERENCE_PATTERN.test(text) ||
    ANCHORED_NAMED_PRODUCT_PATTERN.test(text)
  );
}

function hasStandaloneCategorySearchIntent(normalizedText = "") {
  if (!normalizedText || !CATEGORY_SEARCH_PATTERN.test(normalizedText)) return false;
  if (isAnchoredComparisonOrProductReference(normalizedText)) return false;
  if (isAnchoredDecisionChoiceRequest(normalizedText)) return false;
  return true;
}

function hasStandaloneExplicitSearchVerbIntent(normalizedText = "") {
  if (!normalizedText || !EXPLICIT_SEARCH_VERB_PATTERN.test(normalizedText)) return false;
  if (isAnchoredDecisionChoiceRequest(normalizedText)) return false;
  if (isAnchoredSpendingAversion(normalizedText)) return false;
  if (isAnchoredComparisonOrProductReference(normalizedText)) return false;
  return true;
}

function hasAnchoredWinnerLifecycleHold(message = "") {
  return (
    isAnchoredSpendingAversion(message) ||
    isAnchoredDecisionChoiceRequest(message) ||
    isAnchoredComparisonOrProductReference(message)
  );
}

/**
 * PATCH 7.6V-K — Emotional "nao quero..." must not trigger clearNewCommercialSearch.
 * "quero" inside "nao quero fazer besteira" is fear of error, not a new product request.
 */
export function isNegativeNonCommercialDesire(message = "") {
  const text = String(message || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  if (!/\bnao quero\b/.test(text)) return false;

  const emotionalRisk =
    /\b(fazer|cometer)\s+besteira\b/.test(text) ||
    /\bjogar\s+(dinheiro|grana)\s+fora\b/.test(text) ||
    /\btomar\s+uma\s+decisao\s+ruim\b/.test(text) ||
    /\bfazer\s+uma\s+escolha\s+ruim\b/.test(text) ||
    /\bme\s+frustrar\b/.test(text) ||
    /\bescolher\s+errado\b/.test(text) ||
    (/\berrar\b/.test(text) && /\b(compra|escolha|nessa|nesse|na)\b/.test(text)) ||
    /\bnao quero errar\b/.test(text) ||
    (/\bnao quero\b/.test(text) && /\b(dor de cabeca|me incomodar|arrependimento)\b/.test(text)) ||
    /\bme\s+arrepender\b/.test(text) ||
    /\bgastar\s+(errado|mal)\b/.test(text) ||
    /\bquebrar\s+a\s+cara\b/.test(text) ||
    /\bdecidir\s+errado\b/.test(text) ||
    /\bir\s+na\s+opcao\s+errada\b/.test(text) ||
    /\bir\s+no\s+errado\b/.test(text);

  if (!emotionalRisk) return false;

  const afterNaoQuero = text.replace(/\bnao quero\b/, "").trim();
  const hasAffirmativeQueroRedirect = /\bquero\b/.test(afterNaoQuero);

  const explicitCommercialRedirect =
    /\b(procura|procurar|buscar|busca|mostra|me mostra|opcoes|outro|outra|alternativa)\b/.test(
      text
    ) ||
    /\bnao quero\s+(esse|essa|este|esta|isso)(\s+produto)?\b/.test(text) ||
    (hasAffirmativeQueroRedirect &&
      (CATEGORY_SEARCH_PATTERN.test(text) ||
        /\b(usado|novo|barat|cara|caro)\b/.test(text) ||
        /\bate\s*\d+/.test(text) ||
        /\bmais de\s*\d+/.test(text) ||
        /\bmenos de\s*\d+/.test(text)));

  return !explicitCommercialRedirect;
}

function normalizeRoutingText(message = "") {
  return String(message || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * PATCH 7.9X-D.2 — Affirmative "quero..." emotional safety ≠ new commercial search.
 * Models regret-avoidance / risk-reduction desire without product/category tail.
 */
export function isEmotionalAntiRegretDesire(message = "") {
  const text = normalizeRoutingText(message);
  if (!text) return false;

  const commercialProductIntent =
    CATEGORY_SEARCH_PATTERN.test(text) ||
    !!extractBudget(text) ||
    /\bquero outr[oa]\b/.test(text) ||
    /\bquero (um|uma) (produto|modelo|aparelho|item)\b/.test(text) ||
    /\bquero algo mais (barato|caro|confiavel|simples|equilibrado)\b/.test(text) ||
    /\bquero (um|uma)\b.*\b(para|pra)\b.*\b(jogar|jogos|estudar|estudo|trabalhar|trabalho|editar)\b/.test(
      text
    ) ||
    (
      /\b(quero|preciso|busco|procurar|buscar)\s+(um|uma|outro|outra|novo|nova)\b/.test(text) &&
      (
        CATEGORY_SEARCH_PATTERN.test(text) ||
        /\b(produto|modelo|aparelho|peca|item|opcoes)\b/.test(text) ||
        !!extractBudget(text)
      )
    ) ||
    /\b(ou|versus|\bvs\b)\b/.test(text);

  if (commercialProductIntent) return false;

  const explicitEmotionalFear =
    /\btenho medo de (errar|escolher errado|tomar uma decisao errada)\b/.test(text) ||
    /\breceio de comprar errado\b/.test(text) ||
    /\bestou receoso\b/.test(text) ||
    /\bnao quero me arrepender\b/.test(text);

  const affirmativeEmotionalSafety =
    /\bquero\b/.test(text) &&
    (
      (/\bquero evitar\b/.test(text) &&
        /\b(dor de cabeca|problema|problemas|frustracao|risco|arrepender|errar|sufoco)\b/.test(text)) ||
      /\bquero (ficar|comprar|decidir|passar)\b.*\b(tranquilo|sossegado|sem medo|sem me arrepender|com calma|bem)\b/.test(
        text
      ) ||
      /\bquero uma escolha tranquila\b/.test(text) ||
      (/\bquero algo\b/.test(text) &&
        /\b(nao me incomode|nao me arrependa|sem problema|sem dor de cabeca)\b/.test(text)) ||
      (/\bquero reduzir\b/.test(text) &&
        /\b(risco|arrepender|erro|chance de errar)\b/.test(text)) ||
      /\bquero comprar certo\b/.test(text) ||
      /\bquero nao (errar|fazer besteira|escolher mal|me frustrar|passar sufoco)\b/.test(text) ||
      /\bquero comprar uma vez so\b/.test(text) ||
      /\bquero comprar sem me arrepender\b/.test(text) ||
      /\bquero ficar tranquilo\b/.test(text)
    );

  return explicitEmotionalFear || affirmativeEmotionalSafety;
}

/**
 * Reuses the same signals already used in the chat handler (no new phrase lists).
 */
export function hasClearNewCommercialSearchIntent({
  query = "",
  resolvedQuery = "",
  explicitProductOnlyQuery = false,
  wantsNew = false,
  hasAnchor = false,
  detectProductCategory = () => "",
  wantsNewProduct = () => false
} = {}) {
  const normalizedQuery = String(query || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,;:]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const normalizedResolved = String(resolvedQuery || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,;:]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Reset discourse: only same-turn commercial tail authorizes clear-new-search here.
  // Reset-only turns are owned by PATCH 8.5B Legitimate Search Reset Guard.
  if (detectsLegitimateSearchResetDiscourse(normalizedQuery)) {
    return hasLegitimateSearchResetCommercialTail(normalizedQuery, "", {
      detectProductCategory,
    });
  }

  if (
    /\b(muda para|muda o foco para|troca pra|sai de .+ vamos para|agora e cadeira|agora e monitor)\b/.test(
      normalizedQuery
    )
  ) {
    return true;
  }

  if (
    isNegativeNonCommercialDesire(query) ||
    isNegativeNonCommercialDesire(resolvedQuery) ||
    isEmotionalAntiRegretDesire(query) ||
    isEmotionalAntiRegretDesire(resolvedQuery) ||
    isAnchoredSpendingAversion(query) ||
    isAnchoredSpendingAversion(resolvedQuery) ||
    isAnchoredDecisionChoiceRequest(query) ||
    isAnchoredDecisionChoiceRequest(resolvedQuery) ||
    isAnchoredComparisonOrProductReference(query) ||
    isAnchoredComparisonOrProductReference(resolvedQuery) ||
    isAntiRegretFamilyQuery(query) ||
    isAntiRegretFamilyQuery(resolvedQuery) ||
    isConstraintChangeFamilyQuery(query) ||
    isConstraintChangeFamilyQuery(resolvedQuery) ||
    isConfidenceChallengeFamilyQuery(query) ||
    isConfidenceChallengeFamilyQuery(resolvedQuery) ||
    isSoftDisagreementFamilyQuery(query) ||
    isSoftDisagreementFamilyQuery(resolvedQuery) ||
    isAlternativeExplorationFamilyQuery(query) ||
    isAlternativeExplorationFamilyQuery(resolvedQuery) ||
    isSecondBestDiscoveryFamilyQuery(query) ||
    isSecondBestDiscoveryFamilyQuery(resolvedQuery) ||
    isSocialValidationFamilyQuery(query) ||
    isSocialValidationFamilyQuery(resolvedQuery) ||
    isComprehensionFamilyQuery(query) ||
    isComprehensionFamilyQuery(resolvedQuery) ||
    isComprehensionSemanticFamilyQuery(query) ||
    isComprehensionSemanticFamilyQuery(resolvedQuery) ||
    isAcknowledgementFamilyQuery(query) ||
    isAcknowledgementFamilyQuery(resolvedQuery) ||
    isDecisionConfirmationFamilyQuery(query) ||
    isDecisionConfirmationFamilyQuery(resolvedQuery) ||
    detectConversationalEntityMentionFrame(query) ||
    detectConversationalEntityMentionFrame(resolvedQuery)
  ) {
    return false;
  }

  const activeCommercialAsk =
    detectActiveCommercialAsk(query) || detectActiveCommercialAsk(resolvedQuery);

  const hasCategoryToken =
    CATEGORY_SEARCH_PATTERN.test(normalizedQuery) ||
    CATEGORY_SEARCH_PATTERN.test(normalizedResolved) ||
    !!detectProductCategory(query) ||
    !!detectProductCategory(resolvedQuery);

  const categorySignal = hasAnchor
    ? hasStandaloneCategorySearchIntent(normalizedQuery) ||
      hasStandaloneCategorySearchIntent(normalizedResolved)
    : hasCategoryToken &&
      (activeCommercialAsk ||
        EXPLICIT_SEARCH_VERB_PATTERN.test(normalizedQuery) ||
        EXPLICIT_SEARCH_VERB_PATTERN.test(normalizedResolved) ||
        extractBudget(query) != null ||
        extractBudget(resolvedQuery) != null);

  const verbSignal = hasAnchor
    ? hasStandaloneExplicitSearchVerbIntent(normalizedQuery) ||
      hasStandaloneExplicitSearchVerbIntent(normalizedResolved)
    : EXPLICIT_SEARCH_VERB_PATTERN.test(normalizedQuery) ||
      EXPLICIT_SEARCH_VERB_PATTERN.test(normalizedResolved);

  return !!(
    explicitProductOnlyQuery ||
    wantsNew ||
    wantsNewProduct(query) ||
    wantsNewProduct(resolvedQuery) ||
    extractBudget(query) ||
    extractBudget(resolvedQuery) ||
    categorySignal ||
    (verbSignal && hasCategoryToken) ||
    (activeCommercialAsk && hasCategoryToken)
  );
}

/**
 * When a session anchor exists, enriched resolvedQuery must not alone trigger new_search
 * (e.g. "loucura" → "celular até 2000 loucura"). Priority/axis follow-ups are not new searches.
 */
export function resolveClearNewCommercialSearchForRouting({
  query = "",
  resolvedQuery = "",
  hasAnchor = false,
  looksLikeShortPriorityFollowUp = false,
  looksLikeAmbiguousFollowUp = false,
  isExplicitComparison = false,
  explicitProductOnlyQuery = false,
  wantsNew = false,
  detectProductCategory = () => "",
  wantsNewProduct = () => false
} = {}) {
  if (isExplicitComparison) {
    return false;
  }

  if (looksLikeShortPriorityFollowUp && hasAnchor) {
    return false;
  }

  if (hasAnchor && isAnchoredShortFollowUpQuery(query, { hasActiveAnchor: true })) {
    return false;
  }

  if (hasAnchor && isAnchoredShortFollowUpQuery(resolvedQuery, { hasActiveAnchor: true })) {
    return false;
  }

  if (
    isNegativeNonCommercialDesire(query) ||
    isEmotionalAntiRegretDesire(query) ||
    isAnchoredSpendingAversion(query) ||
    isAnchoredDecisionChoiceRequest(query) ||
    isAnchoredComparisonOrProductReference(query) ||
    isAntiRegretFamilyQuery(query) ||
    isConstraintChangeFamilyQuery(query) ||
    isConfidenceChallengeFamilyQuery(query) ||
    isConfidenceChallengeFamilyQuery(resolvedQuery) ||
    isSoftDisagreementFamilyQuery(query) ||
    isAlternativeExplorationFamilyQuery(query) ||
    isSecondBestDiscoveryFamilyQuery(query) ||
    isSocialValidationFamilyQuery(query) ||
    isComprehensionFamilyQuery(query) ||
    isComprehensionSemanticFamilyQuery(query) ||
    isAcknowledgementFamilyQuery(query) ||
    isDecisionConfirmationFamilyQuery(query)
  ) {
    return false;
  }

  const normalizedQuery = String(query || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,;:]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const onOriginal = (q) =>
    hasClearNewCommercialSearchIntent({
      query: q,
      resolvedQuery: q,
      explicitProductOnlyQuery: explicitProductOnlyQuery && q === query,
      wantsNew: wantsNewProduct(q),
      hasAnchor,
      detectProductCategory,
      wantsNewProduct
    });

  if (hasAnchor) {
    if (isAnchoredDelegationChoiceRequest(query)) {
      return false;
    }
    if (hasAnchoredWinnerLifecycleHold(query)) {
      return false;
    }
    const budgetOnlyRecalibration =
      !!extractBudget(query) &&
      !detectProductCategory(query) &&
      !wantsNewProduct(query) &&
      (
        isConstraintChangeFamilyQuery(query) ||
        /\b(agora|e agora)\b.*\b(ate|ate)\s*\d+\b/.test(normalizedQuery) ||
        /\bate\s*\d+\s+agora\b/.test(normalizedQuery) ||
        /\b(baixar|baixei|preciso baixar|orcamento|economizar|gastar menos)\b/.test(normalizedQuery)
      );
    if (budgetOnlyRecalibration) {
      return false;
    }
    return onOriginal(query);
  }

  return hasClearNewCommercialSearchIntent({
    query,
    resolvedQuery,
    explicitProductOnlyQuery,
    wantsNew,
    hasAnchor: false,
    detectProductCategory,
    wantsNewProduct
  });
}

export function pickAuthoritativeLastBestProduct(
  sessionLastBest = null,
  rememberedProducts = []
) {
  if (sessionLastBest?.product_name) {
    return sessionLastBest;
  }

  const list = Array.isArray(rememberedProducts) ? rememberedProducts : [];
  return list.length ? list[list.length - 1] : null;
}

export function pickAuthoritativeLastProductMentioned(
  sessionLastBest = null,
  sessionMentioned = "",
  rememberedProducts = []
) {
  if (sessionLastBest?.product_name) {
    return sessionLastBest.product_name;
  }
  if (sessionMentioned) {
    return sessionMentioned;
  }
  const list = Array.isArray(rememberedProducts) ? rememberedProducts : [];
  return list[list.length - 1]?.product_name || "";
}
