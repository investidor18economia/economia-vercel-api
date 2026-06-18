/**
 * PATCH Comercial 3C-C — Governed Fallback Intelligence Layer Audit
 *
 * Usage: node scripts/test-mia-governed-fallback-intelligence-layer-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  BANNED_FALLBACK_GENERIC_PHRASES,
  buildFallbackStructuredConsequences,
  buildGovernedFallbackExplanationFacts,
  containsUnsafeFallbackClaim,
  detectProductCategoryFromExplicitSignals,
  extractExplicitProductSignals,
} from "../lib/miaGovernedFallbackIntelligenceLayer.js";
import {
  buildProductExplanation,
  buildStructuredExplanationFacts,
  containsBannedGenericPhrase,
  findInventedSpecViolations,
  hasUsableDataLayerContent,
} from "../lib/miaProductExplanationBuilder.js";
import { containsArchitectureLeak } from "../lib/miaCommercialExplanationVerbalizer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const COGNITIVE_GUARD_FILES = [
  "lib/miaCognitiveRouter.js",
  "lib/miaRoutingDecisionContract.js",
  "lib/miaPrompt.js",
  "lib/miaToneComplianceGuard.js",
];

const REDMI_BUDS = {
  product_name: "Fone Bluetooth Redmi Buds 6 Play",
  price: "R$ 149,00",
};

const NOTEBOOK_GAMER = {
  product_name: "Notebook Gamer Lenovo LOQ-e Intel Core i7-12650HX 16GB 512GB SSD",
  price: "R$ 5.499,00",
};

const IPHONE_SPECS = {
  official_name: "iPhone 13",
  strengths: ["experiência fluida e previsível no dia a dia"],
  ideal_for: ["quem prioriza estabilidade e longevidade de software"],
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const CASES = [];

function test(name, fn) {
  CASES.push({ name, fn });
}

test("1. Fone Bluetooth Redmi Buds 6 Play gera explicação útil", () => {
  const result = buildProductExplanation({ product: REDMI_BUDS, hasDataLayer: false });
  assert(result.ok, result.error || "build failed");
  assert(/Bluetooth|sem fio|praticidade|rotina/i.test(result.text), result.text);
  assert(/Redmi Buds 6 Play|Redmi Buds/i.test(result.text), "product name");
});

test("2. Fone Bluetooth não inventa cancelamento de ruído", () => {
  const result = buildProductExplanation({ product: REDMI_BUDS, hasDataLayer: false });
  assert(!/cancelamento de ru[ií]do|anc\b|noise cancelling/i.test(result.text), result.text);
});

test("3. Fone Bluetooth não inventa bateria", () => {
  const result = buildProductExplanation({ product: REDMI_BUDS, hasDataLayer: false });
  assert(!/\d+\s*mah|\d+\s*h de bateria/i.test(result.text), result.text);
});

test("4. Fone Bluetooth não inventa codec", () => {
  const result = buildProductExplanation({ product: REDMI_BUDS, hasDataLayer: false });
  assert(!/aptx|ldac|codec/i.test(result.text), result.text);
});

test("5. Notebook i7 16GB 512GB SSD usa sinais explícitos", () => {
  const result = buildProductExplanation({ product: NOTEBOOK_GAMER, hasDataLayer: false });
  assert(result.ok, result.error || "build failed");
  assert(/i7|16GB|512GB|SSD|multitarefa|desempenho/i.test(result.text), result.text);
});

test("6. Notebook não inventa GPU quando não aparece", () => {
  const result = buildProductExplanation({
    product: { product_name: "Notebook Lenovo IdeaPad Intel Core i5 16GB 512GB SSD" },
    hasDataLayer: false,
  });
  assert(!/rtx|gtx|radeon/i.test(result.text), result.text);
});

test("7. Notebook gamer reconhece tradeoff de portabilidade com cautela", () => {
  const result = buildProductExplanation({ product: NOTEBOOK_GAMER, hasDataLayer: false });
  assert(/leveza|bateria|portabilidade|gamer/i.test(result.text), result.text);
});

test("8. Cadeira gamer gera explicação útil", () => {
  const result = buildProductExplanation({
    product: { product_name: "Cadeira Gamer DT Lite Reclinável" },
    hasDataLayer: false,
  });
  assert(/cadeira|sessões|horas|gamer/i.test(result.text), result.text);
});

test("9. Cadeira gamer não inventa material/reclinagem se não aparece", () => {
  const result = buildProductExplanation({
    product: { product_name: "Cadeira Gamer DT Lite" },
    hasDataLayer: false,
  });
  assert(!/couro|mesh|metal|reclin[aá]vel confirmad/i.test(result.text), result.text);
  assert(/confirmar ergonomia|dimensões|garantia/i.test(result.text), result.text);
});

test("10. Monitor 144Hz usa taxa explícita", () => {
  const result = buildProductExplanation({
    product: { product_name: "Monitor Gamer LG UltraGear 27 144Hz" },
    hasDataLayer: false,
  });
  assert(/144Hz|144hz|fluidez/i.test(result.text), result.text);
});

test("11. TV 4K usa 4K explícito", () => {
  const result = buildProductExplanation({
    product: { product_name: "Smart TV Samsung 55 4K UHD" },
    hasDataLayer: false,
  });
  assert(/4K|UHD|imagem/i.test(result.text), result.text);
});

test("12. Produto genérico sem sinais úteis cai em fallback cauteloso", () => {
  const result = buildProductExplanation({
    product: { product_name: "Produto Genérico XYZ123" },
    hasDataLayer: false,
  });
  assert(result.ok, result.error || "build failed");
  assert(/referência inicial|garantia|reputação da loja/i.test(result.text), result.text);
});

test("13. Nenhuma resposta menciona Data Layer", () => {
  const samples = [
    buildProductExplanation({ product: REDMI_BUDS, hasDataLayer: false }),
    buildProductExplanation({ product: NOTEBOOK_GAMER, hasDataLayer: false }),
  ];
  for (const sample of samples) {
    assert(!containsArchitectureLeak(sample.text), sample.text);
  }
});

test("14. Nenhuma resposta menciona provider", () => {
  const result = buildProductExplanation({
    product: { ...REDMI_BUDS, provider: "mercadolivre", source: "Mercado Livre" },
    hasDataLayer: false,
  });
  assert(!/mercadolivre|provider|google shopping/i.test(result.text), result.text);
});

test("15. Nenhuma resposta menciona ranking/winner/router/adapter", () => {
  const result = buildProductExplanation({ product: REDMI_BUDS, hasDataLayer: false });
  assert(!/ranking|winner|router|adapter|pipeline/i.test(result.text), result.text);
});

test("16. Nenhuma especificação é inventada", () => {
  const result = buildProductExplanation({ product: REDMI_BUDS, hasDataLayer: false });
  assert(findInventedSpecViolations(result.text, "fone bluetooth redmi buds 6 play").length === 0);
});

test("17. Nenhuma frase genérica proibida aparece", () => {
  const result = buildProductExplanation({ product: REDMI_BUDS, hasDataLayer: false });
  assert(!containsBannedGenericPhrase(result.text), result.text);
  assert(!containsUnsafeFallbackClaim(result.text, "fone bluetooth redmi buds 6 play"), result.text);
});

test("18. Data Layer continua tendo prioridade sobre fallback", () => {
  const facts = buildStructuredExplanationFacts({
    product: { product_name: "iPhone 13" },
    trustedSpecs: IPHONE_SPECS,
    hasDataLayer: true,
  });
  assert(facts.mode === "data_layer", facts.mode);
});

test("19. Produto com Data Layer não usa fallback", () => {
  const result = buildProductExplanation({
    product: { product_name: "iPhone 13" },
    trustedSpecs: IPHONE_SPECS,
    hasDataLayer: true,
  });
  assert(result.source === "data_layer", result.source);
  assert(/experiência fluida|estabilidade|dispositivo principal|costuma aparecer/i.test(result.text), result.text);
});

test("20. Produto sem Data Layer usa fallback governado", () => {
  const facts = buildStructuredExplanationFacts({ product: REDMI_BUDS, hasDataLayer: false });
  assert(facts.mode === "governed_fallback", facts.mode);
  assert(facts.strengthConsequences.length > 0, "strength consequences");
});

test("extractExplicitProductSignals is extensible and explicit", () => {
  const signals = extractExplicitProductSignals(REDMI_BUDS);
  assert(signals.some((signal) => signal.id === "wireless"), "wireless signal");
  assert(detectProductCategoryFromExplicitSignals(REDMI_BUDS) === "audio", "audio category");
});

test("cognitive layers untouched", () => {
  for (const relativePath of COGNITIVE_GUARD_FILES) {
    const content = readFileSync(join(ROOT, relativePath), "utf8");
    assert(!content.includes("miaGovernedFallbackIntelligenceLayer"), `${relativePath} untouched`);
  }
});

test("builder imports governed fallback layer", () => {
  const source = readFileSync(join(ROOT, "lib/miaProductExplanationBuilder.js"), "utf8");
  assert(source.includes("buildGovernedFallbackExplanationFacts"), "builder wired");
});

for (const phrase of BANNED_FALLBACK_GENERIC_PHRASES) {
  test(`banned fallback phrase blocked: ${phrase}`, () => {
    assert(containsUnsafeFallbackClaim(`Este produto é ${phrase} demais`), phrase);
  });
}

console.log("PATCH Comercial 3C-C — Governed Fallback Intelligence Layer Audit\n");

let pass = 0;
let fail = 0;

for (const spec of CASES) {
  try {
    spec.fn();
    pass += 1;
    console.log(`✓ ${spec.name}`);
  } catch (err) {
    fail += 1;
    console.log(`✗ ${spec.name} → ${err.message}`);
  }
}

const total = pass + fail;
console.log(`\nResultado: ${pass}/${total} (${((pass / total) * 100).toFixed(1)}%)`);
const verdict =
  fail === 0
    ? "A) GOVERNED FALLBACK INTELLIGENCE LAYER ROBUST"
    : "B) GOVERNED FALLBACK INTELLIGENCE LAYER GAP";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(fail === 0 ? 0 : 1);
