#!/usr/bin/env node
/**
 * PATCH 9.1 — Recommendation Decision Analytics audit.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { COMMERCIAL_PERMISSION } from "../lib/miaIntentAuthority.js";
import { MIA_INTERACTION_MODES } from "../lib/miaIntentRecognitionLayer.js";
import {
  buildRecommendationDecisionAnalyticsPayload,
  buildRecommendationDecisionRecommendationMetadata,
  initializeRecommendationDecisionAnalyticsTracking,
  observeRecommendationDecisionAnalytics,
  MIA_RECOMMENDATION_DECISION_ANALYTICS_EVENT,
  MIA_RECOMMENDATION_DECISION_ANALYTICS_VERSION,
  MIA_DECISION_SOURCES,
} from "../lib/miaRecommendationDecisionAnalytics.js";
import {
  activateRecommendationDecisionTracker,
  buildRecommendationDecisionDedupKey,
  createRecommendationDecisionTracker,
  finalizeRecommendationDecisionTracker,
} from "../lib/miaRecommendationDecisionTracker.js";
import {
  buildRecommendationDecisionMetadata,
  resolveWinnerAndRunnerUpRanks,
} from "../lib/miaRecommendationDecisionClassifier.js";
import {
  computeScoreGap,
  extractObservedScore,
  hashSafeFamilyKey,
  resolveSafeProductFamilyKey,
} from "../lib/miaRecommendationDecisionIdentity.js";
import { MIA_DECISION_RUNTIME_MODES } from "../lib/miaRecommendationDecisionCatalog.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CHAT_API = join(ROOT, "pages/api/chat-gpt4o.js");
const SQL_FILES = [
  "patch-91-query1-decision-volume.sql",
  "patch-91-query2-decision-source-routing.sql",
  "patch-91-query3-winner-provider-category.sql",
  "patch-91-query4-score-gap-constraints.sql",
  "patch-91-query5-decision-correlation.sql",
];

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${label}`);
  } else {
    failed += 1;
    console.error(`  ❌ ${label}`);
  }
}

const winnerProduct = {
  familyKey: "samsung-galaxy-a55",
  provider: "google_shopping",
  localFallbackScore: 92.5,
  category: "smartphone",
};
const runnerUpProduct = {
  familyKey: "motorola-edge-50",
  provider: "serpapi",
  localFallbackScore: 88.1,
};
const rankedProducts = [winnerProduct, runnerUpProduct];

console.log("\nPATCH 9.1 — Recommendation Decision Analytics audit\n");

console.log("Contract");
assert("event name", MIA_RECOMMENDATION_DECISION_ANALYTICS_EVENT === "mia_recommendation_decision");
assert("event version", MIA_RECOMMENDATION_DECISION_ANALYTICS_VERSION === "9.1.0");

console.log("\nWinner present");
const withWinner = buildRecommendationDecisionMetadata({
  selectedBestProduct: winnerProduct,
  displayProducts: rankedProducts.slice(0, 2),
  rankedProducts,
  routingDecision: { mode: "context_hold", allowRerank: true },
  decisionSource: MIA_DECISION_SOURCES.COGNITIVE_PRIMARY,
  responsePath: "return_seguro",
  winnerCategory: "smartphone",
});
assert("winner present", withWinner.winner_present === true);
assert("winner rank", withWinner.winner_rank === 1);
assert("family hash", withWinner.winner_product_family === hashSafeFamilyKey("samsung-galaxy-a55"));
assert("winner score", withWinner.winner_score === 92.5);

console.log("\nWinner absent");
const withoutWinner = buildRecommendationDecisionMetadata({
  selectedBestProduct: null,
  rankedProducts: [],
  displayProducts: [],
  decisionSource: MIA_DECISION_SOURCES.NO_RESULT,
  responsePath: "commercial_new_search_no_result",
});
assert("no winner", withoutWinner.winner_present === false);
assert("decision completed", withoutWinner.decision_completed === true);

console.log("\nRunner-up");
const ranks = resolveWinnerAndRunnerUpRanks(rankedProducts, winnerProduct);
assert("runner-up present", ranks.runnerUpPresent === true);
assert("runner-up rank", ranks.runnerUpRank === 2);
assert("runner-up in metadata", withWinner.runner_up_present === true);
assert("score gap", withWinner.score_gap === computeScoreGap(92.5, 88.1));

const singleRank = buildRecommendationDecisionMetadata({
  selectedBestProduct: winnerProduct,
  rankedProducts: [winnerProduct],
  displayProducts: [winnerProduct],
  decisionSource: MIA_DECISION_SOURCES.COGNITIVE_PRIMARY,
});
assert("runner-up absent single", singleRank.runner_up_present === false);
assert("runner-up score null", singleRank.runner_up_score === null);

console.log("\nScore absent");
const noScore = buildRecommendationDecisionMetadata({
  selectedBestProduct: { familyKey: "generic-item" },
  rankedProducts: [{ familyKey: "generic-item" }, { familyKey: "other-item" }],
  displayProducts: [{ familyKey: "generic-item" }],
  decisionSource: MIA_DECISION_SOURCES.COGNITIVE_PRIMARY,
});
assert("no observed score", extractObservedScore({}) === null);
assert("winner score null", noScore.winner_score === null);
assert("score gap null", noScore.score_gap === null);

console.log("\nLock and constraints");
const locked = buildRecommendationDecisionMetadata({
  selectedBestProduct: winnerProduct,
  rankedProducts,
  displayProducts: rankedProducts.slice(0, 2),
  specificProductLock: { active: true },
  commercialOfferReset: { shouldReset: true },
  routingDecision: { allowNewSearch: true, allowReplaceWinner: false },
  hadAnchor: true,
  budgetConstraintApplied: true,
  categoryConstraintApplied: true,
  decisionSource: MIA_DECISION_SOURCES.COGNITIVE_PRIMARY,
});
assert("specific lock", locked.specific_product_lock === true);
assert("reset applied", locked.reset_applied === true);
assert("budget constraint", locked.budget_constraint === true);
assert("anchor preserved", locked.anchor_preserved === true);

console.log("\nSanitize");
const sanitized = buildRecommendationDecisionMetadata({
  selectedBestProduct: winnerProduct,
  rankedProducts,
  winnerSanitizedAway: true,
  decisionSource: MIA_DECISION_SOURCES.COGNITIVE_PRIMARY,
});
assert("winner sanitized flag", sanitized.winner_sanitized === true);
assert("decision invalid after sanitize", sanitized.decision_valid === false);

console.log("\nRuntime modes");
const controlled = buildRecommendationDecisionMetadata({
  selectedBestProduct: winnerProduct,
  rankedProducts,
  runtimeMode: MIA_DECISION_RUNTIME_MODES.CONTROLLED,
  decisionSource: MIA_DECISION_SOURCES.COGNITIVE_PRIMARY,
});
const legacy = buildRecommendationDecisionMetadata({
  selectedBestProduct: winnerProduct,
  rankedProducts,
  runtimeMode: MIA_DECISION_RUNTIME_MODES.LEGACY,
  decisionSource: MIA_DECISION_SOURCES.LEGACY_LLM,
});
assert("controlled runtime", controlled.runtime_mode === "CONTROLLED");
assert("legacy runtime", legacy.runtime_mode === "LEGACY");
assert("legacy source", legacy.decision_source === "LEGACY_LLM");

console.log("\nLifecycle");
const tracker = createRecommendationDecisionTracker({ requestId: "req-91" });
activateRecommendationDecisionTracker(tracker);
const metadata = finalizeRecommendationDecisionTracker(tracker, {
  selectedBestProduct: winnerProduct,
  rankedProducts,
  displayProducts: rankedProducts.slice(0, 2),
  decisionSource: MIA_DECISION_SOURCES.COMMERCIAL_ONLY_FALLBACK,
  eventVersion: "9.1.0",
});
assert("finalized metadata", metadata?.decision_source === MIA_DECISION_SOURCES.COMMERCIAL_ONLY_FALLBACK);
assert("tracker summary", tracker.summary?.winner_present === true);

console.log("\nPayload");
const built = buildRecommendationDecisionAnalyticsPayload({
  requestId: "11111111-1111-4111-8111-111111111111",
  metadata,
});
assert("no query_text", built.payload.query_text == null);
assert("metadata version", built.payload.metadata?.event_version === "9.1.0");
assert("no product_name", !("product_name" in (built.payload.metadata || {})));
assert("no title", !("title" in (built.payload.metadata || {})));

console.log("\nDelivery metadata");
const deliveryMeta = buildRecommendationDecisionRecommendationMetadata({
  event_version: "9.1.0",
  decision_source: MIA_DECISION_SOURCES.COGNITIVE_PRIMARY,
  winner_present: true,
  runner_up_present: true,
  decision_valid: true,
  winner_rank: 1,
  score_gap: 4.4,
});
assert("inline version", deliveryMeta.recommendation_decision_event_version === "9.1.0");
assert("inline winner", deliveryMeta.recommendation_decision_winner_present === true);

console.log("\nDedup key");
assert(
  "dedup format",
  buildRecommendationDecisionDedupKey("r1", "mia_recommendation_decision", "9.1.0").includes("9.1.0")
);

console.log("\nHooks");
const chat = readFileSync(CHAT_API, "utf8");
assert("imports decision analytics", chat.includes("miaRecommendationDecisionAnalytics"));
assert("initialize hook", chat.includes("initializeRecommendationDecisionAnalyticsTracking"));
assert("observe helper", chat.includes("observeDecisionAnalyticsForStabilizedContext"));
assert("delivery hook", chat.includes("instrumentRecommendationDecisionAnalyticsForDelivery"));
assert("cognitive primary hook", chat.includes("MIA_DECISION_SOURCES.COGNITIVE_PRIMARY"));
assert("legacy hook", chat.includes("MIA_DECISION_SOURCES.LEGACY_LLM"));
assert("no result hook", chat.includes("MIA_DECISION_SOURCES.NO_RESULT"));
assert("inline response field", chat.includes("recommendation_decision_analytics"));

console.log("\nSQL files");
for (const file of SQL_FILES) {
  const path = join(ROOT, "docs/analytics/sql", file);
  assert(`exists ${file}`, existsSync(path));
  assert(`uses event ${file}`, readFileSync(path, "utf8").includes("mia_recommendation_decision"));
}

console.log("\nDomain gate");
initializeRecommendationDecisionAnalyticsTracking({
  commercialPermission: COMMERCIAL_PERMISSION.DENY,
  interactionMode: MIA_INTERACTION_MODES.SOCIAL,
});
const denied = observeRecommendationDecisionAnalytics(null, {
  selectedBestProduct: winnerProduct,
  rankedProducts,
});
assert("deny does not observe inactive bucket", denied == null);

console.log(`\nResultado: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
