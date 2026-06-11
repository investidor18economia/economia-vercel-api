/**
 * PATCH 6.0 / 6.1 / 6.2 / 6.3 — Router-to-Response Compliance Audit — Test Suite
 *
 * Valida que buildRouterResponseComplianceAudit() detecta corretamente
 * divergências entre a decisão do Cognitive Router e a resposta final.
 *
 * Cenários cobertos:
 *   - confidence_challenge correto (COMPLIANCE_OK)
 *   - confidence_challenge divergente (UNAUTHORIZED_ALTERNATIVE_AFTER_EXPLANATION)
 *   - objection correto (COMPLIANCE_OK)
 *   - objection divergente / forced rerank (OBJECTION_FORCED_RERANK)
 *   - refinement correto (COMPLIANCE_OK)
 *   - refinement fell to welcome (REFINEMENT_FELL_TO_WELCOME)
 *   - priority shift correto (COMPLIANCE_OK)
 *   - welcome detection (informativa)
 *   - unauthorized alternative (via consistency audit flag)
 *   - winner change sem autorização (WINNER_CHANGED_WITHOUT_PERMISSION)
 *   - router classification ignored (ROUTER_CLASSIFICATION_IGNORED)
 *   - response path diverged (RESPONSE_PATH_DIVERGED)
 *
 * Rodar: node scripts/test-mia-router-response-compliance-audit.js
 */

import {
  buildRouterResponseComplianceAudit,
  COMPLIANCE_FLAGS,
  CRITICAL_COMPLIANCE_FLAGS,
} from "../lib/miaRouterResponseComplianceAudit.js";

// ─────────────────────────────────────────────────────────────
// Utilitário de teste
// ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function test(label, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failed++;
    failures.push({ label, error: err.message });
    console.log(`  ✗ ${label}`);
    console.log(`    ${err.message}`);
  }
}

function expect(actual, expected, msg = "") {
  if (actual !== expected) {
    throw new Error(
      `${msg} — esperado: ${JSON.stringify(expected)}, obtido: ${JSON.stringify(actual)}`
    );
  }
}
function expectTrue(val, msg = "") {
  if (!val) throw new Error(`${msg} — esperado true, obtido ${JSON.stringify(val)}`);
}
function expectFalse(val, msg = "") {
  if (val) throw new Error(`${msg} — esperado false, obtido ${JSON.stringify(val)}`);
}
function expectIncludes(arr, item, msg = "") {
  if (!Array.isArray(arr) || !arr.includes(item)) {
    throw new Error(
      `${msg} — ${JSON.stringify(item)} não encontrado em ${JSON.stringify(arr)}`
    );
  }
}
function expectNotIncludes(arr, item, msg = "") {
  if (Array.isArray(arr) && arr.includes(item)) {
    throw new Error(
      `${msg} — ${JSON.stringify(item)} não deveria estar em ${JSON.stringify(arr)}`
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Fixtures comuns
// ─────────────────────────────────────────────────────────────

const ANCHOR_HOLD_ROUTING = {
  mode: "cognitive_anchor_hold",
  responsePathHint: "context_explanation_anchored",
  allowNewSearch: false,
  allowCommercialFallback: false,
  allowReplaceWinner: false,
  allowRerank: false,
  shouldPreserveAnchor: true,
};

const REFINEMENT_ROUTING = {
  mode: "refinement",
  responsePathHint: "refinement_search",
  allowNewSearch: true,
  allowCommercialFallback: true,
  allowReplaceWinner: true,
  allowRerank: true,
  shouldPreserveAnchor: false,
};

const SEARCH_ROUTING = {
  mode: "search",
  responsePathHint: "default_product_search",
  allowNewSearch: true,
  allowCommercialFallback: true,
  allowReplaceWinner: true,
  allowRerank: true,
  shouldPreserveAnchor: false,
};

const ANCHOR_PRODUCT = "Galaxy S24 FE";

// ─────────────────────────────────────────────────────────────
// GRUPO 1 — Confidence Challenge
// ─────────────────────────────────────────────────────────────
console.log("\n— Grupo 1: Confidence Challenge —");

test("1: confidence_challenge correto → COMPLIANCE_OK", () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:    "EXPLANATION_REQUEST",
    cognitiveConfidence:  0.83,
    cognitiveReasons:     ["decision_explanation_subtype:confidence_challenge"],
    hasActiveAnchor:      true,
    finalIntent:          "decision",
    contextAction:        "decision",
    routingDecision:      ANCHOR_HOLD_ROUTING,
    finalReply:           "Tenho certeza! O Galaxy S24 FE é realmente a melhor escolha para o seu perfil.",
    winnerNameAnchor:     ANCHOR_PRODUCT,
  });
  expectTrue(audit.isCompliant, "deve ser compliant");
  expectIncludes(audit.flags, COMPLIANCE_FLAGS.COMPLIANCE_OK, "COMPLIANCE_OK presente");
  expect(audit.criticalFlags.length, 0, "sem flags críticas");
});

test("2: confidence_challenge divergente → UNAUTHORIZED_ALTERNATIVE_AFTER_EXPLANATION", () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:    "EXPLANATION_REQUEST",
    cognitiveConfidence:  0.83,
    cognitiveReasons:     ["decision_explanation_subtype:confidence_challenge"],
    hasActiveAnchor:      true,
    finalIntent:          "decision",
    contextAction:        "decision",
    routingDecision:      ANCHOR_HOLD_ROUTING,
    // Resposta viola a âncora sugerindo alternativa
    finalReply:           "Tenho certeza. Se preferir outra opcao, o Galaxy A54 tambem e uma boa alternativa mais acessivel.",
    winnerNameAnchor:     ANCHOR_PRODUCT,
  });
  expectFalse(audit.isCompliant, "deve ser não-compliant");
  expectIncludes(
    audit.criticalFlags,
    COMPLIANCE_FLAGS.UNAUTHORIZED_ALTERNATIVE_AFTER_EXPLANATION,
    "flag UNAUTHORIZED_ALTERNATIVE presente"
  );
});

test("3: confidence_challenge divergente via consistency audit flag", () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "EXPLANATION_REQUEST",
    cognitiveConfidence: 0.83,
    hasActiveAnchor:     true,
    finalIntent:         "decision",
    contextAction:       "decision",
    routingDecision:     ANCHOR_HOLD_ROUTING,
    finalReply:          "Tenho certeza no Galaxy S24 FE.",
    winnerNameAnchor:    ANCHOR_PRODUCT,
    // Consistency audit (5.5F) sinalizou alternativa não autorizada
    explanationConsistencyAudit: {
      flags: ["EXPLANATION_MENTIONS_UNAUTHORIZED_ALTERNATIVE"],
      hasCriticalFlag: true,
      isConsistent: false,
    },
  });
  expectFalse(audit.isCompliant, "deve ser não-compliant via consistency audit");
  expectIncludes(
    audit.criticalFlags,
    COMPLIANCE_FLAGS.UNAUTHORIZED_ALTERNATIVE_AFTER_EXPLANATION,
    "flag UNAUTHORIZED_ALTERNATIVE detectada via consistency"
  );
});

