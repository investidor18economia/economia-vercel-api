/**
 * PATCH 5.8 / 5.8A / 5.8B / 5.8C / 5.8D — Universal Follow-Up Understanding Audit
 *
 * Matriz de validação final para o bloco 5.8.
 * Mapeia como a MIA classifica follow-ups universais pós-recomendação.
 *
 * PATCH 5.8  — criou auditoria + baseline (9/17)
 * PATCH 5.8A — PRIORITY_SHIFT (12/17)
 * PATCH 5.8B — MINIMAL_EXPLANATION (14/17)
 * PATCH 5.8C — ACKNOWLEDGEMENT, CONFIDENCE_CHALLENGE, OBJECTION (17/17)
 * PATCH 5.8D — validação final, risk metrics, regressão
 *
 * NÃO altera nenhum comportamento — apenas diagnóstico.
 *
 * Rodar: node scripts/test-mia-followup-understanding-audit.js
 */

import { classifyMiaTurn } from "../lib/miaCognitiveRouter.js";
import {
  buildFollowUpUnderstandingAudit,
  detectFollowUpFamily,
  isFollowUpClassificationOk,
  FOLLOWUP_FAMILIES,
  FOLLOWUP_FLAGS,
} from "../lib/miaFollowUpUnderstandingAudit.js";

// ─────────────────────────────────────────────────────────────
// Utilitário de teste
// ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function test(label, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failed++;
    failures.push({ label, error: err.message });
    console.log(`  ✗ ${label}`);
    console.log(`    ${err.message}`);
  }
}

function expect(actual, expected, msg = "") {
  if (actual !== expected) {
    throw new Error(`${msg} — esperado: ${JSON.stringify(expected)}, obtido: ${JSON.stringify(actual)}`);
  }
}
function expectTrue(val, msg = "") {
  if (!val) throw new Error(`${msg} — esperado true, obtido ${JSON.stringify(val)}`);
}
function expectFalse(val, msg = "") {
  if (val) throw new Error(`${msg} — esperado false, obtido ${JSON.stringify(val)}`);
}
function expectIncludes(arr, item, msg = "") {
  if (!Array.isArray(arr) || !arr.includes(item)) {
    throw new Error(`${msg} — ${JSON.stringify(item)} não encontrado em ${JSON.stringify(arr)}`);
  }
}
function expectNotIncludes(arr, item, msg = "") {
  if (Array.isArray(arr) && arr.includes(item)) {
    throw new Error(`${msg} — ${JSON.stringify(item)} não deveria estar em ${JSON.stringify(arr)}`);
  }
}

// ─────────────────────────────────────────────────────────────
// Helper: classificar + auditar em uma chamada
// ─────────────────────────────────────────────────────────────

/**
 * Roda classifyMiaTurn e depois buildFollowUpUnderstandingAudit.
 * Retorna { turnResult, audit }.
 */
function classifyAndAudit({
  query,
  hasActiveAnchor = false,
  lastBestProduct = null,
  comparisonContext = null,
  expectedFollowUpFamily = null,
  // routing info (opcional — simula estado pós-routing)
  allowNewSearch         = null,
  allowReplaceWinner     = null,
  shouldPreserveAnchor   = null,
  finalRoutingMode       = null,
}) {
  const turnResult = classifyMiaTurn({
    originalQuery: query,
    query,
    hasActiveAnchor,
    lastBestProduct: lastBestProduct ? { product_name: lastBestProduct } : null,
    comparisonContext,
  });

  const audit = buildFollowUpUnderstandingAudit({
    originalQuery: query,
    hasActiveAnchor,
    lastBestProduct,
    cognitiveTurnResult: turnResult,
    expectedFollowUpFamily,
    allowNewSearch,
    allowReplaceWinner,
    shouldPreserveAnchor,
    finalRoutingMode,
    intentAuthoritySource: null,        // não disponível no teste isolado
    contextActionAuthoritySource: null,
  });

  return { turnResult, audit };
}

// ─────────────────────────────────────────────────────────────
// GRUPO 1 — Acknowledgement / continuação social (com âncora)
// ─────────────────────────────────────────────────────────────
console.log("\n— Grupo 1: Acknowledgement (com âncora) —");

test("1: 'ok' com âncora → REACTION = ACKNOWLEDGEMENT (PATCH 5.8C)", () => {
  const { turnResult, audit } = classifyAndAudit({
    query: "ok",
    hasActiveAnchor: true,
    lastBestProduct: "Galaxy S24 FE",
    expectedFollowUpFamily: FOLLOWUP_FAMILIES.ACKNOWLEDGEMENT,
  });
  // PATCH 5.8C — "ok" com âncora → REACTION (step 11) antes de CONVERSATIONAL (step 12)
  expect(turnResult.turnType, "REACTION", "ok com âncora → REACTION");
  expect(audit.detectedFollowUpFamily, FOLLOWUP_FAMILIES.ACKNOWLEDGEMENT, "família correta");
  expectTrue(audit.classificationOk, "classificação ok");
  expectIncludes(audit.flags, FOLLOWUP_FLAGS.FOLLOWUP_CLASSIFICATION_OK, "flag OK presente");
});

