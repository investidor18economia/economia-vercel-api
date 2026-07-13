/**
 * PATCH Comercial 4E-C.1 — Commercial Fallback Integrated Regression Validation (local only)
 *
 * Usage:
 *   node scripts/test-mia-commercial-fallback-integrated-regression-validation-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  GOVERNED_FALLBACK_PAYLOAD_BUILDER_VERSION,
  buildGovernedFallbackPayload,
  buildGovernedFallbackPayloadDiagnostics,
} from "../lib/commercial/governedFallbackPayloadBuilder.js";
import {
  UNIVERSAL_GOVERNED_FALLBACK_REASONING_VERSION,
  buildUniversalGovernedFallbackReasoning,
  buildUniversalGovernedFallbackReasoningDiagnostics,
} from "../lib/commercial/universalGovernedFallbackReasoning.js";
import {
  UNIVERSAL_CATEGORY_SIGNAL_LIBRARY_VERSION,
  buildUniversalCategorySignalDiagnostics,
  buildUniversalCategorySignals,
} from "../lib/commercial/universalCategorySignalLibrary.js";
import {
  UNIVERSAL_FALLBACK_PROMPT_CONTRACT_VERSION,
  buildUniversalFallbackPromptContract,
  buildUniversalFallbackPromptContractDiagnostics,
  resolveUniversalFallbackPromptContractVerbalization,
  verbalizeUniversalFallbackPromptContract,
} from "../lib/commercial/universalFallbackPromptContract.js";
import {
  buildCommercialFallbackPipelineObservabilityPatch,
  validateCommercialFallbackPipelineLayers,
} from "../lib/commercial/commercialFallbackProductionPipeline.js";

const INTEGRATED_REGRESSION_VALIDATION_VERSION = "4E-C.1";

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

function cleanText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function namesEqual(a = "", b = "") {
  const left = cleanText(a).toLowerCase();
  const right = cleanText(b).toLowerCase();
  return !!left && !!right && left === right;
}

function valuesAlign(a = "", b = "") {
  const left = cleanText(a);
  const right = cleanText(b);
  if (!left && !right) return true;
  return namesEqual(left, right);
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

function runIntegratedPipeline({ query, selected, upstream = null, hasDataLayer = false }) {
  const payload = buildGovernedFallbackPayload({
    query,
    selectedProduct: hasDataLayer ? dataLayerProduct(selected) : offer(selected),
    hasDataLayer,
    cognitiveWinnerProduct: upstream ? offer(upstream) : null,
    relatedProductRole: "cognitive_context_reference",
    relatedProductSource: "integrated_regression_validation",
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
  const verbalization = resolveUniversalFallbackPromptContractVerbalization({
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
  const observabilityPatch = buildCommercialFallbackPipelineObservabilityPatch({
    payload,
    reasoning,
    signals,
    contract,
    contractDiagnostics: buildUniversalFallbackPromptContractDiagnostics(contract),
  });

  return {
    payload,
    reasoning,
    signals,
    contract,
    verbalization,
    validation,
    observabilityPatch,
  };
}

function validateHandoffs(label, pipeline) {
  const { payload, reasoning, signals, contract } = pipeline;

  assert(`${label} layer validation valid`, pipeline.validation.valid === true);

  if (payload.enabled === true) {
    assert(
      `${label} payload.version -> reasoning.payloadVersion`,
      reasoning.payloadVersion === payload.version
    );
    assert(
      `${label} payload selected -> reasoning selectedCommercialItem`,
      namesEqual(payload.selectedProduct?.productName, reasoning.selectedCommercialItem?.productName)
    );
    assert(
      `${label} payload accessory -> reasoning categorySignals.accessoryIntent`,
      payload.commercialIntent?.accessoryIntent?.isAccessoryIntent ===
        reasoning.categorySignals?.accessoryIntent?.isAccessoryIntent
    );
  }

  if (reasoning.shouldUseFallbackReasoning === true) {
    assert(
      `${label} reasoning selected -> signals selectedCommercialItem`,
      namesEqual(
        reasoning.selectedCommercialItem?.productName,
        signals.selectedCommercialItem?.productName
      )
    );
    assert(
      `${label} reasoning upstream -> signals upstreamReference`,
      valuesAlign(
        reasoning.upstreamReference?.productName,
        signals.upstreamReference?.productName
      )
    );
    assert(
      `${label} reasoning requestedItemIdentity preserved`,
      !!reasoning.requestedItemIdentity?.query
    );
    assert(
      `${label} signals requestedItem preserved`,
      !!signals.requestedItem?.productName || !!signals.requestedItemIdentity?.query
    );
    assert(
      `${label} signals provenance payloadVersion`,
      signals.provenance?.payloadVersion === payload.version
    );
    assert(
      `${label} signals provenance reasoningVersion`,
      signals.provenance?.reasoningVersion === reasoning.version
    );
    assert(
      `${label} signals categoryConfidence present`,
      !!signals.categoryConfidence?.level
    );
    assert(
      `${label} reasoning categorySignals present`,
      !!reasoning.categorySignals
    );
  }

  if (contract.isActive === true) {
    assert(
      `${label} contract verbalizationTarget -> reasoning focus`,
      namesEqual(
        contract.verbalizationTarget?.productName,
        reasoning.verbalizationFocus?.productName
      )
    );
    assert(
      `${label} contract upstream policy -> reasoning upstream`,
      valuesAlign(
        contract.upstreamReferencePolicy?.upstreamProductName,
        reasoning.upstreamReference?.productName
      )
    );
    assert(
      `${label} contract llm boundary role`,
      contract.sourceInstruction?.llmRole === "verbalize_contract_only"
    );
    assert(
      `${label} contract provenance reasoningVersion`,
      contract.provenance?.reasoningVersion === reasoning.version
    );
    assert(
      `${label} contract provenance payloadVersion`,
      contract.provenance?.payloadVersion === payload.version
    );
    assert(
      `${label} contract confidence from reasoning`,
      contract.confidenceInstruction?.level === reasoning.confidenceBoundary?.level
    );
  }

  if (
    payload.relatedMainProduct?.productName &&
    payload.selectedProduct?.productName &&
    !namesEqual(payload.relatedMainProduct.productName, payload.selectedProduct.productName)
  ) {
    assert(
      `${label} upstream != selected across layers`,
      !namesEqual(signals.upstreamReference?.productName, signals.selectedCommercialItem?.productName)
    );
    if (signals.compatibilityReference) {
      assert(
        `${label} compatibilityReference provenance`,
        !!signals.compatibilityReference.productName
      );
    }
  }
}

const HUMAN_SCENARIOS = [
  { query: "pelicula iphone", selected: "Película vidro iPhone 13", upstream: "iPhone 13" },
  { query: "controle play", selected: "Controle DualSense PS5", upstream: "PlayStation 5" },
  { query: "ssd", selected: "SSD 1TB NVMe" },
  { query: "monitor", selected: "Monitor 27 Full HD" },
  { query: "cadeira gamer", selected: "Cadeira Gamer Ergonômica" },
  { query: "webcam", selected: "Webcam HD Pro" },
  { query: "mouse", selected: "Mouse Gamer Sem Fio" },
  { query: "teclado", selected: "Teclado Mecânico RGB" },
  { query: "gabinete", selected: "Gabinete ATX Gamer" },
  { query: "fonte", selected: "Fonte PC Gamer 650W" },
  { query: "adaptador", selected: "Adaptador USB-C HDMI" },
  { query: "controle sem fio", selected: "Controle Sem Fio Pro", upstream: "Xbox Series X" },
  { query: "cabo hdmi", selected: "Cabo HDMI 2.1 2m", upstream: "Monitor LG 27" },
  { query: "monitor ultrawide", selected: "Monitor Ultrawide 34" },
];

console.log(
  `\nPATCH Comercial 4E-C.1 — Integrated Regression Validation (${INTEGRATED_REGRESSION_VALIDATION_VERSION})\n`
);

console.log("── Module versions aligned ──");
assert("payload builder version", GOVERNED_FALLBACK_PAYLOAD_BUILDER_VERSION === "4E-B.6");
assert("reasoning version", UNIVERSAL_GOVERNED_FALLBACK_REASONING_VERSION === "4E-B.7");
assert("prompt contract version", UNIVERSAL_FALLBACK_PROMPT_CONTRACT_VERSION === "4E-B.8");
assert("category signals version", UNIVERSAL_CATEGORY_SIGNAL_LIBRARY_VERSION === "4E-B.9");

console.log("\n── Static integration wiring ──");
const chatSource = read("pages/api/chat-gpt4o.js");
assert("chat wires payload builder", chatSource.includes("buildGovernedFallbackPayload"));
assert("chat wires reasoning", chatSource.includes("buildUniversalGovernedFallbackReasoning"));
assert("chat wires category signals", chatSource.includes("buildUniversalCategorySignals"));
assert(
  "chat wires prompt contract verbalization",
  chatSource.includes("resolveUniversalFallbackPromptContractVerbalization")
);
assert(
  "chat uses unified observability patch",
  chatSource.includes("buildCommercialFallbackPipelineObservabilityPatch")
);
assert(
  "audit has no child_process imports",
  !read("scripts/test-mia-commercial-fallback-integrated-regression-validation-audit.js").match(
    /from\s+["']node:child_process["']|require\(\s*["']child_process["']\s*\)/
  )
);

console.log("\n── Integrated handoffs (human language) ──");
const verbalizationSnapshots = new Map();

for (const scenario of HUMAN_SCENARIOS) {
  const pipeline = runIntegratedPipeline(scenario);
  validateHandoffs(`"${scenario.query}"`, pipeline);

  if (pipeline.contract.isActive === true) {
    const directReply = verbalizeUniversalFallbackPromptContract(pipeline.contract);
    assert(
      `"${scenario.query}" verbalization stable`,
      pipeline.verbalization.reply === directReply
    );
    verbalizationSnapshots.set(scenario.query, directReply);
  }
}

console.log("\n── Data Layer bypasses fallback pipeline ──");
for (const name of ["iphone 13", "galaxy a55"]) {
  const pipeline = runIntegratedPipeline({
    query: name,
    selected: name,
    hasDataLayer: true,
  });
  assert(`"${name}" payload skipped`, pipeline.payload.skipped === true);
  assert(`"${name}" reasoning inactive`, pipeline.reasoning.shouldUseFallbackReasoning !== true);
  assert(`"${name}" contract inactive`, pipeline.contract.isActive !== true);
  assert(`"${name}" integrated validation valid`, pipeline.validation.valid === true);
}

console.log("\n── Layer responsibility boundaries ──");
const sample = runIntegratedPipeline({
  query: "pelicula iphone 13",
  selected: "Película vidro iPhone 13",
  upstream: "iPhone 13",
});
assert("payload has no reasoning fields", !sample.payload.safeReasoningSignals);
assert("reasoning has no reply", !sample.reasoning.reply);
assert("signals has no reasoning output", !sample.signals.safeReasoningSignals);
assert(
  "contract has llm boundary",
  !!sample.contract.llmVerbalizationBoundary?.verbalize
);

console.log("\n── Observability consistency ──");
const patch = sample.observabilityPatch;
const expectedTracerKeys = [
  "governed_fallback_payload",
  "governed_fallback_payload_full",
  "universal_governed_fallback_reasoning",
  "universal_governed_fallback_reasoning_full",
  "universal_category_signals",
  "universal_category_signals_full",
  "commercial_fallback_pipeline",
  "universal_fallback_prompt_contract",
  "universal_fallback_prompt_contract_full",
];

for (const key of expectedTracerKeys) {
  assert(`tracer key "${key}"`, Object.prototype.hasOwnProperty.call(patch, key));
}

assert(
  "diagnostics payload shape",
  patch.governed_fallback_payload.version === GOVERNED_FALLBACK_PAYLOAD_BUILDER_VERSION
);
assert(
  "diagnostics reasoning shape",
  patch.universal_governed_fallback_reasoning.version === UNIVERSAL_GOVERNED_FALLBACK_REASONING_VERSION
);
assert(
  "diagnostics signals shape",
  patch.universal_category_signals.version === UNIVERSAL_CATEGORY_SIGNAL_LIBRARY_VERSION
);
assert(
  "diagnostics contract shape",
  patch.universal_fallback_prompt_contract.version === UNIVERSAL_FALLBACK_PROMPT_CONTRACT_VERSION
);

console.log("\n── Known observability-only gaps (documented) ──");
assert(
  "category signals not yet consumed by prompt contract (expected)",
  !read("lib/commercial/universalFallbackPromptContract.js").includes("universalCategorySignals")
);
assert(
  "signals library does not generate reasoning (expected)",
  !read("lib/commercial/universalCategorySignalLibrary.js").includes("buildSafeReasoningSignals")
);

console.log("\n── DEV endpoint coverage ──");
assert("dev governed payload exists", read("pages/api/dev/governed-fallback-payload.js").includes("buildGovernedFallbackPayload"));
assert(
  "dev reasoning exists",
  read("pages/api/dev/universal-governed-fallback-reasoning.js").includes("buildUniversalGovernedFallbackReasoning")
);
assert(
  "dev category signals exists",
  read("pages/api/dev/universal-category-signals.js").includes("buildUniversalCategorySignals")
);
assert(
  "dev prompt contract exists",
  read("pages/api/dev/universal-fallback-prompt-contract.js").includes("resolveUniversalFallbackPromptContractVerbalization")
);

console.log("\n── Regressions ──");
console.log("  ⏭️ skipped — no nested audits (integrated local-only mode)");

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
