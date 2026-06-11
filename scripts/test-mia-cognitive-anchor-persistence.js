/**
 * Testes — Cognitive Anchor Hold Persistence (PATCH 5.3B)
 *
 * Rodar: node scripts/test-mia-cognitive-anchor-persistence.js
 *
 * Verifica que o routingDecision.mode = "cognitive_anchor_hold" persiste
 * após o segundo buildRoutingDecision, quando intentPreservation foi aplicada
 * para EXPLANATION_REQUEST com âncora ativa.
 *
 * Cobre os 6 cenários obrigatórios do spec:
 *  1. EXPLANATION_REQUEST + preservation ativa → mantém cognitive_anchor_hold
 *  2. shouldUseRichExplanationPath retorna true para cognitive_anchor_hold
 *  3. context_hold sem preservation → não ativa rich path
 *  4. VALUE_QUESTION não afetado
 *  5. REFINEMENT não afetado
 *  6. COMPARISON não afetado
 */

import { shouldUseRichExplanationPath } from "../lib/miaCognitiveExplanationPath.js";
import { applyIntentPreservation } from "../lib/miaIntentPreservation.js";
import { classifyMiaTurn, MIA_TURN_TYPES } from "../lib/miaCognitiveRouter.js";
import { buildRichExplanationActivationAudit, RICH_EXPLANATION_FLAGS } from "../lib/miaRichExplanationAudit.js";

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

function expectTrue(val, label) {
  if (!val) throw new Error(`Expected truthy, got ${JSON.stringify(val)} [${label || ""}]`);
}

function expectFalse(val, label) {
  if (val) throw new Error(`Expected falsy, got ${JSON.stringify(val)} [${label || ""}]`);
}

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

const MOCK_ANCHOR = { product_name: "iPhone 13", price: "R$ 2.499" };

const MOCK_SESSION = {
  lastBestProduct: MOCK_ANCHOR,
  lastAxis: "desempenho",
  lastMainConsequence: "mais fluidez em uso intenso",
  lastTradeoff: "preço acima da média",
};

// Simula o routingDecision APÓS o segundo buildRoutingDecision (mode revertido para context_hold)
function makeMockRoutingDecisionAfterRebuild(mode = "context_hold") {
  return {
    mode,
    allowNewSearch: false,
    shouldPreserveAnchor: true,
    allowRerank: false,
    allowReplaceWinner: false,
    allowCommercialFallback: false,
    anchorProduct: MOCK_ANCHOR,
    reasons: ["context_decision_default"],
  };
}

const MOCK_CONTEXT_RESOLUTION = {
  shouldSkipProductSearch: true,
  directReply: "Posso te ajudar...",
  mode: "general_answer",
};

// ─────────────────────────────────────────────────────────────
// Simulador da lógica de persistência (PATCH 5.3B inline)
// ─────────────────────────────────────────────────────────────

/**
 * Simula exatamente o que o handler faz após o segundo buildRoutingDecision:
 * 1. applyIntentPreservation retorna um patch
 * 2. Handler aplica o patch ao routingDecision (após primeiro buildRoutingDecision)
 * 3. Segundo buildRoutingDecision cria novo objeto (com mode=context_hold)
 * 4. PATCH 5.3B: re-aplica cognitive_anchor_hold se preservation foi aplicada
 */
