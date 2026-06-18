/**
 * PATCH Comercial 3B — Product Explanation Builder Runtime Wiring Fix Audit
 *
 * Usage: node scripts/test-mia-product-explanation-runtime-wiring-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  BANNED_ARCHITECTURE_PHRASES,
  containsArchitectureLeak,
  verbalizeCommercialExplanation,
} from "../lib/miaCommercialExplanationVerbalizer.js";
import {
  BANNED_GENERIC_PHRASES,
  buildProductExplanation,
  buildStructuredExplanationFacts,
  containsBannedGenericPhrase,
  findInventedSpecViolations,
  hasUsableDataLayerContent,
  looksLikeLegacySearchNarrativeReply,
  resolveCommercialOfferExplanation,
  shouldForceCommercialProductExplanation,
} from "../lib/miaProductExplanationBuilder.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const COGNITIVE_GUARD_FILES = [
  "lib/miaCognitiveRouter.js",
  "lib/miaRoutingDecisionContract.js",
  "lib/miaPrompt.js",
  "lib/miaToneComplianceGuard.js",
];

const IPHONE_13_SPECS = {
  official_name: "iPhone 13",
  strengths: [
    "experiência fluida e previsível no dia a dia",
    "bom equilíbrio entre câmera, desempenho e tamanho",
  ],
  ideal_for: ["quem prioriza estabilidade e longevidade de software"],
  weaknesses: ["tela de 60 Hz pode parecer menos fluida se você veio de modelos Pro"],
  risk_notes: ["carregador não acompanha na caixa"],
};

const GALAXY_A55_SPECS = {
  official_name: "Samsung Galaxy A55 5G",
  strengths: ["bateria consistente", "tela fluida"],
  ideal_for: ["uso diário equilibrado"],
  weaknesses: ["não é o topo de câmera da categoria"],
  risk_notes: ["preço varia bastante entre lojas"],
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNoBannedPhrases(text = "") {
  assert(!containsBannedGenericPhrase(text), `banned phrase in: ${text}`);
}

function assertNoArchitectureLeak(text = "") {
  assert(!containsArchitectureLeak(text), `architecture leak in: ${text}`);
}

function assertNoInventedSpecs(text = "", allowedEvidence = "") {
  const violations = findInventedSpecViolations(text, allowedEvidence);
  assert(violations.length === 0, `invented specs: ${violations.join(", ")}`);
}

function assertHumanParagraphs(result = {}) {
  assert(result.ok, `builder failed: ${result.error || "unknown"}`);
  assert(Array.isArray(result.paragraphs), "paragraphs missing");
  assert(result.paragraphs.length >= 2, "expected at least 2 paragraphs");
  assert(result.paragraphs.length <= 4, "expected at most 4 paragraphs");
  for (const paragraph of result.paragraphs) {
    assert(paragraph.length >= 24, `paragraph too short: ${paragraph}`);
  }
}

const CASES = [];

function test(name, fn) {
  CASES.push({ name, fn });
}

test("1. product with Data Layer uses strengths and ideal_for", () => {
  const result = buildProductExplanation({
    product: {
      product_name: "Samsung Galaxy A55 5G",
      price: "R$ 1.899,00",
    },
    trustedSpecs: GALAXY_A55_SPECS,
    hasDataLayer: true,
  });

  assertHumanParagraphs(result);
  assert(/menos ansiedade|recarga|fluidez/i.test(result.text), "uses strength consequences");
  assert(/equilíbrio no uso|uso diário|costuma aparecer/i.test(result.text), "uses ideal_for or micro consequences");
  assertNoArchitectureLeak(result.text);
});

test("2. product without Data Layer uses natural fallback", () => {
  const result = buildProductExplanation({
    product: {
      product_name: "Fone Bluetooth JBL Tune 520",
      price: "R$ 249,90",
      category: "audio",
    },
    hasDataLayer: false,
  });

  assertHumanParagraphs(result);
  assert(/combina bem|O foco aqui|praticidade|rotina/i.test(result.text), "natural fallback");
  assertNoArchitectureLeak(result.text);
  assertNoInventedSpecs(result.text);
});

test("3. smartphone without Data Layer avoids invented chipset", () => {
  const result = buildProductExplanation({
    product: {
      product_name: "Samsung Galaxy S24 Ultra 256GB",
      category: "smartphone",
    },
    hasDataLayer: false,
  });

  assertHumanParagraphs(result);
  assertNoInventedSpecs(result.text);
  assert(!/snapdragon/i.test(result.text), "must not invent chipset");
  assertNoArchitectureLeak(result.text);
});

test("4. notebook without Data Layer uses explicit gamer signal only", () => {
  const result = buildProductExplanation({
    product: {
      product_name: "Notebook Gamer Acer Nitro 5",
      category: "notebook",
    },
    hasDataLayer: false,
  });

  assertHumanParagraphs(result);
  assert(/gamer|uso intenso|linha gamer/i.test(result.text), "explicit title signal");
  assertNoInventedSpecs(result.text);
});

test("5. TV without Data Layer stays cautious", () => {
  const result = buildProductExplanation({
    product: {
      product_name: "Smart TV Samsung 55 4K",
      category: "tv",
    },
    hasDataLayer: false,
  });

  assertHumanParagraphs(result);
  assert(/smart|4k|resolução/i.test(result.text), "explicit tv signals");
  assertNoArchitectureLeak(result.text);
});

test("6. console without Data Layer explains safely", () => {
  const result = buildProductExplanation({
    product: { product_name: "PlayStation 5 Slim", category: "console", price: "R$ 3.499,00" },
    hasDataLayer: false,
  });

  assertHumanParagraphs(result);
  assert(/PlayStation 5 Slim/i.test(result.text), "console name preserved");
  assertNoArchitectureLeak(result.text);
});

test("7. generic product without category still explains safely", () => {
  const result = buildProductExplanation({
    product: { product_name: "Kit Organizador Multiuso Premium" },
    hasDataLayer: false,
  });

  assertHumanParagraphs(result);
  assert(/referência inicial|combina bem|garantia|reputação da loja/i.test(result.text), "safe generic");
  assertNoArchitectureLeak(result.text);
});

test("8. external provider is not exposed to user", () => {
  const result = buildProductExplanation({
    product: {
      product_name: "Mouse Logitech M185",
      price: "R$ 79,90",
      provider: "mercadolivre",
      source: "Mercado Livre",
    },
    hasDataLayer: false,
  });

  assertNoArchitectureLeak(result.text);
  assert(!/mercadolivre|mercado livre|provider/i.test(result.text), "provider hidden");
  assert(!/R\$ 79,90|79,90/.test(result.text), "price not duplicated in explanation");
});

test("9. internal Data Layer product uses structured notes without architecture leak", () => {
  const result = buildProductExplanation({
    product: { product_name: "LG UltraGear 27 IPS" },
    trustedSpecs: {
      official_name: "LG UltraGear 27 IPS",
      strengths: ["painel responsivo"],
      strategic_notes: ["bom para uso misto"],
      risk_notes: ["não é o mais barato do segmento"],
    },
    hasDataLayer: true,
  });

  assertHumanParagraphs(result);
  assert(/painel responsivo|uso misto|Ponto de atenção/i.test(result.text), "structured notes used");
  assertNoArchitectureLeak(result.text);
});

test("10. short product name still produces explanation", () => {
  const result = buildProductExplanation({
    product: { product_name: "PS5", price: "R$ 3.499,00" },
    hasDataLayer: false,
  });

  assertHumanParagraphs(result);
  assert(/PS5/.test(result.text), "short name preserved");
});

test("11. long product name still produces explanation", () => {
  const result = buildProductExplanation({
    product: {
      product_name:
        "Notebook Gamer Acer Nitro V15 Intel Core I7 16GB 512GB SSD RTX 4060 Windows 11",
    },
    hasDataLayer: false,
  });

  assertHumanParagraphs(result);
  assertNoInventedSpecs(
    result.text,
    "notebook gamer acer nitro v15 intel core i7 16gb 512gb ssd rtx 4060 windows 11"
  );
});

test("12. missing optional fields still produce safe explanation", () => {
  const result = buildProductExplanation({
    product: { product_name: "Teclado Mecânico ABNT2" },
    hasDataLayer: false,
  });

  assertHumanParagraphs(result);
  assertNoArchitectureLeak(result.text);
});

test("13. tradeoffs present are surfaced in Data Layer mode", () => {
  const result = buildProductExplanation({
    product: { product_name: "iPhone 15 128GB" },
    trustedSpecs: {
      strengths: ["ecossistema maduro"],
      weaknesses: ["preço acima da média"],
      ideal_for: ["quem já vive no ecossistema Apple"],
    },
    hasDataLayer: true,
  });

  assert(/Ponto de atenção/i.test(result.text), "tradeoff surfaced");
  assert(/custo tende a pesar|preço/i.test(result.text), "weakness used");
});

test("14. missing tradeoffs still produce useful explanation", () => {
  const result = buildProductExplanation({
    product: { product_name: "Console Xbox Series S" },
    trustedSpecs: {
      strengths: ["bom custo de entrada"],
      ideal_for: ["quem quer entrar no ecossistema Xbox"],
    },
    hasDataLayer: true,
  });

  assertHumanParagraphs(result);
  assert(/barreira inicial|ecossistema Xbox/i.test(result.text), "uses available fields");
});

test("15. risk_notes present are surfaced", () => {
  const result = buildProductExplanation({
    product: { product_name: "Samsung Galaxy A55 5G" },
    trustedSpecs: GALAXY_A55_SPECS,
    hasDataLayer: true,
  });

  assert(/Ponto de atenção/i.test(result.text), "risk surfaced");
  assert(/câmera|preço|lojas/i.test(result.text), "risk or weakness used");
});

test("16. ideal_for present drives practical paragraph", () => {
  const result = buildProductExplanation({
    product: { product_name: "iPhone 13" },
    trustedSpecs: IPHONE_13_SPECS,
    hasDataLayer: true,
  });

  assert(/prioriza estabilidade|longevidade de software|costuma aparecer/i.test(result.text), "ideal_for or micro used");
});

test("17. weaknesses present are surfaced", () => {
  const result = buildProductExplanation({
    product: { product_name: "iPhone 13" },
    trustedSpecs: IPHONE_13_SPECS,
    hasDataLayer: true,
  });

  assert(/60 Hz/i.test(result.text), "weakness used");
});

test("18. iPhone 13 produces explanation clearly derived from Data Layer", () => {
  const result = buildProductExplanation({
    product: { product_name: "iPhone 13", price: "R$ 3.899,00" },
    trustedSpecs: IPHONE_13_SPECS,
    hasDataLayer: true,
  });

  assertHumanParagraphs(result);
  assert(/previsível|equilíbrio|câmera|uso cotidiano/i.test(result.text), "iPhone 13 strengths");
  assert(/estabilidade|longevidade|dispositivo principal|costuma aparecer/i.test(result.text), "iPhone 13 data layer shape");
  assertNoArchitectureLeak(result.text);
  assertNoBannedPhrases(result.text);
});

test("19. Galaxy A55 uses Data Layer facts", () => {
  const result = buildProductExplanation({
    product: { product_name: "Samsung Galaxy A55 5G" },
    trustedSpecs: GALAXY_A55_SPECS,
    hasDataLayer: true,
  });

  assert(/menos ansiedade|fluidez|recarga/i.test(result.text), "A55 strength consequences");
  assertNoArchitectureLeak(result.text);
});

test("20. no architecture exposure and no invented specs", () => {
  const samples = [
    buildProductExplanation({
      product: { product_name: "Geladeira Brastemp Inverse 443L", category: "eletrodoméstico" },
      hasDataLayer: false,
    }),
    buildProductExplanation({
      product: { product_name: "Headset SteelSeries Arctis 7", category: "headset" },
      hasDataLayer: false,
    }),
    buildProductExplanation({
      product: { product_name: "iPhone 13" },
      trustedSpecs: IPHONE_13_SPECS,
      hasDataLayer: true,
    }),
  ];

  for (const sample of samples) {
    assertHumanParagraphs(sample);
    assertNoArchitectureLeak(sample.text);
    assertNoBannedPhrases(sample.text);
    assertNoInventedSpecs(sample.text);
  }

  for (const phrase of BANNED_ARCHITECTURE_PHRASES) {
    assert(typeof phrase === "string" && phrase.length > 0, "architecture guard list");
  }
  for (const phrase of BANNED_GENERIC_PHRASES) {
    assert(typeof phrase === "string" && phrase.length > 0, "generic guard list");
  }
});

test("runtime wiring forces builder when Data Layer exists", () => {
  const legacyReply =
    "Tarefas exigentes sem sentir que o aparelho está no limite cedo demais. Mais folga no uso pesado.";

  assert(looksLikeLegacySearchNarrativeReply(legacyReply), "legacy narrative detected");
  assert(
    shouldForceCommercialProductExplanation(
      {
        product_name: "iPhone 13",
        trustedSpecs: IPHONE_13_SPECS,
        isDataLayerProduct: true,
      },
      legacyReply
    ),
    "data layer product must force builder"
  );

  const resolved = resolveCommercialOfferExplanation(
    {
      product_name: "iPhone 13",
      trustedSpecs: IPHONE_13_SPECS,
      isDataLayerProduct: true,
    },
    "iphone 13 vale a pena"
  );

  assert(resolved !== legacyReply, "legacy narrative replaced");
  assert(/previsível|estabilidade|longevidade|se destaca principalmente/i.test(resolved), "data layer used");
  assertNoArchitectureLeak(resolved);
});

test("structured facts stay stable through verbalizer", () => {
  const facts = buildStructuredExplanationFacts({
    product: { product_name: "iPhone 13" },
    trustedSpecs: IPHONE_13_SPECS,
    hasDataLayer: true,
  });

  assert(facts.mode === "data_layer", "mode data_layer");
  assert(hasUsableDataLayerContent(IPHONE_13_SPECS), "usable content");
  assert(facts.strengthConsequences.length > 0, "strength consequences preserved");

  const paragraphs = verbalizeCommercialExplanation(facts);
  assert(paragraphs.length >= 2, "verbalizer paragraphs");
  assert(!containsArchitectureLeak(paragraphs.join("\n")), "verbalizer safe");
});

test("cognitive layers untouched and chat uses runtime wiring fix", () => {
  const chatSource = readFileSync(join(ROOT, "pages/api/chat-gpt4o.js"), "utf8");
  assert(chatSource.includes("shouldForceCommercialProductExplanation"), "chat uses force hook");
  assert(chatSource.includes("enrichOfferReplyWithProductExplanation"), "search offer hook");
  assert(chatSource.includes("resolveCommercialExplanationOptions"), "winner specs resolver");

  for (const relativePath of COGNITIVE_GUARD_FILES) {
    const content = readFileSync(join(ROOT, relativePath), "utf8");
    assert(!content.includes("miaProductExplanationBuilder"), `${relativePath} untouched`);
    assert(!content.includes("miaCommercialExplanationVerbalizer"), `${relativePath} verbalizer untouched`);
    assert(!content.includes("miaConsequenceTranslationLayer"), `${relativePath} translator untouched`);
  }
});

console.log("PATCH Comercial 3B — Product Explanation Builder Runtime Wiring Fix Audit\n");

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
    ? "A) PRODUCT EXPLANATION RUNTIME WIRING ROBUST"
    : "B) PRODUCT EXPLANATION RUNTIME WIRING GAP";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(fail === 0 ? 0 : 1);
