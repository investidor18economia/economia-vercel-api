/**
 * PATCH 8.2A — Decision Consistency Audit (OBSERVATIONAL ONLY)
 *
 * Audita a jornada multi-turno de decisão da MIA:
 *   winner lifecycle · discussion set · scope leakage · contradiction perception · recovery
 *
 * NÃO altera comportamento — apenas observa routing, sessão e (opcional) respostas HTTP.
 *
 * Usage:
 *   node scripts/test-mia-decision-consistency-audit.js
 *   MIA_HTTP_AUDIT=1 node scripts/test-mia-decision-consistency-audit.js
 *
 * HTTP opcional: requer `npm run dev` + MIA_DEBUG=true no servidor para trace completo.
 */

import { classifyMiaTurn, MIA_TURN_TYPES, isConversationalConfusionFamilyQuery } from "../lib/miaCognitiveRouter.js";
import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";
import { applyContractToSessionContext } from "../lib/miaRoutingGuardrails.js";
import { resolveClearNewCommercialSearchForRouting } from "../lib/miaRoutingSafety.js";
import {
  mapCognitiveTurnToLegacyIntent,
  buildCognitiveBridgeAudit,
  guardContextActionWithCognitiveBridge,
} from "../lib/miaCognitiveBridge.js";
import {
  extractMentionedProductFromReply,
} from "../lib/miaDecisionConsistencyAudit.js";
import {
  namesLikelyMatch,
  resolveDecisionEngineWinners,
} from "../lib/miaDecisionConsistencyFixes.js";
import {
  buildAnchoredDiscussionSetProducts,
  detectsAnchoredComparisonIntent,
  mergeDiscussionSetIntoSessionContext,
} from "../lib/miaDiscussionSetEnforcement.js";
import { resolveAllowedProductsForDecision } from "../lib/miaRecommendationStabilityGuard.js";

// ─────────────────────────────────────────────────────────────
// Fixtures — produtos genéricos (sem hardcode de marcas reais)
// ─────────────────────────────────────────────────────────────

const ALPHA = "Smartphone Alpha 35";
const BETA = "Smartphone Beta 22";
const GAMMA = "Smartphone Gamma 18";
const DELTA = "Smartphone Delta 99";

const CATALOG = [ALPHA, BETA, GAMMA, DELTA];

const RANKING = [
  { product_name: ALPHA, rank: 1, price: "R$ 1.950", score: 0.91, isWinner: true },
  { product_name: BETA, rank: 2, price: "R$ 1.799", score: 0.84 },
  { product_name: GAMMA, rank: 3, price: "R$ 1.499", score: 0.72 },
  { product_name: DELTA, rank: 4, price: "R$ 2.100", score: 0.88 },
];

const API = process.env.MIA_API_BASE || "http://localhost:3000";
const API_ENDPOINT = `${API}/api/chat-gpt4o`;
const API_KEY = process.env.MIA_API_KEY || "minha_chave_181199";
const HTTP_ENABLED = process.env.MIA_HTTP_AUDIT === "1" || process.env.MIA_HTTP_AUDIT === "true";

// ─────────────────────────────────────────────────────────────
// Cenários mínimos (PATCH 8.2A)
// ─────────────────────────────────────────────────────────────

