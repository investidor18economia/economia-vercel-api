/**
 * PATCH 8.1B.7 — Informal / Abbrev / Typo / Compound Production Perception Audit
 *
 * Full-stack trace: Router → Routing → Contract → Response Path → Perception (Regra 17)
 *
 * Usage: node scripts/test-mia-informal-production-perception-audit.js
 */

import { auditScenario } from "./test-mia-production-response-perception-audit.js";

const FLOW_PATH = {
  ALTERNATIVE_EXPLORATION: "alternative_exploration_flow",
  SECOND_BEST_DISCOVERY: "second_best_discovery_flow",
  ANTI_REGRET: "anti_regret_flow",
  CONFIDENCE_CHALLENGE: "confidence_challenge_flow",
  DECISION_CONFIRMATION: "decision_confirmation_flow",
  SOFT_DISAGREEMENT: "soft_disagreement_flow",
  CONSTRAINT_CHANGE: "constraint_change_flow",
  SOCIAL_VALIDATION: "social_validation_flow",
  COMPREHENSION_FAILURE: "comprehension_flow",
  COMPREHENSION_SUCCESS: "comprehension_flow",
  ACKNOWLEDGEMENT: "acknowledgement_flow",
  GREETING: "greeting_flow",
};

const INFORMAL = [
  { dominant: "GREETING", message: "koe" },
  { dominant: "GREETING", message: "qual a boa" },
  { dominant: "ACKNOWLEDGEMENT", message: "ta ligado" },
  { dominant: "GREETING", message: "q fita" },
  { dominant: "GREETING", message: "ce loko" },
  { dominant: "GREETING", message: "slk" },
  { dominant: "GREETING", message: "vish" },
  { dominant: "GREETING", message: "eita" },
  { dominant: "GREETING", message: "coe mano" },
  { dominant: "GREETING", message: "fala tu" },
  { dominant: "GREETING", message: "qual o papo" },
  { dominant: "GREETING", message: "que que pega" },
  { dominant: "ACKNOWLEDGEMENT", message: "demorou" },
  { dominant: "ACKNOWLEDGEMENT", message: "suave" },
  { dominant: "ACKNOWLEDGEMENT", message: "de boa" },
  { dominant: "ACKNOWLEDGEMENT", message: "show de bola" },
  { dominant: "SOFT_DISAGREEMENT", message: "to achando nao" },
  { dominant: "SOFT_DISAGREEMENT", message: "sei nao" },
  { dominant: "SOFT_DISAGREEMENT", message: "nao bateu" },
  { dominant: "ANTI_REGRET", message: "nao quero me ferrar" },
  { dominant: "ANTI_REGRET", message: "nao quero dor de cabeca" },
  { dominant: "CONFIDENCE_CHALLENGE", message: "tu iria nesse" },
  { dominant: "CONFIDENCE_CHALLENGE", message: "bancaria essa" },
  { dominant: "SOCIAL_VALIDATION", message: "o povo curte?" },
  { dominant: "COMPREHENSION_FAILURE", message: "aff n entendi nada" },
  { dominant: "ALTERNATIVE_EXPLORATION", message: "q fita mostra outra opcao" },
  { dominant: "CONSTRAINT_CHANGE", message: "bora mas orcamento menor" },
  { dominant: "ACKNOWLEDGEMENT", message: "partiu entao" },
  { dominant: "SECOND_BEST_DISCOVERY", message: "slk mas plano b?" },
  { dominant: "CONFIDENCE_CHALLENGE", message: "sustenta isso" },
  { dominant: "SOFT_DISAGREEMENT", message: "estranho isso ai" },
  { dominant: "ANTI_REGRET", message: "quero evitar problema" },
  { dominant: "GREETING", message: "opa mano" },
  { dominant: "GREETING", message: "fala ai mano" },
  { dominant: "ACKNOWLEDGEMENT", message: "justissimo" },
  { dominant: "ACKNOWLEDGEMENT", message: "tlgd" },
  { dominant: "SOFT_DISAGREEMENT", message: "to ligado mas n curti" },
  { dominant: "CONFIDENCE_CHALLENGE", message: "vc sustenta isso?" },
  { dominant: "ANTI_REGRET", message: "slk tenho medo de errar" },
  { dominant: "CONSTRAINT_CHANGE", message: "vlw mas prioriza bateria" },
  { dominant: "SOCIAL_VALIDATION", message: "pf mas o pessoal gosta?" },
  { dominant: "COMPREHENSION_FAILURE", message: "hm explica melhor" },
  { dominant: "ALTERNATIVE_EXPLORATION", message: "pfv mostra alternativas" },
  { dominant: "DECISION_CONFIRMATION", message: "show entao compro?" },
  { dominant: "SECOND_BEST_DISCOVERY", message: "ok mas quem quase ganhou?" },
  { dominant: "CONFIDENCE_CHALLENGE", message: "slk vc banca essa?" },
  { dominant: "SOFT_DISAGREEMENT", message: "aff n bateu cmg" },
  { dominant: "CONSTRAINT_CHANGE", message: "qro gastar menos" },
  { dominant: "ANTI_REGRET", message: "pqp n quero errar" },
  { dominant: "COMPREHENSION_FAILURE", message: "aff como assim?" },
  { dominant: "CONFIDENCE_CHALLENGE", message: "msm assim continua valendo?" },
];

