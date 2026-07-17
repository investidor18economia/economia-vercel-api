/**
 * PATCH 11A.3 — Mixed Intent Segmentation & Commercial Query Extraction
 *
 * Rodar: node scripts/test-mia-mixed-intent-segmentation.js
 */

import {
  recognizeMiaIntent,
  MIA_INTERACTION_MODES,
} from "../lib/miaIntentRecognitionLayer.js";
import {
  buildIntentAuthorityFromRecognition,
  COMMERCIAL_PERMISSION,
} from "../lib/miaIntentAuthority.js";
import { extractBudget } from "../lib/miaRoutingSafety.js";
import {
  segmentMixedIntent,
  shouldApplyMixedSegmentation,
  validateCommercialSearchQuery,
  applyMixedSegmentationToResolvedQuery,
  resolveCommercialPipelineQuery,
  isInvalidCommercialQueryAsRawMessage,
  isWinnerContaminatedByRawMessage,
  sanitizeWinnerProduct,
} from "../lib/miaMixedIntentSegmentation.js";

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

function expectTrue(val, label = "") {
  if (!val) throw new Error(`Expected truthy${label ? ` [${label}]` : ""}`);
}

function expectFalse(val, label = "") {
  if (val) throw new Error(`Expected falsy${label ? ` [${label}]` : ""}`);
}

function detectProductCategory(text = "") {
  const q = String(text || "").toLowerCase();
  if (/celular|smartphone|iphone|galaxy|samsung|motorola/.test(q)) return "phone";
  if (/notebook|laptop/.test(q)) return "notebook";
  if (/tv|televis/.test(q)) return "tv";
  if (/mouse/.test(q)) return "computer";
  return null;
}

function runMixedPipeline(message, extra = {}) {
  const query = message;
  const recognition = recognizeMiaIntent({
    userMessage: message,
    resolvedQuery: query,
    detectedIntent: extra.detectedIntent || "search",
    hasActiveAnchor: !!extra.hasActiveAnchor,
    sessionContext: extra.sessionContext || {},
  });
  const authority = buildIntentAuthorityFromRecognition(recognition, {
    hasActiveAnchor: !!extra.hasActiveAnchor,
  });

  let segmentation = null;
  let validation = null;
  let applied = { applied: false, commercialSearchQuery: null };
  let commercialPipelineQuery = query;

  if (
    shouldApplyMixedSegmentation({
      intentRecognition: recognition,
      intentAuthority: authority,
    })
  ) {
    segmentation = segmentMixedIntent({
      userMessage: message,
      intentRecognition: recognition,
      intentAuthority: authority,
      hasActiveAnchor: !!extra.hasActiveAnchor,
      sessionContext: extra.sessionContext || {},
      detectProductCategory,
      extractBudget,
    });
    validation = validateCommercialSearchQuery(
      segmentation?.commercialDimension?.commercialSearchQuery,
      message,
      segmentation
    );
    applied = applyMixedSegmentationToResolvedQuery({
      segmentation,
      rawMessage: message,
      validation,
    });
    commercialPipelineQuery = resolveCommercialPipelineQuery({
      commercialSearchQueryForProviders: applied.commercialSearchQuery,
      resolvedQuery: applied.resolvedQuery,
      rawMessage: message,
      mixedSegmentationApplied: applied.applied,
      mixedIntentSegmentation: segmentation,
      validation,
    });
  } else if (authority.commercialPermission === COMMERCIAL_PERMISSION.DENY) {
    commercialPipelineQuery = null;
  }

  return {
    recognition,
    authority,
    segmentation,
    validation,
    applied,
    commercialPipelineQuery,
  };
}

console.log("\nPATCH 11A.3 — Mixed Intent Segmentation Tests\n");

console.log("Grupo A — emoção + compra notebook");
test("A: query comercial = notebook", () => {
  const msg = "Hoje foi horrível, mas preciso comprar um notebook.";
  const r = runMixedPipeline(msg);
  expect(r.commercialPipelineQuery, "notebook");
  expectFalse(isInvalidCommercialQueryAsRawMessage(r.commercialPipelineQuery, msg));
});

console.log("\nGrupo B — cansado + celular");
test("B: query comercial = celular", () => {
  const msg = "Estou cansado, me recomenda um celular.";
  const r = runMixedPipeline(msg);
  expect(r.commercialPipelineQuery, "celular");
  expectFalse(isInvalidCommercialQueryAsRawMessage(r.commercialPipelineQuery, msg));
});

