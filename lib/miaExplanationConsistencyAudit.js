/**
 * MIA Explanation Consistency Audit
 *
 * PATCH 5.5E — Auditoria de consistência entre explicação final e decisão original.
 *
 * Módulo EXCLUSIVAMENTE diagnóstico. Zero alterações de comportamento,
 * resposta, decisão, winner, ranking ou routing.
 *
 * Objetivo: detectar divergências entre o que a MIA verbalizou na explicação
 * pós-decisão e os dados originais da decisão (lastAxis, lastTradeoff,
 * lastDecisionReason, winner, subtipo ativo).
 *
 * Princípio: MIA owns the intelligence. Cognição deve ser inspecionável.
 *   - Não corrige texto.
 *   - Não altera prompt.
 *   - Apenas sinaliza inconsistências via flags auditáveis.
 *
 * Checagens cobertas:
 *   1. UNAUTHORIZED_ALTERNATIVE — reply sugere produto alternativo em contexto
 *      não-comparativo (EXPLANATION_REQUEST sem COMPARISON/REFINEMENT/NEW_SEARCH).
 *   2. AXIS_NOT_REFLECTED — reply não menciona os termos do eixo original
 *      quando decisionMemory estava disponível e reply é substancial.
 *   3. TRADEOFF_NOT_REFLECTED — reply ignora tradeoff original quando substancial.
 *   4. CONFIDENCE_WEAKENED — reply enfraquece a confiança em contexto de
 *      confidence_challenge (hedging, incerteza, sugestão implícita de troca).
 *   5. DECISION_MEMORY_IGNORED — reply é longo mas não reflete nem o eixo
 *      nem a consequência principal disponíveis na sessão.
 *   6. WINNER_ABSENT — reply substancial não menciona o winner em nenhuma forma.
 */

// ─────────────────────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────────────────────

