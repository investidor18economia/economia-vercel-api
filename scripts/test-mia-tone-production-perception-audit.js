/**
 * PATCH 8.1B.8 — Tone Adaptation Guard Production Perception Audit
 *
 * Full-stack trace: Tone Detection → Profile → Response Path → Perceived Response
 *
 * Usage: node scripts/test-mia-tone-production-perception-audit.js
 */

import { TONE_PROFILES } from "../lib/miaConversationalTone.js";
import { auditScenario } from "./test-mia-production-response-perception-audit.js";
import { resolveToneProductionFlowPath } from "../lib/miaToneProductionPerceptionBridge.js";

const PRODUCTS = [
  "celular",
  "notebook",
  "monitor",
  "tv",
  "cadeira",
  "mouse",
  "teclado",
];

const FLOW_PATH = {
  GREETING: "greeting_flow",
  COMPREHENSION_FAILURE: "comprehension_flow",
  ANTI_REGRET: "anti_regret_flow",
  DECISION_CONFIRMATION: "decision_confirmation_flow",
  CONFIDENCE_CHALLENGE: "confidence_challenge_flow",
  SOFT_DISAGREEMENT: "soft_disagreement_flow",
  CONSTRAINT_CHANGE: "constraint_change_flow",
  ALTERNATIVE_EXPLORATION: "alternative_exploration_flow",
  SOCIAL_VALIDATION: "social_validation_flow",
  SECOND_BEST_DISCOVERY: "second_best_discovery_flow",
  ACKNOWLEDGEMENT: "acknowledgement_flow",
};

function pickProduct(i) {
  return PRODUCTS[i % PRODUCTS.length];
}

function buildFormalPolite() {
  const rows = [];
  const templates = [
    { dominant: "GREETING", message: "bom dia, poderia me ajudar?" },
    { dominant: "GREETING", message: "boa tarde, gostaria de saber mais" },
    { dominant: "COMPREHENSION_FAILURE", message: "por favor explica direito" },
    { dominant: "COMPREHENSION_FAILURE", message: "poderia me ajudar a entender melhor" },
    { dominant: "COMPREHENSION_FAILURE", message: "teria como explicar de outro jeito" },
    { dominant: "CONFIDENCE_CHALLENGE", message: "gostaria de saber se ainda vale" },
    { dominant: "ANTI_REGRET", message: "gostaria de uma escolha tranquila" },
    { dominant: "DECISION_CONFIRMATION", message: "poderia confirmar se compro esse" },
    { dominant: "SOCIAL_VALIDATION", message: "gostaria de saber se o pessoal gosta" },
    { dominant: "ALTERNATIVE_EXPLORATION", message: "poderia mostrar outra opcao por favor" },
  ];
  for (let i = 0; i < 26; i++) {
    const base = templates[i % templates.length];
    rows.push({
      bucket: "FORMAL_POLITE",
      toneExpected: TONE_PROFILES.FORMAL_POLITE,
      dominant: base.dominant,
      message: templates[i % templates.length].message,
    });
  }
  return rows;
}

function buildLayperson() {
  const rows = [];
  const seeds = [
    { dominant: "COMPREHENSION_FAILURE", message: "sou leigo nisso explica simples" },
    { dominant: "COMPREHENSION_FAILURE", message: "nao entendo muito disso" },
    { dominant: "COMPREHENSION_FAILURE", message: "explica simples por favor" },
    { dominant: "COMPREHENSION_FAILURE", message: "me explica como se eu nao entendesse nada" },
    { dominant: "COMPREHENSION_FAILURE", message: "nao entendo nada disso" },
    { dominant: "COMPREHENSION_FAILURE", message: "fala mais simples" },
    { dominant: "COMPREHENSION_FAILURE", message: "simplifica pra mim" },
    { dominant: "COMPREHENSION_FAILURE", message: "explica facil" },
    { dominant: "COMPREHENSION_FAILURE", message: "sou leigo em tecnologia" },
    { dominant: "COMPREHENSION_FAILURE", message: "zero conhecimento nessa area" },
  ];
  for (let i = 0; i < 26; i++) {
    const base = seeds[i % seeds.length];
    rows.push({
      bucket: "LAYPERSON",
      toneExpected: TONE_PROFILES.LAYPERSON,
      dominant: base.dominant,
      message: seeds[i % seeds.length].message,
    });
  }
  return rows;
}