const SCENARIOS = [
  {
    id: "S1",
    name: "Compensa? — manter winner",
    turns: [
      "celular ate 2000",
      "sera que compensa? nao quero gastar muito.",
    ],
    expectations: {
      preserveWinnerAfterTurn2: true,
      discussionSetMaxSizeTurn2: 1,
    },
  },
  {
    id: "S2",
    name: "Comparacao com produto especifico",
    turns: [
      "celular ate 2000",
      `estou em duvida entre esse e o ${BETA}`,
    ],
    expectations: {
      discussionSetIncludesTurn2: [ALPHA, BETA],
      comparisonContextExpectedTurn2: true,
      noThirdProductTurn2: true,
    },
  },
  {
    id: "S3",
    name: "Qual dos dois?",
    turns: [
      "celular ate 2000",
      `estou em duvida entre esse e o ${BETA}`,
      "qual dos dois voce indica?",
    ],
    expectations: {
      decisionWithinDiscussionSetTurn3: true,
      noScopeLeakTurn3: true,
    },
  },
  {
    id: "S4",
    name: "Confusao do usuario",
    turns: [
      "celular ate 2000",
      `estou em duvida entre esse e o ${BETA}`,
      "qual dos dois voce indica?",
      "nao entendi.",
      "voce me confundiu.",
    ],
    expectations: {
      comprehensionTurn4: true,
      confusionRecoveryTurn5: true,
    },
  },
  {
    id: "S5",
    name: "Mudanca legitima de winner",
    turns: [
      "celular ate 2000",
      "quero gastar o minimo possivel.",
    ],
    expectations: {
      winnerMayChangeTurn2: true,
      changeMustBeExplainedTurn2: true,
    },
  },
];

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function normalizeText(s = "") {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pickName(p) {
  if (!p) return null;
  if (typeof p === "string") return p;
  return p.product_name || p.title || p.official_name || null;
}

function extractCatalogMentions(text = "", catalog = CATALOG) {
  const norm = normalizeText(text);
  return catalog.filter((name) => norm.includes(normalizeText(name)));
}

function extractProductMentionsFromQuery(query = "", catalog = CATALOG) {
  return extractCatalogMentions(query, catalog);
}

function inferDiscussionSet(session = {}, query = "") {
  const set = new Set();

  const winner = pickName(session.lastBestProduct);
  if (winner) set.add(winner);

  const comparisonProducts = session.lastComparisonProducts || [];
  for (const p of comparisonProducts) {
    const n = pickName(p);
    if (n) set.add(n);
  }

  if (session.comparisonContextLocked && Array.isArray(session.contexts)) {
    for (const ctx of session.contexts) {
      if (ctx?.type !== "comparison") continue;
      for (const p of ctx.comparisonProducts || []) {
        const n = pickName(p);
        if (n) set.add(n);
      }
    }
  }

  for (const p of session.lastProducts || []) {
    const n = pickName(p);
    if (n && extractCatalogMentions(query, [n]).length) set.add(n);
  }

  for (const mentioned of extractProductMentionsFromQuery(query, CATALOG)) {
    set.add(mentioned);
  }

  if (/\b(esse|essa|este|esta)\b/.test(normalizeText(query)) && winner) {
    set.add(winner);
  }

  return [...set];
}

function isAuthorizedWinnerChange({ routingDecision, cognitiveTurn, query }) {
  const rd = routingDecision || {};
  if (!rd.allowReplaceWinner) return { authorized: false, reason: null };

  if (rd.mode === "new_search" || rd.mode === "priority_change_reopen") {
    return { authorized: true, reason: rd.mode };
  }
  if (cognitiveTurn?.turnType === MIA_TURN_TYPES.NEW_SEARCH) {
    return { authorized: true, reason: "NEW_SEARCH" };
  }
  if (cognitiveTurn?.turnType === MIA_TURN_TYPES.PRIORITY_SHIFT) {
    return { authorized: true, reason: "PRIORITY_SHIFT" };
  }
  if (rd.mode === "refinement" && rd.allowRerank) {
    return { authorized: true, reason: "REFINEMENT_RERANK" };
  }
  if (/\b(gastar (o )?minimo|economizar|mais barato|menor preco)\b/.test(normalizeText(query))) {
    return { authorized: true, reason: "CONSTRAINT_REVEAL" };
  }
  return { authorized: true, reason: "ALLOW_REPLACE_WINNER" };
}

function detectChangeExplanation(reply = "", prevWinner = "", newWinner = "") {
  const r = normalizeText(reply);
  if (!prevWinner || !newWinner || namesLikelyMatch(prevWinner, newWinner)) {
    return { explained: true, signals: [] };
  }
  const signals = [];
  if (/\b(antes|anteriormente|tinha indicado|mudei|agora|passa a|prioridade|minimo|econom)\b/.test(r)) {
    signals.push("explicit_transition");
  }
  if (namesLikelyMatch(extractMentionedProductFromReply(reply) || "", newWinner)) {
    signals.push("mentions_new_winner");
  }
  return { explained: signals.length > 0, signals };
}

function detectConfusionRecovery(reply = "") {
  const r = normalizeText(reply);
  const signals = [];
  if (/\b(voce tem razao|me desculpe|desculpa|organizar|vamos organizar|ficou confuso|alternei|sem deixar claro)\b/.test(r)) {
    signals.push("acknowledges_confusion");
  }
  if (/\b(principal|referencia|recomendacao|entre (esses|estes|os dois))\b/.test(r)) {
    signals.push("reorganizes_decision");
  }
  if (extractCatalogMentions(reply).length >= 1) {
    signals.push("names_products_in_recovery");
  }
  return { recovered: signals.includes("acknowledges_confusion") || signals.length >= 2, signals };
}

function detectComprehensionRecovery(reply = "") {
  const r = normalizeText(reply);
  const signals = [];
  if (/\b(vamos simplificar|simplificar|de outro jeito|em uma frase)\b/.test(r)) {
    signals.push("simplifies_explanation");
  }
  if (/\b(recomendacao principal|continuo recomendando|minha recomendacao)\b/.test(r)) {
    signals.push("reaffirms_winner");
  }
  if (extractCatalogMentions(reply).length >= 1) {
    signals.push("names_products_in_recovery");
  }
  return {
    recovered:
      signals.includes("simplifies_explanation") &&
      (signals.includes("reaffirms_winner") || signals.includes("names_products_in_recovery")),
    signals,
  };
}

function detectExplicitRecommendationChange(reply = "") {
  const r = normalizeText(reply);
  const signals = [];
  if (/\b(sua prioridade mudou|prioridade mudou)\b/.test(r)) {
    signals.push("acknowledges_shift");
  }
  if (/\b(antes eu estava|agora estou priorizando|agora estou priorizando)\b/.test(r)) {
    signals.push("explains_criterion_transition");
  }
  if (/\b(recomendacao mudou|mudou de|passa a ser|eu recomendo)\b/.test(r)) {
    signals.push("explains_winner_transition");
  }
  if (/\b(com as novas prioridades|novo criterio|novas prioridades)\b/.test(r)) {
    signals.push("clear_verdict");
  }
  return {
    detected:
      signals.includes("acknowledges_shift") &&
      (signals.includes("explains_criterion_transition") || signals.includes("explains_winner_transition")) &&
      signals.includes("clear_verdict"),
    signals,
  };
}

function buildInitialSearchSession() {
  return {
    lastBestProduct: { product_name: ALPHA, price: RANKING[0].price, link: "https://mia.test/p/alpha" },
    lastProductMentioned: ALPHA,
    lastProducts: RANKING.slice(0, 3),
    lastRankingSnapshot: RANKING.slice(0, 3),
    lastCategory: "celular",
    lastIntent: "search",
    lastInteractionType: "search",
    lastQuery: "celular ate 2000",
    lastAxis: "custo-beneficio",
    budgetMax: 2000,
    comparisonContextLocked: false,
    lastComparisonProducts: [],
  };
}

function applyTurnSessionMutation(session, query, trace) {
  const next = { ...session };

  if (trace.isNewSearchEstablishingWinner) {
    return buildInitialSearchSession();
  }

  if (trace.routingDecision.mode === "anchored_comparison_hold" || trace.establishingDiscussionSet) {
    return mergeDiscussionSetIntoSessionContext(next, {
      anchorProduct: next.lastBestProduct,
      query,
      rememberedProducts: next.lastProducts || [],
      preserveExisting: false,
    });
  }

  const contracted = applyContractToSessionContext(
    next,
    trace.routingDecision,
    {
      proposedBestProduct: next.lastBestProduct,
      proposedProducts: next.lastProducts,
    }
  );

  return contracted;
}

function extractProductMmentionsFromQuerySafe(query) {
  return extractProductMentionsFromQuery(query, CATALOG);
}

function diagnoseClearNewSearchCause(query = "") {
  const norm = normalizeText(query);
  const causes = [];
  if (/\b(quero|indica|recomenda|buscar|procurar)\b/.test(norm)) {
    causes.push("EXPLICIT_SEARCH_VERB_PATTERN");
  }
  if (/\b(smartphone|celular|iphone|notebook)\b/.test(norm)) {
    causes.push("CATEGORY_TOKEN_IN_MESSAGE");
  }
  if (/\b(ate|até)\s*\d+/.test(norm)) {
    causes.push("BUDGET_IN_MESSAGE");
  }
  return causes;
}

function simulatePipelineTurn(query, sessionContext) {
  const hasActiveAnchor = !!sessionContext?.lastBestProduct?.product_name;
  const comparisonContext = {
    locked: !!sessionContext?.comparisonContextLocked,
    products: sessionContext?.lastComparisonProducts || [],
  };

  const cognitiveTurn = classifyMiaTurn({
    query,
    originalQuery: query,
    resolvedQuery: query,
    sessionContext,
    hasActiveAnchor,
    comparisonContext,
  });

  const bridgeResult = mapCognitiveTurnToLegacyIntent(cognitiveTurn);
  const bridgeAudit = buildCognitiveBridgeAudit(bridgeResult, "search");
  const guardResult = guardContextActionWithCognitiveBridge({
    contextAction: hasActiveAnchor ? "decision" : "search",
    bridgeAudit,
    cognitiveTurnEarly: cognitiveTurn,
  });

  const clearNewSearch = resolveClearNewCommercialSearchForRouting({
    query,
    resolvedQuery: query,
    hasAnchor: hasActiveAnchor,
    isExplicitComparison: !!cognitiveTurn.signals?.isComparison,
    wantsNew: false,
    wantsNewProduct: () => false,
    detectProductCategory: () => "",
  });

  const rawComparisonProducts =
    (sessionContext?.lastComparisonProducts?.length >= 2
      ? sessionContext.lastComparisonProducts
      : null) ||
    (comparisonContext.products?.length >= 2 ? comparisonContext.products : []);

  const isAnchoredComparisonEstablishing =
    hasActiveAnchor &&
    detectsAnchoredComparisonIntent(query, { hasActiveAnchor: true });
  const prospectiveDiscussionProducts = isAnchoredComparisonEstablishing
    ? buildAnchoredDiscussionSetProducts({
        anchorProduct: sessionContext?.lastBestProduct,
        query,
        rememberedProducts: sessionContext?.lastProducts || [],
      })
    : [];
  const comparisonProductsForRouting =
    rawComparisonProducts.length >= 2
      ? rawComparisonProducts
      : prospectiveDiscussionProducts.length >= 2
        ? prospectiveDiscussionProducts
        : rawComparisonProducts;

  const routingDecision = buildRoutingDecision({
    userMessage: query,
    resolvedQuery: query,
    contextResolution: {
      lockedComparisonFollowUp: !!sessionContext?.comparisonContextLocked,
    },
    sessionContext,
    incomingSessionContext: sessionContext,
    intent: "search",
    contextAction: guardResult.contextAction,
    cognitiveRoutingSignal: {
      turnType: cognitiveTurn.turnType,
      confidence: cognitiveTurn.confidence,
      hasActiveAnchor,
    },
    signals: {
      hasClearNewCommercialSearch: clearNewSearch,
      isContextDecisionOnOriginal: guardResult.contextAction === "decision",
      isExplicitComparison: !!cognitiveTurn.signals?.isComparison,
      hasComparisonProducts: comparisonProductsForRouting.length >= 2,
      isAnchoredComparisonEstablishing,
      isConversationalConfusion:
        !!cognitiveTurn.signals?.isConversationalConfusion ||
        isConversationalConfusionFamilyQuery(query, {
          hasActiveAnchor,
          sessionContext,
        }),
      isComparisonContextFollowUp:
        rawComparisonProducts.length >= 2 &&
        /\b(dos dois|entre (esses|estes)|qual (dos|deles)|veredito)\b/.test(normalizeText(query)),
      isComparisonFollowUpLocked:
        rawComparisonProducts.length >= 2 &&
        normalizeText(query).length <= 100 &&
        !clearNewSearch,
      wantsNew: false,
      lockedComparisonFollowUp: !!sessionContext?.comparisonContextLocked,
    },
  });

  const previousWinner = pickName(sessionContext?.lastBestProduct);
  const discussionSet = inferDiscussionSet(sessionContext, query);
  const authChange = isAuthorizedWinnerChange({ routingDecision, cognitiveTurn, query });

  const catalogProducts = sessionContext?.lastProducts || RANKING.slice(0, 3);
  const { allowedProducts: rememberedProducts, discussionSetActive } =
    resolveAllowedProductsForDecision({
      sessionContext,
      query,
      anchorProduct: sessionContext?.lastBestProduct,
      catalogProducts,
    });
  const decisionEngine = resolveDecisionEngineWinners(
    rememberedProducts,
    routingDecision.shouldPreserveAnchor
      ? sessionContext?.lastBestProduct
      : null,
    { allowedProducts: discussionSetActive ? rememberedProducts : null }
  );

  const isNewSearchEstablishingWinner =
    !hasActiveAnchor &&
    (routingDecision.mode === "new_search" ||
      cognitiveTurn.turnType === MIA_TURN_TYPES.NEW_SEARCH ||
      clearNewSearch);

  const scopeLeakRisk = [];
  if (discussionSet.length >= 2) {
    if (!routingDecision.mode?.includes("comparison") && !sessionContext?.comparisonContextLocked) {
      scopeLeakRisk.push("COMPARISON_NOT_LOCKED_IN_ROUTING");
    }
    if (!cognitiveTurn.signals?.isComparisonFollowUp && /\b(dos dois|entre (esses|estes))\b/.test(normalizeText(query))) {
      scopeLeakRisk.push("BINARY_CHOICE_NOT_RECOGNIZED_AS_COMPARISON_FOLLOWUP");
    }
    const deBest = pickName(decisionEngine.best);
    if (deBest && !discussionSet.some((d) => namesLikelyMatch(d, deBest))) {
      scopeLeakRisk.push("DECISION_ENGINE_OUTSIDE_DISCUSSION_SET");
    }
  } else if (
    routingDecision.shouldPreserveAnchor &&
    routingDecision.mode === "context_decision"
  ) {
    const deBest = pickName(decisionEngine.best);
    if (deBest && previousWinner && !namesLikelyMatch(deBest, previousWinner)) {
      scopeLeakRisk.push("DECISION_ENGINE_DIVERGES_FROM_ANCHOR");
    }
    if ((catalogProducts?.length || 0) > 1 && !routingDecision.allowReplaceWinner && !discussionSetActive) {
      scopeLeakRisk.push("FULL_CATALOG_AVAILABLE_TO_DECISION_ENGINE");
    }
  }

  return {
    query,
    previousWinner,
    currentWinner: pickName(decisionEngine.best) || previousWinner,
    discussionSet,
    productsMentionedInQuery: extractProductMmentionsFromQuerySafe(query),
    cognitiveTurn: {
      turnType: cognitiveTurn.turnType,
      conversationAct: cognitiveTurn.conversationAct,
      signals: {
        isComparison: !!cognitiveTurn.signals?.isComparison,
        isComparisonFollowUp: !!cognitiveTurn.signals?.isComparisonFollowUp,
        isHesitation: !!cognitiveTurn.signals?.isHesitationReaction?.detected,
        isDecisionConfirmation: !!cognitiveTurn.signals?.isDecisionConfirmation,
        isComprehension: !!cognitiveTurn.signals?.isComprehension,
      },
    },
    routingDecision: {
      mode: routingDecision.mode,
      allowReplaceWinner: routingDecision.allowReplaceWinner,
      shouldPreserveAnchor: routingDecision.shouldPreserveAnchor,
      allowNewSearch: routingDecision.allowNewSearch,
      responsePathHint: routingDecision.responsePathHint,
      conversationAct: routingDecision.conversationAct,
    },
    bridge: { active: bridgeAudit.active, contextAction: guardResult.contextAction },
    clearNewSearch,
    winnerChange: {
      occurred: !!(previousWinner && decisionEngine.best && !namesLikelyMatch(previousWinner, decisionEngine.best)),
      authorized: authChange.authorized,
      authorizationReason: authChange.reason,
      allowReplaceWinner: routingDecision.allowReplaceWinner,
    },
    decisionEngine: {
      best: pickName(decisionEngine.best),
      second: pickName(decisionEngine.second),
      anchorUsed: routingDecision.shouldPreserveAnchor ? previousWinner : null,
    },
    scopeLeakRisk,
    isNewSearchEstablishingWinner,
    establishingDiscussionSet:
      routingDecision.mode === "anchored_comparison_hold" ||
      (isAnchoredComparisonEstablishing && prospectiveDiscussionProducts.length >= 2),
    proposedBestProduct: decisionEngine.best,
    clearNewSearch,
    clearNewSearchCauses: clearNewSearch ? diagnoseClearNewSearchCause(query) : [],
  };
}

function evaluateStaticTurn(scenario, turnIndex, trace, sessionBefore) {
  const flags = [];
  const exp = scenario.expectations || {};
  const turnNum = turnIndex + 1;

  if (exp.preserveWinnerAfterTurn2 && turnNum === 2) {
    if (trace.winnerChange.occurred && !trace.winnerChange.authorized) {
      flags.push({ type: "WINNER_DRIFT", detail: "winner mudou sem autorizacao em 'compensa?'" });
    }
    if (trace.routingDecision.allowReplaceWinner) {
      flags.push({
        type: "UNAUTHORIZED_REPLACE",
        detail: `allowReplaceWinner=true — clearNewSearch=${trace.clearNewSearch} causes=${(trace.clearNewSearchCauses || []).join(",")}`,
      });
    }
    if (trace.scopeLeakRisk.includes("FULL_CATALOG_AVAILABLE_TO_DECISION_ENGINE")) {
      flags.push({ type: "ANCHOR_DIVERGENCE", detail: "decision engine recebe catalogo completo da busca" });
    }
  }

  if (exp.discussionSetIncludesTurn2 && turnNum === 2) {
    for (const needed of exp.discussionSetIncludesTurn2) {
      if (!trace.discussionSet.some((d) => namesLikelyMatch(d, needed))) {
        flags.push({ type: "DISCUSSION_SET_GAP", detail: `faltando ${needed} no discussion set` });
      }
    }
    if (exp.comparisonContextExpectedTurn2 && !trace.cognitiveTurn.signals.isComparison) {
      flags.push({ type: "COMPARISON_NOT_DETECTED", detail: "router nao detectou comparacao explicita" });
    }
  }

  if (exp.decisionWithinDiscussionSetTurn3 && turnNum === 3) {
    if (trace.scopeLeakRisk.length > 0) {
      flags.push({ type: "SCOPE_LEAKAGE_RISK", detail: trace.scopeLeakRisk.join(", ") });
    }
    const deBest = trace.decisionEngine.best;
    if (deBest && trace.discussionSet.length >= 2 && !trace.discussionSet.some((d) => namesLikelyMatch(d, deBest))) {
      flags.push({ type: "OUT_OF_DISCUSSION_SET", detail: `decision engine escolhe ${deBest} fora do set` });
    }
  }

  if (exp.comprehensionTurn4 && turnNum === 4) {
    if (trace.cognitiveTurn.turnType !== MIA_TURN_TYPES.EXPLANATION_REQUEST && !trace.cognitiveTurn.signals.isComprehension) {
      flags.push({ type: "COMPREHENSION_MISS", detail: `'nao entendi' classificado como ${trace.cognitiveTurn.turnType}` });
    }
  }

  if (exp.confusionRecoveryTurn5 && turnNum === 5) {
    if (
      trace.cognitiveTurn.turnType === MIA_TURN_TYPES.UNKNOWN &&
      !trace.cognitiveTurn.signals?.isConversationalConfusion
    ) {
      flags.push({ type: "CONFUSION_NOT_RECOGNIZED", detail: "'voce me confundiu' cai em UNKNOWN — sem familia de recovery" });
    }
  }

  if (exp.winnerMayChangeTurn2 && turnNum === 2) {
    if (trace.cognitiveTurn.turnType !== MIA_TURN_TYPES.PRIORITY_SHIFT) {
      flags.push({ type: "PRIORITY_SHIFT_MISS", detail: `esperado PRIORITY_SHIFT, got ${trace.cognitiveTurn.turnType}` });
    }
    if (trace.routingDecision.allowReplaceWinner === false && trace.routingDecision.shouldPreserveAnchor) {
      flags.push({ type: "CHANGE_BLOCKED", detail: "mudanca legitima bloqueada no routing (allowReplaceWinner=false)" });
    }
    if (trace.routingDecision.mode !== "explicit_recommendation_change" && trace.routingDecision.allowReplaceWinner !== true) {
      flags.push({ type: "EXPLICIT_CHANGE_MODE_MISS", detail: `mode=${trace.routingDecision.mode}` });
    }
  }

  return flags;
}

function runStaticScenario(scenario) {
  let session = {};
  const turnReports = [];

  for (let i = 0; i < scenario.turns.length; i++) {
    const query = scenario.turns[i];
    const trace = simulatePipelineTurn(query, session);
    const flags = evaluateStaticTurn(scenario, i, trace, session);
    session = applyTurnSessionMutation(session, query, trace);

    turnReports.push({
      turn: i + 1,
      query,
      initialWinner: trace.previousWinner,
      currentWinner: pickName(session.lastBestProduct) || trace.currentWinner,
      discussionSet: trace.discussionSet,
      productsInQuery: trace.productsMentionedInQuery,
      winnerChange: trace.winnerChange,
      scopeLeakRisk: trace.scopeLeakRisk,
      routing: trace.routingDecision,
      turnType: trace.cognitiveTurn.turnType,
      clearNewSearch: trace.clearNewSearch,
      clearNewSearchCauses: trace.clearNewSearchCauses,
      flags,
    });
  }

  return { scenario, turnReports, ok: turnReports.every((t) => t.flags.length === 0) };
}

// ─────────────────────────────────────────────────────────────
// HTTP layer (optional)
// ─────────────────────────────────────────────────────────────

async function callHttp(text, sessionContext, messages, conversationId) {
  const resp = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify({
      text,
      user_id: "audit-8-2a",
      conversation_id: conversationId,
      messages,
      session_context: sessionContext || {},
    }),
    signal: AbortSignal.timeout(120000),
  });
  return { status: resp.status, data: await resp.json() };
}

