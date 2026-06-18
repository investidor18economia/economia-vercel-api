/**
 * PATCH 8.1B.6 — Cross-Family Production Perception Audit
 *
 * Full-stack trace: Router → Routing → Contract → Response Path → Perception (Regra 17)
 *
 * Usage: node scripts/test-mia-cross-family-production-perception-audit.js
 */

import { getDominantMasTailIntent } from "../lib/miaCognitiveRouter.js";
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
};

const PREFIXES = {
  ACK: ["blz", "ok", "show", "beleza", "entendi", "saquei", "boa", "certo", "fechou"],
  CS: ["faz sentido", "agora entendi", "captei", "saquei", "entendi agora"],
  GREETING: ["bom dia", "oi", "salve"],
  TONE: ["slk", "kkk", "aff"],
};

const DOMINANT_TAILS = {
  ALTERNATIVE_EXPLORATION: [
    "mas mostra outra opção",
    "mas tem alternativa?",
    "abre mais opções",
    "quero ver outros modelos",
    "mostra concorrentes",
    "mas tem outro?",
    "quero ver alternativas",
    "me mostra outra",
    "mas explorar opções",
    "tem algo diferente?",
    "quero outras possibilidades",
    "mostra possibilidades parecidas",
    "mas ver outras opções",
    "tem mais opções?",
    "quero comparar mais opções",
  ],
  SECOND_BEST_DISCOVERY: [
    "mas qual ficou em segundo?",
    "mas quem quase ganhou?",
    "mas e o plano b?",
    "mas backup?",
    "mas quem veio logo atrás?",
    "qual o plano b?",
    "quem ficou atrás?",
    "mas runner up?",
    "mas segunda opção?",
    "mas quem quase levou?",
    "mas o segundo colocado?",
    "mas quem ficou em segundo lugar?",
    "mas plano b?",
    "mas reserva?",
    "mas quem veio depois?",
  ],
  ANTI_REGRET: [
    "mas tenho medo de errar",
    "mas não quero me arrepender",
    "mas não quero dor de cabeça",
    "mas tô cabreiro",
    "mas posso comprar sem medo?",
    "tenho medo de errar",
    "não quero me arrepender",
    "não quero dor de cabeça",
    "to cabreiro",
    "posso comprar sem medo?",
    "medo de errar",
    "não quero errar",
    "quero evitar dor de cabeça",
    "não quero fazer besteira",
    "tenho medo de escolher errado",
  ],
  CONFIDENCE_CHALLENGE: [
    "mas continua valendo?",
    "mas você sustenta isso?",
    "mas tu compraria?",
    "mas tem certeza?",
    "mas você banca essa?",
    "continua valendo?",
    "você sustenta isso?",
    "tu compraria?",
    "tem certeza?",
    "você banca essa?",
    "mantém essa escolha?",
    "crava isso?",
    "ainda recomenda?",
    "você manteria?",
    "segue nesse mesmo?",
  ],
  DECISION_CONFIRMATION: [
    "fecho nele?",
    "então compro?",
    "posso ir nesse?",
    "bate o martelo?",
    "então é esse mesmo?",
    "vou nesse?",
    "compro esse?",
    "fecho nesse?",
    "manda ver nesse?",
    "então fecho?",
    "posso comprar?",
    "vou ficar com esse?",
    "fechou nele?",
    "então vou nele?",
    "posso ir com esse?",
  ],
  SOFT_DISAGREEMENT: [
    "mas não me convenceu",
    "mas não curti muito",
    "mas tô meio assim",
    "mas não me desceu",
    "mas tá puxado",
    "não me convenceu",
    "não curti muito",
    "tô meio assim",
    "não me desceu",
    "tá puxado",
    "não bateu comigo",
    "não me ganhou",
    "sei lá",
    "meio assim",
    "não desceu bem",
  ],
  CONSTRAINT_CHANGE: [
    "mas quero gastar menos",
    "mas orçamento menor",
    "mas prioriza câmera",
    "agora até 1800",
    "mas bateria pesa mais",
    "quero gastar menos",
    "orçamento menor",
    "prioriza bateria",
    "prioriza câmera",
    "agora até 2000",
    "bateria pesa mais",
    "câmera pesa mais",
    "quero economizar",
    "baixa o orçamento",
    "prefiro gastar menos",
  ],
  SOCIAL_VALIDATION: [
    "mas o pessoal gosta?",
    "mas muita gente recomenda?",
    "mas tem reclamação?",
    "mas é bem visto?",
    "mas quem comprou aprova?",
    "o pessoal gosta?",
    "muita gente recomenda?",
    "tem reclamação?",
    "é bem visto?",
    "quem comprou aprova?",
    "a galera aprova?",
    "o povo fala bem?",
    "quem tem gostou?",
    "tem review ruim?",
    "o pessoal costuma gostar?",
  ],
  COMPREHENSION_FAILURE: [
    "explica melhor",
    "mas não peguei",
    "mas simplifica",
    "explica de novo",
    "mas como assim?",
    "não peguei",
    "simplifica",
    "explica de novo",
    "como assim?",
    "não entendi",
    "detalha melhor",
    "repete",
    "pode simplificar?",
    "que quer dizer isso?",
    "não ficou claro",
  ],
};