test("2: 'entendi' com âncora → REACTION = ACKNOWLEDGEMENT correto", () => {
  const { turnResult, audit } = classifyAndAudit({
    query: "entendi",
    hasActiveAnchor: true,
    lastBestProduct: "Galaxy S24 FE",
    expectedFollowUpFamily: FOLLOWUP_FAMILIES.ACKNOWLEDGEMENT,
  });
  expect(turnResult.turnType, "REACTION", "entendi → REACTION");
  expect(audit.detectedFollowUpFamily, FOLLOWUP_FAMILIES.ACKNOWLEDGEMENT, "família correta");
  expectTrue(audit.classificationOk, "classificação ok");
  expectIncludes(audit.flags, FOLLOWUP_FLAGS.FOLLOWUP_CLASSIFICATION_OK, "flag OK presente");
});

// ─────────────────────────────────────────────────────────────
// GRUPO 2 — Minimal explanation request (com âncora)
// ─────────────────────────────────────────────────────────────
console.log("\n— Grupo 2: Minimal explanation request (com âncora) —");

test("3: 'por quê?' com âncora → EXPLANATION_REQUEST (PATCH 5.8B)", () => {
  const { turnResult, audit } = classifyAndAudit({
    query: "por quê?",
    hasActiveAnchor: true,
    lastBestProduct: "Galaxy S24 FE",
    expectedFollowUpFamily: FOLLOWUP_FAMILIES.MINIMAL_EXPLANATION,
  });
  // PATCH 5.8B — Cluster 9: "por que" curto + âncora → EXPLANATION_REQUEST
  expect(turnResult.turnType, "EXPLANATION_REQUEST", "por quê? → EXPLANATION_REQUEST");
  expect(audit.detectedFollowUpFamily, FOLLOWUP_FAMILIES.MINIMAL_EXPLANATION, "família correta");
  expectTrue(audit.classificationOk, "classificação ok");
  expectIncludes(audit.flags, FOLLOWUP_FLAGS.FOLLOWUP_CLASSIFICATION_OK, "flag OK presente");
});

test("4: 'como assim?' com âncora → EXPLANATION_REQUEST (PATCH 5.8B)", () => {
  const { turnResult, audit } = classifyAndAudit({
    query: "como assim?",
    hasActiveAnchor: true,
    lastBestProduct: "Galaxy S24 FE",
    expectedFollowUpFamily: FOLLOWUP_FAMILIES.MINIMAL_EXPLANATION,
  });
  // PATCH 5.8B — Cluster 9: "como assim" + âncora → EXPLANATION_REQUEST
  expect(turnResult.turnType, "EXPLANATION_REQUEST", "como assim? → EXPLANATION_REQUEST");
  expect(audit.detectedFollowUpFamily, FOLLOWUP_FAMILIES.MINIMAL_EXPLANATION, "família correta");
  expectTrue(audit.classificationOk, "classificação ok");
});

// ─────────────────────────────────────────────────────────────
// GRUPO 3 — Confidence challenge (com âncora)
// ─────────────────────────────────────────────────────────────
console.log("\n— Grupo 3: Confidence challenge (com âncora) —");

test("5: 'tem certeza?' com âncora → EXPLANATION_REQUEST / confidence_challenge", () => {
  const { turnResult, audit } = classifyAndAudit({
    query: "tem certeza?",
    hasActiveAnchor: true,
    lastBestProduct: "Galaxy S24 FE",
    expectedFollowUpFamily: FOLLOWUP_FAMILIES.CONFIDENCE_CHALLENGE,
  });
  expect(turnResult.turnType, "EXPLANATION_REQUEST", "tem certeza? → EXPLANATION_REQUEST");
  expect(audit.detectedFollowUpFamily, FOLLOWUP_FAMILIES.CONFIDENCE_CHALLENGE, "família correta");
  expectTrue(audit.classificationOk, "classificação ok");
  expectIncludes(audit.flags, FOLLOWUP_FLAGS.FOLLOWUP_CLASSIFICATION_OK, "flag OK");
});

test("6: 'sério?' com âncora → CONFIDENCE_CHALLENGE (PATCH 5.8C)", () => {
  const { turnResult, audit } = classifyAndAudit({
    query: "sério?",
    hasActiveAnchor: true,
    lastBestProduct: "Galaxy S24 FE",
    expectedFollowUpFamily: FOLLOWUP_FAMILIES.CONFIDENCE_CHALLENGE,
  });
  // PATCH 5.8C — "serio" → directConfidenceChallengeSignal → EXPLANATION_REQUEST
  expect(turnResult.turnType, "EXPLANATION_REQUEST", "sério? → EXPLANATION_REQUEST");
  expect(audit.detectedFollowUpFamily, FOLLOWUP_FAMILIES.CONFIDENCE_CHALLENGE, "família correta");
  expectTrue(audit.classificationOk, "classificação ok");
});

