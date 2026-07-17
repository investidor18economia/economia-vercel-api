/**
 * PATCH 11A.7F — Commercial Continuation Runtime Crash Hardening
 */

import {
  validateComparisonInputContract,
  resolveAnchoredComparisonPair,
  assertComparisonInputContract,
  buildAnchoredComparisonIncompleteReply,
} from "../lib/miaComparisonFlowCrashGuard.js";
import {
  validateSpecificProductLockCandidate,
  isGenericProductSearchQuery,
  bootstrapSpecificProductLock,
} from "../lib/miaSpecificProductResolutionLock.js";
import { buildAuthorityClosingContract } from "../lib/miaAuthorityClosingContract.js";

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

console.log("\nPATCH 11A.7F — Runtime Crash Hardening Tests\n");

console.log("Grupo A — Comparison continuation válida");
{
  const contract = validateComparisonInputContract({
    leftProduct: { product_name: "Galaxy S23" },
    rightProduct: { product_name: "iPhone 13", trustedSpecs: { official_name: "iPhone 13" } },
  });
  expect(contract.comparisonInputStatus === "complete", "A: complete contract");
  expect(
    contract.comparisonDistinctnessStatus === "complete_distinct",
    "A: complete_distinct status"
  );
  expect(contract.comparisonLeftResolved && contract.comparisonRightResolved, "A: both sides");
}

console.log("\nGrupo B — Comparison lado ausente");
{
  const contract = validateComparisonInputContract({
    leftProduct: { product_name: "Galaxy S23" },
    rightProduct: null,
  });
  expect(contract.clarificationRequired, "B: clarification required");
  expect(contract.comparisonMissingSide === "right", "B: missing right");
}

console.log("\nGrupo C — Comparison sem anchor");
{
  const contract = validateComparisonInputContract({
    leftProduct: null,
    rightProduct: { product_name: "iPhone 13" },
  });
  expect(contract.comparisonMissingSide === "left", "C: missing left");
}

console.log("\nGrupo D — Category search");
{
  for (const q of [
    "Quero procurar um notebook.",
    "Preciso de um celular.",
    "Estou buscando uma TV.",
    "Quero um monitor.",
    "Amanhã quero procurar um notebook",
  ]) {
    expect(isGenericProductSearchQuery(q), `D: generic "${q.slice(0, 24)}..."`);
    const lock = bootstrapSpecificProductLock({
      query: q,
      products: [{ product_name: "Notebook Gamer Lenovo", trustedSpecs: { official_name: "Notebook Gamer Lenovo" } }],
      resolveIdentity: () => ({ officialName: q }),
    });
    expect(!lock.active, `D: lock inactive for "${q.slice(0, 20)}..."`);
  }
}

console.log("\nGrupo E — Specific product válido");
{
  const lock = bootstrapSpecificProductLock({
    query: "iPhone 13",
    products: [{ product_name: "Apple iPhone 13", trustedSpecs: { official_name: "Apple iPhone 13" } }],
  });
  const validation = validateSpecificProductLockCandidate({ query: "iPhone 13", lock });
  expect(validation.eligible, "E: valid lock eligible");
}

console.log("\nGrupo F — Specific product não resolvido");
{
  const lock = {
    active: true,
    lockedProduct: { product_name: "Amanhã quero procurar um notebook", specificProductQueryAnchor: true },
    matchSource: "query_identity_anchor",
  };
  const validation = validateSpecificProductLockCandidate({
    query: "Amanhã quero procurar um notebook",
    lock,
  });
  expect(!validation.eligible, "F: lock rejected");
  expect(
    validation.reasonCodes.some((code) =>
      ["raw_query_as_product", "missing_valid_specific_product", "generic_category_query"].includes(code)
    ),
    "F: rejection reason"
  );
}

console.log("\nGrupo G — Null winner + lock");
{
  const validation = validateSpecificProductLockCandidate({
    query: "notebook",
    lock: { active: true, lockedProduct: null },
    winnerBefore: null,
  });
  expect(!validation.eligible, "G: lock blocked");
  expect(validation.stateMutationBlocked, "G: state mutation blocked");
}

console.log("\nGrupo H — Raw query protection");
{
  const validation = validateSpecificProductLockCandidate({
    query: "Amanhã quero procurar um notebook",
    lock: {
      active: true,
      lockedProduct: { product_name: "Amanhã quero procurar um notebook" },
      matchSource: "query_identity_anchor",
    },
  });
  expect(!validation.eligible, "H: raw query rejected");
}

console.log("\nGrupo I — State integrity message");
{
  const contract = validateComparisonInputContract({
    leftProduct: { product_name: "iPhone 13" },
    rightProduct: { product_name: "iPhone 13" },
    query: "Compara com o iPhone 13",
  });
  const reply = buildAnchoredComparisonIncompleteReply({
    query: "Compara com o iPhone 13",
    contract,
  });
  expect(contract.comparisonDistinctnessStatus === "same_product", "I: same-product contract");
  expect(/mesmo|contexto|outro modelo/i.test(reply), "I: same-product clarification");
}

console.log("\nGrupo J — Anti-overfitting async resolve");
{
  const pair = await resolveAnchoredComparisonPair({
    anchorProduct: { product_name: "Galaxy S23" },
    query: "compara com iphone 13",
    rememberedProducts: [],
    resolveProductFn: async () => ({
      product_name: "iPhone 13",
      trustedSpecs: { official_name: "iPhone 13" },
    }),
  });
  expect(pair.comparisonInputStatus === "complete", "J: resolved pair complete");
  expect(
    pair.comparisonDistinctnessStatus === "complete_distinct",
    "J: distinct products"
  );
}

console.log("\nGrupo K — Tradeoff null safety");
{
  const contract = buildAuthorityClosingContract({
    winner: "Galaxy S23",
    query: "celular",
    tradeoffs: { sacrifices: [null] },
  });
  expect(!!contract, "K: authority contract without crash");
}

console.log("\nGrupo L — Assert contract");
{
  let threw = false;
  try {
    assertComparisonInputContract({ comparisonInputStatus: "partial", reasonCodes: ["missing_right_product"] });
  } catch {
    threw = true;
  }
  expect(threw, "L: assert throws on partial");
}

console.log(`\n${"=".repeat(60)}`);
console.log(`Resultado: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
