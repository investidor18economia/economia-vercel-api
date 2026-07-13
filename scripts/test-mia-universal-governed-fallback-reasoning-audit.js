/**
 * PATCH Comercial 4E-B.7 — Universal Governed Fallback Reasoning Audit
 *
 * Usage:
 *   node scripts/test-mia-universal-governed-fallback-reasoning-audit.js
 */

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  buildGovernedFallbackPayload,
} from "../lib/commercial/governedFallbackPayloadBuilder.js";
import {
  UNIVERSAL_GOVERNED_FALLBACK_REASONING_VERSION,
  UNIVERSAL_GOVERNED_FALLBACK_REASONING_TYPE,
  VERBALIZATION_FOCUS_TARGETS,
  buildUniversalGovernedFallbackReasoning,
  buildUniversalGovernedFallbackReasoningDevPayload,
  buildUniversalGovernedFallbackReasoningDiagnostics,
  shouldBuildUniversalGovernedFallbackReasoning,
} from "../lib/commercial/universalGovernedFallbackReasoning.js";
import {
  buildProductExplanation,
} from "../lib/miaProductExplanationBuilder.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

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

function runRegression(script, label) {
  const result = spawnSync(process.execPath, [join(ROOT, "scripts", script)], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  assert(`regression ${label}`, result.status === 0);
}

function offer(name, extra = {}) {
  return {
    product_name: name,
    price: extra.price ?? "R$ 149,00",
    link: extra.link ?? `https://shop.test/${encodeURIComponent(name)}`,
    thumbnail: extra.thumbnail ?? "https://shop.test/img.jpg",
    source: extra.source ?? "Google Shopping",
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

function buildCase({ query, selected, upstream = null, hasDataLayer = false }) {
  return buildGovernedFallbackPayload({
    query,
    selectedProduct: offer(selected),
    hasDataLayer,
    cognitiveWinnerProduct: upstream ? offer(upstream) : null,
    responsePath: "commercial_only_fallback",
  });
}

const NON_DATA_LAYER_CASES = [
  { query: "pelicula iphone 13", selected: "Película vidro iPhone 13", upstream: "iPhone 13" },
  { query: "capa iphone 13", selected: "Capa silicone iPhone 13", upstream: "iPhone 13" },
  { query: "controle ps5", selected: "Controle DualSense PS5", upstream: "PlayStation 5 Console" },
  { query: "cabo hdmi", selected: "Cabo HDMI 2m", upstream: "Notebook Lenovo IdeaPad" },
  { query: "headset gamer", selected: "Headset Gamer 7.1", upstream: "PC Gamer RTX 4060" },
  { query: "cadeira gamer", selected: "Cadeira Gamer Ergonômica", upstream: null },
  { query: "monitor gamer", selected: "Monitor Gamer 27", upstream: null },
  { query: "webcam logitech", selected: "Webcam HD Pro", upstream: null },
  { query: "volante g29", selected: "Volante Logitech G29", upstream: null },
  { query: "ssd externo", selected: "SSD Externo 1TB USB-C", upstream: null },
  { query: "fone bluetooth", selected: "Fone Bluetooth Redmi Buds 6 Play", upstream: null },
];

const DATA_LAYER_CASES = [
  { query: "iphone 13", selected: "iPhone 13" },
  { query: "galaxy a55", selected: "Samsung Galaxy A55" },
];

const UNTOUCHED_BEHAVIOR_FILES = [
  "lib/miaCognitiveRouter.js",
  "lib/miaRoutingDecisionContract.js",
  "lib/miaSpecificProductResolutionLock.js",
  "lib/productSourceAdapter/commercialRuntimeActivation.js",
  "lib/miaProductExplanationBuilder.js",
  "lib/miaPrompt.js",
  "components/MIAChat.jsx",
  "lib/commercial/governedFallbackPayloadBuilder.js",
];

const FORBIDDEN_INVENTION_PATTERNS = [
  /\bmais confort[aá]vel\b/i,
  /\bprotege melhor\b/i,
  /\bsom superior\b/i,
  /\bmais dur[aá]vel\b/i,
  /\bmelhor imagem\b/i,
  /\bmais r[aá]pido\b/i,
  /\bnota\s+\d/i,
  /\bbenchmark\b/i,
];

console.log(
  `\nPATCH Comercial 4E-B.7 — Universal Governed Fallback Reasoning (${UNIVERSAL_GOVERNED_FALLBACK_REASONING_VERSION})\n`
);

console.log("── Module contract ──");
const moduleSource = readFileSync(
  join(ROOT, "lib/commercial/universalGovernedFallbackReasoning.js"),
  "utf8"
);
assert("version 4E-B.7", UNIVERSAL_GOVERNED_FALLBACK_REASONING_VERSION === "4E-B.7");
assert("reasoning type universal_governed_fallback", UNIVERSAL_GOVERNED_FALLBACK_REASONING_TYPE === "universal_governed_fallback");
assert("no LLM imports", !moduleSource.match(/openai|callOpenAI|buildMiaPrompt/i));
assert("no prompt imports", !moduleSource.includes("miaPrompt"));
assert("consumes governed payload only", moduleSource.includes("governedFallbackPayload"));
assert("no category hardcode branches", !moduleSource.match(/if\s*\(.*category\s*===/i));
assert("no product hardcodes", !moduleSource.match(/includes\s*\(\s*["']iphone|includes\s*\(\s*["']ps5/i));
assert(
  "dev endpoint exists",
  readFileSync(join(ROOT, "pages/api/dev/universal-governed-fallback-reasoning.js"), "utf8").includes(
    "buildUniversalGovernedFallbackReasoning"
  )
);
assert(
  "chat wired observability-only",
  readFileSync(join(ROOT, "pages/api/chat-gpt4o.js"), "utf8").includes(
    "universal_governed_fallback_reasoning"
  )
);

console.log("\n── Activation rules ──");
for (const { query, selected } of DATA_LAYER_CASES) {
  const payload = buildGovernedFallbackPayload({
    query,
    selectedProduct: dataLayerProduct(selected),
    hasDataLayer: true,
  });
  assert(
    `"${query}" data layer skips reasoning`,
    shouldBuildUniversalGovernedFallbackReasoning(payload) === false
  );
  const reasoning = buildUniversalGovernedFallbackReasoning(payload);
  assert(`"${query}" reasoning skipped`, reasoning.shouldUseFallbackReasoning === false);
}

for (const { query, selected } of NON_DATA_LAYER_CASES.slice(0, 3)) {
  const payload = buildCase({ query, selected });
  assert(
    `"${query}" non-data-layer activates reasoning`,
    shouldBuildUniversalGovernedFallbackReasoning(payload) === true
  );
}

console.log("\n── Safe fallback reasoning (non-data-layer) ──");
for (const { query, selected, upstream } of NON_DATA_LAYER_CASES) {
  const payload = buildCase({ query, selected, upstream });
  const reasoning = buildUniversalGovernedFallbackReasoning(payload);

  assert(`"${query}" uses fallback reasoning`, reasoning.shouldUseFallbackReasoning === true);
  assert(`"${query}" selected item preserved`, reasoning.selectedCommercialItem?.productName === selected);
  assert(
    `"${query}" verbalization focus selected item`,
    reasoning.verbalizationFocus?.target === VERBALIZATION_FOCUS_TARGETS.SELECTED_COMMERCIAL_ITEM &&
      reasoning.verbalizationFocus?.productName === selected,
    reasoning.verbalizationFocus?.productName
  );
  assert(`"${query}" transparency required`, reasoning.transparencyRequirement?.required === true);
  assert(`"${query}" limited confidence`, reasoning.confidenceBoundary?.level === "limited");
  assert(
    `"${query}" avoids invented specs flag`,
    reasoning.confidenceBoundary?.mustAvoidInventedSpecs === true
  );
  assert(
    `"${query}" avoids invented tradeoffs flag`,
    reasoning.confidenceBoundary?.mustAvoidInventedTradeoffs === true
  );
  assert(
    `"${query}" has unsafe boundaries`,
    (reasoning.unsafeReasoningBoundaries || []).length >= 8
  );

  if (upstream) {
    assert(
      `"${query}" upstream recorded`,
      reasoning.upstreamReference?.productName === upstream
    );
    assert(
      `"${query}" upstream not verbalization focus`,
      reasoning.verbalizationFocus?.productName !== upstream &&
        reasoning.verbalizationFocus?.forbiddenFocusProductName === upstream,
      reasoning.verbalizationFocus?.productName
    );
    assert(
      `"${query}" upstream not winner role`,
      reasoning.upstreamReference?.governanceRoles?.includes("not_winner_fallback") === true
    );
  }

  const serialized = JSON.stringify(reasoning);
  for (const pattern of FORBIDDEN_INVENTION_PATTERNS) {
    assert(`"${query}" no invented claim "${pattern}"`, !pattern.test(serialized));
  }
}

console.log("\n── Critical accessory focus ──");
const accessoryReasoning = buildUniversalGovernedFallbackReasoning(
  buildCase({
    query: "pelicula iphone 13",
    selected: "Película vidro iPhone 13",
    upstream: "iPhone 13",
  })
);
assert(
  "pelicula focus is selected accessory",
  accessoryReasoning.verbalizationFocus?.productName === "Película vidro iPhone 13"
);
assert(
  "pelicula upstream is not focus",
  accessoryReasoning.verbalizationFocus?.forbiddenFocusProductName === "iPhone 13"
);
assert(
  "pelicula safe signal verbalize selected not upstream",
  accessoryReasoning.safeReasoningSignals?.some((signal) => signal.id === "verbalize_selected_not_upstream")
);

console.log("\n── No behavior mutation ──");
const explanationBefore = buildProductExplanation({
  product: offer("Fone Bluetooth Redmi Buds 6 Play"),
  hasDataLayer: false,
});
buildUniversalGovernedFallbackReasoning(
  buildCase({ query: "fone bluetooth", selected: "Fone Bluetooth Redmi Buds 6 Play" })
);
const explanationAfter = buildProductExplanation({
  product: offer("Fone Bluetooth Redmi Buds 6 Play"),
  hasDataLayer: false,
});
assert(
  "product explanation unchanged",
  explanationBefore.text === explanationAfter.text
);

console.log("\n── Diagnostics / DEV payload ──");
const sample = buildUniversalGovernedFallbackReasoning(
  buildCase({
    query: "controle ps5",
    selected: "Controle DualSense PS5",
    upstream: "PlayStation 5 Console",
  })
);
const diagnostics = buildUniversalGovernedFallbackReasoningDiagnostics(sample);
assert("diagnostics enabled", diagnostics.shouldUseFallbackReasoning === true);
assert("diagnostics focus selected", diagnostics.verbalizationFocusProductName === "Controle DualSense PS5");
const devPayload = buildUniversalGovernedFallbackReasoningDevPayload(sample);
assert("dev payload includes reasoning fields", devPayload.verbalizationFocus?.productName === "Controle DualSense PS5");

console.log("\n── Architecture preservation ──");
for (const relativePath of UNTOUCHED_BEHAVIOR_FILES) {
  const source = readFileSync(join(ROOT, relativePath), "utf8");
  assert(
    `${relativePath} not importing reasoning module`,
    !source.includes("universalGovernedFallbackReasoning")
  );
}

console.log("\n── Regressions ──");
runRegression("test-mia-governed-fallback-payload-builder-audit.js", "4E-B.6 Payload Builder");
runRegression("test-mia-governed-fallback-intelligence-layer-audit.js", "3C-C Governed Fallback Intelligence");
runRegression("test-mia-non-data-layer-commercial-response-guard-audit.js", "4E-A.3 Non-DL Response Guard");
runRegression("test-mia-api-handler-contract-compliance-audit.js", "4E-B.5 API Handler");
runRegression("test-mia-tone-compliance-guard-audit.js", "Tone Compliance");

console.log(`\n── Verdict ──`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(failed === 0 ? "\nA) ROBUST\n" : "\nB) NEEDS WORK\n");
process.exit(failed === 0 ? 0 : 1);
