/**
 * PATCH Comercial 4E-B.6 — Accessory Cognitive Winner Propagation Guard Audit
 *
 * Usage:
 *   node scripts/test-mia-accessory-cognitive-winner-propagation-guard-audit.js
 */

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  ACCESSORY_COGNITIVE_WINNER_PROPAGATION_GUARD_VERSION,
  buildAccessoryPropagationNeutralFallbackReply,
  buildAccessoryWinnerPropagationDiagnostics,
  buildAccessoryWinnerPropagationDecision,
  sanitizeAccessoryCommercialPayload,
  shouldBlockAccessoryWinnerPropagation,
} from "../lib/commercial/accessoryCognitiveWinnerPropagationGuard.js";
import {
  auditAccessoryQueryRuntimePath,
  summarizeAccessoryQueryRuntimePathAudits,
} from "../lib/commercial/accessoryQueryRuntimePathAudit.js";
import { detectAccessoryIntent } from "../lib/commercial/accessoryIntentLockGuard.js";
import { isOfferCompatibleWithAccessoryIntent } from "../lib/productSourceAdapter/accessoryCommercialRuntimeEnforcement.js";
import {
  resolveAndApplyCommercialRuntimeActivation,
} from "../lib/productSourceAdapter/commercialRuntimeActivation.js";
import { COMMERCIAL_PROVIDER_IDS } from "../lib/productSourceAdapter/commercialProviderRegistry.js";

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

