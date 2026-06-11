/**
 * Unit tests — PATCH 4.6 decision consistency fixes
 * Usage: node scripts/test-mia-decision-consistency-fixes.js
 */
import {
  buildContextUnknownProductCorrectionReply,
  buildPriorityFollowUpClosingLine,
  didPriorityFollowUpChangeWinner,
  namesLikelyMatch,
  resolveDecisionEngineWinners
} from "../lib/miaDecisionConsistencyFixes.js";

function assert(label, condition) {
  if (!condition) {
    console.error("FAIL:", label);
    process.exit(1);
  }
  console.log("OK:", label);
}

const list = [
  { product_name: "Samsung Galaxy S23 FE" },
  { product_name: "iPhone 13" },
  { product_name: "Samsung Galaxy A35 5G" }
];

const anchored = resolveDecisionEngineWinners(list, {
  product_name: "iPhone 13"
});
assert(
  "anchor picks iPhone as best",
  anchored.best?.product_name === "iPhone 13"
);
assert(
  "second is not anchor",
  anchored.second &&
    !namesLikelyMatch(anchored.second.product_name, "iPhone 13")
);

assert(
  "priority follow-up changed winner",
  didPriorityFollowUpChangeWinner(
    { product_name: "iPhone 13" },
    { product_name: "Samsung Galaxy A35 5G" }
  )
);

const closingChanged = buildPriorityFollowUpClosingLine({
  productTitle: "Samsung Galaxy A35 5G",
  priorityLabel: "bateria/autonomia",
  winnerChanged: true
});
assert(
  "closing mentions new reference",
  closingChanged.includes("passa a ser a referência")
);
assert(
  "closing not hold phrase when changed",
  !closingChanged.includes("manteria esse produto como referência")
);

const perfReply = buildContextUnknownProductCorrectionReply(
  { product_name: "iPhone 13" },
  { lastPriority: "performance", lastMainConsequence: "folga no uso pesado" }
);
assert(
  "guard uses performance tone",
  perfReply.includes("uso mais pesado") && !perfReply.includes("uso leve")
);

console.log("\nAll PATCH 4.6 fix tests passed.");
