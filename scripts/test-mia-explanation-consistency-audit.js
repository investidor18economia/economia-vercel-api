/**
 * test-mia-explanation-consistency-audit.js
 *
 * PATCH 5.5E — Testes para miaExplanationConsistencyAudit
 *
 * Valida:
 *   - Detecção de alternativa não autorizada em contextos pós-decisão
 *   - Detecção de eixo não refletido
 *   - Detecção de tradeoff não refletido
 *   - Detecção de confidence weakened em confidence_challenge
 *   - Resposta correta não gera falso positivo crítico
 *   - COMPARISON / REFINEMENT podem mencionar alternativas livremente
 *   - Invariantes do módulo (nunca null, auditVersion, etc.)
 */

import {
  buildExplanationConsistencyAudit,
  EXPLANATION_CONSISTENCY_FLAGS,
} from "../lib/miaExplanationConsistencyAudit.js";

// ─────────────────────────────────────────────────────────────
// Helpers de teste
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
    const msg = detail ? `  ✗ ${label} — ${detail}` : `  ✗ ${label}`;
    console.log(msg);
    failures.push(msg);
  }
}

// Contexto rico de explanação (baseado em sessão com iPhone 13 por performance)
const richExplanationCtx = {
  anchorTitle: "iPhone 13",
  lastAxis: "performance",
  lastConsequence: "tarefas exigentes sem sentir que o aparelho esta no limite cedo demais",
  lastTradeoff: "menos sensacao de limite quando o aparelho e exigido em tarefas pesadas",
  lastDecisionReason: "performance consistente supera custo beneficio para o perfil informado",
  lastWinnerAdvantages: ["A15 Bionic", "iOS otimizado", "bateria confiavel"],
  lastWinnerSacrifices: ["zoom optico", "preco elevado"],
  hasAxis: true,
  hasConsequence: true,
  hasTradeoff: true,
  hasDecisionReason: true,
  winnerAdvantagesCount: 3,
  winnerSacrificesCount: 2,
};

// ─────────────────────────────────────────────────────────────
// Grupo A — Checagem 1: Alternativa não autorizada
// ─────────────────────────────────────────────────────────────

console.log("\n── Grupo A: Alternativa não autorizada ─────────────────────\n");

// A1 — reply sugere alternativa em EXPLANATION_REQUEST → flag CRITICAL
{
  const audit = buildExplanationConsistencyAudit({
    finalReply: "O iPhone 13 é muito bom para performance. Se quiser, o Galaxy A54 também é uma excelente opção para quem busca câmera melhor.",
    explanationCtx: richExplanationCtx,
    winnerName: "iPhone 13",
    turnType: "EXPLANATION_REQUEST",
    decisionExplanationSubtype: "confidence_challenge",
    richExplanationPathActivated: true,
  });
  assert("A1: reply com alternativa em EXPLANATION_REQUEST → UNAUTHORIZED_ALTERNATIVE", audit.flags.includes(EXPLANATION_CONSISTENCY_FLAGS.UNAUTHORIZED_ALTERNATIVE), `flags: ${JSON.stringify(audit.flags)}`);
  assert("A1: hasCriticalFlag = true", audit.hasCriticalFlag === true);
  assert("A1: isConsistent = false", audit.isConsistent === false);
}

// A2 — reply com "outra opção seria" em EXPLANATION_REQUEST → flag
{
  const audit = buildExplanationConsistencyAudit({
    finalReply: "Recomendei por performance. Outra opção seria o Redmi Note 12 se o orçamento for menor.",
    explanationCtx: richExplanationCtx,
    winnerName: "iPhone 13",
    turnType: "EXPLANATION_REQUEST",
    decisionExplanationSubtype: "benefit",
    richExplanationPathActivated: true,
  });
  assert("A2: 'outra opção seria' em EXPLANATION_REQUEST → UNAUTHORIZED_ALTERNATIVE", audit.flags.includes(EXPLANATION_CONSISTENCY_FLAGS.UNAUTHORIZED_ALTERNATIVE));
  assert("A2: hasCriticalFlag = true", audit.hasCriticalFlag === true);
}

