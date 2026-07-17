/**
 * PATCH 11A.9A — Deterministic endpoint validation
 */

process.env.MIA_TEST_MODE = "true";
process.env.MIA_EXTERNAL_PROVIDER_CALLS_ENABLED = "false";
process.env.MIA_PAID_PROVIDER_CALLS_ENABLED = "false";

const API = process.env.MIA_API_BASE
  ? `${process.env.MIA_API_BASE}/api/chat-gpt4o`
  : "http://localhost:3000/api/chat-gpt4o";
const KEY = process.env.API_SHARED_KEY || "minha_chave_181199";

const SCENARIOS = [
  { name: "social", text: "kkkk", expect: (m) => m.http200 && m.paidExecuted === 0 },
  { name: "mixed", text: "Hoje foi ruim, preciso de um celular", expect: (m) => m.http200 && m.paidExecuted === 0 },
  { name: "commercial", text: "Quero um celular barato", expect: (m) => m.http200 && m.paidExecuted === 0 },
  { name: "gate deny", text: "Boa noite", expect: (m) => m.http200 && m.providerExecuted === 0 },
  { name: "same-product", text: "Compara com o iPhone 13", session: { lastBestProduct: { product_name: "Apple iPhone 13" } }, expect: (m) => m.http200 && m.paidExecuted === 0 },
];

async function call(text, sessionContext, conv) {
  const resp = await fetch(API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": KEY,
      "x-mia-test-mode": "true",
    },
    body: JSON.stringify({
      text,
      user_id: "residual-119a",
      conversation_id: conv,
      messages: [],
      session_context: sessionContext || {},
    }),
  });
  return { status: resp.status, data: await resp.json() };
}

function metrics(status, data) {
  const en = data?.mia_debug?.runtime_enforcement || {};
  const ext = en.externalCallAccounting || {};
  return {
    http200: status === 200,
    providerExecuted: en.providerExecutedCount || 0,
    paidExecuted: ext.paidExternalCallExecutedCount || 0,
    externalExecuted: ext.externalCallExecutedCount || 0,
    blockedByTest: ext.blockedByTestPolicyCount || 0,
    lifecycleSent: en.responseLifecycleState === "sent",
    enforcementVersion: en.version || null,
  };
}

async function main() {
  console.log("\nPATCH 11A.9A — Deterministic Endpoint Validation\n");
  let passed = 0;
  let failed = 0;

  for (const scenario of SCENARIOS) {
    const conv = `119a-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    try {
      const { status, data } = await call(scenario.text, scenario.session, conv);
      const m = metrics(status, data);
      if (scenario.expect(m)) {
        console.log(`  ✓ ${scenario.name}`);
        passed += 1;
      } else {
        console.log(`  ✗ ${scenario.name}`, JSON.stringify(m));
        failed += 1;
      }
    } catch (error) {
      console.log(`  ✗ ${scenario.name}`, error.message);
      failed += 1;
    }
  }

  console.log(`\nEndpoint: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
