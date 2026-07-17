/**
 * PATCH 11B — Conversational vs Commercial Intent Precision
 * Run: node scripts/test-mia-conversational-commercial-intent-precision.js
 */

import {
  recognizeMiaIntent,
  detectConversationalEntityMentionFrame,
  detectActiveCommercialAsk,
  MIA_INTERACTION_MODES,
} from "../lib/miaIntentRecognitionLayer.js";
import {
  buildIntentAuthorityFromRecognition,
  COMMERCIAL_PERMISSION,
} from "../lib/miaIntentAuthority.js";
import { hasClearNewCommercialSearchIntent } from "../lib/miaRoutingSafety.js";
import { segmentMixedIntent } from "../lib/miaMixedIntentSegmentation.js";

let passed = 0;
let failed = 0;

function test(label, fn) {
  try {
    fn();
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${label}`);
    console.error(`    → ${err.message}`);
    failed++;
  }
}

function expect(actual, expected, label = "") {
  if (actual !== expected) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${label ? ` [${label}]` : ""}`
    );
  }
}

function detectProductCategory(text = "") {
  const q = String(text || "").toLowerCase();
  if (/celular|smartphone|iphone|galaxy|samsung|motorola|notebook|laptop|tv|televis|fone|geladeira|tenis|tênis|perfume|maquina de lavar/.test(q)) {
    if (/notebook|laptop/.test(q)) return "notebook";
    if (/tv|televis/.test(q)) return "tv";
    if (/geladeira/.test(q)) return "appliance";
    if (/tenis|tênis/.test(q)) return "shoes";
    if (/perfume/.test(q)) return "perfume";
    if (/maquina de lavar/.test(q)) return "appliance";
    if (/fone/.test(q)) return "headphones";
    return "phone";
  }
  return "";
}

function pipeline(message, extra = {}) {
  const hasClearNewCommercialSearch = hasClearNewCommercialSearchIntent({
    query: message,
    resolvedQuery: extra.resolvedQuery || message,
    hasAnchor: !!extra.hasActiveAnchor,
    detectProductCategory,
    wantsNewProduct: () => false,
  });

  const recognition = recognizeMiaIntent({
    userMessage: message,
    resolvedQuery: extra.resolvedQuery || message,
    sessionContext: extra.sessionContext || {},
    signals: {
      hasClearNewCommercialSearch,
      isExplicitComparison: false,
      explicitProductOnlyQuery: false,
      wantsNew: false,
      newBudgetInOriginalMessage: !!extra.budget,
      newCategoryInOriginalMessage:
        !!detectProductCategory(message) && !extra.sessionContext?.lastCategory,
    },
    hasActiveAnchor: !!extra.hasActiveAnchor,
    detectedIntent: "general_answer",
  });

  const authority = buildIntentAuthorityFromRecognition(recognition, {
    hasActiveAnchor: !!extra.hasActiveAnchor,
  });

  const mixed = segmentMixedIntent({
    userMessage: message,
    intentRecognition: recognition,
    intentAuthority: authority,
    detectProductCategory,
    extractBudget: () => extra.budget || null,
  });

  return { recognition, authority, hasClearNewCommercialSearch, mixed };
}

console.log("\nPATCH 11B — Conversational vs Commercial Intent Precision\n");

console.log("Grupo A — Famílias conversacionais (entity ≠ intent)");
const nonCommercial = [
  "acho esse celular bonito",
  "estou cansado de pesquisar celular",
  "notebook é muito caro",
  "vi uma televisão enorme hoje",
  "meu celular está velho",
  "meu fone parou de funcionar",
  "iPhone tem um design bonito",
  "Galaxy é uma marca interessante",
  "estou só conversando sobre produto",
  "comprar coisa pela internet dá medo",
  "acho esse Galaxy bonito",
  "iPhone é bonito mesmo",
  "celular dá muita dor de cabeça",
  "não aguento mais pesquisar notebook",
  "estou só olhando televisões",
  "vi um Motorola interessante hoje",
  "acho essa geladeira bonita",
  "estou cansado de pesquisar tênis",
  "perfume é muito pessoal",
  "minha máquina de lavar está velha",
  "você entende de celular?",
  "estou confuso com tantas marcas",
];

