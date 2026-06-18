/**
 * PATCH Comercial 3C-E — Commercial Micro-Consequence Enrichment Audit
 *
 * Usage: node scripts/test-mia-commercial-micro-consequence-enrichment-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  COMMERCIAL_MICRO_CONSEQUENCE_LAYER_VERSION,
  TOKEN_MICRO_CONSEQUENCES,
  buildMicroConsequences,
  containsInventedMicroClaim,
  enrichConsequencesWithMicroImpacts,
  isValidMicroConsequence,
} from "../lib/miaCommercialMicroConsequenceLayer.js";
import { containsArchitectureLeak } from "../lib/miaCommercialExplanationVerbalizer.js";
import {
  buildProductExplanation,
  buildStructuredExplanationFacts,
  findInventedSpecViolations,
} from "../lib/miaProductExplanationBuilder.js";
import { translateDataLayerFieldsToConsequences } from "../lib/miaConsequenceTranslationLayer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const GUARD_FILES = [
  "lib/miaCognitiveRouter.js",
  "lib/miaRoutingDecisionContract.js",
  "lib/miaGovernedFallbackIntelligenceLayer.js",
  "lib/miaConsequenceTranslationLayer.js",
];

const REDMI_BUDS = { product_name: "Fone Bluetooth Redmi Buds 6 Play", price: "R$ 179,99" };
const NOTEBOOK_GAMER = {
  product_name: "Notebook Gamer Lenovo LOQ-e Intel Core i7-12650HX 16GB 512GB SSD",
  price: "R$ 5.499,00",
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function microFromToken(token) {
  const list = buildMicroConsequences({ sourceTokens: [token] });
  assert(list.length > 0, `missing micro for ${token}`);
  return list[0];
}

function explanation(product, trustedSpecs = null, hasDataLayer = false) {
  const result = buildProductExplanation({ product, trustedSpecs, hasDataLayer });
  assert(result.ok, result.error || "build failed");
  return result.text;
}

const CASES = [];

function test(name, fn) {
  CASES.push({ name, fn });
}

test("1. desempenho_forte gera micro-consequência", () => {
  assert(/várias tarefas ficam abertas/i.test(microFromToken("desempenho_forte")));
});

test("2. camera_consistente gera micro-consequência", () => {
  assert(/situações rápidas/i.test(microFromToken("camera_consistente")));
});

test("3. video_forte gera micro-consequência", () => {
  assert(/registro precisa sair bem/i.test(microFromToken("video_forte")));
});

test("4. bluetooth gera micro-consequência", () => {
  const text = explanation(REDMI_BUDS, null, false);
  assert(/deslocamentos, trabalho e uso fora de casa/i.test(text), text);
});

test("5. notebook i7 gera micro-consequência", () => {
  const micro = buildMicroConsequences({
    strengthConsequences: [
      "Com I7, 16GB de RAM e SSD de 512GB, o foco está em desempenho acima de notebooks básicos",
    ],
    allowedEvidence: "notebook gamer lenovo i7 16gb 512gb ssd",
  })[0];
  assert(/planilhas, reuniões|várias abas|tarefas ficam abertas/i.test(micro), micro);
});

test("6. 16GB gera micro-consequência", () => {
  const micro = buildMicroConsequences({
    strengthConsequences: ["Com 16GB de RAM, o foco está em multitarefa no dia a dia"],
    allowedEvidence: "notebook 16gb ram",
  })[0];
  assert(/navegador, reuniões e aplicativos/i.test(micro), micro);
});

test("7. SSD gera micro-consequência", () => {
  const micro = buildMicroConsequences({
    strengthConsequences: ["Com SSD de 512GB, o foco está em armazenamento rápido"],
    allowedEvidence: "notebook 512gb ssd",
  })[0];
  assert(/abertura de programas e arquivos/i.test(micro), micro);
});

test("8. TV gera micro-consequência", () => {
  const text = explanation({ product_name: "Smart TV Samsung 55 4K UHD" }, null, false);
  assert(/filmes, séries|conteúdo visual/i.test(text), text);
});

test("9. monitor gera micro-consequência", () => {
  const text = explanation({ product_name: "Monitor Gamer LG UltraGear 27 144Hz" }, null, false);
  assert(/navegação|conteúdo compatível|uso mais dinâmico/i.test(text), text);
});

test("10. cadeira gamer gera micro-consequência", () => {
  const text = explanation({ product_name: "Cadeira Gamer DT Lite Reclinável" }, null, false);
  assert(/sessões longas|conforto ao sentar/i.test(text), text);
});

test("11. não inventa bateria", () => {
  const text = explanation(REDMI_BUDS, null, false);
  assert(!/\d+\s*mah|\d+\s*h de bateria/i.test(text), text);
});

test("12. não inventa ANC", () => {
  const text = explanation(REDMI_BUDS, null, false);
  assert(!/cancelamento de ru[ií]do|anc\b/i.test(text), text);
});

test("13. não inventa benchmark", () => {
  const text = explanation(NOTEBOOK_GAMER, null, false);
  assert(!/benchmark/i.test(text), text);
});

test("14. não inventa FPS", () => {
  const text = explanation({ product_name: "Monitor Gamer LG UltraGear 27 144Hz" }, null, false);
  assert(!/\b\d+\s*fps\b/i.test(text), text);
});

test("15. não inventa câmera inexistente", () => {
  const text = explanation(REDMI_BUDS, null, false);
  assert(!/\d+\s*mp|sensor de câmera/i.test(text), text);
});

test("16. não menciona Data Layer", () => {
  assert(!containsArchitectureLeak(explanation(REDMI_BUDS, null, false)));
});

test("17. não menciona provider", () => {
  const text = explanation({ ...REDMI_BUDS, provider: "mercadolivre" }, null, false);
  assert(!/provider|mercadolivre/i.test(text), text);
});

test("18. não menciona ranking", () => {
  assert(!/ranking/i.test(explanation(REDMI_BUDS, null, false)));
});

test("19. não menciona winner", () => {
  assert(!/winner/i.test(explanation(REDMI_BUDS, null, false)));
});

test("20. mantém resposta curta", () => {
  const text = explanation(REDMI_BUDS, null, false);
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  assert(sentences.length <= 4, `too many sentences: ${sentences.length}`);
  assert(text.length <= 900, `too long: ${text.length}`);
});

test("21. mantém tradeoff", () => {
  const text = explanation(REDMI_BUDS, null, false);
  assert(/quem procura isolamento forte|recursos mais avançados/i.test(text), text);
});

test("22. mantém consequência principal", () => {
  const text = explanation(REDMI_BUDS, null, false);
  assert(/combina bem|uso sem fio|conveniência diária/i.test(text), text);
});

test("23. melhora valor percebido", () => {
  const text = explanation(REDMI_BUDS, null, false);
  assert(/costuma ser percebido|deslocamentos, trabalho/i.test(text), text);
});

test("24. linguagem humana", () => {
  const text = explanation(
    { product_name: "iPhone 13" },
    {
      official_name: "iPhone 13",
      strengths: ["experiência fluida e previsível no dia a dia"],
      ideal_for: ["quem prioriza estabilidade e longevidade de software"],
      weaknesses: ["a tela de 60 Hz pode parecer menos fluida para quem veio de telas mais rápidas"],
    },
    true
  );
  assert(/Isso costuma aparecer|dispositivo principal|troca necessária/i.test(text), text);
});

test("25. sem regressões de integração", () => {
  const facts = enrichConsequencesWithMicroImpacts(
    buildStructuredExplanationFacts({ product: REDMI_BUDS, hasDataLayer: false })
  );
  assert(facts.primaryMicroConsequence, "primary micro missing");
  assert(Array.isArray(facts.microConsequences), "micro list missing");
  const translated = translateDataLayerFieldsToConsequences({
    strengths: ["desempenho_forte"],
    ideal_for: ["trabalho_multitarefa"],
  });
  assert(translated.strengths.length > 0, "translation untouched");
});

test("builder wires micro enrichment layer", () => {
  const source = readFileSync(join(ROOT, "lib/miaProductExplanationBuilder.js"), "utf8");
  assert(source.includes("enrichConsequencesWithMicroImpacts"), "builder wired");
  assert(COMMERCIAL_MICRO_CONSEQUENCE_LAYER_VERSION === "3C-E.1");
});

test("isValidMicroConsequence rejects invented claims", () => {
  assert(!isValidMicroConsequence("Bateria de 5000 mAh garantida"));
  assert(isValidMicroConsequence(TOKEN_MICRO_CONSEQUENCES.bluetooth));
});

test("containsInventedMicroClaim detects unsafe micro", () => {
  assert(containsInventedMicroClaim("Roda a 120 fps sem esforço"));
});

test("cognitive and fallback layers untouched", () => {
  for (const relativePath of GUARD_FILES) {
    const content = readFileSync(join(ROOT, relativePath), "utf8");
    assert(!content.includes("miaCommercialMicroConsequenceLayer"), `${relativePath} untouched`);
  }
});

test("governed fallback facts unchanged at source", () => {
  const text = explanation(REDMI_BUDS, null, false);
  assert(findInventedSpecViolations(text, "fone bluetooth redmi buds 6 play").length === 0);
});

console.log("PATCH Comercial 3C-E — Commercial Micro-Consequence Enrichment Audit\n");

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
    ? "A) COMMERCIAL MICRO-CONSEQUENCE ENRICHMENT ROBUST"
    : "B) COMMERCIAL MICRO-CONSEQUENCE ENRICHMENT GAP";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(fail === 0 ? 0 : 1);
