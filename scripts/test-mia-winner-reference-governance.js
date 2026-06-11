/**
 * PATCH 7.1 — Winner Reference Governance
 * Structural tests for enforceWinnerReferenceInvariant and related functions.
 *
 * Tests cover 5 structural scenarios:
 *   A: winner cited + alternative mentioned → reference stays at winner
 *   B: winner + comparison → comparison doesn't change winner reference
 *   C: winner + plan B → plan B does not become winner
 *   D: winner changes formally → references update to new winner
 *   E: multiple alternatives cited → none replaces winner
 *
 * Usage: node scripts/test-mia-winner-reference-governance.js
 */

import {
  enforceWinnerReferenceInvariant,
  applyContractToSessionContext,
  applyFinalContractSafetyNet,
} from "../lib/miaRoutingGuardrails.js";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (!condition) {
    console.error("FAIL:", label);
    failed++;
  } else {
    console.log("OK  :", label);
    passed++;
  }
}

function section(title) {
  console.log("\n──", title, "──");
}

// Fixtures
const WINNER = { product_name: "Galaxy S22", price: "R$ 2.499", link: "https://..." };
const ALTERNATIVE = { product_name: "Poco F4 GT" };
const PLAN_B = { product_name: "Moto G73" };
const NEW_WINNER = { product_name: "iPhone 13" };

// ─────────────────────────────────────────────────────────────
// Unit: enforceWinnerReferenceInvariant
// ─────────────────────────────────────────────────────────────

section("enforceWinnerReferenceInvariant — unit");

assert(
  "no winner → session unchanged",
  enforceWinnerReferenceInvariant({ lastProductMentioned: "Poco F4 GT" })
    .lastProductMentioned === "Poco F4 GT"
);

assert(
  "winner exists + LPM matches → no change (same ref returned)",
  enforceWinnerReferenceInvariant({
    lastBestProduct: WINNER,
    lastProductMentioned: "Galaxy S22",
  }).lastProductMentioned === "Galaxy S22"
);

assert(
  "winner exists + LPM diverges → corrected to winner",
  enforceWinnerReferenceInvariant({
    lastBestProduct: WINNER,
    lastProductMentioned: "Poco F4 GT",
  }).lastProductMentioned === "Galaxy S22"
);

assert(
  "winner exists + LPM empty → filled with winner",
  enforceWinnerReferenceInvariant({
    lastBestProduct: WINNER,
    lastProductMentioned: "",
  }).lastProductMentioned === "Galaxy S22"
);

assert(
  "winner exists + no LPM key → filled with winner",
  enforceWinnerReferenceInvariant({
    lastBestProduct: WINNER,
  }).lastProductMentioned === "Galaxy S22"
);

assert(
  "does not mutate original object",
  (() => {
    const s = { lastBestProduct: WINNER, lastProductMentioned: "Poco F4 GT" };
    const r = enforceWinnerReferenceInvariant(s);
    return s.lastProductMentioned === "Poco F4 GT" && r.lastProductMentioned === "Galaxy S22";
  })()
);

// ─────────────────────────────────────────────────────────────
// Scenario A — winner cited + alternative mentioned
// Reference must stay at winner after contextual response
// ─────────────────────────────────────────────────────────────

section("Scenario A — alternative mentioned ≠ winner");

const scenarioA_before = {
  lastBestProduct: WINNER,
  lastProducts: [WINNER, ALTERNATIVE],
  lastProductMentioned: "Galaxy S22",
};

// Simulate: LLM mentioned Poco F4 GT in a contextual response.
// Some part of the pipeline wrote lastProductMentioned to the alternative.
const scenarioA_contaminated = {
  ...scenarioA_before,
  lastProductMentioned: "Poco F4 GT",
};

const scenarioA_fixed = enforceWinnerReferenceInvariant(scenarioA_contaminated);

assert(
  "Scenario A: LPM after contamination corrected to winner",
  scenarioA_fixed.lastProductMentioned === "Galaxy S22"
);
assert(
  "Scenario A: lastBestProduct unchanged",
  scenarioA_fixed.lastBestProduct.product_name === "Galaxy S22"
);

// ─────────────────────────────────────────────────────────────
// Scenario B — winner + comparison
// Comparison does not change winner reference
// ─────────────────────────────────────────────────────────────

section("Scenario B — comparison does not replace winner");

const rdPreserve = {
  mode: "comparison_followup",
  allowReplaceWinner: false,
  allowRerank: false,
  shouldPreserveAnchor: true,
  anchorProduct: WINNER,
};

const scenarioB_out = applyContractToSessionContext(
  {
    lastBestProduct: WINNER,
    lastProducts: [WINNER, ALTERNATIVE],
    lastProductMentioned: "Galaxy S22",
  },
  rdPreserve,
  {
    proposedBestProduct: ALTERNATIVE,
    proposedProducts: [WINNER, ALTERNATIVE],
  }
);

assert(
  "Scenario B: winner preserved after comparison (lastBestProduct)",
  scenarioB_out.lastBestProduct.product_name === "Galaxy S22"
);
assert(
  "Scenario B: LPM not contaminated by comparison product",
  scenarioB_out.lastProductMentioned === "Galaxy S22"
);

// ─────────────────────────────────────────────────────────────
// Scenario C — winner + plan B
// Plan B mentioned in response does not become winner
// ─────────────────────────────────────────────────────────────

section("Scenario C — plan B ≠ winner");

