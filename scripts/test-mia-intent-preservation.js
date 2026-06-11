/**
 * PATCH 5.2B — Testes: applyIntentPreservation
 *
 * Cenários mínimos conforme especificação.
 * Nenhum teste depende de LLM.
 * Nenhum teste usa frases específicas como mecanismo de detecção.
 * Usa apenas lógica estrutural de lib/miaIntentPreservation.js.
 */

import { applyIntentPreservation } from "../lib/miaIntentPreservation.js";

// ─────────────────────────────────────────────────────────────
// Utilitários de teste
// ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const errors = [];

function assert(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    const msg = detail ? `  ✗ ${label} — ${detail}` : `  ✗ ${label}`;
    console.error(msg);
    failed++;
    errors.push({ label, detail });
  }
}

function test(name, fn) {
  console.log(`\n[${name}]`);
  try {
    fn();
  } catch (err) {
    console.error(`  ✗ EXCEPTION: ${err.message}`);
    failed++;
    errors.push({ label: name, detail: err.message });
  }
}

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

const ANCHOR = { product_name: "iPhone 15 Pro Max 256GB" };
const SESSION_WITH_ANCHOR = { lastBestProduct: ANCHOR };
const SESSION_EMPTY = {};

const GENERIC_DIRECT_REPLY = "Posso te ajudar com compras, comparação de produtos e decisão de custo-benefício.\n\nMe fala o produto que você quer analisar ou buscar.";

function makeCognitiveTurn(turnType, confidence = 0.9) {
  return { turnType, confidence, reasons: [], signals: {}, shadowOnly: true };
}

function makeRoutingDecision(overrides = {}) {
  return {
    mode: "context_hold",
    conversationAct: "context_hold",
    allowNewSearch: false,
    allowCommercialFallback: false,
    allowReplaceWinner: false,
    allowRerank: false,
    shouldPreserveAnchor: true,
    shouldReturnSessionContext: true,
    responsePathHint: "context_hold",
    reasons: [],
    anchorProduct: null,
    ...overrides,
  };
}

function makeContextResolution(directReply = null, mode = "general_answer") {
  return {
    mode,
    directReply,
    shouldSkipProductSearch: true,
    clearContext: false,
    lockedComparisonFollowUp: false,
  };
}

// ─────────────────────────────────────────────────────────────
// CENÁRIO 1 — EXPLANATION_REQUEST + âncora válida → preservação aplicada
// ─────────────────────────────────────────────────────────────

test("1. EXPLANATION_REQUEST + âncora válida → preservação aplicada", () => {
  const result = applyIntentPreservation({
    cognitiveTurn: makeCognitiveTurn("EXPLANATION_REQUEST"),
    routingDecision: makeRoutingDecision(),
    sessionContext: SESSION_WITH_ANCHOR,
    lastBestProduct: ANCHOR,
    contextResolution: makeContextResolution(GENERIC_DIRECT_REPLY),
  });

  assert("preservationApplied = true", result.preservationApplied === true);
  assert("preservedIntent = EXPLANATION_REQUEST", result.preservedIntent === "EXPLANATION_REQUEST");
  assert("preservationReason correto", result.preservationReason === "explanation_request_with_active_anchor");
  assert("metadata.intentPreservation.active = true", result.metadata.intentPreservation.active === true);
  assert("metadata.intentPreservation.intent = EXPLANATION_REQUEST", result.metadata.intentPreservation.intent === "EXPLANATION_REQUEST");
  assert("contextResolutionPatch.directReply = null (limpa o genérico)", result.contextResolutionPatch?.directReply === null);
  assert("routingDecisionPatch.mode = cognitive_anchor_hold", result.routingDecisionPatch?.mode === "cognitive_anchor_hold");
  assert("routingDecisionPatch.allowNewSearch = false", result.routingDecisionPatch?.allowNewSearch === false);
  assert("routingDecisionPatch.shouldPreserveAnchor = true", result.routingDecisionPatch?.shouldPreserveAnchor === true);
  assert("metadata.intentPreservation.anchor correto", result.metadata.intentPreservation.anchor === ANCHOR.product_name);
  assert("modeUpgraded = true (mudou de context_hold)", result.metadata.intentPreservation.modeUpgraded === true);
});

