/**
 * PATCH 11A.8B — Runtime enforcement endpoint validation
 */

const API = process.env.MIA_API_BASE
  ? `${process.env.MIA_API_BASE}/api/chat-gpt4o`
  : "http://localhost:3000/api/chat-gpt4o";
const KEY = process.env.API_SHARED_KEY || "minha_chave_181199";

const SCENARIOS = [
  { name: "social provider-free", text: "kkkk", expect: (m) => m.http200 && m.providerFree && m.lifecycleSent },
  { name: "commercial search", text: "Quero um celular barato", expect: (m) => m.http200 && m.lifecycleSent },
  { name: "mixed", text: "Hoje foi ruim, preciso de um celular", expect: (m) => m.http200 && m.lifecycleSent },
  { name: "same-product", text: "Compara com o iPhone 13", session: { lastBestProduct: { product_name: "Apple iPhone 13" } }, expect: (m) => m.http200 },
  { name: "comparison distinct", text: "Compare iPhone 13 com Galaxy S23", expect: (m) => m.http200 },
  { name: "gate deny social", text: "Boa noite", expect: (m) => m.http200 && m.providerFree },
];

async function call(text, sessionContext, conv) {
  const resp = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY },
    body: JSON.stringify({
      text,
      user_id: "runtime-enforcement-118b",
      conversation_id: conv,
      messages: [],
      session_context: sessionContext || {},
    }),
  });
  return { status: resp.status, data: await resp.json() };
}

function metrics(status, data) {
  const dbg = data?.mia_debug || {};
  const rt = dbg.runtime_precedence || {};
  const en = dbg.runtime_enforcement || {};
  const prices = Array.isArray(data?.prices) ? data.prices : [];
  return {
    http200: status === 200,
    providerFree: prices.length === 0,
    lifecycleSent: en.responseLifecycleState === "sent" || (en.responseLifecycleHistory || []).includes("sent"),
    httpSendCount: en.httpSendCount || 0,
    responseSealed: en.responseSealed === true,
    postSealMutation: en.postSealMutationDetected === true,
    providerExecutedCount: en.providerExecutedCount || 0,
    runtimeTrace: !!rt.version,
    enforcementTrace: !!en.version,
  };
}

async function main() {
  console.log("\nPATCH 11A.8B — Runtime Enforcement Endpoint Validation\n");
  let passed = 0;
  let failed = 0;

  for (const scenario of SCENARIOS) {
    const conv = `enf-118b-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const { status, data } = await call(scenario.text, scenario.session, conv);
    const m = metrics(status, data);
    const ok = scenario.expect(m);
    if (ok) {
      console.log(`  ✓ ${scenario.name}`);
      passed += 1;
    } else {
      console.log(`  ✗ ${scenario.name}`, JSON.stringify(m));
      failed += 1;
    }
  }

  console.log(`\nEndpoint: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
