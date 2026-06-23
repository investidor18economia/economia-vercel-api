/**
 * PATCH Comercial 4C-A — Commercial Offer Merge Layer Audit
 *
 * Usage:
 *   node scripts/test-mia-commercial-offer-merge-layer-audit.js
 *   node scripts/test-mia-commercial-offer-merge-layer-audit.js --http
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  COMMERCIAL_OFFER_MERGE_LAYER_VERSION,
  mapApifyMercadoLivreOfferToMergedOffer,
  mapGoogleShoppingOfferToMergedOffer,
  mergeCommercialOfferBundle,
  mergeCommercialOffers,
  validateCommercialMergeProvider,
  validateCommercialMergeRegistry,
} from "../lib/productSourceAdapter/commercialOfferMergeLayer.js";
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const googleOfferRaw = {
  product_name: "Apple iPhone 13 128 GB",
  price: "3499.00",
  numericPrice: 3499,
  link: "https://shopping.google.com/iphone-13",
  thumbnail: "https://example.test/google-iphone.jpg",
  source: "serpapi",
  provider: "google_shopping",
};

const apifyOfferRaw = {
  title: "Apple iPhone 13 128 GB Meia-noite",
  price: 3499,
  url: "https://produto.mercadolivre.com.br/MLB-iphone-13",
  image: "https://example.test/apify-iphone.jpg",
  brand: "Apple",
  seller: "LOJA_BR",
  category: "MLB-CELLPHONES",
  source: "apify_mercadolivre",
};

const CASES = [];

function test(name, fn) {
  CASES.push({ name, fn });
}

test("merge vazio", () => {
  const merged = mergeCommercialOffers({});
  assert(Array.isArray(merged), "array");
  assert(merged.length === 0, "empty merge");
  const bundle = mergeCommercialOfferBundle({});
  assert(bundle.diagnostics.mergedCount === 0, "mergedCount 0");
});

test("merge Google apenas", () => {
  const merged = mergeCommercialOffers({
    googleShoppingOffers: [googleOfferRaw],
    apifyMercadoLivreOffers: [],
  });
  assert(merged.length === 1, "one google offer");
  assert(merged[0].source === COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING, "google source");
});

test("merge Apify apenas", () => {
  const merged = mergeCommercialOffers({
    googleShoppingOffers: [],
    apifyMercadoLivreOffers: [apifyOfferRaw],
  });
  assert(merged.length === 1, "one apify offer");
  assert(merged[0].source === COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE, "apify source");
});

test("merge ambos preserva ordem google -> apify", () => {
  const merged = mergeCommercialOffers({
    googleShoppingOffers: [googleOfferRaw, { ...googleOfferRaw, product_name: "Google 2" }],
    apifyMercadoLivreOffers: [apifyOfferRaw, { ...apifyOfferRaw, title: "Apify 2" }],
  });
  assert(merged.length === 4, "four offers");
  assert(merged[0].title.includes("iPhone 13"), "google first");
  assert(merged[2].title.includes("Meia-noite"), "apify starts after google block");
  assert(merged[0].source === COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING, "first source google");
  assert(merged[2].source === COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE, "apify block source");
});

test("preservação de source/url/imagem/preço/título", () => {
  const google = mapGoogleShoppingOfferToMergedOffer(googleOfferRaw);
  const apify = mapApifyMercadoLivreOfferToMergedOffer(apifyOfferRaw);

  assert(google.title.includes("iPhone 13"), "google title");
  assert(google.url.includes("shopping.google.com"), "google url");
  assert(google.image.includes("google-iphone"), "google image");
  assert(String(google.price).includes("3499"), "google price");
  assert(google.source === COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING, "google source preserved");

  assert(apify.title.includes("Meia-noite"), "apify title");
  assert(apify.url.includes("mercadolivre.com.br"), "apify url");
  assert(apify.image.includes("apify-iphone"), "apify image");
  assert(apify.price === 3499, "apify price");
  assert(apify.source === COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE, "apify source preserved");
});

test("nenhum produto removido mesmo com campos parciais", () => {
  const merged = mergeCommercialOffers({
    googleShoppingOffers: [{ product_name: "Sem link" }],
    apifyMercadoLivreOffers: [{ title: "Sem preço", url: "https://example.test/x" }],
  });
  assert(merged.length === 2, "partial offers kept");
});

test("provider desabilitado não entra no merge", () => {
  const bundle = mergeCommercialOfferBundle(
    {
      googleShoppingOffers: [googleOfferRaw],
      apifyMercadoLivreOffers: [apifyOfferRaw],
    },
    {
      providerEnabled: {
        [COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING]: false,
        [COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE]: true,
      },
    }
  );

  assert(bundle.diagnostics.googleCount === 0, "google skipped");
  assert(bundle.diagnostics.apifyCount === 1, "apify kept");
  assert(bundle.providersUsed.length === 1, "one provider used");
  assert(bundle.providersUsed[0] === COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE, "apify only");
});

test("provider desconhecido na validação retorna null-safe", () => {
  const unknown = validateCommercialMergeProvider("provider_inexistente");
  assert(unknown.ok === false, "unknown not ok");
  assert(unknown.reason === "unknown_provider", "unknown reason");
  assert(unknown.enabled === false, "unknown disabled");

  const registry = validateCommercialMergeRegistry();
  assert(registry.googleShopping.ok === true, "google registered");
  assert(registry.apifyMercadoLivre.ok === true, "apify registered");
  assert(registry.unknownProvider.ok === false, "unknown in registry validation");
});

test("registry integration without auto execution", () => {
  const source = readFileSync(
    join(ROOT, "lib/productSourceAdapter/commercialOfferMergeLayer.js"),
    "utf8"
  );
  assert(source.includes("getCommercialProviderRegistrySummary"), "registry read");
  assert(!source.includes("fetchGoogleShoppingAdapterResult"), "no google fetch in layer");
  assert(!source.includes("searchApifyMercadoLivreProducts"), "no apify fetch in layer");
  assert(!source.includes(".sort("), "must not sort");
  assert(!source.includes("dedupe"), "must not dedupe");
});

test("no MIA integration and commercial search untouched", () => {
  for (const relativePath of COGNITIVE_GUARD_FILES) {
    const content = readFileSync(join(ROOT, relativePath), "utf8");
    assert(
      !content.includes("commercialOfferMergeLayer"),
      `${relativePath} must not import merge layer`
    );
    assert(
      !content.includes("commercial-offer-merge"),
      `${relativePath} must not use merge dev endpoint`
    );
  }

  const devRoute = readFileSync(
    join(ROOT, "pages/api/dev/commercial-offer-merge.js"),
    "utf8"
  );
  assert(devRoute.includes("mergeCommercialOfferBundle"), "dev route merges offers");
  assert(devRoute.includes("fetchGoogleShoppingAdapterResult"), "dev route fetches google");
  assert(devRoute.includes("searchApifyMercadoLivreProducts"), "dev route fetches apify");
});

console.log(
  `PATCH Comercial 4C-A — Commercial Offer Merge Layer Audit (${COMMERCIAL_OFFER_MERGE_LAYER_VERSION})\n`
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
      "http://localhost:3000/api/dev/commercial-offer-merge?q=iphone%2013&limit=5"
    );
    const data = await resp.json();

    assert("endpoint status not 500", resp.status !== 500, String(resp.status));
    assert("endpoint has offers array", Array.isArray(data.offers));
    assert("endpoint has diagnostics", typeof data.mergedCount === "number");
    assert("endpoint has googleCount", typeof data.googleCount === "number");
    assert("endpoint has apifyCount", typeof data.apifyCount === "number");

    if (data.ok) {
      assert(
        "mergedCount equals googleCount + apifyCount",
        data.mergedCount === data.googleCount + data.apifyCount
      );
      assert("providersUsed includes sources", Array.isArray(data.providersUsed));
    }

    pass += 1;
    console.log(
      `✓ HTTP commercial-offer-merge endpoint (${data.mergedCount ?? 0} offers, status ${resp.status})`
    );
  } catch (err) {
    fail += 1;
    console.log(`✗ HTTP commercial-offer-merge endpoint → ${err.message}`);
  }
}

const total = pass + fail;
console.log(`\nResultado: ${pass}/${total} (${total ? ((pass / total) * 100).toFixed(1) : "0.0"}%)`);
const verdict =
  fail === 0
    ? "A) COMMERCIAL OFFER MERGE LAYER ROBUST"
    : "B) COMMERCIAL OFFER MERGE LAYER GAP";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(fail > 0 ? 1 : 0);