// ─────────────────────────────────────────────────────────────
// CENÁRIO 2 — EXPLANATION_REQUEST sem âncora → NÃO preservar
// ─────────────────────────────────────────────────────────────

test("2. EXPLANATION_REQUEST sem âncora → não preservar", () => {
  const result = applyIntentPreservation({
    cognitiveTurn: makeCognitiveTurn("EXPLANATION_REQUEST"),
    routingDecision: makeRoutingDecision(),
    sessionContext: SESSION_EMPTY,
    lastBestProduct: null,
    contextResolution: makeContextResolution(GENERIC_DIRECT_REPLY),
  });

  assert("preservationApplied = false", result.preservationApplied === false);
  assert("contextResolutionPatch = null", result.contextResolutionPatch === null);
  assert("routingDecisionPatch = null", result.routingDecisionPatch === null);
});

// ─────────────────────────────────────────────────────────────
// CENÁRIO 3 — EXPLANATION_REQUEST com confidence baixa → NÃO preservar
// ─────────────────────────────────────────────────────────────

test("3. EXPLANATION_REQUEST com confidence < 0.6 → não preservar", () => {
  const result = applyIntentPreservation({
    cognitiveTurn: makeCognitiveTurn("EXPLANATION_REQUEST", 0.4),
    routingDecision: makeRoutingDecision(),
    sessionContext: SESSION_WITH_ANCHOR,
    lastBestProduct: ANCHOR,
    contextResolution: makeContextResolution(GENERIC_DIRECT_REPLY),
  });

  assert("preservationApplied = false (confidence < 0.6)", result.preservationApplied === false);
  assert("contextResolutionPatch = null", result.contextResolutionPatch === null);
});

// ─────────────────────────────────────────────────────────────
// CENÁRIO 4 — VALUE_QUESTION → NÃO preservar (escopo diferente)
// ─────────────────────────────────────────────────────────────

test("4. VALUE_QUESTION → não preservar (escopo apenas EXPLANATION_REQUEST)", () => {
  const result = applyIntentPreservation({
    cognitiveTurn: makeCognitiveTurn("VALUE_QUESTION"),
    routingDecision: makeRoutingDecision(),
    sessionContext: SESSION_WITH_ANCHOR,
    lastBestProduct: ANCHOR,
    contextResolution: makeContextResolution(GENERIC_DIRECT_REPLY),
  });

  assert("preservationApplied = false (VALUE_QUESTION fora do escopo)", result.preservationApplied === false);
  assert("contextResolutionPatch = null", result.contextResolutionPatch === null);
  assert("routingDecisionPatch = null", result.routingDecisionPatch === null);
});

// ─────────────────────────────────────────────────────────────
// CENÁRIO 5 — COMPARISON → NÃO preservar
// ─────────────────────────────────────────────────────────────

test("5. COMPARISON → não preservar", () => {
  const result = applyIntentPreservation({
    cognitiveTurn: makeCognitiveTurn("COMPARISON"),
    routingDecision: makeRoutingDecision({ allowNewSearch: true }),
    sessionContext: SESSION_WITH_ANCHOR,
    lastBestProduct: ANCHOR,
    contextResolution: makeContextResolution(),
  });

  assert("preservationApplied = false", result.preservationApplied === false);
});

// ─────────────────────────────────────────────────────────────
// CENÁRIO 6 — NEW_SEARCH → NÃO preservar
// ─────────────────────────────────────────────────────────────

test("6. NEW_SEARCH → não preservar", () => {
  const result = applyIntentPreservation({
    cognitiveTurn: makeCognitiveTurn("NEW_SEARCH"),
    routingDecision: makeRoutingDecision({ allowNewSearch: true, mode: "new_search" }),
    sessionContext: SESSION_WITH_ANCHOR,
    lastBestProduct: ANCHOR,
    contextResolution: makeContextResolution(),
  });

  assert("preservationApplied = false", result.preservationApplied === false);
});

// ─────────────────────────────────────────────────────────────
// CENÁRIO 7 — Nunca retorna null
// ─────────────────────────────────────────────────────────────