for (const msg of nonCommercial) {
  test(`non-commercial: "${msg.slice(0, 42)}"`, () => {
    expectTrue(detectConversationalEntityMentionFrame(msg), "conversational frame");
    const { authority, hasClearNewCommercialSearch, mixed } = pipeline(msg);
    expect(authority.commercialPermission, COMMERCIAL_PERMISSION.DENY, "permission");
    expectFalse(hasClearNewCommercialSearch, "clear new search");
    expect(
      mixed.commercialDimension.objective,
      null,
      "mixed commercial objective"
    );
    expectTrue(
      authority.commercialPermission !== COMMERCIAL_PERMISSION.ALLOW,
      "not allow"
    );
  });
}

console.log("\nGrupo B — Intenções comerciais explícitas");
const commercial = [
  "quero comprar um celular",
  "qual celular até 2500 reais?",
  "me recomenda um notebook",
  "compare iPhone 13 e Galaxy S23",
  "quanto custa o Galaxy S23?",
  "onde encontro uma televisão barata?",
  "qual fone vale a pena?",
  "procure um celular com boa bateria",
  "me ajuda a escolher um celular",
  "quero comprar uma geladeira",
  "me recomenda um tênis",
  "qual perfume vale a pena?",
  "preciso trocar minha máquina de lavar",
];

for (const msg of commercial) {
  test(`commercial: "${msg.slice(0, 42)}"`, () => {
    const { authority, hasClearNewCommercialSearch } = pipeline(msg);
    expectTrue(
      authority.commercialPermission === COMMERCIAL_PERMISSION.ALLOW ||
        authority.commercialPermission === COMMERCIAL_PERMISSION.MIXED,
      "commercial permission"
    );
    expectTrue(
      hasClearNewCommercialSearch || detectActiveCommercialAsk(msg),
      "commercial signal"
    );
  });
}

console.log("\nGrupo C — Pares mínimos");
const pairs = [
  ["acho o Galaxy bonito", "quero comprar o Galaxy"],
  ["estou cansado de pesquisar celular", "me ajuda a pesquisar um celular"],
  ["meu notebook está velho", "quero trocar meu notebook"],
  ["televisão é cara", "qual televisão barata você recomenda?"],
  ["iPhone tem design bonito", "quanto custa um iPhone?"],
];

for (const [negative, positive] of pairs) {
  test(`pair negative: "${negative.slice(0, 36)}"`, () => {
    const { authority } = pipeline(negative);
    expect(authority.commercialPermission, COMMERCIAL_PERMISSION.DENY);
  });
  test(`pair positive: "${positive.slice(0, 36)}"`, () => {
    const { authority } = pipeline(positive);
    expectTrue(
      authority.commercialPermission === COMMERCIAL_PERMISSION.ALLOW ||
        authority.commercialPermission === COMMERCIAL_PERMISSION.MIXED
    );
  });
}

console.log("\nGrupo D — Mixed com ask comercial preservado");
test("estou cansado, me recomenda um celular → MIXED", () => {
  const { authority, mixed } = pipeline("estou cansado, me recomenda um celular");
  expect(authority.commercialPermission, COMMERCIAL_PERMISSION.MIXED);
  expectTrue(mixed.commercialDimension.commercialSearchQuery != null, "commercial query");
});

function expectTrue(val, label = "") {
  if (!val) throw new Error(`Expected truthy${label ? ` [${label}]` : ""}`);
}

function expectFalse(val, label = "") {
  if (val) throw new Error(`Expected falsy${label ? ` [${label}]` : ""}`);
}

console.log(`\nResultado: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
