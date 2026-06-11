/**
 * PATCH 3 — unit tests for routing guardrails
 * Usage: node scripts/test-mia-routing-guardrails.js
 */
import {
  checkContractViolation,
  shouldBlockCsoVerbalizer,
  applyContractToSessionContext,
  applyFinalContractSafetyNet,
  pickWinnerUnderContract
} from "../lib/miaRoutingGuardrails.js";
import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";

function assert(label, condition) {
  if (!condition) {
    console.error("FAIL:", label);
    process.exit(1);
  }
  console.log("OK:", label);
}

const anchor = { product_name: "Apple iPhone 13", price: 100 };
const rdContext = buildRoutingDecision({
  userMessage: "vale a pena?",
  resolvedQuery: "celular vale a pena?",
  contextResolution: { shouldSkipProductSearch: true },
  sessionContext: { lastBestProduct: anchor },
  signals: { isContextDecisionOnOriginal: true }
});

const v6 = checkContractViolation("commercial_only_fallback", rdContext);
assert("scenario 6 — contract violation", v6.violation === true);
assert("scenario 6 — reason present", !!v6.reason);

assert(
  "CSO blocked for anchored_reaction",
  shouldBlockCsoVerbalizer(
    buildRoutingDecision({
      userMessage: "loucura",
      resolvedQuery: "loucura",
      sessionContext: { lastBestProduct: anchor },
      signals: {
        looksLikeAmbiguousFollowUp: true,
        hasClearNewCommercialSearch: false
      }
    })
  ) === true
);

const sessionOut = applyContractToSessionContext(
  { lastBestProduct: anchor, lastProducts: [anchor] },
  rdContext,
  {
    proposedBestProduct: { product_name: "Samsung Galaxy A35", price: 50 },
    proposedProducts: [{ product_name: "Samsung Galaxy A35" }]
  }
);
assert(
  "anchor preserved in session",
  /iphone\s*13/i.test(sessionOut.lastBestProduct?.product_name || "")
);

const winner = pickWinnerUnderContract(
  [
    { product_name: "Samsung Galaxy A35" },
    { product_name: "Apple iPhone 13" }
  ],
  anchor,
  rdContext
);
assert("winner stays anchor", /iphone\s*13/i.test(winner?.product_name || ""));

const safety = applyFinalContractSafetyNet(
  {
    session_context: {
      lastBestProduct: { product_name: "Samsung Galaxy A35", price: 1 }
    }
  },
  rdContext,
  { lastBestProduct: anchor }
);
assert("safety net blocks swap", safety.contractViolationReason === "blocked_winner_swap_by_contract");
assert(
  "safety net restores anchor",
  /iphone\s*13/i.test(safety.payload.session_context?.lastBestProduct?.product_name || "")
);
assert("safety net winnerChangeReason", safety.winnerChangeReason === "blocked_by_contract");

console.log("\nAll PATCH 3/4 guardrail unit tests passed.");
