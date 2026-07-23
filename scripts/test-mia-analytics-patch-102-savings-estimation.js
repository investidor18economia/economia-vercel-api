#!/usr/bin/env node
/**
 * PATCH 10.2 — Savings Estimation Analytics audit
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MIA_SAVINGS_ESTIMATION_ANALYTICS_EVENT,
  MIA_SAVINGS_ESTIMATION_ANALYTICS_VERSION,
  buildSavingsEstimationAnalyticsPayloads,
  buildSavingsEstimationDedupKey,
  instrumentSavingsEstimationAnalyticsFromOfferSet,
  MIA_SAVINGS_TYPE,
  MIA_SAVINGS_CONFIDENCE,
  MIA_SAVINGS_NATURE,
  MIA_SAVINGS_BASELINE_TYPE,
  MIA_SAVINGS_CALCULATION_METHOD,
  MIA_SAVINGS_COMPARISON_DIRECTION,
  MIA_SAVINGS_ELIGIBILITY_REASON,
} from "../lib/miaSavingsEstimationAnalytics.js";
import {
  buildWinnerVsMinimumEstimation,
  buildUiAssumptionEstimation,
  buildSavingsEstimationsFromOfferSetMetadata,
  resolveComparisonDirection,
  resolveSavingsConfidenceFromEvidence,
} from "../lib/miaSavingsEstimationClassifier.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OFFER_ANALYTICS = join(ROOT, "lib/miaOfferSetAnalytics.js");

const SQL_FILES = [
  "patch-102-query1-savings-type-distribution.sql",
  "patch-102-query2-savings-nature-distribution.sql",
  "patch-102-query3-savings-confidence-distribution.sql",
  "patch-102-query4-potential-savings-avg-median.sql",
  "patch-102-query5-total-potential-savings.sql",
  "patch-102-query6-savings-by-calculation-method.sql",
  "patch-102-query7-savings-by-baseline.sql",
  "patch-102-query8-savings-by-price-quality.sql",
  "patch-102-query9-savings-by-search-path-provider.sql",
  "patch-102-query10-ineligible-frequency.sql",
  "patch-102-query11-ineligibility-reasons.sql",
  "patch-102-query12-winner-vs-minimum.sql",
  "patch-102-query13-verifiable-vs-unverified.sql",
  "patch-102-query14-ui-unverified-frequency.sql",
  "patch-102-query15-confidence-by-sample-count.sql",
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

const sampleOfferSet = {
  price_sample_count: 4,
  provider_count: 2,
  minimum_price: 100,
  maximum_price: 150,
  average_price: 125,
  median_price: 122.5,
  winner_price: 102,
  winner_is_lowest_price: false,
  winner_vs_minimum_delta: 2,
  winner_vs_minimum_delta_percent: 2,
  winner_present: true,
  winner_provider_id: "google_shopping",
  offers_with_incomplete_data_count: 0,
  removed_invalid_count: 0,
  price_currency: "BRL",
  search_path: "HYBRID",
};

const priceIntel = {
  price_quality: "HIGH",
  price_confidence: "HIGH",
  shipping_coverage: "PARTIAL",
};

console.log("\nPATCH 10.2 — Savings Estimation Analytics audit\n");

console.log("Contract");
assert("event name", MIA_SAVINGS_ESTIMATION_ANALYTICS_EVENT === "mia_savings_estimation");
assert("event version", MIA_SAVINGS_ESTIMATION_ANALYTICS_VERSION === "10.2.0");

console.log("\nComparison direction");
assert("equal", resolveComparisonDirection(100, 100) === MIA_SAVINGS_COMPARISON_DIRECTION.EQUAL);
assert("comparison higher", resolveComparisonDirection(100, 110) === MIA_SAVINGS_COMPARISON_DIRECTION.COMPARISON_HIGHER);
assert("reference higher", resolveComparisonDirection(110, 100) === MIA_SAVINGS_COMPARISON_DIRECTION.REFERENCE_HIGHER);

console.log("\nWinner vs minimum");
const winnerAboveMin = buildWinnerVsMinimumEstimation(sampleOfferSet, priceIntel, { requestId: "req-1" });
assert("observed type", winnerAboveMin.savings_type === MIA_SAVINGS_TYPE.OBSERVED);
assert("offer difference nature", winnerAboveMin.savings_nature === MIA_SAVINGS_NATURE.OFFER_DIFFERENCE);
assert("no positive savings when winner higher", winnerAboveMin.savings_amount == null);
assert("comparison higher", winnerAboveMin.comparison_direction === MIA_SAVINGS_COMPARISON_DIRECTION.COMPARISON_HIGHER);
assert("purchase not confirmed", winnerAboveMin.purchase_confirmed === false);
assert("not verified type", winnerAboveMin.savings_type !== MIA_SAVINGS_TYPE.VERIFIED);

const winnerLowest = buildWinnerVsMinimumEstimation(
  { ...sampleOfferSet, winner_price: 100, winner_is_lowest_price: true, winner_vs_minimum_delta: 0, winner_vs_minimum_delta_percent: 0 },
  priceIntel,
  { requestId: "req-2" }
);
assert("no savings signal when lowest", winnerLowest.savings_nature === MIA_SAVINGS_NATURE.NO_SAVINGS_SIGNAL);
assert("zero savings amount", winnerLowest.savings_amount === 0);

console.log("\nUI assumption");
const uiEst = buildUiAssumptionEstimation(sampleOfferSet, { requestId: "req-ui" });
assert("unverified type", uiEst.savings_type === MIA_SAVINGS_TYPE.UNVERIFIED);
assert("estimated nature", uiEst.savings_nature === MIA_SAVINGS_NATURE.ESTIMATED_SAVINGS);
assert("ui baseline", uiEst.baseline_type === MIA_SAVINGS_BASELINE_TYPE.ESTIMATED_UI_ASSUMPTION);
assert("percentage assumption method", uiEst.calculation_method === MIA_SAVINGS_CALCULATION_METHOD.PERCENTAGE_ASSUMPTION);
assert("low confidence", uiEst.savings_confidence === MIA_SAVINGS_CONFIDENCE.LOW);
assert("amount in range", uiEst.savings_amount >= 15 && uiEst.savings_amount <= 300);
assert("percent 4-6", uiEst.savings_percent >= 4 && uiEst.savings_percent <= 6);

console.log("\nConfidence evidence");
assert("high confidence sample", resolveSavingsConfidenceFromEvidence(sampleOfferSet, priceIntel) === MIA_SAVINGS_CONFIDENCE.HIGH);
assert("unknown no sample", resolveSavingsConfidenceFromEvidence({ price_sample_count: 0 }, {}) === MIA_SAVINGS_CONFIDENCE.UNKNOWN);

console.log("\nEligibility edge cases");
const singleOffer = buildWinnerVsMinimumEstimation(
  { ...sampleOfferSet, price_sample_count: 1, minimum_price: 200, winner_price: 200, winner_is_lowest_price: true },
  { price_quality: "MEDIUM", price_confidence: "MEDIUM" },
  { requestId: "req-single" }
);
assert("single offer eligible", singleOffer.savings_estimation_eligible === true);

const invalidPrice = buildWinnerVsMinimumEstimation(
  { price_sample_count: 0, winner_present: false, price_currency: "BRL" },
  {},
  { requestId: "req-invalid" }
);
assert("invalid not in list", buildSavingsEstimationsFromOfferSetMetadata({ price_sample_count: 0, winner_present: false }).length === 0);

console.log("\nPayload privacy");
const payloads = buildSavingsEstimationAnalyticsPayloads({
  requestId: "req-uuid-test",
  offerSetMetadata: sampleOfferSet,
  analyticsContext: { session_id: "00000000-0000-4000-8000-000000000001" },
});
assert("two estimations", payloads.length === 2);
const blob = JSON.stringify(payloads.map((p) => p.payload.metadata));
assert("no query_text", payloads.every((p) => !p.payload.query_text));
assert("no product_name", !/product_name/.test(blob));
assert("no url", !/https:\/\//.test(blob));
assert("category", payloads[0].payload.category === "savings_estimation");
assert("no verified emitted", !blob.includes('"VERIFIED"'));
assert("no confirmed savings", !blob.includes('CONFIRMED_SAVINGS'));

console.log("\nDedup key");
assert(
  "dedup format",
  buildSavingsEstimationDedupKey("r1", "mia_savings_estimation", "10.2.0", "WINNER_VS_MINIMUM", "MINIMUM_OFFER").includes("WINNER_VS_MINIMUM")
);

console.log("\nHooks");
const offerAnalytics = readFileSync(OFFER_ANALYTICS, "utf8");
assert("offer set imports savings", offerAnalytics.includes("instrumentSavingsEstimationAnalyticsFromOfferSet"));
assert("offer set hooks savings emit", offerAnalytics.includes("instrumentSavingsEstimationAnalyticsFromOfferSet(supabase"));

console.log("\nObserve helper");
const summaries = instrumentSavingsEstimationAnalyticsFromOfferSet(null, {
  requestId: "req-observe-1",
  offerSetMetadata: sampleOfferSet,
});
assert("observe returns summaries", Array.isArray(summaries) && summaries.length === 2);
assert("includes winner vs min", summaries.some((s) => s.calculation_method === MIA_SAVINGS_CALCULATION_METHOD.WINNER_VS_MINIMUM));
assert("includes ui assumption", summaries.some((s) => s.calculation_method === MIA_SAVINGS_CALCULATION_METHOD.PERCENTAGE_ASSUMPTION));

console.log("\nSQL files");
for (const file of SQL_FILES) {
  const path = join(ROOT, "docs/analytics/sql", file);
  assert(`${file} exists`, existsSync(path));
  const sql = readFileSync(path, "utf8");
  assert(`${file} uses event`, sql.includes("mia_savings_estimation"));
}

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
