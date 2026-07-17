/**
 * PATCH 11A.6 — Mixed Verbalization Quality & Natural Transition
 *
 * Rodar: node scripts/test-mia-mixed-verbalization-quality.js
 */

import {
  recognizeMiaIntent,
  MIA_INTERACTION_MODES,
} from "../lib/miaIntentRecognitionLayer.js";
import { buildIntentAuthorityFromRecognition } from "../lib/miaIntentAuthority.js";
import { buildSocialConversationBehaviorContract } from "../lib/miaSocialConversationBehavior.js";
import {
  enrichContractWithMixedVerbalization,
  validateMixedConversationResponse,
  finalizeMixedConversationReply,
  buildGovernedMixedFallbackReply,
  splitMixedReplySections,
  mergeMixedReplySections,
  HUMAN_ACKNOWLEDGEMENT_DEPTH,
  RESPONSE_ORDERING,
  TRANSITION_PROFILE,
} from "../lib/miaMixedVerbalization.js";
import {
  applyFirstAnswerResponseContract,
  buildFirstAnswerStructuredReply,
} from "../lib/miaFirstAnswerResponseContract.js";

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

function expectIncludes(text, needle, label = "") {
  if (!String(text || "").toLowerCase().includes(String(needle || "").toLowerCase())) {
    throw new Error(`Expected to include "${needle}"${label ? ` [${label}]` : ""}`);
  }
}

function buildMixedContract(message, extra = {}) {
  const recognition = recognizeMiaIntent({
    userMessage: message,
    resolvedQuery: message,
    detectedIntent: extra.detectedIntent || "search",
    hasActiveAnchor: !!extra.hasActiveAnchor,
    sessionContext: extra.sessionContext || {},
  });
  const forcedRecognition =
    recognition.interactionMode === MIA_INTERACTION_MODES.MIXED
      ? recognition
      : {
          ...recognition,
          interactionMode: MIA_INTERACTION_MODES.MIXED,
          commercialIntent: true,
          humanObjective: "mixed_human_commerce",
          commercialObjective: recognition.commercialObjective || "purchase_help",
          commercialSearchQuery: recognition.commercialSearchQuery || message,
          primaryIntent: "mixed_intent",
        };
  const authority = buildIntentAuthorityFromRecognition(forcedRecognition, {
    hasActiveAnchor: !!extra.hasActiveAnchor,
  });
  let contract = buildSocialConversationBehaviorContract(forcedRecognition, {
    authority,
    message,
  });
  contract = enrichContractWithMixedVerbalization(contract, {
    recognition: forcedRecognition,
    message,
    clarificationRequired: !!extra.clarificationRequired,
    comparisonActive: !!extra.comparisonActive,
    hasWinner: !!extra.hasWinner,
  });
  return { recognition: forcedRecognition, authority, contract };
}

const SAMPLE_COMMERCIAL = buildFirstAnswerStructuredReply({
  winnerName: "Galaxy S23",
  query: "celular",
  gains: ["Boa câmera no dia a dia", "Desempenho estável"],
  sacrifices: ["Preço acima de modelos intermediários"],
});

console.log("\nPATCH 11A.6 — Mixed Verbalization Quality Tests\n");

console.log("Grupo A — Emoção + recomendação");
for (const msg of [
  "Hoje foi péssimo, mas preciso escolher um celular.",
  "Meu dia foi pesado, preciso de um notebook.",
  "Estou desanimado, mas quero comprar uma TV.",
]) {
  test(`A: contract for "${msg.slice(0, 40)}..."`, () => {
    const { contract } = buildMixedContract(msg);
    expectTrue(contract.mixedVerbalization?.humanAcknowledgementRequired);
    expectTrue(
      contract.mixedVerbalization?.humanAcknowledgementDepth === HUMAN_ACKNOWLEDGEMENT_DEPTH.BRIEF ||
        contract.mixedVerbalization?.humanAcknowledgementDepth === HUMAN_ACKNOWLEDGEMENT_DEPTH.MINIMAL
    );
    const reply = `Puxado.\n\n${SAMPLE_COMMERCIAL.replace("Galaxy S23", "Galaxy S23")}`;
    const validation = validateMixedConversationResponse(reply, contract, {
      winnerName: "Galaxy S23",
    });
    expectTrue(validation.valid, validation.violations.join(","));
  });
}

console.log("\nGrupo B — Objetividade");
for (const msg of [
  "Estou cansado, só me diz qual vale mais a pena.",
  "Meu dia foi corrido, compara logo esses dois.",
  "Sem muita conversa, estou esgotado: qual é melhor?",
]) {
  test(`B: direct ordering for "${msg.slice(0, 35)}..."`, () => {
    const { contract } = buildMixedContract(msg, { comparisonActive: msg.includes("compara") });
    if (msg.includes("só me diz") || msg.includes("compara logo") || msg.includes("Sem muita conversa")) {
      expect(
        contract.mixedVerbalization?.responseOrdering,
        RESPONSE_ORDERING.COMMERCIAL_DIRECT_WITH_HUMAN_NOTE
      );
    }
    const reply = `${SAMPLE_COMMERCIAL}\n\nEntendo o cansaço.`;
    const validation = validateMixedConversationResponse(reply, contract, {
      winnerName: "Galaxy S23",
    });
    expectFalse(validation.violations.includes("overAcknowledgement"));
  });
}