console.log("\nGrupo C — agradecimento + comparação");
test("C: comparação S23 vs iPhone 13", () => {
  const msg = "Valeu! Agora compara S23 e iPhone 13.";
  const r = runMixedPipeline(msg);
  expectTrue(r.commercialPipelineQuery?.includes("s23"), "has s23");
  expectTrue(r.commercialPipelineQuery?.includes("iphone 13"), "has iphone 13");
  expect(r.segmentation?.commercialDimension?.isComparison, true);
});

console.log("\nGrupo D — dia bom + TV");
test("D: query comercial = tv", () => {
  const msg = "Hoje foi um ótimo dia, quero uma TV.";
  const r = runMixedPipeline(msg);
  expect(r.commercialPipelineQuery, "tv");
});

console.log("\nGrupo E — pós-compra + obrigado");
test("E: commercialPermission deny + query null", () => {
  const msg = "Comprei o celular, obrigado.";
  const r = runMixedPipeline(msg);
  expect(r.authority.commercialPermission, COMMERCIAL_PERMISSION.DENY);
  expect(r.commercialPipelineQuery, null);
});

console.log("\nGrupo F — só conversa");
test("F: query null", () => {
  const msg = "Só queria conversar.";
  const r = runMixedPipeline(msg);
  expect(r.commercialPipelineQuery, null);
});

console.log("\nGrupo G — emoção + boa noite");
test("G: query null", () => {
  const msg = "Hoje foi difícil. Boa noite.";
  const r = runMixedPipeline(msg);
  expect(r.commercialPipelineQuery, null);
});

console.log("\nGrupo H — variantes anti-overfitting");
const groupH = [
  { msg: "Dia ruim demais, mas quero um mouse novo.", expected: "mouse" },
  { msg: "Sem paciência hoje, indica um monitor.", expected: "monitor" },
  { msg: "Tô exausto, preciso de um fone.", expected: "fone" },
  { msg: "Que semana, me ajuda com notebook?", expected: "notebook" },
];
for (const item of groupH) {
  test(`H: "${item.msg.slice(0, 40)}..." → ${item.expected}`, () => {
    const r = runMixedPipeline(item.msg);
    expect(r.commercialPipelineQuery, item.expected);
    expectFalse(isInvalidCommercialQueryAsRawMessage(r.commercialPipelineQuery, item.msg));
  });
}

console.log("\nProteções estruturais");
test("query nunca igual à frase inteira (caso canônico)", () => {
  const msg = "Hoje foi péssimo, mas preciso escolher um celular.";
  const r = runMixedPipeline(msg);
  expect(r.commercialPipelineQuery, "celular");
  expectFalse(isInvalidCommercialQueryAsRawMessage(r.commercialPipelineQuery, msg));
});

test("winner contaminado é bloqueado", () => {
  const msg = "Hoje foi péssimo, mas preciso escolher um celular.";
  const winner = sanitizeWinnerProduct(
    { product_name: msg },
    { rawMessage: msg, commercialSearchQuery: "celular" }
  );
  expect(winner, null);
  expectTrue(isWinnerContaminatedByRawMessage(msg, msg, "celular"));
});

test("winner válido passa sanitização", () => {
  const msg = "Hoje foi péssimo, mas preciso escolher um celular.";
  const winner = sanitizeWinnerProduct(
    { product_name: "Samsung Galaxy A55" },
    { rawMessage: msg, commercialSearchQuery: "celular" }
  );
  expect(winner?.product_name, "Samsung Galaxy A55");
});

test("shouldApplyMixedSegmentation false em deny", () => {
  const msg = "Comprei o celular, obrigado.";
  const recognition = recognizeMiaIntent({
    userMessage: msg,
    resolvedQuery: msg,
    detectedIntent: "search",
  });
  const authority = buildIntentAuthorityFromRecognition(recognition);
  expectFalse(
    shouldApplyMixedSegmentation({ intentRecognition: recognition, intentAuthority: authority })
  );
});

test("modo MIXED reconhecido em mensagem mista", () => {
  const msg = "Hoje foi péssimo, mas preciso escolher um celular.";
  const r = runMixedPipeline(msg);
  expectTrue(
    r.recognition.interactionMode === MIA_INTERACTION_MODES.MIXED ||
      r.authority.commercialPermission === COMMERCIAL_PERMISSION.MIXED ||
      r.authority.commercialPermission === COMMERCIAL_PERMISSION.ALLOW
  );
});

console.log("\n" + "─".repeat(50));
console.log(`Resultado: ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFalhas:");
  for (const f of failures) {
    console.log(`  - ${f.label}: ${f.error}`);
  }
  process.exit(1);
}
console.log("PATCH 11A.3 segmentation tests: OK\n");
