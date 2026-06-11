/**
 * test-mia-decision-explanation-coverage-audit.js
 *
 * PATCH 5.4A — Decision Explanation Coverage Audit Tests
 * Atualizado em PATCH 5.4B para refletir cobertura morfológica expandida.
 *
 * Valida o módulo de auditoria de cobertura.
 * SOMENTE diagnóstico — nenhum comportamento é alterado.
 *
 * Grupos:
 *   A — Conjugação verbal: A1/A2/A5 agora ALREADY_COVERED; A3/A4 ainda são gaps
 *   B — Morfológico: B1/B2 agora ALREADY_COVERED
 *   C — Sintático: C1/C2 agora ALREADY_COVERED
 *   D — Já cobertos (ALREADY_COVERED)
 *   E — Sem intenção semântica (NO_SEMANTIC_INTENT)
 *   F — Guard bloqueou (GUARD_BLOCKED)
 *   G — Sem âncora (NO_ACTIVE_ANCHOR)
 */

import {
  buildDecisionExplanationCoverageAudit,
  COVERAGE_GAP_CATEGORIES,
} from "../lib/miaDecisionExplanationCoverageAudit.js";

// ─────────────────────────────────────────────────────────────
// Framework de testes mínimo
// ─────────────────────────────────────────────────────────────

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

function auditFor(query, hasAnchor = true) {
  return buildDecisionExplanationCoverageAudit({ query, hasAnchor });
}

function gapFor(audit, cluster) {
  return audit.gaps.find((g) => g.cluster === cluster);
}

// ─────────────────────────────────────────────────────────────
// Grupo A — VERB_CONJUGATION_GAP
// ─────────────────────────────────────────────────────────────

console.log("\n── Grupo A: Lacunas de conjugação verbal ───────────────\n");

// A1 — Caso central: "o que eu perderia escolhendo ele?"
// PATCH 5.4B: "perderia" agora coberto por raiz perd- → ALREADY_COVERED
{
  const audit = auditFor("o que eu perderia escolhendo ele?");
  const gap = gapFor(audit, "loss");

  assert("A1: likelyCoverageGap = false (agora coberto)", audit.likelyCoverageGap === false, `got ${audit.likelyCoverageGap}`);
  assert(
    "A1: gap category = ALREADY_COVERED",
    gap?.gapCategory === COVERAGE_GAP_CATEGORIES.ALREADY_COVERED,
    `got ${gap?.gapCategory}`
  );
  assert("A1: cluster 'loss' disparou (perd_stem_any_form)", gap?.clusterMatched === true);
  assert("A1: sonda de perda ativa", audit.semanticProbes.loss.active === true);
  assert("A1: sonda detectou 'perd_stem_any_form'", audit.semanticProbes.loss.detectedSignals.includes("perd_stem_any_form"));
  assert("A1: guard NÃO bloqueou", !audit.guardBlocked);
}

// A2 — "o que eu ganharia com essa escolha?" (condicional de ganhar)
// PATCH 5.4B: "ganharia" agora coberto por raiz ganh- → ALREADY_COVERED
{
  const audit = auditFor("o que eu ganharia com essa escolha?");
  const gap = gapFor(audit, "benefit");

  assert("A2: 'ganharia' → ALREADY_COVERED (raiz ganh-)", gap?.gapCategory === COVERAGE_GAP_CATEGORIES.ALREADY_COVERED, `got ${gap?.gapCategory}`);
  assert("A2: cluster benefit disparou", gap?.clusterMatched === true);
  assert("A2: sonda benefit ativa", audit.semanticProbes.benefit.active === true);
  assert("A2: detectou 'ganh_stem_any_form'", audit.semanticProbes.benefit.detectedSignals.includes("ganh_stem_any_form"));
  assert("A2: likelyCoverageGap = false", audit.likelyCoverageGap === false);
}

// A3 — "o que vou perder escolhendo esse?"  (futuro com auxiliar)
{
  const audit = auditFor("o que vou perder escolhendo esse?");
  const gap = gapFor(audit, "loss");

  assert(
    "A3: 'vou perder' → VERB_CONJUGATION_GAP ou sonda ativa",
    audit.semanticProbes.loss.active === true,
    `sonda loss: ${JSON.stringify(audit.semanticProbes.loss)}`
  );
  assert("A3: likelyCoverageGap = true", audit.likelyCoverageGap === true);
}

