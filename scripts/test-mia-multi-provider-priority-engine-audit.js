/**
 * PATCH Comercial 05I — Multi-Provider Priority Engine Audit (local only)
 *
 * Usage:
 *   node scripts/test-mia-multi-provider-priority-engine-audit.js
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
  MULTI_PROVIDER_PRIORITY_ENGINE_VERSION,
  MULTI_PROVIDER_PRIORITY_SKIP_REASONS,
  MULTI_PROVIDER_PRIORITY_STRATEGIES,
  buildMultiProviderPriorityPlan,
  calculateProviderOperationalPriority,
  compareProviderPriority,
  evaluateProviderRuntimeEligibility,
  readMultiProviderPriorityConfig,
} from "../lib/commercial/multiProviderPriorityEngine.js";
import {
  buildConditionalProviderFetchPlan,
  executeConditionalProviderFetch,
} from "../lib/commercial/conditionalProviderFetch.js";
import {
  resetProviderBudgetCircuitState,
  setProviderCircuitOpenUntilForTests,
  PROVIDER_CIRCUIT_STATES,
} from "../lib/commercial/providerBudgetCircuitBreaker.js";
import {
  buildUniversalCommercialCacheKey,
  clearUniversalCommercialCache,
  setUniversalCommercialCacheEntry,
} from "../lib/commercial/universalCommercialCache.js";
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

function syntheticProvider(overrides = {}) {
  return {
    id: overrides.id || "free_provider_a",
    enabled: overrides.enabled !== false,
    providerType: "search",
    version: "test",
    billingTier: overrides.billingTier || "free_external",
    supportsControlled: overrides.supportsControlled !== false,
    supportsShadow: overrides.supportsShadow === true,
    requiresAuth: overrides.requiresAuth === true,
    authEnvKeys: overrides.authEnvKeys || [],
    timeoutMs: overrides.timeoutMs ?? 5_000,
    reliabilityScore: overrides.reliabilityScore ?? 70,
    latencyMs: overrides.latencyMs ?? 2_000,
    registryPosition: overrides.registryPosition ?? 0,
  };
}

console.log(`\nPATCH Comercial 05I — Multi-Provider Priority Engine (${MULTI_PROVIDER_PRIORITY_ENGINE_VERSION})\n`);

console.log("── Module contract ──");
const moduleSource = read("lib/commercial/multiProviderPriorityEngine.js");
assert("version 05I", MULTI_PROVIDER_PRIORITY_ENGINE_VERSION === "05I");
assert("no LLM imports", !moduleSource.match(/openai|callOpenAI|buildMiaPrompt/i));
assert("no subprocess imports", !moduleSource.match(/from\s+["']node:child_process["']/));
assert("no fetch in module", !moduleSource.match(/\bfetch\s*\(/));
assert("dev endpoint exists", read("pages/api/dev/multi-provider-priority-engine.js").includes("buildMultiProviderPriorityPlan"));
assert("default strategy cost_balanced", readMultiProviderPriorityConfig({}).strategy === MULTI_PROVIDER_PRIORITY_STRATEGIES.COST_BALANCED);

console.log("\n── Eligibility ──");
const disabled = evaluateProviderRuntimeEligibility({
  metadata: syntheticProvider({ enabled: false }),
  runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
});
assert("provider disabled é excluído", disabled.eligible === false && disabled.skipReason === MULTI_PROVIDER_PRIORITY_SKIP_REASONS.PROVIDER_DISABLED);

const noShadow = evaluateProviderRuntimeEligibility({
  metadata: syntheticProvider({
    id: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
    supportsShadow: false,
    supportsControlled: true,
  }),
  runtimeMode: COMMERCIAL_RUNTIME_MODES.SHADOW,
});
assert("supportsShadow=false impede shadow", noShadow.eligible === false);
assert("skip reason unsupported runtime", noShadow.skipReason === MULTI_PROVIDER_PRIORITY_SKIP_REASONS.SKIPPED_UNSUPPORTED_RUNTIME);

const mlControlled = evaluateProviderRuntimeEligibility({
  metadata: syntheticProvider({
    id: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
    supportsShadow: false,
    supportsControlled: true,
  }),
  runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
});
assert("Mercado Livre entra em controlled", mlControlled.eligible === true);

const enabledIgnoresCapability = evaluateProviderRuntimeEligibility({
  metadata: syntheticProvider({
    id: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
    enabled: true,
    supportsShadow: false,
  }),
  runtimeMode: COMMERCIAL_RUNTIME_MODES.SHADOW,
});
assert("enabled não ignora capability", enabledIgnoresCapability.eligible === false);

const missingAuth = evaluateProviderRuntimeEligibility({
  metadata: syntheticProvider({
    id: "auth_required_provider",
    requiresAuth: true,
    authEnvKeys: ["TEST_PROVIDER_TOKEN"],
  }),
  runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
  env: {},
});
assert("missing auth requerido é excluído", missingAuth.eligible === false);

resetProviderBudgetCircuitState("circuit_open_provider");
setProviderCircuitOpenUntilForTests("circuit_open_provider", Date.now() + 60_000);
const circuitOpen = evaluateProviderRuntimeEligibility({
  metadata: syntheticProvider({ id: "circuit_open_provider" }),
  runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
});
assert("circuit open é excluído", circuitOpen.eligible === false);

const budgetExhausted = evaluateProviderRuntimeEligibility({
  metadata: syntheticProvider({ id: "budget_exhausted_provider" }),
  runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
  budgetStatus: {
    shouldCallProvider: false,
    reasonCode: "budget_exhausted",
    decision: "block_budget_exhausted",
  },
});
assert("budget exhausted é excluído", budgetExhausted.eligible === false);

console.log("\n── Priority scoring ──");
const freePriority = calculateProviderOperationalPriority({
  metadata: syntheticProvider({ id: "free_provider_a", billingTier: "free_external", registryPosition: 1 }),
  eligibility: evaluateProviderRuntimeEligibility({
    metadata: syntheticProvider({ id: "free_provider_a", billingTier: "free_external", registryPosition: 1 }),
    runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
  }),
  strategy: MULTI_PROVIDER_PRIORITY_STRATEGIES.COST_BALANCED,
});
const paidPriority = calculateProviderOperationalPriority({
  metadata: syntheticProvider({ id: "paid_provider_a", billingTier: "paid_external", registryPosition: 0 }),
  eligibility: evaluateProviderRuntimeEligibility({
    metadata: syntheticProvider({ id: "paid_provider_a", billingTier: "paid_external", registryPosition: 0 }),
    runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
  }),
  strategy: MULTI_PROVIDER_PRIORITY_STRATEGIES.COST_BALANCED,
});
assert("free_external preferido sobre paid quando sinais equivalentes", freePriority.priorityScore > paidPriority.priorityScore);

clearUniversalCommercialCache();
const cacheKey = buildUniversalCommercialCacheKey({
  providerId: "cached_provider",
  query: "notebook",
  limit: 5,
});
setUniversalCommercialCacheEntry(cacheKey, { ok: true, products: [{ product_name: "cached item" }] }, {
  providerId: "cached_provider",
  query: "notebook",
  limit: 5,
});
const cachedEligibility = evaluateProviderRuntimeEligibility({
  metadata: syntheticProvider({ id: "cached_provider", registryPosition: 2 }),
  runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
  query: "notebook",
  limit: 5,
});
const cachedPriority = calculateProviderOperationalPriority({
  metadata: syntheticProvider({ id: "cached_provider", registryPosition: 2 }),
  eligibility: cachedEligibility,
  strategy: MULTI_PROVIDER_PRIORITY_STRATEGIES.COST_BALANCED,
});
const uncachedPriority = calculateProviderOperationalPriority({
  metadata: syntheticProvider({ id: "uncached_provider", registryPosition: 2 }),
  eligibility: evaluateProviderRuntimeEligibility({
    metadata: syntheticProvider({ id: "uncached_provider", registryPosition: 2 }),
    runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
    query: "notebook",
    limit: 5,
  }),
  strategy: MULTI_PROVIDER_PRIORITY_STRATEGIES.COST_BALANCED,
});
assert("cache hit recebe prioridade", cachedPriority.priorityScore > uncachedPriority.priorityScore);

resetProviderBudgetCircuitState("half_open_provider");
const halfOpenEligibility = evaluateProviderRuntimeEligibility({
  metadata: syntheticProvider({ id: "half_open_provider" }),
  runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
  circuitState: PROVIDER_CIRCUIT_STATES.HALF_OPEN,
});
const halfOpenPriority = calculateProviderOperationalPriority({
  metadata: syntheticProvider({ id: "half_open_provider" }),
  eligibility: halfOpenEligibility,
  strategy: MULTI_PROVIDER_PRIORITY_STRATEGIES.COST_BALANCED,
});
const closedPriority = calculateProviderOperationalPriority({
  metadata: syntheticProvider({ id: "closed_provider" }),
  eligibility: evaluateProviderRuntimeEligibility({
    metadata: syntheticProvider({ id: "closed_provider" }),
    runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
    circuitState: PROVIDER_CIRCUIT_STATES.CLOSED,
  }),
  strategy: MULTI_PROVIDER_PRIORITY_STRATEGIES.COST_BALANCED,
});
assert("half-open tem prioridade reduzida", halfOpenPriority.priorityScore < closedPriority.priorityScore);
assert("registry position desempata", compareProviderPriority(
  { priorityScore: 100, registryPosition: 0 },
  { priorityScore: 100, registryPosition: 2 }
) < 0);

console.log("\n── Strategies ──");
const registryPlan = buildMultiProviderPriorityPlan({
  runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
  env: { COMMERCIAL_PROVIDER_PRIORITY_STRATEGY: "registry_order" },
  providers: [
    syntheticProvider({ id: "paid_provider_a", billingTier: "paid_external", registryPosition: 0 }),
    syntheticProvider({ id: "free_provider_a", billingTier: "free_external", registryPosition: 1 }),
  ],
});
assert("registry_order preserva ordem original", registryPlan.orderedProviders[0]?.providerId === "paid_provider_a");

const costPlan = buildMultiProviderPriorityPlan({
  runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
  env: { COMMERCIAL_PROVIDER_PRIORITY_STRATEGY: "cost_balanced" },
  providers: [
    syntheticProvider({ id: "paid_provider_a", billingTier: "paid_external", registryPosition: 0 }),
    syntheticProvider({ id: "free_provider_a", billingTier: "free_external", registryPosition: 1 }),
  ],
});
assert("cost_balanced aplica ordem governada", costPlan.orderedProviders[0]?.providerId === "free_provider_a");

console.log("\n── Mercado Livre shadow ambiguity fix ──");
const shadowPlan = buildMultiProviderPriorityPlan({
  runtimeMode: COMMERCIAL_RUNTIME_MODES.SHADOW,
  env: { [MERCADOLIVRE_COMMERCIAL_PROVIDER_ENABLED_ENV]: "true" },
});
assert(
  "Mercado Livre não entra em shadow quando false",
  !shadowPlan.orderedProviders.some((entry) => entry.providerId === COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC)
);
assert(
  "Mercado Livre skipped_unsupported_runtime em shadow",
  shadowPlan.skippedProviders.some(
    (entry) =>
      entry.providerId === COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC &&
      entry.skipReason === MULTI_PROVIDER_PRIORITY_SKIP_REASONS.SKIPPED_UNSUPPORTED_RUNTIME
  )
);

const controlledMlPlan = buildMultiProviderPriorityPlan({
  runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
  env: { [MERCADOLIVRE_COMMERCIAL_PROVIDER_ENABLED_ENV]: "true" },
});
assert(
  "Mercado Livre entra em controlled quando enabled",
  controlledMlPlan.orderedProviders.some((entry) => entry.providerId === COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC)
);

console.log("\n── Conditional Fetch integration ──");
const integrationPriorityPlan = buildMultiProviderPriorityPlan({
  runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
  env: { COMMERCIAL_PROVIDER_PRIORITY_STRATEGY: "cost_balanced" },
  providers: [
    syntheticProvider({ id: "paid_provider_a", billingTier: "paid_external", registryPosition: 0 }),
    syntheticProvider({ id: "free_provider_a", billingTier: "free_external", registryPosition: 1 }),
  ],
});
const fetchPlan = buildConditionalProviderFetchPlan({
  runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
  query: "notebook",
  limit: 5,
  priorityPlan: integrationPriorityPlan,
});
assert("Conditional Fetch recebe ordem do priority engine", fetchPlan.length >= 2);
assert("primeiro provider definido", fetchPlan[0]?.providerId === "free_provider_a");
assert("ordem cost_balanced respeitada no fetch plan", fetchPlan[1]?.providerId === "paid_provider_a");

const sufficient = {
  ok: true,
  products: [{
    product_name: "Notebook Gamer Acer Nitro 5",
    price: "R$ 4.999",
    numericPrice: 4999,
    link: "https://example.com/notebook",
    thumbnail: "https://example.com/notebook.jpg",
    source: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
  }],
  count: 1,
};
const conditional = await executeConditionalProviderFetch({
  query: "notebook gamer",
  providers: [
    {
      providerId: "provider_primary",
      resultKey: "primary",
      fetch: async () => sufficient,
    },
    {
      providerId: "provider_secondary",
      resultKey: "secondary",
      fetch: async () => ({ ok: true, products: [{ product_name: "should skip", link: "https://x.com", price: "R$ 1", numericPrice: 1 }], count: 1 }),
    },
  ],
});
assert("primeiro suficiente aplica short-circuit", conditional.shortCircuitApplied === true);
assert("próximo é chamado quando necessário", conditional.providersSkipped >= 1 || conditional.skipped.length >= 1);

console.log("\n── Shadow pipeline integration ──");
const shadowPipeline = await runCommercialShadowPipeline({
  query: "iphone 13",
  limit: 3,
  fetchGoogle: async () => sufficient,
  fetchMercadoLivre: async () => ({
    ok: true,
    products: [{ product_name: "ml should not run in shadow", link: "https://ml.com/x", price: "R$ 1", numericPrice: 1, thumbnail: "https://ml.com/i.jpg" }],
    count: 1,
  }),
  fetchApify: async () => ({ ok: false, products: [], count: 0 }),
  env: { [MERCADOLIVRE_COMMERCIAL_PROVIDER_ENABLED_ENV]: "true" },
});
assert("shadow pipeline trace inclui priority engine", !!shadowPipeline.trace?.multi_provider_priority_engine);
assert(
  "Mercado Livre ausente do shadow pipeline slots",
  !shadowPipeline.trace?.multi_provider_priority_engine?.orderedProviderIds?.includes(
    COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC
  )
);

console.log("\n── Generalization ──");
const futurePlan = buildMultiProviderPriorityPlan({
  runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
  providers: [syntheticProvider({ id: "paid_provider_future", billingTier: "paid_external", registryPosition: 9 })],
});
assert("provider futuro entra sem alteração estrutural", futurePlan.eligibleProviders.includes("paid_provider_future"));
assert("sem hardcode mercadolivre/google/apify", !moduleSource.match(/if\s*\(.*mercadolivre/i));

console.log("\n── Architecture preservation ──");
assert("Cost Guard module", read("lib/commercial/providerCostGuard.js").includes("05B"));
assert("Request Dedup module", read("lib/commercial/commercialRequestDeduplication.js").includes("05C"));
assert("Universal Cache module", read("lib/commercial/universalCommercialCache.js").includes("05D"));
assert("Conditional Fetch module", read("lib/commercial/conditionalProviderFetch.js").includes("05E"));
assert("Budget/Circuit module", read("lib/commercial/providerBudgetCircuitBreaker.js").includes("05F"));
assert("DEV Cost Guard module", read("lib/commercial/devCommercialCostGuard.js").includes("05G"));
assert("Mercado Livre activation module", read("lib/commercial/mercadolivreRuntimeActivation.js").includes("05H"));
assert("Data Layer chat preserved", read("pages/api/chat-gpt4o.js").includes("fetchSerpPrices"));
assert("Decision Engine preserved", read("lib/miaCognitiveRouter.js").length > 100);
assert("prompt preserved", read("lib/miaPrompt.js").length > 100);

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