test("7. Nunca retorna null — múltiplos inputs", () => {
  const inputs = [
    {},
    { cognitiveTurn: null },
    { cognitiveTurn: makeCognitiveTurn("EXPLANATION_REQUEST"), routingDecision: null },
    { cognitiveTurn: makeCognitiveTurn("FOLLOW_UP"), sessionContext: SESSION_WITH_ANCHOR },
    { cognitiveTurn: makeCognitiveTurn("EXPLANATION_REQUEST"), sessionContext: SESSION_WITH_ANCHOR, lastBestProduct: ANCHOR },
  ];

  inputs.forEach((input, i) => {
    const result = applyIntentPreservation(input);
    assert(`input ${i} não retorna null`, result !== null);
    assert(`input ${i} tem preservationApplied`, typeof result.preservationApplied === "boolean");
    assert(`input ${i} tem metadata`, result.metadata !== undefined);
  });
});

// ─────────────────────────────────────────────────────────────
// CENÁRIO 8 — Não muta objetos originais
// ─────────────────────────────────────────────────────────────

test("8. Não muta routingDecision nem contextResolution originais", () => {
  const rdOriginal = makeRoutingDecision();
  const crOriginal = makeContextResolution(GENERIC_DIRECT_REPLY);
  const rdSnapshot = JSON.stringify(rdOriginal);
  const crSnapshot = JSON.stringify(crOriginal);

  applyIntentPreservation({
    cognitiveTurn: makeCognitiveTurn("EXPLANATION_REQUEST"),
    routingDecision: rdOriginal,
    sessionContext: SESSION_WITH_ANCHOR,
    lastBestProduct: ANCHOR,
    contextResolution: crOriginal,
  });

  assert(
    "routingDecision original não mutado",
    JSON.stringify(rdOriginal) === rdSnapshot,
    `rd mudou: ${JSON.stringify(rdOriginal)}`
  );
  assert(
    "contextResolution original não mutado",
    JSON.stringify(crOriginal) === crSnapshot,
    `cr mudou: ${JSON.stringify(crOriginal)}`
  );
});

// ─────────────────────────────────────────────────────────────
// CENÁRIO 9 — EXPLANATION_REQUEST sem directReply genérico (CSO já resolveu)
// O patch ainda aplica no mode mas não no directReply
// ─────────────────────────────────────────────────────────────

test("9. EXPLANATION_REQUEST sem directReply → contextResolutionPatch null, routingDecisionPatch aplicado", () => {
  const result = applyIntentPreservation({
    cognitiveTurn: makeCognitiveTurn("EXPLANATION_REQUEST"),
    routingDecision: makeRoutingDecision({ mode: "context_hold" }),
    sessionContext: SESSION_WITH_ANCHOR,
    lastBestProduct: ANCHOR,
    contextResolution: makeContextResolution(null), // sem directReply
  });

  assert("preservationApplied = true", result.preservationApplied === true);
  assert("contextResolutionPatch = null (sem directReply para limpar)", result.contextResolutionPatch === null);
  assert("routingDecisionPatch.mode = cognitive_anchor_hold", result.routingDecisionPatch?.mode === "cognitive_anchor_hold");
});

// ─────────────────────────────────────────────────────────────
// CENÁRIO 10 — mode já é cognitive_anchor_hold → routingDecisionPatch null
// ─────────────────────────────────────────────────────────────

test("10. Mode já é cognitive_anchor_hold → routingDecisionPatch null (não duplica)", () => {
  const result = applyIntentPreservation({
    cognitiveTurn: makeCognitiveTurn("EXPLANATION_REQUEST"),
    routingDecision: makeRoutingDecision({ mode: "cognitive_anchor_hold" }),
    sessionContext: SESSION_WITH_ANCHOR,
    lastBestProduct: ANCHOR,
    contextResolution: makeContextResolution(GENERIC_DIRECT_REPLY),
  });

  assert("preservationApplied = true", result.preservationApplied === true);
  assert("routingDecisionPatch = null (mode já correto)", result.routingDecisionPatch === null);
  assert("contextResolutionPatch.directReply = null", result.contextResolutionPatch?.directReply === null);
  assert("modeUpgraded = false", result.metadata.intentPreservation.modeUpgraded === false);
});

// ─────────────────────────────────────────────────────────────
// CENÁRIO 11 — Âncora via sessionContext apenas
// ─────────────────────────────────────────────────────────────

