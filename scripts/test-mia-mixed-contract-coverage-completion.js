/**
 * PATCH 11A.6F — Mixed Contract Coverage & Dual-Dimension Completion
 *
 * Rodar: node scripts/test-mia-mixed-contract-coverage-completion.js
 */

import {
  recognizeMiaIntent,
  MIA_INTERACTION_MODES,
} from "../lib/miaIntentRecognitionLayer.js";
import { buildIntentAuthorityFromRecognition } from "../lib/miaIntentAuthority.js";
import { buildSocialConversationBehaviorContract } from "../lib/miaSocialConversationBehavior.js";
import {
  enrichContractWithMixedVerbalization,
  buildMixedResponseContext,
  buildCommercialSnapshot,
  buildHumanSnapshot,
  validateMixedDualDimensionCompletion,
  completeMixedDualDimensions,
  buildGovernedMixedFallbackReply,
  ensureMixedContractCoverage,
  resolveMixedContinuationEligibility,
  HUMAN_POLARITY,
  HUMAN_ACKNOWLEDGEMENT_DEPTH,
} from "../lib/miaMixedVerbalization.js";
import { buildFirstAnswerStructuredReply } from "../lib/miaFirstAnswerResponseContract.js";

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

function expectTrue(val, label = "") {
  if (!val) throw new Error(`Expected truthy${label ? ` [${label}]` : ""}`);
}

function expectFalse(val, label = "") {
  if (val) throw new Error(`Expected falsy${label ? ` [${label}]` : ""}`);
}