// A3 — COMPARISON pode mencionar alternativa sem flag
{
  const audit = buildExplanationConsistencyAudit({
    finalReply: "Comparando iPhone 13 e Galaxy S23 FE, o Galaxy também é uma excelente opção se preferir Android.",
    explanationCtx: richExplanationCtx,
    winnerName: "iPhone 13",
    turnType: "COMPARISON",
    richExplanationPathActivated: true,
  });
  assert("A3: COMPARISON com alternativa → sem UNAUTHORIZED_ALTERNATIVE", !audit.flags.includes(EXPLANATION_CONSISTENCY_FLAGS.UNAUTHORIZED_ALTERNATIVE));
}

// A4 — REFINEMENT pode mencionar modelo mais barato sem flag
{
  const audit = buildExplanationConsistencyAudit({
    finalReply: "Se quiser algo mais barato, o Redmi Note 12 é uma alternativa interessante dentro do orçamento ajustado.",
    explanationCtx: richExplanationCtx,
    winnerName: "iPhone 13",
    turnType: "REFINEMENT",
    richExplanationPathActivated: true,
  });
  assert("A4: REFINEMENT com alternativa → sem UNAUTHORIZED_ALTERNATIVE", !audit.flags.includes(EXPLANATION_CONSISTENCY_FLAGS.UNAUTHORIZED_ALTERNATIVE));
}

// A5 — reply correto sem alternativa em EXPLANATION_REQUEST → sem flag
{
  const audit = buildExplanationConsistencyAudit({
    finalReply: "O iPhone 13 foi recomendado por performance. O chip A15 Bionic garante que tarefas pesadas rodam sem travamentos, o que é exatamente o que você pediu.",
    explanationCtx: richExplanationCtx,
    winnerName: "iPhone 13",
    turnType: "EXPLANATION_REQUEST",
    decisionExplanationSubtype: "confidence_challenge",
    richExplanationPathActivated: true,
  });
  assert("A5: reply sem alternativa → sem UNAUTHORIZED_ALTERNATIVE", !audit.flags.includes(EXPLANATION_CONSISTENCY_FLAGS.UNAUTHORIZED_ALTERNATIVE));
}

// ─────────────────────────────────────────────────────────────
// Grupo B — Checagem 2: Eixo não refletido
// ─────────────────────────────────────────────────────────────

console.log("\n── Grupo B: Eixo não refletido ─────────────────────────────\n");

// B1 — lastAxis = "performance", reply fala só de câmera e bateria → flag
{
  const audit = buildExplanationConsistencyAudit({
    finalReply: "Escolhi principalmente porque a câmera é excelente e a bateria dura mais do que os concorrentes, sendo o melhor custo-benefício disponível no mercado atualmente.",
    explanationCtx: { ...richExplanationCtx, lastAxis: "performance" },
    winnerName: "iPhone 13",
    turnType: "EXPLANATION_REQUEST",
    decisionExplanationSubtype: "consequence",
    richExplanationPathActivated: true,
  });
  assert("B1: lastAxis='performance' ausente no reply → AXIS_NOT_REFLECTED", audit.flags.includes(EXPLANATION_CONSISTENCY_FLAGS.AXIS_NOT_REFLECTED), `flags: ${JSON.stringify(audit.flags)}`);
}

// B2 — reply menciona "performance" (lastAxis) → sem flag
{
  const audit = buildExplanationConsistencyAudit({
    finalReply: "O iPhone 13 se destaca pela performance. Com o A15 Bionic, a performance nas tarefas diárias e pesadas é superior, garantindo experiência fluida sem travamentos.",
    explanationCtx: richExplanationCtx,
    winnerName: "iPhone 13",
    turnType: "EXPLANATION_REQUEST",
    richExplanationPathActivated: true,
  });
  assert("B2: reply menciona lastAxis → sem AXIS_NOT_REFLECTED", !audit.flags.includes(EXPLANATION_CONSISTENCY_FLAGS.AXIS_NOT_REFLECTED));
}

// B3 — reply curto (< 100 chars) → sem flag mesmo sem mencionar eixo
{
  const audit = buildExplanationConsistencyAudit({
    finalReply: "Sim, é o melhor para você.",
    explanationCtx: richExplanationCtx,
    winnerName: "iPhone 13",
    turnType: "EXPLANATION_REQUEST",
    richExplanationPathActivated: true,
  });
  assert("B3: reply curto → sem AXIS_NOT_REFLECTED (tamanho insuficiente para auditar)", !audit.flags.includes(EXPLANATION_CONSISTENCY_FLAGS.AXIS_NOT_REFLECTED));
}

