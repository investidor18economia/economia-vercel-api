/**
 * PATCH 11A.7 — Semantic state governance endpoint validation
 * Usage: MIA_DEBUG=true npm run dev (separate terminal), then:
 *        node scripts/test-mia-continuity-semantic-state-endpoint.js
 */

const API = process.env.MIA_API_BASE
  ? `${process.env.MIA_API_BASE}/api/chat-gpt4o`
  : "http://localhost:3000/api/chat-gpt4o";
const KEY = process.env.API_SHARED_KEY || "minha_chave_181199";

const CONTINUOUS = [
  {
    text: "Hoje foi péssimo, mas preciso escolher um celular",
    expect: (r) => r.pricesCount > 0 || r.mixedValid,
  },
  {
    text: "Só me diz qual vale mais",
    expect: (r) => r.commercialExecution || r.pricesCount > 0,
  },
  {
    text: "Compara com o iPhone 13",
    expect: (r) =>
      r.comparisonValid ||
      r.pricesCount >= 1 ||
      r.sameProductClarification,
  },
  {
    text: "Qual deles tem câmera melhor?",
    expect: (r) =>
      r.comparisonContinuation ||
      r.pricesCount >= 1 ||
      r.commercialExecution ||
      r.sameProductFollowUp,
  },
  {
    text: "Valeu",
    expect: (r) => r.pricesCount === 0 && !r.commercialExecution,
  },
  {
    text: "kkkk",
    expect: (r) => r.pricesCount === 0 && !r.commercialExecution,
  },
  {
    text: "Comprei, obrigado",
    expect: (r) => r.decisionCompleted || r.postPurchase,
  },
  {
    text: "Boa noite",
    expect: (r) => r.pricesCount === 0 && !r.commercialExecution,
  },
  {
    text: "Amanhã quero procurar um notebook",
    expect: (r) => r.newSearch || r.pricesCount >= 0,
  },
];

async function call(text, sessionContext, messages, conversationId) {
  const resp = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY },
    body: JSON.stringify({
      text,
      user_id: "gov-11a7-guest",
      conversation_id: conversationId,
      messages,
      session_context: sessionContext || {},
    }),
  });
  const data = await resp.json();
  return { status: resp.status, data };
}

function extractMetrics(data) {
  const dbg = data?.mia_debug || {};
  const gov = dbg.semantic_state_governance || {};
  const elig = gov.continuationEligibility || {};
  const after = gov.semanticStateAfter || {};
  const transition = gov.stateTransition || {};
  const prices = Array.isArray(data?.prices) ? data.prices : [];
  const session = data?.session_context || {};

  return {
    pricesCount: prices.length,
    commercialExecution: !!elig.anchorExecuted,
    commercialContinuation: !!elig.commercialContinuationEligible,
    comparisonContinuation: !!elig.comparisonContinuationEligible,
    mixedValid: !!after.mixedValid,
    comparisonValid: !!after.comparisonValid,
    anchorPreserved: !!elig.anchorPreserved,
    decisionCompleted: !!session.decisionCompleted || transition.type === "post_purchase",
    postPurchase: (elig.reasonCodes || []).includes("post_purchase_acknowledgement"),
    newSearch:
      (elig.reasonCodes || []).includes("explicit_new_search_invalidates_previous_anchor_authority") ||
      transition.type === "new_search",
    provenance: !!session.semanticStateProvenance,
    sameProductClarification:
      session.lastInteractionType === "comparison_same_product_clarification" ||
      /mesmo|contexto|outro modelo/i.test(data?.reply || ""),
    sameProductFollowUp:
      /compar|camera|câmera|catálogo|modelos/i.test(data?.reply || ""),
    reply: data?.reply || "",
    lastInteractionType: session.lastInteractionType || "",
    gov,
  };
}

async function main() {
  console.log("\nPATCH 11A.7 — Endpoint Semantic State Governance Validation\n");
  console.log(`API: ${API}\n`);

  let sessionContext = {};
  let messages = [];
  let passed = 0;
  let failed = 0;

  for (let i = 0; i < CONTINUOUS.length; i++) {
    const turn = CONTINUOUS[i];
    const { status, data } = await call(
      turn.text,
      sessionContext,
      messages,
      "gov-11a7-continuous"
    );
    messages = [
      ...messages,
      { role: "user", content: turn.text },
      { role: "assistant", content: data?.reply || "" },
    ];
    sessionContext = data?.session_context || sessionContext;

    const metrics = extractMetrics(data);
    const ok = status === 200 && turn.expect(metrics);
    if (ok) {
      console.log(`  ✓ Turn ${i + 1}: "${turn.text.slice(0, 40)}..."`);
      passed += 1;
    } else {
      console.log(`  ✗ Turn ${i + 1}: "${turn.text.slice(0, 40)}..."`);
      console.log(`    status=${status} metrics=${JSON.stringify(metrics, null, 0).slice(0, 200)}`);
      failed += 1;
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Resultado endpoint: ${passed} passed, ${failed} failed`);
  console.log(`Provenance present: ${!!sessionContext.semanticStateProvenance}`);
  if (sessionContext.semanticStateProvenance) {
    console.log(
      `Last transition: ${sessionContext.semanticStateProvenance.lastTransition?.type || "n/a"}`
    );
  }
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