const ABBREV = [
  { dominant: "CONFIDENCE_CHALLENGE", message: "vc acha q vale?" },
  { dominant: "CONFIDENCE_CHALLENGE", message: "pq esse?" },
  { dominant: "SOFT_DISAGREEMENT", message: "n sei nao" },
  { dominant: "CONSTRAINT_CHANGE", message: "qro gastar menos" },
  { dominant: "ALTERNATIVE_EXPLORATION", message: "blz mas mostra outro" },
  { dominant: "CONFIDENCE_CHALLENGE", message: "tem ctza msm?" },
  { dominant: "CONFIDENCE_CHALLENGE", message: "vc acha q vale msm?" },
  { dominant: "SOCIAL_VALIDATION", message: "o povo curte?" },
  { dominant: "ALTERNATIVE_EXPLORATION", message: "mostra outra opçao pf" },
  { dominant: "ACKNOWLEDGEMENT", message: "blz entendi vlw" },
  { dominant: "SOFT_DISAGREEMENT", message: "n curti mt n" },
  { dominant: "ANTI_REGRET", message: "nao quero me arrepender dps" },
  { dominant: "CONSTRAINT_CHANGE", message: "agora ate 1800" },
  { dominant: "DECISION_CONFIRMATION", message: "entao compro?" },
  { dominant: "SECOND_BEST_DISCOVERY", message: "qual ficou em 2?" },
  { dominant: "COMPREHENSION_FAILURE", message: "n entendi nada" },
  { dominant: "SOFT_DISAGREEMENT", message: "n me convenceu" },
  { dominant: "CONFIDENCE_CHALLENGE", message: "continua valendo msm?" },
  { dominant: "SOCIAL_VALIDATION", message: "muita gente recomenda?" },
  { dominant: "ALTERNATIVE_EXPLORATION", message: "tem outra opcao?" },
  { dominant: "ANTI_REGRET", message: "posso comprar sem medo?" },
  { dominant: "CONSTRAINT_CHANGE", message: "prioriza camera" },
  { dominant: "DECISION_CONFIRMATION", message: "fecho nele?" },
  { dominant: "COMPREHENSION_FAILURE", message: "explica melhor pf" },
  { dominant: "CONFIDENCE_CHALLENGE", message: "tu compraria?" },
  { dominant: "SOFT_DISAGREEMENT", message: "to meio assim" },
  { dominant: "CONSTRAINT_CHANGE", message: "bateria pesa mais" },
  { dominant: "SOCIAL_VALIDATION", message: "tem reclamacao?" },
  { dominant: "ALTERNATIVE_EXPLORATION", message: "quero ver outros modelos" },
  { dominant: "SECOND_BEST_DISCOVERY", message: "quem veio logo atras?" },
  { dominant: "ANTI_REGRET", message: "medo de errar" },
  { dominant: "ACKNOWLEDGEMENT", message: "blz entao" },
  { dominant: "ACKNOWLEDGEMENT", message: "blz entendi" },
  { dominant: "CONFIDENCE_CHALLENGE", message: "vc garante?" },
  { dominant: "SOFT_DISAGREEMENT", message: "nao desceu bem" },
  { dominant: "CONSTRAINT_CHANGE", message: "quero economizar" },
  { dominant: "DECISION_CONFIRMATION", message: "posso ir nesse?" },
  { dominant: "COMPREHENSION_FAILURE", message: "simplifica pf" },
  { dominant: "SOCIAL_VALIDATION", message: "quem comprou aprova?" },
  { dominant: "ALTERNATIVE_EXPLORATION", message: "abre mais opcoes" },
  { dominant: "SECOND_BEST_DISCOVERY", message: "e o plano b?" },
  { dominant: "ANTI_REGRET", message: "nao quero dor de cabeca" },
  { dominant: "CONFIDENCE_CHALLENGE", message: "ainda vale msm?" },
  { dominant: "SOFT_DISAGREEMENT", message: "nao curti mt" },
  { dominant: "CONSTRAINT_CHANGE", message: "prefiro gastar menos" },
  { dominant: "DECISION_CONFIRMATION", message: "entao e esse mesmo?" },
  { dominant: "COMPREHENSION_FAILURE", message: "repete pf" },
  { dominant: "ACKNOWLEDGEMENT", message: "fechou entao" },
  { dominant: "CONFIDENCE_CHALLENGE", message: "da pra confiar msm?" },
  { dominant: "SOCIAL_VALIDATION", message: "e bem visto?" },
];

