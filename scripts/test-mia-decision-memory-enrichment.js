/**
 * Testes — PATCH 5.5 Decision Memory Enrichment
 *
 * Rodar: node scripts/test-mia-decision-memory-enrichment.js
 *
 * Cobre:
 *  A. buildExplanationContext — novos campos enriquecidos
 *  B. Preservação sem invenção de memória
 *  C. buildRichExplanationActivationAudit — campo decisionMemory
 *  D. Consistência entre campos relacionados
 */

import { buildExplanationContext } from "../lib/miaCognitiveExplanationPath.js";
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

function expectDeep(actual, expected, label = "") {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`Expected ${e}, got ${a}${label ? ` [${label}]` : ""}`);
  }
}

function expectTruthy(value, label = "") {
  if (!value) throw new Error(`Expected truthy, got ${JSON.stringify(value)}${label ? ` [${label}]` : ""}`);
}

function expectFalsy(value, label = "") {
  if (value) throw new Error(`Expected falsy, got ${JSON.stringify(value)}${label ? ` [${label}]` : ""}`);
}

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

const SESSION_FULL = {
  lastAxis: "bateria",
  lastMainConsequence: "dura o dia todo sem carregador",
  lastTradeoff: "Se desempenho pesado for prioridade, o modelo X oferece vantagem nesse eixo.",
  lastDecisionReason: "Escolhido por bateria: dura o dia todo sem carregador",
  lastWinnerAdvantages: ["bateria", "custo-benefício"],
  lastWinnerSacrifices: ["desempenho"],
  lastBestProduct: { product_name: "Samsung Galaxy A55" },
  lastPriority: "bateria",
};

const SESSION_PARTIAL = {
  lastAxis: "desempenho",
  lastMainConsequence: "apps abrem rápido, multitarefa fluida",
  lastTradeoff: "",
  lastDecisionReason: "",
  lastWinnerAdvantages: [],
  lastWinnerSacrifices: [],
  lastBestProduct: { product_name: "Xiaomi 14T" },
  lastPriority: "desempenho",
};

const SESSION_EMPTY = {};

const MOCK_ROUTING_ANCHOR_HOLD = {
  mode: "cognitive_anchor_hold",
  shouldPreserveAnchor: true,
  allowReplaceWinner: false,
};

// ─────────────────────────────────────────────────────────────
// Grupo A — buildExplanationContext com memória completa
// ─────────────────────────────────────────────────────────────

console.log("\n📦 Grupo A — buildExplanationContext com memória completa (PATCH 5.5)");

test("A01 — lastDecisionReason preenchido quando na sessão", () => {
  const ctx = buildExplanationContext(SESSION_FULL, "Samsung Galaxy A55", "bateria");
  expect(ctx.lastDecisionReason, "Escolhido por bateria: dura o dia todo sem carregador", "lastDecisionReason");
});

test("A02 — hasDecisionReason true quando preenchido", () => {
  const ctx = buildExplanationContext(SESSION_FULL);
  expectTruthy(ctx.hasDecisionReason, "hasDecisionReason");
});

test("A03 — lastWinnerAdvantages é array com dados da sessão", () => {
  const ctx = buildExplanationContext(SESSION_FULL);
  expectDeep(ctx.lastWinnerAdvantages, ["bateria", "custo-benefício"], "lastWinnerAdvantages");
});

test("A04 — winnerAdvantagesCount correto", () => {
  const ctx = buildExplanationContext(SESSION_FULL);
  expect(ctx.winnerAdvantagesCount, 2, "winnerAdvantagesCount");
});

test("A05 — lastWinnerSacrifices é array com dados da sessão", () => {
  const ctx = buildExplanationContext(SESSION_FULL);
  expectDeep(ctx.lastWinnerSacrifices, ["desempenho"], "lastWinnerSacrifices");
});

test("A06 — winnerSacrificesCount correto", () => {
  const ctx = buildExplanationContext(SESSION_FULL);
  expect(ctx.winnerSacrificesCount, 1, "winnerSacrificesCount");
});

test("A07 — campos pré-existentes preservados (lastAxis, lastConsequence, lastTradeoff)", () => {
  const ctx = buildExplanationContext(SESSION_FULL, "Samsung Galaxy A55", "bateria");
  expect(ctx.lastAxis, "bateria", "lastAxis");
  expect(ctx.lastConsequence, "dura o dia todo sem carregador", "lastConsequence");
  expectTruthy(ctx.lastTradeoff, "lastTradeoff");
});

