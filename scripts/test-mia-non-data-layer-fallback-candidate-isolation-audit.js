/**
 * PATCH Comercial 4E-B.3 — Non-Data-Layer Fallback Candidate Isolation Audit
 *
 * Usage:
 *   node scripts/test-mia-non-data-layer-fallback-candidate-isolation-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  NON_DATA_LAYER_FALLBACK_CANDIDATE_ISOLATION_VERSION,
  assessDataLayerCandidateReliability,
  buildFallbackCandidateIsolationDevPayload,
  buildFallbackCandidateIsolationDiagnostics,
  detectCommercialVerticalFromText,
  detectNonDataLayerCommercialIntent,
  filterDataLayerCandidatesForCommercialFallback,
  shouldIsolateFromDataLayerCandidates,
} from "../lib/commercial/nonDataLayerFallbackCandidateIsolation.js";
import { buildCommercialKnowledgeMetadata } from "../lib/commercial/nonDataLayerCommercialResponseGuard.js";
import { detectAccessoryIntent } from "../lib/commercial/accessoryIntentLockGuard.js";

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

function candidate(name, extra = {}) {
  return {
    product_name: name,
    category: extra.category || "",
    isDataLayerProduct: extra.isDataLayerProduct !== false,
    trustedSpecs: extra.trustedSpecs || {
      official_name: name,
      strengths: extra.strengths || ["desempenho estável"],
      ideal_for: extra.ideal_for || ["uso diário"],
    },
    dataLayerScore: extra.dataLayerScore ?? 420,
  };
}

function auditedPhone(name) {
  return candidate(name, { category: "phone" });
}

function isolate(query, candidates) {
  return filterDataLayerCandidatesForCommercialFallback({ query, candidates });
}

const UNTOUCHED_FILES = [
  "lib/miaCognitiveRouter.js",
  "lib/miaRoutingDecisionContract.js",
  "lib/miaProductExplanationBuilder.js",
  "lib/productSourceAdapter/commercialSelectionEngine.js",
  "lib/miaSpecificProductResolutionLock.js",
  "components/MIAChat.jsx",
  "lib/miaCommercialCardTrustLabels.js",
];

console.log(
  `\nPATCH Comercial 4E-B.3 — Non-Data-Layer Fallback Candidate Isolation Audit (${NON_DATA_LAYER_FALLBACK_CANDIDATE_ISOLATION_VERSION})\n`
);

console.log("── Module contract ──");
assert("version 4E-B.3", NON_DATA_LAYER_FALLBACK_CANDIDATE_ISOLATION_VERSION === "4E-B.3");
const moduleSource = readFileSync(
  join(ROOT, "lib/commercial/nonDataLayerFallbackCandidateIsolation.js"),
  "utf8"
);
assert("uses accessory guard", moduleSource.includes("detectAccessoryIntent"));
assert("uses knowledge guard", moduleSource.includes("hasArchitecturalDataLayerContent"));
assert("uses commercial alignment", moduleSource.includes("calculateCommercialAlignment"));
assert("no brand hardcodes", !/galaxy s23 fe|lenovo idepad/i.test(moduleSource));

console.log("\n── Vertical detection ──");
assert("tv samsung -> tv", detectCommercialVerticalFromText("tv samsung") === "tv");
assert("cadeira gamer -> chair", detectCommercialVerticalFromText("cadeira gamer") === "chair");
assert("webcam logitech -> webcam", detectCommercialVerticalFromText("webcam logitech") === "webcam");
assert("volante g29 -> steering_wheel", detectCommercialVerticalFromText("volante g29") === "steering_wheel");
assert("iphone 13 -> phone", detectCommercialVerticalFromText("iphone 13") === "phone");
assert("galaxy a55 -> phone", detectCommercialVerticalFromText("galaxy a55") === "phone");

console.log("\n── Must isolate ──");
const isolateCases = [
  {
    query: "cadeira gamer",
    candidates: [candidate("Notebook Lenovo IdeaPad", { category: "notebook" })],
    blocked: "Notebook Lenovo IdeaPad",
  },
  {
    query: "tv samsung",
    candidates: [auditedPhone("Samsung Galaxy S23 FE")],
    blocked: "Samsung Galaxy S23 FE",
  },
  {
    query: "webcam logitech",
    candidates: [auditedPhone("Samsung Galaxy A35"), candidate("Notebook Lenovo", { category: "notebook" })],
    blocked: "Samsung Galaxy A35",
  },
  {
    query: "volante g29",
    candidates: [auditedPhone("Samsung Galaxy S23 FE")],
    blocked: "Samsung Galaxy S23 FE",
  },
  {
    query: "microfone fifine",
    candidates: [auditedPhone("Samsung Galaxy S23 FE")],
    blocked: "Samsung Galaxy S23 FE",
  },
  {
    query: "impressora epson",
    candidates: [auditedPhone("Samsung Galaxy S23 FE"), candidate("Notebook Lenovo", { category: "notebook" })],
    blocked: "Samsung Galaxy S23 FE",
  },
];

for (const fixture of isolateCases) {
  const result = isolate(fixture.query, fixture.candidates);
  assert(`${fixture.query} isolates`, result.applied === true, result.reason || "not applied");
  assert(
    `${fixture.query} clears candidates`,
    result.candidates.length === 0,
    result.finalCandidate || "(still has candidate)"
  );
  assert(
    `${fixture.query} blocks ${fixture.blocked}`,
    result.blockedDataLayerCandidate === fixture.blocked,
    result.blockedDataLayerCandidate || "(none)"
  );
}

console.log("\n── Must NOT isolate ──");
const preserveCases = [
  { query: "iphone 13", candidate: "iPhone 13" },
  { query: "galaxy a55", candidate: "Samsung Galaxy A55" },
  { query: "s23 fe", candidate: "Samsung Galaxy S23 FE" },
  { query: "moto g84", candidate: "Motorola Moto G84" },
  { query: "redmi note 13", candidate: "Redmi Note 13" },
  { query: "samsung galaxy s24", candidate: "Samsung Galaxy S24" },
];

for (const fixture of preserveCases) {
  const result = isolate(fixture.query, [auditedPhone(fixture.candidate)]);
  assert(`${fixture.query} keeps data layer`, result.applied === false, result.reason || "isolated");
  assert(
    `${fixture.query} final ${fixture.candidate}`,
    result.finalCandidate === fixture.candidate,
    result.finalCandidate || "(empty)"
  );
}

console.log("\n── Accessory preservation ──");
const accessoryCases = [
  { query: "pelicula iphone 13", blocked: "iPhone 13" },
  { query: "capa iphone 13", blocked: "iPhone 13" },
  { query: "controle ps5", blocked: "PlayStation 5 Console" },
  { query: "carregador notebook lenovo", blocked: "Notebook Lenovo IdeaPad" },
];

for (const fixture of accessoryCases) {
  const blockedCandidate =
    fixture.blocked === "PlayStation 5 Console"
      ? candidate("PlayStation 5 Console", { category: "console" })
      : fixture.blocked === "Notebook Lenovo IdeaPad"
        ? candidate("Notebook Lenovo IdeaPad", { category: "notebook" })
        : auditedPhone(fixture.blocked);

  const result = isolate(fixture.query, [blockedCandidate]);
  assert(`${fixture.query} accessory isolates main product`, result.applied === true);
  assert(
    `${fixture.query} accessory intent detected`,
    detectAccessoryIntent(fixture.query).isAccessoryIntent === true
  );
}

console.log("\n── Transparency metadata on isolation ──");
const isolated = isolate("tv samsung", [auditedPhone("Samsung Galaxy S23 FE")]);
const diagnostics = buildFallbackCandidateIsolationDiagnostics(isolated);
assert("isolation diagnostics applied", diagnostics.applied === true);
assert("isolation transparencyRequired", diagnostics.transparencyRequired === true);
assert(
  "governed fallback metadata",
  buildCommercialKnowledgeMetadata({
    product: { product_name: "tv samsung" },
    hasDataLayer: false,
  }).transparencyRequired === true
);

console.log("\n── shouldIsolateFromDataLayerCandidates ──");
const assessment = shouldIsolateFromDataLayerCandidates({
  query: "cadeira gamer",
  candidates: [candidate("Notebook Lenovo IdeaPad", { category: "notebook" })],
});
assert("shouldIsolate true for chair/notebook", assessment.shouldIsolate === true);
assert(
  "shouldIsolate reason",
  assessment.reason === "vertical_mismatch" || assessment.reason === "no_reliable_data_layer_match"
);

console.log("\n── DEV payload / endpoint ──");
const devPayload = buildFallbackCandidateIsolationDevPayload(diagnostics);
assert("dev payload applied", devPayload.applied === true);
assert("dev payload blocked candidate", devPayload.blockedDataLayerCandidate === "Samsung Galaxy S23 FE");
assert(
  "dev endpoint exists",
  readFileSync(join(ROOT, "pages/api/dev/non-data-layer-fallback-isolation.js"), "utf8").includes(
    "buildFallbackCandidateIsolationDevPayload"
  )
);

console.log("\n── Pipeline wiring ──");
const apiSource = readFileSync(join(ROOT, "pages/api/chat-gpt4o.js"), "utf8");
assert(
  "chat imports isolation layer",
  apiSource.includes("filterDataLayerCandidatesForCommercialFallback")
);
assert(
  "chat patches isolation tracer",
  apiSource.includes("non_data_layer_fallback_candidate_isolation")
);

console.log("\n── Architecture preservation ──");
for (const file of UNTOUCHED_FILES) {
  const content = readFileSync(join(ROOT, file), "utf8");
  assert(`${file} not importing isolation layer`, !content.includes("nonDataLayerFallbackCandidateIsolation"));
}

console.log("\n── detectNonDataLayerCommercialIntent ──");
const intent = detectNonDataLayerCommercialIntent("tv samsung");
assert("intent queryCore", intent.queryCore.includes("tv"));
assert("intent detectedCommercialIntent tv", intent.detectedCommercialIntent === "tv");

const reliability = assessDataLayerCandidateReliability({
  query: "tv samsung",
  candidate: auditedPhone("Samsung Galaxy S23 FE"),
  commercialIntent: intent,
});
assert("assessment unreliable tv/phone", reliability.reliable === false);
assert("assessment vertical mismatch", reliability.reason === "vertical_mismatch");

console.log(`\nPassed: ${passed} Failed: ${failed}`);
console.log(failed === 0 ? "\nVeredito: A) ROBUST\n" : "\nVeredito: C) FAILED\n");
process.exit(failed > 0 ? 1 : 0);
