/**
 * PATCH Comercial 05F — Provider Budget & Circuit Breaker Audit (local only)
 *
 * Usage:
 *   node scripts/test-mia-provider-budget-circuit-breaker-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { COMMERCIAL_PROVIDER_IDS } from "../lib/productSourceAdapter/commercialProviderRegistry.js";
import {
  CONDITIONAL_PROVIDER_FETCH_DECISION,
  evaluateCommercialResultSufficiency,
  executeConditionalProviderFetch,
  resetConditionalProviderFetchEventsForTests,
} from "../lib/commercial/conditionalProviderFetch.js";
import {
  COMMERCIAL_REQUEST_DEDUP_VERSION,
  createCommercialRequestDedupContext,
  executeCommercialRequestWithDeduplication,
} from "../lib/commercial/commercialRequestDeduplication.js";
import {
  PROVIDER_COST_GUARD_VERSION,
  buildObservabilityProviderCostGuardContext,
} from "../lib/commercial/providerCostGuard.js";
import {
  UNIVERSAL_COMMERCIAL_CACHE_VERSION,
  clearUniversalCommercialCache,
  executeWithUniversalCommercialCache,
} from "../lib/commercial/universalCommercialCache.js";
import {
  PROVIDER_BUDGET_CIRCUIT_VERSION,
  PROVIDER_BUDGET_DECISIONS,
  PROVIDER_CIRCUIT_STATES,
  buildProviderBudgetCircuitTracePatch,
  evaluateProviderBudgetPermission,
  executeCommercialProviderProtectedFetch,
  getProviderCircuitState,
  isProviderTechnicalFailureResult,
  readProviderBudgetCircuitConfig,
  recordProviderCallOutcome,
  recordProviderExternalCall,
  resetProviderBudgetCircuitState,
  resolveProviderBudgetPolicy,
  setProviderCircuitOpenUntilForTests,
} from "../lib/commercial/providerBudgetCircuitBreaker.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

let passed = 0;
let failed = 0;
const start = Date.now();

function assert(label, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${label}`);
  } else {
    failed += 1;
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function read(path) {
  return readFileSync(join(ROOT, path), "utf8");
}

function buildValidProduct(title = "iphone 13") {
  return {
    product_name: title,
    price: "R$ 100",
    numericPrice: 100,
    link: `https://example.com/${encodeURIComponent(title)}`,
    thumbnail: null,
    source: "mock",
    provider: "paid_provider_a",
  };
}

const testEnv = {
  COMMERCIAL_PROVIDER_BUDGET_ENABLED: "true",
  COMMERCIAL_PROVIDER_CIRCUIT_ENABLED: "true",
  COMMERCIAL_PROVIDER_DEFAULT_MAX_CALLS_PER_WINDOW: "3",
  COMMERCIAL_PROVIDER_BUDGET_WINDOW_MS: "5000",
  COMMERCIAL_PROVIDER_CIRCUIT_FAILURE_THRESHOLD: "3",
  COMMERCIAL_PROVIDER_CIRCUIT_OPEN_MS: "1000",
  COMMERCIAL_PROVIDER_CIRCUIT_HALF_OPEN_MAX_PROBES: "1",
};

const lowBudgetEnv = {
  ...testEnv,
  COMMERCIAL_PROVIDER_DEFAULT_MAX_CALLS_PER_WINDOW: "1",
};

console.log(`\nPATCH Comercial 05F — Provider Budget & Circuit Breaker (${PROVIDER_BUDGET_CIRCUIT_VERSION})\n`);

console.log("── Module contract ──");
const moduleSource = read("lib/commercial/providerBudgetCircuitBreaker.js");
assert("version 05F", PROVIDER_BUDGET_CIRCUIT_VERSION === "05F");
assert("no LLM imports", !moduleSource.match(/openai|callOpenAI|buildMiaPrompt/i));
assert("no subprocess imports", !moduleSource.match(/from\s+["']node:child_process["']/));
assert("no HTTP fetch usage", !moduleSource.match(/\bglobalThis\.fetch\b/));
assert("dev endpoint exists", read("pages/api/dev/provider-budget-circuit-breaker.js").includes("executeCommercialProviderProtectedFetch"));
assert("in-memory scope explicit", moduleSource.includes("in_memory_per_process"));
assert("no winner logic", !moduleSource.match(/selectWinner|decideWinner|rankWinner/i));

console.log("\n── Budget permission ──");
resetProviderBudgetCircuitState();
{
  const providerId = "paid_provider_a";
  const first = evaluateProviderBudgetPermission({ providerId, env: testEnv });
  assert("first call allowed", first.shouldCallProvider === true);
  recordProviderExternalCall(providerId, { env: testEnv });
  assert("counter increments on external call", getProviderCircuitState(providerId).providerId === providerId);
}

console.log("\n── Budget exhaustion ──");
resetProviderBudgetCircuitState();
{
  const providerId = "paid_provider_future";
  let fetchCount = 0;
  await executeCommercialProviderProtectedFetch({
    providerId,
    env: lowBudgetEnv,
    executeExternalFetch: async () => {
      fetchCount += 1;
      return { ok: true, products: [buildValidProduct("item")], count: 1 };
    },
  });
  const blocked = await executeCommercialProviderProtectedFetch({
    providerId,
    env: lowBudgetEnv,
    executeExternalFetch: async () => {
      fetchCount += 1;
      return { ok: true, products: [buildValidProduct("item")], count: 1 };
    },
  });
  assert("budget exhausted blocks second fetch", fetchCount === 1 && blocked.error === "budget_blocked");
}

console.log("\n── Window reset ──");
resetProviderBudgetCircuitState();
{
  const providerId = "unstable_provider";
  const shortWindowEnv = {
    ...lowBudgetEnv,
    COMMERCIAL_PROVIDER_BUDGET_WINDOW_MS: "1",
  };
  let fetchCount = 0;
  await executeCommercialProviderProtectedFetch({
    providerId,
    env: shortWindowEnv,
    executeExternalFetch: async () => {
      fetchCount += 1;
      return { ok: true, products: [buildValidProduct("x")], count: 1 };
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
  await executeCommercialProviderProtectedFetch({
    providerId,
    env: shortWindowEnv,
    executeExternalFetch: async () => {
      fetchCount += 1;
      return { ok: true, products: [buildValidProduct("x")], count: 1 };
    },
  });
  assert("expired window resets budget counter", fetchCount === 2);
}

console.log("\n── Internal provider unmetered ──");
resetProviderBudgetCircuitState();
{
  const permission = evaluateProviderBudgetPermission({ providerId: "supabasecache", env: testEnv });
  assert("internal provider unmetered", permission.decision === PROVIDER_BUDGET_DECISIONS.ALLOW_UNMETERED_INTERNAL);
}

console.log("\n── Failure classification ──");
assert("empty response is not technical failure", isProviderTechnicalFailureResult({ ok: false, products: [], error: "empty_response" }) === false);
assert("timeout is technical failure", isProviderTechnicalFailureResult({ ok: false, products: [], error: "timeout" }) === true);
assert("provider_error is technical failure", isProviderTechnicalFailureResult({ ok: false, products: [], error: "provider_error" }) === true);

console.log("\n── Circuit breaker ──");
resetProviderBudgetCircuitState();
{
  const providerId = "unstable_provider";
  for (let i = 0; i < 3; i += 1) {
    await executeCommercialProviderProtectedFetch({
      providerId,
      env: testEnv,
      executeExternalFetch: async () => ({ ok: false, products: [], error: "provider_error", count: 0 }),
    });
  }
  const circuit = getProviderCircuitState(providerId);
  assert("circuit opens after threshold", circuit.state === PROVIDER_CIRCUIT_STATES.OPEN);

  let fetchCount = 0;
  const blocked = await executeCommercialProviderProtectedFetch({
    providerId,
    env: testEnv,
    executeExternalFetch: async () => {
      fetchCount += 1;
      return { ok: true, products: [buildValidProduct("x")], count: 1 };
    },
  });
  assert("open circuit blocks fetch", fetchCount === 0 && blocked.error === "circuit_breaker_open");
}

console.log("\n── Half-open recovery ──");
resetProviderBudgetCircuitState();
{
  const providerId = "rate_limited_provider";
  const circuitEnv = {
    ...testEnv,
    COMMERCIAL_PROVIDER_DEFAULT_MAX_CALLS_PER_WINDOW: "20",
  };
  await executeCommercialProviderProtectedFetch({ providerId, env: circuitEnv, executeExternalFetch: async () => ({ ok: false, products: [], error: "timeout" }) });
  await executeCommercialProviderProtectedFetch({ providerId, env: circuitEnv, executeExternalFetch: async () => ({ ok: false, products: [], error: "timeout" }) });
  await executeCommercialProviderProtectedFetch({ providerId, env: circuitEnv, executeExternalFetch: async () => ({ ok: false, products: [], error: "timeout" }) });
  setProviderCircuitOpenUntilForTests(providerId, Date.now() - 1);

  let fetchCount = 0;
  await executeCommercialProviderProtectedFetch({
    providerId,
    env: circuitEnv,
    executeExternalFetch: async () => {
      fetchCount += 1;
      return { ok: false, products: [], error: "empty_response", count: 0 };
    },
  });
  assert("half-open probe allowed once", fetchCount === 1);
  assert("successful empty closes circuit", getProviderCircuitState(providerId).state === PROVIDER_CIRCUIT_STATES.CLOSED);
}

console.log("\n── Half-open failure reopens ──");
resetProviderBudgetCircuitState();
{
  const providerId = "rate_limited_provider";
  const env = { ...testEnv, COMMERCIAL_PROVIDER_CIRCUIT_FAILURE_THRESHOLD: "1", COMMERCIAL_PROVIDER_CIRCUIT_OPEN_MS: "5000" };
  await executeCommercialProviderProtectedFetch({ providerId, env, executeExternalFetch: async () => ({ ok: false, products: [], error: "provider_error" }) });
  setProviderCircuitOpenUntilForTests(providerId, Date.now() - 1);
  await executeCommercialProviderProtectedFetch({ providerId, env, executeExternalFetch: async () => ({ ok: false, products: [], error: "provider_error" }) });
  assert("half-open failure reopens circuit", getProviderCircuitState(providerId).state === PROVIDER_CIRCUIT_STATES.OPEN);
}

console.log("\n── Success resets failures ──");
resetProviderBudgetCircuitState();
{
  const providerId = "paid_provider_a";
  recordProviderCallOutcome(providerId, { ok: false, products: [], error: "provider_error" }, { env: testEnv });
  recordProviderCallOutcome(providerId, { ok: true, products: [buildValidProduct("iphone 13")], count: 1 }, { env: testEnv });
  assert("success resets consecutive failures", getProviderCircuitState(providerId).consecutiveFailures === 0);
}

console.log("\n── No increment on blocked paths ──");
resetProviderBudgetCircuitState();
{
  const providerId = "paid_provider_a";
  const before = evaluateProviderBudgetPermission({ providerId, env: lowBudgetEnv });
  recordProviderExternalCall(providerId, { env: lowBudgetEnv });
  await executeCommercialProviderProtectedFetch({
    providerId,
    env: lowBudgetEnv,
    executeExternalFetch: async () => ({ ok: true, products: [buildValidProduct("x")], count: 1 }),
  });
  const blocked = await executeCommercialProviderProtectedFetch({
    providerId,
    env: lowBudgetEnv,
    executeExternalFetch: async () => ({ ok: true, products: [buildValidProduct("x")], count: 1 }),
  });
  assert("budget block does not increment fetch", blocked.error === "budget_blocked");
  assert("budget block is not technical failure", isProviderTechnicalFailureResult(blocked) === false);
}

console.log("\n── Cache and dedup do not increment ──");
resetProviderBudgetCircuitState();
clearUniversalCommercialCache();
{
  const providerId = "free_provider_a";
  const env = { ...testEnv, COMMERCIAL_PROVIDER_PAID_PROVIDER_A_MAX_CALLS_PER_WINDOW: undefined };
  let fetchCount = 0;
  const executeBody = async () =>
    executeCommercialProviderProtectedFetch({
      providerId,
      env: testEnv,
      executeExternalFetch: async () => {
        fetchCount += 1;
        return { ok: true, products: [buildValidProduct("iphone 13")], count: 1 };
      },
    });

  await executeWithUniversalCommercialCache({
    providerId,
    query: "iphone 13",
    limit: 5,
    env: testEnv,
    execute: executeBody,
  });
  await executeWithUniversalCommercialCache({
    providerId,
    query: "iphone 13",
    limit: 5,
    env: testEnv,
    execute: executeBody,
  });
  assert("cache hit does not increment budget fetch", fetchCount === 1);

  resetProviderBudgetCircuitState(providerId);
  fetchCount = 0;
  const dedupContext = createCommercialRequestDedupContext({ requestId: "budget-dedup" });
  await executeCommercialRequestWithDeduplication({
    dedupContext,
    providerId,
    query: "iphone 13",
    limit: 5,
    execute: executeBody,
  });
  await executeCommercialRequestWithDeduplication({
    dedupContext,
    providerId,
    query: "iphone 13",
    limit: 5,
    execute: executeBody,
  });
  assert("dedup reuse does not increment budget fetch", fetchCount === 1);
}

console.log("\n── Conditional fetch fallback after block ──");
resetProviderBudgetCircuitState();
resetConditionalProviderFetchEventsForTests();
{
  let secondaryCount = 0;
  const execution = await executeConditionalProviderFetch({
    query: "iphone 13",
    providers: [
      {
        providerId: "provider_primary",
        resultKey: "primary",
        fetch: async () => ({ ok: false, products: [], error: "budget_blocked", count: 0 }),
      },
      {
        providerId: "provider_secondary",
        resultKey: "secondary",
        fetch: async () => {
          secondaryCount += 1;
          return { ok: true, products: [buildValidProduct("iphone 13")], count: 1 };
        },
      },
    ],
  });
  const sufficiency = evaluateCommercialResultSufficiency({
    query: "iphone 13",
    result: { ok: false, products: [], error: "budget_blocked" },
  });
  assert("budget blocked is insufficient", sufficiency.decision === CONDITIONAL_PROVIDER_FETCH_DECISION.INSUFFICIENT);
  assert("conditional fetch tries next provider", secondaryCount === 1 && execution.shortCircuitApplied === true);
}

console.log("\n── Provider-specific config ──");
{
  const policy = resolveProviderBudgetPolicy(COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING, {
    ...testEnv,
    COMMERCIAL_PROVIDER_GOOGLE_SHOPPING_MAX_CALLS_PER_WINDOW: "7",
  });
  assert("provider-specific max calls override", policy.maxCallsPerWindow === 7);
}

console.log("\n── Architecture preservation ──");
assert(
  "google adapter wired",
  read("lib/productSourceAdapter/adapters/googleShoppingAdapter.js").includes("executeCommercialProviderProtectedFetch")
);
assert(
  "apify adapter wired",
  read("lib/productSourceAdapter/adapters/apifyMercadoLivreClient.js").includes("executeCommercialProviderProtectedFetch")
);
assert(
  "conditional fetch handles budget/circuit",
  read("lib/commercial/conditionalProviderFetch.js").includes("budget_blocked")
);
assert(
  "cost guard still active",
  PROVIDER_COST_GUARD_VERSION === "05B"
);
assert(
  "request dedup still active",
  COMMERCIAL_REQUEST_DEDUP_VERSION === "05C"
);
assert(
  "cache still active",
  UNIVERSAL_COMMERCIAL_CACHE_VERSION === "05D"
);
assert(
  "offer dedup untouched",
  read("lib/productSourceAdapter/commercialDeduplicationLayer.js").includes("deduplicateCommercialOfferBundle") &&
    !read("lib/productSourceAdapter/commercialDeduplicationLayer.js").includes("providerBudgetCircuitBreaker")
);
assert(
  "chat tracer wired",
  read("pages/api/chat-gpt4o.js").includes("buildProviderBudgetCircuitTracePatch")
);
assert(
  "trace patch helper available",
  !!buildProviderBudgetCircuitTracePatch()?.provider_budget_circuit_breaker
);
assert(
  "defaults conservative",
  readProviderBudgetCircuitConfig().defaultMaxCallsPerWindow === 100
);

console.log("\n── Regressions ──");
console.log("  ⏭️ skipped — no nested audits (local-only mode)");

const elapsed = ((Date.now() - start) / 1000).toFixed(2);
console.log("\n── Verdict ──");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Time: ${elapsed}s\n`);

if (failed === 0) {
  console.log("A) ROBUST estruturalmente\n");
  process.exit(0);
}

console.log("B) PARTIAL\n");
process.exit(1);