test("11. Âncora apenas via sessionContext → preservação aplicada", () => {
  const result = applyIntentPreservation({
    cognitiveTurn: makeCognitiveTurn("EXPLANATION_REQUEST"),
    routingDecision: makeRoutingDecision(),
    sessionContext: SESSION_WITH_ANCHOR,
    lastBestProduct: null, // não explicitado
    contextResolution: makeContextResolution(GENERIC_DIRECT_REPLY),
  });

  assert("preservationApplied = true (âncora via sessionContext)", result.preservationApplied === true);
  assert("anchor correto na metadata", result.metadata.intentPreservation.anchor === ANCHOR.product_name);
});

// ─────────────────────────────────────────────────────────────
// CENÁRIO 12 — Campos obrigatórios sempre presentes
// ─────────────────────────────────────────────────────────────

test("12. Campos obrigatórios sempre presentes no output", () => {
  const result = applyIntentPreservation({
    cognitiveTurn: makeCognitiveTurn("EXPLANATION_REQUEST"),
    routingDecision: makeRoutingDecision(),
    sessionContext: SESSION_WITH_ANCHOR,
    lastBestProduct: ANCHOR,
    contextResolution: makeContextResolution(GENERIC_DIRECT_REPLY),
  });

  const requiredFields = [
    "preservedIntent",
    "preservationApplied",
    "preservationReason",
    "metadata",
    "contextResolutionPatch",
    "routingDecisionPatch",
  ];

  requiredFields.forEach(field => {
    assert(`campo '${field}' presente`, field in result);
  });

  const requiredMetaFields = ["active", "intent", "reason"];
  requiredMetaFields.forEach(field => {
    assert(`metadata.intentPreservation.${field} presente`, field in result.metadata.intentPreservation);
  });
});

// ─────────────────────────────────────────────────────────────
// CENÁRIO 13 — Reasons originais preservadas no routingDecisionPatch
// ─────────────────────────────────────────────────────────────

test("13. Reasons originais preservadas no routingDecisionPatch", () => {
  const rdComReasons = makeRoutingDecision({ reasons: ["original_reason_1"] });

  const result = applyIntentPreservation({
    cognitiveTurn: makeCognitiveTurn("EXPLANATION_REQUEST"),
    routingDecision: rdComReasons,
    sessionContext: SESSION_WITH_ANCHOR,
    lastBestProduct: ANCHOR,
    contextResolution: makeContextResolution(GENERIC_DIRECT_REPLY),
  });

  assert("preservationApplied = true", result.preservationApplied === true);
  assert(
    "reason original preservada",
    result.routingDecisionPatch?.reasons?.includes("original_reason_1")
  );
  assert(
    "nova reason de preservação adicionada",
    result.routingDecisionPatch?.reasons?.includes("intent_preservation_explanation_request_mode_upgrade")
  );
});

// ─────────────────────────────────────────────────────────────
// CENÁRIO 14 — hadDirectReply reportado corretamente na metadata
// ─────────────────────────────────────────────────────────────

test("14. hadDirectReply reportado corretamente na metadata", () => {
  const withReply = applyIntentPreservation({
    cognitiveTurn: makeCognitiveTurn("EXPLANATION_REQUEST"),
    routingDecision: makeRoutingDecision(),
    sessionContext: SESSION_WITH_ANCHOR,
    lastBestProduct: ANCHOR,
    contextResolution: makeContextResolution(GENERIC_DIRECT_REPLY),
  });

  const withoutReply = applyIntentPreservation({
    cognitiveTurn: makeCognitiveTurn("EXPLANATION_REQUEST"),
    routingDecision: makeRoutingDecision(),
    sessionContext: SESSION_WITH_ANCHOR,
    lastBestProduct: ANCHOR,
    contextResolution: makeContextResolution(null),
  });

  assert("hadDirectReply = true quando havia directReply", withReply.metadata.intentPreservation.hadDirectReply === true);
  assert("hadDirectReply = false quando não havia directReply", withoutReply.metadata.intentPreservation.hadDirectReply === false);
});

// ─────────────────────────────────────────────────────────────
// Sumário
// ─────────────────────────────────────────────────────────────

console.log("\n════════════════════════════════════════════");
console.log(`RESULTADO: ${passed} passaram / ${failed} falharam`);
if (errors.length > 0) {
  console.log("\nFALHAS:");
  errors.forEach(({ label, detail }) => console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`));
  process.exit(1);
} else {
  console.log("Todos os testes passaram.");
  process.exit(0);
}