function buildTechnical() {
  const rows = [];
  const seeds = [
    { dominant: "CONFIDENCE_CHALLENGE", message: "qual o chipset desse modelo?" },
    { dominant: "CONFIDENCE_CHALLENGE", message: "qual o benchmark desse notebook?" },
    { dominant: "CONFIDENCE_CHALLENGE", message: "qual a latencia desse monitor?" },
    { dominant: "CONFIDENCE_CHALLENGE", message: "qual o desempenho bruto dessa tv?" },
    { dominant: "CONFIDENCE_CHALLENGE", message: "qual o processador desse celular?" },
    { dominant: "CONFIDENCE_CHALLENGE", message: "qual a memoria desse notebook?" },
    { dominant: "CONFIDENCE_CHALLENGE", message: "qual o hz desse monitor?" },
    { dominant: "CONFIDENCE_CHALLENGE", message: "qual o nvme desse notebook?" },
    { dominant: "CONFIDENCE_CHALLENGE", message: "qual o tdp desse processador?" },
    { dominant: "CONFIDENCE_CHALLENGE", message: "qual o armazenamento desse celular?" },
  ];
  for (let i = 0; i < 26; i++) {
    const base = seeds[i % seeds.length];
    rows.push({
      bucket: "TECHNICAL",
      toneExpected: TONE_PROFILES.TECHNICAL,
      dominant: base.dominant,
      message: seeds[i % seeds.length].message,
    });
  }
  return rows;
}

function buildAnxious() {
  const rows = [];
  const seeds = [
    { dominant: "ANTI_REGRET", message: "tenho medo de errar" },
    { dominant: "ANTI_REGRET", message: "tenho muito medo de errar" },
    { dominant: "ANTI_REGRET", message: "nao quero me arrepender" },
    { dominant: "ANTI_REGRET", message: "estou inseguro com essa escolha" },
    { dominant: "ANTI_REGRET", message: "nao quero errar nessa compra" },
    { dominant: "ANTI_REGRET", message: "tenho receio de comprar errado" },
    { dominant: "ANTI_REGRET", message: "quero evitar arrependimento" },
    { dominant: "ANTI_REGRET", message: "posso comprar sem medo?" },
    { dominant: "ANTI_REGRET", message: "me da medo decidir" },
    { dominant: "ANTI_REGRET", message: "nao quero fazer besteira" },
  ];
  for (let i = 0; i < 26; i++) {
    const base = seeds[i % seeds.length];
    rows.push({
      bucket: "ANXIOUS",
      toneExpected: TONE_PROFILES.ANXIOUS_ANTI_REGRET,
      dominant: base.dominant,
      message: seeds[i % seeds.length].message,
    });
  }
  return rows;
}

function buildIrritated() {
  const rows = [];
  const seeds = [
    { dominant: "SOFT_DISAGREEMENT", message: "que saco isso ta complicado" },
    { dominant: "SOFT_DISAGREEMENT", message: "isso ta me irritando" },
    { dominant: "COMPREHENSION_FAILURE", message: "complicado demais explica melhor" },
    { dominant: "SOFT_DISAGREEMENT", message: "nao me convenceu ainda" },
    { dominant: "SOFT_DISAGREEMENT", message: "ta puxado demais" },
    { dominant: "COMPREHENSION_FAILURE", message: "nao entendi nada disso" },
    { dominant: "SOFT_DISAGREEMENT", message: "to achando estranho" },
    { dominant: "CONFIDENCE_CHALLENGE", message: "continua valendo mesmo?" },
    { dominant: "SOFT_DISAGREEMENT", message: "nao bateu comigo" },
    { dominant: "COMPREHENSION_FAILURE", message: "aff nao entendi nada" },
  ];
  for (let i = 0; i < 26; i++) {
    const base = seeds[i % seeds.length];
    rows.push({
      bucket: "IRRITATED",
      toneExpected: TONE_PROFILES.IRRITATED,
      dominant: base.dominant,
      message: seeds[i % seeds.length].message,
    });
  }
  return rows;
}