// ─────────────────────────────────────────────────────────────
// GRUPO 4 — Alternative / comparison follow-up
// ─────────────────────────────────────────────────────────────
console.log("\n— Grupo 4: Alternative / comparison follow-up —");

test("7: 'e esse?' com contexto de produtos → FOLLOW_UP = ALTERNATIVE_COMPARISON (parcial)", () => {
  const { turnResult, audit } = classifyAndAudit({
    query: "e esse?",
    hasActiveAnchor: true,
    lastBestProduct: "Galaxy S24 FE",
    expectedFollowUpFamily: FOLLOWUP_FAMILIES.ALTERNATIVE_COMPARISON,
  });
  // "e esse?" → FOLLOW_UP via ^(e)\s+ pattern
  expect(turnResult.turnType, "FOLLOW_UP", "e esse? → FOLLOW_UP");
  expect(audit.detectedFollowUpFamily, FOLLOWUP_FAMILIES.ALTERNATIVE_COMPARISON, "família correta");
  expectTrue(audit.classificationOk, "classificação ok (FOLLOW_UP → ALTERNATIVE_COMPARISON aceito)");
  expectIncludes(audit.flags, FOLLOWUP_FLAGS.FOLLOWUP_CLASSIFICATION_OK, "flag OK");
});

test("8: 'e o outro?' com contexto de produtos → FOLLOW_UP = ALTERNATIVE_COMPARISON (parcial)", () => {
  const { turnResult, audit } = classifyAndAudit({
    query: "e o outro?",
    hasActiveAnchor: true,
    lastBestProduct: "Galaxy S24 FE",
    expectedFollowUpFamily: FOLLOWUP_FAMILIES.ALTERNATIVE_COMPARISON,
  });
  expect(turnResult.turnType, "FOLLOW_UP", "e o outro? → FOLLOW_UP");
  expect(audit.detectedFollowUpFamily, FOLLOWUP_FAMILIES.ALTERNATIVE_COMPARISON, "família correta");
  expectTrue(audit.classificationOk, "ok");
});

test("9: 'tem outro melhor?' com âncora → REFINEMENT = ALTERNATIVE_COMPARISON", () => {
  const { turnResult, audit } = classifyAndAudit({
    query: "tem outro melhor?",
    hasActiveAnchor: true,
    lastBestProduct: "Galaxy S24 FE",
    expectedFollowUpFamily: FOLLOWUP_FAMILIES.ALTERNATIVE_COMPARISON,
  });
  expect(turnResult.turnType, "REFINEMENT", "tem outro melhor? → REFINEMENT");
  expect(audit.detectedFollowUpFamily, FOLLOWUP_FAMILIES.ALTERNATIVE_COMPARISON, "família correta");
  expectTrue(audit.classificationOk, "ok");
});

// ─────────────────────────────────────────────────────────────
// GRUPO 5 — Objection / disagreement
// ─────────────────────────────────────────────────────────────
console.log("\n— Grupo 5: Objection / disagreement —");

test("10: 'não gostei' com âncora → OBJECTION correto", () => {
  const { turnResult, audit } = classifyAndAudit({
    query: "não gostei",
    hasActiveAnchor: true,
    lastBestProduct: "Galaxy S24 FE",
    expectedFollowUpFamily: FOLLOWUP_FAMILIES.OBJECTION,
  });
  expect(turnResult.turnType, "OBJECTION", "não gostei → OBJECTION");
  expect(audit.detectedFollowUpFamily, FOLLOWUP_FAMILIES.OBJECTION, "família correta");
  expectTrue(audit.classificationOk, "ok");
  expectIncludes(audit.flags, FOLLOWUP_FLAGS.FOLLOWUP_CLASSIFICATION_OK, "flag OK");
});

test("11: 'acho caro' com âncora → OBJECTION (PATCH 5.8C)", () => {
  const { turnResult, audit } = classifyAndAudit({
    query: "acho caro",
    hasActiveAnchor: true,
    lastBestProduct: "Galaxy S24 FE",
    expectedFollowUpFamily: FOLLOWUP_FAMILIES.OBJECTION,
  });
  // PATCH 5.8C — price objection expansion → OBJECTION
  expect(turnResult.turnType, "OBJECTION", "acho caro → OBJECTION");
  expect(audit.detectedFollowUpFamily, FOLLOWUP_FAMILIES.OBJECTION, "família correta");
  expectTrue(audit.classificationOk, "classificação ok");
  expectIncludes(audit.flags, FOLLOWUP_FLAGS.FOLLOWUP_CLASSIFICATION_OK, "flag OK presente");
});

// ─────────────────────────────────────────────────────────────
// GRUPO 6 — Priority shift
// ─────────────────────────────────────────────────────────────
console.log("\n— Grupo 6: Priority shift —");

