/**
 * PATCH Comercial 05D — Universal Commercial Cache Layer Audit (local only)
 *
 * Usage:
 *   node scripts/test-mia-universal-commercial-cache-layer-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { COMMERCIAL_PROVIDER_IDS } from "../lib/productSourceAdapter/commercialProviderRegistry.js";
import { COMMERCIAL_RUNTIME_MODES } from "../lib/productSourceAdapter/commercialRuntimeMode.js";
import {
  COMMERCIAL_REQUEST_DEDUP_VERSION,
  createCommercialRequestDedupContext,
  executeCommercialRequestWithDeduplication,
} from "../lib/commercial/commercialRequestDeduplication.js";
import {
  PROVIDER_COST_GUARD_VERSION,
  buildFunctionalProviderCostGuardContext,
  buildObservabilityProviderCostGuardContext,
} from "../lib/commercial/providerCostGuard.js";
import {
  UNIVERSAL_COMMERCIAL_CACHE_REASON_CODES,
  UNIVERSAL_COMMERCIAL_CACHE_STATUS,
  UNIVERSAL_COMMERCIAL_CACHE_VERSION,
  buildUniversalCommercialCacheDiagnostics,
  buildUniversalCommercialCacheKey,
  buildUniversalCommercialCacheTracePatch,
  clearUniversalCommercialCache,
  executeWithUniversalCommercialCache,
  getUniversalCommercialCacheEntry,
  readUniversalCommercialCacheConfig,
  resolveUniversalCommercialCacheTtl,
  shouldCacheCommercialResult,
} from "../lib/commercial/universalCommercialCache.js";
import { fetchGoogleShoppingAdapterResult } from "../lib/productSourceAdapter/adapters/googleShoppingAdapter.js";
import { searchApifyMercadoLivreProducts } from "../lib/productSourceAdapter/adapters/apifyMercadoLivreClient.js";

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

function buildMockProduct(title = "item") {
  return {
    product_name: title,
    price: "R$ 100",
    link: "https://example.com/item",
    thumbnail: null,
    source: "mock",
  };
}

const functionalContext = buildFunctionalProviderCostGuardContext({
  invocationSource: "audit_functional",
  runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
});

const observabilityContext = buildObservabilityProviderCostGuardContext({
  invocationSource: "audit_observability",
  hasExplicitPaidProviderOptIn: false,
});

console.log(
  `\nPATCH Comercial 05D — Universal Commercial Cache Layer (${UNIVERSAL_COMMERCIAL_CACHE_VERSION})\n`
);

console.log("── Module contract ──");
const moduleSource = read("lib/commercial/universalCommercialCache.js");
assert("version 05D", UNIVERSAL_COMMERCIAL_CACHE_VERSION === "05D");
assert("no LLM imports", !moduleSource.match(/openai|callOpenAI|buildMiaPrompt/i));
assert("no subprocess imports", !moduleSource.match(/from\s+["']node:child_process["']/));
assert("no fetch in cache module", !moduleSource.match(/\bfetch\s*\(/));
assert("dev endpoint exists", read("pages/api/dev/universal-commercial-cache.js").includes("executeWithUniversalCommercialCache"));
assert("in-memory scope explicit", moduleSource.includes("in_memory_per_process"));
assert("not distributed", moduleSource.includes("distributed: false"));

console.log("\n── Canonical key ──");
clearUniversalCommercialCache();
const keyA = buildUniversalCommercialCacheKey({
  providerId: "paid_provider_a",
  query: "  IPHONE   13  ",
  limit: 5,
  costGuardContext: functionalContext,
});
const keyB = buildUniversalCommercialCacheKey({
  providerId: "paid_provider_a",
  query: "iphone 13",
  limit: 5,
  costGuardContext: functionalContext,
});
const keyPro = buildUniversalCommercialCacheKey({
  providerId: "paid_provider_a",
  query: "iphone 13 pro",
  limit: 5,
  costGuardContext: functionalContext,
});
const keyMarket = buildUniversalCommercialCacheKey({
  providerId: "paid_provider_a",
  query: "iphone 13",
  limit: 5,
  market: "us",
  costGuardContext: functionalContext,
});
const keyPolicy = buildUniversalCommercialCacheKey({
  providerId: "paid_provider_a",
  query: "iphone 13",
  limit: 5,
  costGuardContext: observabilityContext,
});

assert("case/spacing normalized keys match", keyA === keyB);
assert("different models do not collide", keyA !== keyPro);
assert("market difference changes key", keyA !== keyMarket);
assert("policy difference changes key", keyA !== keyPolicy);

for (const query of [
  "galaxy a55",
  "pelicula iphone 13",
  "controle play",
  "monitor gamer",
  "ssd externo",
]) {
  assert(`key stable for "${query}"`, buildUniversalCommercialCacheKey({
    providerId: "free_provider_a",
    query,
    limit: 5,
  }).includes("free_provider_a"));
}

console.log("\n── Cache miss / hit ──");
{
  clearUniversalCommercialCache();
  let fetchCount = 0;
  const input = {
    providerId: "paid_provider_a",
    query: "iphone 13",
    limit: 5,
    costGuardContext: functionalContext,
    execute: async () => {
      fetchCount += 1;
      return { ok: true, products: [buildMockProduct("iphone 13")], count: 1 };
    },
  };

  const first = await executeWithUniversalCommercialCache(input);
  const second = await executeWithUniversalCommercialCache({
    ...input,
    query: "IPHONE 13",
    execute: async () => {
      fetchCount += 1;
      return { ok: true, products: [buildMockProduct("should_not_run")], count: 1 };
    },
  });

  assert("first read is miss (fetch once)", fetchCount === 1);
  assert("second read is cache hit", second.universalCommercialCacheHit === true);
  assert("hit preserves contract count", second.count === 1);
  assert("hit prevents external execution", fetchCount === 1);
}

console.log("\n── TTL expiration ──");
{
  clearUniversalCommercialCache();
  let fetchCount = 0;
  const env = { COMMERCIAL_CACHE_TTL_MS: "40", COMMERCIAL_EMPTY_CACHE_TTL_MS: "20" };

  await executeWithUniversalCommercialCache({
    providerId: "paid_provider_a",
    query: "monitor gamer",
    limit: 5,
    costGuardContext: functionalContext,
    env,
    execute: async () => {
      fetchCount += 1;
      return { ok: true, products: [buildMockProduct("monitor gamer")], count: 1 };
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 60));

  await executeWithUniversalCommercialCache({
    providerId: "paid_provider_a",
    query: "monitor gamer",
    limit: 5,
    costGuardContext: functionalContext,
    env,
    execute: async () => {
      fetchCount += 1;
      return { ok: true, products: [buildMockProduct("monitor gamer")], count: 1 };
    },
  });

  assert("stale entry triggers new fetch", fetchCount === 2);
}

console.log("\n── TTL by result type ──");
{
  const config = readUniversalCommercialCacheConfig();
  assert(
    "offers ttl default 5 min",
    resolveUniversalCommercialCacheTtl({ ok: true, products: [{ title: "x" }] }, config) === 300_000
  );
  assert(
    "empty ttl default 45 sec",
    resolveUniversalCommercialCacheTtl({ ok: false, products: [], error: "empty_response" }, config) === 45_000
  );
}

console.log("\n── Non-cacheable results ──");
{
  clearUniversalCommercialCache();
  assert(
    "provider_error not cacheable",
    shouldCacheCommercialResult({ ok: false, products: [], error: "provider_error" }).cacheable === false
  );
  assert(
    "timeout not cacheable",
    shouldCacheCommercialResult({ ok: false, products: [], error: "timeout" }).cacheable === false
  );
  assert(
    "cost_guard_blocked not cacheable",
    shouldCacheCommercialResult({ ok: false, products: [], error: "cost_guard_blocked" }).cacheable === false
  );
  assert(
    "dry_run not cacheable",
    shouldCacheCommercialResult({
      ok: false,
      products: [],
      error: "cost_guard_blocked",
      costGuardDecision: { decision: "dry_run" },
    }).cacheable === false
  );
  assert(
    "empty response cacheable with shorter ttl",
    shouldCacheCommercialResult({ ok: false, products: [], error: "empty_response" }).cacheable === true
  );
}

console.log("\n── Empty result caching ──");
{
  clearUniversalCommercialCache();
  let fetchCount = 0;
  const env = { COMMERCIAL_CACHE_EMPTY_TTL_MS: "500" };

  await executeWithUniversalCommercialCache({
    providerId: "free_provider_a",
    query: "ssd externo",
    limit: 5,
    costGuardContext: functionalContext,
    env,
    execute: async () => {
      fetchCount += 1;
      return { ok: false, products: [], error: "empty_response", count: 0 };
    },
  });

  const reused = await executeWithUniversalCommercialCache({
    providerId: "free_provider_a",
    query: "ssd externo",
    limit: 5,
    costGuardContext: functionalContext,
    env,
    execute: async () => {
      fetchCount += 1;
      return { ok: false, products: [], error: "empty_response", count: 0 };
    },
  });

  assert("empty result cached and reused", fetchCount === 1 && reused.universalCommercialCacheHit === true);
}

console.log("\n── Provider and policy isolation ──");
{
  clearUniversalCommercialCache();
  const counts = { a: 0, b: 0 };

  await executeWithUniversalCommercialCache({
    providerId: "paid_provider_a",
    query: "controle play",
    limit: 5,
    costGuardContext: functionalContext,
    execute: async () => {
      counts.a += 1;
      return { ok: true, products: [{ title: "a" }], count: 1 };
    },
  });
  await executeWithUniversalCommercialCache({
    providerId: "paid_provider_future",
    query: "controle play",
    limit: 5,
    costGuardContext: functionalContext,
    execute: async () => {
      counts.b += 1;
      return { ok: true, products: [{ title: "b" }], count: 1 };
    },
  });

  assert("different providers do not collide", counts.a === 1 && counts.b === 1);
}

console.log("\n── Provenance preserved ──");
{
  clearUniversalCommercialCache();
  const result = await executeWithUniversalCommercialCache({
    providerId: "paid_provider_a",
    query: "galaxy a55",
    limit: 5,
    costGuardContext: functionalContext,
    invocationSource: "audit_provenance",
    execute: async () => ({ ok: true, products: [{ title: "galaxy a55" }], count: 1, provider: "paid_provider_a" }),
  });

  const hit = await executeWithUniversalCommercialCache({
    providerId: "paid_provider_a",
    query: "galaxy a55",
    limit: 5,
    costGuardContext: functionalContext,
    invocationSource: "audit_provenance_reuse",
    execute: async () => ({ ok: true, products: [{ title: "wrong" }], count: 99 }),
  });

  assert("cache hit keeps original provider contract", hit.count === 1);
  assert("cache provenance metadata present", !!hit.universalCommercialCacheProvenance?.providerId);
}

console.log("\n── Memory limits and eviction ──");
{
  clearUniversalCommercialCache();
  const env = { COMMERCIAL_CACHE_MAX_ENTRIES: "2", COMMERCIAL_CACHE_TTL_MS: "60000" };

  for (let i = 0; i < 3; i += 1) {
    await executeWithUniversalCommercialCache({
      providerId: "free_provider_a",
      query: `query-${i}`,
      limit: 5,
      costGuardContext: functionalContext,
      env,
      execute: async () => ({ ok: true, products: [{ title: `q${i}` }], count: 1 }),
    });
  }

  const diagnostics = buildUniversalCommercialCacheDiagnostics();
  assert("max entries enforced", diagnostics.entryCount <= 2);
  assert("oldest entry evicted", getUniversalCommercialCacheEntry(
    buildUniversalCommercialCacheKey({
      providerId: "free_provider_a",
      query: "query-0",
      limit: 5,
      costGuardContext: functionalContext,
    })
  ) === null);
}

console.log("\n── Expired cleanup ──");
{
  clearUniversalCommercialCache();
  const env = { COMMERCIAL_CACHE_TTL_MS: "1" };
  const key = buildUniversalCommercialCacheKey({
    providerId: "paid_provider_a",
    query: "pelicula iphone 13",
    limit: 5,
    costGuardContext: functionalContext,
  });

  await executeWithUniversalCommercialCache({
    providerId: "paid_provider_a",
    query: "pelicula iphone 13",
    limit: 5,
    costGuardContext: functionalContext,
    env,
    execute: async () => ({ ok: true, products: [{ title: "old" }], count: 1 }),
  });

  assert("fresh entry readable", getUniversalCommercialCacheEntry(key) !== null);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert("expired entry removed on read", getUniversalCommercialCacheEntry(key) === null);
}

console.log("\n── Adapter integration (mocked) ──");
{
  clearUniversalCommercialCache();
  let googleFetchCount = 0;
  const mockFetcher = async () => {
    googleFetchCount += 1;
    return [buildMockProduct("iphone 13")];
  };

  await fetchGoogleShoppingAdapterResult({
    query: "iphone 13",
    limit: 5,
    fetcher: mockFetcher,
    invocationLayer: "legacy_serpapi",
  });
  await fetchGoogleShoppingAdapterResult({
    query: "iphone   13",
    limit: 5,
    fetcher: mockFetcher,
    invocationLayer: "commercial_runtime_controlled_activation",
    costGuardContext: functionalContext,
  });

  assert("adapter cache hit across requests", googleFetchCount === 1);
}

console.log("\n── Integration with 05C Request Dedup ──");
{
  clearUniversalCommercialCache();
  const dedupContext = createCommercialRequestDedupContext({ requestId: "audit-dedup-cache" });
  let fetchCount = 0;
  const sharedInput = {
    dedupContext,
    providerId: "paid_provider_a",
    query: "iphone 13",
    limit: 5,
    costGuardContext: functionalContext,
    invocationSource: "audit_same_request",
    execute: async () =>
      executeWithUniversalCommercialCache({
        providerId: "paid_provider_a",
        query: "iphone 13",
        limit: 5,
        costGuardContext: functionalContext,
        execute: async () => {
          fetchCount += 1;
          return { ok: true, products: [{ title: "dedup-cache" }], count: 1 };
        },
      }),
  };

  await executeCommercialRequestWithDeduplication(sharedInput);
  await executeCommercialRequestWithDeduplication({
    ...sharedInput,
    invocationSource: "audit_same_request_2",
  });

  assert("dedup prevents duplicate fetch in same request", fetchCount === 1);

  fetchCount = 0;
  await executeCommercialRequestWithDeduplication({
    ...sharedInput,
    dedupContext: createCommercialRequestDedupContext({ requestId: "req-2" }),
    invocationSource: "audit_next_request",
  });
  assert("separate request reuses cache without fetch", fetchCount === 0);
}

console.log("\n── Integration with 05B Cost Guard ──");
{
  clearUniversalCommercialCache();
  let fetchCount = 0;
  const blocked = await searchApifyMercadoLivreProducts("pelicula iphone 13", 5, {
    env: { APIFY_API_TOKEN: "test-token" },
    costGuardContext: observabilityContext,
    fetcher: async () => {
      fetchCount += 1;
      throw new Error("must_not_call_apify");
    },
  });
  const blockedAgain = await searchApifyMercadoLivreProducts("pelicula iphone 13", 5, {
    env: { APIFY_API_TOKEN: "test-token" },
    costGuardContext: observabilityContext,
    fetcher: async () => {
      fetchCount += 1;
      throw new Error("must_not_call_apify");
    },
  });

  assert("cost guard blocked not persisted in cache", fetchCount === 0);
  assert("blocked remains blocked on repeat", blocked.error === "cost_guard_blocked" && blockedAgain.error === "cost_guard_blocked");
  assert("blocked repeat not cache hit", blockedAgain.universalCommercialCacheHit !== true);
}

console.log("\n── Architecture preservation ──");
assert(
  "cache does not store winner",
  !moduleSource.match(/winner|reasoning|prompt/i)
);
assert(
  "offer dedup unchanged",
  read("lib/productSourceAdapter/commercialDeduplicationLayer.js").includes("deduplicateCommercialOfferBundle") &&
    !read("lib/productSourceAdapter/commercialDeduplicationLayer.js").includes("universalCommercialCache")
);
assert(
  "request dedup still wired",
  read("lib/productSourceAdapter/adapters/googleShoppingAdapter.js").includes("executeCommercialRequestWithDeduplication")
);
assert(
  "provider cost guard still wired",
  PROVIDER_COST_GUARD_VERSION === "05B" &&
    read("lib/productSourceAdapter/adapters/apifyMercadoLivreClient.js").includes("evaluateProviderCostGuardForProvider")
);
assert(
  "legacy cache bridge note exists",
  moduleSource.includes("getUniversalCommercialCacheLegacyBridgeNote")
);
assert(
  "trace patch helper available",
  !!buildUniversalCommercialCacheTracePatch()?.universal_commercial_cache
);
assert(
  "chat tracer wired",
  read("pages/api/chat-gpt4o.js").includes("buildUniversalCommercialCacheTracePatch")
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
