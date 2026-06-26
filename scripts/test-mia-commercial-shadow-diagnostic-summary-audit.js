/**
 * PATCH Comercial 4E-A.1 — Commercial Shadow Diagnostic Summary Audit
 *
 * Usage:
 *   node scripts/test-mia-commercial-shadow-diagnostic-summary-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  COMMERCIAL_SHADOW_DIAGNOSTIC_SUMMARY_VERSION,
  buildCommercialShadowDiagnosticReport,
  buildCommercialShadowPipelineSummary,
  buildCommercialShadowProviderSummary,
  buildCommercialShadowReasonSummary,
  buildCommercialShadowSelectionSummary,
  buildCommercialShadowSummary,
  summarizeCommercialShadowProviderResult,
} from "../lib/productSourceAdapter/commercialShadowDiagnosticSummary.js";
import {
  executeCommercialRuntimeShadow,
  runCommercialShadowPipeline,
} from "../lib/productSourceAdapter/commercialRuntimeShadow.js";
import { COMMERCIAL_PROVIDER_IDS } from "../lib/productSourceAdapter/commercialProviderRegistry.js";
import { mergeCommercialOfferBundle } from "../lib/productSourceAdapter/commercialOfferMergeLayer.js";
import { deduplicateCommercialOfferBundle } from "../lib/productSourceAdapter/commercialDeduplicationLayer.js";
import { selectCommercialOffers } from "../lib/productSourceAdapter/commercialSelectionEngine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const GUARD_FILES = [
  "lib/miaCognitiveRouter.js",
  "lib/miaRoutingDecisionContract.js",
  "lib/miaProductExplanationBuilder.js",
  "lib/productSourceAdapter/index.js",
  "lib/productSourceAdapter/commercialSelectionEngine.js",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function offer(title, extra = {}) {
  return {
    title,
    price: extra.price ?? 100,
    url: extra.url ?? `https://shop.test/${encodeURIComponent(title)}`,
    image: extra.image ?? "https://shop.test/img.jpg",
    source: extra.source ?? COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE,
    ...extra,
  };
}

function googleProduct(name, extra = {}) {
  return {
    product_name: name,
    price: extra.price ?? "R$ 100,00",
    link: extra.link ?? `https://shop.test/${encodeURIComponent(name)}`,
    thumbnail: extra.thumbnail ?? "https://shop.test/img.jpg",
    source: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
    ...extra,
  };
}

function buildTraceFromParts({ query, googleProducts = [], apifyProducts = [], googleError = null, apifyError = null }) {
  const googleResult = {
    ok: googleError ? false : true,
    products: googleProducts,
    error: googleError,
  };
  const apifyResult = {
    ok: apifyError ? false : true,
    products: apifyProducts,
    error: apifyError,
  };
  const merged = mergeCommercialOfferBundle({
    googleShoppingOffers: googleProducts,
    apifyMercadoLivreOffers: apifyProducts,
  });
  const deduped = deduplicateCommercialOfferBundle(merged.offers);
  const selection = selectCommercialOffers({ query, offers: deduped.offers });

  return {
    query,
    durationMs: 42,
    timedOut: false,
    googleResult,
    apifyResult,
    merge: merged,
    dedupe: deduped,
    selection,
    error: selection.selectedOffer ? null : "empty_selection",
  };
}

const CASES = [];

function test(name, fn) {
  CASES.push({ name, fn });
}

function expectSummaryForQuery(query, googleProducts, apifyProducts, checks = {}) {
  const trace = buildTraceFromParts({ query, googleProducts, apifyProducts });
  const report = buildCommercialShadowDiagnosticReport({ trace });
  assert(report.summary.includes("Commercial Shadow Summary"), "summary header");
  assert(report.summary.includes(query), "query in summary");
  if (checks.winner) {
    assert(
      String(report.selection.winnerLabel || "").toLowerCase().includes(checks.winner.toLowerCase()) ||
        String(report.selection.winner || "").includes(checks.winner),
      `winner ${checks.winner}`
    );
  }
  if (checks.pipelineStatus) {
    assert(report.pipeline.pipelineStatus === checks.pipelineStatus, checks.pipelineStatus);
  }
  if (checks.reasonIncludes) {
    assert(
      report.reasonLines.some((line) =>
        line.toLowerCase().includes(String(checks.reasonIncludes).toLowerCase())
      ),
      `reason includes ${checks.reasonIncludes}`
    );
  }
  return report;
}

test("versão 4E-A.1 definida", () => {
  assert(
    COMMERCIAL_SHADOW_DIAGNOSTIC_SUMMARY_VERSION === "4E-A.1",
    "version"
  );
});

test("iPhone 13 summary estruturado", () => {
  const report = expectSummaryForQuery(
    "iphone 13",
    [googleProduct("Apple iPhone 13 128GB", { price: "R$ 3.499,00" })],
    [offer("Apple iPhone 13 128GB", { price: 3299, source: COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE })]
  );
  assert(report.providerResults.google.count >= 1, "google count");
  assert(report.reasonLines.length > 0, "reason lines");
});

test("Galaxy A55", () => {
  expectSummaryForQuery(
    "galaxy a55",
    [googleProduct("Samsung Galaxy A55 5G")],
    [offer("Samsung Galaxy A55 5G 256GB")]
  );
});

test("Notebook Lenovo", () => {
  expectSummaryForQuery(
    "notebook lenovo",
    [googleProduct("Notebook Lenovo IdeaPad")],
    [offer("Notebook Lenovo IdeaPad 15")]
  );
});

test("Cadeira Gamer", () => {
  expectSummaryForQuery(
    "cadeira gamer",
    [googleProduct("Cadeira Gamer Healer")],
    [offer("Cadeira Gamer Healer Preta"), offer("Capa Para Cadeira Gamer", { price: 42 })]
  );
});

test("Monitor Gamer", () => {
  expectSummaryForQuery(
    "monitor gamer",
    [googleProduct("Monitor Gamer 27")],
    [offer("Monitor Gamer 27 165Hz")]
  );
});

test("TV Samsung", () => {
  expectSummaryForQuery(
    "tv samsung",
    [googleProduct("TV Samsung 55 QLED")],
    [offer("TV Samsung 55 QLED 4K")]
  );
});

test("Controle PS5", () => {
  expectSummaryForQuery(
    "controle ps5",
    [googleProduct("Controle Sony PS5")],
    [offer("Controle Sem Fio PS5")]
  );
});

test("Película iPhone 13", () => {
  const report = expectSummaryForQuery(
    "pelicula iphone 13",
    [googleProduct("Película iPhone 13")],
    [offer("Película Vidro iPhone 13")]
  );
  assert(report.pipeline.mergeCount >= 2, "merge");
});

test("provider vazio", () => {
  const trace = buildTraceFromParts({ query: "produto xyz", googleProducts: [], apifyProducts: [] });
  const providers = buildCommercialShadowProviderSummary(trace);
  assert(providers.google.count === 0, "google empty");
  assert(providers.apify.count === 0, "apify empty");
});

test("Google rate limit", () => {
  const trace = buildTraceFromParts({
    query: "iphone 13",
    googleProducts: [],
    apifyProducts: [offer("Apple iPhone 13 128GB")],
    googleError: "rate limited",
  });
  const providers = buildCommercialShadowProviderSummary(trace);
  assert(providers.google.status === "rate limited", "google rate limit");
  assert(providers.apify.ok === true, "apify ok");
  const report = buildCommercialShadowDiagnosticReport({ trace });
  assert(report.providerResults.fallbackProvider != null || report.pipeline.pipelineStatus === "SUCCESS", "fallback or success");
});

test("Apify vazio", () => {
  const trace = buildTraceFromParts({
    query: "iphone 13",
    googleProducts: [googleProduct("Apple iPhone 13")],
    apifyProducts: [],
  });
  const providers = buildCommercialShadowProviderSummary(trace);
  assert(providers.google.ok === true, "google ok");
  assert(providers.apify.status === "empty", "apify empty");
});

test("ambos providers vazios", () => {
  const report = buildCommercialShadowDiagnosticReport({
    trace: buildTraceFromParts({ query: "inexistente", googleProducts: [], apifyProducts: [] }),
  });
  assert(report.pipeline.pipelineStatus === "EMPTY_SELECTION", "empty selection");
});

test("timeout", async () => {
  const result = await executeCommercialRuntimeShadow({
    query: "iphone 13",
    winner: googleProduct("Apple iPhone 13"),
    force: true,
    fetchGoogle: () => new Promise(() => {}),
    fetchApify: () => new Promise(() => {}),
  });
  const report = buildCommercialShadowDiagnosticReport({ shadowExecution: result });
  assert(
    report.pipeline.timedOut === true || report.pipeline.pipelineStatus === "TIMEOUT",
    "timeout captured"
  );
});

test("merge vazio", () => {
  const pipeline = buildCommercialShadowPipelineSummary(
    buildTraceFromParts({ query: "vazio", googleProducts: [], apifyProducts: [] })
  );
  assert(pipeline.mergeCount === 0, "merge zero");
  assert(pipeline.dedupeCount === 0, "dedupe zero");
});

test("dedup remove duplicatas", () => {
  const url = "https://shop.test/iphone-13";
  const trace = buildTraceFromParts({
    query: "iphone 13",
    googleProducts: [googleProduct("Apple iPhone 13", { link: url })],
    apifyProducts: [offer("Apple iPhone 13 128GB", { url })],
  });
  const pipeline = buildCommercialShadowPipelineSummary(trace);
  assert(pipeline.duplicatesRemoved >= 1, "duplicates removed");
});

test("alignment misaligned contabilizado", () => {
  const trace = buildTraceFromParts({
    query: "iphone 13",
    googleProducts: [googleProduct("Apple iPhone 13")],
    apifyProducts: [offer("Película iPhone 13", { price: 19 })],
  });
  const pipeline = buildCommercialShadowPipelineSummary(trace);
  assert(pipeline.alignmentRemoved >= 1, "alignment misaligned count");
});

test("reason summary derivado do pipeline", () => {
  const trace = buildTraceFromParts({
    query: "iphone 13",
    googleProducts: [googleProduct("Apple iPhone 13 128GB", { price: "R$ 3.500,00" })],
    apifyProducts: [
      offer("Apple iPhone 13 128GB", { price: 3200 }),
      offer("Película iPhone 13", { price: 20 }),
    ],
  });
  const reasons = buildCommercialShadowReasonSummary(trace.selection);
  assert(reasons.length > 0, "reasons");
  assert(reasons.some((line) => /score|preço|url|imagem|alinhamento/i.test(line)), "derived reason");
});

test("selection summary expõe score", () => {
  const trace = buildTraceFromParts({
    query: "monitor gamer",
    googleProducts: [googleProduct("Monitor Gamer 27")],
    apifyProducts: [offer("Monitor Gamer 27 165Hz")],
  });
  const selection = buildCommercialShadowSelectionSummary(trace.selection);
  assert(selection.commercialScore != null, "score");
});

test("provider summary nunca inventa domínio", () => {
  const google = summarizeCommercialShadowProviderResult(
    { ok: true, products: [{ title: "x" }] },
    COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING
  );
  assert(google.label === "Google Shopping", "label");
  assert(!String(google.label).includes("http"), "no url in label");
});

test("buildCommercialShadowSummary texto multiline", () => {
  const trace = buildTraceFromParts({
    query: "iphone 13",
    googleProducts: [googleProduct("Apple iPhone 13")],
    apifyProducts: [offer("Apple iPhone 13 128GB")],
  });
  const summary = buildCommercialShadowSummary({ trace });
  assert(summary.text.includes("Duplicates removed:"), "dup line");
  assert(summary.text.includes("Pipeline:"), "pipeline line");
});

test("executeCommercialRuntimeShadow preserva trace", async () => {
  const result = await runCommercialShadowPipeline({
    query: "iphone 13",
    fetchGoogle: async () => ({
      ok: true,
      products: [googleProduct("Apple iPhone 13")],
    }),
    fetchApify: async () => ({
      ok: true,
      products: [offer("Apple iPhone 13 128GB")],
    }),
  });
  assert(result.trace?.merge?.diagnostics, "merge diagnostics");
  assert(result.trace?.dedupe?.diagnostics, "dedupe diagnostics");
  assert(result.trace?.selection?.diagnostics, "selection diagnostics");
});

test("diagnostic report estrutura dev endpoint", () => {
  const trace = buildTraceFromParts({
    query: "iphone 13",
    googleProducts: [googleProduct("Apple iPhone 13")],
    apifyProducts: [offer("Apple iPhone 13 128GB")],
  });
  const report = buildCommercialShadowDiagnosticReport({ trace });
  assert(report.summary, "summary text");
  assert(report.diagnostics || report.providerResults, "sections");
  assert(report.providerResults.google, "google");
  assert(report.providerResults.apify, "apify");
  assert(report.selection, "selection");
  assert(report.pipeline, "pipeline");
  assert(report.timings, "timings");
});

test("endpoint dev existe", () => {
  const source = readFileSync(join(ROOT, "pages/api/dev/commercial-shadow-summary.js"), "utf8");
  assert(source.includes("buildCommercialShadowDiagnosticReport"), "uses summary");
  assert(source.includes("commercial-shadow-summary.js") || source.includes("Commercial Shadow Diagnostic Summary"), "endpoint module");
});

test("chat patch passivo sem alterar resposta", () => {
  const chat = readFileSync(join(ROOT, "pages/api/chat-gpt4o.js"), "utf8");
  assert(chat.includes("commercial_shadow_diagnostic_summary"), "tracer patch key");
  assert(chat.includes("buildCommercialShadowDiagnosticReport"), "import summary");
  assert(chat.includes("pipelineTracer.patch"), "passive tracer only");
});

test("sem regressão Decision Engine / Router / Data Layer", () => {
  for (const relativePath of GUARD_FILES) {
    const source = readFileSync(join(ROOT, relativePath), "utf8");
    assert(!source.includes("commercialShadowDiagnosticSummary"), `${relativePath} untouched`);
  }
});

test("commercialRuntimeShadow não altera seleção", () => {
  const source = readFileSync(join(ROOT, "lib/productSourceAdapter/commercialRuntimeShadow.js"), "utf8");
  assert(source.includes("selectCommercialOffers"), "uses selection engine");
  assert(!source.includes("commercialShadowDiagnosticSummary"), "no summary coupling in runtime");
});

test("preço atual e cores não aplicáveis ao summary module", () => {
  const source = readFileSync(
    join(ROOT, "lib/productSourceAdapter/commercialShadowDiagnosticSummary.js"),
    "utf8"
  );
  assert(!source.includes("openai"), "no llm");
  assert(!source.includes("hardcode"), "no hardcode keyword");
});

console.log(
  `\nPATCH Comercial 4E-A.1 — Commercial Shadow Diagnostic Summary Audit (${COMMERCIAL_SHADOW_DIAGNOSTIC_SUMMARY_VERSION})\n`
);

let pass = 0;
let fail = 0;

for (const spec of CASES) {
  try {
    const maybePromise = spec.fn();
    if (maybePromise && typeof maybePromise.then === "function") {
      await maybePromise;
    }
    pass += 1;
    console.log(`✓ ${spec.name}`);
  } catch (err) {
    fail += 1;
    console.log(`✗ ${spec.name} → ${err.message}`);
  }
}

const total = pass + fail;
console.log(`\nResultado: ${pass}/${total} (${total ? ((pass / total) * 100).toFixed(1) : "0.0"}%)`);
const verdict =
  fail === 0
    ? "A) COMMERCIAL SHADOW DIAGNOSTIC SUMMARY ROBUST"
    : "B) COMMERCIAL SHADOW DIAGNOSTIC SUMMARY GAP";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(fail > 0 ? 1 : 0);