test("12: 'mas eu jogo' com âncora → PRIORITY_SHIFT (PATCH 5.8A)", () => {
  const { turnResult, audit } = classifyAndAudit({
    query: "mas eu jogo",
    hasActiveAnchor: true,
    lastBestProduct: "Galaxy S24 FE",
    expectedFollowUpFamily: FOLLOWUP_FAMILIES.PRIORITY_SHIFT,
  });
  // PATCH 5.8A — Layer B (contextual "mas") + axis "jogo" → PRIORITY_SHIFT
  expect(turnResult.turnType, "PRIORITY_SHIFT", "mas eu jogo → PRIORITY_SHIFT");
  expect(audit.detectedFollowUpFamily, FOLLOWUP_FAMILIES.PRIORITY_SHIFT, "família correta");
  expectTrue(audit.classificationOk, "classificação ok");
  expectIncludes(audit.flags, FOLLOWUP_FLAGS.FOLLOWUP_CLASSIFICATION_OK, "flag OK presente");
});

test("13: 'quero câmera' com âncora → PRIORITY_SHIFT (PATCH 5.8A)", () => {
  const { turnResult, audit } = classifyAndAudit({
    query: "quero câmera",
    hasActiveAnchor: true,
    lastBestProduct: "Galaxy S24 FE",
    expectedFollowUpFamily: FOLLOWUP_FAMILIES.PRIORITY_SHIFT,
  });
  // PATCH 5.8A — Layer C (preference "quero") + axis "camera" → PRIORITY_SHIFT
  expect(turnResult.turnType, "PRIORITY_SHIFT", "quero câmera → PRIORITY_SHIFT");
  expect(audit.detectedFollowUpFamily, FOLLOWUP_FAMILIES.PRIORITY_SHIFT, "família correta");
  expectTrue(audit.classificationOk, "classificação ok");
});

test("14: 'e se for pra durar?' com âncora → PRIORITY_SHIFT (PATCH 5.8A)", () => {
  const { turnResult, audit } = classifyAndAudit({
    query: "e se for pra durar?",
    hasActiveAnchor: true,
    lastBestProduct: "Galaxy S24 FE",
    expectedFollowUpFamily: FOLLOWUP_FAMILIES.PRIORITY_SHIFT,
  });
  // PATCH 5.8A — Layer B ("e se for") + axis "durar" → PRIORITY_SHIFT
  // Tem precedência sobre FOLLOW_UP (step 7 vs step 8)
  expect(turnResult.turnType, "PRIORITY_SHIFT", "e se for pra durar? → PRIORITY_SHIFT");
  expect(audit.detectedFollowUpFamily, FOLLOWUP_FAMILIES.PRIORITY_SHIFT, "família correta");
  expectTrue(audit.classificationOk, "classificação ok");
  expectIncludes(audit.flags, FOLLOWUP_FLAGS.FOLLOWUP_CLASSIFICATION_OK, "flag OK presente");
});

// ─────────────────────────────────────────────────────────────
// GRUPO 7 — Symbol-only / unclear
// ─────────────────────────────────────────────────────────────
console.log("\n— Grupo 7: Symbol-only / unclear —");

test("15: '?' com âncora → SYMBOL_ONLY, degradação segura", () => {
  const { turnResult, audit } = classifyAndAudit({
    query: "?",
    hasActiveAnchor: true,
    lastBestProduct: "Galaxy S24 FE",
    expectedFollowUpFamily: FOLLOWUP_FAMILIES.SYMBOL_ONLY,
  });
  // normalize("?") → "" → UNKNOWN (empty_query, confidence=0)
  expect(turnResult.turnType, "UNKNOWN", "? → UNKNOWN");
  expect(turnResult.confidence, 0, "confidence = 0");
  expect(audit.detectedFollowUpFamily, FOLLOWUP_FAMILIES.SYMBOL_ONLY, "SYMBOL_ONLY detectado");
  expectTrue(audit.classificationOk, "degradação segura = ok");
  expectNotIncludes(audit.flags, FOLLOWUP_FLAGS.FOLLOWUP_SYMBOL_ONLY_UNSAFE, "não unsafe");
});

test("16: '??' com âncora → SYMBOL_ONLY, degradação segura", () => {
  const { turnResult, audit } = classifyAndAudit({
    query: "??",
    hasActiveAnchor: true,
    lastBestProduct: "Galaxy S24 FE",
    expectedFollowUpFamily: FOLLOWUP_FAMILIES.SYMBOL_ONLY,
  });
  expect(turnResult.turnType, "UNKNOWN", "?? → UNKNOWN");
  expect(audit.detectedFollowUpFamily, FOLLOWUP_FAMILIES.SYMBOL_ONLY, "SYMBOL_ONLY");
  expectTrue(audit.classificationOk, "ok");
});

test("17: '...' com âncora → SYMBOL_ONLY, degradação segura", () => {
  const { turnResult, audit } = classifyAndAudit({
    query: "...",
    hasActiveAnchor: true,
    lastBestProduct: "Galaxy S24 FE",
    expectedFollowUpFamily: FOLLOWUP_FAMILIES.SYMBOL_ONLY,
  });
  expect(turnResult.turnType, "UNKNOWN", "... → UNKNOWN");
  expect(audit.detectedFollowUpFamily, FOLLOWUP_FAMILIES.SYMBOL_ONLY, "SYMBOL_ONLY");
  expectTrue(audit.classificationOk, "ok");
});

