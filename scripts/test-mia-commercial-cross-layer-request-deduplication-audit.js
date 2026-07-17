/**
 * PATCH Comercial 05C — Commercial Cross-Layer Request Deduplication Audit (local only)
 *
 * Usage:
 *   node scripts/test-mia-commercial-cross-layer-request-deduplication-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { COMMERCIAL_PROVIDER_IDS } from "../lib/productSourceAdapter/commercialProviderRegistry.js";
import { COMMERCIAL_RUNTIME_MODES } from "../lib/productSourceAdapter/commercialRuntimeMode.js";
import {
  COMMERCIAL_REQUEST_DEDUP_STATUS,
  COMMERCIAL_REQUEST_DEDUP_VERSION,
  buildCommercialRequestDedupDiagnostics,
  buildCommercialRequestDedupKey,
  buildCommercialRequestDedupTracePatch,
  createCommercialRequestDedupContext,
  executeCommercialRequestWithDeduplication,
  getActiveCommercialRequestDedupContext,
  normalizeCommercialRequestDedupInput,
  runWithCommercialRequestDedupContext,
} from "../lib/commercial/commercialRequestDeduplication.js";
import {
  PROVIDER_COST_GUARD_VERSION,
  buildFunctionalProviderCostGuardContext,
  buildObservabilityProviderCostGuardContext,
} from "../lib/commercial/providerCostGuard.js";
import { fetchGoogleShoppingAdapterResult } from "../lib/productSourceAdapter/adapters/googleShoppingAdapter.js";
import { searchApifyMercadoLivreProducts } from "../lib/productSourceAdapter/adapters/apifyMercadoLivreClient.js";
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
  `\nPATCH Comercial 05C — Commercial Cross-Layer Request Deduplication (${COMMERCIAL_REQUEST_DEDUP_VERSION})\n`
);

console.log("── Module contract ──");
const moduleSource = read("lib/commercial/commercialRequestDeduplication.js");
assert("version 05C", String(COMMERCIAL_REQUEST_DEDUP_VERSION).startsWith("05C"));
assert("no LLM imports", !moduleSource.match(/openai|callOpenAI|buildMiaPrompt/i));
assert("no subprocess imports", !moduleSource.match(/from\s+["']node:child_process["']/));
assert("no fetch in dedup module", !moduleSource.match(/\bfetch\s*\(/));
assert("dev endpoint exists", read("pages/api/dev/commercial-request-deduplication.js").includes("executeCommercialRequestWithDeduplication"));
assert("AsyncLocalStorage used", moduleSource.includes("AsyncLocalStorage"));
assert("no global cache map", !moduleSource.match(/globalThis\.|global\./));

console.log("\n── Canonical key ──");
const keyA = buildCommercialRequestDedupKey({
  providerId: "paid_provider_a",
  query: "  IPHONE   13  ",
  limit: 5,
  costGuardContext: functionalContext,
});
const keyB = buildCommercialRequestDedupKey({
  providerId: "paid_provider_a",
  query: "iphone 13",
  limit: 5,
  costGuardContext: functionalContext,
});
const keyPro = buildCommercialRequestDedupKey({
  providerId: "paid_provider_a",
  query: "iphone 13 pro",
  limit: 5,
  costGuardContext: functionalContext,
});
const keyDifferentProvider = buildCommercialRequestDedupKey({
  providerId: "paid_provider_future",
  query: "iphone 13",
  limit: 5,
  costGuardContext: functionalContext,
});
const keyDifferentLimit = buildCommercialRequestDedupKey({
  providerId: "paid_provider_a",
  query: "iphone 13",
  limit: 10,
  costGuardContext: functionalContext,
});
const keyObservability = buildCommercialRequestDedupKey({
  providerId: "paid_provider_a",
  query: "iphone 13",
  limit: 5,
  costGuardContext: observabilityContext,
});

assert("case/spacing normalized keys match", keyA === keyB);
assert("different models do not collide", keyA !== keyPro);
assert("different providers do not collide", keyA !== keyDifferentProvider);
assert("material limit difference changes key", keyA !== keyDifferentLimit);
assert("incompatible policy fingerprint changes key", keyA !== keyObservability);

for (const query of [
  "galaxy a55",
  "pelicula iphone 13",
  "controle play",
  "monitor gamer",
  "ssd externo",
]) {
  const normalized = normalizeCommercialRequestDedupInput({
    providerId: "free_provider_a",
    query,
    limit: 5,
  });
  assert(`query key stable for "${query}"`, normalized.normalizedQuery.length > 0);
}

console.log("\n── Equivalent calls execute fetch once ──");
{
  const context = createCommercialRequestDedupContext({ requestId: "audit-1" });
  let fetchCount = 0;
  const execute = async () => {
    fetchCount += 1;
    return { ok: true, products: [buildMockProduct("iphone 13")], count: 1 };
  };

  const first = await executeCommercialRequestWithDeduplication({
    dedupContext: context,
    providerId: "paid_provider_a",
    query: "iphone 13",
    limit: 5,
    costGuardContext: functionalContext,
    invocationSource: "legacy_serpapi",
    execute,
  });
  const second = await executeCommercialRequestWithDeduplication({
    dedupContext: context,
    providerId: "paid_provider_a",
    query: "IPHONE 13",
    limit: 5,
    costGuardContext: functionalContext,
    invocationSource: "commercial_runtime_controlled_activation",
    execute,
  });

  assert("equivalent calls fetch once", fetchCount === 1);
  assert("second call reuses completed result", second.requestDeduplicated === true);
  assert(
    "reuse status completed",
    second.dedupStatus === COMMERCIAL_REQUEST_DEDUP_STATUS.COMPLETED_REUSE
  );
  assert("first call is new execution", first.requestDeduplicated !== true);
  assert("diagnostics record hit", buildCommercialRequestDedupDiagnostics(context).hits === 1);
}

console.log("\n── Concurrent equivalent calls share Promise ──");
{
  const context = createCommercialRequestDedupContext({ requestId: "audit-2" });
  let fetchCount = 0;
  const execute = async () => {
    fetchCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return { ok: true, products: [buildMockProduct("monitor gamer")], count: 1 };
  };

  const [a, b] = await Promise.all([
    executeCommercialRequestWithDeduplication({
      dedupContext: context,
      providerId: "paid_provider_a",
      query: "monitor gamer",
      limit: 5,
      costGuardContext: functionalContext,
      invocationSource: "legacy_serpapi",
      execute,
    }),
    executeCommercialRequestWithDeduplication({
      dedupContext: context,
      providerId: "paid_provider_a",
      query: "monitor   gamer",
      limit: 5,
      costGuardContext: functionalContext,
      invocationSource: "commercial_runtime_shadow_pipeline",
      execute,
    }),
  ]);

  assert("concurrent equivalent calls fetch once", fetchCount === 1);
  assert("concurrent reuse annotated", a.requestDeduplicated === true || b.requestDeduplicated === true);
  assert(
    "in-flight reuse recorded",
    context.events.some((event) => event.status === COMMERCIAL_REQUEST_DEDUP_STATUS.IN_FLIGHT_REUSE)
  );
}

console.log("\n── Provider isolation ──");
{
  const context = createCommercialRequestDedupContext({ requestId: "audit-3" });
  const counts = { google: 0, apify: 0 };

  await executeCommercialRequestWithDeduplication({
    dedupContext: context,
    providerId: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
    query: "controle play",
    limit: 5,
    costGuardContext: functionalContext,
    invocationSource: "legacy_serpapi",
    execute: async () => {
      counts.google += 1;
      return { ok: true, products: [], count: 0 };
    },
  });
  await executeCommercialRequestWithDeduplication({
    dedupContext: context,
    providerId: COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE,
    query: "controle play",
    limit: 5,
    costGuardContext: functionalContext,
    invocationSource: "commercial_runtime_shadow_pipeline",
    execute: async () => {
      counts.apify += 1;
      return { ok: true, products: [], count: 0 };
    },
  });

  assert("google and apify are not deduplicated together", counts.google === 1 && counts.apify === 1);
}

console.log("\n── Empty valid result reuse ──");
{
  const context = createCommercialRequestDedupContext({ requestId: "audit-4" });
  let fetchCount = 0;
  const execute = async () => {
    fetchCount += 1;
    return { ok: false, products: [], error: "empty_response", count: 0 };
  };

  await executeCommercialRequestWithDeduplication({
    dedupContext: context,
    providerId: "free_provider_a",
    query: "ssd externo",
    limit: 5,
    costGuardContext: functionalContext,
    execute,
  });
  const reused = await executeCommercialRequestWithDeduplication({
    dedupContext: context,
    providerId: "free_provider_a",
    query: "ssd externo",
    limit: 5,
    costGuardContext: functionalContext,
    execute,
  });

  assert("empty valid result reused", fetchCount === 1 && reused.requestDeduplicated === true);
}

console.log("\n── Cost Guard blocked result reuse ──");
{
  const context = createCommercialRequestDedupContext({ requestId: "audit-5" });
  let fetchCount = 0;

  const blocked = await searchApifyMercadoLivreProducts("pelicula iphone 13", 5, {
    env: { APIFY_API_TOKEN: "test-token" },
    costGuardContext: observabilityContext,
    commercialRequestDedupContext: context,
    fetcher: async () => {
      fetchCount += 1;
      throw new Error("must_not_call_apify");
    },
  });
  const reused = await searchApifyMercadoLivreProducts("pelicula iphone 13", 5, {
    env: { APIFY_API_TOKEN: "test-token" },
    costGuardContext: observabilityContext,
    commercialRequestDedupContext: context,
    fetcher: async () => {
      fetchCount += 1;
      throw new Error("must_not_call_apify");
    },
  });

  assert("blocked result does not call fetch", fetchCount === 0);
  assert("blocked result reused", reused.requestDeduplicated === true);
  assert("blocked error preserved", reused.error === "cost_guard_blocked" && blocked.error === "cost_guard_blocked");
}

console.log("\n── Error behavior preserved ──");
{
  const context = createCommercialRequestDedupContext({ requestId: "audit-6" });
  let fetchCount = 0;
  const execute = async () => {
    fetchCount += 1;
    return { ok: false, products: [], error: "provider_error", count: 0 };
  };

  const first = await executeCommercialRequestWithDeduplication({
    dedupContext: context,
    providerId: "paid_provider_future",
    query: "galaxy a55",
    limit: 5,
    costGuardContext: functionalContext,
    execute,
  });
  const second = await executeCommercialRequestWithDeduplication({
    dedupContext: context,
    providerId: "paid_provider_future",
    query: "galaxy a55",
    limit: 5,
    costGuardContext: functionalContext,
    execute,
  });

  assert("error result stored once", fetchCount === 1);
  assert("error result reused", second.error === "provider_error" && second.requestDeduplicated === true);
  assert("first error unchanged", first.error === "provider_error");
}

console.log("\n── Cross-layer legacy → controlled ──");
{
  const context = createCommercialRequestDedupContext({ requestId: "audit-7" });
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
    commercialRequestDedupContext: context,
  });
  const reused = await fetchGoogleShoppingAdapterResult({
    query: "iphone   13",
    limit: 5,
    fetcher: mockFetcher,
    costGuardContext: functionalContext,
    invocationLayer: "commercial_runtime_controlled_activation",
    commercialRequestDedupContext: context,
  });

  assert("legacy → controlled reuses google fetch", googleFetchCount === 1);
  assert("controlled reuse annotated", reused.requestDeduplicated === true);
}

console.log("\n── Cross-layer legacy → shadow (incompatible policy does not reuse) ──");
{
  const context = createCommercialRequestDedupContext({ requestId: "audit-8" });
  let googleFetchCount = 0;
  const mockFetcher = async () => {
    googleFetchCount += 1;
    return [buildMockProduct("monitor gamer")];
  };

  const legacyResult = await fetchGoogleShoppingAdapterResult({
    query: "monitor gamer",
    limit: 5,
    fetcher: mockFetcher,
    invocationLayer: "legacy_serpapi",
    commercialRequestDedupContext: context,
  });

  const shadowResult = await fetchGoogleShoppingAdapterResult({
    query: "monitor gamer",
    limit: 5,
    fetcher: mockFetcher,
    costGuardContext: observabilityContext,
    invocationLayer: "commercial_runtime_shadow_pipeline",
    commercialRequestDedupContext: context,
  });

  assert("legacy functional fetch runs once", googleFetchCount === 1);
  assert("legacy result is fresh execution", legacyResult.requestDeduplicated !== true);
  assert(
    "shadow observability blocked without reusing functional payload",
    shadowResult.error === "cost_guard_blocked" && shadowResult.requestDeduplicated !== true
  );
}

console.log("\n── Shadow → controlled functional reuse ──");
{
  const context = createCommercialRequestDedupContext({ requestId: "audit-9" });
  let apifyFetchCount = 0;

  await searchApifyMercadoLivreProducts("controle play", 5, {
    env: { APIFY_API_TOKEN: "test-token" },
    costGuardContext: functionalContext,
    commercialRequestDedupContext: context,
    invocationLayer: "commercial_runtime_shadow_pipeline",
    fetcher: async () => {
      apifyFetchCount += 1;
      return {
        ok: true,
        json: async () => [{ eTituloProduto: "Controle", produtoLink: "https://example.com/c", preco: "100" }],
      };
    },
  });

  await searchApifyMercadoLivreProducts("controle play", 5, {
    env: { APIFY_API_TOKEN: "test-token" },
    costGuardContext: functionalContext,
    commercialRequestDedupContext: context,
    invocationLayer: "commercial_runtime_controlled_activation",
    fetcher: async () => {
      apifyFetchCount += 1;
      throw new Error("must_not_call_apify_again");
    },
  });

  assert("shadow → controlled reuses apify fetch", apifyFetchCount === 1);
}

console.log("\n── Context isolation between requests ──");
{
  let fetchCount = 0;
  const execute = async () => {
    fetchCount += 1;
    return { ok: true, products: [], count: 0 };
  };

  await runWithCommercialRequestDedupContext(createCommercialRequestDedupContext({ requestId: "req-a" }), async () => {
    await executeCommercialRequestWithDeduplication({
      providerId: "paid_provider_a",
      query: "iphone 13",
      limit: 5,
      costGuardContext: functionalContext,
      execute,
    });
  });
  await runWithCommercialRequestDedupContext(createCommercialRequestDedupContext({ requestId: "req-b" }), async () => {
    await executeCommercialRequestWithDeduplication({
      providerId: "paid_provider_a",
      query: "iphone 13",
      limit: 5,
      costGuardContext: functionalContext,
      execute,
    });
  });

  assert("separate request contexts do not share results", fetchCount === 2);
}

console.log("\n── AsyncLocalStorage propagation ──");
await runWithCommercialRequestDedupContext(createCommercialRequestDedupContext({ requestId: "als" }), async () => {
  const active = getActiveCommercialRequestDedupContext();
  assert("ALS active context available", !!active?.entries);
});

console.log("\n── Adapter integration ──");
assert(
  "google adapter wired to dedup",
  read("lib/productSourceAdapter/adapters/googleShoppingAdapter.js").includes("executeCommercialRequestWithDeduplication")
);
assert(
  "apify adapter wired to dedup",
  read("lib/productSourceAdapter/adapters/apifyMercadoLivreClient.js").includes("executeCommercialRequestWithDeduplication")
);
assert(
  "chat handler creates dedup context",
  read("pages/api/chat-gpt4o.js").includes("enterCommercialRequestDedupContext")
);
assert(
  "shadow trace includes dedup patch",
  read("lib/productSourceAdapter/commercialRuntimeShadow.js").includes("buildCommercialRequestDedupTracePatch")
);

console.log("\n── Architecture preservation ──");
assert(
  "dedup module does not decide winner",
  !moduleSource.match(/selectWinner|rankWinner|decideWinner/i)
);
assert(
  "offer dedup layer unchanged",
  read("lib/productSourceAdapter/commercialDeduplicationLayer.js").includes("deduplicateCommercialOfferBundle") &&
    !read("lib/productSourceAdapter/commercialDeduplicationLayer.js").includes("commercialRequestDeduplication")
);
assert(
  "provider cost guard still active",
  PROVIDER_COST_GUARD_VERSION === "05B" &&
    read("lib/productSourceAdapter/adapters/googleShoppingAdapter.js").includes("evaluateProviderCostGuardForProvider")
);
assert(
  "trace patch helper available",
  !!buildCommercialRequestDedupTracePatch(createCommercialRequestDedupContext())?.commercial_request_deduplication
);

console.log("\n── Shadow pipeline with mocked providers ──");
{
  const context = createCommercialRequestDedupContext({ requestId: "audit-shadow" });
  let googleCount = 0;
  let apifyCount = 0;

  const shadow = await runWithCommercialRequestDedupContext(context, async () =>
    runCommercialShadowPipeline({
      query: "pelicula iphone 13",
      limit: 5,
      costGuardContext: functionalContext,
      commercialRequestDedupContext: context,
      fetchGoogle: async () => {
        googleCount += 1;
        return { ok: true, products: [{ title: "Pelicula", price: 10 }], count: 1 };
      },
      fetchApify: async () => {
        apifyCount += 1;
        return { ok: true, products: [{ title: "Pelicula ML", price: 12 }], count: 1 };
      },
    })
  );

  assert("shadow mocked pipeline completes", shadow.trace?.query === "pelicula iphone 13");
  assert("shadow google mocked once", googleCount === 1);
  assert("shadow apify mocked once", apifyCount === 1);
  assert("shadow dedup trace present", !!shadow.trace?.commercial_request_deduplication);
}

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