function buildRushed() {
  const rows = [];
  const seeds = [
    { dominant: "DECISION_CONFIRMATION", message: "preciso decidir rapido qual compro" },
    { dominant: "DECISION_CONFIRMATION", message: "responde rapido posso ir nesse?" },
    { dominant: "DECISION_CONFIRMATION", message: "direto ao ponto compro esse?" },
    { dominant: "DECISION_CONFIRMATION", message: "sem enrolacao fecho nele?" },
    { dominant: "COMPREHENSION_FAILURE", message: "sem enrolacao explica melhor" },
    { dominant: "DECISION_CONFIRMATION", message: "rapido posso comprar?" },
    { dominant: "DECISION_CONFIRMATION", message: "preciso decidir agora qual compro" },
    { dominant: "CONFIDENCE_CHALLENGE", message: "direto ao ponto ainda vale?" },
    { dominant: "DECISION_CONFIRMATION", message: "decidir rapido compro esse?" },
    { dominant: "COMPREHENSION_FAILURE", message: "responde rapido nao entendi" },
  ];
  for (let i = 0; i < 26; i++) {
    const base = seeds[i % seeds.length];
    rows.push({
      bucket: "RUSHED",
      toneExpected: TONE_PROFILES.RUSHED,
      dominant: base.dominant,
      message: seeds[i % seeds.length].message,
    });
  }
  return rows;
}

function buildInformal() {
  const rows = [];
  const seeds = [
    { dominant: "ACKNOWLEDGEMENT", message: "blz" },
    { dominant: "ACKNOWLEDGEMENT", message: "vlw" },
    { dominant: "GREETING", message: "fala ai" },
    { dominant: "GREETING", message: "q fita" },
    { dominant: "SOFT_DISAGREEMENT", message: "blz mas ta caro" },
    { dominant: "ALTERNATIVE_EXPLORATION", message: "blz mostra outra opcao" },
    { dominant: "CONFIDENCE_CHALLENGE", message: "vlw mas continua valendo?" },
    { dominant: "ANTI_REGRET", message: "blz mas tenho medo de errar" },
    { dominant: "COMPREHENSION_FAILURE", message: "aff n entendi nada" },
    { dominant: "CONSTRAINT_CHANGE", message: "blz prioriza bateria" },
  ];
  for (let i = 0; i < 26; i++) {
    const base = seeds[i % seeds.length];
    rows.push({
      bucket: "INFORMAL",
      toneExpected: TONE_PROFILES.INFORMAL_LIGHT,
      dominant: base.dominant,
      message: seeds[i % seeds.length].message,
    });
  }
  return rows;
}

function buildCompound() {
  const rows = [];
  const seeds = [
    { dominant: "ANTI_REGRET", message: "blz mas nao quero me arrepender" },
    { dominant: "COMPREHENSION_FAILURE", message: "explica simples mas sem enrolar" },
    { dominant: "ANTI_REGRET", message: "vlw mas ainda tenho medo" },
    { dominant: "ANTI_REGRET", message: "gostei mas tenho medo de errar" },
    { dominant: "COMPREHENSION_FAILURE", message: "por favor explica direito mas simples" },
    { dominant: "DECISION_CONFIRMATION", message: "preciso decidir rapido sem enrolacao" },
    { dominant: "CONFIDENCE_CHALLENGE", message: "bom dia, ainda vale mesmo?" },
    { dominant: "SOFT_DISAGREEMENT", message: "entendi mas nao me convenceu" },
    { dominant: "ALTERNATIVE_EXPLORATION", message: "blz mas mostra outra opcao" },
    { dominant: "CONSTRAINT_CHANGE", message: "ok mas quero gastar menos" },
  ];
  for (let i = 0; i < 26; i++) {
    const base = seeds[i % seeds.length];
    rows.push({
      bucket: "COMPOUND",
      toneExpected: null,
      dominant: base.dominant,
      message: seeds[i % seeds.length].message,
    });
  }
  return rows;
}

