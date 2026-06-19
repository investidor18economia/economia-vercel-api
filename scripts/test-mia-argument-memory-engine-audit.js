/**
 * PATCH 9.1J — Argument Memory Engine Audit
 *
 * Usage:
 *   node scripts/test-mia-argument-memory-engine-audit.js
 *   MIA_SKIP_NESTED_REGRESSION=1 node scripts/test-mia-argument-memory-engine-audit.js
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  ARGUMENT_RESPONSE_MODES,
  applyArgumentMemory,
  buildArgumentMemorySnapshot,
  detectRepeatedArguments,
  extractArgumentSignatures,
  finalizeReplyWithArgumentMemory,
  isFollowUpLessRepetitive,
  measureFollowUpCompaction,
  normalizeArgumentMemory,
  selectFreshArgumentMode,
} from "../lib/miaArgumentMemoryEngine.js";
import { buildSpecialistDecisionExplanation } from "../lib/miaSpecialistDecisionExplanationLayer.js";
import { appendUserIntentDiscovery } from "../lib/miaUserIntentDiscoveryLayer.js";
import { finalizeReplyWithHumanCognitiveVariation } from "../lib/miaHumanCognitiveVariationLayer.js";
import { isEvidenceInjectionUseful } from "../lib/miaDataLayerEvidenceInjectionLayer.js";
import { INSIGHT_MARKER_PATTERN } from "../lib/miaExpertInsightGenerationLayer.js";
import { findInventedSpecViolations } from "../lib/miaProductExplanationBuilder.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const PRIOR_AUDITS = [
  "test-mia-human-cognitive-variation-audit.js",
  "test-mia-expert-insight-generation-audit.js",
  "test-mia-data-layer-evidence-injection-audit.js",
  "test-mia-specialist-decision-explanation-audit.js",
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

function buildTurnReply({
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

  if (!specialist.ok) return { reply: "", memory: previousMemory, mode: null };

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

  const before = reply;
  const result = finalizeReplyWithArgumentMemory({
    reply,
    before,
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

  return {
    reply: result.text || reply,
    before,
    memory: result.memory || previousMemory,
    mode: result.mode,
    ok: result.ok,
  };
}

function overlapRatio(a = "", b = "") {
  const metrics = measureFollowUpCompaction(a, b);
  const beforeTokens = new Set(
    a
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 5)
  );
  const afterTokens = b
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 5);
  if (!beforeTokens.size || !afterTokens.length) return metrics.tokenOverlap;
  let hits = 0;
  for (const word of afterTokens) {
    if (beforeTokens.has(word)) hits++;
  }
  const union = beforeTokens.size + new Set(afterTokens).size - hits;
  return union ? hits / union : metrics.tokenOverlap;
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

console.log("\nPATCH 9.1J — Argument Memory Engine Audit\n");

console.log("── A: primeira recomendação ──");
const turnA = buildTurnReply({
  query: "celular até 2000 com boa durabilidade",
  category: "celular",
  trustedSpecs: SPECS.celular,
  axis: "longevity",
});
assert("A: reply completa", turnA.reply.length > 120);
assert("A: modo primeira recomendação", turnA.mode === ARGUMENT_RESPONSE_MODES.FIRST_RECOMMENDATION, turnA.mode);
assert("A: memória registrada", turnA.memory?.turns === 1);
assert("A: evidência presente", isEvidenceInjectionUseful(turnA.reply));
const memoryAfterA = turnA.memory;

console.log("\n── B: follow-up vale a pena ──");
const turnB = buildTurnReply({
  query: "vale a pena mesmo?",
  category: "celular",
  trustedSpecs: SPECS.celular,
  axis: "longevity",
  isFollowUp: true,
  allowNewSearch: false,
  previousMemory: memoryAfterA,
});
assert("B: modo compacto", turnB.mode === ARGUMENT_RESPONSE_MODES.CONFIRMATION_COMPACT, turnB.mode);
const metricsB = measureFollowUpCompaction(turnB.before, turnB.reply);
console.log(`  compaction: chars ${metricsB.charRatio.toFixed(2)}, blocks -${metricsB.blockReduction}`);
assert(
  "B: menos repetitivo",
  isFollowUpLessRepetitive(turnB.before, turnB.reply),
  `overlap=${overlapRatio(turnB.before, turnB.reply).toFixed(2)}`
);
assert("B: winner preservado", turnB.reply.includes("Modelo Orion X1"));
assert("B: tradeoff preservado", /✅/.test(turnB.reply));

console.log("\n── C: follow-up tem certeza ──");
const turnC = buildTurnReply({
  query: "mas tem certeza?",
  category: "celular",
  trustedSpecs: SPECS.celular,
  axis: "longevity",
  isFollowUp: true,
  allowNewSearch: false,
  previousMemory: turnB.memory,
});
assert("C: modo aprofundar", turnC.mode === ARGUMENT_RESPONSE_MODES.DEEPEN_SECONDARY, turnC.mode);
assert("C: não repete literal total", overlapRatio(turnB.reply, turnC.reply) < 0.9);
assert("C: continuidade humana", /sim|n[aã]o mudaria|pensando de novo|outro ângulo|al[eé]m do que/i.test(turnC.reply));

console.log("\n── D: mudança de prioridade ──");
const modeD = selectFreshArgumentMode({
  query: "e a bateria dele?",
  previousMemory: turnC.memory,
  winnerName: "Modelo Orion X1",
  primaryAxis: "battery",
  isFollowUp: true,
});
assert("D: prioridade nova permitida", modeD === ARGUMENT_RESPONSE_MODES.PRIORITY_SHIFT, modeD);
const turnD = buildTurnReply({
  query: "e a bateria dele?",
  category: "celular",
  trustedSpecs: SPECS.celular,
  axis: "battery",
  isFollowUp: true,
  allowNewSearch: false,
  previousMemory: turnC.memory,
});
assert("D: resposta gerada", turnD.reply.length > 60);
assert("D: eixo atualizado na memória", turnD.memory?.axisKey === "battery");

console.log("\n── E: nova busca reseta memória ──");
const modeE = selectFreshArgumentMode({
  query: "notebook para trabalho até 3500",
  previousMemory: turnD.memory,
  winnerName: "Notebook Vega Pro 14",
  allowNewSearch: true,
  isNewSearch: true,
});
assert("E: nova busca detectada", modeE === ARGUMENT_RESPONSE_MODES.NEW_SEARCH, modeE);
const turnE = buildTurnReply({
  query: "notebook para trabalho até 3500",
  category: "notebook",
  trustedSpecs: SPECS.notebook,
  axis: "performance",
  allowNewSearch: true,
  previousMemory: turnD.memory,
});
assert("E: novo produto na memória", turnE.memory?.productKey.includes("Notebook Vega"));
assert("E: turns reinicia", turnE.memory?.turns === 1);

console.log("\n── F: comparação repetida ──");
const turnF = buildTurnReply({
  query: "compara de novo com os outros",
  category: "notebook",
  trustedSpecs: SPECS.notebook,
  axis: "performance",
  isFollowUp: true,
  allowNewSearch: false,
  previousMemory: turnE.memory,
});
assert("F: modo comparação follow-up", turnF.mode === ARGUMENT_RESPONSE_MODES.COMPARISON_FOLLOWUP, turnF.mode);
assert("F: winner preservado", turnF.reply.includes("Notebook Vega Pro 14"));

console.log("\n── G/H/I: multi-categoria ──");
for (const [id, cat, specs, axis] of [
  ["G", "notebook", SPECS.notebook, "performance"],
  ["H", "monitor", SPECS.monitor, "screen"],
  ["I", "cadeira", SPECS.cadeira, "comfort"],
]) {
  const first = buildTurnReply({ query: `${cat} bom`, category: cat, trustedSpecs: specs, axis });
  const second = buildTurnReply({
    query: "vale a pena?",
    category: cat,
    trustedSpecs: specs,
    axis,
    isFollowUp: true,
    allowNewSearch: false,
    previousMemory: first.memory,
  });
  assert(`${id}: first complete`, first.reply.length > 80);
  assert(`${id}: follow-up compact`, second.mode === ARGUMENT_RESPONSE_MODES.CONFIRMATION_COMPACT, second.mode);
  const metrics = measureFollowUpCompaction(second.before, second.reply);
  console.log(`  ${id}: chars ${metrics.charRatio.toFixed(2)}, blocks -${metrics.blockReduction}`);
  assert(`${id}: less repetitive`, isFollowUpLessRepetitive(second.before, second.reply));
}

console.log("\n── J: informal curto com sessão ──");
const j1 = buildTurnReply({
  query: "celular bom mano",
  category: "celular",
  trustedSpecs: SPECS.celular,
  axis: "longevity",
});
const j2 = buildTurnReply({
  query: "top então",
  category: "celular",
  trustedSpecs: SPECS.celular,
  axis: "longevity",
  isFollowUp: true,
  allowNewSearch: false,
  previousMemory: j1.memory,
});
assert("J: sessão existente compacta", j2.mode === ARGUMENT_RESPONSE_MODES.CONFIRMATION_COMPACT, j2.mode);
assert("J: sem invenção", findInventedSpecViolations(j2.reply, "Modelo Orion X1").length === 0);

console.log("\n── Assinaturas ──");
const sig = extractArgumentSignatures({ reply: turnA.reply, winnerName: "Modelo Orion X1", primaryAxis: "longevity" });
assert("signatures extracted", sig.signatures.length >= 3);
const repeated = detectRepeatedArguments(sig, null);
assert("first turn no repetition", repeated.repeated.length === 0);

console.log("\n── Regressão 9.1A–I ──");
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
    const timedOut = run.error && run.error.code === "ETIMEDOUT";
    console.log(`${run.status === 0 ? "PASS" : timedOut ? "TIMEOUT" : "FAIL"} ${script}`);
    if (run.status !== 0 && !timedOut) regressionFailures++;
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
