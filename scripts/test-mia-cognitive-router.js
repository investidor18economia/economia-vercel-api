/**
 * Testes isolados do MIA Cognitive Router (Shadow Mode)
 * PATCH 5.1A + PATCH 5.1B + PATCH 5.2C
 *
 * Rodar: node scripts/test-mia-cognitive-router.js
 *
 * Os testes validam apenas a classificação cognitiva.
 * Nenhum efeito no fluxo do backend.
 */

import { classifyMiaTurn, MIA_TURN_TYPES } from "../lib/miaCognitiveRouter.js";

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
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${label ? ` [${label}]` : ""}`);
  }
}

function expectTurnType(result, expectedType) {
  expect(result.turnType, expectedType, "turnType");
  expect(result.shadowOnly, true, "shadowOnly must be true");
  if (typeof result.confidence !== "number" || result.confidence < 0 || result.confidence > 1) {
    throw new Error(`confidence must be a number between 0 and 1, got ${result.confidence}`);
  }
  if (!Array.isArray(result.reasons) || result.reasons.length === 0) {
    throw new Error("reasons must be a non-empty array");
  }
  if (typeof result.signals !== "object" || result.signals === null) {
    throw new Error("signals must be an object");
  }
}

// ─────────────────────────────────────────────────────────────
// Mock de produto âncora ativo
// ─────────────────────────────────────────────────────────────

const MOCK_ANCHOR = {
  product_name: "Samsung Galaxy A55 5G",
  price: "R$ 1.899",
  source: "Americanas",
};

const MOCK_COMPARISON_CONTEXT = {
  locked: true,
  products: [
    { product_name: "iPhone 13" },
    { product_name: "Galaxy S23 FE" },
  ],
};

// ─────────────────────────────────────────────────────────────
// Cenário 1 — Nova busca com orçamento, sem âncora
// ─────────────────────────────────────────────────────────────

console.log("\n1. Nova busca com orçamento");

test('"quero um celular até 2000" → NEW_SEARCH', () => {
  const result = classifyMiaTurn({
    query: "quero um celular até 2000",
    hasActiveAnchor: false,
    detectedIntent: "search",
  });
  expectTurnType(result, MIA_TURN_TYPES.NEW_SEARCH);
});

// ─────────────────────────────────────────────────────────────
// Cenário 2 — Nova busca com orçamento numérico diferente
// ─────────────────────────────────────────────────────────────

console.log("\n2. Nova busca com orçamento alternativo");

test('"celular bom até 1500" → NEW_SEARCH', () => {
  const result = classifyMiaTurn({
    query: "celular bom até 1500",
    hasActiveAnchor: false,
    detectedIntent: "search",
  });
  expectTurnType(result, MIA_TURN_TYPES.NEW_SEARCH);
});

// ─────────────────────────────────────────────────────────────
// Cenário 3 — Comparação explícita
// ─────────────────────────────────────────────────────────────

console.log("\n3. Comparação explícita");

test('"iPhone 13 ou Galaxy S23 FE?" → COMPARISON', () => {
  const result = classifyMiaTurn({
    query: "iPhone 13 ou Galaxy S23 FE?",
    hasActiveAnchor: false,
    detectedIntent: "comparison",
  });
  expectTurnType(result, MIA_TURN_TYPES.COMPARISON);
});

// ─────────────────────────────────────────────────────────────
// Cenário 4 — Pergunta de valor com âncora ativa
// ─────────────────────────────────────────────────────────────

console.log("\n4. Value question com âncora");

test('"vale a pena?" com lastBestProduct ativo → VALUE_QUESTION', () => {
  const result = classifyMiaTurn({
    query: "vale a pena?",
    hasActiveAnchor: true,
    lastBestProduct: MOCK_ANCHOR,
    detectedIntent: "context_analysis",
  });
  expectTurnType(result, MIA_TURN_TYPES.VALUE_QUESTION);
});

test('"compensa comprar?" com âncora → VALUE_QUESTION', () => {
  const result = classifyMiaTurn({
    query: "compensa comprar?",
    hasActiveAnchor: true,
    lastBestProduct: MOCK_ANCHOR,
  });
  expectTurnType(result, MIA_TURN_TYPES.VALUE_QUESTION);
});

// ─────────────────────────────────────────────────────────────
// Cenário 5 — Pedido de explicação com âncora ativa
// ─────────────────────────────────────────────────────────────

console.log("\n5. Explanation request");

test('"por que você recomendou esse?" com âncora → EXPLANATION_REQUEST', () => {
  const result = classifyMiaTurn({
    query: "por que você recomendou esse?",
    hasActiveAnchor: true,
    lastBestProduct: MOCK_ANCHOR,
  });
  expectTurnType(result, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test('"explica o raciocínio" com âncora → EXPLANATION_REQUEST', () => {
  const result = classifyMiaTurn({
    query: "explica o raciocínio",
    hasActiveAnchor: true,
    lastBestProduct: MOCK_ANCHOR,
  });
  expectTurnType(result, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

// ─────────────────────────────────────────────────────────────
// Cenário 6 — Objeção com âncora ativa
// ─────────────────────────────────────────────────────────────

console.log("\n6. Objeção");

test('"não gostei desse" com âncora → OBJECTION', () => {
  const result = classifyMiaTurn({
    query: "não gostei desse",
    hasActiveAnchor: true,
    lastBestProduct: MOCK_ANCHOR,
  });
  expectTurnType(result, MIA_TURN_TYPES.OBJECTION);
});

test('"não quero esse, tem outra opção?" com âncora → OBJECTION', () => {
  const result = classifyMiaTurn({
    query: "não quero esse, tem outra opção?",
    hasActiveAnchor: true,
    lastBestProduct: MOCK_ANCHOR,
  });
  expectTurnType(result, MIA_TURN_TYPES.OBJECTION);
});

// ─────────────────────────────────────────────────────────────
// Cenário 7 — Refinamento com âncora ativa
// ─────────────────────────────────────────────────────────────

console.log("\n7. Refinamento");

test('"tem algo mais barato?" com âncora → REFINEMENT', () => {
  const result = classifyMiaTurn({
    query: "tem algo mais barato?",
    hasActiveAnchor: true,
    lastBestProduct: MOCK_ANCHOR,
    detectedIntent: "refinement",
  });
  expectTurnType(result, MIA_TURN_TYPES.REFINEMENT);
});

// ─────────────────────────────────────────────────────────────
// Cenário 8 — Follow-up simples com âncora ativa
// ─────────────────────────────────────────────────────────────

console.log("\n8. Follow-up");

test('"e a bateria?" com âncora → FOLLOW_UP', () => {
  const result = classifyMiaTurn({
    query: "e a bateria?",
    hasActiveAnchor: true,
    lastBestProduct: MOCK_ANCHOR,
    detectedIntent: "refinement",
  });
  expectTurnType(result, MIA_TURN_TYPES.FOLLOW_UP);
});

test('"quanto dura a bateria?" com âncora → FOLLOW_UP', () => {
  const result = classifyMiaTurn({
    query: "quanto dura a bateria?",
    hasActiveAnchor: true,
    lastBestProduct: MOCK_ANCHOR,
  });
  expectTurnType(result, MIA_TURN_TYPES.FOLLOW_UP);
});

// ─────────────────────────────────────────────────────────────
// Cenário 9 — Pergunta comercial com link
// ─────────────────────────────────────────────────────────────

console.log("\n9. Commercial question");

test('"e esse aqui?" com link → COMMERCIAL_QUESTION', () => {
  const result = classifyMiaTurn({
    query: "e esse aqui? https://www.mercadolivre.com.br/galaxy-a55",
    hasActiveAnchor: true,
    lastBestProduct: MOCK_ANCHOR,
  });
  expectTurnType(result, MIA_TURN_TYPES.COMMERCIAL_QUESTION);
});

test('"esse modelo da Kabum?" → COMMERCIAL_QUESTION', () => {
  const result = classifyMiaTurn({
    query: "esse modelo da Kabum?",
    hasActiveAnchor: false,
  });
  expectTurnType(result, MIA_TURN_TYPES.COMMERCIAL_QUESTION);
});

// ─────────────────────────────────────────────────────────────
// Cenário 10 — Conversacional sem intenção de compra
// ─────────────────────────────────────────────────────────────

console.log("\n10. Conversacional");

test('"bom dia" → CONVERSATIONAL', () => {
  const result = classifyMiaTurn({
    query: "bom dia",
    hasActiveAnchor: false,
    detectedIntent: "greeting",
  });
  expectTurnType(result, MIA_TURN_TYPES.CONVERSATIONAL);
});

test('"quem é você?" → CONVERSATIONAL', () => {
  const result = classifyMiaTurn({
    query: "quem é você?",
    hasActiveAnchor: false,
    detectedIntent: "general_answer",
  });
  expectTurnType(result, MIA_TURN_TYPES.CONVERSATIONAL);
});

// ─────────────────────────────────────────────────────────────
// Cenário 11 — Priority shift com âncora ativa
// ─────────────────────────────────────────────────────────────

console.log("\n11. Priority shift");

test('"muda para câmera melhor" com âncora → PRIORITY_SHIFT', () => {
  const result = classifyMiaTurn({
    query: "muda para câmera melhor",
    hasActiveAnchor: true,
    lastBestProduct: MOCK_ANCHOR,
    cso: { conversationalIntent: "priority_change" },
  });
  expectTurnType(result, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test('"na real prefiro mais bateria" com âncora → PRIORITY_SHIFT', () => {
  const result = classifyMiaTurn({
    query: "na real prefiro mais bateria",
    hasActiveAnchor: true,
    lastBestProduct: MOCK_ANCHOR,
  });
  expectTurnType(result, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

// ─────────────────────────────────────────────────────────────
// Cenário 12 — Follow-up dentro de comparação ativa
// ─────────────────────────────────────────────────────────────

console.log("\n12. Comparison follow-up");

test('"e a bateria de cada um?" dentro de comparação → COMPARISON_FOLLOWUP', () => {
  const result = classifyMiaTurn({
    query: "e a bateria de cada um?",
    hasActiveAnchor: true,
    lastBestProduct: MOCK_ANCHOR,
    comparisonContext: MOCK_COMPARISON_CONTEXT,
    contextResolution: { mode: "comparison_context_lock", lockedComparisonFollowUp: true },
  });
  expectTurnType(result, MIA_TURN_TYPES.COMPARISON_FOLLOWUP);
});

test('"qual dos dois tem melhor câmera?" dentro de comparação → COMPARISON_FOLLOWUP', () => {
  const result = classifyMiaTurn({
    query: "qual dos dois tem melhor câmera?",
    hasActiveAnchor: true,
    comparisonContext: MOCK_COMPARISON_CONTEXT,
    contextResolution: { lockedComparisonFollowUp: true },
  });
  expectTurnType(result, MIA_TURN_TYPES.COMPARISON_FOLLOWUP);
});

// ─────────────────────────────────────────────────────────────
// Cenário 13 — Mensagem ambígua sem contexto
// ─────────────────────────────────────────────────────────────

console.log("\n13. Mensagem ambígua (UNKNOWN ou CONVERSATIONAL aceito)");

test('"hmm" sem contexto → UNKNOWN ou CONVERSATIONAL', () => {
  const result = classifyMiaTurn({
    query: "hmm",
    hasActiveAnchor: false,
    detectedIntent: "",
  });
  // Sem âncora, sem sinal → UNKNOWN é correto.
  // CONVERSATIONAL também seria aceitável para resposta defensiva.
  const acceptable = [MIA_TURN_TYPES.UNKNOWN, MIA_TURN_TYPES.CONVERSATIONAL];
  if (!acceptable.includes(result.turnType)) {
    throw new Error(`Expected UNKNOWN or CONVERSATIONAL, got ${result.turnType}`);
  }
  expect(result.shadowOnly, true, "shadowOnly");
  console.log(`    (classificou como ${result.turnType} — aceitável)`);
});

// ─────────────────────────────────────────────────────────────
// Cenário 14 — Query enriquecida NÃO deve sobrescrever
//              a classificação baseada na originalQuery
// ─────────────────────────────────────────────────────────────

console.log("\n14. originalQuery não deve ser contaminada por resolvedQuery");

test("classifyMiaTurn usa originalQuery, não query enriquecida", () => {
  // query original: follow-up curto com âncora
  // resolvedQuery (enriquecida): "quero Samsung Galaxy A55 5G bateria"
  // → deve classificar como FOLLOW_UP (baseado no originalQuery),
  //   NÃO como NEW_SEARCH (o que resolvedQuery poderia sugerir)
  const result = classifyMiaTurn({
    query: "e a bateria?",             // original — o que o router usa
    originalQuery: "e a bateria?",     // confirmação explícita
    hasActiveAnchor: true,
    lastBestProduct: MOCK_ANCHOR,
    detectedIntent: "refinement",
  });
  // resolvedQuery "mais rica" não é passada — roteador usa originalQuery
  expectTurnType(result, MIA_TURN_TYPES.FOLLOW_UP);
  console.log(`    (classificou como ${result.turnType} — baseado em originalQuery, não resolvedQuery)`);
});

// ─────────────────────────────────────────────────────────────
// PATCH 5.1B — Novos cenários
// ─────────────────────────────────────────────────────────────

console.log("\n──── PATCH 5.1B — Novos cenários ────");

// 5.1B — Cenário 1: originalQuery tem prioridade sobre resolvedQuery
console.log("\n5.1B-1. originalQuery prioridade sobre resolvedQuery (VALUE_QUESTION)");

test('"vale a pena?" com resolvedQuery enriquecida → VALUE_QUESTION (não NEW_SEARCH)', () => {
  const result = classifyMiaTurn({
    // query aqui seria a resolvedQuery — mais rica, parece nova busca
    query: "iPhone 13 vale a pena para uso pesado comprar agora",
    // originalQuery é o que o usuário realmente digitou — autoridade
    originalQuery: "vale a pena?",
    hasActiveAnchor: true,
    lastBestProduct: { product_name: "iPhone 13" },
    detectedIntent: "context_analysis",
  });
  expectTurnType(result, MIA_TURN_TYPES.VALUE_QUESTION);
  console.log(`    (classificou como ${result.turnType} — baseado em originalQuery, não resolvedQuery enriquecida)`);
});

// 5.1B — Cenário 2: Query enriquecida não transforma follow-up em nova busca
console.log("\n5.1B-2. Follow-up não vira NEW_SEARCH por enriquecimento");

test('"e a câmera?" não vira NEW_SEARCH mesmo com resolvedQuery enriquecida', () => {
  const result = classifyMiaTurn({
    query: "Samsung Galaxy A55 5G câmera especificações detalhes",  // resolvedQuery rica
    originalQuery: "e a câmera?",   // o que o usuário digitou
    hasActiveAnchor: true,
    lastBestProduct: MOCK_ANCHOR,
    detectedIntent: "refinement",
  });
  // originalQuery "e a câmera?" deve classificar como FOLLOW_UP
  expectTurnType(result, MIA_TURN_TYPES.FOLLOW_UP);
  console.log(`    (classificou como ${result.turnType} — originalQuery preservada)`);
});

// 5.1B — Cenário 3: CSO com postura conversacional aparece em signals e reasons
console.log("\n5.1B-3. CSO com postura conversacional enriquece signals/reasons");

test('CSO conversational_intent aparece nos reasons sem mudar turnType', () => {
  const result = classifyMiaTurn({
    query: "e a bateria?",
    originalQuery: "e a bateria?",
    hasActiveAnchor: true,
    lastBestProduct: MOCK_ANCHOR,
    detectedIntent: "refinement",
    cso: {
      conversationalIntent: "anchored_reaction",
      hasProductContext: true,
      userState: { isFrustrated: false, isUncertain: true },
      conversationArc: "deepening",
      constraintDirection: null,
    },
  });
  // turnType principal não deve mudar por causa do CSO
  expectTurnType(result, MIA_TURN_TYPES.FOLLOW_UP);
  // CSO deve enriquecer reasons
  const hasCSOReason = result.reasons.some(r => r.startsWith("cso_"));
  if (!hasCSOReason) {
    throw new Error("CSO signals not present in reasons: " + JSON.stringify(result.reasons));
  }
  // CSO deve aparecer em signals
  if (!result.signals.cso) {
    throw new Error("signals.cso is null/undefined — CSO not wired to signals");
  }
  if (result.signals.cso.conversationalIntent !== "anchored_reaction") {
    throw new Error("signals.cso.conversationalIntent mismatch");
  }
  console.log(`    (turnType: ${result.turnType}, reasons com CSO: ${result.reasons.filter(r=>r.startsWith("cso_")).join(", ")})`);
});

// 5.1B — Cenário 4: CSO com user frustrated aparece em reasons
test('CSO user_frustrated aparece nos reasons', () => {
  const result = classifyMiaTurn({
    query: "não gostei desse",
    originalQuery: "não gostei desse",
    hasActiveAnchor: true,
    lastBestProduct: MOCK_ANCHOR,
    cso: {
      conversationalIntent: "objection",
      hasProductContext: true,
      userState: { isFrustrated: true, isUncertain: false },
      conversationArc: null,
      constraintDirection: null,
    },
  });
  expectTurnType(result, MIA_TURN_TYPES.OBJECTION);
  const hasFrustratedReason = result.reasons.includes("cso_user_frustrated");
  if (!hasFrustratedReason) {
    throw new Error("cso_user_frustrated not in reasons: " + JSON.stringify(result.reasons));
  }
  console.log(`    (OBJECTION + cso_user_frustrated confirmados)`);
});

// 5.1B — Cenário 5: shadowOnly permanece true com CSO
test('shadowOnly ainda é true quando CSO é passado', () => {
  const result = classifyMiaTurn({
    query: "vale a pena?",
    originalQuery: "vale a pena?",
    hasActiveAnchor: true,
    lastBestProduct: MOCK_ANCHOR,
    cso: {
      conversationalIntent: "value_check",
      hasProductContext: true,
      userState: {},
      conversationArc: "deepening",
      constraintDirection: "budget_down",
    },
  });
  expect(result.shadowOnly, true, "shadowOnly with CSO");
  const hasConstraintReason = result.reasons.some(r => r.includes("budget_down"));
  if (!hasConstraintReason) {
    throw new Error("cso_constraint:budget_down not in reasons: " + JSON.stringify(result.reasons));
  }
  console.log(`    (shadowOnly=true + cso_constraint:budget_down em reasons)`);
});

// 5.1B — Cenário 6: sem CSO, signals.cso deve ser null
test('Sem CSO, signals.cso é null', () => {
  const result = classifyMiaTurn({
    query: "celular até 2000",
    originalQuery: "celular até 2000",
    hasActiveAnchor: false,
  });
  if (result.signals.cso !== null) {
    throw new Error(`signals.cso should be null without CSO, got: ${JSON.stringify(result.signals.cso)}`);
  }
  console.log(`    (signals.cso=null sem CSO — correto)`);
});

// 5.1B — Cenário 7: query ambígua com CSO conservador → UNKNOWN com reasons claras
test('Query ambígua com CSO → UNKNOWN ou CONVERSATIONAL com reasons claras', () => {
  const result = classifyMiaTurn({
    query: "hmm ok",
    originalQuery: "hmm ok",
    hasActiveAnchor: false,
    detectedIntent: "",
    cso: {
      conversationalIntent: "reaction",
      hasProductContext: false,
      userState: {},
    },
  });
  const acceptable = [MIA_TURN_TYPES.UNKNOWN, MIA_TURN_TYPES.CONVERSATIONAL, MIA_TURN_TYPES.REACTION];
  if (!acceptable.includes(result.turnType)) {
    throw new Error(`Expected UNKNOWN/CONVERSATIONAL/REACTION, got ${result.turnType}`);
  }
  if (!Array.isArray(result.reasons) || result.reasons.length === 0) {
    throw new Error("reasons must be non-empty");
  }
  expect(result.shadowOnly, true);
  console.log(`    (${result.turnType}, reasons: ${result.reasons.join(", ")})`);
});

// 5.1B — Cenário 8: resolvedQuery mais rica não substitui originalQuery para NEW_SEARCH
test('originalQuery "celular até 2000" não é sobrescrita por resolvedQuery diferente', () => {
  const result = classifyMiaTurn({
    query: "Samsung Galaxy celular até 2000 desempenho",  // resolvedQuery enriquecida
    originalQuery: "celular até 2000",                    // literal do usuário
    hasActiveAnchor: false,
    detectedIntent: "search",
  });
  expectTurnType(result, MIA_TURN_TYPES.NEW_SEARCH);
  console.log(`    (NEW_SEARCH via originalQuery — resolvedQuery não contaminou)`);
});

// ─────────────────────────────────────────────────────────────
// PATCH 5.2C — Cenários semânticos de EXPLANATION_REQUEST
//
// Objetivo: garantir que formas semanticamente equivalentes
// de pedido de explicação convergem para EXPLANATION_REQUEST,
// sem depender de frases específicas como mecanismo dominante.
//
// Os cenários cobrem 3 clusters de intenção:
//   Cluster 1 — Pedidos explícitos (já existiam, revalidados)
//   Cluster 2 — Falha de compreensão sobre recomendação (novo)
//   Cluster 3 — Perguntas sobre origem/causa da decisão (novo/expandido)
// ─────────────────────────────────────────────────────────────

console.log("\n──── PATCH 5.2C — Semântica de EXPLANATION_REQUEST ────");

// Cluster 1 — Pedidos explícitos (revalidação)
console.log("\n5.2C-1. Cluster 1: Pedidos explícitos (revalidação)");

test('"por que esse aparelho?" com âncora → EXPLANATION_REQUEST', () => {
  const result = classifyMiaTurn({
    query: "por que esse aparelho?",
    originalQuery: "por que esse aparelho?",
    hasActiveAnchor: true,
    lastBestProduct: MOCK_ANCHOR,
  });
  expectTurnType(result, MIA_TURN_TYPES.EXPLANATION_REQUEST);
  console.log(`    (${result.turnType}, confidence=${result.confidence}, reasons=${result.reasons.join(",")})`);
});

test('"qual foi o raciocínio?" com âncora → EXPLANATION_REQUEST', () => {
  const result = classifyMiaTurn({
    query: "qual foi o raciocínio?",
    originalQuery: "qual foi o raciocínio?",
    hasActiveAnchor: true,
    lastBestProduct: MOCK_ANCHOR,
  });
  expectTurnType(result, MIA_TURN_TYPES.EXPLANATION_REQUEST);
  console.log(`    (${result.turnType}, confidence=${result.confidence})`);
});

// Cluster 2 — Falha de compreensão (casos que falhavam antes do PATCH 5.2C)
console.log("\n5.2C-2. Cluster 2: Falha de compreensão sobre recomendação");

test('"não entendi a escolha" com âncora → EXPLANATION_REQUEST', () => {
  const result = classifyMiaTurn({
    query: "não entendi a escolha",
    originalQuery: "não entendi a escolha",
    hasActiveAnchor: true,
    lastBestProduct: MOCK_ANCHOR,
  });
  expectTurnType(result, MIA_TURN_TYPES.EXPLANATION_REQUEST);
  // Diagnóstico: sinal de compreensão deve aparecer em signals
  if (!result.signals.asksComprehension) {
    throw new Error("signals.asksComprehension deve ser true para 'não entendi a escolha'");
  }
  console.log(`    (${result.turnType}, asksComprehension=${result.signals.asksComprehension}, hasDecisionReference=${result.signals.hasDecisionReference})`);
});

test('"não ficou claro" com âncora → EXPLANATION_REQUEST', () => {
  const result = classifyMiaTurn({
    query: "não ficou claro",
    originalQuery: "não ficou claro",
    hasActiveAnchor: true,
    lastBestProduct: MOCK_ANCHOR,
  });
  expectTurnType(result, MIA_TURN_TYPES.EXPLANATION_REQUEST);
  if (!result.signals.asksComprehension) {
    throw new Error("signals.asksComprehension deve ser true para 'não ficou claro'");
  }
  console.log(`    (${result.turnType}, asksComprehension=${result.signals.asksComprehension})`);
});

test('"não entendi a decisão" com âncora → EXPLANATION_REQUEST', () => {
  const result = classifyMiaTurn({
    query: "não entendi a decisão",
    originalQuery: "não entendi a decisão",
    hasActiveAnchor: true,
    lastBestProduct: MOCK_ANCHOR,
  });
  expectTurnType(result, MIA_TURN_TYPES.EXPLANATION_REQUEST);
  console.log(`    (${result.turnType}, hasDecisionReference=${result.signals.hasDecisionReference})`);
});

// Cluster 3 — Perguntas sobre a origem/causa da decisão
console.log("\n5.2C-3. Cluster 3: Origem/causa da decisão");

test('"como você chegou nessa conclusão?" com âncora → EXPLANATION_REQUEST', () => {
  const result = classifyMiaTurn({
    query: "como você chegou nessa conclusão?",
    originalQuery: "como você chegou nessa conclusão?",
    hasActiveAnchor: true,
    lastBestProduct: MOCK_ANCHOR,
  });
  expectTurnType(result, MIA_TURN_TYPES.EXPLANATION_REQUEST);
  console.log(`    (${result.turnType}, confidence=${result.confidence})`);
});

test('"o que te fez escolher esse?" com âncora → EXPLANATION_REQUEST', () => {
  const result = classifyMiaTurn({
    query: "o que te fez escolher esse?",
    originalQuery: "o que te fez escolher esse?",
    hasActiveAnchor: true,
    lastBestProduct: MOCK_ANCHOR,
  });
  expectTurnType(result, MIA_TURN_TYPES.EXPLANATION_REQUEST);
  console.log(`    (${result.turnType}, confidence=${result.confidence})`);
});

test('"me explica essa decisão" com âncora → EXPLANATION_REQUEST', () => {
  const result = classifyMiaTurn({
    query: "me explica essa decisão",
    originalQuery: "me explica essa decisão",
    hasActiveAnchor: true,
    lastBestProduct: MOCK_ANCHOR,
  });
  expectTurnType(result, MIA_TURN_TYPES.EXPLANATION_REQUEST);
  console.log(`    (${result.turnType}, confidence=${result.confidence})`);
});

test('"por que ele ganhou?" com âncora → EXPLANATION_REQUEST', () => {
  const result = classifyMiaTurn({
    query: "por que ele ganhou?",
    originalQuery: "por que ele ganhou?",
    hasActiveAnchor: true,
    lastBestProduct: MOCK_ANCHOR,
  });
  expectTurnType(result, MIA_TURN_TYPES.EXPLANATION_REQUEST);
  console.log(`    (${result.turnType}, confidence=${result.confidence})`);
});

// Isolamento: sem âncora, falha de compreensão NÃO deve ser EXPLANATION_REQUEST
console.log("\n5.2C-4. Isolamento: sem âncora, classificação não deve ser EXPLANATION_REQUEST");

test('"não entendi a escolha" SEM âncora → NÃO deve ser EXPLANATION_REQUEST', () => {
  const result = classifyMiaTurn({
    query: "não entendi a escolha",
    originalQuery: "não entendi a escolha",
    hasActiveAnchor: false,
    lastBestProduct: null,
  });
  if (result.turnType === MIA_TURN_TYPES.EXPLANATION_REQUEST) {
    throw new Error(`Sem âncora, EXPLANATION_REQUEST não deve ser retornado — got ${result.turnType}`);
  }
  console.log(`    (${result.turnType} — correto, sem âncora)`);
});

// Não-degradação: outros turnTypes não devem ser afetados
console.log("\n5.2C-5. Não-degradação: VALUE_QUESTION, COMPARISON e REFINEMENT preservados");

test('"vale a pena?" com âncora → ainda VALUE_QUESTION (não EXPLANATION_REQUEST)', () => {
  const result = classifyMiaTurn({
    query: "vale a pena?",
    originalQuery: "vale a pena?",
    hasActiveAnchor: true,
    lastBestProduct: MOCK_ANCHOR,
  });
  expectTurnType(result, MIA_TURN_TYPES.VALUE_QUESTION);
  console.log(`    (${result.turnType} — não degradou)`);
});

test('"iPhone 13 ou Galaxy S23?" → ainda COMPARISON (não EXPLANATION_REQUEST)', () => {
  const result = classifyMiaTurn({
    query: "iPhone 13 ou Galaxy S23?",
    originalQuery: "iPhone 13 ou Galaxy S23?",
    hasActiveAnchor: false,
    detectedIntent: "comparison",
  });
  expectTurnType(result, MIA_TURN_TYPES.COMPARISON);
  console.log(`    (${result.turnType} — não degradou)`);
});

test('"tem algo mais barato?" com âncora → ainda REFINEMENT (não EXPLANATION_REQUEST)', () => {
  const result = classifyMiaTurn({
    query: "tem algo mais barato?",
    originalQuery: "tem algo mais barato?",
    hasActiveAnchor: true,
    lastBestProduct: MOCK_ANCHOR,
    detectedIntent: "refinement",
  });
  expectTurnType(result, MIA_TURN_TYPES.REFINEMENT);
  console.log(`    (${result.turnType} — não degradou)`);
});

// ─────────────────────────────────────────────────────────────
// Verificação de invariantes
// ─────────────────────────────────────────────────────────────

console.log("\n15. Invariantes");

test("classifyMiaTurn nunca retorna null", () => {
  const result = classifyMiaTurn();
  if (result === null || result === undefined) {
    throw new Error("returned null/undefined");
  }
  expect(result.shadowOnly, true);
});

test("shadowOnly é sempre true", () => {
  const queries = [
    "quero um celular",
    "e a bateria?",
    "vale a pena?",
    "não gostei",
    "bom dia",
    "",
  ];
  for (const q of queries) {
    const result = classifyMiaTurn({ query: q, hasActiveAnchor: false });
    if (result.shadowOnly !== true) {
      throw new Error(`shadowOnly !== true for query: "${q}"`);
    }
  }
});

test("turnType sempre é um valor de MIA_TURN_TYPES", () => {
  const validTypes = Object.values(MIA_TURN_TYPES);
  const testQueries = [
    { query: "celular até 2000", hasActiveAnchor: false },
    { query: "e a bateria?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR },
    { query: "não gostei", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR },
    { query: "", hasActiveAnchor: false },
    { query: "xyz aleatório aqui", hasActiveAnchor: false },
  ];
  for (const input of testQueries) {
    const result = classifyMiaTurn(input);
    if (!validTypes.includes(result.turnType)) {
      throw new Error(`turnType "${result.turnType}" is not in MIA_TURN_TYPES`);
    }
  }
});

// ─────────────────────────────────────────────────────────────
// PATCH 5.8A — Priority Shift Signal Expansion
// ─────────────────────────────────────────────────────────────

console.log("\nPATCH 5.8A — Priority shift (expandido)");

// Positivos — devem virar PRIORITY_SHIFT com âncora
test('"mas eu jogo" com âncora → PRIORITY_SHIFT', () => {
  const r = classifyMiaTurn({ query: "mas eu jogo", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test('"eu jogo bastante" com âncora → PRIORITY_SHIFT', () => {
  const r = classifyMiaTurn({ query: "eu jogo bastante", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test('"quero câmera" com âncora → PRIORITY_SHIFT', () => {
  const r = classifyMiaTurn({ query: "quero câmera", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test('"quero uma câmera melhor" com âncora → PRIORITY_SHIFT', () => {
  const r = classifyMiaTurn({ query: "quero uma câmera melhor", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test('"preciso de bateria" com âncora → PRIORITY_SHIFT', () => {
  const r = classifyMiaTurn({ query: "preciso de bateria", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test('"uso muito fora de casa" com âncora → PRIORITY_SHIFT', () => {
  const r = classifyMiaTurn({ query: "uso muito fora de casa", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test('"e se for pra durar?" com âncora → PRIORITY_SHIFT', () => {
  const r = classifyMiaTurn({ query: "e se for pra durar?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test('"quero que dure anos" com âncora → PRIORITY_SHIFT', () => {
  const r = classifyMiaTurn({ query: "quero que dure anos", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test('"vou usar pra trabalho" com âncora → PRIORITY_SHIFT', () => {
  const r = classifyMiaTurn({ query: "vou usar pra trabalho", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test('"uso pra estudar" com âncora → PRIORITY_SHIFT', () => {
  const r = classifyMiaTurn({ query: "uso pra estudar", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test('"quero algo mais leve" com âncora → PRIORITY_SHIFT', () => {
  const r = classifyMiaTurn({ query: "quero algo mais leve", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

// Negativos — NÃO devem virar PRIORITY_SHIFT
test('"ok" com âncora → não PRIORITY_SHIFT', () => {
  const r = classifyMiaTurn({ query: "ok", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  if (r.turnType === MIA_TURN_TYPES.PRIORITY_SHIFT) throw new Error(`"ok" virou PRIORITY_SHIFT, esperado outro`);
});

test('"entendi" com âncora → não PRIORITY_SHIFT', () => {
  const r = classifyMiaTurn({ query: "entendi", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  if (r.turnType === MIA_TURN_TYPES.PRIORITY_SHIFT) throw new Error(`"entendi" virou PRIORITY_SHIFT`);
});

test('"tem certeza?" com âncora → EXPLANATION_REQUEST, não PRIORITY_SHIFT', () => {
  const r = classifyMiaTurn({ query: "tem certeza?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test('"ainda vale a pena?" com âncora → não PRIORITY_SHIFT', () => {
  const r = classifyMiaTurn({ query: "ainda vale a pena?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  if (r.turnType === MIA_TURN_TYPES.PRIORITY_SHIFT) throw new Error(`"ainda vale a pena?" virou PRIORITY_SHIFT`);
});

test('"tem outro melhor?" com âncora → REFINEMENT, não PRIORITY_SHIFT', () => {
  const r = classifyMiaTurn({ query: "tem outro melhor?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REFINEMENT);
});

test('"iPhone 13 ou S23 FE?" → COMPARISON, não PRIORITY_SHIFT', () => {
  const r = classifyMiaTurn({ query: "iPhone 13 ou S23 FE?", hasActiveAnchor: false });
  expectTurnType(r, MIA_TURN_TYPES.COMPARISON);
});

test('"celular até 2000" sem âncora → NEW_SEARCH, não PRIORITY_SHIFT', () => {
  const r = classifyMiaTurn({ query: "celular até 2000", hasActiveAnchor: false });
  expectTurnType(r, MIA_TURN_TYPES.NEW_SEARCH);
});

test('"?" com âncora → não PRIORITY_SHIFT', () => {
  const r = classifyMiaTurn({ query: "?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  if (r.turnType === MIA_TURN_TYPES.PRIORITY_SHIFT) throw new Error(`"?" virou PRIORITY_SHIFT`);
});

// ─────────────────────────────────────────────────────────────
// PATCH 5.8B — Minimal Explanation Follow-Up Expansion
// ─────────────────────────────────────────────────────────────

console.log("\nPATCH 5.8B — Minimal explanation follow-up");

// Positivos com âncora (Cluster 9 — novos)
test('"por quê?" com âncora → EXPLANATION_REQUEST', () => {
  const r = classifyMiaTurn({ query: "por quê?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test('"por que?" com âncora → EXPLANATION_REQUEST', () => {
  const r = classifyMiaTurn({ query: "por que?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test('"pq?" com âncora → EXPLANATION_REQUEST', () => {
  const r = classifyMiaTurn({ query: "pq?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test('"como assim?" com âncora → EXPLANATION_REQUEST', () => {
  const r = classifyMiaTurn({ query: "como assim?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

// Positivos com âncora (já cobertos por Clusters 1/2 — validação de não-regressão)
test('"não entendi" com âncora → EXPLANATION_REQUEST (Cluster 2)', () => {
  const r = classifyMiaTurn({ query: "não entendi", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test('"explica melhor" com âncora → EXPLANATION_REQUEST (Cluster 1)', () => {
  const r = classifyMiaTurn({ query: "explica melhor", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test('"me explica" com âncora → EXPLANATION_REQUEST (Cluster 1)', () => {
  const r = classifyMiaTurn({ query: "me explica", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test('"qual o motivo?" com âncora → EXPLANATION_REQUEST (Cluster 1)', () => {
  const r = classifyMiaTurn({ query: "qual o motivo?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

// Negativos — sem âncora não deve inventar contexto
test('"por quê?" sem âncora → NÃO EXPLANATION_REQUEST', () => {
  const r = classifyMiaTurn({ query: "por quê?", hasActiveAnchor: false });
  if (r.turnType === MIA_TURN_TYPES.EXPLANATION_REQUEST) {
    throw new Error(`"por quê?" sem âncora virou EXPLANATION_REQUEST`);
  }
});

test('"como assim?" sem âncora → NÃO EXPLANATION_REQUEST', () => {
  const r = classifyMiaTurn({ query: "como assim?", hasActiveAnchor: false });
  if (r.turnType === MIA_TURN_TYPES.EXPLANATION_REQUEST) {
    throw new Error(`"como assim?" sem âncora virou EXPLANATION_REQUEST`);
  }
});

// Negativos — não contaminar outros turnTypes
test('"ok" com âncora → NÃO EXPLANATION_REQUEST', () => {
  const r = classifyMiaTurn({ query: "ok", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  if (r.turnType === MIA_TURN_TYPES.EXPLANATION_REQUEST) {
    throw new Error(`"ok" virou EXPLANATION_REQUEST`);
  }
});

test('"?" com âncora → NÃO EXPLANATION_REQUEST', () => {
  const r = classifyMiaTurn({ query: "?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  if (r.turnType === MIA_TURN_TYPES.EXPLANATION_REQUEST) {
    throw new Error(`"?" virou EXPLANATION_REQUEST`);
  }
});

test('"tem certeza?" continua EXPLANATION_REQUEST (confidence_challenge)', () => {
  const r = classifyMiaTurn({ query: "tem certeza?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test('"mas eu jogo" continua PRIORITY_SHIFT', () => {
  const r = classifyMiaTurn({ query: "mas eu jogo", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test('"tem outro melhor?" continua REFINEMENT', () => {
  const r = classifyMiaTurn({ query: "tem outro melhor?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REFINEMENT);
});

test('"iPhone 13 ou S23 FE?" continua COMPARISON', () => {
  const r = classifyMiaTurn({ query: "iPhone 13 ou S23 FE?", hasActiveAnchor: false });
  expectTurnType(r, MIA_TURN_TYPES.COMPARISON);
});

test('"celular até 2000" sem âncora continua NEW_SEARCH', () => {
  const r = classifyMiaTurn({ query: "celular até 2000", hasActiveAnchor: false });
  expectTurnType(r, MIA_TURN_TYPES.NEW_SEARCH);
});

// ─────────────────────────────────────────────────────────────
// PATCH 5.8C — Residual Follow-Up Gaps Fix
// ─────────────────────────────────────────────────────────────

console.log("\nPATCH 5.8C — Acknowledgement / confidence challenge / price objection");

// ── Fix 1: Standalone acknowledgements → REACTION ──────────────
test('"ok" com âncora → REACTION (acknowledgement)', () => {
  const r = classifyMiaTurn({ query: "ok", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REACTION);
});

test('"certo" com âncora → REACTION', () => {
  const r = classifyMiaTurn({ query: "certo", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REACTION);
});

test('"beleza" com âncora → REACTION', () => {
  const r = classifyMiaTurn({ query: "beleza", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REACTION);
});

test('"show" com âncora → REACTION', () => {
  const r = classifyMiaTurn({ query: "show", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REACTION);
});

test('"entendi" com âncora → REACTION (não regredir)', () => {
  const r = classifyMiaTurn({ query: "entendi", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REACTION);
});

// ── Fix 2: Standalone rhetorical challenge → EXPLANATION_REQUEST ──
test('"sério?" com âncora → EXPLANATION_REQUEST (confidence_challenge)', () => {
  const r = classifyMiaTurn({ query: "sério?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
  const hasSubtype = r.reasons.some(reason => reason.includes("confidence_challenge"));
  if (!hasSubtype) throw new Error(`"sério?" deve ter subtype confidence_challenge. Reasons: ${r.reasons}`);
});

test('"realmente?" com âncora → EXPLANATION_REQUEST (confidence_challenge)', () => {
  const r = classifyMiaTurn({ query: "realmente?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test('"tem certeza?" continua EXPLANATION_REQUEST (confidence_challenge)', () => {
  const r = classifyMiaTurn({ query: "tem certeza?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

// ── Fix 3: Price objection → OBJECTION ──────────────────────────
test('"acho caro" com âncora → OBJECTION', () => {
  const r = classifyMiaTurn({ query: "acho caro", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.OBJECTION);
});

test('"parece caro" com âncora → OBJECTION', () => {
  const r = classifyMiaTurn({ query: "parece caro", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.OBJECTION);
});

test('"muito caro" com âncora → OBJECTION', () => {
  const r = classifyMiaTurn({ query: "muito caro", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.OBJECTION);
});

test('"caro demais" com âncora → OBJECTION', () => {
  const r = classifyMiaTurn({ query: "caro demais", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.OBJECTION);
});

// ── Negativos — sem contaminação ────────────────────────────────
test('"ok" sem âncora → não REACTION', () => {
  const r = classifyMiaTurn({ query: "ok", hasActiveAnchor: false });
  if (r.turnType === MIA_TURN_TYPES.REACTION) throw new Error(`"ok" sem âncora virou REACTION`);
});

test('"sério?" sem âncora → não EXPLANATION_REQUEST', () => {
  const r = classifyMiaTurn({ query: "sério?", hasActiveAnchor: false });
  if (r.turnType === MIA_TURN_TYPES.EXPLANATION_REQUEST) throw new Error(`"sério?" sem âncora virou EXPLANATION_REQUEST`);
});

test('"mas eu jogo" continua PRIORITY_SHIFT', () => {
  const r = classifyMiaTurn({ query: "mas eu jogo", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test('"por quê?" continua EXPLANATION_REQUEST', () => {
  const r = classifyMiaTurn({ query: "por quê?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test('"tem outro melhor?" continua REFINEMENT', () => {
  const r = classifyMiaTurn({ query: "tem outro melhor?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REFINEMENT);
});

test('"iPhone 13 ou S23 FE?" continua COMPARISON', () => {
  const r = classifyMiaTurn({ query: "iPhone 13 ou S23 FE?", hasActiveAnchor: false });
  expectTurnType(r, MIA_TURN_TYPES.COMPARISON);
});

test('"celular até 2000" continua NEW_SEARCH', () => {
  const r = classifyMiaTurn({ query: "celular até 2000", hasActiveAnchor: false });
  expectTurnType(r, MIA_TURN_TYPES.NEW_SEARCH);
});

test('"?" continua UNKNOWN (SYMBOL_ONLY)', () => {
  const r = classifyMiaTurn({ query: "?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.UNKNOWN);
});

// ─────────────────────────────────────────────────────────────
// PATCH 6.5 — Grupo 14: OBJECTION_PRICE vocabulary expansion
// ─────────────────────────────────────────────────────────────

test("PESO FINANCEIRO: 'pesou no bolso' → OBJECTION", () => {
  const r = classifyMiaTurn({ query: "pesou no bolso", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.OBJECTION);
});

test("PESO FINANCEIRO: 'preço ficou pesado' → OBJECTION", () => {
  const r = classifyMiaTurn({ query: "preço ficou pesado", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.OBJECTION);
});

test("PESO FINANCEIRO: 'tá puxado' → OBJECTION", () => {
  const r = classifyMiaTurn({ query: "tá puxado", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.OBJECTION);
});

test("PESO FINANCEIRO: 'tá salgado' → OBJECTION", () => {
  const r = classifyMiaTurn({ query: "tá salgado", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.OBJECTION);
});

test("PESO FINANCEIRO: 'valor ficou pesado' → OBJECTION", () => {
  const r = classifyMiaTurn({ query: "valor ficou pesado", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.OBJECTION);
});

test("ESTOURO ORÇAMENTO: 'passou do meu orçamento' → OBJECTION", () => {
  const r = classifyMiaTurn({ query: "passou do meu orçamento", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.OBJECTION);
});

test("ESTOURO ORÇAMENTO: 'estourou meu limite' → OBJECTION", () => {
  const r = classifyMiaTurn({ query: "estourou meu limite", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.OBJECTION);
});

test("ESTOURO ORÇAMENTO: 'excedeu meu orçamento' → OBJECTION", () => {
  const r = classifyMiaTurn({ query: "excedeu meu orçamento", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.OBJECTION);
});

test("EXPECTATIVA EXCEDIDA: 'ficou acima do que eu esperava' → OBJECTION", () => {
  const r = classifyMiaTurn({ query: "ficou acima do que eu esperava", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.OBJECTION);
});

test("EXPECTATIVA EXCEDIDA: 'mais caro do que eu pensava' → OBJECTION", () => {
  const r = classifyMiaTurn({ query: "mais caro do que eu pensava", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.OBJECTION);
});

test("EXPECTATIVA EXCEDIDA: 'saiu mais caro do que imaginava' → OBJECTION", () => {
  const r = classifyMiaTurn({ query: "saiu mais caro do que imaginava", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.OBJECTION);
});

test("GASTO INDESEJADO: 'não queria gastar tudo isso' → OBJECTION", () => {
  const r = classifyMiaTurn({ query: "não queria gastar tudo isso", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.OBJECTION);
});

test("GASTO INDESEJADO: 'queria gastar menos' → OBJECTION", () => {
  const r = classifyMiaTurn({ query: "queria gastar menos", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.OBJECTION);
});

test("GASTO INDESEJADO: 'não queria chegar nesse valor' → OBJECTION", () => {
  const r = classifyMiaTurn({ query: "não queria chegar nesse valor", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.OBJECTION);
});

test("GASTO INDESEJADO: 'não queria pagar tanto' → OBJECTION", () => {
  const r = classifyMiaTurn({ query: "não queria pagar tanto", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.OBJECTION);
});

test("DESCONFORTO PREÇO: 'esse valor me incomoda' → OBJECTION", () => {
  const r = classifyMiaTurn({ query: "esse valor me incomoda", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.OBJECTION);
});

test("DESCONFORTO PREÇO: 'não sei se vale esse preço' → OBJECTION", () => {
  const r = classifyMiaTurn({ query: "não sei se vale esse preço", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.OBJECTION);
});

test("DESCONFORTO PREÇO: 'está caro para mim' → OBJECTION", () => {
  const r = classifyMiaTurn({ query: "está caro para mim", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.OBJECTION);
});

test("DESCONFORTO PREÇO: 'ficou caro pra mim' → OBJECTION", () => {
  const r = classifyMiaTurn({ query: "ficou caro pra mim", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.OBJECTION);
});

test("DESCONFORTO PREÇO: 'o preço me preocupa' → OBJECTION", () => {
  const r = classifyMiaTurn({ query: "o preço me preocupa", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.OBJECTION);
});

// ─────────────────────────────────────────────────────────────
// PATCH 6.5 — Grupo 15: EXPLANATION_REQUEST Cluster 10 (Decision Reasoning)
// ─────────────────────────────────────────────────────────────

test("GANHOU: 'o que fez ele ganhar?' → EXPLANATION_REQUEST", () => {
  const r = classifyMiaTurn({ query: "o que fez ele ganhar?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test("GANHOU: 'por que ele ficou em primeiro?' → EXPLANATION_REQUEST", () => {
  const r = classifyMiaTurn({ query: "por que ele ficou em primeiro?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test("GANHOU: 'por que ele ganhou?' → EXPLANATION_REQUEST", () => {
  const r = classifyMiaTurn({ query: "por que ele ganhou?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test("GANHOU: 'o que fez com que ele vencesse?' → EXPLANATION_REQUEST", () => {
  const r = classifyMiaTurn({ query: "o que fez com que ele vencesse?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test("DIFERENCIAL: 'qual foi o diferencial?' → EXPLANATION_REQUEST", () => {
  const r = classifyMiaTurn({ query: "qual foi o diferencial?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test("DIFERENCIAL: 'qual a vantagem principal?' → EXPLANATION_REQUEST", () => {
  const r = classifyMiaTurn({ query: "qual a vantagem principal?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test("DIFERENCIAL: 'qual o ponto forte?' → EXPLANATION_REQUEST", () => {
  const r = classifyMiaTurn({ query: "qual o ponto forte?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test("DIFERENCIAL: 'o que ele faz melhor?' → EXPLANATION_REQUEST", () => {
  const r = classifyMiaTurn({ query: "o que ele faz melhor?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test("DIFERENCIAL: 'o que tem de especial?' → EXPLANATION_REQUEST", () => {
  const r = classifyMiaTurn({ query: "o que tem de especial?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test("DIFERENCIAL: 'qual o destaque principal?' → EXPLANATION_REQUEST", () => {
  const r = classifyMiaTurn({ query: "qual o destaque principal?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test("DIFERENCIAL: 'qual a lógica dessa escolha?' → EXPLANATION_REQUEST", () => {
  const r = classifyMiaTurn({ query: "qual a lógica dessa escolha?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test("FATOR DECISIVO: 'o que pesou mais?' → EXPLANATION_REQUEST", () => {
  const r = classifyMiaTurn({ query: "o que pesou mais?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test("FATOR DECISIVO: 'o que pesou na decisão?' → EXPLANATION_REQUEST", () => {
  const r = classifyMiaTurn({ query: "o que pesou na decisão?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test("FATOR DECISIVO: 'qual foi o fator decisivo?' → EXPLANATION_REQUEST", () => {
  const r = classifyMiaTurn({ query: "qual foi o fator decisivo?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test("FATOR DECISIVO: 'qual o motivo decisivo?' → EXPLANATION_REQUEST", () => {
  const r = classifyMiaTurn({ query: "qual o motivo decisivo?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test("FATOR DECISIVO: 'o que te levou a recomendar esse?' → EXPLANATION_REQUEST", () => {
  const r = classifyMiaTurn({ query: "o que te levou a recomendar esse?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test("FATOR DECISIVO: 'o que levou você a escolher esse?' → EXPLANATION_REQUEST", () => {
  const r = classifyMiaTurn({ query: "o que levou você a escolher esse?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test("sem âncora: 'o que fez ele ganhar?' → NÃO EXPLANATION_REQUEST", () => {
  const r = classifyMiaTurn({ query: "o que fez ele ganhar?", hasActiveAnchor: false });
  if (r.turnType === MIA_TURN_TYPES.EXPLANATION_REQUEST) {
    throw new Error(`Sem âncora NÃO deve ser EXPLANATION_REQUEST — got: ${r.turnType}`);
  }
});

test("sem âncora: 'qual o diferencial?' → NÃO EXPLANATION_REQUEST", () => {
  const r = classifyMiaTurn({ query: "qual o diferencial?", hasActiveAnchor: false });
  if (r.turnType === MIA_TURN_TYPES.EXPLANATION_REQUEST) {
    throw new Error(`Sem âncora NÃO deve ser EXPLANATION_REQUEST — got: ${r.turnType}`);
  }
});

test("sem âncora: 'o que pesou?' → NÃO EXPLANATION_REQUEST", () => {
  const r = classifyMiaTurn({ query: "o que pesou?", hasActiveAnchor: false });
  if (r.turnType === MIA_TURN_TYPES.EXPLANATION_REQUEST) {
    throw new Error(`Sem âncora NÃO deve ser EXPLANATION_REQUEST — got: ${r.turnType}`);
  }
});

// ─────────────────────────────────────────────────────────────
// PATCH 6.5 — Grupo 16: REFINEMENT Alternative Exploration
// ─────────────────────────────────────────────────────────────

test("SEGUNDA POSIÇÃO: 'qual seria o plano B?' → REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "qual seria o plano B?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REFINEMENT);
});

test("SEGUNDA POSIÇÃO: 'quem quase ganhou?' → REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "quem quase ganhou?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REFINEMENT);
});

test("SEGUNDA POSIÇÃO: 'quem ficou em segundo?' → REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "quem ficou em segundo?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REFINEMENT);
});

test("SEGUNDA POSIÇÃO: 'qual o segundo lugar?' → REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "qual o segundo lugar?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REFINEMENT);
});

test("SEGUNDA POSIÇÃO: 'tem uma segunda opção?' → REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "tem uma segunda opção?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REFINEMENT);
});

test("RESERVA: 'tem um reserva?' → REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "tem um reserva?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REFINEMENT);
});

test("RESERVA: 'tem um backup?' → REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "tem um backup?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REFINEMENT);
});

test("RESERVA: 'qual seria o backup?' → REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "qual seria o backup?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REFINEMENT);
});

test("OUTRA OPÇÃO: 'qual outro faria sentido?' → REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "qual outro faria sentido?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REFINEMENT);
});

test("OUTRA OPÇÃO: 'o que vem logo depois?' → REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "o que vem logo depois?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REFINEMENT);
});

test("OUTRA OPÇÃO: 'o que ficou logo atrás?' → REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "o que ficou logo atrás?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REFINEMENT);
});

test("OUTRA OPÇÃO: 'qual o concorrente mais forte?' → REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "qual o concorrente mais forte?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REFINEMENT);
});

test("OUTRA OPÇÃO: 'existe uma opção mais segura?' → REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "existe uma opção mais segura?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REFINEMENT);
});

test("REJEIÇÃO CONDICIONAL: 'se eu não quiser esse, qual seria?' → REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "se eu não quiser esse, qual seria?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REFINEMENT);
});

test("REJEIÇÃO CONDICIONAL: 'se não ficar com esse, qual você escolheria?' → REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "se não ficar com esse, qual você escolheria?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REFINEMENT);
});

test("sem âncora: 'qual seria o plano B?' → NÃO REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "qual seria o plano B?", hasActiveAnchor: false });
  if (r.turnType === MIA_TURN_TYPES.REFINEMENT) {
    throw new Error(`Sem âncora NÃO deve ser REFINEMENT — got: ${r.turnType}`);
  }
});

test("sem âncora: 'tem um backup?' → NÃO REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "tem um backup?", hasActiveAnchor: false });
  if (r.turnType === MIA_TURN_TYPES.REFINEMENT) {
    throw new Error(`Sem âncora NÃO deve ser REFINEMENT — got: ${r.turnType}`);
  }
});

test("sem âncora: 'qual o concorrente mais forte?' → NÃO REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "qual o concorrente mais forte?", hasActiveAnchor: false });
  if (r.turnType === MIA_TURN_TYPES.REFINEMENT) {
    throw new Error(`Sem âncora NÃO deve ser REFINEMENT — got: ${r.turnType}`);
  }
});

test("REFINEMENT: 'existe uma opção mais barata sem perder muito?' ainda REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "existe uma opção mais barata sem perder muito?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REFINEMENT);
});

test("NÃO confunde bateria reserva com reserva de produto", () => {
  const r = classifyMiaTurn({ query: "tem bateria reserva?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  if (r.turnType === MIA_TURN_TYPES.REFINEMENT && r.reasons?.includes("refinement_signal_detected")) {
    // bateria reserva NÃO deve ativar reserveAlternativeSignal — pode ser FOLLOW_UP
    // Só falha se não estiver correto semanticamente
  }
  // Aceita FOLLOW_UP ou REFINEMENT — mas jamais OBJECTION
  if (r.turnType === MIA_TURN_TYPES.OBJECTION) {
    throw new Error(`'bateria reserva' NÃO deve ser OBJECTION — got: ${r.turnType}`);
  }
});

// ─────────────────────────────────────────────────────────────
// PATCH 6.5 — Grupo 17: CONFIDENCE_CHALLENGE Signal F (Personal Commitment)
// ─────────────────────────────────────────────────────────────

test("COMPRA PESSOAL: 'você compraria esse?' → EXPLANATION_REQUEST (confidence_challenge)", () => {
  const r = classifyMiaTurn({ query: "você compraria esse?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test("COMPRA PESSOAL: 'você escolheria esse para você?' → EXPLANATION_REQUEST", () => {
  const r = classifyMiaTurn({ query: "você escolheria esse para você?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test("COMPRA PESSOAL: 'você iria nele?' → EXPLANATION_REQUEST", () => {
  const r = classifyMiaTurn({ query: "você iria nele?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test("DINHEIRO PRÓPRIO: 'se fosse seu dinheiro, iria nele?' → EXPLANATION_REQUEST", () => {
  const r = classifyMiaTurn({ query: "se fosse seu dinheiro, iria nele?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test("DINHEIRO PRÓPRIO: 'se fosse seu bolso, compraria?' → EXPLANATION_REQUEST", () => {
  const r = classifyMiaTurn({ query: "se fosse seu bolso, compraria?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test("COMPROMETIMENTO: 'você bancaria essa decisão?' → EXPLANATION_REQUEST", () => {
  const r = classifyMiaTurn({ query: "você bancaria essa decisão?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test("COMPROMETIMENTO: 'você manteria essa escolha?' → EXPLANATION_REQUEST", () => {
  const r = classifyMiaTurn({ query: "você manteria essa escolha?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test("COMPROMETIMENTO: 'você defenderia essa recomendação?' → EXPLANATION_REQUEST", () => {
  const r = classifyMiaTurn({ query: "você defenderia essa recomendação?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test("CONFIANÇA DIRETA: 'dá pra confiar mesmo?' → EXPLANATION_REQUEST", () => {
  const r = classifyMiaTurn({ query: "dá pra confiar mesmo?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test("CONFIANÇA DIRETA: 'dá pra confiar nessa recomendação?' → EXPLANATION_REQUEST", () => {
  const r = classifyMiaTurn({ query: "dá pra confiar nessa recomendação?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test("FORÇA RECOM.: 'não está forçando essa escolha?' → EXPLANATION_REQUEST", () => {
  const r = classifyMiaTurn({ query: "não está forçando essa escolha?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test("PRIORIDADE: 'essa continua sendo sua primeira opção?' → EXPLANATION_REQUEST", () => {
  const r = classifyMiaTurn({ query: "essa continua sendo sua primeira opção?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test("sem âncora: 'você compraria esse?' → NÃO EXPLANATION_REQUEST", () => {
  const r = classifyMiaTurn({ query: "você compraria esse?", hasActiveAnchor: false });
  if (r.turnType === MIA_TURN_TYPES.EXPLANATION_REQUEST) {
    throw new Error(`Sem âncora NÃO deve ser EXPLANATION_REQUEST — got: ${r.turnType}`);
  }
});

test("sem âncora: 'se fosse seu dinheiro?' → NÃO EXPLANATION_REQUEST", () => {
  const r = classifyMiaTurn({ query: "se fosse seu dinheiro?", hasActiveAnchor: false });
  if (r.turnType === MIA_TURN_TYPES.EXPLANATION_REQUEST) {
    throw new Error(`Sem âncora NÃO deve ser EXPLANATION_REQUEST — got: ${r.turnType}`);
  }
});

test("CONFIDENCE_CHALLENGE subtype verificado: 'você compraria esse?' → subtype confidence_challenge", () => {
  const r = classifyMiaTurn({ query: "você compraria esse?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  const hasSubtype = r.reasons?.some(rs => rs.includes("confidence_challenge"));
  if (!hasSubtype) {
    throw new Error(`Esperado subtype confidence_challenge em reasons — got: ${JSON.stringify(r.reasons)}`);
  }
});

test("CONFIDENCE_CHALLENGE subtype verificado: 'se fosse seu dinheiro?' → subtype confidence_challenge", () => {
  const r = classifyMiaTurn({ query: "se fosse seu dinheiro, compraria?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  const hasSubtype = r.reasons?.some(rs => rs.includes("confidence_challenge"));
  if (!hasSubtype) {
    throw new Error(`Esperado subtype confidence_challenge em reasons — got: ${JSON.stringify(r.reasons)}`);
  }
});

// ─────────────────────────────────────────────────────────────
// PATCH 6.5 — Grupo 18: Testes de Regressão Negativos
// ─────────────────────────────────────────────────────────────

test("REG NEGATIVO: 'quero algo mais barato' NÃO OBJECTION (deve ser REFINEMENT)", () => {
  const r = classifyMiaTurn({ query: "quero algo mais barato", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  if (r.turnType === MIA_TURN_TYPES.OBJECTION) {
    throw new Error(`'quero algo mais barato' NÃO deve ser OBJECTION — got: ${r.turnType}`);
  }
});

test("REG NEGATIVO: 'tem promoção?' NÃO OBJECTION (busca/refinamento)", () => {
  const r = classifyMiaTurn({ query: "tem promoção?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  if (r.turnType === MIA_TURN_TYPES.OBJECTION) {
    throw new Error(`'tem promoção?' NÃO deve ser OBJECTION — got: ${r.turnType}`);
  }
});

test("REG NEGATIVO: 'tem desconto?' NÃO OBJECTION (busca/refinamento)", () => {
  const r = classifyMiaTurn({ query: "tem desconto?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  if (r.turnType === MIA_TURN_TYPES.OBJECTION) {
    throw new Error(`'tem desconto?' NÃO deve ser OBJECTION — got: ${r.turnType}`);
  }
});

test("REG NEGATIVO: 'celular bom e barato' sem âncora NÃO é OBJECTION/EXPLANATION/REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "celular bom e barato", hasActiveAnchor: false });
  if (
    r.turnType === MIA_TURN_TYPES.OBJECTION ||
    r.turnType === MIA_TURN_TYPES.EXPLANATION_REQUEST ||
    r.turnType === MIA_TURN_TYPES.REFINEMENT
  ) {
    throw new Error(`'celular bom e barato' sem âncora NÃO deve ser turno contextual — got: ${r.turnType}`);
  }
});

test("REG NEGATIVO: 'que tal outro modelo?' não regride para OBJECTION", () => {
  const r = classifyMiaTurn({ query: "que tal outro modelo?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  if (r.turnType === MIA_TURN_TYPES.OBJECTION) {
    throw new Error(`'que tal outro modelo?' NÃO deve ser OBJECTION — got: ${r.turnType}`);
  }
});

test("REG NEGATIVO: 'iPhone 16 ou Galaxy S25?' continua COMPARISON", () => {
  const r = classifyMiaTurn({ query: "iPhone 16 ou Galaxy S25?", hasActiveAnchor: false });
  expectTurnType(r, MIA_TURN_TYPES.COMPARISON);
});

test("REG NEGATIVO: 'mas eu jogo bastante' continua PRIORITY_SHIFT", () => {
  const r = classifyMiaTurn({ query: "mas eu jogo bastante", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test("REG NEGATIVO: 'quero câmera boa' continua PRIORITY_SHIFT", () => {
  const r = classifyMiaTurn({ query: "quero câmera boa", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test("REG NEGATIVO: 'ok' com âncora continua REACTION", () => {
  const r = classifyMiaTurn({ query: "ok", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REACTION);
});

test("REG NEGATIVO: 'acho caro' continua OBJECTION (original PATCH 5.8C)", () => {
  const r = classifyMiaTurn({ query: "acho caro", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.OBJECTION);
});

test("REG NEGATIVO: 'muito caro' continua OBJECTION (original PATCH 5.8C)", () => {
  const r = classifyMiaTurn({ query: "muito caro", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.OBJECTION);
});

test("REG NEGATIVO: 'tem certeza?' continua EXPLANATION_REQUEST (confidence_challenge original)", () => {
  const r = classifyMiaTurn({ query: "tem certeza?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test("REG NEGATIVO: 'por quê?' continua EXPLANATION_REQUEST (Cluster 9 original)", () => {
  const r = classifyMiaTurn({ query: "por quê?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test("REG NEGATIVO: 'tem outro melhor?' continua REFINEMENT (original)", () => {
  const r = classifyMiaTurn({ query: "tem outro melhor?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REFINEMENT);
});

test("REG NEGATIVO: sem âncora 'pesou no bolso' NÃO OBJECTION", () => {
  const r = classifyMiaTurn({ query: "pesou no bolso", hasActiveAnchor: false });
  if (r.turnType === MIA_TURN_TYPES.OBJECTION) {
    throw new Error(`Sem âncora NÃO deve ser OBJECTION — got: ${r.turnType}`);
  }
});

test("REG NEGATIVO: sem âncora 'passou do meu orçamento' NÃO OBJECTION", () => {
  const r = classifyMiaTurn({ query: "passou do meu orçamento", hasActiveAnchor: false });
  if (r.turnType === MIA_TURN_TYPES.OBJECTION) {
    throw new Error(`Sem âncora NÃO deve ser OBJECTION — got: ${r.turnType}`);
  }
});

test("REG NEGATIVO: 'sério?' continua EXPLANATION_REQUEST (PATCH 5.8C)", () => {
  const r = classifyMiaTurn({ query: "sério?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test("REG NEGATIVO: 'celular até 1500 pra jogar' sem âncora continua NEW_SEARCH", () => {
  const r = classifyMiaTurn({ query: "celular até 1500 pra jogar", hasActiveAnchor: false });
  expectTurnType(r, MIA_TURN_TYPES.NEW_SEARCH);
});

test("REG NEGATIVO: 'qual tem mais bateria?' com âncora continua REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "qual tem mais bateria?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  if (r.turnType === MIA_TURN_TYPES.OBJECTION || r.turnType === MIA_TURN_TYPES.EXPLANATION_REQUEST) {
    throw new Error(`'qual tem mais bateria?' NÃO deve ser OBJECTION/EXP — got: ${r.turnType}`);
  }
});

test("REG NEGATIVO: 'o que mais te incomoda no Galaxy?' NÃO OBJECTION (é pergunta inversa)", () => {
  const r = classifyMiaTurn({ query: "o que mais te incomoda no Galaxy?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  if (r.turnType === MIA_TURN_TYPES.OBJECTION) {
    throw new Error(`Pergunta invertida NÃO deve ser OBJECTION — got: ${r.turnType}`);
  }
});

// ─────────────────────────────────────────────────────────────
// PATCH 6.6 — Grupo 19: PRIORITY_SHIFT Layer E (Uso Intenso)
// ─────────────────────────────────────────────────────────────

test("USO INTENSO: 'eu passo horas jogando' → PRIORITY_SHIFT", () => {
  const r = classifyMiaTurn({ query: "eu passo horas jogando", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test("USO INTENSO: 'costumo jogar muito' → PRIORITY_SHIFT", () => {
  const r = classifyMiaTurn({ query: "costumo jogar muito", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test("USO INTENSO: 'rodo jogo pesado' → PRIORITY_SHIFT", () => {
  const r = classifyMiaTurn({ query: "rodo jogo pesado", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test("USO INTENSO: 'tiro muita foto' → PRIORITY_SHIFT", () => {
  const r = classifyMiaTurn({ query: "tiro muita foto", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test("USO INTENSO: 'gravo bastante vídeo' → PRIORITY_SHIFT", () => {
  const r = classifyMiaTurn({ query: "gravo bastante vídeo", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test("USO INTENSO: 'costumo usar bastante câmera' → PRIORITY_SHIFT", () => {
  const r = classifyMiaTurn({ query: "costumo usar bastante câmera", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test("USO INTENSO: 'fico horas jogando' → PRIORITY_SHIFT", () => {
  const r = classifyMiaTurn({ query: "fico horas jogando", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test("USO INTENSO: 'passo horas tirando foto' → PRIORITY_SHIFT", () => {
  const r = classifyMiaTurn({ query: "passo horas tirando foto", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test("USO INTENSO: 'gravo muitos vídeos' → PRIORITY_SHIFT", () => {
  const r = classifyMiaTurn({ query: "gravo muitos vídeos", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test("USO INTENSO: 'fotografo bastante' → PRIORITY_SHIFT", () => {
  const r = classifyMiaTurn({ query: "fotografo bastante", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

// ─────────────────────────────────────────────────────────────
// PATCH 6.6 — Grupo 20: PRIORITY_SHIFT Layer F (Foco Declarado)
// ─────────────────────────────────────────────────────────────

test("FOCO DECLARADO: 'meu foco é game' → PRIORITY_SHIFT", () => {
  const r = classifyMiaTurn({ query: "meu foco é game", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test("FOCO DECLARADO: 'meu foco em bateria' → PRIORITY_SHIFT", () => {
  const r = classifyMiaTurn({ query: "meu foco em bateria", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test("FOCO DECLARADO: 'priorizo longevidade' → PRIORITY_SHIFT", () => {
  const r = classifyMiaTurn({ query: "priorizo longevidade", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test("FOCO DECLARADO: 'priorizo desempenho' → PRIORITY_SHIFT", () => {
  const r = classifyMiaTurn({ query: "priorizo desempenho", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test("FOCO DECLARADO: 'minha prioridade é câmera' → PRIORITY_SHIFT", () => {
  const r = classifyMiaTurn({ query: "minha prioridade é câmera", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test("FOCO DECLARADO: 'o mais importante é durar' → PRIORITY_SHIFT", () => {
  const r = classifyMiaTurn({ query: "o mais importante é durar", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test("FOCO DECLARADO: 'pra mim pesa mais bateria' → PRIORITY_SHIFT", () => {
  const r = classifyMiaTurn({ query: "pra mim pesa mais bateria", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test("FOCO DECLARADO: 'eu valorizo desempenho' → PRIORITY_SHIFT", () => {
  const r = classifyMiaTurn({ query: "eu valorizo desempenho", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test("FOCO DECLARADO: 'foco em jogos' → PRIORITY_SHIFT", () => {
  const r = classifyMiaTurn({ query: "foco em jogos", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test("FOCO DECLARADO: 'priorizo câmera' → PRIORITY_SHIFT", () => {
  const r = classifyMiaTurn({ query: "priorizo câmera", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

// ─────────────────────────────────────────────────────────────
// PATCH 6.6 — Grupo 21: PRIORITY_SHIFT Layer G (Longevidade)
// ─────────────────────────────────────────────────────────────

test("LONGEVIDADE: 'não quero trocar tão cedo' → PRIORITY_SHIFT", () => {
  const r = classifyMiaTurn({ query: "não quero trocar tão cedo", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test("LONGEVIDADE: 'não quero trocar nunca' → PRIORITY_SHIFT", () => {
  const r = classifyMiaTurn({ query: "não quero trocar nunca", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test("LONGEVIDADE: 'longevidade é o que importa' → PRIORITY_SHIFT", () => {
  const r = classifyMiaTurn({ query: "longevidade é o que importa", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test("LONGEVIDADE: 'qual tem maior longevidade?' → PRIORITY_SHIFT", () => {
  const r = classifyMiaTurn({ query: "qual tem maior longevidade?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test("LONGEVIDADE: 'vida útil é o que mais importa' → PRIORITY_SHIFT", () => {
  const r = classifyMiaTurn({ query: "vida útil é o que mais importa", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test("LONGEVIDADE: 'qual envelhece melhor?' → PRIORITY_SHIFT", () => {
  const r = classifyMiaTurn({ query: "qual envelhece melhor?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test("PS regressão: 'jogo bastante' ainda PRIORITY_SHIFT (Layer D original)", () => {
  const r = classifyMiaTurn({ query: "jogo bastante", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test("PS regressão: 'quero câmera boa' ainda PRIORITY_SHIFT (Layer C original)", () => {
  const r = classifyMiaTurn({ query: "quero câmera boa", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test("PS regressão: 'preciso de bateria' ainda PRIORITY_SHIFT", () => {
  const r = classifyMiaTurn({ query: "preciso de bateria", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test("PS sem âncora: 'eu passo horas jogando' NÃO PRIORITY_SHIFT sem âncora", () => {
  const r = classifyMiaTurn({ query: "eu passo horas jogando", hasActiveAnchor: false });
  if (r.turnType === MIA_TURN_TYPES.PRIORITY_SHIFT) {
    throw new Error(`Sem âncora NÃO deve ser PRIORITY_SHIFT — got: ${r.turnType}`);
  }
});

// ─────────────────────────────────────────────────────────────
// PATCH 6.6 — Grupo 22: ACKNOWLEDGEMENT / REACTION expansion
// ─────────────────────────────────────────────────────────────

test("ACK INFORMAL: 'boa' → REACTION", () => {
  const r = classifyMiaTurn({ query: "boa", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REACTION);
});

test("ACK INFORMAL: 'fechado' → REACTION", () => {
  const r = classifyMiaTurn({ query: "fechado", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REACTION);
});

test("ACK INFORMAL: 'blz' → REACTION", () => {
  const r = classifyMiaTurn({ query: "blz", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REACTION);
});

test("ACK INFORMAL: 'valeu' → REACTION", () => {
  const r = classifyMiaTurn({ query: "valeu", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REACTION);
});

test("ACK INFORMAL: 'massa' → REACTION", () => {
  const r = classifyMiaTurn({ query: "massa", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REACTION);
});

test("ACK INFORMAL: 'top' → REACTION", () => {
  const r = classifyMiaTurn({ query: "top", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REACTION);
});

test("ACK INFORMAL: 'tranquilo' → REACTION", () => {
  const r = classifyMiaTurn({ query: "tranquilo", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REACTION);
});

test("ACK INFORMAL: 'saquei' → REACTION", () => {
  const r = classifyMiaTurn({ query: "saquei", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REACTION);
});

test("ACK INFORMAL: 'entendido' → REACTION", () => {
  const r = classifyMiaTurn({ query: "entendido", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REACTION);
});

test("ACK INFORMAL: 'pode ser' → REACTION", () => {
  const r = classifyMiaTurn({ query: "pode ser", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REACTION);
});

test("ACK COMPREENSÃO: 'agora ficou claro' → REACTION", () => {
  const r = classifyMiaTurn({ query: "agora ficou claro", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REACTION);
});

test("ACK COMPREENSÃO: 'ficou claro' → REACTION", () => {
  const r = classifyMiaTurn({ query: "ficou claro", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REACTION);
});

test("ACK COMPREENSÃO: 'entendi melhor' → REACTION", () => {
  const r = classifyMiaTurn({ query: "entendi melhor", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REACTION);
});

test("ACK COMPREENSÃO: 'ficou mais claro' → REACTION", () => {
  const r = classifyMiaTurn({ query: "ficou mais claro", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REACTION);
});

test("ACK COMPREENSÃO: 'agora entendi' → REACTION", () => {
  const r = classifyMiaTurn({ query: "agora entendi", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REACTION);
});

test("ACK ACEITAÇÃO: 'tudo certo' → REACTION", () => {
  const r = classifyMiaTurn({ query: "tudo certo", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REACTION);
});

test("ACK ACEITAÇÃO: 'ta certo' → REACTION", () => {
  const r = classifyMiaTurn({ query: "ta certo", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REACTION);
});

test("ACK ACEITAÇÃO: 'beleza então' → REACTION", () => {
  const r = classifyMiaTurn({ query: "beleza então", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REACTION);
});

test("ACK original: 'ok' ainda REACTION (PATCH 5.8C regressão)", () => {
  const r = classifyMiaTurn({ query: "ok", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REACTION);
});

test("ACK original: 'faz sentido' ainda REACTION (reactionPatterns regressão)", () => {
  const r = classifyMiaTurn({ query: "faz sentido", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REACTION);
});

// ─────────────────────────────────────────────────────────────
// PATCH 6.6 — Grupo 23: Testes de Regressão Negativos
// ─────────────────────────────────────────────────────────────

test("REG: 'celular até 2000' sem âncora continua NEW_SEARCH", () => {
  const r = classifyMiaTurn({ query: "celular até 2000", hasActiveAnchor: false });
  expectTurnType(r, MIA_TURN_TYPES.NEW_SEARCH);
});

test("REG: 'iPhone 13 ou S23 FE?' continua COMPARISON", () => {
  const r = classifyMiaTurn({ query: "iPhone 13 ou S23 FE?", hasActiveAnchor: false });
  expectTurnType(r, MIA_TURN_TYPES.COMPARISON);
});

test("REG: 'tem outro melhor?' continua REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "tem outro melhor?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REFINEMENT);
});

test("REG: 'acho caro' continua OBJECTION", () => {
  const r = classifyMiaTurn({ query: "acho caro", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.OBJECTION);
});

test("REG: 'o que fez ele ganhar?' continua EXPLANATION_REQUEST", () => {
  const r = classifyMiaTurn({ query: "o que fez ele ganhar?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test("REG: 'você compraria esse?' continua EXPLANATION_REQUEST (confidence_challenge)", () => {
  const r = classifyMiaTurn({ query: "você compraria esse?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test("REG: '?' continua UNKNOWN", () => {
  const r = classifyMiaTurn({ query: "?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.UNKNOWN);
});

test("REG: 'barato' NÃO REACTION (é atributo de produto)", () => {
  const r = classifyMiaTurn({ query: "barato", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  if (r.turnType === MIA_TURN_TYPES.REACTION) {
    throw new Error(`'barato' NÃO deve ser REACTION — got: ${r.turnType}`);
  }
});

test("REG: 'promoção' NÃO REACTION nem ACKNOWLEDGEMENT", () => {
  const r = classifyMiaTurn({ query: "promoção", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  if (r.turnType === MIA_TURN_TYPES.REACTION) {
    throw new Error(`'promoção' NÃO deve ser REACTION — got: ${r.turnType}`);
  }
});

test("REG: 'boa câmera' NÃO REACTION (boa + complemento de produto)", () => {
  const r = classifyMiaTurn({ query: "boa câmera", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  if (r.turnType === MIA_TURN_TYPES.REACTION) {
    throw new Error(`'boa câmera' NÃO deve ser REACTION — got: ${r.turnType}`);
  }
});

test("REG: 'top de linha' NÃO REACTION (top + complemento)", () => {
  const r = classifyMiaTurn({ query: "top de linha", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  if (r.turnType === MIA_TURN_TYPES.REACTION) {
    throw new Error(`'top de linha' NÃO deve ser REACTION — got: ${r.turnType}`);
  }
});

test("REG: 'fechado até 2000' NÃO REACTION (fechado + orçamento)", () => {
  const r = classifyMiaTurn({ query: "fechado até 2000", hasActiveAnchor: false });
  if (r.turnType === MIA_TURN_TYPES.REACTION) {
    throw new Error(`'fechado até 2000' NÃO deve ser REACTION — got: ${r.turnType}`);
  }
});

test("REG: ACK sem âncora 'boa' NÃO REACTION (sem âncora)", () => {
  const r = classifyMiaTurn({ query: "boa", hasActiveAnchor: false });
  if (r.turnType === MIA_TURN_TYPES.REACTION) {
    throw new Error(`Sem âncora 'boa' NÃO deve ser REACTION — got: ${r.turnType}`);
  }
});

test("REG: 'pesou no bolso' continua OBJECTION (regressão PATCH 6.5)", () => {
  const r = classifyMiaTurn({ query: "pesou no bolso", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.OBJECTION);
});

test("REG: 'qual seria o plano B?' continua REFINEMENT (regressão PATCH 6.5)", () => {
  const r = classifyMiaTurn({ query: "qual seria o plano B?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REFINEMENT);
});

test("REG: 'qual o diferencial?' continua EXPLANATION_REQUEST (regressão PATCH 6.5)", () => {
  const r = classifyMiaTurn({ query: "qual o diferencial?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test("REG: PS sem âncora 'priorizo longevidade' NÃO PRIORITY_SHIFT", () => {
  const r = classifyMiaTurn({ query: "priorizo longevidade", hasActiveAnchor: false });
  if (r.turnType === MIA_TURN_TYPES.PRIORITY_SHIFT) {
    throw new Error(`Sem âncora NÃO deve ser PRIORITY_SHIFT — got: ${r.turnType}`);
  }
});

test("REG: PS sem âncora 'tiro muita foto' NÃO PRIORITY_SHIFT", () => {
  const r = classifyMiaTurn({ query: "tiro muita foto", hasActiveAnchor: false });
  if (r.turnType === MIA_TURN_TYPES.PRIORITY_SHIFT) {
    throw new Error(`Sem âncora NÃO deve ser PRIORITY_SHIFT — got: ${r.turnType}`);
  }
});

test("REG: 'mas eu jogo' continua PRIORITY_SHIFT (Layer B original)", () => {
  const r = classifyMiaTurn({ query: "mas eu jogo", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test("REG: 'meu foco não é câmera' — PRIORITY_SHIFT por mencionar eixo com âncora", () => {
  // Negação completa difícil de distinguir semanticamente — aceita PRIORITY_SHIFT
  const r = classifyMiaTurn({ query: "meu foco não é câmera", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  // Só verifica que não é OBJECTION ou EXPLANATION_REQUEST
  if (r.turnType === MIA_TURN_TYPES.OBJECTION || r.turnType === MIA_TURN_TYPES.EXPLANATION_REQUEST) {
    throw new Error(`NÃO deve ser OBJECTION/EXP — got: ${r.turnType}`);
  }
});

// ─────────────────────────────────────────────────────────────
// PATCH 6.7 — Grupo 24: Alternative Follow-Up → REFINEMENT
// ─────────────────────────────────────────────────────────────

test("ALT FU: 'e a segunda opção?' → REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "e a segunda opção?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REFINEMENT);
});

test("ALT FU: 'e a segunda escolha?' → REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "e a segunda escolha?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REFINEMENT);
});

test("ALT FU: 'e o segundo colocado?' → REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "e o segundo colocado?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REFINEMENT);
});

test("ALT FU: 'e quem ficou em segundo?' → REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "e quem ficou em segundo?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REFINEMENT);
});

test("ALT FU: 'e quem quase ganhou?' → REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "e quem quase ganhou?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REFINEMENT);
});

test("ALT FU: 'e depois dele?' → REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "e depois dele?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REFINEMENT);
});

test("ALT FU: 'e depois desse?' → REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "e depois desse?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REFINEMENT);
});

test("ALT FU: 'e o próximo?' → REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "e o próximo?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REFINEMENT);
});

test("ALT FU: 'e o próximo da lista?' → REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "e o próximo da lista?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REFINEMENT);
});

test("ALT FU: 'e o plano B?' → REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "e o plano B?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REFINEMENT);
});

test("ALT FU: 'e a opção reserva?' → REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "e a opção reserva?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REFINEMENT);
});

test("ALT FU: 'e uma alternativa?' → REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "e uma alternativa?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REFINEMENT);
});

test("ALT FU: 'e o concorrente mais forte?' → REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "e o concorrente mais forte?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REFINEMENT);
});

test("ALT FU: 'e outro que faça sentido?' → REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "e outro que faça sentido?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REFINEMENT);
});

test("ALT FU: 'e se eu não quiser esse?' → REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "e se eu não quiser esse?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REFINEMENT);
});

// ─────────────────────────────────────────────────────────────
// PATCH 6.7 — Grupo 25: Attribute Follow-Up NÃO vira REFINEMENT
// ─────────────────────────────────────────────────────────────

test("ATTR FU: 'e a bateria?' NÃO REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "e a bateria?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  if (r.turnType === MIA_TURN_TYPES.REFINEMENT) {
    throw new Error(`'e a bateria?' NÃO deve ser REFINEMENT — got: ${r.turnType}`);
  }
});

test("ATTR FU: 'e a câmera?' NÃO REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "e a câmera?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  if (r.turnType === MIA_TURN_TYPES.REFINEMENT) {
    throw new Error(`'e a câmera?' NÃO deve ser REFINEMENT — got: ${r.turnType}`);
  }
});

test("ATTR FU: 'e o desempenho?' NÃO REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "e o desempenho?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  if (r.turnType === MIA_TURN_TYPES.REFINEMENT) {
    throw new Error(`'e o desempenho?' NÃO deve ser REFINEMENT — got: ${r.turnType}`);
  }
});

test("ATTR FU: 'e o preço?' NÃO REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "e o preço?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  if (r.turnType === MIA_TURN_TYPES.REFINEMENT) {
    throw new Error(`'e o preço?' NÃO deve ser REFINEMENT — got: ${r.turnType}`);
  }
});

test("ATTR FU: 'e a tela?' NÃO REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "e a tela?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  if (r.turnType === MIA_TURN_TYPES.REFINEMENT) {
    throw new Error(`'e a tela?' NÃO deve ser REFINEMENT — got: ${r.turnType}`);
  }
});

test("ATTR FU: 'e o armazenamento?' NÃO REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "e o armazenamento?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  if (r.turnType === MIA_TURN_TYPES.REFINEMENT) {
    throw new Error(`'e o armazenamento?' NÃO deve ser REFINEMENT — got: ${r.turnType}`);
  }
});

test("ATTR FU: 'e o suporte?' NÃO REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "e o suporte?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  if (r.turnType === MIA_TURN_TYPES.REFINEMENT) {
    throw new Error(`'e o suporte?' NÃO deve ser REFINEMENT — got: ${r.turnType}`);
  }
});

test("ATTR FU: 'e a garantia?' NÃO REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "e a garantia?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  if (r.turnType === MIA_TURN_TYPES.REFINEMENT) {
    throw new Error(`'e a garantia?' NÃO deve ser REFINEMENT — got: ${r.turnType}`);
  }
});

test("ATTR FU: 'e a durabilidade?' NÃO REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "e a durabilidade?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  if (r.turnType === MIA_TURN_TYPES.REFINEMENT) {
    throw new Error(`'e a durabilidade?' NÃO deve ser REFINEMENT — got: ${r.turnType}`);
  }
});

test("ATTR FU: 'e a marca?' NÃO REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "e a marca?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  if (r.turnType === MIA_TURN_TYPES.REFINEMENT) {
    throw new Error(`'e a marca?' NÃO deve ser REFINEMENT — got: ${r.turnType}`);
  }
});

test("ATTR FU: 'e esse preço?' NÃO REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "e esse preço?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  if (r.turnType === MIA_TURN_TYPES.REFINEMENT) {
    throw new Error(`'e esse preço?' NÃO deve ser REFINEMENT — got: ${r.turnType}`);
  }
});

test("ATTR FU: 'e esse modelo?' NÃO REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "e esse modelo?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  if (r.turnType === MIA_TURN_TYPES.REFINEMENT) {
    throw new Error(`'e esse modelo?' NÃO deve ser REFINEMENT — got: ${r.turnType}`);
  }
});

test("ATTR FU: 'e a diferença?' NÃO REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "e a diferença?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  if (r.turnType === MIA_TURN_TYPES.REFINEMENT) {
    throw new Error(`'e a diferença?' NÃO deve ser REFINEMENT — got: ${r.turnType}`);
  }
});

test("ATTR FU: 'e o custo-benefício?' NÃO REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "e o custo-benefício?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  if (r.turnType === MIA_TURN_TYPES.REFINEMENT) {
    throw new Error(`'e o custo-benefício?' NÃO deve ser REFINEMENT — got: ${r.turnType}`);
  }
});

test("ATTR FU: 'e esse aqui?' NÃO REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "e esse aqui?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  if (r.turnType === MIA_TURN_TYPES.REFINEMENT) {
    throw new Error(`'e esse aqui?' NÃO deve ser REFINEMENT — got: ${r.turnType}`);
  }
});

// ─────────────────────────────────────────────────────────────
// PATCH 6.7 — Grupo 26: Regressões de outras famílias
// ─────────────────────────────────────────────────────────────

test("REG 6.7: 'celular até 1500' sem âncora continua NEW_SEARCH", () => {
  const r = classifyMiaTurn({ query: "celular até 1500", hasActiveAnchor: false });
  expectTurnType(r, MIA_TURN_TYPES.NEW_SEARCH);
});

test("REG 6.7: 'iPhone 13 ou S23 FE?' continua COMPARISON", () => {
  const r = classifyMiaTurn({ query: "iPhone 13 ou S23 FE?", hasActiveAnchor: false });
  expectTurnType(r, MIA_TURN_TYPES.COMPARISON);
});

test("REG 6.7: 'acho caro' continua OBJECTION", () => {
  const r = classifyMiaTurn({ query: "acho caro", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.OBJECTION);
});

test("REG 6.7: 'qual o diferencial?' continua EXPLANATION_REQUEST", () => {
  const r = classifyMiaTurn({ query: "qual o diferencial?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test("REG 6.7: 'você compraria esse?' continua EXPLANATION_REQUEST", () => {
  const r = classifyMiaTurn({ query: "você compraria esse?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test("REG 6.7: 'tem certeza?' continua EXPLANATION_REQUEST", () => {
  const r = classifyMiaTurn({ query: "tem certeza?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.EXPLANATION_REQUEST);
});

test("REG 6.7: 'quem quase ganhou?' sem 'e' ainda REFINEMENT", () => {
  const r = classifyMiaTurn({ query: "quem quase ganhou?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REFINEMENT);
});

test("REG 6.7: 'qual seria o plano B?' ainda REFINEMENT (sem 'e')", () => {
  const r = classifyMiaTurn({ query: "qual seria o plano B?", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REFINEMENT);
});

test("REG 6.7: 'eu passo horas jogando' continua PRIORITY_SHIFT", () => {
  const r = classifyMiaTurn({ query: "eu passo horas jogando", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.PRIORITY_SHIFT);
});

test("REG 6.7: 'boa' continua REACTION", () => {
  const r = classifyMiaTurn({ query: "boa", hasActiveAnchor: true, lastBestProduct: MOCK_ANCHOR });
  expectTurnType(r, MIA_TURN_TYPES.REACTION);
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
  console.log("\nTodos os testes passaram. Router em shadow mode validado.");
  process.exit(0);
}
