/**
 * MIA Cognitive Explanation Path
 *
 * PATCH 5.3 — Caminho rico de explicação ancorada para EXPLANATION_REQUEST.
 *
 * Helpers puros e testáveis. Não controlam fluxo, não geram texto fixo,
 * não contêm respostas prontas. Fornecem sinais de contexto extraídos
 * da sessão para que o LLM verbalize a explicação da recomendação.
 *
 * Princípio (docs/mia_engineering_rules_md_complete.md):
 *   - MIA owns the intelligence. The LLM only verbalizes.
 *   - Dados de sessão (critério, consequência, tradeoff) são insumos.
 *   - O LLM gera a explicação. A MIA decide se o caminho é ativado.
 *   - Nenhum texto de resposta fixo neste módulo.
 */

// ─────────────────────────────────────────────────────────────
// Seletor de caminho
// ─────────────────────────────────────────────────────────────

/**
 * Retorna true se o routingDecision indica o caminho de explicação ancorada.
 *
 * A condição é: mode === "cognitive_anchor_hold", setado pelo PATCH 5.2B
 * (applyIntentPreservation) quando turnType é EXPLANATION_REQUEST com
 * âncora ativa e confidence suficiente.
 *
 * Não é necessário verificar o turnType aqui — o mode já codifica essa
 * decisão e foi validado upstream com todos os guards de segurança.
 *
 * @param {object} routingDecision
 * @returns {boolean}
 */
export function shouldUseRichExplanationPath(routingDecision = {}) {
  return routingDecision?.mode === "cognitive_anchor_hold";
}

// ─────────────────────────────────────────────────────────────
// Construtor de contexto de explicação
// ─────────────────────────────────────────────────────────────

/**
 * Extrai e normaliza os sinais de contexto da sessão necessários para
 * o prompt de explicação ancorada.
 *
 * Retorna um objeto plano com campos seguros (nunca null/undefined).
 * O texto do prompt é montado no handler usando esses dados —
 * este módulo não gera texto de resposta.
 *
 * Campos retornados:
 *   - anchorTitle           — nome do produto âncora (resolvido de múltiplas fontes)
 *   - lastAxis              — critério/eixo principal da recomendação anterior
 *   - lastConsequence       — argumento central / consequência prática
 *   - lastTradeoff          — tradeoff identificado na recomendação
 *   - lastDecisionReason    — motivo objetivo da decisão (PATCH 5.5)
 *   - lastWinnerAdvantages  — vantagens reais do winner (PATCH 5.5)
 *   - lastWinnerSacrifices  — perdas/tradeoffs reais do winner (PATCH 5.5)
 *   - hasAxis               — true se o critério existia na sessão (para audit)
 *   - hasConsequence        — true se havia argumento (para audit)
 *   - hasTradeoff           — true se havia tradeoff (para audit)
 *   - hasDecisionReason     — true se há motivo da decisão (PATCH 5.5, para audit)
 *   - winnerAdvantagesCount — número de vantagens disponíveis (PATCH 5.5, para audit)
 *   - winnerSacrificesCount — número de sacrifícios disponíveis (PATCH 5.5, para audit)
 *
 * @param {object} sessionContext   — estado da sessão atual
 * @param {string} [preferredProductName] — nome do produto âncora já resolvido
 * @param {string} [activePriority]       — prioridade ativa do usuário
 * @returns {{ anchorTitle, lastAxis, lastConsequence, lastTradeoff,
 *             lastDecisionReason, lastWinnerAdvantages, lastWinnerSacrifices,
 *             hasAxis, hasConsequence, hasTradeoff, hasDecisionReason,
 *             winnerAdvantagesCount, winnerSacrificesCount }}
 */
export function buildExplanationContext(
  sessionContext = {},
  preferredProductName = "",
  activePriority = ""
) {
  // Produto âncora: prioridade para o nome já resolvido pelo handler,
  // fallback para sessionContext, depois placeholder seguro.
  const anchorTitle =
    preferredProductName ||
    sessionContext?.lastBestProduct?.product_name ||
    "produto recomendado";

  // Critério principal: lastAxis é o eixo de decisão (ex: "bateria", "desempenho").
  // Fallback para lastPriority (alias semântico) e depois activePriority.
  const lastAxis =
    sessionContext?.lastAxis ||
    sessionContext?.lastPriority ||
    activePriority ||
    "";

  // Consequência prática gerada no momento da recomendação anterior.
  const lastConsequence = sessionContext?.lastMainConsequence || "";

  // Tradeoff identificado na recomendação anterior.
  const lastTradeoff = sessionContext?.lastTradeoff || "";

  // PATCH 5.5 — motivo objetivo da decisão (derivado de eixo + consequência no pipeline)
  const lastDecisionReason = sessionContext?.lastDecisionReason || "";

  // PATCH 5.5 — vantagens e sacrifícios reais do winner (derivados de score signals)
  const lastWinnerAdvantages = Array.isArray(sessionContext?.lastWinnerAdvantages)
    ? sessionContext.lastWinnerAdvantages
    : [];
  const lastWinnerSacrifices = Array.isArray(sessionContext?.lastWinnerSacrifices)
    ? sessionContext.lastWinnerSacrifices
    : [];

  return {
    anchorTitle,
    lastAxis,
    lastConsequence,
    lastTradeoff,
    lastDecisionReason,
    lastWinnerAdvantages,
    lastWinnerSacrifices,
    // Sinais de qualidade — usados para audit e para o handler inferir
    // se o contexto é rico o suficiente para instruir o LLM com precisão.
    hasAxis:            !!(sessionContext?.lastAxis || sessionContext?.lastPriority),
    hasConsequence:     !!(sessionContext?.lastMainConsequence),
    hasTradeoff:        !!(sessionContext?.lastTradeoff),
    // PATCH 5.5 — audit fields
    hasDecisionReason:    !!(sessionContext?.lastDecisionReason),
    winnerAdvantagesCount: lastWinnerAdvantages.length,
    winnerSacrificesCount: lastWinnerSacrifices.length,
  };
}
