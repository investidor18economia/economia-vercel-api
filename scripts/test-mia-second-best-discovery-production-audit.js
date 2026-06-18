/**
 * PATCH 8.1B.3 — SECOND_BEST_DISCOVERY Production Audit
 *
 * Full-stack trace: Router → Routing → Contract → Response Path → Perception (Regra 17)
 *
 * Usage: node scripts/test-mia-second-best-discovery-production-audit.js
 */

import {
  classifyMiaTurn,
  isSecondBestDiscoveryFamilyQuery,
} from "../lib/miaCognitiveRouter.js";
import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";
import { auditScenario } from "./test-mia-production-response-perception-audit.js";

const MOCK_WINNER = { product_name: "Produto Vencedor", price: "R$ 2.199" };
const MOCK_RUNNER_UP = { product_name: "Produto Plano B", price: "R$ 1.899", rank: 2 };

const SESSION_ANCHORED = {
  lastBestProduct: MOCK_WINNER,
  lastRecommendation: { winner: MOCK_WINNER.product_name },
  lastRankingSnapshot: [MOCK_WINNER, MOCK_RUNNER_UP],
};

const POSITIVE_MUST = [
  "qual ficou em segundo?",
  "qual o plano b?",
  "quem quase ganhou?",
  "segunda opção?",
  "runner up?",
  "backup?",
  "reserva?",
  "quem ficou atrás?",
  "quem veio logo depois?",
  "e o segundo?",
  "outra melhor opção?",
  "próxima melhor opção?",
  "quem quase levou?",
  "qual ficou em segundo lugar?",
  "qual seria a alternativa imediata?",
  "se eu não for nesse, qual seria o plano b?",
  "caso eu desista desse, quem vem depois?",
];

const POSITIVE_INFORMAL = [
  "backup ai?",
  "plano b ai?",
  "quem ficou atras?",
  "q ficou em segundo?",
  "e o segundo mano?",
  "slk, quem quase ganhou?",
  "kkk e o plano b?",
  "se eu n pegar esse, qual?",
  "tem outra forte?",
  "e quem veio logo atrás?",
];

const NEGATIVE_MUST_NOT_SBD = [
  { message: "mostra outras opções" },
  { message: "quero ver alternativas" },
  { message: "abre mais opções" },
  { message: "tem outros modelos?" },
  { message: "me mostra concorrentes" },
  { message: "quero explorar opções" },
  { message: "tem algo diferente?" },
  { message: "quero outra categoria" },
  { message: "agora quero notebook" },
  { message: "procura outro produto" },
  { message: "quero gastar menos, mostra alternativas abertas" },
  { message: "quero ver uma lista maior" },
  { message: "tem outro?" },
  { message: "me mostra outra opção" },
  { message: "quero ver opções" },
  { message: "tem concorrente?" },
  { message: "e se eu não pegar esse?" },
  { message: "outra opção" },
];

const POSITIVE_TYPO = [
  "q ficou em segundo?",
  "qual ficou em 2?",
  "plano b msm?",
  "backup msm?",
  "quem ficou atras msm?",
];

const POSITIVE_COMPOUND = [
  "slk mas qual seria a segunda opção?",
  "kkk quem ficou em segundo?",
  "blz, e o plano b?",
  "entendi, mas qual ficou em segundo?",
  "ok, quem quase ganhou?",
];

const POSITIVE_CROSS = [
  "faz sentido, mas qual seria o plano b?",
  "gostei, quem ficou em segundo?",
  "parece bom, e o segundo?",
];

const POSITIVE_COLD_EXTRA = [
  "tem plano b?",
  "qual ficou em segundo lugar?",
  "runner-up?",
  "quem veio logo atrás?",
  "qual seria o backup?",
];

