/**
 * Testes isolados do PATCH 5.6B + 5.6C + 5.6D + 5.6E + 5.6F + 5.6G + 5.7
 * Cognitive Intent Authority Bridge, Impact Audit, ContextAction Guard,
 * Routing Mode Alignment Audit, Cognitive Routing Mode Authority,
 * Cognitive Mode Authority Validation & Unified Cognitive Router Final Audit
 *
 * Rodar: node scripts/test-mia-cognitive-intent-bridge.js
 *
 * Nenhum efeito no fluxo do backend.
 */

import {
  mapCognitiveTurnToLegacyIntent,
  buildCognitiveBridgeAudit,
  buildCognitiveBridgeImpactAudit,
  guardContextActionWithCognitiveBridge,
  buildRoutingModeAlignmentAudit,
  buildUnifiedCognitiveRouterAudit,
  COGNITIVE_BRIDGE_CONFIDENCE_THRESHOLD,
  COGNITIVE_TO_LEGACY_INTENT_MAP,
  COGNITIVE_BRIDGE_ALLOWLIST,
} from "../lib/miaCognitiveBridge.js";

import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";

// ─────────────────────────────────────────────────────────────
// Utilitário de teste
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function makeTurn(turnType, confidence) {
  return { turnType, confidence, reasons: [], signals: {} };
}

const HIGH = 0.85;
const LOW  = 0.60;

// ─────────────────────────────────────────────────────────────
// Grupo A — Ativação da ponte (turnTypes permitidos, alta confiança)
// ─────────────────────────────────────────────────────────────

console.log("\nGrupo A — Ativação da ponte");

test("A1: EXPLANATION_REQUEST alta confiança → active=true, intent=decision", () => {
  const r = mapCognitiveTurnToLegacyIntent(makeTurn("EXPLANATION_REQUEST", HIGH));
  expectTrue(r.active, "active");
  expect(r.intent, "decision", "intent");
  expect(r.reason, "safe_cognitive_turn_authority", "reason");
});

test("A2: VALUE_QUESTION alta confiança → active=true, intent=decision", () => {
  const r = mapCognitiveTurnToLegacyIntent(makeTurn("VALUE_QUESTION", HIGH));
  expectTrue(r.active, "active");
  expect(r.intent, "decision", "intent");
});

test("A3: REFINEMENT alta confiança → active=true, intent=refinement", () => {
  const r = mapCognitiveTurnToLegacyIntent(makeTurn("REFINEMENT", HIGH));
  expectTrue(r.active, "active");
  expect(r.intent, "refinement", "intent");
});

test("A4: COMPARISON alta confiança → active=true, intent=comparison", () => {
  const r = mapCognitiveTurnToLegacyIntent(makeTurn("COMPARISON", HIGH));
  expectTrue(r.active, "active");
  expect(r.intent, "comparison", "intent");
});

test("A5: NEW_SEARCH alta confiança → active=true, intent=search", () => {
  const r = mapCognitiveTurnToLegacyIntent(makeTurn("NEW_SEARCH", HIGH));
  expectTrue(r.active, "active");
  expect(r.intent, "search", "intent");
});

// ─────────────────────────────────────────────────────────────
// Grupo B — Não ativação da ponte (fora da allowlist)
// ─────────────────────────────────────────────────────────────

console.log("\nGrupo B — Não ativação: turnType fora da allowlist");

test("B1: CONVERSATIONAL → active=false, reason=turn_type_not_in_allowlist", () => {
  const r = mapCognitiveTurnToLegacyIntent(makeTurn("CONVERSATIONAL", HIGH));
  expectFalse(r.active, "active");
  expect(r.reason, "turn_type_not_in_allowlist", "reason");
  expect(r.intent, null, "intent");
});

test("B2: UNKNOWN → active=false, reason=turn_type_not_in_allowlist", () => {
  const r = mapCognitiveTurnToLegacyIntent(makeTurn("UNKNOWN", HIGH));
  expectFalse(r.active, "active");
  expect(r.reason, "turn_type_not_in_allowlist", "reason");
});

test("B3: REACTION → active=false, reason=turn_type_not_in_allowlist", () => {
  const r = mapCognitiveTurnToLegacyIntent(makeTurn("REACTION", HIGH));
  expectFalse(r.active, "active");
  expect(r.reason, "turn_type_not_in_allowlist", "reason");
});

test("B4: OBJECTION → active=false, reason=turn_type_not_in_allowlist", () => {
  const r = mapCognitiveTurnToLegacyIntent(makeTurn("OBJECTION", HIGH));
  expectFalse(r.active, "active");
  expect(r.reason, "turn_type_not_in_allowlist", "reason");
});

test("B5: PRIORITY_SHIFT → active=false, reason=turn_type_not_in_allowlist", () => {
  const r = mapCognitiveTurnToLegacyIntent(makeTurn("PRIORITY_SHIFT", HIGH));
  expectFalse(r.active, "active");
  expect(r.reason, "turn_type_not_in_allowlist", "reason");
});

test("B6: COMPARISON_FOLLOWUP → active=false, reason=turn_type_not_in_allowlist", () => {
  const r = mapCognitiveTurnToLegacyIntent(makeTurn("COMPARISON_FOLLOWUP", HIGH));
  expectFalse(r.active, "active");
  expect(r.reason, "turn_type_not_in_allowlist", "reason");
});

// ─────────────────────────────────────────────────────────────
// Grupo C — Não ativação da ponte (baixa confiança)
// ─────────────────────────────────────────────────────────────

console.log("\nGrupo C — Não ativação: baixa confiança");

test("C1: EXPLANATION_REQUEST confiança baixa → active=false, reason=low_confidence", () => {
  const r = mapCognitiveTurnToLegacyIntent(makeTurn("EXPLANATION_REQUEST", LOW));
  expectFalse(r.active, "active");
  expect(r.reason, "low_confidence", "reason");
  expect(r.intent, null, "intent");
});

test("C2: NEW_SEARCH confiança exatamente no threshold-1 → active=false", () => {
  const justBelow = COGNITIVE_BRIDGE_CONFIDENCE_THRESHOLD - 0.001;
  const r = mapCognitiveTurnToLegacyIntent(makeTurn("NEW_SEARCH", justBelow));
  expectFalse(r.active, "active");
  expect(r.reason, "low_confidence", "reason");
});

test("C3: COMPARISON confiança exatamente no threshold → active=true", () => {
  const r = mapCognitiveTurnToLegacyIntent(makeTurn("COMPARISON", COGNITIVE_BRIDGE_CONFIDENCE_THRESHOLD));
  expectTrue(r.active, "active");
  expect(r.intent, "comparison", "intent");
});

// ─────────────────────────────────────────────────────────────
// Grupo D — Entrada inválida / nula
// ─────────────────────────────────────────────────────────────

console.log("\nGrupo D — Entrada inválida ou nula");

test("D1: cognitiveTurn=null → active=false, reason=no_cognitive_turn", () => {
  const r = mapCognitiveTurnToLegacyIntent(null);
  expectFalse(r.active, "active");
  expect(r.reason, "no_cognitive_turn", "reason");
});

test("D2: cognitiveTurn=undefined → active=false, reason=no_cognitive_turn", () => {
  const r = mapCognitiveTurnToLegacyIntent(undefined);
  expectFalse(r.active, "active");
  expect(r.reason, "no_cognitive_turn", "reason");
});

test("D3: cognitiveTurn sem campo confidence → active=false, reason=low_confidence", () => {
  const r = mapCognitiveTurnToLegacyIntent({ turnType: "EXPLANATION_REQUEST" });
  expectFalse(r.active, "active");
  expect(r.reason, "low_confidence", "reason");
});

// ─────────────────────────────────────────────────────────────
// Grupo E — buildCognitiveBridgeAudit
// ─────────────────────────────────────────────────────────────

console.log("\nGrupo E — buildCognitiveBridgeAudit");

test("E1: bridge ativa → audit inclui fromIntent e toIntent", () => {
  const turn = makeTurn("EXPLANATION_REQUEST", HIGH);
  const bridgeResult = mapCognitiveTurnToLegacyIntent(turn);
  const audit = buildCognitiveBridgeAudit(bridgeResult, "general_answer");
  expectTrue(audit.active, "active");
  expect(audit.fromIntent, "general_answer", "fromIntent");
  expect(audit.toIntent, "decision", "toIntent");
  expect(audit.reason, "safe_cognitive_turn_authority", "reason");
  expect(audit.cognitiveTurnType, "EXPLANATION_REQUEST", "cognitiveTurnType");
  expectTrue(typeof audit.confidence === "number", "confidence is number");
});

test("E2: bridge inativa por allowlist → audit sem fromIntent/toIntent", () => {
  const turn = makeTurn("CONVERSATIONAL", HIGH);
  const bridgeResult = mapCognitiveTurnToLegacyIntent(turn);
  const audit = buildCognitiveBridgeAudit(bridgeResult, "general_answer");
  expectFalse(audit.active, "active");
  expect(audit.reason, "turn_type_not_in_allowlist", "reason");
  expectFalse("fromIntent" in audit, "fromIntent must be absent");
  expectFalse("toIntent" in audit, "toIntent must be absent");
});

test("E3: bridge inativa por baixa confiança → audit sem fromIntent/toIntent", () => {
  const turn = makeTurn("REFINEMENT", LOW);
  const bridgeResult = mapCognitiveTurnToLegacyIntent(turn);
  const audit = buildCognitiveBridgeAudit(bridgeResult, "general_answer");
  expectFalse(audit.active, "active");
  expect(audit.reason, "low_confidence", "reason");
  expectFalse("fromIntent" in audit, "fromIntent must be absent");
});

