/**
 * PATCH 8.0C — Abbreviation Normalization Variants (Regra 18)
 *
 * Usage: node scripts/test-mia-abbreviation-normalization-variants.js
 */

import {
  classifyMiaTurn,
  MIA_TURN_TYPES,
  isAcknowledgementFamilyQuery,
  isAntiRegretFamilyQuery,
  isConfidenceChallengeFamilyQuery,
  isSoftDisagreementFamilyQuery,
} from "../lib/miaCognitiveRouter.js";
import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";
import { resolveClearNewCommercialSearchForRouting } from "../lib/miaRoutingSafety.js";
import { applyAbbreviationNormalization } from "../lib/miaAbbreviationNormalizer.js";
import { applyInformalLanguageNormalization } from "../lib/miaInformalLanguageNormalization.js";

const SESSION = {
  lastBestProduct: { product_name: "Produto Atual", price: "R$ 999" },
  lastRecommendation: { winner: "Produto Atual" },
  lastProductMentioned: "Produto Atual",
  lastProducts: [{ product_name: "Produto Atual" }],
};

function v(persona, input, expectNorm, opts = {}) {
  return { persona, input, expectNorm, ...opts };
}

const VARIANTS = [
  // leigo
  v("leigo", "vc acha q vale msm?", "voce acha que vale mesmo"),
  v("leigo", "sla se compensa", "sei la se compensa"),
  v("leigo", "n sei se compensa", "nao sei se compensa"),
  v("leigo", "p mim parece caro", "para mim parece caro"),
  v("leigo", "q celular pego?", "qual celular pego"),
  v("leigo", "tbm quero saber", "tambem quero saber"),
  v("leigo", "pq esse?", "por que esse"),
  v("leigo", "blz entao", "beleza entao"),
  v("leigo", "vlw mia", "valeu mia"),
  v("leigo", "obg", "obrigado"),

  // tecnico
  v("tecnico", "gpu boa p jogar?", "placa de video boa para jogar"),
  v("tecnico", "note gamer ate 4k", "notebook gamer ate 4k"),
  v("tecnico", "proc bom", "processador bom"),
  v("tecnico", "cxb dele e bom?", "custo beneficio dele e bom"),
  v("tecnico", "qnt ta esse ssd?", "quanto ta esse ssd"),
  v("tecnico", "vga melhor q essa?", "placa de video melhor que essa"),
  v("tecnico", "vc recomenda essa gpu?", "voce recomenda essa placa de video"),
  v("tecnico", "monitor 144hz vale msm?", "monitor 144hz vale mesmo"),

  // informal
  v("informal", "crl ta caro", "crl ta caro"),
  v("informal", "slk pesado", "nossa pesado"),
  v("informal", "kkk entendi", "entendi"),
  v("informal", "rsrs blz", "beleza"),
  v("informal", "fechow", "fechou"),
  v("informal", "suav", "suave"),
  v("informal", "flw", "falou"),
  v("informal", "tmj", "valeu"),
  v("informal", "d boa", "de boa"),
  v("informal", "mo caro", "muito caro"),

  // muito informal
  v("muito_informal", "vcs recomendam esse?", "voces recomendam esse"),
  v("muito_informal", "ce acha q vale?", "voce acha que vale"),
  v("muito_informal", "cmg n bateu", "comigo n bateu"),
  v("muito_informal", "ngm curte?", "ninguem curte"),
  v("muito_informal", "td mundo usa?", "todo mundo usa"),
  v("muito_informal", "agr msm quero", "agora mesmo quero"),
  v("muito_informal", "dps vejo", "depois vejo"),
  v("muito_informal", "hj nao", "hoje nao"),
  v("muito_informal", "nn curti", "nao curti"),
  v("muito_informal", "naum sei", "nao sei"),

  // apressado
  v("apressado", "q?", "que"),
  v("apressado", "pq?", "por que"),
  v("apressado", "sla", "sei la"),
  v("apressado", "blz", "beleza"),
  v("apressado", "vc tem certeza?", "voce tem certeza", { familyQuery: isConfidenceChallengeFamilyQuery, anchored: true }),
  v("apressado", "continua?", "continua"),
  v("apressado", "q notebook?", "qual notebook"),
  v("apressado", "mt caro", "muito caro"),

  // indeciso
  v("indeciso", "n sei nao", "nao sei nao", { familyQuery: isSoftDisagreementFamilyQuery, anchored: true }),
  v("indeciso", "sei la", "sei la", { familyQuery: isSoftDisagreementFamilyQuery, anchored: true }),
  v("indeciso", "to com receio", "to com receio", { familyQuery: isAntiRegretFamilyQuery, anchored: true }),
  v("indeciso", "n quero errar", "nao quero errar", { familyQuery: isAntiRegretFamilyQuery, anchored: true }),
  v("indeciso", "vc iria nesse tbm?", "voce iria nesse tambem", { familyQuery: isConfidenceChallengeFamilyQuery, anchored: true }),
  v("indeciso", "continua valendo?", "continua valendo", { familyQuery: isConfidenceChallengeFamilyQuery, anchored: true }),
  v("indeciso", "espera ai", "espera ai", { familyQuery: isSoftDisagreementFamilyQuery, anchored: true }),
  v("indeciso", "calma ai", "calma ai", { familyQuery: isSoftDisagreementFamilyQuery, anchored: true }),

  // typo
  v("typo", "vcc acha q vale?", "voce acha que vale"),
  v("typo", "vce recomenda?", "voce recomenda"),
  v("typo", "tbmm quero", "tambem quero"),
  v("typo", "agor quero", "agora quero"),
  v("typo", "msmo preco", "mesmo preco"),
  v("typo", "bllz", "beleza"),
  v("typo", "fechow", "fechou"),
  v("typo", "voce acha q vale msm?", "voce acha que vale mesmo"),

  // regional
  v("regional", "oxe caro", "nossa caro"),
  v("regional", "uai compensa?", "nossa compensa"),
  v("regional", "eita pesado", "nossa pesado"),
  v("regional", "vish caro", "nossa caro"),

  // curto
  v("curto", "n?", "n", { ambiguousSkip: true }),
  v("curto", "p?", "p", { ambiguousSkip: true }),
  v("curto", "q?", "que"),
  v("curto", "vlw", "valeu", { familyQuery: isAcknowledgementFamilyQuery, anchored: true }),
  v("curto", "show", "show", { familyQuery: isAcknowledgementFamilyQuery, anchored: true }),
  v("curto", "demorou", "demorou", { familyQuery: isAcknowledgementFamilyQuery, anchored: true }),
  v("curto", "fechou", "fechou", { familyQuery: isAcknowledgementFamilyQuery, anchored: true }),
  v("curto", "entendi", "entendi", { familyQuery: isAcknowledgementFamilyQuery, anchored: true }),

  // composto
  v("composto", "tlgd mas e bateria?", "ta ligado mas e bateria"),
  v("composto", "kkk blz entendi", "beleza entendi"),
  v("composto", "vc acha q compensa msm?", "voce acha que compensa mesmo"),
  v("composto", "pq nao curti muito?", "por que nao curti muito"),
  v("composto", "tbm queria saber da bateria", "tambem queria saber da bateria"),
  v("composto", "agr quero algo mais barato", "agora quero algo mais barato"),
  v("composto", "n curti mto", "nao curti muito"),
  v("composto", "esse ai vale msm?", "esse ai vale mesmo"),
  v("composto", "onde q compra?", "onde que compra"),
  v("composto", "como q funciona?", "como que funciona"),
];

