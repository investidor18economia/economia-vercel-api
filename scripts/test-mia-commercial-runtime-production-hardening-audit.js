/**
 * PATCH Comercial 4E-C — Commercial Runtime Production Hardening Audit (local only)
 *
 * Usage:
 *   node scripts/test-mia-commercial-runtime-production-hardening-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  GOVERNED_FALLBACK_PAYLOAD_BUILDER_VERSION,
  buildGovernedFallbackPayload,
} from "../lib/commercial/governedFallbackPayloadBuilder.js";
import {
  UNIVERSAL_GOVERNED_FALLBACK_REASONING_VERSION,
  buildUniversalGovernedFallbackReasoning,
} from "../lib/commercial/universalGovernedFallbackReasoning.js";
import {
  UNIVERSAL_CATEGORY_SIGNAL_LIBRARY_VERSION,
  buildUniversalCategorySignals,
} from "../lib/commercial/universalCategorySignalLibrary.js";
import {
  UNIVERSAL_FALLBACK_PROMPT_CONTRACT_VERSION,
  buildUniversalFallbackPromptContract,
  resolveUniversalFallbackPromptContractVerbalization,
  verbalizeUniversalFallbackPromptContract,
} from "../lib/commercial/universalFallbackPromptContract.js";
import {
  COMMERCIAL_FALLBACK_PIPELINE_LAYERS,
  COMMERCIAL_FALLBACK_PIPELINE_VERSION,
  buildCommercialFallbackPipelineDevPayload,
  buildCommercialFallbackPipelineDiagnostics,
  buildCommercialFallbackPipelineObservabilityPatch,
  validateCommercialFallbackPipelineLayers,
} from "../lib/commercial/commercialFallbackProductionPipeline.js";
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

function read(path) {
  return readFileSync(join(ROOT, path), "utf8");
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

function runPipeline({ query, selected, upstream = null, hasDataLayer = false }) {
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
  const contract = buildUniversalFallbackPromptContract({
    query,
    governedFallbackPayload: payload,
    universalGovernedFallbackReasoning: reasoning,
  });
  const validation = validateCommercialFallbackPipelineLayers({
    payload,
    reasoning,
    signals,
    contract,
  });
  return { payload, reasoning, signals, contract, validation };
}

const HUMAN_QUERIES = [
  { query: "pelicula iphone", selected: "Película iPhone 13", upstream: "iPhone 13" },
  { query: "controle play", selected: "Controle DualSense", upstream: "PlayStation 5" },
  { query: "ssd", selected: "SSD 1TB NVMe" },
  { query: "cadeira gamer", selected: "Cadeira Gamer Ergonômica" },
  { query: "monitor", selected: "Monitor 27" },
  { query: "webcam", selected: "Webcam HD" },
  { query: "gabinete", selected: "Gabinete ATX" },
  { query: "fonte", selected: "Fonte 650W" },
  { query: "adaptador", selected: "Adaptador USB-C" },
  { query: "mouse", selected: "Mouse Gamer" },
  { query: "teclado", selected: "Teclado Mecânico" },
];

console.log(
  `\nPATCH Comercial 4E-C — Commercial Runtime Production Hardening (${COMMERCIAL_FALLBACK_PIPELINE_VERSION})\n`
);

console.log("── Pipeline manifest ──");
assert("pipeline version 4E-C", COMMERCIAL_FALLBACK_PIPELINE_VERSION === "4E-C");
assert("five canonical layers", COMMERCIAL_FALLBACK_PIPELINE_LAYERS.length === 5);
assert(
  "layer order preserved",
  COMMERCIAL_FALLBACK_PIPELINE_LAYERS.map((layer) => layer.id).join(",") ===
    [
      "commercial_runtime",
      "governed_fallback_payload_builder",
      "universal_governed_fallback_reasoning",
      "universal_category_signal_library",
      "universal_fallback_prompt_contract",
    ].join(",")
);

console.log("\n── Module boundaries (static) ──");
const moduleChecks = [
  ["governedFallbackPayloadBuilder.js", /export function buildGovernedFallbackPayload/],
  ["universalGovernedFallbackReasoning.js", /export function buildUniversalGovernedFallbackReasoning/],
  ["universalCategorySignalLibrary.js", /export function buildUniversalCategorySignals/],
  ["universalFallbackPromptContract.js", /export function buildUniversalFallbackPromptContract/],
  ["commercialFallbackProductionPipeline.js", /export function validateCommercialFallbackPipelineLayers/],
];

for (const [file, pattern] of moduleChecks) {
  const source = read(`lib/commercial/${file}`);
  assert(`${file} exports core function`, pattern.test(source));
  assert(`${file} no LLM`, !source.match(/openai|callOpenAI|buildMiaPrompt/i));
  assert(`${file} no child_process`, !source.match(/spawnSync|execSync|child_process/i));
  assert(`${file} no external fetch`, !source.match(/fetch\(|axios|serpapi/i));
}

console.log("\n── Contract hardening ──");
const promptContractSource = read("lib/commercial/universalFallbackPromptContract.js");
assert(
  "accessory intent reads categorySignals",
  promptContractSource.includes("reasoning.categorySignals?.accessoryIntent")
);
assert(
  "orphan reasoning.commercialIntent removed",
  !promptContractSource.includes("reasoning.commercialIntent")
);

console.log("\n── Layer responsibilities (runtime) ──");
for (const scenario of HUMAN_QUERIES) {
  const { payload, reasoning, signals, contract, validation } = runPipeline(scenario);
  assert(`"${scenario.query}" pipeline valid`, validation.valid === true);
  assert(`"${scenario.query}" payload structures only`, !payload.safeReasoningSignals);
  assert(`"${scenario.query}" reasoning has no reply`, !reasoning.reply);
  assert(`"${scenario.query}" signals has no reasoning`, !signals.safeReasoningSignals);
  assert(
    `"${scenario.query}" contract verbalization from reasoning`,
    contract.verbalizationTarget?.productName === reasoning.selectedCommercialItem?.productName ||
      contract.isActive !== true
  );
}

console.log("\n── Data Layer priority ──");
for (const name of ["iphone 13", "galaxy a55", "moto g84", "s23 fe"]) {
  const { payload, reasoning, contract, validation } = runPipeline({
    query: name,
    selected: name,
    hasDataLayer: true,
  });
  assert(`"${name}" payload skipped`, payload.skipped === true);
  assert(`"${name}" reasoning skipped`, reasoning.shouldUseFallbackReasoning !== true);
  assert(`"${name}" contract inactive`, contract.isActive !== true);
  assert(`"${name}" validation valid`, validation.valid === true);
}

console.log("\n── Upstream separation ──");
const accessory = runPipeline({
  query: "pelicula iphone 13",
  selected: "Película vidro iPhone 13",
  upstream: "iPhone 13",
});
assert("accessory upstream != selected", accessory.signals.upstreamReference?.productName !== accessory.signals.selectedCommercialItem?.productName);
assert("accessory pipeline valid", accessory.validation.valid === true);

console.log("\n── Verbalization unchanged ──");
const fallback = runPipeline({
  query: "pelicula iphone 13",
  selected: "Película vidro iPhone 13",
  upstream: "iPhone 13",
});
const resolved = resolveUniversalFallbackPromptContractVerbalization({
  query: fallback.payload.query,
  governedFallbackPayload: fallback.payload,
  universalGovernedFallbackReasoning: fallback.reasoning,
});
const directReply = verbalizeUniversalFallbackPromptContract(fallback.contract);
assert("contract verbalization stable", resolved.reply === directReply);
assert("reply non-empty when applied", !resolved.applied || !!resolved.reply);

console.log("\n── Observability patch ──");
const patch = buildCommercialFallbackPipelineObservabilityPatch({
  payload: fallback.payload,
  reasoning: fallback.reasoning,
  signals: fallback.signals,
  contract: fallback.contract,
});
assert("patch has governed payload", !!patch.governed_fallback_payload);
assert("patch has reasoning", !!patch.universal_governed_fallback_reasoning);
assert("patch has category signals", !!patch.universal_category_signals);
assert("patch has pipeline diagnostics", !!patch.commercial_fallback_pipeline);
assert("patch has contract when provided", !!patch.universal_fallback_prompt_contract);

console.log("\n── Chat integration ──");
const chatSource = read("pages/api/chat-gpt4o.js");
assert(
  "chat uses pipeline observability patch",
  chatSource.includes("buildCommercialFallbackPipelineObservabilityPatch")
);
assert("chat keeps commercial runtime activation", chatSource.includes("resolveAndApplyCommercialRuntimeActivation"));
assert(
  "chat does not import pipeline builder into router",
  !read("lib/miaCognitiveRouter.js").includes("commercialFallbackProductionPipeline")
);

console.log("\n── DEV endpoints enriched ──");
assert(
  "category signals dev returns pipeline",
  read("pages/api/dev/universal-category-signals.js").includes("buildCommercialFallbackPipelineDevPayload")
);
assert(
  "prompt contract dev returns pipeline",
  read("pages/api/dev/universal-fallback-prompt-contract.js").includes("buildCommercialFallbackPipelineDevPayload")
);

console.log("\n── Product explanation unchanged ──");
const explanation = buildProductExplanation(dataLayerProduct("iPhone 13"), {
  query: "iphone 13",
});
assert("data layer explanation still built", !!explanation?.text || !!explanation?.paragraphs);

console.log("\n── Architecture preservation ──");
assert("Decision Engine files untouched", !read("lib/miaCognitiveRouter.js").includes("commercialFallbackProductionPipeline"));
assert("MIAChat untouched", !read("components/MIAChat.jsx").includes("commercialFallbackProductionPipeline"));
assert(
  "pipeline module does not decide winner",
  !read("lib/commercial/commercialFallbackProductionPipeline.js").match(
    /selectWinner|rankWinner|decideWinner|buildWinner|winnerLock/i
  )
);

console.log("\n── Regressions ──");
console.log("  ⏭️ skipped — no nested audits (local-only mode)");

const elapsed = ((Date.now() - start) / 1000).toFixed(2);
console.log("\n── Verdict ──");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Time: ${elapsed}s\n`);

if (failed === 0) {
  console.log("A) ROBUST estruturalmente\n");
  process.exit(0);
}

console.log("B) PARTIAL\n");
process.exit(1);