async function runHttpScenario(scenario) {
  let sessionContext = {};
  let messages = [];
  const conversationId = `audit-82a-${scenario.id}-${Date.now()}`;
  const turnReports = [];

  for (let i = 0; i < scenario.turns.length; i++) {
    const query = scenario.turns[i];
    const anchorBefore = pickName(sessionContext.lastBestProduct);
    const discussionBefore = inferDiscussionSet(sessionContext, query);

    const { status, data } = await callHttp(query, sessionContext, messages, conversationId);
    const reply = String(data.reply || "");
    const anchorAfter = pickName(data.session_context?.lastBestProduct);
    const mentionedInReply = extractCatalogMentions(reply);
    const verbalized = extractMentionedProductFromReply(reply);
    const dca = data.mia_debug?.pipelineTrace?.decisionConsistencyAudit || {};

    const flags = [];
    const outOfScope = mentionedInReply.filter(
      (p) => discussionBefore.length >= 2 && !discussionBefore.some((d) => namesLikelyMatch(d, p))
    );
    if (outOfScope.length > 0) {
      flags.push({ type: "HTTP_SCOPE_LEAKAGE", detail: `produtos fora do discussion set: ${outOfScope.join(", ")}` });
    }
    if (anchorBefore && anchorAfter && !namesLikelyMatch(anchorBefore, anchorAfter)) {
      const explained = detectChangeExplanation(reply, anchorBefore, anchorAfter);
      if (!explained.explained) {
        flags.push({ type: "HTTP_WINNER_CHANGE_UNEXPLAINED", detail: `${anchorBefore} → ${anchorAfter}` });
      }
    }
    if (/\bvoce me confundiu\b/.test(normalizeText(query))) {
      const recovery = detectConfusionRecovery(reply);
      if (!recovery.recovered) {
        flags.push({ type: "HTTP_NO_CONFUSION_RECOVERY", detail: "resposta nao reconhece confusao" });
      }
    }
    if (/\bnao entendi\b/.test(normalizeText(query))) {
      const compRecovery = detectComprehensionRecovery(reply);
      if (!compRecovery.recovered) {
        flags.push({ type: "HTTP_NO_COMPREHENSION_RECOVERY", detail: "resposta nao simplifica explicacao" });
      }
    }
    if (/\bgastar (o )?minimo\b/.test(normalizeText(query))) {
      const explicitChange = detectExplicitRecommendationChange(reply);
      if (!explicitChange.detected) {
        flags.push({ type: "HTTP_NO_EXPLICIT_CHANGE_PROTOCOL", detail: "mudanca de prioridade sem protocolo explicito" });
      }
    }
    if ((dca.divergences || []).length > 0) {
      flags.push({ type: "HTTP_DECISION_AUDIT_DIVERGENCE", detail: dca.divergences.join(", ") });
    }

    turnReports.push({
      turn: i + 1,
      query,
      httpStatus: status,
      anchorBefore,
      anchorAfter,
      discussionSetBefore: discussionBefore,
      productsInReply: mentionedInReply,
      winnerVerbalized: verbalized,
      decisionAudit: dca,
      replySnippet: reply.replace(/\s+/g, " ").trim().slice(0, 200),
      flags,
    });

    if (data.session_context) sessionContext = data.session_context;
    messages.push({ role: "user", content: query });
    if (data.reply) messages.push({ role: "assistant", content: data.reply });
  }

  return { scenario, turnReports, ok: turnReports.every((t) => t.flags.length === 0) };
}

