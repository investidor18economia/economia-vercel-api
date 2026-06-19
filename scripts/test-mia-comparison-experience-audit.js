/**
 * PATCH 9.1E — Comparison Experience Layer Audit
 *
 * Usage:
 *   node scripts/test-mia-comparison-experience-audit.js
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  auditComparisonExperience,
  buildComparisonExperienceAuditRecord,
  buildComparisonExperienceReply,
  extractWinnerFromComparisonReply,
  isComparisonExperienceScannable,
  resolveComparisonExperienceSources,
  COMPARISON_EXPERIENCE_FLAGS,
} from "../lib/miaComparisonExperienceLayer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const PRIOR_AUDITS = [
  "test-mia-tradeoff-communication-audit.js",
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
];

const IPHONE_13 = {
  product_name: "Apple iPhone 13",
  trustedSpecs: {
    official_name: "iPhone 13",
    category: "celular",
    strengths: ["câmera consistente no uso real", "longevidade de software"],
    weaknesses: ["bateria menor que concorrentes", "carregamento mais lento"],
  },
  scoreEngine: {
    scores: { camera: 88, battery: 72, longevity: 92, value: 74, performance: 84, screen: 76 },
  },
};

const GALAXY_A35 = {
  product_name: "Samsung Galaxy A35",
  trustedSpecs: {
    official_name: "Galaxy A35",
    category: "celular",
    strengths: ["bateria acima da média", "custo-benefício forte"],
    weaknesses: ["suporte de software mais curto", "câmera menos consistente à noite"],
  },
  scoreEngine: {
    scores: { camera: 78, battery: 90, longevity: 70, value: 88, performance: 76, screen: 82 },
  },
};

const NOTEBOOK_A = {
  product_name: "Notebook Lenovo IdeaPad 3",
  trustedSpecs: {
    official_name: "Notebook Lenovo IdeaPad 3",
    category: "notebook",
    strengths: ["desempenho equilibrado para estudo"],
    weaknesses: ["não é ideal para edição pesada"],
  },
  scoreEngine: {
    scores: { performance: 78, value: 85, screen: 74, battery: 70, longevity: 76, storage: 80 },
  },
};

const NOTEBOOK_B = {
  product_name: "Notebook Acer Aspire 5",
  trustedSpecs: {
    official_name: "Notebook Acer Aspire 5",
    category: "notebook",
    strengths: ["mais folga para multitarefa"],
    weaknesses: ["autonomia mais curta"],
  },
  scoreEngine: {
    scores: { performance: 84, value: 78, screen: 76, battery: 62, longevity: 72, storage: 82 },
  },
};

const TV_A = {
  product_name: "Smart TV Samsung 55",
  trustedSpecs: {
    official_name: "Smart TV Samsung 55 4K",
    category: "tv",
    strengths: ["imagem consistente para streaming"],
    weaknesses: ["apps podem variar de fluidez"],
  },
  scoreEngine: { scores: { screen: 86, value: 80, performance: 78, longevity: 82 } },
};

const TV_B = {
  product_name: "Smart TV LG 50",
  trustedSpecs: {
    official_name: "Smart TV LG 50 4K",
    category: "tv",
    strengths: ["interface fluida"],
    weaknesses: ["contraste inferior em ambientes claros"],
  },
  scoreEngine: { scores: { screen: 80, value: 84, performance: 82, longevity: 78 } },
};

const MOUSE_A = {
  product_name: "Mouse Gamer Logitech G502",
  trustedSpecs: {
    official_name: "Mouse Gamer Logitech G502",
    category: "mouse",
    strengths: ["resposta consistente para jogos casuais"],
    weaknesses: ["pode ser pesado para quem prefere mouse leve"],
  },
  scoreEngine: { scores: { performance: 86, comfort: 70, value: 78, longevity: 80 } },
};

const MOUSE_B = {
  product_name: "Mouse Gamer Razer Basilisk",
  trustedSpecs: {
    official_name: "Mouse Gamer Razer Basilisk",
    category: "mouse",
    strengths: ["sensor mais preciso"],
    weaknesses: ["preço mais alto"],
  },
  scoreEngine: { scores: { performance: 90, comfort: 76, value: 68, longevity: 78 } },
};

const LEGACY_PROSE_REPLY =
  "O iPhone 13 oferece uma experiência mais estável no uso diário. Já o Galaxy A35 traz bateria melhor e preço mais baixo. Por outro lado, o iPhone 13 perde em autonomia. Porém, no conjunto, eu iria no iPhone 13.";

const SCENARIOS = [
  {
    id: "A",
    query: "iPhone 13 ou Galaxy A35?",
    category: "celular",
    products: [IPHONE_13, GALAXY_A35],
    winner: IPHONE_13,
    runnerUp: GALAXY_A35,
    priority: "longevity",
  },
  {
    id: "B",
    query: "qual dos dois vale mais? iPhone 13 vs Galaxy A35",
    category: "celular",
    products: [IPHONE_13, GALAXY_A35],
    winner: IPHONE_13,
    runnerUp: GALAXY_A35,
    priority: "value",
  },
  {
    id: "C",
    query: "entre eles eu iria em qual? notebook lenovo ou acer",
    category: "notebook",
    products: [NOTEBOOK_A, NOTEBOOK_B],
    winner: NOTEBOOK_B,
    runnerUp: NOTEBOOK_A,
    priority: "performance",
  },
  {
    id: "D",
    query: "quero uma tv boa, samsung ou lg?",
    category: "tv",
    products: [TV_A, TV_B],
    winner: TV_A,
    runnerUp: TV_B,
    priority: "screen",
  },
  {
    id: "E",
    query: "mouse bom pra jogo, logitech ou razer?",
    category: "mouse",
    products: [MOUSE_A, MOUSE_B],
    winner: MOUSE_B,
    runnerUp: MOUSE_A,
    priority: "performance",
  },
  {
    id: "F",
    query: "qual compensa mais?",
    category: "celular",
    products: [IPHONE_13, GALAXY_A35],
    winner: IPHONE_13,
    runnerUp: GALAXY_A35,
    priority: "",
  },
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
  const built = buildComparisonExperienceReply({
    query: scenario.query,
    category: scenario.category,
    products: scenario.products,
    winner: scenario.winner,
    runnerUp: scenario.runnerUp,
    priority: scenario.priority,
    intent: "comparison",
    reply: LEGACY_PROSE_REPLY,
  });

  console.log(`  reply:\n${built.reply.split("\n").map((line) => `    ${line}`).join("\n")}`);
  console.log(`  flags: ${auditComparisonExperience(built.reply, { expectScannable: true }).join(", ") || "none"}`);

  const extractedWinner = extractWinnerFromComparisonReply(built.reply);
  assert(`${scenario.id}: scannable layout`, isComparisonExperienceScannable(built.reply), built.reply.slice(0, 120));
  assert(`${scenario.id}: winner callout`, /🏆|minha escolha/i.test(built.reply), built.reply);
  assert(`${scenario.id}: axis rows`, (built.sources?.axisRows || []).length >= 2, String(built.sources?.axisRows?.length));
  assert(`${scenario.id}: verdict line`, /👉|iria de/i.test(built.reply), built.reply);
  assert(`${scenario.id}: winner matches decision`, extractedWinner.includes(scenario.winner.trustedSpecs.official_name.split(" ")[0]), extractedWinner);
  assert(`${scenario.id}: no tradeoff word`, !/\btradeoff\b/i.test(built.reply), built.reply);
  assert(`${scenario.id}: winner visible early`, /🏆|minha escolha/i.test(built.reply.slice(0, 120)), built.reply.slice(0, 120));
}

console.log("\nPATCH 9.1E — Comparison Experience Layer Audit\n");

console.log("── Diagnóstico ──");
console.log("  Pergunta obrigatória: C) Forma de apresentar a comparação");
console.log("  (ranking e dados existem; verbalização em bloco é o gap)");

const sources = resolveComparisonExperienceSources({
  query: "iPhone 13 ou Galaxy A35?",
  products: [IPHONE_13, GALAXY_A35],
  winner: IPHONE_13,
  runnerUp: GALAXY_A35,
  priority: "camera",
});
assert("sources resolve axis rows", sources.axisRows.length >= 2);
assert("sources resolve winner and runnerUp", sources.winnerName && sources.runnerUpName);

console.log("\n── Scenarios A–F ──");
for (const scenario of SCENARIOS) {
  runScenario(scenario);
}

console.log("\n── Suppression in recovery ──");
const suppressed = buildComparisonExperienceReply({
  query: "iPhone 13 ou Galaxy A35?",
  products: [IPHONE_13, GALAXY_A35],
  winner: IPHONE_13,
  runnerUp: GALAXY_A35,
  sessionContext: { lastInteractionType: "user_confusion_recovery" },
  intent: "comparison",
});
assert("recovery suppresses experience layer", !suppressed.ok, suppressed.error);

console.log("\n── Before / After ──");
const before = { scannable: isComparisonExperienceScannable(LEGACY_PROSE_REPLY), reply: LEGACY_PROSE_REPLY };
const after = buildComparisonExperienceAuditRecord({
  query: "iPhone 13 ou Galaxy A35?",
  products: [IPHONE_13, GALAXY_A35],
  winner: IPHONE_13,
  runnerUp: GALAXY_A35,
  priority: "longevity",
  intent: "comparison",
});
console.log("Antes (prose):", before.scannable ? "scannable" : "prose wall");
console.log("Depois:\n" + after.reply.split("\n").slice(0, 12).map((l) => "  " + l).join("\n"));
assert("after is scannable", after.ok, after.reply);

console.log("\n── Regressão 9.1D / 9.1A / 9.1B / 9.1C / 8.x ──");
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
    ? "A) PASS"
    : failed === 0
      ? "B) PARTIAL"
      : "C) FAIL";
console.log(`\nVEREDITO FINAL: ${verdict}`);

if (failures.length) {
  console.log("\nFailures:");
  for (const msg of failures) console.log(msg);
}

process.exit(failed === 0 ? 0 : 1);