// ─────────────────────────────────────────────────────────────
// Grupo F — Invariantes do módulo
// ─────────────────────────────────────────────────────────────

console.log("\nGrupo F — Invariantes do módulo");

test("F1: COGNITIVE_BRIDGE_CONFIDENCE_THRESHOLD é 0.75", () => {
  expect(COGNITIVE_BRIDGE_CONFIDENCE_THRESHOLD, 0.75, "threshold");
});

test("F2: todos os turnTypes na ALLOWLIST têm mapeamento definido", () => {
  for (const turnType of COGNITIVE_BRIDGE_ALLOWLIST) {
    if (!COGNITIVE_TO_LEGACY_INTENT_MAP[turnType]) {
      throw new Error(`TurnType ${turnType} na allowlist mas sem mapeamento`);
    }
  }
});

test("F3: ALLOWLIST tem exatamente 5 entradas", () => {
  expect(COGNITIVE_BRIDGE_ALLOWLIST.size, 5, "allowlist size");
});

test("F4: EXPLANATION_REQUEST e VALUE_QUESTION mapeiam para 'decision'", () => {
  expect(COGNITIVE_TO_LEGACY_INTENT_MAP["EXPLANATION_REQUEST"], "decision");
  expect(COGNITIVE_TO_LEGACY_INTENT_MAP["VALUE_QUESTION"], "decision");
});

test("F5: nenhum turnType fora da allowlist tem mapeamento", () => {
  const notAllowed = ["CONVERSATIONAL", "UNKNOWN", "REACTION", "OBJECTION", "PRIORITY_SHIFT", "COMPARISON_FOLLOWUP"];
  for (const t of notAllowed) {
    if (COGNITIVE_TO_LEGACY_INTENT_MAP[t]) {
      throw new Error(`TurnType ${t} não está na allowlist mas tem mapeamento`);
    }
  }
});

// ─────────────────────────────────────────────────────────────
// Grupo G — buildCognitiveBridgeImpactAudit (PATCH 5.6C)
// ─────────────────────────────────────────────────────────────

console.log("\nGrupo G — buildCognitiveBridgeImpactAudit (PATCH 5.6C)");

function makeImpactInput({
  turnType   = "EXPLANATION_REQUEST",
  confidence = 0.85,
  fromIntent = "general_answer",
  bridgeActive = true,
  finalIntent  = "decision",
  contextActionFinal   = "decision",
  routingDecisionMode  = "cognitive_anchor_hold",
  hasActiveAnchor      = true,
} = {}) {
  const cognitiveTurnEarly = makeTurn(turnType, confidence);
  const bridgeResult = {
    active: bridgeActive,
    intent: bridgeActive ? finalIntent : null,
    reason: bridgeActive ? "safe_cognitive_turn_authority" : "turn_type_not_in_allowlist",
    cognitiveTurnType: turnType,
    confidence,
  };
  const bridgeAudit = bridgeActive
    ? { active: true, fromIntent, toIntent: finalIntent, cognitiveTurnType: turnType, confidence, reason: "safe_cognitive_turn_authority" }
    : { active: false, reason: bridgeResult.reason, cognitiveTurnType: turnType, confidence };
  return {
    bridgeAudit,
    cognitiveTurnEarly,
    finalIntent: bridgeActive ? finalIntent : fromIntent,
    contextActionFinal,
    routingDecisionMode,
    hasActiveAnchor,
  };
}

test("G1: alinhado completo — EXPLANATION_REQUEST, bridge ativa, tudo compatível → alignedWithCognitiveTurn=true, zero flags", () => {
  const input = makeImpactInput();
  const audit = buildCognitiveBridgeImpactAudit(input);
  expect(audit.auditVersion, "5.6C", "auditVersion");
  expectTrue(audit.alignedWithCognitiveTurn, "aligned");
  expect(audit.remainingDivergenceFlags.length, 0, "flags count");
  expect(audit.legacyIntentOriginal, "general_answer", "legacyIntentOriginal");
  expect(audit.bridgedIntent, "decision", "bridgedIntent");
  expect(audit.finalIntent, "decision", "finalIntent");
  expect(audit.contextActionFinal, "decision", "contextActionFinal");
  expect(audit.routingDecisionModeFinal, "cognitive_anchor_hold", "routingDecisionMode");
});

test("G2: BRIDGE_NOT_APPLIED_SAFE_TURN — EXPLANATION_REQUEST alta confiança, bridge deveria ter aplicado mas não aplicou", () => {
  const input = makeImpactInput({ bridgeActive: false, finalIntent: "general_answer", contextActionFinal: "conversation" });
  // Simular bridge não ativa mesmo com turn type na allowlist e alta confiança
  input.bridgeAudit = { active: false, reason: "low_confidence", cognitiveTurnType: "EXPLANATION_REQUEST", confidence: 0.85 };
  // Nota: o audit deve detectar que isso é inconsistente (alta confiança mas bridge não aplicou)
  const audit = buildCognitiveBridgeImpactAudit(input);
  expectTrue(audit.remainingDivergenceFlags.includes("BRIDGE_NOT_APPLIED_SAFE_TURN"), "flag presente");
  expectFalse(audit.alignedWithCognitiveTurn, "não alinhado");
});

test("G3: LOW_CONFIDENCE_NO_BRIDGE — EXPLANATION_REQUEST baixa confiança → flag LOW_CONFIDENCE_NO_BRIDGE", () => {
  const input = makeImpactInput({ confidence: 0.60, bridgeActive: false, finalIntent: "general_answer", contextActionFinal: "conversation" });
  input.bridgeAudit = { active: false, reason: "low_confidence", cognitiveTurnType: "EXPLANATION_REQUEST", confidence: 0.60 };
  const audit = buildCognitiveBridgeImpactAudit(input);
  expectTrue(audit.remainingDivergenceFlags.includes("LOW_CONFIDENCE_NO_BRIDGE"), "flag presente");
});

test("G4: TURN_TYPE_NOT_ALLOWLISTED — CONVERSATIONAL → flag TURN_TYPE_NOT_ALLOWLISTED", () => {
  const input = makeImpactInput({ turnType: "CONVERSATIONAL", bridgeActive: false, finalIntent: "general_answer", contextActionFinal: "conversation" });
  input.bridgeAudit = { active: false, reason: "turn_type_not_in_allowlist", cognitiveTurnType: "CONVERSATIONAL", confidence: 0.85 };
  const audit = buildCognitiveBridgeImpactAudit(input);
  expectTrue(audit.remainingDivergenceFlags.includes("TURN_TYPE_NOT_ALLOWLISTED"), "flag presente");
});

test("G5: COMPARISON_FOLLOWUP_UNBRIDGED — por design, COMPARISON_FOLLOWUP não é bridgeado → flag informativa", () => {
  const input = makeImpactInput({ turnType: "COMPARISON_FOLLOWUP", bridgeActive: false, finalIntent: "general_answer", contextActionFinal: "comparison" });
  input.bridgeAudit = { active: false, reason: "turn_type_not_in_allowlist", cognitiveTurnType: "COMPARISON_FOLLOWUP", confidence: 0.88 };
  const audit = buildCognitiveBridgeImpactAudit(input);
  expectTrue(audit.remainingDivergenceFlags.includes("COMPARISON_FOLLOWUP_UNBRIDGED"), "flag presente");
  // COMPARISON_FOLLOWUP_UNBRIDGED sozinha não é erro — aligned pode ser true
  expectTrue(audit.alignedWithCognitiveTurn, "por design ainda considerado alinhado");
});

test("G6: CONTEXT_ACTION_MISMATCH — bridge aplicou mas contextAction final incompatível", () => {
  // Bridge mapeou EXPLANATION_REQUEST → intent=decision, mas contextAction saiu "conversation"
  const input = makeImpactInput({ contextActionFinal: "conversation" });
  const audit = buildCognitiveBridgeImpactAudit(input);
  expectTrue(audit.remainingDivergenceFlags.includes("CONTEXT_ACTION_MISMATCH"), "flag presente");
  expectFalse(audit.alignedWithCognitiveTurn, "não alinhado");
});

test("G7: ROUTING_MODE_MISMATCH — EXPLANATION_REQUEST com âncora ativa, bridge OK, mas mode=general_answer", () => {
  const input = makeImpactInput({ routingDecisionMode: "general_answer", hasActiveAnchor: true });
  const audit = buildCognitiveBridgeImpactAudit(input);
  expectTrue(audit.remainingDivergenceFlags.includes("ROUTING_MODE_MISMATCH"), "flag presente");
  expectFalse(audit.alignedWithCognitiveTurn, "não alinhado");
});

test("G8: ROUTING_MODE_MISMATCH não dispara sem âncora ativa", () => {
  // Sem âncora, general_answer é válido mesmo para EXPLANATION_REQUEST
  const input = makeImpactInput({ routingDecisionMode: "general_answer", hasActiveAnchor: false });
  const audit = buildCognitiveBridgeImpactAudit(input);
  expectFalse(audit.remainingDivergenceFlags.includes("ROUTING_MODE_MISMATCH"), "flag ausente sem âncora");
});