function simulateStack(message, anchored) {
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
    contextResolution: { mode: "general_answer" },
    sessionContext,
    incomingSessionContext: sessionContext,
    intent: "search",
    contextAction: "search",
    cognitiveRoutingSignal: {
      turnType: cognitiveTurn.turnType,
      confidence: cognitiveTurn.confidence,
      hasActiveAnchor: anchored,
      isSecondBestDiscovery: !!cognitiveTurn.signals?.isSecondBestDiscovery,
      isAlternativeExploration: !!cognitiveTurn.signals?.isAlternativeExploration,
    },
    signals: {
      hasClearNewCommercialSearch: false,
      looksLikeAmbiguousFollowUp: false,
      isExplicitComparison: false,
      wantsNew: false,
    },
  });

  const routerPass =
    !!cognitiveTurn.signals?.isSecondBestDiscovery &&
    isSecondBestDiscoveryFamilyQuery(message) &&
    !cognitiveTurn.signals?.isAlternativeExploration;

  const routingPass =
    routingDecision.conversationAct === "second_best_discovery" &&
    routingDecision.allowNewSearch === false &&
    routingDecision.allowReplaceWinner === false;

  const handlerGate =
    cognitiveTurn.signals?.isSecondBestDiscovery === true ||
    isSecondBestDiscoveryFamilyQuery(message) ||
    routingDecision.conversationAct === "second_best_discovery";

  const responsePath = handlerGate ? "second_best_discovery_flow" : routingDecision.responsePathHint || "unknown";

  return { routerPass, routingPass, handlerGate, responsePath, cognitiveTurn, routingDecision };
}

function runPositive(message, category, anchored) {
  const stack = simulateStack(message, anchored);
  const perception = auditScenario({
    id: `SBD-${category}-${anchored ? "anchored" : "cold"}`,
    familyExpected: "SECOND_BEST_DISCOVERY",
    userMessage: message,
    contextType: anchored ? "anchored" : "cold",
  });

  const ok =
    stack.routerPass &&
    stack.routingPass &&
    stack.responsePath === "second_best_discovery_flow" &&
    perception.userPerception === "SIM";

  return { kind: "positive", category, message, anchored, ok, stack, perception };
}

function runNegative(spec) {
  const message = spec.message;
  const stackCold = simulateStack(message, false);
  const stackAnchored = simulateStack(message, true);

  const ok =
    !isSecondBestDiscoveryFamilyQuery(message) &&
    !stackCold.routerPass &&
    !stackAnchored.routerPass &&
    stackCold.responsePath !== "second_best_discovery_flow" &&
 stackAnchored.responsePath !== "second_best_discovery_flow";

  return { kind: "negative", message, ok, stackCold, stackAnchored };
}

console.log("PATCH 8.1B.3 — SECOND_BEST_DISCOVERY Production Audit\n");

const results = [];

for (const message of POSITIVE_MUST) {
  results.push(runPositive(message, "formal", false));
  results.push(runPositive(message, "formal", true));
}
for (const message of POSITIVE_INFORMAL) {
  results.push(runPositive(message, "informal", true));
}
for (const message of POSITIVE_TYPO) {
  results.push(runPositive(message, "typo", true));
}
for (const message of POSITIVE_COMPOUND) {
  results.push(runPositive(message, "compound", true));
}
for (const message of POSITIVE_CROSS) {
  results.push(runPositive(message, "cross", true));
}
for (const message of POSITIVE_COLD_EXTRA) {
  results.push(runPositive(message, "cold_extra", false));
}

for (const spec of NEGATIVE_MUST_NOT_SBD) {
  results.push(runNegative(spec));
}

const positive = results.filter((r) => r.kind === "positive");
const negative = results.filter((r) => r.kind === "negative");
const posOk = positive.filter((r) => r.ok).length;
const negOk = negative.filter((r) => r.ok).length;

console.log(`Positive: ${posOk}/${positive.length} (${((posOk / positive.length) * 100).toFixed(1)}%)`);
console.log(`Negative controls: ${negOk}/${negative.length} (${((negOk / negative.length) * 100).toFixed(1)}%)`);
console.log(`Total scenarios: ${results.length}\n`);

for (const r of positive.filter((x) => !x.ok).slice(0, 15)) {
  console.log(
    `✗ [${r.category}/${r.anchored ? "anchored" : "cold"}] "${r.message}" router=${r.stack.routerPass} routing=${r.stack.routingPass} path=${r.stack.responsePath} perception=${r.perception.userPerception}`
  );
}
for (const r of negative.filter((x) => !x.ok).slice(0, 10)) {
  console.log(`✗ NEG "${r.message}" sbd=${isSecondBestDiscoveryFamilyQuery(r.message)} path=${r.stackAnchored.responsePath}`);
}

const totalOk = posOk + negOk;
const total = results.length;
const pct = (totalOk / total) * 100;

console.log(`\nOVERALL: ${totalOk}/${total} (${pct.toFixed(1)}%)`);
console.log(pct >= 95 ? "\nVEREDITO: APROVADO (≥95%)" : "\nVEREDITO: GAP — revisar falhas acima");

process.exit(pct >= 95 && posOk / positive.length >= 0.95 ? 0 : 1);
