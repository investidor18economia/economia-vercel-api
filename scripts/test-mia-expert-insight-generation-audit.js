/**
 * PATCH 9.1H — Expert Insight Generation Layer Audit
 *
 * Usage:
 *   node scripts/test-mia-expert-insight-generation-audit.js
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  auditExpertInsightGeneration,
  buildExpertInsightAuditRecord,
  extractInsightCandidates,
  extractExpertInsightFromReply,
  isExpertInsightUseful,
} from "../lib/miaExpertInsightGenerationLayer.js";
import {
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
  "test-mia-data-layer-evidence-injection-audit.js",
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
  market_notes: ["para streaming, consistência de imagem pesa mais que recurso extra no anúncio"],
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

const MOUSE_SPECS = {
  official_name: "Mouse Logitech MX Master",
  category: "mouse",
  strengths: ["ergonomia confortável para uso prolongado no computador"],
  ideal_for: ["quem trabalha várias horas com mouse no dia a dia"],
  market_notes: ["para produtividade, conforto e precisão pesam mais que DPI máximo no anúncio"],
};

const KEYBOARD_SPECS = {
  official_name: "Teclado Keychron K2",
  category: "teclado",
  strengths: ["digitação confortável para longas sessões de trabalho"],
  ideal_for: ["quem digita muito durante o dia"],
  market_notes: ["para escritório, conforto de digitação pesa mais que layout exótico"],
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
  if (!specialist.ok) return { reply: "", specialist, insightFromParagraphs: "", evidenceFromParagraphs: "" };

  const evidenceFromParagraphs =
    specialist.paragraphs?.find((entry) => isEvidenceInjectionUseful(entry)) || "";
  const insightFromParagraphs =
    specialist.paragraphs?.find((entry) => isExpertInsightUseful(entry)) || "";

  const reply = appendUserIntentDiscovery({
    reply: specialist.text,
    query,
    category,
    searchCognition: cognition(primaryAxis),
    routingDecision: { allowNewSearch: true },
    responsePath: "return_seguro",
  }).reply;

  return { reply, specialist, insightFromParagraphs, evidenceFromParagraphs };
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

console.log("\nPATCH 9.1H — Expert Insight Generation Layer Audit\n");

console.log("── Diagnóstico ──");
console.log("  Intenção: evolução de SPECIALIST_DECISION_EXPLANATION (EXPERT INSIGHT)");
console.log("  Causa raiz: evidência 9.1G sem camada de relevância especialista (por que importa)");

const candidates = extractInsightCandidates(
  { text: "câmera continua consistente mesmo em fotos noturnas", field: "strengths" },
  {
    structuredFacts: {
      mode: "data_layer",
      strengthConsequences: ["menos preocupação em registrar bons momentos"],
      idealForConsequences: ["funciona melhor para quem prioriza estabilidade e longevidade de software"],
      allowedEvidence: "iPhone 13",
    },
    searchCognition: cognition("camera"),
    decisionMemory: { lastWinnerAdvantages: ["camera"] },
    evidenceText: "câmera continua consistente mesmo em fotos noturnas",
  }
);
assert("extract finds insight candidates from reasoning payload", candidates.length >= 1);
assert("insight candidate not duplicate of raw evidence", !candidates.some((c) => /fotos noturnas/i.test(c.text)));

const SCENARIOS = [
  { id: "A", label: "formal", query: "celular até 2000", category: "celular", product: { product_name: "iPhone 13", isDataLayerProduct: true, trustedSpecs: IPHONE_13_SPECS }, axis: "longevity" },
  { id: "B", label: "informal", query: "celular bom e barato", category: "celular", product: { product_name: "iPhone 13", isDataLayerProduct: true, trustedSpecs: IPHONE_13_SPECS }, axis: "value", querySignals: { priceSensitive: true } },
  { id: "C", label: "curto", query: "notebook trabalho", category: "notebook", product: { product_name: "Notebook Lenovo", isDataLayerProduct: true, trustedSpecs: NOTEBOOK_SPECS }, axis: "performance" },
  { id: "D", label: "incompleto", query: "quero tv", category: "tv", product: { product_name: "Smart TV Samsung", isDataLayerProduct: true, trustedSpecs: TV_SPECS }, axis: "screen" },
  { id: "E", label: "monitor", query: "monitor escritório", category: "monitor", product: { product_name: "Monitor LG", isDataLayerProduct: true, trustedSpecs: MONITOR_SPECS }, axis: "screen" },
  { id: "F", label: "cadeira", query: "cadeira home office", category: "cadeira", product: { product_name: "Cadeira Office", isDataLayerProduct: true, trustedSpecs: CHAIR_SPECS }, axis: "comfort" },
  { id: "G", label: "mouse", query: "mouse ergonômico trabalho", category: "mouse", product: { product_name: "Mouse Logitech", isDataLayerProduct: true, trustedSpecs: MOUSE_SPECS }, axis: "comfort" },
  { id: "H", label: "teclado", query: "teclado confortável", category: "teclado", product: { product_name: "Teclado Keychron", isDataLayerProduct: true, trustedSpecs: KEYBOARD_SPECS }, axis: "comfort" },
  { id: "I", label: "apressado", query: "qual compra rápido celular até 2000", category: "celular", product: { product_name: "iPhone 13", isDataLayerProduct: true, trustedSpecs: IPHONE_13_SPECS }, axis: "performance", querySignals: { rushed: true } },
  { id: "J", label: "typo/regional", query: "celuar ate 2000", category: "celular", product: { product_name: "iPhone 13", isDataLayerProduct: true, trustedSpecs: IPHONE_13_SPECS }, axis: "longevity" },
];

console.log("\n── Scenarios A–J ──");
for (const scenario of SCENARIOS) {
  console.log(`\n── Cenário ${scenario.id} (${scenario.label}): ${scenario.query} ──`);
  const { reply, insightFromParagraphs, evidenceFromParagraphs } = buildFullReply({
    query: scenario.query,
    category: scenario.category,
    product: scenario.product,
    primaryAxis: scenario.axis,
    querySignals: scenario.querySignals || {},
  });

  const insight = insightFromParagraphs || extractExpertInsightFromReply(reply);
  const evidence = evidenceFromParagraphs || extractEvidenceParagraphFromReply(reply);
  const flags = auditExpertInsightGeneration(insight, {
    expectInsight: true,
    allowedEvidence: scenario.product.trustedSpecs?.official_name || "",
    evidenceText: scenario.product.trustedSpecs?.strengths?.[0] || "",
  });

  console.log(`  evidence: ${evidence.slice(0, 90) || "(none)"}`);
  console.log(`  insight: ${insight.slice(0, 120) || "(none)"}`);
  console.log(`  flags: ${flags.join(", ") || "none"}`);

  assert(`${scenario.id}: reply built`, reply.length > 80);
  assert(`${scenario.id}: evidence still present (9.1G)`, isEvidenceInjectionUseful(evidence), evidence.slice(0, 80));
  assert(`${scenario.id}: expert insight present`, isExpertInsightUseful(insight), insight);
  assert(`${scenario.id}: insight explains relevance`, /porque|por que|conecta|entra na decis[aã]o|ignorado/i.test(insight), insight);
  assert(`${scenario.id}: not duplicate evidence`, !flags.includes("DUPLICATE_EVIDENCE"), insight);
  assert(`${scenario.id}: preserves tradeoff block`, /✅/.test(extractTradeoffBlockFromReply(reply) || reply));
  assert(`${scenario.id}: preserves 9.1F cleanup`, detectAntiAiLanguageFlags(reply).length === 0);
}

console.log("\n── Before / After ──");
const beforeOnlyEvidence = buildExpertInsightAuditRecord({
  query: "celular até 2000",
  product: { product_name: "iPhone 13", isDataLayerProduct: true, trustedSpecs: IPHONE_13_SPECS },
  structuredFacts: {
    mode: "data_layer",
    allowedEvidence: "iPhone 13",
    idealForConsequences: ["funciona melhor para quem prioriza estabilidade e longevidade de software"],
  },
  searchCognition: cognition("longevity"),
  decisionMemory: { lastWinnerAdvantages: ["longevity"] },
  evidence: { text: "câmera continua consistente mesmo em fotos noturnas", field: "strengths" },
  expectInsight: true,
  allowedEvidence: "iPhone 13",
});
console.log("Depois (insight):", beforeOnlyEvidence.paragraph || "(none)");
assert("insight generated from architecture payloads", beforeOnlyEvidence.ok, beforeOnlyEvidence.paragraph);

console.log("\n── Regressão 9.1A–G + 8.x ──");
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
