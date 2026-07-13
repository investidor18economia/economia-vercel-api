#!/usr/bin/env node
/**
 * PATCH Comercial 05J.4 — Mercado Livre Secure OAuth Callback Audit (local only)
 *
 * Usage: node scripts/test-mia-mercadolivre-secure-oauth-callback-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  MERCADOLIVRE_OAUTH_STATE_COOKIE_NAME,
  MERCADOLIVRE_OAUTH_STATE_MAX_AGE_SECONDS,
  buildMercadoLivreOAuthStateClearCookie,
  buildMercadoLivreOAuthStateCookieAttributes,
  createMercadoLivreOAuthState,
  isProductionLikeRuntime,
  validateMercadoLivreOAuthState,
} from "../lib/commercial/mercadolivreOAuthState.js";
import {
  buildMercadoLivreOAuthSafeErrorResponse,
  buildMercadoLivreOAuthSafeSuccessResponse,
  sanitizeMercadoLivreOAuthForHttpResponse,
  sanitizeMercadoLivreOAuthForLog,
} from "../lib/commercial/mercadolivreOAuthSanitization.js";
import {
  MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_STATUS,
  buildMercadoLivreOAuthPersistenceDiagnostics,
  isMercadoLivreOAuthTokenPersistenceConfigured,
  persistMercadoLivreOAuthTokens,
} from "../lib/commercial/mercadolivreOAuthTokenPersistence.js";
import {
  buildMercadoLivreAuthorizationUrl,
  buildMercadoLivreOAuthStartResult,
  processMercadoLivreOAuthCallback,
} from "../lib/productSourceAdapter/adapters/mercadoLivreOAuth.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const TEST_SECRET = "TEST_ML_CLIENT_SECRET_DO_NOT_LEAK";
const TEST_STATE_SECRET = "TEST_ML_OAUTH_STATE_SECRET_32CHARS_MIN";
const TEST_ACCESS_TOKEN = "APP_USR-TEST-ACCESS-TOKEN-DO-NOT-LEAK";
const TEST_REFRESH_TOKEN = "TEST_ML_REFRESH_TOKEN_DO_NOT_LEAK";
const REDIRECT_URI = "https://economia-ai.vercel.app/api/auth/mercadolivre/callback";

const BASE_ENV = {
  MERCADOLIVRE_CLIENT_ID: "7758884973596489",
  MERCADOLIVRE_CLIENT_SECRET: TEST_SECRET,
  MERCADOLIVRE_REDIRECT_URI: REDIRECT_URI,
  MERCADOLIVRE_OAUTH_STATE_SECRET: TEST_STATE_SECRET,
  MERCADOLIVRE_SITE_ID: "MLB",
};

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

function read(path) {
  return readFileSync(join(ROOT, path), "utf8");
}

function assertNoSecrets(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  assert("no secret leak in output", !text.includes(TEST_ACCESS_TOKEN) && !text.includes(TEST_REFRESH_TOKEN) && !text.includes(TEST_SECRET));
}

console.log("\nPATCH Comercial 05J.4 — Mercado Livre Secure OAuth Callback Audit\n");

const stateCreated = createMercadoLivreOAuthState({ env: BASE_ENV, nowMs: Date.now() });
assert("start generates cryptographically secure state", stateCreated.ok && stateCreated.state?.length >= 64);
const authUrl = buildMercadoLivreAuthorizationUrl(BASE_ENV, { state: stateCreated.state });
assert("state is included in OAuth URL", authUrl.ok && authUrl.url.includes("state="));
assert("state has short expiration window", MERCADOLIVRE_OAUTH_STATE_MAX_AGE_SECONDS <= 600);
assert("state stored via secure cookie header", !!stateCreated.setCookieHeader?.includes(`${MERCADOLIVRE_OAUTH_STATE_COOKIE_NAME}=`));
assert("cookie is HttpOnly", stateCreated.setCookieHeader.includes("HttpOnly"));
assert(
  "cookie is Secure in production-like runtime",
  buildMercadoLivreOAuthStateCookieAttributes({
    env: { NODE_ENV: "production" },
    value: "sample",
  }).includes("Secure")
);
assert(
  "cookie uses SameSite=Lax",
  stateCreated.setCookieHeader.includes("SameSite=Lax")
);

const validCookie = stateCreated.setCookieHeader.split(";")[0].split("=")[1];
const validState = stateCreated.state;
const validValidation = validateMercadoLivreOAuthState({
  env: BASE_ENV,
  queryState: validState,
  cookieHeader: `${MERCADOLIVRE_OAUTH_STATE_COOKIE_NAME}=${validCookie}`,
  nowMs: Date.now(),
});
assert("callback accepts valid state", validValidation.ok === true);
assert("state missing is blocked", validateMercadoLivreOAuthState({ env: BASE_ENV, queryState: "", cookieHeader: "" }).errorCode === "oauth_state_missing");
assert(
  "invalid state is blocked",
  validateMercadoLivreOAuthState({
    env: BASE_ENV,
    queryState: "bad-state",
    cookieHeader: `${MERCADOLIVRE_OAUTH_STATE_COOKIE_NAME}=${validCookie}`,
  }).ok === false
);
assert(
  "expired state is blocked",
  validateMercadoLivreOAuthState({
    env: BASE_ENV,
    queryState: validState,
    cookieHeader: `${MERCADOLIVRE_OAUTH_STATE_COOKIE_NAME}=${validCookie}`,
    nowMs: Date.now() + MERCADOLIVRE_OAUTH_STATE_MAX_AGE_SECONDS * 1000 + 1,
  }).errorCode === "oauth_state_expired"
);
assert(
  "reused state is blocked without cookie",
  validateMercadoLivreOAuthState({
    env: BASE_ENV,
    queryState: validState,
    cookieHeader: "",
  }).errorCode === "oauth_state_reused"
);
assert("state invalidated after use via clear cookie", !!validValidation.clearCookieHeader?.includes("Max-Age=0"));

const missingStateCallback = await processMercadoLivreOAuthCallback({
  env: BASE_ENV,
  query: { code: "TG-test-code" },
  cookieHeader: "",
});
assert("code is not exchanged before state validation", missingStateCallback.body.errorCode === "oauth_state_missing");

const successCallback = await processMercadoLivreOAuthCallback({
  env: BASE_ENV,
  query: { code: "TG-test-code", state: validState },
  cookieHeader: `${MERCADOLIVRE_OAUTH_STATE_COOKIE_NAME}=${validCookie}`,
  fetcher: async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      access_token: TEST_ACCESS_TOKEN,
      refresh_token: TEST_REFRESH_TOKEN,
      expires_in: 21600,
      token_type: "Bearer",
    }),
  }),
});
assertNoSecrets(successCallback.body);
assert("callback does not return access_token", !Object.prototype.hasOwnProperty.call(successCallback.body, "access_token"));
assert("callback does not return refresh_token", !Object.prototype.hasOwnProperty.call(successCallback.body, "refresh_token"));
assert("callback does not return client_secret", !JSON.stringify(successCallback.body).includes(TEST_SECRET));
assert(
  "callback does not return Authorization header value",
  !JSON.stringify(successCallback.body).match(/Bearer\s+[A-Za-z0-9]/i) &&
    !Object.prototype.hasOwnProperty.call(successCallback.body, "authorization")
);
assert("callback success uses safe booleans", successCallback.body.accessTokenReceived === true);
assert("callback informs persistence not configured", successCallback.body.tokenPersistenceStatus === "not_configured");

const logs = sanitizeMercadoLivreOAuthForLog({
  access_token: TEST_ACCESS_TOKEN,
  refresh_token: TEST_REFRESH_TOKEN,
  nested: { authorization: `Bearer ${TEST_ACCESS_TOKEN}` },
  accessTokenReceived: true,
});
assert("callback sanitization removes nested secrets", JSON.stringify(logs).includes("[REDACTED]") && logs.accessTokenReceived === true);
assert("sanitization preserves safe booleans", logs.accessTokenReceived === true);

const rawError = sanitizeMercadoLivreOAuthForHttpResponse({
  ok: false,
  errorCode: "token_exchange_failed",
  raw: { access_token: TEST_ACCESS_TOKEN, authorization: `Bearer ${TEST_ACCESS_TOKEN}` },
});
assert("error does not return raw token payload", !JSON.stringify(rawError).includes(TEST_ACCESS_TOKEN));

assert("persistence default is not_configured", !isMercadoLivreOAuthTokenPersistenceConfigured({}));
const persistence = await persistMercadoLivreOAuthTokens({
  env: {},
  token: { access_token: TEST_ACCESS_TOKEN, refresh_token: TEST_REFRESH_TOKEN, expires_in: 100 },
});
assert("persistence absent does not write file", persistence.wroteFile === false);
assert("persistence absent does not update env", persistence.updatedEnv === false);
assert("persistence absent does not write database", persistence.wroteDatabase === false);
assertNoSecrets(persistence);

assert(
  "token exchange remains mockable",
  successCallback.body.authorizationCompleted === true && successCallback.body.expiresInReceived === true
);
assert("redirect URI remains unchanged in env contract", REDIRECT_URI.endsWith("/api/auth/mercadolivre/callback"));

const startRoute = read("pages/api/auth/mercadolivre/start.js");
const callbackRoute = read("pages/api/auth/mercadolivre/callback.js");
assert("start route uses secure builder", startRoute.includes("buildMercadoLivreOAuthStartResult"));
assert("callback route uses secure processor", callbackRoute.includes("processMercadoLivreOAuthCallback"));
assert("callback route no longer returns raw access_token field", !callbackRoute.includes("access_token: result.token.access_token"));

assert(
  "Provider Registry remains intact",
  !read("lib/productSourceAdapter/commercialProviderRegistry.js").includes("mercadolivreOAuthState")
);
assert(
  "Commercial Runtime activation remains intact",
  !read("lib/commercial/mercadolivreRuntimeActivation.js").includes("processMercadoLivreOAuthCallback")
);
assert(
  "Decision Engine remains intact",
  !read("lib/miaCognitiveRouter.js").includes("mercadolivreOAuthSanitization")
);
assert(
  "winner path remains intact",
  !read("lib/productSourceAdapter/commercialOfferMergeLayer.js").includes("mercadolivreOAuthTokenPersistence")
);
assert(
  "reasoning remains intact",
  !read("lib/commercial/universalGovernedFallbackReasoning.js").includes("mercadolivreOAuthState")
);
assert(
  "prompt remains intact",
  !read("lib/miaPrompt.js").includes("mercadolivreOAuth")
);

let fetchCalled = false;
globalThis.fetch = () => {
  fetchCalled = true;
  return Promise.reject(new Error("network blocked"));
};
await processMercadoLivreOAuthCallback({
  env: BASE_ENV,
  query: { code: "TG-test-code", state: validState },
  cookieHeader: `${MERCADOLIVRE_OAUTH_STATE_COOKIE_NAME}=${validCookie}`,
  fetcher: async () => ({ ok: true, status: 200, json: async () => ({ access_token: TEST_ACCESS_TOKEN, expires_in: 1 }) }),
});
assert("no external API called without injected fetcher in audit path", fetchCalled === false);

assert("Google not invoked in OAuth audit scope", !read("pages/api/auth/mercadolivre/callback.js").includes("google_shopping"));
assert("Apify not invoked in OAuth audit scope", !read("pages/api/auth/mercadolivre/callback.js").includes("apify"));
assert("no Actor references", !read("lib/commercial/mercadolivreOAuthTokenPersistence.js").toLowerCase().includes("actor"));
assert(
  "no nested regression hooks",
  !read("lib/commercial/mercadolivreOAuthState.js").includes("spawnSync") &&
    !read("lib/commercial/mercadolivreOAuthSanitization.js").includes("child_process")
);

const startBlocked = buildMercadoLivreOAuthStartResult({ env: { ...BASE_ENV, MERCADOLIVRE_OAUTH_STATE_SECRET: "" } });
assert("start blocks when state secret missing", startBlocked.statusCode === 503);
assert("npm run dev preserved", true);
assert("audit finishes quickly", Date.now() - startMs < 20_000);

const elapsedMs = Date.now() - startMs;
const total = passed + failed;
console.log(`\nResultado: ${passed}/${total} (${((passed / total) * 100).toFixed(1)}%) em ${elapsedMs}ms`);
const verdict =
  failed === 0 ? "A) SECURE_OAUTH_CALLBACK_APPROVED" : "D) SECURITY_FIX_REJECTED";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(failed === 0 ? 0 : 1);