// ─────────────────────────────────────────────────────────────
// GRUPO 2 — Objection
// ─────────────────────────────────────────────────────────────
console.log("\n— Grupo 2: Objection —");

test("4: objection correto — winner preservado → COMPLIANCE_OK", () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "OBJECTION",
    cognitiveConfidence: 0.84,
    hasActiveAnchor:     true,
    finalIntent:         "decision",
    contextAction:       "decision",
    routingDecision:     { ...ANCHOR_HOLD_ROUTING, mode: "anchored_reaction" },
    finalReply:          "Entendo sua preocupação. O Galaxy S24 FE pode parecer caro, mas o custo-benefício é excelente.",
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expectTrue(audit.isCompliant, "deve ser compliant — winner preservado");
  expectNotIncludes(audit.criticalFlags, COMPLIANCE_FLAGS.OBJECTION_FORCED_RERANK, "sem forced rerank");
  expectIncludes(audit.informativeFlags, COMPLIANCE_FLAGS.OBJECTION_WITH_PRICE_DISCUSSION, "preço discutido");
});

test("5: objection forced rerank → OBJECTION_FORCED_RERANK", () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "OBJECTION",
    cognitiveConfidence: 0.84,
    hasActiveAnchor:     true,
    finalIntent:         "decision",
    contextAction:       "decision",
    routingDecision:     { ...ANCHOR_HOLD_ROUTING, mode: "anchored_reaction" },
    // Resposta troca o produto sem autorização
    finalReply:          "Ja que você achou caro, veja o Moto G62 por R$1499 — e uma otima alternativa mais barata.",
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expectFalse(audit.isCompliant, "deve ser não-compliant");
  expectIncludes(
    audit.criticalFlags,
    COMPLIANCE_FLAGS.OBJECTION_FORCED_RERANK,
    "OBJECTION_FORCED_RERANK detectado"
  );
});

test("6: objection com rerank autorizado → sem OBJECTION_FORCED_RERANK", () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "OBJECTION",
    cognitiveConfidence: 0.84,
    hasActiveAnchor:     true,
    finalIntent:         "refinement",
    contextAction:       "refinement",
    routingDecision:     REFINEMENT_ROUTING, // allowReplaceWinner: true
    finalReply:          "Entendo! Para uma opcao mais acessivel, o Moto G62 custa menos.",
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expectNotIncludes(audit.criticalFlags, COMPLIANCE_FLAGS.OBJECTION_FORCED_RERANK, "rerank autorizado — sem flag");
});

// ─────────────────────────────────────────────────────────────
// GRUPO 3 — Refinement
// ─────────────────────────────────────────────────────────────
console.log("\n— Grupo 3: Refinement —");

test("7: refinement correto → COMPLIANCE_OK + REFINEMENT_WITH_VALID_ALTERNATIVE", () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "REFINEMENT",
    cognitiveConfidence: 0.78,
    hasActiveAnchor:     true,
    finalIntent:         "refinement",
    contextAction:       "refinement",
    routingDecision:     REFINEMENT_ROUTING,
    finalReply:          "Para jogos, o POCO X6 Pro tem o processador mais potente nessa faixa de preço.",
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expectTrue(audit.isCompliant, "deve ser compliant");
  expectIncludes(
    audit.informativeFlags,
    COMPLIANCE_FLAGS.REFINEMENT_WITH_VALID_ALTERNATIVE,
    "alternativa válida informada"
  );
  expectNotIncludes(audit.criticalFlags, COMPLIANCE_FLAGS.REFINEMENT_FELL_TO_WELCOME, "sem welcome");
});

test("8: refinement fell to welcome → REFINEMENT_FELL_TO_WELCOME", () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "REFINEMENT",
    cognitiveConfidence: 0.78,
    hasActiveAnchor:     true,
    finalIntent:         "refinement",
    contextAction:       "refinement",
    routingDecision:     REFINEMENT_ROUTING,
    // Resposta voltou para welcome/help em vez de buscar
    finalReply:          "Posso te ajudar! Me conta mais sobre o que você procura e eu sugiro opções.",
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expectFalse(audit.isCompliant, "deve ser não-compliant");
  expectIncludes(
    audit.criticalFlags,
    COMPLIANCE_FLAGS.REFINEMENT_FELL_TO_WELCOME,
    "REFINEMENT_FELL_TO_WELCOME detectado"
  );
});

// ─────────────────────────────────────────────────────────────
// GRUPO 4 — Priority Shift
// ─────────────────────────────────────────────────────────────
console.log("\n— Grupo 4: Priority Shift —");

test("9: priority_shift correto → sem flags críticas", () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "PRIORITY_SHIFT",
    cognitiveConfidence: 0.80,
    hasActiveAnchor:     true,
    finalIntent:         "refinement",
    contextAction:       "refinement",
    routingDecision:     REFINEMENT_ROUTING,
    finalReply:          "Para jogos, o POCO X6 Pro é melhor do que o Galaxy S24 FE pelo desempenho no Genshin Impact.",
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expect(audit.criticalFlags.length, 0, "sem flags críticas para PRIORITY_SHIFT correto");
});

// ─────────────────────────────────────────────────────────────
// GRUPO 5 — Welcome Response Detection
// ─────────────────────────────────────────────────────────────
console.log("\n— Grupo 5: Welcome / Fallback Detection —");

test("10: resposta welcome detectable como informativa", () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "UNKNOWN",
    cognitiveConfidence: 0,
    hasActiveAnchor:     false,
    finalIntent:         "greeting",
    contextAction:       "greeting",
    routingDecision:     null,
    finalReply:          "Olá! Como posso te ajudar hoje? Me conta o que você procura.",
  });
  expectIncludes(
    audit.informativeFlags,
    COMPLIANCE_FLAGS.WELCOME_RESPONSE_DETECTED,
    "WELCOME_RESPONSE_DETECTED informativa"
  );
  // Welcome sem anchor ativo não é crítico
  expectNotIncludes(
    audit.criticalFlags,
    COMPLIANCE_FLAGS.REFINEMENT_FELL_TO_WELCOME,
    "sem critical — turno era UNKNOWN não REFINEMENT"
  );
});

