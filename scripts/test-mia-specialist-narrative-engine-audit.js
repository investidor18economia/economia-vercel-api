/**
 * PATCH 9.2A — Specialist Narrative Engine Audit
 *
 * Usage:
 *   node scripts/test-mia-specialist-narrative-engine-audit.js
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { buildSpecialistDecisionExplanation } from "../lib/miaSpecialistDecisionExplanationLayer.js";
import { appendUserIntentDiscovery } from "../lib/miaUserIntentDiscoveryLayer.js";
import { finalizeReplyWithHumanCognitiveVariation } from "../lib/miaHumanCognitiveVariationLayer.js";
import { finalizeReplyWithArgumentMemory } from "../lib/miaArgumentMemoryEngine.js";
import {
  auditSpecialistNarrative,
  finalizeReplyWithSpecialistNarrative,
  hasSpecialistClosing,
  measureNarrativeReadability,
} from "../lib/miaSpecialistNarrativeEngine.js";
import { isEvidenceInjectionUseful } from "../lib/miaDataLayerEvidenceInjectionLayer.js";
import { INSIGHT_MARKER_PATTERN } from "../lib/miaExpertInsightGenerationLayer.js";
import { extractTradeoffBlockFromReply } from "../lib/miaTradeoffCommunicationLayer.js";
import { detectAntiAiLanguageFlags } from "../lib/miaAntiAiLanguageCleanupLayer.js";
import { findInventedSpecViolations } from "../lib/miaProductExplanationBuilder.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const PRIOR_AUDITS = [
  "test-mia-argument-memory-engine-audit.js",
  "test-mia-human-cognitive-variation-audit.js",
  "test-mia-anti-ai-language-cleanup-audit.js",
];

const SPECS = {
  celular: {
    official_name: "Modelo Orion X1",
    category: "celular",
    strengths: ["recebe atualizações de sistema por vários anos sem ficar para trás", "câmera continua consistente mesmo em fotos noturnas"],
    market_notes: ["suporte longo de software pesa mais que megapixel no anúncio"],
    risk_notes: ["carregador pode não acompanhar na caixa"],
    ideal_for: ["quem quer ficar vários anos sem trocar"],
    weaknesses: ["tela de 60 Hz pode parecer menos fluida"],
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
    weaknesses: ["não é o topo para edição de cor profissional"],
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
    weaknesses: ["ajustes finos podem ser limitados em modelos mais baratos"],
  },
  mouse: {
    official_name: "Mouse Pulse Ergo",
    category: "mouse",
    strengths: ["ergonomia confortável para uso prolongado no computador"],
    market_notes: ["conforto e precisão pesam mais que DPI máximo no anúncio"],
    weaknesses: ["peso pode parecer alto para quem prefere mouse leve"],
  },
  teclado: {
    official_name: "Teclado Axis Pro",
    category: "teclado",
    strengths: ["digitação confortável para longas sessões de trabalho"],
    market_notes: ["conforto de digitação pesa mais que layout exótico"],
    weaknesses: ["ruído das teclas pode incomodar em ambiente silencioso"],
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
  previousMemory = null,
  allowNewSearch = true,
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

  if (!specialist.ok) {
    return { reply: "", beforeNarrative: "", narrativeOk: false, winnerName, specialist };
  }

  let reply = appendUserIntentDiscovery({
    reply: specialist.text,
    query,
    category,
    searchCognition: cognition(axis),
    querySignals,
    routingDecision: { allowNewSearch: !isFollowUp && allowNewSearch },
    responsePath: "return_seguro",
    sessionContext: isFollowUp ? { lastBestProduct: { product_name: winnerName } } : {},
  }).reply;

  const varied = finalizeReplyWithHumanCognitiveVariation({
    reply,
    paragraphs: specialist.paragraphs,
    query,
    querySignals,
    winnerName,
    productName: winnerName,
    allowedEvidence: winnerName,
    primaryAxis: axis,
    isFollowUp,
    responsePath: "return_seguro",
  });

  if (varied.ok && varied.text) reply = varied.text;

  const memoryResult = finalizeReplyWithArgumentMemory({
    reply,
    query,
    querySignals,
    previousMemory,
    winnerName,
    productName: winnerName,
    allowedEvidence: winnerName,
    primaryAxis: axis,
    isFollowUp,
    allowNewSearch: !isFollowUp && allowNewSearch,
    responsePath: "return_seguro",
  });

  if (memoryResult.ok && memoryResult.text) reply = memoryResult.text;

  const beforeNarrative = reply;
  const narrative = finalizeReplyWithSpecialistNarrative({
    reply,
    query,
    querySignals,
    winnerName,
    productName: winnerName,
    allowedEvidence: winnerName,
    primaryAxis: axis,
    isFollowUp,
    previousMemory: memoryResult.memory || previousMemory,
    argumentMemory: memoryResult.memory || previousMemory,
    responsePath: "return_seguro",
  });

  return {
    reply: narrative.text || beforeNarrative,
    beforeNarrative,
    narrativeOk: narrative.ok,
    readability: narrative.readability,
    memory: memoryResult.memory || previousMemory,
    winnerName,
    specialist,
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

console.log("\nPATCH 9.2A — Specialist Narrative Engine Audit\n");

const SCENARIOS = [
  { id: "A", profile: "orçamento explícito", query: "celular até 2000 com boa durabilidade", cat: "celular", axis: "longevity", querySignals: { priceSensitive: true } },
  { id: "B", profile: "apressado", query: "qual compra rápido celular até 2000", cat: "celular", axis: "performance", querySignals: { rushed: true } },
  { id: "C", profile: "inseguro", query: "tenho medo de errar notebook até 3500", cat: "notebook", axis: "performance", querySignals: { indecisive: true } },
  { id: "D", profile: "leigo", query: "quero um celular bom sem complicação", cat: "celular", axis: "longevity", querySignals: {} },
  { id: "E", profile: "técnico", query: "notebook 16gb ssd para trabalho pesado", cat: "notebook", axis: "performance", querySignals: {} },
  { id: "F", profile: "informal", query: "celular bom e barato mano", cat: "celular", axis: "value", querySignals: { priceSensitive: true } },
  { id: "G", profile: "notebook", query: "notebook para estudo até 3000", cat: "notebook", axis: "performance", querySignals: {} },
  { id: "H", profile: "monitor", query: "monitor home office confortável", cat: "monitor", axis: "screen", querySignals: {} },
  { id: "I", profile: "cadeira", query: "cadeira ergonômica home office", cat: "cadeira", axis: "comfort", querySignals: {} },
];

console.log("── Scenarios A–I ──");
for (const scenario of SCENARIOS) {
  console.log(`\n── ${scenario.id} (${scenario.profile}): ${scenario.query} ──`);
  const specs = SPECS[scenario.cat];
  const result = buildPipelineReply({
    query: scenario.query,
    category: scenario.cat,
    trustedSpecs: specs,
    axis: scenario.axis,
    querySignals: scenario.querySignals,
  });

  const beforeMetrics = measureNarrativeReadability(result.beforeNarrative);
  const afterMetrics = measureNarrativeReadability(result.reply);
  const audit = auditSpecialistNarrative(result.beforeNarrative, result.reply, {
    winnerName: result.winnerName,
    allowedEvidence: result.winnerName,
    expectClosing: true,
    expectReadabilityGain: true,
  });

  console.log(
    `  readability: max ${beforeMetrics.maxParagraphLength}→${afterMetrics.maxParagraphLength}, paragraphs ${beforeMetrics.paragraphCount}→${afterMetrics.paragraphCount}`
  );

  assert(`${scenario.id}: narrative applied`, result.narrativeOk !== false);
  assert(`${scenario.id}: reply built`, result.reply.length > 80);
  assert(
    `${scenario.id}: legibilidade`,
    afterMetrics.maxParagraphLength <= 220 ||
      afterMetrics.paragraphCount > beforeMetrics.paragraphCount ||
      afterMetrics.avgParagraphLength <= beforeMetrics.avgParagraphLength,
    `max=${afterMetrics.maxParagraphLength}`
  );
  assert(`${scenario.id}: escaneabilidade`, afterMetrics.hasDoubleSpacing);
  assert(`${scenario.id}: fechamento`, hasSpecialistClosing(result.reply));
  assert(`${scenario.id}: winner preserved`, result.reply.includes(result.winnerName));
  assert(`${scenario.id}: tradeoff preserved`, /✅/.test(extractTradeoffBlockFromReply(result.reply) || result.reply));
  assert(`${scenario.id}: evidence preserved`, isEvidenceInjectionUseful(result.reply));
  assert(
    `${scenario.id}: insight preserved`,
    !INSIGHT_MARKER_PATTERN.test(result.beforeNarrative) || INSIGHT_MARKER_PATTERN.test(result.reply)
  );
  assert(`${scenario.id}: sem invenção`, findInventedSpecViolations(result.reply, result.winnerName).length === 0);
  assert(`${scenario.id}: audit flags clean`, audit.flags.length === 0, audit.flags.join(", "));
  assert(`${scenario.id}: 9.1F clean`, detectAntiAiLanguageFlags(result.reply).length === 0);
}

console.log("\n── J: follow-up com memória argumentativa ──");
const jFirst = buildPipelineReply({
  query: "celular até 2000 durabilidade",
  category: "celular",
  trustedSpecs: SPECS.celular,
  axis: "longevity",
});
const jSecond = buildPipelineReply({
  query: "vale a pena mesmo?",
  category: "celular",
  trustedSpecs: SPECS.celular,
  axis: "longevity",
  isFollowUp: true,
  allowNewSearch: false,
  previousMemory: jFirst.memory,
});
assert("J: follow-up narrative", jSecond.narrativeOk !== false);
assert("J: fechamento/continuidade", hasSpecialistClosing(jSecond.reply));
assert("J: winner preserved", jSecond.reply.includes("Modelo Orion X1"));

console.log("\n── Multi-categoria F/G/H + TV/mouse/teclado ──");
for (const [id, cat, axis] of [
  ["TV", "tv", "screen"],
  ["mouse", "mouse", "comfort"],
  ["teclado", "teclado", "comfort"],
]) {
  const result = buildPipelineReply({
    query: `${cat} bom para uso diário`,
    category: cat,
    trustedSpecs: SPECS[cat],
    axis,
  });
  assert(`${id}: narrative ok`, result.narrativeOk !== false);
  assert(`${id}: fechamento`, hasSpecialistClosing(result.reply));
  assert(`${id}: winner preserved`, result.reply.includes(SPECS[cat].official_name));
}

console.log("\n── G: mobile readability (resposta longa) ──");
const longCase = buildPipelineReply({
  query: "celular com boa câmera e bateria até 2500 para usar por anos",
  category: "celular",
  trustedSpecs: SPECS.celular,
  axis: "longevity",
});
const longMetrics = measureNarrativeReadability(longCase.reply);
assert("G-mobile: blocos distribuídos", longMetrics.paragraphCount >= 4, `count=${longMetrics.paragraphCount}`);
assert("G-mobile: parágrafos curtos", longMetrics.maxParagraphLength <= 240, `max=${longMetrics.maxParagraphLength}`);

console.log("\n── Regressão disponível ──");
let regressionFailures = 0;
const skipRegression = process.env.MIA_SKIP_NESTED_REGRESSION === "1";
if (skipRegression) {
  console.log("SKIP (MIA_SKIP_NESTED_REGRESSION=1)");
} else {
  for (const script of PRIOR_AUDITS) {
  const run = spawnSync(process.execPath, [join(ROOT, "scripts", script)], {
    encoding: "utf8",
    stdio: "pipe",
    cwd: ROOT,
    env: { ...process.env, MIA_SKIP_NESTED_REGRESSION: "1" },
  });
  const ok = run.status === 0;
  console.log(`${ok ? "PASS" : "FAIL"} ${script}`);
    if (!ok) regressionFailures++;
  }
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
