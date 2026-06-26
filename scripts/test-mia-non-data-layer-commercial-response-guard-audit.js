/**
 * PATCH Comercial 4E-A.3 — Non-Data-Layer Commercial Response Guard Audit
 *
 * Usage:
 *   node scripts/test-mia-non-data-layer-commercial-response-guard-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  NON_DATA_LAYER_COMMERCIAL_RESPONSE_GUARD_VERSION,
  buildCommercialKnowledgeMetadata,
  buildCommercialKnowledgeSourceDiagnostic,
  detectCommercialKnowledgeSource,
  formatCommercialKnowledgeSourceLabel,
  isDataLayerCommercialResponse,
  isGovernedFallbackCommercialResponse,
} from "../lib/commercial/nonDataLayerCommercialResponseGuard.js";
import {
  buildProductExplanation,
  buildStructuredExplanationFacts,
} from "../lib/miaProductExplanationBuilder.js";
import { buildCommercialShadowDiagnosticReport } from "../lib/productSourceAdapter/commercialShadowDiagnosticSummary.js";

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

const DATA_LAYER_FIXTURES = [
  {
    query: "iPhone 13",
    product: {
      product_name: "iPhone 13",
      price: "R$ 3.499,00",
      isDataLayerProduct: true,
      category: "celular",
    },
    trustedSpecs: {
      official_name: "iPhone 13",
      category: "celular",
      strengths: ["ecossistema consistente", "desempenho estável"],
      ideal_for: ["uso diário equilibrado"],
      weaknesses: ["preço acima da média da categoria"],
    },
  },
  {
    query: "Galaxy A55",
    product: {
      product_name: "Samsung Galaxy A55 5G",
      price: "R$ 1.899,00",
      isDataLayerProduct: true,
      category: "celular",
    },
    trustedSpecs: {
      official_name: "Samsung Galaxy A55 5G",
      category: "celular",
      strengths: ["bateria consistente", "tela fluida"],
      ideal_for: ["uso diário equilibrado"],
      weaknesses: ["não é o topo de câmera da categoria"],
    },
  },
  {
    query: "Moto G84",
    product: {
      product_name: "Motorola Moto G84",
      price: "R$ 1.299,00",
      isDataLayerProduct: true,
      category: "celular",
    },
    trustedSpecs: {
      official_name: "Motorola Moto G84",
      category: "celular",
      strengths: ["tela fluida", "bateria confortável"],
      ideal_for: ["uso cotidiano"],
      weaknesses: ["não é o mais potente da faixa"],
    },
  },
];

const GOVERNED_FALLBACK_FIXTURES = [
  { query: "cadeira gamer", product: { product_name: "Cadeira Gamer XYZ", price: "R$ 899,00", category: "chair" } },
  { query: "monitor gamer", product: { product_name: "Monitor Gamer 27", price: "R$ 1.199,00", category: "monitor" } },
  { query: "tv samsung", product: { product_name: "Smart TV Samsung 55", price: "R$ 2.499,00", category: "tv" } },
  { query: "controle ps5", product: { product_name: "Controle DualSense PS5", price: "R$ 399,00", category: "console" } },
  { query: "volante g29", product: { product_name: "Volante Logitech G29", price: "R$ 1.699,00", category: "console" } },
  { query: "webcam logitech", product: { product_name: "Webcam Logitech C920", price: "R$ 349,00", category: "computer" } },
];

const GUARD_FILES = [
  "lib/commercial/nonDataLayerCommercialResponseGuard.js",
  "lib/miaProductExplanationBuilder.js",
  "lib/productSourceAdapter/commercialShadowDiagnosticSummary.js",
  "pages/api/dev/commercial-shadow-summary.js",
];

const UNTOUCHED_GUARD_FILES = [
  "lib/miaCognitiveRouter.js",
  "lib/miaRoutingDecisionContract.js",
  "lib/productSourceAdapter/commercialSelectionEngine.js",
  "lib/miaSpecificProductResolutionLock.js",
];

console.log(
  `\nPATCH Comercial 4E-A.3 — Non-Data-Layer Commercial Response Guard Audit (${NON_DATA_LAYER_COMMERCIAL_RESPONSE_GUARD_VERSION})\n`
);

console.log("── Module contract ──");
assert("version 4E-A.3", NON_DATA_LAYER_COMMERCIAL_RESPONSE_GUARD_VERSION === "4E-A.3");
for (const file of GUARD_FILES) {
  assert(`file exists: ${file}`, readFileSync(join(ROOT, file), "utf8").length > 0);
}
assert(
  "guard module has no LLM dependency",
  !readFileSync(join(ROOT, "lib/commercial/nonDataLayerCommercialResponseGuard.js"), "utf8").match(
    /openai|callOpenAI|embedding/i
  )
);

console.log("\n── Data Layer detection ──");
for (const fixture of DATA_LAYER_FIXTURES) {
  const detected = detectCommercialKnowledgeSource(fixture);
  assert(
    `"${fixture.query}" → data_layer`,
    detected.knowledgeSource === "data_layer",
    JSON.stringify(detected)
  );
  assert(`"${fixture.query}" isAudited`, detected.isAudited === true);
  assert(`"${fixture.query}" transparencyRequired false`, detected.transparencyRequired === false);
  assert(`"${fixture.query}" confidence high`, detected.confidence === "high");
  assert(`"${fixture.query}" isDataLayerCommercialResponse`, isDataLayerCommercialResponse(fixture));
  assert(
    `"${fixture.query}" not governed fallback`,
    isGovernedFallbackCommercialResponse(fixture) === false
  );
}

console.log("\n── Governed Fallback detection ──");
for (const fixture of GOVERNED_FALLBACK_FIXTURES) {
  const detected = detectCommercialKnowledgeSource(fixture);
  assert(
    `"${fixture.query}" → governed_fallback`,
    detected.knowledgeSource === "governed_fallback",
    JSON.stringify(detected)
  );
  assert(`"${fixture.query}" isAudited false`, detected.isAudited === false);
  assert(`"${fixture.query}" transparencyRequired true`, detected.transparencyRequired === true);
  assert(`"${fixture.query}" confidence medium`, detected.confidence === "medium");
  assert(
    `"${fixture.query}" isGovernedFallbackCommercialResponse`,
    isGovernedFallbackCommercialResponse(fixture)
  );
  assert(`"${fixture.query}" not data layer`, isDataLayerCommercialResponse(fixture) === false);
}

console.log("\n── Product Explanation Builder integration ──");
for (const fixture of DATA_LAYER_FIXTURES) {
  const beforeFacts = buildStructuredExplanationFacts(fixture);
  const built = buildProductExplanation(fixture);
  assert(`builder ok for "${fixture.query}"`, built.ok === true);
  assert(
    `builder knowledgeSource data_layer for "${fixture.query}"`,
    built.knowledgeSource === "data_layer" && built.knowledgeMetadata?.knowledgeSource === "data_layer"
  );
  assert(
    `facts carry knowledgeMetadata for "${fixture.query}"`,
    beforeFacts.knowledgeMetadata?.knowledgeSource === "data_layer"
  );
  assert(`builder text unchanged quality for "${fixture.query}"`, built.text.length >= 24);
}

for (const fixture of GOVERNED_FALLBACK_FIXTURES) {
  const built = buildProductExplanation(fixture);
  assert(`builder ok for "${fixture.query}"`, built.ok === true);
  assert(
    `builder knowledgeSource governed_fallback for "${fixture.query}"`,
    built.knowledgeSource === "governed_fallback"
  );
  assert(`builder text still natural for "${fixture.query}"`, built.text.length >= 24);
}

console.log("\n── Shadow diagnostic observability ──");
const dataLayerShadow = buildCommercialShadowDiagnosticReport({
  trace: { query: "iPhone 13", selection: {}, merge: {}, dedupe: {} },
  winner: DATA_LAYER_FIXTURES[0].product,
  knowledgeMetadata: buildCommercialKnowledgeMetadata(DATA_LAYER_FIXTURES[0]),
});
assert(
  "shadow summary Knowledge Source Data Layer",
  dataLayerShadow.summary.includes("Knowledge Source") &&
    dataLayerShadow.summary.includes("Data Layer")
);
assert(
  "shadow report knowledgeSource payload data_layer",
  dataLayerShadow.knowledgeSource?.type === "data_layer" &&
    dataLayerShadow.knowledgeSource?.isAudited === true
);

const fallbackShadow = buildCommercialShadowDiagnosticReport({
  trace: { query: "cadeira gamer", selection: {}, merge: {}, dedupe: {} },
  winner: GOVERNED_FALLBACK_FIXTURES[0].product,
});
assert(
  "shadow summary Knowledge Source Governed Fallback",
  fallbackShadow.summary.includes("Knowledge Source") &&
    fallbackShadow.summary.includes("Governed Fallback")
);
assert(
  "shadow report knowledgeSource payload governed_fallback",
  fallbackShadow.knowledgeSource?.type === "governed_fallback" &&
    fallbackShadow.knowledgeSource?.transparencyRequired === true
);

console.log("\n── DEV diagnostic payload ──");
const diagnostic = buildCommercialKnowledgeSourceDiagnostic(
  buildCommercialKnowledgeMetadata(GOVERNED_FALLBACK_FIXTURES[0])
);
assert("diagnostic type governed_fallback", diagnostic.type === "governed_fallback");
assert("diagnostic transparencyRequired", diagnostic.transparencyRequired === true);
assert(
  "label formatting",
  formatCommercialKnowledgeSourceLabel({ knowledgeSource: "data_layer" }) === "Data Layer"
);

console.log("\n── Architecture preservation ──");
for (const file of UNTOUCHED_GUARD_FILES) {
  const content = readFileSync(join(ROOT, file), "utf8");
  assert(`${file} does not import guard`, !content.includes("nonDataLayerCommercialResponseGuard"));
}
const builderSource = readFileSync(join(ROOT, "lib/miaProductExplanationBuilder.js"), "utf8");
assert("builder imports guard", builderSource.includes("nonDataLayerCommercialResponseGuard"));
assert("builder still exports buildProductExplanation", builderSource.includes("export function buildProductExplanation"));

console.log(`\nPassed: ${passed} Failed: ${failed}`);
console.log(failed === 0 ? "\nVeredito: A) ROBUST\n" : "\nVeredito: C) FAILED\n");
process.exit(failed > 0 ? 1 : 0);
