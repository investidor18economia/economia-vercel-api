/**
 * PATCH 11B.1 — Commercial Follow-up Continuity
 * Run: node scripts/test-mia-commercial-follow-up-continuity.js
 */

import {
  recognizeMiaIntent,
  detectConversationalEntityMentionFrame,
} from "../lib/miaIntentRecognitionLayer.js";
import {
  buildIntentAuthorityFromRecognition,
  COMMERCIAL_PERMISSION,
} from "../lib/miaIntentAuthority.js";
import {
  resolveContextualCommercialFollowUp,
  classifyCommercialFollowUpType,
  COMMERCIAL_FOLLOW_UP_TYPES,
} from "../lib/miaCommercialFollowUpContinuity.js";
import {
  normalizeSemanticSessionState,
  resolveSemanticContinuationEligibility,
} from "../lib/miaSemanticStateGovernance.js";

let passed = 0;
let failed = 0;

function test(label, fn) {
  try {
    fn();
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${label}`);
    console.error(`    → ${err.message}`);
    failed++;
  }
}

function expect(a, b, label = "") {
  if (a !== b) throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}${label ? ` [${label}]` : ""}`);
}

function expectTrue(v, label = "") {
  if (!v) throw new Error(`Expected truthy${label ? ` [${label}]` : ""}`);
}

function expectFalse(v, label = "") {
  if (v) throw new Error(`Expected falsy${label ? ` [${label}]` : ""}`);
}

function baseCtx() {
  return {
    lastBestProduct: { product_name: "iPhone 13", price: "1911.65", source: "Casas Bahia" },
    lastRankingSnapshot: [
      { rank: 1, product_name: "iPhone 13", price: "1911.65" },
      { rank: 2, product_name: "iPhone 11", price: "1291.15" },
    ],
    lastQuery: "qual celular até 2500?",
    lastCategory: "phone",
    decisionCompleted: true,
  };
}

function pipeline(message, ctx = baseCtx()) {
  const recognition = recognizeMiaIntent({
    userMessage: message,
    resolvedQuery: message,
    sessionContext: ctx,
    hasActiveAnchor: true,
    detectedIntent: "search",
  });
  const authority = buildIntentAuthorityFromRecognition(recognition, {
    hasActiveAnchor: true,
    sessionContext: ctx,
  });
  const normalized = normalizeSemanticSessionState(ctx, {
    message,
    intentRecognition: recognition,
  });
  const continuation = resolveSemanticContinuationEligibility({
    message,
    intentRecognition: recognition,
    intentAuthority: authority,
    normalizedState: normalized,
  });
  const followUp = resolveContextualCommercialFollowUp({
    message,
    sessionContext: ctx,
    hasActiveAnchor: true,
  });
  return { recognition, authority, normalized, continuation, followUp };
}

console.log("\nPATCH 11B.1 — Commercial Follow-up Continuity\n");

console.log("Grupo A — preço");
for (const msg of [
  "e quanto custa?",
  "qual o preço?",
  "e o valor?",
  "qto custa?",
]) {
  test(`A price: ${msg}`, () => {
    const r = pipeline(msg);
    expect(r.followUp.followUpType, COMMERCIAL_FOLLOW_UP_TYPES.PRICE_FOLLOW_UP);
    expect(r.authority.commercialPermission, COMMERCIAL_PERMISSION.ALLOW);
    expectTrue(r.continuation.commercialExecutionFromContinuation);
    expect(r.followUp.resolvedProduct?.product_name, "iPhone 13");
    expectFalse(r.followUp.providerRequired, "provider");
  });
}

test("A price without context → clarify", () => {
  const r = pipeline("e quanto custa?", {});
  expect(r.authority.commercialPermission, COMMERCIAL_PERMISSION.ALLOW);
  expectTrue(r.followUp.requiresClarification || !r.followUp.contextualCommercialAuthorized);
});

console.log("\nGrupo B — runner-up");
for (const msg of [
  "e a segunda opção?",
  "qual era o outro?",
  "e o segundo?",
  "tem uma alternativa?",
]) {
  test(`B runner-up: ${msg}`, () => {
    const r = pipeline(msg);
    expect(r.followUp.followUpType, COMMERCIAL_FOLLOW_UP_TYPES.RUNNER_UP_FOLLOW_UP);
    expect(r.authority.commercialPermission, COMMERCIAL_PERMISSION.ALLOW);
    expectTrue(r.continuation.commercialExecutionFromContinuation);
    expect(r.followUp.resolvedProduct?.product_name, "iPhone 11");
  });
}

console.log("\nGrupo C — atributos / avaliação");
for (const [msg, type] of [
  ["e bateria?", COMMERCIAL_FOLLOW_UP_TYPES.ATTRIBUTE_FOLLOW_UP],
  ["e câmera?", COMMERCIAL_FOLLOW_UP_TYPES.ATTRIBUTE_FOLLOW_UP],
  ["vale a pena?", COMMERCIAL_FOLLOW_UP_TYPES.JUSTIFICATION_FOLLOW_UP],
  ["por que esse?", COMMERCIAL_FOLLOW_UP_TYPES.JUSTIFICATION_FOLLOW_UP],
]) {
  test(`C: ${msg}`, () => {
    const r = pipeline(msg);
    expect(r.followUp.followUpType, type);
    expect(r.authority.commercialPermission, COMMERCIAL_PERMISSION.ALLOW);
  });
}

console.log("\nGrupo D — topic switch");
for (const msg of [
  "mudando de assunto, como você está?",
  "obrigado, era só isso",
  "esquece celular",
]) {
  test(`D topic switch: ${msg.slice(0, 30)}`, () => {
    const r = pipeline(msg);
    expect(r.authority.commercialPermission, COMMERCIAL_PERMISSION.DENY);
    expectFalse(r.continuation.commercialExecutionFromContinuation);
  });
}

console.log("\nGrupo E — PATCH 11B regression");
for (const msg of [
  "acho esse Galaxy bonito",
  "estou cansado de pesquisar celular",
  "meu celular está velho",
]) {
  test(`E non-commercial cold: ${msg.slice(0, 30)}`, () => {
    expectTrue(detectConversationalEntityMentionFrame(msg));
    const r = pipeline(msg, {});
    expect(r.authority.commercialPermission, COMMERCIAL_PERMISSION.DENY);
  });
}

test("E explicit price still commercial", () => {
  const r = pipeline("quanto custa o Galaxy S23?", {});
  expect(r.authority.commercialPermission, COMMERCIAL_PERMISSION.ALLOW);
});

console.log("\nGrupo F — pares mínimos");
test("pair contextual price", () => {
  const r = pipeline("e quanto custa?");
  expect(r.authority.commercialPermission, COMMERCIAL_PERMISSION.ALLOW);
});
test("pair isolated price no ctx", () => {
  const followUp = resolveContextualCommercialFollowUp({
    message: "e quanto custa?",
    sessionContext: {},
    hasActiveAnchor: false,
  });
  expectFalse(followUp.contextualCommercialAuthorized);
});

console.log("\nGrupo G — generalização categorias");
test("geladeira runner-up", () => {
  const ctx = {
    lastBestProduct: { product_name: "Geladeira Brastemp", price: "3200" },
    lastRankingSnapshot: [
      { rank: 1, product_name: "Geladeira Brastemp", price: "3200" },
      { rank: 2, product_name: "Geladeira Consul", price: "2800" },
    ],
    decisionCompleted: true,
  };
  const r = pipeline("e a segunda opção?", ctx);
  expect(r.followUp.resolvedProduct?.product_name, "Geladeira Consul");
});

console.log(`\nResultado: ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
