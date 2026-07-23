#!/usr/bin/env node
/**
 * PATCH 10.4 — Anti-Regret Foundation Analytics audit
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MIA_ANTI_REGRET_FOUNDATION_ANALYTICS_EVENT,
  MIA_ANTI_REGRET_FOUNDATION_ANALYTICS_VERSION,
  buildAntiRegretFoundationAnalyticsPayload,
  buildAntiRegretFoundationDedupKey,
  instrumentAntiRegretFoundationFromOfferSet,
  MIA_ANTI_REGRET_CONFIDENCE,
  MIA_ANTI_REGRET_OBSERVED_PATTERN,
  MIA_ANTI_REGRET_SIGNAL_POLARITY,
  MIA_ANTI_REGRET_SIGNAL_SOURCE,
} from "../lib/miaAntiRegretFoundationAnalytics.js";
import {
  buildAntiRegretFoundationMetadata,
  collectObservationalSignals,
  computeAntiRegretScoreFromSignals,
  detectObjectiveConflicts,
  mapPostDecisionSignals,
  resolveAntiRegretConfidence,
  resolveObservedPattern,
} from "../lib/miaAntiRegretFoundationClassifier.js";
import { MIA_SCORE_GAP_BUCKETS } from "../lib/miaRecommendationAlternativeCatalog.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OFFER_SET = join(ROOT, "lib/miaOfferSetAnalytics.js");
const ACCEPTANCE = join(ROOT, "lib/miaRecommendationAcceptanceAnalytics.js");
const REJECTION = join(ROOT, "lib/miaRecommendationRejectionAnalytics.js");

const SQL_FILES = [
  "patch-104-query1-score-distribution.sql",
  "patch-104-query2-score-avg-by-category.sql",
  "patch-104-query3-score-avg-by-search-path.sql",
  "patch-104-query4-acceptance-score-relation.sql",
  "patch-104-query5-rejection-score-relation.sql",
  "patch-104-query6-alert-score-relation.sql",
  "patch-104-query7-favorite-score-relation.sql",
  "patch-104-query8-observed-patterns.sql",
  "patch-104-query9-conflict-frequency.sql",
  "patch-104-query10-confidence-distribution.sql",
  "patch-104-query11-score-by-signal-count.sql",
  "patch-104-query12-score-temporal-evolution.sql",
  "patch-104-query13-price-quality-correlation.sql",
  "patch-104-query14-savings-type-correlation.sql",
  "patch-104-query15-provider-distribution.sql",
];

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${label}`);
  } else {
    failed += 1;
    console.log(`  ❌ ${label}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

const offerSetStrong = {
  winner_present: true,
  winner_is_lowest_price: true,
  winner_price: 1999,
  minimum_price: 1999,
  price_sample_count: 4,
  provider_count: 3,
  price_currency: "BRL",
  offers_with_incomplete_data_count: 0,
  removed_invalid_count: 0,
  offers_with_complete_data_count: 4,
  delivered_offers_count: 3,
  search_path: "COMMERCIAL_PIPELINE",
  winner_provider_id: "amazon",
};

const decisionStrong = {
  runner_up_present: true,
  score_gap_bucket: MIA_SCORE_GAP_BUCKETS.WIDE,
  runner_up_competitiveness: "DISTANT",
  anchor_preserved: true,
  candidate_count: 4,
  display_count: 3,
};

const offerSetWeak = {
  winner_present: true,
  winner_is_lowest_price: false,
  winner_price: 2200,
  minimum_price: 1999,
  winner_vs_minimum_delta_percent: 10,
  price_sample_count: 2,
  provider_count: 1,
  price_currency: "BRL",
  delivered_offers_count: 2,
  search_path: "COMMERCIAL_PIPELINE",
};

const decisionWeak = {
  runner_up_present: true,
  score_gap_bucket: MIA_SCORE_GAP_BUCKETS.VERY_CLOSE,
  new_search: true,
  reset_applied: true,
  budget_constraint: true,
  category_constraint: true,
};

section("Contract");
assert("event name", MIA_ANTI_REGRET_FOUNDATION_ANALYTICS_EVENT === "mia_anti_regret_foundation");
assert("event version", MIA_ANTI_REGRET_FOUNDATION_ANALYTICS_VERSION === "10.4.0");

section("Taxonomies");
assert("signal polarity POSITIVE", MIA_ANTI_REGRET_SIGNAL_POLARITY.POSITIVE_SIGNAL === "POSITIVE_SIGNAL");
assert("signal source ACCEPTANCE", MIA_ANTI_REGRET_SIGNAL_SOURCE.ACCEPTANCE_SIGNAL === "ACCEPTANCE_SIGNAL");
assert("confidence HIGH", MIA_ANTI_REGRET_CONFIDENCE.HIGH === "HIGH");
assert("pattern DIRECT_ACCEPTANCE", MIA_ANTI_REGRET_OBSERVED_PATTERN.DIRECT_ACCEPTANCE === "DIRECT_ACCEPTANCE");

section("Score formula");
const strongSignals = collectObservationalSignals(decisionStrong, offerSetStrong, {
  price_quality: "HIGH",
  price_confidence: "HIGH",
}, { savings_type: "OBSERVED", savings_amount: 120 });
const strongScore = computeAntiRegretScoreFromSignals(strongSignals);
assert("strong score above neutral", strongScore > 50);
assert("strong score clamped max", strongScore <= 100);

const weakSignals = collectObservationalSignals(decisionWeak, offerSetWeak, {
  price_quality: "LOW",
  price_confidence: "LOW",
}, { savings_type: "UNVERIFIED" });
const weakScore = computeAntiRegretScoreFromSignals(weakSignals);
assert("weak score below neutral", weakScore < 50);
assert("weak score clamped min", weakScore >= 0);

section("Scenarios — immediate acceptance");
const immediate = buildAntiRegretFoundationMetadata({
  requestId: "11111111-1111-4111-8111-111111111111",
  offerSetMetadata: { ...offerSetStrong, delivered_offers_count: 1 },
  decisionMetadata: { ...decisionStrong, runner_up_present: false, display_count: 1 },
  acceptanceSignals: [{ signal_type: "WINNER_FOLLOW_UP", signal_strength: "STRONG", signal_target: "WINNER" }],
});
assert("immediate acceptance pattern", immediate.observed_pattern === MIA_ANTI_REGRET_OBSERVED_PATTERN.DIRECT_ACCEPTANCE);
assert("immediate acceptance score", immediate.anti_regret_score >= 50);

section("Scenarios — comparison before acceptance");
const comparison = buildAntiRegretFoundationMetadata({
  requestId: "22222222-2222-4222-8222-222222222222",
  offerSetMetadata: { ...offerSetStrong, delivered_offers_count: 3 },
  decisionMetadata: { ...decisionStrong, runner_up_present: true, display_count: 3 },
  acceptanceSignals: [{ signal_type: "COMPARISON_REQUESTED", signal_strength: "MEDIUM" }],
});
assert(
  "comparison pattern",
  comparison.observed_pattern === MIA_ANTI_REGRET_OBSERVED_PATTERN.COMPARISON_BEFORE_ACCEPTANCE
);

section("Scenarios — multiple rejections");
const multiReject = buildAntiRegretFoundationMetadata({
  requestId: "33333333-3333-4333-8333-333333333333",
  offerSetMetadata: offerSetWeak,
  decisionMetadata: decisionWeak,
  rejectionSignals: [{ signal_type: "EXPLICIT_REJECTION" }, { signal_type: "ALTERNATIVE_REQUESTED" }],
});
assert("multiple rejections pattern", multiReject.observed_pattern === MIA_ANTI_REGRET_OBSERVED_PATTERN.MULTIPLE_REJECTIONS);
assert("multiple rejections lowers score", multiReject.anti_regret_score < 50);

section("Scenarios — budget change / constraints");
const constraints = buildAntiRegretFoundationMetadata({
  requestId: "44444444-4444-4444-8444-444444444444",
  offerSetMetadata: offerSetWeak,
  decisionMetadata: {
    budget_constraint: true,
    category_constraint: true,
    brand_constraint: true,
  },
});
assert(
  "multiple constraint changes",
  constraints.observed_pattern === MIA_ANTI_REGRET_OBSERVED_PATTERN.MULTIPLE_CONSTRAINT_CHANGES
);

section("Scenarios — alert / price waiting");
const alertWait = buildAntiRegretFoundationMetadata({
  requestId: "55555555-5555-4555-8555-555555555555",
  offerSetMetadata: offerSetStrong,
  decisionMetadata: decisionStrong,
  alertStage: "ACTIVE",
});
assert("price waiting pattern", alertWait.observed_pattern === MIA_ANTI_REGRET_OBSERVED_PATTERN.PRICE_WAITING);
assert("alert stage recorded", alertWait.alert_stage === "ACTIVE");

section("Scenarios — favorite / offer click");
const favSignals = mapPostDecisionSignals({
  acceptanceSignals: [
    { signal_type: "PRODUCT_FAVORITED", signal_strength: "STRONG", source_event_name: "favorite_created" },
    { signal_type: "WINNER_OFFER_CLICKED", signal_strength: "WEAK", source_event_name: "offer_click" },
  ],
});
assert("favorite mapped", favSignals.some((s) => s.source === MIA_ANTI_REGRET_SIGNAL_SOURCE.FAVORITE));
assert("offer click mapped", favSignals.some((s) => s.source === MIA_ANTI_REGRET_SIGNAL_SOURCE.OFFER_CLICK));

section("Scenarios — runner-up");
const runnerUp = buildAntiRegretFoundationMetadata({
  requestId: "66666666-6666-4666-8666-666666666666",
  offerSetMetadata: offerSetStrong,
  decisionMetadata: decisionStrong,
  acceptanceSignals: [{ signal_target: "RUNNER_UP", signal_strength: "MEDIUM" }],
});
assert("runner up conflict possible", typeof runnerUp.conflict_detected === "boolean");

section("Scenarios — no signals");
const empty = buildAntiRegretFoundationMetadata({
  requestId: "77777777-7777-4777-8777-777777777777",
  offerSetMetadata: { winner_present: false, price_sample_count: 0 },
  decisionMetadata: {},
});
assert("no signals low confidence", empty.anti_regret_confidence === MIA_ANTI_REGRET_CONFIDENCE.UNKNOWN);

section("Scenarios — conflicting signals");
const conflictMeta = buildAntiRegretFoundationMetadata({
  requestId: "88888888-8888-4888-8888-888888888888",
  offerSetMetadata: offerSetStrong,
  decisionMetadata: { ...decisionStrong, new_search: true, anchor_preserved: true },
  acceptanceSignals: [{ signal_type: "WINNER_FOLLOW_UP" }],
  rejectionSignals: [{ signal_type: "EXPLICIT_REJECTION" }],
});
assert("conflict detected", conflictMeta.conflict_detected === true);

section("Scenarios — long vs short conversation");
const longExplore = resolveObservedPattern(
  { conversation_turn_count: 8, candidate_count: 6 },
  collectObservationalSignals({ conversation_turn_count: 8, candidate_count: 6 }, offerSetStrong, {}, {}),
  {}
);
assert("long exploration", longExplore === MIA_ANTI_REGRET_OBSERVED_PATTERN.LONG_EXPLORATION);

section("Confidence");
const highConf = resolveAntiRegretConfidence(strongSignals, { conflictCount: 0, conversationTurnCount: 5 });
assert("high confidence possible", ["HIGH", "MEDIUM"].includes(highConf));

section("Conflicts objective only");
const conflicts = detectObjectiveConflicts(
  { new_search: true, anchor_preserved: true },
  strongSignals,
  { acceptanceCount: 1, rejectionCount: 1 }
);
assert("conflict types factual", conflicts.conflict_types.includes("acceptance_and_rejection_same_decision"));

section("Payload privacy");
const payload = buildAntiRegretFoundationAnalyticsPayload({
  requestId: "99999999-9999-4999-8999-999999999999",
  offerSetMetadata: offerSetStrong,
  decisionMetadata: decisionStrong,
});
const blob = JSON.stringify(payload.payload.metadata || {});
assert("no query_text", payload.payload.query_text == null);
assert("no product_name", !blob.includes("product_name"));
assert("no url", !/https:\/\//.test(blob));
assert("no email", !/@/.test(blob));
assert("regret_confirmed false", payload.payload.metadata.regret_confirmed === false);
assert("purchase_confirmed false", payload.payload.metadata.purchase_confirmed === false);
assert("satisfaction_assumed false", payload.payload.metadata.satisfaction_assumed === false);

section("Dedup key");
const dedup = buildAntiRegretFoundationDedupKey(
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  MIA_ANTI_REGRET_FOUNDATION_ANALYTICS_EVENT,
  MIA_ANTI_REGRET_FOUNDATION_ANALYTICS_VERSION
);
assert("dedup format", dedup.includes("mia_anti_regret_foundation"));

section("Hooks");
assert("offer set imports anti-regret", readFileSync(OFFER_SET, "utf8").includes("instrumentAntiRegretFoundationFromOfferSet"));
assert("acceptance imports anti-regret", readFileSync(ACCEPTANCE, "utf8").includes("scheduleAntiRegretFoundationFromPostDecisionSignal"));
assert("rejection imports anti-regret", readFileSync(REJECTION, "utf8").includes("scheduleAntiRegretFoundationFromPostDecisionSignal"));

section("Instrument helper (no supabase)");
const mockSupabase = { from: () => ({ insert: async () => ({ error: null }) }) };
const summary = instrumentAntiRegretFoundationFromOfferSet(mockSupabase, {
  requestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  offerSetMetadata: offerSetStrong,
  decisionMetadata: decisionStrong,
});
assert("instrument returns summary", summary?.anti_regret_score != null);

section("SQL files");
for (const file of SQL_FILES) {
  const path = join(ROOT, "docs/analytics/sql", file);
  assert(`${file} exists`, existsSync(path));
  const sql = readFileSync(path, "utf8");
  assert(`${file} uses event`, sql.includes("mia_anti_regret_foundation"));
}

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
