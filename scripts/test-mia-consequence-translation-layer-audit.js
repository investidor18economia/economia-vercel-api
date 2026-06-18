/**
 * PATCH Comercial 3C-A — Consequence Translation Layer Audit
 *
 * Usage: node scripts/test-mia-consequence-translation-layer-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  containsBannedConsequenceGenericPhrase,
  containsInternalTokenLeak,
  translateDataLayerFieldsToConsequences,
  translateTokenToStructuredConsequence,
} from "../lib/miaConsequenceTranslationLayer.js";
import {
  buildProductExplanation,
  buildStructuredExplanationFacts,
  findInventedSpecViolations,
} from "../lib/miaProductExplanationBuilder.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const COGNITIVE_GUARD_FILES = [
  "lib/miaCognitiveRouter.js",
  "lib/miaRoutingDecisionContract.js",
  "lib/miaPrompt.js",
  "lib/miaToneComplianceGuard.js",
];

const IPHONE_13_TOKEN_SPECS = {
  official_name: "iPhone 13",
  strengths: ["camera_consistente", "video_forte", "desempenho_forte", "ios_ecossistema"],
  ideal_for: ["estabilidade_software", "uso_video_frequente", "longevidade_uso"],
  weaknesses: ["tela_60hz"],
  risk_notes: ["carregador_ausente"],
};

const GALAXY_A55_TOKEN_SPECS = {
  official_name: "Samsung Galaxy A55 5G",
  strengths: ["bateria_consistente", "tela_fluida"],
  ideal_for: ["uso_diario_equilibrado"],
  weaknesses: ["camera_limitada"],
  risk_notes: ["preco_acima_da_media"],
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNoInternalTokens(text = "") {
  assert(!containsInternalTokenLeak(text), `internal token leak: ${text}`);
}

function assertNoGenericConsequenceLanguage(text = "") {
  assert(!containsBannedConsequenceGenericPhrase(text), `generic language: ${text}`);
}

function assertNoInventedSpecs(text = "", allowedEvidence = "") {
  const violations = findInventedSpecViolations(text, allowedEvidence);
  assert(violations.length === 0, `invented specs: ${violations.join(", ")}`);
}

const CASES = [];

function test(name, fn) {
  CASES.push({ name, fn });
}

test("1. strengths translate to human consequences", () => {
  const result = translateTokenToStructuredConsequence("camera_consistente", "strength");
  assert(result.type === "strength", "type strength");
  assert(/registrar bons momentos/i.test(result.consequence), "camera consequence");
  assert(!/camera_consistente/i.test(result.consequence), "no raw token");
});

test("2. weaknesses translate to human consequences", () => {
  const result = translateTokenToStructuredConsequence("tela_60hz", "weakness");
  assert(result.type === "weakness", "type weakness");
  assert(/menos fluida|telas mais rápidas/i.test(result.consequence), "screen weakness");
});

test("3. ideal_for translate to human consequences", () => {
  const result = translateTokenToStructuredConsequence("longevidade_uso", "ideal_for");
  assert(/permanecer vários anos/i.test(result.consequence), "longevity ideal_for");
});

test("4. risk_notes translate to human consequences", () => {
  const result = translateTokenToStructuredConsequence("carregador_ausente", "risk");
  assert(/carregador/i.test(result.consequence), "charger risk");
});

test("5. smartphone token bundle produces human explanation", () => {
  const built = buildProductExplanation({
    product: { product_name: "iPhone 13", price: "R$ 3.899,00" },
    trustedSpecs: IPHONE_13_TOKEN_SPECS,
    hasDataLayer: true,
  });

  assert(built.ok, built.error || "build failed");
  assertNoInternalTokens(built.text);
  assert(/previsibilidade|limite|mais pesado/i.test(built.text), "strength consequences");
  assert(/estabilidade|vídeos|vários anos/i.test(built.text), "ideal_for consequences");
  assert(/fluida|60|telas/i.test(built.text), "weakness consequence");
});

test("6. notebook tokens stay category-agnostic", () => {
  const built = buildProductExplanation({
    product: { product_name: "Notebook Gamer Acer Nitro 5" },
    trustedSpecs: {
      strengths: ["desempenho_forte", "multitarefa_equilibrada"],
      ideal_for: ["trabalho_multitarefa"],
      weaknesses: ["portabilidade_limitada"],
    },
    hasDataLayer: true,
  });

  assert(built.ok, built.error || "build failed");
  assertNoInternalTokens(built.text);
  assert(/limite|pesado|equipamento/i.test(built.text), "performance consequence");
});

test("7. TV tokens translate without exposing internals", () => {
  const built = buildProductExplanation({
    product: { product_name: "Smart TV Samsung 55" },
    trustedSpecs: {
      strengths: ["tela_fluida", "ecossistema_maduro"],
      weaknesses: ["preco_acima_media"],
    },
    hasDataLayer: true,
  });

  assert(built.ok, built.error || "build failed");
  assertNoInternalTokens(built.text);
  assert(/fluidez|ecossistema|custo/i.test(built.text), "tv consequences");
});

test("8. monitor tokens translate without exposing internals", () => {
  const built = buildProductExplanation({
    product: { product_name: "LG UltraGear 27" },
    trustedSpecs: {
      strengths: ["painel_responsivo"],
      strategic_notes: ["uso_misto"],
      risk_notes: ["nao_mais_barato_segmento"],
    },
    hasDataLayer: true,
  });

  assert(built.ok, built.error || "build failed");
  assertNoInternalTokens(built.text);
  assert(/atraso|interação|segmento/i.test(built.text), "monitor consequences");
});

test("9. console tokens translate without exposing internals", () => {
  const built = buildProductExplanation({
    product: { product_name: "Xbox Series S" },
    trustedSpecs: {
      strengths: ["custo_entrada"],
      ideal_for: ["ecossistema_xbox"],
    },
    hasDataLayer: true,
  });

  assert(built.ok, built.error || "build failed");
  assertNoInternalTokens(built.text);
  assert(/barreira|ecossistema Xbox/i.test(built.text), "console consequences");
});

test("10. unknown category still translates safely", () => {
  const built = buildProductExplanation({
    product: { product_name: "Purificador de Ar Xiaomi 4 Lite" },
    trustedSpecs: {
      strengths: ["eficiencia_forte"],
      weaknesses: ["ruido_limitado"],
      ideal_for: ["uso_diario_equilibrado"],
    },
    hasDataLayer: true,
  });

  assert(built.ok, built.error || "build failed");
  assertNoInternalTokens(built.text);
  assertNoGenericConsequenceLanguage(built.text);
});

test("11. known token uses explicit consequence mapping", () => {
  const video = translateTokenToStructuredConsequence("video_forte", "strength");
  assert(/gravar vídeos/i.test(video.consequence), "video_forte mapping");
});

test("12. unknown token falls back to axis frame without leaking token", () => {
  const unknown = translateTokenToStructuredConsequence("foo_bar_desconhecido", "strength");
  assert(unknown.consequence.length >= 24, "unknown token still produces consequence");
  assert(!/foo_bar_desconhecido/i.test(unknown.consequence), "unknown token hidden");
});

test("13. mixed human prose and tokens translate together", () => {
  const translated = translateDataLayerFieldsToConsequences({
    strengths: ["camera_consistente", "experiência fluida e previsível no dia a dia"],
    weaknesses: ["tela de 60 Hz pode parecer menos fluida"],
    ideal_for: ["quem prioriza estabilidade"],
  });

  assert(translated.strengths.length === 2, "mixed strengths translated");
  assertNoInternalTokens(
    translated.strengths.map((item) => item.consequence).join(" ")
  );
});

test("14. no invented specs in final explanation", () => {
  const built = buildProductExplanation({
    product: { product_name: "Samsung Galaxy A55 5G" },
    trustedSpecs: GALAXY_A55_TOKEN_SPECS,
    hasDataLayer: true,
  });

  assert(built.ok, built.error || "build failed");
  assertNoInventedSpecs(built.text);
});

test("15. no product hardcodes in translator source", () => {
  const source = readFileSync(join(ROOT, "lib/miaConsequenceTranslationLayer.js"), "utf8");
  assert(!source.includes("iPhone 13"), "no iPhone hardcode");
  assert(!source.includes("Galaxy A55"), "no Galaxy hardcode");
});

test("16. no provider dependency in explanation layer", () => {
  const builderSource = readFileSync(join(ROOT, "lib/miaProductExplanationBuilder.js"), "utf8");
  const verbalizerSource = readFileSync(join(ROOT, "lib/miaCommercialExplanationVerbalizer.js"), "utf8");
  assert(!builderSource.includes("productSourceAdapter"), "builder provider-free");
  assert(!verbalizerSource.includes("productSourceAdapter"), "verbalizer provider-free");
  assert(!builderSource.includes("googleShoppingAdapter"), "builder adapter-free");
});

test("17. no prompt or LLM dependency in explanation layer", () => {
  for (const relativePath of [
    "lib/miaConsequenceTranslationLayer.js",
    "lib/miaProductExplanationBuilder.js",
    "lib/miaCommercialExplanationVerbalizer.js",
  ]) {
    const content = readFileSync(join(ROOT, relativePath), "utf8");
    assert(!content.includes("openai"), `${relativePath} no openai`);
    assert(!content.includes("chat.completions"), `${relativePath} no chat completions`);
  }
});

test("18. structured facts carry consequences not raw strengths", () => {
  const facts = buildStructuredExplanationFacts({
    product: { product_name: "iPhone 13" },
    trustedSpecs: IPHONE_13_TOKEN_SPECS,
    hasDataLayer: true,
  });

  assert(Array.isArray(facts.strengthConsequences), "strengthConsequences present");
  assert(facts.strengthConsequences.length > 0, "strength consequences populated");
  assertNoInternalTokens(facts.strengthConsequences.join(" "));
  assert(!("strengths" in facts), "raw strengths not exposed to verbalizer");
});

test("19. iPhone 13 explanation aligns with expected human shape", () => {
  const built = buildProductExplanation({
    product: { product_name: "iPhone 13" },
    trustedSpecs: IPHONE_13_TOKEN_SPECS,
    hasDataLayer: true,
  });

  assert(built.ok, built.error || "build failed");
  assert(/se destaca principalmente/i.test(built.text), "opening paragraph");
  assert(/Na prática|Isso costuma (?:aparecer|ser notado)/i.test(built.text), "practical paragraph");
  assert(/Ponto de atenção/i.test(built.text), "tradeoff paragraph");
  assertNoInternalTokens(built.text);
  assertNoGenericConsequenceLanguage(built.text);
});

test("20. cognitive layers untouched", () => {
  for (const relativePath of COGNITIVE_GUARD_FILES) {
    const content = readFileSync(join(ROOT, relativePath), "utf8");
    assert(!content.includes("miaConsequenceTranslationLayer"), `${relativePath} untouched`);
  }
});

console.log("PATCH Comercial 3C-A — Consequence Translation Layer Audit\n");

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
    ? "A) CONSEQUENCE TRANSLATION LAYER ROBUST"
    : "B) CONSEQUENCE TRANSLATION LAYER GAP";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(fail === 0 ? 0 : 1);
