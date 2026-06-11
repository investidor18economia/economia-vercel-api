/**
 * PATCH 5.2A — Testes: applyCognitiveAuthorityToRoutingDecision
 *
 * Cenários mínimos conforme especificação.
 * Nenhum teste depende de LLM.
 * Usa apenas a lógica pura de lib/miaCognitiveAuthority.js.
 */

import { applyCognitiveAuthorityToRoutingDecision, COGNITIVE_AUTHORITY_SCOPE } from "../lib/miaCognitiveAuthority.js";

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

function makeCognitiveTurn(turnType, confidence = 0.9) {
  return { turnType, confidence, reasons: [], signals: {}, shadowOnly: true };
}

function makeRoutingDecision(overrides = {}) {
  return {
    mode: "search",
    conversationAct: "search",
    allowNewSearch: true,
    allowCommercialFallback: true,
    allowReplaceWinner: true,
    allowRerank: true,
    shouldPreserveAnchor: false,
    shouldReturnSessionContext: true,
    responsePathHint: "default_product_search",
    reasons: [],
    anchorProduct: null,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────
// CENÁRIO 1 — VALUE_QUESTION + âncora ativa → autoridade aplicada
// ─────────────────────────────────────────────────────────────

test("1. VALUE_QUESTION + âncora ativa", () => {
  const result = applyCognitiveAuthorityToRoutingDecision({
    cognitiveTurn: makeCognitiveTurn("VALUE_QUESTION"),
    routingDecision: makeRoutingDecision(),
    sessionContext: SESSION_WITH_ANCHOR,
    lastBestProduct: ANCHOR,
    originalQuery: "vale a pena?",
    resolvedQuery: "vale a pena comprar iphone 15 pro",
    earlyClearNewCommercialSearch: false,
  });

  assert("applied = true", result.applied === true);
  assert("routingDecision.shouldPreserveAnchor = true", result.routingDecision.shouldPreserveAnchor === true);
  assert("routingDecision.allowNewSearch = false", result.routingDecision.allowNewSearch === false);
  assert("routingDecision.allowRerank = false", result.routingDecision.allowRerank === false);
  assert("routingDecision.allowReplaceWinner = false", result.routingDecision.allowReplaceWinner === false);
  assert("routingDecision.allowCommercialFallback = false", result.routingDecision.allowCommercialFallback === false);
  assert("authorityScope correto", result.authorityScope === COGNITIVE_AUTHORITY_SCOPE.VALUE_EXPLANATION_ANCHOR_HOLD);
  assert("reason correto", result.reason === "value_question_with_active_anchor");
  assert("mode = cognitive_anchor_hold", result.routingDecision.mode === "cognitive_anchor_hold");
  assert("cognitiveAuthority.applied = true", result.cognitiveAuthority?.applied === true);
  assert("cognitiveAuthority.turnType correto", result.cognitiveAuthority?.turnType === "VALUE_QUESTION");
  assert("cognitiveAuthority.anchor presente", result.cognitiveAuthority?.anchor === ANCHOR.product_name);
});

// ─────────────────────────────────────────────────────────────
// CENÁRIO 2 — EXPLANATION_REQUEST + âncora ativa → autoridade aplicada
// ─────────────────────────────────────────────────────────────

test("2. EXPLANATION_REQUEST + âncora ativa", () => {
  const result = applyCognitiveAuthorityToRoutingDecision({
    cognitiveTurn: makeCognitiveTurn("EXPLANATION_REQUEST"),
    routingDecision: makeRoutingDecision(),
    sessionContext: SESSION_WITH_ANCHOR,
    lastBestProduct: ANCHOR,
    originalQuery: "por que você recomendou esse?",
    resolvedQuery: "por que recomendou iphone 15",
    earlyClearNewCommercialSearch: false,
  });

  assert("applied = true", result.applied === true);
  assert("routingDecision.shouldPreserveAnchor = true", result.routingDecision.shouldPreserveAnchor === true);
  assert("routingDecision.allowNewSearch = false", result.routingDecision.allowNewSearch === false);
  assert("routingDecision.allowRerank = false", result.routingDecision.allowRerank === false);
  assert("authorityScope correto", result.authorityScope === COGNITIVE_AUTHORITY_SCOPE.VALUE_EXPLANATION_ANCHOR_HOLD);
  assert("conversationAct correto", result.routingDecision.conversationAct === "explanation_request_anchor_hold");
  assert("cognitiveAuthority.applied = true", result.cognitiveAuthority?.applied === true);
  assert("reason correto", result.reason === "explanation_request_with_active_anchor");
});

// ─────────────────────────────────────────────────────────────
// CENÁRIO 3 — VALUE_QUESTION SEM âncora → NÃO aplica
// ─────────────────────────────────────────────────────────────

test("3. VALUE_QUESTION sem âncora → não aplica", () => {
  const original = makeRoutingDecision();
  const result = applyCognitiveAuthorityToRoutingDecision({
    cognitiveTurn: makeCognitiveTurn("VALUE_QUESTION"),
    routingDecision: original,
    sessionContext: SESSION_EMPTY,
    lastBestProduct: null,
    originalQuery: "vale a pena?",
    resolvedQuery: "vale a pena?",
    earlyClearNewCommercialSearch: false,
  });

  assert("applied = false", result.applied === false);
  assert("authorityScope = NOT_APPLIED", result.authorityScope === COGNITIVE_AUTHORITY_SCOPE.NOT_APPLIED);
  assert("allowNewSearch inalterado", result.routingDecision.allowNewSearch === original.allowNewSearch);
  assert("shouldPreserveAnchor inalterado", result.routingDecision.shouldPreserveAnchor === original.shouldPreserveAnchor);
});

// ─────────────────────────────────────────────────────────────
// CENÁRIO 4 — NEW_SEARCH com orçamento → NÃO aplica
// ─────────────────────────────────────────────────────────────

test("4. NEW_SEARCH com orçamento → não aplica", () => {
  const original = makeRoutingDecision();
  const result = applyCognitiveAuthorityToRoutingDecision({
    cognitiveTurn: makeCognitiveTurn("NEW_SEARCH"),
    routingDecision: original,
    sessionContext: SESSION_WITH_ANCHOR,
    lastBestProduct: ANCHOR,
    originalQuery: "quero um notebook até 3000 reais",
    resolvedQuery: "notebook até 3000 reais",
    earlyClearNewCommercialSearch: false,
  });

  assert("applied = false", result.applied === false);
  assert("authorityScope = NOT_APPLIED", result.authorityScope === COGNITIVE_AUTHORITY_SCOPE.NOT_APPLIED);
  assert("allowNewSearch inalterado", result.routingDecision.allowNewSearch === original.allowNewSearch);
});

// ─────────────────────────────────────────────────────────────
// CENÁRIO 5 — REFINEMENT com "mais barato" → NÃO aplica, não bloqueia refinamento
// ─────────────────────────────────────────────────────────────

test("5. REFINEMENT com 'mais barato' → não aplica, refinamento livre", () => {
  const original = makeRoutingDecision({ mode: "refinement", allowNewSearch: true, allowRerank: true });
  const result = applyCognitiveAuthorityToRoutingDecision({
    cognitiveTurn: makeCognitiveTurn("REFINEMENT"),
    routingDecision: original,
    sessionContext: SESSION_WITH_ANCHOR,
    lastBestProduct: ANCHOR,
    originalQuery: "tem algo mais barato?",
    resolvedQuery: "iphone mais barato",
    earlyClearNewCommercialSearch: false,
  });

  assert("applied = false", result.applied === false);
  assert("allowNewSearch inalterado (true)", result.routingDecision.allowNewSearch === true);
  assert("allowRerank inalterado (true)", result.routingDecision.allowRerank === true);
  assert("mode inalterado", result.routingDecision.mode === "refinement");
});

// ─────────────────────────────────────────────────────────────
// CENÁRIO 6 — COMPARISON → NÃO aplica
// ─────────────────────────────────────────────────────────────

test("6. COMPARISON → não aplica", () => {
  const original = makeRoutingDecision({ allowNewSearch: true });
  const result = applyCognitiveAuthorityToRoutingDecision({
    cognitiveTurn: makeCognitiveTurn("COMPARISON"),
    routingDecision: original,
    sessionContext: SESSION_WITH_ANCHOR,
    lastBestProduct: ANCHOR,
    originalQuery: "compara com o samsung s24",
    resolvedQuery: "iphone 15 vs samsung s24",
    earlyClearNewCommercialSearch: false,
  });

  assert("applied = false", result.applied === false);
  assert("authorityScope = NOT_APPLIED", result.authorityScope === COGNITIVE_AUTHORITY_SCOPE.NOT_APPLIED);
});

// ─────────────────────────────────────────────────────────────
// CENÁRIO 7 — Não muta o objeto original
// ─────────────────────────────────────────────────────────────

test("7. Não muta o routingDecision original", () => {
  const original = makeRoutingDecision({ allowNewSearch: true, shouldPreserveAnchor: false });
  const originalSnapshot = JSON.stringify(original);

  applyCognitiveAuthorityToRoutingDecision({
    cognitiveTurn: makeCognitiveTurn("VALUE_QUESTION"),
    routingDecision: original,
    sessionContext: SESSION_WITH_ANCHOR,
    lastBestProduct: ANCHOR,
    originalQuery: "vale a pena?",
    resolvedQuery: "vale a pena comprar",
    earlyClearNewCommercialSearch: false,
  });

  // O objeto original não deve ter sido mutado pela função
  assert(
    "objeto original não mutado",
    JSON.stringify(original) === originalSnapshot,
    `Original mudou: ${JSON.stringify(original)}`
  );
});

// ─────────────────────────────────────────────────────────────
// CENÁRIO 7b — earlyClearNewCommercialSearch ativo → NÃO aplica mesmo com VALUE_QUESTION
// ─────────────────────────────────────────────────────────────

test("7b. earlyClearNewCommercialSearch=true → não aplica (guarda de segurança)", () => {
  const original = makeRoutingDecision({ allowNewSearch: true });
  const result = applyCognitiveAuthorityToRoutingDecision({
    cognitiveTurn: makeCognitiveTurn("VALUE_QUESTION"),
    routingDecision: original,
    sessionContext: SESSION_WITH_ANCHOR,
    lastBestProduct: ANCHOR,
    originalQuery: "vale a pena comprar um novo agora?",
    resolvedQuery: "vale a pena comprar iphone novo",
    earlyClearNewCommercialSearch: true, // Sinal de nova busca explícita ativo
  });

  assert("applied = false", result.applied === false);
  assert("reason correta", result.reason === "early_clear_new_commercial_search_active");
  assert("allowNewSearch não bloqueado", result.routingDecision.allowNewSearch === true);
});

// ─────────────────────────────────────────────────────────────
// CENÁRIO 8 — EXPLANATION_REQUEST com routingDecision já seguro → não sobrescreve
// ─────────────────────────────────────────────────────────────

test("8. EXPLANATION_REQUEST com routingDecision já em anchor hold → não duplica", () => {
  const alreadySafe = makeRoutingDecision({
    allowNewSearch: false,
    shouldPreserveAnchor: true,
    allowRerank: false,
    mode: "anchored_reaction",
  });

  const result = applyCognitiveAuthorityToRoutingDecision({
    cognitiveTurn: makeCognitiveTurn("EXPLANATION_REQUEST"),
    routingDecision: alreadySafe,
    sessionContext: SESSION_WITH_ANCHOR,
    lastBestProduct: ANCHOR,
    originalQuery: "me explica melhor",
    resolvedQuery: "me explica o iphone 15",
    earlyClearNewCommercialSearch: false,
  });

  assert("applied = false (já estava seguro)", result.applied === false);
  assert("reason = routing_already_safe", result.reason === "routing_decision_already_in_safe_anchor_hold");
  assert("mode preservado", result.routingDecision.mode === "anchored_reaction");
});

// ─────────────────────────────────────────────────────────────
// CENÁRIO 9 — Confiança baixa → NÃO aplica
// ─────────────────────────────────────────────────────────────

test("9. VALUE_QUESTION com confidence baixa → não aplica", () => {
  const result = applyCognitiveAuthorityToRoutingDecision({
    cognitiveTurn: makeCognitiveTurn("VALUE_QUESTION", 0.4), // abaixo do limite 0.6
    routingDecision: makeRoutingDecision(),
    sessionContext: SESSION_WITH_ANCHOR,
    lastBestProduct: ANCHOR,
    originalQuery: "vale?",
    resolvedQuery: "vale a pena",
    earlyClearNewCommercialSearch: false,
  });

  assert("applied = false (confidence < 0.6)", result.applied === false);
  assert("authorityScope = NOT_APPLIED", result.authorityScope === COGNITIVE_AUTHORITY_SCOPE.NOT_APPLIED);
});

// ─────────────────────────────────────────────────────────────
// CENÁRIO 10 — Nulo/undefined em inputs → robustez
// ─────────────────────────────────────────────────────────────

test("10. Null/undefined em inputs → robusto, não lança exceção", () => {
  let result;

  // cognitiveTurn null
  result = applyCognitiveAuthorityToRoutingDecision({
    cognitiveTurn: null,
    routingDecision: makeRoutingDecision(),
    sessionContext: SESSION_WITH_ANCHOR,
  });
  assert("cognitiveTurn null → applied = false", result.applied === false);

  // routingDecision null
  result = applyCognitiveAuthorityToRoutingDecision({
    cognitiveTurn: makeCognitiveTurn("VALUE_QUESTION"),
    routingDecision: null,
    sessionContext: SESSION_WITH_ANCHOR,
    lastBestProduct: ANCHOR,
  });
  assert("routingDecision null → applied = false", result.applied === false);

  // tudo vazio
  result = applyCognitiveAuthorityToRoutingDecision({});
  assert("input vazio → applied = false", result.applied === false);
});

// ─────────────────────────────────────────────────────────────
// CENÁRIO 11 — Âncora via sessionContext (sem lastBestProduct direto)
// ─────────────────────────────────────────────────────────────

test("11. Âncora apenas via sessionContext.lastBestProduct → aplica", () => {
  const result = applyCognitiveAuthorityToRoutingDecision({
    cognitiveTurn: makeCognitiveTurn("VALUE_QUESTION"),
    routingDecision: makeRoutingDecision(),
    sessionContext: SESSION_WITH_ANCHOR, // âncora aqui
    lastBestProduct: null,              // não explicitado
    originalQuery: "vale a pena?",
    resolvedQuery: "vale a pena?",
    earlyClearNewCommercialSearch: false,
  });

  assert("applied = true (âncora via sessionContext)", result.applied === true);
  assert("anchor resolvido", result.cognitiveAuthority?.anchor === ANCHOR.product_name);
});

// ─────────────────────────────────────────────────────────────
// CENÁRIO 12 — Reasons preservadas e enriquecidas
// ─────────────────────────────────────────────────────────────

test("12. reasons originais preservadas + nova reason adicionada", () => {
  const rdComReasons = makeRoutingDecision({ reasons: ["reason_original_1", "reason_original_2"] });
  const result = applyCognitiveAuthorityToRoutingDecision({
    cognitiveTurn: makeCognitiveTurn("VALUE_QUESTION"),
    routingDecision: rdComReasons,
    sessionContext: SESSION_WITH_ANCHOR,
    lastBestProduct: ANCHOR,
    originalQuery: "qual o motivo?",
    resolvedQuery: "qual o motivo da recomendacao",
    earlyClearNewCommercialSearch: false,
  });

  assert("applied = true", result.applied === true);
  assert("reason original 1 preservada", result.routingDecision.reasons.includes("reason_original_1"));
  assert("reason original 2 preservada", result.routingDecision.reasons.includes("reason_original_2"));
  assert(
    "nova reason adicionada",
    result.routingDecision.reasons.includes("cognitive_authority_value_question_anchor_hold")
  );
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
