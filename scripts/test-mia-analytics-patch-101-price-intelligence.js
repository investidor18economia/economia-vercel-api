#!/usr/bin/env node
/**
 * PATCH 10.1 — Price Intelligence Analytics audit
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { COMMERCIAL_PERMISSION } from "../lib/miaIntentAuthority.js";
import { MIA_INTERACTION_MODES } from "../lib/miaIntentRecognitionLayer.js";
import {
  MIA_PRICE_INTELLIGENCE_ANALYTICS_EVENT,
  MIA_PRICE_INTELLIGENCE_ANALYTICS_VERSION,
  buildPriceIntelligenceAnalyticsPayload,
  buildPriceIntelligenceDedupKey,
  isPriceIntelligenceDomainAllowed,
  instrumentPriceIntelligenceAnalyticsFromOfferSet,
  MIA_PRICE_QUALITY,
  MIA_PRICE_CONFIDENCE,
  MIA_WINNER_PRICE_POSITION,
  MIA_SHIPPING_COVERAGE,
} from "../lib/miaPriceIntelligenceAnalytics.js";
import {
  buildPriceIntelligenceFromOfferSetMetadata,
  resolveWinnerPricePosition,
  resolvePriceQuality,
  resolvePriceConfidence,
  resolveShippingCoverage,
} from "../lib/miaPriceIntelligenceClassifier.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OFFER_ANALYTICS = join(ROOT, "lib/miaOfferSetAnalytics.js");
const CHAT_API = join(ROOT, "pages/api/chat-gpt4o.js");

const SQL_FILES = [
  "patch-101-query1-price-quality-distribution.sql",
  "patch-101-query2-provider-coverage.sql",
  "patch-101-query3-price-dispersion.sql",
  "patch-101-query4-winner-price-position.sql",
  "patch-101-query5-provider-reliability.sql",
  "patch-101-query6-promotional-frequency.sql",
  "patch-101-query7-invalid-price-frequency.sql",
  "patch-101-query8-confidence-distribution.sql",
  "patch-101-query9-quality-by-search-path.sql",
  "patch-101-query10-quality-correlation.sql",
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
  merchant_count: 2,
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
  offers_with_complete_data_count: 4,
  offers_with_incomplete_data_count: 0,
  offers_with_previous_price_count: 1,
  offers_with_shipping_count: 2,
  removed_invalid_count: 0,
  removed_duplicate_count: 0,
  price_currency: "BRL",
  single_provider_dependency: false,
  search_path: "HYBRID",
  runtime_mode: "CONTROLLED",
  delivered_offers_count: 2,
};

console.log("\nPATCH 10.1 — Price Intelligence Analytics audit\n");

console.log("Contract");
assert("event name", MIA_PRICE_INTELLIGENCE_ANALYTICS_EVENT === "mia_price_intelligence");
assert("event version", MIA_PRICE_INTELLIGENCE_ANALYTICS_VERSION === "10.1.0");

console.log("\nWinner price position");
assert("lowest", resolveWinnerPricePosition({ winner_is_lowest_price: true, winner_price: 100, minimum_price: 100 }) === MIA_WINNER_PRICE_POSITION.LOWEST_PRICE);
assert("near lowest", resolveWinnerPricePosition({ winner_is_lowest_price: false, winner_vs_minimum_delta_percent: 3, winner_price: 103, minimum_price: 100 }) === MIA_WINNER_PRICE_POSITION.NEAR_LOWEST);
assert("middle", resolveWinnerPricePosition({ winner_vs_minimum_delta_percent: 15, winner_price: 115, minimum_price: 100 }) === MIA_WINNER_PRICE_POSITION.MIDDLE);
assert("high", resolveWinnerPricePosition({ winner_vs_minimum_delta_percent: 25, winner_price: 125, minimum_price: 100 }) === MIA_WINNER_PRICE_POSITION.HIGH);
assert("unknown", resolveWinnerPricePosition({}) === MIA_WINNER_PRICE_POSITION.UNKNOWN);

console.log("\nPrice quality");
assert("high quality", resolvePriceQuality(sampleOfferSet) === MIA_PRICE_QUALITY.HIGH);
assert("low invalid", resolvePriceQuality({ removed_invalid_count: 2, price_sample_count: 1, winner_present: true }) === MIA_PRICE_QUALITY.LOW);
assert("unknown empty", resolvePriceQuality({ price_sample_count: 0, winner_present: false }) === MIA_PRICE_QUALITY.UNKNOWN);

console.log("\nConfidence");
assert("high confidence", resolvePriceConfidence(sampleOfferSet) === MIA_PRICE_CONFIDENCE.HIGH);
assert("unknown no sample", resolvePriceConfidence({ price_sample_count: 0 }) === MIA_PRICE_CONFIDENCE.UNKNOWN);

console.log("\nShipping");
assert("partial", resolveShippingCoverage({ price_sample_count: 4, offers_with_shipping_count: 2 }) === MIA_SHIPPING_COVERAGE.PARTIAL);
assert("known", resolveShippingCoverage({ price_sample_count: 2, offers_with_shipping_count: 2 }) === MIA_SHIPPING_COVERAGE.KNOWN);

console.log("\nDerived metadata");
const intel = buildPriceIntelligenceFromOfferSetMetadata(sampleOfferSet, { requestId: "req-1" });
assert("price_range", intel.price_range === 50);
assert("promotional observed", intel.promotional_price_observed === true);
assert("decision_request_id", intel.decision_request_id === "req-1");
assert("no product_name", !("product_name" in intel));
assert("intelligence_valid", intel.intelligence_valid === true);
assert("source offer_set", intel.source === "offer_set_derived");

console.log("\nPayload privacy");
const built = buildPriceIntelligenceAnalyticsPayload({
  requestId: "req-uuid-test",
  offerSetMetadata: sampleOfferSet,
  analyticsContext: { session_id: "00000000-0000-4000-8000-000000000001" },
});
const blob = JSON.stringify(built.payload.metadata || {});
assert("metadata version", built.payload.metadata?.event_version === "10.1.0");
assert("no query_text", !built.payload.query_text);
assert("no product_name in metadata", !/product_name/.test(blob));
assert("no url in metadata", !/https:\/\//.test(blob));
assert("category", built.payload.category === "price_intelligence");

console.log("\nDedup key");
assert("dedup format", buildPriceIntelligenceDedupKey("r1", "mia_price_intelligence", "10.1.0").includes("r1"));

console.log("\nDomain gate");
assert("commercial allowed", isPriceIntelligenceDomainAllowed({ commercialPermission: COMMERCIAL_PERMISSION.ALLOW, interactionMode: MIA_INTERACTION_MODES.COMMERCE }));
assert("social denied", !isPriceIntelligenceDomainAllowed({ commercialPermission: COMMERCIAL_PERMISSION.DENY, interactionMode: MIA_INTERACTION_MODES.SOCIAL }));

console.log("\nHooks");
const offerAnalytics = readFileSync(OFFER_ANALYTICS, "utf8");
const chat = readFileSync(CHAT_API, "utf8");
assert("offer set imports price intelligence", offerAnalytics.includes("instrumentPriceIntelligenceAnalyticsFromOfferSet"));
assert("offer set hooks emit", offerAnalytics.includes("instrumentPriceIntelligenceAnalyticsFromOfferSet(supabase"));
assert("chat offer set delivery", chat.includes("instrumentOfferSetAnalyticsForDelivery"));

console.log("\nObserve helper");
const summary = instrumentPriceIntelligenceAnalyticsFromOfferSet(null, {
  requestId: "req-observe-1",
  offerSetMetadata: sampleOfferSet,
  commercialPermission: COMMERCIAL_PERMISSION.ALLOW,
  interactionMode: MIA_INTERACTION_MODES.COMMERCE,
});
assert("observe returns summary", summary?.price_quality === MIA_PRICE_QUALITY.HIGH);

console.log("\nSQL files");
for (const file of SQL_FILES) {
  const path = join(ROOT, "docs/analytics/sql", file);
  assert(`${file} exists`, existsSync(path));
  const sql = readFileSync(path, "utf8");
  assert(`${file} uses event`, sql.includes("mia_price_intelligence"));
}

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
