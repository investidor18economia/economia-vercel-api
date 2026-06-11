/**
 * Extended audit — full session_context each turn
 */
const API = "http://localhost:3000/api/chat-gpt4o";
const KEY = "minha_chave_181199";
const TURNS = [
  "uso o celular direto pra editar conteudo",
  "mas quero economizar mais",
  "qual a principal desvantagem?"
];

async function call(text, sessionContext, messages) {
  const resp = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY },
    body: JSON.stringify({
      text,
      user_id: "audit-guest",
      conversation_id: "audit-context-loss-2",
      messages,
      session_context: sessionContext || {}
    })
  });
  return resp.json();
}

async function main() {
  let sessionContext = {};
  let messages = [];

  for (let i = 0; i < TURNS.length; i++) {
    const text = TURNS[i];
    console.log("\n" + "=".repeat(80));
    console.log(`TURN ${i + 1}: "${text}"`);
    console.log("=".repeat(80));
    console.log("\n--- SESSION IN (selected) ---");
    console.log(JSON.stringify({
      lastBestProduct: sessionContext.lastBestProduct,
      lastAxis: sessionContext.lastAxis,
      lastMainConsequence: sessionContext.lastMainConsequence,
      lastTradeoff: sessionContext.lastTradeoff,
      lastPriority: sessionContext.lastPriority,
      lastIntent: sessionContext.lastIntent,
      lastInteractionType: sessionContext.lastInteractionType,
      comparisonContextLocked: sessionContext.comparisonContextLocked,
      lastComparisonProducts: sessionContext.lastComparisonProducts,
      lastProducts: (sessionContext.lastProducts || []).map(p => p?.product_name || p)
    }, null, 2));

    const data = await call(text, sessionContext, messages);
    console.log("\n--- REPLY (first 300 chars) ---");
    console.log(String(data.reply || "").slice(0, 300));
    console.log("\n--- SESSION OUT (selected) ---");
    const sc = data.session_context || {};
    console.log(JSON.stringify({
      lastBestProduct: sc.lastBestProduct,
      lastAxis: sc.lastAxis,
      lastMainConsequence: sc.lastMainConsequence,
      lastTradeoff: sc.lastTradeoff,
      lastPriority: sc.lastPriority,
      lastIntent: sc.lastIntent,
      lastInteractionType: sc.lastInteractionType,
      comparisonContextLocked: sc.comparisonContextLocked,
      lastComparisonProducts: sc.lastComparisonProducts,
      lastProducts: (sc.lastProducts || []).map(p => p?.product_name || p)
    }, null, 2));
    console.log("\n--- MIA_DEBUG ---");
    console.log(JSON.stringify(data.mia_debug, null, 2));

    sessionContext = data.session_context || sessionContext;
    messages.push({ role: "user", content: text });
    if (data.reply) messages.push({ role: "assistant", content: data.reply });
  }
}

main().catch(console.error);