console.log("\nGrupo C — Agradecimento + nova compra");
for (const msg of [
  "Valeu pela ajuda, agora quero um notebook.",
  "Obrigado, agora compara esses dois.",
  "Deu certo. Preciso escolher uma TV agora.",
]) {
  test(`C: gratitude transition "${msg.slice(0, 35)}..."`, () => {
    const { contract } = buildMixedContract(msg, { comparisonActive: msg.includes("compara") });
    expectTrue(contract.mixedVerbalization?.humanAcknowledgementRequired);
    const reply = `Imagina.\n\n${SAMPLE_COMMERCIAL.replace("Galaxy S23", "MacBook Air M2")}`;
    const validation = validateMixedConversationResponse(
      reply.replace("Galaxy S23", "MacBook Air M2"),
      contract,
      { winnerName: "MacBook Air M2" }
    );
    expectFalse(validation.violations.includes("mechanicalTransition"));
  });
}

console.log("\nGrupo D — Emoção positiva + compra");
for (const msg of [
  "Estou feliz, finalmente vou comprar uma TV.",
  "Hoje deu tudo certo, quero escolher um celular.",
  "Consegui juntar o dinheiro, preciso de um notebook.",
]) {
  test(`D: positive emotion "${msg.slice(0, 35)}..."`, () => {
    const { contract } = buildMixedContract(msg);
    const reply = `Que bom.\n\n${SAMPLE_COMMERCIAL}`;
    const validation = validateMixedConversationResponse(reply, contract, {
      winnerName: "Galaxy S23",
    });
    expectFalse(validation.violations.includes("antiConsumptionViolation"));
    expectTrue(validation.valid);
  });
}

console.log("\nGrupo E — Comparação");
test("E: comparison preserves winner and human ack", () => {
  const { contract } = buildMixedContract("Estou cansado, compara S23 e iPhone 13.", {
    comparisonActive: true,
    hasWinner: true,
  });
  const reply = `Entendo.\n\n${SAMPLE_COMMERCIAL}`;
  const validation = validateMixedConversationResponse(reply, contract, {
    winnerName: "Galaxy S23",
  });
  expectTrue(validation.valid);
  expectIncludes(reply, "Galaxy S23");
});

console.log("\nGrupo F — Clarificação");
test("F: clarification bridge when required", () => {
  const msg = "Hoje foi horrível, mas preciso de um celular.";
  const { contract } = buildMixedContract(msg, { clarificationRequired: true });
  expect(
    contract.mixedVerbalization?.transitionProfile,
    TRANSITION_PROFILE.CLARIFICATION_BRIDGE
  );
  const reply =
    "Puxado.\n\nPara te indicar algo certeiro, qual faixa de preço ou uso principal você tem em mente?";
  const validation = validateMixedConversationResponse(reply, contract, {
    clarificationRequired: true,
  });
  expectTrue(validation.valid);
});

console.log("\nGrupo G — Anti-consumption");
for (const bad of [
  "Sinto muito. Um celular novo vai melhorar seu dia.\n\n" + SAMPLE_COMMERCIAL,
  "Essa compra pode te animar.\n\n" + SAMPLE_COMMERCIAL,
  "Vamos encontrar algo para aliviar isso.\n\n" + SAMPLE_COMMERCIAL,
]) {
  test(`G: rejects anti-consumption`, () => {
    const { contract } = buildMixedContract("Hoje foi péssimo, mas preciso de um celular.");
    const validation = validateMixedConversationResponse(bad, contract, {
      winnerName: "Galaxy S23",
    });
    expectTrue(validation.violations.includes("antiConsumptionViolation"));
  });
}

console.log("\nGrupo H — Transições mecânicas");
for (const bad of [
  "Sinto muito. Mas vamos às compras.\n\n" + SAMPLE_COMMERCIAL,
  "Entendo. Agora sobre sua solicitação comercial…\n\n" + SAMPLE_COMMERCIAL,
  "Que pena. De qualquer modo, falando do celular…\n\n" + SAMPLE_COMMERCIAL,
]) {
  test(`H: rejects mechanical transition`, () => {
    const { contract } = buildMixedContract("Hoje foi péssimo, mas preciso de um celular.");
    const validation = validateMixedConversationResponse(bad, contract, {
      winnerName: "Galaxy S23",
    });
    expectTrue(
      validation.violations.includes("mechanicalTransition") ||
        validation.violations.includes("splitResponseViolation")
    );
  });
}

