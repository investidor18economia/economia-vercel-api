#!/usr/bin/env node
/**
 * PATCH Comercial 05L.2 — DataForSEO Google Shopping Integration Audit (local only)
 *
 * Usage: node scripts/test-mia-dataforseo-google-shopping-integration-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  buildCommercialRequestDedupKey,
} from "../lib/commercial/commercialRequestDeduplication.js";
import {
  buildUniversalCommercialCacheKey,
} from "../lib/commercial/universalCommercialCache.js";
import {
  evaluateProviderBudgetPermission,
  getProviderCircuitState,
  resetProviderBudgetCircuitState,
} from "../lib/commercial/providerBudgetCircuitBreaker.js";
import {
  buildMultiProviderPriorityPlan,
} from "../lib/commercial/multiProviderPriorityEngine.js";
import {
  executeConditionalProviderFetch,
} from "../lib/commercial/conditionalProviderFetch.js";
import {
  evaluateProviderCostGuardForProvider,
  PROVIDER_COST_GUARD_PROVIDER_IDS,
} from "../lib/commercial/providerCostGuard.js";
import {
  getCommercialProviderBillingProfile,
} from "../lib/commercial/providerCostAudit.js";
import {
  buildDataForSeoDisabledAuditEnv,
  buildDataForSeoEnabledAuditEnv,
  buildDataForSeoIntegrationAuditSnapshot,
  buildDataForSeoRealProbePlan,
  DATAFORSEO_GOOGLE_SHOPPING_INTEGRATION_AUDIT_VERSION,
  runDataForSeoAdapterMockScenario,
  validateDataForSeoNormalizedProductNeutrality,
  validateDataForSeoRawPayloadNeutrality,
} from "../lib/commercial/dataForSeoGoogleShoppingIntegrationAudit.js";
import {
  COMMERCIAL_PROVIDER_IDS,
  getCommercialProviderById,
  isCommercialProviderEnabled,
} from "../lib/productSourceAdapter/commercialProviderRegistry.js";
import { COMMERCIAL_RUNTIME_MODES } from "../lib/productSourceAdapter/commercialRuntimeMode.js";
import {
  DATAFORSEO_REASON_CODES,
  mapDataForSeoShoppingItemToNormalizedRaw,
  redactDataForSeoSecrets,
  validateDataForSeoEnv,
} from "../lib/productSourceAdapter/adapters/dataForSeoGoogleShoppingClient.js";
import {
  fetchDataForSeoGoogleShoppingAdapterResult,
} from "../lib/productSourceAdapter/adapters/dataForSeoGoogleShoppingAdapter.js";
import { fetchGoogleShoppingAdapterResult } from "../lib/productSourceAdapter/adapters/googleShoppingAdapter.js";

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

const DISABLED_ENV = buildDataForSeoDisabledAuditEnv();
const ENABLED_ENV = buildDataForSeoEnabledAuditEnv();
const QUERY = "fone bluetooth";
const LIMIT = 5;

console.log(
  `\nPATCH Comercial 05L.2 — DataForSEO Google Shopping Integration Audit (${DATAFORSEO_GOOGLE_SHOPPING_INTEGRATION_AUDIT_VERSION})\n`
);

// Registry
const provider = getCommercialProviderById(
  COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO,
  DISABLED_ENV
);
assert("registry entry exists", !!provider);
assert("provider id google_shopping_dataforseo", provider?.id === "google_shopping_dataforseo");
assert("disabled by default", provider?.enabled === false);
assert("paid_external billing tier", provider?.billingTier === "paid_external");
assert("supports shadow", provider?.supportsShadow === true);
assert("supports controlled", provider?.supportsControlled === true);
assert(
  "auth env keys",
  Array.isArray(provider?.authEnvKeys) &&
    provider.authEnvKeys.includes("DATAFORSEO_LOGIN") &&
    provider.authEnvKeys.includes("DATAFORSEO_PASSWORD")
);
assert(
  "runtime disabled without flag",
  isCommercialProviderEnabled(COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO, DISABLED_ENV) ===
    false
);
assert(
  "runtime enabled with flag",
  isCommercialProviderEnabled(COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO, ENABLED_ENV) ===
    true
);

// Files
assert("client file exists", read("lib/productSourceAdapter/adapters/dataForSeoGoogleShoppingClient.js").includes("SERVER-ONLY"));
assert("adapter file exists", read("lib/productSourceAdapter/adapters/dataForSeoGoogleShoppingAdapter.js").includes("fetchDataForSeoGoogleShoppingAdapterResult"));
assert("docs file exists", read("docs/dataforseo-google-shopping-provider.md").includes("google_shopping_dataforseo"));

// Auth server-only
const clientSource = read("lib/productSourceAdapter/adapters/dataForSeoGoogleShoppingClient.js");
assert("no NEXT_PUBLIC credentials", !clientSource.includes("NEXT_PUBLIC_"));
assert("credentials redaction helper", clientSource.includes("redactDataForSeoSecrets"));

const envValidation = validateDataForSeoEnv(DISABLED_ENV);
assert("not configured when env missing", envValidation.ok === false);

const sanitized = redactDataForSeoSecrets({
  login: "secret-login@example.test",
  password: "secret-password-123",
  Authorization: "Basic c2VjcmV0",
});
assert(
  "credentials sanitized",
  !JSON.stringify(sanitized).includes("secret-password-123")
);

// Normalization
const normalizedRaw = mapDataForSeoShoppingItemToNormalizedRaw({
  type: "google_shopping_serp",
  title: "Smartphone Samsung Galaxy A55 128GB",
  seller: "Casas Bahia",
  price: 1899.99,
  currency: "BRL",
  shopping_url: "https://www.google.com/shopping/product/abc",
  product_images: ["https://encrypted-tbn0.gstatic.com/shopping?q=demo"],
  reviews_count: 88,
  product_rating: { value: 4.4, votes_count: 88 },
  old_price: 2199.99,
});
assert("normalized product created", !!normalizedRaw);
assert("price BRL preserved", normalizedRaw?.currency === "BRL");
assert("merchant preserved", normalizedRaw?.merchant === "Casas Bahia");
assert("link preserved", normalizedRaw?.link?.startsWith("https://"));
assert("image preserved", normalizedRaw?.thumbnail?.startsWith("https://"));
assert("original price preserved", normalizedRaw?.original_price === 2199.99);
assert("rating preserved", normalizedRaw?.rating === 4.4);
assert("review count preserved", normalizedRaw?.review_count === 88);

assert("empty title rejected", mapDataForSeoShoppingItemToNormalizedRaw({ title: "" }) === null);
assert(
  "invalid price rejected",
  mapDataForSeoShoppingItemToNormalizedRaw({
    title: "Produto Teste",
    seller: "Loja",
    price: 0,
    currency: "BRL",
    shopping_url: "https://example.test/p",
  }) === null
);
assert(
  "non-BRL rejected",
  mapDataForSeoShoppingItemToNormalizedRaw({
    title: "Produto Teste",
    seller: "Loja",
    price: 10,
    currency: "USD",
    shopping_url: "https://example.test/p",
  }) === null
);

// Error classification helpers
assert("reason codes include auth", DATAFORSEO_REASON_CODES.AUTH_FAILED === "dataforseo_auth_failed");
assert("reason codes include polling timeout", DATAFORSEO_REASON_CODES.POLLING_TIMEOUT === "dataforseo_polling_timeout");
assert("reason codes include task pending", DATAFORSEO_REASON_CODES.TASK_PENDING === "dataforseo_task_pending");

// Adapter disabled path
const disabledResult = await fetchDataForSeoGoogleShoppingAdapterResult({
  query: QUERY,
  limit: LIMIT,
  env: DISABLED_ENV,
});
assert("disabled adapter blocked", disabledResult.error === "provider_disabled");

// Mock scenarios
resetProviderBudgetCircuitState();
const authFail = await fetchDataForSeoGoogleShoppingAdapterResult({
  query: `${QUERY} auth-fail`,
  limit: LIMIT,
  env: ENABLED_ENV,
  fetcher: async () => ({
    ok: false,
    error: "auth_failed",
    reasonCode: DATAFORSEO_REASON_CODES.AUTH_FAILED,
    httpStatus: 401,
    products: [],
  }),
  costGuardContext: { _contextProvided: true, skipCostGuard: true },
});
assert("401 maps auth_failed", authFail.error === "auth_failed");

const rateLimited = await fetchDataForSeoGoogleShoppingAdapterResult({
  query: `${QUERY} rate-limit`,
  limit: LIMIT,
  env: ENABLED_ENV,
  fetcher: async () => ({
    ok: false,
    error: "rate_limited",
    reasonCode: DATAFORSEO_REASON_CODES.RATE_LIMITED,
    products: [],
  }),
  costGuardContext: { _contextProvided: true, skipCostGuard: true },
});
assert("429 maps rate_limited", rateLimited.error === "rate_limited");

const timeoutResult = await fetchDataForSeoGoogleShoppingAdapterResult({
  query: `${QUERY} timeout`,
  limit: LIMIT,
  env: ENABLED_ENV,
  fetcher: async () => ({
    ok: false,
    error: "timeout",
    reasonCode: DATAFORSEO_REASON_CODES.TIMEOUT,
    products: [],
  }),
  costGuardContext: { _contextProvided: true, skipCostGuard: true },
});
assert("timeout classified", timeoutResult.error === "timeout");

resetProviderBudgetCircuitState();

const pendingResult = await fetchDataForSeoGoogleShoppingAdapterResult({
  query: `${QUERY} task-pending`,
  limit: LIMIT,
  env: ENABLED_ENV,
  fetcher: async () => ({
    ok: false,
    error: "timeout",
    reasonCode: DATAFORSEO_REASON_CODES.TASK_PENDING,
    products: [],
  }),
  costGuardContext: { _contextProvided: true, skipCostGuard: true },
});
assert("task pending path handled", pendingResult.reasonCode === DATAFORSEO_REASON_CODES.TASK_PENDING);

const taskFailed = await fetchDataForSeoGoogleShoppingAdapterResult({
  query: `${QUERY} task-failed`,
  limit: LIMIT,
  env: ENABLED_ENV,
  fetcher: async () => ({
    ok: false,
    error: "provider_error",
    reasonCode: DATAFORSEO_REASON_CODES.TASK_FAILED,
    products: [],
  }),
  costGuardContext: { _contextProvided: true, skipCostGuard: true },
});
assert("task failed classified", taskFailed.reasonCode === DATAFORSEO_REASON_CODES.TASK_FAILED);

const pollingTimeout = await fetchDataForSeoGoogleShoppingAdapterResult({
  query: `${QUERY} poll-timeout`,
  limit: LIMIT,
  env: ENABLED_ENV,
  fetcher: async () => ({
    ok: false,
    error: "timeout",
    reasonCode: DATAFORSEO_REASON_CODES.POLLING_TIMEOUT,
    products: [],
  }),
  costGuardContext: { _contextProvided: true, skipCostGuard: true },
});
assert("polling timeout classified", pollingTimeout.error === "timeout");

resetProviderBudgetCircuitState();

const invalidPayload = await fetchDataForSeoGoogleShoppingAdapterResult({
  query: `${QUERY} invalid-payload`,
  limit: LIMIT,
  env: ENABLED_ENV,
  fetcher: async () => null,
  costGuardContext: { _contextProvided: true, skipCostGuard: true },
});
assert("invalid payload blocked", invalidPayload.error === "invalid_response");

const mockSuccess = await runDataForSeoAdapterMockScenario({ query: "notebook dell audit mock" });
assert("mock success ok", mockSuccess.ok === true);
assert("mock success provider id", mockSuccess.provider === "google_shopping_dataforseo");
assert("mock success products", Array.isArray(mockSuccess.products) && mockSuccess.products.length > 0);

// Budget / circuit independent
resetProviderBudgetCircuitState();
const googleBudget = evaluateProviderBudgetPermission({
  providerId: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
  env: ENABLED_ENV,
});
const dataForSeoBudget = evaluateProviderBudgetPermission({
  providerId: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO,
  env: ENABLED_ENV,
});
assert(
  "budget provider ids distinct",
  googleBudget.providerId !== dataForSeoBudget.providerId
);
assert(
  "circuit states independent keys",
  getProviderCircuitState(COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING).providerId !==
    getProviderCircuitState(COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO).providerId
);

// Cache / dedup independent
const cacheGoogle = buildUniversalCommercialCacheKey({
  providerId: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
  query: QUERY,
  limit: LIMIT,
});
const cacheDataForSeo = buildUniversalCommercialCacheKey({
  providerId: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO,
  query: QUERY,
  limit: LIMIT,
});
assert("cache keys distinct", cacheGoogle !== cacheDataForSeo);
assert("cache keys exclude credentials", !cacheGoogle.includes("DATAFORSEO"));

const dedupGoogle = buildCommercialRequestDedupKey({
  providerId: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
  query: QUERY,
  limit: LIMIT,
});
const dedupDataForSeo = buildCommercialRequestDedupKey({
  providerId: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO,
  query: QUERY,
  limit: LIMIT,
});
assert("dedup keys distinct", dedupGoogle !== dedupDataForSeo);

// Priority integration
const priorityDisabled = buildMultiProviderPriorityPlan({
  runtimeMode: COMMERCIAL_RUNTIME_MODES.SHADOW,
  env: DISABLED_ENV,
  query: QUERY,
  limit: LIMIT,
});
assert(
  "priority excludes dataforseo when disabled",
  !priorityDisabled.orderedProviders.some(
    (entry) => entry.providerId === COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO
  )
);
const priorityEnabled = buildMultiProviderPriorityPlan({
  runtimeMode: COMMERCIAL_RUNTIME_MODES.SHADOW,
  env: ENABLED_ENV,
  query: QUERY,
  limit: LIMIT,
});
assert(
  "priority includes dataforseo when enabled",
  priorityEnabled.orderedProviders.some(
    (entry) => entry.providerId === COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO
  )
);

// Conditional fetch short-circuit + fallback
let googleCalls = 0;
let dataForSeoCalls = 0;
const conditional = await executeConditionalProviderFetch({
  query: QUERY,
  env: { ...ENABLED_ENV, CONDITIONAL_PROVIDER_FETCH_ENABLED: "true" },
  providers: [
    {
      providerId: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO,
      resultKey: "dataforseo",
      fetch: async () => {
        dataForSeoCalls += 1;
        return {
          ok: false,
          products: [],
          error: "provider_error",
          reasonCode: DATAFORSEO_REASON_CODES.PROVIDER_ERROR,
        };
      },
    },
    {
      providerId: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
      resultKey: "google",
      fetch: async () => {
        googleCalls += 1;
        return {
          ok: true,
          products: [
            {
              product_name: "Fone JBL",
              price: "R$ 199,00",
              numericPrice: 199,
              link: "https://example.test/fone",
              thumbnail: "https://example.test/img.jpg",
              source: "Loja",
              provider: "google_shopping",
            },
          ],
          error: null,
        };
      },
    },
  ],
});
assert("conditional fetch falls back to google", conditional.results.google?.ok === true);
assert("conditional fetch attempted dataforseo first", dataForSeoCalls === 1);
assert("conditional fetch reached google fallback", googleCalls === 1);

// Cost guard billing profile
const billing = getCommercialProviderBillingProfile(
  COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO
);
assert("cost guard billing paid_external", billing.tier === "paid_external");
assert(
  "cost guard provider id registered",
  PROVIDER_COST_GUARD_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO ===
    COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO
);

// Neutrality
const neutrality = validateDataForSeoNormalizedProductNeutrality(normalizedRaw || {});
assert("neutral normalized product", neutrality.ok === true);
const rawNeutrality = validateDataForSeoRawPayloadNeutrality({
  special_offer_info: { coupon_code: "X" },
  shop_ad_aclk: "ignored",
});
assert("raw promotional fields flagged not ranked", rawNeutrality.ok === true);

// SerpAPI preserved
const serpDisabled = await fetchGoogleShoppingAdapterResult({
  query: QUERY,
  limit: LIMIT,
  fetcher: async () => [],
  costGuardContext: { _contextProvided: true, skipCostGuard: true },
});
assert("serpapi adapter still callable", typeof serpDisabled === "object");

// Cognitive guard — no decision/reasoning changes
const cognitiveGuardFiles = [
  "lib/miaCognitiveRouter.js",
  "lib/miaPrompt.js",
];
for (const file of cognitiveGuardFiles) {
  const content = read(file);
  assert(`${file} untouched by dataforseo`, !content.includes("dataforseo"));
}

const snapshot = buildDataForSeoIntegrationAuditSnapshot({ query: QUERY, env: DISABLED_ENV });
assert("audit snapshot provider disabled default", snapshot.providerEnabledByDefault === false);
assert("audit snapshot cache distinct", snapshot.cacheKeysDistinct === true);

const probePlan = buildDataForSeoRealProbePlan(DISABLED_ENV);
assert("real probe blocked by default", probePlan.canExecuteExternal === false);

const elapsed = Date.now() - start;
console.log(`\nResultado: ${passed}/${passed + failed} (${(((passed / (passed + failed)) || 0) * 100).toFixed(1)}%) em ${elapsed}ms`);
const verdict =
  failed === 0
    ? "DATAFORSEO_NEUTRAL_PROVIDER_INTEGRATION_APPROVED"
    : "DATAFORSEO_PROVIDER_IMPLEMENTED_CONFIGURATION_PENDING";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(failed > 0 ? 1 : 0);
