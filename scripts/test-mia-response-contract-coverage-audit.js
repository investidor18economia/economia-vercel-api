/**
 * PATCH 6.4 — Response Contract Coverage Audit — Test Suite
 *
 * Valida a cobertura semântica dos contratos de resposta criados no Patch 6.
 * Usa classifyMiaTurn para testar variações reais de intenção e verifica
 * se chegam ao contrato correto.
 *
 * Famílias auditadas:
 *   - CONFIDENCE_CHALLENGE   → confidence_challenge_defense   (10 variações)
 *   - EXPLANATION_REQUEST    → explanation_anchored            (12 variações)
 *   - OBJECTION_PRICE        → objection_response_contract     (14 variações)
 *   - REFINEMENT             → refinement_followup_response    (14 variações)
 *   - PRIORITY_SHIFT         → (sem contrato ainda)            (18 variações)
 *   - ACKNOWLEDGEMENT        → decision_generic                (10 variações)
 *
 * Total: 78 casos de variação semântica.
 *
 * INVARIANTE: este teste é auditoria pura — não altera comportamento.
 */

import { classifyMiaTurn } from "../lib/miaCognitiveRouter.js";
import {
  buildResponseContractCoverageAudit,
  buildCoverageMatrixReport,
  deriveActivatedContract,
  COVERAGE_FLAGS,
  FAMILY_CONTRACT_MAP,
} from "../lib/miaResponseContractCoverageAudit.js";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(description, fn) {
  try {
    fn();
    console.log(`  ✓ ${description}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${description}\n    → ${err.message}`);
    failed++;
  }
}

