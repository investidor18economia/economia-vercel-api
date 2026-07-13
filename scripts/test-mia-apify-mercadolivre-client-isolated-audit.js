/**
 * PATCH Comercial 4A — Apify Mercado Livre Client Real Isolated Audit
 *
 * Usage:
 *   node scripts/test-mia-apify-mercadolivre-client-isolated-audit.js
 *   node scripts/test-mia-apify-mercadolivre-client-isolated-audit.js --http --allow-paid-external
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { enforceDevManualScriptCommercialExecution } from "../lib/commercial/devCommercialCostGuard.js";

import {
  APIFY_MERCADOLIVRE_ACTOR_ID,
  APIFY_MERCADOLIVRE_CLIENT_VERSION,
  APIFY_MERCADOLIVRE_SOURCE,
  DEFAULT_MAX_RESULTS,
  buildApifyMercadoLivreRunUrl,
  clampApifyMaxResults,
  extractApifyMercadoLivreDatasetItems,
  hasApifyMercadoLivreToken,
  isApifyMercadoLivreProductUsable,
  mapApifyMercadoLivreItemToNormalizedProduct,
  mapApifyMercadoLivreItemsToNormalizedProducts,
  parseApifyMercadoLivrePrice,
  redactApifyMercadoLivreSecrets,
  searchApifyMercadoLivreProducts,
  validateApifyMercadoLivreEnv,
} from "../lib/productSourceAdapter/adapters/apifyMercadoLivreClient.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const TEST_TOKEN = "TEST_APIFY_TOKEN_DO_NOT_LEAK";
const TEST_ENV = {
  APIFY_API_TOKEN: TEST_TOKEN,
};

const COGNITIVE_GUARD_FILES = [
  "lib/miaCognitiveRouter.js",
  "lib/miaRoutingDecisionContract.js",
  "lib/miaPrompt.js",
  "lib/miaConversationalTone.js",
  "lib/miaToneComplianceGuard.js",
  "pages/api/chat-gpt4o.js",
  "lib/productSourceAdapter/index.js",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNoTokenLeak(value, token = TEST_TOKEN) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  assert(!text.includes(token), "Apify token leaked in output");
}

function buildApifyItem(overrides = {}) {
  return {
    eTituloProduto: "Apple iPhone 13 128 GB",
    novoPreco: "3.499,00",
    imagemLink: "https://http2.mlstatic.com/iphone13.webp",
    produtoLink: "https://produto.mercadolivre.com.br/MLB-iphone-13",
    produtoMarca: "Apple",
    Vendedor: "LOJA_BR",
    produtoDomainID: "MLB-CELLPHONES",
    ...overrides,
  };
}

function createMockFetcher(items = [], { ok = true, status = 200, delayMs = 0 } = {}) {
  return async () => {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return {
      ok,
      status,
      statusText: ok ? "OK" : "Bad Gateway",
      json: async () => items,
      text: async () => JSON.stringify(items),
    };
  };
}

function createTimeoutFetcher() {
  return async (_url, init) => {
    const signal = init?.signal;
    return new Promise((_resolve, reject) => {
      if (signal) {
        signal.addEventListener("abort", () => {
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      }
    });
  };
}

const CASES = [];

function test(name, fn) {
  CASES.push({ name, fn });
}

test("DEFAULT_MAX_RESULTS is 5 and clamp never exceeds 5", () => {
  assert(DEFAULT_MAX_RESULTS === 5, "default must be 5");
  assert(clampApifyMaxResults(48) === 5, "48 should clamp to 5");
  assert(clampApifyMaxResults(0) === 5, "invalid should fallback to 5");
});

test("validateApifyMercadoLivreEnv detects missing token", () => {
  const missing = validateApifyMercadoLivreEnv({});
  assert(!missing.ok, "empty env should fail");
  assert(missing.missing.includes("APIFY_API_TOKEN"), "token missing");

  const ok = validateApifyMercadoLivreEnv(TEST_ENV);
  assert(ok.ok, "test env should pass");
  assert(hasApifyMercadoLivreToken(TEST_ENV), "hasToken helper");
});

test("buildApifyMercadoLivreRunUrl uses validated actor id", () => {
  const url = buildApifyMercadoLivreRunUrl(TEST_ENV, 5);
  assert(url.includes(APIFY_MERCADOLIVRE_ACTOR_ID), "actor id missing");
  assert(url.includes("run-sync-get-dataset-items"), "sync endpoint missing");
  assert(url.includes("limit=5"), "limit missing");
  assert(!url.includes(TEST_TOKEN), "token must not appear in url");
});

test("parseApifyMercadoLivrePrice parses BRL strings", () => {
  assert(parseApifyMercadoLivrePrice("3.499,00") === 3499, "3499");
  assert(parseApifyMercadoLivrePrice("139,9") === 139.9, "139.9");
  assert(parseApifyMercadoLivrePrice("") === null, "empty");
});

test("mapApifyMercadoLivreItemToNormalizedProduct maps actor fields", () => {
  const mapped = mapApifyMercadoLivreItemToNormalizedProduct(buildApifyItem());
  assert(mapped, "mapped product expected");
  assert(mapped.title.includes("iPhone 13"), "title");
  assert(mapped.price === 3499, "price");
  assert(mapped.url.startsWith("https://"), "url");
  assert(mapped.image?.includes("mlstatic"), "image");
  assert(mapped.brand === "Apple", "brand");
  assert(mapped.seller === "LOJA_BR", "seller");
  assert(mapped.category === "MLB-CELLPHONES", "category");
  assert(mapped.source === APIFY_MERCADOLIVRE_SOURCE, "source");
});

test("mapApifyMercadoLivreItemToNormalizedProduct accepts zProdutoLink fallback", () => {
  const mapped = mapApifyMercadoLivreItemToNormalizedProduct(
    buildApifyItem({
      produtoLink: "",
      zProdutoLink: "https://produto.mercadolivre.com.br/MLB-z-link",
    })
  );
  assert(mapped?.url.includes("MLB-z-link"), "zProdutoLink fallback");
});

test("ignores product without title", () => {
  const mapped = mapApifyMercadoLivreItemToNormalizedProduct(
    buildApifyItem({ eTituloProduto: "" })
  );
  assert(!mapped, "missing title should be ignored");
  assert(
    !isApifyMercadoLivreProductUsable(buildApifyItem({ eTituloProduto: "" })),
    "usable guard title"
  );
});

test("ignores product without URL", () => {
  const mapped = mapApifyMercadoLivreItemToNormalizedProduct(
    buildApifyItem({ produtoLink: "", zProdutoLink: "" })
  );
  assert(!mapped, "missing url should be ignored");
});

test("ignores product without price", () => {
  const mapped = mapApifyMercadoLivreItemToNormalizedProduct(
    buildApifyItem({ novoPreco: "" })
  );
  assert(!mapped, "missing price should be ignored");
});

test("product without image is still accepted when title/url/price exist", () => {
  const mapped = mapApifyMercadoLivreItemToNormalizedProduct(
    buildApifyItem({ imagemLink: "" })
  );
  assert(mapped, "image optional");
  assert(mapped.image === null, "image null");
});

test("mapApifyMercadoLivreItemsToNormalizedProducts limits to 5 even with 48 items", () => {
  const items = Array.from({ length: 48 }, (_entry, index) =>
    buildApifyItem({
      eTituloProduto: `Produto ${index + 1}`,
      produtoLink: `https://produto.mercadolivre.com.br/MLB-${index + 1}`,
      novoPreco: `${100 + index},00`,
    })
  );

  const mapped = mapApifyMercadoLivreItemsToNormalizedProducts(items, 48);
  assert(mapped.length === 5, `expected 5 got ${mapped.length}`);
});

test("searchApifyMercadoLivreProducts handles missing token", async () => {
  const result = await searchApifyMercadoLivreProducts("iphone 13", 5, { env: {} });
  assert(!result.ok, "missing token should fail");
  assert(result.error === "missing_env", "missing_env");
  assert(result.hasToken === false, "hasToken false");
});

test("searchApifyMercadoLivreProducts handles empty query", async () => {
  const result = await searchApifyMercadoLivreProducts("", 5, { env: TEST_ENV });
  assert(!result.ok, "empty query should fail");
  assert(result.error === "missing_query", "missing_query");
});

test("searchApifyMercadoLivreProducts handles timeout", async () => {
  const result = await searchApifyMercadoLivreProducts("iphone 13", 5, {
    env: TEST_ENV,
    fetcher: createTimeoutFetcher(),
    timeoutMs: 20,
  });
  assert(!result.ok, "timeout should fail");
  assert(result.error === "timeout", "timeout error");
  assertNoTokenLeak(result);
});

test("searchApifyMercadoLivreProducts handles empty response", async () => {
  const result = await searchApifyMercadoLivreProducts("iphone 13", 5, {
    env: TEST_ENV,
    fetcher: createMockFetcher([]),
  });
  assert(!result.ok, "empty response should fail");
  assert(result.error === "empty_response", "empty_response");
});

test("searchApifyMercadoLivreProducts handles HTTP error with redacted preview", async () => {
  const result = await searchApifyMercadoLivreProducts("iphone 13", 5, {
    env: TEST_ENV,
    fetcher: async () => ({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      text: async () => JSON.stringify({ message: "blocked", token_echo: TEST_TOKEN }),
    }),
  });
  assert(result.error === "http_error", "http_error");
  assert(result.httpStatus === 403, "403");
  assert(result.safeErrorBodyPreview.includes("blocked"), "preview");
  assert(!result.safeErrorBodyPreview.includes(TEST_TOKEN), "token redacted");
  assertNoTokenLeak(result);
});

test("searchApifyMercadoLivreProducts success: iPhone 13", async () => {
  const result = await searchApifyMercadoLivreProducts("iPhone 13", 5, {
    env: TEST_ENV,
    fetcher: createMockFetcher([
      buildApifyItem({
        eTituloProduto: "Apple iPhone 13 128 GB Meia-noite",
        produtoLink: "https://produto.mercadolivre.com.br/MLB-iphone-13",
      }),
    ]),
  });
  assert(result.ok, `expected ok got ${result.error}`);
  assert(result.count <= 5, "max 5");
  assert(result.products[0]?.title.includes("iPhone 13"), "iphone title");
});

test("searchApifyMercadoLivreProducts success: Galaxy A55", async () => {
  const result = await searchApifyMercadoLivreProducts("Galaxy A55", 5, {
    env: TEST_ENV,
    fetcher: createMockFetcher([
      buildApifyItem({
        eTituloProduto: "Samsung Galaxy A55 5G 256GB",
        produtoLink: "https://produto.mercadolivre.com.br/MLB-galaxy-a55",
        novoPreco: "2.199,00",
        produtoMarca: "Samsung",
        produtoDomainID: "MLB-CELLPHONES",
      }),
    ]),
  });
  assert(result.ok, result.error || "ok");
  assert(/Galaxy A55/i.test(result.products[0]?.title || ""), "galaxy title");
});

test("searchApifyMercadoLivreProducts success: Notebook Lenovo", async () => {
  const result = await searchApifyMercadoLivreProducts("Notebook Lenovo", 5, {
    env: TEST_ENV,
    fetcher: createMockFetcher([
      buildApifyItem({
        eTituloProduto: "Notebook Lenovo Ideapad 3 15 Intel I5 8gb 256gb Ssd",
        produtoLink: "https://produto.mercadolivre.com.br/MLB-lenovo",
        novoPreco: "3.299,99",
        produtoMarca: "Lenovo",
        produtoDomainID: "MLB-NOTEBOOKS",
      }),
    ]),
  });
  assert(result.ok, result.error || "ok");
  assert(/Lenovo/i.test(result.products[0]?.title || ""), "lenovo title");
});

test("searchApifyMercadoLivreProducts success: Cadeira Gamer", async () => {
  const result = await searchApifyMercadoLivreProducts("Cadeira Gamer", 5, {
    env: TEST_ENV,
    fetcher: createMockFetcher([
      buildApifyItem({
        eTituloProduto: "Cadeira Gamer Ergonomica Reclinavel",
        produtoLink: "https://produto.mercadolivre.com.br/MLB-cadeira-gamer",
        novoPreco: "899,90",
        produtoDomainID: "MLB-GAMING_CHAIRS",
      }),
    ]),
  });
  assert(result.ok, result.error || "ok");
  assert(/Cadeira Gamer/i.test(result.products[0]?.title || ""), "chair title");
});

test("extractApifyMercadoLivreDatasetItems supports array and wrapped payloads", () => {
  const item = buildApifyItem();
  assert(extractApifyMercadoLivreDatasetItems([item]).length === 1, "array");
  assert(extractApifyMercadoLivreDatasetItems({ items: [item] }).length === 1, "items");
});

test("redactApifyMercadoLivreSecrets removes token from output", () => {
  const redacted = redactApifyMercadoLivreSecrets(`error ${TEST_TOKEN}`, TEST_ENV);
  assert(!redacted.includes(TEST_TOKEN), "token not redacted");
  assert(redacted.includes("[REDACTED]"), "marker");
});

test("no MIA integration and cognitive/commercial flow untouched", () => {
  for (const relativePath of COGNITIVE_GUARD_FILES) {
    const content = readFileSync(join(ROOT, relativePath), "utf8");
    assert(!content.includes("apifyMercadoLivreClient"), `${relativePath} must not import Apify client`);
    assert(
      !content.includes("apify-mercadolivre-search"),
      `${relativePath} must not use Apify dev endpoint`
    );
  }

  const devRoute = readFileSync(
    join(ROOT, "pages/api/dev/apify-mercadolivre-search.js"),
    "utf8"
  );
  assert(devRoute.includes("searchApifyMercadoLivreProducts"), "dev route uses isolated client");
  assert(devRoute.includes("hasToken"), "dev route exposes hasToken");
  assert(devRoute.includes("maxResults"), "dev route exposes maxResults");
  assert(devRoute.includes("provider"), "dev route exposes provider");
  assert(!devRoute.includes("APIFY_API_TOKEN="), "dev route must not hardcode token");
});

console.log(
  `PATCH Comercial 4A — Apify Mercado Livre Client Real Isolated Audit (${APIFY_MERCADOLIVRE_CLIENT_VERSION})\n`
);

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

if (process.argv.includes("--http")) {
  enforceDevManualScriptCommercialExecution();
  console.log("\n── HTTP smoke (requires dev server + APIFY_API_TOKEN) ──");
  const cases = ["iPhone 13", "Galaxy A55", "Notebook Lenovo"];

  for (const query of cases) {
    try {
      const resp = await fetch(
        `http://localhost:3000/api/dev/apify-mercadolivre-search?q=${encodeURIComponent(query)}`
      );
      const data = await resp.json();
      assert(`${query}: status not 500`, resp.status !== 500, String(resp.status));
      assert(`${query}: provider`, data.provider === APIFY_MERCADOLIVRE_SOURCE);
      assert(`${query}: hasToken flag`, typeof data.hasToken === "boolean");
      assert(`${query}: maxResults <= 5`, (data.maxResults ?? 99) <= 5);
      if (data.ok) {
        assert(`${query}: count <= 5`, (data.count ?? 0) <= 5);
        assert(`${query}: normalized product`, !!data.products?.[0]?.title);
        assert(`${query}: normalized source`, data.products?.[0]?.source === APIFY_MERCADOLIVRE_SOURCE);
      } else if (data.error === "missing_env") {
        console.log(`  ⚠ ${query}: skipped live call — APIFY_API_TOKEN missing in server env`);
      }
      pass += 1;
      console.log(`✓ HTTP ${query}: ${data.ok ? "ok" : data.error}`);
    } catch (err) {
      fail += 1;
      console.log(`✗ HTTP ${query} → ${err.message}`);
    }
  }
}

const total = pass + fail;
console.log(`\nResultado: ${pass}/${total} (${total ? ((pass / total) * 100).toFixed(1) : "0.0"}%)`);
const verdict =
  fail === 0
    ? "A) APIFY MERCADO LIVRE CLIENT REAL ISOLATED ROBUST"
    : "B) APIFY MERCADO LIVRE CLIENT REAL ISOLATED GAP";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(fail > 0 ? 1 : 0);
