/**
 * PATCH Comercial 05E — Conditional Provider Fetch Audit (local only)
 *
 * Usage:
 *   node scripts/test-mia-conditional-provider-fetch-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { COMMERCIAL_PROVIDER_IDS } from "../lib/productSourceAdapter/commercialProviderRegistry.js";
import {
  COMMERCIAL_REQUEST_DEDUP_VERSION,
  createCommercialRequestDedupContext,
  executeCommercialRequestWithDeduplication,
} from "../lib/commercial/commercialRequestDeduplication.js";
import {
  PROVIDER_COST_GUARD_VERSION,
  buildFunctionalProviderCostGuardContext,
} from "../lib/commercial/providerCostGuard.js";
import {
  UNIVERSAL_COMMERCIAL_CACHE_VERSION,
  clearUniversalCommercialCache,
  executeWithUniversalCommercialCache,
} from "../lib/commercial/universalCommercialCache.js";
import {
  CONDITIONAL_PROVIDER_FETCH_DECISION,
  CONDITIONAL_PROVIDER_FETCH_REASON_CODES,
  CONDITIONAL_PROVIDER_FETCH_VERSION,
  buildConditionalProviderFetchPlan,
  buildConditionalProviderFetchTracePatch,
  evaluateCommercialResultSufficiency,
  executeConditionalProviderFetch,
  resetConditionalProviderFetchEventsForTests,
  shouldContinueCommercialProviderFetch,
} from "../lib/commercial/conditionalProviderFetch.js";
import { runCommercialShadowPipeline } from "../lib/productSourceAdapter/commercialRuntimeShadow.js";

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

function buildValidProduct(title = "item", provider = "provider_primary") {
  return {
    product_name: title,
    price: "R$ 100",
    numericPrice: 100,
    link: `https://example.com/${encodeURIComponent(title)}`,
    thumbnail: null,
    source: provider,
    provider,
  };
}

const functionalContext = buildFunctionalProviderCostGuardContext({
  invocationSource: "audit_conditional_fetch",
});

const shadowPipelineEnv = {
  SERPAPI_KEY: "audit-test-key",
  APIFY_API_TOKEN: "audit-test-token",
};

console.log(`\nPATCH Comercial 05E — Conditional Provider Fetch (${CONDITIONAL_PROVIDER_FETCH_VERSION})\n`);

console.log("── Module contract ──");
const moduleSource = read("lib/commercial/conditionalProviderFetch.js");
assert("version 05E", CONDITIONAL_PROVIDER_FETCH_VERSION === "05E");
assert("no LLM imports", !moduleSource.match(/openai|callOpenAI|buildMiaPrompt/i));
assert("no subprocess imports", !moduleSource.match(/from\s+["']node:child_process["']/));
assert("no HTTP fetch usage", !moduleSource.match(/\bglobalThis\.fetch\b|import\s*\{[^}]*\bfetch\b/));
assert("dev endpoint exists", read("pages/api/dev/conditional-provider-fetch.js").includes("executeConditionalProviderFetch"));
assert("no winner logic", !moduleSource.match(/selectWinner|decideWinner|rankWinner/i));

console.log("\n── Provider plan from registry ──");
const plan = buildConditionalProviderFetchPlan();
assert("plan uses registry order", plan[0]?.providerId === COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING);
assert("plan includes enabled providers", plan.some((entry) => entry.providerId === COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE));
assert("plan preserves sequence index", plan.every((entry, index) => entry.sequenceIndex === index));

console.log("\n── Sufficiency evaluation ──");
for (const query of [
  "iphone 13",
  "pelicula iphone 13",
  "controle play",
  "monitor gamer",
  "ssd externo",
  "cadeira gamer",
  "webcam",
]) {
  const sufficient = evaluateCommercialResultSufficiency({
    query,
    result: { ok: true, products: [buildValidProduct(query)] },
  });
  assert(`valid offer sufficient for "${query}"`, sufficient.decision === CONDITIONAL_PROVIDER_FETCH_DECISION.SUFFICIENT);
}

assert(
  "empty result insufficient",
  evaluateCommercialResultSufficiency({
    query: "iphone 13",
    result: { ok: false, products: [], error: "empty_response" },
  }).decision === CONDITIONAL_PROVIDER_FETCH_DECISION.INSUFFICIENT
);
assert(
  "error insufficient",
  evaluateCommercialResultSufficiency({
    query: "iphone 13",
    result: { ok: false, products: [], error: "provider_error" },
  }).reasonCode === CONDITIONAL_PROVIDER_FETCH_REASON_CODES.PROVIDER_ERROR
);
assert(
  "timeout insufficient",
  evaluateCommercialResultSufficiency({
    query: "iphone 13",
    result: { ok: false, products: [], error: "timeout" },
  }).reasonCode === CONDITIONAL_PROVIDER_FETCH_REASON_CODES.TIMEOUT
);
assert(
  "blocked insufficient",
  evaluateCommercialResultSufficiency({
    query: "iphone 13",
    result: { ok: false, products: [], error: "cost_guard_blocked" },
  }).reasonCode === CONDITIONAL_PROVIDER_FETCH_REASON_CODES.COST_GUARD_BLOCKED
);
assert(
  "dry-run insufficient",
  evaluateCommercialResultSufficiency({
    query: "iphone 13",
    result: { ok: false, products: [], costGuardDecision: { decision: "dry_run" } },
  }).reasonCode === CONDITIONAL_PROVIDER_FETCH_REASON_CODES.DRY_RUN
);
assert(
  "cache hit sufficient when offers valid",
  evaluateCommercialResultSufficiency({
    query: "iphone 13",
    result: {
      ok: true,
      products: [buildValidProduct("iphone 13")],
      universalCommercialCacheHit: true,
    },
  }).decision === CONDITIONAL_PROVIDER_FETCH_DECISION.SUFFICIENT
);

console.log("\n── Conditional execution ──");
resetConditionalProviderFetchEventsForTests();

{
  let primaryCount = 0;
  let secondaryCount = 0;
  const execution = await executeConditionalProviderFetch({
    query: "iphone 13",
    providers: [
      {
        providerId: "provider_primary",
        resultKey: "primary",
        fetch: async () => {
          primaryCount += 1;
          return { ok: true, products: [buildValidProduct("iphone 13")], count: 1 };
        },
      },
      {
        providerId: "provider_secondary",
        resultKey: "secondary",
        fetch: async () => {
          secondaryCount += 1;
          return { ok: true, products: [buildValidProduct("iphone 13 pro")], count: 1 };
        },
      },
    ],
  });

  assert("sufficient first provider short-circuits second", primaryCount === 1 && secondaryCount === 0);
  assert("short-circuit flag set", execution.shortCircuitApplied === true);
  assert("secondary marked skipped", execution.results.secondary?.skipped === true);
}

{
  resetConditionalProviderFetchEventsForTests();
  let primaryCount = 0;
  let secondaryCount = 0;
  await executeConditionalProviderFetch({
    query: "monitor gamer",
    providers: [
      {
        providerId: "provider_primary",
        resultKey: "primary",
        fetch: async () => {
          primaryCount += 1;
          return { ok: false, products: [], error: "empty_response", count: 0 };
        },
      },
      {
        providerId: "provider_secondary",
        resultKey: "secondary",
        fetch: async () => {
          secondaryCount += 1;
          return { ok: true, products: [buildValidProduct("monitor gamer")], count: 1 };
        },
      },
    ],
  });
  assert("empty first provider triggers second", primaryCount === 1 && secondaryCount === 1);
}

{
  resetConditionalProviderFetchEventsForTests();
  let secondaryCount = 0;
  await executeConditionalProviderFetch({
    query: "controle play",
    providers: [
      {
        providerId: "provider_primary",
        resultKey: "primary",
        fetch: async () => ({ ok: false, products: [], error: "provider_error", count: 0 }),
      },
      {
        providerId: "provider_secondary",
        resultKey: "secondary",
        fetch: async () => {
          secondaryCount += 1;
          return { ok: true, products: [buildValidProduct("controle play")], count: 1 };
        },
      },
    ],
  });
  assert("error first provider triggers second", secondaryCount === 1);
}

{
  resetConditionalProviderFetchEventsForTests();
  let secondaryCount = 0;
  await executeConditionalProviderFetch({
    query: "ssd externo",
    providers: [
      {
        providerId: "blocked_provider",
        resultKey: "primary",
        fetch: async () => ({ ok: false, products: [], error: "cost_guard_blocked", count: 0 }),
      },
      {
        providerId: "provider_secondary",
        resultKey: "secondary",
        fetch: async () => {
          secondaryCount += 1;
          return { ok: true, products: [buildValidProduct("ssd externo")], count: 1 };
        },
      },
    ],
  });
  assert("blocked first provider allows second", secondaryCount === 1);
}

{
  resetConditionalProviderFetchEventsForTests();
  clearUniversalCommercialCache();
  let secondaryCount = 0;
  const cachedResult = { ok: true, products: [buildValidProduct("iphone 13")], count: 1 };
  await executeWithUniversalCommercialCache({
    providerId: "paid_provider_a",
    query: "iphone 13",
    limit: 5,
    costGuardContext: functionalContext,
    execute: async () => cachedResult,
  });
  await executeConditionalProviderFetch({
    query: "iphone 13",
    providers: [
      {
        providerId: "paid_provider_a",
        resultKey: "primary",
        fetch: async () =>
          executeWithUniversalCommercialCache({
            providerId: "paid_provider_a",
            query: "iphone 13",
            limit: 5,
            costGuardContext: functionalContext,
            execute: async () => cachedResult,
          }),
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
  assert("cache hit sufficient prevents second provider", secondaryCount === 0);
}

{
  resetConditionalProviderFetchEventsForTests();
  clearUniversalCommercialCache();
  let secondaryCount = 0;
  const emptyCached = { ok: false, products: [], error: "empty_response", count: 0 };
  await executeWithUniversalCommercialCache({
    providerId: "free_provider_a",
    query: "pelicula iphone 13",
    limit: 5,
    costGuardContext: functionalContext,
    execute: async () => emptyCached,
  });
  await executeConditionalProviderFetch({
    query: "pelicula iphone 13",
    providers: [
      {
        providerId: "free_provider_a",
        resultKey: "primary",
        fetch: async () =>
          executeWithUniversalCommercialCache({
            providerId: "free_provider_a",
            query: "pelicula iphone 13",
            limit: 5,
            costGuardContext: functionalContext,
            execute: async () => emptyCached,
          }),
      },
      {
        providerId: "provider_secondary",
        resultKey: "secondary",
        fetch: async () => {
          secondaryCount += 1;
          return { ok: true, products: [buildValidProduct("pelicula iphone 13")], count: 1 };
        },
      },
    ],
  });
  assert("cache hit empty allows second provider", secondaryCount === 1);
}

console.log("\n── Shadow pipeline integration (mocked) ──");
{
  resetConditionalProviderFetchEventsForTests();
  let googleCount = 0;
  let apifyCount = 0;

  const sufficientShadow = await runCommercialShadowPipeline({
    query: "iphone 13",
    limit: 5,
    costGuardContext: functionalContext,
    env: shadowPipelineEnv,
    fetchGoogle: async () => {
      googleCount += 1;
      return { ok: true, products: [buildValidProduct("iphone 13", COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING)], count: 1 };
    },
    fetchApify: async () => {
      apifyCount += 1;
      return { ok: true, products: [buildValidProduct("iphone 13", COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE)], count: 1 };
    },
  });

  assert("shadow short-circuits apify when google sufficient", googleCount === 1 && apifyCount === 0);
  assert("shadow conditional trace present", !!sufficientShadow.trace?.conditional_provider_fetch);
  assert("shadow merge still available", !!sufficientShadow.trace?.merge);

  const fallbackShadow = await runCommercialShadowPipeline({
    query: "galaxy a55",
    limit: 5,
    costGuardContext: functionalContext,
    env: shadowPipelineEnv,
    fetchGoogle: async () => {
      googleCount += 1;
      return { ok: false, products: [], error: "empty_response", count: 0 };
    },
    fetchApify: async () => {
      apifyCount += 1;
      return { ok: true, products: [buildValidProduct("galaxy a55", COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE)], count: 1 };
    },
  });

  assert("shadow calls apify when google empty", apifyCount === 1);
  assert("shadow fallback still selects offer", fallbackShadow.offerCount >= 1);
}

console.log("\n── Integration with 05C dedup ──");
{
  resetConditionalProviderFetchEventsForTests();
  const dedupContext = createCommercialRequestDedupContext({ requestId: "audit-05e-dedup" });
  let fetchCount = 0;
  await executeCommercialRequestWithDeduplication({
    dedupContext,
    providerId: "provider_primary",
    query: "webcam",
    limit: 5,
    costGuardContext: functionalContext,
    execute: async () =>
      executeConditionalProviderFetch({
        query: "webcam",
        providers: [
          {
            providerId: "provider_primary",
            resultKey: "primary",
            fetch: async () => {
              fetchCount += 1;
              return { ok: true, products: [buildValidProduct("webcam")], count: 1 };
            },
          },
          {
            providerId: "provider_secondary",
            resultKey: "secondary",
            fetch: async () => ({ ok: true, products: [buildValidProduct("webcam alt")], count: 1 }),
          },
        ],
      }),
  });
  assert("dedup layer remains compatible", fetchCount === 1);
}

console.log("\n── Architecture preservation ──");
assert(
  "shadow uses conditional fetch",
  read("lib/productSourceAdapter/commercialRuntimeShadow.js").includes("executeConditionalProviderFetch")
);
assert(
  "shadow no longer uses Promise.all for providers",
  !read("lib/productSourceAdapter/commercialRuntimeShadow.js").match(/Promise\.all\(\[\s*fetchGoogle/)
);
assert(
  "selection engine untouched",
  read("lib/productSourceAdapter/commercialSelectionEngine.js").includes("selectCommercialOffers") &&
    !read("lib/productSourceAdapter/commercialSelectionEngine.js").includes("conditionalProviderFetch")
);
assert(
  "offer merge untouched",
  read("lib/productSourceAdapter/commercialOfferMergeLayer.js").includes("mergeCommercialOfferBundle")
);
assert(
  "request dedup still active",
  COMMERCIAL_REQUEST_DEDUP_VERSION === "05C"
);
assert(
  "universal cache still active",
  UNIVERSAL_COMMERCIAL_CACHE_VERSION === "05D"
);
assert(
  "provider cost guard still active",
  PROVIDER_COST_GUARD_VERSION === "05B"
);
assert(
  "chat tracer wired",
  read("pages/api/chat-gpt4o.js").includes("buildConditionalProviderFetchTracePatch")
);
assert(
  "trace patch helper available",
  !!buildConditionalProviderFetchTracePatch()?.conditional_provider_fetch
);
assert(
  "shouldContinue reflects sufficiency",
  shouldContinueCommercialProviderFetch({
    query: "iphone 13",
    result: { ok: false, products: [], error: "empty_response" },
  }) === true
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
