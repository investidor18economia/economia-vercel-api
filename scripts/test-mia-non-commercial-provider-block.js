/**
 * PATCH 11A.2 — Non-Commercial Provider Block Audit
 *
 * Rodar: node scripts/test-mia-non-commercial-provider-block.js
 */

import {
  recognizeMiaIntent,
  MIA_INTERACTION_MODES,
  buildCognitiveRoutingSignalFromTurn,
} from "../lib/miaIntentRecognitionLayer.js";
import {
  buildIntentAuthorityFromRecognition,
  resolveCommercialPermissionFromRecognition,
  COMMERCIAL_PERMISSION,
  applyIntentAuthorityToPipeline,
  suppressCommercialSignalsForAuthority,
  enforceRoutingDecisionAgainstAuthority,
} from "../lib/miaIntentAuthority.js";
import {
  evaluateCommercialEntryPermission,
  createCommercialEntryGateTracker,
  assertNonCommercialExecutionInvariants,
  assertCommercialPipelineAllowed,
  resolveNonCommercialFlowFromAuthority,
} from "../lib/miaCommercialEntryGate.js";
import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";

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

function simulateDenyPipeline(message, extra = {}) {
  const query = message;
  const recognition = recognizeMiaIntent({
    userMessage: message,
    resolvedQuery: query,
    detectedIntent: extra.detectedIntent || "search",
    hasActiveAnchor: !!extra.hasActiveAnchor,
    sessionContext: extra.sessionContext || {},
  });
  const authority = buildIntentAuthorityFromRecognition(recognition, {
    hasActiveAnchor: !!extra.hasActiveAnchor,
  });
  const applied = applyIntentAuthorityToPipeline({
    authority,
    intent: extra.detectedIntent || "search",
    contextAction: "search",
    contextResolution: { mode: "general_answer" },
    query,
  });
  const signals = suppressCommercialSignalsForAuthority(authority, {
    hasClearNewCommercialSearch: true,
    isExplicitComparison: false,
  });
  let routing = buildRoutingDecision({
    userMessage: query,
    resolvedQuery: query,
    contextResolution: applied.contextResolutionPatch || {},
    sessionContext: extra.sessionContext || {},
    incomingSessionContext: {},
    intent: applied.intent,
    contextAction: applied.contextAction,
    intentRecognition: recognition,
    intentAuthority: authority,
    signals,
  });
  routing = enforceRoutingDecisionAgainstAuthority(routing, authority, {
    hasAnchor: !!extra.hasActiveAnchor,
  }).routingDecision;

  const tracker = createCommercialEntryGateTracker();
  const entry = evaluateCommercialEntryPermission({
    authority,
    routingDecision: routing,
    intent: applied.intent,
    tracker,
  });

  const blocked = !assertCommercialPipelineAllowed(entry, "provider_fetch", { tracker });

  return {
    recognition,
    authority,
    routing,
    entry,
    tracker,
    blocked,
    flow: resolveNonCommercialFlowFromAuthority(authority),
  };
}

console.log("\nPATCH 11A.2 — Non-Commercial Provider Block Audit\n");

console.log("Grupo A — Cumprimentos");
for (const msg of ["Olá", "Boa noite", "e aí", "opa", "oii"]) {
  test(`A: "${msg}" → deny + gate blocked`, () => {
    const r = simulateDenyPipeline(msg);
    expect(r.authority.commercialPermission, COMMERCIAL_PERMISSION.DENY);
    expectFalse(r.entry.commercialEntryAllowed);
    expectTrue(r.blocked);
    expect((r.tracker.toTrace().providerCallDelta || 0), 0);
  });
}

console.log("\nGrupo B — Social e reação");
for (const msg of ["Rapaz, viver cansa", "kkkk", "Valeu pela ajuda", "pois é", "Hoje o dia foi corrido"]) {
  test(`B: "${msg}" → deny`, () => {
    const r = simulateDenyPipeline(msg);
    expect(r.entry.commercialPermission, COMMERCIAL_PERMISSION.DENY);
    expectFalse(r.entry.commercialEntryAllowed);
  });
}

console.log("\nGrupo C — Emoção leve");
for (const msg of ["Estou desanimado hoje", "Hoje não foi um dia bom", "to mo cansado"]) {
  test(`C: "${msg}" → deny`, () => {
    const r = simulateDenyPipeline(msg);
    expectFalse(r.entry.commercialEntryAllowed);
    expectFalse(r.routing.allowNewSearch);
  });
}

