/**
 * PATCH 8.0E — Compound Input Normalization Variants (Regra 18)
 *
 * Usage: node scripts/test-mia-compound-input-normalization-variants.js
 */

import { normalizeCompoundInput } from "../lib/miaCompoundInputNormalizer.js";
import {
  isAboutMiaFamilyQuery,
  isAcknowledgementFamilyQuery,
  isAlternativeExplorationFamilyQuery,
  isAntiRegretFamilyQuery,
  isComprehensionFamilyQuery,
  isConfidenceChallengeFamilyQuery,
  isSecondBestDiscoveryFamilyQuery,
  isSoftDisagreementFamilyQuery,
} from "../lib/miaCognitiveRouter.js";

function matches(actual = "", expected = "") {
  const a = String(actual || "").toLowerCase();
  if (Array.isArray(expected)) return expected.every((part) => a.includes(String(part).toLowerCase()));
  const e = String(expected || "").toLowerCase();
  return a === e || a.includes(e);
}

function v(persona, input, expectContains, opts = {}) {
  return { persona, input, expectContains, ...opts };
}

const VARIANTS = [
  // leigo (10)
  v("leigo", "kkkk vc acha q o ipone presta msm?", "voce acha que o iphone presta mesmo"),
  v("leigo", "sla mano q sansung é melhor?", "qual samsung"),
  v("leigo", "blz entao qual pego?", "beleza entao qual pego"),
  v("leigo", "tmj mia", "valeu mia"),
  v("leigo", "q fita esse notbook?", "e ai esse notebook"),
  v("leigo", "poço confiar nesse?", "posso confiar nesse"),
  v("leigo", "n quero me ferrar nesse ipone", "nao quero me arrepender nesse iphone"),
  v("leigo", "p mim ta caro dms", "para mim ta caro demais"),
  v("leigo", "vc acha q vale msm?", "voce acha que vale mesmo"),
  v("leigo", "qual cel bom p bateria?", "qual celular bom para bateria"),

  // tecnico (8)
  v("tecnico", "gpu boa p gamer?", "placa de video boa para gamer"),
  v("tecnico", "ssd nvme p notebook", "ssd nvme para notebook"),
  v("tecnico", "rtx4060 ou rx7800xt", "rtx4060 ou rx7800xt"),
  v("tecnico", "monito ips 144hz vale?", "monitor ips 144hz vale"),
  v("tecnico", "tecldo mecanico rgb", "teclado mecanico rgb"),
  v("tecnico", "mause sem fio p trabalho", "mouse sem fio para trabalho"),
  v("tecnico", "notbook p estudar ate 2500", "notebook para estudar ate 2500"),
  v("tecnico", "proc bom p edicao", "processador bom p edicao"),

  // informal (10)
  v("informal", "slk mano q sansung é melhor?", "qual samsung"),
  v("informal", "tlgd mas e bateria?", "ta ligado mas e de bateria"),
  v("informal", "koe mano esse ipone presta?", "e ai esse iphone presta"),
  v("informal", "vish esse monito caro", "nossa esse monitor caro"),
  v("informal", "eita notbook pesado", "nossa notebook pesado"),
  v("informal", "oxe mause caro", "nossa mouse caro"),
  v("informal", "ce loko esse sansung", "nossa esse samsung"),
  v("informal", "seloko notbook caro", "nossa notebook caro"),
  v("informal", "demoro mano", "demorou mano"),
  v("informal", "partiu entao", "fechou entao"),

  // muito_informal (8)
  v("muito_informal", "kkkk slk mano esse ipone ta caro dms", ["nossa", "iphone", "demais"]),
  v("muito_informal", "crl esse ta caro", "esse ta caro"),
  v("muito_informal", "pqp preço bom", "preco bom"),
  v("muito_informal", "carai sera q presta?", "sera que presta"),
  v("muito_informal", "slk gostei mas n curti", "nossa gostei mas nao curti"),
  v("muito_informal", "kkkk entendi mas n curti mto", "entendi mas nao curti muito", { familyQuery: isSoftDisagreementFamilyQuery, anchored: true }),
  v("muito_informal", "rsrs blz", "beleza", { familyQuery: isAcknowledgementFamilyQuery, anchored: true }),
  v("muito_informal", "hahaha qual ficou em segundo?", "qual ficou em segundo", { familyQuery: isSecondBestDiscoveryFamilyQuery, anchored: true }),

  // apressado (8)
  v("apressado", "vc acha q vale?", "voce acha que vale"),
  v("apressado", "n curti", "nao curti", { familyQuery: isSoftDisagreementFamilyQuery, anchored: true }),
  v("apressado", "blz", "beleza", { familyQuery: isAcknowledgementFamilyQuery, anchored: true }),
  v("apressado", "sla", "sei la", { familyQuery: isSoftDisagreementFamilyQuery, anchored: true }),
  v("apressado", "poso?", "posso"),
  v("apressado", "monito?", "monitor"),
  v("apressado", "continua valendo?", "continua valendo", { familyQuery: isConfidenceChallengeFamilyQuery, anchored: true }),
  v("apressado", "mostra outra", "mostra outra", { familyQuery: isAlternativeExplorationFamilyQuery, anchored: true }),

  // indeciso (8)
  v("indeciso", "sla se eu compro, tenho medo d errar", "sei la se eu compro tenho medo d errar"),
  v("indeciso", "nao quero dor d cabeca", "nao quero me arrepender", { familyQuery: isAntiRegretFamilyQuery, anchored: true }),
  v("indeciso", "tenho serteza q esse sansung vale?", "tenho certeza que esse samsung vale"),
  v("indeciso", "poço comprar sem medo?", "posso comprar sem medo"),
  v("indeciso", "vc acha q vou me arrepender?", "voce acha que vou me arrepender"),
  v("indeciso", "to com receio desse mause", "to com receio desse mouse"),
  v("indeciso", "n sei se esse notbook presta", "nao sei se esse notebook presta"),
  v("indeciso", "kkkk tenho medo d errar", "tenho medo d errar"),

  // typo_leve (8)
  v("typo_leve", "ipone vale?", "iphone vale"),
  v("typo_leve", "sansung compensa?", "samsung compensa"),
  v("typo_leve", "notbook barato", "notebook barato"),
  v("typo_leve", "monito bom", "monitor bom"),
  v("typo_leve", "mause rgb", "mouse rgb"),
  v("typo_leve", "tecldo mecanico", "teclado mecanico"),
  v("typo_leve", "voçe indica?", "voce indica"),
  v("typo_leve", "serteza?", "certeza"),

  // typo_pesado (8)
  v("typo_pesado", "iphnoe ou sansung?", "iphone ou samsung"),
  v("typo_pesado", "notboook p estudar", "notebook para estudar"),
  v("typo_pesado", "monnitor gamer", "monitor gamer"),
  v("typo_pesado", "cadeeira ergonomica", "cadeira ergonomica"),
  v("typo_pesado", "recomendassao boa?", "recomendacao boa"),
  v("typo_pesado", "custo benificio", "custo beneficio"),
  v("typo_pesado", "barartinho demais", "barato demais"),
  v("typo_pesado", "perfomance ruim", "performance ruim"),

  // abrev_typo (8)
  v("abrev_typo", "vc acha q esse notbook compensa?", "voce acha que esse notebook compensa"),
  v("abrev_typo", "pq esse sansung?", "por que esse samsung"),
  v("abrev_typo", "tbm quero monito", "tambem quero monitor"),
  v("abrev_typo", "n curti esse mause", "nao curti esse mouse"),
  v("abrev_typo", "vc tem serteza?", "voce tem certeza"),
  v("abrev_typo", "q notbook pego?", "qual notebook pego"),
  v("abrev_typo", "p mim parece caro", "para mim parece caro"),
  v("abrev_typo", "agr to na duvida", "agora to na duvida"),

  // risada_giria (8)
  v("risada_giria", "kkkk vlw", "valeu", { familyQuery: isAcknowledgementFamilyQuery, anchored: true }),
  v("risada_giria", "rsrs demorou", "demorou", { familyQuery: isAcknowledgementFamilyQuery, anchored: true }),
  v("risada_giria", "hehe entendii", "entendi", { familyQuery: isAcknowledgementFamilyQuery, anchored: true }),
  v("risada_giria", "kkk show", "show", { familyQuery: isAcknowledgementFamilyQuery, anchored: true }),
  v("risada_giria", "kkkk esse mause parece bom", "esse mouse parece bom"),
  v("risada_giria", "rsrs pode explicar?", "pode explicar", { familyQuery: isComprehensionFamilyQuery, anchored: true }),
  v("risada_giria", "hahaha fechow", "fechou", { familyQuery: isAcknowledgementFamilyQuery, anchored: true }),
  v("risada_giria", "kkkk entendii", "entendi", { familyQuery: isAcknowledgementFamilyQuery, anchored: true }),

  // palavrao_duvida (8)
  v("palavrao_duvida", "crl esse monito compensa?", "esse monitor compensa"),
  v("palavrao_duvida", "krl vale mesmo?", "vale mesmo"),
  v("palavrao_duvida", "pqp esse preço ta bom", "esse preco ta bom"),
  v("palavrao_duvida", "carai, sera q presta?", "sera que presta"),
  v("palavrao_duvida", "crl nao quero me arrepender", "nao quero me arrepender", { familyQuery: isAntiRegretFamilyQuery, anchored: true }),
  v("palavrao_duvida", "krl mostra outra opcao", "mostra outra opcao", { familyQuery: isAlternativeExplorationFamilyQuery, anchored: true }),
  v("palavrao_duvida", "pqp nao curti", "nao curti", { familyQuery: isSoftDisagreementFamilyQuery, anchored: true }),
  v("palavrao_duvida", "crl tenho medo d errar", "tenho medo d errar"),

  // regional_produto (8)
  v("regional", "oxe ipone caro", "nossa iphone caro"),
  v("regional", "uai sansung compensa?", "nossa samsung compensa"),
  v("regional", "eita monito pesado", "nossa monitor pesado"),
  v("regional", "vish notbook caro", "nossa notebook caro"),
  v("regional", "poço confiar?", "posso confiar"),
  v("regional", "voçe indica?", "voce indica"),
  v("regional", "rapaz mause caro", "nossa mouse caro"),
  v("regional", "uai fone barato", "nossa fone barato"),
];