const TYPO = [
  { dominant: "CONFIDENCE_CHALLENGE", message: "ipone vale?" },
  { dominant: "SOCIAL_VALIDATION", message: "sansung presta?" },
  { dominant: "CONFIDENCE_CHALLENGE", message: "serteza?" },
  { dominant: "DECISION_CONFIRMATION", message: "poço comprar?" },
  { dominant: "CONFIDENCE_CHALLENGE", message: "custo benificio" },
  { dominant: "CONFIDENCE_CHALLENGE", message: "vale a pena msm?" },
  { dominant: "SOCIAL_VALIDATION", message: "xiaomi presta?" },
  { dominant: "ANTI_REGRET", message: "medo de erar" },
  { dominant: "CONSTRAINT_CHANGE", message: "quero gasta menos" },
  { dominant: "COMPREHENSION_FAILURE", message: "nao entedi" },
  { dominant: "SOFT_DISAGREEMENT", message: "nao me convence" },
  { dominant: "ALTERNATIVE_EXPLORATION", message: "mostra outra opcaoo" },
  { dominant: "SECOND_BEST_DISCOVERY", message: "qual ficou em segundoo?" },
  { dominant: "DECISION_CONFIRMATION", message: "fecho nele" },
  { dominant: "ANTI_REGRET", message: "nao quero me arprender" },
  { dominant: "CONFIDENCE_CHALLENGE", message: "continua valendo" },
  { dominant: "SOCIAL_VALIDATION", message: "o pessoal gosta" },
  { dominant: "CONSTRAINT_CHANGE", message: "prioriza bateria" },
  { dominant: "COMPREHENSION_FAILURE", message: "nao peguei nada" },
  { dominant: "SOFT_DISAGREEMENT", message: "nao bateu cmg" },
  { dominant: "CONFIDENCE_CHALLENGE", message: "vc recomenda msm?" },
  { dominant: "ANTI_REGRET", message: "tenho medo de errar" },
  { dominant: "ALTERNATIVE_EXPLORATION", message: "tem alternativa?" },
  { dominant: "DECISION_CONFIRMATION", message: "compro esse?" },
  { dominant: "CONSTRAINT_CHANGE", message: "orcamento menor" },
  { dominant: "COMPREHENSION_SUCCESS", message: "faz sentido" },
  { dominant: "ACKNOWLEDGEMENT", message: "show" },
  { dominant: "GREETING", message: "bom dia" },
  { dominant: "CONFIDENCE_CHALLENGE", message: "realmente compensa?" },
  { dominant: "SOFT_DISAGREEMENT", message: "meio estranho" },
  { dominant: "ANTI_REGRET", message: "compra segura?" },
  { dominant: "SOCIAL_VALIDATION", message: "galera aprova?" },
  { dominant: "SECOND_BEST_DISCOVERY", message: "runner up?" },
  { dominant: "ALTERNATIVE_EXPLORATION", message: "ver outras opcoes" },
  { dominant: "CONSTRAINT_CHANGE", message: "camera pesa mais" },
  { dominant: "DECISION_CONFIRMATION", message: "bate o martelo?" },
  { dominant: "COMPREHENSION_FAILURE", message: "como assim?" },
  { dominant: "CONFIDENCE_CHALLENGE", message: "segue nesse mesmo?" },
  { dominant: "SOFT_DISAGREEMENT", message: "ta puxado" },
  { dominant: "ANTI_REGRET", message: "nao quero errar" },
  { dominant: "CONSTRAINT_CHANGE", message: "baixa o orcamento" },
  { dominant: "SOCIAL_VALIDATION", message: "tem review ruim?" },
  { dominant: "ALTERNATIVE_EXPLORATION", message: "mostra concorrentes" },
  { dominant: "SECOND_BEST_DISCOVERY", message: "segunda opcao?" },
  { dominant: "DECISION_CONFIRMATION", message: "vou nesse?" },
  { dominant: "COMPREHENSION_FAILURE", message: "nao ficou claro" },
  { dominant: "CONFIDENCE_CHALLENGE", message: "mantem essa escolha?" },
  { dominant: "SOFT_DISAGREEMENT", message: "nao me ganhou" },
  { dominant: "ANTI_REGRET", message: "posso ficar tranquilo?" },
  { dominant: "CONSTRAINT_CHANGE", message: "agora silencio pesa" },
];

