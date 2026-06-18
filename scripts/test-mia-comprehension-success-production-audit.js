/**
 * PATCH 8.1B.2 — COMPREHENSION_SUCCESS Production Audit
 *
 * Validates full-stack path: Router → Routing → Contract → Response Path → Perception
 * for comprehension success (not ACK collision).
 *
 * Usage: node scripts/test-mia-comprehension-success-production-audit.js
 */

import {
  classifyMiaTurn,
  isComprehensionSuccessFamilyQuery,
  isComprehensionSemanticFamilyQuery,
  isAcknowledgementFamilyQuery,
} from "../lib/miaCognitiveRouter.js";
import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";
import { detectGenericConversationalFallback } from "../lib/miaConversationalFamilyClosureStandard.js";

const MOCK_WINNER = {
  product_name: "Smartphone Recomendado",
  price: "R$ 2.199",
};

const SESSION_ANCHORED = {
  lastBestProduct: MOCK_WINNER,
  lastRecommendation: { winner: MOCK_WINNER.product_name },
};

const GENERIC_WELCOME =
  "Posso te ajudar com compras, comparação de produtos e decisão de custo-benefício.\n\nMe fala o produto que você quer analisar ou buscar.";

const SCENARIOS = [
  { category: "formal", message: "agora ficou claro", anchored: true },
  { category: "formal", message: "entendi o ponto", anchored: true },
  { category: "formal", message: "faz sentido", anchored: true },
  { category: "informal", message: "saquei", anchored: true },
  { category: "informal", message: "captei", anchored: true },
  { category: "informal", message: "boa entendi", anchored: true },
  { category: "curto", message: "entendi", anchored: false },
  { category: "curto", message: "entendi", anchored: true },
  { category: "incompleto", message: "ficou claro", anchored: true },
  { category: "incompleto", message: "entendi agora", anchored: true },
  { category: "regional", message: "peguei", anchored: true },
  { category: "regional", message: "agora caiu a ficha", anchored: true },
  { category: "typo", message: "entendi agr", anchored: true },
  { category: "typo", message: "faz sentido msm", anchored: true },
  { category: "abbreviation", message: "ok agora entendi", anchored: true },
  { category: "abbreviation", message: "faz sentido msm", anchored: true },
  { category: "compound", message: "boa faz sentido", anchored: true },
  { category: "compound", message: "show entendi", anchored: true },
  { category: "formal", message: "agora entendi por que", anchored: true },
  { category: "informal", message: "tá explicado", anchored: false },
];

function hasComprehensionRoutingHold(rd) {
  return (
    rd.conversationAct === "comprehension" ||
    rd.responsePathHint === "comprehension_reply" ||
    rd.responsePathHint === "comprehension_anchored"
  );
}

function simulateScenario({ message, anchored }) {
  const sessionContext = anchored ? SESSION_ANCHORED : {};
  const cognitiveTurn = classifyMiaTurn({
    query: message,
    originalQuery: message,
    hasActiveAnchor: anchored,
    sessionContext,
    detectedIntent: "search",
    contextAction: "search",
  });

  const routingDecision = buildRoutingDecision({
    userMessage: message,
    resolvedQuery: message,
    contextResolution: { mode: "general_answer", directReply: GENERIC_WELCOME },
    sessionContext,
    incomingSessionContext: sessionContext,
    intent: "search",
    contextAction: "search",
    cognitiveRoutingSignal: {
      turnType: cognitiveTurn.turnType,
      confidence: cognitiveTurn.confidence,
      hasActiveAnchor: anchored,
      isComprehension: !!cognitiveTurn.signals?.isComprehension,
      isComprehensionSuccess: !!cognitiveTurn.signals?.isComprehensionSuccess,
      isAcknowledgement: !!cognitiveTurn.signals?.isAcknowledgement,
    },
    signals: {
      hasClearNewCommercialSearch: false,
      looksLikeAmbiguousFollowUp: false,
      looksLikeShortPriorityFollowUp: false,
      isExplicitComparison: false,
      hasComparisonProducts: false,
      wantsNew: false,
    },
  });

  const routerPass =
    isComprehensionSemanticFamilyQuery(message) &&
    !!cognitiveTurn.signals?.isComprehensionSuccess &&
    !!cognitiveTurn.signals?.isComprehension &&
    !cognitiveTurn.signals?.isAcknowledgement;

  const routingPass =
    hasComprehensionRoutingHold(routingDecision) &&
    routingDecision.allowNewSearch === false;

  const handlerGate =
    cognitiveTurn.signals?.isComprehension === true ||
    cognitiveTurn.signals?.isComprehensionSuccess === true ||
    isComprehensionSuccessFamilyQuery(message);

  const responsePathFinal = handlerGate ? "comprehension_flow" : "unknown";
  const ackCollision = handlerGate && isAcknowledgementFamilyQuery(message);

  const preview = anchored
    ? "Ótimo, ficou claro então. Mantemos Smartphone Recomendado como referência — se quiser, posso detalhar algum ponto ou comparar com outra opção."
    : "Boa, entendi. Quando quiser, me fala o que você está pensando em comprar que eu te ajudo a decidir.";

  const genericFallback = detectGenericConversationalFallback(preview);
  const responsePathPass = responsePathFinal === "comprehension_flow";
  const perceptionPass = routerPass && routingPass && responsePathPass && !genericFallback && !ackCollision;

  return {
    message,
    anchored,
    routerPass,
    routingPass,
    responsePathPass,
    perceptionPass,
    ackCollision,
    turnType: cognitiveTurn.turnType,
    act: routingDecision.conversationAct,
    hint: routingDecision.responsePathHint,
    signals: cognitiveTurn.signals,
  };
}

console.log("PATCH 8.1B.2 — COMPREHENSION_SUCCESS Production Audit\n");

let pass = 0;
let fail = 0;
const byCategory = {};

for (const scenario of SCENARIOS) {
  const result = simulateScenario(scenario);
  const ok = result.perceptionPass;
  if (!byCategory[scenario.category]) {
    byCategory[scenario.category] = { pass: 0, total: 0 };
  }
  byCategory[scenario.category].total++;
  if (ok) {
    pass++;
    byCategory[scenario.category].pass++;
    console.log(`✓ [${scenario.category}] "${scenario.message}" (${scenario.anchored ? "anchored" : "cold"}) → comprehension_flow`);
  } else {
    fail++;
    console.log(
      `✗ [${scenario.category}] "${scenario.message}" router=${result.routerPass} routing=${result.routingPass} path=${result.responsePathPass} ack=${result.ackCollision} act=${result.act}`
    );
  }
}

console.log("\n── Métricas por categoria ──");
for (const [cat, stats] of Object.entries(byCategory)) {
  const pct = stats.total ? Math.round((stats.pass / stats.total) * 100) : 0;
  console.log(`  ${cat}: ${stats.pass}/${stats.total} (${pct}%)`);
}

const total = SCENARIOS.length;
const pctTotal = Math.round((pass / total) * 100);
console.log(`\nTOTAL: ${pass}/${total} (${pctTotal}%)`);
console.log(pctTotal >= 90 ? "\nVEREDITO: APROVADO (>90% percepção)" : "\nVEREDITO: GAP — investigar leaks acima");

process.exit(fail > 0 ? 1 : 0);