console.log("PATCH 8.0E — Compound Input Variants (Regra 18)\n");
console.log(`Variantes: ${VARIANTS.length}\n`);

let pass = 0;
let fail = 0;
const byPersona = {};

for (const spec of VARIANTS) {
  const compound = normalizeCompoundInput({ originalMessage: spec.input });
  const failures = [];

  if (compound.originalMessage !== spec.input) failures.push("original_lost");
  if (compound.normalizedMessage.includes("voce voce")) failures.push("double_voce");
  if (!matches(compound.normalizedMessage, spec.expectContains)) {
    failures.push(`norm=${compound.normalizedMessage}`);
  }
  if (spec.familyQuery && !spec.familyQuery(spec.input)) failures.push("family=false");

  byPersona[spec.persona] = byPersona[spec.persona] || { pass: 0, fail: 0 };
  if (failures.length) {
    fail += 1;
    byPersona[spec.persona].fail += 1;
    console.log(`✗ [${spec.persona}] "${spec.input}" → ${failures.join("; ")} | "${compound.normalizedMessage}"`);
  } else {
    pass += 1;
    byPersona[spec.persona].pass += 1;
  }
}

console.log(`\nResultado: ${pass}/${pass + fail} (${((pass / (pass + fail)) * 100).toFixed(1)}%)`);
console.log("\n── Por persona ──\n");
for (const [persona, stats] of Object.entries(byPersona)) {
  console.log(`  [${persona}]: ${stats.pass}/${stats.pass + stats.fail}`);
}

const rate = pass / (pass + fail);
const verdict = rate >= 0.95 ? "A) COMPOUND VARIANTS ROBUST" : "B) COMPOUND VARIANTS POSSUI GAP";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(rate >= 0.95 ? 0 : 1);
