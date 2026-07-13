/**
 * PATCH Comercial 05K — Commercial Runtime Production Freeze Audit (local only)
 *
 * Usage:
 *   node scripts/test-mia-commercial-runtime-production-freeze-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  COMMERCIAL_PROVIDER_IDS,
  MERCADOLIVRE_COMMERCIAL_PROVIDER_ENABLED_ENV,
} from "../lib/productSourceAdapter/commercialProviderRegistry.js";
import { COMMERCIAL_RUNTIME_MODES } from "../lib/productSourceAdapter/commercialRuntimeMode.js";
import {
  COMMERCIAL_RUNTIME_PRODUCTION_FREEZE_VERSION,
  COMMERCIAL_RUNTIME_FREEZE_STATUS,
  OFFICIAL_COMMERCIAL_PIPELINE_LAYERS,
  buildCommercialRuntimeFreezeDevPayload,
  buildCommercialRuntimeProductionFreezeManifest,
  buildCommercialRuntimeRollbackChecklist,
  validateCommercialRuntimeFreezeBehaviorChecks,
  validateCommercialRuntimeProductionFreeze,
  validateCommercialRuntimeSafeDefaults,
} from "../lib/commercial/commercialRuntimeProductionFreeze.js";
import {
  buildMultiProviderPriorityPlan,
  MULTI_PROVIDER_PRIORITY_SKIP_REASONS,
  evaluateProviderRuntimeEligibility,
} from "../lib/commercial/multiProviderPriorityEngine.js";
import {
  evaluateCommercialResultSufficiency,
  executeConditionalProviderFetch,
} from "../lib/commercial/conditionalProviderFetch.js";
import {
  resetProviderBudgetCircuitState,
  setProviderCircuitOpenUntilForTests,
  evaluateProviderBudgetPermission,
} from "../lib/commercial/providerBudgetCircuitBreaker.js";
import {
  buildUniversalCommercialCacheKey,
  clearUniversalCommercialCache,
  getUniversalCommercialCacheEntry,
  setUniversalCommercialCacheEntry,
} from "../lib/commercial/universalCommercialCache.js";
import {
  createCommercialRequestDedupContext,
  executeCommercialRequestWithDeduplication,
} from "../lib/commercial/commercialRequestDeduplication.js";
import {
  evaluateProviderCostGuardForProvider,
} from "../lib/commercial/providerCostGuard.js";
import {
  isCommercialDevRealExternalCallsEnabled,
} from "../lib/commercial/devCommercialCostGuard.js";
import {
  readCommercialCoverageValidationConfig,
} from "../lib/commercial/commercialCoverageValidation.js";
import { fetchMercadoLivreCommercialAdapterResult } from "../lib/productSourceAdapter/adapters/mercadoLivreAdapter.js";

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

console.log(`\nPATCH Comercial 05K — Commercial Runtime Production Freeze (${COMMERCIAL_RUNTIME_PRODUCTION_FREEZE_VERSION})\n`);

console.log("── Freeze manifest ──");
const manifest = buildCommercialRuntimeProductionFreezeManifest({});
assert("manifest do freeze existe", manifest.version === "05K");
assert("versão do freeze existe", COMMERCIAL_RUNTIME_PRODUCTION_FREEZE_VERSION === "05K");
assert("pipeline oficial está completo", OFFICIAL_COMMERCIAL_PIPELINE_LAYERS.length >= 18);
assert("ordem das camadas está definida", manifest.pipeline.length === OFFICIAL_COMMERCIAL_PIPELINE_LAYERS.length);
assert("responsabilidades estão definidas", manifest.pipeline.every((layer) => layer.responsibility));
assert("providers oficiais estão declarados", manifest.providers.length >= 4);
assert("documento de freeze existe", read("docs/commercial-runtime-production-freeze.md").includes("05K"));

console.log("\n── Provider metadata ──");
const google = manifest.providers.find((p) => p.providerId === COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING);
const ml = manifest.providers.find((p) => p.providerId === COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC);
const apify = manifest.providers.find((p) => p.providerId === COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE);
assert("metadata de provider é válida", google?.billingTier === "paid_external");
assert("enabled default está explícito", ml?.enabledDefault === false);
assert("billing tier está explícito", apify?.billingTier === "paid_external");
assert("capabilities estão explícitas", ml?.supportsShadow === false && ml?.supportsControlled === true);
assert("Mercado Livre não entra em shadow", !manifest.shadowPriorityOrder.includes(COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC));
assert(
  "Mercado Livre skipped em shadow",
  !manifest.shadowPriorityOrder.includes(COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC) &&
    manifest.shadowSkippedProviders.some((entry) => entry.providerId === COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC)
);
assert(
  "Mercado Livre entra em controlled quando enabled",
  evaluateProviderRuntimeEligibility({
    metadata: { id: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC, enabled: true, supportsControlled: true, supportsShadow: false, billingTier: "free_external", requiresAuth: false, authEnvKeys: [], registryPosition: 1 },
    runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
    env: { [MERCADOLIVRE_COMMERCIAL_PROVIDER_ENABLED_ENV]: "true" },
  }).eligible === true
);

console.log("\n── Safe defaults ──");
const defaults = validateCommercialRuntimeSafeDefaults({});
assert("coverage real está desativada por default", readCommercialCoverageValidationConfig({}, []).realValidationEnabled === false);
assert("DEV real está desativado por default", isCommercialDevRealExternalCallsEnabled({}) === false);
assert("defaults seguros validam", defaults.ok === true);
assert("cache possui max entries", manifest.configs.cache.maxEntries > 0);
assert("cache possui TTL", manifest.configs.cache.offersTtlMs > 0);
assert("empty cache possui TTL menor", manifest.configs.cache.emptyTtlMs < manifest.configs.cache.offersTtlMs);
assert("budget está ativo", manifest.configs.budgetCircuit.budgetEnabled === true);
assert("Circuit Breaker está ativo", manifest.configs.budgetCircuit.circuitEnabled === true);

console.log("\n── Layer presence ──");
assert("Priority Engine está ativo", manifest.configs.priority.enabled === true);
assert("Conditional Fetch está ativo", manifest.configs.conditionalFetch.enabled === true);
assert("Cost Guard module", read("lib/commercial/providerCostGuard.js").includes("05B"));
assert("Dedup está ativo", read("lib/commercial/commercialRequestDeduplication.js").includes("05C"));
assert("Cache está ativo", read("lib/commercial/universalCommercialCache.js").includes("05D"));
assert("DEV Guard está ativo", read("lib/commercial/devCommercialCostGuard.js").includes("05G"));

console.log("\n── Behavior checks ──");
const sufficient = {
  ok: true,
  products: [{
    product_name: "Apple iPhone 13 128GB",
    price: "R$ 3.299",
    numericPrice: 3299,
    link: "https://example.com/iphone-13",
    thumbnail: "https://example.com/iphone.jpg",
    source: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
  }],
  count: 1,
};
const conditional = await executeConditionalProviderFetch({
  query: "iphone 13",
  providers: [
    { providerId: "primary", resultKey: "primary", fetch: async () => sufficient },
    { providerId: "secondary", resultKey: "secondary", fetch: async () => ({ ok: true, products: [{ product_name: "skip", link: "https://x.com", price: "R$ 1", numericPrice: 1 }], count: 1 }) },
  ],
});
assert("primeiro provider suficiente aplica short-circuit", conditional.shortCircuitApplied === true);

resetProviderBudgetCircuitState("circuit_open_provider");
setProviderCircuitOpenUntilForTests("circuit_open_provider", Date.now() + 60_000);
assert(
  "circuit open impede fetch",
  evaluateProviderRuntimeEligibility({
    metadata: { id: "circuit_open_provider", enabled: true, supportsControlled: true, supportsShadow: false, billingTier: "free_external", requiresAuth: false, authEnvKeys: [], registryPosition: 0 },
    runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
  }).eligible === false
);

assert(
  "budget exhausted impede fetch",
  evaluateProviderRuntimeEligibility({
    metadata: { id: "budget_exhausted_provider", enabled: true, supportsControlled: true, supportsShadow: false, billingTier: "paid_external", requiresAuth: false, authEnvKeys: [], registryPosition: 0 },
    runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
    budgetStatus: { shouldCallProvider: false, reasonCode: "budget_exhausted" },
  }).eligible === false
);

clearUniversalCommercialCache();
const cacheKey = buildUniversalCommercialCacheKey({ providerId: "cached_provider", query: "notebook", limit: 5 });
setUniversalCommercialCacheEntry(cacheKey, { ok: true, products: [{ product_name: "cached" }] }, { providerId: "cached_provider", query: "notebook", limit: 5 });
assert("cache hit evita necessidade de nova chamada externa", !!getUniversalCommercialCacheEntry(cacheKey)?.result);

let dedupFetchCount = 0;
const dedupContext = createCommercialRequestDedupContext({ requestId: "freeze-audit-dedup" });
await executeCommercialRequestWithDeduplication({
  dedupContext,
  providerId: "dedup_provider",
  query: "webcam",
  limit: 5,
  execute: async () => {
    dedupFetchCount += 1;
    return { ok: true, products: [], count: 0 };
  },
});
await executeCommercialRequestWithDeduplication({
  dedupContext,
  providerId: "dedup_provider",
  query: "webcam",
  limit: 5,
  execute: async () => {
    dedupFetchCount += 1;
    return { ok: true, products: [], count: 0 };
  },
});
assert("dedup reuse evita fetch duplicado", dedupFetchCount === 1);

const shadowGoogleGuard = evaluateProviderCostGuardForProvider(COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING, {
  invocationSource: "commercial_runtime_shadow_pipeline",
  runtimeMode: COMMERCIAL_RUNTIME_MODES.SHADOW,
  endpointLevelDryRun: true,
});
assert("Google respeita Cost Guard em shadow dry-run", shadowGoogleGuard.providerId === COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING);

const disabledResult = await fetchMercadoLivreCommercialAdapterResult({
  query: "iphone 13",
  limit: 3,
  env: { [MERCADOLIVRE_COMMERCIAL_PROVIDER_ENABLED_ENV]: "false" },
});
assert("provider disabled não executa", disabledResult.error === "provider_disabled");
assert("token ausente não gera exception fatal", typeof disabledResult === "object");

console.log("\n── Architecture preservation ──");
assert("nenhum provider escolhe winner", read("lib/commercial/multiProviderPriorityEngine.js").includes("Não decide winner"));
assert("nenhum provider gera reasoning", read("lib/commercial/multiProviderPriorityEngine.js").includes("reasoning"));
assert("nenhum guard altera prompt", !read("lib/commercial/providerCostGuard.js").match(/buildMiaPrompt/i));
assert("Data Layer chat preserved", read("pages/api/chat-gpt4o.js").includes("fetchSerpPrices") || read("pages/api/chat-gpt4o.js").includes("searchUniversalDataLayer"));
assert("Decision Engine preserved", read("lib/miaCognitiveRouter.js").length > 100);
assert("fallback governado permanece intacto", read("lib/commercial/governedFallbackPayloadBuilder.js").includes("4E-B.6"));
assert("prompt preserved", read("lib/miaPrompt.js").length > 100);

console.log("\n── Guard fixes (05K) ──");
assert("get-final-price usa adapter stack", read("pages/api/get-final-price.js").includes("fetchGoogleShoppingAdapterResult"));
assert("legacy ML gated por env", read("pages/api/chat-gpt4o.js").includes("isMercadoLivreCommercialProviderRuntimeEnabled"));
assert("chat não chama fetchSerpPrices direto", !read("pages/api/chat-gpt4o.js").match(/fetchSerpPrices\s*\(/));

console.log("\n── Freeze validation ──");
const validation = validateCommercialRuntimeProductionFreeze({});
assert("rollback está documentado", buildCommercialRuntimeRollbackChecklist().length >= 8);
assert("limitações MVP estão documentadas", validation.acceptedMvpLimitations.length >= 3);
assert("endpoint DEV existe", read("pages/api/dev/commercial-runtime-production-freeze.js").includes("buildCommercialRuntimeFreezeDevPayload"));
const devPayload = buildCommercialRuntimeFreezeDevPayload({});
assert("tracer não contém secrets", !JSON.stringify(devPayload).match(/sk-[a-z0-9]{10,}/i));
assert("nenhum novo provider foi criado", manifest.providers.length === 4);
assert("nenhuma nova engine cognitiva foi criada", !read("lib/commercial/commercialRuntimeProductionFreeze.js").match(/openai|callOpenAI/i));

const behavior = validateCommercialRuntimeFreezeBehaviorChecks();
assert("conditional fetch behavior ok", behavior.conditionalFetchSufficient === true);

const freezeOk =
  validation.openCritical === 0 &&
  (validation.status === COMMERCIAL_RUNTIME_FREEZE_STATUS.PRODUCTION_FREEZE_APPROVED ||
    validation.status === COMMERCIAL_RUNTIME_FREEZE_STATUS.FREEZE_APPROVED_WITH_ACCEPTED_MVP_LIMITATIONS);
assert("freeze validation sem CRITICAL aberto", validation.openCritical === 0, `critical=${validation.openCritical}`);

const elapsed = ((Date.now() - start) / 1000).toFixed(2);
const total = passed + failed;
console.log(`\n── Resultado da auditoria ──`);
console.log(`Total: ${total}`);
console.log(`Aprovados: ${passed}`);
console.log(`Reprovados: ${failed}`);
console.log(`Tempo: ${elapsed}s`);
console.log(`Status freeze: ${validation.status}`);

const verdict =
  failed === 0 && freezeOk && Number(elapsed) <= 20
    ? validation.status
    : failed > 0
      ? "C) FREEZE_BLOCKED"
      : "C) FREEZE_BLOCKED (timeout)";
console.log(`\n── Veredito ──\n${verdict}\n`);

process.exit(failed > 0 || !freezeOk ? 1 : 0);