console.log("\nGrupo I — Missing human dimension");
test("I: missing human ack fails when required", () => {
  const { contract } = buildMixedContract("Hoje foi péssimo, mas preciso de um celular.");
  const validation = validateMixedConversationResponse(SAMPLE_COMMERCIAL, contract, {
    winnerName: "Galaxy S23",
  });
  expectTrue(validation.violations.includes("missingHumanAcknowledgement"));
});

console.log("\nGrupo J — Over-acknowledgement");
test("J: over-acknowledgement fails", () => {
  const { contract } = buildMixedContract("Hoje foi péssimo, mas preciso de um celular.");
  const reply =
    "Sinto muito que seu dia tenha sido difícil. Imagino o quanto isso pesa. Espero que amanhã melhore. Fique bem.\n\n" +
    SAMPLE_COMMERCIAL;
  const validation = validateMixedConversationResponse(reply, contract, {
    winnerName: "Galaxy S23",
  });
  expectTrue(validation.violations.includes("overAcknowledgement"));
});

console.log("\nGrupo K — Commercial preservation + first-answer");
test("K: first-answer rebuild preserves human prefix", () => {
  const { contract } = buildMixedContract("Hoje foi péssimo, mas preciso de um celular.");
  const llmReply = `Puxado.\n\nOlhei aqui e acho que o Galaxy S23 serve bem.`;
  const result = applyFirstAnswerResponseContract({
    reply: llmReply,
    prices: [{ product_name: "Galaxy S23", price: "R$ 2.999", source: "test" }],
    responsePath: "return_seguro",
    query: "celular",
    winnerProduct: { product_name: "Galaxy S23" },
    rankedCandidates: [{ product_name: "Galaxy S23" }],
    mixedVerbalization: contract.mixedVerbalization,
    rawUserMessage: "Hoje foi péssimo, mas preciso de um celular.",
  });
  expectIncludes(result.reply, "Puxado");
  expectIncludes(result.reply, "Galaxy S23");
  expectIncludes(result.reply, "O que você ganha");
});

console.log("\nGrupo L — Split response");
test("L: split response detected", () => {
  const { contract } = buildMixedContract("Hoje foi péssimo, mas preciso de um celular.");
  const reply =
    "Entendo como você se sente.\n\nAgora, sobre sua compra, aqui está a recomendação.\n\n" +
    SAMPLE_COMMERCIAL;
  const validation = validateMixedConversationResponse(reply, contract, {
    winnerName: "Galaxy S23",
  });
  expectTrue(validation.violations.includes("splitResponseViolation"));
});

console.log("\nGrupo M — Anti-overfitting");
for (const msg of [
  "to morto mn, q cel bão até 2k?",
  "dia foi osso, bora achar um mouse gamer",
  "preciso de notebook, sem grana sobrando e sem paciência",
  "celular primeiro: tô feliz demais hoje",
]) {
  test(`M: contract without hardcode "${msg.slice(0, 30)}..."`, () => {
    const recognition = recognizeMiaIntent({
      userMessage: msg,
      resolvedQuery: msg,
      detectedIntent: "search",
    });
    if (recognition.interactionMode === MIA_INTERACTION_MODES.MIXED) {
      const { contract } = buildMixedContract(msg);
      expectTrue(!!contract.mixedVerbalization?.responseOrdering);
      expectTrue(!!contract.mixedVerbalization?.transitionProfile);
    }
  });
}

console.log("\nGrupo N — Fallback governado");
test("N: governed fallback combines human + commercial", () => {
  const { contract } = buildMixedContract("Hoje foi péssimo, mas preciso de um celular.");
  const fallback = buildGovernedMixedFallbackReply(contract, {
    commercialBody: SAMPLE_COMMERCIAL,
    winnerName: "Galaxy S23",
  });
  expectIncludes(fallback, "Galaxy S23");
  const finalized = finalizeMixedConversationReply("", contract, {
    winnerName: "Galaxy S23",
    commercialReplySnapshot: SAMPLE_COMMERCIAL,
  });
  expectTrue(finalized.reply.length > 20);
  expectIncludes(finalized.reply, "Galaxy S23");
});

console.log("\nGrupo O — Split/merge utilities");
test("O: split and merge preserve ordering", () => {
  const split = splitMixedReplySections(`Entendo.\n\n${SAMPLE_COMMERCIAL}`, {
    winnerName: "Galaxy S23",
  });
  expect(split.humanPrefix, "Entendo.");
  expectIncludes(split.commercialBody, "Eu iria no Galaxy S23");
  const merged = mergeMixedReplySections(split.humanPrefix, split.commercialBody, {
    mixedVerbalization: { responseOrdering: RESPONSE_ORDERING.HUMAN_THEN_COMMERCIAL },
  });
  expectIncludes(merged, "Entendo.");
  expectIncludes(merged, "Galaxy S23");
});

console.log(`\n${"=".repeat(60)}`);
console.log(`Resultado: ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFalhas:");
  for (const f of failures) console.log(`  - ${f.label}: ${f.error}`);
  process.exit(1);
}
console.log("Todos os testes passaram.\n");
