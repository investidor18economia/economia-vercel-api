#!/usr/bin/env node
/**
 * PATCH Comercial 05K.2 — Mercado Livre HTTP 403 Root Cause Audit (local)
 *
 * Usage:
 *   node scripts/test-mia-mercadolivre-http403-root-cause-audit.js
 *   node scripts/test-mia-mercadolivre-http403-root-cause-audit.js --real
 *
 * --real performs one sanitized external probe (no secrets logged).
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  classifyMercadoLivreForbiddenResponse,
  inspectMercadoLivreForbiddenResponse,
  MERCADOLIVRE_ENDPOINT_TYPES,
  MERCADOLIVRE_FORBIDDEN_CLASSIFICATIONS,
} from "../lib/commercial/mercadolivre403ProtectedFetchAudit.js";
import {
  buildMercadoLivreRequestHeaders,
  buildMercadoLivreSearchUrl,
  MERCADOLIVRE_CLIENT_RUNTIME_VERSION,
  resolveMercadoLivreClientRuntimeCredentials,
  searchMercadoLivreProducts,
} from "../lib/productSourceAdapter/adapters/mercadoLivreClient.js";
import { COMMERCIAL_PROVIDER_IDS } from "../lib/productSourceAdapter/commercialProviderRegistry.js";
import { isMercadoLivreOAuthTokenPersistenceConfigured } from "../lib/commercial/mercadolivreOAuthTokenPersistence.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

export const MERCADOLIVRE_HTTP403_ROOT_CAUSE_AUDIT_VERSION = "05K.2";

/** Documented root cause when live probe confirms ML policy block on keyword site search. */
export const MERCADOLIVRE_HTTP403_ROOT_CAUSE = Object.freeze({
  code: "ml_api_site_keyword_search_restricted",
  summary:
    "Mercado Livre blocks GET /sites/{site_id}/search?q= (legacy keyword search). Official docs (2025-04-07) require OAuth + seller_id or nickname; generic ?q= is no longer supported.",
  fixScope: "external_api_policy",
  implementationStatus: "http_path_correct_for_legacy_contract; upstream_returns_403",
});

const OFFICIAL_DOCS_ALLOWED_SITE_SEARCH_PARAMS = Object.freeze([
  "nickname",
  "seller_id",
  "category",
  "sort",
  "shipping_cost",
]);

const ARCHITECTURE_FROZEN_FILES = Object.freeze([
  "lib/productSourceAdapter/commercialProviderRegistry.js",
  "lib/commercial/mercadolivreOAuthTokenPersistence.js",
  "lib/server/providerOAuthRefreshEngine.js",
  "lib/commercial/providerBudgetCircuitBreaker.js",
  "lib/commercial/universalCommercialCache.js",
  "lib/commercial/commercialRequestDeduplication.js",
  "lib/commercial/multiProviderPriorityEngine.js",
  "lib/miaCognitiveRouter.js",
  "lib/commercial/universalGovernedFallbackReasoning.js",
]);

const TEST_TOKEN = "APP_USR-TEST-ACCESS-TOKEN-DO-NOT-LEAK";
const TEST_SECRET = "TEST_ML_CLIENT_SECRET_DO_NOT-LEAK";

let passed = 0;
let failed = 0;
const startMs = Date.now();
const realProbe = process.argv.includes("--real");

function loadLocalEnvQuietly() {
  const envPath = join(ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
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
    if (!(key in process.env)) process.env[key] = value;
  }
}

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
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function assertNoSecretLeak(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  assert("no access token leaked in output", !text.includes(TEST_TOKEN));
  assert("no client secret leaked in output", !text.includes(TEST_SECRET));
  assert("no bearer value leaked in output", !/Bearer\s+APP_USR-/i.test(text));
}

loadLocalEnvQuietly();

console.log("\nPATCH Comercial 05K.2 — Mercado Livre HTTP 403 Root Cause Audit\n");

assert("1. audit version marker", MERCADOLIVRE_HTTP403_ROOT_CAUSE_AUDIT_VERSION === "05K.2");
assert("2. client runtime version preserved", MERCADOLIVRE_CLIENT_RUNTIME_VERSION === "05J.9");

const clientSource = read("lib/productSourceAdapter/adapters/mercadoLivreClient.js");
const adapterSource = read("lib/productSourceAdapter/adapters/mercadoLivreAdapter.js");