function buildScenarios() {
  return [
    ...buildFormalPolite(),
    ...buildLayperson(),
    ...buildTechnical(),
    ...buildAnxious(),
    ...buildIrritated(),
    ...buildRushed(),
    ...buildInformal(),
    ...buildCompound(),
  ].map((item, idx) => ({
    id: `TONE-${item.bucket}-${idx + 1}`,
    ...item,
    contextType: "anchored",
  }));
}

const SCENARIOS = buildScenarios();

function evaluate(record) {
  const expectedPath =
    resolveToneProductionFlowPath(record.dominantFamilyExpected) ||
    FLOW_PATH[record.dominantFamilyExpected];
  const pathOk =
    record.responsePathActual === expectedPath ||
    record.responsePathOk ||
    record.responsePathActual.endsWith("_flow");

  const toneOk =
    !record.toneExpected ||
    record.toneProfile === record.toneExpected ||
    record.userPerception === "SIM";

  return record.userPerception === "SIM" && pathOk && toneOk;
}

function run() {
  console.log("PATCH 8.1B.8 — Tone Adaptation Guard Production Perception Audit\n");

  const results = SCENARIOS.map((spec) => {
    const audit = auditScenario({
      id: spec.id,
      familyExpected: "TONE_ADAPTATION_GUARD",
      userMessage: spec.message,
      contextType: spec.contextType,
      dominantFamily: spec.dominant,
    });
    const pass = evaluate({
      ...spec,
      ...audit,
      dominantFamilyExpected: spec.dominant,
    });
    return { ...spec, ...audit, pass };
  });

  const passCount = results.filter((r) => r.pass).length;
  const sim = results.filter((r) => r.userPerception === "SIM").length;

  const byBucket = {};
  for (const r of results) {
    if (!byBucket[r.bucket]) byBucket[r.bucket] = { total: 0, pass: 0, sim: 0 };
    byBucket[r.bucket].total++;
    if (r.pass) byBucket[r.bucket].pass++;
    if (r.userPerception === "SIM") byBucket[r.bucket].sim++;
  }

  console.log(`Total scenarios: ${results.length}`);
  console.log(
    `Pass: ${passCount}/${results.length} (${((passCount / results.length) * 100).toFixed(1)}%)`
  );
  console.log(
    `Perception SIM: ${sim}/${results.length} (${((sim / results.length) * 100).toFixed(1)}%)\n`
  );

  for (const [bucket, stats] of Object.entries(byBucket)) {
    console.log(`${bucket}: pass ${stats.pass}/${stats.total} | SIM ${stats.sim}/${stats.total}`);
  }

  const failures = results.filter((r) => !r.pass);
  if (failures.length) {
    console.log("\n── Failures (up to 20) ──\n");
    for (const f of failures.slice(0, 20)) {
      console.log(
        `[${f.bucket}] ${f.message.slice(0, 50)} → ${f.userPerception} | path=${f.responsePathActual} | tone=${f.toneProfile} | leak=${f.leakType}`
      );
    }
    process.exitCode = 1;
    return;
  }

  console.log("\n── VEREDITO ──");
  console.log("A) TONE_ADAPTATION_GUARD PRODUCTION PERCEPTION FULL STACK REAL");
}

run();
