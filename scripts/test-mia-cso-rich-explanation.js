/**
 * Testes — MIA Cognitive Explanation Path (PATCH 5.3)
 *
 * Rodar: node scripts/test-mia-cso-rich-explanation.js
 *
 * Foco: rota/estratégia, não texto final do LLM.
 *
 * Verifica:
 *  1. shouldUseRichExplanationPath — seletor de caminho
 *  2. buildExplanationContext — construtor de contexto de sessão
 *  3. Integração com Cognitive Router (EXPLANATION_REQUEST → cognitive_anchor_hold)
 *  4. Não-degradação de outros modos
 */

import {
  shouldUseRichExplanationPath,
  buildExplanationContext,
} from "../lib/miaCognitiveExplanationPath.js";

import { classifyMiaTurn, MIA_TURN_TYPES } from "../lib/miaCognitiveRouter.js";
import { applyIntentPreservation } from "../lib/miaIntentPreservation.js";

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

function expectTrue(val, label) {
  if (!val) throw new Error(`Expected truthy, got ${JSON.stringify(val)} [${label}]`);
}

function expectFalse(val, label) {
  if (val) throw new Error(`Expected falsy, got ${JSON.stringify(val)} [${label}]`);
}

// ─────────────────────────────────────────────────────────────
// Mock de produto âncora
// ─────────────────────────────────────────────────────────────

const MOCK_ANCHOR = {
  product_name: "Samsung Galaxy A55 5G",
  price: "R$ 1.899",
  source: "Americanas",
};

const MOCK_SESSION_RICH = {
  lastBestProduct: MOCK_ANCHOR,
  lastAxis: "desempenho",
  lastMainConsequence: "menos travamento em uso pesado",
  lastTradeoff: "não é o mais barato da categoria",
  lastPriority: "desempenho",
  lastCategory: "smartphone",
};

const MOCK_SESSION_EMPTY = {
  lastBestProduct: null,
  lastAxis: "",
  lastMainConsequence: "",
  lastTradeoff: "",
};

// ─────────────────────────────────────────────────────────────
// 1. shouldUseRichExplanationPath
// ─────────────────────────────────────────────────────────────

console.log("\n1. shouldUseRichExplanationPath — seletor de caminho");

test("cognitive_anchor_hold → usa caminho rico", () => {
  const result = shouldUseRichExplanationPath({ mode: "cognitive_anchor_hold" });
  expectTrue(result, "cognitive_anchor_hold");
});

test("context_hold → NÃO usa caminho rico", () => {
  const result = shouldUseRichExplanationPath({ mode: "context_hold" });
  expectFalse(result, "context_hold");
});

test("context_decision → NÃO usa caminho rico", () => {
  const result = shouldUseRichExplanationPath({ mode: "context_decision" });
  expectFalse(result, "context_decision");
});

test("anchored_reaction → NÃO usa caminho rico", () => {
  const result = shouldUseRichExplanationPath({ mode: "anchored_reaction" });
  expectFalse(result, "anchored_reaction");
});

test("new_search → NÃO usa caminho rico", () => {
  const result = shouldUseRichExplanationPath({ mode: "new_search" });
  expectFalse(result, "new_search");
});

test("undefined/null → NÃO usa caminho rico (robusto)", () => {
  expectFalse(shouldUseRichExplanationPath(null), "null input");
  expectFalse(shouldUseRichExplanationPath({}), "empty object");
  expectFalse(shouldUseRichExplanationPath(), "no input");
});

// ─────────────────────────────────────────────────────────────
// 2. buildExplanationContext — construtor de contexto
// ─────────────────────────────────────────────────────────────

console.log("\n2. buildExplanationContext — extração de sinais de sessão");

test("session rica → todos os campos preenchidos", () => {
  const ctx = buildExplanationContext(MOCK_SESSION_RICH, "Samsung Galaxy A55 5G", "desempenho");
  expect(ctx.anchorTitle, "Samsung Galaxy A55 5G", "anchorTitle");
  expect(ctx.lastAxis, "desempenho", "lastAxis");
  expect(ctx.lastConsequence, "menos travamento em uso pesado", "lastConsequence");
  expect(ctx.lastTradeoff, "não é o mais barato da categoria", "lastTradeoff");
  expectTrue(ctx.hasAxis, "hasAxis");
  expectTrue(ctx.hasConsequence, "hasConsequence");
  expectTrue(ctx.hasTradeoff, "hasTradeoff");
});

