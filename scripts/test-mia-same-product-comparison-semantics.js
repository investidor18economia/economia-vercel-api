/**
 * PATCH 11A.7G — Same-Product Comparison Semantics & Clarification Hardening
 */

import {
  areProductsSemanticallyEquivalent,
  buildSameProductComparisonClarificationReply,
  isComparisonExecutionAllowed,
  isExplicitAnchoredComparisonRequest,
  isExplicitSelfComparisonRequest,
  isProductConfirmationQuery,
  isSameProductComparisonContract,
  resolveCanonicalProductIdentity,
  resolveAnchoredComparisonPair,
  validateComparisonInputContract,
} from "../lib/miaComparisonFlowCrashGuard.js";

let passed = 0;
let failed = 0;

function expect(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed += 1;
  } else {
    console.log(`  ✗ ${label}`);
    failed += 1;
  }
}

console.log("\nPATCH 11A.7G — Same-Product Comparison Semantics\n");

console.log("Grupo A — Nome exato");
{
  const contract = validateComparisonInputContract({
    leftProduct: { product_name: "iPhone 13" },
    rightProduct: { product_name: "iPhone 13" },
    query: "Compara com o iPhone 13",
  });
  expect(contract.comparisonDistinctnessStatus === "same_product", "A: same_product status");
  expect(!contract.comparisonAllowed, "A: comparison blocked");
  expect(contract.clarificationRequired, "A: clarification required");
  expect(!contract.providerExecutionAllowed, "A: zero providers");
}

console.log("\nGrupo B — Alias");
{
  const contract = validateComparisonInputContract({
    leftProduct: {
      product_name: "Apple iPhone 13",
      trustedSpecs: { official_name: "Apple iPhone 13" },
    },
    rightProduct: { product_name: "iphone13", trustedSpecs: { official_name: "iphone13" } },
    query: "compara com iphone13",
  });
  expect(contract.comparisonDistinctnessStatus === "same_product", "B: alias same identity");
}

console.log("\nGrupo C — Variação de formatação (storage)");
{
  const contract = validateComparisonInputContract({
    leftProduct: { product_name: "iPhone 13", trustedSpecs: { official_name: "iPhone 13" } },
    rightProduct: {
      product_name: "iPhone 13 128GB",
      trustedSpecs: { official_name: "iPhone 13 128GB" },
    },
    query: "compara com iPhone 13 128GB",
  });
  expect(contract.comparisonDistinctnessStatus === "same_product", "C: storage variant same base model");
}

console.log("\nGrupo D — Produtos distintos (Pro)");
{
  const contract = validateComparisonInputContract({
    leftProduct: { product_name: "iPhone 13", trustedSpecs: { official_name: "iPhone 13" } },
    rightProduct: {
      product_name: "iPhone 13 Pro",
      trustedSpecs: { official_name: "iPhone 13 Pro" },
    },
    query: "Compara com o iPhone 13 Pro",
  });
  expect(contract.comparisonDistinctnessStatus === "complete_distinct", "D: complete_distinct");
  expect(isComparisonExecutionAllowed(contract), "D: comparison allowed");
}

console.log("\nGrupo E — Linha parecida (FE)");
{
  const contract = validateComparisonInputContract({
    leftProduct: { product_name: "Galaxy S23", trustedSpecs: { official_name: "Galaxy S23" } },
    rightProduct: {
      product_name: "Galaxy S23 FE",
      trustedSpecs: { official_name: "Galaxy S23 FE" },
    },
    query: "compara com Galaxy S23 FE",
  });
  expect(contract.comparisonDistinctnessStatus === "complete_distinct", "E: distinct FE");
}

console.log("\nGrupo F — Mesmo produto por ID");
{
  const contract = validateComparisonInputContract({
    leftProduct: {
      product_name: "Apple iPhone 13",
      trustedSpecs: { official_name: "Apple iPhone 13", detail_id: "iphone-13-base" },
    },
    rightProduct: {
      product_name: "iPhone 13",
      trustedSpecs: { official_name: "iPhone 13", detail_id: "iphone-13-base" },
    },
    query: "compara com iPhone 13",
  });
  expect(contract.comparisonDistinctnessStatus === "same_product", "F: same by detail_id");
}

console.log("\nGrupo G — Mesmo nome, IDs diferentes");
{
  const contract = validateComparisonInputContract({
    leftProduct: {
      product_name: "iPhone 13",
      trustedSpecs: { official_name: "iPhone 13", detail_id: "iphone-13-128" },
    },
    rightProduct: {
      product_name: "iPhone 13",
      trustedSpecs: { official_name: "iPhone 13", detail_id: "iphone-13-256" },
    },
    query: "compara com iPhone 13",
  });
  expect(contract.comparisonDistinctnessStatus !== "same_product", "G: distinct SKUs by detail_id");
}