const COMPOUND = [
  { dominant: "CONFIDENCE_CHALLENGE", message: "vc acha q esse ipone vale msm?" },
  { dominant: "SOFT_DISAGREEMENT", message: "slk esse sansung ta caro dms" },
  { dominant: "CONSTRAINT_CHANGE", message: "qro gastar menos mas sem perder bateria" },
  { dominant: "CONFIDENCE_CHALLENGE", message: "kkk tem ctza msm?" },
  { dominant: "SOFT_DISAGREEMENT", message: "n curti mt" },
  { dominant: "ANTI_REGRET", message: "n quero me ferrar nesse sansung" },
  { dominant: "CONFIDENCE_CHALLENGE", message: "sla se compensa" },
  { dominant: "ACKNOWLEDGEMENT", message: "blz entendi vlw" },
  { dominant: "ALTERNATIVE_EXPLORATION", message: "kkkk slk mostra outra opcao" },
  { dominant: "SOFT_DISAGREEMENT", message: "kkkk slk esse ipone ta caro dms" },
  { dominant: "SOCIAL_VALIDATION", message: "blz mas o pessoal gosta?" },
  { dominant: "SECOND_BEST_DISCOVERY", message: "entendi mas qual ficou em segundo?" },
  { dominant: "DECISION_CONFIRMATION", message: "faz sentido fecho nele?" },
  { dominant: "ANTI_REGRET", message: "gostei mas tenho medo de errar" },
  { dominant: "SOFT_DISAGREEMENT", message: "entendi mas n me convenceu" },
  { dominant: "CONFIDENCE_CHALLENGE", message: "saquei mas continua valendo?" },
  { dominant: "CONSTRAINT_CHANGE", message: "gostei mas qro gastar menos" },
  { dominant: "COMPREHENSION_FAILURE", message: "entendi mais ou menos explica melhor" },
  { dominant: "ALTERNATIVE_EXPLORATION", message: "blz mas mostra outra opcao" },
  { dominant: "SOCIAL_VALIDATION", message: "ok mas muita gente recomenda?" },
  { dominant: "SECOND_BEST_DISCOVERY", message: "boa mas e o plano b?" },
  { dominant: "DECISION_CONFIRMATION", message: "ok bate o martelo?" },
  { dominant: "ANTI_REGRET", message: "boa mas n quero dor de cabeca" },
  { dominant: "CONFIDENCE_CHALLENGE", message: "ok mas vc banca essa?" },
  { dominant: "SOFT_DISAGREEMENT", message: "saquei mas n me desceu" },
  { dominant: "CONSTRAINT_CHANGE", message: "blz prioriza bateria" },
  { dominant: "COMPREHENSION_FAILURE", message: "boa mas n peguei" },
  { dominant: "ALTERNATIVE_EXPLORATION", message: "saquei mas mostra concorrentes" },
  { dominant: "SOCIAL_VALIDATION", message: "entendi mas tem reclamacao?" },
  { dominant: "SECOND_BEST_DISCOVERY", message: "show mas quem quase ganhou?" },
  { dominant: "DECISION_CONFIRMATION", message: "entendi entao compro?" },
  { dominant: "ANTI_REGRET", message: "ok posso comprar sem medo?" },
  { dominant: "CONFIDENCE_CHALLENGE", message: "entendi mas tu compraria?" },
  { dominant: "SOFT_DISAGREEMENT", message: "blz mas ta puxado" },
  { dominant: "CONSTRAINT_CHANGE", message: "entendi mas orcamento menor" },
  { dominant: "COMPREHENSION_FAILURE", message: "ok mas simplifica" },
  { dominant: "ALTERNATIVE_EXPLORATION", message: "entendi mas tem alternativa?" },
  { dominant: "SOCIAL_VALIDATION", message: "boa mas e bem visto?" },
  { dominant: "SECOND_BEST_DISCOVERY", message: "blz mas backup?" },
  { dominant: "DECISION_CONFIRMATION", message: "saquei entao e esse mesmo?" },
  { dominant: "ANTI_REGRET", message: "slk mas posso comprar sem medo?" },
  { dominant: "CONFIDENCE_CHALLENGE", message: "blz mas tem certeza?" },
  { dominant: "SOFT_DISAGREEMENT", message: "entendi mas n curti mt" },
  { dominant: "CONSTRAINT_CHANGE", message: "ok agora ate 1800" },
  { dominant: "COMPREHENSION_FAILURE", message: "saquei nada explica de novo" },
  { dominant: "ALTERNATIVE_EXPLORATION", message: "boa abre mais opcoes" },
  { dominant: "SOCIAL_VALIDATION", message: "saquei mas quem comprou aprova?" },
  { dominant: "SECOND_BEST_DISCOVERY", message: "slk mas quem veio logo atras?" },
  { dominant: "DECISION_CONFIRMATION", message: "boa posso ir nesse?" },
  { dominant: "ANTI_REGRET", message: "entendi mas n quero me arrepender" },
  { dominant: "CONFIDENCE_CHALLENGE", message: "boa mas vc sustenta isso?" },
];

