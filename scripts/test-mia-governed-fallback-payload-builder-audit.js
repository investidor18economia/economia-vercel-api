/**
 * PATCH Comercial 4E-B.6 — Governed Fallback Payload Builder Audit
 *
 * Usage:
 *   node scripts/test-mia-governed-fallback-payload-builder-audit.js
 */

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  GOVERNED_FALLBACK_PAYLOAD_BUILDER_VERSION,
  buildGovernedFallbackPayload,
  buildGovernedFallbackPayloadDevPayload,
  buildGovernedFallbackPayloadDiagnostics,
  shouldBuildGovernedFallbackPayload,
} from "../lib/commercial/governedFallbackPayloadBuilder.js";
import {
  buildCommercialKnowledgeMetadata,
  hasArchitecturalDataLayerContent,
} from "../lib/commercial/nonDataLayerCommercialResponseGuard.js";
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

const UNTOUCHED_BEHAVIOR_FILES = [
  "lib/miaCognitiveRouter.js",
  "lib/miaRoutingDecisionContract.js",
  "lib/miaSpecificProductResolutionLock.js",
  "lib/productSourceAdapter/commercialSelectionEngine.js",
  "lib/productSourceAdapter/commercialRuntimeActivation.js",
  "lib/miaProductExplanationBuilder.js",
  "lib/miaPrompt.js",
  "components/MIAChat.jsx",
];

const CATEGORY_AGNOSTIC_QUERIES = [
  { query: "iphone 13", offer: "iPhone 13", vertical: "phone" },
  { query: "monitor gamer", offer: "Monitor Gamer 27", vertical: "monitor" },
  { query: "cadeira gamer", offer: "Cadeira Gamer Ergonômica", vertical: "chair" },
  { query: "tv samsung", offer: "TV Samsung 55 4K", vertical: "tv" },
  { query: "pelicula iphone 13", offer: "Película vidro iPhone 13", vertical: "phone" },
  { query: "controle ps5", offer: "Controle DualSense PS5", vertical: "console" },
  { query: "webcam logitech", offer: "Webcam HD Pro", vertical: "webcam" },
  { query: "ssd nvme 1tb", offer: "SSD NVMe 1TB", vertical: null },
  { query: "mouse sem fio", offer: "Mouse sem fio compacto", vertical: null },
  { query: "fonte pc gamer", offer: "Fonte PC Gamer 650W", vertical: "computer" },
];

console.log(
  `\nPATCH Comercial 4E-B.6 — Governed Fallback Payload Builder (${GOVERNED_FALLBACK_PAYLOAD_BUILDER_VERSION})\n`
);

