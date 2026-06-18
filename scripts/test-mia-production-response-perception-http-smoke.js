/**
 * PATCH 8.1A — Production Response Perception HTTP Smoke (AUDIT ONLY)
 *
 * Amostra pequena (30–50) contra API real /app-mia path.
 * Ativar: MIA_PERCEPTION_HTTP=1 node scripts/test-mia-production-response-perception-http-smoke.js
 *
 * Production changes: NONE
 */

import {
  detectProductionGenericFallback,
  SCENARIOS_HTTP_CRITICAL,
} from "./test-mia-production-response-perception-audit.js";

const API_BASE = process.env.MIA_API_BASE || "http://localhost:3000";
const API_ENDPOINT = `${API_BASE}/api/chat-gpt4o`;
const HTTP_ENABLED = process.env.MIA_PERCEPTION_HTTP === "1" || process.argv.includes("--http");

const MOCK_WINNER = {
  product_name: "Smartphone Alpha 35",
  price: "R$ 2.399",
  finalScoreEngineScore: 841,
};

const MOCK_RUNNER = {
  product_name: "Smartphone Beta 22",
  price: "R$ 2.199",
  finalScoreEngineScore: 819,
};

const ANCHORED_SESSION = {
  lastBestProduct: MOCK_WINNER,
  lastRecommendation: { winner: MOCK_WINNER.product_name },
  lastProductMentioned: MOCK_WINNER.product_name,
  lastProducts: [MOCK_WINNER, MOCK_RUNNER],
  lastRankingSnapshot: {
    winner: MOCK_WINNER.product_name,
    ranked: [
      { product_name: MOCK_WINNER.product_name, rank: 1 },
      { product_name: MOCK_RUNNER.product_name, rank: 2 },
    ],
  },
  lastCategory: "celular",
  lastQuery: "celular ate 2500",
};

async function httpPost(query, session_context = {}) {
  const bestName = session_context.lastBestProduct?.product_name || MOCK_WINNER.product_name;
  const messages = session_context.lastBestProduct
    ? [
        { role: "user", content: "celular ate 2500" },
        {
          role: "assistant",
          content: `O ${bestName} foi o melhor custo-benefício que encontrei dentro do seu orçamento.`,
        },
        { role: "user", content: query },
      ]
    : [{ role: "user", content: query }];

  const resp = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.MIA_API_KEY || "minha_chave_181199",
    },
    body: JSON.stringify({
      text: query,
      image_base64: "",
      user_id: "perception-audit-8.1a",
      conversation_id: `perception-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      messages,
      session_context,
    }),
    signal: AbortSignal.timeout(45000),
  });

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`);
  }
  return resp.json();
}

function extractReplyText(data) {
  return (
    data?.reply ||
    data?.response ||
    data?.message ||
    data?.text ||
    data?.choices?.[0]?.message?.content ||
    ""
  );
}

async function runHttpSmoke() {
  console.log("PATCH 8.1A — Production Response Perception HTTP Smoke (AUDIT ONLY)\n");

  if (!HTTP_ENABLED) {
    console.log("HTTP desativado (economia de API).");
    console.log("Ative com: MIA_PERCEPTION_HTTP=1 node scripts/test-mia-production-response-perception-http-smoke.js");
    console.log(`Servidor esperado: ${API_BASE}\n`);
    return { httpAudited: 0, skipped: true };
  }

  const results = [];
  let productionFallback = 0;
  let genericLeak = 0;
  let sim = 0;
  let partial = 0;
  let no = 0;

  for (const spec of SCENARIOS_HTTP_CRITICAL) {
    const session =
      spec.contextType === "anchored" ? ANCHORED_SESSION : {};
    const label = `${spec.familyExpected}/${spec.contextType}`;
    process.stdout.write(`  … ${label} "${spec.userMessage.slice(0, 40)}"`);

    try {
      const data = await httpPost(spec.userMessage, session);
      const finalResponseText = extractReplyText(data);
      const containsGenericFallback = detectProductionGenericFallback(finalResponseText);
      const preservesAnchor = spec.contextType === "cold" || !!data?.session_context?.lastBestProduct;
      let userPerception = "PARCIAL";
      if (containsGenericFallback) {
        userPerception = "NÃO";
        productionFallback++;
        genericLeak++;
      } else if (finalResponseText.length > 40) {
        userPerception = "SIM";
        sim++;
      } else if (finalResponseText.length > 0) {
        partial++;
      } else {
        userPerception = "NÃO";
        no++;
      }

      const leakType = containsGenericFallback ? "PRODUCTION_FALLBACK_LEAK" : null;
      results.push({
        ...spec,
        finalResponseText: finalResponseText.slice(0, 200),
        containsGenericFallback,
        preservesAnchor,
        userPerception,
        leakType,
        httpOk: true,
      });
      console.log(` → ${userPerception}${containsGenericFallback ? " [PFL]" : ""}`);
    } catch (err) {
      results.push({
        ...spec,
        error: err.message,
        userPerception: "NÃO",
        leakType: "HTTP_ONLY_LEAK",
        httpOk: false,
      });
      no++;
      console.log(` → ERROR ${err.message}`);
    }
  }

  console.log(`\n── HTTP auditados: ${results.length} ──`);
  console.log(`PRODUCTION_FALLBACK_LEAK: ${productionFallback}`);
  console.log(`Perception SIM/PARCIAL/NÃO: ${sim}/${partial}/${no}`);

  const httpFallback = results.filter((r) => r.containsGenericFallback);
  if (httpFallback.length) {
    console.log("\n── HTTP fallback samples ──");
    for (const r of httpFallback.slice(0, 8)) {
      console.log(`[${r.familyExpected}] "${r.userMessage}" → ${r.finalResponseText?.slice(0, 120)}`);
    }
  }

  return {
    httpAudited: results.length,
    productionFallback,
    genericLeak,
    sim,
    partial,
    no,
    results,
    skipped: false,
  };
}

runHttpSmoke()
  .then((summary) => {
    if (!summary.skipped && summary.productionFallback > 0) {
      console.log("\nHTTP diverge do harness local em cenários com fallback genérico.");
    }
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