test("A08 — hasAxis, hasConsequence, hasTradeoff preservados", () => {
  const ctx = buildExplanationContext(SESSION_FULL);
  expectTruthy(ctx.hasAxis, "hasAxis");
  expectTruthy(ctx.hasConsequence, "hasConsequence");
  expectTruthy(ctx.hasTradeoff, "hasTradeoff");
});

// ─────────────────────────────────────────────────────────────
// Grupo B — buildExplanationContext com memória parcial
// ─────────────────────────────────────────────────────────────

console.log("\n📦 Grupo B — buildExplanationContext com memória parcial (sem tradeoff/reason)");

test("B01 — lastDecisionReason vazio quando ausente na sessão", () => {
  const ctx = buildExplanationContext(SESSION_PARTIAL);
  expect(ctx.lastDecisionReason, "", "lastDecisionReason deve ser string vazia");
});

test("B02 — hasDecisionReason false quando ausente", () => {
  const ctx = buildExplanationContext(SESSION_PARTIAL);
  expectFalsy(ctx.hasDecisionReason, "hasDecisionReason deve ser false");
});

test("B03 — lastWinnerAdvantages é array vazio quando ausente", () => {
  const ctx = buildExplanationContext(SESSION_PARTIAL);
  expectDeep(ctx.lastWinnerAdvantages, [], "lastWinnerAdvantages");
});

test("B04 — lastWinnerSacrifices é array vazio quando ausente", () => {
  const ctx = buildExplanationContext(SESSION_PARTIAL);
  expectDeep(ctx.lastWinnerSacrifices, [], "lastWinnerSacrifices");
});

test("B05 — winnerAdvantagesCount é 0 quando ausente", () => {
  const ctx = buildExplanationContext(SESSION_PARTIAL);
  expect(ctx.winnerAdvantagesCount, 0, "winnerAdvantagesCount");
});

test("B06 — winnerSacrificesCount é 0 quando ausente", () => {
  const ctx = buildExplanationContext(SESSION_PARTIAL);
  expect(ctx.winnerSacrificesCount, 0, "winnerSacrificesCount");
});

test("B07 — hasTradeoff false quando lastTradeoff vazio", () => {
  const ctx = buildExplanationContext(SESSION_PARTIAL);
  expectFalsy(ctx.hasTradeoff, "hasTradeoff");
});

test("B08 — hasAxis e hasConsequence ainda true com sessão parcial", () => {
  const ctx = buildExplanationContext(SESSION_PARTIAL);
  expectTruthy(ctx.hasAxis, "hasAxis");
  expectTruthy(ctx.hasConsequence, "hasConsequence");
});

// ─────────────────────────────────────────────────────────────
// Grupo C — sem invenção de memória
// ─────────────────────────────────────────────────────────────

console.log("\n📦 Grupo C — Sem invenção de memória (sessão vazia)");

test("C01 — lastDecisionReason é string vazia com sessão vazia", () => {
  const ctx = buildExplanationContext(SESSION_EMPTY);
  expect(ctx.lastDecisionReason, "", "lastDecisionReason");
});

test("C02 — lastWinnerAdvantages é array vazio com sessão vazia", () => {
  const ctx = buildExplanationContext(SESSION_EMPTY);
  expectDeep(ctx.lastWinnerAdvantages, [], "lastWinnerAdvantages");
  expect(Array.isArray(ctx.lastWinnerAdvantages), true, "deve ser array");
});

test("C03 — lastWinnerSacrifices é array vazio com sessão vazia", () => {
  const ctx = buildExplanationContext(SESSION_EMPTY);
  expectDeep(ctx.lastWinnerSacrifices, [], "lastWinnerSacrifices");
  expect(Array.isArray(ctx.lastWinnerSacrifices), true, "deve ser array");
});

test("C04 — winnerAdvantagesCount é 0 com sessão vazia", () => {
  const ctx = buildExplanationContext(SESSION_EMPTY);
  expect(ctx.winnerAdvantagesCount, 0, "winnerAdvantagesCount");
});