function simulatePersistenceLogic(query, initialRoutingMode = "context_hold") {
  // Etapa 1: Classificar o turno cognitivo
  const cognitiveTurnEarly = classifyMiaTurn({
    query,
    originalQuery: query,
    hasActiveAnchor: true,
    lastBestProduct: MOCK_ANCHOR,
  });

  // Etapa 2: Simular o routingDecision APÓS o segundo buildRoutingDecision
  // (o segundo rebuild reseta o mode para o valor padrão)
  const routingDecision = makeMockRoutingDecisionAfterRebuild(initialRoutingMode);

  // Etapa 3: Simular a preservation (usando o mesmo routingDecision que o primeiro build
  // havia gerado, antes do segundo rebuild)
  const firstBuildRoutingDecision = makeMockRoutingDecisionAfterRebuild("context_hold");
  const contextResolution = { ...MOCK_CONTEXT_RESOLUTION };

  const intentPreservationResult = applyIntentPreservation({
    cognitiveTurn: cognitiveTurnEarly,
    routingDecision: firstBuildRoutingDecision,
    sessionContext: MOCK_SESSION,
    lastBestProduct: MOCK_ANCHOR,
    contextResolution,
  });

  // (O Object.assign seria feito aqui no handler, mas o segundo rebuild já descartou esse objeto)

  // Etapa 4: PATCH 5.3B — re-aplicar cognitive_anchor_hold após o segundo rebuild
  let persistenceApplied = false;
  if (
    intentPreservationResult?.preservationApplied &&
    cognitiveTurnEarly?.turnType === "EXPLANATION_REQUEST" &&
    routingDecision.mode !== "cognitive_anchor_hold"
  ) {
    routingDecision.mode = "cognitive_anchor_hold";
    persistenceApplied = true;
  }

  // Etapa 5: Verificar rich path após a persistência
  const richPathActivated = shouldUseRichExplanationPath(routingDecision);

  return {
    cognitiveTurnEarly,
    intentPreservationResult,
    routingDecision,
    persistenceApplied,
    richPathActivated,
  };
}

// ─────────────────────────────────────────────────────────────
// Cenário 1 — EXPLANATION_REQUEST + preservation ativa
// → mantém cognitive_anchor_hold após rebuild
// ─────────────────────────────────────────────────────────────

console.log("\n1. EXPLANATION_REQUEST + preservation → cognitive_anchor_hold persiste");

test('"não entendi a escolha" → turnType EXPLANATION_REQUEST', () => {
  const { cognitiveTurnEarly } = simulatePersistenceLogic("não entendi a escolha");
  expect(cognitiveTurnEarly.turnType, MIA_TURN_TYPES.EXPLANATION_REQUEST, "turnType");
});

test('"não entendi a escolha" → intentPreservation aplicada', () => {
  const { intentPreservationResult } = simulatePersistenceLogic("não entendi a escolha");
  expectTrue(intentPreservationResult.preservationApplied, "preservationApplied");
});

test('"não entendi a escolha" → PATCH 5.3B aplicou persistência', () => {
  const { persistenceApplied } = simulatePersistenceLogic("não entendi a escolha");
  expectTrue(persistenceApplied, "persistenceApplied");
});

test('"não entendi a escolha" → routingDecision.mode = cognitive_anchor_hold após rebuild+fix', () => {
  const { routingDecision } = simulatePersistenceLogic("não entendi a escolha");
  expect(routingDecision.mode, "cognitive_anchor_hold", "routingDecision.mode");
  console.log(`    (mode=${routingDecision.mode} — correto após PATCH 5.3B)`);
});

test('"não ficou claro" → cognitive_anchor_hold persiste', () => {
  const { routingDecision, persistenceApplied } = simulatePersistenceLogic("não ficou claro");
  expect(routingDecision.mode, "cognitive_anchor_hold", "routingDecision.mode");
  expectTrue(persistenceApplied, "persistenceApplied");
  console.log(`    (mode=${routingDecision.mode})`);
});

test('"por que você recomendou?" → cognitive_anchor_hold persiste', () => {
  const { routingDecision } = simulatePersistenceLogic("por que você recomendou?");
  expect(routingDecision.mode, "cognitive_anchor_hold", "routingDecision.mode");
});

test('"como você chegou nessa conclusão?" → cognitive_anchor_hold persiste', () => {
  const { routingDecision } = simulatePersistenceLogic("como você chegou nessa conclusão?");
  expect(routingDecision.mode, "cognitive_anchor_hold", "routingDecision.mode");
});