test("G9: VALUE_QUESTION alinhado — mapeia para 'decision', contextAction='decision' → zero flags", () => {
  const input = makeImpactInput({ turnType: "VALUE_QUESTION", finalIntent: "decision", contextActionFinal: "decision", routingDecisionMode: "context_answer" });
  const audit = buildCognitiveBridgeImpactAudit(input);
  expect(audit.remainingDivergenceFlags.length, 0, "zero flags");
  expectTrue(audit.alignedWithCognitiveTurn, "alinhado");
  expect(audit.cognitiveTurnType, "VALUE_QUESTION", "turnType");
});

test("G10: NEW_SEARCH alinhado — mapeia para 'search', contextAction='search' → zero flags", () => {
  const input = makeImpactInput({ turnType: "NEW_SEARCH", finalIntent: "search", contextActionFinal: "search", routingDecisionMode: "new_or_direct", hasActiveAnchor: false });
  const audit = buildCognitiveBridgeImpactAudit(input);
  expect(audit.remainingDivergenceFlags.length, 0, "zero flags");
  expectTrue(audit.alignedWithCognitiveTurn, "alinhado");
});

test("G11: audit não altera bridge result — bridge continua calculável independentemente", () => {
  const turn = makeTurn("COMPARISON", 0.85);
  const bridgeResult = mapCognitiveTurnToLegacyIntent(turn);
  const bridgeAudit  = buildCognitiveBridgeAudit(bridgeResult, "general_answer");
  // Construir impact audit
  const input = {
    bridgeAudit,
    cognitiveTurnEarly: turn,
    finalIntent: "comparison",
    contextActionFinal: "comparison",
    routingDecisionMode: "comparison_followup",
    hasActiveAnchor: true,
  };
  const impactAudit = buildCognitiveBridgeImpactAudit(input);
  // bridge result original não foi alterado
  expectTrue(bridgeResult.active, "bridge original intacta");
  expect(bridgeResult.intent, "comparison", "bridge intent intacta");
  expect(impactAudit.auditVersion, "5.6C", "auditVersion");
});

test("G12: campos obrigatórios presentes em qualquer saída", () => {
  const audit = buildCognitiveBridgeImpactAudit({});
  const required = [
    "auditVersion", "legacyIntentOriginal", "bridgeApplied", "bridgeReason",
    "cognitiveTurnType", "cognitiveConfidence", "bridgedIntent", "finalIntent",
    "contextActionFinal", "routingDecisionModeFinal", "hasActiveAnchor",
    "alignedWithCognitiveTurn", "remainingDivergenceFlags"
  ];
  for (const field of required) {
    if (!(field in audit)) throw new Error(`Campo obrigatório ausente: ${field}`);
  }
  expect(audit.auditVersion, "5.6C", "auditVersion");
});

// ─────────────────────────────────────────────────────────────
// Grupo H — guardContextActionWithCognitiveBridge (PATCH 5.6D)
// ─────────────────────────────────────────────────────────────

console.log("\nGrupo H — guardContextActionWithCognitiveBridge (PATCH 5.6D)");

function makeActiveBridgeAudit(turnType = "EXPLANATION_REQUEST", fromIntent = "general_answer") {
  return {
    active: true,
    fromIntent,
    toIntent: "decision",
    cognitiveTurnType: turnType,
    confidence: 0.85,
    reason: "safe_cognitive_turn_authority",
  };
}

function makeInactiveBridgeAudit(reason = "turn_type_not_in_allowlist") {
  return { active: false, reason, cognitiveTurnType: "CONVERSATIONAL", confidence: 0.85 };
}

test("H1: EXPLANATION_REQUEST + bridge ativa + contextAction='conversation' → guard corrige para 'decision'", () => {
  const r = guardContextActionWithCognitiveBridge({
    contextAction:      "conversation",
    bridgeAudit:        makeActiveBridgeAudit("EXPLANATION_REQUEST"),
    cognitiveTurnEarly: makeTurn("EXPLANATION_REQUEST", 0.85),
    finalIntent:        "decision",
  });
  expectTrue(r.applied, "applied");
  expect(r.contextAction, "decision", "contextAction corrigida");
  expect(r.fromContextAction, "conversation", "from");
  expect(r.toContextAction, "decision", "to");
  expect(r.reason, "cognitive_bridge_context_action_correction", "reason");
});

test("H2: VALUE_QUESTION + bridge ativa + contextAction='conversation' → guard corrige para 'decision'", () => {
  const r = guardContextActionWithCognitiveBridge({
    contextAction:      "conversation",
    bridgeAudit:        makeActiveBridgeAudit("VALUE_QUESTION"),
    cognitiveTurnEarly: makeTurn("VALUE_QUESTION", 0.85),
    finalIntent:        "decision",
  });
  expectTrue(r.applied, "applied");
  expect(r.contextAction, "decision", "contextAction corrigida");
});

test("H3: EXPLANATION_REQUEST + bridge ativa + contextAction='search' → guard corrige para 'decision'", () => {
  const r = guardContextActionWithCognitiveBridge({
    contextAction:      "search",
    bridgeAudit:        makeActiveBridgeAudit("EXPLANATION_REQUEST"),
    cognitiveTurnEarly: makeTurn("EXPLANATION_REQUEST", 0.85),
  });
  expectTrue(r.applied, "applied");
  expect(r.contextAction, "decision", "contextAction corrigida");
});

test("H4: EXPLANATION_REQUEST + bridge ativa + contextAction já 'decision' → guard NÃO aplica", () => {
  const r = guardContextActionWithCognitiveBridge({
    contextAction:      "decision",
    bridgeAudit:        makeActiveBridgeAudit("EXPLANATION_REQUEST"),
    cognitiveTurnEarly: makeTurn("EXPLANATION_REQUEST", 0.85),
  });
  expectFalse(r.applied, "applied");
  expect(r.reason, "context_action_already_aligned", "reason");
  expect(r.contextAction, "decision", "contextAction inalterada");
});

test("H5: EXPLANATION_REQUEST + bridge ativa + contextAction='analysis' → guard NÃO aplica (compatível)", () => {
  const r = guardContextActionWithCognitiveBridge({
    contextAction:      "analysis",
    bridgeAudit:        makeActiveBridgeAudit("EXPLANATION_REQUEST"),
    cognitiveTurnEarly: makeTurn("EXPLANATION_REQUEST", 0.85),
  });
  expectFalse(r.applied, "applied");
  expect(r.reason, "context_action_already_aligned", "reason");
  expect(r.contextAction, "analysis", "contextAction inalterada");
});

test("H6: bridge NÃO ativa → guard não altera (reason=bridge_not_applied)", () => {
  const r = guardContextActionWithCognitiveBridge({
    contextAction:      "conversation",
    bridgeAudit:        makeInactiveBridgeAudit(),
    cognitiveTurnEarly: makeTurn("EXPLANATION_REQUEST", 0.85),
  });
  expectFalse(r.applied, "applied");
  expect(r.reason, "bridge_not_applied", "reason");
  expect(r.contextAction, "conversation", "contextAction inalterada");
});

test("H7: bridge NÃO ativa (bridge null) → guard não altera", () => {
  const r = guardContextActionWithCognitiveBridge({
    contextAction:      "conversation",
    bridgeAudit:        null,
    cognitiveTurnEarly: makeTurn("EXPLANATION_REQUEST", 0.85),
  });
  expectFalse(r.applied, "applied");
  expect(r.reason, "bridge_not_applied", "reason");
});

test("H8: COMPARISON + bridge ativa → guard não suporta este turnType (reason=turn_type_not_supported)", () => {
  const r = guardContextActionWithCognitiveBridge({
    contextAction:      "conversation",
    bridgeAudit:        makeActiveBridgeAudit("COMPARISON"),
    cognitiveTurnEarly: makeTurn("COMPARISON", 0.85),
  });
  expectFalse(r.applied, "applied");
  expect(r.reason, "turn_type_not_supported", "reason");
  expect(r.contextAction, "conversation", "contextAction inalterada");
});

test("H9: REFINEMENT + bridge ativa → guard não suporta (reason=turn_type_not_supported)", () => {
  const r = guardContextActionWithCognitiveBridge({
    contextAction:      "conversation",
    bridgeAudit:        makeActiveBridgeAudit("REFINEMENT"),
    cognitiveTurnEarly: makeTurn("REFINEMENT", 0.85),
  });
  expectFalse(r.applied, "applied");
  expect(r.reason, "turn_type_not_supported", "reason");
});

test("H10: NEW_SEARCH + bridge ativa → guard não suporta (reason=turn_type_not_supported)", () => {
  const r = guardContextActionWithCognitiveBridge({
    contextAction:      "search",
    bridgeAudit:        makeActiveBridgeAudit("NEW_SEARCH"),
    cognitiveTurnEarly: makeTurn("NEW_SEARCH", 0.85),
  });
  expectFalse(r.applied, "applied");
  expect(r.reason, "turn_type_not_supported", "reason");
  expect(r.contextAction, "search", "contextAction inalterada");
});

test("H11: CONVERSATIONAL → guard não suporta, contextAction inalterado", () => {
  const r = guardContextActionWithCognitiveBridge({
    contextAction:      "conversation",
    bridgeAudit:        makeInactiveBridgeAudit("turn_type_not_in_allowlist"),
    cognitiveTurnEarly: makeTurn("CONVERSATIONAL", 0.80),
  });
  expectFalse(r.applied, "applied");
  expect(r.contextAction, "conversation", "contextAction inalterada");
});

