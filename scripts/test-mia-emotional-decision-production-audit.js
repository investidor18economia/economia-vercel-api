/**
 * PATCH 8.1B.4 — Emotional / Decision Families Production Audit
 *
 * Full-stack trace: Router → Routing → Contract → Response Path → Perception (Regra 17)
 *
 * Usage: node scripts/test-mia-emotional-decision-production-audit.js
 */

import {
  classifyMiaTurn,
  isAntiRegretFamilyQuery,
  isConfidenceChallengeFamilyQuery,
  isDecisionConfirmationFamilyQuery,
  isSoftDisagreementFamilyQuery,
  isConstraintChangeFamilyQuery,
} from "../lib/miaCognitiveRouter.js";
import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";
import { auditScenario } from "./test-mia-production-response-perception-audit.js";

const FAMILIES = [
  "ANTI_REGRET",
  "CONFIDENCE_CHALLENGE",
  "DECISION_CONFIRMATION",
  "SOFT_DISAGREEMENT",
  "CONSTRAINT_CHANGE",
];

const FAMILY_DETECTORS = {
  ANTI_REGRET: isAntiRegretFamilyQuery,
  CONFIDENCE_CHALLENGE: isConfidenceChallengeFamilyQuery,
  DECISION_CONFIRMATION: isDecisionConfirmationFamilyQuery,
  SOFT_DISAGREEMENT: isSoftDisagreementFamilyQuery,
  CONSTRAINT_CHANGE: isConstraintChangeFamilyQuery,
};

const ROUTING_ACT = {
  ANTI_REGRET: "anti_regret",
  CONFIDENCE_CHALLENGE: "confidence_challenge",
  DECISION_CONFIRMATION: "decision_confirmation",
  SOFT_DISAGREEMENT: "soft_disagreement",
  CONSTRAINT_CHANGE: "constraint_change",
};

const FLOW_PATH = {
  ANTI_REGRET: "anti_regret_flow",
  CONFIDENCE_CHALLENGE: "confidence_challenge_flow",
  DECISION_CONFIRMATION: "decision_confirmation_flow",
  SOFT_DISAGREEMENT: "soft_disagreement_flow",
  CONSTRAINT_CHANGE: "constraint_change_flow",
};

const MOCK_WINNER = { product_name: "Produto Vencedor", price: "R$ 2.199" };
const SESSION_ANCHORED = {
  lastBestProduct: MOCK_WINNER,
  lastRecommendation: { winner: MOCK_WINNER.product_name },
};

const POSITIVE_BY_FAMILY = {
  ANTI_REGRET: [
    "não quero me arrepender",
    "tenho medo de errar",
    "não quero dor de cabeça",
    "posso comprar sem medo?",
    "tô cabreiro",
    "medo de errar",
    "não quero me ferrar",
    "receio de comprar",
    "isso me dá medo",
    "será que vou me ferrar?",
    "quero evitar problema",
    "não quero fazer besteira",
    "não quero cair em fria",
    "me dá medo",
    "tenho receio",
    "to com receio",
    "nao quero errar",
    "quero evitar dor de cabeca",
    "posso ficar sossegado?",
    "nao quero escolher mal",
  ],
  CONFIDENCE_CHALLENGE: [
    "tem certeza?",
    "você sustenta isso?",
    "você banca essa?",
    "continua valendo?",
    "tu compraria?",
    "ainda recomenda?",
    "crava isso?",
    "mantém essa escolha?",
    "você manteria essa escolha?",
    "não vai mudar de ideia?",
    "confia mesmo nisso?",
    "voce sustenta essa recomendacao?",
    "continua nesse mesmo?",
    "segue nesse mesmo?",
    "ainda vale?",
    "voce ainda iria nele?",
    "sustenta?",
    "mantem a recomendacao?",
    "continua de pe?",
    "isso continua bom?",
  ],
  DECISION_CONFIRMATION: [
    "vou nesse?",
    "fecho nele?",
    "então é esse?",
    "posso comprar?",
    "bate o martelo?",
    "é pra ir nele?",
    "pode ser esse mesmo?",
    "compro agora?",
    "então fechou?",
    "posso seguir com esse?",
    "fecho?",
    "vou nele?",
    "compro esse?",
    "é esse mesmo?",
    "manda ver nesse",
    "decidi por esse",
    "fechado nele",
    "entao vou nesse",
    "parece ser esse",
    "acho que vou nele",
  ],
  SOFT_DISAGREEMENT: [
    "não me convenceu",
    "não curti muito",
    "sei lá",
    "meio assim",
    "não me desceu",
    "não tô sentindo firmeza",
    "tá puxado",
    "não gostei tanto",
    "parece estranho",
    "tô na dúvida ainda",
    "nao bateu comigo",
    "nao me ganhou",
    "to meio assim",
    "nao sei se e isso",
    "tenho minhas duvidas",
    "nao parece tao bom",
    "nao curti",
    "sei la viu",
    "nao to 100 por cento",
    "nao me pegou",
  ],
  CONSTRAINT_CHANGE: [
    "quero gastar menos",
    "orçamento menor",
    "agora até 1800",
    "prioriza câmera",
    "bateria pesa mais",
    "conforto virou prioridade",
    "quero baixar o valor",
    "e se desempenho importar mais?",
    "agora quero algo mais simples",
    "corta um pouco o orçamento",
    "baixa o orçamento",
    "prefiro gastar menos",
    "camera pesa mais",
    "agora quero gastar menos",
    "quero economizar",
    "preciso baixar o valor",
    "prioriza bateria",
    "agora silencio pesa",
    "meu foco mudou",
    "quero recalibrar",
  ],
};