// ─────────────────────────────────────────────────────────────
// Grupo C — Checagem 3: Tradeoff não refletido
// ─────────────────────────────────────────────────────────────

console.log("\n── Grupo C: Tradeoff não refletido ─────────────────────────\n");

// C1 — lastTradeoff fala de "limite quando exigido", reply inventa bateria → flag
{
  const longReplyAboutBattery = "O iPhone 13 é excelente principalmente pela bateria. A bateria dura muito mais do que qualquer outro celular que testamos. A autonomia é realmente impressionante e supera qualquer concorrente nessa faixa de preço atualmente disponível no mercado.";
  const audit = buildExplanationConsistencyAudit({
    finalReply: longReplyAboutBattery,
    explanationCtx: richExplanationCtx,
    winnerName: "iPhone 13",
    turnType: "EXPLANATION_REQUEST",
    decisionExplanationSubtype: "tradeoff",
    richExplanationPathActivated: true,
  });
  assert("C1: tradeoff original ('limite', 'exigido') ausente em reply longo → TRADEOFF_NOT_REFLECTED", audit.flags.includes(EXPLANATION_CONSISTENCY_FLAGS.TRADEOFF_NOT_REFLECTED), `flags: ${JSON.stringify(audit.flags)}`);
}

// C2 — reply menciona termos do tradeoff → sem flag
{
  const audit = buildExplanationConsistencyAudit({
    finalReply: "O tradeoff é que você abre mão de algum zoom óptico, mas ganha desempenho mesmo quando exigido. O aparelho não sente o limite em tarefas pesadas, que era exatamente o que você precisava.",
    explanationCtx: richExplanationCtx,
    winnerName: "iPhone 13",
    turnType: "EXPLANATION_REQUEST",
    richExplanationPathActivated: true,
  });
  assert("C2: reply menciona termos do tradeoff → sem TRADEOFF_NOT_REFLECTED", !audit.flags.includes(EXPLANATION_CONSISTENCY_FLAGS.TRADEOFF_NOT_REFLECTED));
}

// ─────────────────────────────────────────────────────────────
// Grupo D — Checagem 4: Confidence weakened
// ─────────────────────────────────────────────────────────────

console.log("\n── Grupo D: Confidence weakened ────────────────────────────\n");

// D1 — "talvez escolheria outro" em confidence_challenge → CRITICAL flag
{
  const audit = buildExplanationConsistencyAudit({
    finalReply: "Sim, acredito que o iPhone 13 é bom. Mas talvez eu escolheria outro se o orçamento fosse diferente.",
    explanationCtx: richExplanationCtx,
    winnerName: "iPhone 13",
    turnType: "EXPLANATION_REQUEST",
    decisionExplanationSubtype: "confidence_challenge",
    richExplanationPathActivated: true,
  });
  assert("D1: 'talvez eu escolheria outro' em confidence_challenge → CONFIDENCE_WEAKENED", audit.flags.includes(EXPLANATION_CONSISTENCY_FLAGS.CONFIDENCE_WEAKENED), `flags: ${JSON.stringify(audit.flags)}`);
  assert("D1: hasCriticalFlag = true", audit.hasCriticalFlag === true);
}

// D2 — "não tenho certeza" em confidence_challenge → flag
{
  const audit = buildExplanationConsistencyAudit({
    finalReply: "É uma boa escolha. Não tenho certeza se é o melhor em todos os cenários, mas para o seu perfil é adequado.",
    explanationCtx: richExplanationCtx,
    winnerName: "iPhone 13",
    turnType: "EXPLANATION_REQUEST",
    decisionExplanationSubtype: "confidence_challenge",
    richExplanationPathActivated: true,
  });
  assert("D2: 'não tenho certeza' em confidence_challenge → CONFIDENCE_WEAKENED", audit.flags.includes(EXPLANATION_CONSISTENCY_FLAGS.CONFIDENCE_WEAKENED));
}

