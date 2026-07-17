/**
 * PATCH 11A.1 — Intent Authority Enforcement Audit
 *
 * Rodar: node scripts/test-mia-intent-authority-enforcement.js
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  recognizeMiaIntent,
  MIA_INTERACTION_MODES,
  buildCognitiveRoutingSignalFromTurn,
} from "../lib/miaIntentRecognitionLayer.js";
import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";
import {
  buildIntentAuthorityFromRecognition,
  applyIntentAuthorityToPipeline,
  suppressCommercialSignalsForAuthority,
  enforceRoutingDecisionAgainstAuthority,
  buildCognitiveAuthorityFromIntentAuthority,
  assertIntentAuthorityConsistency,
  shouldBlockLegacyIntentOverride,
  shouldRejectIntentPatch,
  COMMERCIAL_PERMISSION,
} from "../lib/miaIntentAuthority.js";
import { mapCognitiveTurnToLegacyIntent } from "../lib/miaCognitiveBridge.js";
import { resolveClearNewCommercialSearchForRouting } from "../lib/miaRoutingSafety.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

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
    resolvedQuery: extra.resolvedQuery || message,
    sessionContext: extra.sessionContext || {},
    signals: extra.signals || {},
    cognitiveTurn: extra.cognitiveTurn || null,
    hasActiveAnchor: !!extra.hasActiveAnchor,
    detectedIntent: extra.detectedIntent || "general_answer",
  });
}

/**
 * Simulates handler pipeline: recognition → authority → routing → enforcement.
 */
function simulateAuthorityPipeline(message, extra = {}) {
  const query = message;
  const sessionContext = extra.sessionContext || {};
  const hasAnchor = !!extra.hasActiveAnchor;
  const detectedIntent = extra.detectedIntent || "search";

  const recognition = recognize(message, { ...extra, detectedIntent });
  const authority = buildIntentAuthorityFromRecognition(recognition, {
    hasActiveAnchor: hasAnchor,
  });

  let intent = detectedIntent;
  let contextResolution = extra.contextResolution || { mode: "general_answer" };

  const applied = applyIntentAuthorityToPipeline({
    authority,
    intent,
    contextAction: "search",
    contextResolution,
    query,
  });
  intent = applied.intent;
  if (applied.contextResolutionPatch) {
    Object.assign(contextResolution, applied.contextResolutionPatch);
  }

  const rawCommercial =
    typeof extra.signals?.hasClearNewCommercialSearch === "boolean"
      ? extra.signals.hasClearNewCommercialSearch
      : resolveClearNewCommercialSearchForRouting({
          query,
          resolvedQuery: contextResolution.standaloneQuery || query,
          hasAnchor,
          looksLikeShortPriorityFollowUp: false,
          looksLikeAmbiguousFollowUp: false,
          isExplicitComparison: false,
          explicitProductOnlyQuery: false,
          wantsNew: false,
          detectProductCategory: () => "",
          wantsNewProduct: () => false,
          ...(extra.commercialProbe || {}),
        });

  const signals = suppressCommercialSignalsForAuthority(authority, {
    hasClearNewCommercialSearch: rawCommercial,
    isExplicitComparison: !!(extra.signals?.isExplicitComparison),
    wantsNew: !!(extra.signals?.wantsNew),
    newCategoryInOriginalMessage: !!(extra.signals?.newCategoryInOriginalMessage),
    ...(extra.signals || {}),
  });

  let routing = buildRoutingDecision({
    userMessage: query,
    resolvedQuery: authority?.commercialPermission === "deny" ? query : query,
    contextResolution,
    sessionContext,
    incomingSessionContext: {},
    intent,
    contextAction: applied.contextAction,
    intentRecognition: recognition,
    intentAuthority: authority,
    cognitiveRoutingSignal: buildCognitiveRoutingSignalFromTurn(
      extra.cognitiveTurn || null,
      hasAnchor
    ),
    signals,
  });

  const enforced = enforceRoutingDecisionAgainstAuthority(routing, authority, {
    hasAnchor,
  });
  routing = enforced.routingDecision;

  const cognitiveAuthority = buildCognitiveAuthorityFromIntentAuthority(authority);

  if (shouldEarlyExitAuthority(authority)) {
    const governed =
      authority.legacyIntentOverride || authority.primaryIntent || "social_conversation";
    if (intent === "search" || intent === "general_answer") {
      intent = governed;
    }
  }

  return {
    recognition,
    authority,
    intent,
    routing,
    cognitiveAuthority,
    divergences: applied.divergences,
    enforced,
  };
}

function shouldEarlyExitAuthority(authority) {
  return (
    authority?.authoritative === true &&
    authority.commercialPermission === COMMERCIAL_PERMISSION.DENY
  );
}

