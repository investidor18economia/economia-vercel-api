/**
 * PATCH 9.1A — Specialist Decision Explanation Layer Audit
 *
 * Usage:
 *   node scripts/test-mia-specialist-decision-explanation-audit.js
 *   $env:MIA_HTTP_AUDIT="1"; $env:MIA_API_BASE="http://localhost:3001"; node scripts/test-mia-specialist-decision-explanation-audit.js
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { extractBudget } from "../lib/miaRoutingSafety.js";
import {
  auditSpecialistDecisionExplanation,
  buildSpecialistDecisionExplanation,
  buildSpecialistDecisionExplanationAuditRecord,
  shouldApplySpecialistDecisionExplanation,
  SPECIALIST_DECISION_FLAGS,
} from "../lib/miaSpecialistDecisionExplanationLayer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const API = process.env.MIA_API_BASE || "http://localhost:3001";
const API_ENDPOINT = `${API}/api/chat-gpt4o`;
const API_KEY = process.env.MIA_API_KEY || "minha_chave_181199";
const HTTP_ENABLED = process.env.MIA_HTTP_AUDIT === "1" || process.env.MIA_HTTP_AUDIT === "true";

const PRIOR_AUDITS = [
  "test-mia-winner-lifecycle-enforcement-audit.js",
  "test-mia-discussion-set-enforcement-audit.js",
  "test-mia-recommendation-stability-guard-audit.js",
  "test-mia-explicit-recommendation-change-audit.js",
  "test-mia-contradiction-recovery-audit.js",
  "test-mia-user-confusion-recovery-audit.js",
  "test-mia-decision-consistency-validation.js",
  "test-mia-explicit-change-persistence-fix-audit.js",
  "test-mia-post-change-recovery-precedence-audit.js",
  "test-mia-final-decision-scope-guard-audit.js",
  "test-mia-real-conversation-simulation-audit.js",
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

function buildMockSearchCognition({
  primaryAxis = "performance",
  impact = "mais folga no uso pesado do dia a dia",
  consequence = "menos chance de sentir limitação no uso pesado depois de alguns meses",
  tradeoffHonest = "",
} = {}) {
  return {
    primaryAxis,
    contextKey: `${primaryAxis}.default`,
    consequenceChain: {
      impact,
      consequence,
      sensation: "menos pressão de que o aparelho pode falhar quando o uso aperta",
      frictionAvoided: ["menos sensação de limite quando o aparelho é exigido"],
    },
    tradeoffHonest,
    narrativeBlocks: {
      opening: "Pra essa busca, o iPhone 13 encaixa melhor.",
      mainConsequence: consequence,
      practicalImpact: `Na prática, isso significa ${impact}.`,
      tradeoffHonest,
    },
  };
}

function buildMockDecisionMemory(searchCognition) {
  return {
    lastDecisionReason: searchCognition.consequenceChain.consequence,
    lastTradeoff: searchCognition.tradeoffHonest,
    lastWinnerAdvantages: ["desempenho"],
    lastWinnerSacrifices: ["custo-benefício"],
  };
}

const STATIC_SCENARIOS = [
  {
    id: "A",
    name: "Busca genérica com orçamento",
    query: "celular até 2000",
    category: "celular",
    product: {
      product_name: "Apple iPhone 13 128GB",
      isDataLayerProduct: true,
      trustedSpecs: IPHONE_13_SPECS,
    },
    searchCognition: buildMockSearchCognition({ primaryAxis: "performance" }),
    querySignals: {},
  },
  {
    id: "B",
    name: "Busca com prioridade",
    query: "celular até 2000 com câmera boa",
    category: "celular",
    product: {
      product_name: "Samsung Galaxy A55 5G",
      isDataLayerProduct: true,
      trustedSpecs: GALAXY_A55_SPECS,
    },
    searchCognition: buildMockSearchCognition({
      primaryAxis: "camera",
      impact: "fotos mais consistentes no dia a dia",
      consequence: "menos frustração quando a câmera precisa entregar de verdade",
    }),
    querySignals: { cameraPriority: true },
  },
  {
    id: "C",
    name: "Busca informal",
    query: "quero um celular bom e barato",
    category: "celular",
    product: {
      product_name: "Motorola Moto G84 5G",
      category: "celular",
    },
    searchCognition: buildMockSearchCognition({
      primaryAxis: "value",
      impact: "melhor retorno prático pelo valor investido",
      consequence: "paga pelo que vai usar — sem especificação ociosa",
    }),
    querySignals: { priceSensitive: true },
  },
  {
    id: "D",
    name: "Busca curta",
    query: "celular 2k",
    category: "celular",
    product: {
      product_name: "Apple iPhone 13 128GB",
      isDataLayerProduct: true,
      trustedSpecs: IPHONE_13_SPECS,
    },
    searchCognition: buildMockSearchCognition({ primaryAxis: "longevity" }),
    querySignals: {},
  },
  {
    id: "E",
    name: "Categoria futura",
    query: "notebook até 3000",
    category: "notebook",
    product: {
      product_name: "Notebook Lenovo IdeaPad 3",
      isDataLayerProduct: true,
      trustedSpecs: NOTEBOOK_SPECS,
    },
    searchCognition: buildMockSearchCognition({
      primaryAxis: "performance",
      impact: "mais margem para trabalho e estudo sem engasgos",
      consequence: "menos risco de sentir limitação cedo em tarefas do dia a dia",
    }),
    querySignals: {},
  },
  {
    id: "F",
    name: "Sem orçamento claro",
    query: "quero um celular bom",
    category: "celular",
    product: {
      product_name: "Apple iPhone 13 128GB",
      isDataLayerProduct: true,
      trustedSpecs: IPHONE_13_SPECS,
    },
    searchCognition: buildMockSearchCognition({ primaryAxis: "performance" }),
    querySignals: {},
  },
  {
    id: "G",
    name: "Usuário apressado",
    query: "me indica um celular até 2000 rápido",
    category: "celular",
    product: {
      product_name: "Apple iPhone 13 128GB",
      isDataLayerProduct: true,
      trustedSpecs: IPHONE_13_SPECS,
    },
    searchCognition: buildMockSearchCognition({ primaryAxis: "performance" }),
    querySignals: {},
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

function runStaticScenario(scenario) {
  console.log(`\n── Cenário ${scenario.id}: ${scenario.name} ──`);

  const decisionMemory = buildMockDecisionMemory(scenario.searchCognition);
  const record = buildSpecialistDecisionExplanationAuditRecord({
    query: scenario.query,
    category: scenario.category,
    budget: scenario.query.includes("2k") ? 2000 : extractBudget(scenario.query),
    product: scenario.product,
    searchCognition: scenario.searchCognition,
    decisionMemory,
    querySignals: scenario.querySignals,
    responsePath: "return_seguro",
  });

  console.log(`  query: ${record.query}`);
  console.log(`  budgetDetected: ${record.budgetDetected ?? "null"}`);
  console.log(`  winner: ${record.winner}`);
  console.log(`  flags: ${record.flags.join(", ") || "none"}`);
  console.log(`  text:\n${record.text.split("\n").map((line) => `    ${line}`).join("\n")}`);

  assert(`${scenario.id}: specialist explanation built`, record.specialistExplanationDetected);
  assert(`${scenario.id}: decision reason present`, record.decisionReasonDetected, record.text);
  assert(`${scenario.id}: no generic justification`, !record.genericJustificationDetected, record.text);
  assert(`${scenario.id}: no invented spec`, !record.inventedSpecDetected, record.text);
  assert(`${scenario.id}: not too long`, !record.tooLongDetected, `${record.text.length} chars`);
  assert(`${scenario.id}: no abstract-only consequence`, !record.tooVagueDetected, record.text);
  assert(`${scenario.id}: no AI cliche`, !record.aiClicheDetected, record.text);

  if (record.budgetDetected) {
    assert(`${scenario.id}: budget understanding`, record.budgetUnderstandingDetected, record.text);
  }

  assert(
    `${scenario.id}: avoids legacy weak opening`,
    !/\bpra essa busca,\s*o\b.*\bencaixa melhor\b/i.test(record.text),
    record.text
  );
  assert(`${scenario.id}: avoids abstract legacy block`, !/tarefas exigentes sem sentir/i.test(record.text), record.text);

  return record;
}

async function postChat(message, sessionContext = {}) {
  const response = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      message,
      session_context: sessionContext,
    }),
  });

  const payload = await response.json();
  return { status: response.status, payload };
}

async function runHttpScenario(scenario) {
  console.log(`\n── HTTP ${scenario.id}: ${scenario.query} ──`);

  const { status, payload } = await postChat(scenario.query);
  const reply = String(payload?.reply || "");
  const winner =
    payload?.session_context?.lastBestProduct?.product_name ||
    payload?.prices?.[0]?.product_name ||
    "";

  const flags = auditSpecialistDecisionExplanation(reply, {
    query: scenario.query,
    budgetDetected: extractBudget(scenario.query),
    allowedEvidence: winner,
  });

  console.log(`  status: ${status}`);
  console.log(`  winner: ${winner}`);
  console.log(`  flags: ${flags.join(", ") || "none"}`);
  console.log(`  reply:\n${reply.split("\n").map((line) => `    ${line}`).join("\n")}`);

  assert(`HTTP ${scenario.id}: 200`, status === 200);
  assert(`HTTP ${scenario.id}: reply present`, reply.length > 40, reply);
  assert(`HTTP ${scenario.id}: decision reason`, !flags.includes(SPECIALIST_DECISION_FLAGS.MISSING_DECISION_REASON), reply);
  assert(`HTTP ${scenario.id}: no generic justification`, !flags.includes(SPECIALIST_DECISION_FLAGS.GENERIC_DECISION_EXPLANATION), reply);
  assert(`HTTP ${scenario.id}: card winner present`, !!winner, JSON.stringify(payload?.prices || []));

  if (extractBudget(scenario.query)) {
    assert(
      `HTTP ${scenario.id}: budget understanding`,
      !flags.includes(SPECIALIST_DECISION_FLAGS.MISSING_BUDGET_UNDERSTANDING),
      reply
    );
  }

  return { reply, winner, flags };
}

function runRegression(script) {
  const result = spawnSync(process.execPath, [join(ROOT, "scripts", script)], {
    encoding: "utf8",
    stdio: "pipe",
    cwd: ROOT,
  });
  const ok = result.status === 0;
  console.log(`${ok ? "PASS" : "FAIL"} ${script}`);
  if (!ok) {
    const tail = (result.stdout || result.stderr || "").split("\n").slice(-8).join("\n");
    if (tail.trim()) console.log(tail);
  }
  return ok;
}

console.log("\nPATCH 9.1A — Specialist Decision Explanation Layer Audit\n");

console.log("── Static unit scenarios ──");
for (const scenario of STATIC_SCENARIOS) {
  runStaticScenario(scenario);
}

console.log("\n── shouldApply guard ──");
assert(
  "applies on return_seguro new search",
  shouldApplySpecialistDecisionExplanation({
    responsePath: "return_seguro",
    routingDecision: { allowNewSearch: true },
    sessionContext: {},
  })
);
assert(
  "does not apply on non-search path",
  !shouldApplySpecialistDecisionExplanation({
    responsePath: "context_hold",
    routingDecision: { allowNewSearch: true },
    sessionContext: {},
  })
);

const beforeText = renderLegacyWeakReply();
const after = buildSpecialistDecisionExplanation({
  query: "celular até 2000",
  category: "celular",
  product: {
    product_name: "Apple iPhone 13 128GB",
    isDataLayerProduct: true,
    trustedSpecs: IPHONE_13_SPECS,
  },
  searchCognition: buildMockSearchCognition(),
  decisionMemory: buildMockDecisionMemory(buildMockSearchCognition()),
  querySignals: {},
});

console.log("\n── Before / After sample ──");
console.log("Antes:");
console.log(beforeText.split("\n").map((line) => `  ${line}`).join("\n"));
console.log("Depois:");
console.log(after.text.split("\n").map((line) => `  ${line}`).join("\n"));

assert("after sample improves over legacy weak reply", after.ok && after.text.length > beforeText.length);
assert("after sample mentions budget", /\bR\$\s*2\.?000|orçamento|faixa|limite\b/i.test(after.text), after.text);
assert("after sample explains decision", /\bporque|decis[aã]o|escolha|vence|eu iria\b/i.test(after.text), after.text);

if (HTTP_ENABLED) {
  console.log("\n── Controlled HTTP scenarios ──");
  for (const scenario of STATIC_SCENARIOS.filter((entry) => ["A", "C", "E", "G"].includes(entry.id))) {
    await runHttpScenario(scenario);
  }
} else {
  console.log("\n── HTTP skipped (set MIA_HTTP_AUDIT=1 to enable) ──");
}

console.log("\n── Regression 8.x ──");
let regressionFailures = 0;
for (const script of PRIOR_AUDITS) {
  if (!runRegression(script)) regressionFailures += 1;
}

console.log("\n══════════════════════════════════════");
console.log(`Static: ${passed} passed, ${failed} failed`);
console.log(`Regressions 8.x: ${PRIOR_AUDITS.length - regressionFailures}/${PRIOR_AUDITS.length} passed`);

const verdict =
  failed === 0 && regressionFailures === 0
    ? "A) ROBUST"
    : failed <= 2 && regressionFailures === 0
      ? "B) PARTIAL"
      : "C) FAIL";

console.log(`\nVEREDITO FINAL: ${verdict}`);

if (failures.length) {
  console.log("\nFailures:");
  for (const failure of failures) console.log(failure);
}

process.exit(failed === 0 && regressionFailures === 0 ? 0 : 1);

function renderLegacyWeakReply() {
  const cognition = buildMockSearchCognition();
  return [
    cognition.narrativeBlocks.opening,
    cognition.narrativeBlocks.mainConsequence,
    cognition.narrativeBlocks.practicalImpact,
    cognition.consequenceChain.frictionAvoided[0],
  ].join("\n\n");
}
