/**
 * Unit tests — parseBudgetAmount / extractBudget (PATCH 1)
 * Usage: node scripts/test-extract-budget.js
 */
import {
  parseBudgetAmount,
  extractBudget
} from "../lib/miaRoutingSafety.js";

const parseCases = [
  ["2.000", 2000],
  ["3.500", 3500],
  ["1.999", 1999],
  ["2000", 2000],
  ["2,5", 2.5],
  ["1999,90", 1999.9]
];

const extractCases = [
  ["celular até 2.000", 2000],
  ["celular ate 3.500", 3500],
  ["até 1.999", 1999],
  ["até 2,5 mil", 2500],
  ["abaixo de r$ 2000", 2000]
];

let failed = 0;

for (const [input, expected] of parseCases) {
  const got = parseBudgetAmount(input);
  const ok = got === expected;
  if (!ok) {
    failed++;
    console.error(`FAIL parseBudgetAmount("${input}") expected ${expected} got ${got}`);
  } else {
    console.log(`OK parseBudgetAmount("${input}") → ${got}`);
  }
}

for (const [input, expected] of extractCases) {
  const got = extractBudget(input);
  const ok = got === expected;
  if (!ok) {
    failed++;
    console.error(`FAIL extractBudget("${input}") expected ${expected} got ${got}`);
  } else {
    console.log(`OK extractBudget("${input}") → ${got}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}

console.log("\nAll budget parse tests passed.");