function buildCompoundScenarios() {
  const rows = [];
  for (const [dominant, tails] of Object.entries(DOMINANT_TAILS)) {
    tails.forEach((tail, idx) => {
      const prefixPool =
        idx % 5 === 0
          ? PREFIXES.CS
          : idx % 4 === 0
            ? PREFIXES.TONE
            : idx % 3 === 0
              ? PREFIXES.GREETING
              : PREFIXES.ACK;
      const prefix = prefixPool[idx % prefixPool.length];
      const hasMas = tail.startsWith("mas ");
      const message = hasMas ? `${prefix}, ${tail}` : `${prefix}, ${tail}`;
      rows.push({
        dominant,
        secondary: prefixPool === PREFIXES.CS ? "COMPREHENSION_SUCCESS" : prefixPool === PREFIXES.GREETING ? "GREETING" : prefixPool === PREFIXES.TONE ? "TONE" : "ACKNOWLEDGEMENT",
        message,
        anchored: idx % 2 === 0,
        category: "compound",
      });
    });
  }
  return rows;
}

const INFORMAL_COMPOUND = [
  { dominant: "SOFT_DISAGREEMENT", secondary: "TONE", message: "n curti mt n", anchored: true },
  { dominant: "CONSTRAINT_CHANGE", secondary: "TONE", message: "qro gastar menos", anchored: true },
  { dominant: "CONFIDENCE_CHALLENGE", secondary: "TONE", message: "tem ctza msm?", anchored: true },
  { dominant: "SOCIAL_VALIDATION", secondary: "TONE", message: "o povo curte?", anchored: true },
  { dominant: "ALTERNATIVE_EXPLORATION", secondary: "TONE", message: "q fita mostra outra opcao", anchored: true },
  { dominant: "ANTI_REGRET", secondary: "TONE", message: "nao quero me arrepender dps", anchored: true },
  { dominant: "COMPREHENSION_FAILURE", secondary: "TONE", message: "aff n entendi nada", anchored: true },
  { dominant: "SECOND_BEST_DISCOVERY", secondary: "TONE", message: "slk mas qual ficou em segundo?", anchored: true },
  { dominant: "DECISION_CONFIRMATION", secondary: "TONE", message: "blz fecho nele?", anchored: true },
  { dominant: "SOFT_DISAGREEMENT", secondary: "TONE", message: "kkk n me convenceu", anchored: false },
  { dominant: "CONSTRAINT_CHANGE", secondary: "TONE", message: "vlw mas prioriza bateria", anchored: true },
  { dominant: "SOCIAL_VALIDATION", secondary: "TONE", message: "pf mas o pessoal gosta?", anchored: true },
  { dominant: "CONFIDENCE_CHALLENGE", secondary: "TONE", message: "msm assim continua valendo?", anchored: true },
  { dominant: "ALTERNATIVE_EXPLORATION", secondary: "TONE", message: "dms caro tem outro?", anchored: true },
  { dominant: "ANTI_REGRET", secondary: "TONE", message: "slk tenho medo de errar", anchored: true },
  { dominant: "COMPREHENSION_FAILURE", secondary: "TONE", message: "hm explica melhor", anchored: false },
  { dominant: "SECOND_BEST_DISCOVERY", secondary: "TONE", message: "ok mas plano b?", anchored: true },
  { dominant: "DECISION_CONFIRMATION", secondary: "TONE", message: "show entao compro?", anchored: true },
  { dominant: "CONSTRAINT_CHANGE", secondary: "TONE", message: "bora mas orcamento menor", anchored: true },
  { dominant: "SOFT_DISAGREEMENT", secondary: "TONE", message: "aff n bateu cmg", anchored: true },
  { dominant: "SOCIAL_VALIDATION", secondary: "TONE", message: "crl mas tem reclamacao?", anchored: true },
  { dominant: "ALTERNATIVE_EXPLORATION", secondary: "TONE", message: "pfv mostra alternativas", anchored: true },
  { dominant: "ANTI_REGRET", secondary: "TONE", message: "pqp n quero errar", anchored: true },
  { dominant: "COMPREHENSION_FAILURE", secondary: "TONE", message: "aff como assim?", anchored: true },
  { dominant: "CONFIDENCE_CHALLENGE", secondary: "TONE", message: "slk vc sustenta isso?", anchored: true },
];

