/**
 * PATCH 8.1B.9 — Acknowledgement Production Perception Audit
 *
 * Full-stack trace: Router → Routing → Contract → Response Path → Perception (Regra 17)
 *
 * Usage: node scripts/test-mia-acknowledgement-production-audit.js
 */

import {
  isAcknowledgementFamilyQuery,
  isComprehensionSuccessFamilyQuery,
  isDecisionConfirmationFamilyQuery,
  isSoftDisagreementFamilyQuery,
  isConstraintChangeFamilyQuery,
  isAlternativeExplorationFamilyQuery,
  isAntiRegretFamilyQuery,
  isConfidenceChallengeFamilyQuery,
} from "../lib/miaCognitiveRouter.js";
import { auditScenario } from "./test-mia-production-response-perception-audit.js";

const PRODUCTS = ["celular", "notebook", "monitor", "tv", "cadeira", "mouse", "teclado"];

function pickProduct(i) {
  return PRODUCTS[i % PRODUCTS.length];
}

function ackRow(bucket, message, contextType, idx) {
  return {
    id: `ACK-${bucket}-${idx + 1}`,
    bucket,
    message,
    contextType,
    expectAck: true,
  };
}

function negRow(bucket, message, contextType, expectFamily, idx) {
  return {
    id: `NEG-${bucket}-${idx + 1}`,
    bucket,
    message,
    contextType,
    expectAck: false,
    expectFamily,
  };
}

function buildPureAck() {
  const seeds = [
    "ok",
    "blz",
    "beleza",
    "show",
    "certo",
    "ta bom",
    "tranquilo",
    "suave",
    "valeu",
    "vlw",
    "top",
    "perfeito",
    "fechado",
    "combinado",
    "joia",
    "pode ser",
    "demorou",
    "boa",
    "massa",
    "maravilha",
  ];
  const rows = [];
  for (let i = 0; i < 26; i++) {
    rows.push(
      ackRow("PURE", seeds[i % seeds.length], i % 2 === 0 ? "cold" : "anchored", i)
    );
  }
  return rows;
}

function buildInformalAck() {
  const seeds = [
    "fechou",
    "fechow",
    "firmeza",
    "fmz",
    "suave entao",
    "blz entao",
    "show entao",
    "boa entao",
    "valeu entao",
    "top entao",
    "tmj",
    "tranquilo entao",
    "ta ligado",
    "tlgd",
    "tlgd ne",
    "demorou",
  ];
  const rows = [];
  for (let i = 0; i < 26; i++) {
    rows.push(
      ackRow("INFORMAL", seeds[i % seeds.length], i % 2 === 0 ? "anchored" : "cold", i)
    );
  }
  return rows;
}

function buildTypoAbbrev() {
  const seeds = [
    "okk",
    "blzz",
    "certoo",
    "showw",
    "vlww",
    "fechouu",
    "blz entendi vlw",
    "demorou",
    "suave",
    "de boa",
    "pode seguir",
    "continua",
    "segue",
    "manda",
  ];
  const rows = [];
  for (let i = 0; i < 26; i++) {
    rows.push(
      ackRow("TYPO_ABBREV", seeds[i % seeds.length], i % 2 === 0 ? "cold" : "anchored", i)
    );
  }
  return rows;
}

function buildContinuity() {
  const seeds = [
    "ok entao",
    "blz, pode seguir",
    "show, continua",
    "beleza, segue",
    "certo, manda",
    "ta, manda",
    "fechou entao",
    "blz entendi vlw",
    "beleza entendi",
    "ok, continua",
    "show, pode seguir",
    "certo entao",
    "beleza, pode continuar",
  ];
  return seeds.map((message, i) =>
    ackRow("CONTINUITY", message, i % 2 === 0 ? "anchored" : "cold", i)
  ).concat([
    ackRow("CONTINUITY", "top entao", "anchored", 13),
    ackRow("CONTINUITY", "massa entao", "cold", 14),
    ackRow("CONTINUITY", "demorou entao", "anchored", 15),
  ]);
}

function buildNegativeControls() {
  const rows = [];
  let idx = 0;

  const cs = [
    "entendi",
    "agora entendi",
    "faz sentido",
    "captei",
    "saquei",
    "boa entendi",
    "show entendi",
    "agora ficou claro",
    "entendi o ponto",
  ];
  for (const message of cs) {
    rows.push(negRow("NEG_CS", message, idx % 2 === 0 ? "cold" : "anchored", "COMPREHENSION_SUCCESS", idx++));
  }

  const dc = [
    "fecho nele?",
    "entao fecho?",
    "posso comprar?",
    "vou nesse?",
    "e esse mesmo?",
    "bate o martelo?",
    "fechado nele?",
    "entao compro?",
  ];
  for (const message of dc) {
    rows.push(negRow("NEG_DC", message, "anchored", "DECISION_CONFIRMATION", idx++));
  }

  const cross = [
    { message: "sei la", family: "SOFT_DISAGREEMENT" },
    { message: "nao sei nao", family: "SOFT_DISAGREEMENT" },
    { message: "nao curti", family: "SOFT_DISAGREEMENT" },
    { message: "ok, mas quero gastar menos", family: "CONSTRAINT_CHANGE" },
    { message: "blz, mas prioriza bateria", family: "CONSTRAINT_CHANGE" },
    { message: "blz, mas mostra outra opcao", family: "ALTERNATIVE_EXPLORATION" },
    { message: "boa, mas tenho medo de errar", family: "ANTI_REGRET" },
    { message: "show, mas continua valendo?", family: "CONFIDENCE_CHALLENGE" },
  ];
  for (const item of cross) {
    rows.push(
      negRow("NEG_CROSS", item.message, idx % 2 === 0 ? "anchored" : "cold", item.family, idx++)
    );
  }

  rows.push(ackRow("PURE_CONTROL", "jóia", "anchored", idx++));

  return rows;
}

