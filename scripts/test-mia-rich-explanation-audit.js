/**
 * Testes — MIA Rich Explanation Activation Audit (PATCH 5.3A)
 *
 * Rodar: node scripts/test-mia-rich-explanation-audit.js
 *
 * Cobre os 5 cenários obrigatórios:
 *  1. Rich explanation ativado com todos os campos presentes.
 *  2. Rich explanation não ativado por routingMode incorreto.
 *  3. Inputs vazios geram flag RICH_EXPLANATION_INPUTS_EMPTY.
 *  4. Correction override gera flag UNKNOWN_PRODUCT_CORRECTION_OVERRIDES_RICH_EXPLANATION.
 *  5. Audit nunca retorna null.
 */

import {
  buildRichExplanationActivationAudit,
  RICH_EXPLANATION_FLAGS,
} from "../lib/miaRichExplanationAudit.js";

// ─────────────────────────────────────────────────────────────
// Utilitário
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

function expectFlag(flags, flag) {
  if (!flags.includes(flag)) {
    throw new Error(`Flag "${flag}" ausente. Flags presentes: [${flags.join(", ")}]`);
  }
}

function expectNoFlag(flags, flag) {
  if (flags.includes(flag)) {
    throw new Error(`Flag "${flag}" presente mas não deveria estar. Flags: [${flags.join(", ")}]`);
  }
}

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

const MOCK_ANCHOR = { product_name: "Samsung Galaxy A55 5G", price: "R$ 1.899" };

const MOCK_COGNITIVE_EXPLANATION = {
  turnType: "EXPLANATION_REQUEST",
  confidence: 0.83,
  reasons: ["explanation_pattern_detected", "anchor_active"],
  shadowOnly: true,
};

const MOCK_ROUTING_ANCHOR_HOLD = {
  mode: "cognitive_anchor_hold",
  allowNewSearch: false,
  shouldPreserveAnchor: true,
  allowRerank: false,
};

const MOCK_EXPLANATION_CTX_RICH = {
  anchorTitle: "Samsung Galaxy A55 5G",
  lastAxis: "desempenho",
  lastConsequence: "menos travamento em uso pesado",
  lastTradeoff: "não é o mais barato da categoria",
  hasAxis: true,
  hasConsequence: true,
  hasTradeoff: true,
};

const MOCK_EXPLANATION_CTX_EMPTY = {
  anchorTitle: "produto recomendado",
  lastAxis: "",
  lastConsequence: "",
  lastTradeoff: "",
  hasAxis: false,
  hasConsequence: false,
  hasTradeoff: false,
};

// ─────────────────────────────────────────────────────────────
// Cenário 1 — Rich explanation ativado com todos os campos
// ─────────────────────────────────────────────────────────────

console.log("\n1. Rich explanation ATIVADO com contexto completo");

test("auditVersion é '5.5D'", () => {
  const audit = buildRichExplanationActivationAudit({
    richExplanationPathActivated: true,
    routingDecision: MOCK_ROUTING_ANCHOR_HOLD,
    cognitiveTurn: MOCK_COGNITIVE_EXPLANATION,
    anchorProduct: MOCK_ANCHOR,
    explanationCtx: MOCK_EXPLANATION_CTX_RICH,
    intentPreservationApplied: true,
    contextModeSelected: "explanation_anchored",
    finalReply: "Eu recomendei o Galaxy A55 porque...",
  });
  expect(audit.auditVersion, "5.5D", "auditVersion");
});

test("shouldUseRichExplanationPath = true", () => {
  const audit = buildRichExplanationActivationAudit({
    richExplanationPathActivated: true,
    routingDecision: MOCK_ROUTING_ANCHOR_HOLD,
    cognitiveTurn: MOCK_COGNITIVE_EXPLANATION,
    anchorProduct: MOCK_ANCHOR,
    explanationCtx: MOCK_EXPLANATION_CTX_RICH,
    intentPreservationApplied: true,
    contextModeSelected: "explanation_anchored",
  });
  expect(audit.shouldUseRichExplanationPath, true, "shouldUseRichExplanationPath");
  expectFlag(audit.flags, RICH_EXPLANATION_FLAGS.ACTIVATED);
  expectNoFlag(audit.flags, RICH_EXPLANATION_FLAGS.NOT_ACTIVATED);
});

