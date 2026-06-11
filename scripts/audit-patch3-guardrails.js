/**
 * PATCH 3 — follow-up guardrails audit
 * Requires: npm run dev + MIA_DEBUG=true
 * Usage: node scripts/audit-patch3-guardrails.js
 */
const API = "http://localhost:3000/api/chat-gpt4o";
const KEY = "minha_chave_181199";

function traceOf(data) {
  return data.mia_debug?.pipelineTrace || {};
}

function normName(name = "") {
  return String(name || "").toLowerCase();
}

async function call(text, sessionContext, messages) {
  const resp = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY },
    body: JSON.stringify({
      text,
      user_id: "audit-patch3",
      conversation_id: "audit-patch3",
      messages,
      session_context: sessionContext || {}
    })
  });
  return { status: resp.status, data: await resp.json() };
}

const SCENARIOS = [
  {
    name: "anchor_vale_a_pena",
    turns: ["celular até 2.000", "vale a pena?"],
    check(sessions, traces) {
      const t1 = sessions[0];
      const t2 = sessions[1];
      const tr = traces[1] || {};
      return {
        ok:
          t2?.lastBestProduct?.product_name &&
          normName(t2.lastBestProduct.product_name).includes("iphone") &&
          normName(t1.lastBestProduct?.product_name).includes("iphone") &&
          normName(t2.lastBestProduct.product_name) ===
            normName(t1.lastBestProduct.product_name) &&
          !!t2 &&
          tr.sessionContextReturned !== false &&
          tr.contractViolation == null,
        detail: `winner=${t2?.lastBestProduct?.product_name} path=${tr.responsePath} violation=${tr.contractViolation}`
      };
    }
  },
  {
    name: "anchored_loucura",
    turns: ["celular até 2.000", "loucura"],
    check(sessions, traces) {
      const t2 = sessions[1];
      const tr = traces[1] || {};
      const rd = tr.routingDecision || {};
      return {
        ok:
          rd.mode === "anchored_reaction" &&
          rd.allowNewSearch === false &&
          rd.allowCommercialFallback === false &&
          normName(t2?.lastBestProduct?.product_name).includes("iphone") &&
          tr.contractViolation == null,
        detail: `mode=${rd.mode} winner=${t2?.lastBestProduct?.product_name} path=${tr.responsePath}`
      };
    }
  },
  {
    name: "anchored_nao_entendi",
    turns: ["celular até 2.000", "não entendi"],
    check(sessions, traces) {
      const t1 = sessions[0];
      const t2 = sessions[1];
      const tr = traces[1] || {};
      const rd = tr.routingDecision || {};
      return {
        ok:
          (rd.mode === "anchored_reaction" || rd.mode === "context_decision") &&
          normName(t2?.lastBestProduct?.product_name).includes("iphone") &&
          normName(t2.lastBestProduct.product_name) ===
            normName(t1.lastBestProduct?.product_name),
        detail: `mode=${rd.mode} winner=${t2?.lastBestProduct?.product_name}`
      };
    }
  },
  {
    name: "new_search_me_mostra_outro",
    turns: ["celular até 2.000", "me mostra outro"],
    check(sessions, traces) {
      const t1 = sessions[0];
      const t2 = sessions[1];
      const tr = traces[1] || {};
      const rd = tr.routingDecision || {};
      const changed =
        normName(t2?.lastBestProduct?.product_name) !==
        normName(t1?.lastBestProduct?.product_name);
      return {
        ok:
          (rd.mode === "new_search" || rd.mode === "refinement") &&
          rd.allowReplaceWinner === true &&
          changed,
        detail: `mode=${rd.mode} t1=${t1?.lastBestProduct?.product_name} t2=${t2?.lastBestProduct?.product_name}`
      };
    }
  },
  {
    name: "comparison_e_bateria",
    turns: ["iPhone 13 ou Galaxy S23 FE?", "e a bateria?"],
    check(sessions, traces) {
      const t2 = sessions[1];
      const tr = traces[1] || {};
      const rd = tr.routingDecision || {};
      return {
        ok:
          (rd.mode === "comparison_followup" || rd.mode === "refinement") &&
          rd.allowNewSearch === false &&
          (t2?.lastComparisonProducts?.length >= 2 || t2?.lastProducts?.length >= 2),
        detail: `mode=${rd.mode} comp=${t2?.lastComparisonProducts?.length || 0} path=${tr.responsePath}`
      };
    }
  }
];

async function runScenario(scenario) {
  let sessionContext = {};
  let messages = [];
  const sessions = [];
  const traces = [];

  for (const text of scenario.turns) {
    const { data } = await call(text, sessionContext, messages);
    sessions.push(data.session_context || {});
    traces.push(traceOf(data));
    console.log(`  "${text}" → mode=${traces.at(-1)?.routingDecision?.mode} path=${traces.at(-1)?.responsePath} violation=${traces.at(-1)?.contractViolation}`);
    if (data.session_context) sessionContext = data.session_context;
    messages.push({ role: "user", content: text });
    if (data.reply) messages.push({ role: "assistant", content: data.reply });
  }

  return scenario.check(sessions, traces);
}

async function main() {
  let failed = 0;

  console.log("=".repeat(72));
  console.log("PATCH 3 guardrails — integration");
  for (const scenario of SCENARIOS) {
    console.log("\nSCENARIO:", scenario.name);
    try {
      const { ok, detail } = await runScenario(scenario);
      console.log(ok ? "PASS" : "FAIL", detail);
      if (!ok) failed++;
    } catch (e) {
      failed++;
      console.error("ERROR", e.message);
    }
  }

  console.log("\n" + "=".repeat(72));
  console.log("Unit scenario 6 (contract violation) — see test-mia-routing-guardrails.js");

  if (failed) {
    console.error(`${failed} integration scenario(s) failed`);
    process.exit(1);
  }
  console.log("All PATCH 3 integration scenarios passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