function expect(actual, expected, message = "") {
  if (actual !== expected) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}. ${message}`);
  }
}

function expectTrue(val, message = "")  { expect(val, true, message); }
function expectFalse(val, message = "") { expect(val, false, message); }

function expectIncludes(arr, value, message = "") {
  if (!Array.isArray(arr) || !arr.includes(value)) {
    throw new Error(`Expected array to include ${JSON.stringify(value)}. Array: ${JSON.stringify(arr)}. ${message}`);
  }
}

function expectNotIncludes(arr, value, message = "") {
  if (Array.isArray(arr) && arr.includes(value)) {
    throw new Error(`Expected array NOT to include ${JSON.stringify(value)}. ${message}`);
  }
}

// ─────────────────────────────────────────────────────────────
// Contexto compartilhado para as chamadas de classificação
// ─────────────────────────────────────────────────────────────

const ANCHOR_PRODUCT = "Galaxy S24 FE";

// Mensagens de conversa simulando contexto com recomendação ativa
const MESSAGES_WITH_ANCHOR = [
  { role: "user",      content: "qual o melhor celular até R$2500?" },
  { role: "assistant", content: `O ${ANCHOR_PRODUCT} é a minha recomendação. Ótimo equilíbrio entre performance, câmera e bateria.` },
];

const SESSION_WITH_ANCHOR = {
  lastCategory:    "celular",
  lastBestProduct: { product_name: ANCHOR_PRODUCT },
  lastProducts:    [{ product_name: ANCHOR_PRODUCT }],
  lastPriority:    "custo-benefício",
};

// Routing decision simulando anchor hold (EXPLANATION_REQUEST)
const ROUTING_ANCHOR_HOLD = { mode: "cognitive_anchor_hold", allowReplaceWinner: false, shouldPreserveAnchor: true, allowNewSearch: false };
// Routing decision para OBJECTION e REFINEMENT
const ROUTING_OBJECTION = { mode: "anchored_objection_hold", allowReplaceWinner: false, shouldPreserveAnchor: true, allowNewSearch: false };
const ROUTING_REFINEMENT = { mode: "anchored_reaction", allowReplaceWinner: false, shouldPreserveAnchor: true, allowNewSearch: false };
// Routing sem contrato específico
const ROUTING_GENERIC = { mode: "decision_generic", allowReplaceWinner: false, shouldPreserveAnchor: true, allowNewSearch: false };

/**
 * Classifica uma query e constrói o audit de cobertura.
 */
function auditVariation({
  query,
  expectedSemanticFamily,
  routingDecision = ROUTING_GENERIC,
  messages        = MESSAGES_WITH_ANCHOR,
  sessionContext  = SESSION_WITH_ANCHOR,
}) {
  const cognitiveTurn = classifyMiaTurn({
    query,
    originalQuery:    query,
    messages,
    sessionContext,
    contextResolution: {},
    detectedIntent:    "decision",
    contextAction:     "decision",
    hasActiveAnchor:   true,
    lastBestProduct:   SESSION_WITH_ANCHOR.lastBestProduct,
    comparisonContext: { locked: false, products: [] },
    cso:               null,
  });

  const subtype = cognitiveTurn?.signals?.decisionExplanation?.subtype ?? null;

  const audit = buildResponseContractCoverageAudit({
    originalQuery:           query,
    expectedSemanticFamily,
    actualCognitiveTurnType: cognitiveTurn?.turnType ?? null,
    cognitiveSubtype:        subtype,
    hasActiveAnchor:         true,
    routingDecision,
    winnerNameAnchor:        ANCHOR_PRODUCT,
  });

  return { cognitiveTurn, audit };
}

// ─────────────────────────────────────────────────────────────
// Coleta global para o relatório de cobertura
// ─────────────────────────────────────────────────────────────
const allAudits = [];

// ─────────────────────────────────────────────────────────────
// GRUPO 1 — Validação do módulo de audit (estrutura e flags)
// ─────────────────────────────────────────────────────────────
console.log("\n— Grupo 1: Validação da estrutura do módulo —");

test("1: buildResponseContractCoverageAudit retorna objeto com campos obrigatórios", () => {
  const audit = buildResponseContractCoverageAudit({
    originalQuery:           "acho caro",
    expectedSemanticFamily:  "OBJECTION_PRICE",
    actualCognitiveTurnType: "OBJECTION",
    hasActiveAnchor:         true,
    routingDecision:         ROUTING_OBJECTION,
    winnerNameAnchor:        ANCHOR_PRODUCT,
  });
  expect(typeof audit.contractCoverageOk, "boolean", "contractCoverageOk deve ser boolean");
  expect(typeof audit.escapedAtStage, "string", "escapedAtStage deve ser string");
  expect(Array.isArray(audit.flags), true, "flags deve ser array");
  expect(Array.isArray(audit.expectedForbiddenBehaviors), true, "expectedForbiddenBehaviors deve ser array");
});

test("2: Coverage OK quando turnType e contrato batem", () => {
  const audit = buildResponseContractCoverageAudit({
    expectedSemanticFamily:  "OBJECTION_PRICE",
    actualCognitiveTurnType: "OBJECTION",
    hasActiveAnchor:         true,
    routingDecision:         ROUTING_OBJECTION,
  });
  expectTrue(audit.contractCoverageOk, "cobertura deve ser ok");
  expectIncludes(audit.flags, COVERAGE_FLAGS.CONTRACT_COVERAGE_OK);
});

test("3: COGNITIVE_TURN_MISMATCH quando turnType errado", () => {
  const audit = buildResponseContractCoverageAudit({
    expectedSemanticFamily:  "OBJECTION_PRICE",
    actualCognitiveTurnType: "CONVERSATIONAL",  // errado
    hasActiveAnchor:         true,
    routingDecision:         ROUTING_OBJECTION,
  });
  expectFalse(audit.contractCoverageOk);
  expectIncludes(audit.flags, COVERAGE_FLAGS.COGNITIVE_TURN_MISMATCH);
  expectIncludes(audit.flags, COVERAGE_FLAGS.OBJECTION_NOT_RECOGNIZED);
  expect(audit.escapedAtStage, "cognitive_router");
});

test("4: WRONG_CONTRACT_ACTIVATED quando routing em mode errado (decision_generic em vez de cognitive_anchor_hold)", () => {
  // EXPLANATION_REQUEST com mode="decision_generic" → deriveActivatedContract retorna "decision_generic"
  // (não é null, então é WRONG_CONTRACT_ACTIVATED e não CONTRACT_NOT_ACTIVATED)
  const audit = buildResponseContractCoverageAudit({
    expectedSemanticFamily:  "EXPLANATION_REQUEST",
    actualCognitiveTurnType: "EXPLANATION_REQUEST",
    hasActiveAnchor:         true,
    routingDecision:         { mode: "decision_generic" },  // não ativa rich explanation
  });
  expectFalse(audit.contractCoverageOk);
  expectIncludes(audit.flags, COVERAGE_FLAGS.WRONG_CONTRACT_ACTIVATED);
  expect(audit.escapedAtStage, "prompt_contract");
});

test("5: DIRECT_REPLY_EARLY_BYPASS detectado", () => {
  const audit = buildResponseContractCoverageAudit({
    expectedSemanticFamily:  "REFINEMENT",
    actualCognitiveTurnType: "REFINEMENT",
    hasActiveAnchor:         true,
    directReplyBypassed:     true,
    routingDecision:         ROUTING_REFINEMENT,
  });
  expectFalse(audit.contractCoverageOk);
  expectIncludes(audit.flags, COVERAGE_FLAGS.DIRECT_REPLY_EARLY_BYPASS);
  expect(audit.escapedAtStage, "direct_reply_early");
});

test("6: WELCOME_FALLBACK_LEAK detectado na final reply", () => {
  const audit = buildResponseContractCoverageAudit({
    expectedSemanticFamily:  "REFINEMENT",
    actualCognitiveTurnType: "REFINEMENT",
    hasActiveAnchor:         true,
    routingDecision:         ROUTING_REFINEMENT,
    finalReply:              "Posso te ajudar com compras, comparacao de produtos.",
    winnerNameAnchor:        ANCHOR_PRODUCT,
  });
  expectFalse(audit.contractCoverageOk);
  expectIncludes(audit.flags, COVERAGE_FLAGS.WELCOME_FALLBACK_LEAK);
  expect(audit.escapedAtStage, "final_response");
});

test("7: deriveActivatedContract funciona corretamente para confidence_challenge", () => {
  const contract = deriveActivatedContract("EXPLANATION_REQUEST", "confidence_challenge", true, "cognitive_anchor_hold");
  expect(contract, "confidence_challenge_defense");
});

test("8: deriveActivatedContract funciona para OBJECTION", () => {
  const contract = deriveActivatedContract("OBJECTION", null, true, "anchored_objection_hold");
  expect(contract, "objection_response_contract");
});

test("9: deriveActivatedContract funciona para REFINEMENT", () => {
  const contract = deriveActivatedContract("REFINEMENT", null, true, "anchored_reaction");
  expect(contract, "refinement_followup_response_contract");
});

test("10: buildCoverageMatrixReport agrega resultados corretamente", () => {
  const fakeAudits = [
    { expectedSemanticFamily: "OBJECTION_PRICE", contractCoverageOk: true },
    { expectedSemanticFamily: "OBJECTION_PRICE", contractCoverageOk: false, escapedAtStage: "cognitive_router", flags: [COVERAGE_FLAGS.OBJECTION_NOT_RECOGNIZED], originalQuery: "test", actualCognitiveTurnType: "CONVERSATIONAL" },
    { expectedSemanticFamily: "REFINEMENT", contractCoverageOk: true },
  ];
  const report = buildCoverageMatrixReport(fakeAudits);
  expect(report.total, 3);
  expect(report.covered, 2);
  expect(report.gaps, 1);
  expect(report.byFamily["OBJECTION_PRICE"].total, 2);
  expect(report.byFamily["OBJECTION_PRICE"].covered, 1);
});

// ─────────────────────────────────────────────────────────────
// GRUPO 2 — CONFIDENCE_CHALLENGE (10 variações semânticas)
// Esperado: EXPLANATION_REQUEST com subtype confidence_challenge
// Contrato: confidence_challenge_defense
// ─────────────────────────────────────────────────────────────
console.log("\n— Grupo 2: CONFIDENCE_CHALLENGE — 10 variações semânticas —");

const CC_VARIATIONS = [
  "você realmente confia nessa recomendação?",
  "você manteria essa escolha?",
  "essa continua sendo sua primeira opção?",
  "você compraria esse?",
  "se fosse seu dinheiro, iria nele?",
  "você bancaria essa decisão?",
  "não está forçando essa escolha?",
  "dá pra confiar mesmo?",
  "continua valendo sua recomendação?",
  "você sustenta essa escolha?",
];

for (const variation of CC_VARIATIONS) {
  const { cognitiveTurn, audit } = auditVariation({
    query: variation,
    expectedSemanticFamily: "CONFIDENCE_CHALLENGE",
    routingDecision: ROUTING_ANCHOR_HOLD,
  });
  allAudits.push(audit);

  test(`CC: "${variation}" → turnType=${cognitiveTurn?.turnType}, subtype=${cognitiveTurn?.signals?.decisionExplanation?.subtype ?? "-"}`, () => {
    // Apenas valida que a classificação retornou algo (não impõe resultado)
    // O report final indicará gaps
    expect(typeof audit.contractCoverageOk, "boolean", "audit deve retornar boolean");
    expect(typeof audit.escapedAtStage, "string", "escapedAtStage deve ser string");
  });
}

// ─────────────────────────────────────────────────────────────
// GRUPO 3 — EXPLANATION_REQUEST (12 variações semânticas)
// Esperado: EXPLANATION_REQUEST
// Contrato: explanation_anchored
// ─────────────────────────────────────────────────────────────
console.log("\n— Grupo 3: EXPLANATION_REQUEST — 12 variações semânticas —");

const EXP_VARIATIONS = [
  "o que fez ele ganhar?",
  "por que ele ficou em primeiro?",
  "qual foi o diferencial?",
  "o que pesou mais?",
  "o que pesou na decisão?",
  "por que escolheu ele?",
  "qual foi o fator decisivo?",
  "o que te levou a recomendar esse?",
  "qual a lógica dessa escolha?",
  "o que ele faz melhor?",
  "por que esse e não outro?",
  "me explica o raciocínio",
];

for (const variation of EXP_VARIATIONS) {
  const { cognitiveTurn, audit } = auditVariation({
    query: variation,
    expectedSemanticFamily: "EXPLANATION_REQUEST",
    routingDecision: ROUTING_ANCHOR_HOLD,
  });
  allAudits.push(audit);

  test(`EXP: "${variation}" → turnType=${cognitiveTurn?.turnType}`, () => {
    expect(typeof audit.contractCoverageOk, "boolean");
  });
}

// ─────────────────────────────────────────────────────────────
// GRUPO 4 — OBJECTION_PRICE (14 variações semânticas)
// Esperado: OBJECTION
// Contrato: objection_response_contract
// ─────────────────────────────────────────────────────────────
console.log("\n— Grupo 4: OBJECTION_PRICE — 14 variações semânticas —");

const OBJ_VARIATIONS = [
  "esse valor me incomoda",
  "não queria gastar tudo isso",
  "ficou salgado",
  "tá salgado",
  "pesou no bolso",
  "ficou acima do que eu esperava",
  "passou do meu orçamento",
  "estourou meu limite",
  "não sei se vale esse preço",
  "tá puxado",
  "está caro para mim",
  "não queria chegar nesse valor",
  "queria gastar menos",
  "preço ficou pesado",
];

for (const variation of OBJ_VARIATIONS) {
  const { cognitiveTurn, audit } = auditVariation({
    query: variation,
    expectedSemanticFamily: "OBJECTION_PRICE",
    routingDecision: ROUTING_OBJECTION,
  });
  allAudits.push(audit);

  test(`OBJ: "${variation}" → turnType=${cognitiveTurn?.turnType}`, () => {
    expect(typeof audit.contractCoverageOk, "boolean");
  });
}

// ─────────────────────────────────────────────────────────────
// GRUPO 5 — REFINEMENT / ALTERNATIVE_EXPLORATION (14 variações)
// Esperado: REFINEMENT
// Contrato: refinement_followup_response_contract
// ─────────────────────────────────────────────────────────────
console.log("\n— Grupo 5: REFINEMENT — 14 variações semânticas —");

const REF_VARIATIONS = [
  "qual seria o plano B?",
  "e a segunda opção?",
  "quem ficou em segundo?",
  "quem quase ganhou?",
  "e depois dele?",
  "qual alternativa você escolheria?",
  "se eu não quiser esse, qual seria?",
  "tem um reserva?",
  "qual outro faria sentido?",
  "me dá uma opção alternativa",
  "o que vem logo atrás?",
  "qual o concorrente mais forte?",
  "existe uma opção mais segura?",
  "existe uma opção mais barata sem perder muito?",
];

for (const variation of REF_VARIATIONS) {
  const { cognitiveTurn, audit } = auditVariation({
    query: variation,
    expectedSemanticFamily: "REFINEMENT",
    routingDecision: ROUTING_REFINEMENT,
  });
  allAudits.push(audit);

  test(`REF: "${variation}" → turnType=${cognitiveTurn?.turnType}`, () => {
    expect(typeof audit.contractCoverageOk, "boolean");
  });
}

// ─────────────────────────────────────────────────────────────
// GRUPO 6 — PRIORITY_SHIFT (18 variações semânticas)
// Esperado: PRIORITY_SHIFT
// Contrato: nenhum ainda (diagnóstico apenas)
// ─────────────────────────────────────────────────────────────
console.log("\n— Grupo 6: PRIORITY_SHIFT — 18 variações semânticas —");

const PS_VARIATIONS = [
  "eu passo horas jogando",
  "jogo bastante",
  "costumo jogar muito",
  "uso muito pra jogos",
  "rodo jogo pesado",
  "meu foco é game",
  "quero desempenho em jogos",
  "quero ficar anos sem trocar",
  "não quero trocar tão cedo",
  "priorizo longevidade",
  "quero algo pra durar bastante",
  "uso muito fora de casa",
  "preciso de bateria",
  "quero câmera boa",
  "tiro muita foto",
  "gravo bastante vídeo",
  "vou usar pra trabalho",
  "uso pra estudar",
];

for (const variation of PS_VARIATIONS) {
  const { cognitiveTurn, audit } = auditVariation({
    query: variation,
    expectedSemanticFamily: "PRIORITY_SHIFT",
    routingDecision: ROUTING_GENERIC,
  });
  allAudits.push(audit);

  test(`PS: "${variation}" → turnType=${cognitiveTurn?.turnType}`, () => {
    // PRIORITY_SHIFT sem contrato: cobertura OK se turnType bate (não há contrato a ativar)
    expect(typeof audit.contractCoverageOk, "boolean");
  });
}

// ─────────────────────────────────────────────────────────────
// GRUPO 7 — ACKNOWLEDGEMENT / REACTION (10 variações)
// Esperado: REACTION
// Contrato: decision_generic (sem restrições)
// ─────────────────────────────────────────────────────────────
console.log("\n— Grupo 7: ACKNOWLEDGEMENT — 10 variações semânticas —");

const ACK_VARIATIONS = [
  "faz sentido",
  "agora ficou claro",
  "beleza",
  "perfeito",
  "show",
  "certo",
  "entendi melhor",
  "boa",
  "fechado",
  "blz",
];

for (const variation of ACK_VARIATIONS) {
  const { cognitiveTurn, audit } = auditVariation({
    query: variation,
    expectedSemanticFamily: "ACKNOWLEDGEMENT",
    routingDecision: ROUTING_GENERIC,
  });
  allAudits.push(audit);

  test(`ACK: "${variation}" → turnType=${cognitiveTurn?.turnType}`, () => {
    expect(typeof audit.contractCoverageOk, "boolean");
  });
}

// ─────────────────────────────────────────────────────────────
// GRUPO 8 — Casos de violação de contrato (resposta ruim)
// Valida que o módulo detecta respostas que violam contratos.
// ─────────────────────────────────────────────────────────────
console.log("\n— Grupo 8: Detecção de violações de contrato na resposta —");

test("V1: Welcome response durante OBJECTION → WELCOME_FALLBACK_LEAK detectado", () => {
  const audit = buildResponseContractCoverageAudit({
    expectedSemanticFamily:  "OBJECTION_PRICE",
    actualCognitiveTurnType: "OBJECTION",
    hasActiveAnchor:         true,
    routingDecision:         ROUTING_OBJECTION,
    finalReply:              "Posso te ajudar com compras. Me conta mais sobre o que voce procura.",
    winnerNameAnchor:        ANCHOR_PRODUCT,
  });
  expectFalse(audit.contractCoverageOk);
  expectIncludes(audit.flags, COVERAGE_FLAGS.WELCOME_FALLBACK_LEAK);
});

test("V2: Welcome response durante REFINEMENT → WELCOME_FALLBACK_LEAK detectado", () => {
  const audit = buildResponseContractCoverageAudit({
    expectedSemanticFamily:  "REFINEMENT",
    actualCognitiveTurnType: "REFINEMENT",
    hasActiveAnchor:         true,
    routingDecision:         ROUTING_REFINEMENT,
    finalReply:              "Como posso te ajudar? Me fala o produto que voce quer analisar.",
    winnerNameAnchor:        ANCHOR_PRODUCT,
  });
  expectFalse(audit.contractCoverageOk);
  expectIncludes(audit.flags, COVERAGE_FLAGS.WELCOME_FALLBACK_LEAK);
  expect(audit.escapedAtStage, "final_response");
});

test("V3: Resposta de OBJECTION correta → CONTRACT_COVERAGE_OK", () => {
  const audit = buildResponseContractCoverageAudit({
    expectedSemanticFamily:  "OBJECTION_PRICE",
    actualCognitiveTurnType: "OBJECTION",
    hasActiveAnchor:         true,
    routingDecision:         ROUTING_OBJECTION,
    finalReply:              `Faz sentido achar caro. O ${ANCHOR_PRODUCT} esta no limite do orcamento. Se preco virou prioridade, posso recalcular.`,
    winnerNameAnchor:        ANCHOR_PRODUCT,
  });
  expectTrue(audit.contractCoverageOk);
  expectIncludes(audit.flags, COVERAGE_FLAGS.CONTRACT_COVERAGE_OK);
});

test("V4: directReply bypass em REFINEMENT → DIRECT_REPLY_EARLY_BYPASS", () => {
  const audit = buildResponseContractCoverageAudit({
    expectedSemanticFamily:  "REFINEMENT",
    actualCognitiveTurnType: "REFINEMENT",
    hasActiveAnchor:         true,
    directReplyBypassed:     true,
    routingDecision:         ROUTING_REFINEMENT,
    winnerNameAnchor:        ANCHOR_PRODUCT,
  });
  expectFalse(audit.contractCoverageOk);
  expectIncludes(audit.flags, COVERAGE_FLAGS.DIRECT_REPLY_EARLY_BYPASS);
  expect(audit.escapedAtStage, "direct_reply_early");
});

test("V5: PRIORITY_SHIFT sem contrato → audit marca cobertura OK se turnType bate", () => {
  const audit = buildResponseContractCoverageAudit({
    expectedSemanticFamily:  "PRIORITY_SHIFT",
    actualCognitiveTurnType: "PRIORITY_SHIFT",
    hasActiveAnchor:         true,
    routingDecision:         ROUTING_GENERIC,
  });
  // PRIORITY_SHIFT não tem contrato → contractCoverageOk = true se turnType bate
  expectTrue(audit.contractCoverageOk, "sem contrato esperado → cobertura ok se turnType bate");
  expect(audit.escapedAtStage, "not_applicable");
});

test("V6: PRIORITY_SHIFT não reconhecido → PRIORITY_SHIFT_NOT_RECOGNIZED", () => {
  const audit = buildResponseContractCoverageAudit({
    expectedSemanticFamily:  "PRIORITY_SHIFT",
    actualCognitiveTurnType: "CONVERSATIONAL",  // errado
    hasActiveAnchor:         true,
    routingDecision:         ROUTING_GENERIC,
  });
  expectFalse(audit.contractCoverageOk);
  expectIncludes(audit.flags, COVERAGE_FLAGS.PRIORITY_SHIFT_NOT_RECOGNIZED);
  expect(audit.escapedAtStage, "cognitive_router");
});

test("V7: REFINEMENT não reconhecido → REFINEMENT_NOT_RECOGNIZED", () => {
  const audit = buildResponseContractCoverageAudit({
    expectedSemanticFamily:  "REFINEMENT",
    actualCognitiveTurnType: "CONVERSATIONAL",
    hasActiveAnchor:         true,
    routingDecision:         ROUTING_REFINEMENT,
  });
  expectFalse(audit.contractCoverageOk);
  expectIncludes(audit.flags, COVERAGE_FLAGS.REFINEMENT_NOT_RECOGNIZED);
});

test("V8: OBJECTION não reconhecido → OBJECTION_NOT_RECOGNIZED", () => {
  const audit = buildResponseContractCoverageAudit({
    expectedSemanticFamily:  "OBJECTION_PRICE",
    actualCognitiveTurnType: "CONVERSATIONAL",
    hasActiveAnchor:         true,
    routingDecision:         ROUTING_OBJECTION,
  });
  expectFalse(audit.contractCoverageOk);
  expectIncludes(audit.flags, COVERAGE_FLAGS.OBJECTION_NOT_RECOGNIZED);
});

test("V9: WRONG_CONTRACT_ACTIVATED quando contrato errado ativa", () => {
  const audit = buildResponseContractCoverageAudit({
    expectedSemanticFamily:  "OBJECTION_PRICE",
    actualCognitiveTurnType: "OBJECTION",
    hasActiveAnchor:         true,
    activatedContract:       "refinement_followup_response_contract",  // errado
    routingDecision:         ROUTING_OBJECTION,
  });
  expectFalse(audit.contractCoverageOk);
  expectIncludes(audit.flags, COVERAGE_FLAGS.WRONG_CONTRACT_ACTIVATED);
  expect(audit.escapedAtStage, "prompt_contract");
});

test("V10: Anchor preservado em resposta de OBJECTION → sem ANCHOR_LOST", () => {
  const audit = buildResponseContractCoverageAudit({
    expectedSemanticFamily:  "OBJECTION_PRICE",
    actualCognitiveTurnType: "OBJECTION",
    hasActiveAnchor:         true,
    routingDecision:         ROUTING_OBJECTION,
    finalReply:              `O Galaxy S24 FE e a referencia atual. Faz sentido achar caro.`,
    winnerNameAnchor:        "Galaxy S24 FE",
  });
  expectNotIncludes(audit.flags, COVERAGE_FLAGS.ANCHOR_LOST, "anchor presente na resposta");
});

// ─────────────────────────────────────────────────────────────
// Relatório de Cobertura por Família
// ─────────────────────────────────────────────────────────────

const report = buildCoverageMatrixReport(allAudits);

console.log(`\n${"═".repeat(60)}`);
console.log("PATCH 6.4 — Response Contract Coverage Matrix");
console.log(`${"═".repeat(60)}`);
console.log(`Total de variações auditadas: ${report.total}`);
console.log(`Cobertura global: ${report.covered}/${report.total} (${report.score})`);
console.log(`Gaps: ${report.gaps}`);
console.log(`${"─".repeat(60)}`);

const FAMILY_LABELS = {
  CONFIDENCE_CHALLENGE:    "Confidence Challenge",
  EXPLANATION_REQUEST:     "Explanation Request",
  OBJECTION_PRICE:         "Objection / Price",
  REFINEMENT:              "Refinement / Alternative",
  PRIORITY_SHIFT:          "Priority Shift",
  ACKNOWLEDGEMENT:         "Acknowledgement / Reaction",
};

for (const [family, data] of Object.entries(report.byFamily)) {
  const pct = Math.round((data.covered / data.total) * 100);
  const bar = "█".repeat(Math.floor(pct / 10)) + "░".repeat(10 - Math.floor(pct / 10));
  const label = FAMILY_LABELS[family] || family;
  console.log(`\n  ${label}`);
  console.log(`  ${bar} ${pct}% (${data.covered}/${data.total} cobertos)`);
  if (data.gaps.length > 0) {
    console.log(`  Gaps detectados:`);
    for (const gap of data.gaps) {
      const stage = gap.escapedAtStage || "?";
      const actual = gap.actualTurnType || "?";
      const flagsSummary = (gap.flags || []).filter(f => f !== "COGNITIVE_TURN_MISMATCH").join(", ");
      console.log(`    • "${gap.query}"`);
      console.log(`      escapedAt=${stage}, actual=${actual}${flagsSummary ? `, flags=[${flagsSummary}]` : ""}`);
    }
  }
}

console.log(`\n${"─".repeat(60)}`);

// Sumário de estágios de escape
const escapeByStage = {};
for (const audit of allAudits) {
  if (!audit.contractCoverageOk) {
    const stage = audit.escapedAtStage || "unknown";
    escapeByStage[stage] = (escapeByStage[stage] || 0) + 1;
  }
}

if (Object.keys(escapeByStage).length > 0) {
  console.log("Estágios de escape:");
  for (const [stage, count] of Object.entries(escapeByStage)) {
    console.log(`  ${stage}: ${count} caso(s)`);
  }
} else {
  console.log("Nenhum gap detectado nas variações testadas.");
}

console.log(`\n${"─".repeat(60)}`);
console.log("PATCH 6.4 — Response Contract Coverage Audit");
console.log(`Validação do módulo: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log("Módulo de cobertura validado com sucesso.");
} else {
  console.log(`FALHA: ${failed} testes falharam.`);
  process.exit(1);
}
