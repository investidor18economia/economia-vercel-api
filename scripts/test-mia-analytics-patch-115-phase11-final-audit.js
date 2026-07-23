#!/usr/bin/env node
/**
 * PATCH 11.5 — Phase 11 final audit meta-validation (read-only).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ANALYTICS = join(ROOT, "docs/analytics");

const PHASE11_DOCS = [
  "EXECUTIVE_METRICS_API.md",
  "PUBLIC_METRICS_PAGE.md",
  "FOUNDER_EXECUTIVE_DASHBOARD.md",
  "EXECUTIVE_AI_INSIGHTS.md",
  "contracts/EVENT_CONTRACT.md",
  "ANALYTICS_CHANGELOG.md",
  "02_analytics_roadmap.md",
  "PHASE_11_FINAL_MASTER_DOCUMENT.md",
  "PATCH_11_1_EXECUTIVE_METRICS_API_EVIDENCE.json",
  "PATCH_11_2_PUBLIC_METRICS_PAGE_EVIDENCE.json",
  "PATCH_11_3_FOUNDER_DASHBOARD_EVIDENCE.json",
  "PATCH_11_4_EXECUTIVE_AI_INSIGHTS_EVIDENCE.json",
  "PATCH_11_4_PERIOD_OFFSET_COMPLEMENT_EVIDENCE.json",
  "PATCH_11_5_FINAL_AUDIT_EVIDENCE.json",
];

const RUNTIME_LIBS = [
  "lib/miaExecutiveMetricsApi.js",
  "lib/miaExecutiveMetricsCatalog.js",
  "lib/miaPublicMetricsDisplay.js",
  "lib/miaFounderCockpitDisplay.js",
  "lib/miaFounderAccess.js",
  "lib/miaExecutiveInsightsApi.js",
  "lib/miaExecutiveInsightsEngine.js",
  "lib/miaExecutiveInsightsCompare.js",
  "lib/miaExecutiveInsightsLlm.js",
  "lib/miaExecutiveInsightsCache.js",
  "lib/miaExecutiveInsightsThresholds.js",
  "pages/api/executive-metrics.js",
  "pages/api/founder/executive-insights.js",
  "pages/api/founder/authenticate.js",
  "pages/api/founder/logout.js",
  "pages/teilor-em-numeros.jsx",
  "pages/cockpit-fundador.jsx",
];

const CONSUMER_FILES = [
  "pages/teilor-em-numeros.jsx",
  "pages/cockpit-fundador.jsx",
  "lib/miaPublicMetricsDisplay.js",
  "lib/miaFounderCockpitDisplay.js",
  "components/public-metrics/PublicMetricsPage.jsx",
  "components/founder-cockpit/FounderCockpitPage.jsx",
  "components/founder-cockpit/FounderExecutiveInsights.jsx",
];

const FORBIDDEN_IN_CONSUMERS = [
  "supabase",
  "analytics_events",
  "buildExecutiveMetricsResponse",
  ".rpc(",
  "from(\"analytics",
];

const NINE_CATEGORIES = [
  "platform",
  "conversation",
  "recommendation",
  "commerce",
  "alerts",
  "price_intelligence",
  "savings",
  "anti_regret",
  "user_value",
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

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

console.log("\nPATCH 11.5 — Phase 11 final audit meta-validation\n");

console.log("Evidence & docs");
for (const f of PHASE11_DOCS) {
  ok(f, existsSync(join(ANALYTICS, f)));
}

console.log("\nRuntime libs & routes");
for (const f of RUNTIME_LIBS) {
  ok(f, existsSync(join(ROOT, f)));
}

console.log("\nArchitecture — Single Source of Truth");
const metricsApi = read("lib/miaExecutiveMetricsApi.js");
const insightsCompare = read("lib/miaExecutiveInsightsCompare.js");
const insightsApi = read("lib/miaExecutiveInsightsApi.js");
const publicPage = read("pages/teilor-em-numeros.jsx");
const cockpitPage = read("pages/cockpit-fundador.jsx");
const insightsRoute = read("pages/api/founder/executive-insights.js");
const metricsRoute = read("pages/api/executive-metrics.js");

ok("API uses buildExecutiveMetricsResponse", metricsRoute.includes("buildExecutiveMetricsResponse"));
ok("insights compare uses buildExecutiveMetricsResponse", insightsCompare.includes("buildExecutiveMetricsResponse"));
ok("insights api uses period comparison", insightsApi.includes("buildExecutiveMetricsPeriodComparison"));
ok("public page fetches /api/executive-metrics", publicPage.includes("/api/executive-metrics"));
ok("cockpit fetches /api/executive-metrics", cockpitPage.includes("/api/executive-metrics"));
ok("no same-window fallback in metrics api", !metricsApi.includes("offsetDays: 0") || metricsApi.includes("period_offset_unavailable"));

for (const f of CONSUMER_FILES) {
  const src = read(f);
  for (const forbidden of FORBIDDEN_IN_CONSUMERS) {
    ok(`${f} no ${forbidden}`, !src.includes(forbidden));
  }
}

console.log("\nContracts");
const catalog = read("lib/miaExecutiveMetricsCatalog.js");
const thresholds = read("lib/miaExecutiveInsightsThresholds.js");
ok("metrics_version 11.1.0", catalog.includes('"11.1.0"'));
ok("insights_version 11.4.0", thresholds.includes('"11.4.0"'));
ok("EVENT_CONTRACT metrics_version", read("docs/analytics/contracts/EVENT_CONTRACT.md").includes("11.1.0"));
ok("EVENT_CONTRACT insights_version", read("docs/analytics/contracts/EVENT_CONTRACT.md").includes("11.4.0"));

console.log("\nSecurity");
ok("executive-metrics GET only", metricsRoute.includes('validatePublicHttpMethod(req, ["GET"]'));
ok("executive-insights GET only", insightsRoute.includes('req.method !== "GET"'));
ok("executive-insights founder gate", insightsRoute.includes("requireFounderGate"));
ok("cockpit founder gate SSR", cockpitPage.includes("requireFounderGate"));
ok("cockpit noindex", cockpitPage.includes('content="noindex, nofollow"'));
ok("public index follow", publicPage.includes('content="index, follow"'));

console.log("\nSEO — Teilor em Números");
ok("title meta", publicPage.includes("<title>"));
ok("description meta", publicPage.includes('name="description"'));
ok("canonical", publicPage.includes('rel="canonical"'));
ok("og:title", publicPage.includes('property="og:title"'));
ok("twitter:card", publicPage.includes('name="twitter:card"'));
ok("schema.org JSON-LD", publicPage.includes("application/ld+json"));

console.log("\nPeriod offset — 9 categories");
for (const cat of NINE_CATEGORIES) {
  ok(`RPC map ${cat}`, catalog.includes(`${cat}:`));
}
ok("offset param in fetchMetricGroup", metricsApi.includes("offsetDays"));
ok("no dangerous fallback comment", !metricsApi.match(/fallback.*same.?window/i));

const offsetMigration = existsSync(
  join(ROOT, "supabase/migrations/20260723240000_mia_executive_metrics_period_offset_complement_v11_4.sql")
);
ok("offset complement migration exists", offsetMigration);

console.log("\nExecutive AI Insights — deterministic first");
const engine = read("lib/miaExecutiveInsightsEngine.js");
const llm = read("lib/miaExecutiveInsightsLlm.js");
ok("generateDeterministicInsights", engine.includes("generateDeterministicInsights"));
ok("buildDeterministicExecutiveSummary", engine.includes("buildDeterministicExecutiveSummary"));
ok("scanInsightsForbiddenContent", engine.includes("scanInsightsForbiddenContent"));
ok("LLM verbalize only", llm.includes("verbalizeExecutiveInsights"));
ok("insights no_llm query param", insightsRoute.includes("no_llm"));

console.log("\nPrivacy — forbidden keys catalog");
for (const key of ["visitor_id", "conversation_id", "query_text", "email", "request_id"]) {
  ok(`forbidden key ${key}`, catalog.includes(`"${key}"`));
}

console.log("\nCache");
const insightsCache = read("lib/miaExecutiveInsightsCache.js");
ok("executive metrics cache map", metricsApi.includes("Map") || metricsApi.includes("cache"));
ok("insights cache TTL", insightsCache.includes("resolveExecutiveInsightsCacheTtlMs"));

console.log("\nDocumentation cross-reference");
const execApiDoc = read("docs/analytics/EXECUTIVE_METRICS_API.md");
const publicDoc = read("docs/analytics/PUBLIC_METRICS_PAGE.md");
const cockpitDoc = read("docs/analytics/FOUNDER_EXECUTIVE_DASHBOARD.md");
const insightsDoc = read("docs/analytics/EXECUTIVE_AI_INSIGHTS.md");
ok("EXECUTIVE_METRICS_API references 11.1.0", execApiDoc.includes("11.1.0"));
ok("PUBLIC_METRICS references executive-metrics", publicDoc.includes("/api/executive-metrics"));
ok("FOUNDER_DASHBOARD references executive-metrics", cockpitDoc.includes("/api/executive-metrics"));
ok("EXECUTIVE_AI_INSIGHTS references 11.4.0", insightsDoc.includes("11.4.0"));
ok("roadmap PATCH 11.5", read("docs/analytics/02_analytics_roadmap.md").includes("PATCH 11.5"));

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
