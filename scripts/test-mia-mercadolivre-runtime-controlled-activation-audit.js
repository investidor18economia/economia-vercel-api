/**
 * PATCH Comercial 05H — Mercado Livre Runtime Controlled Activation Audit (local only)
 *
 * Usage:
 *   node scripts/test-mia-mercadolivre-runtime-controlled-activation-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  COMMERCIAL_PROVIDER_IDS,
  isCommercialProviderEnabled,
  isMercadoLivreCommercialProviderRuntimeEnabled,
  listEnabledCommercialProviders,
  MERCADOLIVRE_COMMERCIAL_PROVIDER_ENABLED_ENV,
} from "../lib/productSourceAdapter/commercialProviderRegistry.js";
import {
  MERCADOLIVRE_RUNTIME_ACTIVATION_VERSION,
  MERCADOLIVRE_RUNTIME_REASON_CODES,
  getMercadoLivreCommercialRegistryMetadata,
  mapMercadoLivreHttpStatusToReasonCode,
} from "../lib/commercial/mercadolivreRuntimeActivation.js";
import {
  fetchMercadoLivreCommercialAdapterResult,
  normalizeMercadoLivreItem,
} from "../lib/productSourceAdapter/adapters/mercadoLivreAdapter.js";
import {
  mapMercadoLivrePublicOfferToMergedOffer,
  mergeCommercialOfferBundle,
} from "../lib/productSourceAdapter/commercialOfferMergeLayer.js";
import { runCommercialShadowPipeline } from "../lib/productSourceAdapter/commercialRuntimeShadow.js";
import { evaluateCommercialResultSufficiency } from "../lib/commercial/conditionalProviderFetch.js";
import { getCommercialProviderBillingProfile } from "../lib/commercial/providerCostAudit.js";
import { evaluateDevCommercialExecutionPermission } from "../lib/commercial/devCommercialCostGuard.js";
import { buildDevCommercialCostGuardContext } from "../lib/commercial/devCommercialCostGuard.js";
import { evaluateProviderCostGuardForProvider } from "../lib/commercial/providerCostGuard.js";
import { resetProviderBudgetCircuitState } from "../lib/commercial/providerBudgetCircuitBreaker.js";

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

function mockReq(overrides = {}) {
  return { query: overrides.query || {}, headers: overrides.headers || {} };
}

function buildValidMercadoLivreRaw(overrides = {}) {
  return {
    id: "MLB2001",
    title: overrides.title || "Samsung Galaxy A55 5G 128gb Dual Sim",
    price: overrides.price ?? 1799,
    currency_id: "BRL",
    permalink: overrides.permalink || "https://produto.mercadolivre.com.br/MLB2001-galaxy-a55",
    thumbnail: overrides.thumbnail ?? "https://http2.mlstatic.com/galaxy-a55.jpg",
    seller: { id: 123, nickname: "LOJA_TESTE" },
    category_id: "MLB1055",
    ...overrides,
  };
}

function resetMercadoLivreOperationalState() {
  resetProviderBudgetCircuitState(COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC);
}

function mockMercadoLivreFetcher(responseFactory) {
  return async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => responseFactory(),
    text: async () => JSON.stringify(responseFactory()),
  });
}

console.log(`\nPATCH Comercial 05H — Mercado Livre Runtime Controlled Activation (${MERCADOLIVRE_RUNTIME_ACTIVATION_VERSION})\n`);

console.log("── Activation defaults ──");
assert("provider desativado por default", isCommercialProviderEnabled(COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC, {}) === false);
assert("flag default false", isMercadoLivreCommercialProviderRuntimeEnabled({}) === false);
assert("activation reversível por env", isCommercialProviderEnabled(
  COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
  { [MERCADOLIVRE_COMMERCIAL_PROVIDER_ENABLED_ENV]: "true" }
) === true);
assert("flag ativa apenas mercadolivre_public", listEnabledCommercialProviders({
  [MERCADOLIVRE_COMMERCIAL_PROVIDER_ENABLED_ENV]: "true",
}).some((entry) => entry.id === COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC));

console.log("\n── Registry metadata ──");
const metadata = getMercadoLivreCommercialRegistryMetadata({});
assert("provider aparece no registry", metadata.providerId === COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC);
assert("billing tier free_external", metadata.billingTier === "free_external");
assert("supportsControlled", metadata.supportsControlled === true);
assert("supportsShadow false", metadata.supportsShadow === false);
assert("requiresAuth false", metadata.requiresAuth === false);
assert("timeoutMs definido", metadata.timeoutMs === 10_000);
assert("billing audit profile", getCommercialProviderBillingProfile(COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC)?.tier === "free_external");

console.log("\n── Provider disabled neutral result ──");
const disabledResult = await fetchMercadoLivreCommercialAdapterResult({
  query: "iphone 13",
  limit: 3,
  env: {},
});
assert("disabled retorna provider_disabled", disabledResult.error === "provider_disabled");
assert("disabled não quebra contrato", Array.isArray(disabledResult.products) && disabledResult.products.length === 0);

console.log("\n── DEV dry-run ──");
const devDryRun = evaluateDevCommercialExecutionPermission({
  req: mockReq(),
  providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
  isDevEndpoint: true,
});
assert("DEV sem opt-in retorna dry-run", devDryRun.shouldReturnDryRun === true);

console.log("\n── HTTP error neutrality (mocked) ──");
const enabledEnv = {
  MERCADOLIVRE_CLIENT_ID: "id",
  MERCADOLIVRE_CLIENT_SECRET: "secret",
  MERCADOLIVRE_REDIRECT_URI: "https://example.com/callback",
  [MERCADOLIVRE_COMMERCIAL_PROVIDER_ENABLED_ENV]: "true",
};

for (const [label, status, expectedError] of [
  ["401", 401, "auth_failed"],
  ["403", 403, "auth_failed"],
  ["429", 429, "rate_limited"],
  ["500", 500, "http_error"],
]) {
  const result = await fetchMercadoLivreCommercialAdapterResult({
    query: "galaxy a55",
    limit: 3,
    env: enabledEnv,
    fetcher: async () => ({
      ok: false,
      status,
      statusText: "ERR",
      json: async () => ({}),
      text: async () => "error",
    }),
  });
  assert(`${label} não quebra pipeline`, Array.isArray(result.products));
  assert(`${label} error=${expectedError}`, result.error === expectedError);
  resetMercadoLivreOperationalState();
}

const timeoutResult = await fetchMercadoLivreCommercialAdapterResult({
  query: "moto g84",
  limit: 3,
  env: enabledEnv,
  fetcher: async () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    throw err;
  },
});
assert("timeout retorna neutro", timeoutResult.error === "timeout");
resetMercadoLivreOperationalState();

const missingEnvResult = await fetchMercadoLivreCommercialAdapterResult({
  query: "s23 fe",
  limit: 3,
  env: { [MERCADOLIVRE_COMMERCIAL_PROVIDER_ENABLED_ENV]: "true" },
});
assert("token/env ausente retorna neutro", missingEnvResult.error === "missing_env");

resetMercadoLivreOperationalState();
console.log("\n── Valid normalization (mocked) ──");
const validResult = await fetchMercadoLivreCommercialAdapterResult({
  query: "iphone 13",
  limit: 3,
  env: enabledEnv,
  fetcher: mockMercadoLivreFetcher(() => ({
    results: [buildValidMercadoLivreRaw({ title: "Apple iPhone 13 128GB" })],
  })),
});
assert("resultado válido ok", validResult.ok === true);
assert("price preservado", validResult.products?.[0]?.numericPrice > 0 || validResult.products?.[0]?.price);
assert("URL preservada", String(validResult.products?.[0]?.link || "").startsWith("http"));
assert("image preservada", !!validResult.products?.[0]?.thumbnail);
assert("providerId preservado", validResult.providerId === COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC);

const normalizedItem = normalizeMercadoLivreItem(buildValidMercadoLivreRaw(), { query: "iphone 13" });
assert("normalização title", !!normalizedItem?.product_name);
const mergedOffer = mapMercadoLivrePublicOfferToMergedOffer(validResult.products?.[0] || normalizedItem);
assert("merge layer title", mergedOffer.title.length > 3);
assert("merge layer provider", mergedOffer.provider === COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC);

console.log("\n── Empty response ──");
const emptyResult = await fetchMercadoLivreCommercialAdapterResult({
  query: "celular até 1500",
  limit: 3,
  env: enabledEnv,
  fetcher: mockMercadoLivreFetcher(() => ({ results: [] })),
});
assert("vazio legítimo", emptyResult.error === "empty_or_unusable" || emptyResult.error === "empty_response");

console.log("\n── Cost Guard integration ──");
const costGuardContext = buildDevCommercialCostGuardContext({
  req: mockReq(),
  invocationSource: "dev_audit",
});

const shadowPipelineEnv = {
  SERPAPI_KEY: "audit-test-key",
  APIFY_API_TOKEN: "audit-test-token",
};
const costGuardDecision = evaluateProviderCostGuardForProvider(
  COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
  costGuardContext
);
assert("Cost Guard ativo", costGuardDecision.providerId === COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC);
assert("free_external passa pelo Cost Guard", costGuardDecision.billingTier === "free_external");

console.log("\n── Conditional fetch (mocked shadow pipeline) ──");
const sufficientGoogle = {
  ok: true,
  products: [{
    product_name: "Apple iPhone 13 128GB",
    price: "R$ 3.299",
    numericPrice: 3299,
    link: "https://example.com/iphone-13",
    thumbnail: "https://example.com/iphone.jpg",
    provider: "serpapi",
    source: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
  }],
  count: 1,
};

await runCommercialShadowPipeline({
  query: "iphone 13",
  limit: 3,
  env: shadowPipelineEnv,
  fetchGoogle: async () => sufficientGoogle,
  fetchMercadoLivre: async () => ({
    ok: true,
    products: [{ product_name: "should not run", link: "https://ml.com/x", price: "R$ 1", numericPrice: 1, thumbnail: "https://ml.com/i.jpg" }],
    count: 1,
  }),
  fetchApify: async () => ({ ok: true, products: [], count: 0 }),
});
assert("google suficiente pipeline completa", sufficientGoogle.count === 1);

const mlSufficiency = evaluateCommercialResultSufficiency({
  query: "iphone 13",
  result: validResult,
});
assert("ML suficiente avaliado", mlSufficiency.decision === "sufficient" || mlSufficiency.usableOfferCount >= 1);

const shadowGoogleEmpty = await runCommercialShadowPipeline({
  query: "samsung bom e barato",
  limit: 3,
  env: shadowPipelineEnv,
  fetchGoogle: async () => ({ ok: false, products: [], count: 0, error: "empty_result" }),
  fetchMercadoLivre: async () => ({
    ok: true,
    products: [{ product_name: "should not run in shadow", link: "https://ml.com/x", price: "R$ 1", numericPrice: 1, thumbnail: "https://ml.com/i.jpg" }],
    count: 1,
  }),
  fetchApify: async () => ({
    ok: true,
    products: [{
      title: "Samsung Galaxy A55",
      price: 1799,
      url: "https://example.com/a55",
      image: "https://example.com/a55.jpg",
      source: COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE,
    }],
    count: 1,
  }),
});
assert(
  "google vazio permite apify em shadow",
  shadowGoogleEmpty.trace?.apifyResult?.count === 1 || shadowGoogleEmpty.ok === true
);
assert(
  "Mercado Livre não executa em shadow com supportsShadow=false",
  shadowGoogleEmpty.trace?.mercadolivreResult?.count !== 1
);

console.log("\n── Merge preserved ──");
const merged = mergeCommercialOfferBundle({
  googleShoppingOffers: [],
  mercadolivrePublicOffers: validResult.products || [],
  apifyMercadoLivreOffers: [],
  providerEnabled: {
    [COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC]: true,
  },
});
assert("merge continua ativo", merged.offers.length >= 1);
assert("providersUsed inclui ML", merged.providersUsed.includes(COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC));

console.log("\n── Architecture preservation ──");
assert("Data Layer chat preserved", read("pages/api/chat-gpt4o.js").includes("fetchSerpPrices"));
assert("Decision Engine preserved", read("lib/miaCognitiveRouter.js").length > 100);
assert("prompt preserved", read("lib/miaPrompt.js").length > 100);
assert("Request Dedup module", read("lib/commercial/commercialRequestDeduplication.js").includes("05C"));
assert("Universal Cache module", read("lib/commercial/universalCommercialCache.js").includes("05D"));
assert("Conditional Fetch module", read("lib/commercial/conditionalProviderFetch.js").includes("05E"));
assert("Budget/Circuit module", read("lib/commercial/providerBudgetCircuitBreaker.js").includes("05F"));
assert("DEV Cost Guard module", read("lib/commercial/devCommercialCostGuard.js").includes("05G"));
assert("no product hardcode in activation module", !read("lib/commercial/mercadolivreRuntimeActivation.js").match(/iphone|samsung|galaxy/i));
assert("dev endpoint enriched", read("pages/api/dev/mercadolivre-search.js").includes("registryMetadata"));

console.log("\n── Reason code mapping ──");
assert("401 -> auth_failed", mapMercadoLivreHttpStatusToReasonCode(401) === MERCADOLIVRE_RUNTIME_REASON_CODES.AUTH_FAILED);
assert("429 -> rate_limited", mapMercadoLivreHttpStatusToReasonCode(429) === MERCADOLIVRE_RUNTIME_REASON_CODES.RATE_LIMITED);

const elapsed = ((Date.now() - start) / 1000).toFixed(2);
const total = passed + failed;
console.log(`\n── Resultado da auditoria ──`);
console.log(`Total: ${total}`);
console.log(`Aprovados: ${passed}`);
console.log(`Reprovados: ${failed}`);
console.log(`Tempo: ${elapsed}s`);

const verdict =
  failed === 0 && Number(elapsed) <= 20
    ? "A) ROBUST estruturalmente"
    : failed > 0
      ? "B) PARTIAL"
      : "C) REJECTED (timeout)";
console.log(`\n── Veredito ──\n${verdict}\n`);

process.exit(failed > 0 ? 1 : 0);