function expectEqual(actual, expected, label = "") {
  if (actual !== expected) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${label ? ` [${label}]` : ""}`
    );
  }
}

function expectIncludes(text, needle, label = "") {
  if (!String(text || "").toLowerCase().includes(String(needle || "").toLowerCase())) {
    throw new Error(`Expected to include "${needle}"${label ? ` [${label}]` : ""}`);
  }
}

const COMMERCIAL = buildFirstAnswerStructuredReply({
  winnerName: "Galaxy S23",
  query: "celular",
  gains: ["Boa câmera", "Desempenho estável"],
  sacrifices: ["Preço acima de intermediários"],
});

function buildMixedTurn(message, extra = {}) {
  const recognition = recognizeMiaIntent({
    userMessage: message,
    resolvedQuery: message,
    detectedIntent: extra.detectedIntent || "search",
    hasActiveAnchor: !!extra.hasActiveAnchor,
    sessionContext: extra.sessionContext || {},
  });
  const forced =
    recognition.interactionMode === MIA_INTERACTION_MODES.MIXED
      ? recognition
      : {
          ...recognition,
          interactionMode: MIA_INTERACTION_MODES.MIXED,
          commercialIntent: true,
          humanObjective: "mixed_human_commerce",
          commercialObjective: "purchase_help",
        };
  const authority = buildIntentAuthorityFromRecognition(forced, {
    hasActiveAnchor: !!extra.hasActiveAnchor,
  });
  let contract = buildSocialConversationBehaviorContract(forced, { authority, message });
  contract = enrichContractWithMixedVerbalization(contract, {
    recognition: forced,
    message,
    comparisonActive: !!extra.comparisonActive,
    hasWinner: !!extra.hasWinner,
  });
  const ctx = buildMixedResponseContext(contract, {
    message,
    sessionContext: extra.sessionContext || null,
    commercialSnapshot: buildCommercialSnapshot({
      winnerName: extra.winnerName || "Galaxy S23",
      structuredReply: COMMERCIAL,
      commercialBody: COMMERCIAL,
      commercialSearchQuery: message,
    }),
    responsePath: extra.responsePath || "return_seguro",
    comparisonActive: !!extra.comparisonActive,
  });
  return { contract, ctx };
}

console.log("\nPATCH 11A.6F — Mixed Contract Coverage & Completion Tests\n");

console.log("Grupo A — Human present, commercial missing");
test("A: detects commercialRequiredButMissing", () => {
  const { ctx } = buildMixedTurn("Hoje foi péssimo, mas preciso de um celular.");
  const validation = validateMixedDualDimensionCompletion("Puxado.", ctx);
  expectTrue(validation.violations.includes("commercialRequiredButMissing"));
});

test("A: fallback completes commercial body", () => {
  const { ctx } = buildMixedTurn("Hoje foi péssimo, mas preciso de um celular.");
  const result = completeMixedDualDimensions("Puxado.", ctx);
  expectTrue(result.validation.audit.commercialCompletionDetected);
  expectIncludes(result.reply, "Galaxy S23");
  expectIncludes(result.reply, "Puxado");
});

console.log("\nGrupo B — Commercial present, human missing");
test("B: detects humanRequiredButMissing", () => {
  const { ctx } = buildMixedTurn("Estou cansado, compara S23 e iPhone 13.", {
    comparisonActive: true,
  });
  const validation = validateMixedDualDimensionCompletion(COMMERCIAL, ctx);
  expectTrue(validation.violations.includes("humanRequiredButMissing"));
});

test("B: fallback inserts minimal ack", () => {
  const { ctx } = buildMixedTurn("Estou cansado, compara S23 e iPhone 13.", {
    comparisonActive: true,
  });
  const result = completeMixedDualDimensions(COMMERCIAL, ctx);
  expectTrue(result.validation.audit.humanCompletionDetected);
  expectIncludes(result.reply, "Galaxy S23");
});

console.log("\nGrupo C — Positive mixed");
for (const msg of [
  "Estou feliz, finalmente vou comprar uma TV.",
  "Consegui juntar o dinheiro, quero um notebook.",
  "Hoje deu certo, agora vou escolher um celular.",
]) {
  test(`C: positive polarity "${msg.slice(0, 35)}..."`, () => {
    const { ctx } = buildMixedTurn(msg);
    expectEqual(ctx.humanSnapshot.humanPolarity, HUMAN_POLARITY.POSITIVE, "polarity");
    const result = completeMixedDualDimensions(COMMERCIAL, ctx);
    expectTrue(result.validation.audit.humanCompletionDetected);
    expectIncludes(result.reply, "Que bom");
  });
}

console.log("\nGrupo D — Direct mixed");
for (const msg of [
  "Estou cansado, só me diz qual vale mais.",
  "Sem muita conversa, qual é melhor?",
  "Meu dia foi pesado, compara logo esses dois.",
]) {
  test(`D: direct + complete "${msg.slice(0, 30)}..."`, () => {
    const { ctx } = buildMixedTurn(msg, { comparisonActive: msg.includes("compara") });
    const result = completeMixedDualDimensions("Entendo.", ctx);
    expectTrue(result.validation.audit.dualCompletionPassed);
    expectIncludes(result.reply, "Galaxy S23");
  });
}

console.log("\nGrupo E — Comparison");
test("E: comparison dual completion", () => {
  const comparisonBody =
    "Minha escolha: Galaxy S23\n\nO que você ganha: câmera melhor.\nO que abre mão: preço.";
  const { ctx } = buildMixedTurn("Estou cansado, compara S23 e iPhone 13.", {
    comparisonActive: true,
  });
  ctx.commercialSnapshot.comparisonBody = comparisonBody;
  ctx.commercialSnapshot.commercialBody = comparisonBody;
  const result = completeMixedDualDimensions(comparisonBody, ctx);
  expectTrue(result.validation.audit.commercialCompletionDetected);
  expectTrue(result.validation.audit.humanCompletionDetected);
});

console.log("\nGrupo F — Clarification");
test("F: clarification completion", () => {
  const { contract } = buildMixedTurn("Hoje foi péssimo, preciso de um celular.");
  const enriched = enrichContractWithMixedVerbalization(contract, {
    message: "Hoje foi péssimo, preciso de um celular.",
    clarificationRequired: true,
  });
  const ctx = buildMixedResponseContext(enriched, {
    message: "Hoje foi péssimo, preciso de um celular.",
    commercialSnapshot: buildCommercialSnapshot({
      clarificationQuestion: "Qual faixa de preço ou uso principal você tem em mente?",
    }),
    clarificationRequired: true,
  });
  const result = completeMixedDualDimensions("Puxado.", ctx);
  expectTrue(result.validation.audit.commercialCompletionDetected);
  expectIncludes(result.reply, "?");
});

console.log("\nGrupo G — Response path coverage");
test("G: ensureMixedContractCoverage passes with context", () => {
  const { ctx } = buildMixedTurn("Hoje foi péssimo, mas preciso de um celular.");
  const coverage = ensureMixedContractCoverage(ctx, "return_seguro");
  expectTrue(coverage.covered);
  expectTrue(coverage.mixedContractPresent);
});

console.log("\nGrupo H — Follow-up continuation eligibility");
test("H: follow-up with anchor is eligible", () => {
  const eligible = resolveMixedContinuationEligibility({
    interactionMode: "emotional_support",
    message: "Estou cansado, só me diz qual vale mais a pena",
    sessionContext: { lastBestProduct: { product_name: "iPhone 13" } },
  });
  expectTrue(eligible);
});

test("H: continuation builds mixed context", () => {
  const contract = buildSocialConversationBehaviorContract(
    {
      interactionMode: "emotional_support",
      humanObjective: "express_feeling",
      commercialObjective: null,
    },
    { message: "Estou cansado, só me diz qual vale mais a pena" }
  );
  const ctx = buildMixedResponseContext(contract, {
    message: "Estou cansado, só me diz qual vale mais a pena",
    sessionContext: { lastBestProduct: { product_name: "iPhone 13" } },
    commercialSnapshot: buildCommercialSnapshot({
      winnerName: "iPhone 13",
      structuredReply: COMMERCIAL.replace(/Galaxy S23/g, "iPhone 13"),
      commercialBody: COMMERCIAL.replace(/Galaxy S23/g, "iPhone 13"),
    }),
  });
  expectTrue(!!ctx?.contract?.mixedVerbalization?.commercialCompletionRequired);
  const result = completeMixedDualDimensions("Dia pesado mesmo.", ctx);
  expectTrue(result.validation.audit.dualCompletionPassed);
  expectIncludes(result.reply, "iPhone 13");
});

console.log("\nGrupo I — Duplication guard");
test("I: strips duplicate commercial opening", () => {
  const { ctx } = buildMixedTurn("Hoje foi péssimo, mas preciso de um celular.");
  const dup = `Entendo.\n\n${COMMERCIAL}\n\nEu iria no Galaxy S23 porque duplicado.`;
  const result = completeMixedDualDimensions(dup, ctx);
  expectFalse((result.reply.match(/eu iria no/gi) || []).length > 1);
});

console.log("\nGrupo J — Fallback snapshot");
test("J: fallback uses snapshot winner without pipeline", () => {
  const { contract } = buildMixedTurn("Meu dia foi pesado, preciso de celular.");
  const fallback = buildGovernedMixedFallbackReply(contract, {
    commercialSnapshot: buildCommercialSnapshot({
      winnerName: "Galaxy S23",
      structuredReply: COMMERCIAL,
    }),
    completionRequirements: {
      humanCompletionRequired: true,
      commercialCompletionRequired: true,
    },
  });
  expectIncludes(fallback, "Galaxy S23");
});

console.log(`\n${"=".repeat(60)}`);
console.log(`Resultado: ${passed} passed, ${failed} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f.label}: ${f.error}`);
  process.exit(1);
}
console.log("Todos os testes passaram.\n");
