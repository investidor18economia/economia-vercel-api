/**
 * PATCH Comercial 05G — DEV Commercial Cost Guard Audit (local only)
 *
 * Usage:
 *   node scripts/test-mia-dev-cost-guard-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { COMMERCIAL_PROVIDER_IDS } from "../lib/productSourceAdapter/commercialProviderRegistry.js";
import {
  PROVIDER_COST_GUARD_DECISIONS,
  evaluateProviderCostGuardForProvider,
} from "../lib/commercial/providerCostGuard.js";
import {
  DEV_COMMERCIAL_COST_GUARD_DECISIONS,
  DEV_COMMERCIAL_COST_GUARD_VERSION,
  DEV_COMMERCIAL_REAL_EXECUTION_OPT_IN_ENV,
  buildDevCommercialCostGuardContext,
  buildDevCommercialCostGuardResponse,
  buildDevCommercialCostGuardTracePatch,
  evaluateDevCommercialExecutionPermission,
  evaluateDevManualScriptCommercialExecution,
  isCommercialDevRealExternalCallsEnabled,
  isDevEndpointAllowed,
  isDevSecretValid,
  resolveDevCommercialEndpointGuard,
  shouldRunCommercialDevDryRun,
} from "../lib/commercial/devCommercialCostGuard.js";
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

function mockReq(overrides = {}) {
  return {
    query: overrides.query || {},
    headers: overrides.headers || {},
  };
}

console.log(`\nPATCH Comercial 05G — DEV Commercial Cost Guard (${DEV_COMMERCIAL_COST_GUARD_VERSION})\n`);

console.log("── Module contract ──");
const moduleSource = read("lib/commercial/devCommercialCostGuard.js");
assert("version 05G", DEV_COMMERCIAL_COST_GUARD_VERSION === "05G");
assert("no LLM imports", !moduleSource.match(/openai|callOpenAI|buildMiaPrompt/i));
assert("no subprocess imports", !moduleSource.match(/from\s+["']node:child_process["']/));
assert("no fetch in guard module", !moduleSource.match(/\bfetch\s*\(/));
assert("dev endpoint exists", read("pages/api/dev/dev-commercial-cost-guard.js").includes("evaluateDevCommercialExecutionPermission"));
assert("opt-in env documented", moduleSource.includes(DEV_COMMERCIAL_REAL_EXECUTION_OPT_IN_ENV));
assert("default opt-in disabled", isCommercialDevRealExternalCallsEnabled({}) === false);

console.log("\n── DEV default dry-run ──");
const devDefault = evaluateDevCommercialExecutionPermission({
  req: mockReq(),
  providerId: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
  invocationSource: "dev_endpoint",
  isDevEndpoint: true,
});
assert("DEV sem opt-in = dry_run", devDefault.decision === DEV_COMMERCIAL_COST_GUARD_DECISIONS.DRY_RUN);
assert("DEV sem opt-in não chama provider", devDefault.shouldCallExternalProvider === false);
assert("DEV sem opt-in shouldReturnDryRun", devDefault.shouldReturnDryRun === true);
assert("externalCallPrevented", devDefault.externalCallPrevented === true);

console.log("\n── Adapter integration (no external call) ──");
const costGuardContext = buildDevCommercialCostGuardContext({
  req: mockReq(),
  invocationSource: "dev_audit",
  providerId: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
});
const googleBlocked = await fetchGoogleShoppingAdapterResult({
  query: "notebook",
  limit: 3,
  costGuardContext,
  fetcher: async () => {
    throw new Error("external_fetch_should_not_run");
  },
});
assert("google adapter não chama fetcher", googleBlocked.costGuardBlocked === true || googleBlocked.count === 0);
assert("google adapter não inventa ofertas", (googleBlocked.products || []).length === 0);

const apifyBlocked = await searchApifyMercadoLivreProducts("notebook", 3, {
  costGuardContext: buildDevCommercialCostGuardContext({
    req: mockReq(),
    invocationSource: "dev_audit",
    providerId: COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE,
  }),
});
assert("apify adapter não chama actor", apifyBlocked.costGuardBlocked === true || apifyBlocked.count === 0);
assert("apify adapter não inventa ofertas", (apifyBlocked.products || []).length === 0);

console.log("\n── Opt-in rules ──");
const queryOnly = evaluateDevCommercialExecutionPermission({
  req: mockReq({ query: { real: "1" } }),
  providerId: "paid_provider_a",
  billingTier: "paid_external",
  isDevEndpoint: true,
  env: { [DEV_COMMERCIAL_REAL_EXECUTION_OPT_IN_ENV]: "false" },
});
assert("query param sozinho não libera", queryOnly.realExecutionAllowed === false);

const envOnly = evaluateDevCommercialExecutionPermission({
  req: mockReq(),
  providerId: "paid_provider_a",
  billingTier: "paid_external",
  isDevEndpoint: true,
  env: { [DEV_COMMERCIAL_REAL_EXECUTION_OPT_IN_ENV]: "true" },
});
assert("env sozinho não libera", envOnly.realExecutionAllowed === false);

const fullOptIn = evaluateDevCommercialExecutionPermission({
  req: mockReq({ query: { real: "1" } }),
  providerId: "paid_provider_future",
  billingTier: "paid_external",
  isDevEndpoint: true,
  env: {
    NODE_ENV: "development",
    [DEV_COMMERCIAL_REAL_EXECUTION_OPT_IN_ENV]: "true",
  },
});
assert("env + request opt-in + secret válido (dev local)", fullOptIn.realExecutionAllowed === true);
assert("decision allow_real_execution", fullOptIn.decision === DEV_COMMERCIAL_COST_GUARD_DECISIONS.ALLOW_REAL_EXECUTION);

console.log("\n── Production / secret ──");
const prodNoSecret = evaluateDevCommercialExecutionPermission({
  req: mockReq(),
  providerId: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
  isDevEndpoint: true,
  environment: "production",
  env: {
    NODE_ENV: "production",
    DEV_API_SECRET: "secret123",
    [DEV_COMMERCIAL_REAL_EXECUTION_OPT_IN_ENV]: "true",
  },
});
assert("produção sem secret bloqueia", prodNoSecret.blocked === true);

const prodQueryOnly = evaluateDevCommercialExecutionPermission({
  req: mockReq({ query: { real: "1", secret: "wrong" } }),
  providerId: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
  isDevEndpoint: true,
  environment: "production",
  env: {
    NODE_ENV: "production",
    DEV_API_SECRET: "secret123",
    [DEV_COMMERCIAL_REAL_EXECUTION_OPT_IN_ENV]: "true",
  },
});
assert("produção query param sem secret não libera", prodQueryOnly.realExecutionAllowed === false);

const prodFunctional = evaluateDevCommercialExecutionPermission({
  providerId: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
  invocationSource: "commercial_runtime_functional",
  devGuardApplies: false,
  environment: "production",
});
assert("produção funcional inalterada", prodFunctional.realExecutionAllowed === true);
assert("dev guard não aplica em produção funcional", prodFunctional.devGuardApplies === false);

console.log("\n── Provider generalization ──");
for (const providerId of ["paid_provider_a", "paid_provider_future", "free_provider_a"]) {
  const perm = evaluateDevCommercialExecutionPermission({
    req: mockReq(),
    providerId,
    billingTier: providerId.startsWith("free") ? "free_external" : "paid_external",
    isDevEndpoint: true,
  });
  assert(`${providerId} protegido em DEV`, perm.shouldReturnDryRun === true);
}

const internalMock = evaluateDevCommercialExecutionPermission({
  providerId: "internal_mock_provider",
  billingTier: "internal",
  isDevEndpoint: true,
  isSyntheticTest: true,
});
assert("internal synthetic permitido", internalMock.decision === DEV_COMMERCIAL_COST_GUARD_DECISIONS.ALLOW_LOCAL_SYNTHETIC_TEST);

console.log("\n── Dry-run response contract ──");
const dryRunResponse = buildDevCommercialCostGuardResponse(devDefault, {
  plannedRequest: { query: "notebook", limit: 5 },
});
assert("dryRun true", dryRunResponse.dryRun === true);
assert("externalCallExecuted false", dryRunResponse.externalCallExecuted === false);
assert("mensagem clara", typeof dryRunResponse.safetyMessage === "string" && dryRunResponse.safetyMessage.length > 40);
assert("identifica provider", dryRunResponse.providerId === COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING);
assert("requiredOptIn presente", !!dryRunResponse.requiredOptIn?.env);
assert("não inventa prices", !dryRunResponse.prices && !dryRunResponse.products);

console.log("\n── Endpoint wiring ──");
const protectedEndpoints = [
  "pages/api/dev/apify-mercadolivre-search.js",
  "pages/api/dev/commercial-shadow.js",
  "pages/api/dev/commercial-runtime-activation.js",
  "pages/api/dev/commercial-shadow-summary.js",
  "pages/api/dev/commercial-deduplication.js",
  "pages/api/dev/commercial-offer-merge.js",
  "pages/api/dev/commercial-selection.js",
  "pages/api/dev/commercial-alignment.js",
  "pages/api/dev/mercadolivre-search.js",
  "pages/api/dev/mercadolivre-product-flow.js",
  "pages/api/test-serp.js",
];
for (const endpoint of protectedEndpoints) {
  const source = read(endpoint);
  assert(`${endpoint.split("/").pop()} protegido`, source.includes("devCommercialCostGuard"));
}

console.log("\n── Script guard ──");
const scriptBlocked = evaluateDevManualScriptCommercialExecution(["node", "script.js", "--http"], {});
assert("script --http sem opt-in bloqueado", scriptBlocked.applies === true && scriptBlocked.allowed === false);
const scriptAllowed = evaluateDevManualScriptCommercialExecution(
  ["node", "script.js", "--http", "--allow-paid-external"],
  { [DEV_COMMERCIAL_REAL_EXECUTION_OPT_IN_ENV]: "true" }
);
assert("script --http + --allow-paid-external + env permitido", scriptAllowed.allowed === true);
assert("apify audit script wired", read("scripts/test-mia-apify-mercadolivre-client-isolated-audit.js").includes("enforceDevManualScriptCommercialExecution"));

console.log("\n── 05B integration ──");
const lockedContext = buildDevCommercialCostGuardContext({ req: mockReq(), invocationSource: "dev_audit" });
const costGuardDecision = evaluateProviderCostGuardForProvider(
  COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE,
  lockedContext
);
assert("Provider Cost Guard permanece ativo", costGuardDecision.decision === PROVIDER_COST_GUARD_DECISIONS.DRY_RUN);
assert("05G não duplica autoridade — alimenta 05B opt-in", lockedContext._devCommercialCostGuardLocked === true);

console.log("\n── Layers preserved (module presence) ──");
assert("Request Dedup module", read("lib/commercial/commercialRequestDeduplication.js").includes("05C"));
assert("Universal Cache module", read("lib/commercial/universalCommercialCache.js").includes("05D"));
assert("Conditional Fetch module", read("lib/commercial/conditionalProviderFetch.js").includes("05E"));
assert("Budget/Circuit module", read("lib/commercial/providerBudgetCircuitBreaker.js").includes("05F"));
assert("Data Layer chat preserved", read("pages/api/chat-gpt4o.js").includes("fetchSerpPrices"));
assert("Router preserved", read("lib/miaCognitiveRouter.js").length > 100);
assert("prompt preserved", read("lib/miaPrompt.js").length > 100);

console.log("\n── Endpoint guard helper ──");
const endpointGuard = resolveDevCommercialEndpointGuard(mockReq(), {
  invocationSource: "dev_endpoint",
  providerId: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
  plannedRequest: { query: "test", limit: 5 },
});
assert("endpoint guard dry-run", endpointGuard.shouldReturnDryRunResponse === true);
assert("endpoint guard body ok", endpointGuard.body?.ok === true);

console.log("\n── Tracer patch ──");
const tracePatch = buildDevCommercialCostGuardTracePatch(devDefault);
assert("trace patch dev_commercial_cost_guard", !!tracePatch?.dev_commercial_cost_guard);
assert("trace não inclui secrets", !JSON.stringify(tracePatch).includes("secret123"));

console.log("\n── shouldRunCommercialDevDryRun ──");
assert("shouldRunCommercialDevDryRun true sem opt-in", shouldRunCommercialDevDryRun({ isDevEndpoint: true, req: mockReq() }) === true);

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