test("11: resposta substancial não detecta welcome falso positivo", () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "EXPLANATION_REQUEST",
    cognitiveConfidence: 0.83,
    hasActiveAnchor:     true,
    finalIntent:         "decision",
    contextAction:       "decision",
    routingDecision:     ANCHOR_HOLD_ROUTING,
    finalReply:          "O Galaxy S24 FE é a melhor escolha porque combina bateria longa com câmera de qualidade.",
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expectNotIncludes(
    audit.informativeFlags,
    COMPLIANCE_FLAGS.WELCOME_RESPONSE_DETECTED,
    "resposta de explicação não deve ser welcome"
  );
  expectTrue(audit.isCompliant, "deve ser compliant");
});

// ─────────────────────────────────────────────────────────────
// GRUPO 6 — Winner Changed Without Permission
// ─────────────────────────────────────────────────────────────
console.log("\n— Grupo 6: Winner Change sem autorização —");

test("12: winner preservado → sem WINNER_CHANGED_WITHOUT_PERMISSION", () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "EXPLANATION_REQUEST",
    cognitiveConfidence: 0.83,
    hasActiveAnchor:     true,
    finalIntent:         "decision",
    contextAction:       "decision",
    routingDecision:     ANCHOR_HOLD_ROUTING,
    finalReply:          "Sim, o Galaxy S24 FE continua sendo minha recomendação — ele tem ótimo custo-benefício.",
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expectNotIncludes(
    audit.criticalFlags,
    COMPLIANCE_FLAGS.WINNER_CHANGED_WITHOUT_PERMISSION,
    "winner preservado"
  );
});

test("13: winner trocado sem autorização → WINNER_CHANGED_WITHOUT_PERMISSION", () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "EXPLANATION_REQUEST",
    cognitiveConfidence: 0.83,
    hasActiveAnchor:     true,
    finalIntent:         "decision",
    contextAction:       "decision",
    routingDecision:     ANCHOR_HOLD_ROUTING, // allowReplaceWinner: false
    // Resposta não menciona o anchor e menciona outra marca
    finalReply:          "Na verdade, o Moto G62 é uma opção excelente pelo preço. Recomendo o Motorola.",
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expectIncludes(
    audit.criticalFlags,
    COMPLIANCE_FLAGS.WINNER_CHANGED_WITHOUT_PERMISSION,
    "WINNER_CHANGED_WITHOUT_PERMISSION detectado"
  );
});

// ─────────────────────────────────────────────────────────────
// GRUPO 7 — Router Classification Ignored
// ─────────────────────────────────────────────────────────────
console.log("\n— Grupo 7: Router Classification Ignored —");

test("14: Router ignorado — EXPLANATION_REQUEST mas foi para search → ROUTER_CLASSIFICATION_IGNORED", () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "EXPLANATION_REQUEST",
    cognitiveConfidence: 0.83,
    hasActiveAnchor:     true,
    // Bridge deveria ter convertido para "decision" mas intent ficou "search"
    finalIntent:         "search",
    contextAction:       "search",
    routingDecision:     SEARCH_ROUTING,
    finalReply:          "Aqui estão os melhores celulares no mercado hoje.",
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expectIncludes(
    audit.criticalFlags,
    COMPLIANCE_FLAGS.ROUTER_CLASSIFICATION_IGNORED,
    "ROUTER_CLASSIFICATION_IGNORED detectado"
  );
});

test("15: Router respeitado — EXPLANATION_REQUEST + finalIntent=decision → sem ROUTER_CLASSIFICATION_IGNORED", () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "EXPLANATION_REQUEST",
    cognitiveConfidence: 0.83,
    hasActiveAnchor:     true,
    finalIntent:         "decision",
    contextAction:       "decision",
    routingDecision:     ANCHOR_HOLD_ROUTING,
    finalReply:          "O Galaxy S24 FE é recomendado porque combina bateria e câmera.",
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expectNotIncludes(
    audit.criticalFlags,
    COMPLIANCE_FLAGS.ROUTER_CLASSIFICATION_IGNORED,
    "sem ROUTER_CLASSIFICATION_IGNORED quando bridge foi respeitada"
  );
});

test("16: low confidence — EXPLANATION_REQUEST conf=0.60 → sem ROUTER_CLASSIFICATION_IGNORED", () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "EXPLANATION_REQUEST",
    cognitiveConfidence: 0.60, // abaixo do threshold 0.75
    hasActiveAnchor:     true,
    finalIntent:         "search",   // legacy tomou controle — legítimo
    contextAction:       "search",
    routingDecision:     SEARCH_ROUTING,
    finalReply:          "Aqui estão algumas opções.",
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expectNotIncludes(
    audit.criticalFlags,
    COMPLIANCE_FLAGS.ROUTER_CLASSIFICATION_IGNORED,
    "conf baixa → bridge não se aplica → sem flag"
  );
});

test("17: UNKNOWN turn type → sem ROUTER_CLASSIFICATION_IGNORED (não está na allowlist)", () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "UNKNOWN",
    cognitiveConfidence: 0,
    hasActiveAnchor:     true,
    finalIntent:         "search",
    contextAction:       "search",
    routingDecision:     SEARCH_ROUTING,
    finalReply:          "Aqui estão algumas opções.",
  });
  expectNotIncludes(
    audit.criticalFlags,
    COMPLIANCE_FLAGS.ROUTER_CLASSIFICATION_IGNORED,
    "UNKNOWN não está na allowlist → sem flag"
  );
});

// ─────────────────────────────────────────────────────────────
// GRUPO 8 — Response Path Diverged
// ─────────────────────────────────────────────────────────────
console.log("\n— Grupo 8: Response Path Diverged —");

test("18: anchor_hold mode + allowNewSearch=true → RESPONSE_PATH_DIVERGED (contradição interna)", () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "EXPLANATION_REQUEST",
    cognitiveConfidence: 0.83,
    hasActiveAnchor:     true,
    finalIntent:         "decision",
    contextAction:       "decision",
    // Contradição: modo anchor_hold mas allowNewSearch=true
    routingDecision: {
      ...ANCHOR_HOLD_ROUTING,
      allowNewSearch: true, // contradição com cognitive_anchor_hold
    },
    finalReply: "Veja o Galaxy S24 FE.",
    winnerNameAnchor: ANCHOR_PRODUCT,
  });
  expectIncludes(
    audit.criticalFlags,
    COMPLIANCE_FLAGS.RESPONSE_PATH_DIVERGED,
    "RESPONSE_PATH_DIVERGED detectado — contradição mode vs allowNewSearch"
  );
});

test("19: allowNewSearch=false mas finalIntent=search → RESPONSE_PATH_DIVERGED", () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "EXPLANATION_REQUEST",
    cognitiveConfidence: 0.83,
    hasActiveAnchor:     true,
    // Routing disse não ao new search mas intent acabou como search
    finalIntent:         "search",
    contextAction:       "search",
    routingDecision:     ANCHOR_HOLD_ROUTING, // allowNewSearch: false
    finalReply:          "Aqui estão os melhores celulares.",
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expectIncludes(
    audit.criticalFlags,
    COMPLIANCE_FLAGS.RESPONSE_PATH_DIVERGED,
    "RESPONSE_PATH_DIVERGED — allowNewSearch=false mas intent=search"
  );
});

