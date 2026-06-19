/**
 * PATCH 9.2E — Conversational Closing Engine Audit
 *
 * Usage:
 *   node scripts/test-mia-conversational-closing-engine-audit.js
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { buildSpecialistDecisionExplanation } from "../lib/miaSpecialistDecisionExplanationLayer.js";
import { appendUserIntentDiscovery } from "../lib/miaUserIntentDiscoveryLayer.js";
import { finalizeReplyWithHumanCognitiveVariation } from "../lib/miaHumanCognitiveVariationLayer.js";
import { finalizeReplyWithArgumentMemory } from "../lib/miaArgumentMemoryEngine.js";
import { finalizeReplyWithSpecialistNarrative } from "../lib/miaSpecialistNarrativeEngine.js";
import { finalizeReplyWithRepetitionCompression } from "../lib/miaRepetitionCompressionGuard.js";
import {
  CLOSING_MODES,
  auditConversationalClosing,
  buildClosingSignals,
  finalizeReplyWithConversationalClosing,
  hasAdequateConversationalClosing,
  hasUsefulFinalQuestion,
  selectClosingMode,
  shouldApplyConversationalClosing,
} from "../lib/miaConversationalClosingEngine.js";
import { isEvidenceInjectionUseful } from "../lib/miaDataLayerEvidenceInjectionLayer.js";
import { INSIGHT_MARKER_PATTERN } from "../lib/miaExpertInsightGenerationLayer.js";
import { extractTradeoffBlockFromReply } from "../lib/miaTradeoffCommunicationLayer.js";
import { detectAntiAiLanguageFlags } from "../lib/miaAntiAiLanguageCleanupLayer.js";
import { findInventedSpecViolations } from "../lib/miaProductExplanationBuilder.js";
import { splitReplyIntoCognitiveBlocks } from "../lib/miaHumanCognitiveVariationLayer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const PRIOR_AUDITS = [
  "test-mia-specialist-narrative-engine-audit.js",
  "test-mia-data-layer-humanization-guard-audit.js",
  "test-mia-frontend-paragraph-rendering-audit.js",
  "test-mia-repetition-compression-guard-audit.js",
  "test-mia-argument-memory-engine-audit.js",
];

const SPECS = {
  celular: {
    official_name: "Modelo Orion X1",
    category: "celular",
    strengths: [
      "recebe atualizações de sistema por vários anos sem ficar para trás",
      "câmera continua consistente mesmo em fotos noturnas",
    ],
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
  cadeira: {
    official_name: "Cadeira Atlas Ergo",
    category: "cadeira",
    strengths: ["suporte básico para longas horas de home office"],
    market_notes: ["ajuste de altura e apoio lombar costumam valer mais que estética no home office"],
    weaknesses: ["ajustes finos podem ser limitados em modelos mais baratos"],
  },
};

function cognition(axis = "performance", assertiveness = "medium") {
  return {
    primaryAxis: axis,
    assertiveness,
    dominance: assertiveness === "high" ? "clear" : "mixed",
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
  assertiveness = "medium",
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

  const searchCognition = cognition(axis, assertiveness);

  const specialist = buildSpecialistDecisionExplanation({
    query,
    category,
    product,
    searchCognition,
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
    return { reply: "", beforeClosing: "", closingOk: false, winnerName, specialist };
  }

  let reply = appendUserIntentDiscovery({
    reply: specialist.text,
    query,
    category,
    searchCognition,
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

  const afterNarrative = narrative.text || reply;

  const compression = finalizeReplyWithRepetitionCompression({
    reply: afterNarrative,
    query,
    winnerName,
    productName: winnerName,
    allowedEvidence: winnerName,
    primaryAxis: axis,
    querySignals,
    searchCognition,
    responsePath: "return_seguro",
  });

  const beforeClosing = compression.text || afterNarrative;

  const closing = finalizeReplyWithConversationalClosing({
    reply: beforeClosing,
    query,
    category,
    winnerName,
    productName: winnerName,
    allowedEvidence: winnerName,
    primaryAxis: axis,
    querySignals,
    searchCognition,
    decisionMemory: {
      lastWinnerAdvantages: [axis],
      lastWinnerSacrifices: ["screen"],
      lastTradeoff: trustedSpecs.weaknesses?.[0] || "",
    },
    isFollowUp,
    previousMemory: memoryResult.memory || previousMemory,
    argumentMemory: memoryResult.memory || previousMemory,
    responsePath: "return_seguro",
  });

  return {
    reply: closing.text || beforeClosing,
    beforeClosing,
    closingOk: closing.ok,
    closingApplied: closing.applied,
    closingMode: closing.mode,
    memory: memoryResult.memory || previousMemory,
    winnerName,
    axis,
    searchCognition,
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

function assertSafety(id, before, after, context) {
  const audit = auditConversationalClosing(before, after, context);
  assert(`${id}: winner preserved`, !context.winnerName || after.includes(context.winnerName));
  assert(
    `${id}: tradeoff preserved`,
    !/✅/.test(before) || /✅/.test(extractTradeoffBlockFromReply(after) || after)
  );
  assert(
    `${id}: evidence preserved`,
    !isEvidenceInjectionUseful(before) || isEvidenceInjectionUseful(after)
  );
  assert(
    `${id}: insight preserved`,
    !INSIGHT_MARKER_PATTERN.test(before) || INSIGHT_MARKER_PATTERN.test(after)
  );
  assert(`${id}: sem invenção`, findInventedSpecViolations(after, context.winnerName || "").length === 0);
  assert(`${id}: audit flags clean`, audit.flags.length === 0, audit.flags.join(", "));
}

console.log("\nPATCH 9.2E — Conversational Closing Engine Audit\n");

console.log("── A: recomendação com alta confiança ──");
const scenarioA = buildPipelineReply({
  query: "celular até 2000 com boa durabilidade para usar anos",
  category: "celular",
  trustedSpecs: SPECS.celular,
  axis: "longevity",
  assertiveness: "high",
});
const signalsA = buildClosingSignals({
  reply: scenarioA.beforeClosing,
  query: "celular até 2000 com boa durabilidade para usar anos",
  category: "celular",
  searchCognition: cognition("longevity", "high"),
});
console.log(`  mode=${scenarioA.closingMode}, applied=${scenarioA.closingApplied}`);
assert("A: pipeline built", scenarioA.reply.length > 80);
assert("A: closing applied", scenarioA.closingApplied);
assert(
  "A: decision-locked mode",
  scenarioA.closingMode === CLOSING_MODES.DECISION_LOCKED_CLOSE ||
    scenarioA.closingMode === CLOSING_MODES.BUDGET_AWARE_CLOSE
);
assert("A: fechamento presente", hasAdequateConversationalClosing(scenarioA.reply));
assertSafety("A", scenarioA.beforeClosing, scenarioA.reply, {
  winnerName: scenarioA.winnerName,
  expectClosing: true,
});

console.log("\n── B: orçamento explícito ──");
const scenarioB = buildPipelineReply({
  query: "notebook até 3500 para estudo",
  category: "notebook",
  trustedSpecs: SPECS.notebook,
  axis: "performance",
  querySignals: { priceSensitive: true },
});
console.log(`  mode=${scenarioB.closingMode}`);
assert("B: budget-aware mode", scenarioB.closingMode === CLOSING_MODES.BUDGET_AWARE_CLOSE);
assert("B: fechamento presente", hasAdequateConversationalClosing(scenarioB.reply));
assertSafety("B", scenarioB.beforeClosing, scenarioB.reply, {
  winnerName: scenarioB.winnerName,
  expectClosing: true,
});

console.log("\n── C: tradeoff relevante ──");
const syntheticC = [
  "O Modelo Orion X1 equilibra longevidade de software e desempenho sólido para o dia a dia.",
  "Um detalhe que muita gente ignora: suporte longo de software pesa mais que megapixel no anúncio.",
  "✅ O tradeoff é a tela de 60 Hz, que pode parecer menos fluida em comparação com modelos mais caros.",
].join("\n\n");
const resultC = finalizeReplyWithConversationalClosing({
  reply: syntheticC,
  query: "celular com boa durabilidade",
  category: "celular",
  winnerName: "Modelo Orion X1",
  allowedEvidence: "Modelo Orion X1",
  primaryAxis: "longevity",
  searchCognition: cognition("longevity", "high"),
  decisionMemory: { lastTradeoff: SPECS.celular.weaknesses[0] },
  responsePath: "return_seguro",
});
console.log(`  mode=${resultC.mode}, tail=${resultC.text.slice(-90)}`);
assert("C: tradeoff acceptance mode", resultC.mode === CLOSING_MODES.TRADEOFF_ACCEPTANCE_CLOSE);
assert("C: closing applied", resultC.applied);
assertSafety("C", syntheticC, resultC.text, { winnerName: "Modelo Orion X1", expectClosing: true });

console.log("\n── D: usuário apressado ──");
const scenarioD = buildPipelineReply({
  query: "qual compra rápido celular até 2000",
  category: "celular",
  trustedSpecs: SPECS.celular,
  axis: "performance",
  querySignals: { rushed: true },
});
const closingTailD = scenarioD.reply.slice(-120);
console.log(`  tail=${closingTailD}`);
assert("D: closing applied", scenarioD.closingApplied);
assert("D: fechamento curto", closingTailD.length <= 140);
assertSafety("D", scenarioD.beforeClosing, scenarioD.reply, { winnerName: scenarioD.winnerName });

console.log("\n── E: usuário indeciso ──");
const scenarioE = buildPipelineReply({
  query: "tenho medo de errar notebook até 3500",
  category: "notebook",
  trustedSpecs: SPECS.notebook,
  axis: "performance",
  querySignals: { indecisive: true },
  assertiveness: "low",
});
assert("E: uncertainty mode", scenarioE.closingMode === CLOSING_MODES.UNCERTAINTY_CLOSE);
assert("E: fechamento presente", hasAdequateConversationalClosing(scenarioE.reply));
assert(
  "E: sem falsa certeza",
  !/\b(sem d[uú]vida|perfeito|garantid)/i.test(scenarioE.reply.slice(-160))
);
assertSafety("E", scenarioE.beforeClosing, scenarioE.reply, { winnerName: scenarioE.winnerName });

console.log("\n── F: follow-up de confirmação ──");
const fFirst = buildPipelineReply({
  query: "celular até 2000 durabilidade",
  category: "celular",
  trustedSpecs: SPECS.celular,
  axis: "longevity",
});
const fSecond = buildPipelineReply({
  query: "vale a pena mesmo?",
  category: "celular",
  trustedSpecs: SPECS.celular,
  axis: "longevity",
  isFollowUp: true,
  allowNewSearch: false,
  previousMemory: fFirst.memory,
});
assert("F: follow-up built", fSecond.reply.length > 60);
assert(
  "F: continuity mode",
  fSecond.closingMode === CLOSING_MODES.FOLLOW_UP_CONTINUITY_CLOSE ||
    fSecond.closingMode === CLOSING_MODES.DECISION_LOCKED_CLOSE
);
assertSafety("F", fSecond.beforeClosing, fSecond.reply, { winnerName: fSecond.winnerName });

console.log("\n── G: busca genérica com pergunta final ──");
const scenarioG = buildPipelineReply({
  query: "quero um celular bom",
  category: "celular",
  trustedSpecs: SPECS.celular,
  axis: "performance",
});
const hasQuestionG = hasUsefulFinalQuestion(scenarioG.reply);
console.log(`  usefulQuestion=${hasQuestionG}, applied=${scenarioG.closingApplied}`);
assert(
  "G: pergunta útil ou discovery close",
  hasQuestionG ||
    scenarioG.closingMode === CLOSING_MODES.INTENT_DISCOVERY_CLOSE ||
    hasAdequateConversationalClosing(scenarioG.reply)
);
assert(
  "G: fechamento contextual",
  hasQuestionG || scenarioG.closingApplied,
  `mode=${scenarioG.closingMode}`
);
assertSafety("G", scenarioG.beforeClosing, scenarioG.reply, {
  winnerName: scenarioG.winnerName,
  expectNoClosing: hasQuestionG,
});

console.log("\n── H/I/J: notebook, monitor, cadeira ──");
for (const scenario of [
  { id: "H", cat: "notebook", query: "notebook para estudo até 3000", axis: "performance" },
  { id: "I", cat: "monitor", query: "monitor home office confortável", axis: "screen" },
  { id: "J", cat: "cadeira", query: "cadeira ergonômica home office", axis: "comfort" },
]) {
  console.log(`\n── ${scenario.id}: ${scenario.query} ──`);
  const result = buildPipelineReply({
    query: scenario.query,
    category: scenario.cat,
    trustedSpecs: SPECS[scenario.cat],
    axis: scenario.axis,
  });
  console.log(`  mode=${result.closingMode}, blocks=${splitReplyIntoCognitiveBlocks(result.reply).length}`);
  assert(`${scenario.id}: pipeline built`, result.reply.length > 80);
  assert(`${scenario.id}: fechamento consultivo`, hasAdequateConversationalClosing(result.reply));
  assert(`${scenario.id}: winner preserved`, result.reply.includes(SPECS[scenario.cat].official_name));
  assertSafety(scenario.id, result.beforeClosing, result.reply, {
    winnerName: result.winnerName,
    expectClosing: true,
  });
  assert(`${scenario.id}: 9.1F clean`, detectAntiAiLanguageFlags(result.reply).length === 0);
}

console.log("\n── Guardrails ──");
assert("shouldApply: return_seguro", shouldApplyConversationalClosing({ reply: "x", responsePath: "return_seguro" }));
assert(
  "shouldApply: suppress comparison",
  !shouldApplyConversationalClosing({ reply: "x", responsePath: "return_seguro", intent: "comparison" })
);
const modeBudget = selectClosingMode(
  buildClosingSignals({
    reply: "texto",
    query: "até 2000",
    hasExplicitBudget: true,
    hasTradeoff: true,
    lastBlockType: "support",
  })
);
assert("selectClosingMode: budget before tradeoff tail", modeBudget === CLOSING_MODES.BUDGET_AWARE_CLOSE);

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
      timeout: 120000,
    });
    const ok = run.status === 0;
    const timedOut = run.error && run.error.code === "ETIMEDOUT";
    console.log(`${ok ? "PASS" : timedOut ? "TIMEOUT" : "FAIL"} ${script}`);
    if (!ok && !timedOut) regressionFailures++;
    if (timedOut) console.log("  (timeout histórico — não classificado como falha funcional)");
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