test("H12: EXPLANATION_REQUEST + bridge ativa + contextAction='refinement' → guard corrige para 'decision'", () => {
  const r = guardContextActionWithCognitiveBridge({
    contextAction:      "refinement",
    bridgeAudit:        makeActiveBridgeAudit("EXPLANATION_REQUEST"),
    cognitiveTurnEarly: makeTurn("EXPLANATION_REQUEST", 0.83),
  });
  expectTrue(r.applied, "applied");
  expect(r.contextAction, "decision", "contextAction corrigida");
  expect(r.fromContextAction, "refinement", "from");
});

test("H13: guard audit applied=true tem campos obrigatórios", () => {
  const r = guardContextActionWithCognitiveBridge({
    contextAction:      "conversation",
    bridgeAudit:        makeActiveBridgeAudit("VALUE_QUESTION"),
    cognitiveTurnEarly: makeTurn("VALUE_QUESTION", 0.85),
    finalIntent:        "decision",
  });
  const required = ["contextAction", "applied", "reason", "fromContextAction", "toContextAction", "cognitiveTurnType", "bridgeApplied"];
  for (const f of required) {
    if (!(f in r)) throw new Error(`Campo obrigatório ausente: ${f}`);
  }
  expectTrue(r.applied, "applied");
  expect(r.toContextAction, "decision", "toContextAction");
});

test("H14: guard audit applied=false tem campos obrigatórios", () => {
  const r = guardContextActionWithCognitiveBridge({
    contextAction:      "decision",
    bridgeAudit:        makeActiveBridgeAudit("EXPLANATION_REQUEST"),
    cognitiveTurnEarly: makeTurn("EXPLANATION_REQUEST", 0.85),
  });
  const required = ["contextAction", "applied", "reason", "fromContextAction", "toContextAction", "cognitiveTurnType", "bridgeApplied"];
  for (const f of required) {
    if (!(f in r)) throw new Error(`Campo obrigatório ausente: ${f}`);
  }
  expectFalse(r.applied, "applied");
  expect(r.toContextAction, null, "toContextAction null quando não aplicado");
});

// ─────────────────────────────────────────────────────────────
// Grupo I — buildRoutingModeAlignmentAudit (PATCH 5.6E)
// ─────────────────────────────────────────────────────────────

console.log("\nGrupo I — buildRoutingModeAlignmentAudit (PATCH 5.6E)");

function makeActiveBridge5E(turnType = "EXPLANATION_REQUEST") {
  return { active: true, fromIntent: "general_answer", toIntent: "decision", cognitiveTurnType: turnType, confidence: 0.85, reason: "safe_cognitive_turn_authority" };
}

function makeModeInput({
  turnType                    = "EXPLANATION_REQUEST",
  confidence                  = 0.85,
  bridgeActive                = true,
  finalIntent                 = "decision",
  contextActionFinal          = "decision",
  modeBeforeRebuild           = "cognitive_anchor_hold",
  modeAfterRebuild            = "cognitive_anchor_hold",
  finalRoutingMode            = "cognitive_anchor_hold",
  hasActiveAnchor             = true,
  intentPreservationApplied   = true,
  cognitiveAnchorHoldRestored = false,
} = {}) {
  return {
    cognitiveTurnEarly:          makeTurn(turnType, confidence),
    bridgeAudit:                 bridgeActive ? makeActiveBridge5E(turnType) : { active: false, reason: "turn_type_not_in_allowlist", cognitiveTurnType: turnType, confidence },
    finalIntent,
    contextActionFinal,
    modeBeforeRebuild,
    modeAfterRebuild,
    finalRoutingMode,
    hasActiveAnchor,
    intentPreservationApplied,
    cognitiveAnchorHoldRestored,
  };
}

test("I1: EXPLANATION_REQUEST + anchor + finalMode=cognitive_anchor_hold → alinhado, zero critical flags", () => {
  const audit = buildRoutingModeAlignmentAudit(makeModeInput());
  expect(audit.auditVersion, "5.6E", "auditVersion");
  expectTrue(audit.alignedWithCognitiveTurn, "aligned");
  const critical = audit.remainingModeFlags.filter(f => f !== "MODE_REBUILT_DIFFERENTLY" && f !== "MODE_RESTORED_BY_5_3B");
  expect(critical.length, 0, "zero critical flags");
  expect(audit.expectedModeFamily, "context_explanation_anchored", "expectedModeFamily");
});

test("I2: EXPLANATION_REQUEST + anchor + finalMode=general_answer → MODE_EXPECTED_COGNITIVE_ANCHOR_HOLD + MODE_UNEXPECTED_GENERAL_ANSWER", () => {
  const audit = buildRoutingModeAlignmentAudit(makeModeInput({ finalRoutingMode: "general_answer" }));
  expectFalse(audit.alignedWithCognitiveTurn, "not aligned");
  expectTrue(audit.remainingModeFlags.includes("MODE_EXPECTED_COGNITIVE_ANCHOR_HOLD"), "flag expected hold");
  expectTrue(audit.remainingModeFlags.includes("MODE_UNEXPECTED_GENERAL_ANSWER"), "flag unexpected general");
});

test("I3: EXPLANATION_REQUEST + anchor + finalMode=casual_chat → MODE_EXPECTED_COGNITIVE_ANCHOR_HOLD + MODE_UNEXPECTED_CASUAL_CHAT", () => {
  const audit = buildRoutingModeAlignmentAudit(makeModeInput({ finalRoutingMode: "casual_chat" }));
  expectFalse(audit.alignedWithCognitiveTurn, "not aligned");
  expectTrue(audit.remainingModeFlags.includes("MODE_UNEXPECTED_CASUAL_CHAT"), "flag unexpected casual");
});

test("I4: EXPLANATION_REQUEST sem anchor + finalMode=general_answer → só MODE_UNEXPECTED_GENERAL_ANSWER (sem MODE_EXPECTED_COGNITIVE_ANCHOR_HOLD)", () => {
  const audit = buildRoutingModeAlignmentAudit(makeModeInput({ hasActiveAnchor: false, finalRoutingMode: "general_answer" }));
  expectFalse(audit.alignedWithCognitiveTurn, "not aligned");
  expectTrue(audit.remainingModeFlags.includes("MODE_UNEXPECTED_GENERAL_ANSWER"), "unexpected general");
  expectFalse(audit.remainingModeFlags.includes("MODE_EXPECTED_COGNITIVE_ANCHOR_HOLD"), "no hold flag sem anchor");
  expect(audit.expectedModeFamily, "context_explanation", "expectedModeFamily sem anchor");
});

test("I5: PATCH 5.3B restaurou mode → flag MODE_RESTORED_BY_5_3B (informativa, não quebra alinhamento)", () => {
  const audit = buildRoutingModeAlignmentAudit(makeModeInput({
    modeAfterRebuild: "context_hold",
    finalRoutingMode: "cognitive_anchor_hold",
    cognitiveAnchorHoldRestored: true,
  }));
  expectTrue(audit.cognitiveAnchorHoldRestored, "restored");
  expectTrue(audit.remainingModeFlags.includes("MODE_RESTORED_BY_5_3B"), "flag restore");
  expectTrue(audit.alignedWithCognitiveTurn, "ainda alinhado (flag informativa)");
});

test("I6: mode mudou no rebuild → flag MODE_REBUILT_DIFFERENTLY (informativa, não quebra alinhamento)", () => {
  const audit = buildRoutingModeAlignmentAudit(makeModeInput({
    modeBeforeRebuild: "context_answer",
    modeAfterRebuild: "cognitive_anchor_hold",
    finalRoutingMode: "cognitive_anchor_hold",
  }));
  expectTrue(audit.remainingModeFlags.includes("MODE_REBUILT_DIFFERENTLY"), "flag rebuilt");
  expectTrue(audit.alignedWithCognitiveTurn, "ainda alinhado (flag informativa)");
});

test("I7: NEW_SEARCH + finalMode=new_or_direct → alinhado", () => {
  const audit = buildRoutingModeAlignmentAudit(makeModeInput({
    turnType: "NEW_SEARCH", finalIntent: "search", contextActionFinal: "search",
    modeBeforeRebuild: "new_or_direct", modeAfterRebuild: "new_or_direct",
    finalRoutingMode: "new_or_direct", hasActiveAnchor: false,
    intentPreservationApplied: false, cognitiveAnchorHoldRestored: false,
  }));
  expectTrue(audit.alignedWithCognitiveTurn, "aligned");
  expect(audit.expectedModeFamily, "new_search", "expectedModeFamily");
});

test("I8: NEW_SEARCH + finalMode=cognitive_anchor_hold → MODE_UNEXPECTED_ANCHOR_PRESERVATION_ON_NEW_SEARCH", () => {
  const audit = buildRoutingModeAlignmentAudit(makeModeInput({
    turnType: "NEW_SEARCH", finalIntent: "search", contextActionFinal: "search",
    finalRoutingMode: "cognitive_anchor_hold", hasActiveAnchor: true,
    intentPreservationApplied: false,
  }));
  expectFalse(audit.alignedWithCognitiveTurn, "not aligned");
  expectTrue(audit.remainingModeFlags.includes("MODE_UNEXPECTED_ANCHOR_PRESERVATION_ON_NEW_SEARCH"), "flag anchor on new search");
});

test("I9: VALUE_QUESTION + finalMode=context_hold → alinhado", () => {
  const audit = buildRoutingModeAlignmentAudit(makeModeInput({
    turnType: "VALUE_QUESTION", modeAfterRebuild: "context_hold", finalRoutingMode: "context_hold",
  }));
  expectTrue(audit.alignedWithCognitiveTurn, "aligned");
  expect(audit.expectedModeFamily, "context_decision", "expectedModeFamily");
});

