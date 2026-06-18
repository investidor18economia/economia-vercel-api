/**
 * PATCH Comercial 2F — Mercado Livre Product ID Flow Probe Audit
 *
 * Usage: node scripts/test-mia-mercado-livre-product-id-flow-probe-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  isNormalizedProductShape,
  isNormalizedProductUsable,
} from "../lib/productSourceAdapter/index.js";
import { normalizeMercadoLivreItem } from "../lib/productSourceAdapter/adapters/mercadoLivreAdapter.js";
import {
  buildMercadoLivreProductItemsUrl,
  buildMercadoLivreProductUrl,
  buildMercadoLivreRequestHeaders,
  getMercadoLivreProductById,
  getMercadoLivreProductItemsById,
  mapMercadoLivreProductDetailToNormalizedRaw,
  mapMercadoLivreProductItemToNormalizedRaw,
  probeMercadoLivreProductFlow,
  redactMercadoLivreSecrets,
} from "../lib/productSourceAdapter/adapters/mercadoLivreClient.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const TEST_SECRET = "TEST_ML_CLIENT_SECRET_DO_NOT_LEAK";
const TEST_ACCESS_TOKEN = "APP_USR-TEST-ACCESS-TOKEN-DO-NOT-LEAK";
const TEST_PRODUCT_ID = "MLB1234567890";
const TEST_ENV = {
  MERCADOLIVRE_CLIENT_ID: "7758884973596489",
  MERCADOLIVRE_CLIENT_SECRET: TEST_SECRET,
  MERCADOLIVRE_REDIRECT_URI: "https://economia-ai.vercel.app/api/auth/mercadolivre/callback",
  MERCADOLIVRE_SITE_ID: "MLB",
  MERCADOLIVRE_ACCESS_TOKEN: TEST_ACCESS_TOKEN,
};

const MOCK_PRODUCT_RESPONSE = {
  id: TEST_PRODUCT_ID,
  name: "Apple iPhone 15 128GB Preto",
  domain_id: "MLB-CELLPHONES",
  pictures: [{ secure_url: "https://http2.mlstatic.com/iphone15.jpg" }],
  attributes: [{ id: "BRAND", name: "Marca", value_name: "Apple" }],
  status: "active",
};

const MOCK_ITEMS_RESPONSE = {
  results: [
    {
      id: "MLB999111222",
      title: "Apple iPhone 15 128GB Preto Dual Sim",
      price: 6299.99,
      currency_id: "BRL",
      permalink: "https://produto.mercadolivre.com.br/MLB999111222",
      thumbnail: "https://http2.mlstatic.com/item.jpg",
      condition: "new",
      seller: { id: 12345, nickname: "LOJA_APPLE" },
    },
    {
      id: "MLB999111333",
      title: "Apple iPhone 15 128GB Preto Lacrado",
      price: 6199,
      currency_id: "BRL",
      permalink: "https://produto.mercadolivre.com.br/MLB999111333",
      thumbnail: "https://http2.mlstatic.com/item2.jpg",
      condition: "new",
      seller: { id: 67890, nickname: "TECH_BR" },
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

test("buildMercadoLivreProductUrl targets product endpoint", () => {
  const url = buildMercadoLivreProductUrl(TEST_PRODUCT_ID);
  assert(url.endsWith(`/products/${TEST_PRODUCT_ID}`), "product url");
  assertNoSensitiveLeak(url);
});

test("buildMercadoLivreProductItemsUrl targets product items endpoint", () => {
  const url = buildMercadoLivreProductItemsUrl(TEST_PRODUCT_ID);
  assert(url.endsWith(`/products/${TEST_PRODUCT_ID}/items`), "product items url");
  assertNoSensitiveLeak(url);
});

test("getMercadoLivreProductById sends Bearer header", async () => {
  let capturedHeaders = null;
  let capturedUrl = "";

  const result = await getMercadoLivreProductById(TEST_PRODUCT_ID, {
    env: TEST_ENV,
    fetcher: async (url, init) => {
      capturedUrl = url;
      capturedHeaders = init?.headers || {};
      return {
        ok: true,
        status: 200,
        json: async () => MOCK_PRODUCT_RESPONSE,
      };
    },
  });

  assert(result.ok, `product fetch failed: ${result.error}`);
  assert(capturedUrl === buildMercadoLivreProductUrl(TEST_PRODUCT_ID), "product url called");
  assert(
    capturedHeaders?.Authorization === `Bearer ${TEST_ACCESS_TOKEN}`,
    "Bearer header missing"
  );
  assert(
    buildMercadoLivreRequestHeaders(TEST_ENV).Authorization === `Bearer ${TEST_ACCESS_TOKEN}`,
    "header builder"
  );
  assert(result.productName.includes("iPhone 15"), "product name");
  assertNoSensitiveLeak(result);
});

test("getMercadoLivreProductItemsById normalizes items response", async () => {
  const result = await getMercadoLivreProductItemsById(TEST_PRODUCT_ID, {
    env: TEST_ENV,
    fetcher: async (url) => {
      assert(url === buildMercadoLivreProductItemsUrl(TEST_PRODUCT_ID), "items url called");
      return {
        ok: true,
        status: 200,
        json: async () => MOCK_ITEMS_RESPONSE,
      };
    },
  });

  assert(result.ok, `items fetch failed: ${result.error}`);
  assert(result.count === 2, "items count");
  assert(result.items[0].price === 6299.99, "first item price");
  assertNoSensitiveLeak(result);
});

test("product and item payloads normalize to NormalizedProduct", () => {
  const productNormalized = normalizeMercadoLivreItem(
    mapMercadoLivreProductDetailToNormalizedRaw({
      id: TEST_PRODUCT_ID,
      name: "Apple iPhone 15 128GB Preto",
      domain_id: "MLB-CELLPHONES",
      pictures: ["https://http2.mlstatic.com/iphone15.jpg"],
      attributes: [{ id: "BRAND", name: "Marca", value_name: "Apple" }],
    }),
    { categoryHint: "celular" }
  );

  const itemNormalized = normalizeMercadoLivreItem(
    mapMercadoLivreProductItemToNormalizedRaw(MOCK_ITEMS_RESPONSE.results[0]),
    { categoryHint: "celular" }
  );

  assert(productNormalized, "product normalized");
  assert(isNormalizedProductShape(productNormalized), "product shape");
  assert(isNormalizedProductUsable(productNormalized), "product usable");
  assert(itemNormalized, "item normalized");
  assert(isNormalizedProductShape(itemNormalized), "item shape");
  assert(isNormalizedProductUsable(itemNormalized), "item usable");
  assert(itemNormalized.numericPrice === 6299.99, "item numeric price");
});

test("probeMercadoLivreProductFlow aggregates product and items", async () => {
  let callCount = 0;
  const probe = await probeMercadoLivreProductFlow(TEST_PRODUCT_ID, {
    env: TEST_ENV,
    sampleLimit: 2,
    fetcher: async (url) => {
      callCount += 1;
      if (url.endsWith(`/products/${TEST_PRODUCT_ID}`)) {
        return {
          ok: true,
          status: 200,
          json: async () => MOCK_PRODUCT_RESPONSE,
        };
      }
      if (url.endsWith(`/products/${TEST_PRODUCT_ID}/items`)) {
        return {
          ok: true,
          status: 200,
          json: async () => MOCK_ITEMS_RESPONSE,
        };
      }
      throw new Error(`unexpected url ${url}`);
    },
  });

  assert(callCount === 2, "product and items endpoints called");
  assert(probe.ok, "probe ok");
  assert(probe.productId === TEST_PRODUCT_ID, "productId");
  assert(probe.itemsCount === 2, "itemsCount");
  assert(probe.sampleItems.length === 2, "sampleItems");
  assert(probe.prices.length === 2, "prices");
  assertNoSensitiveLeak(probe);
});

test("product id flow diagnoses HTTP 403 safely", async () => {
  const result = await getMercadoLivreProductById(TEST_PRODUCT_ID, {
    env: TEST_ENV,
    fetcher: async () => ({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      text: async () =>
        JSON.stringify({
          message: "forbidden",
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

test("dev endpoint and cognitive/commercial flow untouched", () => {
  const devRoute = readFileSync(
    join(ROOT, "pages/api/dev/mercadolivre-product-flow.js"),
    "utf8"
  );
  assert(devRoute.includes("probeMercadoLivreProductFlow"), "dev route uses probe");
  assert(devRoute.includes("productId"), "productId param");
  assert(!devRoute.includes("MERCADOLIVRE_CLIENT_SECRET"), "no secret literal");

  for (const relativePath of COGNITIVE_GUARD_FILES) {
    const content = readFileSync(join(ROOT, relativePath), "utf8");
    assert(!content.includes("probeMercadoLivreProductFlow"), `${relativePath} untouched`);
    assert(!content.includes("mercadolivre-product-flow"), `${relativePath} untouched`);
  }
});

test("redactMercadoLivreSecrets removes token from probe output", () => {
  const raw = `probe ${TEST_ACCESS_TOKEN} secret ${TEST_SECRET}`;
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
    await probeMercadoLivreProductFlow(TEST_PRODUCT_ID, {
      env: TEST_ENV,
      fetcher: async (url) => {
        if (url.endsWith(`/products/${TEST_PRODUCT_ID}`)) {
          return { ok: true, status: 200, json: async () => MOCK_PRODUCT_RESPONSE };
        }
        return { ok: true, status: 200, json: async () => MOCK_ITEMS_RESPONSE };
      },
    });
    assert(!fetchCalled, "global fetch must not run");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

console.log("PATCH Comercial 2F — Mercado Livre Product ID Flow Probe Audit\n");

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
    ? "A) MERCADO LIVRE PRODUCT ID FLOW PROBE ROBUST"
    : "B) MERCADO LIVRE PRODUCT ID FLOW PROBE GAP";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(fail === 0 ? 0 : 1);
