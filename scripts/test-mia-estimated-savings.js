/**
 * Unit tests — economia estimada MVP
 * Usage: node scripts/test-mia-estimated-savings.js
 */
import {
  buildEstimatedSavingsMessage,
  computeEstimatedSavingsAmount,
  parseProductPriceValue,
  toNonRoundSavingsAmount,
  isForbiddenRoundAmount,
  shouldShowPremiumSavingsOnSearch
} from "../lib/miaEstimatedSavings.js";

function assert(label, condition) {
  if (!condition) {
    console.error("FAIL:", label);
    process.exit(1);
  }
  console.log("OK:", label);
}

assert("parse 2.000", parseProductPriceValue("2.000") === 2000);
assert("parse R$ 1999,90", parseProductPriceValue("R$ 1999,90") === 1999.9);

const msg = buildEstimatedSavingsMessage(
  { session_context: { lastBestProduct: { price: "R$ 2.000" } } },
  [{ price: "R$ 1.500" }]
);
assert("message format", msg && msg.includes("💰 Você pode ter economizado até R$"));
assert("no cents in message", !/,\d{2}\b/.test(msg || ""));

const amount = computeEstimatedSavingsAmount(2000);
assert("amount in range", amount >= 15 && amount <= 300);
assert("non-round", !isForbiddenRoundAmount(amount));

assert("toNonRound clamps 10 -> 15+", toNonRoundSavingsAmount(10) >= 15);
assert("first search only flag", shouldShowPremiumSavingsOnSearch(1) === true);

console.log("\nSample message:", msg);
console.log("\nAll estimated savings tests passed.");
