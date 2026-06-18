/**
 * PATCH 8.3A — Winner Lifecycle Enforcement Audit
 *
 * Validates anchored winner protection against clearNewSearch false positives.
 *
 * Usage:
 *   node scripts/test-mia-winner-lifecycle-enforcement-audit.js
 */

import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";
import {
  resolveClearNewCommercialSearchForRouting,
  isAnchoredSpendingAversion,
  isAnchoredDecisionChoiceRequest,
  isAnchoredComparisonOrProductReference,
} from "../lib/miaRoutingSafety.js";
import { detectsLegitimateSearchResetIntent } from "../lib/miaLegitimateSearchResetGuard.js";

const SESSION = {
  lastBestProduct: { product_name: "Produto Alpha 35", price: "R$ 1.950" },
  lastProductMentioned: "Produto Alpha 35",
  lastProducts: [{ product_name: "Produto Alpha 35", price: "R$ 1.950" }],
};

function simulate(message) {
  const clear = resolveClearNewCommercialSearchForRouting({
    query: message,
    resolvedQuery: message,
    hasAnchor: true,
    detectProductCategory: () => "",
    wantsNewProduct: () => false,
  });

  const rd = buildRoutingDecision({
    userMessage: message,
    resolvedQuery: message,
    sessionContext: SESSION,
    incomingSessionContext: SESSION,
    intent: "search",
    contextAction: "decision",
    signals: { hasClearNewCommercialSearch: clear },
  });

  return {
    clear,
    mode: rd.mode,
    allowNewSearch: rd.allowNewSearch,
    allowReplaceWinner: rd.allowReplaceWinner,
  };
}

const MUST_HOLD = [
  { msg: "sera que compensa?", group: "value" },
  { msg: "nao quero gastar muito", group: "spending" },
  { msg: "nao quero gastar tanto", group: "spending" },
  { msg: "qual dos dois voce indica?", group: "binary_choice" },
  { msg: "qual voce escolheria?", group: "binary_choice" },
  { msg: "qual faz mais sentido?", group: "binary_choice" },
  { msg: "entre eles qual vale mais?", group: "binary_choice" },
  { msg: "qual seria sua escolha?", group: "binary_choice" },
  { msg: "se fosse voce?", group: "binary_choice" },
  { msg: "dos dois qual leva?", group: "binary_choice" },
  { msg: "q dos 2 vc indica", group: "binary_choice_typo" },
  { msg: "estou em duvida entre esse e o Notebook Beta 22", group: "comparison" },
  { msg: "estou em duvida entre esse e o Monitor Gamma 27", group: "comparison" },
  { msg: "estou em duvida entre esse e o Mouse Delta 99", group: "comparison" },
  { msg: "estou em duvida entre esse e o Teclado Sigma 11", group: "comparison" },
  { msg: "estou em duvida entre esse e o Smartphone Beta 22", group: "comparison" },
];

const MUST_ALLOW_SEARCH = [
  "quero notebook ate 3000",
  "procura outro celular",
  "buscar opcoes novas",
  "nao quero esse, procura outro",
  "nao quero gastar mais de 2000",
];

const MUST_RESET_GUARD = ["esquece essa busca, recomeca"];

let passed = 0;
let failed = 0;

console.log("\nPATCH 8.3A — Winner Lifecycle Enforcement Audit\n");

console.log("── MUST HOLD (anchored winner protected) ──\n");
for (const { msg, group } of MUST_HOLD) {
  const r = simulate(msg);
  const ok = r.clear === false && r.allowNewSearch === false && r.allowReplaceWinner === false;
  if (ok) {
    passed++;
    console.log(`  ✓ [${group}] "${msg}" → mode=${r.mode}`);
  } else {
    failed++;
    console.log(
      `  ✗ [${group}] "${msg}" → clear=${r.clear} mode=${r.mode} allowNew=${r.allowNewSearch} allowReplace=${r.allowReplaceWinner}`
    );
  }
}

console.log("\n── MUST ALLOW SEARCH (explicit commercial reopen) ──\n");
for (const msg of MUST_ALLOW_SEARCH) {
  const r = simulate(msg);
  const ok =
    msg === "nao quero gastar mais de 2000"
      ? !isAnchoredSpendingAversion(msg)
      : r.clear === true || r.allowNewSearch === true;
  if (ok) {
    passed++;
    console.log(`  ✓ "${msg}" → clear=${r.clear} mode=${r.mode}`);
  } else {
    failed++;
    console.log(`  ✗ "${msg}" → clear=${r.clear} mode=${r.mode}`);
  }
}

console.log("\n── MUST RESET GUARD (8.5B — reset-only, not clearNewSearch) ──\n");
for (const msg of MUST_RESET_GUARD) {
  const r = simulate(msg);
  const resetIntent = detectsLegitimateSearchResetIntent(msg, { hasActiveAnchor: true });
  const ok = r.clear === false && resetIntent === true;
  if (ok) {
    passed++;
    console.log(`  ✓ "${msg}" → clear=${r.clear} resetIntent=${resetIntent}`);
  } else {
    failed++;
    console.log(`  ✗ "${msg}" → clear=${r.clear} resetIntent=${resetIntent}`);
  }
}

console.log("\n── Helper exports ──\n");
const helperChecks = [
  ["nao quero gastar muito", isAnchoredSpendingAversion, true],
  ["qual dos dois voce indica?", isAnchoredDecisionChoiceRequest, true],
  ["estou em duvida entre esse e o Monitor Gamma 27", isAnchoredComparisonOrProductReference, true],
  ["quero notebook ate 3000", isAnchoredDecisionChoiceRequest, false],
];

for (const [msg, fn, expected] of helperChecks) {
  const got = fn(msg);
  const ok = got === expected;
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${fn.name}("${msg}") → ${got} (expected ${expected})`);
}

console.log(`\nResult: ${passed} passed, ${failed} failed`);
console.log(`PATCH 8.3A enforcement ${failed === 0 ? "PASSED" : "FAILED"}\n`);
process.exit(failed === 0 ? 0 : 1);
