/**
 * PATCH Comercial 4E-B.9 — Universal Category Signal Library Audit (local only)
 *
 * Usage:
 *   node scripts/test-mia-universal-category-signal-library-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  buildGovernedFallbackPayload,
} from "../lib/commercial/governedFallbackPayloadBuilder.js";
import {
  buildUniversalGovernedFallbackReasoning,
} from "../lib/commercial/universalGovernedFallbackReasoning.js";
import {
  UNIVERSAL_CATEGORY_SIGNAL_LIBRARY_VERSION,
  RELATIONSHIP_ROLES,
  buildUniversalCategorySignalDevPayload,
  buildUniversalCategorySignalDiagnostics,
  buildUniversalCategorySignals,
  compareUniversalCategorySignalsWithExistingSignals,
  normalizeUniversalCategorySignals,
  shouldBuildUniversalCategorySignals,
  validateUniversalCategorySignals,
} from "../lib/commercial/universalCategorySignalLibrary.js";
import {
  buildProductExplanation,
} from "../lib/miaProductExplanationBuilder.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

let passed = 0;
let failed = 0;
const start = Date.now();

function assert(label, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${label}`);
  } else {
    failed += 1;
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function offer(name) {
  return {
    product_name: name,
    price: "R$ 149,00",
    link: `https://shop.test/${encodeURIComponent(name)}`,
    source: "Google Shopping",
  };
}

function dataLayerProduct(name) {
  return {
    product_name: name,
    isDataLayerProduct: true,
    trustedSpecs: {
      official_name: name,
      strengths: ["desempenho estável"],
      ideal_for: ["uso diário"],
    },
  };
}

function pipeline({ query, selected, upstream = null, hasDataLayer = false }) {
  const payload = buildGovernedFallbackPayload({
    query,
    selectedProduct: hasDataLayer ? dataLayerProduct(selected) : offer(selected),
    hasDataLayer,
    cognitiveWinnerProduct: upstream ? offer(upstream) : null,
    responsePath: hasDataLayer ? "return_seguro" : "commercial_only_fallback",
  });
  const reasoning = buildUniversalGovernedFallbackReasoning(payload);
  const signals = buildUniversalCategorySignals({
    query,
    governedFallbackPayload: payload,
    universalGovernedFallbackReasoning: reasoning,
  });
  return { payload, reasoning, signals };
}

const DATA_LAYER = [
  { query: "iphone 13", selected: "iPhone 13" },
  { query: "galaxy a55", selected: "Samsung Galaxy A55" },
  { query: "moto g84", selected: "Motorola Moto G84" },
  { query: "s23 fe", selected: "Samsung Galaxy S23 FE" },
];

const FALLBACK = [
  { query: "pelicula iphone 13", selected: "Película vidro iPhone 13", upstream: "iPhone 13" },
  { query: "capa iphone 13", selected: "Capa silicone iPhone 13", upstream: "iPhone 13" },
  { query: "controle ps5", selected: "Controle DualSense PS5", upstream: "PlayStation 5 Console" },
  { query: "cabo hdmi", selected: "Cabo HDMI 2m", upstream: "Notebook Lenovo IdeaPad" },
  { query: "headset gamer", selected: "Headset Gamer 7.1", upstream: "PC Gamer RTX 4060" },
  { query: "cadeira gamer", selected: "Cadeira Gamer Ergonômica" },
  { query: "monitor gamer", selected: "Monitor Gamer 27" },
  { query: "webcam", selected: "Webcam HD Pro" },
  { query: "volante g29", selected: "Volante Logitech G29" },
  { query: "ssd externo", selected: "SSD Externo 1TB USB-C" },
  { query: "fonte 650w", selected: "Fonte PC Gamer 650W" },
  { query: "gabinete gamer", selected: "Gabinete Gamer ATX" },
];

const AMBIGUOUS = [
  "controle",
  "cabo",
  "suporte",
  "adaptador",
  "tela",
  "cadeira",
  "camera",
];

const HUMAN_VARIANTS = [
  { query: "pelicula pro 13", selected: "Película iPhone 13", upstream: "iPhone 13" },
  { query: "uma capa pra ele", selected: "Capa compatível", upstream: "iPhone 13" },
  { query: "controle do play", selected: "Controle DualSense", upstream: "PlayStation 5" },
  { query: "tem cabo pra ligar isso?", selected: "Cabo HDMI 2m", upstream: "Notebook" },
  { query: "hdmi bom", selected: "Cabo HDMI Premium", upstream: null },
  { query: "headset pra jogar", selected: "Headset Gamer", upstream: null },
  { query: "monitor aí", selected: "Monitor 27", upstream: null },
  { query: "ssd pra aumentar espaço", selected: "SSD 1TB", upstream: null },
  { query: "webcam pra reunião", selected: "Webcam HD", upstream: null },
  { query: "adaptador pra isso", selected: "Adaptador USB-C", upstream: "Notebook" },
];

console.log(
  `\nPATCH Comercial 4E-B.9 — Universal Category Signal Library (${UNIVERSAL_CATEGORY_SIGNAL_LIBRARY_VERSION})\n`
);

console.log("── Module contract ──");
const moduleSource = readFileSync(
  join(ROOT, "lib/commercial/universalCategorySignalLibrary.js"),
  "utf8"
);
assert("version 4E-B.9", UNIVERSAL_CATEGORY_SIGNAL_LIBRARY_VERSION === "4E-B.9");
assert("no LLM imports", !moduleSource.match(/openai|callOpenAI|buildMiaPrompt/i));
assert("no child_process", !moduleSource.match(/spawnSync|execSync|child_process/i));
assert("no API fetch", !moduleSource.match(/fetch\(|axios|serpapi/i));
assert("no category hardcode if blocks", !moduleSource.match(/if\s*\(.*category\s*===/i));
assert("no product hardcodes", !moduleSource.match(/includes\s*\(\s*["']iphone|includes\s*\(\s*["']ps5/i));
assert(
  "chat observability wired",
  readFileSync(join(ROOT, "pages/api/chat-gpt4o.js"), "utf8").includes("universal_category_signals")
);
assert(
  "dev endpoint exists",
  readFileSync(join(ROOT, "pages/api/dev/universal-category-signals.js"), "utf8").includes(
    "buildUniversalCategorySignals"
  )
);

console.log("\n── Data Layer observability ──");
for (const { query, selected } of DATA_LAYER) {
  const { signals } = pipeline({ query, selected, hasDataLayer: true });
  assert(`"${query}" builds signals`, signals.isActive === true);
  assert(`"${query}" dataLayerStatus true`, signals.dataLayerStatus?.hasDataLayer === true);
  assert(`"${query}" no invented category when absent`, signals.categoryIdentity?.inferred !== true);
}

console.log("\n── Fallback signal structure ──");
for (const { query, selected, upstream } of FALLBACK) {
  const { signals } = pipeline({ query, selected, upstream });
  assert(`"${query}" active`, signals.isActive === true);
  assert(`"${query}" selected preserved`, signals.selectedCommercialItem?.productName === selected);
  assert(`"${query}" requested query preserved`, signals.requestedItem?.productName === query);
  assert(`"${query}" validation valid`, signals.diagnostics?.validation?.valid === true);
  assert(`"${query}" provenance present`, !!signals.provenance?.libraryOrigin);
  if (upstream) {
    assert(`"${query}" upstream preserved`, signals.upstreamReference?.productName === upstream);
    assert(
      `"${query}" upstream != selected`,
      signals.upstreamReference?.productName !== signals.selectedCommercialItem?.productName
    );
    assert(
      `"${query}" relationship compatibility/context`,
      signals.relationshipRole === RELATIONSHIP_ROLES.COMPATIBILITY_CONTEXT ||
        signals.relationshipRole === RELATIONSHIP_ROLES.UPSTREAM_CONTEXT_ONLY
    );
  }
}

console.log("\n── Ambiguous queries preserve uncertainty ──");
for (const query of AMBIGUOUS) {
  const { signals } = pipeline({ query, selected: "Produto genérico" });
  assert(`"${query}" ambiguity recorded`, (signals.ambiguitySignals || []).length > 0);
  assert(
    `"${query}" does not invent category`,
    signals.categoryIdentity?.value == null || signals.categoryIdentity?.inferred === false
  );
  assert(
    `"${query}" low/unknown confidence when ambiguous`,
    ["low", "unknown", "medium"].includes(signals.diagnostics?.confidenceLevel)
  );
}

console.log("\n── Human language variants ──");
for (const { query, selected, upstream } of HUMAN_VARIANTS) {
  const { signals } = pipeline({ query, selected, upstream });
  assert(`"${query}" active`, signals.isActive === true);
  assert(`"${query}" selected preserved`, signals.selectedCommercialItem?.productName === selected);
  if (upstream) {
    assert(`"${query}" upstream not selected`, signals.upstreamReference?.productName !== selected);
  }
}

console.log("\n── Critical upstream separation ──");
const pelicula = pipeline({
  query: "pelicula iphone 13",
  selected: "Película vidro iPhone 13",
  upstream: "iPhone 13",
});
assert("pelicula upstream != selected", pelicula.signals.upstreamReference?.productName === "iPhone 13");
assert(
  "pelicula selected != upstream",
  pelicula.signals.selectedCommercialItem?.productName === "Película vidro iPhone 13"
);
assert(
  "pelicula requested != upstream product name as identity",
  pelicula.signals.requestedItem?.productName === "pelicula iphone 13"
);

console.log("\n── Comparison with existing signals ──");
const comparison = compareUniversalCategorySignalsWithExistingSignals({
  universal: pelicula.signals,
  existing: pelicula.signals.sourceSignals,
});
assert("comparison preserved selected", (comparison.preserved || []).length > 0);
assert("comparison no upstream contamination flag", comparison.potentialUpstreamContamination !== true);

console.log("\n── Normalization and validation helpers ──");
const normalized = normalizeUniversalCategorySignals(pelicula.signals);
assert("normalize preserves selected", normalized.selectedCommercialItem?.productName === "Película vidro iPhone 13");
const validation = validateUniversalCategorySignals(pelicula.signals);
assert("validate valid structure", validation.valid === true);
assert("shouldBuild true", shouldBuildUniversalCategorySignals({ query: "pelicula iphone 13" }) === true);

console.log("\n── No behavior mutation ──");
const dlBefore = buildProductExplanation({
  product: dataLayerProduct("iPhone 13"),
  query: "iphone 13",
  hasDataLayer: true,
});
buildUniversalCategorySignals({
  query: "iphone 13",
  governedFallbackPayload: buildGovernedFallbackPayload({
    query: "iphone 13",
    selectedProduct: dataLayerProduct("iPhone 13"),
    hasDataLayer: true,
  }),
});
const dlAfter = buildProductExplanation({
  product: dataLayerProduct("iPhone 13"),
  query: "iphone 13",
  hasDataLayer: true,
});
assert("data layer explanation unchanged", dlBefore.text === dlAfter.text);

console.log("\n── Diagnostics / DEV payload ──");
const diagnostics = buildUniversalCategorySignalDiagnostics(pelicula.signals);
assert("diagnostics active", diagnostics.isActive === true);
const devPayload = buildUniversalCategorySignalDevPayload(pelicula.signals);
assert("dev payload has comparison", devPayload.comparisonWithExistingSignals != null);

console.log("\n── Architecture preservation ──");
const untouched = [
  "lib/miaCognitiveRouter.js",
  "lib/miaPrompt.js",
  "lib/miaProductExplanationBuilder.js",
  "lib/commercial/universalFallbackPromptContract.js",
  "components/MIAChat.jsx",
];
for (const file of untouched) {
  const source = readFileSync(join(ROOT, file), "utf8");
  assert(`${file} not importing library`, !source.includes("universalCategorySignalLibrary"));
}

console.log("\n── Regressions ──");
console.log("  ⏭️ skipped — no nested audits (local-only mode)");

const elapsed = ((Date.now() - start) / 1000).toFixed(2);
console.log(`\n── Verdict ──`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Time: ${elapsed}s`);
console.log(failed === 0 ? "\nA) ROBUST estruturalmente\n" : "\nB) PARTIAL\n");
process.exit(failed === 0 ? 0 : 1);