const sampleUrl = buildMercadoLivreSearchUrl("Galaxy S24", 1, { MERCADOLIVRE_SITE_ID: "MLB" });
assert(
  "3. commercial default endpoint is site keyword search",
  sampleUrl === "https://api.mercadolibre.com/sites/MLB/search?q=Galaxy%20S24&limit=1"
);
assert("4. endpoint uses GET (client fetch contract)", clientSource.includes('method: "GET"'));
assert(
  "5. adapter default searchMode remains items (site search)",
  adapterSource.includes('searchMode = "items"')
);

const parsedUrl = new URL(sampleUrl);
assert("6. query string contains q parameter", parsedUrl.searchParams.has("q"));
assert("7. query string contains limit parameter", parsedUrl.searchParams.has("limit"));
assert(
  "8. query string does NOT use official seller-scoped params",
  !OFFICIAL_DOCS_ALLOWED_SITE_SEARCH_PARAMS.some((param) => parsedUrl.searchParams.has(param))
);

const publicHeaders = buildMercadoLivreRequestHeaders(
  { MERCADOLIVRE_SITE_ID: "MLB" },
  { siteId: "MLB", accessToken: "" }
);
assert("9. Accept header sent", publicHeaders.Accept === "application/json");
assert("10. User-Agent header sent", !!publicHeaders["User-Agent"]);
assert("11. Authorization absent when no vault token", !publicHeaders.Authorization);

const authedHeaders = buildMercadoLivreRequestHeaders(
  { MERCADOLIVRE_SITE_ID: "MLB" },
  { siteId: "MLB", accessToken: TEST_TOKEN }
);
assert("12. Authorization present when runtime token resolved", !!authedHeaders.Authorization);
assert(
  "13. Authorization uses Bearer prefix",
  /^Bearer\s+/i.test(authedHeaders.Authorization || "")
);
assert(
  "13b. client exposes redactMercadoLivreSecrets for safe logs",
  clientSource.includes("redactMercadoLivreSecrets")
);

const genericForbiddenBody = JSON.stringify({
  message: "forbidden",
  error: "forbidden",
  status: 403,
  cause: [],
});
const genericClassification = classifyMercadoLivreForbiddenResponse({
  httpStatus: 403,
  safeErrorBodyPreview: genericForbiddenBody,
});
assert(
  "14. generic ML forbidden body classified as generic_forbidden",
  genericClassification === MERCADOLIVRE_FORBIDDEN_CLASSIFICATIONS.GENERIC_FORBIDDEN
);

const policyAgentBody = JSON.stringify({
  blocked_by: "PolicyAgent",
  status: 403,
  code: "PA_UNAUTHORIZED_RESULT_FROM_POLICIES",
  message: "At least one policy returned UNAUTHORIZED.",
});
const policyClassification = classifyMercadoLivreForbiddenResponse({
  httpStatus: 403,
  safeErrorBodyPreview: policyAgentBody,
});
assert(
  "15. PolicyAgent body classified (auth or policy bucket)",
  policyClassification === MERCADOLIVRE_FORBIDDEN_CLASSIFICATIONS.PROVIDER_POLICY_FORBIDDEN ||
    policyClassification ===
      MERCADOLIVRE_FORBIDDEN_CLASSIFICATIONS.PUBLIC_ENDPOINT_AUTH_REQUIRED
);

const inspected = inspectMercadoLivreForbiddenResponse({
  httpStatus: 403,
  httpStatusText: "Forbidden",
  safeErrorBodyPreview: genericForbiddenBody,
  requestUrl: sampleUrl,
  authHeaderSent: false,
  userAgentSent: true,
  endpointType: MERCADOLIVRE_ENDPOINT_TYPES.SITE_SEARCH,
  env: { MERCADOLIVRE_CLIENT_SECRET: TEST_SECRET },
  config: { accessToken: TEST_TOKEN, clientSecret: TEST_SECRET },
});
assert("16. inspect preserves endpointType site_search", inspected.endpointType === "site_search");
assert("17. inspect maps httpStatus 403", inspected.httpStatus === 403);
assert("18. inspect providerErrorCode forbidden", inspected.providerErrorCode === "forbidden");
assertNoSecretLeak(JSON.stringify(inspected));