const PURE_NEGATIVE = [
  { message: "ok", mustStay: "ACKNOWLEDGEMENT" },
  { message: "blz", mustStay: "ACKNOWLEDGEMENT" },
  { message: "show", mustStay: "ACKNOWLEDGEMENT" },
  { message: "faz sentido", mustStay: "COMPREHENSION_SUCCESS" },
  { message: "agora entendi", mustStay: "COMPREHENSION_SUCCESS" },
  { message: "captei", mustStay: "COMPREHENSION_SUCCESS" },
  { message: "oi", mustStay: "GREETING" },
  { message: "bom dia", mustStay: "GREETING" },
  { message: "qual ficou em segundo?", mustStay: "SECOND_BEST_DISCOVERY" },
  { message: "mostra outra opção", mustStay: "ALTERNATIVE_EXPLORATION" },
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
];

const PURE_DETECTORS = {
  ACKNOWLEDGEMENT: (m, p) => p.userPerception === "SIM" && p.dominantFamilyResolved !== "SOFT_DISAGREEMENT",
  COMPREHENSION_SUCCESS: (m, p) => p.userPerception === "SIM",
  GREETING: (m, p) => p.userPerception === "SIM",
  SECOND_BEST_DISCOVERY: (m, p) => p.dominantFamilyResolved === "SECOND_BEST_DISCOVERY" || getDominantMasTailIntent(m) === "SECOND_BEST_DISCOVERY",
  ALTERNATIVE_EXPLORATION: (m, p) => p.dominantFamilyResolved === "ALTERNATIVE_EXPLORATION",
  ANTI_REGRET: (m, p) => p.dominantFamilyResolved === "ANTI_REGRET",
  CONFIDENCE_CHALLENGE: (m, p) => p.dominantFamilyResolved === "CONFIDENCE_CHALLENGE",
  DECISION_CONFIRMATION: (m, p) => p.dominantFamilyResolved === "DECISION_CONFIRMATION",
  SOFT_DISAGREEMENT: (m, p) => p.dominantFamilyResolved === "SOFT_DISAGREEMENT",
  CONSTRAINT_CHANGE: (m, p) => p.dominantFamilyResolved === "CONSTRAINT_CHANGE",
  SOCIAL_VALIDATION: (m, p) => p.dominantFamilyResolved === "SOCIAL_VALIDATION",
  COMPREHENSION_FAILURE: (m, p) => p.dominantFamilyResolved === "COMPREHENSION_FAILURE",
};