// A4 — "o que eu iria ganhar?"  (futuro perifrástico)
{
  const audit = auditFor("o que eu iria ganhar com esse produto?");
  assert("A4: 'iria ganhar' → sonda benefit ativa", audit.semanticProbes.benefit.active === true);
  assert("A4: likelyCoverageGap = true", audit.likelyCoverageGap === true);
}

// A5 — "o que eu perderia de câmera?" (forma condicional explícita)
// PATCH 5.4B: "perderia" agora coberto por raiz perd- → ALREADY_COVERED
{
  const audit = auditFor("o que eu perderia de câmera escolhendo esse celular?");
  const gap = gapFor(audit, "loss");
  assert("A5: 'perderia' condicional → ALREADY_COVERED", gap?.gapCategory === COVERAGE_GAP_CATEGORIES.ALREADY_COVERED, `got ${gap?.gapCategory}`);
  assert("A5: cluster loss disparou", gap?.clusterMatched === true);
  assert("A5: likelyCoverageGap = false", audit.likelyCoverageGap === false);
}

// ─────────────────────────────────────────────────────────────
// Grupo B — MORPHOLOGICAL_VARIATION
// ─────────────────────────────────────────────────────────────

console.log("\n── Grupo B: Lacunas morfológicas (plural) ──────────────\n");

// B1 — "quais são as consequências práticas?" (plural)
// PATCH 5.4B: "consequencias" (plural) agora coberto → ALREADY_COVERED
{
  const audit = auditFor("quais são as consequências práticas dessa escolha?");
  assert("B1: sonda consequence ativa", audit.semanticProbes.consequence.active === true);
  // Cluster 4 agora inclui "consequencias" (plural normalizado)
  assert("B1: cluster consequence disparou", audit.clusterMirrors.consequence.length > 0, `mirrors: ${JSON.stringify(audit.clusterMirrors.consequence)}`);
  const gap = gapFor(audit, "consequence");
  assert(
    "B1: gapCategory = ALREADY_COVERED",
    gap?.gapCategory === COVERAGE_GAP_CATEGORIES.ALREADY_COVERED,
    `got ${gap?.gapCategory}`
  );
  assert("B1: likelyCoverageGap = false", audit.likelyCoverageGap === false);
}

// B2 — "quais são os benefícios?" (plural)
// PATCH 5.4B: "beneficios" (plural normalizado) agora coberto → ALREADY_COVERED
{
  const audit = auditFor("quais são os benefícios desse produto?");
  assert("B2: sonda benefit ativa", audit.semanticProbes.benefit.active === true);
  // Cluster 5 agora inclui formas plurais de benefício/vantagem
  assert("B2: cluster benefit disparou", audit.clusterMirrors.benefit.length > 0, `mirrors: ${JSON.stringify(audit.clusterMirrors.benefit)}`);
  assert("B2: likelyCoverageGap = false", audit.likelyCoverageGap === false);
}

// ─────────────────────────────────────────────────────────────
// Grupo C — SYNTACTIC_VARIATION
// ─────────────────────────────────────────────────────────────

console.log("\n── Grupo C: Lacunas sintáticas ─────────────────────────\n");

// C1 — "qual seria o impacto disso?" (tem "seria" entre "qual" e "o impacto")
// PATCH 5.4B: "impacto" standalone agora coberto → ALREADY_COVERED
{
  const audit = auditFor("qual seria o impacto disso?");
  assert("C1: sonda consequence ativa (impacto)", audit.semanticProbes.consequence.active === true);
  // Cluster 4 agora tem \bimpacto\b standalone
  assert("C1: cluster consequence disparou (impacto_standalone)", audit.clusterMirrors.consequence.length > 0, `mirrors: ${JSON.stringify(audit.clusterMirrors.consequence)}`);
  assert("C1: likelyCoverageGap = false", audit.likelyCoverageGap === false);
  const gap = gapFor(audit, "consequence");
  assert(
    "C1: gapCategory = ALREADY_COVERED",
    gap?.gapCategory === COVERAGE_GAP_CATEGORIES.ALREADY_COVERED,
    `got ${gap?.gapCategory}`
  );
}