const SCENARIOS = [
  ...buildPureAck(),
  ...buildInformalAck(),
  ...buildTypoAbbrev(),
  ...buildContinuity(),
  ...buildNegativeControls(),
];

function familyQuery(family, message) {
  switch (family) {
    case "COMPREHENSION_SUCCESS":
      return isComprehensionSuccessFamilyQuery(message);
    case "DECISION_CONFIRMATION":
      return isDecisionConfirmationFamilyQuery(message);
    case "SOFT_DISAGREEMENT":
      return isSoftDisagreementFamilyQuery(message);
    case "CONSTRAINT_CHANGE":
      return isConstraintChangeFamilyQuery(message);
    case "ALTERNATIVE_EXPLORATION":
      return isAlternativeExplorationFamilyQuery(message);
    case "ANTI_REGRET":
      return isAntiRegretFamilyQuery(message);
    case "CONFIDENCE_CHALLENGE":
      return isConfidenceChallengeFamilyQuery(message);
    default:
      return false;
  }
}

function evaluatePositive(record) {
  const ackQuery = isAcknowledgementFamilyQuery(record.message);
  const csQuery = isComprehensionSuccessFamilyQuery(record.message);
  return (
    record.userPerception === "SIM" &&
    record.routerOk &&
    record.responsePathActual === "acknowledgement_flow" &&
    ackQuery &&
    !csQuery &&
    !record.containsGenericFallback
  );
}

function evaluateNegative(record) {
  const ackQuery = isAcknowledgementFamilyQuery(record.message);
  const csQuery = isComprehensionSuccessFamilyQuery(record.message);
  if (record.expectFamily === "COMPREHENSION_SUCCESS") {
    return csQuery && !ackQuery;
  }
  if (record.expectFamily === "DECISION_CONFIRMATION") {
    return isDecisionConfirmationFamilyQuery(record.message) && !ackQuery;
  }
  if (record.expectFamily === "CONFIDENCE_CHALLENGE") {
    return !ackQuery;
  }
  return familyQuery(record.expectFamily, record.message) && !ackQuery;
}

function run() {
  console.log("PATCH 8.1B.9 — Acknowledgement Production Perception Audit\n");

  const results = SCENARIOS.map((spec) => {
    const audit = auditScenario({
      id: spec.id,
      familyExpected: spec.expectAck ? "ACKNOWLEDGEMENT" : "COMPREHENSION_FAILURE",
      userMessage: spec.message,
      contextType: spec.contextType,
    });
    const pass = spec.expectAck
      ? evaluatePositive({ ...spec, ...audit })
      : evaluateNegative({ ...spec, ...audit });
    return { ...spec, ...audit, pass };
  });

  const positive = results.filter((r) => r.expectAck);
  const negative = results.filter((r) => !r.expectAck);
  const posPass = positive.filter((r) => r.pass).length;
  const negPass = negative.filter((r) => r.pass).length;
  const totalPass = results.filter((r) => r.pass).length;

  const byBucket = {};
  for (const r of results) {
    if (!byBucket[r.bucket]) byBucket[r.bucket] = { total: 0, pass: 0 };
    byBucket[r.bucket].total++;
    if (r.pass) byBucket[r.bucket].pass++;
  }

  console.log(`Total scenarios: ${results.length}`);
  console.log(
    `Positive ACK: ${posPass}/${positive.length} (${((posPass / positive.length) * 100).toFixed(1)}%)`
  );
  console.log(
    `Negative controls: ${negPass}/${negative.length} (${((negPass / negative.length) * 100).toFixed(1)}%)`
  );
  console.log(
    `Overall: ${totalPass}/${results.length} (${((totalPass / results.length) * 100).toFixed(1)}%)\n`
  );

  for (const [bucket, stats] of Object.entries(byBucket)) {
    console.log(`${bucket}: ${stats.pass}/${stats.total}`);
  }

  const failures = results.filter((r) => !r.pass);
  if (failures.length) {
    console.log("\n── Failures (up to 20) ──\n");
    for (const f of failures.slice(0, 20)) {
      console.log(
        `[${f.bucket}] ${f.message.slice(0, 50)} → pass=${f.pass} | perception=${f.userPerception} | path=${f.responsePathActual} | ack=${isAcknowledgementFamilyQuery(f.message)} | cs=${isComprehensionSuccessFamilyQuery(f.message)}`
      );
    }
    if (posPass / positive.length < 0.95) process.exitCode = 1;
    return;
  }

  console.log("\n── VEREDITO ──");
  console.log("A) ACKNOWLEDGEMENT PRODUCTION PERCEPTION FULL STACK REAL");
}

run();
