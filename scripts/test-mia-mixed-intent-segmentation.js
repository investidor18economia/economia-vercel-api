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
  if (/geladeira/.test(q)) return "fridge";
  if (/maquina de lavar|máquina de lavar/.test(q)) return "washer";
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

console.log("\nPATCH 11B.2 — Mixed Intent Segmentation (extended)");

function expectMixedCommercial(msg, { pipeIncludes = null, budget = null, excluded = null } = {}) {
  const r = runMixedPipeline(msg);
  expectTrue(
    r.recognition.interactionMode === MIA_INTERACTION_MODES.MIXED ||
      r.authority.commercialPermission === COMMERCIAL_PERMISSION.MIXED ||
      (r.recognition.mixedIntentComposition?.isMixed &&
        r.authority.commercialPermission !== COMMERCIAL_PERMISSION.DENY),
    "mixed mode"
  );
  expectTrue(r.authority.commercialPermission !== COMMERCIAL_PERMISSION.DENY, "commercial authorized");
  if (pipeIncludes) {
    expectTrue(String(r.commercialPipelineQuery || "").includes(pipeIncludes), "pipeline query");
  }
  if (budget != null) {
    expect(r.segmentation?.commercialDimension?.commercialConstraints?.budget, budget);
  }
  if (excluded != null) {
    const brands = r.segmentation?.components?.constraints?.excludedBrands || [];
    expectTrue(brands.some((b) => excluded.includes(b)), "excluded brand");
  }
}

function expectNonCommercial(msg) {
  const r = runMixedPipeline(msg);
  expect(r.authority.commercialPermission, COMMERCIAL_PERMISSION.DENY);
  expect(r.commercialPipelineQuery, null);
}

console.log("\nGrupo A — frustração + compra");
test("A1: cansado + comprar até 2500", () => {
  expectMixedCommercial("estou cansado de pesquisar celular, mas quero comprar um até 2500", {
    budget: 2500,
  });
});
test("A2: não aguento + notebook 4000", () => {
  expectMixedCommercial("não aguento mais procurar notebook, me recomenda um até 4000", {
    budget: 4000,
    pipeIncludes: "notebook",
  });
});

console.log("\nGrupo B — medo + recomendação");
test("B1: medo arrepender + celular", () => {
  expectMixedCommercial("tenho medo de me arrepender, qual celular você recomenda?", {
    pipeIncludes: "celular",
  });
});
test("B2: receio gastar + notebook", () => {
  expectMixedCommercial("estou com receio de gastar errado, me ajuda a escolher um notebook", {
    pipeIncludes: "notebook",
  });
});

console.log("\nGrupo C — opinião + avaliação");
test("C1: iPhone bonito + vale a pena", () => {
  expectMixedCommercial("acho o iPhone bonito, mas vale a pena comprar?", { pipeIncludes: "iphone" });
});
test("C2: Galaxy gosto + é bom", () => {
  const r = runMixedPipeline("gosto desse Galaxy, mas ele é bom mesmo?");
  expectTrue(r.recognition.interactionMode === MIA_INTERACTION_MODES.MIXED);
});

console.log("\nGrupo D — rejeição + requisito");
test("D1: não gosto iPhone + bateria", () => {
  expectMixedCommercial("não gosto de iPhone, mas quero um celular com boa bateria", {
    pipeIncludes: "celular",
    excluded: "iphone",
  });
});
test("D2: sem Samsung + outra marca", () => {
  expectMixedCommercial("não quero Samsung, me recomenda outra marca", { pipeIncludes: "samsung" });
});

console.log("\nGrupo E — histórico + nova busca");
test("E1: celular travava + mais rápido", () => {
  expectMixedCommercial("meu último celular travava, quero um mais rápido", { pipeIncludes: "celular" });
});
test("E2: velho + quero trocar", () => {
  expectMixedCommercial("meu celular está velho e quero trocar", { pipeIncludes: "celular" });
});

console.log("\nGrupo F — indecisão + orçamento");
test("F1: dúvida + celular 3000", () => {
  expectMixedCommercial("estou em dúvida, qual celular até 3000 vale mais a pena?", { budget: 3000, pipeIncludes: "celular" });
});
test("F2: perdido + algo bom → clarify", () => {
  const r = runMixedPipeline("estou perdido, mas quero comprar algo bom");
  expectTrue(r.recognition.requiresClarification);
  expect(r.commercialPipelineQuery, null);
});

console.log("\nGrupo G — elogio + comparação");
test("G1: dois bonitos + qual melhor", () => {
  const r = runMixedPipeline("acho os dois bonitos, mas qual é melhor?");
  expectTrue(r.recognition.interactionMode === MIA_INTERACTION_MODES.MIXED);
});

console.log("\nGrupo H — relato + necessidade");
test("H1: TV queimou + comprar", () => {
  expectMixedCommercial("minha televisão queimou, preciso comprar outra", { pipeIncludes: "tv" });
});

console.log("\nGrupo I — cancelamento comercial");
test("I1: não quero comprar agora", () => {
  expectNonCommercial("não quero comprar agora, só estou comentando");
});
test("I2: não precisa pesquisar", () => {
  expectNonCommercial("não precisa pesquisar, estou apenas desabafando");
});

console.log("\nGrupo J — não mixed (11B preservado)");
test("J1: cansado sem ask", () => expectNonCommercial("estou cansado de pesquisar celular"));
test("J2: Galaxy bonito", () => expectNonCommercial("acho o Galaxy bonito"));
test("J3: celular velho sem ask", () => expectNonCommercial("meu celular está velho"));
test("J4: comercial puro", () => {
  const r = runMixedPipeline("quero comprar um celular até 2500");
  expect(r.authority.commercialPermission, COMMERCIAL_PERMISSION.ALLOW);
});

console.log("\nGrupo K — generalização categorias");
test("K1: geladeira medo", () => {
  expectMixedCommercial("tenho medo de comprar uma geladeira ruim, me recomenda uma até 4000", {
    pipeIncludes: "geladeira",
    budget: 4000,
  });
});
test("K2: máquina quebrou", () => {
  expectMixedCommercial("minha máquina de lavar quebrou, preciso comprar outra", {
    pipeIncludes: "maquina de lavar",
  });
});

console.log("\nPares mínimos");
test("pair social vs mixed", () => {
  expectNonCommercial("estou cansado de pesquisar celular");
  expectMixedCommercial("estou cansado de pesquisar celular, mas quero comprar um até 2500", {
    budget: 2500,
  });
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
console.log("PATCH 11B.2 mixed intent segmentation tests: OK\n");