function runRegression(script, label) {
  const result = spawnSync(process.execPath, [join(ROOT, "scripts", script)], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  assert(`regression ${label}`, result.status === 0);
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
    price: extra.price ?? 49.9,
    url: extra.url ?? `https://mercadolivre.test/${encodeURIComponent(title)}`,
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

function cardIsSafeForAccessory(query, cardName = "") {
  const name = String(cardName || "").trim();
  if (!name) return true;
  return isOfferCompatibleWithAccessoryIntent({ query, offer: { title: name } });
}

const BLOCK_ACCESSORY_QUERIES = [
  { query: "pelicula iphone 13", main: "iPhone 13", compatible: "Película vidro iPhone 13" },
  { query: "capa iphone 13", main: "iPhone 13", compatible: "Capa silicone iPhone 13" },
  { query: "controle ps5", main: "PlayStation 5 Console", compatible: "Controle DualSense PS5" },
  { query: "cabo hdmi", main: "Notebook Lenovo IdeaPad", compatible: "Cabo HDMI 2m" },
  { query: "carregador notebook lenovo", main: "Notebook Lenovo IdeaPad", compatible: "Carregador notebook Lenovo 65W" },
  { query: "dock notebook", main: "Notebook Lenovo IdeaPad", compatible: "Dock station notebook USB-C" },
  { query: "suporte monitor", main: "Monitor Gamer 27", compatible: "Suporte articulado monitor" },
  { query: "headset gamer", main: "PC Gamer RTX 4060", compatible: "Headset Gamer 7.1" },
  { query: "mousepad gamer", main: "Mouse Gamer Pro", compatible: "Mousepad Gamer XL" },
];

const PRESERVE_MAIN_QUERIES = [
  { query: "iphone 13", main: "iPhone 13" },
  { query: "ps5", main: "PlayStation 5 Console" },
  { query: "notebook lenovo", main: "Notebook Lenovo IdeaPad" },
  { query: "monitor gamer", main: "Monitor Gamer 27" },
  { query: "tv samsung", main: "TV Samsung 55 4K" },
  { query: "cadeira gamer", main: "Cadeira Gamer Ergonômica" },
  { query: "galaxy a55", main: "Samsung Galaxy A55" },
];

console.log(
  `\nPATCH Comercial 4E-B.6 — Accessory Cognitive Winner Propagation Guard (${ACCESSORY_COGNITIVE_WINNER_PROPAGATION_GUARD_VERSION})\n`
);

console.log("── Module contract ──");
const moduleSource = readFileSync(
  join(ROOT, "lib/commercial/accessoryCognitiveWinnerPropagationGuard.js"),
  "utf8"
);
assert("version 4E-B.6", ACCESSORY_COGNITIVE_WINNER_PROPAGATION_GUARD_VERSION === "4E-B.6");
assert("uses detectAccessoryIntent", moduleSource.includes("detectAccessoryIntent"));
assert(
  "uses isOfferCompatibleWithAccessoryIntent",
  moduleSource.includes("isOfferCompatibleWithAccessoryIntent")
);
assert(
  "no decision engine imports",
  !moduleSource.match(/miaCognitiveRouter|decisionEngine|rankProducts/i)
);
assert(
  "chat integration wired",
  readFileSync(join(ROOT, "pages/api/chat-gpt4o.js"), "utf8").includes(
    "accessory_cognitive_winner_propagation"
  )
);

console.log("\n── shouldBlockAccessoryWinnerPropagation ──");
for (const { query, main } of BLOCK_ACCESSORY_QUERIES) {
  assert(
    `"${query}" blocks main "${main}"`,
    shouldBlockAccessoryWinnerPropagation({ query, winnerProduct: legacyProduct(main) })
  );
  assert(
    `"${query}" accessory intent`,
    detectAccessoryIntent(query).isAccessoryIntent === true
  );
}

for (const { query, main } of PRESERVE_MAIN_QUERIES) {
  assert(
    `"${query}" does not block main "${main}"`,
    shouldBlockAccessoryWinnerPropagation({ query, winnerProduct: legacyProduct(main) }) === false
  );
}

console.log("\n── sanitizeAccessoryCommercialPayload ──");
for (const { query, main, compatible } of BLOCK_ACCESSORY_QUERIES) {
  const contaminated = sanitizeAccessoryCommercialPayload({
    query,
    winnerProduct: legacyProduct(main),
    prices: [legacyProduct(main)],
    selectedOfferTitle: compatible,
    rankedCandidates: [legacyProduct(main), legacyProduct(compatible)],
    reply: `Eu iria no ${main} porque equilibra bem o que você pediu.`,
    responsePath: "commercial_only_fallback",
  });

  assert(`"${query}" propagation blocked`, contaminated.blocked === true);
  assert(
    `"${query}" winner internal preserved`,
    contaminated.winnerProductInternal?.product_name === main
  );
  assert(
    `"${query}" card uses compatible offer`,
    cardIsSafeForAccessory(query, contaminated.prices[0]?.product_name),
    contaminated.prices[0]?.product_name || "empty"
  );
  assert(
    `"${query}" runner-up filtered`,
    !contaminated.rankedCandidates.some((c) => c.product_name === main)
  );
  assert(
    `"${query}" reply does not verbalize main as winner`,
    !String(contaminated.reply || "")
      .toLowerCase()
      .includes(`eu iria no ${main.toLowerCase()}`) &&
      !String(contaminated.reply || "")
        .toLowerCase()
        .startsWith(`o ${main.toLowerCase()}`),
    contaminated.reply
  );

  const diagnostics = buildAccessoryWinnerPropagationDiagnostics(contaminated);
  assert(`"${query}" diagnostics blocked`, diagnostics.blocked === true);
  assert(`"${query}" diagnostics winnerBefore`, diagnostics.winnerBefore === main);
  assert(`"${query}" diagnostics winnerAfter null`, diagnostics.winnerAfter === null);
}

console.log("\n── main products preserved ──");
for (const { query, main } of PRESERVE_MAIN_QUERIES) {
  const preserved = sanitizeAccessoryCommercialPayload({
    query,
    winnerProduct: legacyProduct(main),
    prices: [legacyProduct(main)],
    rankedCandidates: [legacyProduct(main)],
    reply: `O ${main} continua sólido para essa busca.`,
    responsePath: "return_seguro",
  });
  assert(`"${query}" not blocked`, preserved.blocked === false);
  assert(
    `"${query}" card preserved`,
    preserved.prices[0]?.product_name === main,
    preserved.prices[0]?.product_name
  );
}

console.log("\n── controlled runtime + guard integration ──");
await withRuntimeEnv("controlled", async () => {
  for (const { query, main, compatible } of BLOCK_ACCESSORY_QUERIES.slice(0, 5)) {
    const legacy = legacyProduct(main);
    const applied = await resolveAndApplyCommercialRuntimeActivation({
      query,
      prices: [legacy],
      winnerProduct: legacy,
      mode: "controlled",
      ...mockProviders({
        googleProducts: [
          googleShoppingProduct(main),
          googleShoppingProduct(compatible),
        ],
        apifyProducts: [apifyShoppingProduct(main)],
      }),
    });

    const sanitized = sanitizeAccessoryCommercialPayload({
      query,
      winnerProduct: legacy,
      prices: applied.prices || [],
      selectedOfferTitle: applied.activation?.officialOffer?.product_name || compatible,
      rankedCandidates: [legacy, legacyProduct(compatible)],
    });

    assert(
      `"${query}" post-activation card safe`,
      cardIsSafeForAccessory(query, sanitized.prices[0]?.product_name),
      sanitized.prices[0]?.product_name || "empty"
    );
  }
});

console.log("\n── runtime path audit with propagation guard ──");
const accessoryReports = [];
for (const { query } of BLOCK_ACCESSORY_QUERIES) {
  const report = await auditAccessoryQueryRuntimePath({ query, mode: "controlled" });
  accessoryReports.push(report);
  assert(`"${query}" runtime path passes`, report.verdict?.passed === true, report.verdict?.failureReason);
  assert(`"${query}" propagationGuard blocked`, report.propagationGuard?.blocked === true);
  assert(
    `"${query}" card safe after guard`,
    cardIsSafeForAccessory(query, report.card?.productName),
    report.card?.productName
  );
}

const mainReports = [];
for (const { query } of PRESERVE_MAIN_QUERIES) {
  const report = await auditAccessoryQueryRuntimePath({ query, mode: "controlled" });
  mainReports.push(report);
  assert(`"${query}" main product path passes`, report.verdict?.passed === true);
  assert(`"${query}" propagation not blocked`, report.propagationGuard?.blocked !== true);
}

const accessorySummary = summarizeAccessoryQueryRuntimePathAudits(accessoryReports);
assert(
  "all accessory runtime paths pass",
  accessorySummary.failed === 0,
  `${accessorySummary.failed} failures`
);

console.log("\n── neutral fallback reply ──");
const neutral = buildAccessoryPropagationNeutralFallbackReply("pelicula iphone 13", null);
assert("neutral fallback avoids iphone 13", !neutral.toLowerCase().includes("iphone 13"));
const withOffer = buildAccessoryPropagationNeutralFallbackReply(
  "pelicula iphone 13",
  "Película vidro iPhone 13"
);
assert("fallback with offer mentions accessory", withOffer.includes("Película"));

console.log("\n── regressions ──");
runRegression("test-mia-accessory-commercial-runtime-enforcement-audit.js", "4E-B.1");
runRegression("test-mia-non-data-layer-card-trust-label-fix-audit.js", "4E-B.2");
runRegression("test-mia-non-data-layer-fallback-candidate-isolation-audit.js", "4E-B.3");
runRegression("test-mia-commercial-runtime-controlled-revalidation-audit.js", "4E-B.4");
runRegression("test-mia-api-handler-contract-compliance-audit.js", "4E-B.5");
runRegression("test-mia-accessory-query-runtime-path-audit.js", "4E-B.6-AUDIT");
runRegression("test-mia-tone-compliance-guard-audit.js", "Tone Compliance");

console.log(`\n── Verdict ──`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(failed === 0 ? "\nA) ROBUST\n" : "\nB) NEEDS WORK\n");
process.exit(failed === 0 ? 0 : 1);