test("session vazia → valores seguros (nunca null/undefined)", () => {
  const ctx = buildExplanationContext(MOCK_SESSION_EMPTY, "", "");
  expect(ctx.anchorTitle, "produto recomendado", "anchorTitle fallback");
  expect(ctx.lastAxis, "", "lastAxis empty");
  expect(ctx.lastConsequence, "", "lastConsequence empty");
  expect(ctx.lastTradeoff, "", "lastTradeoff empty");
  expectFalse(ctx.hasAxis, "hasAxis false quando vazio");
  expectFalse(ctx.hasConsequence, "hasConsequence false quando vazio");
  expectFalse(ctx.hasTradeoff, "hasTradeoff false quando vazio");
});

test("preferredProductName tem prioridade sobre sessionContext.lastBestProduct", () => {
  const ctx = buildExplanationContext(
    { lastBestProduct: { product_name: "iPhone 13" } },
    "iPhone 15", // preferredProductName
    ""
  );
  expect(ctx.anchorTitle, "iPhone 15", "preferredProductName tem prioridade");
});

test("sem preferredProductName → usa sessionContext.lastBestProduct", () => {
  const ctx = buildExplanationContext(
    { lastBestProduct: { product_name: "Motorola Edge 50" } },
    "", // sem preferredProductName
    ""
  );
  expect(ctx.anchorTitle, "Motorola Edge 50", "sessionContext.lastBestProduct como fallback");
});

test("lastAxis usa lastPriority como fallback", () => {
  const ctx = buildExplanationContext(
    { lastAxis: "", lastPriority: "bateria" }, // sem lastAxis, mas com lastPriority
    "",
    ""
  );
  expect(ctx.lastAxis, "bateria", "lastPriority fallback para lastAxis");
});

test("lastAxis usa activePriority como último fallback", () => {
  const ctx = buildExplanationContext(
    { lastAxis: "", lastPriority: "" },
    "",
    "camera"
  );
  expect(ctx.lastAxis, "camera", "activePriority como último fallback");
});

test("input null → não lança exceção, retorna valores seguros", () => {
  const ctx = buildExplanationContext(null, null, null);
  if (ctx === null || ctx === undefined) {
    throw new Error("retornou null/undefined");
  }
  expect(ctx.anchorTitle, "produto recomendado", "fallback seguro com null");
});

test("campos de audit hasAxis/hasConsequence/hasTradeoff são boolean", () => {
  const ctx = buildExplanationContext(MOCK_SESSION_RICH, "X", "");
  if (typeof ctx.hasAxis !== "boolean") throw new Error(`hasAxis não é boolean: ${typeof ctx.hasAxis}`);
  if (typeof ctx.hasConsequence !== "boolean") throw new Error(`hasConsequence não é boolean: ${typeof ctx.hasConsequence}`);
  if (typeof ctx.hasTradeoff !== "boolean") throw new Error(`hasTradeoff não é boolean: ${typeof ctx.hasTradeoff}`);
});

// ─────────────────────────────────────────────────────────────
// 3. Integração: Cognitive Router → Intent Preservation → modo correto
//
// Verifica a cadeia completa: query EXPLANATION_REQUEST → classifyMiaTurn
// → applyIntentPreservation → routingDecision.mode === "cognitive_anchor_hold"
// → shouldUseRichExplanationPath retorna true
// ─────────────────────────────────────────────────────────────

console.log("\n3. Integração: EXPLANATION_REQUEST → cognitive_anchor_hold → rich path");

const MOCK_ROUTING_CONTEXT_HOLD = {
  mode: "context_hold",
  allowNewSearch: false,
  shouldPreserveAnchor: true,
  allowRerank: false,
  allowReplaceWinner: false,
  allowCommercialFallback: false,
  anchorProduct: MOCK_ANCHOR,
  reasons: ["context_hold_default"],
};

const MOCK_CONTEXT_RESOLUTION_WITH_DIRECT_REPLY = {
  shouldSkipProductSearch: true,
  directReply: "Posso te ajudar com compras...",
  mode: "general_answer",
};

