/**
 * PATCH 1 — integration audit (3 scenarios)
 * Usage: node scripts/audit-patch1-scenarios.js
 */
const API = "http://localhost:3000/api/chat-gpt4o";
const KEY = "minha_chave_181199";

const SCENARIOS = [
  {
    name: "anchor_vale_a_pena",
    turns: ["celular até 2.000", "vale a pena?"],
    expect: (sessions, traces) => {
      const t2 = sessions[1];
      const anchor = t2?.lastBestProduct?.product_name || "";
      const ok = /iphone\s*13/i.test(anchor);
      return {
        ok,
        detail: `turn2 lastBestProduct="${anchor}" (expected iPhone 13)`
      };
    }
  },
  {
    name: "anchor_loucura",
    turns: ["celular até 2.000", "vale a pena?", "loucura"],
    expect: (sessions, traces) => {
      const t3 = sessions[2];
      const anchor = t3?.lastBestProduct?.product_name || "";
      const path = traces[2]?.response_path || "";
      const blocked = traces[2]?.fallback_blocked === true;
      const ok =
        /iphone\s*13/i.test(anchor) &&
        path !== "commercial_only_fallback";
      return {
        ok,
        detail: `turn3 lastBest="${anchor}" path=${path} fallback_blocked=${blocked}`
      };
    }
  },
  {
    name: "allow_me_mostra_outro",
    turns: ["celular até 2.000", "me mostra outro"],
    expect: (sessions, traces) => {
      const t1 = sessions[0];
      const t2 = sessions[1];
      const rd = traces[1]?.routingDecision?.mode || "";
      const notBlockedByContextDecision =
        t2?.lastInteractionType !== "context_decision" &&
        t2?.lastInteractionType !== "general_answer";
      const notSearchGuidanceOnly = t2?.lastInteractionType !== "search_guidance";
      const hasSessionMemory = (t2?.lastProducts?.length || 0) > 0;
      const allowsReplace =
        rd === "new_search" || rd === "refinement" || t2?.lastInteractionType === "search";
      return {
        ok:
          notBlockedByContextDecision &&
          notSearchGuidanceOnly &&
          hasSessionMemory &&
          allowsReplace,
        detail: `turn2 interaction=${t2?.lastInteractionType || ""} routing=${rd} lastBest="${t2?.lastBestProduct?.product_name || ""}" products=${t2?.lastProducts?.length || 0} (turn1=${t1?.lastBestProduct?.product_name || ""})`
      };
    }
  }
];

async function call(text, sessionContext, messages) {
  const resp = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY },
    body: JSON.stringify({
      text,
      user_id: "audit-patch1",
      conversation_id: "audit-patch1",
      messages,
      session_context: sessionContext || {}
    })
  });
  return { status: resp.status, data: await resp.json() };
}

async function runScenario(scenario) {
  let sessionContext = {};
  let messages = [];
  const sessions = [];
  const traces = [];

  for (const text of scenario.turns) {
    const { data } = await call(text, sessionContext, messages);
    sessions.push(data.session_context || {});
    traces.push(data.mia_debug?.pipelineTrace || null);
    if (data.session_context) sessionContext = data.session_context;
    messages.push({ role: "user", content: text });
    if (data.reply) messages.push({ role: "assistant", content: data.reply });
  }

  return scenario.expect(sessions, traces);
}

async function main() {
  let failed = 0;

  for (const scenario of SCENARIOS) {
    console.log("\n" + "=".repeat(72));
    console.log("SCENARIO:", scenario.name);
    try {
      const result = await runScenario(scenario);
      console.log(result.ok ? "PASS" : "FAIL", result.detail);
      if (!result.ok) failed++;
    } catch (err) {
      failed++;
      console.error("ERROR", err.message);
    }
  }

  console.log("\n" + "=".repeat(72));
  if (failed) {
    console.error(`${failed} scenario(s) failed`);
    process.exit(1);
  }
  console.log("All PATCH 1 scenarios passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
