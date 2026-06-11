/**
 * test-mia-decision-explanation-intent.js
 *
 * PATCH 5.4 — Decision Explanation Intent Layer
 *
 * Testa a detecção de intenções pós-decisão no Cognitive Router.
 * Foco: intenção semântica, NÃO frases específicas.
 *
 * Grupos:
 *   A — Deve classificar como EXPLANATION_REQUEST + subtype correto
 *   B — NÃO deve classificar como pós-decisão (refinamento, alternativa, etc.)
 *   C — Clusters 1-3 originais ainda funcionam
 *   D — Sem âncora → sem pós-decisão
 */

import { classifyMiaTurn } from "../lib/miaCognitiveRouter.js";

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

// ─────────────────────────────────────────────────────────────
// Construtor de input padrão
// ─────────────────────────────────────────────────────────────

function withAnchor(originalQuery) {
  return {
    originalQuery,
    hasActiveAnchor: true,
    lastBestProduct: { product_name: "Produto Âncora Teste" },
  };
}

function withoutAnchor(originalQuery) {
  return {
    originalQuery,
    hasActiveAnchor: false,
    lastBestProduct: null,
  };
}

// ─────────────────────────────────────────────────────────────
// Grupo A — Classificar como EXPLANATION_REQUEST + subtype correto
// ─────────────────────────────────────────────────────────────

console.log("\n── Grupo A: Classificar como pós-decisão ──────────────\n");

