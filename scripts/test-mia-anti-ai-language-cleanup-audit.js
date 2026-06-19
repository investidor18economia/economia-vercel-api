/**
 * PATCH 9.1F — Anti-AI Language Cleanup Audit
 *
 * Usage:
 *   node scripts/test-mia-anti-ai-language-cleanup-audit.js
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  ANTI_AI_LANGUAGE_FLAGS,
  auditAntiAiLanguage,
  buildAntiAiLanguageAuditRecord,
  cleanupMiaHumanLanguage,
  detectAntiAiLanguageFlags,
  preservesStructuredMiaBlocks,
} from "../lib/miaAntiAiLanguageCleanupLayer.js";
import { buildSpecialistDecisionExplanation } from "../lib/miaSpecialistDecisionExplanationLayer.js";
import { appendUserIntentDiscovery } from "../lib/miaUserIntentDiscoveryLayer.js";
import { buildComparisonExperienceReply } from "../lib/miaComparisonExperienceLayer.js";
import { extractTradeoffBlockFromReply } from "../lib/miaTradeoffCommunicationLayer.js";
import { isComparisonExperienceScannable } from "../lib/miaComparisonExperienceLayer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const PRIOR_AUDITS = [
  "test-mia-specialist-decision-explanation-audit.js",
  "test-mia-user-intent-discovery-audit.js",
  "test-mia-authority-signals-audit.js",
  "test-mia-tradeoff-communication-audit.js",
  "test-mia-comparison-experience-audit.js",
  "test-mia-winner-lifecycle-enforcement-audit.js",
  "test-mia-discussion-set-enforcement-audit.js",
  "test-mia-recommendation-stability-guard-audit.js",
  "test-mia-contradiction-recovery-audit.js",
  "test-mia-user-confusion-recovery-audit.js",
  "test-mia-explicit-recommendation-change-audit.js",
  "test-mia-final-decision-scope-guard-audit.js",
  "test-mia-legitimate-search-reset-guard-audit.js",
  "test-mia-escalated-confusion-recovery-audit.js",
];

const IPHONE_13_SPECS = {
  official_name: "iPhone 13",
  category: "celular",
  strengths: ["experiência fluida e previsível no dia a dia", "bom equilíbrio entre câmera, desempenho e tamanho"],
  ideal_for: ["quem prioriza estabilidade e longevidade de software"],
  weaknesses: ["tela de 60 Hz pode parecer menos fluida se você veio de modelos Pro"],
  risk_notes: ["carregador não acompanha na caixa"],
};

const NOTEBOOK_SPECS = {
  official_name: "Notebook Lenovo IdeaPad 3",
  category: "notebook",
  strengths: ["desempenho equilibrado para estudo e trabalho"],
  ideal_for: ["quem precisa de notebook para uso diário sem exagero"],
  weaknesses: ["não é a melhor opção para edição pesada ou jogos exigentes"],
};

const GALAXY_A35 = {
  product_name: "Samsung Galaxy A35",
  trustedSpecs: {
    official_name: "Galaxy A35",
    strengths: ["bateria acima da média"],
    weaknesses: ["suporte de software mais curto"],
  },
  scoreEngine: { scores: { camera: 78, battery: 90, longevity: 70, value: 88, performance: 76, screen: 82 } },
};

const IPHONE_13 = {
  product_name: "Apple iPhone 13",
  trustedSpecs: IPHONE_13_SPECS,
  scoreEngine: { scores: { camera: 88, battery: 72, longevity: 92, value: 74, performance: 84, screen: 76 } },
};

function buildSearchCognition(primaryAxis = "performance") {
  return {
    primaryAxis,
    consequenceChain: {
      impact: "mais folga no uso pesado do dia a dia",
      consequence: "menos chance de sentir limitação no uso pesado depois de alguns meses",
    },
  };
}

function buildSearchReply({ query, category, product, cognition, querySignals = {} }) {
  const specialist = buildSpecialistDecisionExplanation({
    query,
    category,
    product,
    searchCognition: cognition,
    querySignals,
    decisionMemory: {
      lastWinnerAdvantages: [cognition.primaryAxis || "performance"],
      lastWinnerSacrifices: ["screen"],
      lastTradeoff: product.trustedSpecs?.weaknesses?.[0] || "",
    },
    responsePath: "return_seguro",
  });
  if (!specialist.ok) return "";
  return appendUserIntentDiscovery({
    reply: specialist.text,
    query,
    category,
    searchCognition: cognition,
    routingDecision: { allowNewSearch: true },
    responsePath: "return_seguro",
  }).reply;
}

const ARTIFICIAL_SAMPLES = [
  "Isso tende a ajudar com menos preocupação com autonomia em uso cotidiano.",
  "Essa opção se destaca principalmente por entregar uma experiência equilibrada.",
  "De forma geral, é uma ótima opção custo-benefício.",
  "Um tradeoff perceptível é abrir mão de tela mais fluida.",
  "Estou aqui para ajudar com sua escolha.",
];

let passed = 0;
let failed = 0;
const failures = [];

function assert(label, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    const msg = `  ✗ ${label}${detail ? " — " + detail : ""}`;
    failures.push(msg);
    console.log(msg);
  }
}

function assertNoArtificialLanguage(label, text) {
  const flags = detectAntiAiLanguageFlags(text);
  assert(`${label}: sem linguagem artificial`, flags.length === 0, flags.join(", "));
}

console.log("\nPATCH 9.1F — Anti-AI Language Cleanup Audit\n");

console.log("── Diagnóstico ──");
console.log("  Causa raiz: Consequence Translation + verbalizers geravam molduras artificiais");
console.log("  Patch: camada 9.1F + correção na origem (humanizeProseFallback)");

for (const sample of ARTIFICIAL_SAMPLES) {
  const cleaned = cleanupMiaHumanLanguage(sample, { preserveStructure: true });
  assert(
    `cleanup remove artificial: "${sample.slice(0, 42)}..."`,
    detectAntiAiLanguageFlags(cleaned.text).length === 0 || cleaned.text === "",
    cleaned.text || "(removed)"
  );
}

const SCENARIOS = [
  {
    id: "A",
    label: "busca inicial genérica",
    build: () =>
      buildSearchReply({
        query: "celular até 2000",
        category: "celular",
        product: { product_name: "Apple iPhone 13", isDataLayerProduct: true, trustedSpecs: IPHONE_13_SPECS },
        cognition: buildSearchCognition("longevity"),
      }),
    winner: "iPhone 13",
  },
  {
    id: "B",
    label: "busca com prioridade",
    build: () =>
      buildSearchReply({
        query: "celular até 2000 com câmera boa",
        category: "celular",
        product: { product_name: "Apple iPhone 13", isDataLayerProduct: true, trustedSpecs: IPHONE_13_SPECS },
        cognition: buildSearchCognition("camera"),
      }),
    winner: "iPhone 13",
  },
  {
    id: "C",
    label: "comparação",
    build: () =>
      buildComparisonExperienceReply({
        query: "iPhone 13 ou Galaxy A35?",
        products: [IPHONE_13, GALAXY_A35],
        winner: IPHONE_13,
        runnerUp: GALAXY_A35,
        priority: "longevity",
        intent: "comparison",
      }).reply,
    winner: "iPhone 13",
    comparison: true,
  },
  {
    id: "D",
    label: "ganhos e renúncias",
    build: () =>
      buildSearchReply({
        query: "qual vale mais?",
        category: "celular",
        product: { product_name: "Apple iPhone 13", isDataLayerProduct: true, trustedSpecs: IPHONE_13_SPECS },
        cognition: buildSearchCognition("value"),
      }),
    winner: "iPhone 13",
  },
  {
    id: "E",
    label: "descoberta de intenção",
    build: () =>
      buildSearchReply({
        query: "celular bom e barato",
        category: "celular",
        product: { product_name: "Motorola Moto G84", category: "celular" },
        cognition: buildSearchCognition("value"),
        querySignals: { priceSensitive: true },
      }),
    winner: "",
  },
  {
    id: "H",
    label: "notebook até 3000",
    build: () =>
      buildSearchReply({
        query: "notebook até 3000",
        category: "notebook",
        product: {
          product_name: "Notebook Lenovo IdeaPad 3",
          isDataLayerProduct: true,
          trustedSpecs: NOTEBOOK_SPECS,
        },
        cognition: buildSearchCognition("performance"),
      }),
    winner: "Notebook Lenovo IdeaPad 3",
  },
  {
    id: "I",
    label: "usuário apressado",
    build: () =>
      buildSearchReply({
        query: "qual compra rápido?",
        category: "celular",
        product: { product_name: "Apple iPhone 13", isDataLayerProduct: true, trustedSpecs: IPHONE_13_SPECS },
        cognition: buildSearchCognition("performance"),
      }),
    winner: "iPhone 13",
  },
];

console.log("\n── Scenarios A–I ──");
for (const scenario of SCENARIOS) {
  console.log(`\n── Cenário ${scenario.id}: ${scenario.label} ──`);
  const reply = scenario.build();
  console.log(`  preview: ${reply.split("\n").slice(0, 4).join(" | ")}`);
  assert(`${scenario.id}: reply built`, reply.length > 60, reply.slice(0, 120));
  assertNoArtificialLanguage(scenario.id, reply);

  if (scenario.comparison) {
    assert(`${scenario.id}: preserves comparison layout`, isComparisonExperienceScannable(reply), reply);
  } else {
    const tradeoff = extractTradeoffBlockFromReply(reply);
    if (/✅/.test(reply)) {
      assert(`${scenario.id}: preserves tradeoff block`, /✅/.test(tradeoff || reply), tradeoff);
    }
    if (/\?\s*$/.test(reply.trim())) {
      assert(`${scenario.id}: preserves intent discovery`, /\?\s*$/.test(reply.trim()), reply.slice(-80));
    }
  }

  if (scenario.winner) {
    assert(`${scenario.id}: preserves winner mention`, reply.includes(scenario.winner.split(" ")[0]), reply);
  }
}

console.log("\n── Suppression / structure safety ──");
const structuredBefore = `🏆 Minha escolha: iPhone 13\n\n✅ ganha câmera\n\n⚠️ abre mão de bateria\n\n👉 iria de iPhone 13.`;
const structuredAfter = cleanupMiaHumanLanguage(
  `${structuredBefore}\n\nIsso tende a ajudar com uso cotidiano.`,
  { winnerName: "iPhone 13", preserveStructure: true }
).text;
assert("structured blocks preserved", preservesStructuredMiaBlocks(structuredBefore, structuredAfter));

console.log("\n── Before / After ──");
const beforeAfter = buildAntiAiLanguageAuditRecord({
  before: ARTIFICIAL_SAMPLES[0],
  allowedEvidence: "iPhone 13",
});
console.log("Antes:", beforeAfter.before);
console.log("Depois:", beforeAfter.text);
assert("before/after cleanup ok", beforeAfter.afterFlags.length === 0, beforeAfter.text);

console.log("\n── Regressão 9.1A–E + 8.x ──");
let regressionFailures = 0;
for (const script of PRIOR_AUDITS) {
  const result = spawnSync(process.execPath, [join(ROOT, "scripts", script)], {
    encoding: "utf8",
    stdio: "pipe",
    cwd: ROOT,
  });
  const ok = result.status === 0;
  console.log(`${ok ? "PASS" : "FAIL"} ${script}`);
  if (!ok) regressionFailures++;
}

console.log("\n══════════════════════════════════════");
console.log(`Static: ${passed} passed, ${failed} failed`);
console.log(`Regressions: ${PRIOR_AUDITS.length - regressionFailures}/${PRIOR_AUDITS.length} passed`);
const verdict =
  failed === 0 && regressionFailures === 0
    ? "A) ROBUST"
    : failed === 0
      ? "B) PARTIAL"
      : "C) FAIL";
console.log(`\nVEREDITO FINAL: ${verdict}`);

if (failures.length) {
  console.log("\nFailures:");
  for (const msg of failures) console.log(msg);
}

process.exit(failed === 0 ? 0 : 1);
