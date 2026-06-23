/**
 * PATCH Comercial 4C-B — Commercial Deduplication Layer Audit
 *
 * Usage:
 *   node scripts/test-mia-commercial-deduplication-layer-audit.js
 *   node scripts/test-mia-commercial-deduplication-layer-audit.js --http
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  COMMERCIAL_DEDUPLICATION_LAYER_VERSION,
  buildCommercialOfferSignature,
  deduplicateCommercialOfferBundle,
  deduplicateCommercialOffers,
  extractCommercialVariantSignals,
  isCommercialDuplicate,
  isCompatibleCommercialVariant,
  normalizeCommercialOfferTitle,
} from "../lib/productSourceAdapter/commercialDeduplicationLayer.js";
import { COMMERCIAL_PROVIDER_IDS } from "../lib/productSourceAdapter/commercialProviderRegistry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const COGNITIVE_GUARD_FILES = [
  "lib/miaCognitiveRouter.js",
  "lib/miaRoutingDecisionContract.js",
  "lib/miaPrompt.js",
  "pages/api/chat-gpt4o.js",
  "lib/productSourceAdapter/index.js",
];

const PRODUCT_HARDCODE_PATTERNS = [
  /if\s*\([^)]*iphone/i,
  /if\s*\([^)]*galaxy/i,
  /if\s*\([^)]*includes\s*\(\s*["']iphone/i,
  /if\s*\([^)]*includes\s*\(\s*["']galaxy/i,
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function offer(title, extra = {}) {
  return {
    title,
    price: extra.price ?? 1000,
    url: extra.url ?? `https://example.test/${encodeURIComponent(title)}`,
    image: extra.image ?? null,
    source: extra.source ?? COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
    ...extra,
  };
}

function titles(result = []) {
  return result.map((entry) => entry.title);
}

const CASES = [];

function test(name, fn) {
  CASES.push({ name, fn });
}

test("normalizeCommercialOfferTitle remove espaços/casing/símbolos", () => {
  const normalized = normalizeCommercialOfferTitle("  Apple   iPhone   13!!! 128GB  ");
  assert(normalized.includes("iphone 13"), normalized);
  assert(!normalized.includes("!!!"), "symbols removed");
});

test("buildCommercialOfferSignature gera assinatura consistente", () => {
  const a = buildCommercialOfferSignature("iPhone 13 128GB");
  const b = buildCommercialOfferSignature("iphone 13 128 gb");
  assert(a.signature === b.signature, "consistent signature");
  assert(a.capacities.includes("128gb"), "capacity extracted");
});

test("extractCommercialVariantSignals detecta Pro/Recondicionado/Caixa Aberta", () => {
  const pro = extractCommercialVariantSignals("Smartphone X Pro Max");
  assert(pro.tiers.includes("pro"), "pro");
  assert(pro.tiers.includes("max"), "max");

  const refurbished = extractCommercialVariantSignals("Notebook Y Recondicionado");
  assert(refurbished.conditions.includes("recondicionado"), "recondicionado");

  const openBox = extractCommercialVariantSignals("Monitor Z Caixa Aberta");
  assert(openBox.conditions.includes("caixa_aberta"), "caixa aberta");
});

test("duplicatas exatas removidas", () => {
  const input = [
    offer("Apple iPhone 13 128GB", { url: "https://shop.test/a" }),
    offer("Apple iPhone 13 128GB", { url: "https://shop.test/a" }),
    offer("Apple iPhone 13 128GB", { url: "https://shop.test/b" }),
  ];
  const result = deduplicateCommercialOfferBundle(input);
  assert(result.offers.length === 1, `expected 1 got ${result.offers.length}`);
  assert(result.diagnostics.duplicatesRemoved >= 2, "duplicates removed");
});

test("celular: base preservada e Pro filtrado", () => {
  const result = deduplicateCommercialOffers([
    offer("Smartphone Alpha 13"),
    offer("Smartphone Alpha 13"),
    offer("Smartphone Alpha 13 Pro"),
    offer("Smartphone Alpha 13 Recondicionado"),
  ]);
  assert(result.length === 2, `expected 2 got ${result.length}`);
  assert(titles(result).some((title) => /Alpha 13 Pro/i.test(title)) === false, "pro removed");
  assert(titles(result).some((title) => /Recondicionado/i.test(title)), "refurb kept");
});

test("celular: capacidades diferentes preservadas", () => {
  const result = deduplicateCommercialOffers([
    offer("Smartphone Beta 13"),
    offer("Smartphone Beta 13 128GB"),
    offer("Smartphone Beta 13 256GB"),
  ]);
  assert(result.length === 3, `expected 3 got ${result.length}`);
});

test("notebook: duplicata e variante tier", () => {
  const result = deduplicateCommercialOffers([
    offer("Notebook Lenovo Ideapad 3 15 Intel I5 8GB 256GB SSD"),
    offer("Notebook Lenovo Ideapad 3 15 Intel I5 8GB 256GB SSD"),
    offer("Notebook Lenovo Ideapad 3 Pro 15 Intel I5 8GB 256GB SSD"),
  ]);
  assert(result.length === 1, `expected 1 got ${result.length}`);
  assert(titles(result).some((title) => /\bPro\b/i.test(title)) === false, "pro removed");
});

test("TV: OLED filtrado quando base plain existe", () => {
  const result = deduplicateCommercialOffers([
    offer("Smart TV 55 Polegadas 4K"),
    offer("Smart TV 55 Polegadas 4K OLED"),
    offer("Smart TV 55 Polegadas 4K QLED"),
  ]);
  assert(result.length === 1, `expected 1 got ${result.length}`);
  assert(titles(result)[0].includes("55"), "base kept");
});

test("monitor: caixa aberta preservada", () => {
  const result = deduplicateCommercialOffers([
    offer("Monitor Gamer 27 165Hz IPS"),
    offer("Monitor Gamer 27 165Hz IPS Caixa Aberta"),
  ]);
  assert(result.length === 2, `expected 2 got ${result.length}`);
});

test("cadeira: duplicata removida sem hardcode", () => {
  const result = deduplicateCommercialOffers([
    offer("Cadeira Gamer Ergonomica Reclinavel Preta"),
    offer("Cadeira Gamer Ergonomica Reclinavel Preta"),
    offer("Cadeira Gamer Ergonomica Reclinavel Pro Preta"),
  ]);
  assert(result.length === 1, `expected 1 got ${result.length}`);
});

test("console: tier filtrado com base plain", () => {
  const result = deduplicateCommercialOffers([
    offer("Console Gamer Series X 1TB"),
    offer("Console Gamer Series X Pro 1TB"),
  ]);
  assert(result.length === 1, `expected 1 got ${result.length}`);
  assert(!/\bPro\b/i.test(titles(result)[0]), "pro removed");
});

test("GPU: RTX base vs Ti", () => {
  const sigBase = buildCommercialOfferSignature("Placa de Video RTX 5070 16GB");
  const sigTi = buildCommercialOfferSignature("Placa de Video RTX 5070 Ti 16GB");
  assert(sigBase.baseSignature === sigTi.baseSignature, "same base");
  assert(sigTi.tiers.includes("ti"), "ti tier");

  const result = deduplicateCommercialOffers([
    offer("Placa de Video RTX 5070 16GB"),
    offer("Placa de Video RTX 5070 Ti 16GB"),
  ]);
  assert(result.length === 1, `expected 1 got ${result.length}`);
});

test("providers diferentes: duplicata removida por assinatura", () => {
  const result = deduplicateCommercialOffers([
    offer("Produto Delta X1 128GB", {
      source: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
      url: "https://shop.test/delta",
    }),
    offer("Produto Delta X1 128GB", {
      source: COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE,
      url: "https://produto.mercadolivre.com.br/delta-x1",
    }),
  ]);
  assert(result.length === 1, "duplicate collapsed conservatively by signature");
});

test("conservador: apenas tier sem base plain preservado", () => {
  const result = deduplicateCommercialOffers([
    offer("Dispositivo Omega 9 Pro"),
    offer("Dispositivo Omega 9 Ultra"),
  ]);
  assert(result.length === 2, "no plain base -> preserve variants");
});

test("isCommercialDuplicate e isCompatibleCommercialVariant helpers", () => {
  const a = buildCommercialOfferSignature("Produto Teste 128GB");
  const b = buildCommercialOfferSignature("Produto Teste 128GB");
  const c = buildCommercialOfferSignature("Produto Teste Pro 128GB");

  assert(isCommercialDuplicate(a, b), "duplicate");
  assert(isCompatibleCommercialVariant(a, c) === false, "tier incompatible");
});

test("sem hardcodes de produto no layer", () => {
  const source = readFileSync(
    join(ROOT, "lib/productSourceAdapter/commercialDeduplicationLayer.js"),
    "utf8"
  );
  for (const pattern of PRODUCT_HARDCODE_PATTERNS) {
    assert(!pattern.test(source), `hardcode pattern detected: ${pattern}`);
  }
  assert(!source.includes("offers.sort"), "must not sort offers");
  assert(!/kept\.sort|result\.sort|profiles\.sort/.test(source), "must not sort offer lists");
});

test("no MIA integration and merge layer untouched", () => {
  for (const relativePath of COGNITIVE_GUARD_FILES) {
    const content = readFileSync(join(ROOT, relativePath), "utf8");
    assert(
      !content.includes("commercialDeduplicationLayer"),
      `${relativePath} must not import dedup layer`
    );
    assert(
      !content.includes("commercial-deduplication"),
      `${relativePath} must not use dedup dev endpoint`
    );
  }

  const mergeSource = readFileSync(
    join(ROOT, "lib/productSourceAdapter/commercialOfferMergeLayer.js"),
    "utf8"
  );
  assert(!mergeSource.includes("commercialDeduplicationLayer"), "merge layer unchanged");
});

console.log(
  `PATCH Comercial 4C-B — Commercial Deduplication Layer Audit (${COMMERCIAL_DEDUPLICATION_LAYER_VERSION})\n`
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
  console.log("\n── HTTP smoke (requires dev server) ──");
  try {
    const resp = await fetch(
      "http://localhost:3000/api/dev/commercial-deduplication?q=iphone%2013&limit=5"
    );
    const data = await resp.json();

    assert("endpoint status not 500", resp.status !== 500, String(resp.status));
    assert("beforeCount present", typeof data.beforeCount === "number");
    assert("afterCount present", typeof data.afterCount === "number");
    assert("duplicatesRemoved present", typeof data.duplicatesRemoved === "number");
    assert(
      "afterCount <= beforeCount",
      (data.afterCount ?? 0) <= (data.beforeCount ?? 0)
    );
    assert(Array.isArray(data.offers), "offers array");

    pass += 1;
    console.log(
      `✓ HTTP commercial-deduplication endpoint (${data.beforeCount} -> ${data.afterCount})`
    );
  } catch (err) {
    fail += 1;
    console.log(`✗ HTTP commercial-deduplication endpoint → ${err.message}`);
  }
}

const total = pass + fail;
console.log(`\nResultado: ${pass}/${total} (${total ? ((pass / total) * 100).toFixed(1) : "0.0"}%)`);
const verdict =
  fail === 0
    ? "A) COMMERCIAL DEDUPLICATION LAYER ROBUST"
    : "B) COMMERCIAL DEDUPLICATION LAYER GAP";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(fail > 0 ? 1 : 0);