test("campos de âncora preenchidos corretamente", () => {
  const audit = buildRichExplanationActivationAudit({
    richExplanationPathActivated: true,
    routingDecision: MOCK_ROUTING_ANCHOR_HOLD,
    anchorProduct: MOCK_ANCHOR,
    explanationCtx: MOCK_EXPLANATION_CTX_RICH,
  });
  expect(audit.hasAnchor, true, "hasAnchor");
  expect(audit.anchorName, "Samsung Galaxy A55 5G", "anchorName");
  expect(audit.routingMode, "cognitive_anchor_hold", "routingMode");
});

test("campos de contexto ricos preenchidos corretamente (inputRichness = 3)", () => {
  const audit = buildRichExplanationActivationAudit({
    richExplanationPathActivated: true,
    explanationCtx: MOCK_EXPLANATION_CTX_RICH,
  });
  expect(audit.hasLastAxis, true, "hasLastAxis");
  expect(audit.hasLastMainConsequence, true, "hasLastMainConsequence");
  expect(audit.hasLastTradeoff, true, "hasLastTradeoff");
  expect(audit.inputRichness, 3, "inputRichness");
  expectNoFlag(audit.flags, RICH_EXPLANATION_FLAGS.INPUTS_EMPTY);
  expectNoFlag(audit.flags, RICH_EXPLANATION_FLAGS.INPUTS_PARTIAL);
  console.log(`    (inputRichness=${audit.inputRichness}/3 — contexto completo)`);
});

test("finalReplyPreview limitado a 100 chars", () => {
  const longReply = "A".repeat(200);
  const audit = buildRichExplanationActivationAudit({ finalReply: longReply });
  if (!audit.finalReplyPreview || audit.finalReplyPreview.length > 100) {
    throw new Error(`finalReplyPreview deve ser limitado a 100 chars, got length=${audit.finalReplyPreview?.length}`);
  }
});

// ─────────────────────────────────────────────────────────────
// Cenário 2 — Rich explanation NÃO ativado por routingMode incorreto
// ─────────────────────────────────────────────────────────────

console.log("\n2. Rich explanation NÃO ativado — routingMode incorreto");

test("mode=context_hold → NOT_ACTIVATED + ROUTING_MODE_NOT_COGNITIVE_ANCHOR_HOLD", () => {
  const audit = buildRichExplanationActivationAudit({
    richExplanationPathActivated: false,
    routingDecision: { mode: "context_hold" },
    cognitiveTurn: MOCK_COGNITIVE_EXPLANATION,
    anchorProduct: MOCK_ANCHOR,
    explanationCtx: MOCK_EXPLANATION_CTX_RICH,
    intentPreservationApplied: false,
  });
  expect(audit.shouldUseRichExplanationPath, false, "shouldUseRichExplanationPath");
  expectFlag(audit.flags, RICH_EXPLANATION_FLAGS.NOT_ACTIVATED);
  expectFlag(audit.flags, RICH_EXPLANATION_FLAGS.ROUTING_MODE_NOT_ANCHOR_HOLD);
  expectNoFlag(audit.flags, RICH_EXPLANATION_FLAGS.ACTIVATED);
  console.log(`    (flags: ${audit.flags.join(", ")})`);
});

test("mode=context_hold → explanationPathReason indica o mode real", () => {
  const audit = buildRichExplanationActivationAudit({
    richExplanationPathActivated: false,
    routingDecision: { mode: "context_hold" },
    anchorProduct: MOCK_ANCHOR,
  });
  if (!audit.explanationPathReason.includes("context_hold")) {
    throw new Error(`explanationPathReason deve mencionar context_hold, got: "${audit.explanationPathReason}"`);
  }
});

test("hasCriticalFlag = true quando NOT_ACTIVATED + ROUTING_MODE incorreto", () => {
  const audit = buildRichExplanationActivationAudit({
    richExplanationPathActivated: false,
    routingDecision: { mode: "context_hold" },
    anchorProduct: MOCK_ANCHOR,
    intentPreservationApplied: false,
  });
  expect(audit.hasCriticalFlag, true, "hasCriticalFlag");
});

test("turnType ≠ EXPLANATION_REQUEST → flag COGNITIVE_TURN_NOT_EXPLANATION_REQUEST", () => {
  const audit = buildRichExplanationActivationAudit({
    richExplanationPathActivated: false,
    routingDecision: { mode: "context_hold" },
    cognitiveTurn: { turnType: "VALUE_QUESTION", confidence: 0.83 },
    anchorProduct: MOCK_ANCHOR,
  });
  expectFlag(audit.flags, RICH_EXPLANATION_FLAGS.COGNITIVE_TURN_NOT_EXPLANATION);
  console.log(`    (flag COGNITIVE_TURN_NOT_EXPLANATION_REQUEST presente)`);
});