// C2 — "qual seria a vantagem concreta?" (tem "seria" entre "qual" e "a vantagem")
// PATCH 5.4B: modal "seria" agora aceito no padrão → ALREADY_COVERED
{
  const audit = auditFor("qual seria a vantagem concreta desse produto?");
  assert("C2: sonda benefit ativa", audit.semanticProbes.benefit.active === true);
  // Cluster 5 agora inclui "seria a|seria o|seria" no grupo opcional
  assert("C2: cluster benefit disparou (seria + vantagem)", audit.clusterMirrors.benefit.length > 0, `mirrors: ${JSON.stringify(audit.clusterMirrors.benefit)}`);
  assert("C2: likelyCoverageGap = false", audit.likelyCoverageGap === false);
}

// ─────────────────────────────────────────────────────────────
// Grupo D — ALREADY_COVERED (não há lacuna)
// ─────────────────────────────────────────────────────────────

console.log("\n── Grupo D: Já cobertos corretamente ───────────────────\n");

// D1 — "o que eu perco?" (já coberto por cluster 6)
{
  const audit = auditFor("o que eu perco escolhendo esse?");
  const gap = gapFor(audit, "loss");
  assert("D1: 'perco' → ALREADY_COVERED no cluster loss", gap?.gapCategory === COVERAGE_GAP_CATEGORIES.ALREADY_COVERED, `got ${gap?.gapCategory}`);
  assert("D1: likelyCoverageGap = false", audit.likelyCoverageGap === false);
}

// D2 — "na prática, o que muda?" (já coberto por cluster 4)
{
  const audit = auditFor("na prática, o que muda pra mim?");
  const gap = gapFor(audit, "consequence");
  assert("D2: 'na prática' → ALREADY_COVERED", gap?.gapCategory === COVERAGE_GAP_CATEGORIES.ALREADY_COVERED, `got ${gap?.gapCategory}`);
  assert("D2: likelyCoverageGap = false", audit.likelyCoverageGap === false);
}

// D3 — "qual a vantagem?" (já coberto por cluster 5)
{
  const audit = auditFor("qual a vantagem dele?");
  const gap = gapFor(audit, "benefit");
  assert("D3: 'vantagem' → ALREADY_COVERED", gap?.gapCategory === COVERAGE_GAP_CATEGORIES.ALREADY_COVERED, `got ${gap?.gapCategory}`);
  assert("D3: likelyCoverageGap = false", audit.likelyCoverageGap === false);
}

// D4 — "o que eu ganho?" (já coberto)
{
  const audit = auditFor("o que eu ganho com essa escolha?");
  const gap = gapFor(audit, "benefit");
  assert("D4: 'ganho' → ALREADY_COVERED", gap?.gapCategory === COVERAGE_GAP_CATEGORIES.ALREADY_COVERED, `got ${gap?.gapCategory}`);
}

// D5 — "abro mão de quê?" (já coberto)
{
  const audit = auditFor("o que eu abro mão escolhendo esse?");
  const gap = gapFor(audit, "loss");
  assert("D5: 'abro mão' → ALREADY_COVERED", gap?.gapCategory === COVERAGE_GAP_CATEGORIES.ALREADY_COVERED, `got ${gap?.gapCategory}`);
}

// ─────────────────────────────────────────────────────────────
// Grupo E — NO_SEMANTIC_INTENT
// ─────────────────────────────────────────────────────────────

console.log("\n── Grupo E: Sem intenção semântica pós-decisão ─────────\n");

// E1 — Pergunta sobre preço (não é pós-decisão)
{
  const audit = auditFor("quanto custa esse produto?");
  const gapLoss = gapFor(audit, "loss");
  const gapBenefit = gapFor(audit, "benefit");
  const gapConsequence = gapFor(audit, "consequence");
  assert("E1: sem intenção de perda", !audit.semanticProbes.loss.active);
  assert("E1: sem intenção de ganho", !audit.semanticProbes.benefit.active);
  assert("E1: gapCategory = NO_SEMANTIC_INTENT para loss", gapLoss?.gapCategory === COVERAGE_GAP_CATEGORIES.NO_SEMANTIC_INTENT);
  assert("E1: likelyCoverageGap = false (sem intenção)", audit.likelyCoverageGap === false);
}

