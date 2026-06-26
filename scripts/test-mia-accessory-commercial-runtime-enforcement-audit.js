/**
 * PATCH Comercial 4E-B.1 — Accessory Commercial Runtime Enforcement Audit
 *
 * Usage:
 *   node scripts/test-mia-accessory-commercial-runtime-enforcement-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  ACCESSORY_COMMERCIAL_RUNTIME_ENFORCEMENT_VERSION,
  buildAccessoryCommercialRuntimeDiagnostics,
  buildAccessoryRuntimeEnforcementDevPayload,
  enforceAccessoryCommercialRuntimeSelection,
  filterAccessoryCompatibleOffers,
  isOfferCompatibleWithAccessoryIntent,
  shouldEnforceAccessoryCommercialRuntime,
} from "../lib/productSourceAdapter/accessoryCommercialRuntimeEnforcement.js";
import {
  COMMERCIAL_RUNTIME_ACTIVATION_VERSION,
  resolveOfficialCommercialOffer,
  resolveAndApplyCommercialRuntimeActivation,
} from "../lib/productSourceAdapter/commercialRuntimeActivation.js";
import { COMMERCIAL_PROVIDER_IDS } from "../lib/productSourceAdapter/commercialProviderRegistry.js";
import { detectAccessoryIntent } from "../lib/commercial/accessoryIntentLockGuard.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const ORIGINAL_MODE = process.env.COMMERCIAL_RUNTIME_MODE;

let passed = 0;
let failed = 0;

function assert(label, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${label}`);
  } else {
    failed += 1;
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function withRuntimeEnv(mode, fn) {
  if (mode == null) delete process.env.COMMERCIAL_RUNTIME_MODE;
  else process.env.COMMERCIAL_RUNTIME_MODE = mode;
  try {
    return await fn();
  } finally {
    if (ORIGINAL_MODE == null) delete process.env.COMMERCIAL_RUNTIME_MODE;
    else process.env.COMMERCIAL_RUNTIME_MODE = ORIGINAL_MODE;
  }
}

function offer(title, extra = {}) {
  return {
    title,
    price: extra.price ?? 49.9,
    url: extra.url ?? `https://shop.test/${encodeURIComponent(title)}`,
    image: extra.image ?? "https://shop.test/img.jpg",
    source: extra.source ?? COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE,
  };
}

function legacyProduct(name, extra = {}) {
  return {
    product_name: name,
    price: extra.price ?? "R$ 100,00",
    link: extra.link ?? `https://shop.test/${encodeURIComponent(name)}`,
    thumbnail: extra.thumbnail ?? "https://shop.test/img.jpg",
    source: extra.source ?? "Google Shopping",
  };
}

function googleShoppingProduct(title, extra = {}) {
  return {
    product_name: title,
    price: Object.hasOwn(extra, "price") ? extra.price : "R$ 49,90",
    link: extra.url ?? extra.link ?? `https://shop.test/${encodeURIComponent(title)}`,
    thumbnail: extra.image ?? "https://shop.test/img.jpg",
    source: "Google Shopping",
  };
}

function apifyShoppingProduct(title, extra = {}) {
  return {
    title,
    price: Object.hasOwn(extra, "price") ? extra.price : 49.9,
    url: extra.url ?? extra.link ?? `https://mercadolivre.test/${encodeURIComponent(title)}`,
    image: extra.image ?? "https://shop.test/ml.jpg",
    source: COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE,
  };
}

function mockProviders({ googleProducts = [], apifyProducts = [] } = {}) {
  return {
    fetchGoogle: async () => ({
      ok: googleProducts.length > 0,
      products: googleProducts,
      error: googleProducts.length ? null : "empty_results",
    }),
    fetchApify: async () => ({
      ok: apifyProducts.length > 0,
      products: apifyProducts,
      error: apifyProducts.length ? null : "empty_results",
    }),
  };
}

function assertAccessoryOfferNotMain(query, productName = "") {
  const name = String(productName || "").toLowerCase();
  const incompatiblePairs = [
    { query: "pelicula iphone 13", blocked: /^iphone 13$/i },
    { query: "capa iphone 13", blocked: /^iphone 13$/i },
    { query: "controle ps5", blocked: /playstation 5 console/i },
    { query: "carregador notebook lenovo", blocked: /^notebook lenovo$/i },
    { query: "cabo hdmi", blocked: /^notebook lenovo$/i },
    { query: "suporte monitor", blocked: /^monitor gamer$/i },
    { query: "controle remoto samsung", blocked: /^tv samsung$/i },
  ];
  const rule = incompatiblePairs.find((entry) => entry.query === query);
  if (!rule) return true;
  return !rule.blocked.test(productName) && isOfferCompatibleWithAccessoryIntent({
    query,
    offer: { title: productName },
  });
}

async function runAudit() {
console.log(
  `\nPATCH Comercial 4E-B.1 — Accessory Commercial Runtime Enforcement Audit (${ACCESSORY_COMMERCIAL_RUNTIME_ENFORCEMENT_VERSION})\n`
);

console.log("── Module contract ──");
assert("version 4E-B.1", ACCESSORY_COMMERCIAL_RUNTIME_ENFORCEMENT_VERSION === "4E-B.1");
assert(
  "activation version 4E-B.1",
  COMMERCIAL_RUNTIME_ACTIVATION_VERSION === "4E-B.1"
);
assert(
  "uses detectAccessoryIntent guard",
  readFileSync(
    join(ROOT, "lib/productSourceAdapter/accessoryCommercialRuntimeEnforcement.js"),
    "utf8"
  ).includes("detectAccessoryIntent")
);
assert(
  "no brand hardcodes",
  !readFileSync(
    join(ROOT, "lib/productSourceAdapter/accessoryCommercialRuntimeEnforcement.js"),
    "utf8"
  ).match(/includes\s*\(\s*["']iphone|includes\s*\(\s*["']galaxy/i)
);

console.log("\n── Compatibility rules ──");
const accessoryPositive = [
  { query: "pelicula iphone 13", offer: "Película de vidro iPhone 13" },
  { query: "capa iphone 13", offer: "Capa case silicone iPhone 13" },
  { query: "controle ps5", offer: "Controle DualSense PS5" },
  { query: "carregador notebook lenovo", offer: "Carregador fonte notebook Lenovo 65W" },
  { query: "cabo hdmi", offer: "Cabo HDMI 2m" },
  { query: "suporte monitor", offer: "Suporte articulado monitor" },
  { query: "controle remoto samsung", offer: "Controle remoto Samsung Smart TV" },
];

for (const { query, offer: title } of accessoryPositive) {
  assert(
    `"${query}" accepts "${title}"`,
    isOfferCompatibleWithAccessoryIntent({ query, offer: { title } })
  );
}

const accessoryNegative = [
  { query: "pelicula iphone 13", offer: "iPhone 13" },
  { query: "capa iphone 13", offer: "iPhone 13" },
  { query: "controle ps5", offer: "PlayStation 5 Console" },
  { query: "carregador notebook lenovo", offer: "Notebook Lenovo" },
  { query: "cabo hdmi", offer: "Notebook Lenovo" },
  { query: "suporte monitor", offer: "Monitor Gamer 27" },
  { query: "controle remoto samsung", offer: "TV Samsung 55" },
];

for (const { query, offer: title } of accessoryNegative) {
  assert(
    `"${query}" rejects "${title}"`,
    isOfferCompatibleWithAccessoryIntent({ query, offer: { title } }) === false
  );
}

console.log("\n── Main products preserved ──");
const mainProducts = [
  { query: "iphone 13", offer: "iPhone 13" },
  { query: "galaxy a55", offer: "Samsung Galaxy A55" },
  { query: "notebook lenovo", offer: "Notebook Lenovo IdeaPad" },
  { query: "cadeira gamer", offer: "Cadeira Gamer Ergonômica" },
  { query: "monitor gamer", offer: "Monitor Gamer 27" },
  { query: "ps5", offer: "PlayStation 5 Console" },
];

for (const { query, offer: title } of mainProducts) {
  assert(
    `"${query}" not enforced`,
    shouldEnforceAccessoryCommercialRuntime(query) === false
  );
  assert(
    `"${query}" accepts main offer "${title}"`,
    isOfferCompatibleWithAccessoryIntent({ query, offer: { title } })
  );
}

console.log("\n── Controlled runtime integration ──");
await withRuntimeEnv("controlled", async () => {
  for (const { query, offer: badTitle } of accessoryNegative) {
    const legacy = legacyProduct(badTitle);
    const result = await resolveOfficialCommercialOffer({
      query,
      legacyOffer: legacy,
      winnerProduct: legacy,
      mode: "controlled",
      ...mockProviders({
        googleProducts: [googleShoppingProduct(badTitle)],
        apifyProducts: [apifyShoppingProduct(badTitle)],
      }),
    });

    const officialName = result.officialOffer?.product_name || "";
    assert(
      `"${query}" controlled blocks "${badTitle}"`,
      result.officialOffer == null || assertAccessoryOfferNotMain(query, officialName),
      officialName
    );
  }

  const compatible = await resolveOfficialCommercialOffer({
    query: "pelicula iphone 13",
    legacyOffer: legacyProduct("iPhone 13"),
    winnerProduct: legacyProduct("iPhone 13"),
    mode: "controlled",
    ...mockProviders({
      googleProducts: [googleShoppingProduct("Película vidro temperado iPhone 13")],
      apifyProducts: [apifyShoppingProduct("Película vidro temperado iPhone 13")],
    }),
  });
  assert("compatible accessory offer applied", compatible.usedNewPipeline === true);
  assert(
    "accessory card uses offer title",
    /pel[ií]cula/i.test(compatible.officialOffer?.product_name || "")
  );
  assert(
    "accessory card not plain iPhone 13",
    !/^iphone 13$/i.test(compatible.officialOffer?.product_name || "")
  );

  const noCompatible = await resolveOfficialCommercialOffer({
    query: "pelicula iphone 13",
    legacyOffer: legacyProduct("iPhone 13"),
    winnerProduct: legacyProduct("iPhone 13"),
    mode: "controlled",
    ...mockProviders({
      googleProducts: [googleShoppingProduct("iPhone 13")],
      apifyProducts: [apifyShoppingProduct("iPhone 13")],
    }),
  });
  assert(
    "no compatible offer suppresses card",
    noCompatible.officialOffer == null &&
      noCompatible.accessoryEnforcement?.suppressCommercialOffer === true
  );
  assert(
    "legacy incompatible also blocked",
    noCompatible.fallbackReason === "accessory_no_compatible_offer"
  );

  const apifyFail = await resolveOfficialCommercialOffer({
    query: "capa iphone 13",
    legacyOffer: legacyProduct("iPhone 13"),
    winnerProduct: legacyProduct("iPhone 13"),
    mode: "controlled",
    ...mockProviders({
      googleProducts: [googleShoppingProduct("Capa iPhone 13")],
      apifyProducts: [],
    }),
  });
  assert("Apify fail still works with compatible Google offer", apifyFail.usedNewPipeline === true);

  const googleFail = await resolveOfficialCommercialOffer({
    query: "controle ps5",
    legacyOffer: legacyProduct("PlayStation 5 Console"),
    winnerProduct: legacyProduct("PlayStation 5 Console"),
    mode: "controlled",
    ...mockProviders({
      googleProducts: [],
      apifyProducts: [apifyShoppingProduct("Controle DualSense PS5")],
    }),
  });
  assert("Google fail still works with compatible Apify offer", googleFail.usedNewPipeline === true);
});

console.log("\n── Apply to prices safe fallback ──");
await withRuntimeEnv("controlled", async () => {
  const applied = await resolveAndApplyCommercialRuntimeActivation({
    query: "pelicula iphone 13",
    prices: [
      {
        product_name: "iPhone 13",
        price: "R$ 3.499,00",
        link: "https://legacy.test/iphone-13",
        thumbnail: "https://legacy.test/img.jpg",
        source: "Google Shopping",
      },
    ],
    winnerProduct: legacyProduct("iPhone 13"),
    mode: "controlled",
    ...mockProviders({
      googleProducts: [googleShoppingProduct("iPhone 13")],
      apifyProducts: [apifyShoppingProduct("iPhone 13")],
    }),
  });
  assert("incompatible accessory clears prices", applied.prices.length === 0);
});

console.log("\n── Diagnostics / DEV payload ──");
const enforcement = enforceAccessoryCommercialRuntimeSelection({
  query: "pelicula iphone 13",
  selectedOffer: offer("iPhone 13"),
  legacyOffer: legacyProduct("iPhone 13"),
});
const diagnostics = buildAccessoryCommercialRuntimeDiagnostics(enforcement);
assert("diagnostics active", diagnostics.active === true);
assert("diagnostics blocked incompatible", diagnostics.blockedIncompatibleOffer === true);
assert("dev payload shape", buildAccessoryRuntimeEnforcementDevPayload(diagnostics).active === true);

console.log("\n── filterAccessoryCompatibleOffers ──");
const filtered = filterAccessoryCompatibleOffers({
  query: "cabo hdmi",
  offers: [
    offer("Cabo HDMI 2m"),
    offer("Notebook Lenovo"),
  ],
});
assert("filter keeps cabo", filtered.length === 1);
assert("filter removes notebook", /cabo/i.test(filtered[0]?.title || ""));

console.log("\n── Architecture preservation ──");
const UNTOUCHED = [
  "lib/miaCognitiveRouter.js",
  "lib/miaRoutingDecisionContract.js",
  "lib/miaProductExplanationBuilder.js",
  "lib/commercial/accessoryIntentLockGuard.js",
];
for (const file of UNTOUCHED) {
  const content = readFileSync(join(ROOT, file), "utf8");
  assert(`${file} not importing enforcement`, !content.includes("accessoryCommercialRuntimeEnforcement"));
}

const chatSource = readFileSync(join(ROOT, "pages/api/chat-gpt4o.js"), "utf8");
assert("chat patches accessory tracer", chatSource.includes("commercial_accessory_runtime_enforcement"));

const devSource = readFileSync(join(ROOT, "pages/api/dev/commercial-runtime-activation.js"), "utf8");
assert("dev endpoint exposes accessoryRuntimeEnforcement", devSource.includes("accessoryRuntimeEnforcement"));

console.log(`\nPassed: ${passed} Failed: ${failed}`);
console.log(failed === 0 ? "\nVeredito: A) ROBUST\n" : "\nVeredito: C) FAILED\n");
process.exit(failed > 0 ? 1 : 0);
}

runAudit().catch((err) => {
  console.error(err);
  process.exit(1);
});