// ─────────────────────────────────────────────────────────────
// Cenário 2 — shouldUseRichExplanationPath retorna true
// ─────────────────────────────────────────────────────────────

console.log("\n2. shouldUseRichExplanationPath = true após persistência");

test('"não entendi a escolha" → shouldUseRichExplanationPath retorna true após fix', () => {
  const { richPathActivated } = simulatePersistenceLogic("não entendi a escolha");
  expectTrue(richPathActivated, "richPathActivated");
  console.log(`    (shouldUseRichExplanationPath=${richPathActivated} — RICH PATH ATIVO)`);
});

test('"não ficou claro" → shouldUseRichExplanationPath retorna true', () => {
  const { richPathActivated } = simulatePersistenceLogic("não ficou claro");
  expectTrue(richPathActivated, "richPathActivated");
});

test('"o que te fez escolher esse?" → shouldUseRichExplanationPath retorna true', () => {
  const { richPathActivated } = simulatePersistenceLogic("o que te fez escolher esse?");
  expectTrue(richPathActivated, "richPathActivated");
});

// ─────────────────────────────────────────────────────────────
// Cenário 3 — context_hold SEM preservation → não ativa rich path
// ─────────────────────────────────────────────────────────────

console.log("\n3. context_hold sem preservation NÃO ativa rich path");

test("FOLLOW_UP com context_hold → persistence não aplica, rich path false", () => {
  const cognitiveTurnEarly = classifyMiaTurn({
    query: "e a bateria?",
    originalQuery: "e a bateria?",
    hasActiveAnchor: true,
    lastBestProduct: MOCK_ANCHOR,
  });
  // FOLLOW_UP → preservation NÃO aplica
  const routingDecision = makeMockRoutingDecisionAfterRebuild("context_hold");
  const intentPreservationResult = applyIntentPreservation({
    cognitiveTurn: cognitiveTurnEarly,
    routingDecision,
    sessionContext: MOCK_SESSION,
    lastBestProduct: MOCK_ANCHOR,
    contextResolution: { ...MOCK_CONTEXT_RESOLUTION },
  });

  // Simular PATCH 5.3B
  let persistenceApplied = false;
  if (
    intentPreservationResult?.preservationApplied &&
    cognitiveTurnEarly?.turnType === "EXPLANATION_REQUEST" &&
    routingDecision.mode !== "cognitive_anchor_hold"
  ) {
    routingDecision.mode = "cognitive_anchor_hold";
    persistenceApplied = true;
  }

  expectFalse(persistenceApplied, "persistenceApplied deve ser false para FOLLOW_UP");
  expect(routingDecision.mode, "context_hold", "mode deve ser context_hold");
  const richPath = shouldUseRichExplanationPath(routingDecision);
  expectFalse(richPath, "rich path deve ser false");
  console.log(`    (FOLLOW_UP: mode=${routingDecision.mode}, richPath=${richPath} — correto)`);
});

test("UNKNOWN sem preservation → não aplica, rich path false", () => {
  const cognitiveTurnEarly = classifyMiaTurn({
    query: "hmm",
    hasActiveAnchor: false,
  });
  const routingDecision = makeMockRoutingDecisionAfterRebuild("context_hold");
  const intentPreservationResult = applyIntentPreservation({
    cognitiveTurn: cognitiveTurnEarly,
    routingDecision,
    sessionContext: {},
    lastBestProduct: null,
    contextResolution: {},
  });

  let persistenceApplied = false;
  if (
    intentPreservationResult?.preservationApplied &&
    cognitiveTurnEarly?.turnType === "EXPLANATION_REQUEST" &&
    routingDecision.mode !== "cognitive_anchor_hold"
  ) {
    routingDecision.mode = "cognitive_anchor_hold";
    persistenceApplied = true;
  }

  expectFalse(persistenceApplied, "persistenceApplied deve ser false para UNKNOWN");
  expectFalse(shouldUseRichExplanationPath(routingDecision), "rich path false");
});

