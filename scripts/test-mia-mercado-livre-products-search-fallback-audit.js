/**
 * PATCH Comercial 2E — Mercado Livre Products Search Fallback Audit
 *
 * Usage: node scripts/test-mia-mercado-livre-products-search-fallback-audit.js
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
} from "../lib/productSourceAdapter/adapters/mercadoLivreAdapter.js";
import {
  buildMercadoLivreProductsSearchUrl,
  buildMercadoLivreRequestHeaders,
  mapMercadoLivreCatalogApiResponseToItems,
  redactMercadoLivreSecrets,
  searchMercadoLivreCatalogProducts,
} from "../lib/productSourceAdapter/adapters/mercadoLivreClient.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const TEST_SECRET = "TEST_ML_CLIENT_SECRET_DO_NOT_LEAK";
const TEST_ACCESS_TOKEN = "APP_USR-TEST-ACCESS-TOKEN-DO-NOT-LEAK";
const TEST_ENV = {
  MERCADOLIVRE_CLIENT_ID: "7758884973596489",
  MERCADOLIVRE_CLIENT_SECRET: TEST_SECRET,
  MERCADOLIVRE_REDIRECT_URI: "https://economia-ai.vercel.app/api/auth/mercadolivre/callback",
  MERCADOLIVRE_SITE_ID: "MLB",
  MERCADOLIVRE_ACCESS_TOKEN: TEST_ACCESS_TOKEN,
};

const MOCK_CATALOG_RESPONSE = {
  results: [
    {
      id: "MLB1234567890",
      name: "Apple iPhone 15 128GB Preto",
      domain_id: "MLB-CELLPHONES",
      pictures: [{ secure_url: "https://http2.mlstatic.com/iphone15.jpg" }],
      attributes: [{ id: "BRAND", name: "Marca", value_name: "Apple" }],
    },
  ],
};

const COGNITIVE_GUARD_FILES = [
  "lib/miaCognitiveRouter.js",
  "lib/miaRoutingDecisionContract.js",
  "lib/miaPrompt.js",
  "pages/api/chat-gpt4o.js",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNoSensitiveLeak(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  assert(!text.includes(TEST_SECRET), "client secret leaked");
  assert(!text.includes(TEST_ACCESS_TOKEN), "access token leaked");
}

const CASES = [];

function test(name, fn) {
  CASES.push({ name, fn });
}

test("buildMercadoLivreProductsSearchUrl targets catalog endpoint", () => {
  const url = buildMercadoLivreProductsSearchUrl("iphone 15", 5, TEST_ENV);
  assert(url.includes("/products/search?"), "products search path");
  assert(url.includes("site_id=MLB"), "site_id");
  assert(url.includes("q=iphone%2015"), "query");
  assert(url.includes("limit=5"), "limit");
  assertNoSensitiveLeak(url);
});

test("searchMercadoLivreCatalogProducts sends Bearer header", async () => {
  let capturedHeaders = null;

  const result = await searchMercadoLivreCatalogProducts("iphone 15", 5, {
    env: TEST_ENV,
    fetcher: async (_url, init) => {
      capturedHeaders = init?.headers || {};
      return {
        ok: true,
        status: 200,
        json: async () => MOCK_CATALOG_RESPONSE,
      };
    },
  });

  assert(result.ok, `catalog search failed: ${result.error}`);
  assert(
    capturedHeaders?.Authorization === `Bearer ${TEST_ACCESS_TOKEN}`,
    "Bearer header missing"
  );
  assert(
    buildMercadoLivreRequestHeaders(TEST_ENV).Authorization === `Bearer ${TEST_ACCESS_TOKEN}`,
    "header builder"
  );
  assertNoSensitiveLeak(result);
});

test("mapMercadoLivreCatalogApiResponseToItems maps catalog payload", () => {
  const items = mapMercadoLivreCatalogApiResponseToItems(MOCK_CATALOG_RESPONSE);
  assert(items.length === 1, "expected one item");
  assert(items[0].title.includes("iPhone 15"), "title mapped from name");
  assert(items[0].thumbnail?.startsWith("http"), "thumbnail mapped");
  assert(items[0].catalog_product === true, "catalog flag");
});

test("adapter real mode products search normalizes catalog response", async () => {
  const result = await fetchMercadoLivreAdapterResult({
    query: "iphone 15",
    limit: 5,
    real: true,
    realOptions: {
      searchMode: "products",
      env: TEST_ENV,
      fetcher: async () => ({
        ok: true,
        status: 200,
        json: async () => MOCK_CATALOG_RESPONSE,
      }),
    },
  });

  assert(result.ok, `adapter products mode failed: ${result.error}`);
  assert(result.searchMode === "products", "searchMode");
  assert(result.products.length === 1, "normalized count");
  const product = result.products[0];
  assert(isNormalizedProductShape(product), "normalized shape");
  assert(isNormalizedProductUsable(product), "usable product");
  assert(product.externalId === "MLB1234567890", "externalId");
  assertNoSensitiveLeak(result);
});

test("searchMercadoLivreCatalogProducts diagnoses HTTP 403 safely", async () => {
  const result = await searchMercadoLivreCatalogProducts("iphone 15", 5, {
    env: TEST_ENV,
    fetcher: async () => ({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      text: async () =>
        JSON.stringify({
          message: "forbidden",
          error: "forbidden",
          status: 403,
          blocked_by: "PolicyAgent",
          code: "PA_UNAUTHORIZED_RESULT_FROM_POLICIES",
          token_echo: TEST_ACCESS_TOKEN,
        }),
    }),
  });

  assert(!result.ok, "403 should fail");
  assert(result.error === "http_error", "http_error");
  assert(result.httpStatus === 403, "httpStatus");
  assert(result.safeErrorBodyPreview.includes("PolicyAgent"), "403 preview preserved");
  assert(!result.safeErrorBodyPreview.includes(TEST_ACCESS_TOKEN), "token redacted");
  assertNoSensitiveLeak(result);
});

test("dev endpoint supports mode=products without touching MIA", () => {
  const devRoute = readFileSync(join(ROOT, "pages/api/dev/mercadolivre-search.js"), "utf8");
  assert(devRoute.includes('mode !== "items" && mode !== "products"'), "mode validation");
  assert(devRoute.includes("searchMode: mode"), "searchMode wired");
  assert(devRoute.includes("mode=items|products"), "mode hint");

  for (const relativePath of COGNITIVE_GUARD_FILES) {
    const content = readFileSync(join(ROOT, relativePath), "utf8");
    assert(!content.includes("searchMercadoLivreCatalogProducts"), `${relativePath} untouched`);
  }
});

test("redactMercadoLivreSecrets removes access token from catalog errors", () => {
  const raw = `blocked ${TEST_ACCESS_TOKEN} and secret ${TEST_SECRET}`;
  const redacted = redactMercadoLivreSecrets(raw, TEST_ENV);
  assert(!redacted.includes(TEST_ACCESS_TOKEN), "token not redacted");
  assert(!redacted.includes(TEST_SECRET), "secret not redacted");
});

test("no real external calls when fetcher is injected", async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (...args) => {
    fetchCalled = true;
    return originalFetch(...args);
  };

  try {
    await searchMercadoLivreCatalogProducts("iphone 15", 3, {
      env: TEST_ENV,
      fetcher: async () => ({
        ok: true,
        status: 200,
        json: async () => MOCK_CATALOG_RESPONSE,
      }),
    });
    assert(!fetchCalled, "global fetch must not run");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

console.log("PATCH Comercial 2E — Mercado Livre Products Search Fallback Audit\n");

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
    ? "A) MERCADO LIVRE PRODUCTS SEARCH FALLBACK ROBUST"
    : "B) MERCADO LIVRE PRODUCTS SEARCH FALLBACK GAP";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(fail === 0 ? 0 : 1);