async function probeHttpAvailable() {
  if (!HTTP_ENABLED) return false;
  try {
    const resp = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
      body: JSON.stringify({ text: "oi", user_id: "probe", conversation_id: "probe" }),
      signal: AbortSignal.timeout(8000),
    });
    return resp.ok || resp.status === 401 || resp.status === 400;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// Verdict
// ─────────────────────────────────────────────────────────────

function computeVerdict(staticResults, httpResults) {
  const allFlags = [];
  for (const r of staticResults) {
    for (const t of r.turnReports) allFlags.push(...t.flags);
  }
  if (httpResults) {
    for (const r of httpResults) {
      for (const t of r.turnReports) allFlags.push(...t.flags);
    }
  }

  const critical = allFlags.filter((f) =>
    [
      "WINNER_DRIFT",
      "HTTP_SCOPE_LEAKAGE",
      "OUT_OF_DISCUSSION_SET",
      "HTTP_WINNER_CHANGE_UNEXPLAINED",
      "CONFUSION_NOT_RECOGNIZED",
      "HTTP_NO_CONFUSION_RECOVERY",
    ].includes(f.type)
  );

  const partial = allFlags.filter((f) =>
    [
      "SCOPE_LEAKAGE_RISK",
      "DISCUSSION_SET_GAP",
      "COMPARISON_NOT_DETECTED",
      "ANCHOR_DIVERGENCE",
      "FULL_CATALOG_AVAILABLE_TO_DECISION_ENGINE",
      "HTTP_DECISION_AUDIT_DIVERGENCE",
    ].includes(f.type)
  );

  if (critical.length > 0) return { verdict: "C) FAIL", critical, partial, totalFlags: allFlags.length };
  if (partial.length > 0 || allFlags.length > 0) return { verdict: "B) PARTIAL", critical, partial, totalFlags: allFlags.length };
  return { verdict: "A) ROBUST", critical, partial, totalFlags: 0 };
}