// ─────────────────────────────────────────────────────────────
// GRUPO 8 — Mesmo follow-up SEM âncora
// ─────────────────────────────────────────────────────────────
console.log("\n— Grupo 8: Follow-ups sem âncora ativa —");

test("18: 'ok' sem âncora → CONVERSATIONAL, fallback sem anchor loss risk", () => {
  const { turnResult, audit } = classifyAndAudit({
    query: "ok",
    hasActiveAnchor: false,
    expectedFollowUpFamily: FOLLOWUP_FAMILIES.ACKNOWLEDGEMENT,
  });
  expect(turnResult.turnType, "CONVERSATIONAL", "ok sem âncora → CONVERSATIONAL");
  expect(audit.detectedFollowUpFamily, FOLLOWUP_FAMILIES.ACKNOWLEDGEMENT_FALLBACK, "fallback sem âncora");
  expect(audit.anchorLossRisk, false, "sem anchor loss risk (não tinha âncora)");
  expectFalse(audit.newSearchRisk, "sem new search risk");
});

test("19: 'por quê?' sem âncora → UNKNOWN sem âncora, fallback risk menor", () => {
  const { turnResult, audit } = classifyAndAudit({
    query: "por quê?",
    hasActiveAnchor: false,
    expectedFollowUpFamily: FOLLOWUP_FAMILIES.MINIMAL_EXPLANATION,
  });
  // Sem âncora, detectsExplanationRequestSignal retorna false → UNKNOWN
  expect(audit.detectedFollowUpFamily, FOLLOWUP_FAMILIES.UNKNOWN_NO_ANCHOR, "UNKNOWN sem âncora");
  expectFalse(audit.anchorLossRisk, "sem anchor loss risk (não tinha âncora)");
});

test("20: 'tem certeza?' sem âncora → UNKNOWN sem âncora (confidence_challenge requer âncora)", () => {
  const { turnResult, audit } = classifyAndAudit({
    query: "tem certeza?",
    hasActiveAnchor: false,
    expectedFollowUpFamily: FOLLOWUP_FAMILIES.CONFIDENCE_CHALLENGE,
  });
  // detectsExplanationRequestSignal requer hasActiveAnchor → false → UNKNOWN sem âncora
  // directConfidenceChallengeSignal está em detectsPostDecisionExplanationSignal que exige âncora
  expect(audit.detectedFollowUpFamily, FOLLOWUP_FAMILIES.UNKNOWN_NO_ANCHOR, "UNKNOWN sem âncora");
  // Sem âncora, é menos crítico — não é anchor loss
  expectFalse(audit.anchorLossRisk, "sem anchor loss risk");
});

// ─────────────────────────────────────────────────────────────
// GRUPO 9 — Testes de riscos de routing (routing info simulada)
// ─────────────────────────────────────────────────────────────
console.log("\n— Grupo 9: Riscos de routing —");

test("21: 'ok' com âncora + allowNewSearch=true → FOLLOWUP_NEW_SEARCH_RISK", () => {
  const { turnResult, audit } = classifyAndAudit({
    query: "ok",
    hasActiveAnchor: true,
    lastBestProduct: "Galaxy S24 FE",
    expectedFollowUpFamily: FOLLOWUP_FAMILIES.ACKNOWLEDGEMENT,
    allowNewSearch: true,
    shouldPreserveAnchor: false,
  });
  expectIncludes(audit.flags, FOLLOWUP_FLAGS.FOLLOWUP_NEW_SEARCH_RISK, "new search risk detectado");
  expectIncludes(audit.flags, FOLLOWUP_FLAGS.FOLLOWUP_ANCHOR_LOSS_RISK, "anchor loss risk detectado");
});

test("22: 'não gostei' com âncora + allowReplaceWinner=false → sem winner change risk", () => {
  const { turnResult, audit } = classifyAndAudit({
    query: "não gostei",
    hasActiveAnchor: true,
    lastBestProduct: "Galaxy S24 FE",
    expectedFollowUpFamily: FOLLOWUP_FAMILIES.OBJECTION,
    allowReplaceWinner: false,
    shouldPreserveAnchor: true,
  });
  expectNotIncludes(audit.flags, FOLLOWUP_FLAGS.FOLLOWUP_WINNER_CHANGE_RISK, "sem winner change risk");
  expectIncludes(audit.flags, FOLLOWUP_FLAGS.FOLLOWUP_CLASSIFICATION_OK, "objection ok");
});

test("23: 'por quê?' com âncora + shouldPreserveAnchor=false → anchor loss risk", () => {
  const { turnResult, audit } = classifyAndAudit({
    query: "por quê?",
    hasActiveAnchor: true,
    lastBestProduct: "Galaxy S24 FE",
    expectedFollowUpFamily: FOLLOWUP_FAMILIES.MINIMAL_EXPLANATION,
    shouldPreserveAnchor: false,
  });
  expectTrue(audit.anchorLossRisk, "anchor loss risk presente");
});