const rdRefinementAnchor = {
  mode: "anchored_reaction",
  allowReplaceWinner: false,
  allowRerank: false,
  shouldPreserveAnchor: true,
  anchorProduct: WINNER,
};

// Simulate: REFINEMENT response mentioned Moto G73 (plan B)
// but session context was updated correctly by contract
const scenarioC_out = applyContractToSessionContext(
  {
    lastBestProduct: WINNER,
    lastProducts: [WINNER, ALTERNATIVE, PLAN_B],
    lastProductMentioned: "Moto G73",  // contamination attempt
  },
  rdRefinementAnchor,
  { proposedBestProduct: PLAN_B }
);

assert(
  "Scenario C: winner preserved (plan B not promoted)",
  scenarioC_out.lastBestProduct.product_name === "Galaxy S22"
);
assert(
  "Scenario C: LPM corrected back to winner",
  scenarioC_out.lastProductMentioned === "Galaxy S22"
);

// ─────────────────────────────────────────────────────────────
// Scenario D — formal winner change
// When authorized, references update to new winner
// ─────────────────────────────────────────────────────────────

section("Scenario D — formal winner change authorized");

const rdNewSearch = {
  mode: "new_search",
  allowReplaceWinner: true,
  allowRerank: true,
  shouldPreserveAnchor: false,
  anchorProduct: null,
};

const scenarioD_out = applyContractToSessionContext(
  {
    lastBestProduct: WINNER,
    lastProducts: [WINNER, ALTERNATIVE],
    lastProductMentioned: "Galaxy S22",
  },
  rdNewSearch,
  {
    proposedBestProduct: NEW_WINNER,
    proposedProducts: [NEW_WINNER, WINNER],
  }
);

assert(
  "Scenario D: new winner installed (lastBestProduct)",
  scenarioD_out.lastBestProduct.product_name === "iPhone 13"
);
assert(
  "Scenario D: LPM updated to new winner (PATCH 7.1 fix)",
  scenarioD_out.lastProductMentioned === "iPhone 13"
);
assert(
  "Scenario D: products list updated",
  Array.isArray(scenarioD_out.lastProducts) &&
    scenarioD_out.lastProducts[0].product_name === "iPhone 13"
);

// ─────────────────────────────────────────────────────────────
// Scenario E — multiple alternatives cited, none replaces winner
// ─────────────────────────────────────────────────────────────

section("Scenario E — multiple alternatives ≠ winner");

const rdAnchorHold = {
  mode: "cognitive_anchor_hold",
  allowReplaceWinner: false,
  allowRerank: false,
  shouldPreserveAnchor: true,
  anchorProduct: WINNER,
};

const scenarioE_contaminatedContext = {
  lastBestProduct: WINNER,
  lastProducts: [WINNER, ALTERNATIVE, PLAN_B, NEW_WINNER],
  lastProductMentioned: "iPhone 13",  // last mentioned in LLM response
};

const scenarioE_after_contract = applyContractToSessionContext(
  scenarioE_contaminatedContext,
  rdAnchorHold,
  {
    proposedBestProduct: { product_name: "iPhone 13" },
    proposedProducts: [WINNER, ALTERNATIVE, PLAN_B, NEW_WINNER],
  }
);

assert(
  "Scenario E: winner preserved despite multiple alternatives",
  scenarioE_after_contract.lastBestProduct.product_name === "Galaxy S22"
);
assert(
  "Scenario E: LPM corrected to winner (iPhone 13 was mentioned but is not winner)",
  scenarioE_after_contract.lastProductMentioned === "Galaxy S22"
);

// ─────────────────────────────────────────────────────────────
// applyFinalContractSafetyNet + winner-reference invariant
// ─────────────────────────────────────────────────────────────

section("Safety net: winner swap attempt blocked");

const rdProtected = {
  mode: "context_decision",
  allowReplaceWinner: false,
  shouldPreserveAnchor: true,
  anchorProduct: WINNER,
};

const sessionBefore = { lastBestProduct: WINNER, lastProductMentioned: "Galaxy S22" };

const swappedPayload = {
  reply: "Eu iria no Poco F4 GT",
  session_context: {
    lastBestProduct: ALTERNATIVE,
    lastProductMentioned: "Poco F4 GT",
  },
};

const safetyResult = applyFinalContractSafetyNet(swappedPayload, rdProtected, sessionBefore);

assert(
  "Safety net: illegal winner swap blocked",
  safetyResult.payload.session_context.lastBestProduct.product_name === "Galaxy S22"
);
assert(
  "Safety net: LPM restored to winner after blocked swap",
  safetyResult.payload.session_context.lastProductMentioned === "Galaxy S22"
);
assert(
  "Safety net: violation reason set",
  safetyResult.contractViolationReason === "blocked_winner_swap_by_contract"
);

// ─────────────────────────────────────────────────────────────
// enforceWinnerReferenceInvariant: idempotence
// ─────────────────────────────────────────────────────────────

section("enforceWinnerReferenceInvariant — idempotence");

const idempotentIn = { lastBestProduct: WINNER, lastProductMentioned: "Poco F4 GT" };
const once = enforceWinnerReferenceInvariant(idempotentIn);
const twice = enforceWinnerReferenceInvariant(once);
assert(
  "Applying invariant twice produces same result",
  once.lastProductMentioned === twice.lastProductMentioned
);

// ─────────────────────────────────────────────────────────────
// Results
// ─────────────────────────────────────────────────────────────

console.log(`\n── RESULT: ${passed} passed, ${failed} failed ──\n`);
if (failed > 0) process.exit(1);
