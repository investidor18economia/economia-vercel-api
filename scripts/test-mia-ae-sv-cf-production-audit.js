/**
 * PATCH 8.1B.5 — ALTERNATIVE_EXPLORATION / SOCIAL_VALIDATION / COMPREHENSION_FAILURE
 *
 * Full-stack trace: Router → Routing → Contract → Response Path → Perception (Regra 17)
 *
 * Usage: node scripts/test-mia-ae-sv-cf-production-audit.js
 */

import {
  classifyMiaTurn,
  isAlternativeExplorationFamilyQuery,
  isSocialValidationFamilyQuery,
  isComprehensionFamilyQuery,
} from "../lib/miaCognitiveRouter.js";
import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";
import { auditScenario } from "./test-mia-production-response-perception-audit.js";

const FAMILIES = ["ALTERNATIVE_EXPLORATION", "SOCIAL_VALIDATION", "COMPREHENSION_FAILURE"];

const DETECTORS = {
  ALTERNATIVE_EXPLORATION: isAlternativeExplorationFamilyQuery,
  SOCIAL_VALIDATION: isSocialValidationFamilyQuery,
  COMPREHENSION_FAILURE: isComprehensionFamilyQuery,
};

const ROUTING_ACT = {
  ALTERNATIVE_EXPLORATION: "alternative_exploration",
  SOCIAL_VALIDATION: "social_validation",
  COMPREHENSION_FAILURE: "comprehension",
};

const FLOW_PATH = {
  ALTERNATIVE_EXPLORATION: "alternative_exploration_flow",
  SOCIAL_VALIDATION: "social_validation_flow",
  COMPREHENSION_FAILURE: "comprehension_flow",
};

const MOCK_WINNER = { product_name: "Produto Vencedor", price: "R$ 2.199" };
const SESSION = {
  lastBestProduct: MOCK_WINNER,
  lastRecommendation: { winner: MOCK_WINNER.product_name },
};

const AE_POSITIVE = [
  "mostra outras opções",
  "quero ver alternativas",
  "abre mais opções",
  "tem outros modelos?",
  "me mostra concorrentes",
  "quero explorar opções",
  "o que mais existe?",
  "me dá mais ideias",
  "quero outras possibilidades",
  "abre o leque",
  "quero comparar mais opções",
  "quero ver outros caminhos",
  "existe algo parecido?",
  "me mostra alternativas",
  "mostra outra opção",
  "tem alternativa?",
  "tem outro?",
  "quero ver opções",
  "me mostra outra",
  "outra opção",
  "e se eu não pegar esse?",
  "tem concorrente?",
  "tem algo diferente?",
  "quero explorar",
  "da pra ver outro?",
  "quero abrir as opções",
  "tem mais possibilidades",
  "quero olhar alternativas",
  "mostra possibilidades parecidas",
  "nao quero decidir sem ver outras opções",
];

const SV_POSITIVE = [
  "o pessoal gosta?",
  "muita gente recomenda?",
  "quem comprou se arrepende?",
  "tem reclamação?",
  "a galera aprova?",
  "o povo fala bem?",
  "quem tem gostou?",
  "tem review ruim?",
  "o que você faria?",
  "a maioria escolhe qual?",
  "esse é bem visto?",
  "muita gente compra?",
  "é uma escolha segura?",
  "costuma agradar?",
  "recomendaria para um amigo?",
  "quem usa gosta?",
  "muita gente reclama?",
  "o pessoal costuma gostar?",
  "as pessoas aprovam?",
  "no geral é aprovado?",
  "quem comprou gostou?",
  "tem boa fama?",
  "é bem avaliado?",
  "o povo recomenda?",
  "a galera curte?",
  "quem tem costuma gostar?",
  "tem avaliação ruim?",
  "o pessoal reclama muito?",
  "será que muita gente se arrepende?",
  "quem comprou gostou ou se arrependeu?",
];