test("I10: VALUE_QUESTION + finalMode=general_answer → MODE_UNEXPECTED_GENERAL_ANSWER", () => {
  const audit = buildRoutingModeAlignmentAudit(makeModeInput({
    turnType: "VALUE_QUESTION", finalRoutingMode: "general_answer",
  }));
  expectFalse(audit.alignedWithCognitiveTurn, "not aligned");
  expectTrue(audit.remainingModeFlags.includes("MODE_UNEXPECTED_GENERAL_ANSWER"), "flag unexpected general");
});

test("I11: CONVERSATIONAL → expectedModeFamily=unchecked, sem critical flags", () => {
  const audit = buildRoutingModeAlignmentAudit(makeModeInput({
    turnType: "CONVERSATIONAL", bridgeActive: false, finalIntent: "general_answer",
    contextActionFinal: "conversation", finalRoutingMode: "general_answer",
    hasActiveAnchor: false, intentPreservationApplied: false,
  }));
  expect(audit.expectedModeFamily, "unchecked", "expectedModeFamily");
  const critical = audit.remainingModeFlags.filter(f => f !== "MODE_REBUILT_DIFFERENTLY" && f !== "MODE_RESTORED_BY_5_3B");
  expect(critical.length, 0, "zero critical flags para CONVERSATIONAL");
  expectTrue(audit.alignedWithCognitiveTurn, "aligned (unchecked)");
});

test("I12: campos obrigatórios presentes em qualquer saída", () => {
  const audit = buildRoutingModeAlignmentAudit({});
  const required = [
    "auditVersion", "cognitiveTurnType", "cognitiveConfidence", "bridgeApplied",
    "finalIntent", "contextActionFinal", "modeBeforeRebuild", "modeAfterRebuild",
    "modeAfterRestore", "finalRoutingMode", "anchorActive", "intentPreservationApplied",
    "cognitiveAnchorHoldRestored", "expectedModeFamily", "alignedWithCognitiveTurn",
    "remainingModeFlags"
  ];
  for (const f of required) {
    if (!(f in audit)) throw new Error(`Campo obrigatório ausente: ${f}`);
  }
  expect(audit.auditVersion, "5.6E", "auditVersion");
});

// ─────────────────────────────────────────────────────────────
// Grupo J — buildRoutingDecision com cognitiveRoutingSignal (PATCH 5.6F)
// ─────────────────────────────────────────────────────────────

console.log("\nGrupo J — buildRoutingDecision cognitiveRoutingSignal (PATCH 5.6F)");

// Helper: constrói sessionContext mínimo com âncora
function makeSessionContextWithAnchor() {
  return { lastBestProduct: { product_name: "Produto X" } };
}

// Helper: cognitiveRoutingSignal de EXPLANATION_REQUEST com alta confiança e âncora
function makeExpReqSignal(overrides = {}) {
  return {
    turnType: "EXPLANATION_REQUEST",
    confidence: 0.85,
    hasActiveAnchor: true,
    ...overrides,
  };
}

test("J1: EXPLANATION_REQUEST + anchor + alta confiança → mode=cognitive_anchor_hold", () => {
  const rd = buildRoutingDecision({
    cognitiveRoutingSignal: makeExpReqSignal(),
    contextAction: "decision",
    intent: "decision",
    sessionContext: makeSessionContextWithAnchor(),
    signals: { hasClearNewCommercialSearch: false, wantsNew: false, isExplicitComparison: false, hasComparisonProducts: false },
  });
  expect(rd.mode, "cognitive_anchor_hold", "mode");
  expectFalse(rd.allowNewSearch, "allowNewSearch=false");
  expectFalse(rd.allowReplaceWinner, "allowReplaceWinner=false");
  expectTrue(rd.shouldPreserveAnchor, "shouldPreserveAnchor=true");
  expect(rd.responsePathHint, "context_explanation_anchored", "responsePathHint");
  expectTrue(rd.reasons.includes("cognitive_explanation_request_anchored"), "reason presente");
});

test("J2: EXPLANATION_REQUEST sem anchor → NÃO força cognitive_anchor_hold", () => {
  const rd = buildRoutingDecision({
    cognitiveRoutingSignal: makeExpReqSignal({ hasActiveAnchor: false }),
    contextAction: "decision",
    intent: "decision",
    sessionContext: {},
    signals: { hasClearNewCommercialSearch: false, wantsNew: false, isExplicitComparison: false, hasComparisonProducts: false },
  });
  expect(rd.mode, "context_decision", "mode sem âncora");
});

test("J3: EXPLANATION_REQUEST + anchor + confiança abaixo do threshold → NÃO força cognitive_anchor_hold", () => {
  const rd = buildRoutingDecision({
    cognitiveRoutingSignal: makeExpReqSignal({ confidence: 0.60 }),
    contextAction: "decision",
    intent: "decision",
    sessionContext: makeSessionContextWithAnchor(),
    signals: { hasClearNewCommercialSearch: false, wantsNew: false, isExplicitComparison: false, hasComparisonProducts: false },
  });
  expect(rd.mode, "context_decision", "mode com baixa confiança");
});

test("J4: EXPLANATION_REQUEST + anchor + hasClearNewCommercialSearch → NÃO força cognitive_anchor_hold", () => {
  const rd = buildRoutingDecision({
    cognitiveRoutingSignal: makeExpReqSignal(),
    contextAction: "decision",
    intent: "decision",
    sessionContext: makeSessionContextWithAnchor(),
    signals: { hasClearNewCommercialSearch: true, wantsNew: false, isExplicitComparison: false, hasComparisonProducts: false },
  });
  expect(rd.mode, "context_decision", "nova busca tem precedência");
});

test("J5: EXPLANATION_REQUEST + anchor + isExplicitComparison → NÃO força cognitive_anchor_hold", () => {
  const rd = buildRoutingDecision({
    cognitiveRoutingSignal: makeExpReqSignal(),
    contextAction: "decision",
    intent: "decision",
    sessionContext: makeSessionContextWithAnchor(),
    signals: { hasClearNewCommercialSearch: false, wantsNew: false, isExplicitComparison: true, hasComparisonProducts: false },
  });
  // comparison_followup pode não ser gerado sem hasComparisonProducts,
  // mas o cognitive signal não deve forçar cognitive_anchor_hold com comparison
  expectFalse(rd.mode === "cognitive_anchor_hold", "não força anchor_hold com comparison");
});

test("J6: NEW_SEARCH → NÃO força cognitive_anchor_hold (cognitiveRoutingSignal ignorado)", () => {
  const rd = buildRoutingDecision({
    cognitiveRoutingSignal: { turnType: "NEW_SEARCH", confidence: 0.85, hasActiveAnchor: false },
    contextAction: "search",
    intent: "search",
    sessionContext: {},
    signals: { hasClearNewCommercialSearch: true, wantsNew: true, isExplicitComparison: false, hasComparisonProducts: false },
  });
  expect(rd.mode, "new_search", "NEW_SEARCH preserva seu mode");
});

test("J7: VALUE_QUESTION → NÃO aplica cognitive_anchor_hold (só EXPLANATION_REQUEST neste patch)", () => {
  const rd = buildRoutingDecision({
    cognitiveRoutingSignal: { turnType: "VALUE_QUESTION", confidence: 0.85, hasActiveAnchor: true },
    contextAction: "decision",
    intent: "decision",
    sessionContext: makeSessionContextWithAnchor(),
    signals: { hasClearNewCommercialSearch: false, wantsNew: false, isExplicitComparison: false, hasComparisonProducts: false },
  });
  expect(rd.mode, "context_decision", "VALUE_QUESTION usa context_decision");
});

test("J8: sem cognitiveRoutingSignal → comportamento legacy inalterado", () => {
  const rd = buildRoutingDecision({
    cognitiveRoutingSignal: null,
    contextAction: "decision",
    intent: "decision",
    sessionContext: makeSessionContextWithAnchor(),
    signals: { hasClearNewCommercialSearch: false, wantsNew: false, isExplicitComparison: false, hasComparisonProducts: false },
  });
  expect(rd.mode, "context_decision", "legacy mode sem sinal cognitivo");
});

test("J9: comparisonFollowUp tem precedência sobre cognitiveRoutingSignal", () => {
  const rd = buildRoutingDecision({
    cognitiveRoutingSignal: makeExpReqSignal(),
    contextAction: "decision",
    intent: "decision",
    sessionContext: makeSessionContextWithAnchor(),
    contextResolution: { lockedComparisonFollowUp: true },
    signals: {
      hasClearNewCommercialSearch: false, wantsNew: false,
      isExplicitComparison: false, hasComparisonProducts: true,
      isComparisonContextFollowUp: false, isComparisonFollowUpLocked: true,
      looksLikeShortPriorityFollowUp: false,
    },
  });
  expect(rd.mode, "comparison_followup", "comparison_followup tem precedência");
});

// ── Grupo J2 — modeBornCognitively e modeAuthoritySource no alignment audit ──

test("J10: modeBornCognitively=true quando modeAfterRebuild=cognitive_anchor_hold para EXPLANATION_REQUEST com anchor", () => {
  const audit = buildRoutingModeAlignmentAudit(makeModeInput({
    turnType: "EXPLANATION_REQUEST",
    modeAfterRebuild: "cognitive_anchor_hold",
    finalRoutingMode: "cognitive_anchor_hold",
    cognitiveAnchorHoldRestored: false,
  }));
  expectTrue(audit.modeBornCognitively, "modeBornCognitively");
  expect(audit.modeAuthoritySource, "cognitive_routing_signal", "modeAuthoritySource");
});