// ─────────────────────────────────────────────────────────────
// Grupo F — GUARD_BLOCKED
// ─────────────────────────────────────────────────────────────

console.log("\n── Grupo F: Guard bloqueou ──────────────────────────────\n");

// F1 — "tem algo mais barato onde eu ganho?" — guard bloqueia
{
  const audit = auditFor("tem algo mais barato onde eu ganho em bateria?");
  assert("F1: guardBlocked = true", audit.guardBlocked === true);
  const gap = gapFor(audit, "benefit");
  assert("F1: gap = GUARD_BLOCKED para todos clusters", gap?.gapCategory === COVERAGE_GAP_CATEGORIES.GUARD_BLOCKED);
  assert("F1: failedGuards não vazio", audit.failedGuards.length > 0);
}

// ─────────────────────────────────────────────────────────────
// Grupo G — NO_ACTIVE_ANCHOR
// ─────────────────────────────────────────────────────────────

console.log("\n── Grupo G: Sem âncora ──────────────────────────────────\n");

// G1 — "o que eu perderia" sem âncora
{
  const audit = auditFor("o que eu perderia escolhendo esse?", false);
  assert("G1: sem âncora → nenhum cluster ativo", audit.clusterMirrors.consequence.length === 0);
  assert("G1: missingSignals inclui active_anchor_required", audit.missingSignals.includes("active_anchor_required"));
  assert("G1: likelyCoverageGap = false (sem âncora)", audit.likelyCoverageGap === false);
}

// ─────────────────────────────────────────────────────────────
// Grupo H — PATCH 5.5A: decision_defense coverage (ALREADY_COVERED)
// ─────────────────────────────────────────────────────────────

console.log("\n── Grupo H: PATCH 5.5A — Defesa da decisão ─────────────\n");

// H1 — "ainda vale a pena" → cluster defense dispara (ALREADY_COVERED)
{
  const audit = buildDecisionExplanationCoverageAudit({
    query: "ainda vale a pena essa escolha?",
    hasAnchor: true,
    actualTurnType: "EXPLANATION_REQUEST",
    decisionExplanation: { active: true, subtype: "decision_defense" },
  });
  const gapDefense = gapFor(audit, "defense");
  assert("H1: defense cluster fired", audit.clusterMirrors.defense.length > 0);
  assert("H1: gap = ALREADY_COVERED para defense", gapDefense?.gapCategory === COVERAGE_GAP_CATEGORIES.ALREADY_COVERED);
  assert("H1: likelyCoverageGap = false", audit.likelyCoverageGap === false);
}

// H2 — "por que ainda vale a pena" → defense cluster dispara
{
  const audit = buildDecisionExplanationCoverageAudit({
    query: "por que ainda vale a pena?",
    hasAnchor: true,
    actualTurnType: "EXPLANATION_REQUEST",
    decisionExplanation: { active: true, subtype: "decision_defense" },
  });
  const gapDefense = gapFor(audit, "defense");
  assert("H2: defense cluster fired", audit.clusterMirrors.defense.length > 0);
  assert("H2: gap = ALREADY_COVERED para defense", gapDefense?.gapCategory === COVERAGE_GAP_CATEGORIES.ALREADY_COVERED);
}

// H3 — "continua valendo?" → defense cluster dispara
{
  const audit = buildDecisionExplanationCoverageAudit({
    query: "continua valendo a recomendação?",
    hasAnchor: true,
    actualTurnType: "EXPLANATION_REQUEST",
  });
  const gapDefense = gapFor(audit, "defense");
  assert("H3: defense cluster fired para 'continua valendo'", audit.clusterMirrors.defense.length > 0);
  assert("H3: gap = ALREADY_COVERED", gapDefense?.gapCategory === COVERAGE_GAP_CATEGORIES.ALREADY_COVERED);
}

