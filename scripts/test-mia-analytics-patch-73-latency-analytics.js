#!/usr/bin/env node
/**
 * PATCH 7.3 — Latency reliability analytics audit.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildLatencyAnalyticsPayload,
  classifyLatencyBand,
  isSlowRequest,
  MIA_LATENCY_ANALYTICS_EVENT,
  MIA_LATENCY_ANALYTICS_VERSION,
} from "../lib/miaLatencyAnalytics.js";
import {
  createLatencyTracker,
  finalizeLatencyMeasurement,
  markLatencyStage,
  buildLatencyDedupKey,
  recordProviderLatencyAttempt,
} from "../lib/miaLatencyTracker.js";
import {
  MIA_LATENCY_STAGES,
  MIA_LATENCY_THRESHOLD_MS,
  MIA_LATENCY_BANDS,
} from "../lib/miaLatencyStageCatalog.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ANALYTICS_DIR = join(ROOT, "docs/analytics");

const SQL_FILE = join(ANALYTICS_DIR, "analytics-reliability-latency.sql");
const USAGE_DOC = join(ANALYTICS_DIR, "RELIABILITY_LATENCY_ANALYTICS.md");
const PATCH_DOC = join(ANALYTICS_DIR, "PATCH_7.3_LATENCY_ANALYTICS.md");
const EVENT_CONTRACT = join(ANALYTICS_DIR, "contracts/EVENT_CONTRACT.md");
const TRACKER_FILE = join(ROOT, "lib/miaLatencyTracker.js");
const ANALYTICS_LIB = join(ROOT, "lib/miaLatencyAnalytics.js");
const CHAT_API = join(ROOT, "pages/api/chat-gpt4o.js");

const SPLIT_FILES = [
  "patch-73-query1-latency-overview.sql",
  "patch-73-query2-latency-dimensions.sql",
  "patch-73-query3-stage-correlation.sql",
  "patch-73-query4-evolution-gaps-panel.sql",
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

const REQUIRED_METRICS = [
  "total_instrumented_requests",
  "average_latency_ms",
  "minimum_latency_ms",
  "maximum_latency_ms",
  "p50_latency_ms",
  "p75_latency_ms",
  "p90_latency_ms",
  "p95_latency_ms",
  "p99_latency_ms",
  "slow_request_count",
  "slow_request_rate",
  "measurement_gap_count",
  "measurement_gap_rate",
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

const sql = existsSync(SQL_FILE) ? readFileSync(SQL_FILE, "utf8") : "";
const q1 = readFileSync(join(ANALYTICS_DIR, "sql", SPLIT_FILES[0]), "utf8");
const usageDoc = existsSync(USAGE_DOC) ? readFileSync(USAGE_DOC, "utf8") : "";
const eventContract = readFileSync(EVENT_CONTRACT, "utf8");
const chatApi = readFileSync(CHAT_API, "utf8");

console.log("\nPATCH 7.3 — Latency reliability analytics audit\n");

console.log("SQL structure");
assert("main SQL exists", existsSync(SQL_FILE));
assert("uses analytics_events", /analytics_events/i.test(q1));
assert("filters mia_latency_event", /event_name\s*=\s*'mia_latency_event'/i.test(q1));
assert("excludes reliability_latency_test", /reliability_latency_test/i.test(q1));
assert("correlates mia_response_outcome", /mia_response_outcome/i.test(readFileSync(join(ANALYTICS_DIR, "sql", SPLIT_FILES[2]), "utf8")));
assert("correlates mia_error_event", /mia_error_event/i.test(readFileSync(join(ANALYTICS_DIR, "sql", SPLIT_FILES[2]), "utf8")));
assert("correlates data_layer_resolution", /data_layer_resolution/i.test(readFileSync(join(ANALYTICS_DIR, "sql", SPLIT_FILES[2]), "utf8")));
assert("uses percentile_cont", /percentile_cont/i.test(q1));
for (const alias of REQUIRED_ALIASES) {
  assert(`SQL alias ${alias}`, q1.includes(alias));
}
for (const metric of REQUIRED_METRICS) {
  assert(`SQL metric ${metric}`, q1.includes(metric));
}
assert("SQL avoids duplicate 6.4 rename", !q1.includes("query_duration_ms as total"));

console.log("\nSQL splits");
for (const file of SPLIT_FILES) {
  const path = join(ANALYTICS_DIR, "sql", file);
  const content = readFileSync(path, "utf8");
  assert(`split ${file} exists`, existsSync(path));
  assert(`${file} standalone`, /^with\s+/i.test(content.trim()));
}

console.log("\nTracker & payload");
const tracker = createLatencyTracker({ requestStartedAt: Date.now() - 1500 });
markLatencyStage(tracker, MIA_LATENCY_STAGES.HTTP_VALIDATION);
markLatencyStage(tracker, MIA_LATENCY_STAGES.INTENT_CLASSIFICATION);
recordProviderLatencyAttempt(tracker, { provider: "mercadolivre", durationMs: 400, status: "ok" });
const finalized = finalizeLatencyMeasurement(tracker);
assert("total duration non-negative", finalized.total_duration_ms >= 0);
assert("stages array present", Array.isArray(finalized.stages) && finalized.stages.length > 0);
assert("provider stage captured", finalized.stages.some((s) => s.stage === MIA_LATENCY_STAGES.PROVIDER));
assert("dedup key stable", buildLatencyDedupKey("req-1", "mia_latency_event", "7.3.0").includes("req-1"));

const built = buildLatencyAnalyticsPayload({
  requestId: "11111111-1111-1111-1111-111111111111",
  analyticsContext: {
    session_id: "22222222-2222-2222-2222-222222222222",
    visitor_id: "33333333-3333-3333-3333-333333333333",
  },
  query: "test query",
  responsePath: "return_seguro",
  httpStatus: 200,
  responseOutcome: "SUCCESS",
  latencyTracker: tracker,
});
assert("event name", built.payload.event_name === MIA_LATENCY_ANALYTICS_EVENT);
assert("event_version", built.payload.metadata?.event_version === MIA_LATENCY_ANALYTICS_VERSION);
assert("total_duration_ms", Number.isFinite(built.payload.metadata?.total_duration_ms));
assert("stages metadata", Array.isArray(built.payload.metadata?.stages));
assert("no forbidden keys", !JSON.stringify(built.payload.metadata || {}).match(/api_key|password|secret/i));
assert("delta note present", String(built.payload.metadata?.delta_note || "").includes("6.4"));

console.log("\nThresholds & bands");
assert("FAST band", classifyLatencyBand(1000) === MIA_LATENCY_BANDS.FAST);
assert("SLOW band", classifyLatencyBand(7000) === MIA_LATENCY_BANDS.SLOW);
assert("CRITICAL band", classifyLatencyBand(15000) === MIA_LATENCY_BANDS.CRITICAL);
assert("slow request threshold", isSlowRequest(MIA_LATENCY_THRESHOLD_MS.ACCEPTABLE + 1));
assert("invalid duration null band", classifyLatencyBand(NaN) === null);

console.log("\nRuntime instrumentation");
assert("tracker module exists", existsSync(TRACKER_FILE));
assert("analytics lib exists", existsSync(ANALYTICS_LIB));
assert("chat imports latency analytics", chatApi.includes("miaLatencyAnalytics"));
assert("chat creates latency tracker", chatApi.includes("createLatencyTracker"));
assert("chat instrument latency delivery", chatApi.includes("instrumentLatencyAnalyticsForDelivery"));
assert("chat latency_analytics in response", chatApi.includes("latency_analytics"));
assert("openai records llm duration", readFileSync(join(ROOT, "lib/openai.js"), "utf8").includes("tryRecordLlmDuration"));

console.log("\nDocumentation");
assert("usage doc exists", existsSync(USAGE_DOC));
assert("usage doc delta 6.4", usageDoc.includes("6.4"));
assert("usage doc total_duration_ms", usageDoc.includes("total_duration_ms"));
assert("usage doc stages", usageDoc.includes("HTTP_VALIDATION"));
assert("event contract mia_latency_event", eventContract.includes("mia_latency_event"));

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