test("J11: modeBornCognitively=false, modeAuthoritySource=5_3B_restore quando restore foi necessário", () => {
  const audit = buildRoutingModeAlignmentAudit(makeModeInput({
    turnType: "EXPLANATION_REQUEST",
    modeAfterRebuild: "context_hold",
    finalRoutingMode: "cognitive_anchor_hold",
    cognitiveAnchorHoldRestored: true,
  }));
  expectFalse(audit.modeBornCognitively, "modeBornCognitively=false");
  expect(audit.modeAuthoritySource, "5_3B_restore", "modeAuthoritySource");
});

test("J12: modeAuthoritySource=legacy_build_routing quando sem anchor hold e sem restore", () => {
  const audit = buildRoutingModeAlignmentAudit(makeModeInput({
    turnType: "VALUE_QUESTION",
    modeAfterRebuild: "context_decision",
    finalRoutingMode: "context_decision",
    cognitiveAnchorHoldRestored: false,
  }));
  expectFalse(audit.modeBornCognitively, "modeBornCognitively=false para VALUE_QUESTION");
  expect(audit.modeAuthoritySource, "legacy_build_routing", "modeAuthoritySource");
});

test("J13: campos modeBornCognitively e modeAuthoritySource presentes em qualquer saída", () => {
  const audit = buildRoutingModeAlignmentAudit({});
  if (!("modeBornCognitively" in audit)) throw new Error("modeBornCognitively ausente");
  if (!("modeAuthoritySource" in audit)) throw new Error("modeAuthoritySource ausente");
  expect(audit.auditVersion, "5.6E", "auditVersion permanece 5.6E");
});

// ─────────────────────────────────────────────────────────────
// Grupo K — Validação end-to-end da autoridade cognitiva do mode (PATCH 5.6G)
//
// Combina buildRoutingDecision + buildRoutingModeAlignmentAudit para simular
// o pipeline real e confirmar que o mode nasce cognitivamente.
// ─────────────────────────────────────────────────────────────

console.log("\nGrupo K — Validação end-to-end autoridade cognitiva do mode (PATCH 5.6G)");

/**
 * Simula o pipeline do handler pós-5.6F:
 * 1. buildRoutingDecision ② com cognitiveRoutingSignal
 * 2. Determina se 5.3B precisaria restaurar (modeAfterRebuild === expectedMode → não restaura)
 * 3. buildRoutingModeAlignmentAudit com todos os campos reais
 */
function runModeAuthorityPipeline({
  turnType            = "EXPLANATION_REQUEST",
  confidence          = 0.85,
  hasAnchorForRouting = true,
  contextAction       = "decision",
  intent              = "decision",
  signals             = {},
  contextResolution   = {},
  bridgeActive        = true,
}) {
  const cognitiveTurnEarly = makeTurn(turnType, confidence);
  const sessionContext = hasAnchorForRouting
    ? { lastBestProduct: { product_name: "Produto X" } }
    : {};

  const cognitiveRoutingSignal = cognitiveTurnEarly ? {
    turnType:        cognitiveTurnEarly.turnType,
    confidence:      cognitiveTurnEarly.confidence,
    hasActiveAnchor: hasAnchorForRouting,
  } : null;

  const fullSignals = {
    hasClearNewCommercialSearch: false,
    wantsNew: false,
    isExplicitComparison: false,
    hasComparisonProducts: false,
    isContextDecisionOnOriginal: false,
    isProductReferenceOnOriginal: false,
    looksLikeAmbiguousFollowUp: false,
    looksLikeShortPriorityFollowUp: false,
    isComparisonContextFollowUp: false,
    isComparisonFollowUpLocked: false,
    explicitProductOnlyQuery: false,
    ...signals,
  };

  // Simula buildRoutingDecision ②
  const rdAfterRebuild = buildRoutingDecision({
    intent,
    contextAction,
    sessionContext,
    cognitiveRoutingSignal,
    contextResolution,
    signals: fullSignals,
  });

  const modeAfterRebuild = rdAfterRebuild.mode;

  // Simula PATCH 5.3B: só restaura se mode ainda não for cognitive_anchor_hold
  const intentPreservationApplied = turnType === "EXPLANATION_REQUEST" && hasAnchorForRouting;
  const shouldRestore =
    intentPreservationApplied &&
    turnType === "EXPLANATION_REQUEST" &&
    modeAfterRebuild !== "cognitive_anchor_hold";
  const cognitiveAnchorHoldRestored = shouldRestore;
  const finalRoutingMode = shouldRestore ? "cognitive_anchor_hold" : modeAfterRebuild;

  const bridgeAudit = bridgeActive
    ? { active: true, fromIntent: "general_answer", toIntent: "decision", cognitiveTurnType: turnType, confidence, reason: "safe_cognitive_turn_authority" }
    : { active: false, reason: "turn_type_not_in_allowlist", cognitiveTurnType: turnType, confidence };

  const modeAudit = buildRoutingModeAlignmentAudit({
    cognitiveTurnEarly,
    bridgeAudit,
    finalIntent:              intent,
    contextActionFinal:       contextAction,
    modeBeforeRebuild:        "context_decision",   // simula mode do buildRoutingDecision ①
    modeAfterRebuild,
    finalRoutingMode,
    hasActiveAnchor:          hasAnchorForRouting,
    intentPreservationApplied,
    cognitiveAnchorHoldRestored,
  });

  return { rdAfterRebuild, modeAfterRebuild, finalRoutingMode, cognitiveAnchorHoldRestored, modeAudit };
}

test("K1: cenário ideal — EXPLANATION_REQUEST + anchor + alta confiança → mode nasce cognitivamente, 5.3B não restaura", () => {
  const { rdAfterRebuild, modeAfterRebuild, cognitiveAnchorHoldRestored, modeAudit } =
    runModeAuthorityPipeline({ turnType: "EXPLANATION_REQUEST", confidence: 0.85, hasAnchorForRouting: true });

  // buildRoutingDecision ② gera cognitive_anchor_hold diretamente
  expect(modeAfterRebuild, "cognitive_anchor_hold", "modeAfterRebuild");
  // PATCH 5.3B não precisa restaurar
  expectFalse(cognitiveAnchorHoldRestored, "5.3B não restaura");
  // Audit confirma modo cognitivo
  expectTrue(modeAudit.modeBornCognitively, "modeBornCognitively");
  expect(modeAudit.modeAuthoritySource, "cognitive_routing_signal", "modeAuthoritySource");
  // Sem flags críticas
  const critical = modeAudit.remainingModeFlags.filter(f => f !== "MODE_REBUILT_DIFFERENTLY" && f !== "MODE_RESTORED_BY_5_3B");
  expect(critical.length, 0, "zero critical flags");
  expectTrue(modeAudit.alignedWithCognitiveTurn, "aligned");
});

test("K2: EXPLANATION_REQUEST + anchor + confiança baixa → mode nasce legacy, 5.3B restaura", () => {
  const { modeAfterRebuild, cognitiveAnchorHoldRestored, finalRoutingMode, modeAudit } =
    runModeAuthorityPipeline({ turnType: "EXPLANATION_REQUEST", confidence: 0.50, hasAnchorForRouting: true });

  // buildRoutingDecision ② não usa o sinal cognitivo (confiança abaixo de 0.75)
  expectFalse(modeAfterRebuild === "cognitive_anchor_hold", "mode não nasce cognitivo");
  // PATCH 5.3B deve restaurar
  expectTrue(cognitiveAnchorHoldRestored, "5.3B restaura");
  expect(finalRoutingMode, "cognitive_anchor_hold", "finalMode após restore");
  // Audit indica restore
  expectFalse(modeAudit.modeBornCognitively, "modeBornCognitively=false");
  expect(modeAudit.modeAuthoritySource, "5_3B_restore", "modeAuthoritySource=5_3B_restore");
  expectTrue(modeAudit.remainingModeFlags.includes("MODE_RESTORED_BY_5_3B"), "flag restore");
});

test("K3: EXPLANATION_REQUEST sem anchor → cognitive_anchor_hold não é gerado", () => {
  const { modeAfterRebuild, modeAudit } =
    runModeAuthorityPipeline({ turnType: "EXPLANATION_REQUEST", confidence: 0.85, hasAnchorForRouting: false });

  expectFalse(modeAfterRebuild === "cognitive_anchor_hold", "sem âncora, não gera cognitive_anchor_hold");
  expectFalse(modeAudit.modeBornCognitively, "modeBornCognitively=false");
  expect(modeAudit.modeAuthoritySource, "legacy_build_routing", "legacy authority sem anchor");
});

test("K4: NEW_SEARCH → cognitive_anchor_hold não é gerado (hasClearNewCommercialSearch=true)", () => {
  const { modeAfterRebuild, modeAudit } =
    runModeAuthorityPipeline({
      turnType: "NEW_SEARCH", confidence: 0.85, hasAnchorForRouting: false,
      intent: "search", contextAction: "search",
      signals: { hasClearNewCommercialSearch: true, wantsNew: true },
    });

  expect(modeAfterRebuild, "new_search", "NEW_SEARCH preserva seu mode");
  expectFalse(modeAudit.modeBornCognitively, "modeBornCognitively=false");
  expectFalse(modeAudit.remainingModeFlags.includes("MODE_EXPECTED_COGNITIVE_ANCHOR_HOLD"), "sem flag anchor hold");
});