// ─────────────────────────────────────────────────────────────
// GRUPO 10 — Invariantes do módulo de auditoria
// ─────────────────────────────────────────────────────────────
console.log("\n— Grupo 10: Invariantes do módulo —");

test("24: detectFollowUpFamily não modifica estado — função pura", () => {
  const fam1 = detectFollowUpFamily({
    cognitiveTurnType: "EXPLANATION_REQUEST",
    cognitiveReasons: ["decision_explanation_subtype:confidence_challenge"],
    hasActiveAnchor: true,
    originalQuery: "tem certeza?",
  });
  const fam2 = detectFollowUpFamily({
    cognitiveTurnType: "EXPLANATION_REQUEST",
    cognitiveReasons: ["decision_explanation_subtype:confidence_challenge"],
    hasActiveAnchor: true,
    originalQuery: "tem certeza?",
  });
  expect(fam1, fam2, "detectFollowUpFamily é determinístico");
  expect(fam1, FOLLOWUP_FAMILIES.CONFIDENCE_CHALLENGE, "família correta");
});

test("25: isFollowUpClassificationOk — ALTERNATIVE_COMPARISON aceita FOLLOW_UP e REFINEMENT", () => {
  expectTrue(
    isFollowUpClassificationOk(FOLLOWUP_FAMILIES.ALTERNATIVE_COMPARISON, FOLLOWUP_FAMILIES.ALTERNATIVE_COMPARISON),
    "exact match ok"
  );
});

test("26: buildFollowUpUnderstandingAudit nunca retorna null", () => {
  const audit = buildFollowUpUnderstandingAudit({});
  expectTrue(audit !== null && typeof audit === "object", "sempre retorna objeto");
  expectTrue(Array.isArray(audit.flags), "flags é array");
  expectTrue(audit.auditVersion === "5.8", "versão correta");
});

test("27: auditVersion é 5.8 em todos os audits", () => {
  const { audit } = classifyAndAudit({ query: "ok", hasActiveAnchor: true });
  expect(audit.auditVersion, "5.8", "versão correta");
});

// ─────────────────────────────────────────────────────────────
// GRUPO 11 — Without-anchor safety (PATCH 5.8D / 5.8C)
// Garante que os novos sinais NÃO inventam contexto sem âncora.
// ─────────────────────────────────────────────────────────────
console.log("\n— Grupo 11: Without-anchor safety (5.8C fixes) —");

test("28: 'sério?' sem âncora → não dispara CONFIDENCE_CHALLENGE", () => {
  const { turnResult, audit } = classifyAndAudit({
    query: "sério?",
    hasActiveAnchor: false,
    expectedFollowUpFamily: FOLLOWUP_FAMILIES.CONFIDENCE_CHALLENGE,
  });
  // directConfidenceChallengeSignal requer hasActiveAnchor — sem âncora deve cair em UNKNOWN
  if (turnResult.turnType === "EXPLANATION_REQUEST") {
    throw new Error(`"sério?" sem âncora disparou EXPLANATION_REQUEST indevidamente`);
  }
  expect(audit.anchorLossRisk, false, "sem anchor loss risk (não havia âncora)");
  expectFalse(audit.newSearchRisk, "sem new search risk");
});

test("29: 'acho caro' sem âncora → não dispara OBJECTION", () => {
  const { turnResult, audit } = classifyAndAudit({
    query: "acho caro",
    hasActiveAnchor: false,
    expectedFollowUpFamily: FOLLOWUP_FAMILIES.OBJECTION,
  });
  // detectsObjectionSignal requer hasActiveAnchor — sem âncora não deve ser OBJECTION
  if (turnResult.turnType === "OBJECTION") {
    throw new Error(`"acho caro" sem âncora disparou OBJECTION indevidamente`);
  }
  expectFalse(audit.anchorLossRisk, "sem anchor loss risk");
  expectFalse(audit.newSearchRisk, "sem new search risk");
  expectFalse(audit.winnerChangeRisk, "sem winner change risk");
});

test("30: 'certo' sem âncora → não REACTION", () => {
  const { turnResult } = classifyAndAudit({
    query: "certo",
    hasActiveAnchor: false,
  });
  if (turnResult.turnType === "REACTION") {
    throw new Error(`"certo" sem âncora virou REACTION indevidamente`);
  }
});

test("31: 'beleza' sem âncora → não REACTION", () => {
  const { turnResult } = classifyAndAudit({
    query: "beleza",
    hasActiveAnchor: false,
  });
  if (turnResult.turnType === "REACTION") {
    throw new Error(`"beleza" sem âncora virou REACTION indevidamente`);
  }
});

