/**
 * PATCH 4.5 — Decision Consistency Audit
 * Requires: npm run dev, MIA_DEBUG=true (or MIA_DECISION_AUDIT=true)
 * Usage: node scripts/audit-patch45-decision-consistency.js
 */
const API = "http://localhost:3000/api/chat-gpt4o";
const KEY = "minha_chave_181199";

const SCENARIOS = {
  A: ["celular até 2.000", "vale a pena?"],
  B: ["celular até 2.000", "loucura"],
  C: ["celular até 2.000", "quero mais bateria"],
  D: ["iPhone 13 ou S23 FE", "e a bateria?"]
};

function pickName(p) {
  if (!p) return null;
  if (typeof p === "string") return p;
  return p.product_name || p.title || null;
}

function pickAudit(data) {
  const pt = data?.mia_debug?.pipelineTrace || {};
  const dca = pt.decisionConsistencyAudit || {};
  return {
    responsePath: pt.responsePath || pt.response_path || null,
    routingMode: pt.routingDecision?.mode || dca.routing_mode || null,
    contextAction: pt.context_action || dca.context_action || null,
    winnerReal: dca.winner_real || pt.winner_product || null,
    winnerExibido: dca.winner_exibido || pickName(data.prices?.[0]) || null,
    winnerVerbalizado: dca.winner_verbalizado || null,
    anchorProduct: dca.anchor_product || pt.anchor_product_after || null,
    rankingWinner: dca.ranking_winner || null,
    decisionEngineWinner: dca.decision_engine_winner || null,
    formatterUsed: dca.formatter_used || null,
    templateUsed: dca.template_used || null,
    reasoningFields: dca.reasoning_fields_used || pt.ranking_reason || null,
    divergences: dca.divergences || [],
    lastBest: pickName(data.session_context?.lastBestProduct),
    prices: (data.prices || []).slice(0, 3).map(pickName).filter(Boolean),
    reply: String(data.reply || "").replace(/\s+/g, " ").trim().slice(0, 220)
  };
}

async function call(text, sessionContext, messages) {
  const resp = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY },
    body: JSON.stringify({
      text,
      user_id: "audit-patch45",
      conversation_id: `audit-p45-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      messages,
      session_context: sessionContext || {}
    })
  });
  return { status: resp.status, data: await resp.json() };
}

async function runScenario(id, turns) {
  console.log("\n" + "═".repeat(72));
  console.log(`SCENARIO ${id}`);
  console.log("═".repeat(72));

  let sessionContext = {};
  let messages = [];
  const report = [];

  for (let i = 0; i < turns.length; i++) {
    const text = turns[i];
    const anchorBefore = pickName(sessionContext.lastBestProduct);
    const { status, data } = await call(text, sessionContext, messages);
    const audit = pickAudit(data);

    console.log(`\n--- Turn ${i + 1}: "${text}" ---`);
    console.log("HTTP", status);
    console.log("reply:", audit.reply);
    console.log("prices:", audit.prices.join(" | ") || "(none)");
    console.log("audit:", JSON.stringify(audit, null, 2));

    report.push({ turn: i + 1, query: text, anchorBefore, ...audit });

    if (data.session_context) sessionContext = data.session_context;
    messages.push({ role: "user", content: text });
    if (data.reply) messages.push({ role: "assistant", content: data.reply });
  }

  return report;
}

async function main() {
  const all = {};
  for (const [id, turns] of Object.entries(SCENARIOS)) {
    all[id] = await runScenario(id, turns);
  }

  console.log("\n" + "═".repeat(72));
  console.log("SUMMARY — DIVERGENCES");
  console.log("═".repeat(72));

  for (const [id, turns] of Object.entries(all)) {
    const hits = turns.filter((t) => (t.divergences || []).length > 0);
    console.log(`\n${id}: ${hits.length} turn(s) with divergence`);
    for (const h of hits) {
      console.log(
        `  turn ${h.turn} "${h.query}": ${h.divergences.join(", ")} | path=${h.responsePath} | verbal=${h.winnerVerbalizado} | anchor=${h.anchorProduct} | best=${h.lastBest}`
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