test("C05 — winnerSacrificesCount é 0 com sessão vazia", () => {
  const ctx = buildExplanationContext(SESSION_EMPTY);
  expect(ctx.winnerSacrificesCount, 0, "winnerSacrificesCount");
});

test("C06 — nenhum campo undefined retornado", () => {
  const ctx = buildExplanationContext(SESSION_EMPTY);
  const newFields = ["lastDecisionReason", "lastWinnerAdvantages", "lastWinnerSacrifices",
                     "hasDecisionReason", "winnerAdvantagesCount", "winnerSacrificesCount"];
  for (const f of newFields) {
    if (ctx[f] === undefined) throw new Error(`Campo "${f}" retornou undefined`);
  }
});

test("C07 — não aceita valor não-array em lastWinnerAdvantages (usa [])", () => {
  const ctx = buildExplanationContext({ lastWinnerAdvantages: "string_inválida" });
  expectDeep(ctx.lastWinnerAdvantages, [], "lastWinnerAdvantages deve ser [] quando inválido");
});

test("C08 — não aceita valor não-array em lastWinnerSacrifices (usa [])", () => {
  const ctx = buildExplanationContext({ lastWinnerSacrifices: 42 });
  expectDeep(ctx.lastWinnerSacrifices, [], "lastWinnerSacrifices deve ser [] quando inválido");
});

// ─────────────────────────────────────────────────────────────
// Grupo D — buildRichExplanationActivationAudit com decisionMemory
// ─────────────────────────────────────────────────────────────

console.log("\n📦 Grupo D — decisionMemory no audit (PATCH 5.5)");

const CTX_RICH = {
  hasAxis: true,
  hasConsequence: true,
  hasTradeoff: true,
  hasDecisionReason: true,
  winnerAdvantagesCount: 3,
  winnerSacrificesCount: 1,
  lastAxis: "bateria",
  lastConsequence: "dura o dia todo",
  lastTradeoff: "tradeoff de desempenho",
};

const CTX_PARTIAL = {
  hasAxis: true,
  hasConsequence: true,
  hasTradeoff: false,
  hasDecisionReason: false,
  winnerAdvantagesCount: 0,
  winnerSacrificesCount: 0,
  lastAxis: "desempenho",
  lastConsequence: "apps rápidos",
  lastTradeoff: "",
};

test("D01 — decisionMemory presente no audit com ctx rico", () => {
  const audit = buildRichExplanationActivationAudit({
    richExplanationPathActivated: true,
    routingDecision: MOCK_ROUTING_ANCHOR_HOLD,
    explanationCtx: CTX_RICH,
    anchorProduct: { product_name: "Samsung Galaxy A55" },
    cognitiveTurn: { turnType: "EXPLANATION_REQUEST", confidence: 0.9 },
  });
  expectTruthy(audit.decisionMemory, "decisionMemory deve existir");
});

test("D02 — decisionMemory.hasLastTradeoff true com ctx rico", () => {
  const audit = buildRichExplanationActivationAudit({
    richExplanationPathActivated: true,
    routingDecision: MOCK_ROUTING_ANCHOR_HOLD,
    explanationCtx: CTX_RICH,
  });
  expectTruthy(audit.decisionMemory.hasLastTradeoff, "hasLastTradeoff");
});

test("D03 — decisionMemory.hasLastDecisionReason true com ctx rico", () => {
  const audit = buildRichExplanationActivationAudit({
    richExplanationPathActivated: true,
    routingDecision: MOCK_ROUTING_ANCHOR_HOLD,
    explanationCtx: CTX_RICH,
  });
  expectTruthy(audit.decisionMemory.hasLastDecisionReason, "hasLastDecisionReason");
});

test("D04 — decisionMemory.winnerAdvantagesCount correto", () => {
  const audit = buildRichExplanationActivationAudit({
    richExplanationPathActivated: true,
    routingDecision: MOCK_ROUTING_ANCHOR_HOLD,
    explanationCtx: CTX_RICH,
  });
  expect(audit.decisionMemory.winnerAdvantagesCount, 3, "winnerAdvantagesCount");
});

