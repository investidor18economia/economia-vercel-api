/**
 * PATCH Comercial 3A — Universal Product Explanation Builder Audit
 *
 * Usage: node scripts/test-mia-universal-product-explanation-builder-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  BANNED_GENERIC_PHRASES,
  buildProductExplanation,
  containsBannedGenericPhrase,
  findInventedSpecViolations,
  isGenericCommercialOfferReply,
  resolveCommercialOfferExplanation,
} from "../lib/miaProductExplanationBuilder.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const COGNITIVE_GUARD_FILES = [
  "lib/miaCognitiveRouter.js",
  "lib/miaRoutingDecisionContract.js",
  "lib/miaPrompt.js",
  "lib/miaToneComplianceGuard.js",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNoBannedPhrases(text = "") {
  assert(!containsBannedGenericPhrase(text), `banned phrase in: ${text}`);
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
    assert(paragraph.length >= 24, "paragraph too short");
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
      source: "Magalu",
      provider: "google_shopping",
    },
    trustedSpecs: {
      official_name: "Samsung Galaxy A55 5G",
      strengths: ["bateria consistente", "tela fluida"],
      ideal_for: ["uso diário equilibrado"],
      weaknesses: ["não é o topo de câmera da categoria"],
    },
    hasDataLayer: true,
  });

  assertHumanParagraphs(result);
  assert(result.hasDataLayer, "hasDataLayer");
  assert(/menos ansiedade|recarga|fluidez|equilíbrio|uso diário equilibrado|costuma aparecer/i.test(result.text), "uses strength or micro consequences");
  assertNoBannedPhrases(result.text);
});

test("2. product without Data Layer uses natural fallback", () => {
  const result = buildProductExplanation({
    product: {
      product_name: "Fone Bluetooth JBL Tune 520",
      price: "R$ 249,90",
      source: "Mercado Livre",
      provider: "mercadolivre",
      category: "audio",
    },
    hasDataLayer: false,
  });

  assertHumanParagraphs(result);
  assert(/combina bem|O foco aqui|praticidade|rotina/i.test(result.text), "natural fallback");
  assert(/sem assumir detalhes|O foco aqui|combina bem|praticidade/i.test(result.text), "no spec assumption");
  assertNoBannedPhrases(result.text);
  assertNoInventedSpecs(result.text);
});

test("3. smartphone without Data Layer avoids invented chipset", () => {
  const result = buildProductExplanation({
    product: {
      product_name: "Samsung Galaxy S24 Ultra 256GB",
      category: "smartphone",
      source: "Google Shopping",
    },
    hasDataLayer: false,
  });

  assertHumanParagraphs(result);
  assertNoInventedSpecs(result.text);
  assert(!/snapdragon/i.test(result.text), "must not invent chipset");
});

test("4. notebook without Data Layer uses explicit gamer signal only", () => {
  const result = buildProductExplanation({
    product: {
      product_name: "Notebook Gamer Acer Nitro 5",
      category: "notebook",
      source: "Google Shopping",
    },
    hasDataLayer: false,
  });

  assertHumanParagraphs(result);
  assert(/gamer/i.test(result.text), "explicit title signal");
  assertNoInventedSpecs(result.text);
  assert(!/rtx/i.test(result.text), "must not invent gpu");
});

test("5. TV without Data Layer stays cautious", () => {
  const result = buildProductExplanation({
    product: {
      product_name: "Smart TV Samsung 55 4K",
      category: "tv",
      source: "Google Shopping",
    },
    hasDataLayer: false,
  });

  assertHumanParagraphs(result);
  assert(/smart|4k|resolução/i.test(result.text), "explicit tv signals");
  assertNoInventedSpecs(result.text);
});

test("6. generic product without category still explains safely", () => {
  const result = buildProductExplanation({
    product: {
      product_name: "Kit Organizador Multiuso Premium",
      source: "Loja Online",
    },
    hasDataLayer: false,
  });

  assertHumanParagraphs(result);
  assert(/referência inicial|combina bem|garantia|reputação da loja/i.test(result.text), "safe generic");
  assertNoBannedPhrases(result.text);
});

test("7. external provider is not exposed in explanation", () => {
  const result = buildProductExplanation({
    product: {
      product_name: "Mouse Logitech M185",
      price: "R$ 79,90",
      provider: "mercadolivre",
      source: "Mercado Livre",
    },
    hasDataLayer: false,
  });

  assert(!/R\$ 79,90|79,90/.test(result.text), "price not duplicated in explanation");
  assert(!/mercadolivre|mercado livre|provider/i.test(result.text), "provider hidden");
  assertNoBannedPhrases(result.text);
});

test("8. internal Data Layer provider uses structured notes", () => {
  const result = buildProductExplanation({
    product: {
      product_name: "LG UltraGear 27 IPS",
      source: "Data Layer MIA",
      provider: "product_specs",
    },
    trustedSpecs: {
      official_name: "LG UltraGear 27 IPS",
      strengths: ["painel responsivo"],
      strategic_notes: ["bom para uso misto"],
      risk_notes: ["não é o mais barato do segmento"],
    },
    hasDataLayer: true,
  });

  assertHumanParagraphs(result);
  assert(/atraso|interação|segmento|Ponto de atenção/i.test(result.text), "structured notes used");
});

test("9. price available is not duplicated in explanation", () => {
  const result = buildProductExplanation({
    product: {
      product_name: "Kindle 11 Geração",
      price: "R$ 399,00",
      source: "Amazon",
    },
    hasDataLayer: false,
  });

  assertHumanParagraphs(result);
  assert(!/R\$ 399,00|399,00/.test(result.text), "price belongs on card only");
  assert(!/encontrei oferta por/i.test(result.text), "no redundant price line");
});

test("10. missing price stays valid without inventing value", () => {
  const result = buildProductExplanation({
    product: {
      product_name: "Monitor LG 24 Full HD",
      source: "Google Shopping",
      category: "monitor",
    },
    hasDataLayer: false,
  });

  assertHumanParagraphs(result);
  assert(!/R\$/i.test(result.text), "must not invent price");
});

test("11. short product name still produces explanation", () => {
  const result = buildProductExplanation({
    product: { product_name: "PS5", source: "Magalu", price: "R$ 3.499,00" },
    hasDataLayer: false,
  });

  assertHumanParagraphs(result);
  assert(/PS5/.test(result.text), "short name preserved");
});

test("12. long product name still produces explanation", () => {
  const result = buildProductExplanation({
    product: {
      product_name:
        "Notebook Gamer Acer Nitro V15 Intel Core I7 16GB 512GB SSD RTX 4060 Windows 11",
      source: "Google Shopping",
    },
    hasDataLayer: false,
  });

  assertHumanParagraphs(result);
  assert(/Acer Nitro|Notebook Gamer/i.test(result.text), "long name preserved");
  assertNoInventedSpecs(
    result.text,
    "notebook gamer acer nitro v15 intel core i7 16gb 512gb ssd rtx 4060 windows 11"
  );
});

test("13. missing optional fields still produce safe explanation", () => {
  const result = buildProductExplanation({
    product: { product_name: "Teclado Mecânico ABNT2" },
    hasDataLayer: false,
  });

  assertHumanParagraphs(result);
  assertNoBannedPhrases(result.text);
});

test("14. tradeoffs present are surfaced in Data Layer mode", () => {
  const result = buildProductExplanation({
    product: { product_name: "iPhone 15 128GB", source: "Data Layer MIA" },
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

test("15. missing tradeoffs still produce useful explanation", () => {
  const result = buildProductExplanation({
    product: { product_name: "Console Xbox Series S", source: "Data Layer MIA" },
    trustedSpecs: {
      strengths: ["bom custo de entrada"],
      ideal_for: ["quem quer entrar no ecossistema Xbox"],
    },
    hasDataLayer: true,
  });

  assertHumanParagraphs(result);
  assert(/barreira inicial|ecossistema Xbox/i.test(result.text), "uses available fields");
});

test("resolveCommercialOfferExplanation replaces generic commercial reply", () => {
  const generic = "Use como referência de preço.";
  assert(isGenericCommercialOfferReply(generic), "fixture generic");

  const resolved = resolveCommercialOfferExplanation(
    {
      product_name: "Headset HyperX Cloud Stinger",
      price: "R$ 199,00",
      source: "Google Shopping",
      category: "headset",
    },
    "headset gamer barato"
  );

  assert(resolved !== generic, "generic replaced");
  assertNoBannedPhrases(resolved);
  assertNoInventedSpecs(resolved);
});

test("cognitive layers untouched and chat uses builder hook", () => {
  const chatSource = readFileSync(join(ROOT, "pages/api/chat-gpt4o.js"), "utf8");
  assert(chatSource.includes("resolveCommercialOfferExplanation"), "chat imports builder");
  assert(chatSource.includes("enrichOfferReplyWithProductExplanation"), "search offer hook");

  for (const relativePath of COGNITIVE_GUARD_FILES) {
    const content = readFileSync(join(ROOT, relativePath), "utf8");
    assert(!content.includes("miaProductExplanationBuilder"), `${relativePath} untouched`);
  }

  for (const phrase of BANNED_GENERIC_PHRASES) {
    assert(!phrase.includes("hardcode"), "sanity");
  }
});

console.log("PATCH Comercial 3A — Universal Product Explanation Builder Audit\n");

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
    ? "A) UNIVERSAL PRODUCT EXPLANATION BUILDER ROBUST"
    : "B) UNIVERSAL PRODUCT EXPLANATION BUILDER GAP";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(fail === 0 ? 0 : 1);