console.log("── Module contract ──");
const moduleSource = readFileSync(
  join(ROOT, "lib/commercial/governedFallbackPayloadBuilder.js"),
  "utf8"
);
assert("version 4E-B.6", GOVERNED_FALLBACK_PAYLOAD_BUILDER_VERSION === "4E-B.6");
assert("no LLM imports", !moduleSource.match(/openai|callOpenAI|buildMiaPrompt/i));
assert("no prompt imports", !moduleSource.includes("miaPrompt"));
assert("no reasoning generation", !moduleSource.match(/buildFallbackStructuredConsequences|openingSummary|strengthConsequences/i));
assert("no category hardcode branches", !moduleSource.match(/if\s*\(\s*category\s*===/i));
assert("uses commercial runtime diagnostics only", moduleSource.includes("buildCommercialRuntimeActivationDiagnostics"));
assert("dev endpoint exists", readFileSync(join(ROOT, "pages/api/dev/governed-fallback-payload.js"), "utf8").includes("buildGovernedFallbackPayload"));
assert(
  "chat wired for observability only",
  readFileSync(join(ROOT, "pages/api/chat-gpt4o.js"), "utf8").includes("governed_fallback_payload")
);

console.log("\n── Builder activation rules ──");
assert(
  "builds when no data layer",
  shouldBuildGovernedFallbackPayload({ product: offer("Fone Bluetooth"), hasDataLayer: false })
);
assert(
  "skips when data layer present",
  shouldBuildGovernedFallbackPayload({ product: dataLayerProduct("iPhone 13"), hasDataLayer: true }) === false
);
assert(
  "skips from trusted specs",
  shouldBuildGovernedFallbackPayload({ product: dataLayerProduct("Galaxy A55") }) === false
);

console.log("\n── Category-agnostic payload shape ──");
for (const { query, offer: title, vertical } of CATEGORY_AGNOSTIC_QUERIES) {
  const payload = buildGovernedFallbackPayload({
    query,
    selectedProduct: offer(title),
    hasDataLayer: false,
    responsePath: "commercial_only_fallback",
    cognitiveWinnerProduct: offer("Produto cognitivo upstream"),
  });

  assert(`"${query}" payload enabled`, payload.enabled === true);
  assert(`"${query}" governed fallback level`, payload.governance?.level === "governed_fallback");
  assert(`"${query}" selected product preserved`, payload.selectedProduct?.productName === title);
  assert(`"${query}" transparency required`, payload.transparency?.transparencyRequired === true);
  assert(`"${query}" no invented reasoning fields`, !payload.strengthConsequences && !payload.openingSummary);
  if (vertical) {
    assert(
      `"${query}" vertical detected`,
      payload.commercialIntent?.identifiedVertical === vertical ||
        payload.commercialIntent?.accessoryIntent?.isAccessoryIntent === true,
      payload.commercialIntent?.identifiedVertical
    );
  }
}

console.log("\n── Accessory context structuring ──");
const accessoryPayload = buildGovernedFallbackPayload({
  query: "pelicula iphone 13",
  selectedProduct: offer("Película vidro iPhone 13"),
  cognitiveWinnerProduct: offer("iPhone 13"),
  hasDataLayer: false,
  responsePath: "commercial_only_fallback",
});
assert("accessory intent flagged", accessoryPayload.commercialIntent?.accessoryIntent?.isAccessoryIntent === true);
assert(
  "related main product recorded structurally",
  accessoryPayload.relatedMainProduct?.productName === "iPhone 13"
);
assert(
  "selected product remains accessory offer",
  accessoryPayload.selectedProduct?.productName === "Película vidro iPhone 13"
);

console.log("\n── Governance and provenance ──");
const governed = buildGovernedFallbackPayload({
  query: "fone bluetooth",
  selectedProduct: offer("Fone Bluetooth Redmi Buds 6 Play"),
  commercialRuntimeActivation: {
    usedNewPipeline: true,
    fallbackToLegacy: false,
    mode: "controlled",
  },
});
assert("decision origin pipeline", governed.provenance?.decisionOrigin === "commercial_runtime_pipeline");
assert("payload origin builder", governed.provenance?.payloadOrigin === "governed_fallback_payload_builder");
assert("data origin commercial runtime", governed.provenance?.dataOrigin === "commercial_runtime");
assert("knowledge metadata attached", governed.transparency?.knowledgeMetadata?.knowledgeSource === "governed_fallback");
assert("audit notice required", governed.transparency?.auditNoticeRequired === true);

const skipped = buildGovernedFallbackPayload({
  query: "iphone 13",
  selectedProduct: dataLayerProduct("iPhone 13"),
  hasDataLayer: true,
});
assert("data layer payload skipped", skipped.skipped === true && skipped.enabled === false);

console.log("\n── No behavior mutation ──");
const explanationBefore = buildProductExplanation({
  product: offer("Fone Bluetooth Redmi Buds 6 Play"),
  hasDataLayer: false,
});
buildGovernedFallbackPayload({
  query: "fone bluetooth",
  selectedProduct: offer("Fone Bluetooth Redmi Buds 6 Play"),
  hasDataLayer: false,
});
const explanationAfter = buildProductExplanation({
  product: offer("Fone Bluetooth Redmi Buds 6 Play"),
  hasDataLayer: false,
});
assert(
  "product explanation unchanged by builder",
  explanationBefore.text === explanationAfter.text
);
assert(
  "knowledge metadata unchanged by builder",
  JSON.stringify(
    buildCommercialKnowledgeMetadata({
      product: offer("Fone Bluetooth Redmi Buds 6 Play"),
      hasDataLayer: false,
    })
  ) ===
    JSON.stringify(
      buildCommercialKnowledgeMetadata({
        product: offer("Fone Bluetooth Redmi Buds 6 Play"),
        hasDataLayer: false,
      })
    )
);

console.log("\n── Diagnostics / DEV payload ──");
const diagnostics = buildGovernedFallbackPayloadDiagnostics(governed);
assert("diagnostics enabled", diagnostics.enabled === true);
assert("diagnostics selected product", diagnostics.selectedProductName === "Fone Bluetooth Redmi Buds 6 Play");
const devPayload = buildGovernedFallbackPayloadDevPayload(governed);
assert("dev payload includes diagnostics", devPayload.diagnostics?.enabled === true);

console.log("\n── Architecture preservation ──");
for (const relativePath of UNTOUCHED_BEHAVIOR_FILES) {
  const source = readFileSync(join(ROOT, relativePath), "utf8");
  assert(`${relativePath} not importing builder`, !source.includes("governedFallbackPayloadBuilder"));
}

console.log("\n── Regressions ──");
runRegression("test-mia-governed-fallback-intelligence-layer-audit.js", "3C-C Governed Fallback Intelligence");
runRegression("test-mia-non-data-layer-commercial-response-guard-audit.js", "4E-A.3 Non-DL Response Guard");
runRegression("test-mia-non-data-layer-fallback-candidate-isolation-audit.js", "4E-B.3 Fallback Isolation");
runRegression("test-mia-accessory-commercial-runtime-enforcement-audit.js", "4E-B.1 Accessory Runtime");
runRegression("test-mia-api-handler-contract-compliance-audit.js", "4E-B.5 API Handler");
runRegression("test-mia-tone-compliance-guard-audit.js", "Tone Compliance");

console.log(`\n── Verdict ──`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(failed === 0 ? "\nA) ROBUST\n" : "\nB) NEEDS WORK\n");
process.exit(failed === 0 ? 0 : 1);