const COMPOUND_BY_FAMILY = {
  ANTI_REGRET: [
    "gostei, mas tenho medo de errar",
    "parece bom, mas nao quero me arrepender",
    "blz, mas to cabreiro",
    "entendi, mas receio de comprar",
    "faz sentido, mas me da medo",
    "ok, mas nao quero fazer besteira",
  ],
  CONFIDENCE_CHALLENGE: [
    "faz sentido, mas tem certeza?",
    "gostei, mas voce sustenta isso?",
    "blz, mas continua valendo?",
    "entendi, mas ainda recomenda?",
    "ok, mas voce compraria?",
    "show, mas crava isso?",
  ],
  DECISION_CONFIRMATION: [
    "faz sentido, fecho nele?",
    "gostei, vou nesse?",
    "blz, posso comprar?",
    "entendi, entao e esse?",
    "ok, bate o martelo?",
    "show, compro esse?",
  ],
  SOFT_DISAGREEMENT: [
    "faz sentido, mas nao me convenceu",
    "gostei, mas nao curti muito",
    "blz, mas sei la",
    "entendi, mas meio assim",
    "ok, mas nao me desceu",
    "show, mas ta puxado",
  ],
  CONSTRAINT_CHANGE: [
    "gostei, mas quero gastar menos",
    "faz sentido, mas prioriza camera",
    "blz, mas orcamento menor",
    "entendi, mas bateria pesa mais",
    "ok, mas baixa o orcamento",
    "show, mas agora quero gastar menos",
  ],
};

const NEGATIVE_CONTROLS = [
  { message: "mostra outras opções", mustNot: "ALTERNATIVE_EXPLORATION" },
  { message: "qual ficou em segundo?", mustNot: "SECOND_BEST_DISCOVERY" },
  { message: "oi, bom dia", mustNot: "GREETING" },
  { message: "entendi, valeu", mustNot: "ACKNOWLEDGEMENT" },
  { message: "quem é você?", mustNot: "ABOUT_MIA" },
  { message: "agora quero notebook", mustNot: "CONSTRAINT_CHANGE" },
  { message: "quero ver alternativas abertas", mustNot: "ALTERNATIVE_EXPLORATION" },
  { message: "compara com outro modelo", mustNot: "CONSTRAINT_CHANGE" },
  { message: "tem outro?", mustNot: "ALTERNATIVE_EXPLORATION" },
  { message: "o pessoal gosta?", mustNot: "SOCIAL_VALIDATION" },
  { message: "nao entendi nada", mustNot: "COMPREHENSION_FAILURE" },
  { message: "saquei, entendi", mustNot: "COMPREHENSION_SUCCESS" },
  { message: "quero comprar celular", mustNot: "DECISION_CONFIRMATION" },
  { message: "me indica um fone", mustNot: "ANTI_REGRET" },
  { message: "qual o plano b?", mustNot: "SECOND_BEST_DISCOVERY" },
  { message: "continua valendo se eu gastar menos?", mustNot: "CONFIDENCE_CHALLENGE" },
  { message: "blz, mas mostra outra opção", mustNot: "CROSS_FAMILY" },
  { message: "entendi, mas qual ficou em segundo?", mustNot: "CROSS_FAMILY" },
  { message: "kkk muito caro slk", mustNot: "SOFT_DISAGREEMENT" },
  { message: "preciso decidir rápido qual compro", mustNot: "DECISION_CONFIRMATION" },
];