// H4 — VALUE_QUESTION com defense signals → misclassificação detectada
{
  const audit = buildDecisionExplanationCoverageAudit({
    query: "ainda vale a pena essa escolha?",
    hasAnchor: true,
    actualTurnType: "VALUE_QUESTION",
    decisionExplanation: { active: false, subtype: null },
  });
  assert("H4: valueQuestionMisclassified = true quando VALUE_QUESTION + defense signals", audit.valueQuestionMisclassified === true);
  assert("H4: suggestedFix menciona PATCH_5.5A_DEFENSE", audit.suggestedFix.includes("5.5A"));
}

// H5 — defense probe ativa para "por que ainda vale"
{
  const audit = buildDecisionExplanationCoverageAudit({
    query: "por que ainda vale a pena?",
    hasAnchor: true,
  });
  assert("H5: semanticProbes.defense ativa", audit.semanticProbes.defense.active === true);
  assert("H5: defense probe tem sinais", audit.semanticProbes.defense.detectedSignals.length > 0);
}

// H6 — query sem nenhuma intenção de defense → defense probe inativa
{
  const audit = buildDecisionExplanationCoverageAudit({
    query: "qual a bateria desse celular?",
    hasAnchor: true,
  });
  assert("H6: defense probe inativa para query sem defense signals", audit.semanticProbes.defense.active === false);
}

// H7 — valueQuestionMisclassified = false quando EXPLANATION_REQUEST
{
  const audit = buildDecisionExplanationCoverageAudit({
    query: "ainda vale a pena essa escolha?",
    hasAnchor: true,
    actualTurnType: "EXPLANATION_REQUEST",
    decisionExplanation: { active: true, subtype: "decision_defense" },
  });
  assert("H7: valueQuestionMisclassified = false quando corretamente classificado", audit.valueQuestionMisclassified === false);
}

// ─────────────────────────────────────────────────────────────
// Invariantes do módulo
// ─────────────────────────────────────────────────────────────

console.log("\n── Invariantes ──────────────────────────────────────────\n");

{
  const audit = buildDecisionExplanationCoverageAudit({});
  assert("INV1: input vazio → retorna objeto válido", typeof audit === "object" && audit !== null);
  assert("INV2: auditVersion = '5.5D'", audit.auditVersion === "5.5D");
  assert("INV3: gaps sempre array", Array.isArray(audit.gaps));
  assert("INV4: likelyCoverageGap sempre boolean", typeof audit.likelyCoverageGap === "boolean");
  assert("INV5: missingSignals sempre array", Array.isArray(audit.missingSignals));
  assert("INV6: failedGuards sempre array", Array.isArray(audit.failedGuards));
}

{
  const audit = buildDecisionExplanationCoverageAudit({ query: "o que eu perderia?", hasAnchor: true });
  assert("INV7: normalizedQuery presente", typeof audit.normalizedQuery === "string");
  assert("INV8: semanticProbes.loss sempre presente", typeof audit.semanticProbes?.loss === "object");
  assert("INV9: semanticProbes.benefit sempre presente", typeof audit.semanticProbes?.benefit === "object");
  assert("INV10: semanticProbes.consequence sempre presente", typeof audit.semanticProbes?.consequence === "object");
  assert("INV10b: semanticProbes.defense sempre presente (PATCH 5.5A)", typeof audit.semanticProbes?.defense === "object");
  assert("INV10c: semanticProbes.confidence_challenge sempre presente (PATCH 5.5B)", typeof audit.semanticProbes?.confidence_challenge === "object");
  assert("INV11: clusterMirrors.loss sempre presente", Array.isArray(audit.clusterMirrors?.loss));
  assert("INV11b: clusterMirrors.defense sempre presente (PATCH 5.5A)", Array.isArray(audit.clusterMirrors?.defense));
  assert("INV11c: clusterMirrors.confidence_challenge sempre presente (PATCH 5.5B)", Array.isArray(audit.clusterMirrors?.confidence_challenge));
  assert("INV12: gaps tem 5 entradas (consequence, benefit, loss, defense, confidence_challenge)", audit.gaps.length === 5);
  assert("INV13: postDecisionCategory sempre presente no retorno (PATCH 5.5C)", "postDecisionCategory" in audit);
  assert("INV14: decisionMemoryPresence sempre presente no retorno (PATCH 5.5D)", "decisionMemoryPresence" in audit);
  assert("INV15: decisionMemoryPresence.richContextAvailable é boolean (PATCH 5.5D)", typeof audit.decisionMemoryPresence?.richContextAvailable === "boolean");
}

