/**
 * PATCH Comercial 3C-D — Commercial Explanation UX Cleanup Audit
 *
 * Usage: node scripts/test-mia-commercial-explanation-ux-cleanup-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  BANNED_MECHANISM_PHRASES,
  BANNED_REDUNDANT_PRICE_PHRASES,
  COMMERCIAL_EXPLANATION_VERBALIZER_VERSION,
  REPETITION_AUDIT_TERMS,
  containsArchitectureLeak,
  containsMechanismLeak,
  containsRedundantPricePhrase,
  countTermRepetitions,
  verbalizeCommercialExplanation,
} from "../lib/miaCommercialExplanationVerbalizer.js";
import {
  buildGovernedFallbackExplanationFacts,
} from "../lib/miaGovernedFallbackIntelligenceLayer.js";
import {
  buildProductExplanation,
  findInventedSpecViolations,
  hasUsableDataLayerContent,
} from "../lib/miaProductExplanationBuilder.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const GUARD_FILES = [
  "lib/miaCognitiveRouter.js",
  "lib/miaRoutingDecisionContract.js",
  "lib/miaGovernedFallbackIntelligenceLayer.js",
  "lib/miaConsequenceTranslationLayer.js",
  "lib/miaProductExplanationBuilder.js",
];

const REDMI_BUDS = { product_name: "Fone Bluetooth Redmi Buds 6 Play", price: "R$ 179,99" };
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

function buildFallbackText(product) {
  const result = buildProductExplanation({ product, hasDataLayer: false });
  assert(result.ok, result.error || "build failed");
  return result.text;
}

function maxRepetition(text, term) {
  return countTermRepetitions(text, term);
}

const CASES = [];

function test(name, fn) {
  CASES.push({ name, fn });
}

test("1. Não exibe Encontrei oferta por", () => {
  const text = buildFallbackText(REDMI_BUDS);
  assert(!/encontrei oferta por/i.test(text), text);
});

test("2. Não exibe Oferta encontrada por", () => {
  const text = buildFallbackText(NOTEBOOK_GAMER);
  assert(!/oferta encontrada por/i.test(text), text);
});

test("3. Não exibe preço redundante", () => {
  const text = buildFallbackText({ ...REDMI_BUDS, price: "R$ 179,99" });
  assert(!containsRedundantPricePhrase(text), text);
  assert(!/R\$ 179,99|179,99/.test(text), text);
});

test("4. Não exibe Pelo nome da oferta", () => {
  const text = buildFallbackText(REDMI_BUDS);
  assert(!/pelo nome da oferta/i.test(text), text);
});

test("5. Não exibe Pelo título do anúncio", () => {
  const text = buildFallbackText(NOTEBOOK_GAMER);
  assert(!/pelo t[ií]tulo do an[uú]ncio/i.test(text), text);
});

test("6. Não exibe explicação de mecanismo interno", () => {
  const samples = [
    buildFallbackText(REDMI_BUDS),
    buildFallbackText(NOTEBOOK_GAMER),
    buildFallbackText({ product_name: "Monitor Gamer LG UltraGear 27 144Hz" }),
    buildFallbackText({ product_name: "Smart TV Samsung 55 4K UHD" }),
    buildFallbackText({ product_name: "PlayStation 5 Slim" }),
  ];
  for (const text of samples) {
    assert(!containsMechanismLeak(text), text);
  }
});

test("7. Reduz repetição de Bluetooth", () => {
  const text = buildFallbackText(REDMI_BUDS);
  assert(maxRepetition(text, "bluetooth") <= 1, text);
});

test("8. Reduz repetição de Gamer", () => {
  const text = buildFallbackText(NOTEBOOK_GAMER);
  assert(maxRepetition(text, "gamer") <= 2, text);
});

test("9. Reduz repetição de Notebook", () => {
  const text = buildFallbackText(NOTEBOOK_GAMER);
  assert(maxRepetition(text, "notebook") <= 2, text);
});

test("10. Reduz repetição de Monitor", () => {
  const text = buildFallbackText({ product_name: "Monitor Gamer LG UltraGear 27 144Hz" });
  assert(maxRepetition(text, "monitor") <= 2, text);
});

test("11. Reduz repetição de TV", () => {
  const text = buildFallbackText({ product_name: "Smart TV Samsung 55 4K UHD" });
  assert(maxRepetition(text, "tv") <= 2, text);
});

test("12. Reduz repetição de Console", () => {
  const text = buildFallbackText({ product_name: "PlayStation 5 Slim" });
  assert(maxRepetition(text, "console") <= 2, text);
});

test("13. Tradeoff usa linguagem natural", () => {
  const text = buildFallbackText(REDMI_BUDS);
  assert(/quem procura isolamento forte|quem procura recursos mais avançados/i.test(text), text);
});

test("14. Não usa não tratar esse tipo...", () => {
  const text = buildFallbackText(REDMI_BUDS);
  assert(!/n[aã]o tratar esse tipo/i.test(text), text);
});

test("15. Mantém cautela", () => {
  const text = buildFallbackText(REDMI_BUDS);
  assert(/isolamento forte|microfone avan[cç]ado|[aá]udio premium|praticidade e pre[cç]o/i.test(text), text);
});

test("16. Não inventa specs", () => {
  const text = buildFallbackText(REDMI_BUDS);
  assert(findInventedSpecViolations(text, "fone bluetooth redmi buds 6 play").length === 0);
});

test("17. Não menciona Data Layer", () => {
  assert(!containsArchitectureLeak(buildFallbackText(REDMI_BUDS)));
});

test("18. Não menciona provider", () => {
  const text = buildFallbackText({ ...REDMI_BUDS, provider: "mercadolivre", source: "Mercado Livre" });
  assert(!/mercadolivre|provider|google shopping/i.test(text), text);
});

test("19. Não menciona ranking", () => {
  assert(!/ranking/i.test(buildFallbackText(REDMI_BUDS)));
});

test("20. Não menciona winner", () => {
  assert(!/winner/i.test(buildFallbackText(REDMI_BUDS)));
});

test("21. Não menciona router", () => {
  assert(!/router/i.test(buildFallbackText(REDMI_BUDS)));
});

test("22. Não menciona pipeline interno", () => {
  assert(!/pipeline interno/i.test(buildFallbackText(REDMI_BUDS)));
});

test("23. Linguagem mais natural", () => {
  const text = buildFallbackText(REDMI_BUDS);
  assert(/combina bem|O foco aqui est[aá]|O principal valor est[aá]/i.test(text), text);
  assert(!/parece fazer sentido|pelo nome da oferta/i.test(text), text);
});

test("24. Linguagem mais confiante", () => {
  const text = buildFallbackText(NOTEBOOK_GAMER);
  assert(/combina bem|Com I7|o foco est[aá]/i.test(text), text);
  assert(!/parece estar|talvez seja|provavelmente esteja/i.test(text), text);
});

test("25. Linguagem continua segura", () => {
  const text = buildFallbackText(REDMI_BUDS);
  assert(!/cancelamento de ru[ií]do|aptx|\d+\s*mah/i.test(text), text);
  assert(!containsMechanismLeak(text), text);
});

test("Data Layer verbalization also avoids redundant price", () => {
  const result = buildProductExplanation({
    product: { product_name: "iPhone 13", price: "R$ 3.899,00" },
    trustedSpecs: IPHONE_SPECS,
    hasDataLayer: true,
  });
  assert(result.ok, result.error || "build failed");
  assert(!containsRedundantPricePhrase(result.text), result.text);
});

test("verbalizer version bumped for UX cleanup", () => {
  assert(COMMERCIAL_EXPLANATION_VERBALIZER_VERSION === "3C-E.1");
});

test("only verbalizer layer changed for UX cleanup wiring", () => {
  const builder = readFileSync(join(ROOT, "lib/miaProductExplanationBuilder.js"), "utf8");
  assert(!builder.includes("3C-D"), "builder version unchanged");
  for (const relativePath of GUARD_FILES) {
    const content = readFileSync(join(ROOT, relativePath), "utf8");
    assert(!content.includes("3C-D"), `${relativePath} untouched by UX cleanup`);
  }
});

test("governed facts still drive verbalizer without mutation", () => {
  const facts = buildGovernedFallbackExplanationFacts(REDMI_BUDS);
  const paragraphs = verbalizeCommercialExplanation(facts);
  assert(paragraphs.length >= 2, "paragraphs");
  assert(facts.strengthConsequences.length > 0, "facts preserved");
  assert(hasUsableDataLayerContent(IPHONE_SPECS), "data layer sanity");
});

for (const phrase of BANNED_REDUNDANT_PRICE_PHRASES) {
  test(`redundant price phrase blocked: ${phrase}`, () => {
    assert(containsRedundantPricePhrase(`Resumo final. ${phrase} R$ 10.`), phrase);
  });
}

for (const phrase of BANNED_MECHANISM_PHRASES.slice(0, 6)) {
  test(`mechanism phrase detectable: ${phrase}`, () => {
    assert(containsMechanismLeak(`Análise comercial. ${phrase} algo útil.`), phrase);
  });
}

for (const term of REPETITION_AUDIT_TERMS) {
  test(`repetition helper tracks ${term}`, () => {
    assert(countTermRepetitions(`${term} e ${term}`, term) === 2, term);
  });
}

console.log("PATCH Comercial 3C-D — Commercial Explanation UX Cleanup Audit\n");

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
    ? "A) COMMERCIAL EXPLANATION UX CLEANUP ROBUST"
    : "B) COMMERCIAL EXPLANATION UX CLEANUP GAP";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(fail === 0 ? 0 : 1);