test("20: search_routing + allowNewSearch=true → sem RESPONSE_PATH_DIVERGED", () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "NEW_SEARCH",
    cognitiveConfidence: 0.85,
    hasActiveAnchor:     false,
    finalIntent:         "search",
    contextAction:       "search",
    routingDecision:     SEARCH_ROUTING,
    finalReply:          "Aqui estão os melhores celulares até R$2000.",
  });
  expectNotIncludes(
    audit.criticalFlags,
    COMPLIANCE_FLAGS.RESPONSE_PATH_DIVERGED,
    "sem divergência quando search_routing + allowNewSearch=true"
  );
});

// ─────────────────────────────────────────────────────────────
// GRUPO 9 — Módulo invariantes
// ─────────────────────────────────────────────────────────────
console.log("\n— Grupo 9: Invariantes do módulo —");

test("21: buildRouterResponseComplianceAudit com input vazio → retorna objeto válido", () => {
  const audit = buildRouterResponseComplianceAudit({});
  expectTrue(typeof audit === "object" && audit !== null, "retorna objeto");
  expect(audit.auditVersion, "6.0", "versão correta");
  expectTrue(Array.isArray(audit.criticalFlags), "criticalFlags é array");
  expectTrue(Array.isArray(audit.informativeFlags), "informativeFlags é array");
  expectTrue(Array.isArray(audit.flags), "flags é array");
});

test("22: COMPLIANCE_OK só aparece quando não há flags críticas", () => {
  const clean = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "REACTION",
    cognitiveConfidence: 0.70,
    hasActiveAnchor:     true,
    finalIntent:         "decision",
    contextAction:       "decision",
    routingDecision:     ANCHOR_HOLD_ROUTING,
    finalReply:          "Certo! O Galaxy S24 FE continua como recomendação.",
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expectTrue(clean.isCompliant, "deve ser compliant");
  expectIncludes(clean.flags, COMPLIANCE_FLAGS.COMPLIANCE_OK, "COMPLIANCE_OK presente");
  expect(clean.criticalFlags.length, 0, "zero flags críticas");
});

test("23: função pura — resultado determinístico", () => {
  const input = {
    cognitiveTurnType: "EXPLANATION_REQUEST",
    cognitiveConfidence: 0.83,
    hasActiveAnchor: true,
    finalIntent: "decision",
    contextAction: "decision",
    routingDecision: ANCHOR_HOLD_ROUTING,
    finalReply: "O Galaxy S24 FE é minha recomendação.",
    winnerNameAnchor: ANCHOR_PRODUCT,
  };
  const r1 = buildRouterResponseComplianceAudit(input);
  const r2 = buildRouterResponseComplianceAudit(input);
  expect(r1.isCompliant, r2.isCompliant, "resultado determinístico");
  expect(r1.flags.join(","), r2.flags.join(","), "flags determinísticas");
});

test("24: CRITICAL_COMPLIANCE_FLAGS contém todas as flags críticas esperadas", () => {
  const expected = [
    "ROUTER_CLASSIFICATION_IGNORED",
    "RESPONSE_PATH_DIVERGED",
    "UNAUTHORIZED_ALTERNATIVE_AFTER_EXPLANATION",
    "OBJECTION_FORCED_RERANK",
    "REFINEMENT_FELL_TO_WELCOME",
    "WINNER_CHANGED_WITHOUT_PERMISSION",
  ];
  for (const f of expected) {
    expectTrue(CRITICAL_COMPLIANCE_FLAGS.has(COMPLIANCE_FLAGS[f]), `${f} está em CRITICAL_COMPLIANCE_FLAGS`);
  }
});

// ─────────────────────────────────────────────────────────────
// GRUPO 10 — Casos reais dos problemas documentados no PATCH 6.0
// ─────────────────────────────────────────────────────────────
console.log("\n— Grupo 10: Casos reais documentados —");

test(`25: Caso real 1 — "tem certeza?" com resposta sugerindo A54
       → UNAUTHORIZED_ALTERNATIVE_AFTER_EXPLANATION`, () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "EXPLANATION_REQUEST",
    cognitiveConfidence: 0.83,
    cognitiveReasons:    ["decision_explanation_subtype:confidence_challenge"],
    hasActiveAnchor:     true,
    finalIntent:         "decision",
    contextAction:       "decision",
    routingDecision:     ANCHOR_HOLD_ROUTING,
    finalReply:          "Tenho certeza no Galaxy S24 FE. Se preferir Android mais barato, o Galaxy A54 tambem e uma boa opcao.",
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expectIncludes(
    audit.criticalFlags,
    COMPLIANCE_FLAGS.UNAUTHORIZED_ALTERNATIVE_AFTER_EXPLANATION,
    "Caso 1: alternativa não autorizada após confidence_challenge"
  );
});

test(`26: Caso real 2 — "acho caro" com resposta trocando para A53
       → OBJECTION_FORCED_RERANK`, () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "OBJECTION",
    cognitiveConfidence: 0.84,
    hasActiveAnchor:     true,
    finalIntent:         "decision",
    contextAction:       "decision",
    routingDecision:     { ...ANCHOR_HOLD_ROUTING, mode: "anchored_reaction" },
    // Resposta trocou imediatamente para A53 e Moto G62 sem autorização
    finalReply:          "Entendi, é caro mesmo. Veja o Samsung Galaxy A53 por R$1299 ou o Moto G62 por R$1199.",
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expectIncludes(
    audit.criticalFlags,
    COMPLIANCE_FLAGS.OBJECTION_FORCED_RERANK,
    "Caso 2: OBJECTION_FORCED_RERANK detectado"
  );
});

test(`27: Caso real 3 — "tem outro melhor?" caiu em welcome fallback
       → REFINEMENT_FELL_TO_WELCOME`, () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "REFINEMENT",
    cognitiveConfidence: 0.78,
    hasActiveAnchor:     true,
    finalIntent:         "refinement",
    contextAction:       "refinement",
    routingDecision:     REFINEMENT_ROUTING,
    // Resposta foi welcome/help em vez de busca por alternativa
    finalReply:          "Posso te ajudar! Me conta mais — qual é seu orçamento e o que você prioriza?",
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expectIncludes(
    audit.criticalFlags,
    COMPLIANCE_FLAGS.REFINEMENT_FELL_TO_WELCOME,
    "Caso 3: REFINEMENT_FELL_TO_WELCOME detectado"
  );
});

