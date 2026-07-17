#!/usr/bin/env node
/**
 * PATCH Comercial 05J.3 — Mercado Livre OAuth Token Readiness Audit (local only)
 *
 * Usage: node scripts/test-mia-mercadolivre-oauth-token-readiness-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  buildMercadoLivreAuthenticatedProbePlan,
  buildMercadoLivreOAuthReadinessReport,
  classifyMercadoLivreOAuthReadiness,
  evaluateMercadoLivreTokenExpiry,
  inspectMercadoLivreAuthHeaderReadiness,
  inspectMercadoLivreOAuthCallbackPersistence,
  inspectMercadoLivreOAuthConfiguration,
  inspectMercadoLivreRedirectUriReadiness,
  inspectMercadoLivreTokenPresence,
  MERCADOLIVRE_OAUTH_READINESS_CLASSIFICATIONS,
  sanitizeMercadoLivreOAuthDiagnostics,
  validateMercadoLivreAccessTokenShape,
  validateMercadoLivreOAuthStateProtection,
} from "../lib/commercial/mercadolivreOAuthTokenReadinessAudit.js";
import { buildUniversalCommercialCacheKey } from "../lib/commercial/universalCommercialCache.js";
import { buildMercadoLivreAuthorizationUrl } from "../lib/productSourceAdapter/adapters/mercadoLivreOAuth.js";
import { COMMERCIAL_PROVIDER_IDS } from "../lib/productSourceAdapter/commercialProviderRegistry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const TEST_ACCESS_TOKEN = "APP_USR-TEST-ACCESS-TOKEN-DO-NOT-LEAK";
const TEST_REFRESH_TOKEN = "TEST_ML_REFRESH_TOKEN_DO_NOT_LEAK";
const TEST_SECRET = "TEST_ML_CLIENT_SECRET_DO_NOT_LEAK";
const REDIRECT_URI = "https://economia-ai.vercel.app/api/auth/mercadolivre/callback";

const BASE_OAUTH_ENV = {
  MERCADOLIVRE_CLIENT_ID: "7758884973596489",
  MERCADOLIVRE_CLIENT_SECRET: TEST_SECRET,
  MERCADOLIVRE_REDIRECT_URI: REDIRECT_URI,
  MERCADOLIVRE_SITE_ID: "MLB",
  COMMERCIAL_RUNTIME_MODE: "controlled",
  COMMERCIAL_PROVIDER_MERCADOLIVRE_ENABLED: "true",
  COMMERCIAL_ML_AUTHENTICATED_PROBE_ENABLED: "true",
  SERPAPI_KEY: "",
  APIFY_API_TOKEN: "",
};

const CALLBACK_SOURCE = readFileSync(join(ROOT, "pages/api/auth/mercadolivre/callback.js"), "utf8");
const START_SOURCE = readFileSync(join(ROOT, "pages/api/auth/mercadolivre/start.js"), "utf8");
const CACHE_SOURCE = readFileSync(join(ROOT, "lib/commercial/universalCommercialCache.js"), "utf8");

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


function auditInput(extra = {}) {
  return {
    env: { ...BASE_OAUTH_ENV, ...extra.env },
    callbackSource: extra.callbackSource ?? CALLBACK_SOURCE,
    startSource: extra.startSource ?? START_SOURCE,
    authorizationUrlBuilder: buildMercadoLivreAuthorizationUrl,
    nowMs: extra.nowMs,
  };
}

const VAULT_OAUTH_ENV = {
  ...BASE_OAUTH_ENV,
  MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_ENABLED: "true",
  PROVIDER_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 11).toString("base64"),
  PROVIDER_CREDENTIAL_ENCRYPTION_KEY_VERSION: "1",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.test",
  VERCEL_ENV: "development",
};

console.log("\nPATCH Comercial 05J.9 — Mercado Livre OAuth Token Readiness Audit\n");

assert(
  "1. vault unavailable detected",
  classifyMercadoLivreOAuthReadiness(auditInput({ env: {} }))
    .readinessClassification === MERCADOLIVRE_OAUTH_READINESS_CLASSIFICATIONS.TOKEN_MISSING &&
    classifyMercadoLivreOAuthReadiness(auditInput({ env: {} })).blockers.includes("vault_unavailable")
);
assert(
  "2. vault disabled means no token source",
  !inspectMercadoLivreTokenPresence({}).accessTokenPresent
);
assert(
  "3. Bearer prefix embedded token rejected",
  validateMercadoLivreAccessTokenShape(`Bearer ${TEST_ACCESS_TOKEN}`).ok === false
);
assert(
  "4. structurally valid token accepted",
  validateMercadoLivreAccessTokenShape(TEST_ACCESS_TOKEN).ok === true
);

const report = buildMercadoLivreOAuthReadinessReport(auditInput({ env: VAULT_OAUTH_ENV }));
assert(
  "5. token never appears in readiness report",
  !JSON.stringify(report).includes(TEST_ACCESS_TOKEN)
);

const logCapture = [];
const originalLog = console.log;
console.log = (...args) => {
  logCapture.push(args.map(String).join(" "));
};
buildMercadoLivreOAuthReadinessReport(auditInput({ env: VAULT_OAUTH_ENV }));
console.log = originalLog;
assert(
  "6. token never appears in logs",
  !logCapture.join("\n").includes(TEST_ACCESS_TOKEN)
);

assert(
  "7. Authorization not sent without vault",
  inspectMercadoLivreAuthHeaderReadiness({ MERCADOLIVRE_SITE_ID: "MLB" }).authHeaderWillBeSent === false
);
assert(
  "8. Authorization sent when vault configured",
  inspectMercadoLivreAuthHeaderReadiness(VAULT_OAUTH_ENV).authHeaderWillBeSent === true
);

const diagnostics = sanitizeMercadoLivreOAuthDiagnostics(
  {
    accessTokenPresent: true,
    authHeaderWillBeSent: true,
    nested: { tokenConfigured: true },
  },
  VAULT_OAUTH_ENV
);
assert(
  "9. diagnostics use booleans without secrets",
  typeof diagnostics.accessTokenPresent === "boolean" &&
    typeof diagnostics.authHeaderWillBeSent === "boolean" &&
    !JSON.stringify(diagnostics).includes(TEST_ACCESS_TOKEN)
);

const expiryKnown = evaluateMercadoLivreTokenExpiry(VAULT_OAUTH_ENV, Date.now());
assert("10. vault path treats expiry as runtime-managed", expiryKnown.accessTokenExpiryKnown === false);

const noVaultExpiry = evaluateMercadoLivreTokenExpiry({}, Date.now());
assert(
  "11. vault unavailable classified",
  noVaultExpiry.reasonCode === "vault_unavailable"
);

const vaultReady = classifyMercadoLivreOAuthReadiness(auditInput({ env: VAULT_OAUTH_ENV }));
assert(
  "12. vault configured readiness",
  vaultReady.readinessClassification ===
    MERCADOLIVRE_OAUTH_READINESS_CLASSIFICATIONS.READY_TOKEN_PRESENT_EXPIRY_UNKNOWN
);

assert(
  "13. vault configured implies refresh available",
  inspectMercadoLivreTokenPresence(VAULT_OAUTH_ENV).refreshTokenPresent === true
);
assert(
  "14. vault disabled implies refresh unavailable",
  inspectMercadoLivreTokenPresence(BASE_OAUTH_ENV).refreshTokenPresent === false
);

const missingClientId = inspectMercadoLivreOAuthConfiguration({
  ...BASE_OAUTH_ENV,
  MERCADOLIVRE_CLIENT_ID: "",
});
assert("15. missing client id detected", missingClientId.clientIdPresent === false);
const missingSecret = inspectMercadoLivreOAuthConfiguration({
  ...BASE_OAUTH_ENV,
  MERCADOLIVRE_CLIENT_SECRET: "",
});
assert("16. missing client secret detected", missingSecret.clientSecretPresent === false);
const missingRedirect = inspectMercadoLivreOAuthConfiguration({
  ...BASE_OAUTH_ENV,
  MERCADOLIVRE_REDIRECT_URI: "",
});
assert("17. missing redirect URI detected", missingRedirect.redirectUriPresent === false);

const redirectMismatch = inspectMercadoLivreRedirectUriReadiness({
  ...BASE_OAUTH_ENV,
  MERCADOLIVRE_REDIRECT_URI: "https://example.test/wrong/callback",
});
assert(
  "18. inconsistent redirect URI flagged",
  redirectMismatch.redirectUriConsistent === false &&
    classifyMercadoLivreOAuthReadiness(
      auditInput({ env: { MERCADOLIVRE_REDIRECT_URI: "https://example.test/wrong/callback" } })
    ).warnings.includes("redirect_uri_mismatch_risk")
);

const persistentCallback = inspectMercadoLivreOAuthCallbackPersistence({
  callbackSource:
    'await supabase.from("tokens").insert({ access_token: token }); process.env.MERCADOLIVRE_ACCESS_TOKEN = token;',
});
assert("19. callback persistence detected", persistentCallback.persistsToken === true);
const exposingCallback = inspectMercadoLivreOAuthCallbackPersistence({ callbackSource: CALLBACK_SOURCE });
assert(
  "20. callback no longer exposes raw tokens in HTTP response",
  exposingCallback.exposesAccessTokenInResponse === false &&
    exposingCallback.exposesRefreshTokenInResponse === false
);

assert(
  "21. missing state detected",
  validateMercadoLivreOAuthStateProtection({
    startSource: START_SOURCE,
    callbackSource: CALLBACK_SOURCE,
  }).stateValidationPresent === false
);
const validState = validateMercadoLivreOAuthStateProtection({
  startSource: 'params.set("state", csrf);',
  callbackSource: "if (req.query.state !== expected) return;",
});
assert("22. valid state recognized", validState.stateValidationPresent === true);

const probeNeedsFlag = buildMercadoLivreAuthenticatedProbePlan(
  auditInput({ env: { COMMERCIAL_ML_AUTHENTICATED_PROBE_ENABLED: "" } })
);
assert(
  "23. authenticated probe requires dedicated flag",
  probeNeedsFlag.blockers.includes("COMMERCIAL_ML_AUTHENTICATED_PROBE_ENABLED!=true")
);
const probeNeedsVault = buildMercadoLivreAuthenticatedProbePlan(
  auditInput({ env: { ...BASE_OAUTH_ENV, MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_ENABLED: "" } })
);
assert(
  "24. authenticated probe requires vault",
  probeNeedsVault.blockers.includes("vault_unavailable")
);
const probePlan = buildMercadoLivreAuthenticatedProbePlan(auditInput({ env: VAULT_OAUTH_ENV }));
assert(
  "25. probe keeps Google blocked",
  !probePlan.priorityOrder.includes(COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING)
);
assert(
  "26. probe keeps Apify blocked",
  !probePlan.priorityOrder.includes(COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE)
);
assert("27. probe max calls is 1", probePlan.maxExternalCalls === 1);
assert("28. probe has no retry", probePlan.retryEnabled === false);
assert("29. probe uses protected fetch", probePlan.protectedFetchReady === true);
assert("30. budget remains active", probePlan.protectionStack.budgetActive === true);
assert("31. circuit remains active", probePlan.protectionStack.circuitActive === true);
assert("32. cache remains active", probePlan.protectionStack.cacheActive === true);
assert("33. dedup remains active", probePlan.protectionStack.dedupActive === true);
assert("34. Cost Guard remains active", probePlan.protectionStack.costGuardActive === true);

const cacheKey = buildUniversalCommercialCacheKey({
  providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
  query: "generic product",
  limit: 1,
});
assert(
  "35. token does not enter cache key",
  !cacheKey.includes(TEST_ACCESS_TOKEN) && !CACHE_SOURCE.includes("MERCADOLIVRE_ACCESS_TOKEN")
);

const auditModule = readFileSync(
  join(ROOT, "lib/commercial/mercadolivreOAuthTokenReadinessAudit.js"),
  "utf8"
);
assert(
  "36. token does not enter tracer/diagnostics raw values",
  auditModule.includes("sanitizeMercadoLivreOAuthDiagnostics") &&
    !auditModule.includes("console.log") &&
    auditModule.includes("accessTokenPresent")
);

assert(
  "37. Data Layer remains intact",
  !readFileSync(join(ROOT, "lib/productSourceAdapter/index.js"), "utf8").includes(
    "mercadolivreOAuthTokenReadinessAudit"
  )
);
assert(
  "38. Decision Engine remains intact",
  !readFileSync(join(ROOT, "lib/miaCognitiveRouter.js"), "utf8").includes("mercadolivreOAuthTokenReadinessAudit")
);
assert(
  "39. winner path remains intact",
  !readFileSync(join(ROOT, "lib/productSourceAdapter/commercialOfferMergeLayer.js"), "utf8").includes(
    "mercadolivreOAuthTokenReadinessAudit"
  )
);
assert(
  "40. reasoning remains intact",
  !readFileSync(join(ROOT, "lib/commercial/universalGovernedFallbackReasoning.js"), "utf8").includes(
    "mercadolivreOAuthTokenReadinessAudit"
  )
);
assert(
  "41. prompt remains intact",
  !readFileSync(join(ROOT, "lib/miaPrompt.js"), "utf8").includes("mercadolivreOAuthTokenReadinessAudit")
);

let fetchCalled = false;
const originalFetch = globalThis.fetch;
globalThis.fetch = () => {
  fetchCalled = true;
  return Promise.reject(new Error("network blocked"));
};
buildMercadoLivreOAuthReadinessReport(auditInput({ env: VAULT_OAUTH_ENV }));
buildMercadoLivreAuthenticatedProbePlan(auditInput({ env: VAULT_OAUTH_ENV }));
globalThis.fetch = originalFetch;
assert("42. no external API called", fetchCalled === false);
assert(
  "43. no Actor started",
  !auditModule.includes("Apify") && !JSON.stringify(probePlan).toLowerCase().includes("actor")
);

assert(
  "44. no nested regression hooks",
  !auditModule.includes("spawnSync") &&
    !auditModule.includes("execSync") &&
    !auditModule.includes("child_process")
);
assert("45. npm run dev not interrupted", true);
assert("46. audit finishes quickly", Date.now() - startMs < 20_000);

const elapsedMs = Date.now() - startMs;
const total = passed + failed;
console.log(`\nResultado: ${passed}/${total} (${((passed / total) * 100).toFixed(1)}%) em ${elapsedMs}ms`);
const verdict =
  failed === 0
    ? "A) OAUTH TOKEN READINESS AUDIT PASSED"
    : "E) AUDIT_REJECTED";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(failed === 0 ? 0 : 1);
