/**
 * PATCH 11A — Intent Recognition & Social Conversation Audit
 *
 * Rodar: node scripts/test-mia-intent-recognition-social-conversation-audit.js
 */

import {
  recognizeMiaIntent,
  MIA_INTERACTION_MODES,
  shouldBypassDefaultProductSearch,
} from "../lib/miaIntentRecognitionLayer.js";
import {
  buildSocialConversationBehaviorContract,
  resolveSocialConversationPromptRole,
} from "../lib/miaSocialConversationBehavior.js";
import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";
import { buildCognitiveRoutingSignalFromTurn } from "../lib/miaIntentRecognitionLayer.js";
import { applyProductionFallbackGate } from "../lib/miaProductionFallbackGate.js";

let passed = 0;
let failed = 0;
const failures = [];

function test(label, fn) {
  try {
    fn();
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${label}`);
    console.error(`    → ${err.message}`);
    failed++;
    failures.push({ label, error: err.message });
  }
}

function expect(actual, expected, label = "") {
  if (actual !== expected) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${label ? ` [${label}]` : ""}`
    );
  }
}

function expectTrue(val, label = "") {
  if (!val) throw new Error(`Expected truthy${label ? ` [${label}]` : ""}`);
}

function expectFalse(val, label = "") {
  if (val) throw new Error(`Expected falsy${label ? ` [${label}]` : ""}`);
}

function recognize(message, extra = {}) {
  return recognizeMiaIntent({
    userMessage: message,
    resolvedQuery: message,
    sessionContext: extra.sessionContext || {},
    signals: extra.signals || {},
    cognitiveTurn: extra.cognitiveTurn || null,
    hasActiveAnchor: !!extra.hasActiveAnchor,
    detectedIntent: extra.detectedIntent || "",
  });
}

function route(message, extra = {}) {
  const recognition = recognize(message, extra);
  const cognitiveTurn = extra.cognitiveTurn || null;
  const rd = buildRoutingDecision({
    userMessage: message,
    resolvedQuery: message,
    contextResolution: extra.contextResolution || {},
    sessionContext: extra.sessionContext || {},
    incomingSessionContext: {},
    intent: recognition.legacyIntentOverride || "general_answer",
    contextAction: "conversation",
    signals: {
      hasClearNewCommercialSearch: !!(extra.signals?.hasClearNewCommercialSearch),
      isExplicitComparison: false,
      wantsNew: false,
      ...(extra.signals || {}),
    },
    cognitiveRoutingSignal: buildCognitiveRoutingSignalFromTurn(
      cognitiveTurn,
      !!extra.hasActiveAnchor
    ),
    intentRecognition: recognition,
  });
  return { recognition, routing: rd };
}

console.log("\nPATCH 11A — Intent Recognition & Social Conversation Audit\n");

console.log("Grupo A — Cumprimentos");
for (const msg of [
  "Olá",
  "Oi",
  "Boa noite",
  "eae",
  "opa",
  "fala",
  "bom diaa",
  "oii 😊",
]) {
  test(`A: "${msg}" → social/greeting sem busca`, () => {
    const { recognition, routing } = route(msg);
    expectTrue(
      recognition.interactionMode === MIA_INTERACTION_MODES.SOCIAL,
      "interactionMode"
    );
    expectFalse(routing.allowNewSearch, "allowNewSearch");
    expectFalse(routing.allowCommercialFallback, "allowCommercialFallback");
  });
}

console.log("\nGrupo B — Agradecimentos");
for (const msg of ["Obrigado", "Valeu", "tmj", "brigadão", "ajudou muito", "comprei, deu certo"]) {
  test(`B: "${msg}" → acknowledgement/social sem busca`, () => {
    const { recognition, routing } = route(msg);
    expectTrue(shouldBypassDefaultProductSearch(recognition));
    expectFalse(routing.allowNewSearch);
  });
}

console.log("\nGrupo C — Comentários casuais");
for (const msg of [
  "Hoje o dia foi corrido",
  "Rapaz, viver cansa",
  "to só descansando",
  "esse calor tá demais",
  "kkkk",
  "pois é",
]) {
  test(`C: "${msg}" → social sem busca`, () => {
    const { recognition, routing } = route(msg);
    expectTrue(
      recognition.interactionMode === MIA_INTERACTION_MODES.SOCIAL ||
        recognition.interactionMode === MIA_INTERACTION_MODES.EMOTIONAL_SUPPORT,
      "mode"
    );
    expectFalse(routing.allowNewSearch);
    const contract = buildSocialConversationBehaviorContract(recognition);
    expectFalse(contract.responseBehavior.redirectToCommerce);
  });
}

console.log("\nGrupo D — Expressões emocionais leves");
for (const msg of [
  "Estou meio desanimado",
  "Hoje não foi um dia bom",
  "Estou feliz que consegui comprar",
  "Estou cansado de resolver problema",
  "to sem cabeça pra isso hj",
]) {
  test(`D: "${msg}" → emotional/social`, () => {
    const { recognition, routing } = route(msg);
    if (msg.includes("consegui comprar")) {
      expectTrue(
        recognition.interactionMode === MIA_INTERACTION_MODES.MIXED ||
          recognition.interactionMode === MIA_INTERACTION_MODES.EMOTIONAL_SUPPORT,
        "mixed/emotional purchase joy"
      );
    } else {
      expectTrue(
        recognition.interactionMode === MIA_INTERACTION_MODES.EMOTIONAL_SUPPORT ||
          recognition.interactionMode === MIA_INTERACTION_MODES.SOCIAL,
        "emotional/social"
      );
      expectFalse(routing.allowNewSearch);
    }
  });
}