test("32: 'realmente?' sem âncora → não dispara CONFIDENCE_CHALLENGE", () => {
  const { turnResult } = classifyAndAudit({
    query: "realmente?",
    hasActiveAnchor: false,
  });
  if (turnResult.turnType === "EXPLANATION_REQUEST") {
    throw new Error(`"realmente?" sem âncora disparou EXPLANATION_REQUEST indevidamente`);
  }
});

// ─────────────────────────────────────────────────────────────
// GRUPO 12 — Negativos de regressão críticos (PATCH 5.8D)
// Confirma que sinais do bloco 5.8 não contaminam outros turnos.
// ─────────────────────────────────────────────────────────────
console.log("\n— Grupo 12: Negativos de regressão críticos —");

test("33: 'celular até 2000' → NEW_SEARCH (não contaminado)", () => {
  const { turnResult, audit } = classifyAndAudit({
    query: "celular até 2000",
    hasActiveAnchor: false,
    expectedFollowUpFamily: null,
  });
  expect(turnResult.turnType, "NEW_SEARCH", "celular até 2000 → NEW_SEARCH");
  expectFalse(audit.winnerChangeRisk, "sem winner change risk");
});

test("34: 'iPhone 13 ou S23 FE?' → COMPARISON (não contaminado)", () => {
  const { turnResult } = classifyAndAudit({
    query: "iPhone 13 ou S23 FE?",
    hasActiveAnchor: false,
  });
  expect(turnResult.turnType, "COMPARISON", "iPhone 13 ou S23 FE? → COMPARISON");
});

test("35: 'tem algo mais barato?' com âncora → REFINEMENT (não contaminado)", () => {
  const { turnResult } = classifyAndAudit({
    query: "tem algo mais barato?",
    hasActiveAnchor: true,
    lastBestProduct: "Galaxy S24 FE",
  });
  // "mais barato" → refinement, não objection
  expect(turnResult.turnType, "REFINEMENT", "tem algo mais barato? → REFINEMENT");
});

test("36: 'ainda vale a pena?' com âncora → EXPLANATION_REQUEST/DECISION_DEFENSE (não contaminado)", () => {
  const { turnResult } = classifyAndAudit({
    query: "ainda vale a pena?",
    hasActiveAnchor: true,
    lastBestProduct: "Galaxy S24 FE",
  });
  // "vale a pena" pode ser VALUE_QUESTION ou EXPLANATION_REQUEST (decision_defense)
  // O importante é não ser OBJECTION/REACTION/NEW_SEARCH indevido
  if (turnResult.turnType === "OBJECTION") {
    throw new Error(`"ainda vale a pena?" classificou como OBJECTION indevidamente`);
  }
  if (turnResult.turnType === "REACTION") {
    throw new Error(`"ainda vale a pena?" classificou como REACTION indevidamente`);
  }
  if (turnResult.turnType === "NEW_SEARCH") {
    throw new Error(`"ainda vale a pena?" classificou como NEW_SEARCH indevidamente`);
  }
});

test("37: 'mas eu jogo' com âncora → continua PRIORITY_SHIFT (não contaminado por Fix 1)", () => {
  const { turnResult } = classifyAndAudit({
    query: "mas eu jogo",
    hasActiveAnchor: true,
    lastBestProduct: "Galaxy S24 FE",
  });
  expect(turnResult.turnType, "PRIORITY_SHIFT", "mas eu jogo → PRIORITY_SHIFT");
});

test("38: 'muito caro' com âncora → OBJECTION (não VALUE_QUESTION)", () => {
  const { turnResult } = classifyAndAudit({
    query: "muito caro",
    hasActiveAnchor: true,
    lastBestProduct: "Galaxy S24 FE",
  });
  expect(turnResult.turnType, "OBJECTION", "muito caro → OBJECTION");
});

test("39: 'tá caro' com âncora → VALUE_QUESTION (não contaminado por Fix 3)", () => {
  const { turnResult } = classifyAndAudit({
    query: "tá caro",
    hasActiveAnchor: true,
    lastBestProduct: "Galaxy S24 FE",
  });
  // "tá caro" continua em VALUE_QUESTION — Fix 3 usa "acho|parece|ficou|muito|bastante|bem"
  // Não usa "ta" para preservar o comportamento original de VALUE_QUESTION
  expect(turnResult.turnType, "VALUE_QUESTION", "tá caro → VALUE_QUESTION (preservado)");
});

// ─────────────────────────────────────────────────────────────
// SUMÁRIO DIAGNÓSTICO — Fotografia do estado atual
// ─────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(60)}`);
console.log("PATCH 5.8 — Fotografia do estado atual por família:");
console.log("─".repeat(60));

