/**
 * PATCH Comercial 4E-B — Commercial Runtime Controlled Activation Audit
 *
 * Usage:
 *   node scripts/test-mia-commercial-runtime-controlled-activation-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  COMMERCIAL_RUNTIME_ACTIVATION_VERSION,
  buildCommercialRuntimeActivationDiagnostics,
  mapLegacyProductToCardShape,
  mapSelectedOfferToLegacyCardShape,
  resolveAndApplyCommercialRuntimeActivation,
  resolveOfficialCommercialOffer,
} from "../lib/productSourceAdapter/commercialRuntimeActivation.js";
import {
  COMMERCIAL_RUNTIME_MODES,
  COMMERCIAL_RUNTIME_MODE_VERSION,
  getCommercialRuntimeMode,
  isCommercialRuntimeControlled,
  isCommercialRuntimeLegacy,
  isCommercialRuntimeShadow,
} from "../lib/productSourceAdapter/commercialRuntimeMode.js";
import { isCommercialRuntimeShadowEnabled } from "../lib/productSourceAdapter/commercialRuntimeShadow.js";
import { COMMERCIAL_PROVIDER_IDS } from "../lib/productSourceAdapter/commercialProviderRegistry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const ORIGINAL_MODE = process.env.COMMERCIAL_RUNTIME_MODE;
const ORIGINAL_SHADOW_FLAG = process.env.ENABLE_COMMERCIAL_RUNTIME_SHADOW;

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

async function withRuntimeEnv({ mode, shadowFlag }, fn) {
  if (mode == null) delete process.env.COMMERCIAL_RUNTIME_MODE;
  else process.env.COMMERCIAL_RUNTIME_MODE = mode;

  if (shadowFlag == null) delete process.env.ENABLE_COMMERCIAL_RUNTIME_SHADOW;
  else process.env.ENABLE_COMMERCIAL_RUNTIME_SHADOW = shadowFlag;

  try {
    return await fn();
  } finally {
    if (ORIGINAL_MODE == null) delete process.env.COMMERCIAL_RUNTIME_MODE;
    else process.env.COMMERCIAL_RUNTIME_MODE = ORIGINAL_MODE;

    if (ORIGINAL_SHADOW_FLAG == null) delete process.env.ENABLE_COMMERCIAL_RUNTIME_SHADOW;
    else process.env.ENABLE_COMMERCIAL_RUNTIME_SHADOW = ORIGINAL_SHADOW_FLAG;
  }
}

function legacyProduct(name, extra = {}) {
  return {
    product_name: name,
    price: extra.price ?? "R$ 100,00",
    link: extra.link ?? `https://shop.test/${encodeURIComponent(name)}`,
    thumbnail: extra.thumbnail ?? "https://shop.test/img.jpg",
    source: extra.source ?? "Google Shopping",
    provider: extra.provider ?? "serpapi",
    ...extra,
  };
}

function pipelineOffer(title, extra = {}) {
  return {
    title,
    price: extra.price ?? 99.9,
    url: extra.url ?? `https://mercadolivre.test/${encodeURIComponent(title)}`,
    image: extra.image ?? "https://shop.test/ml.jpg",
    source: extra.source ?? COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE,
  };
}

function googleShoppingProduct(title, extra = {}) {
  return {
    product_name: title,
    price: Object.hasOwn(extra, "price") ? extra.price : "R$ 879,90",
    link: extra.url ?? extra.link ?? `https://shop.test/${encodeURIComponent(title)}`,
    thumbnail: extra.image ?? "https://shop.test/img.jpg",
    source: "Google Shopping",
  };
}

function apifyShoppingProduct(title, extra = {}) {
  return {
    title,
    price: Object.hasOwn(extra, "price") ? extra.price : 879.9,
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

console.log(
  `\nPATCH Comercial 4E-B — Commercial Runtime Controlled Activation Audit (${COMMERCIAL_RUNTIME_ACTIVATION_VERSION})\n`
);

async function runAudit() {
console.log("── Runtime mode ──");
assert("mode version 4E-B", COMMERCIAL_RUNTIME_MODE_VERSION === "4E-B");
assert("activation version 4E-B.1", COMMERCIAL_RUNTIME_ACTIVATION_VERSION === "4E-B.1");
await withRuntimeEnv({ mode: null, shadowFlag: null }, async () => {
  assert("default mode legacy", getCommercialRuntimeMode() === COMMERCIAL_RUNTIME_MODES.LEGACY);
  assert("legacy helper", isCommercialRuntimeLegacy());
  assert("shadow disabled by default", !isCommercialRuntimeShadowEnabled());
});
await withRuntimeEnv({ mode: "shadow", shadowFlag: null }, async () => {
  assert("shadow mode detected", isCommercialRuntimeShadow());
  assert("shadow diagnostics enabled", isCommercialRuntimeShadowEnabled());
});
await withRuntimeEnv({ mode: "controlled", shadowFlag: null }, async () => {
  assert("controlled mode detected", isCommercialRuntimeControlled());
  assert("controlled does not auto-enable shadow diagnostics", !isCommercialRuntimeShadowEnabled());
});

console.log("\n── Legacy / shadow preserve legacy offer ──");
const legacyWinner = legacyProduct("Cadeira Gamer XYZ", { price: "R$ 899,00" });

await withRuntimeEnv({ mode: "legacy", shadowFlag: null }, async () => {
  const mocks = mockProviders({
    googleProducts: [googleShoppingProduct("Should Not Win")],
    apifyProducts: [apifyShoppingProduct("Should Not Win")],
  });
  const legacyResult = await resolveOfficialCommercialOffer({
    query: "cadeira gamer",
    legacyOffer: legacyWinner,
    winnerProduct: legacyWinner,
    mode: "legacy",
    ...mocks,
  });
  assert("legacy mode keeps legacy offer", !legacyResult.usedNewPipeline);
  assert("legacy mode official is legacy card", legacyResult.officialOffer?.link === legacyWinner.link);
});

await withRuntimeEnv({ mode: "shadow", shadowFlag: null }, async () => {
  const mocks = mockProviders({
    googleProducts: [googleShoppingProduct("Shadow Only Offer")],
    apifyProducts: [apifyShoppingProduct("Shadow Only Offer")],
  });
  const shadowResult = await resolveOfficialCommercialOffer({
    query: "cadeira gamer",
    legacyOffer: legacyWinner,
    winnerProduct: legacyWinner,
    mode: "shadow",
    ...mocks,
  });
  assert("shadow mode keeps legacy official", !shadowResult.usedNewPipeline);
  assert("shadow mode no pipeline mutation", shadowResult.officialOffer?.product_name === "Cadeira Gamer XYZ");
});

console.log("\n── Controlled activation ──");
const controlledTitle = "Cadeira Gamer Premium";
const controlledOffer = pipelineOffer(controlledTitle, {
  price: 879.9,
  url: "https://mercadolivre.test/cadeira-premium",
});
const controlledMocks = mockProviders({
  googleProducts: [googleShoppingProduct(controlledTitle, { url: "https://mercadolivre.test/cadeira-premium" })],
  apifyProducts: [apifyShoppingProduct(controlledTitle, { url: "https://mercadolivre.test/cadeira-premium" })],
});

await withRuntimeEnv({ mode: "controlled", shadowFlag: null }, async () => {
  const okResult = await resolveOfficialCommercialOffer({
    query: "cadeira gamer",
    legacyOffer: legacyWinner,
    winnerProduct: legacyWinner,
    mode: "controlled",
    ...controlledMocks,
  });
  assert("controlled uses new pipeline when valid", okResult.usedNewPipeline === true);
  assert("controlled official link from pipeline", okResult.officialOffer?.link.includes("mercadolivre.test"));
  assert("controlled preserves winner product_name", okResult.officialOffer?.product_name === "Cadeira Gamer XYZ");
  assert("controlled no fallback on success", okResult.fallbackToLegacy === false);

  const emptyResult = await resolveOfficialCommercialOffer({
    query: "cadeira gamer",
    legacyOffer: legacyWinner,
    winnerProduct: legacyWinner,
    mode: "controlled",
    ...mockProviders({ googleProducts: [], apifyProducts: [] }),
  });
  assert("controlled falls back on empty selection", emptyResult.fallbackToLegacy === true);
  assert("controlled fallback reason empty_selection", emptyResult.fallbackReason === "empty_selection");
  assert("controlled fallback keeps legacy link", emptyResult.officialOffer?.link === legacyWinner.link);

  const noUrlResult = await resolveOfficialCommercialOffer({
    query: "cadeira gamer",
    legacyOffer: legacyWinner,
    winnerProduct: legacyWinner,
    mode: "controlled",
    ...mockProviders({
      googleProducts: [googleShoppingProduct("Sem URL", { url: "" })],
      apifyProducts: [apifyShoppingProduct("Sem URL", { url: "" })],
    }),
  });
  assert("controlled falls back when URL missing", noUrlResult.fallbackToLegacy === true);
  assert(
    "controlled invalid url reason",
    noUrlResult.fallbackReason === "missing_url" ||
      noUrlResult.fallbackReason === "empty_selection"
  );

  const noPriceResult = await resolveOfficialCommercialOffer({
    query: "cadeira gamer",
    legacyOffer: legacyWinner,
    winnerProduct: legacyWinner,
    mode: "controlled",
    ...mockProviders({
      googleProducts: [googleShoppingProduct("Sem preço", { price: null })],
      apifyProducts: [apifyShoppingProduct("Sem preço", { price: null })],
    }),
  });
  assert("controlled falls back when price missing", noPriceResult.fallbackToLegacy === true);
  assert(
    "controlled invalid price reason",
    noPriceResult.fallbackReason === "missing_price" ||
      noPriceResult.fallbackReason === "empty_selection"
  );

  const misalignedResult = await resolveOfficialCommercialOffer({
    query: "iphone 13",
    legacyOffer: legacyProduct("iPhone 13"),
    winnerProduct: legacyProduct("iPhone 13"),
    mode: "controlled",
    ...mockProviders({
      googleProducts: [googleShoppingProduct("Película iPhone 13", { url: "https://mercadolivre.test/pelicula" })],
      apifyProducts: [apifyShoppingProduct("Película iPhone 13", { url: "https://mercadolivre.test/pelicula" })],
    }),
  });
  assert("controlled falls back on misaligned offer", misalignedResult.fallbackToLegacy === true);
  assert("controlled misaligned reason", misalignedResult.fallbackReason === "misaligned_offer");
});

console.log("\n── Card shape compatibility ──");
const mapped = mapSelectedOfferToLegacyCardShape(
  controlledOffer,
  legacyProduct("Cadeira Gamer XYZ")
);
assert("card has product_name", !!mapped?.product_name);
assert("card has price", mapped?.price != null);
assert("card has numericPrice", mapped?.numericPrice > 0);
assert("card has link", !!mapped?.link);
assert("card has thumbnail optional", mapped?.thumbnail != null);
assert("card has source", !!mapped?.source);
assert("card has provider", !!mapped?.provider);

const legacyCard = mapLegacyProductToCardShape(legacyWinner);
assert("legacy card shape complete", legacyCard?.product_name && legacyCard?.link && legacyCard?.price);

console.log("\n── Apply to prices preserves card actions fields ──");
await withRuntimeEnv({ mode: "controlled", shadowFlag: null }, async () => {
  const basePrices = [
    {
      product_name: "Cadeira Gamer XYZ",
      price: "R$ 899,00",
      link: "https://legacy.test/cadeira",
      thumbnail: "https://legacy.test/img.jpg",
      source: "Google Shopping",
    },
  ];

  const applied = await resolveAndApplyCommercialRuntimeActivation({
    query: "cadeira gamer",
    prices: basePrices,
    winnerProduct: legacyWinner,
    mode: "controlled",
    ...controlledMocks,
  });

  assert("prices array preserved length", applied.prices.length === 1);
  assert("Ver oferta link preserved", !!applied.prices[0]?.link);
  assert("price preserved for monitorar", applied.prices[0]?.price != null);
  assert("product_name preserved for favoritos", applied.prices[0]?.product_name === "Cadeira Gamer XYZ");
  assert("thumbnail preserved", !!applied.prices[0]?.thumbnail);
});

console.log("\n── Diagnostics / tracer payload ──");
const diagnostics = buildCommercialRuntimeActivationDiagnostics({
  mode: "controlled",
  usedNewPipeline: true,
  fallbackToLegacy: false,
  legacyOffer: legacyWinner,
  newPipelineOffer: controlledOffer,
  officialProvider: COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE,
});
assert("diagnostics mode", diagnostics.mode === "controlled");
assert("diagnostics usedNewPipeline", diagnostics.usedNewPipeline === true);
assert("diagnostics has legacyOffer", !!diagnostics.legacyOffer);
assert("diagnostics has shadowOffer", !!diagnostics.shadowOffer);
assert("diagnostics no token leak", !JSON.stringify(diagnostics).match(/token|secret|apikey/i));

console.log("\n── Architecture preservation ──");
const UNTOUCHED = [
  "lib/miaCognitiveRouter.js",
  "lib/miaRoutingDecisionContract.js",
  "lib/miaProductExplanationBuilder.js",
  "lib/miaSpecificProductResolutionLock.js",
  "lib/productSourceAdapter/commercialSelectionEngine.js",
  "components/MIACommercialTransparencyNotice.jsx",
  "lib/commercial/accessoryIntentLockGuard.js",
];
for (const file of UNTOUCHED) {
  const content = readFileSync(join(ROOT, file), "utf8");
  assert(`${file} not modified for activation logic`, !content.includes("resolveOfficialCommercialOffer"));
}

const chatSource = readFileSync(join(ROOT, "pages/api/chat-gpt4o.js"), "utf8");
assert("chat wires activation helper", chatSource.includes("applyCommercialRuntimeActivationToResponsePrices"));
assert("chat patches commercial_runtime_activation", chatSource.includes("commercial_runtime_activation"));
assert("chat skips duplicate shadow in controlled", chatSource.includes("!isCommercialRuntimeControlled()"));
assert("chat does not mutate selectedBestProduct in activation helper", !chatSource.includes("selectedBestProduct = activation"));

const endpointSource = readFileSync(
  join(ROOT, "pages/api/dev/commercial-runtime-activation.js"),
  "utf8"
);
assert("dev endpoint exists", endpointSource.includes("resolveOfficialCommercialOffer"));

console.log(`\nPassed: ${passed} Failed: ${failed}`);
console.log(failed === 0 ? "\nVeredito: A) ROBUST\n" : "\nVeredito: C) FAILED\n");
process.exit(failed > 0 ? 1 : 0);
}

runAudit().catch((err) => {
  console.error(err);
  process.exit(1);
});
