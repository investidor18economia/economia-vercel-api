/**
 * PATCH 11A.8 — Runtime Precedence & Early-Return Enforcement
 */

import {
  authorizeRuntimeEarlyReturn,
  buildRuntimeDecisionEnvelope,
  evaluateCsoSubordination,
  finalizeGovernedRuntimeResponse,
  resolveResponsePathRegistry,
  suppressLegacyDecisionConflict,
  validateRuntimeResponseInvariants,
  PRECEDENCE_STAGES,
  RUNTIME_PRECEDENCE_VERSION,
} from "../lib/miaRuntimePrecedence.js";
import {
  buildIntentAuthorityFromRecognition,
  COMMERCIAL_PERMISSION,
} from "../lib/miaIntentAuthority.js";
import {
  MIA_INTERACTION_MODES,
  recognizeMiaIntent,
} from "../lib/miaIntentRecognitionLayer.js";

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

function buildAuthority(message, mode = MIA_INTERACTION_MODES.SOCIAL) {
  const recognition = recognizeMiaIntent({ message, sessionContext: {} });
  recognition.interactionMode = mode;
  return buildIntentAuthorityFromRecognition(recognition);
}

console.log("\nPATCH 11A.8 — Runtime Precedence & Early-Return Enforcement\n");

console.log("Grupo A — Precedence order (legacy vs authority)");
{
  const authority = buildAuthority("kkkk");
  const legacy = suppressLegacyDecisionConflict({
    legacyIntent: "search",
    intentAuthority: authority,
  });
  expect(legacy.suppressed, "A: legacy search suppressed under social deny");
  expect(!legacy.legacyDecisionUsed, "A: legacy does not decide");
}

console.log("\nGrupo B — Routing final authority flag");
{
  const envelope = buildRuntimeDecisionEnvelope({
    responsePath: "return_seguro",
    routingDecision: { mode: "commercial_search", finalAuthority: true },
    intentAuthority: buildAuthority("Quero um celular", MIA_INTERACTION_MODES.COMMERCE),
    commercialEntryGate: { commercialEntryAllowed: true, reasonCode: "allow" },
  });
  expect(envelope.routing.finalAuthority, "B: final routing authority present");
}

console.log("\nGrupo C — Early return without authority blocked");
{
  const envelope = buildRuntimeDecisionEnvelope({
    responsePath: "social_governed",
    intentAuthority: { authoritative: false, commercialPermission: "deny" },
  });
  const auth = authorizeRuntimeEarlyReturn({ responsePath: "social_governed", envelope });
  expect(!auth.allowed, "C: unauthorized without authority");
  expect(auth.missingRequirements.includes("intent_authority"), "C: missing authority flagged");
}

console.log("\nGrupo D — State transition requirement");
{
  const envelope = buildRuntimeDecisionEnvelope({
    responsePath: "greeting_flow",
    intentAuthority: buildAuthority("Boa noite"),
    semanticState: { transitionRequired: true, transitionApplied: false },
  });
  const auth = authorizeRuntimeEarlyReturn({ responsePath: "greeting_flow", envelope });
  expect(!auth.allowed, "D: blocked without transition");
}

console.log("\nGrupo E — Social provider-free");
{
  const authority = buildAuthority("Boa noite");
  const envelope = buildRuntimeDecisionEnvelope({
    responsePath: "greeting_flow",
    intentAuthority: authority,
    commercialEntryGate: { commercialEntryAllowed: false, reasonCode: "deny" },
    contracts: { behaviorPresent: true },
    finalization: { applied: true, validatorApplied: true },
    semanticState: { transitionRequired: true, transitionApplied: true, provenanceApplied: true },
  });
  const auth = authorizeRuntimeEarlyReturn({ responsePath: "greeting_flow", envelope });
  const inv = validateRuntimeResponseInvariants({
    responsePath: "greeting_flow",
    envelope,
    body: { reply: "Boa noite!", prices: [] },
    authorization: auth,
  });
  expect(auth.allowed, "E: social early return authorized");
  expect(inv.valid, "E: provider-free invariants valid");
}

console.log("\nGrupo F — Mixed finalizer requirement");
{
  const authority = buildAuthority(
    "Hoje foi ruim, mas preciso de um celular",
    MIA_INTERACTION_MODES.MIXED
  );
  const envelope = buildRuntimeDecisionEnvelope({
    responsePath: "governed_social_intent_flow",
    intentAuthority: authority,
    intentRecognition: { interactionMode: MIA_INTERACTION_MODES.MIXED },
    contracts: { mixedPresent: true, behaviorPresent: true },
    finalization: { applied: true },
    semanticState: { transitionApplied: true, provenanceApplied: true },
  });
  const auth = authorizeRuntimeEarlyReturn({
    responsePath: "governed_social_intent_flow",
    envelope,
  });
  expect(auth.allowed, "F: mixed path authorized with mixed contract");
}

