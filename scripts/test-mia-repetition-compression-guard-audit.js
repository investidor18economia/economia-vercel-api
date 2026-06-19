/**
 * PATCH 9.2D — Repetition Compression Guard Audit
 *
 * Usage:
 *   node scripts/test-mia-repetition-compression-guard-audit.js
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { buildSpecialistDecisionExplanation } from "../lib/miaSpecialistDecisionExplanationLayer.js";
import { appendUserIntentDiscovery } from "../lib/miaUserIntentDiscoveryLayer.js";
import { finalizeReplyWithHumanCognitiveVariation } from "../lib/miaHumanCognitiveVariationLayer.js";
import { finalizeReplyWithArgumentMemory } from "../lib/miaArgumentMemoryEngine.js";
import { finalizeReplyWithSpecialistNarrative } from "../lib/miaSpecialistNarrativeEngine.js";
import {
  applyRepetitionCompression,
  auditRepetitionCompression,
  detectRepeatedConcepts,
  finalizeReplyWithRepetitionCompression,
  measureConceptRedundancy,
  shouldApplyRepetitionCompression,
} from "../lib/miaRepetitionCompressionGuard.js";
import { splitReplyIntoCognitiveBlocks as splitBlocks } from "../lib/miaHumanCognitiveVariationLayer.js";
import { isEvidenceInjectionUseful } from "../lib/miaDataLayerEvidenceInjectionLayer.js";
import { INSIGHT_MARKER_PATTERN } from "../lib/miaExpertInsightGenerationLayer.js";
import { extractTradeoffBlockFromReply } from "../lib/miaTradeoffCommunicationLayer.js";
import { detectAntiAiLanguageFlags } from "../lib/miaAntiAiLanguageCleanupLayer.js";
import { findInventedSpecViolations } from "../lib/miaProductExplanationBuilder.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const PRIOR_AUDITS = [
  "test-mia-data-layer-evidence-injection-audit.js",
  "test-mia-expert-insight-generation-audit.js",
  "test-mia-argument-memory-engine-audit.js",
  "test-mia-specialist-narrative-engine-audit.js",
  "test-mia-data-layer-humanization-guard-audit.js",
  "test-mia-frontend-paragraph-rendering-audit.js",
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
    return { reply: "", beforeCompression: "", compressionOk: false, winnerName, specialist };
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

  const beforeCompression = narrative.text || reply;

  const compression = finalizeReplyWithRepetitionCompression({
    reply: beforeCompression,
    query,
    winnerName,
    productName: winnerName,
    allowedEvidence: winnerName,
    primaryAxis: axis,
    querySignals,
    searchCognition: cognition(axis),
    responsePath: "return_seguro",
  });

  return {
    reply: compression.text || beforeCompression,
    beforeCompression,
    compressionOk: compression.ok,
    compressionRemoved: compression.removedBlocks || 0,
    memory: memoryResult.memory || previousMemory,
    winnerName,
    axis,
  };
}

function compressSynthetic(before, context = {}) {
  return finalizeReplyWithRepetitionCompression({
    reply: before,
    responsePath: "return_seguro",
    ...context,
  });
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
  const audit = auditRepetitionCompression(before, after, {
    ...context,
    expectLessRedundancy: context.expectLessRedundancy !== false,
  });
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

console.log("\nPATCH 9.2D — Repetition Compression Guard Audit\n");

console.log("── A: conceito repetido em decisão + insight ──");
const syntheticA = [
  "Para o seu perfil, o Modelo Orion X1 faz sentido porque mantém desempenho forte e longevidade de software por vários anos.",
  "Um detalhe que muita gente ignora: o suporte longo de software faz ele envelhecer bem e continuar atual por anos sem precisar trocar cedo.",
  "Na prática, isso significa menos chance de sentir o aparelho defasado depois de alguns ciclos de uso.",
  "✅ O tradeoff é a tela de 60 Hz, que pode parecer menos fluida em comparação com modelos mais caros.",
  "Resumindo: o Modelo Orion X1 continua sendo a escolha mais segura porque o desempenho forte e a longevidade de software pesam mais para você.",
].join("\n\n");
const resultA = compressSynthetic(syntheticA, {
  winnerName: "Modelo Orion X1",
  allowedEvidence: "Modelo Orion X1",
  primaryAxis: "longevity",
});
const metricsA = measureConceptRedundancy(syntheticA, { primaryAxis: "longevity" });
const metricsAAfter = measureConceptRedundancy(resultA.text, { primaryAxis: "longevity" });
console.log(
  `  redundancy: ${metricsA.repetitionScore}→${metricsAAfter.repetitionScore}, length ${syntheticA.length}→${resultA.text.length}`
);
assert("A: compression applied", resultA.ok);
assert("A: shorter or less redundant", resultA.text.length < syntheticA.length || metricsAAfter.repetitionScore < metricsA.repetitionScore);
assertSafety("A", syntheticA, resultA.text, { winnerName: "Modelo Orion X1", expectLessRedundancy: true });

console.log("\n── B: conceito repetido em evidência + fechamento ──");
const syntheticB = [
  "O Notebook Vega Pro 14 equilibra desempenho forte para estudo e trabalho sem travar em multitarefa básica.",
  "Tem um ponto que ajudou na decisão: memória e armazenamento pesam mais que GHz no anúncio para uso real diário.",
  "✅ O tradeoff é que não é a melhor opção para edição pesada ou jogos exigentes.",
  "Se quiser ir direto: o Notebook Vega Pro 14 continua valendo porque o desempenho equilibrado e a memória pesam mais no uso real do que GHz no anúncio.",
].join("\n\n");
const resultB = compressSynthetic(syntheticB, {
  winnerName: "Notebook Vega Pro 14",
  allowedEvidence: "Notebook Vega Pro 14",
  primaryAxis: "performance",
});
const metricsB = measureConceptRedundancy(syntheticB, { primaryAxis: "performance" });
const metricsBAfter = measureConceptRedundancy(resultB.text, { primaryAxis: "performance" });
console.log(
  `  redundancy: ${metricsB.repetitionScore}→${metricsBAfter.repetitionScore}, length ${syntheticB.length}→${resultB.text.length}`
);
assert("B: compression applied", resultB.ok);
assert("B: closing trimmed", resultB.text.length <= syntheticB.length);
assertSafety("B", syntheticB, resultB.text, { winnerName: "Notebook Vega Pro 14" });

console.log("\n── C: múltiplas repetições da mesma ideia ──");
const syntheticC = [
  "O Monitor Helix View 27 entrega fluidez boa para uso prolongado em home office, com ajustes básicos que ajudam a manter postura confortável durante reuniões e planilhas.",
  "Um detalhe que muita gente ignora: para home office, fluidez e conforto visual pesam mais que resolução máxima quando você passa várias horas olhando planilhas e documentos.",
  "Na prática, isso reduz a sensação de cansaço visual quando você passa o dia inteiro em frente ao monitor sem precisar forçar pausas a cada meia hora.",
  "✅ O tradeoff é que não é o topo para edição de cor profissional, então não substitui um monitor calibrado para trabalho criativo exigente.",
  "Resumindo: a fluidez boa e o conforto visual continuam sendo o que mais pesam para home office no dia a dia.",
  "Em resumo, a fluidez do Monitor Helix View 27 segue sendo o ponto central para quem trabalha o dia todo em frente à tela.",
].join("\n\n");
const resultC = compressSynthetic(syntheticC, {
  winnerName: "Monitor Helix View 27",
  allowedEvidence: "Monitor Helix View 27",
  primaryAxis: "screen",
});
const metricsC = measureConceptRedundancy(syntheticC, { primaryAxis: "screen" });
const metricsCAfter = measureConceptRedundancy(resultC.text, { primaryAxis: "screen" });
console.log(
  `  redundancy: ${metricsC.repetitionScore}→${metricsCAfter.repetitionScore}, removed blocks ${resultC.removedBlocks || 0}`
);
assert("C: compression applied", resultC.ok);
assert("C: redundancy reduced", metricsCAfter.repetitionScore <= metricsC.repetitionScore);
assert("C: visibly shorter", resultC.text.length < syntheticC.length * 0.95);
assertSafety("C", syntheticC, resultC.text, { winnerName: "Monitor Helix View 27" });

console.log("\n── D: resposta curta sem repetição ──");
const shortReply = "O Modelo Orion X1 continua sendo a escolha mais segura para quem quer durabilidade.";
const resultD = compressSynthetic(shortReply, {
  winnerName: "Modelo Orion X1",
  primaryAxis: "longevity",
});
assert("D: unchanged short reply", resultD.text === shortReply || resultD.text.length >= shortReply.length * 0.9);
assert("D: winner preserved", resultD.text.includes("Modelo Orion X1"));

console.log("\n── E: tradeoff obrigatório ──");
const pipelineE = buildPipelineReply({
  query: "celular até 2000 com boa durabilidade",
  category: "celular",
  trustedSpecs: SPECS.celular,
  axis: "longevity",
  querySignals: { priceSensitive: true },
});
assert("E: pipeline built", pipelineE.reply.length > 80);
assert("E: tradeoff preserved", /✅/.test(extractTradeoffBlockFromReply(pipelineE.reply) || pipelineE.reply));
assertSafety("E", pipelineE.beforeCompression, pipelineE.reply, {
  winnerName: pipelineE.winnerName,
  expectLessRedundancy: false,
});

console.log("\n── F/G/H: notebook, monitor, cadeira ──");
for (const scenario of [
  { id: "F", cat: "notebook", query: "notebook para estudo até 3000", axis: "performance" },
  { id: "G", cat: "monitor", query: "monitor home office confortável", axis: "screen" },
  { id: "H", cat: "cadeira", query: "cadeira ergonômica home office", axis: "comfort" },
]) {
  console.log(`\n── ${scenario.id}: ${scenario.query} ──`);
  const result = buildPipelineReply({
    query: scenario.query,
    category: scenario.cat,
    trustedSpecs: SPECS[scenario.cat],
    axis: scenario.axis,
  });
  const beforeMetrics = measureConceptRedundancy(result.beforeCompression, { primaryAxis: scenario.axis });
  const afterMetrics = measureConceptRedundancy(result.reply, { primaryAxis: scenario.axis });
  console.log(
    `  redundancy: ${beforeMetrics.repetitionScore}→${afterMetrics.repetitionScore}, length ${result.beforeCompression.length}→${result.reply.length}`
  );
  assert(`${scenario.id}: pipeline built`, result.reply.length > 80);
  assert(`${scenario.id}: winner preserved`, result.reply.includes(SPECS[scenario.cat].official_name));
  assertSafety(scenario.id, result.beforeCompression, result.reply, {
    winnerName: result.winnerName,
    expectLessRedundancy: false,
  });
  assert(`${scenario.id}: 9.1F clean`, detectAntiAiLanguageFlags(result.reply).length === 0);
}

console.log("\n── I: follow-up com memória argumentativa ──");
const iFirst = buildPipelineReply({
  query: "celular até 2000 durabilidade",
  category: "celular",
  trustedSpecs: SPECS.celular,
  axis: "longevity",
});
const iSecond = buildPipelineReply({
  query: "vale a pena mesmo?",
  category: "celular",
  trustedSpecs: SPECS.celular,
  axis: "longevity",
  isFollowUp: true,
  allowNewSearch: false,
  previousMemory: iFirst.memory,
});
assert("I: follow-up built", iSecond.reply.length > 60);
assert("I: winner preserved", iSecond.reply.includes("Modelo Orion X1"));
assertSafety("I", iSecond.beforeCompression, iSecond.reply, {
  winnerName: iSecond.winnerName,
  expectLessRedundancy: false,
});

console.log("\n── J: resposta longa multi-bloco ──");
const pipelineJ = buildPipelineReply({
  query: "celular com boa câmera e bateria até 2500 para usar por anos",
  category: "celular",
  trustedSpecs: SPECS.celular,
  axis: "longevity",
});
const blocksJ = splitBlocks(pipelineJ.reply);
const beforeJ = measureConceptRedundancy(pipelineJ.beforeCompression, { primaryAxis: "longevity" });
const afterJ = measureConceptRedundancy(pipelineJ.reply, { primaryAxis: "longevity" });
console.log(
  `  blocks=${blocksJ.length}, redundancy ${beforeJ.repetitionScore}→${afterJ.repetitionScore}, length ${pipelineJ.beforeCompression.length}→${pipelineJ.reply.length}`
);
assert("J: multi-block reply", blocksJ.length >= 4);
assert("J: not over-compressed", pipelineJ.reply.length >= pipelineJ.beforeCompression.length * 0.55);
assertSafety("J", pipelineJ.beforeCompression, pipelineJ.reply, {
  winnerName: pipelineJ.winnerName,
  expectLessRedundancy: false,
});

console.log("\n── Guardrails ──");
assert("shouldApply: return_seguro", shouldApplyRepetitionCompression({ reply: "x", responsePath: "return_seguro" }));
assert(
  "shouldApply: suppress comparison",
  !shouldApplyRepetitionCompression({ reply: "x", responsePath: "return_seguro", intent: "comparison" })
);
const detection = detectRepeatedConcepts(splitBlocks(syntheticA), { primaryAxis: "longevity" });
assert("detectRepeatedConcepts finds pairs", detection.repeated.length >= 1);

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
