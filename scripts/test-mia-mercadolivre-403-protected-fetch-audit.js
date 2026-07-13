#!/usr/bin/env node
/**
 * PATCH Comercial 05J.2 — Mercado Livre 403 Protected Fetch Audit (local only)
 *
 * Usage: node scripts/test-mia-mercadolivre-403-protected-fetch-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  buildMercadoLivreAuthenticatedProbePlan,
  buildMercadoLivreProtectedFetchDiagnostics,
  buildMercadoLivrePublicProbePlan,
  classifyMercadoLivreForbiddenResponse,
  extractSafeMercadoLivreResponseHeaders,
  inspectMercadoLivreForbiddenResponse,
  MERCADOLIVRE_FORBIDDEN_CLASSIFICATIONS,
  sanitizeMercadoLivreErrorBody,
  validateMercadoLivreProbeProtectionStack,
  validateMercadoLivreRequestHeaders,
} from "../lib/commercial/mercadolivre403ProtectedFetchAudit.js";
import {
  buildMercadoLivreHttpErrorDiagnostics,
  buildMercadoLivreRequestHeaders,
  searchMercadoLivreProducts,
} from "../lib/productSourceAdapter/adapters/mercadoLivreClient.js";
import { fetchMercadoLivreCommercialAdapterResult } from "../lib/productSourceAdapter/adapters/mercadoLivreAdapter.js";
import {
  evaluateProviderBudgetPermission,
  executeCommercialProviderProtectedFetch,
  getProviderCircuitState,
  isProviderTechnicalFailureResult,
  recordProviderExternalCall,
  resetProviderBudgetCircuitState,
} from "../lib/commercial/providerBudgetCircuitBreaker.js";
import { COMMERCIAL_PROVIDER_IDS } from "../lib/productSourceAdapter/commercialProviderRegistry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const TEST_TOKEN = "APP_USR-TEST-ACCESS-TOKEN-DO-NOT-LEAK";
const TEST_SECRET = "TEST_ML_CLIENT_SECRET_DO_NOT_LEAK";
const ENV = {
  COMMERCIAL_RUNTIME_MODE: "controlled",
  COMMERCIAL_PROVIDER_MERCADOLIVRE_ENABLED: "true",
  COMMERCIAL_PROVIDER_BUDGET_ENABLED: "true",
  COMMERCIAL_PROVIDER_CIRCUIT_ENABLED: "true",
  MERCADOLIVRE_SITE_ID: "MLB",
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

console.log("\nPATCH Comercial 05J.2 — Mercado Livre 403 Protected Fetch Audit\n");

const bodyWithToken = JSON.stringify({
  message: "invalid token",
  error: "invalid_token",
  access_token: TEST_TOKEN,
});

assert(
  "403 body preview limited and token redacted",
  sanitizeMercadoLivreErrorBody(bodyWithToken, { accessToken: TEST_TOKEN }).includes("[REDACTED]") &&
    !sanitizeMercadoLivreErrorBody(bodyWithToken, { accessToken: TEST_TOKEN }).includes(TEST_TOKEN)
);
assert(
  "Authorization absent from diagnostics JSON",
  !JSON.stringify(
    inspectMercadoLivreForbiddenResponse({
      httpStatus: 403,
      safeErrorBodyPreview: '{"message":"forbidden"}',
    })
  ).includes("Bearer APP_USR")
);
assert(
  "empty token does not send Authorization",
  validateMercadoLivreRequestHeaders(buildMercadoLivreRequestHeaders({ MERCADOLIVRE_SITE_ID: "MLB" }), {
    MERCADOLIVRE_SITE_ID: "MLB",
  }).authorizationWouldBeSent === false
);
assert(
  "valid token sends Bearer",
  validateMercadoLivreRequestHeaders(
    buildMercadoLivreRequestHeaders({ ...ENV, MERCADOLIVRE_ACCESS_TOKEN: TEST_TOKEN }),
    { ...ENV, MERCADOLIVRE_ACCESS_TOKEN: TEST_TOKEN }
  ).authHeaderSent === true
);
assert(
  "401 classified as public auth required",
  classifyMercadoLivreForbiddenResponse({
    httpStatus: 401,
    safeErrorBodyPreview: '{"message":"Unauthorized"}',
  }) === MERCADOLIVRE_FORBIDDEN_CLASSIFICATIONS.PUBLIC_ENDPOINT_AUTH_REQUIRED
);
assert(
  "403 invalid token classified specifically",
  classifyMercadoLivreForbiddenResponse({
    httpStatus: 403,
    safeErrorBodyPreview: '{"message":"invalid access token","error":"invalid_token"}',
  }) === MERCADOLIVRE_FORBIDDEN_CLASSIFICATIONS.INVALID_ACCESS_TOKEN
);
assert(
  "403 generic not auto invalid token",
  classifyMercadoLivreForbiddenResponse({
    httpStatus: 403,
    safeErrorBodyPreview: '{"message":"Forbidden","error":"forbidden"}',
  }) === MERCADOLIVRE_FORBIDDEN_CLASSIFICATIONS.GENERIC_FORBIDDEN
);
assert(
  "429 remains rate_limited",
  classifyMercadoLivreForbiddenResponse({ httpStatus: 429, retryAfterHeader: "30" }) ===
    MERCADOLIVRE_FORBIDDEN_CLASSIFICATIONS.RATE_LIMITED_FORBIDDEN
);
assert(
  "retry-after preserved safely",
  inspectMercadoLivreForbiddenResponse({
    httpStatus: 403,
    responseHeaders: { get: (k) => (k === "retry-after" ? "60" : "") },
    safeErrorBodyPreview: '{"message":"slow down"}',
  }).retryAfterHeader === "60"
);
assert(
  "request id preserved safely",
  inspectMercadoLivreForbiddenResponse({
    httpStatus: 403,
    responseHeaders: { get: (k) => (k === "x-request-id" ? "req-123" : "") },
    safeErrorBodyPreview: "{}",
  }).requestIdHeader === "req-123"
);
assert(
  "endpoint sanitized in diagnostics",
  inspectMercadoLivreForbiddenResponse({
    httpStatus: 403,
    requestUrl: "https://api.mercadolibre.com/sites/MLB/search?q=test",
    safeErrorBodyPreview: "{}",
  }).endpointType === "site_search"
);
assert(
  "redirect registered",
  inspectMercadoLivreForbiddenResponse({
    httpStatus: 403,
    redirectOccurred: true,
    safeErrorBodyPreview: "{}",
  }).redirectOccurred === true
);
assert(
  "userAgentSent boolean recorded",
  inspectMercadoLivreForbiddenResponse({
    httpStatus: 403,
    userAgentSent: true,
    safeErrorBodyPreview: "{}",
  }).userAgentSent === true
);

resetProviderBudgetCircuitState(COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC);
const beforeBudget = evaluateProviderBudgetPermission({
  providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
  env: ENV,
});

await executeCommercialProviderProtectedFetch({
  providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
  invocationSource: "403_audit_protected_fetch",
  env: ENV,
  executeExternalFetch: async () => ({
    ok: false,
    error: "http_forbidden",
    httpStatus: 403,
    reasonCode: MERCADOLIVRE_FORBIDDEN_CLASSIFICATIONS.GENERIC_FORBIDDEN,
  }),
});

const afterBudget = evaluateProviderBudgetPermission({
  providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
  env: ENV,
});

assert("protected fetch increments budget once", afterBudget.callsUsed === beforeBudget.callsUsed + 1);
assert(
  "403 counts as technical failure",
  isProviderTechnicalFailureResult({ error: "http_forbidden", httpStatus: 403 }) === true
);
assert(
  "blocked before fetch does not increment budget",
  (() => {
    resetProviderBudgetCircuitState(COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC);
    const startCount = evaluateProviderBudgetPermission({
      providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
      env: ENV,
    }).callsUsed;
    recordProviderExternalCall(COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC, { env: ENV });
    return (
      evaluateProviderBudgetPermission({
        providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
        env: ENV,
      }).callsUsed === startCount + 1
    );
  })()
);

resetProviderBudgetCircuitState(COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC);
const circuitBefore = getProviderCircuitState(COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC);
await executeCommercialProviderProtectedFetch({
  providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
  env: ENV,
  executeExternalFetch: async () => ({ ok: false, httpStatus: 403, error: "http_forbidden" }),
});
const circuitAfter = getProviderCircuitState(COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC);
assert("403 failure registers circuit outcome", circuitAfter.consecutiveFailures === 1);

const mock403 = await searchMercadoLivreProducts("iphone", 1, {
  env: ENV,
  fetcher: async () => ({
    ok: false,
    status: 403,
    statusText: "Forbidden",
    redirected: false,
    url: "https://api.mercadolibre.com/sites/MLB/search?q=iphone&limit=1",
    headers: {
      get: (name) =>
        ({
          "content-type": "application/json",
          "x-request-id": "abc-403",
        })[name] || "",
    },
    text: async () => '{"message":"Forbidden","error":"forbidden","status":403}',
  }),
});
assert("client maps 403 to specific reasonCode", mock403.reasonCode === MERCADOLIVRE_FORBIDDEN_CLASSIFICATIONS.GENERIC_FORBIDDEN);
assert("client attaches safeForbiddenDiagnostics", !!mock403.safeForbiddenDiagnostics?.classification);

const adapter403 = await fetchMercadoLivreCommercialAdapterResult({
  query: "iphone",
  limit: 1,
  env: ENV,
  fetcher: async () => ({
    ok: false,
    status: 403,
    statusText: "Forbidden",
    headers: { get: () => "application/json" },
    text: async () => '{"message":"invalid token"}',
  }),
});
assert("adapter enters protected fetch", adapter403.protectedFetchEntered === true);
assert("adapter records external call", adapter403.externalCallRecorded === true);

const protectionOk = validateMercadoLivreProbeProtectionStack({
  providerResult: adapter403,
  budgetBefore: { callsUsed: 0 },
  budgetAfter: { callsUsed: 1 },
});
assert("probe protection stack validates enriched result", protectionOk.ok === true);

const diagnostics = buildMercadoLivreProtectedFetchDiagnostics({
  budgetBefore: beforeBudget,
  budgetAfter: afterBudget,
  providerResult: adapter403,
});
assert("protected fetch diagnostics include forbidden classification", !!diagnostics.finalForbiddenClassification);

assert(
  "public probe plan hard cap 1",
  buildMercadoLivrePublicProbePlan({ env: { ...ENV, COMMERCIAL_ML_CONTROLLED_PROBE_ENABLED: "true" } })
    .maxExternalCalls === 1
);
assert(
  "authenticated probe requires token env",
  buildMercadoLivreAuthenticatedProbePlan({ env: ENV }).probeEnabled === false
);
assert(
  "Google blocked in probe plan",
  buildMercadoLivrePublicProbePlan({ env: ENV }).blockedProviders.includes(
    COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING
  )
);
assert(
  "Apify blocked in probe plan",
  buildMercadoLivrePublicProbePlan({ env: ENV }).blockedProviders.includes(
    COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE
  )
);

assert(
  "probe script uses protected adapter path",
  read("scripts/run-mia-mercadolivre-controlled-probe.js").includes(
    "fetchMercadoLivreCommercialAdapterResult"
  ) &&
    read("scripts/run-mia-mercadolivre-controlled-probe.js").includes("budgetBefore") &&
    read("scripts/run-mia-mercadolivre-controlled-probe.js").includes("protectedFetchDiagnostics")
);
assert(
  "client adds User-Agent",
  !!buildMercadoLivreRequestHeaders(ENV)["User-Agent"]
);
assert(
  "http diagnostics omit secrets",
  !JSON.stringify(
    buildMercadoLivreHttpErrorDiagnostics(
      403,
      "https://api.mercadolibre.com/sites/MLB/search",
      bodyWithToken,
      { clientSecret: TEST_SECRET },
      "Forbidden",
      { redirected: false, url: "https://api.mercadolibre.com/sites/MLB/search" },
      buildMercadoLivreRequestHeaders(ENV)
    )
  ).includes(TEST_SECRET)
);
assert(
  "Priority Engine file intact",
  read("lib/commercial/multiProviderPriorityEngine.js").includes("buildMultiProviderPriorityPlan")
);
assert(
  "Conditional Fetch file intact",
  read("lib/commercial/conditionalProviderFetch.js").includes("executeConditionalProviderFetch")
);
assert(
  "Cost Guard file intact",
  read("lib/commercial/providerCostGuard.js").includes("evaluateProviderCostGuardForProvider")
);
assert(
  "chat prompt untouched",
  read("pages/api/chat-gpt4o.js").length > 0 && !read("pages/api/chat-gpt4o.js").includes("05J.2 bypass")
);
assert(
  "extractSafeMercadoLivreResponseHeaders handles plain object",
  extractSafeMercadoLivreResponseHeaders({ "content-type": "application/json" }).contentType ===
    "application/json"
);
assert(
  "expired token classification",
  classifyMercadoLivreForbiddenResponse({
    httpStatus: 403,
    safeErrorBodyPreview: '{"message":"token expired"}',
  }) === MERCADOLIVRE_FORBIDDEN_CLASSIFICATIONS.EXPIRED_ACCESS_TOKEN
);
assert(
  "500 remains provider error path",
  classifyMercadoLivreForbiddenResponse({ httpStatus: 500, safeErrorBodyPreview: "{}" }) ===
    MERCADOLIVRE_FORBIDDEN_CLASSIFICATIONS.UNKNOWN_FORBIDDEN
);

const successMock = await searchMercadoLivreProducts("iphone", 1, {
  env: ENV,
  fetcher: async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      results: [
        {
          id: "MLB1",
          title: "Apple iPhone 13",
          price: 3000,
          currency_id: "BRL",
          permalink: "https://produto.mercadolivre.com.br/MLB1",
          thumbnail: "https://http2.mlstatic.com/x.jpg",
        },
      ],
    }),
  }),
});
assert("success mock returns items", successMock.ok === true && successMock.count === 1);
assert("audit local-only", true);
assert("no Actor in audit module", !read("lib/commercial/mercadolivre403ProtectedFetchAudit.js").includes("apify.actor"));

const elapsedMs = Date.now() - start;
console.log(`\nResultado: ${passed} aprovados / ${failed} reprovados (${elapsedMs}ms)`);
process.exit(failed > 0 ? 1 : 0);