// ─────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────

function printTurnReport(t) {
  console.log(`\n  Turn ${t.turn}: "${t.query}"`);
  console.log(`    turnType=${t.turnType || "—"} mode=${t.routing?.mode || "—"} allowReplace=${t.routing?.allowReplaceWinner}`);
  console.log(`    winner: ${t.initialWinner || "—"} → ${t.currentWinner || "—"}`);
  console.log(`    discussionSet: [${(t.discussionSet || []).join(", ")}]`);
  if (t.scopeLeakRisk?.length) console.log(`    scopeLeakRisk: ${t.scopeLeakRisk.join(", ")}`);
  if (t.clearNewSearch) {
    console.log(`    clearNewSearch: true (${(t.clearNewSearchCauses || []).join(", ") || "unknown"})`);
  }
  if (t.winnerChange?.occurred) {
    console.log(`    winnerChange: authorized=${t.winnerChange.authorized} reason=${t.winnerChange.authorizationReason}`);
  }
  if (t.flags?.length) {
    for (const f of t.flags) console.log(`    ⚠ ${f.type}: ${f.detail}`);
  } else {
    console.log("    ✓ sem flags estaticas");
  }
}

function printHttpTurnReport(t) {
  console.log(`\n  Turn ${t.turn}: "${t.query}" (HTTP ${t.httpStatus})`);
  console.log(`    anchor: ${t.anchorBefore || "—"} → ${t.anchorAfter || "—"}`);
  console.log(`    discussionSetBefore: [${(t.discussionSetBefore || []).join(", ")}]`);
  console.log(`    productsInReply: [${(t.productsInReply || []).join(", ")}]`);
  console.log(`    verbalized: ${t.winnerVerbalized || "—"}`);
  console.log(`    reply: ${t.replySnippet}`);
  if (t.flags?.length) {
    for (const f of t.flags) console.log(`    ⚠ ${f.type}: ${f.detail}`);
  } else {
    console.log("    ✓ sem flags HTTP");
  }
}

