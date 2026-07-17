/**
 * PATCH 11A.7 — Continuity & Semantic State Governance Tests
 */

import {
  normalizeSemanticSessionState,
  resolveSemanticContinuationEligibility,
  applySemanticStateTransition,
  SEMANTIC_STATE_GOVERNANCE_VERSION,
  TRANSITION_TYPES,
} from "../lib/miaSemanticStateGovernance.js";
import { MIA_INTERACTION_MODES } from "../lib/miaIntentRecognitionLayer.js";

let passed = 0;
let failed = 0;

function expect(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed += 1;
  } else {
    console.log(`  ✗ ${label}`);
    failed += 1;
  }
}

function expectEqual(actual, expected, label) {
  const ok = actual === expected;
  if (ok) {
    console.log(`  ✓ ${label}`);
    passed += 1;
  } else {
    console.log(`  ✗ ${label} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
    failed += 1;
  }
}

function buildRecognition(overrides = {}) {
  return {
    interactionMode: MIA_INTERACTION_MODES.SOCIAL,
    primaryIntent: "social_conversation",
    humanObjective: "create_connection",
    commercialObjective: null,
    socialFamilies: {},
    ...overrides,
  };
}

function buildAnchorSession() {
  return {
    lastBestProduct: { product_name: "iPhone 13", price: "R$ 3.999" },
    lastProducts: [{ product_name: "iPhone 13" }, { product_name: "iPhone 11" }],
    lastQuery: "preciso de um celular",
    lastCategory: "phone",
    lastPriority: "camera",
    lastInteractionType: "search",
  };
}

console.log("\nPATCH 11A.7 — Continuity & Semantic State Governance Tests\n");

console.log("Grupo A — State normalization");
{
  const full = normalizeSemanticSessionState(buildAnchorSession(), {
    intentRecognition: buildRecognition({ interactionMode: MIA_INTERACTION_MODES.COMMERCE }),
  });
  expectEqual(full.version, SEMANTIC_STATE_GOVERNANCE_VERSION, "A: version");
  expect(full.validity.commercialAnchorValid, "A: commercial anchor valid");
  expectEqual(full.commercial.anchor?.product_name, "iPhone 13", "A: anchor product");

  const partial = normalizeSemanticSessionState({ lastIntent: "search" });
  expect(!partial.validity.commercialAnchorValid, "A: partial session no invented anchor");

  const legacy = normalizeSemanticSessionState({
    lastComparisonProducts: [{ product_name: "S23" }, { product_name: "iPhone 13" }],
    comparisonContextLocked: true,
  });
  expect(legacy.validity.comparisonValid, "A: comparison normalized from legacy fields");
}

console.log("\nGrupo B — Current intent override (social + anchor)");
{
  const state = normalizeSemanticSessionState(buildAnchorSession());
  const result = resolveSemanticContinuationEligibility({
    message: "boa noite",
    intentRecognition: buildRecognition({
      interactionMode: MIA_INTERACTION_MODES.SOCIAL,
      primaryIntent: "greeting",
    }),
    normalizedState: state,
  });
  expect(result.commercialAnchorPresent, "B: anchor present");
  expect(!result.commercialContinuationEligible, "B: commercial continuation denied");
  expect(!result.anchorExecuted, "B: anchor not executed");
  expect(result.anchorPreserved, "B: anchor preserved");
}

console.log("\nGrupo C — Commercial follow-up");
{
  const state = normalizeSemanticSessionState(buildAnchorSession());
  const result = resolveSemanticContinuationEligibility({
    message: "só me diz qual vale mais a pena",
    intentRecognition: buildRecognition({
      interactionMode: MIA_INTERACTION_MODES.EMOTIONAL_SUPPORT,
      primaryIntent: "emotional_support",
    }),
    normalizedState: state,
  });
  expect(result.commercialContinuationEligible, "C: commercial continuation eligible");
  expect(result.commercialExecutionFromContinuation, "C: commercial execution from continuation");
  expect(result.stateUsed.includes("commercial.anchor"), "C: uses commercial anchor");
}

console.log("\nGrupo D — False continuation");
{
  const state = normalizeSemanticSessionState(buildAnchorSession());
  for (const message of ["kkkk", "hoje foi cansativo", "quem é você?"]) {
    const result = resolveSemanticContinuationEligibility({
      message,
      intentRecognition: buildRecognition({
        interactionMode:
          message === "quem é você?"
            ? MIA_INTERACTION_MODES.IDENTITY
            : MIA_INTERACTION_MODES.SOCIAL,
        primaryIntent: message === "quem é você?" ? "about_mia" : "social_conversation",
      }),
      normalizedState: state,
    });
    expect(!result.commercialContinuationEligible, `D: no commercial continuation for "${message.slice(0, 12)}..."`);
  }
}

console.log("\nGrupo E — Mixed continuation");
{
  const session = {
    ...buildAnchorSession(),
    mixedConversationalState: { humanAcknowledgementSatisfied: true },
  };
  const state = normalizeSemanticSessionState(session);
  const result = resolveSemanticContinuationEligibility({
    message: "só me diz qual vale mais",
    intentRecognition: buildRecognition({
      interactionMode: MIA_INTERACTION_MODES.EMOTIONAL_SUPPORT,
    }),
    normalizedState: state,
  });
  expect(result.mixedContinuationEligible, "E: mixed continuation eligible");
  expect(result.commercialContinuationEligible, "E: commercial continuation eligible");
}

console.log("\nGrupo F — Mixed state stale / subject change");
{
  const session = {
    ...buildAnchorSession(),
    mixedConversationalState: { humanAcknowledgementSatisfied: true },
    mixedStateInvalidated: true,
  };
  const state = normalizeSemanticSessionState(session);
  expect(!state.validity.mixedValid, "F: invalidated mixed state");
  const result = resolveSemanticContinuationEligibility({
    message: "amanhã quero procurar um notebook",
    intentRecognition: buildRecognition({
      interactionMode: MIA_INTERACTION_MODES.COMMERCE,
      primaryIntent: "commerce",
      commercialObjective: "purchase_help",
    }),
    normalizedState: state,
    signals: { hasClearNewCommercialSearch: true },
  });
  expect(result.commercialContinuationEligible, "F: new search eligible");
  expect(!result.commercialAnchorValid, "F: previous anchor not authoritative");
}

console.log("\nGrupo G — Comparison state");
{
  const session = {
    ...buildAnchorSession(),
    lastComparisonProducts: [
      { product_name: "Galaxy S23" },
      { product_name: "iPhone 13" },
    ],
    comparisonContextLocked: true,
  };
  const state = normalizeSemanticSessionState(session);
  expect(state.validity.comparisonValid, "G: comparison valid");
  const result = resolveSemanticContinuationEligibility({
    message: "qual deles tem câmera melhor?",
    intentRecognition: buildRecognition({
      interactionMode: MIA_INTERACTION_MODES.COMMERCE,
      primaryIntent: "commerce",
    }),
    normalizedState: state,
  });
  expect(result.comparisonContinuationEligible, "G: comparison continuation eligible");
}

console.log("\nGrupo H — New search invalidation");
{
  const session = buildAnchorSession();
  const state = normalizeSemanticSessionState(session);
  const result = resolveSemanticContinuationEligibility({
    message: "quero procurar um notebook agora",
    intentRecognition: buildRecognition({
      interactionMode: MIA_INTERACTION_MODES.COMMERCE,
      primaryIntent: "commerce",
    }),
    normalizedState: state,
    signals: { hasClearNewCommercialSearch: true },
  });
  expect(result.commercialContinuationEligible, "H: new search continuation");
  expect(!result.commercialAnchorValid, "H: previous anchor invalidated for authority");
}

console.log("\nGrupo I — Post-purchase");
{
  const session = buildAnchorSession();
  const state = normalizeSemanticSessionState(session);
  const result = resolveSemanticContinuationEligibility({
    message: "comprei, obrigado",
    intentRecognition: buildRecognition({
      interactionMode: MIA_INTERACTION_MODES.SOCIAL,
      primaryIntent: "acknowledgement",
      socialFamilies: { postPurchaseAck: true },
    }),
    normalizedState: state,
  });
  expect(result.postPurchase, "I: post-purchase detected");
  expect(!result.commercialContinuationEligible, "I: no commercial continuation");
  expect(result.decisionCompleted, "I: decision completed");
}

console.log("\nGrupo J — State transition provenance");
{
  const before = normalizeSemanticSessionState(buildAnchorSession());
  const applied = applySemanticStateTransition({
    sessionContext: buildAnchorSession(),
    normalizedBefore: before,
    intentRecognition: buildRecognition({
      interactionMode: MIA_INTERACTION_MODES.COMMERCE,
      primaryIntent: "commerce",
    }),
    responsePath: "return_seguro",
    prices: [{ product_name: "iPhone 13" }],
    turnIndex: 2,
  });
  expect(!!applied.sessionContext.semanticStateProvenance, "J: provenance written");
  expectEqual(
    applied.sessionContext.semanticStateProvenance.turnIndex,
    2,
    "J: turn index preserved"
  );
  expect(
    applied.transitionAudit.type === TRANSITION_TYPES.COMMERCIAL_PIPELINE,
    "J: commercial pipeline transition"
  );
}

console.log("\nGrupo K — Expiration on farewell");
{
  const applied = applySemanticStateTransition({
    sessionContext: buildAnchorSession(),
    intentRecognition: buildRecognition({
      interactionMode: MIA_INTERACTION_MODES.SOCIAL,
      primaryIntent: "social_conversation",
    }),
    responsePath: "social_conversation_flow",
    continuationEligibility: {
      commercialContinuationEligible: false,
      anchorPreserved: true,
    },
    turnIndex: 3,
  });
  expect(!!applied.sessionContext.semanticStateProvenance?.lastTransition, "K: transition recorded");
}

console.log("\nGrupo L — Social continuity");
{
  const session = {
    lastConversationalIntent: "emotional_support",
    lastInteractionType: "emotional_support",
  };
  const state = normalizeSemanticSessionState(session);
  const result = resolveSemanticContinuationEligibility({
    message: "pois é",
    intentRecognition: buildRecognition({
      interactionMode: MIA_INTERACTION_MODES.SOCIAL,
      primaryIntent: "social_conversation",
    }),
    normalizedState: state,
  });
  expect(result.socialContinuityEligible, "L: social continuity eligible");
  expect(!result.commercialContinuationEligible, "L: no commercial execution");
}

console.log("\nGrupo M — Anti-overfitting");
{
  const session = buildAnchorSession();
  const state = normalizeSemanticSessionState(session);
  const variants = [
    "vlw, qual vale mais?",
    "to mo cansado, compara logo",
    "me diz qual é melhor",
  ];
  for (const message of variants) {
    const result = resolveSemanticContinuationEligibility({
      message,
      intentRecognition: buildRecognition({
        interactionMode: MIA_INTERACTION_MODES.EMOTIONAL_SUPPORT,
      }),
      normalizedState: state,
    });
    expect(result.commercialExecutionFromContinuation, `M: continuation for "${message.slice(0, 20)}..."`);
  }
}

console.log(`\n${"=".repeat(60)}`);
console.log(`Resultado: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log("Todos os testes passaram.\n");
  process.exit(0);
}
console.log("Alguns testes falharam.\n");
process.exit(1);
