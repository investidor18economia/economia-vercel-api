#!/usr/bin/env node
/**
 * PATCH 7.4 — Health metrics analytics audit.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildHealthSnapshot } from "../lib/miaHealthSnapshotBuilder.js";
import { classifyHealthStatus } from "../lib/miaHealthStatusClassifier.js";
import {
  MIA_HEALTH_ANALYTICS_VERSION,
  MIA_HEALTH_STATUSES,
  MIA_HEALTH_PILLARS,
} from "../lib/miaHealthStatusCatalog.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ANALYTICS_DIR = join(ROOT, "docs/analytics");

const SQL_FILE = join(ANALYTICS_DIR, "analytics-reliability-health.sql");
const USAGE_DOC = join(ANALYTICS_DIR, "RELIABILITY_HEALTH_ANALYTICS.md");
const PATCH_DOC = join(ANALYTICS_DIR, "PATCH_7.4_HEALTH_ANALYTICS.md");
const EVENT_CONTRACT = join(ANALYTICS_DIR, "contracts/EVENT_CONTRACT.md");
const CHAT_API = join(ROOT, "pages/api/chat-gpt4o.js");

const SPLIT_FILES = [
  "patch-74-query1-overall-health.sql",
  "patch-74-query2-component-breakdown.sql",
  "patch-74-query3-health-trends.sql",
  "patch-74-query4-instrumentation-quality.sql",
];

const REQUIRED_ALIASES = [
  "dia_referencia",
  "tipo_analise",
  "metrica",
  "valor_absoluto",
  "valor_relativo",
  "registros_total",
  "referencia_denominador",
  "amostra_analisavel",
];

const REQUIRED_INDICATORS = [
  "availability_rate",
  "success_rate",
  "partial_success_rate",
  "error_rate",
  "recovered_error_rate",
  "unrecovered_error_rate",
  "latency_p95",
  "latency_p99",
  "slow_request_rate",
  "unknown_error_rate",
  "request_volume",
  "analytics_gap_rate",
];

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${label}`);
    return;
  }
  failed += 1;
  console.error(`  ❌ ${label}`);
}

const q1 = readFileSync(join(ANALYTICS_DIR, "sql", SPLIT_FILES[0]), "utf8");
const usageDoc = existsSync(USAGE_DOC) ? readFileSync(USAGE_DOC, "utf8") : "";
const eventContract = readFileSync(EVENT_CONTRACT, "utf8");
const chatApi = readFileSync(CHAT_API, "utf8");

console.log("\nPATCH 7.4 — Health metrics analytics audit\n");

console.log("SQL structure");
assert("main SQL exists", existsSync(SQL_FILE));
assert("SQL derived not duplicate events", /sql.consolidated|SQL-derived|no runtime event/i.test(readFileSync(SQL_FILE, "utf8") + usageDoc));
assert("correlates mia_response_outcome", /mia_response_outcome/i.test(q1));
assert("correlates mia_error_event", /mia_error_event/i.test(q1));
assert("correlates mia_latency_event", /mia_latency_event/i.test(q1));
assert("health_status in Q1", /health_status/i.test(q1));
for (const alias of REQUIRED_ALIASES) {
  assert(`SQL alias ${alias}`, q1.includes(alias));
}
for (const metric of REQUIRED_INDICATORS) {
  assert(`SQL indicator ${metric}`, q1.includes(metric));
}
assert("no chat runtime health insert", !chatApi.includes("mia_health_snapshot"));
assert("7.1 hooks preserved", chatApi.includes("instrumentResponseOutcomeAnalytics"));
assert("7.2 hooks preserved", chatApi.includes("instrumentErrorAnalyticsForDelivery"));
assert("7.3 hooks preserved", chatApi.includes("instrumentLatencyAnalyticsForDelivery"));

console.log("\nSQL splits");
for (const file of SPLIT_FILES) {
  const path = join(ANALYTICS_DIR, "sql", file);
  const content = readFileSync(path, "utf8");
  assert(`split ${file} exists`, existsSync(path));
  assert(`${file} standalone`, /^with\s+/i.test(content.trim()));
}

console.log("\nHealth classifier");
assert("HEALTHY", classifyHealthStatus({ sampleSize: 100, error_rate: 0.05, slow_request_rate: 0.1 }) === MIA_HEALTH_STATUSES.HEALTHY);
assert("DEGRADED partial", classifyHealthStatus({ sampleSize: 50, partial_success_rate: 0.5 }) === MIA_HEALTH_STATUSES.DEGRADED);
assert("UNSTABLE error", classifyHealthStatus({ sampleSize: 50, error_rate: 0.25 }) === MIA_HEALTH_STATUSES.UNSTABLE);
assert("CRITICAL availability", classifyHealthStatus({ sampleSize: 50, availability_rate: 0.85 }) === MIA_HEALTH_STATUSES.CRITICAL);
assert("INSUFFICIENT_DATA", classifyHealthStatus({ sampleSize: 0 }) === MIA_HEALTH_STATUSES.INSUFFICIENT_DATA);

console.log("\nHealth snapshot");
const healthy = buildHealthSnapshot({
  requestVolume: 100,
  successCount: 80,
  partialSuccessCount: 15,
  errorOutcomeCount: 2,
  fallbackCount: 3,
  errorEventCount: 5,
  recoveredErrorCount: 5,
  unrecoveredErrorCount: 0,
  latencySampleSize: 50,
  latencyP95Ms: 4000,
  latencyP99Ms: 8000,
  slowRequestCount: 5,
  analyticsGapCount: 10,
});
assert("snapshot version", healthy.event_version === MIA_HEALTH_ANALYTICS_VERSION);
assert("four pillars", healthy.availability?.pillar === MIA_HEALTH_PILLARS.AVAILABILITY);
assert("indicators present", REQUIRED_INDICATORS.every((k) => k in healthy.indicators));
assert("no persistence runtime", healthy.persistence === "none_runtime_event");
assert("healthy status high success", healthy.health_status === MIA_HEALTH_STATUSES.HEALTHY);

const critical = buildHealthSnapshot({
  requestVolume: 20,
  successCount: 5,
  errorOutcomeCount: 10,
  errorEventCount: 8,
  unrecoveredErrorCount: 6,
  latencySampleSize: 10,
  latencyP99Ms: 20000,
  slowRequestCount: 8,
});
assert("critical path", critical.health_status === MIA_HEALTH_STATUSES.CRITICAL);

console.log("\nDocumentation");
assert("usage doc exists", existsSync(USAGE_DOC));
assert("usage doc pillars", usageDoc.includes("Availability"));
assert("usage doc no runtime event", /sem evento runtime|SQL-derived|sql consolidado/i.test(usageDoc));
assert("patch doc exists", existsSync(PATCH_DOC));
assert("event contract health section", /7\.4|health|sql.consolidated/i.test(eventContract));

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