test(`28: Caso real 4 — "mas eu jogo" sem flags críticas
       → COMPLIANCE_OK`, () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "PRIORITY_SHIFT",
    cognitiveConfidence: 0.80,
    hasActiveAnchor:     true,
    finalIntent:         "refinement",
    contextAction:       "refinement",
    routingDecision:     REFINEMENT_ROUTING,
    finalReply:          "Para jogos, o POCO X6 Pro tem Snapdragon 8s Gen 3 e é melhor que o Galaxy S24 FE nesse quesito.",
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expect(audit.criticalFlags.length, 0, "Caso 4: sem flags críticas para PRIORITY_SHIFT correto");
  expectTrue(audit.isCompliant, "deve ser compliant");
});

// ─────────────────────────────────────────────────────────────
// GRUPO 11 — PATCH 6.1: Confidence Challenge Response Contract
// Valida que o contrato de defesa de decisão está sendo respeitado.
// Usa a compliance audit para confirmar que confidence_challenge
// com resposta correta → COMPLIANCE_OK e com resposta violadora → flags.
// ─────────────────────────────────────────────────────────────
console.log("\n— Grupo 11: PATCH 6.1 — Confidence Challenge Response Contract —");

const CC_REASONS = ["decision_explanation_subtype:confidence_challenge"];

test(`29: "tem certeza?" — resposta de defesa correta → COMPLIANCE_OK`, () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "EXPLANATION_REQUEST",
    cognitiveConfidence: 0.83,
    cognitiveReasons:    CC_REASONS,
    hasActiveAnchor:     true,
    finalIntent:         "decision",
    contextAction:       "decision",
    routingDecision:     ANCHOR_HOLD_ROUTING,
    // Resposta defensiva: confirma, não sugere alternativa
    finalReply:          "Sim, continuo recomendando o Galaxy S24 FE. A prioridade identificada foi duração de bateria e ele entrega um dia inteiro sem recarregar, o que encaixa perfeitamente no seu perfil.",
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expectTrue(audit.isCompliant, "resposta de defesa correta deve ser compliant");
  expectIncludes(audit.flags, COMPLIANCE_FLAGS.COMPLIANCE_OK, "COMPLIANCE_OK presente");
  expectNotIncludes(audit.criticalFlags, COMPLIANCE_FLAGS.UNAUTHORIZED_ALTERNATIVE_AFTER_EXPLANATION, "sem alternativa não autorizada");
});

test(`30: "você ainda escolheria esse?" — defesa com decision memory → COMPLIANCE_OK`, () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "EXPLANATION_REQUEST",
    cognitiveConfidence: 0.83,
    cognitiveReasons:    CC_REASONS,
    hasActiveAnchor:     true,
    finalIntent:         "decision",
    contextAction:       "decision",
    routingDecision:     ANCHOR_HOLD_ROUTING,
    finalReply:          "Sim, escolheria o Galaxy S24 FE novamente. O critério principal foi desempenho equilibrado com bateria longa — e ele ainda é o mais adequado para o seu perfil de uso.",
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expectTrue(audit.isCompliant, "deve ser compliant");
  expectNotIncludes(audit.criticalFlags, COMPLIANCE_FLAGS.UNAUTHORIZED_ALTERNATIVE_AFTER_EXPLANATION, "sem alternativa");
});

test(`31: "sério?" — resposta de defesa curta e direta → COMPLIANCE_OK`, () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "EXPLANATION_REQUEST",
    cognitiveConfidence: 0.83,
    cognitiveReasons:    CC_REASONS,
    hasActiveAnchor:     true,
    finalIntent:         "decision",
    contextAction:       "decision",
    routingDecision:     ANCHOR_HOLD_ROUTING,
    finalReply:          "Sério. O Galaxy S24 FE foi escolhido porque combina bateria longa com câmera de qualidade — os dois critérios que você priorizou.",
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expectTrue(audit.isCompliant, "deve ser compliant");
});

test(`32: "você mantém essa recomendação?" — defesa com tradeoff que reforça → COMPLIANCE_OK`, () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "EXPLANATION_REQUEST",
    cognitiveConfidence: 0.83,
    cognitiveReasons:    CC_REASONS,
    hasActiveAnchor:     true,
    finalIntent:         "decision",
    contextAction:       "decision",
    routingDecision:     ANCHOR_HOLD_ROUTING,
    finalReply:          "Mantenho. O Galaxy S24 FE continua sendo a melhor escolha para o seu perfil. O único ponto de atenção é que ele não é o mais potente para jogos pesados, mas para uso cotidiano e fotos é sólido.",
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expectTrue(audit.isCompliant, "tradeoff que reforça a decisão é aceitável → compliant");
});

// ── Violações que o contrato deve detectar (testes negativos) ──

test(`33: confidence_challenge com sugestão de alternativa → UNAUTHORIZED_ALTERNATIVE (violação detectada)`, () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "EXPLANATION_REQUEST",
    cognitiveConfidence: 0.83,
    cognitiveReasons:    CC_REASONS,
    hasActiveAnchor:     true,
    finalIntent:         "decision",
    contextAction:       "decision",
    routingDecision:     ANCHOR_HOLD_ROUTING,
    // Viola o contrato: sugere alternativa espontânea
    finalReply:          "Sim, recomendo o Galaxy S24 FE. Mas se preferir, o Galaxy A54 tambem e uma boa opcao mais barata.",
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expectFalse(audit.isCompliant, "violação deve ser detectada");
  expectIncludes(
    audit.criticalFlags,
    COMPLIANCE_FLAGS.UNAUTHORIZED_ALTERNATIVE_AFTER_EXPLANATION,
    "UNAUTHORIZED_ALTERNATIVE_AFTER_EXPLANATION detectada"
  );
});

test(`34: confidence_challenge com troca de winner → WINNER_CHANGED_WITHOUT_PERMISSION`, () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "EXPLANATION_REQUEST",
    cognitiveConfidence: 0.83,
    cognitiveReasons:    CC_REASONS,
    hasActiveAnchor:     true,
    finalIntent:         "decision",
    contextAction:       "decision",
    routingDecision:     ANCHOR_HOLD_ROUTING,
    // Viola o contrato: não menciona anchor, troca para Moto
    finalReply:          "Repensando aqui, acho que o Moto G62 é mais adequado para você. Melhor custo-benefício.",
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expectFalse(audit.isCompliant, "troca de winner deve ser detectada");
  expectIncludes(
    audit.criticalFlags,
    COMPLIANCE_FLAGS.WINNER_CHANGED_WITHOUT_PERMISSION,
    "WINNER_CHANGED_WITHOUT_PERMISSION detectada"
  );
});

// ── Invariantes — outros turnos não devem regredir ──────────────

test(`35: COMPARISON não afetado pelo contrato confidence_challenge`, () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "COMPARISON",
    cognitiveConfidence: 0.80,
    hasActiveAnchor:     false,
    finalIntent:         "comparison",
    contextAction:       "comparison",
    routingDecision:     SEARCH_ROUTING,
    finalReply:          "O iPhone 13 tem melhor longevidade, o Galaxy S23 FE tem câmera superior. Depende do que você prioriza.",
  });
  expect(audit.criticalFlags.length, 0, "COMPARISON sem flags críticas");
});

