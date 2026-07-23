#!/usr/bin/env node
/**
 * PATCH 8.4 — Phase 8 final audit meta-validation (read-only).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ANALYTICS = join(ROOT, "docs/analytics");
const SQL = join(ANALYTICS, "sql");

const PATCH_DOCS = [
  "PATCH_8_1_COMMERCIAL_SEARCH_ANALYTICS.md",
  "PATCH_8_2_PROVIDER_ANALYTICS.md",
  "PATCH_8_3_OFFER_ANALYTICS.md",
  "OFFER_ANALYTICS.md",
  "PROVIDER_ANALYTICS.md",
  "PHASE_8_MASTER_DOCUMENT.md",
  "PATCH_8_4_PHASE_8_FINAL_AUDIT.md",
];

const EVIDENCE = [
  "PATCH_8.1_PRODUCTION_EVIDENCE.json",
  "PATCH_8_2_PRODUCTION_EVIDENCE.json",
  "PATCH_8_3_PRODUCTION_EVIDENCE.json",
  "PHASE_8_FINAL_AUDIT_EVIDENCE.json",
];

const RUNTIME_LIBS = [
  "lib/miaCommercialSearchAnalytics.js",
  "lib/miaCommercialSearchCatalog.js",
  "lib/miaCommercialSearchClassifier.js",
  "lib/miaCommercialSearchTracker.js",
  "lib/miaProviderAttemptAnalytics.js",
  "lib/miaProviderAttemptCatalog.js",
  "lib/miaProviderAttemptClassifier.js",
  "lib/miaProviderAttemptTracker.js",
  "lib/miaProviderIdCatalog.js",
  "lib/miaOfferSetAnalytics.js",
  "lib/miaOfferSetCatalog.js",
  "lib/miaOfferSetClassifier.js",
  "lib/miaOfferSetTracker.js",
  "lib/miaOfferIdentity.js",
];

const SQL_81 = [
  "patch-81-query1-search-volume.sql",
  "patch-81-query2-query-extraction.sql",
  "patch-81-query3-search-paths.sql",
  "patch-81-query4-search-results.sql",
  "patch-81-query5-correlation-diagnostic.sql",
];

const SQL_82 = [
  "patch-82-query1-provider-volume-status.sql",
  "patch-82-query2-provider-latency.sql",
  "patch-82-query3-provider-contribution.sql",
  "patch-82-query4-provider-failures-fallback.sql",
  "patch-82-query5-provider-runtime-paths.sql",
  "patch-82-query6-provider-correlation.sql",
];

const SQL_83 = [
  "patch-83-query1-offer-funnel.sql",
  "patch-83-query2-offer-price-winner.sql",
  "patch-83-query3-offer-diversity.sql",
  "patch-83-query4-offer-quality.sql",
  "patch-83-query5-offer-interactions.sql",
  "patch-83-query6-offer-correlation.sql",
  "patch-83-query7-offer-loss-diagnostic.sql",
];

let passed = 0;
let failed = 0;

function ok(label, cond) {
  if (cond) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.error(`  ❌ ${label}`);
  }
}

console.log("\nPATCH 8.4 — Phase 8 final audit meta-validation\n");

console.log("Documentation");
for (const f of PATCH_DOCS) {
  ok(f, existsSync(join(ANALYTICS, f)));
}
for (const f of EVIDENCE) {
  ok(`evidence ${f}`, existsSync(join(ANALYTICS, f)));
}

console.log("\nSQL (18 queries)");
for (const f of [...SQL_81, ...SQL_82, ...SQL_83]) {
  const content = existsSync(join(SQL, f)) ? readFileSync(join(SQL, f), "utf8") : "";
  ok(f, content.includes("mia_commercial_search") || content.includes("mia_provider_attempt") || content.includes("mia_offer_set"));
}

console.log("\nFan-out guards");
const q5 = readFileSync(join(SQL, "patch-83-query5-offer-interactions.sql"), "utf8");
ok("Q5 session aggregation", q5.includes("group by session_id"));
const q6_82 = readFileSync(join(SQL, "patch-82-query6-provider-correlation.sql"), "utf8");
ok("8.2 Q6 provider pre-aggregate", q6_82.includes("group by 1") && q6_82.includes("provider_attempts"));
const q6_83 = readFileSync(join(SQL, "patch-83-query6-offer-correlation.sql"), "utf8");
ok("8.3 Q6 CTE pre-aggregate", q6_83.includes("provider_attempts as"));

console.log("\nRuntime libs");
for (const f of RUNTIME_LIBS) {
  ok(f, existsSync(join(ROOT, f)));
}

const chat = readFileSync(join(ROOT, "pages/api/chat-gpt4o.js"), "utf8");
ok("8.1 init hook", chat.includes("initializeCommercialSearchAnalyticsTracking"));
ok("8.1 delivery hook", chat.includes("instrumentCommercialSearchAnalyticsForDelivery"));
ok("8.2 init hook", chat.includes("initializeProviderAttemptAnalyticsTracking"));
ok("8.2 legacy observe", chat.includes("observeLegacyProviderAttempt"));
ok("8.3 init hook", chat.includes("initializeOfferSetAnalyticsTracking"));
ok("8.3 pipeline hook", chat.includes("updateOfferSetAnalyticsFromPipeline"));
ok("8.3 delivery hook", chat.includes("instrumentOfferSetAnalyticsForDelivery"));

const contract = readFileSync(join(ANALYTICS, "contracts/EVENT_CONTRACT.md"), "utf8");
ok("contract 8.1", contract.includes("mia_commercial_search"));
ok("contract 8.2", contract.includes("mia_provider_attempt"));
ok("contract 8.3", contract.includes("mia_offer_set"));

console.log("\nDedup keys");
const cs = readFileSync(join(ROOT, "lib/miaCommercialSearchTracker.js"), "utf8");
ok("8.1 dedup request_id+event", cs.includes("buildCommercialSearchDedupKey"));
const pa = readFileSync(join(ROOT, "lib/miaProviderAttemptTracker.js"), "utf8");
  ok("8.2 dedup includes attempt index", pa.includes("buildProviderAttemptDedupKey"));
const os = readFileSync(join(ROOT, "lib/miaOfferSetTracker.js"), "utf8");
ok("8.3 dedup request_id+event", os.includes("buildOfferSetDedupKey"));

console.log("\nFire-and-forget");
const csA = readFileSync(join(ROOT, "lib/miaCommercialSearchAnalytics.js"), "utf8");
ok("8.1 void schedule", csA.includes("void emitCommercialSearchAnalytics"));
const paA = readFileSync(join(ROOT, "lib/miaProviderAttemptAnalytics.js"), "utf8");
ok("8.2 void schedule", paA.includes("void emitProviderAttemptAnalytics"));
const osA = readFileSync(join(ROOT, "lib/miaOfferSetAnalytics.js"), "utf8");
ok("8.3 void schedule", osA.includes("void emitOfferSetAnalytics"));

console.log("\nGit phase 8 commits");
const log = execSync("git log --oneline -25", { cwd: ROOT, encoding: "utf8" });
for (const hash of ["e6b5eb1", "43974ea", "2158de6", "23320b8"]) {
  ok(`commit ${hash}`, log.includes(hash.slice(0, 7)));
}

console.log(`\nResultado: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