const PURE_CONTROLS = [
  { message: "ok", mustStay: "ACKNOWLEDGEMENT" },
  { message: "blz", mustStay: "ACKNOWLEDGEMENT" },
  { message: "show", mustStay: "ACKNOWLEDGEMENT" },
  { message: "faz sentido", mustStay: "COMPREHENSION_SUCCESS" },
  { message: "agora entendi", mustStay: "COMPREHENSION_SUCCESS" },
  { message: "oi", mustStay: "GREETING" },
  { message: "bom dia", mustStay: "GREETING" },
  { message: "mostra outra opção", mustStay: "ALTERNATIVE_EXPLORATION" },
  { message: "qual ficou em segundo?", mustStay: "SECOND_BEST_DISCOVERY" },
  { message: "tenho medo de errar", mustStay: "ANTI_REGRET" },
  { message: "continua valendo?", mustStay: "CONFIDENCE_CHALLENGE" },
  { message: "fecho nele?", mustStay: "DECISION_CONFIRMATION" },
  { message: "não me convenceu", mustStay: "SOFT_DISAGREEMENT" },
  { message: "quero gastar menos", mustStay: "CONSTRAINT_CHANGE" },
  { message: "o pessoal gosta?", mustStay: "SOCIAL_VALIDATION" },
  { message: "não entendi", mustStay: "COMPREHENSION_FAILURE" },
  { message: "plano b?", mustStay: "SECOND_BEST_DISCOVERY" },
  { message: "tem certeza?", mustStay: "CONFIDENCE_CHALLENGE" },
  { message: "repete", mustStay: "COMPREHENSION_FAILURE" },
  { message: "captei", mustStay: "COMPREHENSION_SUCCESS" },
];

