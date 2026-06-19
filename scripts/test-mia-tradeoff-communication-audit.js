/**
 * PATCH 9.1D — Tradeoff Communication Layer Audit
 *
 * Usage:
 *   node scripts/test-mia-tradeoff-communication-audit.js
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  auditTradeoffCommunication,
  buildTradeoffCommunicationAuditRecord,
  buildTradeoffCommunicationBlock,
  containsTradeoffWord,
  extractTradeoffBlockFromReply,
  isTradeoffCommunicationUseful,
  resolveTradeoffCommunicationSources,
  TRADEOFF_COMMUNICATION_FLAGS,
} from "../lib/miaTradeoffCommunicationLayer.js";
import { buildSpecialistDecisionExplanation } from "../lib/miaSpecialistDecisionExplanationLayer.js";
import { appendUserIntentDiscovery } from "../lib/miaUserIntentDiscoveryLayer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const PRIOR_AUDITS = [
  "test-mia-specialist-decision-explanation-audit.js",
  "test-mia-user-intent-discovery-audit.js",
  "test-mia-authority-signals-audit.js",
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
  strengths: [
    "experiência fluida e previsível no dia a dia",
    "bom equilíbrio entre câmera, desempenho e tamanho",
  ],
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

const TV_SPECS = {
  official_name: "Smart TV Samsung 55 4K",
  category: "tv",
  strengths: ["imagem consistente para streaming"],
  ideal_for: ["quem assiste filmes e séries"],
  weaknesses: ["apps de streaming podem variar de fluidez entre modelos"],
};

const MONITOR_SPECS = {
  official_name: "Monitor LG UltraGear 27",
  category: "monitor",
  strengths: ["fluidez boa para uso prolongado"],
  ideal_for: ["trabalho e uso diário"],
  weaknesses: ["não é o topo para edição de cor profissional"],
};

const CHAIR_SPECS = {
  official_name: "Cadeira Ergonomica Office",
  category: "cadeira",
  strengths: ["suporte básico para longas horas"],
  weaknesses: ["ajustes finos podem ser limitados em modelos mais baratos"],
};

const MOUSE_SPECS = {
  official_name: "Mouse Gamer Logitech G502",
  category: "mouse",
  strengths: ["resposta consistente para jogos casuais"],
  weaknesses: ["pode ser pesado para quem prefere mouse leve"],
};

function buildMockSearchCognition(primaryAxis = "performance") {
  return {
    primaryAxis,
    contextKey: `${primaryAxis}.default`,
    consequenceChain: {
      impact: "mais folga no uso pesado do dia a dia",
      consequence: "menos chance de sentir limitação no uso pesado depois de alguns meses",
    },
  };
}

function buildFullReply({ query, category, product, cognition, querySignals = {} }) {
  const specialist = buildSpecialistDecisionExplanation({
    query,
    category,
    product,
    searchCognition: cognition,
    querySignals,
    decisionMemory: {
      lastDecisionReason: cognition.consequenceChain.consequence,
      lastTradeoff: product.trustedSpecs?.weaknesses?.[0] || "",
      lastWinnerAdvantages: [cognition.primaryAxis || "performance"],
      lastWinnerSacrifices: ["screen"],
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

const SCENARIOS = [
  { id: "A", query: "celular até 2000", category: "celular", product: { product_name: "Apple iPhone 13", isDataLayerProduct: true, trustedSpecs: IPHONE_13_SPECS }, cognition: buildMockSearchCognition("longevity") },
  { id: "B", query: "celular até 2000 com câmera boa", category: "celular", product: { product_name: "Apple iPhone 13", isDataLayerProduct: true, trustedSpecs: IPHONE_13_SPECS }, cognition: buildMockSearchCognition("camera") },
  { id: "C", query: "quero um celular bom e barato", category: "celular", product: { product_name: "Motorola Moto G84", category: "celular" }, cognition: buildMockSearchCognition("value"), querySignals: { priceSensitive: true } },
  { id: "D", query: "notebook até 3000", category: "notebook", product: { product_name: "Notebook Lenovo IdeaPad 3", isDataLayerProduct: true, trustedSpecs: NOTEBOOK_SPECS }, cognition: buildMockSearchCognition("performance") },
  { id: "E", query: "quero uma tv boa para filmes", category: "tv", product: { product_name: "Smart TV Samsung 55", isDataLayerProduct: true, trustedSpecs: TV_SPECS }, cognition: buildMockSearchCognition("screen") },
  { id: "F", query: "monitor pra trabalhar", category: "monitor", product: { product_name: "Monitor LG UltraGear 27", isDataLayerProduct: true, trustedSpecs: MONITOR_SPECS }, cognition: buildMockSearchCognition("screen") },
  { id: "G", query: "cadeira confortável", category: "cadeira", product: { product_name: "Cadeira Ergonomica Office", isDataLayerProduct: true, trustedSpecs: CHAIR_SPECS }, cognition: buildMockSearchCognition("comfort") },
  { id: "H", query: "mouse bom pra jogo", category: "mouse", product: { product_name: "Mouse Gamer G502", isDataLayerProduct: true, trustedSpecs: MOUSE_SPECS }, cognition: buildMockSearchCognition("performance") },
  { id: "I", query: "quero um celular bom", category: "celular", product: { product_name: "Apple iPhone 13", isDataLayerProduct: true, trustedSpecs: IPHONE_13_SPECS }, cognition: buildMockSearchCognition("performance") },
  { id: "J", query: "me indica um celular até 2000 rápido", category: "celular", product: { product_name: "Apple iPhone 13", isDataLayerProduct: true, trustedSpecs: IPHONE_13_SPECS }, cognition: buildMockSearchCognition("performance") },
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

function runScenario(scenario) {
  console.log(`\n── Cenário ${scenario.id}: ${scenario.query} ──`);
  const reply = buildFullReply(scenario);
  const block = extractTradeoffBlockFromReply(reply);
  const flags = auditTradeoffCommunication(block, {
    expectBlock: true,
    allowedEvidence: scenario.product.trustedSpecs?.official_name || scenario.product.product_name,
  });

  console.log(`  block:\n${block.split("\n").map((line) => `    ${line}`).join("\n") || "    (none)"}`);
  console.log(`  flags: ${flags.join(", ") || "none"}`);

  assert(`${scenario.id}: reply built`, reply.length > 80, reply);
  assert(`${scenario.id}: tradeoff block present`, isTradeoffCommunicationUseful(block), block);
  assert(`${scenario.id}: gain detected`, /✅|\bganha\b/i.test(block), block);
  assert(`${scenario.id}: sacrifice detected`, /⚠️|\babre mão\b|\bnão terá\b/i.test(block), block);
  assert(`${scenario.id}: no tradeoff word`, !containsTradeoffWord(reply), reply);
  assert(`${scenario.id}: preserves 9.1A`, /\b(minha escolha|eu iria|vence|decis[aã]o)\b/i.test(reply), reply);
  assert(`${scenario.id}: preserves 9.1C`, /muita gente|detalhe|anúncio|nuance|faixa/i.test(reply), reply);
}

function runRegression(script) {
  const result = spawnSync(process.execPath, [join(ROOT, "scripts", script)], {
    encoding: "utf8",
    stdio: "pipe",
    cwd: ROOT,
  });
  const ok = result.status === 0;
  console.log(`${ok ? "PASS" : "FAIL"} ${script}`);
  return ok;
}

console.log("\nPATCH 9.1D — Tradeoff Communication Layer Audit\n");

console.log("── Diagnóstico ──");
const sources = resolveTradeoffCommunicationSources({
  structuredFacts: {
    strengthConsequences: ["experiência fluida no dia a dia"],
    weaknessConsequences: ["tela de 60 Hz pode parecer menos fluida"],
    idealForConsequences: ["quem prioriza estabilidade"],
  },
  primaryAxis: "longevity",
  decisionMemory: { lastWinnerAdvantages: ["longevity"], lastWinnerSacrifices: ["screen"] },
});
assert("sources resolve gains and sacrifices", sources.gains.length > 0 && sources.sacrifices.length > 0);

console.log("\n── Scenarios A–J ──");
for (const scenario of SCENARIOS) {
  runScenario(scenario);
}

console.log("\n── Suppression in recovery ──");
const suppressed = buildTradeoffCommunicationBlock({
  query: "celular até 2000",
  structuredFacts: {
    strengthConsequences: ["experiência fluida"],
    weaknessConsequences: ["tela menos fluida"],
  },
  sessionContext: { lastInteractionType: "user_confusion_recovery" },
  responsePath: "return_seguro",
});
assert("recovery suppresses block", !suppressed.ok, suppressed.error);

console.log("\n── Before / After ──");
const beforeBlock = buildTradeoffCommunicationAuditRecord({
  query: "celular até 2000",
  structuredFacts: { strengthConsequences: [], weaknessConsequences: [] },
  primaryAxis: "performance",
});
const afterBlock = buildTradeoffCommunicationAuditRecord({
  query: "celular até 2000",
  structuredFacts: {
    strengthConsequences: IPHONE_13_SPECS.strengths,
    weaknessConsequences: IPHONE_13_SPECS.weaknesses,
    idealForConsequences: IPHONE_13_SPECS.ideal_for,
  },
  decisionMemory: {
    lastWinnerAdvantages: ["longevity"],
    lastWinnerSacrifices: ["screen"],
  },
  primaryAxis: "longevity",
  allowedEvidence: "iPhone 13",
});
console.log("Antes:", beforeBlock.block || "(none)");
console.log("Depois:\n" + (afterBlock.block || "(none)"));
assert("after builds useful block", afterBlock.ok, afterBlock.block);

console.log("\n── Regressão 9.1A / 9.1B / 9.1C / 8.x ──");
let regressionFailures = 0;
for (const script of PRIOR_AUDITS) {
  if (!runRegression(script)) regressionFailures += 1;
}

console.log("\n══════════════════════════════════════");
console.log(`Static: ${passed} passed, ${failed} failed`);
console.log(`Regressions: ${PRIOR_AUDITS.length - regressionFailures}/${PRIOR_AUDITS.length} passed`);

const verdict =
  failed === 0 && regressionFailures === 0
    ? "A) ROBUST"
    : failed === 0 && regressionFailures <= 4
      ? "B) PARTIAL"
      : "C) FAIL";

console.log(`\nVEREDITO FINAL: ${verdict}`);
if (failures.length) {
  console.log("\nFailures:");
  for (const failure of failures) console.log(failure);
}

process.exit(failed === 0 && regressionFailures <= 4 ? 0 : 1);