test(`36: REFINEMENT não afetado pelo contrato confidence_challenge`, () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "REFINEMENT",
    cognitiveConfidence: 0.78,
    hasActiveAnchor:     true,
    finalIntent:         "refinement",
    contextAction:       "refinement",
    routingDecision:     REFINEMENT_ROUTING,
    finalReply:          "Para jogos, o POCO X6 Pro supera o Galaxy S24 FE em desempenho.",
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expectNotIncludes(
    audit.criticalFlags,
    COMPLIANCE_FLAGS.REFINEMENT_FELL_TO_WELCOME,
    "REFINEMENT com alternativa válida não regrediu"
  );
});

test(`37: OBJECTION não afetado pelo contrato confidence_challenge`, () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "OBJECTION",
    cognitiveConfidence: 0.84,
    hasActiveAnchor:     true,
    finalIntent:         "decision",
    contextAction:       "decision",
    routingDecision:     { ...ANCHOR_HOLD_ROUTING, mode: "anchored_reaction" },
    finalReply:          "Entendo. O Galaxy S24 FE tem custo alto, mas o investimento se justifica pelo tempo de suporte e câmera.",
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expectTrue(audit.isCompliant, "OBJECTION com defesa de preço correto → compliant");
});

// ─────────────────────────────────────────────────────────────
// GRUPO 12 — PATCH 6.2: Objection Response Contract
// Valida que o contrato de objeção está sendo respeitado.
// ─────────────────────────────────────────────────────────────
console.log("\n— Grupo 12: PATCH 6.2 — Objection Response Contract —");

const OBJECTION_ANCHOR_ROUTING = {
  mode: "anchored_objection_hold",
  responsePathHint: "objection_anchored",
  allowNewSearch: false,
  allowCommercialFallback: false,
  allowReplaceWinner: false,
  allowRerank: false,
  shouldPreserveAnchor: true,
};

// ── Positivos: resposta correta → COMPLIANCE_OK ─────────────

test(`38: "acho caro" — resposta de valor defensiva → COMPLIANCE_OK`, () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "OBJECTION",
    cognitiveConfidence: 0.84,
    hasActiveAnchor:     true,
    finalIntent:         "decision",
    contextAction:       "decision",
    routingDecision:     OBJECTION_ANCHOR_ROUTING,
    finalReply:          "Faz sentido achar caro. O Galaxy S24 FE está no limite do orçamento, mas a escolha veio do eixo desempenho e longevidade. Se o preço virou prioridade absoluta, posso refazer a recomendação focando em economia.",
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expectTrue(audit.isCompliant, "resposta de objection correta deve ser compliant");
  expectIncludes(audit.flags, COMPLIANCE_FLAGS.COMPLIANCE_OK, "COMPLIANCE_OK presente");
  expectNotIncludes(audit.criticalFlags, COMPLIANCE_FLAGS.OBJECTION_FORCED_RERANK, "sem forced rerank");
  expectNotIncludes(audit.criticalFlags, COMPLIANCE_FLAGS.WINNER_CHANGED_WITHOUT_PERMISSION, "sem winner change");
});

test(`39: "muito caro" — winner preservado, price discussion legítima → COMPLIANCE_OK`, () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "OBJECTION",
    cognitiveConfidence: 0.84,
    hasActiveAnchor:     true,
    finalIntent:         "decision",
    contextAction:       "decision",
    routingDecision:     OBJECTION_ANCHOR_ROUTING,
    finalReply:          "Entendo. O Galaxy S24 FE está no limite superior do seu orçamento. A recomendação faz sentido quando desempenho e bateria são prioridade — você pagaria mais agora para reduzir o risco de trocar o celular antes.",
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expectTrue(audit.isCompliant, "deve ser compliant");
  expectIncludes(audit.informativeFlags, COMPLIANCE_FLAGS.OBJECTION_WITH_PRICE_DISCUSSION, "price discussion informativa");
});

test(`40: "caro demais" — resposta honesta com oferta de recalcular → COMPLIANCE_OK`, () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "OBJECTION",
    cognitiveConfidence: 0.84,
    hasActiveAnchor:     true,
    finalIntent:         "decision",
    contextAction:       "decision",
    routingDecision:     OBJECTION_ANCHOR_ROUTING,
    finalReply:          "Concordo, o Galaxy S24 FE é caro. O motivo da escolha foi a combinação de câmera e duração da bateria. Se quiser, posso sugerir algo mais acessível — mas haverá tradeoffs nesses dois pontos.",
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expectTrue(audit.isCompliant, "oferta controlada de recalcular é aceitável → compliant");
});

test(`41: "parece caro" — explicação de valor sem alternativa espontânea → COMPLIANCE_OK`, () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "OBJECTION",
    cognitiveConfidence: 0.84,
    hasActiveAnchor:     true,
    finalIntent:         "decision",
    contextAction:       "decision",
    routingDecision:     OBJECTION_ANCHOR_ROUTING,
    finalReply:          "O Galaxy S24 FE realmente não é barato. Mas a recomendação veio da necessidade de bateria longa — e ele é consistente nesse quesito. Você pagaria pelo conforto de não se preocupar com carregador.",
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expectTrue(audit.isCompliant, "deve ser compliant");
});

// ── Violações que o contrato deve detectar ──────────────────

test(`42: "acho caro" → lista A53 e Moto G62 espontaneamente → OBJECTION_FORCED_RERANK`, () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "OBJECTION",
    cognitiveConfidence: 0.84,
    hasActiveAnchor:     true,
    finalIntent:         "decision",
    contextAction:       "decision",
    routingDecision:     OBJECTION_ANCHOR_ROUTING,
    // Viola o contrato: troca o produto sem autorização
    finalReply:          "Vamos buscar opcoes mais em conta. O Samsung Galaxy A53 custa R$1299. O Moto G62 e outra opcao por R$1199.",
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expectFalse(audit.isCompliant, "violação deve ser detectada");
  expectIncludes(
    audit.criticalFlags,
    COMPLIANCE_FLAGS.OBJECTION_FORCED_RERANK,
    "OBJECTION_FORCED_RERANK detectado para resposta que lista concorrentes"
  );
});

