/**
 * Cenário observado: celular até 2.000 → vale a pena? → loucura
 * Usage: node scripts/audit-incoherence-scenario.js
 */
const API = "http://localhost:3000/api/chat-gpt4o";
const KEY = "minha_chave_181199";

const TURNS = ["celular até 2.000", "vale a pena?", "loucura"];

async function call(text, sessionContext, messages) {
  const body = {
    text,
    user_id: "audit-guest",
    conversation_id: "audit-incoherence-1",
    messages,
    session_context: sessionContext || {}
  };
  const resp = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY },
    body: JSON.stringify(body)
  });
  return { status: resp.status, data: await resp.json() };
}

function pickTrace(data) {
  return data?.mia_debug?.pipelineTrace || null;
}

async function main() {
  let sessionContext = {};
  let messages = [];

  for (let i = 0; i < TURNS.length; i++) {
    const text = TURNS[i];
    console.log("\n" + "=".repeat(72));
    console.log(`TURN ${i + 1}: "${text}"`);
    const { status, data } = await call(text, sessionContext, messages);
    console.log("HTTP", status);
    console.log("reply:", String(data.reply || "").slice(0, 280));
    console.log(
      "prices:",
      (data.prices || []).map((p) => p.product_name).join(" | ")
    );
    console.log(
      "session lastBest:",
      data.session_context?.lastBestProduct?.product_name || "(none)"
    );
    console.log("pipelineTrace:", JSON.stringify(pickTrace(data), null, 2));

    if (data.session_context) sessionContext = data.session_context;
    messages.push({ role: "user", content: text });
    if (data.reply) messages.push({ role: "assistant", content: data.reply });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