console.log("\nGrupo H — Comparação incompleta");
{
  const contract = validateComparisonInputContract({
    leftProduct: { product_name: "iPhone 13" },
    rightProduct: null,
    query: "compara com Moto G84",
  });
  expect(contract.comparisonDistinctnessStatus === "partial_missing_right", "H: partial missing right");
  expect(!isSameProductComparisonContract(contract), "H: not same_product");
}

console.log("\nGrupo I — Confirmação, não comparação");
{
  expect(!isExplicitAnchoredComparisonRequest("é o iPhone 13 mesmo?"), "I: not comparison request");
  expect(isProductConfirmationQuery("é o iPhone 13 mesmo?"), "I: confirmation query");
  const contract = validateComparisonInputContract({
    leftProduct: { product_name: "iPhone 13" },
    rightProduct: { product_name: "iPhone 13" },
    query: "é o iPhone 13 mesmo?",
  });
  expect(contract.comparisonDistinctnessStatus === "same_product", "I: identity still equivalent");
}

console.log("\nGrupo J — Self-comparison explícita");
{
  const contract = validateComparisonInputContract({
    leftProduct: { product_name: "iPhone 13" },
    rightProduct: { product_name: "iPhone 13 Pro" },
    query: "compare o iPhone 13 com ele mesmo",
  });
  expect(contract.comparisonDistinctnessStatus === "same_product", "J: explicit self comparison");
  const reply = buildSameProductComparisonClarificationReply({ contract });
  expect(/mesmo modelo|consigo mesmo/i.test(reply), "J: self comparison reply");
}

console.log("\nGrupo K — State contract flags");
{
  const contract = validateComparisonInputContract({
    leftProduct: { product_name: "Samsung Galaxy S23" },
    rightProduct: { product_name: "S23", trustedSpecs: { official_name: "Samsung Galaxy S23" } },
    query: "compara com o S23",
  });
  expect(isSameProductComparisonContract(contract), "K: same_product contract");
  expect(contract.stateMutationAllowed === false, "K: state mutation blocked");
  expect(contract.comparisonExecutionBlocked, "K: execution blocked");
}

console.log("\nGrupo L — Anti-overfitting");
{
  const pairs = [
    [
      { product_name: "Apple iPhone 13", trustedSpecs: { official_name: "Apple iPhone 13" } },
      { product_name: "iphone 13", trustedSpecs: { official_name: "iphone 13" } },
    ],
    [
      { product_name: "Samsung Galaxy S23", trustedSpecs: { official_name: "Samsung Galaxy S23" } },
      { product_name: "Galaxy S23", trustedSpecs: { official_name: "Galaxy S23" } },
    ],
  ];
  for (const [left, right] of pairs) {
    const eq = areProductsSemanticallyEquivalent(left, right);
    expect(eq.equivalent, `L: equivalent ${left.product_name} ~ ${right.product_name}`);
  }

  const distinct = validateComparisonInputContract({
    leftProduct: { product_name: "Galaxy S23 Ultra" },
    rightProduct: { product_name: "Galaxy S23" },
    query: "compara com Galaxy S23",
  });
  expect(distinct.comparisonDistinctnessStatus === "complete_distinct", "L: ultra vs base distinct");
}

console.log("\nGrupo M — Canonical identity resolver");
{
  const identity = resolveCanonicalProductIdentity({
    product_name: "iPhone 13 128GB",
    trustedSpecs: { official_name: "iPhone 13 128GB", detail_id: "iphone13-128" },
    familyKey: "iphone-13",
  });
  expect(identity.canonicalKey.startsWith("detail:"), "M: detail_id canonical key");
  expect(identity.variant === "base", "M: base variant");
}

console.log("\nGrupo N — Async anchored pair same-product");
{
  const pair = await resolveAnchoredComparisonPair({
    anchorProduct: { product_name: "iPhone 13", trustedSpecs: { official_name: "iPhone 13" } },
    query: "Compara com o iPhone 13",
    rememberedProducts: [],
    resolveProductFn: async () => ({
      product_name: "Apple iPhone 13",
      trustedSpecs: { official_name: "Apple iPhone 13" },
    }),
  });
  expect(pair.comparisonDistinctnessStatus === "same_product", "N: async same_product");
  expect(!isComparisonExecutionAllowed(pair), "N: pipeline blocked");
}

console.log(`\n${"=".repeat(60)}`);
console.log(`Resultado: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