test(`43: "muito caro" → troca winner diretamente → WINNER_CHANGED_WITHOUT_PERMISSION`, () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "OBJECTION",
    cognitiveConfidence: 0.84,
    hasActiveAnchor:     true,
    finalIntent:         "decision",
    contextAction:       "decision",
    routingDecision:     OBJECTION_ANCHOR_ROUTING,
    // Resposta ignora o anchor e menciona só Moto
    finalReply:          "Para seu orçamento, o Motorola Moto G62 e a melhor escolha. Custa R$1199.",
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expectFalse(audit.isCompliant, "winner change deve ser detectada");
  expectIncludes(
    audit.criticalFlags,
    COMPLIANCE_FLAGS.WINNER_CHANGED_WITHOUT_PERMISSION,
    "WINNER_CHANGED_WITHOUT_PERMISSION detectado"
  );
});

// ── Invariantes — outros turnos não regridem ────────────────

test(`44: confidence_challenge não afetado pelo contrato OBJECTION`, () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "EXPLANATION_REQUEST",
    cognitiveConfidence: 0.83,
    cognitiveReasons:    CC_REASONS,
    hasActiveAnchor:     true,
    finalIntent:         "decision",
    contextAction:       "decision",
    routingDecision:     ANCHOR_HOLD_ROUTING,
    finalReply:          "Sim, mantenho. O Galaxy S24 FE foi escolhido pela bateria e câmera.",
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expectTrue(audit.isCompliant, "confidence_challenge correto continua compliant");
});

test(`45: REFINEMENT com rerank autorizado não é afetado`, () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "REFINEMENT",
    cognitiveConfidence: 0.78,
    hasActiveAnchor:     true,
    finalIntent:         "refinement",
    contextAction:       "refinement",
    routingDecision:     REFINEMENT_ROUTING,
    finalReply:          "Para jogos, o POCO X6 Pro supera o Galaxy S24 FE no Genshin.",
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expectNotIncludes(audit.criticalFlags, COMPLIANCE_FLAGS.OBJECTION_FORCED_RERANK, "REFINEMENT não aciona OBJECTION_FORCED_RERANK");
});

test(`46: NEW_SEARCH sem anchor não afetado pelo contrato OBJECTION`, () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "NEW_SEARCH",
    cognitiveConfidence: 0.85,
    hasActiveAnchor:     false,
    finalIntent:         "search",
    contextAction:       "search",
    routingDecision:     SEARCH_ROUTING,
    finalReply:          "Aqui estão os melhores celulares até R$2000: Galaxy A54, Moto G62, Redmi Note 13.",
  });
  expect(audit.criticalFlags.length, 0, "NEW_SEARCH sem anchor não tem flags críticas");
});

test(`47: PRIORITY_SHIFT não afetado pelo contrato OBJECTION`, () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "PRIORITY_SHIFT",
    cognitiveConfidence: 0.80,
    hasActiveAnchor:     true,
    finalIntent:         "refinement",
    contextAction:       "refinement",
    routingDecision:     REFINEMENT_ROUTING,
    finalReply:          "Para jogos, o POCO X6 Pro tem Snapdragon 8s Gen 3. Melhor que o Galaxy S24 FE nesse quesito.",
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expect(audit.criticalFlags.length, 0, "PRIORITY_SHIFT com rerank autorizado sem flags críticas");
});

// ─────────────────────────────────────────────────────────────
// GRUPO 13 — PATCH 6.3: Refinement Follow-Up Response Contract
// Valida que REFINEMENT com âncora não cai em welcome/fallback.
// ─────────────────────────────────────────────────────────────
console.log("\n— Grupo 13: PATCH 6.3 — Refinement Follow-Up Response Contract —");

const REFINEMENT_ANCHOR_ROUTING = {
  mode: "anchored_objection_hold",
  allowNewSearch: false,
  allowCommercialFallback: false,
  allowReplaceWinner: false,
  allowRerank: false,
  shouldPreserveAnchor: true,
};

// ── Positivos: resposta contextual correta → COMPLIANCE_OK ────

test(`48: "tem outro melhor?" — resposta usa anchor como referência → COMPLIANCE_OK`, () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "REFINEMENT",
    cognitiveConfidence: 0.80,
    hasActiveAnchor:     true,
    finalIntent:         "refinement",
    contextAction:       "refinement",
    routingDecision:     REFINEMENT_ANCHOR_ROUTING,
    finalReply:          `Pode ter, mas depende do que você quer melhorar em relação ao ${ANCHOR_PRODUCT}. Se for custo-benefício, compararia com uma alternativa Android próxima. Se for preço, posso recalcular focando em economia. Mas não trocaria sem saber qual critério pesa mais.`,
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expectTrue(audit.isCompliant, "resposta contextual de refinement deve ser compliant");
  expectIncludes(audit.flags, COMPLIANCE_FLAGS.COMPLIANCE_OK, "COMPLIANCE_OK presente");
  expectNotIncludes(audit.criticalFlags, COMPLIANCE_FLAGS.REFINEMENT_FELL_TO_WELCOME, "sem welcome fallback");
  expectNotIncludes(audit.criticalFlags, COMPLIANCE_FLAGS.WINNER_CHANGED_WITHOUT_PERMISSION, "sem winner change");
});

test(`49: "tem algo melhor?" — resposta com caminhos contextuais → COMPLIANCE_OK`, () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "REFINEMENT",
    cognitiveConfidence: 0.80,
    hasActiveAnchor:     true,
    finalIntent:         "refinement",
    contextAction:       "refinement",
    routingDecision:     REFINEMENT_ANCHOR_ROUTING,
    finalReply:          `O ${ANCHOR_PRODUCT} ainda é a referência atual. Melhor em que sentido? Se quiser mais desempenho, analisaria alternativas no mesmo patamar. Se quiser gastar menos, aí muda o critério e posso recalcular.`,
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expectTrue(audit.isCompliant, "deve ser compliant");
  expectNotIncludes(audit.criticalFlags, COMPLIANCE_FLAGS.REFINEMENT_FELL_TO_WELCOME, "sem welcome");
});

test(`50: "tem outro mais barato?" — resposta preserva anchor e oferece caminho → COMPLIANCE_OK`, () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "REFINEMENT",
    cognitiveConfidence: 0.80,
    hasActiveAnchor:     true,
    finalIntent:         "refinement",
    contextAction:       "refinement",
    routingDecision:     REFINEMENT_ANCHOR_ROUTING,
    finalReply:          `Sim, existem opções mais baratas. Mas haverá tradeoffs em relação ao ${ANCHOR_PRODUCT}. Me confirma se preço passou a ser o critério principal — assim posso recalcular com foco em economia.`,
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expectTrue(audit.isCompliant, "deve ser compliant");
});

test(`51: "quero outra opção" — resposta contextual sem welcome → COMPLIANCE_OK`, () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "REFINEMENT",
    cognitiveConfidence: 0.80,
    hasActiveAnchor:     true,
    finalIntent:         "refinement",
    contextAction:       "refinement",
    routingDecision:     REFINEMENT_ANCHOR_ROUTING,
    finalReply:          `Entendo. O ${ANCHOR_PRODUCT} ainda está como referência. O que você quer melhorar — preço, desempenho, câmera ou bateria? Com isso eu indico a direção certa.`,
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expectTrue(audit.isCompliant, "deve ser compliant");
  expectNotIncludes(audit.criticalFlags, COMPLIANCE_FLAGS.REFINEMENT_FELL_TO_WELCOME, "sem welcome");
});