function printDiagnosis(verdictObj) {
  console.log("\n" + "═".repeat(72));
  console.log("DIAGNÓSTICO PROVÁVEL (PATCH 8.2A)");
  console.log("═".repeat(72));
  console.log(`
1. Winner muda / nova busca abre indevidamente quando:
   - resolveClearNewCommercialSearchForRouting retorna true em follow-ups ancorados
   - EXPLICIT_SEARCH_VERB_PATTERN captura "quero" em "nao quero gastar" e "indica" em "qual dos dois voce indica"
   - CATEGORY_TOKEN_IN_MESSAGE captura "smartphone" no nome do produto comparado
   - Isso força mode=new_search + allowReplaceWinner=true mesmo com anchor ativo

2. Discussion set vaza porque:
   - Router não detecta "estou em duvida entre esse e X" como isComparison (COMPARISON_NOT_DETECTED)
   - "qual dos dois voce indica?" não aciona isComparisonFollowUp (regex não cobre "dos dois")
   - comparisonContextLocked não é setado automaticamente no routing estático simulado

3. Contexto esquecido quando:
   - turnType=UNKNOWN em comparação binária → cai em context_decision genérico
   - "voce me confundiu" → UNKNOWN sem família de recovery dedicada

4. Contradição percebida pelo usuário:
   - Resposta tecnicamente defensável (sessão preserva lastBestProduct) mas verbalização cita outro produto
   - Alternância iPhone 11/13 no caso real = DECISION_ENGINE + falta de discussion set enforcement

5. Recovery ausente:
   - COMPREHENSION cobre "nao entendi" (EXPLANATION_REQUEST)
   - "voce me confundiu" não tem família semântica → sem protocolo de reorganização
`);
  console.log("RECOMENDAÇÃO PARA PATCH 8.3+:");
  console.log("  8.3A — Winner Lifecycle Enforcement");
  console.log("  8.3B — Discussion Set Enforcement (comparison lock + binary choice router)");
  console.log("  8.3C — Recommendation Stability Guard (decision engine scoped to discussion set)");
  console.log("  8.3F — Contradiction Recovery Layer ('voce me confundiu')");
  console.log("  8.3G — User Confusion Recovery Layer");
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function main() {
  console.log("PATCH 8.2A — Decision Consistency Audit (OBSERVATIONAL ONLY)\n");
  console.log("Audit ID: MIA_DECISION_CONSISTENCY_AUDIT_8_2A");
  console.log(`Fixtures: winner=${ALPHA}, compare=${BETA}, catalog=${CATALOG.join(" | ")}\n`);

  console.log("── PARTE 1: Pipeline estático (routing + decision engine + discussion set) ──");
  const staticResults = SCENARIOS.map(runStaticScenario);

  for (const r of staticResults) {
    console.log(`\n${"─".repeat(64)}`);
    console.log(`${r.scenario.id} — ${r.scenario.name}`);
    for (const t of r.turnReports) printTurnReport(t);
  }

  let httpResults = null;
  const httpOk = await probeHttpAvailable();
  if (httpOk) {
    console.log("\n── PARTE 2: HTTP real (resposta + scope leakage + recovery) ──");
    httpResults = [];
    for (const scenario of SCENARIOS) {
      console.log(`\n${"─".repeat(64)}`);
      console.log(`${scenario.id} — ${scenario.name} [HTTP]`);
      const r = await runHttpScenario(scenario);
      httpResults.push(r);
      for (const t of r.turnReports) printHttpTurnReport(t);
    }
  } else {
    console.log("\n── PARTE 2: HTTP — SKIPPED (MIA_HTTP_AUDIT=1 + servidor local necessário) ──");
  }

  const verdictObj = computeVerdict(staticResults, httpResults);

  console.log("\n" + "═".repeat(72));
  console.log("SUMÁRIO");
  console.log("═".repeat(72));
  console.log(`Cenários estáticos: ${staticResults.filter((r) => r.ok).length}/${staticResults.length} sem flags`);
  if (httpResults) {
    console.log(`Cenários HTTP: ${httpResults.filter((r) => r.ok).length}/${httpResults.length} sem flags`);
  }
  console.log(`Total flags: ${verdictObj.totalFlags} (critical=${verdictObj.critical.length}, partial=${verdictObj.partial.length})`);
  console.log(`\nVEREDITO FINAL: ${verdictObj.verdict}`);

  printDiagnosis(verdictObj);

  console.log("\n" + "═".repeat(72));
  console.log("ARQUIVOS ANALISADOS");
  console.log("═".repeat(72));
  console.log(`
  lib/miaCognitiveRouter.js          — classificação, comparison follow-up, hesitation
  lib/miaRoutingDecisionContract.js    — allowReplaceWinner, comparison_followup mode
  lib/miaRoutingGuardrails.js        — applyContractToSessionContext, winner invariant
  lib/miaDecisionConsistencyAudit.js — snapshot winner_real vs verbalizado
  lib/miaDecisionConsistencyFixes.js — resolveDecisionEngineWinners (PATCH 4.6)
  pages/api/chat-gpt4o.js            — buildDecisionEngineReply, comparisonContextLocked
  scripts/audit-patch45-decision-consistency.js — audit anterior (referência)
`);

  console.log("ARQUIVO CRIADO:");
  console.log("  scripts/test-mia-decision-consistency-audit.js\n");

  console.log("COMO RODAR:");
  console.log("  node scripts/test-mia-decision-consistency-audit.js");
  console.log("  MIA_HTTP_AUDIT=1 npm run dev   # terminal 1");
  console.log("  MIA_DEBUG=true MIA_HTTP_AUDIT=1 node scripts/test-mia-decision-consistency-audit.js\n");

  if (verdictObj.verdict.startsWith("C")) process.exit(1);
}

main().catch((err) => {
  console.error("AUDIT FAILED:", err);
  process.exit(1);
});