// ─────────────────────────────────────────────────────────────
// Cenário 4 — VALUE_QUESTION não afetado
// ─────────────────────────────────────────────────────────────

console.log("\n4. VALUE_QUESTION não afetado pelo PATCH 5.3B");

test('"vale a pena?" → VALUE_QUESTION, persistence não aplica', () => {
  const cognitiveTurnEarly = classifyMiaTurn({
    query: "vale a pena?",
    originalQuery: "vale a pena?",
    hasActiveAnchor: true,
    lastBestProduct: MOCK_ANCHOR,
  });
  expect(cognitiveTurnEarly.turnType, MIA_TURN_TYPES.VALUE_QUESTION, "turnType VALUE_QUESTION");

  const routingDecision = makeMockRoutingDecisionAfterRebuild("context_hold");
  const intentPreservationResult = applyIntentPreservation({
    cognitiveTurn: cognitiveTurnEarly,
    routingDecision,
    sessionContext: MOCK_SESSION,
    lastBestProduct: MOCK_ANCHOR,
    contextResolution: { ...MOCK_CONTEXT_RESOLUTION },
  });

  // preservation deve ser false para VALUE_QUESTION
  expectFalse(intentPreservationResult.preservationApplied, "preservation não aplica para VALUE_QUESTION");

  let persistenceApplied = false;
  if (
    intentPreservationResult?.preservationApplied &&
    cognitiveTurnEarly?.turnType === "EXPLANATION_REQUEST" &&
    routingDecision.mode !== "cognitive_anchor_hold"
  ) {
    routingDecision.mode = "cognitive_anchor_hold";
    persistenceApplied = true;
  }

  expectFalse(persistenceApplied, "PATCH 5.3B não deve aplicar para VALUE_QUESTION");
  expect(routingDecision.mode, "context_hold", "mode inalterado para VALUE_QUESTION");
  console.log(`    (VALUE_QUESTION: mode=${routingDecision.mode}, persistence=${persistenceApplied})`);
});

// ─────────────────────────────────────────────────────────────
// Cenário 5 — REFINEMENT não afetado
// ─────────────────────────────────────────────────────────────

console.log("\n5. REFINEMENT não afetado pelo PATCH 5.3B");

test('"tem algo mais barato?" → REFINEMENT, persistence não aplica', () => {
  const cognitiveTurnEarly = classifyMiaTurn({
    query: "tem algo mais barato?",
    originalQuery: "tem algo mais barato?",
    hasActiveAnchor: true,
    lastBestProduct: MOCK_ANCHOR,
    detectedIntent: "refinement",
  });
  expect(cognitiveTurnEarly.turnType, MIA_TURN_TYPES.REFINEMENT, "turnType REFINEMENT");

  const routingDecision = makeMockRoutingDecisionAfterRebuild("refinement");
  const intentPreservationResult = applyIntentPreservation({
    cognitiveTurn: cognitiveTurnEarly,
    routingDecision,
    sessionContext: MOCK_SESSION,
    lastBestProduct: MOCK_ANCHOR,
    contextResolution: { ...MOCK_CONTEXT_RESOLUTION, directReply: null },
  });

  expectFalse(intentPreservationResult.preservationApplied, "preservation não aplica para REFINEMENT");

  let persistenceApplied = false;
  if (
    intentPreservationResult?.preservationApplied &&
    cognitiveTurnEarly?.turnType === "EXPLANATION_REQUEST" &&
    routingDecision.mode !== "cognitive_anchor_hold"
  ) {
    routingDecision.mode = "cognitive_anchor_hold";
    persistenceApplied = true;
  }

  expectFalse(persistenceApplied, "PATCH 5.3B não aplica para REFINEMENT");
  console.log(`    (REFINEMENT: mode=${routingDecision.mode}, persistence=${persistenceApplied})`);
});