// D3 — reply confiante em confidence_challenge → sem flag
{
  const audit = buildExplanationConsistencyAudit({
    finalReply: "Sim, manteria a recomendação. O iPhone 13 foi escolhido por performance e continua sendo a melhor escolha para o perfil informado. O A15 Bionic garante experiência consistente sem limites nas tarefas.",
    explanationCtx: richExplanationCtx,
    winnerName: "iPhone 13",
    turnType: "EXPLANATION_REQUEST",
    decisionExplanationSubtype: "confidence_challenge",
    richExplanationPathActivated: true,
  });
  assert("D3: reply confiante em confidence_challenge → sem CONFIDENCE_WEAKENED", !audit.flags.includes(EXPLANATION_CONSISTENCY_FLAGS.CONFIDENCE_WEAKENED));
}

// D4 — "mas talvez dependendo" em confidence_challenge → flag
{
  const audit = buildExplanationConsistencyAudit({
    finalReply: "O iPhone 13 é bom. Mas talvez dependendo do uso específico outro modelo pudesse ser considerado também.",
    explanationCtx: richExplanationCtx,
    winnerName: "iPhone 13",
    turnType: "EXPLANATION_REQUEST",
    decisionExplanationSubtype: "confidence_challenge",
    richExplanationPathActivated: true,
  });
  assert("D4: 'mas talvez dependendo' em confidence_challenge → CONFIDENCE_WEAKENED", audit.flags.includes(EXPLANATION_CONSISTENCY_FLAGS.CONFIDENCE_WEAKENED));
}

// D5 — confidence weakened NÃO dispara em benefit (só em confidence_challenge)
{
  const audit = buildExplanationConsistencyAudit({
    finalReply: "Não tenho certeza de tudo, mas a vantagem principal é a performance que oferece.",
    explanationCtx: richExplanationCtx,
    winnerName: "iPhone 13",
    turnType: "EXPLANATION_REQUEST",
    decisionExplanationSubtype: "benefit",  // NÃO confidence_challenge
    richExplanationPathActivated: true,
  });
  assert("D5: 'não tenho certeza' em benefit (não confidence_challenge) → sem CONFIDENCE_WEAKENED", !audit.flags.includes(EXPLANATION_CONSISTENCY_FLAGS.CONFIDENCE_WEAKENED));
}

// ─────────────────────────────────────────────────────────────
// Grupo E — Resposta correta / sem flags críticas
// ─────────────────────────────────────────────────────────────

console.log("\n── Grupo E: Resposta correta (sem falso positivo crítico) ──\n");

// E1 — resposta ideal: usa winner, axis, consequence, sem alternativas
{
  const audit = buildExplanationConsistencyAudit({
    finalReply: "O iPhone 13 foi escolhido por performance. Com o A15 Bionic, as tarefas exigentes rodam sem que o aparelho sinta o limite. Essa performance consistente é exatamente o que você pediu como critério principal. O tradeoff é abrir mão do zoom óptico, mas dentro do seu perfil isso é marginal.",
    explanationCtx: richExplanationCtx,
    winnerName: "iPhone 13",
    turnType: "EXPLANATION_REQUEST",
    decisionExplanationSubtype: "confidence_challenge",
    richExplanationPathActivated: true,
  });
  assert("E1: resposta ideal → sem flags críticas", !audit.hasCriticalFlag, `flags: ${JSON.stringify(audit.flags)}`);
  assert("E1: resposta ideal → isConsistent = true (ou sem flag crítica)", !audit.hasCriticalFlag);
  assert("E1: diagnostics.unauthorizedAlternative = false", audit.diagnostics.unauthorizedAlternative === false);
  assert("E1: diagnostics.confidenceWeakened = false", audit.diagnostics.confidenceWeakened === false);
}

// E2 — rich explanation path NÃO ativado → consistencyChecked = false
{
  const audit = buildExplanationConsistencyAudit({
    finalReply: "Aqui estão as opções disponíveis para você.",
    explanationCtx: richExplanationCtx,
    winnerName: "iPhone 13",
    turnType: "EXPLANATION_REQUEST",
    richExplanationPathActivated: false, // não ativado
  });
  assert("E2: rich path não ativado → consistencyChecked = false", audit.consistencyChecked === false);
  assert("E2: sem path → flags vazias", audit.flags.length === 0);
  assert("E2: sem path → isConsistent = true", audit.isConsistent === true);
}

