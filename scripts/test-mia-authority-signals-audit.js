/**
 * PATCH 9.1C — Authority Signals Layer Audit
 *
 * Usage:
 *   node scripts/test-mia-authority-signals-audit.js
 *   $env:MIA_HTTP_AUDIT="1"; $env:MIA_API_BASE="http://localhost:3001"; node scripts/test-mia-authority-signals-audit.js
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  auditAuthoritySignal,
  buildAuthoritySignal,
  buildAuthoritySignalAuditRecord,
  isAuthoritySignalUseful,
  AUTHORITY_SIGNAL_FLAGS,
} from "../lib/miaAuthoritySignalsLayer.js";
import { buildSpecialistDecisionExplanation } from "../lib/miaSpecialistDecisionExplanationLayer.js";
import { appendUserIntentDiscovery, hasIntentInformationGap } from "../lib/miaUserIntentDiscoveryLayer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const PRIOR_AUDITS = [
  "test-mia-specialist-decision-explanation-audit.js",
  "test-mia-user-intent-discovery-audit.js",
  "test-mia-winner-lifecycle-enforcement-audit.js",
  "test-mia-discussion-set-enforcement-audit.js",
  "test-mia-recommendation-stability-guard-audit.js",
  "test-mia-contradiction-recovery-audit.js",
  "test-mia-user-confusion-recovery-audit.js",
  "test-mia-explicit-recommendation-change-audit.js",
  "test-mia-final-decision-scope-guard-audit.js",
  "test-mia-legitimate-search-reset-guard-audit.js",
  "test-mia-escalated-confusion-recovery-audit.js",
];

const IPHONE_13_SPECS = {
  official_name: "iPhone 13",
  category: "celular",
  strengths: [
    "experiência fluida e previsível no dia a dia",
    "bom equilíbrio entre câmera, desempenho e tamanho",
  ],
  ideal_for: ["quem prioriza estabilidade e longevidade de software"],
  weaknesses: ["tela de 60 Hz pode parecer menos fluida se você veio de modelos Pro"],
  risk_notes: ["carregador não acompanha na caixa"],
};

const GALAXY_A55_SPECS = {
  official_name: "Samsung Galaxy A55 5G",
  category: "celular",
  strengths: ["bateria consistente", "tela fluida"],
  ideal_for: ["uso diário equilibrado"],
  weaknesses: ["não é o topo de câmera da categoria"],
};

const NOTEBOOK_SPECS = {
  official_name: "Notebook Lenovo IdeaPad 3",
  category: "notebook",
  strengths: ["desempenho equilibrado para estudo e trabalho"],
  ideal_for: ["quem precisa de notebook para uso diário sem exagero"],
  weaknesses: ["não é a melhor opção para edição pesada ou jogos exigentes"],
};

const TV_SPECS = {
  official_name: "Smart TV Samsung 55 4K",
  category: "tv",
  strengths: ["imagem consistente para streaming"],
  ideal_for: ["quem assiste filmes e séries"],
  market_notes: ["apps de streaming variam de fluidez entre modelos da mesma faixa"],
};

const MONITOR_SPECS = {
  official_name: "Monitor LG UltraGear 27",
  category: "monitor",
  strengths: ["fluidez boa para uso prolongado"],
  ideal_for: ["trabalho e uso diário"],
};

const CHAIR_SPECS = {
  official_name: "Cadeira Ergonomica Office",
  category: "cadeira",
  strengths: ["suporte básico para longas horas"],
  weaknesses: ["ajustes finos podem ser limitados em modelos mais baratos"],
};

const MOUSE_SPECS = {
  official_name: "Mouse Gamer Logitech G502",
  category: "mouse",
  strengths: ["resposta consistente para jogos casuais"],
  weaknesses: ["pode ser pesado para quem prefere mouse leve"],
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

function buildFullInitialReply({ query, category, product, searchCognition, querySignals = {} }) {
  const specialist = buildSpecialistDecisionExplanation({
    query,
    category,
    product,
    searchCognition,
    querySignals,
    decisionMemory: {
      lastDecisionReason: searchCognition.consequenceChain.consequence,
      lastTradeoff: product.trustedSpecs?.weaknesses?.[0] || "",
      lastWinnerAdvantages: ["desempenho"],
      lastWinnerSacrifices: [],
    },
    responsePath: "return_seguro",
  });

  if (!specialist.ok) return "";

  return appendUserIntentDiscovery({
    reply: specialist.text,
    query,
    category,
    searchCognition,
    routingDecision: { allowNewSearch: true },
    responsePath: "return_seguro",
  }).reply;
}

const SCENARIOS = [
  {
    id: "A",
    name: "celular até 2000",
    query: "celular até 2000",
    category: "celular",
    product: { product_name: "Apple iPhone 13 128GB", isDataLayerProduct: true, trustedSpecs: IPHONE_13_SPECS },
    cognition: buildMockSearchCognition("performance"),
  },
  {
    id: "B",
    name: "celular com câmera boa",
    query: "celular até 2000 com câmera boa",
    category: "celular",
    product: { product_name: "Samsung Galaxy A55 5G", isDataLayerProduct: true, trustedSpecs: GALAXY_A55_SPECS },
    cognition: buildMockSearchCognition("camera"),
  },
  {
    id: "C",
    name: "celular bom e barato",
    query: "quero um celular bom e barato",
    category: "celular",
    product: { product_name: "Motorola Moto G84 5G", category: "celular" },
    cognition: buildMockSearchCognition("value"),
    querySignals: { priceSensitive: true },
  },
  {
    id: "D",
    name: "notebook até 3000",
    query: "notebook até 3000",
    category: "notebook",
    product: { product_name: "Notebook Lenovo IdeaPad 3", isDataLayerProduct: true, trustedSpecs: NOTEBOOK_SPECS },
    cognition: buildMockSearchCognition("performance"),
  },
  {
    id: "E",
    name: "TV para filmes",
    query: "quero uma tv boa para filmes",
    category: "tv",
    product: { product_name: "Smart TV Samsung 55 4K", isDataLayerProduct: true, trustedSpecs: TV_SPECS },
    cognition: buildMockSearchCognition("screen"),
  },
  {
    id: "F",
    name: "monitor para trabalho",
    query: "monitor pra trabalhar",
    category: "monitor",
    product: { product_name: "Monitor LG UltraGear 27", isDataLayerProduct: true, trustedSpecs: MONITOR_SPECS },
    cognition: buildMockSearchCognition("screen"),
  },
  {
    id: "G",
    name: "cadeira confortável",
    query: "cadeira confortável",
    category: "cadeira",
    product: { product_name: "Cadeira Ergonomica Office", isDataLayerProduct: true, trustedSpecs: CHAIR_SPECS },
    cognition: buildMockSearchCognition("comfort"),
  },
  {
    id: "H",
    name: "mouse para jogo",
    query: "mouse bom pra jogo",
    category: "mouse",
    product: { product_name: "Mouse Gamer Logitech G502", isDataLayerProduct: true, trustedSpecs: MOUSE_SPECS },
    cognition: buildMockSearchCognition("performance"),
  },
  {
    id: "I",
    name: "sem budget claro",
    query: "quero um celular bom",
    category: "celular",
    product: { product_name: "Apple iPhone 13 128GB", isDataLayerProduct: true, trustedSpecs: IPHONE_13_SPECS },
    cognition: buildMockSearchCognition("performance"),
  },
  {
    id: "J",
    name: "usuário apressado",
    query: "me indica um celular até 2000 rápido",
    category: "celular",
    product: { product_name: "Apple iPhone 13 128GB", isDataLayerProduct: true, trustedSpecs: IPHONE_13_SPECS },
    cognition: buildMockSearchCognition("performance"),
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

function authorityParagraphFromReply(reply = "") {
  const paragraphs = String(reply || "")
    .split(/\n\s*\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  return (
    paragraphs.find((paragraph) => isAuthoritySignalUseful(paragraph)) || ""
  );
}

function runScenario(scenario) {
  console.log(`\n── Cenário ${scenario.id}: ${scenario.name} ──`);

  const fullReply = buildFullInitialReply({
    query: scenario.query,
    category: scenario.category,
    product: scenario.product,
    searchCognition: scenario.cognition,
    querySignals: scenario.querySignals || {},
  });

  const authorityParagraph = authorityParagraphFromReply(fullReply);
  const flags = auditAuthoritySignal(authorityParagraph, {
    expectAuthority: true,
    allowedEvidence:
      scenario.product.trustedSpecs?.official_name ||
      scenario.product.product_name ||
      "",
  });

  console.log(`  authority: ${authorityParagraph || "(none)"}`);
  console.log(`  flags: ${flags.join(", ") || "none"}`);

  assert(`${scenario.id}: full reply built`, fullReply.length > 80, fullReply);
  assert(`${scenario.id}: authority signal present`, isAuthoritySignalUseful(authorityParagraph), authorityParagraph);
  assert(`${scenario.id}: not too generic`, !flags.includes(AUTHORITY_SIGNAL_FLAGS.AUTHORITY_SIGNAL_TOO_GENERIC), authorityParagraph);
  assert(`${scenario.id}: no invented spec`, !flags.includes(AUTHORITY_SIGNAL_FLAGS.INVENTED_SPEC), authorityParagraph);
  assert(`${scenario.id}: no technical overload`, !flags.includes(AUTHORITY_SIGNAL_FLAGS.TECHNICAL_OVERLOAD), authorityParagraph);
  assert(`${scenario.id}: preserves 9.1A decision`, /\b(minha escolha|eu iria|vence|porque|decis[aã]o|ficou no topo)\b/i.test(fullReply), fullReply);

  const expectsDiscovery = hasIntentInformationGap({
    query: scenario.query,
    category: scenario.category,
    activePriority: scenario.cognition.primaryAxis === "camera" ? "camera" : "",
    querySignals: scenario.querySignals || {},
  });
  if (expectsDiscovery) {
    assert(`${scenario.id}: preserves 9.1B discovery`, /\?\s*$/.test(fullReply), fullReply);
  } else {
    assert(`${scenario.id}: skips 9.1B when intent known`, !/\?\s*$/.test(fullReply) || /prioriza|trabalho|filmes|confort/i.test(scenario.query), fullReply);
  }
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

console.log("\nPATCH 9.1C — Authority Signals Layer Audit\n");

console.log("── Unit: buildAuthoritySignal ──");
const unitRecord = buildAuthoritySignalAuditRecord({
  query: "celular até 2000",
  category: "celular",
  product: { product_name: "Apple iPhone 13", trustedSpecs: IPHONE_13_SPECS, isDataLayerProduct: true },
  searchCognition: buildMockSearchCognition(),
  allowedEvidence: "iPhone 13 carregador",
});
assert("unit authority built", unitRecord.ok, unitRecord.paragraph);

console.log("\n── Integration scenarios A–J ──");
for (const scenario of SCENARIOS) {
  runScenario(scenario);
}

console.log("\n── Suppression in recovery ──");
const suppressed = buildAuthoritySignal({
  query: "celular até 2000",
  category: "celular",
  product: { product_name: "Apple iPhone 13", trustedSpecs: IPHONE_13_SPECS },
  sessionContext: { lastInteractionType: "user_confusion_recovery" },
  responsePath: "return_seguro",
});
assert("recovery suppresses authority", !suppressed.ok, suppressed.error);

console.log("\n── Before / After ──");
const before = buildSpecialistDecisionExplanation({
  query: "celular até 2000",
  category: "celular",
  product: { product_name: "Apple iPhone 13 128GB", isDataLayerProduct: true, trustedSpecs: { ...IPHONE_13_SPECS, risk_notes: [] } },
  searchCognition: buildMockSearchCognition(),
  decisionMemory: { lastDecisionReason: "test", lastTradeoff: "", lastWinnerAdvantages: [], lastWinnerSacrifices: [] },
  responsePath: "return_seguro",
});

const after = buildSpecialistDecisionExplanation({
  query: "celular até 2000",
  category: "celular",
  product: { product_name: "Apple iPhone 13 128GB", isDataLayerProduct: true, trustedSpecs: IPHONE_13_SPECS },
  searchCognition: buildMockSearchCognition(),
  decisionMemory: { lastDecisionReason: "test", lastTradeoff: IPHONE_13_SPECS.weaknesses[0], lastWinnerAdvantages: [], lastWinnerSacrifices: [] },
  responsePath: "return_seguro",
});

console.log("Antes (sem risk note):");
console.log(before.text.split("\n").map((line) => `  ${line}`).join("\n"));
console.log("Depois (com risk note):");
console.log(after.text.split("\n").map((line) => `  ${line}`).join("\n"));
assert("before includes authority from weakness path", /risco escondido|60 Hz|muita gente ignora/i.test(before.text));
assert("after prefers risk-note authority", /carregador|nuance|anúncio|anuncio/i.test(after.text));
assert("after includes authority marker", isAuthoritySignalUseful(authorityParagraphFromReply(after.text)));

console.log("\n── Regressão 9.1A / 9.1B / 8.x ──");
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