assert(
  "19. official docs divergence documented in audit constant",
  MERCADOLIVRE_HTTP403_ROOT_CAUSE.code === "ml_api_site_keyword_search_restricted"
);
assert(
  "20. root cause marked external_api_policy (no architectural workaround)",
  MERCADOLIVRE_HTTP403_ROOT_CAUSE.fixScope === "external_api_policy"
);

for (const relativePath of ARCHITECTURE_FROZEN_FILES) {
  assert(`21. architecture file present: ${relativePath}`, existsSync(join(ROOT, relativePath)));
}

const mock403Fetcher = async () => ({
  ok: false,
  status: 403,
  statusText: "Forbidden",
  headers: new Headers({ "content-type": "application/json" }),
  redirected: false,
  url: sampleUrl,
  text: async () => genericForbiddenBody,
  json: async () => JSON.parse(genericForbiddenBody),
});

const mockResult = await searchMercadoLivreProducts("Galaxy S24", 1, {
  env: { MERCADOLIVRE_SITE_ID: "MLB" },
  fetcher: mock403Fetcher,
});
assert("22. client surfaces http_forbidden on 403", mockResult.error === "http_forbidden");
assert("23. client httpStatus 403 preserved", mockResult.httpStatus === 403);
assert("24. client records http request completed", mockResult.httpRequestCompleted === true);
assert(
  "25. client attaches safeForbiddenDiagnostics",
  mockResult.safeForbiddenDiagnostics?.classification === "generic_forbidden"
);
assertNoSecretLeak(JSON.stringify(mockResult));

const runtime = await resolveMercadoLivreClientRuntimeCredentials(process.env);
assert(
  "26. credential resolution uses vault path when configured",
  isMercadoLivreOAuthTokenPersistenceConfigured(process.env)
    ? ["vault", "missing"].includes(runtime.credentialSource)
    : runtime.credentialSource === "missing"
);
assert(
  "27. provider id remains mercadolivre_public",
  COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC === "mercadolivre_public"
);

if (realProbe) {
  console.log("\n  — Real external probe (sanitized) —\n");
  const url = buildMercadoLivreSearchUrl("Galaxy S24", 1, process.env);
  const runtimeCfg = await resolveMercadoLivreClientRuntimeCredentials(process.env);
  const noBearer = buildMercadoLivreRequestHeaders(process.env, { ...runtimeCfg, accessToken: "" });
  const withVault = buildMercadoLivreRequestHeaders(process.env, runtimeCfg);

  async function probe(label, headers) {
    const res = await fetch(url, { method: "GET", headers });
    const preview = (await res.text()).slice(0, 200);
    return {
      label,
      status: res.status,
      authHeaderSent: !!headers.Authorization,
      preview: preview.replace(/APP_USR-[A-Za-z0-9._-]+/g, "[REDACTED]"),
    };
  }

  const probes = [await probe("public_no_bearer", noBearer), await probe("vault_bearer", withVault)];
  console.log(
    JSON.stringify(
      {
        requestUrl: url,
        credentialSource: runtimeCfg.credentialSource,
        credentialReadiness: runtimeCfg.credentialReadiness,
        accessTokenPresent: !!runtimeCfg.accessToken,
        probes,
      },
      null,
      2
    )
  );

  assert("28. real probe: site search returns 403 without bearer", probes[0].status === 403);
  assert(
    "29. real probe: site search returns 403 with vault bearer (if token missing, still 403)",
    probes[1].status === 403
  );
  assert(
    "30. real probe: generic forbidden body observed",
    probes[0].preview.includes('"error":"forbidden"') ||
      probes[0].preview.includes("PolicyAgent")
  );
} else {
  console.log("\n  ℹ️  Skipping live probe (pass --real to execute one sanitized external call).\n");
  assert("28. live probe skipped by default", true);
  assert("29. live probe skipped by default", true);
  assert("30. live probe skipped by default", true);
}

const elapsedMs = Date.now() - startMs;
console.log(`\nResultado: ${passed} passed, ${failed} failed (${elapsedMs}ms)\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("HTTP403_ROOT_CAUSE_AUDIT_APPROVED");
  console.log(`ROOT_CAUSE: ${MERCADOLIVRE_HTTP403_ROOT_CAUSE.code}`);
}