test("sem âncora → flag ANCHOR_MISSING", () => {
  const audit = buildRichExplanationActivationAudit({
    richExplanationPathActivated: false,
    routingDecision: { mode: "context_hold" },
    anchorProduct: null,
  });
  expectFlag(audit.flags, RICH_EXPLANATION_FLAGS.ANCHOR_MISSING);
  console.log(`    (flag ANCHOR_MISSING presente)`);
});

// ─────────────────────────────────────────────────────────────
// Cenário 3 — Inputs vazios → RICH_EXPLANATION_INPUTS_EMPTY
// ─────────────────────────────────────────────────────────────

console.log("\n3. Inputs de contexto vazios geram flag INPUTS_EMPTY");

test("explanationCtx vazio → RICH_EXPLANATION_INPUTS_EMPTY", () => {
  const audit = buildRichExplanationActivationAudit({
    richExplanationPathActivated: true,
    routingDecision: MOCK_ROUTING_ANCHOR_HOLD,
    anchorProduct: MOCK_ANCHOR,
    explanationCtx: MOCK_EXPLANATION_CTX_EMPTY,
  });
  expectFlag(audit.flags, RICH_EXPLANATION_FLAGS.INPUTS_EMPTY);
  expect(audit.inputRichness, 0, "inputRichness deve ser 0");
  console.log(`    (inputRichness=0, flag INPUTS_EMPTY presente)`);
});

test("explanationCtx parcial (só axis) → RICH_EXPLANATION_INPUTS_PARTIAL", () => {
  const audit = buildRichExplanationActivationAudit({
    richExplanationPathActivated: true,
    explanationCtx: {
      lastAxis: "desempenho",
      lastConsequence: "",
      lastTradeoff: "",
      hasAxis: true,
      hasConsequence: false,
      hasTradeoff: false,
    },
  });
  expectFlag(audit.flags, RICH_EXPLANATION_FLAGS.INPUTS_PARTIAL);
  expectNoFlag(audit.flags, RICH_EXPLANATION_FLAGS.INPUTS_EMPTY);
  expect(audit.inputRichness, 1, "inputRichness");
  console.log(`    (inputRichness=1, flag INPUTS_PARTIAL presente)`);
});

test("sem explanationCtx → seguro (não lança exceção)", () => {
  const audit = buildRichExplanationActivationAudit({
    richExplanationPathActivated: true,
    explanationCtx: {},
  });
  expectFlag(audit.flags, RICH_EXPLANATION_FLAGS.INPUTS_EMPTY);
  expect(audit.inputRichness, 0, "inputRichness com ctx vazio");
});

// ─────────────────────────────────────────────────────────────
// Cenário 4 — Guard anti-alucinação sobrescreve resposta rica
// ─────────────────────────────────────────────────────────────

console.log("\n4. Guard anti-alucinação sobrescreve rich explanation");

test("unknownProductCorrectionApplied=true + richPath ativado → CORRECTION_OVERRIDES flag", () => {
  const audit = buildRichExplanationActivationAudit({
    richExplanationPathActivated: true,
    routingDecision: MOCK_ROUTING_ANCHOR_HOLD,
    anchorProduct: MOCK_ANCHOR,
    explanationCtx: MOCK_EXPLANATION_CTX_RICH,
    unknownProductCorrectionApplied: true,
    finalReply: "Sobre o Galaxy A55 5G, mantendo o que já vimos...",
  });
  expectFlag(audit.flags, RICH_EXPLANATION_FLAGS.CORRECTION_OVERRIDES);
  expectNoFlag(audit.flags, RICH_EXPLANATION_FLAGS.CORRECTION_APPLIED);
  expect(audit.unknownProductCorrectionApplied, true);
  expect(audit.responseMentionsUnknownProduct, true);
  expect(audit.hasCriticalFlag, true, "hasCriticalFlag deve ser true");
  console.log(`    (flag CORRECTION_OVERRIDES + hasCriticalFlag=true)`);
});

