/**
 * PATCH Comercial 2D — Mercado Livre OAuth Token Exchange Audit
 *
 * Usage: node scripts/test-mia-mercado-livre-oauth-token-exchange-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  MERCADOLIVRE_OAUTH_AUTHORIZE_URL,
  MERCADOLIVRE_OAUTH_TOKEN_URL,
  buildMercadoLivreAuthorizationUrl,
  exchangeMercadoLivreAuthorizationCode,
  mapMercadoLivreTokenResponse,
  redactMercadoLivreOAuthSecrets,
  validateMercadoLivreOAuthEnv,
} from "../lib/productSourceAdapter/adapters/mercadoLivreOAuth.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const TEST_SECRET = "TEST_ML_CLIENT_SECRET_DO_NOT_LEAK";
const TEST_REFRESH_TOKEN = "TEST_ML_REFRESH_TOKEN_DO_NOT_LEAK";
const TEST_ACCESS_TOKEN = "APP_USR-TEST-ACCESS-TOKEN";
const TEST_ENV = {
  MERCADOLIVRE_CLIENT_ID: "7758884973596489",
  MERCADOLIVRE_CLIENT_SECRET: TEST_SECRET,
  MERCADOLIVRE_REDIRECT_URI: "https://economia-ai.vercel.app/api/auth/mercadolivre/callback",
};

const COGNITIVE_GUARD_FILES = [
  "lib/miaCognitiveRouter.js",
  "lib/miaRoutingDecisionContract.js",
  "lib/miaPrompt.js",
  "lib/miaConversationalTone.js",
  "lib/miaToneComplianceGuard.js",
  "pages/api/chat-gpt4o.js",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNoSecretLeak(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  assert(!text.includes(TEST_SECRET), "client secret leaked in output");
}

const CASES = [];

function test(name, fn) {
  CASES.push({ name, fn });
}

test("validateMercadoLivreOAuthEnv requires oauth env vars", () => {
  const missing = validateMercadoLivreOAuthEnv({});
  assert(!missing.ok, "empty env should fail");
  assert(missing.missing.includes("MERCADOLIVRE_CLIENT_ID"), "client id");
  assert(missing.missing.includes("MERCADOLIVRE_CLIENT_SECRET"), "client secret");
  assert(missing.missing.includes("MERCADOLIVRE_REDIRECT_URI"), "redirect uri");

  const ok = validateMercadoLivreOAuthEnv(TEST_ENV);
  assert(ok.ok, "test env should pass");
});

test("buildMercadoLivreAuthorizationUrl targets ML authorization endpoint", () => {
  const built = buildMercadoLivreAuthorizationUrl(TEST_ENV);
  assert(built.ok, "authorization url build failed");
  assert(built.url.startsWith(MERCADOLIVRE_OAUTH_AUTHORIZE_URL), "authorize base url");
  assert(built.url.includes("response_type=code"), "response_type");
  assert(built.url.includes(`client_id=${TEST_ENV.MERCADOLIVRE_CLIENT_ID}`), "client_id");
  assert(
    built.url.includes(
      `redirect_uri=${encodeURIComponent(TEST_ENV.MERCADOLIVRE_REDIRECT_URI)}`
    ),
    "redirect_uri"
  );
  assertNoSecretLeak(built);
});

test("exchangeMercadoLivreAuthorizationCode posts authorization_code grant", async () => {
  let capturedUrl = "";
  let capturedInit = null;

  const result = await exchangeMercadoLivreAuthorizationCode("TG-test-code", {
    env: TEST_ENV,
    fetcher: async (url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: TEST_ACCESS_TOKEN,
          refresh_token: TEST_REFRESH_TOKEN,
          expires_in: 21600,
          token_type: "Bearer",
        }),
      };
    },
  });

  assert(result.ok, `token exchange failed: ${result.error}`);
  assert(capturedUrl === MERCADOLIVRE_OAUTH_TOKEN_URL, "token url");
  assert(capturedInit?.method === "POST", "POST method");
  assert(
    capturedInit?.headers?.["Content-Type"] === "application/x-www-form-urlencoded",
    "form content type"
  );

  const body = String(capturedInit?.body || "");
  assert(body.includes("grant_type=authorization_code"), "grant_type");
  assert(body.includes(`client_id=${TEST_ENV.MERCADOLIVRE_CLIENT_ID}`), "client_id in body");
  assert(body.includes(`code=TG-test-code`), "code in body");
  assert(
    body.includes(`redirect_uri=${encodeURIComponent(TEST_ENV.MERCADOLIVRE_REDIRECT_URI)}`),
    "redirect_uri in body"
  );
  assert(body.includes(`client_secret=${TEST_SECRET}`), "client_secret must be sent to token endpoint");
  assertNoSecretLeak(result);

  assert(result.token.access_token === TEST_ACCESS_TOKEN, "access_token");
  assert(result.token.refresh_token === TEST_REFRESH_TOKEN, "refresh_token");
  assert(result.token.expires_in === 21600, "expires_in");
  assert(result.token.token_type === "Bearer", "token_type");
});

test("exchangeMercadoLivreAuthorizationCode rejects missing code", async () => {
  const result = await exchangeMercadoLivreAuthorizationCode("", { env: TEST_ENV });
  assert(!result.ok, "empty code should fail");
  assert(result.error === "missing_code", "missing_code");
});

test("exchangeMercadoLivreAuthorizationCode handles token endpoint HTTP error safely", async () => {
  const result = await exchangeMercadoLivreAuthorizationCode("TG-bad-code", {
    env: TEST_ENV,
    fetcher: async () => ({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: async () => ({
        message: "invalid_grant",
        secret_echo: TEST_SECRET,
      }),
    }),
  });

  assert(!result.ok, "invalid grant should fail");
  assert(result.error === "token_exchange_failed", "token_exchange_failed");
  assert(result.httpStatus === 400, "httpStatus");
  assert(result.safeErrorBodyPreview.includes("invalid_grant"), "error preview preserved");
  assert(!result.safeErrorBodyPreview.includes(TEST_SECRET), "secret redacted in preview");
  assertNoSecretLeak(result);
});

test("mapMercadoLivreTokenResponse exposes only public token fields", () => {
  const mapped = mapMercadoLivreTokenResponse({
    access_token: TEST_ACCESS_TOKEN,
    refresh_token: TEST_REFRESH_TOKEN,
    expires_in: 10800,
    token_type: "Bearer",
    user_id: 12345,
    scope: "offline_access read write",
  });

  assert(mapped.access_token === TEST_ACCESS_TOKEN, "access_token");
  assert(mapped.refresh_token === TEST_REFRESH_TOKEN, "refresh_token");
  assert(mapped.expires_in === 10800, "expires_in");
  assert(mapped.token_type === "Bearer", "token_type");
  assert(!Object.prototype.hasOwnProperty.call(mapped, "user_id"), "extra fields excluded");
});

test("oauth routes are isolated and cognitive/commercial flow untouched", () => {
  const startRoute = readFileSync(
    join(ROOT, "pages/api/auth/mercadolivre/start.js"),
    "utf8"
  );
  const callbackRoute = readFileSync(
    join(ROOT, "pages/api/auth/mercadolivre/callback.js"),
    "utf8"
  );

  assert(startRoute.includes("buildMercadoLivreOAuthStartResult"), "start uses secure oauth builder");
  assert(callbackRoute.includes("processMercadoLivreOAuthCallback"), "callback uses secure oauth processor");
  assert(!startRoute.includes("MERCADOLIVRE_CLIENT_SECRET"), "start must not expose secret literal");
  assert(!callbackRoute.includes("MERCADOLIVRE_CLIENT_SECRET"), "callback must not expose secret literal");

  for (const relativePath of COGNITIVE_GUARD_FILES) {
    const content = readFileSync(join(ROOT, relativePath), "utf8");
    assert(!content.includes("mercadoLivreOAuth"), `${relativePath} must not import oauth module`);
    assert(!content.includes("mercadolivre/start"), `${relativePath} must not use oauth start`);
  }
});

test("redactMercadoLivreOAuthSecrets removes client secret from output", () => {
  const raw = `token error with secret ${TEST_SECRET}`;
  const redacted = redactMercadoLivreOAuthSecrets(raw, TEST_ENV);
  assert(!redacted.includes(TEST_SECRET), "secret not redacted");
  assert(redacted.includes("[REDACTED]"), "redaction marker missing");
});

test("no real external calls when fetcher is injected", async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (...args) => {
    fetchCalled = true;
    return originalFetch(...args);
  };

  try {
    await exchangeMercadoLivreAuthorizationCode("TG-test-code", {
      env: TEST_ENV,
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
    assert(!fetchCalled, "global fetch must not run with injected fetcher");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

console.log("PATCH Comercial 2D — Mercado Livre OAuth Token Exchange Audit\n");

let pass = 0;
let fail = 0;

for (const spec of CASES) {
  try {
    const maybePromise = spec.fn();
    if (maybePromise && typeof maybePromise.then === "function") {
      await maybePromise;
    }
    pass += 1;
    console.log(`✓ ${spec.name}`);
  } catch (err) {
    fail += 1;
    console.log(`✗ ${spec.name} → ${err.message}`);
  }
}

const total = pass + fail;
console.log(`\nResultado: ${pass}/${total} (${((pass / total) * 100).toFixed(1)}%)`);
const verdict =
  fail === 0
    ? "A) MERCADO LIVRE OAUTH TOKEN EXCHANGE ROBUST"
    : "B) MERCADO LIVRE OAUTH TOKEN EXCHANGE GAP";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(fail === 0 ? 0 : 1);