function assertNonCommercialPipeline(result, label = "") {
  expectTrue(result.authority?.authoritative, `${label} authoritative`);
  expect(result.authority.commercialPermission, COMMERCIAL_PERMISSION.DENY, `${label} deny`);
  expectFalse(result.intent === "search", `${label} intent not search`);
  expectFalse(result.routing.allowNewSearch, `${label} allowNewSearch`);
  expectFalse(result.routing.allowRerank, `${label} allowRerank`);
  expectFalse(result.routing.mode === "new_search", `${label} mode not new_search`);
  expectTrue(result.cognitiveAuthority != null, `${label} cognitiveAuthority`);
  expectFalse(result.cognitiveAuthority?.shadowOnly, `${label} shadowOnly`);
  expectTrue(result.cognitiveAuthority?.authoritative, `${label} cognitive authoritative`);
}

console.log("\nPATCH 11A.1 — Intent Authority Enforcement Audit\n");

console.log("Grupo A — Autoridade social");
for (const msg of [
  "Boa noite",
  "Rapaz, viver cansa",
  "Hoje foi um dia cansativo",
  "Valeu pela ajuda",
  "kkkk",
  "Estou desanimado hoje",
  "Olá",
  "pois é",
]) {
  test(`A: "${msg}" → authority deny, no search`, () => {
    const r = simulateAuthorityPipeline(msg, { detectedIntent: "search" });
    assertNonCommercialPipeline(r, msg);
  });
}

console.log("\nGrupo B — Autoridade comercial");
for (const [msg, extra] of [
  ["Qual celular vale mais a pena?", { detectedIntent: "search", signals: { hasClearNewCommercialSearch: true, newCategoryInOriginalMessage: true } }],
  ["Compare o iPhone 13 com o Galaxy S23", { detectedIntent: "comparison", signals: { isExplicitComparison: true, hasClearNewCommercialSearch: true } }],
  ["Quero um notebook até 4 mil", { detectedIntent: "search", signals: { hasClearNewCommercialSearch: true, newCategoryInOriginalMessage: true } }],
]) {
  test(`B: "${msg}" → commercial allow`, () => {
    const r = simulateAuthorityPipeline(msg, {
      ...extra,
      commercialProbe: { isExplicitComparison: !!extra.signals?.isExplicitComparison },
    });
    expectTrue(r.authority?.authoritative);
    expect(r.authority.commercialPermission, COMMERCIAL_PERMISSION.ALLOW);
    expectTrue(r.routing.allowNewSearch || r.recognition.interactionMode === MIA_INTERACTION_MODES.COMMERCE);
  });
}

console.log("\nGrupo C — Continuidade");
test("C1: busca → agradecimento não vira search", () => {
  const r = simulateAuthorityPipeline("Valeu pela ajuda", {
    detectedIntent: "search",
    hasActiveAnchor: true,
    sessionContext: { lastBestProduct: { product_name: "Galaxy S23" } },
    commercialProbe: {
      hasAnchor: true,
      detectProductCategory: () => "celular",
    },
  });
  assertNonCommercialPipeline(r);
  expectTrue(r.routing.shouldPreserveAnchor);
});
test("C2: 'Comprei o celular, obrigado' não vira produto/search", () => {
  const r = simulateAuthorityPipeline("Comprei o celular, obrigado", {
    detectedIntent: "search",
    hasActiveAnchor: true,
    sessionContext: { lastBestProduct: { product_name: "Galaxy S23" } },
    commercialProbe: {
      hasAnchor: true,
      detectProductCategory: () => "celular",
    },
  });
  assertNonCommercialPipeline(r);
  expectFalse(r.routing.allowReplaceWinner);
});

console.log("\nGrupo D — Ambiguidade com âncora");
test("D1: 'e esse?' com âncora não bloqueado indevidamente", () => {
  const r = simulateAuthorityPipeline("e esse?", {
    detectedIntent: "search",
    hasActiveAnchor: true,
    sessionContext: { lastBestProduct: { product_name: "TV 55" } },
  });
  expectTrue(
    r.recognition.interactionMode === MIA_INTERACTION_MODES.CLARIFICATION ||
      r.recognition.continuityRelevance >= 0.35
  );
});
test("D2: 'qual então?' com âncora — continuidade preservada", () => {
  const r = simulateAuthorityPipeline("qual então?", {
    detectedIntent: "search",
    hasActiveAnchor: true,
    sessionContext: { lastBestProduct: { product_name: "Notebook A" } },
  });
  expectTrue(r.authority?.authoritative);
});

console.log("\nGrupo E — Intenção mista");
test("E1: emoção + pedido comercial → mixed preserved", () => {
  const msg = "Hoje foi péssimo, mas preciso escolher um celular";
  const r = simulateAuthorityPipeline(msg, {
    detectedIntent: "search",
    signals: { hasClearNewCommercialSearch: true, newCategoryInOriginalMessage: true },
    commercialProbe: { detectProductCategory: () => "celular" },
  });
  expect(r.recognition.interactionMode, MIA_INTERACTION_MODES.MIXED);
  expect(r.authority.commercialPermission, COMMERCIAL_PERMISSION.MIXED);
  expectTrue(r.authority.authoritative);
});

