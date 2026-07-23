#!/usr/bin/env node
/**
 * PATCH 7.1 — Response reliability analytics audit.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyResponseOutcome,
  deriveResponseOutcomeFlags,
  deriveResponseValidity,
  MIA_RESPONSE_OUTCOMES,
  MIA_RESPONSE_VALIDITY,
} from "../lib/miaResponseOutcomeClassifier.js";
import {
  buildResponseOutcomeAnalyticsPayload,
  buildResponseOutcomeRecommendationMetadata,
  MIA_RESPONSE_ANALYTICS_EVENT,
  MIA_RESPONSE_ANALYTICS_VERSION,
} from "../lib/miaResponseAnalytics.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ANALYTICS_DIR = join(ROOT, "docs/analytics");

const SQL_FILE = join(ANALYTICS_DIR, "analytics-reliability-response.sql");
const USAGE_DOC = join(ANALYTICS_DIR, "RELIABILITY_RESPONSE_ANALYTICS.md");
const PATCH_DOC = join(ANALYTICS_DIR, "PATCH_7.1_RESPONSE_ANALYTICS.md");
const EVENT_CONTRACT = join(ANALYTICS_DIR, "contracts/EVENT_CONTRACT.md");
const CLASSIFIER_FILE = join(ROOT, "lib/miaResponseOutcomeClassifier.js");
const ANALYTICS_LIB = join(ROOT, "lib/miaResponseAnalytics.js");
const CHAT_API = join(ROOT, "pages/api/chat-gpt4o.js");

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

const FORBIDDEN_CATALOG = [
  /\bfrom\s+product_specs\b/i,
  /\bfrom\s+phone_specs\b/i,
  /\bfrom\s+notebook_specs\b/i,
  /\bcreate\s+table\b/i,
  /\binsert\s+into\b/i,
  /\bupdate\s+/i,
  /\bdelete\s+from\b/i,
];

const FORBIDDEN_DUPLICATE_64 = [
  /\bdata_layer_hit_rate\b/i,
  /\bhybrid_rate\b/i,
  /\bfull_coverage_rate\b/i,
];

const SPLIT_FILES = [
  "patch-71-query1-outcome-overview.sql",
  "patch-71-query2-outcome-dimensions.sql",
  "patch-71-query3-partial-fallback-analytics.sql",
  "patch-71-query4-evolution-gaps-panel.sql",
];

const OUTCOME_NAMES = [
  "SUCCESS",
  "PARTIAL_SUCCESS",
  "FALLBACK",
  "NO_RESULT",
  "ERROR",
  "TIMEOUT",
  "CANCELLED",
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

const sql = readFileSync(SQL_FILE, "utf8");
const usageDoc = readFileSync(USAGE_DOC, "utf8");
const patchDoc = existsSync(PATCH_DOC) ? readFileSync(PATCH_DOC, "utf8") : "";
const eventContract = readFileSync(EVENT_CONTRACT, "utf8");
const chatApi = readFileSync(CHAT_API, "utf8");

console.log("\nPATCH 7.1 — Response reliability analytics audit\n");

console.log("SQL structure");
assert("main SQL exists", existsSync(SQL_FILE));
assert("uses analytics_events", /from\s+analytics_events/i.test(sql));
assert("filters mia_response_outcome", /event_name\s*=\s*'mia_response_outcome'/i.test(sql));
assert("excludes reliability_response_test", /reliability_response_test/i.test(sql));
for (const alias of REQUIRED_ALIASES) {
  assert(`SQL alias ${alias}`, sql.includes(alias));
}
for (const pattern of FORBIDDEN_CATALOG) {
  assert(`SQL avoids catalog mutation ${pattern}`, !pattern.test(sql));
}
for (const pattern of FORBIDDEN_DUPLICATE_64) {
  assert(`SQL avoids duplicate 6.4 metric ${pattern}`, !pattern.test(sql));
}
for (const metric of [
  "total_responses",
  "success_rate",
  "partial_success_rate",
  "fallback_rate",
  "no_result_rate",
  "timeout_rate",
  "error_rate",
  "cancelled_rate",
]) {
  assert(`SQL metric ${metric}`, sql.includes(metric));
}
assert("SQL has 4 query sections", (sql.match(/^-- QUERY /gm) || []).length === 4);

console.log("\nSQL splits");
for (const split of SPLIT_FILES) {
  const path = join(ANALYTICS_DIR, "sql", split);
  assert(`split ${split} exists`, existsSync(path));
  const splitSql = readFileSync(path, "utf8");
  assert(`${split} is standalone SELECT`, /^with\s+/i.test(splitSql.trim()));
}

console.log("\nClassifier");
assert(
  "SUCCESS default",
  classifyResponseOutcome({
    httpStatus: 200,
    responsePath: "social_governed",
    body: { reply: "Olá!", prices: [] },
  }) === MIA_RESPONSE_OUTCOMES.SUCCESS
);
assert(
  "ERROR http 500",
  classifyResponseOutcome({
    httpStatus: 500,
    responsePath: "chat_internal_error",
    body: { reply: "erro" },
  }) === MIA_RESPONSE_OUTCOMES.ERROR
);
assert(
  "ERROR path failed",
  classifyResponseOutcome({
    responsePath: "image_identification_failed",
    body: { reply: "falhou" },
  }) === MIA_RESPONSE_OUTCOMES.ERROR
);
assert(
  "NO_RESULT commercial incomplete",
  classifyResponseOutcome({
    responsePath: "commercial_resolution_incomplete",
    body: { reply: "", prices: [] },
  }) === MIA_RESPONSE_OUTCOMES.NO_RESULT
);
assert(
  "FALLBACK commercial_only_fallback",
  classifyResponseOutcome({
    responsePath: "commercial_only_fallback",
    body: { reply: "opções", prices: [{ product_name: "X" }] },
  }) === MIA_RESPONSE_OUTCOMES.FALLBACK
);
assert(
  "PARTIAL comparison incomplete",
  classifyResponseOutcome({
    responsePath: "comparison_anchored_incomplete",
    body: { reply: "preciso de mais info" },
  }) === MIA_RESPONSE_OUTCOMES.PARTIAL_SUCCESS
);
assert(
  "PARTIAL via data layer correlation",
  classifyResponseOutcome({
    responsePath: "return_seguro",
    body: {
      reply: "ok",
      prices: [{ product_name: "A" }],
      data_layer_usage_analytics: { response_classification: "PARTIAL_DATA_LAYER" },
    },
  }) === MIA_RESPONSE_OUTCOMES.PARTIAL_SUCCESS
);
assert(
  "validity partial",
  deriveResponseValidity(MIA_RESPONSE_OUTCOMES.PARTIAL_SUCCESS) === MIA_RESPONSE_VALIDITY.PARTIAL
);
assert(
  "flags success",
  deriveResponseOutcomeFlags(MIA_RESPONSE_OUTCOMES.SUCCESS).outcome_success === true
);
assert(
  "taxonomy unique names",
  new Set(OUTCOME_NAMES).size === OUTCOME_NAMES.length
);

console.log("\nAnalytics payload");
const built = buildResponseOutcomeAnalyticsPayload({
  query: "notebook até 3000",
  responsePath: "return_seguro",
  httpStatus: 200,
  analyticsContext: {
    session_id: "550e8400-e29b-41d4-a716-446655440000",
    visitor_id: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  },
  body: { reply: "Aqui estão opções", prices: [{ product_name: "Notebook X" }] },
  pipelineStartedAt: Date.now() - 1200,
});
assert("event name", built.payload.event_name === MIA_RESPONSE_ANALYTICS_EVENT);
assert("event_version metadata", built.payload.metadata?.event_version === MIA_RESPONSE_ANALYTICS_VERSION);
assert("outcome SUCCESS", built.payload.metadata?.outcome === MIA_RESPONSE_OUTCOMES.SUCCESS);
assert("outcome flags present", built.payload.metadata?.outcome_success === true);
assert("retrocompatible insert row keys", "visitor_id" in built.payload && "metadata" in built.payload);
assert(
  "recommendation metadata extension",
  buildResponseOutcomeRecommendationMetadata(built.summary).response_outcome ===
    MIA_RESPONSE_OUTCOMES.SUCCESS
);

console.log("\nRuntime instrumentation");
assert("classifier module exists", existsSync(CLASSIFIER_FILE));
assert("analytics lib exists", existsSync(ANALYTICS_LIB));
assert("chat imports schedule", /scheduleResponseOutcomeAnalytics/.test(chatApi));
assert("chat builds payload", /buildResponseOutcomeAnalyticsPayload/.test(chatApi));
assert("chat attaches summary", /response_outcome_analytics/.test(chatApi));
assert("hook in sendHttpRuntimeResponse", /instrumentResponseOutcomeAnalytics/.test(chatApi));
assert("shared state responseAnalytics", /responseAnalytics/.test(chatApi));

console.log("\nDocumentation");
assert("usage doc exists", existsSync(USAGE_DOC));
assert("usage doc mentions event_version", /event_version/i.test(usageDoc));
assert("usage doc mentions SUCCESS", /SUCCESS/.test(usageDoc));
assert("usage doc delta vs 6.4", /6\.4|data_layer_resolution/i.test(usageDoc));
assert("event contract §7.6", /7\.6|mia_response_outcome/i.test(eventContract));

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
