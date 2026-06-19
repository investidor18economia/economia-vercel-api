/**
 * PATCH 9.2F — Tradeoff Visual Emphasis Layer Audit
 *
 * Usage:
 *   node scripts/test-mia-tradeoff-visual-emphasis-audit.js
 *   MIA_SKIP_NESTED_REGRESSION=1 node scripts/test-mia-tradeoff-visual-emphasis-audit.js
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
import { finalizeReplyWithConversationalClosing } from "../lib/miaConversationalClosingEngine.js";
import {
  auditTradeoffVisualEmphasis,
  detectTradeoffBlock,
  finalizeReplyWithTradeoffVisualEmphasis,
  hasTradeoffMarkers,
  hasVisualTradeoffEmphasis,
  measureTradeoffVisibility,
  shouldApplyTradeoffVisualEmphasis,
} from "../lib/miaTradeoffVisualEmphasisLayer.js";
import { isEvidenceInjectionUseful } from "../lib/miaDataLayerEvidenceInjectionLayer.js";
import { INSIGHT_MARKER_PATTERN } from "../lib/miaExpertInsightGenerationLayer.js";
import { hasAdequateConversationalClosing } from "../lib/miaConversationalClosingEngine.js";
import { extractTradeoffBlockFromReply } from "../lib/miaTradeoffCommunicationLayer.js";
import { findInventedSpecViolations } from "../lib/miaProductExplanationBuilder.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const PRIOR_AUDITS = [
  "test-mia-conversational-closing-engine-audit.js",
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
    weaknesses: ["tela de 60 Hz pode parecer menos fluida", "bateria mais antiga que modelos recentes"],
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
  mouse: {
    official_name: "Mouse Pulse Grip",
    category: "mouse",
    strengths: ["pegada confortável para longas sessões de trabalho"],
    market_notes: ["sensor básico costuma bastar para produtividade, não só para jogos"],
    ideal_for: ["quem trabalha o dia inteiro no computador"],
    weaknesses: ["não é ideal para jogos competitivos de alta precisão"],
  },
  teclado: {
    official_name: "Teclado Mecânico Flux 75",
    category: "teclado",
    strengths: ["digitação mais confortável em longas sessões de texto"],
    market_notes: ["switch silencioso pesa mais que RGB para home office"],
    ideal_for: ["quem digita muito durante o dia"],
    weaknesses: ["layout compacto pode exigir adaptação no início"],
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
  extraSacrifices = [],
}) {
  const winnerName = trustedSpecs.official_name;
  const product = {
    product_name: winnerName,
    isDataLayerProduct: true,
    trustedSpecs,
    category,
  };

  const searchCognition = cognition(axis, assertiveness);
  const sacrifices = [...(trustedSpecs.weaknesses || []), ...extraSacrifices];

  const specialist = buildSpecialistDecisionExplanation({
    query,
    category,
    product,
    searchCognition,
    querySignals,
    decisionMemory: {
      lastWinnerAdvantages: [axis],
      lastWinnerSacrifices: sacrifices.map((entry) => entry.slice(0, 20)),
      lastTradeoff: sacrifices[0] || "",
    },
    responsePath: "return_seguro",
    sessionContext: isFollowUp ? { lastBestProduct: { product_name: winnerName } } : {},
  });

  if (!specialist.ok) {
    return { reply: "", beforeVisual: "", visualApplied: false, winnerName, specialist };
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
      lastWinnerSacrifices: sacrifices.map((entry) => entry.slice(0, 20)),
      lastTradeoff: sacrifices[0] || "",
    },
    isFollowUp,
    previousMemory: memoryResult.memory || previousMemory,
    argumentMemory: memoryResult.memory || previousMemory,
    responsePath: "return_seguro",
  });

  const beforeVisual = closing.text || beforeClosing;

  const visual = finalizeReplyWithTradeoffVisualEmphasis({
    reply: beforeVisual,
    query,
    category,
    winnerName,
    productName: winnerName,
    allowedEvidence: winnerName,
    primaryAxis: axis,
    querySignals,
    searchCognition,
    responsePath: "return_seguro",
  });

  return {
    reply: visual.text || beforeVisual,
    beforeVisual,
    visualApplied: visual.applied,
    visibility: visual.visibility || measureTradeoffVisibility(visual.text || beforeVisual),
    detection: detectTradeoffBlock(beforeVisual),
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
  const audit = auditTradeoffVisualEmphasis(before, after, {
    ...context,
    expectVisual: context.expectVisual !== false,
  });

  assert(`${id}: winner preserved`, !context.winnerName || after.includes(context.winnerName));
  assert(
    `${id}: tradeoff markers preserved`,
    !hasTradeoffMarkers(before) || hasTradeoffMarkers(after)
  );
  assert(
    `${id}: evidence preserved`,
    !isEvidenceInjectionUseful(before) || isEvidenceInjectionUseful(after)
  );
  assert(
    `${id}: insight preserved`,
    !INSIGHT_MARKER_PATTERN.test(before) || INSIGHT_MARKER_PATTERN.test(after)
  );
  assert(
    `${id}: closing preserved`,
    !hasAdequateConversationalClosing(before) || hasAdequateConversationalClosing(after)
  );
  assert(`${id}: sem invenção`, findInventedSpecViolations(after, context.winnerName || "").length === 0);
  assert(`${id}: audit flags clean`, audit.flags.length === 0, audit.flags.join(", "));
}

function assertVisual(id, before, after, context) {
  const visibility = measureTradeoffVisibility(after);
  const hadTradeoff = hasTradeoffMarkers(before);

  if (hadTradeoff) {
    assert(`${id}: tradeoff detectado`, detectTradeoffBlock(before).found);
    assert(`${id}: destaque visual aplicado`, hasVisualTradeoffEmphasis(after));
    assert(`${id}: header ganhos`, visibility.hasGainHeader);
    assert(`${id}: header renúncias`, visibility.hasSacrificeHeader);
    assert(`${id}: bloco único`, (after.match(/✅ O que voc[eê] ganha/gi) || []).length === 1);
    assert(`${id}: ganhos listados`, visibility.gainItemCount >= 1);
    assert(`${id}: renúncias listadas`, visibility.sacrificeItemCount >= 1);
  }

  assertSafety(id, before, after, { ...context, expectVisual: hadTradeoff });
}

console.log("\nPATCH 9.2F — Tradeoff Visual Emphasis Layer Audit\n");

console.log("── A: celular com tradeoff simples ──");
const scenarioA = buildPipelineReply({
  query: "celular até 2000 com boa durabilidade",
  category: "celular",
  trustedSpecs: SPECS.celular,
  axis: "longevity",
  assertiveness: "high",
});
console.log(`  applied=${scenarioA.visualApplied}, gains=${scenarioA.visibility?.gainItemCount}`);
assertVisual("A", scenarioA.beforeVisual, scenarioA.reply, { winnerName: scenarioA.winnerName });

console.log("\n── B: celular com múltiplos tradeoffs ──");
const scenarioB = buildPipelineReply({
  query: "celular equilibrado até 2500",
  category: "celular",
  trustedSpecs: SPECS.celular,
  axis: "performance",
  extraSacrifices: ["ausência de USB-C no carregamento"],
});
console.log(`  sacrifices=${scenarioB.detection?.parsed?.sacrifices?.length || 0}`);
assert("B: múltiplas renúncias detectadas", (scenarioB.detection?.parsed?.sacrifices?.length || 0) >= 2);
assertVisual("B", scenarioB.beforeVisual, scenarioB.reply, { winnerName: scenarioB.winnerName });

console.log("\n── C: notebook ──");
const scenarioC = buildPipelineReply({
  query: "notebook para estudo até 3000",
  category: "notebook",
  trustedSpecs: SPECS.notebook,
  axis: "performance",
});
assertVisual("C", scenarioC.beforeVisual, scenarioC.reply, { winnerName: scenarioC.winnerName });

console.log("\n── D: monitor ──");
const scenarioD = buildPipelineReply({
  query: "monitor home office confortável",
  category: "monitor",
  trustedSpecs: SPECS.monitor,
  axis: "screen",
});
assertVisual("D", scenarioD.beforeVisual, scenarioD.reply, { winnerName: scenarioD.winnerName });

console.log("\n── E: cadeira ──");
const scenarioE = buildPipelineReply({
  query: "cadeira ergonômica home office",
  category: "cadeira",
  trustedSpecs: SPECS.cadeira,
  axis: "comfort",
});
assertVisual("E", scenarioE.beforeVisual, scenarioE.reply, { winnerName: scenarioE.winnerName });

console.log("\n── F: mouse ──");
const scenarioF = buildPipelineReply({
  query: "mouse ergonômico para trabalho",
  category: "mouse",
  trustedSpecs: SPECS.mouse,
  axis: "comfort",
});
assertVisual("F", scenarioF.beforeVisual, scenarioF.reply, { winnerName: scenarioF.winnerName });

console.log("\n── G: teclado ──");
const scenarioG = buildPipelineReply({
  query: "teclado mecânico silencioso home office",
  category: "teclado",
  trustedSpecs: SPECS.teclado,
  axis: "comfort",
});
assertVisual("G", scenarioG.beforeVisual, scenarioG.reply, { winnerName: scenarioG.winnerName });

console.log("\n── H: follow-up com memória ──");
const hFirst = buildPipelineReply({
  query: "celular até 2000 durabilidade",
  category: "celular",
  trustedSpecs: SPECS.celular,
  axis: "longevity",
});
const scenarioH = buildPipelineReply({
  query: "e a tela, incomoda mesmo?",
  category: "celular",
  trustedSpecs: SPECS.celular,
  axis: "longevity",
  isFollowUp: true,
  allowNewSearch: false,
  previousMemory: hFirst.memory,
});
assert("H: follow-up built", scenarioH.reply.length > 60);
assertVisual("H", scenarioH.beforeVisual, scenarioH.reply, { winnerName: scenarioH.winnerName });

console.log("\n── I: orçamento explícito ──");
const scenarioI = buildPipelineReply({
  query: "notebook até 3500 para estudo",
  category: "notebook",
  trustedSpecs: SPECS.notebook,
  axis: "performance",
  querySignals: { priceSensitive: true },
});
assertVisual("I", scenarioI.beforeVisual, scenarioI.reply, { winnerName: scenarioI.winnerName });

console.log("\n── J: usuário indeciso ──");
const scenarioJ = buildPipelineReply({
  query: "tenho medo de errar celular até 2000",
  category: "celular",
  trustedSpecs: SPECS.celular,
  axis: "longevity",
  querySignals: { indecisive: true },
  assertiveness: "low",
});
assertVisual("J", scenarioJ.beforeVisual, scenarioJ.reply, { winnerName: scenarioJ.winnerName });

console.log("\n── Guardrails ──");
assert(
  "guard: comparison suppressed",
  !shouldApplyTradeoffVisualEmphasis({ reply: "✅ x ⚠️ y", intent: "comparison", responsePath: "return_seguro" })
);
assert(
  "guard: empty reply",
  !shouldApplyTradeoffVisualEmphasis({ reply: "", responsePath: "return_seguro" })
);
assert(
  "guard: idempotent",
  !finalizeReplyWithTradeoffVisualEmphasis({
    reply: [
      "Decisão clara.",
      "✅ O que você ganha",
      "",
      "Desempenho forte.",
      "",
      "⚠️ O que você abre mão",
      "",
      "Tela 60 Hz.",
    ].join("\n\n"),
    winnerName: "Modelo Orion X1",
    responsePath: "return_seguro",
  }).applied
);

const syntheticInline = [
  "O Modelo Orion X1 continua forte em desempenho e câmera para o dia a dia.",
  "Um detalhe que muita gente ignora: suporte longo de software pesa mais que megapixel no anúncio.",
  "Na prática, a escolha fica assim:\n✅ ganha desempenho forte no uso diário\n✅ fica com boa câmera noturna\n⚠️ abre mão de tela 60 Hz\n⚠️ também bateria mais antiga",
  "Se quiser, posso comparar com outro modelo na mesma faixa.",
].join("\n\n");

const inlineResult = finalizeReplyWithTradeoffVisualEmphasis({
  reply: syntheticInline,
  winnerName: "Modelo Orion X1",
  allowedEvidence: "Modelo Orion X1",
  responsePath: "return_seguro",
});
assert("guard: inline tradeoff transformed", inlineResult.applied);
assert("guard: inline visual headers", hasVisualTradeoffEmphasis(inlineResult.text));
assertSafety("guard-inline", syntheticInline, inlineResult.text, {
  winnerName: "Modelo Orion X1",
  expectVisual: true,
});

if (!process.env.MIA_SKIP_NESTED_REGRESSION) {
  console.log("\n── Nested regression (prior audits) ──");
  for (const script of PRIOR_AUDITS) {
    const result = spawnSync(process.execPath, [join(ROOT, "scripts", script)], {
      cwd: ROOT,
      env: { ...process.env, MIA_SKIP_NESTED_REGRESSION: "1" },
      encoding: "utf8",
      timeout: 600_000,
    });
    const ok = result.status === 0;
    assert(`regression: ${script}`, ok, result.stderr?.slice(0, 120) || result.stdout?.slice(-120));
  }
} else {
  console.log("\n── Nested regression skipped (MIA_SKIP_NESTED_REGRESSION=1) ──");
}

console.log(`\n${"=".repeat(60)}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failed}`);
if (failures.length) {
  console.log("\nFailures:");
  failures.forEach((entry) => console.log(entry));
}
const verdict = failed === 0 ? "A) ROBUST" : failed <= 3 ? "B) PARTIAL" : "C) FAIL";
console.log(`\nVERDICT: ${verdict}`);
console.log("=".repeat(60));

process.exit(failed > 0 ? 1 : 0);
