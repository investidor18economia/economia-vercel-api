#!/usr/bin/env node
/**
 * PATCH 8.2 — Provider Attempt Analytics audit.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { COMMERCIAL_PERMISSION } from "../lib/miaIntentAuthority.js";
import { MIA_INTERACTION_MODES } from "../lib/miaIntentRecognitionLayer.js";
import {
  buildProviderAttemptAnalyticsPayload,
  buildProviderAttemptRecommendationMetadata,
  initializeProviderAttemptAnalyticsTracking,
  instrumentProviderAttemptAnalyticsForDelivery,
  observeLegacyProviderAttempt,
  observeConditionalProviderAttempt,
  observeShadowConditionalProviderExecution,
  MIA_PROVIDER_ATTEMPT_ANALYTICS_EVENT,
  MIA_PROVIDER_ATTEMPT_ANALYTICS_VERSION,
  normalizeProviderAttemptId,
  resolveProviderAttemptStatus,
  resolveFailureCategoryFromErrorCode,
  resolveHttpStatusGroup,
  resolveSkipReason,
  isKnownProviderAttemptId,
  resolveProviderFamily,
  buildProviderAttemptDedupKey,
  createProviderAttemptAnalyticsBucket,
  recordProviderAttemptObservation,
  markProviderAttemptObservationEmitted,
  materializeShadowProviderAttemptsFromConditionalExecution,
} from "../lib/miaProviderAttemptAnalytics.js";
import {
  MIA_PROVIDER_ATTEMPT_STATUSES,
  MIA_PROVIDER_EXECUTION_PATHS,
  MIA_PROVIDER_RUNTIME_MODES,
  MIA_PROVIDER_FAMILIES,
  MIA_PROVIDER_SKIP_REASONS,
  MIA_PROVIDER_FAILURE_CATEGORIES,
} from "../lib/miaProviderAttemptCatalog.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ANALYTICS_DIR = join(ROOT, "docs/analytics");
const CHAT_API = join(ROOT, "pages/api/chat-gpt4o.js");

const SPLIT_FILES = [
  "patch-82-query1-provider-volume-status.sql",
  "patch-82-query2-provider-latency.sql",
  "patch-82-query3-provider-contribution.sql",
  "patch-82-query4-provider-failures-fallback.sql",
  "patch-82-query5-provider-runtime-paths.sql",
  "patch-82-query6-provider-correlation.sql",
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

console.log("\nPATCH 8.2 — Provider Attempt Analytics audit\n");

console.log("Contract");
assert("event name", MIA_PROVIDER_ATTEMPT_ANALYTICS_EVENT === "mia_provider_attempt");
assert("event version", MIA_PROVIDER_ATTEMPT_ANALYTICS_VERSION === "8.2.0");

console.log("\nProvider IDs");
assert("serpapi alias", normalizeProviderAttemptId("serpapi") === "google_shopping");
assert("supabasecache alias", normalizeProviderAttemptId("supabasecache") === "supabase_cache");
assert("mercadolivre alias", normalizeProviderAttemptId("mercadolivre") === "mercadolivre_public");
assert("google family", resolveProviderFamily("google_shopping") === MIA_PROVIDER_FAMILIES.SEARCH_ENGINE);
assert("cache family", resolveProviderFamily("supabase_cache") === MIA_PROVIDER_FAMILIES.CACHE);
assert("known google", isKnownProviderAttemptId("google_shopping"));

console.log("\nAttempt status");
assert("success", resolveProviderAttemptStatus({ ok: true, resultCount: 3 }) === MIA_PROVIDER_ATTEMPT_STATUSES.SUCCESS);
assert("empty", resolveProviderAttemptStatus({ ok: true, resultCount: 0 }) === MIA_PROVIDER_ATTEMPT_STATUSES.EMPTY);
assert("failed", resolveProviderAttemptStatus({ ok: false, error: "provider_error" }) === MIA_PROVIDER_ATTEMPT_STATUSES.FAILED);
assert("timeout", resolveProviderAttemptStatus({ timedOut: true }) === MIA_PROVIDER_ATTEMPT_STATUSES.TIMEOUT);
assert("skipped", resolveProviderAttemptStatus({ skipped: true }) === MIA_PROVIDER_ATTEMPT_STATUSES.SKIPPED);

console.log("\nFailure and HTTP");
assert("rate limit category", resolveFailureCategoryFromErrorCode("rate_limited") === MIA_PROVIDER_FAILURE_CATEGORIES.RATE_LIMIT);
assert("http 2xx", resolveHttpStatusGroup(200) === "2XX");
assert("http network", resolveHttpStatusGroup(null, { networkError: true }) === "NETWORK");
assert("skip short circuit", resolveSkipReason("skipped_prior_sufficient") === MIA_PROVIDER_SKIP_REASONS.SHORT_CIRCUIT);

console.log("\nDedup key");
const dedupKey = buildProviderAttemptDedupKey("req-1", "serpapi", 1, "mia_provider_attempt", "8.2.0");
assert("dedup includes provider alias", dedupKey.includes("google_shopping"));
assert("dedup unique per attempt", dedupKey !== buildProviderAttemptDedupKey("req-1", "serpapi", 2, "mia_provider_attempt", "8.2.0"));

console.log("\nPayload");
const built = buildProviderAttemptAnalyticsPayload({
  requestId: "11111111-1111-4111-8111-111111111111",
  analyticsContext: {
    visitor_id: "22222222-2222-4222-8222-222222222222",
    session_id: "33333333-3333-4333-8333-333333333333",
  },
  observation: {
    providerId: "google_shopping",
    providerFamily: MIA_PROVIDER_FAMILIES.SEARCH_ENGINE,
    runtimeMode: MIA_PROVIDER_RUNTIME_MODES.CONTROLLED,
    executionPath: MIA_PROVIDER_EXECUTION_PATHS.LEGACY_CHAIN,
    attemptIndex: 1,
    providerPriority: 3,
    attemptStatus: MIA_PROVIDER_ATTEMPT_STATUSES.SUCCESS,
    durationMs: 1200,
    rawResultsCount: 5,
    normalizedResultsCount: 5,
    contributedResults: true,
    responseUsable: true,
  },
});
assert("payload event", built.payload.event_name === "mia_provider_attempt");
assert("no query_text", built.payload.query_text == null);
assert("metadata version", built.payload.metadata?.event_version === "8.2.0");
assert("provider id stable", built.payload.metadata?.provider_id === "google_shopping");

console.log("\nSanitization");
const secretPayload = buildProviderAttemptAnalyticsPayload({
  requestId: "11111111-1111-4111-8111-111111111111",
  observation: {
    providerId: "google_shopping",
    attemptStatus: MIA_PROVIDER_ATTEMPT_STATUSES.FAILED,
    endpoint: "Bearer sk-secret-token-should-not-leak",
  },
});
const endpointMeta = secretPayload.payload.metadata?.endpoint;
assert("endpoint sanitized or truncated", !String(endpointMeta || "").includes("sk-secret"));

console.log("\nShadow subset");
const shadowObs = materializeShadowProviderAttemptsFromConditionalExecution({
  attempts: [
    {
      providerId: "google_shopping",
      sequenceIndex: 0,
      fetched: true,
      resultStatus: "ok",
      resultCount: 4,
    },
  ],
  skipped: [
    {
      providerId: "apify_mercadolivre",
      sequenceIndex: 1,
      reasonCode: "skipped_prior_sufficient",
    },
  ],
});
assert("shadow attempts mapped", shadowObs.length === 2);
assert("shadow flagged", shadowObs.every((item) => item.shadowObserved === true));

console.log("\nLifecycle bucket");
const bucket = createProviderAttemptAnalyticsBucket({ requestId: "req-a" });
bucket.active = true;
const obs1 = recordProviderAttemptObservation(bucket, {
  providerId: "google_shopping",
  ok: true,
  resultCount: 2,
  eventName: MIA_PROVIDER_ATTEMPT_ANALYTICS_EVENT,
  eventVersion: MIA_PROVIDER_ATTEMPT_ANALYTICS_VERSION,
});
const obs2 = recordProviderAttemptObservation(bucket, {
  providerId: "google_shopping",
  ok: true,
  resultCount: 2,
  eventName: MIA_PROVIDER_ATTEMPT_ANALYTICS_EVENT,
  eventVersion: MIA_PROVIDER_ATTEMPT_ANALYTICS_VERSION,
});
assert("retry creates second attempt", obs1.attemptIndex === 1 && obs2.attemptIndex === 2);
markProviderAttemptObservationEmitted(obs1);
assert("double finalize idempotent", obs1.emitted === true);

console.log("\nIntegration hooks");
const chatSource = readFileSync(CHAT_API, "utf8");
assert("chat imports provider analytics", chatSource.includes("miaProviderAttemptAnalytics"));
assert("legacy observe hook", chatSource.includes("observeLegacyProviderAttempt"));
assert("delivery instrument hook", chatSource.includes("instrumentProviderAttemptAnalyticsForDelivery"));
assert("init hook", chatSource.includes("initializeProviderAttemptAnalyticsTracking"));

console.log("\nSQL files");
for (const file of SPLIT_FILES) {
  const path = join(ANALYTICS_DIR, "sql", file);
  assert(`sql exists ${file}`, existsSync(path));
  const sql = readFileSync(path, "utf8");
  assert(`sql references event ${file}`, sql.includes("mia_provider_attempt"));
}

console.log("\nDomain gate");
initializeProviderAttemptAnalyticsTracking({
  commercialPermission: COMMERCIAL_PERMISSION.DENY,
  interactionMode: MIA_INTERACTION_MODES.SOCIAL,
});
assert("deny does not activate bucket by default", observeLegacyProviderAttempt({ providerId: "google_shopping", ok: true, resultCount: 1 }) == null);

console.log(`\nResultado: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