function _normalize(str = "") {
  return String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extrai termos significativos (> minLen chars) de uma string normalizada.
 * Exclui stopwords funcionais.
 */
function _extractSignificantTerms(normalizedStr = "", minLen = 4) {
  const stopwords = new Set([
    "para", "com", "que", "quando", "mais", "uma", "esse", "essa",
    "este", "esta", "pelo", "pela", "como", "muito", "menos", "entre",
    "algo", "isso", "aqui", "onde", "qual", "quem", "deve", "pode",
    "pela", "pelo", "disso", "aquele", "aquela", "voce", "eles", "elas",
    "nesse", "nessa", "neste", "nesta", "desse", "dessa",
  ]);
  return normalizedStr
    .split(" ")
    .filter(t => t.length >= minLen && !stopwords.has(t));
}

/**
 * Verifica se pelo menos `threshold` fração dos termos aparece na string alvo.
 */
function _termsOverlap(terms = [], targetNormalized = "", threshold = 0.25) {
  if (terms.length === 0) return true; // sem termos → não há o que comparar
  const matchCount = terms.filter(t => targetNormalized.includes(t)).length;
  return matchCount / terms.length >= threshold;
}

// ─────────────────────────────────────────────────────────────
// FLAGS
// ─────────────────────────────────────────────────────────────

/**
 * Flags de inconsistência detectáveis pela auditoria.
 * Flags marcadas como CRITICAL indicam comportamento potencialmente incorreto
 * (ex.: winner sendo contraditado ou alternativa sendo oferecida sem autorização).
 */
export const EXPLANATION_CONSISTENCY_FLAGS = Object.freeze({
  /** Reply sugere alternativa de produto em contexto não-comparativo. [CRITICAL] */
  UNAUTHORIZED_ALTERNATIVE: "EXPLANATION_MENTIONS_UNAUTHORIZED_ALTERNATIVE",

  /** Reply não reflete o eixo/critério original da decisão. [WARNING] */
  AXIS_NOT_REFLECTED: "EXPLANATION_AXIS_NOT_REFLECTED",

  /** Reply não reflete o tradeoff original da decisão. [WARNING] */
  TRADEOFF_NOT_REFLECTED: "EXPLANATION_TRADEOFF_NOT_REFLECTED",

  /** Reply enfraquece a recomendação em contexto de confidence_challenge. [CRITICAL] */
  CONFIDENCE_WEAKENED: "EXPLANATION_CONFIDENCE_WEAKENED",

  /** Decision memory estava disponível mas reply não a reflete. [WARNING] */
  DECISION_MEMORY_IGNORED: "EXPLANATION_IGNORES_AVAILABLE_DECISION_MEMORY",

  /** Reply substancial não menciona o winner. [WARNING] */
  WINNER_ABSENT: "EXPLANATION_WINNER_NOT_MENTIONED",
});

/** Flags que representam problemas críticos (comportamento potencialmente incorreto). */
const CRITICAL_FLAGS = new Set([
  EXPLANATION_CONSISTENCY_FLAGS.UNAUTHORIZED_ALTERNATIVE,
  EXPLANATION_CONSISTENCY_FLAGS.CONFIDENCE_WEAKENED,
]);

// ─────────────────────────────────────────────────────────────
// Checadores individuais (funções puras)
// ─────────────────────────────────────────────────────────────

/**
 * Detecta oferta de alternativa não autorizada em contexto explicativo.
 *
 * Ativa quando:
 *   - turnType NÃO é COMPARISON / REFINEMENT / NEW_SEARCH (nesses casos alternativas são válidas)
 *   - Reply contém padrões semânticos de "sugestão suave de outro produto":
 *       A: "também é uma boa/excelente opção"
 *       B: "outra opção/alternativa seria"
 *       C: "se quiser ... outro/outra"
 *       D: "pode considerar (também|outro)"
 *       E: "em vez disso"
 *
 * NÃO detecta: "também é bom para câmera" (elogio do winner, não sugestão de troca).
 */
function _checkUnauthorizedAlternative(replyNorm, turnType) {
  const allowedAlternativeTypes = new Set(["COMPARISON", "REFINEMENT", "NEW_SEARCH", "COMPARISON_FOLLOWUP"]);
  if (allowedAlternativeTypes.has(turnType)) return false;

  // Sinal A — "também é uma boa/excelente opção" (sujeito implícito = outro produto)
  const signalA = /\btambem (e|seria) (uma?|um?) (boa|bom|excelente|otima|otimo|interessante) (opcao|alternativa|escolha)\b/.test(replyNorm);

  // Sinal B — "outra opção seria / alternativa seria"
  const signalB = /\boutra (opcao|alternativa|possibilidade)\b/.test(replyNorm);

  // Sinal C — "se quiser ... outro/outra" (oferecendo desvio do winner)
  const signalC = /\bse (voce|vc|quiser|preferir)\b.{0,50}\b(outro|outra|diferente)\b/.test(replyNorm);

  // Sinal D — "pode considerar também / outro"
  const signalD = /\bpode considerar (tambem|outro|outra|o |a )\b/.test(replyNorm);

  // Sinal E — "em vez disso" (desvio do produto original)
  const signalE = /\bem vez disso\b/.test(replyNorm);

  return signalA || signalB || signalC || signalD || signalE;
}

/**
 * Detecta quando o eixo original da decisão não é refletido na explicação.
 *
 * Condição de ativação (conservadora para evitar falsos positivos):
 *   - lastAxis disponível e não-vazio
 *   - Reply tem pelo menos 100 chars (explicação substancial)
 *   - NENHUM termo significativo (>4 chars) do lastAxis aparece no reply
 *
 * Exemplo: lastAxis = "performance" → "performance" deve aparecer na resposta.
 */
function _checkAxisNotReflected(replyNorm, lastAxis) {
  if (!lastAxis || !replyNorm || replyNorm.length < 100) return false;
  const axisNorm = _normalize(lastAxis);
  const axisTerms = _extractSignificantTerms(axisNorm, 4);
  if (axisTerms.length === 0) return false;
  return !_termsOverlap(axisTerms, replyNorm, 0.25); // ao menos 25% dos termos deve aparecer
}

/**
 * Detecta quando o tradeoff original não é refletido na explicação.
 *
 * Condição (mais conservadora — tradeoff é naturalmente mais específico):
 *   - lastTradeoff disponível e não-vazio
 *   - Reply tem pelo menos 150 chars
 *   - Menos de 15% dos termos significativos do tradeoff aparecem no reply
 *
 * Limiar baixo (15%) porque o LLM pode parafrasear o tradeoff.
 */
function _checkTradeoffNotReflected(replyNorm, lastTradeoff) {
  if (!lastTradeoff || !replyNorm || replyNorm.length < 150) return false;
  const tradeoffNorm = _normalize(lastTradeoff);
  const tradeoffTerms = _extractSignificantTerms(tradeoffNorm, 5);
  if (tradeoffTerms.length < 3) return false; // poucos termos → não há confiança suficiente
  return !_termsOverlap(tradeoffTerms, replyNorm, 0.15);
}

/**
 * Detecta quando a explicação enfraquece a confiança em contexto de confidence_challenge.
 *
 * Ativa SOMENTE quando subtype = "confidence_challenge".
 * Padrões semânticos de hedging/incerteza sobre a recomendação:
 *   A: "talvez eu/a MIA escolheria outro"
 *   B: "não tenho certeza"
 *   C: "poderia reconsiderar/ser outro"
 *   D: "mas talvez / mas dependendo"
 *   E: "se você preferir ... outro"
 */
function _checkConfidenceWeakened(replyNorm, subtype) {
  if (subtype !== "confidence_challenge") return false;

  // Sinal A — "talvez eu/ela escolheria outro"
  const signalA = /\btalvez (eu |ela |a mia )?escolheria (outro|outra|diferente)\b/.test(replyNorm);

  // Sinal B — "não tenho certeza" (admissão explícita de incerteza)
  const signalB = /\bnao (tenho|há|existe) certeza\b/.test(replyNorm);

  // Sinal C — "poderia (reconsiderar | ser outro | mudar)"
  const signalC = /\bpoderia (reconsiderar|mudar|ser outro|rever|considerar outro)\b/.test(replyNorm);

  // Sinal D — "mas talvez / porem dependendo / mas em alguns casos"
  const signalD = /\b(mas|porem|contudo|entretanto) (talvez|dependendo|em alguns casos|pode ser que)\b/.test(replyNorm);

  // Sinal E — "se você preferir ... outro produto"
  const signalE = /\bse (voce|vc) preferir\b.{0,40}\b(outro|outra|diferente|alternativo)\b/.test(replyNorm);

  return signalA || signalB || signalC || signalD || signalE;
}

/**
 * Detecta quando a decision memory disponível é completamente ignorada.
 *
 * Condição (conservadora):
 *   - hasAxis E hasConsequence (memória base completa)
 *   - Reply tem pelo menos 150 chars
 *   - NENHUM termo do lastAxis aparece no reply
 *   - E NENHUM termo do lastConsequence aparece no reply
 *
 * Ambas as condições devem ser verdadeiras (AND) para reduzir falsos positivos.
 */
function _checkDecisionMemoryIgnored(replyNorm, explanationCtx) {
  if (!explanationCtx) return false;
  if (!explanationCtx.hasAxis || !explanationCtx.hasConsequence) return false;
  if (!replyNorm || replyNorm.length < 150) return false;

  const axisNorm = _normalize(explanationCtx.lastAxis || "");
  const consequenceNorm = _normalize(explanationCtx.lastConsequence || "");

  const axisTerms = _extractSignificantTerms(axisNorm, 4);
  const consequenceTerms = _extractSignificantTerms(consequenceNorm, 5);

  const axisAbsent = axisTerms.length > 0 && !_termsOverlap(axisTerms, replyNorm, 0.25);
  const consequenceAbsent = consequenceTerms.length > 0 && !_termsOverlap(consequenceTerms, replyNorm, 0.15);

  return axisAbsent && consequenceAbsent;
}

/**
 * Detecta quando reply substancial não menciona o winner em nenhuma forma.
 *
 * Condição:
 *   - winnerName disponível e não-vazio
 *   - Reply tem pelo menos 100 chars
 *   - NENHUM termo do winnerName aparece no reply
 *
 * Falso positivo esperado: quando LLM usa apenas pronomes ("ele", "esse").
 * Por isso este flag é WARNING, não CRITICAL.
 */
function _checkWinnerAbsent(replyNorm, winnerName) {
  if (!winnerName || !replyNorm || replyNorm.length < 100) return false;
  const winnerNorm = _normalize(winnerName);
  const winnerTerms = _extractSignificantTerms(winnerNorm, 3);
  if (winnerTerms.length === 0) return false;
  return !_termsOverlap(winnerTerms, replyNorm, 0.5);
}

// ─────────────────────────────────────────────────────────────
// Construtor de auditoria (função pura, testável)
// ─────────────────────────────────────────────────────────────

/**
 * Monta o objeto de auditoria de consistência da explicação pós-decisão.
 *
 * Função pura — não produz side effects, não lança exceção, nunca retorna null.
 *
 * Só executa checagens quando richExplanationPathActivated = true.
 * Quando o caminho rico não foi ativado, retorna { consistencyChecked: false }.
 *
 * @param {object} input
 * @param {string}  [input.finalReply]                 — texto da resposta final
 * @param {object}  [input.explanationCtx]             — resultado de buildExplanationContext
 * @param {string}  [input.winnerName]                 — nome do produto winner oficial
 * @param {object}  [input.cognitiveTurn]              — resultado de classifyMiaTurn
 * @param {string}  [input.turnType]                   — override de turnType (opcional)
 * @param {string}  [input.decisionExplanationSubtype] — override de subtype (opcional)
 * @param {boolean} [input.richExplanationPathActivated]
 * @returns {object} audit de consistência
 */
export function buildExplanationConsistencyAudit(input = {}) {
  const safeInput = (input && typeof input === "object") ? input : {};
  const {
    finalReply = "",
    explanationCtx = null,
    winnerName = "",
    cognitiveTurn = null,
    turnType = null,
    decisionExplanationSubtype = null,
    richExplanationPathActivated = false,
  } = safeInput;

  const _turnType = turnType || cognitiveTurn?.turnType || null;
  const _subtype  = decisionExplanationSubtype ||
                    cognitiveTurn?.signals?.decisionExplanation?.subtype || null;

  // Só auditar quando o rich explanation path foi ativado e há reply
  if (!richExplanationPathActivated || !finalReply) {
    return {
      auditVersion: "5.5E",
      consistencyChecked: false,
      reason: richExplanationPathActivated ? "no_final_reply" : "rich_explanation_path_not_activated",
      turnType: _turnType,
      decisionExplanationSubtype: _subtype,
      flags: [],
      hasCriticalFlag: false,
      isConsistent: true,
      diagnostics: {
        unauthorizedAlternative: false,
        axisNotReflected:        false,
        tradeoffNotReflected:    false,
        confidenceWeakened:      false,
        decisionMemoryIgnored:   false,
        winnerAbsent:            false,
      },
    };
  }

  const replyNorm = _normalize(finalReply);
  const flags = [];

  // ── Checagem 1: Alternativa não autorizada ────────────────
  const unauthorizedAlternative = _checkUnauthorizedAlternative(replyNorm, _turnType);
  if (unauthorizedAlternative) flags.push(EXPLANATION_CONSISTENCY_FLAGS.UNAUTHORIZED_ALTERNATIVE);

  // ── Checagem 2: Eixo não refletido ───────────────────────
  const axisNotReflected = _checkAxisNotReflected(replyNorm, explanationCtx?.lastAxis);
  if (axisNotReflected) flags.push(EXPLANATION_CONSISTENCY_FLAGS.AXIS_NOT_REFLECTED);

  // ── Checagem 3: Tradeoff não refletido ───────────────────
  const tradeoffNotReflected = _checkTradeoffNotReflected(replyNorm, explanationCtx?.lastTradeoff);
  if (tradeoffNotReflected) flags.push(EXPLANATION_CONSISTENCY_FLAGS.TRADEOFF_NOT_REFLECTED);

  // ── Checagem 4: Confidence enfraquecida ──────────────────
  const confidenceWeakened = _checkConfidenceWeakened(replyNorm, _subtype);
  if (confidenceWeakened) flags.push(EXPLANATION_CONSISTENCY_FLAGS.CONFIDENCE_WEAKENED);

  // ── Checagem 5: Decision memory ignorada ─────────────────
  const decisionMemoryIgnored = _checkDecisionMemoryIgnored(replyNorm, explanationCtx);
  if (decisionMemoryIgnored) flags.push(EXPLANATION_CONSISTENCY_FLAGS.DECISION_MEMORY_IGNORED);

  // ── Checagem 6: Winner ausente ───────────────────────────
  const winnerAbsent = _checkWinnerAbsent(replyNorm, winnerName);
  if (winnerAbsent) flags.push(EXPLANATION_CONSISTENCY_FLAGS.WINNER_ABSENT);

  const hasCriticalFlag = flags.some(f => CRITICAL_FLAGS.has(f));

  return {
    auditVersion: "5.5E",
    consistencyChecked: true,
    turnType: _turnType,
    decisionExplanationSubtype: _subtype,
    winnerName: winnerName || null,
    flags,
    hasCriticalFlag,
    isConsistent: flags.length === 0,
    diagnostics: {
      unauthorizedAlternative,
      axisNotReflected,
      tradeoffNotReflected,
      confidenceWeakened,
      decisionMemoryIgnored,
      winnerAbsent,
    },
  };
}