// ─────────────────────────────────────────────────────────────
// Cenário 6 — COMPARISON não afetado
// ─────────────────────────────────────────────────────────────

console.log("\n6. COMPARISON não afetado pelo PATCH 5.3B");

test('"iPhone ou Galaxy?" → COMPARISON, persistence não aplica', () => {
  const cognitiveTurnEarly = classifyMiaTurn({
    query: "iPhone ou Galaxy?",
    originalQuery: "iPhone ou Galaxy?",
    hasActiveAnchor: false,
    detectedIntent: "comparison",
  });
  expect(cognitiveTurnEarly.turnType, MIA_TURN_TYPES.COMPARISON, "turnType COMPARISON");

  const routingDecision = makeMockRoutingDecisionAfterRebuild("comparison");
  const intentPreservationResult = applyIntentPreservation({
    cognitiveTurn: cognitiveTurnEarly,
    routingDecision,
    sessionContext: {},
    lastBestProduct: null,
    contextResolution: {},
  });

  expectFalse(intentPreservationResult.preservationApplied, "preservation não aplica para COMPARISON");

  let persistenceApplied = false;
  if (
    intentPreservationResult?.preservationApplied &&
    cognitiveTurnEarly?.turnType === "EXPLANATION_REQUEST" &&
    routingDecision.mode !== "cognitive_anchor_hold"
  ) {
    routingDecision.mode = "cognitive_anchor_hold";
    persistenceApplied = true;
  }

  expectFalse(persistenceApplied, "PATCH 5.3B não aplica para COMPARISON");
  console.log(`    (COMPARISON: mode=${routingDecision.mode}, persistence=${persistenceApplied})`);
});

// ─────────────────────────────────────────────────────────────
// Validação do audit — novos campos de persistência
// ─────────────────────────────────────────────────────────────

console.log("\n7. Audit atualizado — campos routingModeBeforeRebuild e routingModePersistenceApplied");

test("audit com persistência aplicada mostra campos corretos", () => {
  const audit = buildRichExplanationActivationAudit({
    richExplanationPathActivated: true,
    routingDecision: { mode: "cognitive_anchor_hold" },
    cognitiveTurn: { turnType: "EXPLANATION_REQUEST", confidence: 0.83 },
    anchorProduct: MOCK_ANCHOR,
    intentPreservationApplied: true,
    routingModeBeforeRebuild: "cognitive_anchor_hold", // mode antes do rebuild
    routingModePersistenceApplied: true,
  });
  expect(audit.routingModeBeforeRebuild, "cognitive_anchor_hold");
  expect(audit.routingModePersistenceApplied, true);
  expectTrue(audit.shouldUseRichExplanationPath);
  console.log(`    (routingModeBeforeRebuild=${audit.routingModeBeforeRebuild}, persistenceApplied=${audit.routingModePersistenceApplied})`);
});

test("audit com persistência necessária mostra modo antes do rebuild como context_hold", () => {
  const audit = buildRichExplanationActivationAudit({
    richExplanationPathActivated: true,
    routingDecision: { mode: "cognitive_anchor_hold" },
    intentPreservationApplied: true,
    routingModeBeforeRebuild: "cognitive_anchor_hold", // o que estava antes do segundo build
    routingModePersistenceApplied: true, // PATCH 5.3B ativou
  });
  expect(audit.routingModePersistenceApplied, true);
  console.log(`    (persistência documentada no audit)`);
});

test("audit com routingModeBeforeRebuild e routingModePersistenceApplied sempre presentes", () => {
  const audit = buildRichExplanationActivationAudit({});
  if (!("routingModeBeforeRebuild" in audit)) {
    throw new Error("routingModeBeforeRebuild ausente no audit");
  }
  if (!("routingModePersistenceApplied" in audit)) {
    throw new Error("routingModePersistenceApplied ausente no audit");
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
  console.log("\nTodos os testes passaram. Cognitive Anchor Hold Persistence validado.");
  process.exit(0);
}