console.log("\nGrupo D — Pós-compra");
for (const msg of [
  "Comprei o celular, obrigado",
  "Já comprei, valeu",
  "Fechei a compra, brigadão",
  "Deu certo, obrigado",
  "Peguei aquele modelo, valeu",
]) {
  test(`D: "${msg}" → acknowledgement + deny`, () => {
    const r = simulateDenyPipeline(msg, {
      hasActiveAnchor: true,
      sessionContext: { lastBestProduct: { product_name: "Galaxy S23" } },
    });
    expect(
      ["acknowledgement", "social_conversation"].includes(r.recognition.primaryIntent),
      true,
      "primaryIntent"
    );
    expect(r.authority.commercialPermission, COMMERCIAL_PERMISSION.DENY);
    expectFalse(r.entry.commercialEntryAllowed);
    expectFalse(r.routing.allowNewSearch);
    expect(r.routing.mode !== "new_search", true);
    assertNonCommercialExecutionInvariants(
      {
        entryResult: r.entry,
        tracker: r.tracker,
        routingDecision: r.routing,
        prices: [],
        sessionBefore: { lastBestProduct: { product_name: "Galaxy S23" } },
        sessionOut: { lastBestProduct: { product_name: "Galaxy S23" } },
      },
      { strict: true }
    );
  });
}

console.log("\nGrupo E — Comercial legítimo");
for (const [msg, extra] of [
  ["Quero comprar um celular", {}],
  ["Qual notebook vale mais a pena?", {}],
  ["Compare iPhone 13 com Galaxy S23", { signals: { isExplicitComparison: true } }],
  ["Procure o melhor preço de TV 55", {}],
]) {
  test(`E: "${msg}" → allow`, () => {
    const recognition = recognizeMiaIntent({
      userMessage: msg,
      resolvedQuery: msg,
      detectedIntent: "search",
      signals: extra.signals || {},
    });
    const authority = buildIntentAuthorityFromRecognition(recognition);
    const entry = evaluateCommercialEntryPermission({
      authority,
      routingDecision: { allowNewSearch: true, mode: "new_search" },
      intent: "search",
    });
    expectTrue(entry.commercialEntryAllowed);
    expect(
      authority.commercialPermission,
      COMMERCIAL_PERMISSION.ALLOW,
      "permission"
    );
  });
}

console.log("\nGrupo F — Mixed");
for (const msg of [
  "Hoje foi ruim, mas preciso escolher um celular",
  "Estou cansado, compara esses dois pra mim",
]) {
  test(`F: "${msg}" → mixed allowed`, () => {
    const recognition = recognizeMiaIntent({ userMessage: msg, resolvedQuery: msg, detectedIntent: "search" });
    expect(recognition.interactionMode, MIA_INTERACTION_MODES.MIXED);
    const authority = buildIntentAuthorityFromRecognition(recognition);
    expect(authority.commercialPermission, COMMERCIAL_PERMISSION.MIXED);
    const entry = evaluateCommercialEntryPermission({
      authority,
      routingDecision: { allowNewSearch: true, mode: "new_search" },
      intent: "search",
    });
    expectTrue(entry.commercialEntryAllowed);
  });
}

console.log("\nGrupo G — Divergência forçada");
test("G1: deny authority blocks provider stage", () => {
  const entry = {
    allowed: false,
    commercialEntryAllowed: false,
    reasonCode: "intent_authority_commercial_deny",
  };
  const tracker = createCommercialEntryGateTracker();
  expectFalse(assertCommercialPipelineAllowed(entry, "google_shopping", { tracker }));
  expectTrue(tracker.state.blockedStages.includes("google_shopping"));
});

test("G2: resolveCommercialPermission fail-closed default", () => {
  const permission = resolveCommercialPermissionFromRecognition({
    interactionMode: MIA_INTERACTION_MODES.SOCIAL,
    primaryIntent: "social_conversation",
    commercialIntent: false,
    resolvedQuery: "só passando",
    socialFamilies: {},
    reasons: ["social_intent_dominant"],
  });
  expect(permission, COMMERCIAL_PERMISSION.DENY);
});

console.log("\nGrupo H — Permission table");
test("H1: post_purchase never allow without active ask", () => {
  const r = recognizeMiaIntent({
    userMessage: "Comprei o celular, obrigado",
    resolvedQuery: "Comprei o celular, obrigado",
  });
  expect(r.reasons.includes("post_purchase_acknowledgement"), true);
  expect(resolveCommercialPermissionFromRecognition(r), COMMERCIAL_PERMISSION.DENY);
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
console.log("PATCH 11A.2 PROVIDER BLOCK AUDIT: APROVADO");
process.exit(0);