function runCompound(spec) {
  const perception = auditScenario({
    id: `CFP-${spec.dominant}-${spec.category}-${spec.anchored ? "anchored" : "cold"}`,
    familyExpected: "CROSS_FAMILY",
    userMessage: spec.message,
    contextType: spec.anchored ? "anchored" : "cold",
    dominantFamily: spec.dominant,
  });

  const detected = perception.dominantFamilyResolved || getDominantMasTailIntent(spec.message);
  const ok =
    perception.userPerception === "SIM" &&
    detected === spec.dominant &&
    perception.responsePathActual === FLOW_PATH[spec.dominant];

  return {
    kind: "positive",
    ...spec,
    ok,
    perception,
    detected,
    masTail: getDominantMasTailIntent(spec.message),
  };
}

function runPureNegative(spec) {
  const perception = auditScenario({
    id: `CFP-pure-${spec.mustStay}`,
    familyExpected: spec.mustStay,
    userMessage: spec.message,
    contextType: "anchored",
  });
  const check = PURE_DETECTORS[spec.mustStay];
  const ok = check ? check(spec.message, perception) : perception.userPerception === "SIM";
  return { kind: "negative", ...spec, ok, perception };
}

console.log("PATCH 8.1B.6 — Cross-Family Production Perception Audit\n");

const compounds = buildCompoundScenarios();
const results = [
  ...compounds.map(runCompound),
  ...INFORMAL_COMPOUND.map((s) => runCompound({ ...s, category: "informal" })),
  ...PURE_NEGATIVE.map(runPureNegative),
];

const positive = results.filter((r) => r.kind === "positive");
const negative = results.filter((r) => r.kind === "negative");
const posOk = positive.filter((r) => r.ok).length;
const negOk = negative.filter((r) => r.ok).length;

console.log(`Total: ${results.length} | Positive: ${posOk}/${positive.length} (${((posOk / positive.length) * 100).toFixed(1)}%)`);
console.log(`Negative controls: ${negOk}/${negative.length}\n`);

const byDominant = {};
for (const r of positive) {
  byDominant[r.dominant] = byDominant[r.dominant] || { ok: 0, total: 0 };
  byDominant[r.dominant].total++;
  if (r.ok) byDominant[r.dominant].ok++;
}
for (const [dom, stats] of Object.entries(byDominant).sort()) {
  console.log(`${dom}: ${stats.ok}/${stats.total} (${((stats.ok / stats.total) * 100).toFixed(1)}%)`);
}

const failures = positive.filter((r) => !r.ok);
if (failures.length) {
  console.log("\n--- Failures (first 25) ---");
  for (const f of failures.slice(0, 25)) {
    console.log(
      `[${f.dominant}] "${f.message}" detected=${f.detected} masTail=${f.masTail} path=${f.perception.responsePathActual} perception=${f.perception.userPerception} leak=${f.perception.leakType}`
    );
  }
}

const negFails = negative.filter((r) => !r.ok);
if (negFails.length) {
  console.log("\n--- Negative control failures ---");
  for (const f of negFails) {
    console.log(`[${f.mustStay}] "${f.message}" perception=${f.perception.userPerception} dominant=${f.perception.dominantFamilyResolved}`);
  }
}

const pass =
  posOk / positive.length >= 0.9 &&
  negOk / negative.length >= 0.85;

console.log(`\nVEREDITO: ${pass ? "APROVADO" : "GAP RESTANTE"}`);
process.exit(pass ? 0 : 1);
