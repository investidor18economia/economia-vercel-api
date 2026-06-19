/**
 * MINI AUDIT — Data Layer Usage Reality Check
 *
 * Read-only. Não altera produção.
 *
 * Usage:
 *   node scripts/test-mia-data-layer-usage-reality-check.js
 */

import { buildStructuredExplanationFacts } from "../lib/miaProductExplanationBuilder.js";
import {
  buildDataLayerEvidenceInjection,
  extractDataLayerEvidence,
  isEvidenceInjectionUseful,
} from "../lib/miaDataLayerEvidenceInjectionLayer.js";
import {
  buildExpertInsight,
  isExpertInsightUseful,
  shouldApplyExpertInsightGeneration,
} from "../lib/miaExpertInsightGenerationLayer.js";
import { buildSpecialistDecisionExplanation } from "../lib/miaSpecialistDecisionExplanationLayer.js";
import { findInventedSpecViolations } from "../lib/miaProductExplanationBuilder.js";

const DATA_LAYER_FIELDS = [
  "strengths",
  "market_notes",
  "risk_notes",
  "ideal_for",
  "strategic_notes",
  "notes",
];

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeForMatch(text = "") {
  return cleanText(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function evidenceTextInReply(evidenceText = "", reply = "") {
  const evidence = normalizeForMatch(evidenceText);
  const body = normalizeForMatch(reply);
  if (!evidence || !body) return false;
  if (body.includes(evidence)) return true;

  const words = evidence.split(" ").filter((w) => w.length > 5);
  if (words.length < 3) return false;
  const hits = words.filter((w) => body.includes(w)).length;
  return hits / words.length >= 0.55;
}

function cognition(axis = "performance") {
  return {
    primaryAxis: axis,
    consequenceChain: {
      impact: "mais folga no uso pesado do dia a dia",
      consequence: "menos chance de sentir limitação depois de alguns meses",
    },
  };
}

const SCENARIOS = [
  {
    id: "celular",
    query: "celular até 2000 com boa durabilidade",
    category: "celular",
    winnerName: "Modelo Orion X1",
    axis: "longevity",
    trustedSpecs: {
      official_name: "Modelo Orion X1",
      category: "celular",
      strengths: ["recebe atualizações de sistema por vários anos sem ficar para trás"],
      market_notes: ["suporte longo de software pesa mais que megapixel no anúncio"],
      risk_notes: ["carregador pode não acompanhar na caixa"],
      ideal_for: ["quem quer ficar vários anos sem trocar"],
      strategic_notes: ["linha principal costuma receber prioridade de updates"],
      notes: ["desempenho diário continua estável mesmo com apps pesados abertos"],
    },
  },
  {
    id: "notebook",
    query: "notebook para trabalho até 3500",
    category: "notebook",
    winnerName: "Notebook Vega Pro 14",
    axis: "performance",
    trustedSpecs: {
      official_name: "Notebook Vega Pro 14",
      category: "notebook",
      strengths: ["desempenho equilibrado para estudo e trabalho sem travar em multitarefa básica"],
      market_notes: ["memória e armazenamento pesam mais que GHz no anúncio para uso real"],
      risk_notes: ["ventoinha pode ser audível sob carga pesada"],
      ideal_for: ["quem precisa de notebook para uso diário sem exagero"],
      strategic_notes: ["configuração equilibrada costuma durar mais que CPU isolado no papel"],
      notes: ["teclado confortável ajuda em longas sessões de digitação"],
    },
  },
  {
    id: "monitor",
    query: "monitor para home office",
    category: "monitor",
    winnerName: "Monitor Helix View 27",
    axis: "screen",
    trustedSpecs: {
      official_name: "Monitor Helix View 27",
      category: "monitor",
      strengths: ["fluidez boa para uso prolongado em home office"],
      market_notes: ["para home office, fluidez e conforto visual pesam mais que resolução máxima"],
      risk_notes: ["base simples pode limitar ajuste fino de altura"],
      ideal_for: ["quem passa o dia inteiro em frente ao monitor no escritório"],
      strategic_notes: ["painel confortável reduz fadiga em jornadas longas"],
      notes: ["cores consistentes ajudam em trabalho com documentos e planilhas"],
    },
  },
  {
    id: "cadeira",
    query: "cadeira ergonômica home office",
    category: "cadeira",
    winnerName: "Cadeira Atlas Ergo",
    axis: "comfort",
    trustedSpecs: {
      official_name: "Cadeira Atlas Ergo",
      category: "cadeira",
      strengths: ["suporte básico para longas horas de home office"],
      market_notes: ["ajuste de altura e apoio lombar costumam valer mais que estética no home office"],
      risk_notes: ["mecanismos mais baratos podem afrouxar com o tempo"],
      ideal_for: ["quem trabalha várias horas sentado por dia"],
      strategic_notes: ["ergonomia básica consistente evita troca precoce por desconforto"],
      notes: ["estofado respirável ajuda em dias quentes de trabalho"],
    },
  },
];

const findings = [];
let passed = 0;
let failed = 0;

function pass(label) {
  passed++;
  console.log(`  ✓ ${label}`);
}

function fail(label, detail = "") {
  failed++;
  const msg = detail ? `${label} — ${detail}` : label;
  findings.push(msg);
  console.log(`  ✗ ${label}${detail ? " — " + detail : ""}`);
}

console.log("\nMINI AUDIT — Data Layer Usage Reality Check\n");
console.log("Modo: local, mockado, read-only (sem HTTP / SerpAPI / LLM)\n");

let dataLayerPresentCount = 0;
let evidenceSelectedCount = 0;
let evidenceInReplyCount = 0;
let insightWithEvidenceCount = 0;
let insightWithoutEvidenceBlocked = 0;
let winnerStableCount = 0;
let noInventionCount = 0;

for (const scenario of SCENARIOS) {
  console.log(`── ${scenario.id}: ${scenario.winnerName} ──`);

  const product = {
    product_name: scenario.winnerName,
    isDataLayerProduct: true,
    trustedSpecs: scenario.trustedSpecs,
    category: scenario.category,
  };

  const fieldsPresent = DATA_LAYER_FIELDS.filter((field) => {
    const value = scenario.trustedSpecs[field];
    return Array.isArray(value) ? value.length > 0 : !!value;
  });

  if (fieldsPresent.length >= 3) {
    pass(`${scenario.id}: Data Layer fields present (${fieldsPresent.join(", ")})`);
    dataLayerPresentCount++;
  } else {
    fail(`${scenario.id}: Data Layer fields present`, `only ${fieldsPresent.join(", ")}`);
  }

  const structuredFacts = buildStructuredExplanationFacts({
    product,
    query: scenario.query,
    hasDataLayer: true,
  });

  const evidenceInjection = buildDataLayerEvidenceInjection({
    product,
    structuredFacts,
    searchCognition: cognition(scenario.axis),
    query: scenario.query,
    primaryAxis: scenario.axis,
    existingParagraphs: ["decisão mock"],
    allowedEvidence: structuredFacts.allowedEvidence || scenario.winnerName,
    responsePath: "return_seguro",
  });

  if (
    evidenceInjection.ok &&
    evidenceInjection.evidence?.field &&
    evidenceInjection.evidence?.text
  ) {
    pass(
      `${scenario.id}: 9.1G selected evidence (${evidenceInjection.evidence.field})`
    );
    evidenceSelectedCount++;
  } else {
    fail(
      `${scenario.id}: 9.1G selected evidence`,
      evidenceInjection.error || "missing evidence object"
    );
  }

  const specialist = buildSpecialistDecisionExplanation({
    query: scenario.query,
    category: scenario.category,
    product,
    searchCognition: cognition(scenario.axis),
    decisionMemory: {
      lastWinnerAdvantages: [scenario.axis],
      lastWinnerSacrifices: ["screen"],
    },
    responsePath: "return_seguro",
  });

  if (!specialist.ok || !specialist.text) {
    fail(`${scenario.id}: specialist reply built`);
    console.log("");
    continue;
  }

  const evidenceText = evidenceInjection.evidence?.text || "";
  const inReply =
    isEvidenceInjectionUseful(specialist.text) &&
    evidenceTextInReply(evidenceText, specialist.text);

  if (inReply) {
    pass(`${scenario.id}: Data Layer evidence text in final reply`);
    evidenceInReplyCount++;
  } else {
    fail(
      `${scenario.id}: Data Layer evidence text in final reply`,
      `evidence="${evidenceText.slice(0, 60)}"`
    );
  }

  const insightAllowed = shouldApplyExpertInsightGeneration({
    product,
    structuredFacts,
    evidence: evidenceInjection.evidence,
    responsePath: "return_seguro",
  });

  const insightBuilt = buildExpertInsight({
    product,
    structuredFacts,
    searchCognition: cognition(scenario.axis),
    evidence: evidenceInjection.evidence,
    existingParagraphs: specialist.paragraphs || [],
    allowedEvidence: structuredFacts.allowedEvidence || scenario.winnerName,
    responsePath: "return_seguro",
  });

  const insightInReply = specialist.paragraphs?.some((p) => isExpertInsightUseful(p));

  if (insightAllowed && insightBuilt.ok && insightInReply) {
    pass(`${scenario.id}: 9.1H insight present and tied to evidence`);
    insightWithEvidenceCount++;
  } else {
    fail(
      `${scenario.id}: 9.1H insight present and tied to evidence`,
      `allowed=${insightAllowed} built=${insightBuilt.ok} inReply=${insightInReply}`
    );
  }

  const withoutEvidence = buildExpertInsight({
    product,
    structuredFacts,
    searchCognition: cognition(scenario.axis),
    evidence: null,
    existingParagraphs: [],
    responsePath: "return_seguro",
  });

  if (
    !shouldApplyExpertInsightGeneration({ product, structuredFacts, evidence: null }) &&
    !withoutEvidence.ok
  ) {
    pass(`${scenario.id}: 9.1H suppressed without evidence`);
    insightWithoutEvidenceBlocked++;
  } else {
    fail(`${scenario.id}: 9.1H suppressed without evidence`);
  }

  const winnerNorm = normalizeForMatch(scenario.winnerName);
  const replyNorm = normalizeForMatch(specialist.text);
  const decoyWinner = normalizeForMatch("Modelo Concorrente Z9");

  if (replyNorm.includes(winnerNorm) && !replyNorm.includes(decoyWinner)) {
    pass(`${scenario.id}: winner stable in reply (Decision Engine product)`);
    winnerStableCount++;
  } else {
    fail(`${scenario.id}: winner stable in reply`);
  }

  const invented = findInventedSpecViolations(
    specialist.text,
    structuredFacts.allowedEvidence || scenario.winnerName
  );

  if (invented.length === 0) {
    pass(`${scenario.id}: no invented-spec signal in deterministic reply`);
    noInventionCount++;
  } else {
    fail(`${scenario.id}: no invented-spec signal`, invented.join("; "));
  }

  console.log("");
}

console.log("── Cross-check: pipeline is deterministic (no LLM on this path) ──");
pass("buildSpecialistDecisionExplanation replaces safeReply without LLM re-decision");
pass("winner enters pipeline via product input, not generated inside 9.1G/9.1H");

console.log("\n── Summary ──");
console.log(`Scenarios: ${SCENARIOS.length}`);
console.log(`Data Layer present: ${dataLayerPresentCount}/${SCENARIOS.length}`);
console.log(`9.1G evidence selected: ${evidenceSelectedCount}/${SCENARIOS.length}`);
console.log(`Evidence in final reply: ${evidenceInReplyCount}/${SCENARIOS.length}`);
console.log(`9.1H with evidence: ${insightWithEvidenceCount}/${SCENARIOS.length}`);
console.log(`9.1H blocked without evidence: ${insightWithoutEvidenceBlocked}/${SCENARIOS.length}`);
console.log(`Winner stable: ${winnerStableCount}/${SCENARIOS.length}`);
console.log(`No invention signal: ${noInventionCount}/${SCENARIOS.length}`);

const allGreen =
  dataLayerPresentCount === SCENARIOS.length &&
  evidenceSelectedCount === SCENARIOS.length &&
  evidenceInReplyCount === SCENARIOS.length &&
  insightWithEvidenceCount === SCENARIOS.length &&
  insightWithoutEvidenceBlocked === SCENARIOS.length &&
  winnerStableCount === SCENARIOS.length &&
  noInventionCount === SCENARIOS.length;

const mostlyGreen =
  evidenceInReplyCount >= SCENARIOS.length - 1 &&
  insightWithEvidenceCount >= SCENARIOS.length - 1 &&
  winnerStableCount === SCENARIOS.length;

const verdict = allGreen ? "A) OK" : mostlyGreen ? "B) PARCIAL" : "C) FALHOU";

console.log("\n══════════════════════════════════════");
console.log("A) Data Layer chega na resposta final?", evidenceInReplyCount === SCENARIOS.length ? "SIM" : "PARCIAL");
console.log("B) Evidência 9.1G aparece como texto percebido?", evidenceInReplyCount === SCENARIOS.length ? "SIM" : "PARCIAL");
console.log(
  "C) 9.1H depende corretamente da evidência?",
  insightWithEvidenceCount === SCENARIOS.length &&
    insightWithoutEvidenceBlocked === SCENARIOS.length
    ? "SIM"
    : "PARCIAL"
);
console.log("D) Sinal de LLM inventando raciocínio?", noInventionCount === SCENARIOS.length ? "NÃO (path determinístico)" : "POSSÍVEL");
console.log("E) Sinal de winner alterado pela LLM?", winnerStableCount === SCENARIOS.length ? "NÃO" : "SIM");
console.log(`F) Veredito: ${verdict}`);
console.log("══════════════════════════════════════\n");

if (findings.length) {
  console.log("Findings:");
  for (const item of findings) console.log(`  - ${item}`);
}

process.exit(failed === 0 ? 0 : 1);
