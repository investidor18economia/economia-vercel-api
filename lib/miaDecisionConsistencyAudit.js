/**
 * PATCH 4.5 — Decision Consistency Audit (logging only, no behavior change).
 * Enable: MIA_DECISION_AUDIT=true (or included in pipeline trace when MIA_DEBUG=true)
 */

function normalizeNameKey(name = "") {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pickName(product) {
  if (!product) return null;
  return (
    product.product_name ||
    product.title ||
    product.official_name ||
    product ||
    null
  );
}

export function extractMentionedProductFromReply(reply = "") {
  const text = String(reply || "");
  const patterns = [
    /eu iria no\s+([^\n.,!?]+)/i,
    /eu compraria\s+([^\n.,!?]+)/i,
    /recomendo\s+(?:o|a)?\s*([^\n.,!?]+)/i,
    /sobre o\s+([^\n.,!?]+)/i,
    /pensando em[^:]*:\s*\n*\s*([^\n]+)/i
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return m[1].trim().slice(0, 120);
  }
  return null;
}

function namesDiverge(a = "", b = "") {
  const ka = normalizeNameKey(a);
  const kb = normalizeNameKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return false;
  return !(ka.includes(kb) || kb.includes(ka));
}

export function isDecisionConsistencyAuditEnabled() {
  return (
    process.env.MIA_DECISION_AUDIT === "true" ||
    process.env.MIA_DEBUG === "true"
  );
}

/**
 * Build audit snapshot from response payload + trace extras (read-only).
 */
export function buildDecisionConsistencySnapshot({
  payload = {},
  responsePath = "",
  routingDecision = {},
  sessionBefore = null,
  extraTrace = {}
} = {}) {
  const rd = routingDecision || {};
  const prices = Array.isArray(payload.prices) ? payload.prices : [];
  const reply = String(payload.reply || "");

  const anchorProduct =
    pickName(rd.anchorProduct) ||
    pickName(sessionBefore?.lastBestProduct) ||
    pickName(extraTrace.anchor_product_before) ||
    null;

  const rankingWinner =
    extraTrace.ranking_winner ||
    extraTrace.winner_product ||
    pickName(prices[0]) ||
    null;

  const decisionEngineWinner =
    extraTrace.decision_engine_winner ||
    (extraTrace.winner_source?.includes("decision")
      ? extraTrace.winner_product
      : null) ||
    null;

  const winnerReal =
    extraTrace.winner_real ||
    extraTrace.final_response_product ||
    extraTrace.active_product_after ||
    pickName(payload.session_context?.lastBestProduct) ||
    rankingWinner;

  const winnerExibido = pickName(prices[0]) || null;
  const winnerVerbalizado =
    extractMentionedProductFromReply(reply) || winnerReal;

  const formatterUsed =
    extraTrace.formatter_used ||
    extraTrace.verbalizer_level ||
    extraTrace.winner_source ||
    null;

  const templateUsed =
    extraTrace.template_used ||
    extraTrace.response_path ||
    responsePath ||
    null;

  const reasoningFieldsUsed =
    extraTrace.reasoning_fields_used ||
    extraTrace.ranking_reason ||
    extraTrace.mia_reasoning_profile_keys ||
    null;

  const snapshot = {
    winner_real: winnerReal,
    winner_exibido: winnerExibido,
    winner_verbalizado: winnerVerbalizado,
    anchor_product: anchorProduct,
    reasoning_fields_used: reasoningFieldsUsed,
    formatter_used: formatterUsed,
    template_used: templateUsed,
    response_path: responsePath || extraTrace.responsePath || null,
    ranking_winner: rankingWinner,
    decision_engine_winner: decisionEngineWinner,
    final_response_product:
      extraTrace.final_response_product || winnerReal,
    routing_mode: rd.mode || null,
    context_action: extraTrace.context_action || null,
    winner_source: extraTrace.winner_source || null,
    contract_applied: extraTrace.contractApplied ?? null,
    anchor_preserved: extraTrace.anchorPreserved ?? null,
    winner_changed: extraTrace.winnerChanged ?? null,
    divergences: []
  };

  if (namesDiverge(winnerReal, winnerVerbalizado)) {
    snapshot.divergences.push("winner_real_vs_verbalizado");
  }
  if (namesDiverge(winnerExibido, winnerVerbalizado) && winnerExibido) {
    snapshot.divergences.push("winner_exibido_vs_verbalizado");
  }
  const intentionalPriorityShift =
    extraTrace.template_used === "priority_followup_new_reference";

  if (
    namesDiverge(anchorProduct, winnerVerbalizado) &&
    anchorProduct &&
    !intentionalPriorityShift
  ) {
    snapshot.divergences.push("anchor_vs_verbalizado");
  }
  if (namesDiverge(decisionEngineWinner, winnerVerbalizado) && decisionEngineWinner) {
    snapshot.divergences.push("decision_engine_vs_verbalizado");
  }
  if (namesDiverge(rankingWinner, winnerReal) && rankingWinner && winnerReal) {
    snapshot.divergences.push("ranking_winner_vs_winner_real");
  }

  return snapshot;
}

export function logDecisionConsistencyAudit(snapshot) {
  if (!isDecisionConsistencyAuditEnabled()) return;
  console.log(
    "🔬 MIA_DECISION_CONSISTENCY_AUDIT",
    JSON.stringify(snapshot, null, 2)
  );
}

export function attachDecisionConsistencyToTrace(extraTrace = {}, snapshot = {}) {
  if (!isDecisionConsistencyAuditEnabled()) return extraTrace;
  return {
    ...extraTrace,
    decisionConsistencyAudit: snapshot
  };
}
