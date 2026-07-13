/**
 * PATCH Comercial 2B/2C/2C-DIAG — Mercado Livre Client Real Isolated Audit
 *
 * Usage: node scripts/test-mia-mercado-livre-client-real-isolated-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  isNormalizedProductShape,
  isNormalizedProductUsable,
} from "../lib/productSourceAdapter/index.js";
import {
  fetchMercadoLivreAdapterResult,
  fetchMercadoLivreMockSearch,
  mercadoLivreAdapter,
} from "../lib/productSourceAdapter/adapters/mercadoLivreAdapter.js";
import {
  buildMercadoLivreRequestHeaders,
  buildMercadoLivreSearchUrl,
  hasMercadoLivreAccessToken,
  mapMercadoLivreApiResponseToItems,
  redactMercadoLivreSecrets,
  searchMercadoLivreProducts,
  validateMercadoLivreEnv,
} from "../lib/productSourceAdapter/adapters/mercadoLivreClient.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const TEST_SECRET = "TEST_ML_CLIENT_SECRET_DO_NOT_LEAK";
const TEST_ACCESS_TOKEN = "TEST_ML_ACCESS_TOKEN_DO_NOT_LEAK";
const TEST_ENV = {
  MERCADOLIVRE_CLIENT_ID: "test-client-id",
  MERCADOLIVRE_CLIENT_SECRET: TEST_SECRET,
  MERCADOLIVRE_REDIRECT_URI: "https://example.test/callback",
  MERCADOLIVRE_SITE_ID: "MLB",
};

const MOCK_API_RESPONSE = {
  site_id: "MLB",
  query: "notebook",
  results: [
    {
      id: "MLB7777",
      title: "Notebook Lenovo Ideapad 3 15 Intel I5 8gb 256gb Ssd",
      price: 3299.99,
      currency_id: "BRL",
      permalink: "https://produto.mercadolivre.com.br/MLB7777-lenovo",
      thumbnail: "https://http2.mlstatic.com/lenovo.jpg",
      condition: "new",
      available_quantity: 8,
      seller: { id: 101010, nickname: "TECH_BR" },
      shipping: { free_shipping: true, mode: "me2" },
      attributes: [{ id: "BRAND", name: "Marca", value_name: "Lenovo" }],
      category_id: "MLB1648",
    },
  ],
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

function assertNoSecretLeak(value, secret = TEST_SECRET) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  assert(!text.includes(secret), "client secret leaked in output");
}

function assertNoSensitiveLeak(value) {
  assertNoSecretLeak(value, TEST_SECRET);
  const text = typeof value === "string" ? value : JSON.stringify(value);
  assert(!text.includes(TEST_ACCESS_TOKEN), "access token leaked in output");
}

function createHttpErrorFetcher(status, statusText, body) {
  return async () => ({
    ok: false,
    status,
    statusText,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    json: async () => (typeof body === "object" ? body : { message: body }),
  });
}

async function assertHttpDiagnostics(status, statusText, body) {
  const result = await searchMercadoLivreProducts("notebook", 5, {
    env: TEST_ENV,
    fetcher: createHttpErrorFetcher(status, statusText, body),
  });

  assert(!result.ok, `expected http failure for ${status}`);
  const expectedError =
    status === 429 ? "rate_limited" : status === 401 || status === 403 ? "http_forbidden" : "http_error";
  assert(result.error === expectedError, `expected ${expectedError}`);
  assert(result.httpStatus === status, `httpStatus should be ${status}`);
  assert(result.status === status, "status alias preserved");
  assert(result.httpStatusText === statusText, `httpStatusText should be ${statusText}`);
  assert(typeof result.safeErrorBodyPreview === "string", "safeErrorBodyPreview missing");
  assert(result.requestUrl?.includes("/sites/MLB/search"), "requestUrl missing search path");
  assert(!result.requestUrl?.includes(TEST_SECRET), "secret must not appear in requestUrl");
  if (status === 403 || status === 401) {
    assert(!!result.safeForbiddenDiagnostics?.classification, "forbidden diagnostics missing");
  }
  assertNoSensitiveLeak(result);
  return result;
}

const CASES = [];

function test(name, fn) {
  CASES.push({ name, fn });
}

test("buildMercadoLivreSearchUrl uses MLB site id", () => {
  const url = buildMercadoLivreSearchUrl("iphone 15", 10, TEST_ENV);
  assert(url.includes("/sites/MLB/search"), "site path missing");
  assert(url.includes("q=iphone%2015"), "query missing");
  assert(url.includes("limit=10"), "limit missing");
  assert(!url.includes(TEST_SECRET), "secret must not appear in url");
});

test("validateMercadoLivreEnv detects missing env", () => {
  const missing = validateMercadoLivreEnv({});
  assert(!missing.ok, "empty env should fail");
  assert(missing.missing.includes("MERCADOLIVRE_CLIENT_ID"), "client id missing");
  assert(missing.missing.includes("MERCADOLIVRE_CLIENT_SECRET"), "client secret missing");
  assert(missing.missing.includes("MERCADOLIVRE_REDIRECT_URI"), "redirect uri missing");

  const ok = validateMercadoLivreEnv(TEST_ENV);
  assert(ok.ok, "test env should pass");
  assert(ok.siteId === "MLB", "site id");
  assert(ok.hasAccessToken === false, "token should be optional");
  assert(hasMercadoLivreAccessToken(TEST_ENV) === false, "hasAccessToken helper");
});

test("search without bearer token omits Authorization header", async () => {
  let capturedHeaders = null;
  await searchMercadoLivreProducts("notebook", 5, {
    env: TEST_ENV,
    fetcher: async (_url, init) => {
      capturedHeaders = init?.headers || {};
      return {
        ok: true,
        status: 200,
        json: async () => MOCK_API_RESPONSE,
      };
    },
  });

  assert(!capturedHeaders?.Authorization, "Authorization must be absent without token");
  assert(capturedHeaders?.Accept === "application/json", "Accept header preserved");
});

test("search with bearer token sends Authorization header", async () => {
  let capturedHeaders = null;
  const envWithToken = {
    ...TEST_ENV,
    MERCADOLIVRE_ACCESS_TOKEN: TEST_ACCESS_TOKEN,
  };

  await searchMercadoLivreProducts("notebook", 5, {
    env: envWithToken,
    fetcher: async (_url, init) => {
      capturedHeaders = init?.headers || {};
      return {
        ok: true,
        status: 200,
        json: async () => MOCK_API_RESPONSE,
      };
    },
  });

  assert(
    capturedHeaders?.Authorization === `Bearer ${TEST_ACCESS_TOKEN}`,
    "Bearer Authorization header missing"
  );
  assert(
    buildMercadoLivreRequestHeaders(envWithToken).Authorization === `Bearer ${TEST_ACCESS_TOKEN}`,
    "header builder must include bearer token"
  );
  assert(hasMercadoLivreAccessToken(envWithToken), "hasAccessToken true when configured");
});

test("403 with bearer token stays diagnosed and token is redacted", async () => {
  const envWithToken = {
    ...TEST_ENV,
    MERCADOLIVRE_ACCESS_TOKEN: TEST_ACCESS_TOKEN,
  };

  const result = await searchMercadoLivreProducts("notebook", 5, {
    env: envWithToken,
    fetcher: async (_url, init) => {
      assert(
        init?.headers?.Authorization === `Bearer ${TEST_ACCESS_TOKEN}`,
        "token header expected on 403 call"
      );
      return {
        ok: false,
        status: 403,
        statusText: "Forbidden",
        text: async () =>
          JSON.stringify({
            message: "forbidden",
            error: "forbidden",
            status: 403,
            token_echo: TEST_ACCESS_TOKEN,
          }),
      };
    },
  });

  assert(result.error === "http_forbidden", "expected http_forbidden");
  assert(result.httpStatus === 403, "403 status preserved");
  assert(result.safeErrorBodyPreview.includes("forbidden"), "403 body preview preserved");
  assert(!!result.safeForbiddenDiagnostics?.classification, "403 classification missing");
  assert(!result.safeErrorBodyPreview.includes(TEST_ACCESS_TOKEN), "token redacted in preview");
  assertNoSensitiveLeak(result);
});

test("searchMercadoLivreProducts handles success with mock fetcher", async () => {
  let fetchCalled = false;
  const result = await searchMercadoLivreProducts("notebook", 5, {
    env: TEST_ENV,
    fetcher: async (url) => {
      fetchCalled = true;
      assert(url.includes("/sites/MLB/search"), "wrong search url");
      assertNoSecretLeak(url);
      return {
        ok: true,
        status: 200,
        json: async () => MOCK_API_RESPONSE,
      };
    },
  });

  assert(fetchCalled, "mock fetcher should run");
  assert(result.ok, `expected success, got ${result.error}`);
  assert(result.items.length === 1, "expected one item");
  assert(result.items[0].id === "MLB7777", "mapped item id");
  assertNoSecretLeak(result);
});

test("searchMercadoLivreProducts handles HTTP 401 with diagnostics", async () => {
  const result = await assertHttpDiagnostics(401, "Unauthorized", {
    message: "invalid token",
    secret_hint: TEST_SECRET,
  });
  assert(result.safeErrorBodyPreview.includes("invalid token"), "body preview missing message");
  assert(!result.safeErrorBodyPreview.includes(TEST_SECRET), "secret must be redacted in preview");
});

test("searchMercadoLivreProducts handles HTTP 403 with diagnostics", async () => {
  const result = await assertHttpDiagnostics(403, "Forbidden", {
    message: "policy_blocked",
    blocked_by: "WAF",
  });
  assert(result.safeErrorBodyPreview.includes("policy_blocked"), "403 body preview missing");
});

test("searchMercadoLivreProducts handles HTTP 429 with diagnostics", async () => {
  const result = await assertHttpDiagnostics(429, "Too Many Requests", {
    message: "rate_limit_exceeded",
  });
  assert(result.safeErrorBodyPreview.includes("rate_limit_exceeded"), "429 body preview missing");
});

test("adapter real mode forwards HTTP diagnostics to caller", async () => {
  const result = await fetchMercadoLivreAdapterResult({
    query: "notebook",
    limit: 5,
    real: true,
    realOptions: {
      env: TEST_ENV,
      fetcher: createHttpErrorFetcher(403, "Forbidden", { message: "blocked" }),
    },
  });

  assert(!result.ok, "adapter should fail on http error");
  assert(result.error === "http_forbidden", "expected http_forbidden");
  assert(result.httpStatus === 403, "httpStatus forwarded");
  assert(result.httpStatusText === "Forbidden", "httpStatusText forwarded");
  assert(result.requestUrl?.includes("/sites/MLB/search"), "requestUrl forwarded");
  assertNoSecretLeak(result);
});

test("searchMercadoLivreProducts handles empty response", async () => {
  const result = await searchMercadoLivreProducts("notebook", 5, {
    env: TEST_ENV,
    fetcher: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    }),
  });

  assert(!result.ok, "empty response should fail");
  assert(result.error === "empty_response", "expected empty_response");
  assertNoSecretLeak(result);
});

test("mapMercadoLivreApiResponseToItems maps API payload", () => {
  const items = mapMercadoLivreApiResponseToItems(MOCK_API_RESPONSE);
  assert(items.length === 1, "expected one mapped item");
  assert(items[0].title.includes("Lenovo"), "title mapped");
  assert(items[0].permalink.startsWith("http"), "permalink mapped");
  assert(items[0].seller?.nickname === "TECH_BR", "seller mapped");
});

test("adapter real mode normalizes mocked API response", async () => {
  const result = await fetchMercadoLivreAdapterResult({
    query: "notebook",
    limit: 5,
    real: true,
    realOptions: {
      env: TEST_ENV,
      fetcher: async () => ({
        ok: true,
        status: 200,
        json: async () => MOCK_API_RESPONSE,
      }),
    },
  });

  assert(result.ok, `real mode failed: ${result.error}`);
  assert(result.products.length === 1, "expected normalized product");
  const product = result.products[0];
  assert(isNormalizedProductShape(product), "normalized shape");
  assert(isNormalizedProductUsable(product), "usable product");
  assert(product.externalId === "MLB7777", "externalId");
  assertNoSecretLeak(result);
});

test("adapter mock mode continues working", async () => {
  let realFetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (...args) => {
    realFetchCalled = true;
    return originalFetch(...args);
  };

  try {
    const result = await mercadoLivreAdapter.fetchProducts({ query: "samsung", limit: 3 });
    assert(result.ok, "mock mode failed");
    assert(result.products.length >= 1, "mock products expected");
    assert(realFetchCalled === false, "real fetch must not run in default mock mode");

    const explicitMock = await fetchMercadoLivreAdapterResult({
      query: "notebook",
      limit: 3,
      fetcher: fetchMercadoLivreMockSearch,
      real: false,
    });
    assert(explicitMock.ok, "explicit mock mode failed");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("redactMercadoLivreSecrets removes client secret and access token from output", () => {
  const envWithToken = {
    ...TEST_ENV,
    MERCADOLIVRE_ACCESS_TOKEN: TEST_ACCESS_TOKEN,
  };
  const raw = `error with secret ${TEST_SECRET} and token ${TEST_ACCESS_TOKEN}`;
  const redacted = redactMercadoLivreSecrets(raw, envWithToken);
  assert(!redacted.includes(TEST_SECRET), "secret not redacted");
  assert(!redacted.includes(TEST_ACCESS_TOKEN), "token not redacted");
  assert(redacted.includes("[REDACTED]"), "redaction marker missing");
});

test("no real external calls and cognitive/commercial flow untouched", async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (...args) => {
    fetchCalled = true;
    return originalFetch(...args);
  };

  try {
    await searchMercadoLivreProducts("notebook", 3, {
      env: TEST_ENV,
      fetcher: async () => ({
        ok: true,
        status: 200,
        json: async () => MOCK_API_RESPONSE,
      }),
    });
    assert(!fetchCalled, "global fetch must not be used when fetcher is injected");
  } finally {
    globalThis.fetch = originalFetch;
  }

  for (const relativePath of COGNITIVE_GUARD_FILES) {
    const content = readFileSync(join(ROOT, relativePath), "utf8");
    assert(!content.includes("mercadoLivreClient"), `${relativePath} must not import ML client`);
    assert(!content.includes("mercadolivre-search"), `${relativePath} must not use dev endpoint`);
  }

  const devRoute = readFileSync(join(ROOT, "pages/api/dev/mercadolivre-search.js"), "utf8");
  assert(devRoute.includes('real: true'), "dev endpoint must use real mode explicitly");
  assert(devRoute.includes("httpStatus"), "dev endpoint must expose httpStatus");
  assert(devRoute.includes("safeErrorBodyPreview"), "dev endpoint must expose safeErrorBodyPreview");
  assert(devRoute.includes("requestUrl"), "dev endpoint must expose requestUrl");
  assert(devRoute.includes("hasAccessToken"), "dev endpoint must expose hasAccessToken");
  assert(!devRoute.includes("MERCADOLIVRE_CLIENT_SECRET"), "dev route must not expose secret literal");
  assert(!devRoute.includes("MERCADOLIVRE_ACCESS_TOKEN"), "dev route must not expose access token literal");
});

console.log("PATCH Comercial 2C — Mercado Livre Client Real Isolated Audit\n");

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
    ? "A) MERCADO LIVRE CLIENT REAL ISOLATED ROBUST"
    : "B) MERCADO LIVRE CLIENT REAL ISOLATED GAP";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(fail === 0 ? 0 : 1);
