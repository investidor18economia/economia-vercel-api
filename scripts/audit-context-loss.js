/**
 * Audit script — 3-turn context loss flow (read-only diagnostic)
 * Usage: node scripts/audit-context-loss.js
 */

const API = "http://localhost:3000/api/chat-gpt4o";
const KEY = "minha_chave_181199";

const TURNS = [
  "uso o celular direto pra editar conteudo",
  "mas quero economizar mais",
  "qual a principal desvantagem?"
];

async function call(text, sessionContext, messages) {
  const body = {
    text,
    user_id: "audit-guest",
    conversation_id: "audit-context-loss-1",
    messages,
    session_context: sessionContext || {}
  };
  const resp = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY },
    body: JSON.stringify(body)
  });
  const data = await resp.json();
  return { status: resp.status, data };
}

function pickSession(sc) {
  if (!sc) return null;
  return {
    lastRecommended: sc.lastBestProduct?.product_name || sc.lastBestProduct?.title || sc.lastBestProduct?.official_name || sc.lastBestProduct || null,
    lastProducts: (sc.lastProducts || []).slice(0, 3).map(p => p?.product_name || p?.title || p?.official_name || p),
    lastAxis: sc.lastAxis,
    lastArchetype: sc.lastArchetype,
    lastBehaviorMode: sc.lastBehaviorMode,
    lastMainConsequence: sc.lastMainConsequence,
    lastTradeoff: sc.lastTradeoff,
    lastPriority: sc.lastPriority,
    lastIntent: sc.lastIntent,
    lastInteractionType: sc.lastInteractionType,
    lastConversationalIntent: sc.lastConversationalIntent,
    lastCategory: sc.lastCategory
  };
}

function pickDebug(dbg) {
  if (!dbg) return null;
  const cs = dbg.conversationalState || {};
  return {
    conversationalState: cs,
    searchBehaviorMode: dbg.searchBehaviorMode,
    behaviorMode: dbg.behaviorMode,
    comparisonRenderMode: dbg.comparisonRenderMode,
    lockedComparisonFollowUp: dbg.lockedComparisonFollowUp,
    contextResolutionMode: dbg.contextResolutionMode,
    bestProduct: dbg.bestProduct || dbg.winner || null
  };
}

function replySnippet(reply, n = 220) {
  return String(reply || "").replace(/\s+/g, " ").slice(0, n);
}

async function main() {
  let sessionContext = {};
  let messages = [];

  for (let i = 0; i < TURNS.length; i++) {
    const text = TURNS[i];
    console.log("\n" + "=".repeat(80));
    console.log(`TURN ${i + 1}: "${text}"`);
    console.log("=".repeat(80));

    console.log("\n--- SESSION IN (before request) ---");
    console.log(JSON.stringify(pickSession(sessionContext), null, 2));

    const { status, data } = await call(text, sessionContext, messages);
    console.log("\n--- HTTP ---");
    console.log("status:", status);

    console.log("\n--- REPLY (snippet) ---");
    console.log(replySnippet(data.reply));

    console.log("\n--- SESSION OUT ---");
    console.log(JSON.stringify(pickSession(data.session_context), null, 2));

    console.log("\n--- MIA_DEBUG (subset) ---");
    console.log(JSON.stringify(pickDebug(data.mia_debug), null, 2));

    if (data.mia_debug?.conversationalState) {
      console.log("\n--- CONVERSATIONAL STATE (full) ---");
      console.log(JSON.stringify(data.mia_debug.conversationalState, null, 2));
    }

    if (data.mia_debug?.verbPayloadStrategy || data.mia_debug?.verbalizerLevel) {
      console.log("\n--- VERBALIZER META ---");
      console.log(JSON.stringify({
        verbalizerLevel: data.mia_debug.conversationalState?.verbalizerLevel,
        verbPayloadStrategy: data.mia_debug.conversationalState?.verbPayloadStrategy
      }, null, 2));
    }

    // Update for next turn
    if (data.session_context) sessionContext = data.session_context;
    messages.push({ role: "user", content: text });
    if (data.reply) messages.push({ role: "assistant", content: data.reply });
  }
}

main().catch((e) => {
  console.error("AUDIT FAILED:", e);
  process.exit(1);
});