function buildScenarios() {
  const rows = [];
  let id = 0;

  for (const bucket of [
    ["INFORMAL", INFORMAL],
    ["ABBREV", ABBREV],
    ["TYPO", TYPO],
    ["COMPOUND", COMPOUND],
  ]) {
    const [label, items] = bucket;
    for (const [idx, item] of items.entries()) {
        id += 1;
        rows.push({
          id: `${label}-${id}`,
          bucket: label,
          dominantFamilyExpected: item.dominant,
          userMessage: item.message,
          contextType: idx % 2 === 0 ? "anchored" : "cold",
          isControl: false,
        });
    }
  }

  for (const ctrl of PURE_CONTROLS) {
    id += 1;
    rows.push({
      id: `CTRL-${id}`,
      bucket: "CONTROL",
      dominantFamilyExpected: ctrl.mustStay,
      userMessage: ctrl.message,
      contextType: "anchored",
      isControl: true,
    });
  }

  return rows;
}

const SCENARIOS = buildScenarios();

function evaluate(record) {
  if (record.isControl) {
    return record.userPerception === "SIM" && record.responsePathActual.endsWith("_flow");
  }
  const expectedPath = FLOW_PATH[record.dominantFamilyExpected];
  const ackCsPaths = new Set(["acknowledgement_flow", "comprehension_flow"]);
  const pathOk =
    record.responsePathActual === expectedPath ||
    (["ACKNOWLEDGEMENT", "COMPREHENSION_SUCCESS"].includes(record.dominantFamilyExpected) &&
      ackCsPaths.has(record.responsePathActual)) ||
    (expectedPath == null && record.responsePathActual.endsWith("_flow"));
  return record.userPerception === "SIM" && pathOk;
}

function run() {
  console.log("PATCH 8.1B.7 — Informal / Abbrev / Typo / Compound Production Perception Audit\n");

  const results = SCENARIOS.map((spec) => {
    const audit = auditScenario({
      id: spec.id,
      familyExpected: "INFORMAL_ABBREV_TYPO_COMPOUND",
      userMessage: spec.userMessage,
      contextType: spec.contextType,
      dominantFamily: spec.dominantFamilyExpected,
    });
    const pass = evaluate({ ...spec, ...audit });
    return {
      ...spec,
      ...audit,
      pass,
      dominantFamilyDetected: audit.dominantFamilyDetected || spec.dominantFamilyExpected,
    };
  });

  const positive = results.filter((r) => !r.isControl);
  const controls = results.filter((r) => r.isControl);
  const posPass = positive.filter((r) => r.pass).length;
  const ctrlPass = controls.filter((r) => r.pass).length;

  const byBucket = {};
  for (const r of positive) {
    if (!byBucket[r.bucket]) byBucket[r.bucket] = { total: 0, pass: 0 };
    byBucket[r.bucket].total++;
    if (r.pass) byBucket[r.bucket].pass++;
  }

  console.log(`Total: ${results.length} | Positive: ${posPass}/${positive.length} (${((posPass / positive.length) * 100).toFixed(1)}%)`);
  console.log(`Controls: ${ctrlPass}/${controls.length}\n`);

  for (const [bucket, stats] of Object.entries(byBucket)) {
    console.log(`${bucket}: ${stats.pass}/${stats.total} (${((stats.pass / stats.total) * 100).toFixed(1)}%)`);
  }

  const failures = results.filter((r) => !r.pass);
  if (failures.length) {
    console.log("\n── Failures (up to 15) ──\n");
    for (const f of failures.slice(0, 15)) {
      console.log(
        `[${f.bucket}] ${f.contextType} "${f.userMessage}" → expected ${f.dominantFamilyExpected}/${FLOW_PATH[f.dominantFamilyExpected]} | actual ${f.responsePathActual} | perception ${f.userPerception} | leak ${f.leakType || "-"}`
      );
    }
  }

  const pct = (posPass / positive.length) * 100;
  const veredito = pct >= 95 ? "APROVADO" : pct >= 90 ? "APROVADO (margem)" : "REPROVADO";
  console.log(`\nVEREDITO: ${veredito}`);

  if (pct < 95 || ctrlPass < controls.length) {
    process.exitCode = 1;
  }
}

run();
