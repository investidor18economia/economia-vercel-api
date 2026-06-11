/**
 * Unit tests — buildRoutingDecision (PATCH 2)
 * Usage: node scripts/test-routing-decision-contract.js
 */
import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";

function assert(label, condition) {
  if (!condition) {
    console.error("FAIL:", label);
    process.exit(1);
  }
  console.log("OK:", label);
}

const anchor = { product_name: "Apple iPhone 13", price: null };

assert(
  "context_decision — vale a pena?",
  buildRoutingDecision({
    userMessage: "vale a pena?",
    resolvedQuery: "celular até 2.000 vale a pena?",
    contextResolution: { mode: "context_answer", shouldSkipProductSearch: true },
    sessionContext: { lastBestProduct: anchor },
    signals: {
      isContextDecisionOnOriginal: true,
      hasClearNewCommercialSearch: false,
      looksLikeAmbiguousFollowUp: true
    }
  }).mode === "context_decision"
);

assert(
  "anchored_reaction — short ambiguous",
  buildRoutingDecision({
    userMessage: "loucura",
    resolvedQuery: "celular até 2.000 loucura",
    contextResolution: { mode: "direct" },
    sessionContext: { lastBestProduct: anchor },
    signals: {
      looksLikeAmbiguousFollowUp: true,
      hasClearNewCommercialSearch: false,
      looksLikeShortPriorityFollowUp: false
    }
  }).mode === "anchored_reaction"
);

const newSearch = buildRoutingDecision({
  userMessage: "me mostra outro",
  resolvedQuery: "me mostra outro",
  contextResolution: { mode: "direct" },
  sessionContext: { lastBestProduct: anchor },
  signals: { hasClearNewCommercialSearch: true }
});
assert("new_search — me mostra outro", newSearch.mode === "new_search");
assert("new_search allowReplaceWinner", newSearch.allowReplaceWinner === true);

const refinement = buildRoutingDecision({
  userMessage: "quero mais bateria",
  resolvedQuery: "quero mais bateria",
  contextResolution: { mode: "refinement" },
  sessionContext: { lastBestProduct: anchor, lastCategory: "phone" },
  signals: {
    looksLikeShortPriorityFollowUp: true,
    hasClearNewCommercialSearch: false,
    isContextDecisionOnOriginal: false
  }
});
assert("refinement — quero mais bateria", refinement.mode === "refinement");
assert("refinement allowRerank", refinement.allowRerank === true);

const comparison = buildRoutingDecision({
  userMessage: "e a bateria?",
  resolvedQuery: "e a bateria?",
  contextResolution: { mode: "comparison_context_lock" },
  sessionContext: {
    lastBestProduct: anchor,
    lastComparisonProducts: [{ product_name: "A" }, { product_name: "B" }]
  },
  signals: {
    hasComparisonProducts: true,
    looksLikeShortPriorityFollowUp: true,
    hasClearNewCommercialSearch: false,
    isComparisonContextFollowUp: true
  }
});
assert("comparison_followup", comparison.mode === "comparison_followup");
assert("comparison preserve anchor", comparison.shouldPreserveAnchor === true);

console.log("\nAll routing contract unit tests passed.");
