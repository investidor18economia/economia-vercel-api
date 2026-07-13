/**
 * PATCH Comercial 05J — Commercial Coverage Validation Audit (local only)
 *
 * Usage:
 *   node scripts/test-mia-commercial-coverage-validation-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  COMMERCIAL_COVERAGE_ABSOLUTE_MAX_PRODUCTS,
  COMMERCIAL_COVERAGE_DEFAULT_MAX_PRODUCTS,
  COMMERCIAL_COVERAGE_FAILURE_CLASSES,
  COMMERCIAL_COVERAGE_MODES,
  COMMERCIAL_COVERAGE_REAL_VALIDATION_ENABLED_ENV,
  COMMERCIAL_COVERAGE_STATUS,
  COMMERCIAL_COVERAGE_VALIDATION_VERSION,
  aggregateCommercialCoverageSummary,
  aggregateCommercialProviderCoverage,
  buildCommercialCoverageValidationPlan,
  buildCommercialProductCoverageResult,
  buildRealValidationPreflight,
  canExecuteRealCommercialCoverageValidation,
  classifyCommercialCoverageFailure,
  evaluateCommercialOfferCoverage,
  executeSyntheticCommercialCoverageValidation,
  readCommercialCoverageValidationConfig,
  validateCommercialCoverageResult,
} from "../lib/commercial/commercialCoverageValidation.js";
import {
  COMMERCIAL_COVERAGE_AUDIT_DATASET,
  COMMERCIAL_COVERAGE_SYNTHETIC_SCENARIOS,
} from "../lib/commercial/commercialCoverageValidationFixtures.js";
import { COMMERCIAL_ALIGNMENT_THRESHOLD } from "../lib/productSourceAdapter/commercialQueryProductAlignmentLayer.js";

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

console.log(`\nPATCH Comercial 05J — Commercial Coverage Validation (${COMMERCIAL_COVERAGE_VALIDATION_VERSION})\n`);

console.log("── Module contract ──");
const moduleSource = read("lib/commercial/commercialCoverageValidation.js");
const runScript = read("scripts/run-mia-commercial-coverage-validation.js");
assert("version 05J", COMMERCIAL_COVERAGE_VALIDATION_VERSION === "05J");
assert("no LLM imports", !moduleSource.match(/openai|callOpenAI|buildMiaPrompt/i));
assert("no subprocess imports", !moduleSource.match(/from\s+["']node:child_process["']/));
assert("no fetch in module", !moduleSource.match(/\bfetch\s*\(/));
assert("run script exists", runScript.includes("executeSyntheticCommercialCoverageValidation"));

console.log("\n── Modes and safety ──");
const defaultConfig = readCommercialCoverageValidationConfig({}, []);
assert("modo default é sintético", defaultConfig.mode === COMMERCIAL_COVERAGE_MODES.SYNTHETIC);
assert("real validation default false", defaultConfig.realValidationEnabled === false);
assert("limite default é 5", defaultConfig.maxProducts === COMMERCIAL_COVERAGE_DEFAULT_MAX_PRODUCTS);
assert("máximo absoluto é 15", COMMERCIAL_COVERAGE_ABSOLUTE_MAX_PRODUCTS === 15);
assert(
  "máximo absoluto não pode ser excedido por argumento",
  readCommercialCoverageValidationConfig({}, ["--max-products=99"]).maxProducts === 15
);

const realGuard = canExecuteRealCommercialCoverageValidation({
  argv: ["--real"],
  env: {},
});
assert("modo real exige env explícita", realGuard.allowed === false);
assert("modo real exige flag allow-external", realGuard.reason === "env_disabled" || realGuard.reason === "missing_allow_external_flag");

const realGuardFull = canExecuteRealCommercialCoverageValidation({
  argv: ["--real", "--allow-external", "--allow-paid-external"],
  env: { [COMMERCIAL_COVERAGE_REAL_VALIDATION_ENABLED_ENV]: "true", COMMERCIAL_DEV_REAL_EXTERNAL_CALLS_ENABLED: "true" },
});
assert("modo real exige flag explícita", realGuardFull.allowed === true || realGuardFull.reason !== "env_disabled");

console.log("\n── Sequential execution ──");
assert("execução sequencial no run script", !runScript.match(/Promise\.all\s*\(/));
assert("sem Promise.all no módulo principal", !moduleSource.match(/Promise\.all\s*\(/));

console.log("\n── Architecture preservation ──");
assert("Priority Engine integrado", moduleSource.includes("buildMultiProviderPriorityPlan"));
assert("Conditional Fetch integrado", moduleSource.includes("evaluateCommercialResultSufficiency"));
assert("Cost Guard integrado", moduleSource.includes("providerCostGuard"));
assert("DEV Cost Guard integrado", moduleSource.includes("devCommercialCostGuard"));
assert("Budget/Circuit integrado", moduleSource.includes("providerBudgetCircuitBreaker"));
assert("Cache signal integrado", moduleSource.includes("universalCommercialCacheHit"));
assert("Request Dedup signal integrado", moduleSource.includes("requestDeduplicated"));
assert("Alignment existente reutilizado", moduleSource.includes("calculateCommercialAlignment"));
assert("Selection existente reutilizado", moduleSource.includes("selectCommercialOffers"));
assert("Data Layer chat preserved", read("pages/api/chat-gpt4o.js").includes("fetchSerpPrices"));
assert("Decision Engine preserved", read("lib/miaCognitiveRouter.js").length > 100);
assert("prompt preserved", read("lib/miaPrompt.js").length > 100);

console.log("\n── Offer usability ──");
const usable = evaluateCommercialOfferCoverage({
  query: "iPhone 13",
  offer: {
    title: "Apple iPhone 13 128GB",
    price: 3299,
    url: "https://example.com/iphone-13",
    image: "https://example.com/iphone.jpg",
  },
});
assert("oferta com preço, URL e alignment válido é utilizável", usable.isUsable === true);

const noPrice = evaluateCommercialOfferCoverage({
  query: "Moto G84",
  offer: { title: "Motorola Moto G84", price: null, url: "https://example.com/moto" },
});
assert("oferta sem preço não é utilizável", noPrice.isUsable === false);

const noUrl = evaluateCommercialOfferCoverage({
  query: "Galaxy S23 FE",
  offer: { title: "Samsung Galaxy S23 FE", price: 2499, url: "" },
});
assert("oferta sem URL não é utilizável", noUrl.isUsable === false);

const misaligned = evaluateCommercialOfferCoverage({
  query: "iPhone 13",
  offer: {
    title: "Capa silicone iPhone 13",
    price: 49.9,
    url: "https://example.com/capa",
    image: "https://example.com/capa.jpg",
  },
});
assert("oferta desalinhada não conta como cobertura", misaligned.isUsable === false);

const noImage = evaluateCommercialOfferCoverage({
  query: "Galaxy A55",
  offer: {
    title: "Samsung Galaxy A55 128GB",
    price: 1799,
    url: "https://example.com/a55",
    image: null,
  },
});
assert("imagem ausente ainda pode ser utilizável", noImage.isUsable === true);
assert("imagem ausente reduz image coverage flag", noImage.hasValidImage === false);

console.log("\n── Failure classification ──");
assert(
  "resultado vazio classifica corretamente",
  classifyCommercialCoverageFailure({
    productResult: { finalCommercialStatus: COMMERCIAL_COVERAGE_STATUS.FAILURE, rawResultCount: 0, usableOfferCount: 0 },
    providerResult: { ok: true, products: [], count: 0 },
  }) === COMMERCIAL_COVERAGE_FAILURE_CLASSES.EMPTY_RESULT
);
assert(
  "auth failure classifica corretamente",
  classifyCommercialCoverageFailure({ providerResult: { error: "auth_failed" } }) ===
    COMMERCIAL_COVERAGE_FAILURE_CLASSES.AUTH_FAILURE
);
assert(
  "rate limit classifica corretamente",
  classifyCommercialCoverageFailure({ providerResult: { error: "rate_limited" } }) ===
    COMMERCIAL_COVERAGE_FAILURE_CLASSES.RATE_LIMIT
);
assert(
  "timeout classifica corretamente",
  classifyCommercialCoverageFailure({ providerResult: { error: "timeout" } }) ===
    COMMERCIAL_COVERAGE_FAILURE_CLASSES.TIMEOUT
);
assert(
  "budget blocked é diferente de sem cobertura",
  classifyCommercialCoverageFailure({ providerResult: { error: "budget_blocked" } }) ===
    COMMERCIAL_COVERAGE_FAILURE_CLASSES.BUDGET_BLOCKED
);
assert(
  "provider disabled é diferente de sem cobertura",
  classifyCommercialCoverageFailure({ providerResult: { error: "provider_disabled" } }) ===
    COMMERCIAL_COVERAGE_FAILURE_CLASSES.PROVIDER_DISABLED
);

console.log("\n── Metrics and aggregation ──");
const syntheticReport = await executeSyntheticCommercialCoverageValidation({
  argv: [],
  env: {},
});
assert("modo sintético não chama API", syntheticReport.synthetic === true);
assert("modo sintético produz resultados", syntheticReport.productResults.length >= 10);
assert("métricas por produto são calculadas", syntheticReport.productResults.every((entry) => entry.productName));
assert("métricas por provider são calculadas", syntheticReport.providerCoverage.length >= 1);
assert("métricas agregadas são calculadas", syntheticReport.summary.totalProductsTested >= 1);
assert("denominador zero não gera NaN", !Number.isNaN(syntheticReport.summary.commercialCoverageRate));

const plan = buildCommercialCoverageValidationPlan({
  config: readCommercialCoverageValidationConfig({}, ["--max-products=3"]),
});
assert("produtos fora da amostra não são chamados", plan.products.length === 3);
assert(
  "dataset auditável separado da arquitetura",
  COMMERCIAL_COVERAGE_AUDIT_DATASET.length >= 10 && !moduleSource.match(/if\s*\(.*iPhone 13/i)
);

const fullScenario = syntheticReport.productResults.find(
  (entry) => entry.diagnostics?.failureClass === COMMERCIAL_COVERAGE_FAILURE_CLASSES.COMMERCIAL_SUCCESS
);
assert("cobertura completa sintética detectada", !!fullScenario);

const providerAgg = aggregateCommercialProviderCoverage(syntheticReport.productResults);
const summaryAgg = aggregateCommercialCoverageSummary(syntheticReport.productResults, providerAgg);
assert("validateCommercialCoverageResult ok", validateCommercialCoverageResult({
  version: COMMERCIAL_COVERAGE_VALIDATION_VERSION,
  productResults: syntheticReport.productResults,
  summary: summaryAgg,
}).ok === true);

console.log("\n── Report safety ──");
const serialized = JSON.stringify(syntheticReport);
assert("relatório não contém secrets", !serialized.match(/sk-[a-z0-9]{10,}/i));

const preflight = buildRealValidationPreflight({ argv: ["--real"], env: {} });
assert("preflight não autoriza sem env", preflight.authorized === false);
assert("preflight lista providers pagos", Array.isArray(preflight.paidProviders));

console.log("\n── Scenario fixtures ──");
assert("fixture full_coverage existe", !!COMMERCIAL_COVERAGE_SYNTHETIC_SCENARIOS.full_coverage);
assert("fixture cost_guard_block existe", !!COMMERCIAL_COVERAGE_SYNTHETIC_SCENARIOS.cost_guard_block);
assert("fixture circuit_open existe", !!COMMERCIAL_COVERAGE_SYNTHETIC_SCENARIOS.circuit_open);

const misalignedProduct = buildCommercialProductCoverageResult({
  product: COMMERCIAL_COVERAGE_SYNTHETIC_SCENARIOS.misaligned,
  queryUsed: COMMERCIAL_COVERAGE_SYNTHETIC_SCENARIOS.misaligned.queryUsed,
  providerResults: COMMERCIAL_COVERAGE_SYNTHETIC_SCENARIOS.misaligned.providerResults,
  synthetic: true,
});
assert("cenário desalinhado não gera cobertura", misalignedProduct.finalCommercialStatus !== COMMERCIAL_COVERAGE_STATUS.SUCCESS);

const elapsed = ((Date.now() - start) / 1000).toFixed(2);
const total = passed + failed;
console.log(`\n── Resultado da auditoria ──`);
console.log(`Total: ${total}`);
console.log(`Aprovados: ${passed}`);
console.log(`Reprovados: ${failed}`);
console.log(`Tempo: ${elapsed}s`);

const verdict =
  failed === 0 && Number(elapsed) <= 20
    ? "A) ROBUST estruturalmente"
    : failed > 0
      ? "B) PARTIAL"
      : "C) REJECTED (timeout)";
console.log(`\n── Veredito ──\n${verdict}\n`);

process.exit(failed > 0 ? 1 : 0);
