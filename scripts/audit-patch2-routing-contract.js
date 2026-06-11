/**
 * PATCH 2 — routingDecision integration audit
 * Requires: npm run dev + MIA_DEBUG=true in .env.local
 * Usage: node scripts/audit-patch2-routing-contract.js
 */
const API = "http://localhost:3000/api/chat-gpt4o";
const KEY = "minha_chave_181199";

const SCENARIOS = [
  {
    name: "context_decision_vale_a_pena",
    turns: ["celular até 2.000", "vale a pena?"],
    expect(rd) {
      return (
        rd?.mode === "context_decision" &&
        rd?.allowNewSearch === false &&
        rd?.allowReplaceWinner === false &&
        rd?.shouldPreserveAnchor === true
      );
    }
  },
  {
    name: "anchored_reaction_loucura",
    turns: ["celular até 2.000", "loucura"],
    expect(rd) {
      return (
        rd?.mode === "anchored_reaction" &&
        rd?.allowNewSearch === false &&
        rd?.allowCommercialFallback === false &&
        rd?.allowReplaceWinner === false &&
        rd?.shouldPreserveAnchor === true
      );
    }
  },
  {
    name: "new_search_me_mostra_outro",
    turns: ["celular até 2.000", "me mostra outro"],
    expect(rd) {
      return (
        (rd?.mode === "new_search" || rd?.mode === "refinement") &&
        rd?.allowNewSearch === true &&
        rd?.allowReplaceWinner === true &&
        rd?.shouldPreserveAnchor === false
      );
    }
  },
  {
    name: "refinement_quero_mais_bateria",
    turns: ["celular até 2.000", "quero mais bateria"],
    expect(rd) {
      return (
        rd?.mode === "refinement" &&
        rd?.allowNewSearch === true &&
        rd?.allowRerank === true &&
        rd?.allowReplaceWinner === true
      );
    }
  },
  {
    name: "comparison_followup_e_bateria",
    turns: ["iPhone 13 ou Galaxy S23 FE?", "e a bateria?"],
    expect(rd) {
      return (
        (rd?.mode === "comparison_followup" || rd?.mode === "refinement") &&
        rd?.shouldPreserveAnchor === true &&
        rd?.allowNewSearch === false
      );
    }
  }
];

async function call(text, sessionContext, messages) {
  const resp = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY },
    body: JSON.stringify({
      text,
      user_id: "audit-patch2",
      conversation_id: "audit-patch2",
      messages,
      session_context: sessionContext || {}
    })
  });
  return { status: resp.status, data: await resp.json() };
}

async function runScenario(scenario) {
  let sessionContext = {};
  let messages = [];
  let lastRd = null;

  for (let i = 0; i < scenario.turns.length; i++) {
    const text = scenario.turns[i];
    const { data } = await call(text, sessionContext, messages);
    const rd = data.mia_debug?.pipelineTrace?.routingDecision || null;
    console.log(`  turn ${i + 1} "${text}"`);
    console.log("    routingDecision:", JSON.stringify(rd, null, 2));
    if (i === scenario.turns.length - 1) lastRd = rd;
    if (data.session_context) sessionContext = data.session_context;
    messages.push({ role: "user", content: text });
    if (data.reply) messages.push({ role: "assistant", content: data.reply });
  }

  return { ok: scenario.expect(lastRd), lastRd };
}

async function main() {
  let failed = 0;

  for (const scenario of SCENARIOS) {
    console.log("\n" + "=".repeat(72));
    console.log("SCENARIO:", scenario.name);
    try {
      const { ok, lastRd } = await runScenario(scenario);
      if (ok) {
        console.log("PASS", lastRd?.mode);
      } else {
        failed++;
        console.log("FAIL", "last routingDecision:", JSON.stringify(lastRd));
      }
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
  console.log("All PATCH 2 routing contract scenarios passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