function simulateExplanationChain(query) {
  // Etapa 1: Classificar o turno
  const cognitiveTurn = classifyMiaTurn({
    query,
    originalQuery: query,
    hasActiveAnchor: true,
    lastBestProduct: MOCK_ANCHOR,
  });

  // Etapa 2: Aplicar intent preservation
  const routingDecision = { ...MOCK_ROUTING_CONTEXT_HOLD };
  const contextResolution = { ...MOCK_CONTEXT_RESOLUTION_WITH_DIRECT_REPLY };

  const preservation = applyIntentPreservation({
    cognitiveTurn,
    routingDecision,
    sessionContext: MOCK_SESSION_RICH,
    lastBestProduct: MOCK_ANCHOR,
    contextResolution,
  });

  // Aplicar patches (como o handler faz)
  if (preservation.preservationApplied) {
    if (preservation.contextResolutionPatch) {
      Object.assign(contextResolution, preservation.contextResolutionPatch);
    }
    if (preservation.routingDecisionPatch) {
      Object.assign(routingDecision, preservation.routingDecisionPatch);
    }
  }

  // Etapa 3: Verificar seleção de caminho
  const usesRichPath = shouldUseRichExplanationPath(routingDecision);

  return { cognitiveTurn, preservation, routingDecision, contextResolution, usesRichPath };
}

test('"não entendi a escolha" → cadeia completa → rich explanation path', () => {
  const { cognitiveTurn, preservation, usesRichPath } = simulateExplanationChain("não entendi a escolha");
  expect(cognitiveTurn.turnType, MIA_TURN_TYPES.EXPLANATION_REQUEST, "turnType");
  expectTrue(preservation.preservationApplied, "preservation aplicada");
  expectTrue(usesRichPath, "rich explanation path selecionado");
  console.log(`    (turnType=${cognitiveTurn.turnType}, preservationApplied=${preservation.preservationApplied}, usesRichPath=${usesRichPath})`);
});

test('"não ficou claro" → cadeia completa → rich explanation path', () => {
  const { cognitiveTurn, usesRichPath } = simulateExplanationChain("não ficou claro");
  expect(cognitiveTurn.turnType, MIA_TURN_TYPES.EXPLANATION_REQUEST, "turnType");
  expectTrue(usesRichPath, "rich explanation path");
  console.log(`    (turnType=${cognitiveTurn.turnType}, richPath=${usesRichPath})`);
});

test('"por que você recomendou?" → cadeia completa → rich explanation path', () => {
  const { cognitiveTurn, usesRichPath } = simulateExplanationChain("por que você recomendou?");
  expect(cognitiveTurn.turnType, MIA_TURN_TYPES.EXPLANATION_REQUEST, "turnType");
  expectTrue(usesRichPath, "rich explanation path");
  console.log(`    (turnType=${cognitiveTurn.turnType}, richPath=${usesRichPath})`);
});

test('"como você chegou nessa conclusão?" → cadeia completa → rich explanation path', () => {
  const { cognitiveTurn, usesRichPath } = simulateExplanationChain("como você chegou nessa conclusão?");
  expect(cognitiveTurn.turnType, MIA_TURN_TYPES.EXPLANATION_REQUEST, "turnType");
  expectTrue(usesRichPath, "rich explanation path");
  console.log(`    (turnType=${cognitiveTurn.turnType}, richPath=${usesRichPath})`);
});

test('"o que te fez escolher esse?" → cadeia completa → rich explanation path', () => {
  const { cognitiveTurn, usesRichPath } = simulateExplanationChain("o que te fez escolher esse?");
  expect(cognitiveTurn.turnType, MIA_TURN_TYPES.EXPLANATION_REQUEST, "turnType");
  expectTrue(usesRichPath, "rich explanation path");
  console.log(`    (turnType=${cognitiveTurn.turnType}, richPath=${usesRichPath})`);
});

test("directReply limpo pós-preservation (não cai em early return genérico)", () => {
  const { contextResolution } = simulateExplanationChain("não entendi a escolha");
  if (contextResolution.directReply !== null && contextResolution.directReply !== undefined && contextResolution.directReply !== "") {
    throw new Error(`directReply deveria estar limpo, got: "${contextResolution.directReply}"`);
  }
  console.log(`    (directReply=${contextResolution.directReply} — early return genérico bloqueado)`);
});

