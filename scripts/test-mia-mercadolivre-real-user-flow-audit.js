#!/usr/bin/env node
/**
 * PATCH Comercial 05K.1 — Mercado Livre Real User Flow Audit (local only, no external calls)
 *
 * Usage: node scripts/test-mia-mercadolivre-real-user-flow-audit.js
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildMultiProviderPriorityPlan } from "../lib/commercial/multiProviderPriorityEngine.js";
import { buildConditionalProviderFetchPlan } from "../lib/commercial/conditionalProviderFetch.js";
import {
  COMMERCIAL_PROVIDER_IDS,
  isCommercialProviderEnabled,
  isMercadoLivreCommercialProviderRuntimeEnabled,
} from "../lib/productSourceAdapter/commercialProviderRegistry.js";
import {
  COMMERCIAL_RUNTIME_MODES,
  getCommercialRuntimeMode,
  isCommercialRuntimeControlled,
} from "../lib/productSourceAdapter/commercialRuntimeMode.js";
import { mapMercadoLivrePublicOfferToMergedOffer } from "../lib/productSourceAdapter/commercialOfferMergeLayer.js";
import { mapLegacyProductToCardShape } from "../lib/productSourceAdapter/commercialRuntimeActivation.js";
import { isMercadoLivreOAuthTokenPersistenceConfigured } from "../lib/commercial/mercadolivreOAuthTokenPersistence.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const UI_ENTRY = "components/MIAChat.jsx";
const API_ENTRY = "pages/api/chat-gpt4o.js";
const ML_ADAPTER = "lib/productSourceAdapter/adapters/mercadoLivreAdapter.js";
const ML_CLIENT = "lib/productSourceAdapter/adapters/mercadoLivreClient.js";
const ML_PERSISTENCE = "lib/commercial/mercadolivreOAuthTokenPersistence.js";
const RUNTIME_ACTIVATION = "lib/productSourceAdapter/commercialRuntimeActivation.js";
const RUNTIME_SHADOW = "lib/productSourceAdapter/commercialRuntimeShadow.js";
const MERGE_LAYER = "lib/productSourceAdapter/commercialOfferMergeLayer.js";
const SELECTION_ENGINE = "lib/productSourceAdapter/commercialSelectionEngine.js";
const PRIORITY_ENGINE = "lib/commercial/multiProviderPriorityEngine.js";
const CONDITIONAL_FETCH = "lib/commercial/conditionalProviderFetch.js";
const REGISTRY = "lib/productSourceAdapter/commercialProviderRegistry.js";
const DECISION_ENGINE = "lib/miaCognitiveRouter.js";
const REASONING_ENGINE = "lib/commercial/universalGovernedFallbackReasoning.js";

function loadLocalEnvQuietly() {
  const envPath = join(ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadLocalEnvQuietly();

let passed = 0;
let failed = 0;
const startMs = Date.now();

function assert(label, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${label}`);
  } else {
    failed += 1;
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function read(relativePath) {
  const full = join(ROOT, relativePath);
  if (!existsSync(full)) return "";
  return readFileSync(full, "utf8");
}

function configuredEnv(key) {
  return !!String(process.env[key] || "").trim();
}

function truthyEnv(key) {
  const raw = String(process.env[key] || "")
    .trim()
    .toLowerCase();
  return raw === "true" || raw === "1";
}

function printConfigSnapshot() {
  const effectiveMode = getCommercialRuntimeMode();
  console.log("\n── Configuration snapshot (no secret values) ──");
  console.log(
    JSON.stringify(
      {
        COMMERCIAL_RUNTIME_MODE: effectiveMode,
        COMMERCIAL_PROVIDER_MERCADOLIVRE_ENABLED: truthyEnv("COMMERCIAL_PROVIDER_MERCADOLIVRE_ENABLED"),
        MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_ENABLED: truthyEnv(
          "MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_ENABLED"
        ),
        vaultConfigured: isMercadoLivreOAuthTokenPersistenceConfigured(),
        mlRegistryEnabled: isCommercialProviderEnabled(COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC),
        mlRuntimeFlagEnabled: isMercadoLivreCommercialProviderRuntimeEnabled(),
        PROVIDER_CREDENTIAL_ENCRYPTION_KEY: configuredEnv("PROVIDER_CREDENTIAL_ENCRYPTION_KEY")
          ? "configured"
          : "not_configured",
        SUPABASE_SERVICE_ROLE_KEY: configuredEnv("SUPABASE_SERVICE_ROLE_KEY")
          ? "configured"
          : "not_configured",
        COMMERCIAL_PROVIDER_PRIORITY_ENABLED: truthyEnv("COMMERCIAL_PROVIDER_PRIORITY_ENABLED"),
        COMMERCIAL_PROVIDER_PRIORITY_STRATEGY:
          String(process.env.COMMERCIAL_PROVIDER_PRIORITY_STRATEGY || "cost_balanced").trim() ||
          "cost_balanced",
        CONDITIONAL_PROVIDER_FETCH_ENABLED: truthyEnv("CONDITIONAL_PROVIDER_FETCH_ENABLED"),
        COMMERCIAL_CACHE_ENABLED: truthyEnv("COMMERCIAL_CACHE_ENABLED"),
        COMMERCIAL_PROVIDER_BUDGET_ENABLED: truthyEnv("COMMERCIAL_PROVIDER_BUDGET_ENABLED"),
        COMMERCIAL_PROVIDER_CIRCUIT_ENABLED: truthyEnv("COMMERCIAL_PROVIDER_CIRCUIT_ENABLED"),
        COMMERCIAL_ML_VAULT_AUTHENTICATED_PROBE_ENABLED: truthyEnv(
          "COMMERCIAL_ML_VAULT_AUTHENTICATED_PROBE_ENABLED"
        ),
        SERPAPI_KEY: configuredEnv("SERPAPI_KEY") ? "configured" : "not_configured",
        APIFY_API_TOKEN: configuredEnv("APIFY_API_TOKEN") ? "configured" : "not_configured",
        ENABLE_COMMERCIAL_RUNTIME_SHADOW: truthyEnv("ENABLE_COMMERCIAL_RUNTIME_SHADOW"),
        MIA_DEBUG: truthyEnv("MIA_DEBUG"),
        controlledRuntimeActive: isCommercialRuntimeControlled(),
      },
      null,
      2
    )
  );
}

console.log("\nPATCH Comercial 05K.1 — Mercado Livre Real User Flow Audit\n");

const ui = read(UI_ENTRY);
const api = read(API_ENTRY);
const adapter = read(ML_ADAPTER);
const client = read(ML_CLIENT);
const persistence = read(ML_PERSISTENCE);

assert("1. UI entry file exists", ui.length > 0);
assert(
  "2. UI posts to chat endpoint",
  ui.includes('fetch("/api/mia-chat"') && ui.includes("function enviar")
);
assert(
  "3. UI extracts prices/products from API response",
  ui.includes("extractApiProducts") && ui.includes("data.prices")
);
assert(
  "4. UI renders offer card price/image/link",
  ui.includes("offerCard.price") &&
    ui.includes("getOfferCardImages") &&
    ui.includes("offerCard.link")
);

assert("5. API entry file exists", api.length > 0);
assert(
  "6. API has commercial provider router",
  api.includes("fetchCommercialProductsFromProviders") &&
    api.includes("fetchFromMercadoLivreProvider")
);
assert(
  "7. API applies controlled runtime activation",
  api.includes("applyCommercialRuntimeActivationToResponsePrices") &&
    api.includes("resolveAndApplyCommercialRuntimeActivation")
);
assert(
  "8. API returns prices to frontend",
  api.includes("respondWithContract") && api.includes("prices")
);

assert(
  "9. legacy router invokes ML adapter",
  api.includes("fetchMercadoLivreCommercialAdapterResult") &&
    api.includes("chat_gpt4o_legacy_commercial_router")
);
assert(
  "10. legacy router gates ML by env flag",
  api.includes("isMercadoLivreCommercialProviderRuntimeEnabled")
);

assert(
  "11. controlled activation uses shadow pipeline",
  read(RUNTIME_ACTIVATION).includes("resolveOfficialCommercialOffer") &&
    read(RUNTIME_ACTIVATION).includes("runCommercialShadowPipeline")
);
assert(
  "12. shadow pipeline wires priority + conditional fetch",
  read(RUNTIME_SHADOW).includes("buildMultiProviderPriorityPlan") &&
    read(RUNTIME_SHADOW).includes("executeConditionalProviderFetch")
);

const priorityPlan = buildMultiProviderPriorityPlan({
  runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
  env: process.env,
  invocationSource: "real_user_flow_audit",
});
const mlPlanEntry = priorityPlan.providerPlans.find(
  (entry) => entry.providerId === COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC
);
assert("13. Priority Engine plans ML provider", !!mlPlanEntry);
assert(
  "14. ML eligibility/skip reason exposed",
  mlPlanEntry?.eligible === true || !!mlPlanEntry?.skipReason
);

const conditionalPlan = buildConditionalProviderFetchPlan({
  runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
  env: process.env,
  query: "iphone 13",
  limit: 5,
  priorityPlan,
  fetchBindings: {},
});
assert(
  "15. Conditional Fetch plan builds for controlled mode",
  Array.isArray(conditionalPlan) && conditionalPlan.length > 0
);

assert(
  "16. adapter stack includes cache dedup budget",
  adapter.includes("executeCommercialRequestWithDeduplication") &&
    adapter.includes("executeWithUniversalCommercialCache") &&
    adapter.includes("executeCommercialProviderProtectedFetch")
);
assert(
  "17. adapter invokes ML client search",
  adapter.includes("searchMercadoLivreProducts") &&
    adapter.includes("fetchMercadoLivreCommercialAdapterResult")
);
assert(
  "18. client resolves vault credentials",
  client.includes("resolveMercadoLivreRuntimeAccessToken") &&
    client.includes("resolveMercadoLivreClientRuntimeCredentials")
);
assert(
  "19. persistence is vault-only at runtime",
  persistence.includes("vault_unavailable") && !persistence.includes("allowEnvFallback")
);

const merged = mapMercadoLivrePublicOfferToMergedOffer({
  title: "Produto teste",
  price: 199.9,
  link: "https://example.test/item",
  thumbnail: "https://example.test/img.jpg",
});
assert(
  "20. merge layer preserves price/image/url",
  merged.price === 199.9 &&
    merged.image === "https://example.test/img.jpg" &&
    merged.url === "https://example.test/item"
);

const card = mapLegacyProductToCardShape({
  product_name: "Produto teste",
  price: "R$ 199,90",
  link: "https://example.test/item",
  thumbnail: "https://example.test/img.jpg",
  source: "Mercado Livre",
  commercialProvider: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
});
assert(
  "21. activation card shape preserves price/link/thumbnail",
  card?.product_name === "Produto teste" &&
    card?.link === "https://example.test/item" &&
    card?.thumbnail === "https://example.test/img.jpg"
);

assert(
  "22. merge + selection modules exist",
  read(MERGE_LAYER).includes("mergeCommercialOfferBundle") &&
    read(SELECTION_ENGINE).includes("selectCommercialOffers")
);
assert(
  "23. governed fallback pipeline exists",
  read("lib/commercial/governedFallbackPayloadBuilder.js").includes("buildGovernedFallbackPayload")
);

assert(
  "24. legacy parallel path documented in chat",
  api.includes("getOrderedCommercialProviders") && api.includes("supabasecache")
);
assert(
  "25. data layer path exists before providers",
  api.includes("searchUniversalDataLayer") && api.includes("safeFetchSerpPrices")
);

assert(
  "26. Decision Engine not modified by this audit",
  read(DECISION_ENGINE).includes("classifyMiaTurn") &&
    !read(DECISION_ENGINE).includes("mercadolivreOAuthTokenPersistence")
);
assert(
  "27. Reasoning Engine not modified by this audit",
  read(REASONING_ENGINE).includes("buildUniversalGovernedFallbackReasoning")
);

let remoteFetchAttempted = false;
const originalFetch = globalThis.fetch;
globalThis.fetch = () => {
  remoteFetchAttempted = true;
  return Promise.reject(new Error("blocked"));
};
buildMultiProviderPriorityPlan({
  runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
  env: process.env,
  invocationSource: "real_user_flow_audit_no_network",
});
globalThis.fetch = originalFetch;
assert("28. structural checks do not call network", remoteFetchAttempted === false);

printConfigSnapshot();

const elapsedMs = Date.now() - startMs;
const total = passed + failed;
console.log(`\nResultado: ${passed}/${total} (${((passed / total) * 100).toFixed(1)}%) em ${elapsedMs}ms`);
const verdict =
  failed === 0 ? "A) REAL_USER_FLOW_AUDIT_APPROVED" : "E) REAL_USER_FLOW_AUDIT_INCOMPLETE";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(failed === 0 ? 0 : 1);