console.log("\nGrupo F — Segurança (authority não sobrescreve safety)");
test("F1: SAFETY mode não produz authority comercial", () => {
  const recognition = {
    interactionMode: MIA_INTERACTION_MODES.SAFETY,
    primaryIntent: "safety_block",
    commercialIntent: false,
  };
  const authority = buildIntentAuthorityFromRecognition(recognition);
  expect(authority, null);
});

console.log("\nGrupo G — Divergência forçada");
test("G1: legacy search bloqueado quando authority deny", () => {
  const authority = {
    authoritative: true,
    commercialPermission: COMMERCIAL_PERMISSION.DENY,
    legacyIntentOverride: "social_conversation",
  };
  const bridge = { active: true, intent: "search" };
  expectTrue(shouldBlockLegacyIntentOverride(authority, bridge));
});
test("G2: enforceRoutingDecision corrige new_search", () => {
  const authority = {
    authoritative: true,
    commercialPermission: COMMERCIAL_PERMISSION.DENY,
    primaryIntent: "social_conversation",
  };
  const { routingDecision, applied } = enforceRoutingDecisionAgainstAuthority(
    { mode: "new_search", allowNewSearch: true, allowRerank: true, responsePathHint: "default_product_search" },
    authority,
    { hasAnchor: false }
  );
  expectTrue(applied);
  expectFalse(routingDecision.allowNewSearch);
  expectFalse(routingDecision.mode === "new_search");
});
test("G3: assertIntentAuthorityConsistency strict falha antes da correção", () => {
  let threw = false;
  try {
    assertIntentAuthorityConsistency(
      {
        authority: { authoritative: true, commercialPermission: "deny", shadowOnly: false },
        intent: "search",
        routingDecision: { allowNewSearch: true, mode: "new_search" },
        cognitiveAuthority: null,
      },
      { strict: true }
    );
  } catch {
    threw = true;
  }
  expectTrue(threw);
});
test("G4: shouldRejectIntentPatch bloqueia search patch", () => {
  const authority = { authoritative: true, commercialPermission: COMMERCIAL_PERMISSION.DENY };
  expectTrue(shouldRejectIntentPatch(authority, "search"));
  expectFalse(shouldRejectIntentPatch(authority, "social_conversation"));
});

console.log("\nGrupo H — Regressão logs reais (objetivos semânticos)");
for (const msg of [
  "Boa noite",
  "Rapaz, viver cansa",
  "Hoje foi um dia cansativo",
  "Valeu pela ajuda",
  "kkkk",
  "Estou desanimado hoje",
  "Comprei o celular, obrigado",
]) {
  test(`H: regressão "${msg}"`, () => {
    const r = simulateAuthorityPipeline(msg, {
      detectedIntent: "search",
      commercialProbe: {
        detectProductCategory: (q) => (/celular/i.test(q) ? "celular" : null),
      },
      hasActiveAnchor: /comprei/i.test(msg),
      sessionContext: /comprei/i.test(msg)
        ? { lastBestProduct: { product_name: "Galaxy S23" } }
        : {},
    });
    assertNonCommercialPipeline(r, msg);
  });
}

console.log("\nGrupo I — Handler wiring estático");
test("I1: chat-gpt4o importa intent authority", () => {
  const src = readFileSync(join(ROOT, "pages/api/chat-gpt4o.js"), "utf8");
  expectTrue(src.includes("buildIntentAuthorityFromRecognition"));
  expectTrue(src.includes("enforceRoutingDecisionAgainstAuthority"));
  expectTrue(src.includes("intentAuthority"));
});
test("I2: buildRoutingDecision ② recebe intentAuthority", () => {
  const src = readFileSync(join(ROOT, "pages/api/chat-gpt4o.js"), "utf8");
  expectTrue(/intentAuthority,\s*\n\s*signals:/s.test(src));
});
test("I3: cognitiveAuthority from intent authority", () => {
  const src = readFileSync(join(ROOT, "pages/api/chat-gpt4o.js"), "utf8");
  expectTrue(src.includes("buildCognitiveAuthorityFromIntentAuthority"));
});
test("I4: routing contract authority hold precedes commercial search", () => {
  const src = readFileSync(join(ROOT, "lib/miaRoutingDecisionContract.js"), "utf8");
  const marker = "PATCH 11A.1 — authoritative non-commercial hold precedes commercial search promotion";
  const idxMarker = src.indexOf(marker);
  const idxCommercialBlock = src.indexOf("if (signals.hasClearNewCommercialSearch)", idxMarker);
  expectTrue(idxMarker > 0 && idxCommercialBlock > idxMarker);
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
console.log("PATCH 11A.1 AUTHORITY AUDIT: APROVADO");
process.exit(0);