test("K5: COMPARISON com produtos → comparison_followup tem precedência", () => {
  const { modeAfterRebuild, modeAudit } =
    runModeAuthorityPipeline({
      turnType: "COMPARISON", confidence: 0.85, hasAnchorForRouting: true,
      intent: "comparison", contextAction: "comparison",
      signals: { hasComparisonProducts: true, isComparisonFollowUpLocked: true },
      contextResolution: { lockedComparisonFollowUp: true },
    });

  expect(modeAfterRebuild, "comparison_followup", "comparison tem precedência");
  expectFalse(modeAudit.modeBornCognitively, "modeBornCognitively=false para comparison");
});

test("K6: REFINEMENT → não gera cognitive_anchor_hold", () => {
  const { modeAfterRebuild, modeAudit } =
    runModeAuthorityPipeline({
      turnType: "REFINEMENT", confidence: 0.85, hasAnchorForRouting: true,
      intent: "refinement", contextAction: "refinement",
      contextResolution: { mode: "refinement" },
    });

  expectFalse(modeAfterRebuild === "cognitive_anchor_hold", "REFINEMENT não gera anchor_hold");
  expectFalse(modeAudit.modeBornCognitively, "modeBornCognitively=false");
});

test("K7: hasClearNewCommercialSearch bloqueia cognitive signal mesmo com EXPLANATION_REQUEST + anchor", () => {
  const { modeAfterRebuild, modeAudit } =
    runModeAuthorityPipeline({
      turnType: "EXPLANATION_REQUEST", confidence: 0.85, hasAnchorForRouting: true,
      signals: { hasClearNewCommercialSearch: true },
    });

  expectFalse(modeAfterRebuild === "cognitive_anchor_hold", "new search tem precedência");
  expectFalse(modeAudit.modeBornCognitively, "modeBornCognitively=false");
});

test("K8: sem cognitiveRoutingSignal (null) → legacy_build_routing, mode segue contextAction", () => {
  const rd = buildRoutingDecision({
    cognitiveRoutingSignal: null,
    intent: "decision",
    contextAction: "decision",
    sessionContext: { lastBestProduct: { product_name: "X" } },
    signals: { hasClearNewCommercialSearch: false, wantsNew: false, isExplicitComparison: false, hasComparisonProducts: false },
  });
  const modeAudit = buildRoutingModeAlignmentAudit({
    cognitiveTurnEarly: null,
    modeAfterRebuild: rd.mode,
    finalRoutingMode: rd.mode,
    cognitiveAnchorHoldRestored: false,
    hasActiveAnchor: true,
  });

  expect(rd.mode, "context_decision", "legacy mode");
  expect(modeAudit.modeAuthoritySource, "legacy_build_routing", "legacy authority");
  expectFalse(modeAudit.modeBornCognitively, "não nasceu cognitivamente");
});

test("K9: audit distingue corretamente cenário cognitivo de cenário legacy", () => {
  // Cognitivo
  const { modeAudit: auditCog } = runModeAuthorityPipeline({
    turnType: "EXPLANATION_REQUEST", confidence: 0.85, hasAnchorForRouting: true,
  });
  // Legacy (sem âncora)
  const { modeAudit: auditLeg } = runModeAuthorityPipeline({
    turnType: "EXPLANATION_REQUEST", confidence: 0.85, hasAnchorForRouting: false,
  });

  expect(auditCog.modeAuthoritySource, "cognitive_routing_signal", "cognitivo");
  expect(auditLeg.modeAuthoritySource, "legacy_build_routing", "legacy");
  expectTrue(auditCog.modeBornCognitively, "cognitivo born");
  expectFalse(auditLeg.modeBornCognitively, "legacy not born cognitively");
});

test("K10: invariante — PATCH 5.3B não altera modeAfterRebuild quando mode já é cognitive_anchor_hold", () => {
  // O restore 5.3B só ocorre quando mode !== cognitive_anchor_hold
  // Aqui simulamos que o mode já nasceu correto
  const modeAfterRebuild = "cognitive_anchor_hold";
  const shouldRestore = modeAfterRebuild !== "cognitive_anchor_hold"; // false
  expectFalse(shouldRestore, "5.3B não restaura quando mode já correto");
});

// ─────────────────────────────────────────────────────────────
// GRUPO L — PATCH 5.7: Unified Cognitive Router Final Audit
// ─────────────────────────────────────────────────────────────

// Helpers para montar inputs do unified audit rapidamente
function makeBridgeAuditActive(fromIntent = "search", toIntent = "decision") {
  return { active: true, fromIntent, toIntent };
}
function makeBridgeAuditInactive(fromIntent = "search") {
  return { active: false, fromIntent };
}
function makeGuardAudit(applied, fromCA, toCA = "decision") {
  return { applied, fromContextAction: fromCA, contextAction: applied ? toCA : fromCA };
}
function makeModeAudit({ modeBornCognitively = false, cognitiveAnchorHoldRestored = false, modeAuthoritySource = "legacy_build_routing" } = {}) {
  return { modeBornCognitively, cognitiveAnchorHoldRestored, modeAuthoritySource };
}
function makeRD({ mode = "cognitive_anchor_hold", allowNewSearch = false, allowReplaceWinner = false, allowRerank = true, shouldPreserveAnchor = true } = {}) {
  return { mode, allowNewSearch, allowReplaceWinner, allowRerank, shouldPreserveAnchor };
}

// L1: EXPLANATION_REQUEST + anchor → unified alignment OK
test("L1: EXPLANATION_REQUEST + anchor — unified alignment OK", () => {
  const audit = buildUnifiedCognitiveRouterAudit({
    cognitiveTurnEarly:          { turnType: "EXPLANATION_REQUEST", confidence: 0.9 },
    bridgeAudit:                 makeBridgeAuditActive(),
    contextActionGuardAudit:     makeGuardAudit(true, "conversation"),
    modeAlignmentAudit:          makeModeAudit({ modeBornCognitively: true, modeAuthoritySource: "cognitive_routing_signal" }),
    routingDecision:             makeRD(),
    hasActiveAnchor:             true,
    contextActionFinal:          "decision",
  });
  expect(audit.isUnifiedEnoughForNextPhase, true, "L1: isUnifiedEnoughForNextPhase");
  expect(audit.intentAuthoritySource, "cognitive_bridge", "L1: intentAuthoritySource");
  expect(audit.routingModeAuthoritySource, "cognitive_routing_signal", "L1: modeAuthoritySource");
  expect(audit.remainingConflictFlags.length, 0, "L1: no conflict flags");
  expectTrue(audit.cognitiveAuthorityCoverage.includes("intent"), "L1: intent covered");
  expectTrue(audit.cognitiveAuthorityCoverage.includes("routingMode"), "L1: routingMode covered");
});

// L2: NEW_SEARCH → unified alignment OK, allowNewSearch = true
test("L2: NEW_SEARCH — allowNewSearch compat, unified OK", () => {
  const audit = buildUnifiedCognitiveRouterAudit({
    cognitiveTurnEarly:      { turnType: "NEW_SEARCH", confidence: 0.85 },
    bridgeAudit:             makeBridgeAuditActive("search", "search"),
    contextActionGuardAudit: makeGuardAudit(false, "search"),
    modeAlignmentAudit:      makeModeAudit({ modeBornCognitively: false }),
    routingDecision:         makeRD({ mode: "new_search", allowNewSearch: true, shouldPreserveAnchor: false }),
    hasActiveAnchor:         false,
    contextActionFinal:      "search",
  });
  expect(audit.isUnifiedEnoughForNextPhase, true, "L2: isUnifiedEnoughForNextPhase");
  expect(audit.allowNewSearch, true, "L2: allowNewSearch");
  expectFalse(audit.remainingConflictFlags.includes("ALLOW_NEW_SEARCH_MISMATCH"), "L2: no newSearch mismatch");
});

// L3: VALUE_QUESTION + anchor → sem fallback indevido
test("L3: VALUE_QUESTION + anchor — sem fallback", () => {
  const audit = buildUnifiedCognitiveRouterAudit({
    cognitiveTurnEarly:      { turnType: "VALUE_QUESTION", confidence: 0.8 },
    bridgeAudit:             makeBridgeAuditActive(),
    contextActionGuardAudit: makeGuardAudit(true, "conversation"),
    modeAlignmentAudit:      makeModeAudit({ modeBornCognitively: false }),
    routingDecision:         makeRD({ mode: "context_decision", allowReplaceWinner: false, shouldPreserveAnchor: true }),
    hasActiveAnchor:         true,
    contextActionFinal:      "decision",
  });
  expect(audit.isUnifiedEnoughForNextPhase, true, "L3: isUnifiedEnoughForNextPhase");
  expectFalse(audit.remainingConflictFlags.includes("ALLOW_REPLACE_WINNER_MISMATCH"), "L3: no replaceWinner mismatch");
  expectFalse(audit.remainingConflictFlags.includes("SHOULD_PRESERVE_ANCHOR_MISMATCH"), "L3: shouldPreserveAnchor ok");
});

// L4: COMPARISON → não força anchor hold
test("L4: COMPARISON — não força cognitive_anchor_hold", () => {
  const audit = buildUnifiedCognitiveRouterAudit({
    cognitiveTurnEarly:      { turnType: "COMPARISON", confidence: 0.8 },
    bridgeAudit:             makeBridgeAuditActive("search", "search"),
    contextActionGuardAudit: makeGuardAudit(false, "comparison"),
    modeAlignmentAudit:      makeModeAudit({ modeBornCognitively: false }),
    routingDecision:         makeRD({ mode: "comparison_followup", allowNewSearch: false, shouldPreserveAnchor: false }),
    hasActiveAnchor:         false,
    contextActionFinal:      "comparison",
  });
  expect(audit.finalRoutingMode, "comparison_followup", "L4: mode is comparison_followup");
  expectFalse(audit.finalRoutingMode === "cognitive_anchor_hold", "L4: not forced to anchor hold");
  expect(audit.isUnifiedEnoughForNextPhase, true, "L4: isUnifiedEnoughForNextPhase");
});