test(`52: "me mostra uma alternativa" — resposta contextual controlada → COMPLIANCE_OK`, () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "REFINEMENT",
    cognitiveConfidence: 0.80,
    hasActiveAnchor:     true,
    finalIntent:         "refinement",
    contextAction:       "refinement",
    routingDecision:     REFINEMENT_ANCHOR_ROUTING,
    finalReply:          `Para comparar melhor, preciso saber em que critério você quer melhorar em relação ao ${ANCHOR_PRODUCT}. Assim posso indicar algo mais preciso em vez de listar opções aleatórias.`,
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expectTrue(audit.isCompliant, "deve ser compliant");
});

// ── Violações que devem continuar detectáveis ─────────────────

test(`53: Refinement caindo em "Posso te ajudar com compras..." → REFINEMENT_FELL_TO_WELCOME`, () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "REFINEMENT",
    cognitiveConfidence: 0.80,
    hasActiveAnchor:     true,
    finalIntent:         "refinement",
    contextAction:       "refinement",
    routingDecision:     REFINEMENT_ANCHOR_ROUTING,
    finalReply:          "Posso te ajudar com compras, comparacao de produtos e decisao de custo-beneficio. Me fala o produto que voce quer analisar ou buscar.",
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expectFalse(audit.isCompliant, "violação deve ser detectada");
  expectIncludes(
    audit.criticalFlags,
    COMPLIANCE_FLAGS.REFINEMENT_FELL_TO_WELCOME,
    "REFINEMENT_FELL_TO_WELCOME detectado para welcome response"
  );
});

test(`54: Refinement trocando winner automaticamente → WINNER_CHANGED_WITHOUT_PERMISSION`, () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "REFINEMENT",
    cognitiveConfidence: 0.80,
    hasActiveAnchor:     true,
    finalIntent:         "refinement",
    contextAction:       "refinement",
    routingDecision:     REFINEMENT_ANCHOR_ROUTING,
    // Resposta ignora o anchor e substitui por Motorola
    finalReply:          "A melhor opcao agora e o Motorola Moto G62. Ele tem bateria maior e custa menos.",
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expectFalse(audit.isCompliant, "winner change deve ser detectada");
  expectIncludes(
    audit.criticalFlags,
    COMPLIANCE_FLAGS.WINNER_CHANGED_WITHOUT_PERMISSION,
    "WINNER_CHANGED_WITHOUT_PERMISSION detectado"
  );
});

test(`55: Refinement sem anchor (new_search legítimo) → sem REFINEMENT_FELL_TO_WELCOME`, () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "NEW_SEARCH",
    cognitiveConfidence: 0.85,
    hasActiveAnchor:     false,
    finalIntent:         "search",
    contextAction:       "search",
    routingDecision:     SEARCH_ROUTING,
    finalReply:          "Posso te ajudar com compras. Me fala o produto que voce quer analisar.",
  });
  expectNotIncludes(audit.criticalFlags, COMPLIANCE_FLAGS.REFINEMENT_FELL_TO_WELCOME, "NEW_SEARCH sem anchor não aciona REFINEMENT_FELL_TO_WELCOME");
});

// ── Invariantes — outros contratos não regridem ───────────────

test(`56: confidence_challenge não afetado pelo contrato REFINEMENT`, () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "EXPLANATION_REQUEST",
    cognitiveConfidence: 0.83,
    cognitiveReasons:    CC_REASONS,
    hasActiveAnchor:     true,
    finalIntent:         "decision",
    contextAction:       "decision",
    routingDecision:     ANCHOR_HOLD_ROUTING,
    finalReply:          `Mantenho. O ${ANCHOR_PRODUCT} foi escolhido pela câmera e bateria.`,
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expectTrue(audit.isCompliant, "confidence_challenge correto continua compliant");
});

test(`57: objection não afetado pelo contrato REFINEMENT`, () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "OBJECTION",
    cognitiveConfidence: 0.84,
    hasActiveAnchor:     true,
    finalIntent:         "decision",
    contextAction:       "decision",
    routingDecision:     OBJECTION_ANCHOR_ROUTING,
    finalReply:          `Faz sentido achar caro. O ${ANCHOR_PRODUCT} está no limite do orçamento. Se preço virou prioridade, posso recalcular.`,
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expectTrue(audit.isCompliant, "objection correto continua compliant");
  expectNotIncludes(audit.criticalFlags, COMPLIANCE_FLAGS.REFINEMENT_FELL_TO_WELCOME, "objection não aciona REFINEMENT_FELL_TO_WELCOME");
});

test(`58: priority_shift sem anchor não afetado`, () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "PRIORITY_SHIFT",
    cognitiveConfidence: 0.80,
    hasActiveAnchor:     false,
    finalIntent:         "search",
    contextAction:       "search",
    routingDecision:     SEARCH_ROUTING,
    finalReply:          "Para jogos, o POCO X6 Pro tem Snapdragon 8s Gen 3.",
  });
  expect(audit.criticalFlags.length, 0, "PRIORITY_SHIFT sem anchor sem flags críticas");
});

test(`59: COMPARISON explícita com rerank autorizado não é afetada`, () => {
  const audit = buildRouterResponseComplianceAudit({
    cognitiveTurnType:   "COMPARISON",
    cognitiveConfidence: 0.85,
    hasActiveAnchor:     true,
    finalIntent:         "comparison",
    contextAction:       "comparison",
    routingDecision:     REFINEMENT_ROUTING,
    finalReply:          `O ${ANCHOR_PRODUCT} tem câmera superior. O Motorola Moto G62 tem bateria maior. Depende da prioridade.`,
    winnerNameAnchor:    ANCHOR_PRODUCT,
  });
  expectNotIncludes(audit.criticalFlags, COMPLIANCE_FLAGS.REFINEMENT_FELL_TO_WELCOME, "COMPARISON não aciona REFINEMENT_FELL_TO_WELCOME");
});

// ─────────────────────────────────────────────────────────────
// Sumário final
// ─────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(58)}`);
console.log("PATCH 6.0 / 6.1 / 6.2 / 6.3 — Router-to-Response Compliance Audit");
console.log(`Resultado: ${passed} passed, ${failed} failed`);

if (failures.length > 0) {
  console.log("\nFalhas:");
  for (const f of failures) {
    console.log(`  ✗ ${f.label}`);
    console.log(`    ${f.error}`);
  }
  process.exit(1);
} else {
  console.log("Todos os testes passaram. Compliance audit validado.");
  process.exit(0);
}