// E3 — sem finalReply → consistencyChecked = false
{
  const audit = buildExplanationConsistencyAudit({
    finalReply: "",
    explanationCtx: richExplanationCtx,
    winnerName: "iPhone 13",
    richExplanationPathActivated: true,
  });
  assert("E3: sem reply → consistencyChecked = false", audit.consistencyChecked === false);
}

// ─────────────────────────────────────────────────────────────
// Grupo F — Invariantes do módulo
// ─────────────────────────────────────────────────────────────

console.log("\n── Grupo F: Invariantes ────────────────────────────────────\n");

// F1 — nunca retorna null
{
  const audit = buildExplanationConsistencyAudit({});
  assert("F1: input vazio → retorna objeto válido", typeof audit === "object" && audit !== null);
  assert("F1: auditVersion = '5.5E'", audit.auditVersion === "5.5E");
  assert("F1: flags sempre é array", Array.isArray(audit.flags));
  assert("F1: hasCriticalFlag sempre é boolean", typeof audit.hasCriticalFlag === "boolean");
  assert("F1: isConsistent sempre é boolean", typeof audit.isConsistent === "boolean");
  assert("F1: diagnostics sempre presente", typeof audit.diagnostics === "object" && audit.diagnostics !== null);
}

// F2 — input null não causa exceção
{
  let threw = false;
  try { buildExplanationConsistencyAudit(null); } catch { threw = true; }
  assert("F2: input null não lança exceção", !threw);
}

// F3 — UNAUTHORIZED_ALTERNATIVE e CONFIDENCE_WEAKENED são CRITICAL
{
  const auditA = buildExplanationConsistencyAudit({
    finalReply: "O iPhone 13 é bom. Outra opção seria o Galaxy A54 se quiser câmera melhor com outra alternativa no mercado.",
    turnType: "EXPLANATION_REQUEST",
    richExplanationPathActivated: true,
  });
  assert("F3: UNAUTHORIZED_ALTERNATIVE → hasCriticalFlag = true", auditA.hasCriticalFlag === true);

  const auditB = buildExplanationConsistencyAudit({
    finalReply: "Sim mas talvez eu escolheria outro se surgisse algo melhor no mercado.",
    turnType: "EXPLANATION_REQUEST",
    decisionExplanationSubtype: "confidence_challenge",
    richExplanationPathActivated: true,
  });
  assert("F3: CONFIDENCE_WEAKENED → hasCriticalFlag = true", auditB.hasCriticalFlag === true);
}

// F4 — AXIS_NOT_REFLECTED, TRADEOFF_NOT_REFLECTED, WINNER_ABSENT, DECISION_MEMORY_IGNORED não são CRITICAL
{
  const audit = buildExplanationConsistencyAudit({
    finalReply: "É muito bom para câmera. A câmera é excelente e recomendo pela câmera e pela câmera mesmo. A qualidade fotográfica é impressionante e supera tudo na faixa.",
    explanationCtx: { ...richExplanationCtx, lastAxis: "performance" },
    winnerName: "iPhone 13",
    turnType: "EXPLANATION_REQUEST",
    richExplanationPathActivated: true,
  });
  // Pode ter AXIS_NOT_REFLECTED mas não deve ser CRITICAL
  const nonCriticalFlags = audit.flags.filter(f => f !== EXPLANATION_CONSISTENCY_FLAGS.UNAUTHORIZED_ALTERNATIVE && f !== EXPLANATION_CONSISTENCY_FLAGS.CONFIDENCE_WEAKENED);
  assert("F4: flags de warning não tornam hasCriticalFlag = true (isolados)", !audit.diagnostics.unauthorizedAlternative && !audit.diagnostics.confidenceWeakened ? !audit.hasCriticalFlag : true);
}

// F5 — consistencyChecked = true somente quando richExplanationPathActivated E finalReply
{
  const auditActivated = buildExplanationConsistencyAudit({
    finalReply: "O iPhone 13 é excelente.",
    richExplanationPathActivated: true,
  });
  assert("F5: activated + reply → consistencyChecked = true", auditActivated.consistencyChecked === true);

  const auditNotActivated = buildExplanationConsistencyAudit({
    finalReply: "O iPhone 13 é excelente.",
    richExplanationPathActivated: false,
  });
  assert("F5: not activated → consistencyChecked = false", auditNotActivated.consistencyChecked === false);
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
