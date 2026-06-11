/**
 * Testes isolados do MIA Cognitive Final Audit
 * PATCH 5.1C / 5.2A
 *
 * Rodar: node scripts/test-mia-cognitive-audit.js
 *
 * Os testes validam apenas a lógica de auditoria.
 * Nenhum efeito no fluxo do backend.
 */

import { buildCognitiveFinalAudit } from "../lib/miaCognitiveAudit.js";

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

function expectContains(arr, item, label = "") {
  if (!Array.isArray(arr) || !arr.includes(item)) {
    throw new Error(
      `Expected array to contain ${JSON.stringify(item)}, got ${JSON.stringify(arr)}${label ? ` [${label}]` : ""}`
    );
  }
}

function expectNotContains(arr, item, label = "") {
  if (Array.isArray(arr) && arr.includes(item)) {
    throw new Error(
      `Expected array NOT to contain ${JSON.stringify(item)}, but it does${label ? ` [${label}]` : ""}`
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Mocks reutilizáveis
// ─────────────────────────────────────────────────────────────

const MOCK_COGNITIVE_EARLY_VALUE = {
  turnType: "VALUE_QUESTION",
  confidence: 0.83,
  reasons: ["value_question_detected", "anchor_active"],
  signals: { hasActiveAnchor: true },
  shadowOnly: true,
};

const MOCK_COGNITIVE_EARLY_REFINEMENT = {
  turnType: "REFINEMENT",
  confidence: 0.78,
  reasons: ["refinement_signal_detected"],
  signals: { hasActiveAnchor: true },
  shadowOnly: true,
};

const MOCK_ANCHOR_IPHONE = { product_name: "iPhone 13" };
const MOCK_ANCHOR_GALAXY = { product_name: "Galaxy S23 FE" };

// ─────────────────────────────────────────────────────────────
// Cenário 1 — VALUE_QUESTION + routing "refinement" → flag
// ─────────────────────────────────────────────────────────────

console.log("\n1. VALUE_QUESTION roteada como refinement → flag");

test("VALUE_QUESTION com routingMode=refinement → VALUE_QUESTION_REROUTED_AS_REFINEMENT", () => {
  const audit = buildCognitiveFinalAudit({
    cognitiveTurnEarly: MOCK_COGNITIVE_EARLY_VALUE,
    cognitiveTurnWithCso: MOCK_COGNITIVE_EARLY_VALUE,
    originalQuery: "vale a pena?",
    resolvedQuery: "iPhone 13 vale a pena para uso pesado",
    detectedIntent: "refinement",
    contextAction: "refinement",
    routingDecision: {
      mode: "refinement",
      permissions: { shouldPreserveAnchor: true, allowNewSearch: false },
    },
    responsePath: "context_decision_no_search",
    anchorBefore: MOCK_ANCHOR_IPHONE,
    finalSessionContext: { lastBestProduct: MOCK_ANCHOR_IPHONE },
    prices: [{ product_name: "iPhone 13", price: "R$ 2.999" }],
    reply: "O iPhone 13 é uma boa escolha para seu uso.",
    decisionSnapshot: { winner_verbalizado: "iPhone 13", divergences: [] },
  });

  expect(audit.shadowOnly, true, "shadowOnly");
  expect(audit.primaryCognitiveTurnType, "VALUE_QUESTION", "turnType");
  expectContains(audit.divergenceFlags, "VALUE_QUESTION_REROUTED_AS_REFINEMENT");
  expectContains(audit.divergenceFlags, "COGNITIVE_VS_ROUTING_MISMATCH");
  expect(audit.hasDivergence, true, "hasDivergence");
  console.log(`    (flags: ${audit.divergenceFlags.join(", ")})`);
});

// ─────────────────────────────────────────────────────────────
// Cenário 2 — Âncora preservada (mesmo produto antes e depois)
// ─────────────────────────────────────────────────────────────

console.log("\n2. Âncora preservada");

test("anchorBefore == finalWinner → anchorPreserved: true", () => {
  const audit = buildCognitiveFinalAudit({
    cognitiveTurnEarly: {
      turnType: "FOLLOW_UP", confidence: 0.75, reasons: ["follow_up"],
      signals: {}, shadowOnly: true,
    },
    originalQuery: "e a bateria?",
    resolvedQuery: "e a bateria?",
    detectedIntent: "refinement",
    contextAction: "analysis",
    routingDecision: {
      mode: "anchored_hold",
      permissions: { shouldPreserveAnchor: true, allowNewSearch: false },
    },
    responsePath: "return_seguro",
    anchorBefore: MOCK_ANCHOR_IPHONE,
    finalSessionContext: { lastBestProduct: MOCK_ANCHOR_IPHONE },
    prices: [{ product_name: "iPhone 13", price: "R$ 2.999" }],
    reply: "A bateria do iPhone 13 dura bem em uso normal.",
    decisionSnapshot: { winner_verbalizado: "iPhone 13", divergences: [] },
  });

  expect(audit.anchorPreserved, true, "anchorPreserved");
  expectNotContains(audit.divergenceFlags, "ANCHOR_EXPECTED_BUT_CHANGED");
  console.log(`    (anchorPreserved=true, divergenceFlags: [${audit.divergenceFlags.join(", ")}])`);
});

// ─────────────────────────────────────────────────────────────
// Cenário 3 — Âncora deveria ser preservada mas mudou → flag
// ─────────────────────────────────────────────────────────────

console.log("\n3. Âncora mudou indevidamente → flag");

test("shouldPreserveAnchor=true mas winner mudou → ANCHOR_EXPECTED_BUT_CHANGED", () => {
  const audit = buildCognitiveFinalAudit({
    cognitiveTurnEarly: MOCK_COGNITIVE_EARLY_REFINEMENT,
    originalQuery: "tem algo mais barato?",
    resolvedQuery: "tem algo mais barato?",
    detectedIntent: "refinement",
    contextAction: "refinement",
    routingDecision: {
      mode: "anchored_hold",
      permissions: { shouldPreserveAnchor: true, allowNewSearch: false },
    },
    responsePath: "return_seguro",
    anchorBefore: MOCK_ANCHOR_IPHONE,
    // Winner final foi diferente do anchor
    finalSessionContext: { lastBestProduct: MOCK_ANCHOR_GALAXY },
    prices: [{ product_name: "Galaxy S23 FE", price: "R$ 1.899" }],
    reply: "O Galaxy S23 FE é mais barato e mantém boa performance.",
    decisionSnapshot: { winner_verbalizado: "Galaxy S23 FE", divergences: [] },
  });

  expect(audit.anchorPreserved, false, "anchorPreserved");
  expectContains(audit.divergenceFlags, "ANCHOR_EXPECTED_BUT_CHANGED");
  expect(audit.hasDivergence, true, "hasDivergence");
  console.log(`    (flags: ${audit.divergenceFlags.join(", ")})`);
});

// ─────────────────────────────────────────────────────────────
// Cenário 4 — prices[0] diferente do texto → flag
// ─────────────────────────────────────────────────────────────

console.log("\n4. Card vs texto verbalizado divergem → flag");

test("prices[0]=iPhone mas texto menciona Galaxy → CARD_TEXT_WINNER_MISMATCH", () => {
  const audit = buildCognitiveFinalAudit({
    cognitiveTurnEarly: {
      turnType: "NEW_SEARCH", confidence: 0.82, reasons: ["new_search"],
      signals: {}, shadowOnly: true,
    },
    originalQuery: "celular até 2000",
    resolvedQuery: "celular até 2000",
    detectedIntent: "search",
    contextAction: "search",
    routingDecision: {
      mode: "new_search",
      permissions: { shouldPreserveAnchor: false, allowNewSearch: true },
    },
    responsePath: "return_seguro",
    anchorBefore: null,
    finalSessionContext: { lastBestProduct: { product_name: "Galaxy A55 5G" } },
    prices: [{ product_name: "iPhone 14", price: "R$ 3.999" }],
    reply: "O Galaxy A55 5G é a melhor opção para você.",
    // decisionSnapshot com winner_verbalizado detectado pela função existente
    decisionSnapshot: {
      winner_verbalizado: "Galaxy A55 5G",
      winner_exibido: "iPhone 14",
      divergences: ["winner_exibido_vs_verbalizado"],
    },
  });

  expectContains(audit.divergenceFlags, "CARD_TEXT_WINNER_MISMATCH");
  expect(audit.hasDivergence, true, "hasDivergence");
  console.log(`    (pricesFirst=${audit.pricesFirstProduct}, verbalizado=${audit.winnerVerbalizado})`);
  console.log(`    (flags: ${audit.divergenceFlags.join(", ")})`);
});

// ─────────────────────────────────────────────────────────────
// Cenário 5 — Dados insuficientes → não quebrar
// ─────────────────────────────────────────────────────────────

console.log("\n5. Sem dados suficientes → não quebrar");

test("audit sem dados → UNKNOWN_FINAL_PATH, não null, shadowOnly=true", () => {
  const audit = buildCognitiveFinalAudit();  // sem nenhum input
  if (audit === null || audit === undefined) {
    throw new Error("audit retornou null/undefined");
  }
  expect(audit.shadowOnly, true, "shadowOnly");
  expectContains(audit.divergenceFlags, "UNKNOWN_FINAL_PATH");
  expect(audit.auditVersion, "5.2B", "auditVersion");
  console.log(`    (divergenceFlags: ${audit.divergenceFlags.join(", ")})`);
});

test("audit com input parcial → não quebrar", () => {
  const audit = buildCognitiveFinalAudit({
    cognitiveTurnEarly: { turnType: "FOLLOW_UP", confidence: 0.7, reasons: [], signals: {}, shadowOnly: true },
    originalQuery: "e a câmera?",
    // sem routingDecision, sem prices, sem anchorBefore
  });
  if (!audit) throw new Error("retornou falsy");
  expect(audit.shadowOnly, true);
  expect(typeof audit.hasDivergence, "boolean");
  console.log(`    (turnType=${audit.primaryCognitiveTurnType}, flags: [${audit.divergenceFlags.join(", ")}])`);
});

// ─────────────────────────────────────────────────────────────
// Cenário 6 — Audit nunca altera input
// ─────────────────────────────────────────────────────────────

console.log("\n6. Auditoria não altera inputs");

test("buildCognitiveFinalAudit não muta os objetos de entrada", () => {
  const inputCognitive = {
    turnType: "VALUE_QUESTION",
    confidence: 0.83,
    reasons: ["value_question_detected"],
    signals: {},
    shadowOnly: true,
  };
  const inputAnchor = { product_name: "iPhone 13" };
  const inputPrices = [{ product_name: "iPhone 13", price: "R$ 2.999" }];
  const inputRoutingDecision = {
    mode: "anchored_hold",
    permissions: { shouldPreserveAnchor: true },
  };

  buildCognitiveFinalAudit({
    cognitiveTurnEarly: inputCognitive,
    anchorBefore: inputAnchor,
    prices: inputPrices,
    routingDecision: inputRoutingDecision,
    originalQuery: "vale a pena?",
  });

  // Nenhum input deve ter sido mutado
  expect(inputCognitive.turnType, "VALUE_QUESTION", "cognitive mutado");
  expect(inputAnchor.product_name, "iPhone 13", "anchor mutado");
  expect(inputPrices.length, 1, "prices mutado");
  expect(inputRoutingDecision.mode, "anchored_hold", "routingDecision mutado");
  console.log(`    (nenhum input mutado)`);
});

// ─────────────────────────────────────────────────────────────
// Cenário 7 — Audit nunca retorna null
// ─────────────────────────────────────────────────────────────

console.log("\n7. Audit nunca retorna null");

test("Várias entradas possíveis → nunca null", () => {
  const inputs = [
    undefined,
    {},
    { cognitiveTurnEarly: null },
    { routingDecision: null },
    { prices: null },
    { reply: "", prices: [], anchorBefore: null },
    { cognitiveTurnEarly: { turnType: "UNKNOWN", confidence: 0.35, reasons: [], signals: {}, shadowOnly: true } },
  ];
  for (const inp of inputs) {
    const result = buildCognitiveFinalAudit(inp);
    if (result === null || result === undefined) {
      throw new Error(`buildCognitiveFinalAudit(${JSON.stringify(inp)}) retornou null/undefined`);
    }
    if (result.shadowOnly !== true) {
      throw new Error("shadowOnly !== true");
    }
  }
  console.log(`    (${inputs.length} entradas testadas, nenhuma retornou null)`);
});

// ─────────────────────────────────────────────────────────────
// Cenário 8 — Caso limpo sem divergências
// ─────────────────────────────────────────────────────────────

console.log("\n8. Caso limpo sem divergências");

test("NEW_SEARCH com match correto → sem flags críticos", () => {
  const audit = buildCognitiveFinalAudit({
    cognitiveTurnEarly: {
      turnType: "NEW_SEARCH", confidence: 0.82,
      reasons: ["new_search_intent_detected", "budget_present"],
      signals: { hasActiveAnchor: false }, shadowOnly: true,
    },
    originalQuery: "celular até 1500",
    resolvedQuery: "celular até 1500",
    detectedIntent: "search",
    contextAction: "search",
    routingDecision: {
      mode: "new_search",
      permissions: { shouldPreserveAnchor: false, allowNewSearch: true },
    },
    responsePath: "return_seguro",
    anchorBefore: null,
    finalSessionContext: { lastBestProduct: { product_name: "Moto G84" } },
    prices: [{ product_name: "Moto G84", price: "R$ 1.299" }],
    reply: "O Moto G84 é uma boa escolha até R$ 1.500.",
    decisionSnapshot: {
      winner_verbalizado: "Moto G84",
      divergences: [],
    },
  });

  expect(audit.primaryCognitiveTurnType, "NEW_SEARCH");
  expectNotContains(audit.divergenceFlags, "ANCHOR_EXPECTED_BUT_CHANGED");
  expectNotContains(audit.divergenceFlags, "COGNITIVE_VS_ROUTING_MISMATCH");
  expectNotContains(audit.divergenceFlags, "CARD_TEXT_WINNER_MISMATCH");
  expect(audit.auditVersion, "5.2B");
  console.log(
    `    (turnType=${audit.primaryCognitiveTurnType}, responsePath=${audit.responsePath}, hasDivergence=${audit.hasDivergence})`
  );
});

// ─────────────────────────────────────────────────────────────
// Cenário 9 — Comparison follow-up perdida → flag
// ─────────────────────────────────────────────────────────────

console.log("\n9. COMPARISON_FOLLOWUP perdida → flag");

test("COMPARISON_FOLLOWUP com routing sem comparison → COMPARISON_FOLLOWUP_LOST", () => {
  const audit = buildCognitiveFinalAudit({
    cognitiveTurnEarly: {
      turnType: "COMPARISON_FOLLOWUP", confidence: 0.88,
      reasons: ["comparison_context_active"],
      signals: { hasComparisonContext: true }, shadowOnly: true,
    },
    originalQuery: "qual dos dois tem melhor câmera?",
    resolvedQuery: "qual dos dois tem melhor câmera?",
    detectedIntent: "refinement",
    contextAction: "analysis",
    routingDecision: {
      mode: "anchored_hold",
      permissions: { shouldPreserveAnchor: true, allowNewSearch: false },
    },
    responsePath: "context_decision_no_search",
    anchorBefore: { product_name: "iPhone 13" },
    finalSessionContext: { lastBestProduct: { product_name: "iPhone 13" } },
    prices: [{ product_name: "iPhone 13", price: "R$ 2.999" }],
    reply: "O iPhone 13 tem câmera melhor.",
    decisionSnapshot: { winner_verbalizado: "iPhone 13", divergences: [] },
  });

  expect(audit.primaryCognitiveTurnType, "COMPARISON_FOLLOWUP");
  expectContains(audit.divergenceFlags, "COMPARISON_FOLLOWUP_LOST");
  console.log(`    (flags: ${audit.divergenceFlags.join(", ")})`);
});

// ─────────────────────────────────────────────────────────────
// Cenário 10 — Campos de output obrigatórios sempre presentes
// ─────────────────────────────────────────────────────────────

console.log("\n10. Campos obrigatórios presentes");

test("Todos os campos obrigatórios estão no output", () => {
  const audit = buildCognitiveFinalAudit({
    cognitiveTurnEarly: MOCK_COGNITIVE_EARLY_VALUE,
    originalQuery: "vale a pena?",
    resolvedQuery: "iPhone 13 vale a pena?",
    detectedIntent: "context_analysis",
    routingDecision: { mode: "anchored_hold" },
    responsePath: "return_seguro",
    prices: [{ product_name: "iPhone 13" }],
    reply: "Sim, vale a pena.",
  });

  const requiredFields = [
    "originalQuery", "resolvedQuery",
    "cognitiveEarlyTurnType", "cognitiveCsoTurnType", "primaryCognitiveTurnType",
    "cognitiveEarlyConfidence", "cognitiveCsoConfidence",
    "cognitiveEarlyReasons", "cognitiveCsoReasons",
    "detectedIntent", "contextAction", "routingMode",
    "routingDecisionShouldPreserveAnchor", "routingDecisionAllowNewSearch",
    "responsePath", "anchorBefore", "finalWinner", "pricesFirstProduct",
    "winnerVerbalizado", "anchorPreserved",
    "divergenceFlags", "legacyDivergences", "hasDivergence",
    "shadowOnly", "auditVersion",
  ];

  for (const field of requiredFields) {
    if (!(field in audit)) {
      throw new Error(`Campo obrigatório ausente: "${field}"`);
    }
  }
  console.log(`    (${requiredFields.length} campos verificados)`);
});

// ─────────────────────────────────────────────────────────────
// Resultado final
// ─────────────────────────────────────────────────────────────

console.log("\n" + "─".repeat(56));
console.log(`RESULTADO: ${passed} passou | ${failed} falhou`);
if (failures.length > 0) {
  console.log("\nFalhas:");
  failures.forEach(({ label, error }) => {
    console.log(`  ✗ ${label}`);
    console.log(`    ${error}`);
  });
  process.exit(1);
} else {
  console.log("\nTodos os testes passaram. Cognitive Final Audit validado.");
  process.exit(0);
}
