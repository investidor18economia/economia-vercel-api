/**
 * PATCH 11A.8A — Remaining runtime bypass endpoint validation
 * Usage: npm run dev, then node scripts/test-mia-remaining-runtime-bypass-endpoint.js
 */

const API = process.env.MIA_API_BASE
  ? `${process.env.MIA_API_BASE}/api/chat-gpt4o`
  : "http://localhost:3000/api/chat-gpt4o";
const KEY = process.env.API_SHARED_KEY || "minha_chave_181199";

const SCENARIOS = [
  {
    name: "social deny",
    text: "kkkk",
    expect: (m) => m.http200 && m.providerFree && m.runtimeTrace,
  },
  {
    name: "commercial search",
    text: "Quero um celular barato",
    expect: (m) => m.http200 && m.runtimeTrace,
  },
  {
    name: "same-product comparison",
    text: "Compara com o iPhone 13",
    session: {
      lastBestProduct: { product_name: "Apple iPhone 13 128GB" },
      lastProducts: [{ product_name: "Apple iPhone 13 128GB" }],
      lastIntent: "search",
    },
    expect: (m) => m.http200,
  },
  {
    name: "commercial governed trace",
    text: "Quero comprar um iPhone 15 Pro Max por 50 reais",
    expect: (m) =>
      m.http200 &&
      m.runtimeTrace &&
      m.directHttpBypassPrevented &&
      m.earlyReturnAuthorized,
  },
  {
    name: "search guidance style",
    text: "Me ajuda a escolher um notebook",
    expect: (m) => m.http200 && m.runtimeTrace,
  },
  {
    name: "mixed conversational",
    text: "Hoje foi ruim, mas preciso de um celular",
    expect: (m) => m.http200 && m.runtimeTrace,
  },
];

async function call(text, sessionContext, messages, conversationId) {
  const resp = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY },
    body: JSON.stringify({
      text,
      user_id: "runtime-bypass-118a-guest",
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
  const prices = Array.isArray(data?.prices) ? data.prices : [];
  return {
    http200: status === 200,
    pricesCount: prices.length,
    providerFree: prices.length === 0,
    runtimeTrace: !!rt.version,
    runtimeClass: rt.runtimeClass || null,
    technicalPathAuthorized: rt.technicalPathAuthorized === true,
    degradationActive: rt.degradationActive === true || dbg.degradation?.active === true,
    degradationReason: rt.degradationReason || dbg.degradation?.reasonCode || null,
    earlyReturnAuthorized: rt.earlyReturnAuthorized === true,
    stateTransitionApplied: rt.stateTransitionApplied === true,
    provenanceApplied: rt.provenanceApplied === true,
    intentAuthorityPresent: rt.intentAuthorityPresent === true,
    finalRoutingPresent: rt.finalRoutingDecisionPresent === true,
    commercialGateApplied: rt.commercialGateApplied === true,
    responsePath: rt.responsePath || data?.session_context?.lastInteractionType || "",
    directHttpBypassPrevented: rt.directHttpBypassPrevented === true,
  };
}

async function main() {
  console.log("\nPATCH 11A.8A — Remaining Runtime Bypass Endpoint Validation\n");
  let passed = 0;
  let failed = 0;

  for (const scenario of SCENARIOS) {
    const conv = `bypass-118a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const { status, data } = await call(
      scenario.text,
      scenario.session || {},
      [],
      conv
    );
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