// ─────────────────────────────────────────────────────────────
// 4. Não-degradação — outros modos
// ─────────────────────────────────────────────────────────────

console.log("\n4. Não-degradação — outros modos não usam rich explanation path");

test("context_hold (non-explanation) → NÃO usa rich path", () => {
  const rd = { mode: "context_hold", allowNewSearch: false };
  expectFalse(shouldUseRichExplanationPath(rd), "context_hold");
});

test("new_search → NÃO usa rich path", () => {
  const rd = { mode: "new_search", allowNewSearch: true };
  expectFalse(shouldUseRichExplanationPath(rd), "new_search");
});

test("refinement → NÃO usa rich path (buildExplanationContext não interfere)", () => {
  const rd = { mode: "refinement", allowNewSearch: false };
  expectFalse(shouldUseRichExplanationPath(rd), "refinement");
  // buildExplanationContext deve rodar sem efeito colateral
  const ctx = buildExplanationContext(MOCK_SESSION_RICH, "produto X", "bateria");
  if (typeof ctx.anchorTitle !== "string") throw new Error("buildExplanationContext quebrou");
  console.log(`    (refinement mode + buildExplanationContext seguro)`);
});

test("VALUE_QUESTION não aciona cognitive_anchor_hold de forma incorreta", () => {
  const cognitiveTurn = classifyMiaTurn({
    query: "vale a pena?",
    originalQuery: "vale a pena?",
    hasActiveAnchor: true,
    lastBestProduct: MOCK_ANCHOR,
  });
  // VALUE_QUESTION é tratado pela Cognitive Authority (5.2A), não pela preservation (5.2B)
  // Portanto não deveria setar cognitive_anchor_hold via preservation
  expect(cognitiveTurn.turnType, MIA_TURN_TYPES.VALUE_QUESTION, "turnType VALUE_QUESTION");
  // A preservation só age em EXPLANATION_REQUEST
  const preservation = applyIntentPreservation({
    cognitiveTurn,
    routingDecision: { ...MOCK_ROUTING_CONTEXT_HOLD },
    sessionContext: MOCK_SESSION_RICH,
    lastBestProduct: MOCK_ANCHOR,
    contextResolution: { ...MOCK_CONTEXT_RESOLUTION_WITH_DIRECT_REPLY },
  });
  expectFalse(preservation.preservationApplied, "VALUE_QUESTION não aciona preservation");
  console.log(`    (VALUE_QUESTION preservationApplied=${preservation.preservationApplied} — correto)`);
});

// ─────────────────────────────────────────────────────────────
// 5. Invariantes do módulo
// ─────────────────────────────────────────────────────────────

console.log("\n5. Invariantes");

test("shouldUseRichExplanationPath nunca lança exceção", () => {
  const inputs = [null, undefined, {}, { mode: null }, { mode: "" }, { mode: "cognitive_anchor_hold" }];
  for (const input of inputs) {
    try {
      shouldUseRichExplanationPath(input);
    } catch (err) {
      throw new Error(`Lançou exceção para input ${JSON.stringify(input)}: ${err.message}`);
    }
  }
});

test("buildExplanationContext nunca lança exceção", () => {
  const inputs = [
    [null, null, null],
    [undefined, undefined, undefined],
    [{}, "", ""],
    [MOCK_SESSION_RICH, "X", "bateria"],
    [MOCK_SESSION_EMPTY, "", ""],
  ];
  for (const [sc, ppn, ap] of inputs) {
    try {
      buildExplanationContext(sc, ppn, ap);
    } catch (err) {
      throw new Error(`Lançou exceção para sessionContext=${JSON.stringify(sc)}: ${err.message}`);
    }
  }
});

test("buildExplanationContext sempre retorna os 7 campos obrigatórios", () => {
  const requiredFields = ["anchorTitle", "lastAxis", "lastConsequence", "lastTradeoff", "hasAxis", "hasConsequence", "hasTradeoff"];
  const ctx = buildExplanationContext(MOCK_SESSION_RICH, "X", "bateria");
  for (const field of requiredFields) {
    if (!(field in ctx)) {
      throw new Error(`Campo obrigatório ausente: ${field}`);
    }
  }
  console.log(`    (7 campos presentes: ${requiredFields.join(", ")})`);
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
  console.log("\nTodos os testes passaram. Cognitive Explanation Path validado.");
  process.exit(0);
}