const CF_POSITIVE = [
  "não entendi",
  "explica melhor",
  "como assim?",
  "fiquei perdido",
  "pode simplificar?",
  "não peguei",
  "boiei",
  "repete",
  "não ficou claro",
  "que quer dizer isso?",
  "pode explicar de outro jeito?",
  "detalha melhor",
  "simplifica pra mim",
  "fiquei confuso",
  "nao entendi direito",
  "nao consegui entender",
  "nao acompanhei",
  "me perdi",
  "explica de outro jeito",
  "pode explicar melhor",
  "fala mais simples",
  "explica em portugues claro",
  "nao entendi nada",
  "nao ficou claro pra mim",
  "nao ta claro",
  "hm",
  "hein",
  "nao compreendi",
  "nao percebi",
  "detalha de novo",
  "explica de novo",
  "explica melhor pf",
  "nao entendi bem",
  "podia simplificar",
  "repete pf",
];

const AE_COMPOUND = [
  "blz, mas mostra outras opções",
  "entendi, mas quero ver alternativas",
  "faz sentido, mas tem outro?",
  "ok, me mostra concorrentes",
  "show, quero explorar opções",
];

const SV_COMPOUND = [
  "faz sentido, mas o pessoal gosta?",
  "gostei, mas muita gente recomenda?",
  "blz, tem reclamação?",
  "entendi, o povo fala bem?",
  "ok, a galera aprova?",
];

const CF_COMPOUND = [
  "faz sentido, mas não entendi",
  "gostei, mas explica melhor",
  "blz, como assim?",
  "entendi, mas não peguei",
  "ok, repete",
];

const NEGATIVE = [
  { message: "qual ficou em segundo?", mustNot: "SECOND_BEST_DISCOVERY" },
  { message: "plano b?", mustNot: "SECOND_BEST_DISCOVERY" },
  { message: "backup?", mustNot: "SECOND_BEST_DISCOVERY" },
  { message: "tem certeza?", mustNot: "CONFIDENCE_CHALLENGE" },
  { message: "você sustenta isso?", mustNot: "CONFIDENCE_CHALLENGE" },
  { message: "agora entendi", mustNot: "COMPREHENSION_SUCCESS" },
  { message: "faz sentido", mustNot: "COMPREHENSION_SUCCESS" },
  { message: "captei", mustNot: "COMPREHENSION_SUCCESS" },
  { message: "vou nesse?", mustNot: "DECISION_CONFIRMATION" },
  { message: "quero gastar menos", mustNot: "CONSTRAINT_CHANGE" },
];

function simulateStack(message, family, anchored) {
  const detect = DETECTORS[family];
  const sessionContext = anchored ? SESSION : {};
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
      isAlternativeExploration: !!cognitiveTurn.signals?.isAlternativeExploration,
      isSecondBestDiscovery: !!cognitiveTurn.signals?.isSecondBestDiscovery,
      isSocialValidation: !!cognitiveTurn.signals?.isSocialValidation,
      isComprehension: !!cognitiveTurn.signals?.isComprehension,
    },
    signals: {
      hasClearNewCommercialSearch: false,
      looksLikeAmbiguousFollowUp: false,
      isExplicitComparison: false,
      wantsNew: false,
    },
  });

  const routerOk =
    detect(message) ||
    (family === "ALTERNATIVE_EXPLORATION" && cognitiveTurn.signals?.isAlternativeExploration) ||
    (family === "SOCIAL_VALIDATION" && cognitiveTurn.signals?.isSocialValidation) ||
    (family === "COMPREHENSION_FAILURE" && cognitiveTurn.signals?.isComprehension);

  const routingPass = routingDecision.conversationAct === ROUTING_ACT[family];
  const responsePath = routerOk ? FLOW_PATH[family] : routingDecision.responsePathHint || "unknown";

  return { routerOk, routingPass, responsePath, cognitiveTurn, routingDecision };
}

function runPositive(message, family, category, anchored) {
  const stack = simulateStack(message, family, anchored);
  const perception = auditScenario({
    id: `ASC-${family}-${category}-${anchored ? "anchored" : "cold"}`,
    familyExpected: family,
    userMessage: message,
    contextType: anchored ? "anchored" : "cold",
  });

  const ok =
    stack.routerOk &&
    stack.routingPass &&
    stack.responsePath === FLOW_PATH[family] &&
    perception.userPerception === "SIM";

  return { kind: "positive", family, category, message, anchored, ok, stack, perception };
}

