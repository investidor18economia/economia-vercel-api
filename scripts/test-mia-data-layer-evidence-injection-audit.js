/**
 * PATCH 9.1G — Data Layer Evidence Injection Layer Audit
 *
 * Usage:
 *   node scripts/test-mia-data-layer-evidence-injection-audit.js
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  auditDataLayerEvidenceInjection,
  buildDataLayerEvidenceInjectionAuditRecord,
  extractDataLayerEvidence,
  extractEvidenceParagraphFromReply,
  isEvidenceInjectionUseful,
} from "../lib/miaDataLayerEvidenceInjectionLayer.js";
import { buildSpecialistDecisionExplanation } from "../lib/miaSpecialistDecisionExplanationLayer.js";
import { appendUserIntentDiscovery } from "../lib/miaUserIntentDiscoveryLayer.js";
import { extractTradeoffBlockFromReply } from "../lib/miaTradeoffCommunicationLayer.js";
import { detectAntiAiLanguageFlags } from "../lib/miaAntiAiLanguageCleanupLayer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const PRIOR_AUDITS = [
  "test-mia-specialist-decision-explanation-audit.js",
  "test-mia-user-intent-discovery-audit.js",
  "test-mia-authority-signals-audit.js",
  "test-mia-tradeoff-communication-audit.js",
  "test-mia-comparison-experience-audit.js",
  "test-mia-anti-ai-language-cleanup-audit.js",
  "test-mia-winner-lifecycle-enforcement-audit.js",
  "test-mia-discussion-set-enforcement-audit.js",
  "test-mia-recommendation-stability-guard-audit.js",
  "test-mia-contradiction-recovery-audit.js",
  "test-mia-user-confusion-recovery-audit.js",
];

const IPHONE_13_SPECS = {
  official_name: "iPhone 13",
  category: "celular",
  strengths: [
    "ainda recebe atualizações de sistema como aparelho principal da linha",
    "câmera continua consistente mesmo em fotos noturnas",
  ],
  ideal_for: ["quem prioriza estabilidade e longevidade de software"],
  weaknesses: ["tela de 60 Hz pode parecer menos fluida se você veio de modelos Pro"],
  risk_notes: ["carregador não acompanha na caixa"],
  market_notes: ["Apple costuma manter suporte por mais tempo que rivais nessa faixa"],
};

const NOTEBOOK_SPECS = {
  official_name: "Notebook Lenovo IdeaPad 3",
  category: "notebook",
  strengths: ["desempenho equilibrado para estudo e trabalho sem travar em multitarefa básica"],
  ideal_for: ["quem precisa de notebook para uso diário sem exagero"],
  weaknesses: ["não é a melhor opção para edição pesada ou jogos exigentes"],
  market_notes: ["memória e armazenamento pesam mais que GHz no anúncio para uso real"],
};

const TV_SPECS = {
  official_name: "Smart TV Samsung 55 4K",
  category: "tv",
  strengths: ["imagem consistente para streaming de filmes e séries"],
  ideal_for: ["quem assiste filmes e séries"],
  weaknesses: ["apps de streaming podem variar de fluidez entre modelos"],
};

const MONITOR_SPECS = {
  official_name: "Monitor LG UltraGear 27",
  category: "monitor",
  strengths: ["fluidez boa para uso prolongado em home office"],
  ideal_for: ["quem passa o dia inteiro em frente ao monitor no escritório"],
  market_notes: ["para home office, fluidez e conforto visual pesam mais que resolução máxima"],
  weaknesses: ["não é o topo para edição de cor profissional"],
};

const CHAIR_SPECS = {
  official_name: "Cadeira Ergonomica Office",
  category: "cadeira",
  strengths: ["suporte básico para longas horas de home office"],
  market_notes: ["ajuste de altura e apoio lombar costumam valer mais que estética no home office"],
  weaknesses: ["ajustes finos podem ser limitados em modelos mais baratos"],
};

function cognition(axis = "performance") {
  return {
    primaryAxis: axis,
    consequenceChain: {
      impact: "mais folga no uso pesado do dia a dia",
      consequence: "menos chance de sentir limitação depois de alguns meses",
    },
  };
}

function buildFullReply({ query, category, product, primaryAxis = "performance", querySignals = {} }) {
  const specialist = buildSpecialistDecisionExplanation({
    query,
    category,
    product,
    searchCognition: cognition(primaryAxis),
    querySignals,
    decisionMemory: {
      lastWinnerAdvantages: [primaryAxis],
      lastWinnerSacrifices: ["screen"],
      lastTradeoff: product.trustedSpecs?.weaknesses?.[0] || "",
    },
    responsePath: "return_seguro",
  });
  if (!specialist.ok) return { reply: "", specialist, evidenceFromParagraphs: "" };
  const evidenceFromParagraphs =
    specialist.paragraphs?.find((entry) => isEvidenceInjectionUseful(entry)) || "";
  const reply = appendUserIntentDiscovery({
    reply: specialist.text,
    query,
    category,
    searchCognition: cognition(primaryAxis),
    routingDecision: { allowNewSearch: true },
    responsePath: "return_seguro",
  }).reply;
  return { reply, specialist, evidenceFromParagraphs };
}

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

console.log("\nPATCH 9.1G — Data Layer Evidence Injection Layer Audit\n");

console.log("── Diagnóstico ──");
console.log("  Intenção: evolução de SPECIALIST_DECISION_EXPLANATION (EVIDENCE INJECTION)");
console.log("  Causa raiz: consequências traduzidas genéricas; campos raw do Data Layer subutilizados");

const extracted = extractDataLayerEvidence(IPHONE_13_SPECS, "longevity");
assert("extract finds concrete data layer evidence", extracted.length >= 2);
assert("extract includes strengths/market/risk fields", extracted.some((e) => e.field === "strengths" || e.field === "market_notes"));

const SCENARIOS = [
  { id: "A", query: "celular até 2000", category: "celular", product: { product_name: "iPhone 13", isDataLayerProduct: true, trustedSpecs: IPHONE_13_SPECS }, axis: "longevity" },
  { id: "B", query: "celular até 2000 com câmera boa", category: "celular", product: { product_name: "iPhone 13", isDataLayerProduct: true, trustedSpecs: IPHONE_13_SPECS }, axis: "camera" },
  { id: "C", query: "notebook para trabalho até 3000", category: "notebook", product: { product_name: "Notebook Lenovo", isDataLayerProduct: true, trustedSpecs: NOTEBOOK_SPECS }, axis: "performance" },
  { id: "D", query: "quero uma tv boa para filmes", category: "tv", product: { product_name: "Smart TV Samsung", isDataLayerProduct: true, trustedSpecs: TV_SPECS }, axis: "screen" },
  { id: "E", query: "monitor para escritório", category: "monitor", product: { product_name: "Monitor LG", isDataLayerProduct: true, trustedSpecs: MONITOR_SPECS }, axis: "screen" },
  { id: "F", query: "cadeira home office", category: "cadeira", product: { product_name: "Cadeira Office", isDataLayerProduct: true, trustedSpecs: CHAIR_SPECS }, axis: "comfort" },
  { id: "G", query: "qual compra rápido celular até 2000", category: "celular", product: { product_name: "iPhone 13", isDataLayerProduct: true, trustedSpecs: IPHONE_13_SPECS }, axis: "performance" },
  { id: "H", query: "quero um celular bom", category: "celular", product: { product_name: "iPhone 13", isDataLayerProduct: true, trustedSpecs: IPHONE_13_SPECS }, axis: "longevity" },
  { id: "I", query: "celular bom e barato", category: "celular", product: { product_name: "iPhone 13", isDataLayerProduct: true, trustedSpecs: IPHONE_13_SPECS }, axis: "value", querySignals: { priceSensitive: true } },
  { id: "J", query: "celuar ate 2000", category: "celular", product: { product_name: "iPhone 13", isDataLayerProduct: true, trustedSpecs: IPHONE_13_SPECS }, axis: "longevity" },
];

console.log("\n── Scenarios A–J ──");
for (const scenario of SCENARIOS) {
  console.log(`\n── Cenário ${scenario.id}: ${scenario.query} ──`);
  const { reply, evidenceFromParagraphs } = buildFullReply({
    query: scenario.query,
    category: scenario.category,
    product: scenario.product,
    primaryAxis: scenario.axis,
    querySignals: scenario.querySignals || {},
  });

  const evidence = evidenceFromParagraphs || extractEvidenceParagraphFromReply(reply);
  const flags = auditDataLayerEvidenceInjection(evidence, {
    expectEvidence: true,
    allowedEvidence: scenario.product.trustedSpecs?.official_name || "",
  });

  console.log(`  evidence: ${evidence || "(none)"}`);
  console.log(`  flags: ${flags.join(", ") || "none"}`);

  assert(`${scenario.id}: reply built`, reply.length > 80, reply.slice(0, 100));
  assert(`${scenario.id}: evidence paragraph present`, isEvidenceInjectionUseful(evidence), evidence);
  assert(`${scenario.id}: not generic evidence`, !/ganho percept[ií]vel no uso real|menos preocupa[cç][aã]o com autonomia/i.test(evidence), evidence);
  assert(`${scenario.id}: no spec dump`, !/\b\d+\s*mah\b|\b120hz\b/i.test(evidence), evidence);
  assert(`${scenario.id}: preserves tradeoff block`, /✅/.test(extractTradeoffBlockFromReply(reply) || reply), reply.slice(-200));
  assert(`${scenario.id}: preserves 9.1F cleanup`, detectAntiAiLanguageFlags(reply).length === 0, detectAntiAiLanguageFlags(reply).join(", "));
  assert(`${scenario.id}: decision reason present`, /\b(minha escolha|eu iria|vence|decis[aã]o|ficou no topo|venceu)\b/i.test(reply), reply.slice(0, 160));
}

console.log("\n── Before / After ──");
const before = buildSpecialistDecisionExplanation({
  query: "celular até 2000",
  category: "celular",
  product: { product_name: "iPhone 13", isDataLayerProduct: true, trustedSpecs: { ...IPHONE_13_SPECS, strengths: ["experiência fluida no dia a dia"] } },
  searchCognition: cognition("longevity"),
  decisionMemory: { lastWinnerAdvantages: ["longevity"], lastWinnerSacrifices: ["screen"] },
  responsePath: "return_seguro",
});
const after = buildDataLayerEvidenceInjectionAuditRecord({
  query: "celular até 2000",
  product: { product_name: "iPhone 13", isDataLayerProduct: true, trustedSpecs: IPHONE_13_SPECS },
  structuredFacts: { mode: "data_layer", allowedEvidence: "iPhone 13" },
  primaryAxis: "longevity",
  expectEvidence: true,
  allowedEvidence: "iPhone 13",
});
console.log("Antes (genérico):", before.text?.slice(0, 140));
console.log("Depois (evidência):", after.paragraph || "(none)");
assert("after injects concrete evidence", after.ok && after.dataLayerEvidenceDetected, after.paragraph);

console.log("\n── Regressão 9.1A–F + 8.x ──");
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
      : "C) FRAGILE";
console.log(`\nVEREDITO FINAL: ${verdict}`);

if (failures.length) {
  console.log("\nFailures:");
  for (const msg of failures) console.log(msg);
}

process.exit(failed === 0 ? 0 : 1);
