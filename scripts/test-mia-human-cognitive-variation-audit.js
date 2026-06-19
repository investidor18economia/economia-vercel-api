/**
 * PATCH 9.1I — Human Cognitive Variation Layer Audit
 *
 * Usage:
 *   node scripts/test-mia-human-cognitive-variation-audit.js
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  NARRATIVE_PATTERNS,
  applyHumanCognitiveVariation,
  auditHumanCognitiveVariation,
  buildVariationSignals,
  extractBlockOrderFromReply,
  finalizeReplyWithHumanCognitiveVariation,
  selectNarrativePattern,
} from "../lib/miaHumanCognitiveVariationLayer.js";
import { isEvidenceInjectionUseful } from "../lib/miaDataLayerEvidenceInjectionLayer.js";
import { isExpertInsightUseful, INSIGHT_MARKER_PATTERN } from "../lib/miaExpertInsightGenerationLayer.js";
import { buildSpecialistDecisionExplanation } from "../lib/miaSpecialistDecisionExplanationLayer.js";
import { appendUserIntentDiscovery } from "../lib/miaUserIntentDiscoveryLayer.js";
import { extractTradeoffBlockFromReply } from "../lib/miaTradeoffCommunicationLayer.js";
import { detectAntiAiLanguageFlags, cleanupMiaHumanLanguage } from "../lib/miaAntiAiLanguageCleanupLayer.js";
import { findInventedSpecViolations } from "../lib/miaProductExplanationBuilder.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const PRIOR_AUDITS = [
  "test-mia-specialist-decision-explanation-audit.js",
  "test-mia-data-layer-evidence-injection-audit.js",
  "test-mia-expert-insight-generation-audit.js",
  "test-mia-user-intent-discovery-audit.js",
  "test-mia-authority-signals-audit.js",
  "test-mia-tradeoff-communication-audit.js",
  "test-mia-comparison-experience-audit.js",
  "test-mia-anti-ai-language-cleanup-audit.js",
];

const GENERIC_SPECS = {
  celular: {
    official_name: "Modelo Orion X1",
    category: "celular",
    strengths: ["recebe atualizações de sistema por vários anos sem ficar para trás"],
    market_notes: ["suporte longo de software pesa mais que megapixel no anúncio"],
    risk_notes: ["carregador pode não acompanhar na caixa"],
    ideal_for: ["quem quer ficar vários anos sem trocar"],
  },
  notebook: {
    official_name: "Notebook Vega Pro 14",
    category: "notebook",
    strengths: ["desempenho equilibrado para estudo e trabalho sem travar em multitarefa básica"],
    market_notes: ["memória e armazenamento pesam mais que GHz no anúncio para uso real"],
    ideal_for: ["quem precisa de notebook para uso diário sem exagero"],
    weaknesses: ["não é a melhor opção para edição pesada ou jogos exigentes"],
  },
  monitor: {
    official_name: "Monitor Helix View 27",
    category: "monitor",
    strengths: ["fluidez boa para uso prolongado em home office"],
    market_notes: ["para home office, fluidez e conforto visual pesam mais que resolução máxima"],
    ideal_for: ["quem passa o dia inteiro em frente ao monitor no escritório"],
  },
  tv: {
    official_name: "TV Lumina 55",
    category: "tv",
    strengths: ["imagem consistente para streaming de filmes e séries"],
    ideal_for: ["quem assiste filmes e séries com regularidade"],
    market_notes: ["consistência de imagem pesa mais que recurso extra no anúncio"],
    weaknesses: ["apps de streaming podem variar de fluidez entre modelos"],
  },
  cadeira: {
    official_name: "Cadeira Atlas Ergo",
    category: "cadeira",
    strengths: ["suporte básico para longas horas de home office"],
    market_notes: ["ajuste de altura e apoio lombar costumam valer mais que estética no home office"],
  },
  mouse: {
    official_name: "Mouse Pulse Ergo",
    category: "mouse",
    strengths: ["ergonomia confortável para uso prolongado no computador"],
    market_notes: ["conforto e precisão pesam mais que DPI máximo no anúncio"],
  },
  teclado: {
    official_name: "Teclado Axis Pro",
    category: "teclado",
    strengths: ["digitação confortável para longas sessões de trabalho"],
    market_notes: ["conforto de digitação pesa mais que layout exótico"],
  },
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

function buildPipelineReply({
  query,
  category,
  trustedSpecs,
  axis = "performance",
  querySignals = {},
  isFollowUp = false,
}) {
  const winnerName = trustedSpecs.official_name;
  const product = {
    product_name: winnerName,
    isDataLayerProduct: true,
    trustedSpecs,
    category,
  };

  const specialist = buildSpecialistDecisionExplanation({
    query,
    category,
    product,
    searchCognition: cognition(axis),
    querySignals,
    decisionMemory: {
      lastWinnerAdvantages: [axis],
      lastWinnerSacrifices: ["screen"],
      lastTradeoff: trustedSpecs.weaknesses?.[0] || "",
    },
    responsePath: "return_seguro",
    sessionContext: isFollowUp ? { lastBestProduct: { product_name: winnerName } } : {},
  });

  if (!specialist.ok) return { reply: "", before: "", pattern: null, winnerName, specialist };

  const withIntent = appendUserIntentDiscovery({
    reply: specialist.text,
    query,
    category,
    searchCognition: cognition(axis),
    querySignals,
    routingDecision: { allowNewSearch: !isFollowUp },
    responsePath: "return_seguro",
    sessionContext: isFollowUp ? { lastBestProduct: { product_name: winnerName } } : {},
  }).reply;

  const intentSuffix = withIntent.startsWith(specialist.text)
    ? withIntent.slice(specialist.text.length).trim()
    : "";
  const paragraphs = [...(specialist.paragraphs || [])];
  if (intentSuffix) paragraphs.push(intentSuffix);

  const variedRaw = applyHumanCognitiveVariation({
    reply: withIntent,
    paragraphs,
    query,
    querySignals,
    searchCognition: cognition(axis),
    routingDecision: { allowNewSearch: !isFollowUp },
    sessionContext: isFollowUp ? { lastBestProduct: { product_name: winnerName } } : {},
    winnerName,
    productName: winnerName,
    allowedEvidence: winnerName,
    primaryAxis: axis,
    isFollowUp,
    responsePath: "return_seguro",
  });

  const cleanedText = variedRaw.ok
    ? cleanupMiaHumanLanguage(variedRaw.text, {
        allowedEvidence: winnerName,
        winnerName,
        preserveStructure: true,
      }).text || variedRaw.text
    : withIntent;

  return {
    reply: cleanedText,
    before: withIntent,
    pattern: variedRaw.pattern,
    blockOrder: variedRaw.blockOrder || extractBlockOrderFromReply(cleanedText),
    winnerName,
    specialist,
    variationOk: variedRaw.ok,
  };
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
    failures.push(msg.trim());
    console.log(msg);
  }
}

console.log("\nPATCH 9.1I — Human Cognitive Variation Layer Audit\n");

const SCENARIOS = [
  { id: "A", profile: "orçamento explícito", query: "celular até 2000 com boa durabilidade", cat: "celular", axis: "longevity", querySignals: { priceSensitive: true }, expected: NARRATIVE_PATTERNS.BUDGET_FIRST },
  { id: "B", profile: "apressado", query: "qual compra rápido celular até 2000", cat: "celular", axis: "performance", querySignals: { rushed: true }, expected: NARRATIVE_PATTERNS.DIRECT_DECISION_FIRST },
  { id: "C", profile: "inseguro", query: "tenho medo de errar notebook até 3500", cat: "notebook", axis: "performance", querySignals: { indecisive: true }, expected: NARRATIVE_PATTERNS.RISK_FIRST },
  { id: "D", profile: "leigo", query: "quero um celular bom sem complicação", cat: "celular", axis: "longevity", querySignals: {} },
  { id: "E", profile: "técnico", query: "notebook 16gb ssd para trabalho pesado", cat: "notebook", axis: "performance", querySignals: {} },
  { id: "F", profile: "informal", query: "celular bom e barato mano", cat: "celular", axis: "value", querySignals: { priceSensitive: true } },
  { id: "G", profile: "curto", query: "monitor escritório", cat: "monitor", axis: "screen", querySignals: {} },
  { id: "H", profile: "typo", query: "cadiera home office", cat: "cadeira", axis: "comfort", querySignals: {} },
  { id: "I", profile: "não celular", query: "tv boa para filmes", cat: "tv", axis: "screen", querySignals: {} },
  { id: "J", profile: "follow-up curto", query: "e o mouse?", cat: "mouse", axis: "comfort", querySignals: {}, isFollowUp: true, expected: NARRATIVE_PATTERNS.COMPACT_CONSULTANT },
];

const patternHits = new Set();
const orders = [];

console.log("── Scenarios A–J ──");
for (const scenario of SCENARIOS) {
  console.log(`\n── ${scenario.id} (${scenario.profile}): ${scenario.query} ──`);
  const specs = GENERIC_SPECS[scenario.cat];
  const result = buildPipelineReply({
    query: scenario.query,
    category: scenario.cat,
    trustedSpecs: specs,
    axis: scenario.axis,
    querySignals: scenario.querySignals,
    isFollowUp: scenario.isFollowUp,
  });

  console.log(`  pattern: ${result.pattern || "(none)"}`);
  console.log(`  order: ${(result.blockOrder || []).join(" → ")}`);

  patternHits.add(result.pattern);
  orders.push({ id: scenario.id, order: result.blockOrder || [] });

  assert(`${scenario.id}: reply built`, result.reply.length > 80);
  assert(`${scenario.id}: variation applied`, result.variationOk !== false);
  assert(`${scenario.id}: cognition preserved (audit)`, result.variationOk === true);
  if (scenario.expected) {
    assert(`${scenario.id}: expected pattern ${scenario.expected}`, result.pattern === scenario.expected, result.pattern);
  } else {
    assert(`${scenario.id}: pattern selected`, !!result.pattern);
  }
  assert(`${scenario.id}: winner preserved`, result.reply.includes(result.winnerName));
  assert(`${scenario.id}: evidence preserved`, isEvidenceInjectionUseful(result.reply));
  const hadInsight = result.specialist?.paragraphs?.some((p) => isExpertInsightUseful(p));
  assert(
    `${scenario.id}: insight preserved`,
    !hadInsight || INSIGHT_MARKER_PATTERN.test(result.reply)
  );
  assert(`${scenario.id}: tradeoff preserved`, /✅/.test(extractTradeoffBlockFromReply(result.reply) || result.reply));
  assert(`${scenario.id}: no invented content`, findInventedSpecViolations(result.reply, result.winnerName).length === 0);
  assert(`${scenario.id}: 9.1F clean`, detectAntiAiLanguageFlags(result.reply).length === 0);
}

console.log("\n── Structural variation ──");
const uniquePatterns = patternHits.size;
assert("multiple narrative patterns used", uniquePatterns >= 3, `patterns=${[...patternHits].join(", ")}`);

const orderSignatures = orders.map((entry) => entry.order.join("|"));
const uniqueOrders = new Set(orderSignatures);
assert("block order varies across scenarios", uniqueOrders.size >= 4, `unique=${uniqueOrders.size}`);

const budgetOrder = orders.find((o) => o.id === "A")?.order || [];
const rushedOrder = orders.find((o) => o.id === "B")?.order || [];
assert(
  "budget vs rushed produce different openings",
  budgetOrder[0] !== rushedOrder[0] || budgetOrder.slice(0, 3).join() !== rushedOrder.slice(0, 3).join()
);

console.log("\n── Pattern signal mapping ──");
const budgetSignals = buildVariationSignals({ query: "celular até 2000", hasEvidence: true, hasExpertInsight: true });
assert("budget query maps to BUDGET_FIRST", selectNarrativePattern(budgetSignals) === NARRATIVE_PATTERNS.BUDGET_FIRST);
const rushedSignals = buildVariationSignals({ query: "qual compra rápido", rushed: true, hasEvidence: true });
assert("rushed maps to DIRECT_DECISION_FIRST", selectNarrativePattern(rushedSignals) === NARRATIVE_PATTERNS.DIRECT_DECISION_FIRST);

console.log("\n── Regressão 9.1A–H ──");
let regressionFailures = 0;
for (const script of PRIOR_AUDITS) {
  const run = spawnSync(process.execPath, [join(ROOT, "scripts", script)], {
    encoding: "utf8",
    stdio: "pipe",
    cwd: ROOT,
  });
  const ok = run.status === 0;
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
console.log(`VEREDITO FINAL: ${verdict}`);
console.log("══════════════════════════════════════\n");

if (failures.length) {
  console.log("Failures:");
  for (const msg of failures) console.log(msg);
}

process.exit(failed === 0 ? 0 : 1);