test("unknownProductCorrectionApplied=true + richPath NÃO ativado → só CORRECTION_APPLIED", () => {
  const audit = buildRichExplanationActivationAudit({
    richExplanationPathActivated: false,
    routingDecision: { mode: "context_hold" },
    anchorProduct: MOCK_ANCHOR,
    explanationCtx: MOCK_EXPLANATION_CTX_RICH,
    unknownProductCorrectionApplied: true,
  });
  expectFlag(audit.flags, RICH_EXPLANATION_FLAGS.CORRECTION_APPLIED);
  expectNoFlag(audit.flags, RICH_EXPLANATION_FLAGS.CORRECTION_OVERRIDES);
});

test("unknownProductCorrectionApplied=false → nenhuma flag de correction", () => {
  const audit = buildRichExplanationActivationAudit({
    richExplanationPathActivated: true,
    explanationCtx: MOCK_EXPLANATION_CTX_RICH,
    unknownProductCorrectionApplied: false,
  });
  expectNoFlag(audit.flags, RICH_EXPLANATION_FLAGS.CORRECTION_OVERRIDES);
  expectNoFlag(audit.flags, RICH_EXPLANATION_FLAGS.CORRECTION_APPLIED);
});

// ─────────────────────────────────────────────────────────────
// Cenário 5 — Audit nunca retorna null
// ─────────────────────────────────────────────────────────────

console.log("\n5. Audit nunca retorna null — inputs variados");

test("input vazio → não retorna null, retorna objeto válido", () => {
  const audit = buildRichExplanationActivationAudit();
  if (audit === null || audit === undefined) throw new Error("retornou null/undefined");
  if (typeof audit !== "object") throw new Error("não retornou objeto");
  expect(audit.auditVersion, "5.5D");
});

test("input null → não lança exceção, retorna objeto válido", () => {
  let audit;
  try {
    audit = buildRichExplanationActivationAudit(null);
  } catch (err) {
    throw new Error(`Lançou exceção com null: ${err.message}`);
  }
  if (!audit) throw new Error("retornou falsy com null input");
});

test("campos obrigatórios sempre presentes", () => {
  const requiredFields = [
    "auditVersion", "originalQuery", "resolvedQuery",
    "cognitiveTurnType", "cognitiveConfidence",
    "routingMode", "contextAction", "intent",
    "hasAnchor", "anchorName",
    "intentPreservationApplied", "cognitiveAuthorityApplied",
    "shouldUseRichExplanationPath", "explanationPathReason", "contextModeSelected",
    "hasLastAxis", "hasLastMainConsequence", "hasLastTradeoff", "inputRichness",
    "lastAxis", "lastMainConsequencePreview", "lastTradeoffPreview",
    "responseMentionsUnknownProduct", "unknownProductCorrectionApplied",
    "finalReplyPreview", "flags", "hasCriticalFlag",
  ];
  const audit = buildRichExplanationActivationAudit({
    richExplanationPathActivated: true,
    routingDecision: MOCK_ROUTING_ANCHOR_HOLD,
    cognitiveTurn: MOCK_COGNITIVE_EXPLANATION,
    anchorProduct: MOCK_ANCHOR,
    explanationCtx: MOCK_EXPLANATION_CTX_RICH,
  });
  for (const field of requiredFields) {
    if (!(field in audit)) {
      throw new Error(`Campo obrigatório ausente: "${field}"`);
    }
  }
  console.log(`    (${requiredFields.length} campos verificados)`);
});

test("flags sempre é um array (mesmo com inputs mínimos)", () => {
  const inputs = [{}, { richExplanationPathActivated: true }, { routingDecision: null }];
  for (const input of inputs) {
    const audit = buildRichExplanationActivationAudit(input);
    if (!Array.isArray(audit.flags)) {
      throw new Error(`flags não é array para input: ${JSON.stringify(input)}`);
    }
  }
});

test("queryPreview nunca excede 120 chars", () => {
  const longQuery = "Q".repeat(300);
  const audit = buildRichExplanationActivationAudit({
    originalQuery: longQuery,
    resolvedQuery: longQuery,
  });
  if (audit.originalQuery.length > 120) {
    throw new Error(`originalQuery excede 120: length=${audit.originalQuery.length}`);
  }
  if (audit.resolvedQuery.length > 120) {
    throw new Error(`resolvedQuery excede 120: length=${audit.resolvedQuery.length}`);
  }
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
  console.log("\nTodos os testes passaram. Rich Explanation Audit validado.");
  process.exit(0);
}