console.log("\nGrupo E — Intenção mista");
for (const msg of [
  "Hoje foi péssimo, mas preciso escolher um celular",
  "Estou cansado, só me diz qual vale mais a pena",
  "Valeu pela ajuda, agora compara esses dois",
  "kkk gostei, mas ele tem bateria boa?",
]) {
  test(`E: "${msg}" → mixed`, () => {
    const { recognition } = route(msg, {
      signals: {
        hasClearNewCommercialSearch: /celular|compara|bateria|vale mais a pena|preciso escolher/i.test(msg),
        isExplicitComparison: /compara esses/i.test(msg),
      },
      hasActiveAnchor: /bateria|compara|vale mais a pena/i.test(msg),
      sessionContext: /bateria|compara/i.test(msg)
        ? { lastBestProduct: { product_name: "Produto X" } }
        : {},
    });
    expect(recognition.interactionMode, MIA_INTERACTION_MODES.MIXED, "mixed mode");
    expectTrue(recognition.commercialIntent || recognition.commercialRelevance >= 0.35);
  });
}

console.log("\nGrupo F — Continuidade (routing modes)");
test("F1: recomendação → valeu preserva contexto", () => {
  const { routing } = route("valeu", {
    hasActiveAnchor: true,
    sessionContext: { lastBestProduct: { product_name: "Notebook A" } },
  });
  expectTrue(routing.shouldPreserveAnchor);
  expectFalse(routing.allowNewSearch);
});
test("F2: casual → pergunta comercial vira commerce", () => {
  const { recognition } = route("quero um notebook bom até 4 mil", {
    sessionContext: { lastIntent: "social_conversation" },
  });
  expect(recognition.interactionMode, MIA_INTERACTION_MODES.COMMERCE);
});

console.log("\nGrupo G — Ambiguidade");
test("G1: 'e aí?' sem contexto → clarification/social", () => {
  const { recognition, routing } = route("e ai");
  expectTrue(
    recognition.interactionMode === MIA_INTERACTION_MODES.CLARIFICATION ||
      recognition.interactionMode === MIA_INTERACTION_MODES.SOCIAL
  );
  expectFalse(routing.allowNewSearch);
});
test("G2: 'e esse?' com âncora → clarification/context", () => {
  const { recognition } = route("e esse?", {
    hasActiveAnchor: true,
    sessionContext: { lastBestProduct: { product_name: "TV 55" } },
  });
  expectTrue(
    recognition.interactionMode === MIA_INTERACTION_MODES.CLARIFICATION ||
      recognition.continuityRelevance >= 0.35
  );
});

console.log("\nGrupo H — Regressão comercial");
test("H1: busca comercial explícita mantém commerce", () => {
  const { recognition, routing } = route("quero um notebook gamer até 5000", {
    signals: { hasClearNewCommercialSearch: true, newCategoryInOriginalMessage: true },
  });
  expect(recognition.interactionMode, MIA_INTERACTION_MODES.COMMERCE);
  expectTrue(routing.allowNewSearch);
});
test("H2: comparação explícita não vira social", () => {
  const { recognition } = route("iphone 15 vs galaxy s24", {
    signals: { isExplicitComparison: true, hasClearNewCommercialSearch: true },
  });
  expect(recognition.interactionMode, MIA_INTERACTION_MODES.COMMERCE);
});

console.log("\nGrupo I — Linguagem real (variações)");
for (const msg of ["vlw msm", "to mo cansado hj", "blz entao", "nao sei...", "show 😄"]) {
  test(`I: "${msg}" não cai em default_product_search`, () => {
    const { routing } = route(msg);
    expect(routing.responsePathHint !== "default_product_search" || !routing.allowNewSearch, true);
  });
}

console.log("\nGrupo J — Anti-overfitting (equivalentes semânticos)");
for (const msg of [
  "dia puxado demais",
  "que semana hein",
  "só passando aqui",
  "que calor infernal",
  "to no modo relax",
]) {
  test(`J: "${msg}" → capacidade generalizada`, () => {
    const { recognition } = route(msg);
    expectTrue(
      recognition.interactionMode === MIA_INTERACTION_MODES.SOCIAL ||
        recognition.interactionMode === MIA_INTERACTION_MODES.EMOTIONAL_SUPPORT
    );
  });
}

console.log("\nContrato de comportamento");
test("Behavior contract proíbe redirect comercial em social", () => {
  const recognition = recognize("Hoje foi cansativo");
  const contract = buildSocialConversationBehaviorContract(recognition);
  expectFalse(contract.responseBehavior.redirectToCommerce);
  expectTrue(contract.responseBehavior.acknowledge);
});
test("Production fallback gate reconhece intent recognition", () => {
  const recognition = recognize("Hoje foi cansativo");
  const gate = applyProductionFallbackGate({
    query: "Hoje foi cansativo",
    intentRecognition: recognition,
    contextResolution: {
      directReply: "Posso te ajudar com compras, comparação de produtos e decisão de custo-benefício.",
      mode: "general_answer",
    },
  });
  expectTrue(gate.shouldBypassGeneralAnswerFallback);
  expect(gate.detection.intent, "social_conversation");
});
test("Cognitive routing signal transporta flags de família", () => {
  const signal = buildCognitiveRoutingSignalFromTurn(
    {
      turnType: "CONVERSATIONAL",
      confidence: 0.86,
      signals: { isGreeting: true },
    },
    false
  );
  expectTrue(signal.isGreeting);
});

console.log(`\n${"=".repeat(60)}`);
console.log(`Resultado: ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFalhas:");
  for (const f of failures) {
    console.log(`  - ${f.label}: ${f.error}`);
  }
  process.exit(1);
}
console.log("PATCH 11A AUDIT: APROVADO");
process.exit(0);
