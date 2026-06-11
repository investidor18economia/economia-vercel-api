/**
 * PATCH 4 — contract enforcement completion audit
 * Requires: npm run dev + MIA_DEBUG=true
 */
const API = "http://localhost:3000/api/chat-gpt4o";
const KEY = "minha_chave_181199";

function tr(data) {
  return data.mia_debug?.pipelineTrace || {};
}

async function call(text, sessionContext, messages) {
  const resp = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY },
    body: JSON.stringify({
      text,
      user_id: "audit-patch4",
      conversation_id: "audit-patch4",
      messages,
      session_context: sessionContext || {}
    })
  });
  return { data: await resp.json() };
}

const SCENARIOS = [
  {
    name: "context_decision",
    turns: ["celular até 2.000", "vale a pena?"],
    check(sessions, traces) {
      const t = traces[1];
      const rd = t.routingDecision || {};
      return {
        ok:
          rd.mode === "context_decision" &&
          t.contractApplied === true &&
          t.sessionContextReturned === true &&
          t.winnerChanged === false &&
          !!sessions[1]?.lastBestProduct,
        detail: `mode=${rd.mode} path=${t.responsePath} winnerChanged=${t.winnerChanged}`
      };
    }
  },
  {
    name: "anchored_nao_entendi",
    turns: ["celular até 2.000", "não entendi"],
    check(sessions, traces) {
      const t = traces[1];
      const rd = t.routingDecision || {};
      const w1 = (sessions[0]?.lastBestProduct?.product_name || "").toLowerCase();
      const w2 = (sessions[1]?.lastBestProduct?.product_name || "").toLowerCase();
      return {
        ok:
          rd.mode === "anchored_reaction" &&
          rd.allowNewSearch === false &&
          rd.allowCommercialFallback === false &&
          t.contractApplied === true &&
          w1 && w2 && w1 === w2,
        detail: `mode=${rd.mode} path=${t.responsePath}`
      };
    }
  },
  {
    name: "new_search_outro",
    turns: ["celular até 2.000", "me mostra outro"],
    check(sessions, traces) {
      const t = traces[1];
      const rd = t.routingDecision || {};
      const changed =
        (sessions[0]?.lastBestProduct?.product_name || "") !==
        (sessions[1]?.lastBestProduct?.product_name || "");
      return {
        ok:
          (rd.mode === "new_search" || rd.mode === "refinement") &&
          rd.allowReplaceWinner === true &&
          changed,
        detail: `mode=${rd.mode} reason=${t.winnerChangeReason} path=${t.responsePath}`
      };
    }
  },
  {
    name: "comparison_followup",
    turns: ["iPhone 13 ou Galaxy S23 FE?", "e a bateria?"],
    check(sessions, traces) {
      const t = traces[1];
      const rd = t.routingDecision || {};
      return {
        ok:
          rd.mode === "comparison_followup" &&
          rd.allowNewSearch === false &&
          (sessions[1]?.lastComparisonProducts?.length >= 2 ||
            sessions[1]?.lastProducts?.length >= 2) &&
          t.responsePath != null &&
          t.contractApplied === true,
        detail: `mode=${rd.mode} path=${t.responsePath} comp=${sessions[1]?.lastComparisonProducts?.length}`
      };
    }
  }
];

async function main() {
  let failed = 0;
  console.log("PATCH 4 contract enforcement audit\n");

  for (const sc of SCENARIOS) {
    console.log("SCENARIO:", sc.name);
    let session = {};
    let messages = [];
    const sessions = [];
    const traces = [];

    for (const text of sc.turns) {
      const { data } = await call(text, session, messages);
      sessions.push(data.session_context || {});
      traces.push(tr(data));
      if (data.session_context) session = data.session_context;
      messages.push({ role: "user", content: text });
      if (data.reply) messages.push({ role: "assistant", content: data.reply });
    }

    const { ok, detail } = sc.check(sessions, traces);
    console.log(ok ? "PASS" : "FAIL", detail);
    if (!ok) failed++;
  }

  console.log("\nScenario 5 (forced violation): run test-mia-routing-guardrails.js");

  if (failed) {
    console.error(`\n${failed} failed`);
    process.exit(1);
  }
  console.log("\nAll PATCH 4 integration scenarios passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