console.log("\nGrupo G — Commercial path");
{
  const authority = buildAuthority("Quero um celular", MIA_INTERACTION_MODES.COMMERCE);
  authority.commercialPermission = COMMERCIAL_PERMISSION.ALLOW;
  const envelope = buildRuntimeDecisionEnvelope({
    responsePath: "return_seguro",
    intentAuthority: authority,
    commercialEntryGate: { commercialEntryAllowed: true, reasonCode: "allow" },
    contracts: { firstAnswerPresent: true },
    semanticState: { transitionApplied: true, provenanceApplied: true },
    finalization: { applied: true },
  });
  envelope._prices = [{ product_name: "Phone" }];
  const auth = authorizeRuntimeEarlyReturn({ responsePath: "return_seguro", envelope });
  expect(auth.allowed, "G: commercial path authorized");
}

console.log("\nGrupo H — Same-product provider-free");
{
  const authority = buildAuthority("Compara com o iPhone 13", MIA_INTERACTION_MODES.COMMERCE);
  const envelope = buildRuntimeDecisionEnvelope({
    responsePath: "comparison_same_product_clarification",
    intentAuthority: authority,
    contracts: { comparisonPresent: true },
    semanticState: { transitionApplied: true, provenanceApplied: true },
    finalization: { applied: true },
  });
  const result = finalizeGovernedRuntimeResponse({
    responsePath: "comparison_same_product_clarification",
    body: { reply: "Mesmo modelo.", prices: [] },
    intentAuthority: authority,
    contracts: { comparisonPresent: true },
    semanticState: { transitionApplied: true, provenanceApplied: true },
    finalization: { applied: true },
  });
  expect(result.authorization.allowed, "H: same-product authorized");
  expect(result.body.prices.length === 0, "H: zero providers");
}

console.log("\nGrupo I — Comparison incomplete");
{
  const registry = resolveResponsePathRegistry("comparison_anchored_incomplete");
  expect(registry.providersAllowed === false, "I: provider-free registry");
}

console.log("\nGrupo J — CSO subordination");
{
  const mixedCso = evaluateCsoSubordination({
    responsePath: "return_seguro",
    intentAuthority: buildAuthority("Quero celular", MIA_INTERACTION_MODES.COMMERCE),
    csoAttempt: true,
  });
  expect(mixedCso.suppressed, "J: CSO suppressed on commercial path");

  const socialCso = evaluateCsoSubordination({
    responsePath: "cso_verbalizer_early",
    intentAuthority: buildAuthority("pois é"),
    csoAttempt: true,
  });
  expect(socialCso.responseAuthorized, "J: CSO allowed on governed social path");
}

console.log("\nGrupo K — Cognitive shadow cannot override permission");
{
  const authority = buildAuthority("kkkk");
  expect(authority.commercialPermission === COMMERCIAL_PERMISSION.DENY, "K: social deny preserved");
}

console.log("\nGrupo L — Direct reply registry");
{
  const registry = resolveResponsePathRegistry("context_direct_reply_early");
  expect(registry.allowedEarlyReturn, "L: direct reply path registered");
}

console.log("\nGrupo M — Post-transition payload correction");
{
  const authority = buildAuthority("Valeu");
  const envelope = buildRuntimeDecisionEnvelope({
    responsePath: "acknowledgement_flow",
    intentAuthority: authority,
    contracts: { behaviorPresent: true },
    semanticState: { transitionApplied: true, provenanceApplied: true },
    finalization: { applied: true },
  });
  const auth = authorizeRuntimeEarlyReturn({ responsePath: "acknowledgement_flow", envelope });
  const inv = validateRuntimeResponseInvariants({
    responsePath: "acknowledgement_flow",
    envelope,
    body: { reply: "Valeu!", prices: [{ product_name: "X" }] },
    authorization: auth,
  });
  expect(inv.corrected, "M: provider stripped on social path");
  expect(inv.body.prices.length === 0, "M: prices cleared");
}

console.log("\nGrupo N — Payload invariants social");
{
  const result = finalizeGovernedRuntimeResponse({
    responsePath: "farewell_flow",
    body: { reply: "Boa noite", prices: [], session_context: { semanticStateProvenance: {} } },
    intentAuthority: buildAuthority("Boa noite"),
    contracts: { behaviorPresent: true },
    semanticState: { transitionApplied: true, provenanceApplied: true },
    finalization: { applied: true },
  });
  expect(result.trace.earlyReturnAuthorized, "N: farewell authorized");
}

console.log("\nGrupo O — Error paths untouched");
{
  expect(RUNTIME_PRECEDENCE_VERSION.startsWith("11A."), "O: version tag");
  expect(PRECEDENCE_STAGES.HTTP_RESPONSE === "http_response", "O: precedence stages exported");
}

console.log("\nGrupo P — Anti-overfitting conflicts");
{
  const cases = [
    ["legacy=search vs social deny", suppressLegacyDecisionConflict({ legacyIntent: "search", intentAuthority: buildAuthority("kkkk") }).suppressed],
    ["legacy=decision vs mixed", suppressLegacyDecisionConflict({ legacyIntent: "decision", intentAuthority: buildAuthority("cansado, qual vale mais?", MIA_INTERACTION_MODES.MIXED) }).suppressed],
    ["CSO on mixed blocked", evaluateCsoSubordination({ responsePath: "mixed", intentAuthority: buildAuthority("mixed", MIA_INTERACTION_MODES.MIXED), csoAttempt: true }).suppressed],
  ];
  for (const [label, ok] of cases) {
    expect(!!ok, `P: ${label}`);
  }
}

console.log(`\n${"=".repeat(60)}`);
console.log(`Resultado: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