function normMatches(actual, expected) {
  return actual === expected || actual.includes(expected);
}

function evaluateVariant(spec) {
  const abbrev = applyAbbreviationNormalization(spec.input);
  const informal = applyInformalLanguageNormalization(abbrev.normalizedMessage);
  const failures = [];

  if (abbrev.originalMessage !== spec.input) {
    failures.push("original_not_preserved");
  }

  if (spec.ambiguousSkip) {
    if (abbrev.hasAbbreviationNormalization) failures.push("over_normalized");
    return { ok: failures.length === 0, failures, text: informal.text, abbrev };
  }

  if (!normMatches(informal.text, spec.expectNorm)) {
    failures.push(`norm=${informal.text}`);
  }

  if (spec.familyQuery && !spec.familyQuery(spec.input)) {
    failures.push("familyQuery=false");
  }

  if (spec.anchored && spec.familyQuery) {
    const turn = classifyMiaTurn({
      query: spec.input,
      originalQuery: spec.input,
      resolvedQuery: spec.input,
      sessionContext: SESSION,
      hasActiveAnchor: true,
      detectedIntent: "search",
      contextAction: "search",
    });
    if (turn.turnType === MIA_TURN_TYPES.UNKNOWN) {
      failures.push(`turnType=${turn.turnType}`);
    }
  }

  return { ok: failures.length === 0, failures, text: informal.text, abbrev };
}

console.log("PATCH 8.0C — Abbreviation Normalization Variants (Regra 18)\n");

let pass = 0;
let fail = 0;
const byPersona = {};

for (const spec of VARIANTS) {
  const result = evaluateVariant(spec);
  byPersona[spec.persona] = byPersona[spec.persona] || { pass: 0, fail: 0 };
  if (result.ok) {
    pass += 1;
    byPersona[spec.persona].pass += 1;
  } else {
    fail += 1;
    byPersona[spec.persona].fail += 1;
    console.log(`✗ [${spec.persona}] "${spec.input}" → ${result.failures.join("; ")} | "${result.text}"`);
  }
}

console.log(`\nVariantes: ${pass}/${pass + fail} (${((pass / (pass + fail)) * 100).toFixed(1)}%)`);
console.log("\n── Por persona ──\n");
for (const [persona, stats] of Object.entries(byPersona)) {
  const total = stats.pass + stats.fail;
  console.log(`  [${persona}]: ${stats.pass}/${total}`);
}

const rate = pass / (pass + fail);
const verdict = rate >= 0.95 ? "A) ABBREVIATION VARIANTS ROBUST" : "B) ABBREVIATION VARIANTS POSSUI GAP";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(rate >= 0.95 ? 0 : 1);
