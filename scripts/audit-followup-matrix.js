/**
 * Follow-up context matrix audit — flows A–G (read-only)
 * Usage: node scripts/audit-followup-matrix.js
 */

const API = "http://localhost:3000/api/chat-gpt4o";
const KEY = "minha_chave_181199";

const FLOWS = {
  A: [
    "uso o celular direto pra editar conteudo",
    "explica melhor"
  ],
  B: [
    "uso o celular direto pra editar conteudo",
    "qual a principal desvantagem?"
  ],
  C: [
    "uso o celular direto pra editar conteudo",
    "e a bateria?"
  ],
  D: [
    "uso o celular direto pra editar conteudo",
    "e a camera?"
  ],
  E: [
    "uso o celular direto pra editar conteudo",
    "mas quero economizar mais",
    "explica melhor"
  ],
  F: [
    "uso o celular direto pra editar conteudo",
    "mas quero economizar mais",
    "e a bateria?"
  ],
  G: [
    "uso o celular direto pra editar conteudo",
    "mas quero economizar mais",
    "qual a principal desvantagem?"
  ]
};

function pickBestProduct(p) {
  if (!p) return null;
  if (typeof p === "string") return p;
  return p.product_name || p.title || p.official_name || null;
}

function pickSession(sc = {}) {
  return {
    lastAxis: sc.lastAxis ?? null,
    lastBestProduct: pickBestProduct(sc.lastBestProduct),
    lastMainConsequence: sc.lastMainConsequence ?? null,
    lastPriority: sc.lastPriority ?? null,
    lastIntent: sc.lastIntent ?? null,
    lastInteractionType: sc.lastInteractionType ?? null,
    comparisonContextLocked: sc.comparisonContextLocked ?? false,
    lastComparisonProductsCount: Array.isArray(sc.lastComparisonProducts)
      ? sc.lastComparisonProducts.length
      : 0
  };
}

function pickRouting(data) {
  const cs = data.mia_debug?.conversationalState || {};
  const dbg = data.mia_debug || {};
  return {
    conversationalState: Object.keys(cs).length ? cs : null,
    strategy: cs.strategy || cs.verbPayloadStrategy || null,
    verbalizerLevel: cs.verbalizerLevel || null,
    winner: dbg.winner || dbg.bestProduct || cs.lastRecommended || null,
    comparisonRenderMode: dbg.comparisonRenderMode || null,
    axis: dbg.axis || null,
    searchBehaviorMode: dbg.searchCognition?.behaviorMode || dbg.behaviorMode || null,
    miaDebugKeys: Object.keys(dbg)
  };
}

function inferLockedComparisonFollowUp(sessionIn, sessionOut, routing, query) {
  const cs = routing.conversationalState;
  if (cs && Object.keys(cs).length > 0) return false;
  if (sessionOut.lastInteractionType === "comparison_followup") return true;
  if (sessionOut.comparisonContextLocked && sessionOut.lastComparisonProductsCount >= 2) {
    const isSearch = sessionOut.lastInteractionType === "search";
    if (!isSearch) return true;
  }
  if (routing.comparisonRenderMode) return true;
  if (sessionOut.lastIntent === "comparison" && sessionOut.lastComparisonProductsCount >= 2) {
    return sessionOut.lastInteractionType !== "search";
  }
  return false;
}

function replySnippet(t, n = 160) {
  return String(t || "").replace(/\s+/g, " ").trim().slice(0, n);
}

function contextPreserved(sessionIn, sessionOut, routing, turnIndex, prevBest) {
  const inBest = pickBestProduct(sessionIn.lastBestProduct) || prevBest;
  const outBest = pickBestProduct(sessionOut.lastBestProduct);
  const winner = routing.winner;
  const issues = [];

  if (turnIndex === 0) return { ok: true, issues: [] };

  if (inBest && outBest && inBest !== outBest) {
    issues.push(`lastBestProduct changed: ${inBest} → ${outBest}`);
  }
  if (inBest && winner && winner !== inBest && !String(winner).includes(String(inBest).split(" ").slice(-2).join(" "))) {
    const wNorm = String(winner).toLowerCase();
    const inNorm = String(inBest).toLowerCase();
    if (!wNorm.includes(inNorm.split(" ").slice(-1)[0]?.slice(0, 4) || "___") && !inNorm.includes(wNorm.split(" ").slice(-1)[0]?.slice(0, 4) || "___")) {
      issues.push(`winner diverges from session IN product: ${inBest} vs ${winner}`);
    }
  }
  if (sessionIn.lastMainConsequence && !sessionOut.lastMainConsequence) {
    issues.push("lastMainConsequence lost");
  }
  if (sessionIn.lastAxis && !sessionOut.lastAxis) {
    issues.push("lastAxis lost");
  }

  return { ok: issues.length === 0, issues };
}

async function call(text, sessionContext, messages) {
  const resp = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY },
    body: JSON.stringify({
      text,
      user_id: "audit-matrix",
      conversation_id: `audit-flow-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      messages,
      session_context: sessionContext || {}
    })
  });
  return { status: resp.status, data: await resp.json() };
}

async function runFlow(flowId, turns) {
  let sessionContext = {};
  let messages = [];
  const results = [];
  let prevBest = null;

  for (let i = 0; i < turns.length; i++) {
    const query = turns[i];
    const sessionIn = pickSession(sessionContext);
    const { status, data } = await call(query, sessionContext, messages);
    const sessionOut = pickSession(data.session_context || {});
    const routing = pickRouting(data);
    const lockedComparisonFollowUp = inferLockedComparisonFollowUp(
      sessionIn,
      sessionOut,
      routing,
      query
    );
    const preservation = contextPreserved(sessionIn, sessionOut, routing, i, prevBest);

    if (sessionOut.lastBestProduct) prevBest = sessionOut.lastBestProduct;

    results.push({
      turn: i + 1,
      query,
      httpStatus: status,
      sessionIn,
      sessionOut,
      lockedComparisonFollowUp,
      routing,
      reply: replySnippet(data.reply, 200),
      preservation
    });

    sessionContext = data.session_context || sessionContext;
    messages.push({ role: "user", content: query });
    if (data.reply) messages.push({ role: "assistant", content: data.reply });
  }

  return { flowId, turns, results };
}

async function main() {
  const all = {};

  for (const [flowId, turns] of Object.entries(FLOWS)) {
    console.error(`Running flow ${flowId}...`);
    all[flowId] = await runFlow(flowId, turns);
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(JSON.stringify(all, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
