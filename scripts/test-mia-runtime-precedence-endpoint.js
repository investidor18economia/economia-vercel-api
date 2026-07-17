/**
 * PATCH 11A.8 — Runtime precedence endpoint validation
 * Usage: npm run dev, then node scripts/test-mia-runtime-precedence-endpoint.js
 */

const API = process.env.MIA_API_BASE
  ? `${process.env.MIA_API_BASE}/api/chat-gpt4o`
  : "http://localhost:3000/api/chat-gpt4o";
const KEY = process.env.API_SHARED_KEY || "minha_chave_181199";

const TURNS = [
  { text: "Boa noite", expect: (m) => m.http200 && m.providerFree && m.runtimeTrace },
  { text: "Hoje foi cansativo", expect: (m) => m.http200 && m.providerFree },
  { text: "Quero um celular", expect: (m) => m.http200 && (m.commercialAllowed || m.pricesCount > 0) },
  { text: "Só me diz qual vale mais", expect: (m) => m.http200 },
  { text: "Compara com o iPhone 13", expect: (m) => m.http200 },
  { text: "Qual deles tem câmera melhor?", expect: (m) => m.http200 },
  { text: "Valeu", expect: (m) => m.http200 && m.providerFree },
  { text: "kkkk", expect: (m) => m.http200 && m.providerFree },
  { text: "Comprei, obrigado", expect: (m) => m.http200 && m.providerFree },
  { text: "Quem é você mesmo?", expect: (m) => m.http200 && m.providerFree },
  { text: "Boa noite, vou descansar", expect: (m) => m.http200 && m.providerFree },
  { text: "Amanhã quero procurar um notebook", expect: (m) => m.http200 },
];

async function call(text, sessionContext, messages, conversationId) {
  const resp = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY },
    body: JSON.stringify({
      text,
      user_id: "runtime-precedence-guest",
      conversation_id: conversationId,
      messages,
      session_context: sessionContext || {},
    }),
  });
  const data = await resp.json();
  return { status: resp.status, data };
}

function metrics(status, data) {
  const dbg = data?.mia_debug || {};
  const rt = dbg.runtime_precedence || {};
  const gov = dbg.semantic_state_governance || {};
  const prices = Array.isArray(data?.prices) ? data.prices : [];
  return {
    http200: status === 200,
    pricesCount: prices.length,
    providerFree: prices.length === 0,
    runtimeTrace: !!rt.version,
    earlyReturnAuthorized: rt.earlyReturnAuthorized === true,
    stateTransitionApplied: rt.stateTransitionApplied === true || !!gov.transitionAudit,
    provenanceApplied:
      rt.provenanceApplied === true || !!data?.session_context?.semanticStateProvenance,
    intentAuthorityPresent: rt.intentAuthorityPresent === true,
    commercialAllowed: rt.envelopeSummary?.commercialPermission === "allow",
    responsePath: rt.responsePath || data?.session_context?.lastInteractionType || "",
  };
}

async function main() {
  console.log("\nPATCH 11A.8 — Runtime Precedence Endpoint Validation\n");
  let sessionContext = {};
  let messages = [];
  let passed = 0;
  let failed = 0;
  const conv = `runtime-118-${Date.now()}`;

  for (let i = 0; i < TURNS.length; i++) {
    const turn = TURNS[i];
    const { status, data } = await call(turn.text, sessionContext, messages, conv);
    messages = [
      ...messages,
      { role: "user", content: turn.text },
      { role: "assistant", content: data?.reply || "" },
    ];
    sessionContext = data?.session_context || sessionContext;
    const m = metrics(status, data);
    const ok = turn.expect(m);
    if (ok) {
      console.log(`  ✓ Turn ${i + 1}: "${turn.text.slice(0, 36)}..."`);
      passed++;
    } else {
      console.log(`  ✗ Turn ${i + 1}: "${turn.text.slice(0, 36)}..."`);
      console.log(`    metrics=${JSON.stringify(m)}`);
      failed++;
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Resultado endpoint: ${passed}/${TURNS.length} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
