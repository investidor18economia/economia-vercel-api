/**
 * PATCH Comercial 4D — Commercial Selection Engine Audit
 *
 * Usage:
 *   node scripts/test-mia-commercial-selection-engine-audit.js
 *   node scripts/test-mia-commercial-selection-engine-audit.js --http
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  COMMERCIAL_SELECTION_ENGINE_VERSION,
  TOP_ALTERNATIVE_OFFERS,
  buildCommercialOfferScore,
  isBrokenCommercialOffer,
  selectCommercialOffers,
} from "../lib/productSourceAdapter/commercialSelectionEngine.js";
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
  /if\s*\([^)]*brand\s*===\s*["']Apple/i,
  /if\s*\([^)]*includes\s*\(\s*["']Galaxy/i,
  /if\s*\([^)]*includes\s*\(\s*["']iphone/i,
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function offer(title, extra = {}) {
  return {
    title,
    price: extra.price ?? 1000,
    url: extra.url ?? `https://example.test/${encodeURIComponent(title)}`,
    image: extra.image ?? "https://example.test/image.jpg",
    source: extra.source ?? COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
    ...extra,
  };
}

const CASES = [];

function test(name, fn) {
  CASES.push({ name, fn });
}

test("buildCommercialOfferScore favorece menor preço", () => {
  const bounds = { min: 1000, max: 2000 };
  const cheap = buildCommercialOfferScore(offer("Produto A", { price: 1000 }), bounds);
  const expensive = buildCommercialOfferScore(offer("Produto B", { price: 2000 }), bounds);
  assert(cheap.breakdown.price > expensive.breakdown.price, "cheaper price score");
  assert(cheap.total > expensive.total, "cheaper total score");
});

test("buildCommercialOfferScore favorece completude e imagem", () => {
  const complete = buildCommercialOfferScore(
    offer("Produto Completo XYZ 128GB", {
      price: 1500,
      image: "https://img.test/a.jpg",
      source: COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE,
      seller: "Loja",
      category: "cat",
    }),
    { min: 1500, max: 1500 }
  );
  const partial = buildCommercialOfferScore(
    offer("Produto", { price: 1500, image: "", source: "" }),
    { min: 1500, max: 1500 }
  );
  assert(complete.total > partial.total, "complete offer scores higher");
});

test("query alignment impede acessório barato de vencer produto principal", () => {
  const result = selectCommercialOffers({
    query: "cadeira gamer",
    offers: [
      offer("Capa Para Cadeira Gamer Elástica", { price: 42 }),
      offer("Cadeira Gamer Healer Preta", { price: 459 }),
    ],
  });
  assert(/Cadeira Gamer/i.test(result.selectedOffer?.title || ""), "main product selected");
  assert(result.diagnostics.queryApplied === true, "query applied");
});

test("celular: seleciona menor preço válido", () => {
  const result = selectCommercialOffers({
    offers: [
      offer("Smartphone Alpha 13 128GB", { price: 3299 }),
      offer("Smartphone Alpha 13 128GB", { price: 2999, source: COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE }),
      offer("Smartphone Alpha 13 256GB", { price: 3499 }),
    ],
  });
  assert(result.selectedOffer?.price === 2999, "cheapest selected");
  assert(result.alternativeOffers.length <= TOP_ALTERNATIVE_OFFERS, "alternatives capped");
});

test("notebook: melhor oferta com dados completos", () => {
  const result = selectCommercialOffers({
    offers: [
      offer("Notebook Beta 15 I5 8GB 256GB", { price: 3250, image: "" }),
      offer("Notebook Beta 15 I5 8GB 256GB", {
        price: 3250,
        image: "https://img.test/notebook.jpg",
        seller: "Tech Store",
      }),
    ],
  });
  assert(result.selectedOffer?.image, "complete offer selected");
});

test("TV: múltiplos providers preservados como alternativas", () => {
  const result = selectCommercialOffers({
    offers: [
      offer("Smart TV 55 4K UHD", {
        price: 2499,
        source: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
      }),
      offer("Smart TV 55 4K UHD", {
        price: 2599,
        source: COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE,
      }),
    ],
  });
  assert(result.selectedOffer, "selected");
  assert(result.alternativeOffers.length >= 1, "alternative preserved");
});

test("monitor: exclui URL inválida", () => {
  const result = selectCommercialOffers({
    offers: [
      offer("Monitor Gamer 27 165Hz", { url: "not-a-url" }),
      offer("Monitor Gamer 27 165Hz", { price: 1199 }),
    ],
  });
  assert(result.diagnostics.excludedCount === 1, "broken excluded");
  assert(result.selectedOffer?.price === 1199, "valid selected");
});

test("cadeira: exclui preço inválido", () => {
  const result = selectCommercialOffers({
    offers: [
      offer("Cadeira Gamer Ergonomica", { price: null }),
      offer("Cadeira Gamer Ergonomica", { price: 899 }),
    ],
  });
  assert(result.selectedOffer?.price === 899, "valid price selected");
});

test("console: provider único funciona", () => {
  const result = selectCommercialOffers({
    offers: [offer("Console Gamer Series X 1TB", { price: 3999 })],
  });
  assert(result.selectedOffer, "single provider selected");
  assert(result.alternativeOffers.length === 0, "no alternatives");
});

test("empate de preço preserva alternativas", () => {
  const result = selectCommercialOffers({
    offers: [
      offer("Dispositivo Gamma X", { price: 1500, source: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING }),
      offer("Dispositivo Gamma X", { price: 1500, source: COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE }),
    ],
  });
  assert(result.diagnostics.tieGroupSize >= 2, "tie detected");
  assert(result.alternativeOffers.length >= 1, "tie alternative preserved");
});

test("ausência de imagem não exclui oferta", () => {
  const result = selectCommercialOffers({
    offers: [
      offer("Camera Delta 4K", { price: 1800, image: "" }),
      offer("Camera Delta 4K Pro", { price: 2200, image: "https://img.test/cam.jpg" }),
    ],
  });
  assert(result.diagnostics.eligibleCount === 2, "both eligible");
  assert(result.selectedOffer?.price === 1800, "cheaper without image can win");
});

test("provider vazio não exclui se dados mínimos existem", () => {
  const result = selectCommercialOffers({
    offers: [offer("Produto Epsilon", { source: "", price: 750 })],
  });
  assert(result.selectedOffer, "empty source allowed");
});

test("lista vazia retorna seleção nula", () => {
  const result = selectCommercialOffers({ offers: [] });
  assert(result.selectedOffer === null, "no selection");
  assert(result.diagnostics.selectionReason === "no_eligible_offers", "reason");
});

test("isBrokenCommercialOffer detecta oferta quebrada", () => {
  assert(isBrokenCommercialOffer(offer("Produto Ok", { price: 10 })) === false, "valid");
  assert(isBrokenCommercialOffer({ title: "X", price: 10, url: "bad" }) === true, "bad url");
});

test("sem hardcodes de marca no engine", () => {
  const source = readFileSync(
    join(ROOT, "lib/productSourceAdapter/commercialSelectionEngine.js"),
    "utf8"
  );
  for (const pattern of PRODUCT_HARDCODE_PATTERNS) {
    assert(!pattern.test(source), `hardcode detected: ${pattern}`);
  }
});

test("no MIA integration and upstream layers untouched", () => {
  for (const relativePath of COGNITIVE_GUARD_FILES) {
    const content = readFileSync(join(ROOT, relativePath), "utf8");
    assert(
      !content.includes("commercialSelectionEngine"),
      `${relativePath} must not import selection engine`
    );
    assert(
      !content.includes("commercial-selection"),
      `${relativePath} must not use selection dev endpoint`
    );
  }

  const mergeSource = readFileSync(
    join(ROOT, "lib/productSourceAdapter/commercialOfferMergeLayer.js"),
    "utf8"
  );
  const dedupeSource = readFileSync(
    join(ROOT, "lib/productSourceAdapter/commercialDeduplicationLayer.js"),
    "utf8"
  );
  assert(!mergeSource.includes("commercialSelectionEngine"), "merge untouched");
  assert(!dedupeSource.includes("commercialSelectionEngine"), "dedupe untouched");
});

console.log(
  `PATCH Comercial 4D — Commercial Selection Engine Audit (${COMMERCIAL_SELECTION_ENGINE_VERSION})\n`
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
      "http://localhost:3000/api/dev/commercial-selection?q=iphone%2013&limit=5"
    );
    const data = await resp.json();

    assert("endpoint status not 500", resp.status !== 500, String(resp.status));
    assert("selectionVersion", data.selectionVersion === COMMERCIAL_SELECTION_ENGINE_VERSION);
    assert("offerCount number", typeof data.offerCount === "number");
    if (data.ok) {
      assert("selectedOffer present", !!data.selectedOffer);
      assert(
        "alternatives capped",
        (data.alternativeOffers || []).length <= TOP_ALTERNATIVE_OFFERS
      );
    }

    pass += 1;
    console.log(
      `✓ HTTP commercial-selection endpoint (${data.offerCount ?? 0} offers, status ${resp.status})`
    );
  } catch (err) {
    fail += 1;
    console.log(`✗ HTTP commercial-selection endpoint → ${err.message}`);
  }
}

const total = pass + fail;
console.log(`\nResultado: ${pass}/${total} (${total ? ((pass / total) * 100).toFixed(1) : "0.0"}%)`);
const verdict =
  fail === 0
    ? "A) COMMERCIAL SELECTION ENGINE ROBUST"
    : "B) COMMERCIAL SELECTION ENGINE GAP";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(fail > 0 ? 1 : 0);