// A1 — Consequência: "na prática"
{
  const r = classifyMiaTurn(withAnchor("na prática, o que isso muda pra mim?"));
  assert("A1: 'na prática' → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("A1: subtype = consequence", r.signals.decisionExplanation?.subtype === "consequence", `got ${r.signals.decisionExplanation?.subtype}`);
  assert("A1: decisionExplanation.active = true", r.signals.decisionExplanation?.active === true);
}

// A2 — Consequência: "o que muda"
{
  const r = classifyMiaTurn(withAnchor("o que muda na minha rotina com essa escolha?"));
  assert("A2: 'o que muda' → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("A2: subtype = consequence", r.signals.decisionExplanation?.subtype === "consequence", `got ${r.signals.decisionExplanation?.subtype}`);
}

// A3 — Consequência: "faz diferença"
{
  const r = classifyMiaTurn(withAnchor("isso faz diferença no uso cotidiano?"));
  assert("A3: 'faz diferença' → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("A3: subtype = consequence", r.signals.decisionExplanation?.subtype === "consequence", `got ${r.signals.decisionExplanation?.subtype}`);
}

// A4 — Consequência: "consequência"
{
  const r = classifyMiaTurn(withAnchor("qual a consequência prática dessa escolha?"));
  assert("A4: 'consequência' → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("A4: subtype = consequence", r.signals.decisionExplanation?.subtype === "consequence", `got ${r.signals.decisionExplanation?.subtype}`);
}

// A5 — Benefício: "o que eu ganho"
{
  const r = classifyMiaTurn(withAnchor("o que eu ganho com essa escolha?"));
  assert("A5: 'o que eu ganho' → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("A5: subtype = benefit", r.signals.decisionExplanation?.subtype === "benefit", `got ${r.signals.decisionExplanation?.subtype}`);
}

// A6 — Benefício: "qual a vantagem"
{
  const r = classifyMiaTurn(withAnchor("qual a vantagem desse produto pra mim?"));
  assert("A6: 'qual a vantagem' → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("A6: subtype = benefit", r.signals.decisionExplanation?.subtype === "benefit", `got ${r.signals.decisionExplanation?.subtype}`);
}

// A7 — Benefício: "ponto forte"
{
  const r = classifyMiaTurn(withAnchor("qual é o ponto forte dele?"));
  assert("A7: 'ponto forte' → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("A7: subtype = benefit", r.signals.decisionExplanation?.subtype === "benefit", `got ${r.signals.decisionExplanation?.subtype}`);
}

// A8 — Benefício: "benefício"
{
  const r = classifyMiaTurn(withAnchor("qual o benefício concreto disso?"));
  assert("A8: 'benefício' → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("A8: subtype = benefit", r.signals.decisionExplanation?.subtype === "benefit", `got ${r.signals.decisionExplanation?.subtype}`);
}

// A9 — Tradeoff: "o que eu perco"
{
  const r = classifyMiaTurn(withAnchor("o que eu perco escolhendo esse?"));
  assert("A9: 'o que eu perco' → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("A9: subtype = tradeoff", r.signals.decisionExplanation?.subtype === "tradeoff", `got ${r.signals.decisionExplanation?.subtype}`);
}

// A10 — Tradeoff: "abro mão"
{
  const r = classifyMiaTurn(withAnchor("o que eu abro mão com essa opção?"));
  assert("A10: 'abro mão' → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("A10: subtype = tradeoff", r.signals.decisionExplanation?.subtype === "tradeoff", `got ${r.signals.decisionExplanation?.subtype}`);
}

// A11 — Tradeoff: "qual a desvantagem"
{
  const r = classifyMiaTurn(withAnchor("qual a desvantagem dele?"));
  assert("A11: 'qual a desvantagem' → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("A11: subtype = tradeoff", r.signals.decisionExplanation?.subtype === "tradeoff", `got ${r.signals.decisionExplanation?.subtype}`);
}

// A12 — Tradeoff: "ponto fraco"
{
  const r = classifyMiaTurn(withAnchor("qual o ponto fraco desse produto?"));
  assert("A12: 'ponto fraco' → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("A12: subtype = tradeoff", r.signals.decisionExplanation?.subtype === "tradeoff", `got ${r.signals.decisionExplanation?.subtype}`);
}

// A13 — reasons inclui subtype
{
  const r = classifyMiaTurn(withAnchor("o que eu perco com essa escolha?"));
  const hasSubtypeReason = r.reasons.some((x) => x.startsWith("decision_explanation_subtype:"));
  assert("A13: reasons inclui decision_explanation_subtype", hasSubtypeReason, `reasons: ${JSON.stringify(r.reasons)}`);
}

// ─────────────────────────────────────────────────────────────
// Grupo B — NÃO classificar como pós-decisão
// ─────────────────────────────────────────────────────────────

console.log("\n── Grupo B: NÃO classificar como pós-decisão ──────────\n");

// B1 — Pedido de alternativa mais barata → REFINEMENT
{
  const r = classifyMiaTurn(withAnchor("tem algo mais barato?"));
  assert("B1: 'mais barato' → não EXPLANATION_REQUEST", r.turnType !== "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("B1: decisionExplanation inativo", !r.signals.decisionExplanation?.active);
}

// B2 — Pedido de alternativa
{
  const r = classifyMiaTurn(withAnchor("tem outra opção diferente?"));
  assert("B2: 'outra opção diferente' → não EXPLANATION_REQUEST", r.turnType !== "EXPLANATION_REQUEST", `got ${r.turnType}`);
}

// B3 — Comparação explícita (vs) → COMPARISON
{
  const r = classifyMiaTurn(withAnchor("esse produto vs o Galaxy S25, qual é melhor?"));
  assert("B3: 'vs' → COMPARISON", r.turnType === "COMPARISON", `got ${r.turnType}`);
  assert("B3: decisionExplanation inativo na comparação", !r.signals.decisionExplanation?.active);
}

// B4 — Nova busca sem âncora → NEW_SEARCH
{
  const r = classifyMiaTurn(withoutAnchor("quero um celular até R$1500"));
  assert("B4: nova busca sem âncora → NEW_SEARCH", r.turnType === "NEW_SEARCH", `got ${r.turnType}`);
  assert("B4: decisionExplanation inativo sem âncora", !r.signals.decisionExplanation?.active);
}

// B5 — Mudança de prioridade (bateria)
{
  const r = classifyMiaTurn(withAnchor("agora quero focar mais em bateria"));
  assert("B5: mudança de prioridade → não EXPLANATION_REQUEST", r.turnType !== "EXPLANATION_REQUEST", `got ${r.turnType}`);
}

// B6 — Troca explícita
{
  const r = classifyMiaTurn(withAnchor("quero trocar por outro modelo"));
  assert("B6: 'trocar por outro' → decisionExplanation inativo", !r.signals.decisionExplanation?.active);
  assert("B6: tipo não é EXPLANATION_REQUEST", r.turnType !== "EXPLANATION_REQUEST", `got ${r.turnType}`);
}

// B7 — "mais barato" com "o que eu ganho" — o guard de alternativa prevalece
{
  const r = classifyMiaTurn(withAnchor("tem algo mais barato onde eu ganho em bateria?"));
  assert("B7: 'mais barato + ganho' → guard de alternativa prevalece", !r.signals.decisionExplanation?.active);
}

// ─────────────────────────────────────────────────────────────
// Grupo C — Clusters 1-3 originais ainda funcionam
// ─────────────────────────────────────────────────────────────

console.log("\n── Grupo C: Clusters 1-3 originais ────────────────────\n");

// C1 — Cluster 1: explicação explícita
{
  const r = classifyMiaTurn(withAnchor("por que você recomendou esse?"));
  assert("C1: 'por que recomendou' → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
}

// C2 — Cluster 2: compreensão falhou
{
  const r = classifyMiaTurn(withAnchor("não entendi a escolha"));
  assert("C2: 'não entendi' → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
}

// C3 — Cluster 3: origem da decisão
{
  const r = classifyMiaTurn(withAnchor("o que te fez escolher esse?"));
  assert("C3: 'o que te fez escolher' → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
}

// C4 — Cluster 1 não ativa decisionExplanation (é detectado antes)
{
  const r = classifyMiaTurn(withAnchor("explica por que esse e não outro"));
  assert("C4: Cluster 1 → EXPLANATION_REQUEST sem decisionExplanation.active", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  // Cluster 1 detecta antes do Cluster 4-6, então decisionExplanation.active pode ser false
  // O importante é que o turnType é correto
}

// ─────────────────────────────────────────────────────────────
// Grupo D — Sem âncora → sem pós-decisão
// ─────────────────────────────────────────────────────────────

console.log("\n── Grupo D: Sem âncora → sem pós-decisão ──────────────\n");

// D1 — "na prática" sem âncora
{
  const r = classifyMiaTurn(withoutAnchor("na prática, qual celular é melhor pra mim?"));
  assert("D1: 'na prática' sem âncora → não EXPLANATION_REQUEST", r.turnType !== "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("D1: decisionExplanation inativo sem âncora", !r.signals.decisionExplanation?.active);
}

// D2 — "o que eu ganho" sem âncora
{
  const r = classifyMiaTurn(withoutAnchor("o que eu ganho comprando o iPhone?"));
  assert("D2: 'o que eu ganho' sem âncora → não EXPLANATION_REQUEST", r.turnType !== "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("D2: decisionExplanation inativo", !r.signals.decisionExplanation?.active);
}

// D3 — "o que eu perco" sem âncora
{
  const r = classifyMiaTurn(withoutAnchor("o que eu perco comprando celular barato?"));
  assert("D3: 'o que eu perco' sem âncora → não EXPLANATION_REQUEST", r.turnType !== "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("D3: decisionExplanation inativo", !r.signals.decisionExplanation?.active);
}

// ─────────────────────────────────────────────────────────────
// Grupo E — PATCH 5.4B: cobertura morfológica expandida
// ─────────────────────────────────────────────────────────────

console.log("\n── Grupo E: PATCH 5.4B — cobertura morfológica ────────\n");

// ── E: Perda / tradeoff — variações morfológicas ──────────────────────────

// E1 — Condicional de perda: "perderia"
{
  const r = classifyMiaTurn(withAnchor("o que eu perderia escolhendo esse produto?"));
  assert("E1: 'perderia' (condicional) → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("E1: subtype tradeoff", r.signals.decisionExplanation?.subtype === "tradeoff", `got ${r.signals.decisionExplanation?.subtype}`);
}

// E2 — Futuro de perda: "perderei"
{
  const r = classifyMiaTurn(withAnchor("o que eu perderei com essa escolha?"));
  assert("E2: 'perderei' (futuro) → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("E2: subtype tradeoff", r.signals.decisionExplanation?.subtype === "tradeoff", `got ${r.signals.decisionExplanation?.subtype}`);
}

// E3 — Substantivo perda singular
{
  const r = classifyMiaTurn(withAnchor("qual a perda ao escolher esse produto?"));
  assert("E3: 'perda' (substantivo) → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("E3: subtype tradeoff", r.signals.decisionExplanation?.subtype === "tradeoff", `got ${r.signals.decisionExplanation?.subtype}`);
}

// E4 — Substantivo perdas plural
{
  const r = classifyMiaTurn(withAnchor("quais são as perdas de escolher esse?"));
  assert("E4: 'perdas' (plural) → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("E4: subtype tradeoff", r.signals.decisionExplanation?.subtype === "tradeoff", `got ${r.signals.decisionExplanation?.subtype}`);
}

// ── E: Ganho / benefício — variações morfológicas ────────────────────────

// E5 — Condicional de ganho: "ganharia"
{
  const r = classifyMiaTurn(withAnchor("o que eu ganharia com essa escolha?"));
  assert("E5: 'ganharia' (condicional) → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("E5: subtype benefit", r.signals.decisionExplanation?.subtype === "benefit", `got ${r.signals.decisionExplanation?.subtype}`);
}

// E6 — Futuro de ganho: "ganharei"
{
  const r = classifyMiaTurn(withAnchor("o que eu ganharei com isso?"));
  assert("E6: 'ganharei' (futuro) → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("E6: subtype benefit", r.signals.decisionExplanation?.subtype === "benefit", `got ${r.signals.decisionExplanation?.subtype}`);
}

// E7 — "qual seria a vantagem" (modal entre "qual" e o substantivo)
{
  const r = classifyMiaTurn(withAnchor("qual seria a vantagem desse produto?"));
  assert("E7: 'qual seria a vantagem' → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("E7: subtype benefit", r.signals.decisionExplanation?.subtype === "benefit", `got ${r.signals.decisionExplanation?.subtype}`);
}

// E8 — Plural benefícios
{
  const r = classifyMiaTurn(withAnchor("quais são os benefícios disso?"));
  assert("E8: 'benefícios' (plural) → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("E8: subtype benefit", r.signals.decisionExplanation?.subtype === "benefit", `got ${r.signals.decisionExplanation?.subtype}`);
}

// E9 — Plural vantagens
{
  const r = classifyMiaTurn(withAnchor("quais são as vantagens disso?"));
  assert("E9: 'vantagens' (plural) → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("E9: subtype benefit", r.signals.decisionExplanation?.subtype === "benefit", `got ${r.signals.decisionExplanation?.subtype}`);
}

// ── E: Consequência / impacto — variações morfológicas ───────────────────

// E10 — impacto standalone (sem qualificador)
{
  const r = classifyMiaTurn(withAnchor("qual o impacto disso na minha vida?"));
  assert("E10: 'impacto' standalone → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("E10: subtype consequence", r.signals.decisionExplanation?.subtype === "consequence", `got ${r.signals.decisionExplanation?.subtype}`);
}

// E11 — consequências (plural)
{
  const r = classifyMiaTurn(withAnchor("quais são as consequências práticas dessa escolha?"));
  assert("E11: 'consequências' (plural) → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("E11: subtype consequence", r.signals.decisionExplanation?.subtype === "consequence", `got ${r.signals.decisionExplanation?.subtype}`);
}

// E12 — "afeta" standalone (família afet-)
{
  const r = classifyMiaTurn(withAnchor("isso afeta meu uso diário?"));
  assert("E12: 'afeta' standalone → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("E12: subtype consequence", r.signals.decisionExplanation?.subtype === "consequence", `got ${r.signals.decisionExplanation?.subtype}`);
}

// E13 — "afetaria" (condicional da família afet-)
{
  const r = classifyMiaTurn(withAnchor("afetaria minha vida de alguma forma?"));
  assert("E13: 'afetaria' (condicional) → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("E13: subtype consequence", r.signals.decisionExplanation?.subtype === "consequence", `got ${r.signals.decisionExplanation?.subtype}`);
}

// E14 — efeito prático
{
  const r = classifyMiaTurn(withAnchor("qual o efeito prático disso?"));
  assert("E14: 'efeito' → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("E14: subtype consequence", r.signals.decisionExplanation?.subtype === "consequence", `got ${r.signals.decisionExplanation?.subtype}`);
}

// ── E: Guards — novas formas não devem ativar quando guard dispara ────────

// E15 — "perderia" com pedido de alternativa explícita → guard prevalece
{
  const r = classifyMiaTurn(withAnchor("o que eu perderia se trocasse por outro modelo?"));
  assert("E15: 'perderia + trocar + outro modelo' → guard bloqueia", !r.signals.decisionExplanation?.active);
}

// E16 — "ganharia" com pedido explícito de "mais barato" → guard prevalece
{
  const r = classifyMiaTurn(withAnchor("o que eu ganharia escolhendo um celular mais barato?"));
  // "mais barato" está no guard de alternativa → bloqueia decisionExplanation
  assert("E16: 'ganharia + mais barato' → guard de alternativa prevalece", !r.signals.decisionExplanation?.active);
}

// E17 — "benefícios" sem âncora → não ativa
{
  const r = classifyMiaTurn(withoutAnchor("quais são os benefícios do iPhone?"));
  assert("E17: 'benefícios' sem âncora → decisionExplanation inativo", !r.signals.decisionExplanation?.active);
}

// E18 — "perderia" com "alternativa" explícita → guard prevalece
{
  const r = classifyMiaTurn(withAnchor("tem alguma alternativa onde eu perderia menos em bateria?"));
  assert("E18: 'perderia + alternativa' → guard bloqueia", !r.signals.decisionExplanation?.active);
}

// ─────────────────────────────────────────────────────────────
// Grupo F — PATCH 5.5A: Decision Defense Intent
// ─────────────────────────────────────────────────────────────

console.log("\n── Grupo F: PATCH 5.5A — Defesa da decisão atual ──────\n");

// ── F: Deve virar EXPLANATION_REQUEST / decision_defense ─────────────────

// F1 — Continuidade temporal: "ainda" + "vale a pena"
{
  const r = classifyMiaTurn(withAnchor("por que ainda vale a pena?"));
  assert("F1: 'por que ainda vale a pena' → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("F1: subtype = decision_defense", r.signals.decisionExplanation?.subtype === "decision_defense", `got ${r.signals.decisionExplanation?.subtype}`);
  assert("F1: decisionExplanation.active = true", r.signals.decisionExplanation?.active === true);
}

// F2 — "ainda vale a pena" (sem "por que" — marcador temporal suficiente)
{
  const r = classifyMiaTurn(withAnchor("ainda vale a pena essa escolha?"));
  assert("F2: 'ainda vale a pena' → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("F2: subtype = decision_defense", r.signals.decisionExplanation?.subtype === "decision_defense", `got ${r.signals.decisionExplanation?.subtype}`);
}

// F3 — "continua valendo"
{
  const r = classifyMiaTurn(withAnchor("continua valendo a recomendação?"));
  assert("F3: 'continua valendo' → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("F3: subtype = decision_defense", r.signals.decisionExplanation?.subtype === "decision_defense", `got ${r.signals.decisionExplanation?.subtype}`);
}

// F4 — "ainda compensa" (outro verbo de validade)
{
  const r = classifyMiaTurn(withAnchor("ainda compensa essa escolha?"));
  assert("F4: 'ainda compensa' → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("F4: subtype = decision_defense", r.signals.decisionExplanation?.subtype === "decision_defense", `got ${r.signals.decisionExplanation?.subtype}`);
}

// F5 — "vale mesmo?" (dúvida existencial com "mesmo")
{
  const r = classifyMiaTurn(withAnchor("vale mesmo comprar esse?"));
  assert("F5: 'vale mesmo' → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("F5: subtype = decision_defense", r.signals.decisionExplanation?.subtype === "decision_defense", `got ${r.signals.decisionExplanation?.subtype}`);
}

// F6 — "realmente compensa?" (dúvida existencial com "realmente")
{
  const r = classifyMiaTurn(withAnchor("realmente compensa a recomendação?"));
  assert("F6: 'realmente compensa' → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("F6: subtype = decision_defense", r.signals.decisionExplanation?.subtype === "decision_defense", `got ${r.signals.decisionExplanation?.subtype}`);
}

// F7 — "por que ainda faz sentido" (justificação + continuidade)
{
  const r = classifyMiaTurn(withAnchor("por que ainda faz sentido essa recomendação?"));
  assert("F7: 'por que ainda faz sentido' → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("F7: subtype = decision_defense", r.signals.decisionExplanation?.subtype === "decision_defense", `got ${r.signals.decisionExplanation?.subtype}`);
}

// F8 — "continua fazendo sentido"
{
  const r = classifyMiaTurn(withAnchor("continua fazendo sentido para o meu uso?"));
  assert("F8: 'continua fazendo sentido' → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("F8: subtype = decision_defense", r.signals.decisionExplanation?.subtype === "decision_defense", `got ${r.signals.decisionExplanation?.subtype}`);
}

// F9 — "ainda é bom?" (continuidade + qualificador)
{
  const r = classifyMiaTurn(withAnchor("ainda é bom dado o que eu preciso?"));
  assert("F9: 'ainda é bom' → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("F9: subtype = decision_defense", r.signals.decisionExplanation?.subtype === "decision_defense", `got ${r.signals.decisionExplanation?.subtype}`);
}

// F10 — "por que compensa?" (justificação direta)
{
  const r = classifyMiaTurn(withAnchor("por que compensa escolher esse?"));
  assert("F10: 'por que compensa' → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("F10: subtype = decision_defense", r.signals.decisionExplanation?.subtype === "decision_defense", `got ${r.signals.decisionExplanation?.subtype}`);
}

// ── F: VALUE_QUESTION ainda funciona sem anchor ────────────────────────

// F11 — "vale a pena" SEM âncora → não deve ser decision_defense
{
  const r = classifyMiaTurn(withoutAnchor("vale a pena comprar esse celular?"));
  assert("F11: 'vale a pena' sem âncora → não EXPLANATION_REQUEST", r.turnType !== "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("F11: decisionExplanation inativo sem âncora", !r.signals.decisionExplanation?.active);
}

// F12 — "compensa" SEM âncora → não ativa decision_defense
{
  const r = classifyMiaTurn(withoutAnchor("compensa comprar agora ou esperar?"));
  assert("F12: 'compensa' sem âncora → não EXPLANATION_REQUEST", r.turnType !== "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("F12: decisionExplanation inativo sem âncora", !r.signals.decisionExplanation?.active);
}

// ── F: Guards preservados — comparação, alternativa, refinamento ──────────

// F13 — "ainda vale a pena" com alternativa explícita → guard bloqueia
{
  const r = classifyMiaTurn(withAnchor("ainda vale a pena ou tem alternativa melhor?"));
  assert("F13: 'ainda vale a pena + alternativa' → guard bloqueia decision_defense", !r.signals.decisionExplanation?.active);
}

// F14 — "ainda vale a pena" com pedido de troca → guard bloqueia
{
  const r = classifyMiaTurn(withAnchor("ainda vale a pena ou deveria trocar?"));
  assert("F14: 'ainda vale a pena + trocar' → guard bloqueia decision_defense", !r.signals.decisionExplanation?.active);
}

// F15 — "vale ainda mais com outro modelo?" — "outro modelo" bloqueia
{
  const r = classifyMiaTurn(withAnchor("vale ainda mais com outro modelo?"));
  assert("F15: 'vale + outro modelo' → guard bloqueia decision_defense", !r.signals.decisionExplanation?.active);
}

// ── F: Não interfere com outros subtypes ────────────────────────────────

// F16 — "o que eu perderia ainda assim" → perda prevalece (loss detecta primeiro)
// Nota: "perco|perd\w+" é detectado antes de "ainda", depende da ordem dos clusters
// Clusters são testados sequencialmente; consequência/benefício/perda têm precedência
// sobre defense pois vêm antes no código. Verificar que perd\w+ ativa tradeoff.
{
  const r = classifyMiaTurn(withAnchor("o que eu perderia ainda assim com essa escolha?"));
  assert("F16: 'perderia + ainda assim' → tradeoff (cluster 6 tem precedência sobre cluster 7)", r.signals.decisionExplanation?.subtype === "tradeoff", `got ${r.signals.decisionExplanation?.subtype}`);
}

// ─────────────────────────────────────────────────────────────
// Grupo G — PATCH 5.5B: Decision Confidence Challenge
// ─────────────────────────────────────────────────────────────

console.log("\n── Grupo G: PATCH 5.5B — Desafio de confiança/estabilidade ──\n");

// ── G: Deve virar EXPLANATION_REQUEST / confidence_challenge ──────────────

// G1 — Sinal A: "por que não mudou sua opinião?"
{
  const r = classifyMiaTurn(withAnchor("por que você não mudou sua opinião?"));
  assert("G1: 'por que não mudou sua opinião' → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("G1: subtype = confidence_challenge", r.signals.decisionExplanation?.subtype === "confidence_challenge", `got ${r.signals.decisionExplanation?.subtype}`);
  assert("G1: decisionExplanation.active = true", r.signals.decisionExplanation?.active === true);
}

// G2 — Sinal A: "por que não trocou de produto?"
{
  const r = classifyMiaTurn(withAnchor("por que você não trocou de produto?"));
  assert("G2: 'por que não trocou' → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("G2: subtype = confidence_challenge", r.signals.decisionExplanation?.subtype === "confidence_challenge", `got ${r.signals.decisionExplanation?.subtype}`);
}

// G3 — Sinal B: "você ainda escolheria esse produto?"
{
  const r = classifyMiaTurn(withAnchor("você ainda escolheria esse produto?"));
  assert("G3: 'ainda escolheria' → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("G3: subtype = confidence_challenge", r.signals.decisionExplanation?.subtype === "confidence_challenge", `got ${r.signals.decisionExplanation?.subtype}`);
}

// G4 — Sinal B: "ainda recomendaria essa escolha?"
{
  const r = classifyMiaTurn(withAnchor("ainda recomendaria essa escolha?"));
  assert("G4: 'ainda recomendaria' → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("G4: subtype = confidence_challenge", r.signals.decisionExplanation?.subtype === "confidence_challenge", `got ${r.signals.decisionExplanation?.subtype}`);
}

// G5 — Sinal B: "você ainda sustentaria essa escolha?"
{
  const r = classifyMiaTurn(withAnchor("você ainda sustentaria essa escolha?"));
  assert("G5: 'ainda sustentaria' → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("G5: subtype = confidence_challenge", r.signals.decisionExplanation?.subtype === "confidence_challenge", `got ${r.signals.decisionExplanation?.subtype}`);
}

// G6 — Sinal C: "o que te faria repensar essa escolha?"
{
  const r = classifyMiaTurn(withAnchor("o que te faria repensar essa escolha?"));
  assert("G6: 'o que te faria repensar' → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("G6: subtype = confidence_challenge", r.signals.decisionExplanation?.subtype === "confidence_challenge", `got ${r.signals.decisionExplanation?.subtype}`);
}

// G7 — Sinal C: "o que faria você reconsiderar a recomendação?"
{
  const r = classifyMiaTurn(withAnchor("o que faria você reconsiderar a recomendação?"));
  assert("G7: 'o que faria reconsiderar' → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("G7: subtype = confidence_challenge", r.signals.decisionExplanation?.subtype === "confidence_challenge", `got ${r.signals.decisionExplanation?.subtype}`);
}

// G8 — Sinal D: "você tem certeza que esse é o melhor?"
{
  const r = classifyMiaTurn(withAnchor("você tem certeza que esse é o melhor?"));
  assert("G8: 'tem certeza' → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("G8: subtype = confidence_challenge", r.signals.decisionExplanation?.subtype === "confidence_challenge", `got ${r.signals.decisionExplanation?.subtype}`);
}

// G9 — Sinal D: "você confiaria nessa recomendação?"
{
  const r = classifyMiaTurn(withAnchor("você confiaria nessa recomendação?"));
  assert("G9: 'confiaria nessa recomendação' → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("G9: subtype = confidence_challenge", r.signals.decisionExplanation?.subtype === "confidence_challenge", `got ${r.signals.decisionExplanation?.subtype}`);
}

// G10 — Sinal E: "a recomendação sustenta o questionamento?"
{
  const r = classifyMiaTurn(withAnchor("essa recomendação sustenta o questionamento?"));
  assert("G10: 'sustenta + recomendação' → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("G10: subtype = confidence_challenge", r.signals.decisionExplanation?.subtype === "confidence_challenge", `got ${r.signals.decisionExplanation?.subtype}`);
}

// G11 — Sinal E: "a escolha resiste a um teste mais rigoroso?"
{
  const r = classifyMiaTurn(withAnchor("a escolha resiste a um teste mais rigoroso?"));
  assert("G11: 'resiste + escolha' → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("G11: subtype = confidence_challenge", r.signals.decisionExplanation?.subtype === "confidence_challenge", `got ${r.signals.decisionExplanation?.subtype}`);
}

// G12 — PRÉ-GUARD: "você mudaria de ideia sobre esse produto?"
// "mudaria" está no guard, mas "de ideia" deve bypass ele
{
  const r = classifyMiaTurn(withAnchor("você mudaria de ideia sobre esse produto?"));
  assert("G12: 'mudaria de ideia' (pré-guard) → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("G12: subtype = confidence_challenge", r.signals.decisionExplanation?.subtype === "confidence_challenge", `got ${r.signals.decisionExplanation?.subtype}`);
}

// ── G: Não deve virar confidence_challenge ────────────────────────────────

// G13 — SEM âncora: "ainda escolheria esse produto?" não ativa
{
  const r = classifyMiaTurn(withoutAnchor("ainda escolheria esse produto?"));
  assert("G13: 'ainda escolheria' sem âncora → não EXPLANATION_REQUEST", r.turnType !== "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("G13: decisionExplanation inativo sem âncora", !r.signals.decisionExplanation?.active);
}

// G14 — Pedido de alternativa → guard bloqueia confidence_challenge
{
  const r = classifyMiaTurn(withAnchor("você ainda escolheria esse ou tem alternativa melhor?"));
  assert("G14: 'ainda escolheria + alternativa melhor' → guard bloqueia", !r.signals.decisionExplanation?.active);
}

// G15 — Pedido de produto mais barato → guard bloqueia
{
  const r = classifyMiaTurn(withAnchor("você ainda recomendaria ou tem algo mais barato?"));
  assert("G15: 'ainda recomendaria + mais barato' → guard bloqueia confidence_challenge", !r.signals.decisionExplanation?.active);
}

// G16 — Comparação explícita → turnType COMPARISON prevalece sobre confidence_challenge
// O sinal decisionExplanation pode disparar, mas COMPARISON tem precedência maior
// na cadeia de classificação (step 2 vs step 5 em resolveTurnTypeFromSignals).
{
  const r = classifyMiaTurn(withAnchor("ainda escolheria esse ou prefere o modelo X?"));
  assert("G16: 'comparação explícita' → turnType = COMPARISON (não EXPLANATION_REQUEST)", r.turnType === "COMPARISON", `got ${r.turnType}`);
}

// G17 — Não interfere com decision_defense: "ainda vale a pena?" permanece decision_defense
{
  const r = classifyMiaTurn(withAnchor("ainda vale a pena?"));
  assert("G17: 'ainda vale a pena' → decision_defense (não confidence_challenge)", r.signals.decisionExplanation?.subtype === "decision_defense", `got ${r.signals.decisionExplanation?.subtype}`);
}

// G18 — Não interfere com tradeoff: "o que eu perderia ainda assim?" → tradeoff
{
  const r = classifyMiaTurn(withAnchor("o que eu perderia ainda assim com essa recomendação?"));
  assert("G18: 'perderia + ainda assim' → tradeoff (não confidence_challenge)", r.signals.decisionExplanation?.subtype === "tradeoff", `got ${r.signals.decisionExplanation?.subtype}`);
}

// ─────────────────────────────────────────────────────────────
// Grupo J — PATCH 5.5C: POST_DECISION_EXPLANATION category
// ─────────────────────────────────────────────────────────────

console.log("\n── Grupo J: PATCH 5.5C — Categoria unificada pós-decisão ───\n");

// J1 — benefit pertence ao grupo POST_DECISION_EXPLANATION
// Nota: "por que esse é melhor?" ativa Clusters 1-3 (pedido de explicação geral),
// não o Cluster 5 (benefit). POST_DECISION_EXPLANATION cobre Clusters 4-8.
// Usar query que ativa semanticamente o cluster de benefit.
{
  const r = classifyMiaTurn(withAnchor("qual a vantagem desse produto?"));
  assert("J1: benefit → turnType = EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("J1: benefit → subtype = benefit", r.signals.decisionExplanation?.subtype === "benefit", `got ${r.signals.decisionExplanation?.subtype}`);
  assert("J1: benefit → category = POST_DECISION_EXPLANATION", r.signals.decisionExplanation?.category === "POST_DECISION_EXPLANATION", `got ${r.signals.decisionExplanation?.category}`);
}

// J2 — tradeoff pertence ao grupo POST_DECISION_EXPLANATION
{
  const r = classifyMiaTurn(withAnchor("qual o ponto fraco dele?"));
  assert("J2: tradeoff → category = POST_DECISION_EXPLANATION", r.signals.decisionExplanation?.category === "POST_DECISION_EXPLANATION", `got ${r.signals.decisionExplanation?.category}`);
  assert("J2: tradeoff → subtype = tradeoff", r.signals.decisionExplanation?.subtype === "tradeoff", `got ${r.signals.decisionExplanation?.subtype}`);
}

// J3 — consequence pertence ao grupo POST_DECISION_EXPLANATION
{
  const r = classifyMiaTurn(withAnchor("o que isso muda no uso real?"));
  assert("J3: consequence → category = POST_DECISION_EXPLANATION", r.signals.decisionExplanation?.category === "POST_DECISION_EXPLANATION", `got ${r.signals.decisionExplanation?.category}`);
  assert("J3: consequence → subtype = consequence", r.signals.decisionExplanation?.subtype === "consequence", `got ${r.signals.decisionExplanation?.subtype}`);
}

// J4 — decision_defense pertence ao grupo POST_DECISION_EXPLANATION
{
  const r = classifyMiaTurn(withAnchor("ainda vale a pena?"));
  assert("J4: decision_defense → category = POST_DECISION_EXPLANATION", r.signals.decisionExplanation?.category === "POST_DECISION_EXPLANATION", `got ${r.signals.decisionExplanation?.category}`);
  assert("J4: decision_defense → subtype = decision_defense", r.signals.decisionExplanation?.subtype === "decision_defense", `got ${r.signals.decisionExplanation?.subtype}`);
}

// J5 — confidence_challenge pertence ao grupo POST_DECISION_EXPLANATION
{
  const r = classifyMiaTurn(withAnchor("tem certeza que esse é o melhor?"));
  assert("J5: confidence_challenge → category = POST_DECISION_EXPLANATION", r.signals.decisionExplanation?.category === "POST_DECISION_EXPLANATION", `got ${r.signals.decisionExplanation?.category}`);
  assert("J5: confidence_challenge → subtype = confidence_challenge", r.signals.decisionExplanation?.subtype === "confidence_challenge", `got ${r.signals.decisionExplanation?.subtype}`);
}

// J6 — confidence_challenge (mudar de ideia) pertence ao grupo POST_DECISION_EXPLANATION
{
  const r = classifyMiaTurn(withAnchor("o que te faria mudar de ideia?"));
  assert("J6: 'mudar de ideia' → EXPLANATION_REQUEST", r.turnType === "EXPLANATION_REQUEST", `got ${r.turnType}`);
  assert("J6: 'mudar de ideia' → category = POST_DECISION_EXPLANATION", r.signals.decisionExplanation?.category === "POST_DECISION_EXPLANATION", `got ${r.signals.decisionExplanation?.category}`);
  assert("J6: 'mudar de ideia' → subtype = confidence_challenge", r.signals.decisionExplanation?.subtype === "confidence_challenge", `got ${r.signals.decisionExplanation?.subtype}`);
}

// ── J: Não-pós-decisão NÃO tem category POST_DECISION_EXPLANATION ────────

// J7 — refinement NÃO pertence ao grupo
{
  const r = classifyMiaTurn(withAnchor("tem outro modelo?"));
  assert("J7: refinement → category não é POST_DECISION_EXPLANATION", r.signals.decisionExplanation?.category !== "POST_DECISION_EXPLANATION");
  assert("J7: refinement → decisionExplanation.active = false", !r.signals.decisionExplanation?.active);
}

// J8 — comparação NÃO pertence ao grupo
{
  const r = classifyMiaTurn(withAnchor("iPhone 13 ou Galaxy S23?"));
  assert("J8: comparison → category não é POST_DECISION_EXPLANATION", r.signals.decisionExplanation?.category !== "POST_DECISION_EXPLANATION");
}

// J9 — nova busca NÃO pertence ao grupo
{
  const r = classifyMiaTurn(withoutAnchor("celular até 2000 reais"));
  assert("J9: new search → category não é POST_DECISION_EXPLANATION", r.signals.decisionExplanation?.category !== "POST_DECISION_EXPLANATION");
}

// J10 — sem âncora, category é null mesmo que query pareça pós-decisão
{
  const r = classifyMiaTurn(withoutAnchor("ainda vale a pena?"));
  assert("J10: sem âncora → category = null", r.signals.decisionExplanation?.category === null || r.signals.decisionExplanation?.category === undefined);
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