// ─────────────────────────────────────────────────────────────
// Grupo I — PATCH 5.5B: confidence_challenge coverage
// ─────────────────────────────────────────────────────────────

console.log("\n── Grupo I: PATCH 5.5B — Desafio de confiança (audit) ───────\n");

// I1 — "ainda escolheria?" com anchor EXPLANATION_REQUEST → ALREADY_COVERED
{
  const audit = buildDecisionExplanationCoverageAudit({
    query: "você ainda escolheria esse produto?",
    hasAnchor: true,
    actualTurnType: "EXPLANATION_REQUEST",
    decisionExplanation: { active: true, subtype: "confidence_challenge" },
  });
  const gapCC = gapFor(audit, "confidence_challenge");
  assert("I1: confidence_challenge cluster fired", audit.clusterMirrors.confidence_challenge.length > 0);
  assert("I1: gap = ALREADY_COVERED para confidence_challenge", gapCC?.gapCategory === COVERAGE_GAP_CATEGORIES.ALREADY_COVERED);
  assert("I1: likelyCoverageGap = false", audit.likelyCoverageGap === false);
}

// I2 — "tem certeza que esse é o melhor?" → mirror dispara
{
  const audit = buildDecisionExplanationCoverageAudit({
    query: "tem certeza que esse é o melhor?",
    hasAnchor: true,
    actualTurnType: "EXPLANATION_REQUEST",
    decisionExplanation: { active: true, subtype: "confidence_challenge" },
  });
  assert("I2: confidence_challenge mirror dispara para 'tem certeza'", audit.clusterMirrors.confidence_challenge.length > 0);
}

// I3 — CONVERSATIONAL_MISCLASSIFIED = true quando CONVERSATIONAL + mirror dispara
{
  const audit = buildDecisionExplanationCoverageAudit({
    query: "você ainda escolheria esse produto?",
    hasAnchor: true,
    actualTurnType: "CONVERSATIONAL",
  });
  assert("I3: conversationalMisclassified = true quando CONVERSATIONAL + confidence signals", audit.conversationalMisclassified === true);
  assert("I3: suggestedFix menciona PATCH_5.5B", audit.suggestedFix.includes("PATCH_5.5B"));
}

// I4 — CONVERSATIONAL_MISCLASSIFIED via CSO trust_challenge
{
  const audit = buildDecisionExplanationCoverageAudit({
    query: "é mesmo a melhor opção?",
    hasAnchor: true,
    actualTurnType: "CONVERSATIONAL",
    cso: { conversationalIntent: "trust_challenge" },
  });
  assert("I4: conversationalMisclassified = true via CSO trust_challenge", audit.conversationalMisclassified === true);
  assert("I4: suggestedFix menciona PATCH_5.5B", audit.suggestedFix.includes("PATCH_5.5B"));
}

// I5 — semanticProbes.confidence_challenge ativa para query de desafio
{
  const audit = buildDecisionExplanationCoverageAudit({
    query: "por que não mudou sua opinião?",
    hasAnchor: true,
  });
  assert("I5: semanticProbes.confidence_challenge ativa", audit.semanticProbes.confidence_challenge.active === true);
  assert("I5: confidence_challenge probe tem sinais", audit.semanticProbes.confidence_challenge.detectedSignals.length > 0);
}

// I6 — semanticProbes.confidence_challenge inativa para query sem sinais
{
  const audit = buildDecisionExplanationCoverageAudit({
    query: "qual a bateria desse celular?",
    hasAnchor: true,
  });
  assert("I6: confidence_challenge probe inativa para query sem sinais", audit.semanticProbes.confidence_challenge.active === false);
}

// I7 — conversationalMisclassified = false quando EXPLANATION_REQUEST (não é misclassificação)
{
  const audit = buildDecisionExplanationCoverageAudit({
    query: "você ainda escolheria esse produto?",
    hasAnchor: true,
    actualTurnType: "EXPLANATION_REQUEST",
    decisionExplanation: { active: true, subtype: "confidence_challenge" },
  });
  assert("I7: conversationalMisclassified = false quando classificado corretamente", audit.conversationalMisclassified === false);
}

