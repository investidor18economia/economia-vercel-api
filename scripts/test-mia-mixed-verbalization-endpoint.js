/**
 * PATCH 11A.6 — Mixed verbalization endpoint validation
 * Usage: MIA_DEBUG=true npm run dev (separate terminal), then:
 *        node scripts/test-mia-mixed-verbalization-endpoint.js
 */

const API = process.env.MIA_API_BASE
  ? `${process.env.MIA_API_BASE}/api/chat-gpt4o`
  : "http://localhost:3000/api/chat-gpt4o";
const KEY = process.env.API_SHARED_KEY || "minha_chave_181199";

const CONTINUOUS = [
  "Hoje foi péssimo, mas preciso escolher um celular",
  "Estou cansado, só me diz qual vale mais a pena",
  "Valeu, agora compara com o iPhone 13",
  "Meu dia ainda está puxado, qual deles tem câmera melhor?",
  "Estou feliz, finalmente vou comprar",
  "Obrigado, vou nesse",
];

const ISOLATED = [
  "Hoje foi horrível, mas preciso de um notebook até 4 mil.",
  "Estou cansado, compara S23 e iPhone 13.",
  "Valeu, agora quero uma TV de até 3 mil.",
  "Meu dia foi pesado, preciso de um celular com câmera boa.",
];

const MECHANICAL = /\b(mas vamos(?:\s+[àa]s)?\s+compras|agora falando|sobre sua solicita|de qualquer forma|falando do)\b/i;
const ANTI_CONSUMPTION = /\b(melhorar seu dia|vai te animar|aliviar isso|encontrar algo para aliviar)\b/i;

async function call(text, sessionContext, messages, conversationId) {
  const resp = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY },
    body: JSON.stringify({
      text,
      user_id: "mixed-11a6-guest",
      conversation_id: conversationId,
      messages,
      session_context: sessionContext || {},
    }),
  });
  const data = await resp.json();
  return { status: resp.status, data };
}

function assessTurn(input, result) {
  const issues = [];
  const reply = String(result.data?.reply || "");
  const dbg = result.data?.mia_debug || {};
  const mixedTrace = dbg.mixed_verbalization || {};
  const prices = Array.isArray(result.data?.prices) ? result.data.prices : [];

  if (result.status !== 200) issues.push(`HTTP ${result.status}`);
  if (MECHANICAL.test(reply)) issues.push("mechanical_transition");
  if (ANTI_CONSUMPTION.test(reply)) issues.push("anti_consumption");

  const isMixedTurn =
    /preciso|quero|compara|vale mais|feliz|finalmente|cansad|pesad|puxad|pessimo|péssimo/i.test(
      input
    ) && !/^boa noite/i.test(input);

  if (isMixedTurn && mixedTrace.dualCompletionPassed === false) {
    issues.push("dual_completion_failed");
  }
  if (isMixedTurn && mixedTrace.humanCompletionRequired && !mixedTrace.humanCompletionDetected) {
    issues.push("human_incomplete");
  }
  if (isMixedTurn && mixedTrace.commercialCompletionRequired && !mixedTrace.commercialCompletionDetected) {
    issues.push("commercial_incomplete");
  }

  return {
    input,
    status: result.status,
    reply,
    pricesCount: prices.length,
    winner: prices[0]?.product_name || null,
    mixedTrace,
    issues,
    verdict: issues.length ? "REPROVADA" : "APROVADA",
  };
}

async function runConversation(turns, label) {
  let sessionContext = {};
  let messages = [];
  const results = [];

  for (const text of turns) {
    const { status, data } = await call(
      text,
      sessionContext,
      messages,
      `mixed-11a6-${label}`
    );
    messages = [
      ...messages,
      { role: "user", content: text },
      { role: "assistant", content: data?.reply || "" },
    ];
    sessionContext = data?.session_context || sessionContext;
    results.push(assessTurn(text, { status, data }));
  }

  return results;
}

async function main() {
  console.log("\nPATCH 11A.6 — Endpoint Mixed Verbalization Validation\n");
  console.log(`API: ${API}\n`);

  const continuous = await runConversation(CONTINUOUS, "continuous");
  const isolated = [];
  for (const msg of ISOLATED) {
    const { status, data } = await call(msg, {}, [], `mixed-11a6-iso-${Date.now()}`);
    isolated.push(assessTurn(msg, { status, data }));
  }

  for (const block of [
    { label: "Conversa contínua", rows: continuous },
    { label: "Casos isolados", rows: isolated },
  ]) {
    console.log(`\n${"=".repeat(70)}`);
    console.log(block.label);
    console.log("=".repeat(70));
    for (const row of block.rows) {
      console.log(`\n→ ${row.input}`);
      console.log(`  HTTP: ${row.status} | winner: ${row.winner || "n/a"} | cards: ${row.pricesCount}`);
      console.log(`  Mixed trace: ${JSON.stringify(row.mixedTrace || {})}`);
      console.log(`  Veredito: ${row.verdict}${row.issues.length ? ` (${row.issues.join(", ")})` : ""}`);
      console.log(`  Resposta:\n${row.reply}\n`);
    }
  }

  const failed = [...continuous, ...isolated].filter((r) => r.verdict !== "APROVADA");
  console.log(`\nTotal: ${continuous.length + isolated.length} | Reprovadas: ${failed.length}`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