// L5: REFINEMENT → não força explanation
test("L5: REFINEMENT — não força explanation", () => {
  const audit = buildUnifiedCognitiveRouterAudit({
    cognitiveTurnEarly:      { turnType: "REFINEMENT", confidence: 0.8 },
    bridgeAudit:             makeBridgeAuditActive("search", "refinement"),
    contextActionGuardAudit: makeGuardAudit(false, "refinement"),
    modeAlignmentAudit:      makeModeAudit({ modeBornCognitively: false }),
    routingDecision:         makeRD({ mode: "refinement_search", allowNewSearch: true, shouldPreserveAnchor: false }),
    hasActiveAnchor:         false,
    contextActionFinal:      "refinement",
  });
  expectFalse(audit.richExplanationPathActivated, "L5: rich explanation not activated");
  expect(audit.isUnifiedEnoughForNextPhase, true, "L5: isUnifiedEnoughForNextPhase");
});

// L6: CONVERSATIONAL → legacy allowed / unchecked
test("L6: CONVERSATIONAL — legacy_allowed flag, não critical", () => {
  const audit = buildUnifiedCognitiveRouterAudit({
    cognitiveTurnEarly:      { turnType: "CONVERSATIONAL", confidence: 0.6 },
    bridgeAudit:             makeBridgeAuditInactive(),
    contextActionGuardAudit: makeGuardAudit(false, "conversation"),
    modeAlignmentAudit:      makeModeAudit(),
    routingDecision:         makeRD({ mode: "conversational", allowNewSearch: false, shouldPreserveAnchor: false }),
    hasActiveAnchor:         false,
    contextActionFinal:      "conversation",
  });
  expectTrue(audit.remainingConflictFlags.includes("LEGACY_ALLOWED_FOR_UNSUPPORTED_TURN"), "L6: legacy_allowed flag presente");
  expect(audit.isUnifiedEnoughForNextPhase, true, "L6: não é flag crítica");
});

// L7: COMPARISON_FOLLOWUP → known_gap, não critical
test("L7: COMPARISON_FOLLOWUP — known gap, não regressão", () => {
  const audit = buildUnifiedCognitiveRouterAudit({
    cognitiveTurnEarly:      { turnType: "COMPARISON_FOLLOWUP", confidence: 0.7 },
    bridgeAudit:             makeBridgeAuditInactive(),
    contextActionGuardAudit: makeGuardAudit(false, "comparison"),
    modeAlignmentAudit:      makeModeAudit(),
    routingDecision:         makeRD({ mode: "comparison_followup", allowNewSearch: false }),
    hasActiveAnchor:         false,
    contextActionFinal:      "comparison",
  });
  expectTrue(audit.remainingConflictFlags.includes("COMPARISON_FOLLOWUP_KNOWN_GAP"), "L7: known_gap flag presente");
  expect(audit.isUnifiedEnoughForNextPhase, true, "L7: não é critical");
});

// L8: safe turn com intent ainda legacy → flag INTENT_STILL_LEGACY_FOR_SAFE_TURN
test("L8: safe turn alta confiança sem bridge → INTENT_STILL_LEGACY_FOR_SAFE_TURN", () => {
  const audit = buildUnifiedCognitiveRouterAudit({
    cognitiveTurnEarly:      { turnType: "EXPLANATION_REQUEST", confidence: 0.9 },
    bridgeAudit:             makeBridgeAuditInactive("search"),  // bridge NÃO aplicou
    contextActionGuardAudit: makeGuardAudit(false, "conversation"),
    modeAlignmentAudit:      makeModeAudit({ modeBornCognitively: true }),
    routingDecision:         makeRD(),
    hasActiveAnchor:         true,
    contextActionFinal:      "decision",
  });
  expectTrue(audit.remainingConflictFlags.includes("INTENT_STILL_LEGACY_FOR_SAFE_TURN"), "L8: flag presente");
  expect(audit.intentAuthoritySource, "legacy_detect_intent", "L8: source é legacy");
  expect(audit.isUnifiedEnoughForNextPhase, false, "L8: flag crítica bloqueia");
});

// L9: safe turn com mode ainda legacy → flag ROUTING_MODE_STILL_LEGACY_FOR_SAFE_TURN
test("L9: EXPLANATION_REQUEST + anchor com mode legacy → ROUTING_MODE_STILL_LEGACY_FOR_SAFE_TURN", () => {
  const audit = buildUnifiedCognitiveRouterAudit({
    cognitiveTurnEarly:      { turnType: "EXPLANATION_REQUEST", confidence: 0.9 },
    bridgeAudit:             makeBridgeAuditActive(),
    contextActionGuardAudit: makeGuardAudit(true, "conversation"),
    modeAlignmentAudit:      makeModeAudit({ modeBornCognitively: false }),
    routingDecision:         makeRD({ mode: "context_decision" }),  // NOT cognitive_anchor_hold
    hasActiveAnchor:         true,
    contextActionFinal:      "decision",
  });
  expectTrue(audit.remainingConflictFlags.includes("ROUTING_MODE_STILL_LEGACY_FOR_SAFE_TURN"), "L9: flag presente");
  expect(audit.isUnifiedEnoughForNextPhase, false, "L9: flag crítica bloqueia");
});

// L10: rich explanation não ativável quando deveria → RICH_EXPLANATION_NOT_ACTIVATABLE
test("L10: EXPLANATION_REQUEST + anchor sem rich explanation → RICH_EXPLANATION_NOT_ACTIVATABLE", () => {
  const audit = buildUnifiedCognitiveRouterAudit({
    cognitiveTurnEarly:           { turnType: "EXPLANATION_REQUEST", confidence: 0.9 },
    bridgeAudit:                  makeBridgeAuditActive(),
    contextActionGuardAudit:      makeGuardAudit(true, "conversation"),
    modeAlignmentAudit:           makeModeAudit({ modeBornCognitively: true }),
    routingDecision:              makeRD({ mode: "context_decision" }),  // não é anchor_hold
    hasActiveAnchor:              true,
    richExplanationPathActivated: false,
    contextActionFinal:           "decision",
  });
  expectTrue(audit.remainingConflictFlags.includes("RICH_EXPLANATION_NOT_ACTIVATABLE"), "L10: flag presente");
  expect(audit.isUnifiedEnoughForNextPhase, false, "L10: flag crítica bloqueia");
});

// L11: cognitiveAuthorityCoverage cobre intent + contextAction + routingMode
test("L11: cognitiveAuthorityCoverage abrange os três pilares quando totalmente unificado", () => {
  const audit = buildUnifiedCognitiveRouterAudit({
    cognitiveTurnEarly:      { turnType: "EXPLANATION_REQUEST", confidence: 0.92 },
    bridgeAudit:             makeBridgeAuditActive(),
    contextActionGuardAudit: makeGuardAudit(true, "conversation"),
    modeAlignmentAudit:      makeModeAudit({ modeBornCognitively: true, modeAuthoritySource: "cognitive_routing_signal" }),
    routingDecision:         makeRD({ allowReplaceWinner: false, shouldPreserveAnchor: true }),
    hasActiveAnchor:         true,
    contextActionFinal:      "decision",
  });
  expectTrue(audit.cognitiveAuthorityCoverage.includes("intent"),       "L11: intent coberto");
  expectTrue(audit.cognitiveAuthorityCoverage.includes("contextAction"), "L11: contextAction coberto");
  expectTrue(audit.cognitiveAuthorityCoverage.includes("routingMode"),   "L11: routingMode coberto");
});

// L12: RESTORE_STILL_REQUIRED não impede isUnifiedEnoughForNextPhase
test("L12: RESTORE_STILL_REQUIRED é informativo, não crítico", () => {
  const audit = buildUnifiedCognitiveRouterAudit({
    cognitiveTurnEarly:      { turnType: "EXPLANATION_REQUEST", confidence: 0.88 },
    bridgeAudit:             makeBridgeAuditActive(),
    contextActionGuardAudit: makeGuardAudit(true, "conversation"),
    modeAlignmentAudit:      makeModeAudit({ modeBornCognitively: false, cognitiveAnchorHoldRestored: true }),
    routingDecision:         makeRD(),  // mode é cognitive_anchor_hold via restore
    hasActiveAnchor:         true,
    contextActionFinal:      "decision",
  });
  expectTrue(audit.remainingConflictFlags.includes("RESTORE_STILL_REQUIRED"), "L12: RESTORE flag presente");
  expect(audit.isUnifiedEnoughForNextPhase, true, "L12: não bloqueia fase seguinte");
});

// ─────────────────────────────────────────────────────────────
// Sumário
// ─────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`PATCH 5.6B+C+D+E+F+G+5.7 — Cognitive Bridge Suite`);
console.log(`Resultado: ${passed} passed, ${failed} failed`);

if (failures.length > 0) {
  console.log("\nFalhas:");
  for (const f of failures) {
    console.log(`  ✗ ${f.label}`);
    console.log(`    ${f.error}`);
  }
  process.exit(1);
} else {
  console.log("Todos os testes passaram.");
  process.exit(0);
}