// ─────────────────────────────────────────────────────────────
// Grupo J — PATCH 5.5D: Decision Memory Presence por subtype
// ─────────────────────────────────────────────────────────────

console.log("\n── Grupo J: PATCH 5.5D — Presença de decision memory por subtype ──\n");

// sessionContext rico com todos os campos da decision memory
const richSessionContext = {
  lastAxis: "performance",
  lastMainConsequence: "Tarefas exigentes sem sentir o aparelho no limite",
  lastTradeoff: "Abrir mão de câmera ultra para ter desempenho consistente",
  lastDecisionReason: "performance > custo-benefício dado orçamento disponível",
  lastWinnerAdvantages: ["A17 Bionic", "bateria", "ecossistema Apple"],
  lastWinnerSacrifices: ["zoom óptico", "preço"],
};

// J1 — benefit: session memory presente → decisionMemoryPresence reflete campos ricos
{
  const audit = buildDecisionExplanationCoverageAudit({
    query: "qual a vantagem desse produto?",
    hasAnchor: true,
    actualTurnType: "EXPLANATION_REQUEST",
    decisionExplanation: { active: true, subtype: "benefit", category: "POST_DECISION_EXPLANATION" },
    sessionContext: richSessionContext,
  });
  assert("J1: benefit + sessionContext → richContextAvailable = true", audit.decisionMemoryPresence?.richContextAvailable === true, `got ${audit.decisionMemoryPresence?.richContextAvailable}`);
  assert("J1: benefit → hasLastAxis = true", audit.decisionMemoryPresence?.hasLastAxis === true);
  assert("J1: benefit → hasLastMainConsequence = true", audit.decisionMemoryPresence?.hasLastMainConsequence === true);
  assert("J1: benefit → hasLastTradeoff = true", audit.decisionMemoryPresence?.hasLastTradeoff === true);
  assert("J1: benefit → hasLastDecisionReason = true", audit.decisionMemoryPresence?.hasLastDecisionReason === true);
  assert("J1: benefit → winnerAdvantagesCount = 3", audit.decisionMemoryPresence?.winnerAdvantagesCount === 3);
  assert("J1: benefit → winnerSacrificesCount = 2", audit.decisionMemoryPresence?.winnerSacrificesCount === 2);
}

// J2 — tradeoff: session memory presente → decisionMemoryPresence reflete campos ricos
{
  const audit = buildDecisionExplanationCoverageAudit({
    query: "qual o ponto fraco dele?",
    hasAnchor: true,
    actualTurnType: "EXPLANATION_REQUEST",
    decisionExplanation: { active: true, subtype: "tradeoff", category: "POST_DECISION_EXPLANATION" },
    sessionContext: richSessionContext,
  });
  assert("J2: tradeoff + sessionContext → richContextAvailable = true", audit.decisionMemoryPresence?.richContextAvailable === true);
  assert("J2: tradeoff → hasLastTradeoff = true", audit.decisionMemoryPresence?.hasLastTradeoff === true);
}

// J3 — consequence: session memory presente
{
  const audit = buildDecisionExplanationCoverageAudit({
    query: "o que isso muda no uso real?",
    hasAnchor: true,
    actualTurnType: "EXPLANATION_REQUEST",
    decisionExplanation: { active: true, subtype: "consequence", category: "POST_DECISION_EXPLANATION" },
    sessionContext: richSessionContext,
  });
  assert("J3: consequence + sessionContext → richContextAvailable = true", audit.decisionMemoryPresence?.richContextAvailable === true);
  assert("J3: consequence → hasLastMainConsequence = true", audit.decisionMemoryPresence?.hasLastMainConsequence === true);
}

// J4 — decision_defense: session memory presente
{
  const audit = buildDecisionExplanationCoverageAudit({
    query: "ainda vale a pena?",
    hasAnchor: true,
    actualTurnType: "EXPLANATION_REQUEST",
    decisionExplanation: { active: true, subtype: "decision_defense", category: "POST_DECISION_EXPLANATION" },
    sessionContext: richSessionContext,
  });
  assert("J4: decision_defense + sessionContext → richContextAvailable = true", audit.decisionMemoryPresence?.richContextAvailable === true);
  assert("J4: decision_defense → hasLastAxis = true", audit.decisionMemoryPresence?.hasLastAxis === true);
}

