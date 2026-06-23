/**
 * PATCH 10.1E — Comparison Flow Crash Guard Audit
 *
 * Usage:
 *   node scripts/test-mia-comparison-flow-crash-guard-audit.js
 *   node scripts/test-mia-comparison-flow-crash-guard-audit.js --http
 */

import {
  COMPARISON_FLOW_CRASH_GUARD_VERSION,
  buildComparisonUnresolvedFallbackReply,
  extractComparisonTermsFromQuery,
  findMissingComparisonTerms,
  isDirectComparisonQuery,
} from "../lib/miaComparisonFlowCrashGuard.js";

let passed = 0;
let failed = 0;

function assert(label, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${label}`);
  } else {
    failed += 1;
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log(
  `\nPATCH 10.1E — Comparison Flow Crash Guard Audit (${COMPARISON_FLOW_CRASH_GUARD_VERSION})\n`
);

console.log("── Term extraction ──");
assert(
  "compare iPhone 13 e Galaxy A54",
  extractComparisonTermsFromQuery("compare iPhone 13 e Galaxy A54").join("|") ===
    "iPhone 13|Galaxy A54"
);
assert(
  "iPhone 13 vs Galaxy A54",
  extractComparisonTermsFromQuery("iPhone 13 vs Galaxy A54").length >= 2
);
assert(
  "qual é melhor, iPhone 13 ou Galaxy A54?",
  extractComparisonTermsFromQuery("qual é melhor, iPhone 13 ou Galaxy A54?").every(
    (term) => !/^é\b/i.test(term)
  )
);
assert(
  "Galaxy S24 FE ou Galaxy M35?",
  extractComparisonTermsFromQuery("Galaxy S24 FE ou Galaxy M35?").length >= 2
);

console.log("\n── Detection ──");
assert("direct comparison detected", isDirectComparisonQuery("compare iPhone 13 e Galaxy A54"));
assert("generic search not comparison", !isDirectComparisonQuery("celular até 2000"));
assert(
  "missing term detection",
  findMissingComparisonTerms(["iPhone 13", "celular xyzabc"], [{ product_name: "iPhone 13" }]).includes(
    "celular xyzabc"
  )
);

console.log("\n── Fallback copy ──");
const fallback = buildComparisonUnresolvedFallbackReply({
  query: "compare iPhone 13 e celular xyzabc",
  missingTerms: ["celular xyzabc"],
});
assert("missing product fallback is controlled", /Consigo comparar/i.test(fallback));
assert("missing product fallback is not 500", !/Tive um problema/i.test(fallback));

if (process.argv.includes("--http")) {
  console.log("\n── HTTP smoke (requires dev server) ──");
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": "minha_chave_181199",
  };

  const cases = [
    { query: "compare iPhone 13 e Galaxy A54", expectComparative: true },
    { query: "iPhone 13 vs Galaxy A54", expectComparative: true },
    { query: "qual é melhor, iPhone 13 ou Galaxy A54?", expectComparative: true },
    { query: "Galaxy S24 FE ou Galaxy M35?", expectComparative: true, allowFallback: true },
    { query: "compare iPhone 15 e iPhone 16", expectComparative: true, allowFallback: true },
    {
      query: "compare iPhone 13 e celular xyzabc",
      expectComparative: false,
      expectFallback: true,
    },
  ];

  for (const testCase of cases) {
    try {
      const resp = await fetch("http://localhost:3000/api/chat-gpt4o", {
        method: "POST",
        headers,
        body: JSON.stringify({
          text: testCase.query,
          session_context: {},
          messages: [],
        }),
      });
      const data = await resp.json();
      const reply = data?.reply || "";
      const hasError = /Tive um problema/i.test(reply);
      const comparative =
        /Minha escolha|Resumindo a decisão|Comparei|iria de|O que você ganha/i.test(reply);

      assert(`${testCase.query}: status 200`, resp.status === 200, String(resp.status));
      assert(`${testCase.query}: no crash message`, !hasError, reply.slice(0, 120));

      if (testCase.expectComparative) {
        const okComparative = comparative;
        const okFallback =
          testCase.allowFallback && /Consigo comparar|não encontrei/i.test(reply);
        assert(
          `${testCase.query}: comparative reply`,
          okComparative || okFallback,
          reply.slice(0, 160)
        );
      }
      if (testCase.expectFallback) {
        assert(
          `${testCase.query}: controlled fallback`,
          /Consigo comparar|não encontrei/i.test(reply),
          reply.slice(0, 160)
        );
      }
    } catch (err) {
      failed += 1;
      console.log(`  ❌ ${testCase.query}: HTTP failed — ${err.message}`);
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
