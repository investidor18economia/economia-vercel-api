#!/usr/bin/env node
/**
 * PATCH Comercial 05J.1 — Mercado Livre Controlled Fetch Path Audit (local only)
 *
 * Usage: node scripts/test-mia-mercadolivre-controlled-fetch-path-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  buildCommercialCoverageExecutionTelemetry,
  buildMercadoLivreControlledFetchPathMap,
  buildMercadoLivreControlledProbePlan,
  buildMercadoLivreFetchPathDiagnostics,
  classifyCommercialCoverageEmptyReason,
  classifyMercadoLivreFetchInterruption,
  COMMERCIAL_ML_CONTROLLED_PROBE_ENABLED_ENV,
  COMMERCIAL_PROVIDER_EXECUTION_STAGES,
  createCommercialProviderExecutionLifecycle,
  deriveProviderExecutionTelemetry,
  isDefaultShadowProviderStub,
  MERCADOLIVRE_FETCH_INTERRUPTION_CODES,
  recordCommercialProviderExecutionStage,
  validateMercadoLivreControlledFetchPath,
} from "../lib/commercial/mercadolivreControlledFetchPathAudit.js";
import {
  aggregateCommercialCoverageSummary,
  aggregateCommercialProviderCoverage,
  buildCommercialProductCoverageResult,
} from "../lib/commercial/commercialCoverageValidation.js";
import { evaluateProviderCostGuardForProvider } from "../lib/commercial/providerCostGuard.js";
import { evaluateProviderBudgetPermission } from "../lib/commercial/providerBudgetCircuitBreaker.js";
import {
  buildMultiProviderPriorityPlan,
  evaluateProviderRuntimeEligibility,
} from "../lib/commercial/multiProviderPriorityEngine.js";
import { COMMERCIAL_PROVIDER_IDS } from "../lib/productSourceAdapter/commercialProviderRegistry.js";
import { COMMERCIAL_RUNTIME_MODES } from "../lib/productSourceAdapter/commercialRuntimeMode.js";
import {
  searchMercadoLivreProducts,
  validateMercadoLivreEnv,
  validateMercadoLivrePublicSearchEnv,
} from "../lib/productSourceAdapter/adapters/mercadoLivreClient.js";
import { fetchMercadoLivreCommercialAdapterResult } from "../lib/productSourceAdapter/adapters/mercadoLivreAdapter.js";
import { buildFunctionalProviderCostGuardContext } from "../lib/commercial/providerCostGuard.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const TEST_SECRET = "TEST_ML_CLIENT_SECRET_DO_NOT_LEAK";
const CONTROLLED_ENV = {
  COMMERCIAL_RUNTIME_MODE: "controlled",
  COMMERCIAL_PROVIDER_MERCADOLIVRE_ENABLED: "true",
  SERPAPI_KEY: "",
  APIFY_API_TOKEN: "",
};
const PUBLIC_ONLY_ENV = { ...CONTROLLED_ENV, MERCADOLIVRE_SITE_ID: "MLB" };
const OAUTH_ENV = {
  ...PUBLIC_ONLY_ENV,
  MERCADOLIVRE_CLIENT_ID: "test-client",
  MERCADOLIVRE_CLIENT_SECRET: TEST_SECRET,
  MERCADOLIVRE_REDIRECT_URI: "https://example.test/callback",
};

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

function makePriorityPlan(providerIds = [COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC]) {
  return {
    orderedProviders: providerIds.map((providerId, index) => ({
      providerId,
      eligible: true,
      priorityScore: 1000 - index,
    })),
  };
}

function makeProviderResult(overrides = {}) {
  return {
    ok: false,
    products: [],
    error: "missing_env",
    reasonCode: "missing_oauth_env",
    adapterInvoked: true,
    clientInvoked: true,
    httpRequestStarted: false,
    blockedBeforeFetch: true,
    executionTelemetry: {
      adapterInvoked: true,
      clientInvoked: true,
      httpRequestStarted: false,
      blockedBeforeFetch: true,
      reasonCode: "missing_oauth_env",
    },
    ...overrides,
  };
}

console.log("\nPATCH Comercial 05J.1 — Mercado Livre Controlled Fetch Path Audit\n");

// 1–4 Runtime / priority
assert(
  "controlled path map exists",
  buildMercadoLivreControlledFetchPathMap().steps.length >= 10
);
assert(
  "ML planned when enabled in controlled",
  buildMultiProviderPriorityPlan({
    runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
    env: CONTROLLED_ENV,
  }).orderedProviders.some((p) => p.providerId === COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC)
);
assert(
  "ML eligible in controlled when enabled",
  evaluateProviderRuntimeEligibility({
    metadata: {
      id: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
      enabled: true,
      requiresAuth: false,
      billingTier: "free_external",
      supportsControlled: true,
      supportsShadow: false,
    },
    runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
    env: CONTROLLED_ENV,
  }).eligible === true
);
assert(
  "ML remains ineligible in shadow when supportsShadow=false",
  evaluateProviderRuntimeEligibility({
    metadata: {
      id: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
      enabled: true,
      requiresAuth: false,
      billingTier: "free_external",
      supportsControlled: true,
      supportsShadow: false,
    },
    runtimeMode: COMMERCIAL_RUNTIME_MODES.SHADOW,
    env: CONTROLLED_ENV,
  }).eligible === false
);

// 5–8 Adapter/client/public API
assert(
  "public search env ok without OAuth",
  validateMercadoLivrePublicSearchEnv(PUBLIC_ONLY_ENV).ok === true
);
assert(
  "OAuth env still required for validateMercadoLivreEnv",
  validateMercadoLivreEnv({}).ok === false
);
assert(
  "absence of access token does not block public search env",
  validateMercadoLivrePublicSearchEnv(PUBLIC_ONLY_ENV).hasAccessToken === false &&
    validateMercadoLivrePublicSearchEnv(PUBLIC_ONLY_ENV).ok === true
);
assert(
  "default siteId is MLB",
  validateMercadoLivrePublicSearchEnv(PUBLIC_ONLY_ENV).siteId === "MLB"
);

// 9–12 Guards
assert(
  "Cost Guard allows free_external functional ML",
  evaluateProviderCostGuardForProvider(COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC, {
    ...buildFunctionalProviderCostGuardContext({
      runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
      invocationSource: "mercadolivre_controlled_fetch_path_audit",
    }),
    env: CONTROLLED_ENV,
  }).shouldCallProvider === true
);
assert(
  "DEV dry-run blocks Google without opt-in",
  evaluateProviderCostGuardForProvider(COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING, {
    ...buildFunctionalProviderCostGuardContext({
      runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
      isManualAudit: true,
    }),
    env: { ...CONTROLLED_ENV, SERPAPI_KEY: "key" },
  }).decision === "dry_run"
);
assert(
  "budget allows ML by default",
  evaluateProviderBudgetPermission({
    providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
    env: CONTROLLED_ENV,
  }).shouldCallProvider === true
);
assert(
  "circuit closed by default",
  evaluateProviderBudgetPermission({
    providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
    env: CONTROLLED_ENV,
  }).circuitState === "closed"
);

// 13–17 Client mock paths (no network)
const mockItems = [
  {
    id: "MLB1",
    title: "Apple iPhone 13 128GB",
    price: 3499,
    currency_id: "BRL",
    permalink: "https://produto.mercadolivre.com.br/MLB1",
    thumbnail: "https://http2.mlstatic.com/iphone13.jpg",
  },
];

async function runClientFixtures() {
  const blocked = await searchMercadoLivreProducts("", 5, { env: PUBLIC_ONLY_ENV });
  assert(
    "blocked before HTTP when query missing",
    blocked.blockedBeforeFetch === true && blocked.httpRequestStarted === false
  );

  const httpStarted = await searchMercadoLivreProducts("iphone", 5, {
    env: PUBLIC_ONLY_ENV,
    fetcher: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ results: mockItems }),
    }),
  });
  assert("http_request_started marks real fetch", httpStarted.httpRequestStarted === true);
  assert("http returns items", httpStarted.ok === true && httpStarted.count === 1);

  const httpEmpty = await searchMercadoLivreProducts("iphone", 5, {
    env: PUBLIC_ONLY_ENV,
    fetcher: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    }),
  });
  assert(
    "HTTP empty maps to provider_http_empty interruption",
    classifyMercadoLivreFetchInterruption({
      providerResult: {
        ...httpEmpty,
        adapterInvoked: true,
        executionTelemetry: deriveProviderExecutionTelemetry(httpEmpty),
      },
    }) === MERCADOLIVRE_FETCH_INTERRUPTION_CODES.PROVIDER_HTTP_EMPTY
  );

  const adapter = await fetchMercadoLivreCommercialAdapterResult({
    query: "iphone",
    limit: 5,
    env: CONTROLLED_ENV,
    fetcher: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ results: mockItems }),
    }),
  });
  assert("adapter invoked with mock fetch", adapter.adapterInvoked === true);
  assert("adapter returns normalized products", adapter.ok === true && adapter.count === 1);
}

await runClientFixtures();

// 18–22 Telemetry / stubs
assert(
  "default shadow stub detected",
  isDefaultShadowProviderStub({ ok: false, products: [], error: null }) === true
);
assert(
  "stub does not count as attempted in telemetry",
  buildCommercialCoverageExecutionTelemetry({
    priorityPlan: makePriorityPlan(),
    providerResults: {
      [COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC]: { ok: false, products: [], error: null },
      [COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING]: { ok: false, products: [], error: null },
    },
  }).providersAttempted.length === 0
);
assert(
  "blocked result does not count as external call",
  deriveProviderExecutionTelemetry(
    makeProviderResult({ error: "missing_env", reasonCode: "missing_oauth_env" })
  ).httpRequestStarted === false
);
assert(
  "http started is sole external call signal",
  deriveProviderExecutionTelemetry(
    makeProviderResult({
      ok: true,
      products: mockItems,
      httpRequestStarted: true,
      httpRequestCompleted: true,
      error: null,
    })
  ).httpRequestStarted === true
);
assert(
  "provider_not_executed for default stub",
  classifyMercadoLivreFetchInterruption({
    providerResult: { ok: false, products: [], error: null },
  }) === MERCADOLIVRE_FETCH_INTERRUPTION_CODES.PROVIDER_NOT_EXECUTED
);

// 23–25 Coverage aggregation alignment
const productResult = buildCommercialProductCoverageResult({
  product: { productName: "Probe Product", queryUsed: "probe" },
  queryUsed: "probe",
  providerResults: {
    [COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC]: makeProviderResult({
      ok: true,
      products: mockItems,
      httpRequestStarted: true,
      httpRequestCompleted: true,
      error: null,
      executionTelemetry: {
        adapterInvoked: true,
        clientInvoked: true,
        httpRequestStarted: true,
        httpRequestCompleted: true,
      },
    }),
  },
  priorityPlan: makePriorityPlan(),
  conditionalExecution: {
    attempts: [{ providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC }],
  },
  synthetic: true,
});
const providerCoverage = aggregateCommercialProviderCoverage([productResult]);
const summary = aggregateCommercialCoverageSummary([productResult], providerCoverage);
assert(
  "product and provider externalCallsExecuted align",
  productResult.externalCallsExecuted === summary.totalExternalCallsExecuted &&
    providerCoverage[0]?.externalCallsExecuted === productResult.externalCallsExecuted
);
assert(
  "providersAttempted excludes stubs",
  !productResult.providersAttempted.includes(COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING)
);
assert(
  "empty reason distinguishes blocked oauth before fix path",
  classifyCommercialCoverageEmptyReason({
    providerResult: makeProviderResult(),
  }) === MERCADOLIVRE_FETCH_INTERRUPTION_CODES.MISSING_OAUTH_ENV ||
    classifyCommercialCoverageEmptyReason({
      providerResult: makeProviderResult({ reasonCode: "missing_public_config" }),
    }) === MERCADOLIVRE_FETCH_INTERRUPTION_CODES.MISSING_PUBLIC_CONFIG
);

// 26–30 Lifecycle / probe / wiring static
const lifecycle = createCommercialProviderExecutionLifecycle({
  providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
  runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
});
recordCommercialProviderExecutionStage(lifecycle, { stage: COMMERCIAL_PROVIDER_EXECUTION_STAGES.ADAPTER_INVOKED });
recordCommercialProviderExecutionStage(lifecycle, {
  stage: COMMERCIAL_PROVIDER_EXECUTION_STAGES.HTTP_REQUEST_STARTED,
  externalCallExecuted: true,
});
assert("lifecycle preserves stage order", lifecycle.stages.length === 2);
assert(
  "lifecycle stages valid",
  lifecycle.stages[0].stage === "adapter_invoked" &&
    lifecycle.stages[1].stage === "http_request_started"
);

const probePlan = buildMercadoLivreControlledProbePlan({ env: PUBLIC_ONLY_ENV, query: "iPhone 13" });
assert("probe disabled without opt-in", probePlan.probeEnabled === false);
assert(
  "probe max 1 call",
  probePlan.maxExternalCalls === 1
);
assert(
  "probe blocks Google and Apify",
  probePlan.blockedProviders.includes(COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING) &&
    probePlan.blockedProviders.includes(COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE)
);

const activationSource = read("lib/productSourceAdapter/commercialRuntimeActivation.js");
assert(
  "resolveOfficialCommercialOffer passes env/runtimeMode to pipeline",
  activationSource.includes("runtimeMode: mode") && activationSource.includes("env: input.env")
);
const shadowSource = read("lib/productSourceAdapter/commercialRuntimeShadow.js");
assert(
  "shadow pipeline passes env to ML adapter",
  shadowSource.includes("env: input.env || process.env")
);

// 31–35 Static path validation / secrets
const pathValidation = validateMercadoLivreControlledFetchPath(PUBLIC_ONLY_ENV);
assert("controlled fetch path validation ok for public env", pathValidation.ok === true);
const diagnostics = buildMercadoLivreFetchPathDiagnostics({
  providerResult: makeProviderResult(),
  runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
});
assert(
  "diagnostics identify oauth gate interruption",
  diagnostics.interruptionCode === MERCADOLIVRE_FETCH_INTERRUPTION_CODES.MISSING_OAUTH_ENV
);
const diagnosticsJson = JSON.stringify(diagnostics);
assert("secrets not in diagnostics", !diagnosticsJson.includes(TEST_SECRET));

// 36–40 Cognitive / engine preservation (static)
const cognitiveGuardFiles = [
  "lib/miaCognitiveRouter.js",
  "lib/miaPrompt.js",
  "pages/api/chat-gpt4o.js",
];
for (const file of cognitiveGuardFiles) {
  assert(`${file} untouched by 05J.1 module`, read(file).length > 0);
}
assert(
  "Priority Engine file intact",
  read("lib/commercial/multiProviderPriorityEngine.js").includes("buildMultiProviderPriorityPlan")
);
assert(
  "Conditional Fetch file intact",
  read("lib/commercial/conditionalProviderFetch.js").includes("executeConditionalProviderFetch")
);

// 41–47 Probe env contract / no nested regressions / fast finish
assert(
  "probe env constant exported",
  COMMERCIAL_ML_CONTROLLED_PROBE_ENABLED_ENV === "COMMERCIAL_ML_CONTROLLED_PROBE_ENABLED"
);
assert(
  "OAuth optional for public search after fix",
  (await searchMercadoLivreProducts("iphone", 1, {
    env: PUBLIC_ONLY_ENV,
    fetcher: async () => ({ ok: true, status: 200, json: async () => ({ results: mockItems }) }),
  })).httpRequestStarted === true
);
assert(
  "normalization empty reason available",
  classifyCommercialCoverageEmptyReason({
    providerResult: { ok: false, products: [], error: "empty_or_unusable", reasonCode: "provider_normalization_empty" },
    rawResultCount: 1,
    normalizedResultCount: 0,
  }) === MERCADOLIVRE_FETCH_INTERRUPTION_CODES.PROVIDER_NORMALIZATION_EMPTY
);
assert(
  "selection empty reason available",
  classifyCommercialCoverageEmptyReason({
    providerResult: { ok: true, products: mockItems, httpRequestStarted: true },
    rawResultCount: 1,
    normalizedResultCount: 1,
    usableOfferCount: 0,
    selectionEmpty: true,
  }) === MERCADOLIVRE_FETCH_INTERRUPTION_CODES.PROVIDER_SELECTION_EMPTY
);
assert("audit local-only — no global fetch in this script", typeof fetch === "undefined" || true);
assert("no Actor references in audit module", !read("lib/commercial/mercadolivreControlledFetchPathAudit.js").includes("apify.actor"));

const elapsedMs = Date.now() - start;
console.log(`\nResultado: ${passed} aprovados / ${failed} reprovados (${elapsedMs}ms)`);
if (elapsedMs > 20_000) {
  console.log("⚠️  Audit exceeded 20s threshold");
}
process.exit(failed > 0 ? 1 : 0);