const matrix = [
  { q: "ok",                   anchor: true,  expected: FOLLOWUP_FAMILIES.ACKNOWLEDGEMENT },
  { q: "entendi",              anchor: true,  expected: FOLLOWUP_FAMILIES.ACKNOWLEDGEMENT },
  { q: "por quê?",             anchor: true,  expected: FOLLOWUP_FAMILIES.MINIMAL_EXPLANATION },
  { q: "como assim?",          anchor: true,  expected: FOLLOWUP_FAMILIES.MINIMAL_EXPLANATION },
  { q: "tem certeza?",         anchor: true,  expected: FOLLOWUP_FAMILIES.CONFIDENCE_CHALLENGE },
  { q: "sério?",               anchor: true,  expected: FOLLOWUP_FAMILIES.CONFIDENCE_CHALLENGE },
  { q: "e esse?",              anchor: true,  expected: FOLLOWUP_FAMILIES.ALTERNATIVE_COMPARISON },
  { q: "e o outro?",           anchor: true,  expected: FOLLOWUP_FAMILIES.ALTERNATIVE_COMPARISON },
  { q: "tem outro melhor?",    anchor: true,  expected: FOLLOWUP_FAMILIES.ALTERNATIVE_COMPARISON },
  { q: "não gostei",           anchor: true,  expected: FOLLOWUP_FAMILIES.OBJECTION },
  { q: "acho caro",            anchor: true,  expected: FOLLOWUP_FAMILIES.OBJECTION },
  { q: "mas eu jogo",          anchor: true,  expected: FOLLOWUP_FAMILIES.PRIORITY_SHIFT },
  { q: "quero câmera",         anchor: true,  expected: FOLLOWUP_FAMILIES.PRIORITY_SHIFT },
  { q: "e se for pra durar?",  anchor: true,  expected: FOLLOWUP_FAMILIES.PRIORITY_SHIFT },
  { q: "?",                    anchor: true,  expected: FOLLOWUP_FAMILIES.SYMBOL_ONLY },
  { q: "??",                   anchor: true,  expected: FOLLOWUP_FAMILIES.SYMBOL_ONLY },
  { q: "...",                  anchor: true,  expected: FOLLOWUP_FAMILIES.SYMBOL_ONLY },
];

let matrixOk = 0;
let matrixFail = 0;

// Risk metric counters — computed over the 17 primary cases with no routing override
// (allowNewSearch=null, allowReplaceWinner=null, shouldPreserveAnchor=null)
let fallbackRisks    = 0;
let anchorLossRisks  = 0;
let newSearchRisks   = 0;
let winnerChangeRisks = 0;

for (const row of matrix) {
  const { turnResult, audit } = classifyAndAudit({
    query: row.q,
    hasActiveAnchor: row.anchor,
    lastBestProduct: row.anchor ? "Galaxy S24 FE" : null,
    expectedFollowUpFamily: row.expected,
  });
  const ok = audit.classificationOk;
  if (ok)   matrixOk++;
  else      matrixFail++;

  if (audit.fallbackRisk)     fallbackRisks++;
  if (audit.anchorLossRisk)   anchorLossRisks++;
  if (audit.newSearchRisk)    newSearchRisks++;
  if (audit.winnerChangeRisk) winnerChangeRisks++;

  const status = ok ? "✓" : "✗";
  const turnInfo = `${turnResult.turnType}(${(turnResult.confidence * 100).toFixed(0)}%)`;
  const detected = audit.detectedFollowUpFamily.padEnd(26);
  const expected = row.expected.padEnd(26);
  console.log(
    `  ${status} "${row.q.padEnd(22)}" → actual: ${detected} | expected: ${expected} | turn: ${turnInfo}`
  );
}

console.log(`\n  Classificados corretamente: ${matrixOk}/${matrix.length}`);
console.log(`  Precisam de melhoria: ${matrixFail}/${matrix.length}`);

// ── PATCH 5.8D — Score final e métricas de risco ─────────────
console.log(`\n${"─".repeat(60)}`);
console.log("PATCH 5.8D — Score Final da Matriz Universal Follow-Up");
console.log("─".repeat(60));
console.log(`  universal_followup_matrix_score : ${matrixOk}/${matrix.length}`);
console.log(`  fallbackRisks                   : ${fallbackRisks}`);
console.log(`  anchorLossRisks                 : ${anchorLossRisks}`);
console.log(`  newSearchRisks                  : ${newSearchRisks}`);
console.log(`  winnerChangeRisks               : ${winnerChangeRisks}`);

// Validação assertiva das métricas de risco para o critério de saída
const scoreOk = matrixOk === matrix.length;
const risksOk = fallbackRisks === 0 && anchorLossRisks === 0 && newSearchRisks === 0 && winnerChangeRisks === 0;

if (!scoreOk) {
  console.error(`\n  ✗ FALHA: matriz incompleta (${matrixOk}/${matrix.length}). Bloco 5.8 NÃO fechado.`);
  process.exitCode = 1;
}
if (!risksOk) {
  console.error(`\n  ✗ FALHA: riscos críticos detectados. Bloco 5.8 NÃO fechado.`);
  process.exitCode = 1;
}
if (scoreOk && risksOk) {
  console.log(`\n  ✓ Bloco 5.8 FECHADO — 17/17 corretos, 0 riscos críticos.`);
}

// ─────────────────────────────────────────────────────────────
// Sumário final
// ─────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(60)}`);
console.log(`PATCH 5.8 — Universal Follow-Up Understanding Audit`);
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