// J5 — confidence_challenge: session memory presente
{
  const audit = buildDecisionExplanationCoverageAudit({
    query: "tem certeza que esse é o melhor?",
    hasAnchor: true,
    actualTurnType: "EXPLANATION_REQUEST",
    decisionExplanation: { active: true, subtype: "confidence_challenge", category: "POST_DECISION_EXPLANATION" },
    sessionContext: richSessionContext,
  });
  assert("J5: confidence_challenge + sessionContext → richContextAvailable = true", audit.decisionMemoryPresence?.richContextAvailable === true);
  assert("J5: confidence_challenge → hasLastDecisionReason = true", audit.decisionMemoryPresence?.hasLastDecisionReason === true);
}

// J6 — sem sessionContext → decisionMemoryPresence seguro (não alauca)
{
  const audit = buildDecisionExplanationCoverageAudit({
    query: "qual a vantagem?",
    hasAnchor: true,
    actualTurnType: "EXPLANATION_REQUEST",
    decisionExplanation: { active: true, subtype: "benefit", category: "POST_DECISION_EXPLANATION" },
    // sessionContext omitido
  });
  assert("J6: sem sessionContext → richContextAvailable = false", audit.decisionMemoryPresence?.richContextAvailable === false);
  assert("J6: sem sessionContext → sessionContextProvided = false", audit.decisionMemoryPresence?.sessionContextProvided === false);
  assert("J6: sem sessionContext → winnerAdvantagesCount = 0", audit.decisionMemoryPresence?.winnerAdvantagesCount === 0);
}

// J7 — sessionContext parcial: apenas lastAxis → richContextAvailable = false
{
  const audit = buildDecisionExplanationCoverageAudit({
    query: "qual a vantagem?",
    hasAnchor: true,
    sessionContext: { lastAxis: "performance" },
  });
  assert("J7: sessionContext parcial → richContextAvailable = false (falta consequence + tradeoff)", audit.decisionMemoryPresence?.richContextAvailable === false);
  assert("J7: sessionContext parcial → hasLastAxis = true", audit.decisionMemoryPresence?.hasLastAxis === true);
  assert("J7: sessionContext parcial → hasLastMainConsequence = false", audit.decisionMemoryPresence?.hasLastMainConsequence === false);
}

// J8 — todos os subtypes pós-decisão expõem decisionMemoryPresence igualmente
// (verifica que a estrutura é homogênea — invariante de igualdade de tratamento)
{
  const subtypes = ["benefit", "tradeoff", "consequence", "decision_defense", "confidence_challenge"];
  const queries = [
    "qual a vantagem?",
    "qual o ponto fraco?",
    "o que muda no uso real?",
    "ainda vale a pena?",
    "tem certeza?",
  ];
  for (let i = 0; i < subtypes.length; i++) {
    const audit = buildDecisionExplanationCoverageAudit({
      query: queries[i],
      hasAnchor: true,
      actualTurnType: "EXPLANATION_REQUEST",
      decisionExplanation: { active: true, subtype: subtypes[i], category: "POST_DECISION_EXPLANATION" },
      sessionContext: richSessionContext,
    });
    assert(
      `J8/${subtypes[i]}: decisionMemoryPresence.richContextAvailable = true`,
      audit.decisionMemoryPresence?.richContextAvailable === true,
      `got ${audit.decisionMemoryPresence?.richContextAvailable}`
    );
    assert(
      `J8/${subtypes[i]}: decisionMemoryPresence é objeto`,
      typeof audit.decisionMemoryPresence === "object" && audit.decisionMemoryPresence !== null
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Resultado final
// ─────────────────────────────────────────────────────────────

const total = passed + failed;
console.log(`\n══════════════════════════════════════════════════`);
console.log(`  RESULTADO: ${passed}/${total} passaram`);
if (failures.length > 0) {
  console.log(`\n  Falhas:`);
  failures.forEach((f) => console.log(f));
}
console.log(`══════════════════════════════════════════════════\n`);

process.exit(failed > 0 ? 1 : 0);