function simulateStack(message, family, anchored) {
  const detect = FAMILY_DETECTORS[family];
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
      isAntiRegret: !!cognitiveTurn.signals?.isAntiRegret,
      isConfidenceChallenge: !!cognitiveTurn.signals?.isConfidenceChallenge,
      isDecisionConfirmation: !!cognitiveTurn.signals?.isDecisionConfirmation,
      isSoftDisagreement: !!cognitiveTurn.signals?.isSoftDisagreement,
      isConstraintChange: !!cognitiveTurn.signals?.isConstraintChange,
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
    (family === "ANTI_REGRET" && cognitiveTurn.signals?.isAntiRegret) ||
    (family === "CONFIDENCE_CHALLENGE" && cognitiveTurn.signals?.isConfidenceChallenge) ||
    (family === "DECISION_CONFIRMATION" && cognitiveTurn.signals?.isDecisionConfirmation) ||
    (family === "SOFT_DISAGREEMENT" && cognitiveTurn.signals?.isSoftDisagreement) ||
    (family === "CONSTRAINT_CHANGE" && cognitiveTurn.signals?.isConstraintChange);

  const routingPass =
    routingDecision.conversationAct === ROUTING_ACT[family] &&
    routingDecision.allowNewSearch === false &&
    routingDecision.allowReplaceWinner === false;

  const handlerGate = routerOk || routingDecision.conversationAct === ROUTING_ACT[family];

  const responsePath = handlerGate ? FLOW_PATH[family] : routingDecision.responsePathHint || "unknown";

  return { routerOk, routingPass, handlerGate, responsePath, cognitiveTurn, routingDecision };
}

function runPositive(message, family, category, anchored) {
  const stack = simulateStack(message, family, anchored);
  const perception = auditScenario({
    id: `ED-${family}-${category}-${anchored ? "anchored" : "cold"}`,
    familyExpected: family,
    userMessage: message,
    contextType: anchored ? "anchored" : "cold",
  });

  const ok =
    stack.routerOk &&
    stack.routingPass &&
    stack.responsePath === FLOW_PATH[family] &&
    perception.userPerception === "SIM";

  return {
    kind: "positive",
    family,
    category,
    message,
    anchored,
    ok,
    stack,
    perception,
    leakType: perception.leakType,
    suspectedLayer: perception.suspectedLayer,
  };
}

function anyEmotionalDecisionFamily(message) {
  return FAMILIES.some((family) => FAMILY_DETECTORS[family](message));
}

function runNegative(spec) {
  const message = spec.message;
  const wronglyDetected = anyEmotionalDecisionFamily(message);

  const ok = !wronglyDetected;

  return { kind: "negative", message, mustNot: spec.mustNot, ok, wronglyDetected };
}

console.log("PATCH 8.1B.4 — Emotional / Decision Families Production Audit\n");

const results = [];

for (const family of FAMILIES) {
  for (const message of POSITIVE_BY_FAMILY[family]) {
    results.push(runPositive(message, family, "formal", false));
    results.push(runPositive(message, family, "formal", true));
  }
  for (const message of COMPOUND_BY_FAMILY[family]) {
    results.push(runPositive(message, family, "compound", true));
  }
}

for (const spec of NEGATIVE_CONTROLS) {
  results.push(runNegative(spec));
}

const positive = results.filter((r) => r.kind === "positive");
const negative = results.filter((r) => r.kind === "negative");
const posOk = positive.filter((r) => r.ok).length;
const negOk = negative.filter((r) => r.ok).length;

console.log(`Total scenarios: ${results.length}`);
console.log(`Positive: ${posOk}/${positive.length} (${((posOk / positive.length) * 100).toFixed(1)}%)`);
console.log(`Negative controls: ${negOk}/${negative.length} (${((negOk / negative.length) * 100).toFixed(1)}%)`);
console.log(`Overall: ${posOk + negOk}/${results.length} (${(((posOk + negOk) / results.length) * 100).toFixed(1)}%)\n`);

for (const family of FAMILIES) {
  const famPos = positive.filter((r) => r.family === family);
  const famOk = famPos.filter((r) => r.ok).length;
  console.log(`${family}: ${famOk}/${famPos.length} (${((famOk / famPos.length) * 100).toFixed(1)}%)`);
}

const failures = positive.filter((r) => !r.ok);
if (failures.length) {
  console.log("\n--- Failures (first 25) ---");
  for (const f of failures.slice(0, 25)) {
    console.log(
      `[${f.family}/${f.category}/${f.anchored ? "anchored" : "cold"}] "${f.message}" router=${f.stack.routerOk} routing=${f.stack.routingPass} path=${f.stack.responsePath} perception=${f.perception.userPerception} leak=${f.leakType}`
    );
  }
}

const passThreshold =
  posOk / positive.length >= 0.9 && negOk / negative.length >= 0.85 ? 0 : 1;
process.exit(passThreshold);