function runNegative(spec) {
  const message = spec.message;
  let wrongly = false;
  if (spec.mustNot === "SECOND_BEST_DISCOVERY") {
    wrongly = isAlternativeExplorationFamilyQuery(message);
  } else if (spec.mustNot === "CONFIDENCE_CHALLENGE") {
    wrongly = isSocialValidationFamilyQuery(message);
  } else if (spec.mustNot === "COMPREHENSION_SUCCESS") {
    wrongly = isComprehensionFamilyQuery(message);
  } else if (spec.mustNot === "DECISION_CONFIRMATION") {
    wrongly =
      isAlternativeExplorationFamilyQuery(message) ||
      isSocialValidationFamilyQuery(message) ||
      isComprehensionFamilyQuery(message);
  } else if (spec.mustNot === "CONSTRAINT_CHANGE") {
    wrongly =
      isAlternativeExplorationFamilyQuery(message) ||
      isSocialValidationFamilyQuery(message) ||
      isComprehensionFamilyQuery(message);
  }
  return { kind: "negative", message, mustNot: spec.mustNot, ok: !wrongly, wrongly };
}

console.log("PATCH 8.1B.5 — AE / SV / CF Production Audit\n");

const results = [];

for (const message of AE_POSITIVE.slice(0, 20)) {
  results.push(runPositive(message, "ALTERNATIVE_EXPLORATION", "core", false));
  results.push(runPositive(message, "ALTERNATIVE_EXPLORATION", "core", true));
}
for (const message of AE_POSITIVE.slice(20)) {
  results.push(runPositive(message, "ALTERNATIVE_EXPLORATION", "extra", true));
}
for (const message of AE_COMPOUND) {
  results.push(runPositive(message, "ALTERNATIVE_EXPLORATION", "compound", true));
}

for (const message of SV_POSITIVE.slice(0, 20)) {
  results.push(runPositive(message, "SOCIAL_VALIDATION", "core", false));
  results.push(runPositive(message, "SOCIAL_VALIDATION", "core", true));
}
for (const message of SV_POSITIVE.slice(20)) {
  results.push(runPositive(message, "SOCIAL_VALIDATION", "extra", true));
}
for (const message of SV_COMPOUND) {
  results.push(runPositive(message, "SOCIAL_VALIDATION", "compound", true));
}

for (const message of CF_POSITIVE.slice(0, 20)) {
  results.push(runPositive(message, "COMPREHENSION_FAILURE", "core", false));
  results.push(runPositive(message, "COMPREHENSION_FAILURE", "core", true));
}
for (const message of CF_POSITIVE.slice(20)) {
  results.push(runPositive(message, "COMPREHENSION_FAILURE", "extra", true));
}
for (const message of CF_COMPOUND) {
  results.push(runPositive(message, "COMPREHENSION_FAILURE", "compound", true));
}

for (const spec of NEGATIVE) {
  results.push(runNegative(spec));
}

const positive = results.filter((r) => r.kind === "positive");
const negative = results.filter((r) => r.kind === "negative");
const posOk = positive.filter((r) => r.ok).length;
const negOk = negative.filter((r) => r.ok).length;

console.log(`Total: ${results.length} | Positive: ${posOk}/${positive.length} (${((posOk / positive.length) * 100).toFixed(1)}%)`);
console.log(`Negative: ${negOk}/${negative.length}\n`);

for (const family of FAMILIES) {
  const famPos = positive.filter((r) => r.family === family);
  const famOk = famPos.filter((r) => r.ok).length;
  console.log(`${family}: ${famOk}/${famPos.length} (${((famOk / famPos.length) * 100).toFixed(1)}%)`);
}

const failures = positive.filter((r) => !r.ok);
if (failures.length) {
  console.log("\n--- Failures (first 20) ---");
  for (const f of failures.slice(0, 20)) {
    console.log(
      `[${f.family}] "${f.message}" router=${f.stack.routerOk} routing=${f.stack.routingPass} path=${f.stack.responsePath} perception=${f.perception.userPerception}`
    );
  }
}

const famRates = FAMILIES.map((f) => {
  const famPos = positive.filter((r) => r.family === f);
  return famPos.filter((r) => r.ok).length / famPos.length;
});
const pass =
  posOk / positive.length >= 0.9 &&
  famRates.every((r) => r >= 0.9) &&
  negOk / negative.length >= 0.85;

console.log(`\nVEREDITO: ${pass ? "APROVADO" : "GAP RESTANTE"}`);
process.exit(pass ? 0 : 1);
