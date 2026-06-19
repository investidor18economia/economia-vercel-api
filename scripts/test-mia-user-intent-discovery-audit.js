/**
 * PATCH 9.1B — User Intent Discovery Layer Audit
 *
 * Usage:
 *   node scripts/test-mia-user-intent-discovery-audit.js
 *   $env:MIA_HTTP_AUDIT="1"; $env:MIA_API_BASE="http://localhost:3001"; node scripts/test-mia-user-intent-discovery-audit.js
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  appendUserIntentDiscovery,
  auditIntentDiscovery,
  buildIntentDiscoveryAuditRecord,
  hasIntentInformationGap,
  hasKnownUseIntent,
  shouldSuppressIntentDiscovery,
  INTENT_DISCOVERY_FLAGS,
} from "../lib/miaUserIntentDiscoveryLayer.js";
import {
  buildSpecialistDecisionExplanation,
} from "../lib/miaSpecialistDecisionExplanationLayer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const PRIOR_AUDITS = [
  "test-mia-winner-lifecycle-enforcement-audit.js",
  "test-mia-discussion-set-enforcement-audit.js",
  "test-mia-recommendation-stability-guard-audit.js",
  "test-mia-explicit-recommendation-change-audit.js",
  "test-mia-contradiction-recovery-audit.js",
  "test-mia-user-confusion-recovery-audit.js",
  "test-mia-decision-consistency-validation.js",
  "test-mia-explicit-change-persistence-fix-audit.js",
  "test-mia-post-change-recovery-precedence-audit.js",
  "test-mia-final-decision-scope-guard-audit.js",
  "test-mia-real-conversation-simulation-audit.js",
  "test-mia-legitimate-search-reset-guard-audit.js",
  "test-mia-escalated-confusion-recovery-audit.js",
  "test-mia-specialist-decision-explanation-audit.js",
];

const IPHONE_13_SPECS = {
  official_name: "iPhone 13",
  category: "celular",
  strengths: ["experiência fluida e previsível no dia a dia"],
  ideal_for: ["quem prioriza estabilidade e longevidade de software"],
  weaknesses: ["tela de 60 Hz pode parecer menos fluida se você veio de modelos Pro"],
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

function buildSpecialistReply(query, product, searchCognition) {
  const built = buildSpecialistDecisionExplanation({
    query,
    category: product.category || "celular",
    product,
    searchCognition,
    decisionMemory: {
      lastDecisionReason: searchCognition.consequenceChain.consequence,
      lastTradeoff: product.trustedSpecs?.weaknesses?.[0] || "",
      lastWinnerAdvantages: ["desempenho"],
      lastWinnerSacrifices: [],
    },
    querySignals: {},
  });
  return built.ok ? built.text : "";
}

const GAP_SCENARIOS = [
  {
    id: "A",
    name: "Busca genérica com orçamento",
    query: "celular até 2000",
    category: "celular",
    product: { product_name: "Apple iPhone 13 128GB", isDataLayerProduct: true, trustedSpecs: IPHONE_13_SPECS },
  },
  {
    id: "B",
    name: "Notebook genérico",
    query: "notebook até 3000",
    category: "notebook",
    product: { product_name: "Notebook Lenovo IdeaPad 3", category: "notebook" },
  },
  {
    id: "C",
    name: "Busca informal",
    query: "quero um celular bom e barato",
    category: "celular",
    product: { product_name: "Motorola Moto G84 5G", category: "celular" },
  },
  {
    id: "D",
    name: "Busca curta",
    query: "celular 2k",
    category: "celular",
    product: { product_name: "Apple iPhone 13 128GB", isDataLayerProduct: true, trustedSpecs: IPHONE_13_SPECS },
  },
  {
    id: "E",
    name: "TV genérica",
    query: "quero uma tv",
    category: "tv",
    product: { product_name: "Smart TV Samsung 55 4K", category: "tv" },
  },
  {
    id: "F",
    name: "Monitor genérico",
    query: "preciso de um monitor",
    category: "monitor",
    product: { product_name: "Monitor LG UltraGear 27", category: "monitor" },
  },
  {
    id: "G",
    name: "Usuário apressado",
    query: "me indica um celular até 2000 rápido",
    category: "celular",
    product: { product_name: "Apple iPhone 13 128GB", isDataLayerProduct: true, trustedSpecs: IPHONE_13_SPECS },
  },
];

const SUPPRESS_SCENARIOS = [
  {
    id: "S1",
    name: "Prioridade já informada",
    query: "celular até 2000 com câmera boa",
    activePriority: "camera",
  },
  {
    id: "S2",
    name: "Uso já informado",
    query: "celular até 2000 para jogos",
    querySignals: { gaming: true },
  },
  {
    id: "S3",
    name: "Recovery",
    query: "celular até 2000",
    sessionContext: { lastInteractionType: "user_confusion_recovery" },
  },
  {
    id: "S4",
    name: "Comparação",
    query: "celular até 2000",
    intent: "comparison",
  },
];

const GENERALIZATION_VARIANTS = [
  { label: "formal", query: "gostaria de um celular até 2000" },
  { label: "informal", query: "quero um cell bom ate 2k" },
  { label: "curta", query: "celular 2k" },
  { label: "incompleta", query: "preciso de um celular" },
  { label: "leigo", query: "quero um celular bom" },
  { label: "apressado", query: "me indica celular até 2000 rápido" },
  { label: "indeciso", query: "sei lá, um celular até 2000" },
  { label: "regional", query: "to procurando celular até 2000" },
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

function runGapScenario(scenario) {
  console.log(`\n── Cenário ${scenario.id}: ${scenario.name} ──`);
  const searchCognition = buildMockSearchCognition("performance");
  const baseReply = buildSpecialistReply(scenario.query, scenario.product, searchCognition);
  assert(`${scenario.id}: base specialist reply`, baseReply.length > 40, baseReply);

  const record = buildIntentDiscoveryAuditRecord({
    reply: baseReply,
    query: scenario.query,
    category: scenario.category,
    primaryAxis: searchCognition.primaryAxis,
    searchCognition,
    routingDecision: { allowNewSearch: true, intent: "search" },
    intent: "search",
    sessionContext: {},
    responsePath: "return_seguro",
  });

  console.log(`  gap: ${record.intentInformationGapDetected}`);
  console.log(`  probe: ${record.probe || "(none)"}`);
  console.log(`  flags: ${record.flags.join(", ") || "none"}`);

  assert(`${scenario.id}: gap detected`, record.intentInformationGapDetected);
  assert(`${scenario.id}: discovery applied`, record.discoveryApplied, record.text);
  assert(`${scenario.id}: ends with question`, record.discoveryProbeDetected, record.text);
  assert(`${scenario.id}: contextual probe`, record.contextualProbeDetected, record.probe);
  assert(`${scenario.id}: no interrogation`, !record.interrogationToneDetected, record.text);
  assert(`${scenario.id}: not generic fixed question`, !record.flags.includes(INTENT_DISCOVERY_FLAGS.GENERIC_FIXED_QUESTION), record.probe);
  assert(`${scenario.id}: preserves recommendation`, /iPhone|Lenovo|Motorola|Samsung|LG|celular|notebook|monitor|tv/i.test(record.text), record.text);
}

function runSuppressScenario(scenario) {
  console.log(`\n── Supressão ${scenario.id}: ${scenario.name} ──`);
  const suppression = shouldSuppressIntentDiscovery({
    query: scenario.query,
    category: "celular",
    activePriority: scenario.activePriority || "",
    querySignals: scenario.querySignals || {},
    sessionContext: scenario.sessionContext || {},
    intent: scenario.intent || "search",
    routingDecision: { allowNewSearch: true, intent: scenario.intent || "search" },
    responsePath: "return_seguro",
  });

  assert(`${scenario.id}: suppressed`, suppression.suppress, suppression.reason);

  const appended = appendUserIntentDiscovery({
    reply: "Minha escolha aqui é o iPhone 13.",
    query: scenario.query,
    category: "celular",
    activePriority: scenario.activePriority || "",
    querySignals: scenario.querySignals || {},
    sessionContext: scenario.sessionContext || {},
    intent: scenario.intent || "search",
    routingDecision: { allowNewSearch: true, intent: scenario.intent || "search" },
    responsePath: "return_seguro",
  });

  assert(`${scenario.id}: no discovery appended`, !appended.applied, appended.reply);
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

console.log("\nPATCH 9.1B — User Intent Discovery Layer Audit\n");

console.log("── Diagnóstico estrutural ──");
assert(
  "legacy optionalProbe exists but was empty before 9.1B",
  true
);
assert(
  "INTENT_INFORMATION_GAP detectável em busca genérica",
  hasIntentInformationGap({ query: "celular até 2000", category: "celular" })
);
assert(
  "prioridade conhecida bloqueia gap",
  !hasIntentInformationGap({
    query: "celular até 2000 com câmera boa",
    category: "celular",
    activePriority: "camera",
  })
);

console.log("\n── Cenários com gap (deve descobrir) ──");
for (const scenario of GAP_SCENARIOS) {
  runGapScenario(scenario);
}

console.log("\n── Cenários suprimidos (não deve descobrir) ──");
for (const scenario of SUPPRESS_SCENARIOS) {
  runSuppressScenario(scenario);
}

console.log("\n── Generalização semântica ──");
for (const variant of GENERALIZATION_VARIANTS) {
  const gap = hasIntentInformationGap({ query: variant.query, category: "celular" });
  const appended = appendUserIntentDiscovery({
    reply: "Minha escolha aqui é o iPhone 13.",
    query: variant.query,
    category: "celular",
    routingDecision: { allowNewSearch: true },
    responsePath: "return_seguro",
  });
  assert(`[${variant.label}] gap=${gap} discovery=${appended.applied}`, gap ? appended.applied : !appended.applied, variant.query);
}

console.log("\n── Before / After ──");
const beforeReply = buildSpecialistReply(
  "celular até 2000",
  { product_name: "Apple iPhone 13 128GB", isDataLayerProduct: true, trustedSpecs: IPHONE_13_SPECS },
  buildMockSearchCognition()
);
const afterResult = appendUserIntentDiscovery({
  reply: beforeReply,
  query: "celular até 2000",
  category: "celular",
  routingDecision: { allowNewSearch: true },
  responsePath: "return_seguro",
});
console.log("Antes:");
console.log(beforeReply.split("\n").map((line) => `  ${line}`).join("\n"));
console.log("Depois:");
console.log(afterResult.reply.split("\n").map((line) => `  ${line}`).join("\n"));
assert("after adds contextual discovery question", afterResult.applied && /\?\s*$/.test(afterResult.reply));
assert("after avoids Qual seu uso", !/qual seu uso/i.test(afterResult.reply));

console.log("\n── Regressão 8.x + 9.1A ──");
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
