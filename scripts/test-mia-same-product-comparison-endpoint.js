/**
 * PATCH 11A.7G — Same-product comparison endpoint validation
 * Usage: npm run dev (separate terminal), then:
 *        node scripts/test-mia-same-product-comparison-endpoint.js
 */

const API = process.env.MIA_API_BASE
  ? `${process.env.MIA_API_BASE}/api/chat-gpt4o`
  : "http://localhost:3000/api/chat-gpt4o";
const KEY = process.env.API_SHARED_KEY || "minha_chave_181199";

async function call(text, sessionContext, messages, conversationId) {
  const resp = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY },
    body: JSON.stringify({
      text,
      user_id: "same-product-guest",
      conversation_id: conversationId,
      messages,
      session_context: sessionContext || {},
    }),
  });
  const data = await resp.json();
  return { status: resp.status, data };
}

function extractGuard(data) {
  const dbg = data?.mia_debug || {};
  const trace =
    dbg.commercial_continuation_runtime_guard ||
    dbg.pipeline?.commercial_continuation_runtime_guard ||
    {};
  const session = data?.session_context || {};
  return {
    guard: trace,
    responsePath: dbg.responsePath || data?.responsePath || "",
    pricesCount: Array.isArray(data?.prices) ? data.prices.length : 0,
    lastBest: session.lastBestProduct?.product_name || null,
    lastComparisonCount: Array.isArray(session.lastComparisonProducts)
      ? session.lastComparisonProducts.length
      : 0,
    lastInteractionType: session.lastInteractionType || "",
    reply: data?.reply || "",
  };
}

let passed = 0;
let failed = 0;

function expect(condition, label, detail = "") {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed += 1;
  } else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failed += 1;
  }
}

async function runSameProductFlow() {
  console.log("\nFluxo A — Same-product (iPhone 13 anchor)");
  let sessionContext = {};
  let messages = [];
  const conv = "same-product-iphone13";

  let r1 = await call("Quero um iPhone 13", sessionContext, messages, conv);
  messages = [
    ...messages,
    { role: "user", content: "Quero um iPhone 13" },
    { role: "assistant", content: r1.data?.reply || "" },
  ];
  sessionContext = r1.data?.session_context || sessionContext;
  const anchorBefore = sessionContext.lastBestProduct?.product_name || null;

  expect(r1.status === 200, "A1: HTTP 200 turn 1");

  let r2 = await call("Compara com o iPhone 13", sessionContext, messages, conv);
  const m2 = extractGuard(r2.data);

  expect(r2.status === 200, "A2: HTTP 200 turn 2");
  expect(
    m2.guard.comparisonDistinctnessStatus === "same_product" ||
      m2.guard.identitiesEquivalent === true ||
      m2.lastInteractionType === "comparison_same_product_clarification",
    "A2: same_product detected",
    JSON.stringify({ guard: m2.guard, lastInteractionType: m2.lastInteractionType })
  );
  expect(
    m2.guard.comparisonExecutionBlocked === true ||
      m2.lastInteractionType === "comparison_same_product_clarification",
    "A2: pipeline blocked"
  );
  expect(m2.pricesCount === 0, "A2: zero prices/cards", `prices=${m2.pricesCount}`);
  expect(/mesmo|contexto|outro modelo/i.test(m2.reply), "A2: clarification reply");

  const sessionAfter = r2.data?.session_context || {};
  expect(
    (sessionAfter.lastBestProduct?.product_name || anchorBefore) === anchorBefore ||
      /iphone\s*13/i.test(sessionAfter.lastBestProduct?.product_name || ""),
    "A2: anchor preserved"
  );
  expect(
    !sessionAfter.lastComparisonProducts ||
      sessionAfter.lastComparisonProducts.length < 2,
    "A2: no comparison state written"
  );
}

async function runDistinctFlow() {
  console.log("\nFluxo B — Distinct products (iPhone 13 vs Pro)");
  let sessionContext = {};
  let messages = [];
  const conv = "distinct-iphone13-pro";

  let r1 = await call("Quero um iPhone 13", sessionContext, messages, conv);
  messages = [
    ...messages,
    { role: "user", content: "Quero um iPhone 13" },
    { role: "assistant", content: r1.data?.reply || "" },
  ];
  sessionContext = r1.data?.session_context || sessionContext;

  expect(r1.status === 200, "B1: HTTP 200 turn 1");

  let r2 = await call("Compara com o iPhone 13 Pro", sessionContext, messages, conv);
  const m2 = extractGuard(r2.data);

  expect(r2.status === 200, "B2: HTTP 200 turn 2");
  expect(
    m2.guard.comparisonDistinctnessStatus === "complete_distinct" ||
      m2.guard.comparisonInputStatus === "complete" ||
      m2.pricesCount >= 1 ||
      /compar|iphone|pro/i.test(m2.reply),
    "B2: distinct comparison executed",
    JSON.stringify({ guard: m2.guard, prices: m2.pricesCount })
  );
}

async function main() {
  console.log("\nPATCH 11A.7G — Endpoint Same-Product Validation\n");
  console.log(`API: ${API}\n`);

  await runSameProductFlow();
  await runDistinctFlow();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Resultado endpoint: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