test("D05 — decisionMemory.winnerSacrificesCount correto", () => {
  const audit = buildRichExplanationActivationAudit({
    richExplanationPathActivated: true,
    routingDecision: MOCK_ROUTING_ANCHOR_HOLD,
    explanationCtx: CTX_RICH,
  });
  expect(audit.decisionMemory.winnerSacrificesCount, 1, "winnerSacrificesCount");
});

test("D06 — decisionMemory presente mesmo sem ctx (nunca undefined)", () => {
  const audit = buildRichExplanationActivationAudit({});
  expectTruthy(audit.decisionMemory !== undefined, "decisionMemory nunca undefined");
  expect(audit.decisionMemory.winnerAdvantagesCount, 0, "winnerAdvantagesCount default");
  expect(audit.decisionMemory.winnerSacrificesCount, 0, "winnerSacrificesCount default");
});

test("D07 — decisionMemory.hasLastTradeoff false com ctx parcial", () => {
  const audit = buildRichExplanationActivationAudit({
    richExplanationPathActivated: true,
    routingDecision: MOCK_ROUTING_ANCHOR_HOLD,
    explanationCtx: CTX_PARTIAL,
  });
  expectFalsy(audit.decisionMemory.hasLastTradeoff, "hasLastTradeoff deve ser false");
});

test("D08 — decisionMemory.hasLastDecisionReason false com ctx parcial", () => {
  const audit = buildRichExplanationActivationAudit({
    richExplanationPathActivated: true,
    routingDecision: MOCK_ROUTING_ANCHOR_HOLD,
    explanationCtx: CTX_PARTIAL,
  });
  expectFalsy(audit.decisionMemory.hasLastDecisionReason, "hasLastDecisionReason deve ser false");
});

test("D09 — auditVersion atualizada para 5.5", () => {
  const audit = buildRichExplanationActivationAudit({});
  expect(audit.auditVersion, "5.5", "auditVersion");
});

// ─────────────────────────────────────────────────────────────
// Grupo E — Compatibilidade retroativa (campos antigos não quebraram)
// ─────────────────────────────────────────────────────────────

console.log("\n📦 Grupo E — Compatibilidade retroativa");

test("E01 — campos antigos ainda presentes no retorno de buildExplanationContext", () => {
  const ctx = buildExplanationContext(SESSION_FULL, "Samsung Galaxy A55", "bateria");
  const legacyFields = ["anchorTitle", "lastAxis", "lastConsequence", "lastTradeoff",
                        "hasAxis", "hasConsequence", "hasTradeoff"];
  for (const f of legacyFields) {
    if (!(f in ctx)) throw new Error(`Campo legado "${f}" ausente`);
  }
});

test("E02 — campos antigos no audit ainda presentes", () => {
  const audit = buildRichExplanationActivationAudit({
    richExplanationPathActivated: true,
    routingDecision: MOCK_ROUTING_ANCHOR_HOLD,
    explanationCtx: CTX_RICH,
  });
  const legacyFields = ["hasLastAxis", "hasLastMainConsequence", "hasLastTradeoff",
                        "inputRichness", "lastAxis", "lastMainConsequencePreview",
                        "lastTradeoffPreview"];
  for (const f of legacyFields) {
    if (!(f in audit)) throw new Error(`Campo legado "${f}" ausente no audit`);
  }
});

test("E03 — inputRichness ainda calculado (0-3) corretamente", () => {
  const audit = buildRichExplanationActivationAudit({
    explanationCtx: CTX_RICH,
  });
  expect(audit.inputRichness, 3, "inputRichness deve ser 3 com ctx rico");
});

test("E04 — inputRichness 2 quando sem tradeoff", () => {
  const audit = buildRichExplanationActivationAudit({
    explanationCtx: CTX_PARTIAL,
  });
  expect(audit.inputRichness, 2, "inputRichness deve ser 2 com ctx parcial");
});

// ─────────────────────────────────────────────────────────────
// Resultado
// ─────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(55)}`);
console.log(`PATCH 5.5 — Decision Memory Enrichment`);
console.log(`Resultado: ${passed} passaram, ${failed} falharam`);

if (failures.length > 0) {
  console.log("\n❌ Falhas:");
  failures.forEach(({ label, error }) => {
    console.log(`  • ${label}`);
    console.log(`    ${error}`);
  });
  process.exit(1);
} else {
  console.log("✅ Todos os testes passaram.\n");
  process.exit(0);
}
