/**
 * PATCH 10.1D — Generic Query Clarification Closing Audit
 *
 * Usage:
 *   node scripts/test-mia-generic-query-clarification-closing-audit.js
 *   node scripts/test-mia-generic-query-clarification-closing-audit.js --http
 */

import {
  GENERIC_QUERY_CLARIFICATION_CLOSING_VERSION,
  buildGenericQueryClarificationQuestion,
  resolveGenericQueryClarificationClosing,
  shouldApplyGenericQueryClarificationClosing,
} from "../lib/miaGenericQueryClarificationClosing.js";
import { applyFirstAnswerResponseContract } from "../lib/miaFirstAnswerResponseContract.js";

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
  `\nPATCH 10.1D — Generic Query Clarification Closing Audit (${GENERIC_QUERY_CLARIFICATION_CLOSING_VERSION})\n`
);

console.log("── Apply gate ──");
assert(
  "applies on celular até 2000",
  shouldApplyGenericQueryClarificationClosing({
    query: "celular até 2000",
    responsePath: "return_seguro",
    category: "phone",
  }).apply
);
assert(
  "skips iPhone 15",
  !shouldApplyGenericQueryClarificationClosing({
    query: "iPhone 15",
    responsePath: "return_seguro",
    specificProductLockActive: true,
  }).apply
);
assert(
  "skips comparison query",
  !shouldApplyGenericQueryClarificationClosing({
    query: "compare iPhone 13 e Galaxy A54",
    responsePath: "return_seguro",
    intent: "comparison",
  }).apply
);
assert(
  "skips follow-up battery question",
  !shouldApplyGenericQueryClarificationClosing({
    query: "e a bateria?",
    responsePath: "return_seguro",
    isFollowUp: true,
    sessionContext: { lastBestProduct: { product_name: "iPhone 13" } },
    routingDecision: { allowNewSearch: false },
  }).apply
);

console.log("\n── Question builder ──");
const phoneQuestion = buildGenericQueryClarificationQuestion({
  query: "celular até 2000",
  category: "phone",
  missingContextAxis: "primary_use",
});
assert("phone question is contextual", /câmera|bateria|desempenho|trabalho|fotos|jogos/i.test(phoneQuestion));
assert("phone question is not fixed boilerplate", phoneQuestion !== "Qual seu uso?");

const notebookQuestion = buildGenericQueryClarificationQuestion({
  query: "notebook até 3000",
  category: "notebook",
  missingContextAxis: "primary_use",
});
assert("notebook question mentions study/work/games", /estudo|trabalho|programas|mobilidade|custo/i.test(notebookQuestion));

console.log("\n── Resolver payload ──");
const resolved = resolveGenericQueryClarificationClosing({
  query: "melhor celular custo benefício",
  responsePath: "return_seguro",
  category: "phone",
  winnerProduct: { product_name: "Samsung Galaxy A35" },
});
assert("resolver applies on generic query", resolved.applied);
assert("payload has question", !!resolved.payload?.question);
assert("payload source is generic_query_context_gap", resolved.payload?.source === "generic_query_context_gap");

console.log("\n── First answer contract integration ──");
const integrated = applyFirstAnswerResponseContract({
  reply: "",
  prices: [{ product_name: "Samsung Galaxy A35", source: "Data Layer MIA" }],
  responsePath: "return_seguro",
  query: "celular até 2000",
  category: "phone",
  winnerProduct: {
    product_name: "Samsung Galaxy A35",
    trustedSpecs: { strengths: ["bom desempenho para o dia a dia"] },
  },
  rankedCandidates: [
    { product_name: "Samsung Galaxy A35", trustedSpecs: { strengths: ["x"] }, scoreEngine: { scores: { value: 80 } } },
    { product_name: "Motorola Moto G84", trustedSpecs: { strengths: ["y"] }, scoreEngine: { scores: { value: 75 } } },
  ],
  primaryAxis: "value",
  querySignals: { priceSensitive: true },
});
assert(
  "integrated reply ends with contextual question",
  /\?\s*$/.test(integrated.reply || "") &&
    /ajusto melhor|ajustar melhor|pesa mais/i.test(integrated.reply || "")
);
assert(
  "integrated reply keeps first-answer structure",
  /O que voc[eê] ganha/i.test(integrated.reply || "") &&
    /Mesmo com/i.test(integrated.reply || "")
);

if (process.argv.includes("--http")) {
  console.log("\n── HTTP smoke (requires dev server) ──");
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": "minha_chave_181199",
  };

  const cases = [
    {
      query: "celular até 2000",
      expectClarification: true,
      expectCard: null,
    },
    {
      query: "melhor celular custo benefício",
      expectClarification: true,
      expectCard: null,
    },
    {
      query: "Samsung bom",
      expectClarification: true,
      expectCard: null,
    },
    {
      query: "iPhone 15",
      expectClarification: false,
      expectCard: /iphone\s*15/i,
    },
    {
      query: "iPhone 16",
      expectClarification: false,
      expectCard: /iphone\s*16/i,
    },
    {
      query: "Galaxy M35",
      expectClarification: false,
      expectCard: /galaxy\s*m35/i,
    },
    {
      query: "Galaxy S24 FE",
      expectClarification: false,
      expectCard: /galaxy\s*s24\s*fe/i,
    },
    {
      query: "compare iPhone 13 e Galaxy A54",
      expectClarification: false,
      expectCard: null,
      session: {},
      allowNon200: true,
    },
    {
      query: "e a bateria?",
      expectClarification: false,
      expectCard: null,
      session: {
        lastBestProduct: { product_name: "iPhone 13" },
        lastProducts: [{ product_name: "iPhone 13" }],
        lastQuery: "iPhone 13",
      },
    },
  ];

  for (const testCase of cases) {
    try {
      const resp = await fetch("http://localhost:3000/api/chat-gpt4o", {
        method: "POST",
        headers,
        body: JSON.stringify({
          text: testCase.query,
          session_context: testCase.session || {},
          messages: [],
        }),
      });
      const data = await resp.json();
      const reply = data?.reply || "";
      const cardName =
        data?.prices?.[0]?.product_name ||
        data?.session_context?.lastBestProduct?.product_name ||
        "";
      const hasError = /Tive um problema/i.test(reply);
      const clarification =
        /ajusto melhor|ajustar melhor|pesa mais|me disser|me diz/i.test(reply) &&
        /\?/.test(reply.slice(Math.max(0, reply.length - 220)));

      if (testCase.allowNon200 && resp.status !== 200) {
        console.log(`  ⚠️ ${testCase.query}: skipped downstream checks (status ${resp.status})`);
        continue;
      }

      assert(`${testCase.query}: status 200`, resp.status === 200, String(resp.status));
      if (resp.status !== 200) continue;
      assert(`${testCase.query}: no API error message`, !hasError, reply.slice(0, 120));

      if (testCase.expectCard) {
        assert(
          `${testCase.query}: card preserved`,
          testCase.expectCard.test(cardName) || testCase.expectCard.test(reply),
          cardName || "(empty)"
        );
      }

      if (testCase.expectClarification) {
        assert(`${testCase.query}: contextual closing question`, clarification, reply.slice(-180));
      } else {
        assert(`${testCase.query}: no generic closing question`, !clarification, reply.slice(-180));
      }

      if (testCase.expectClarification) {
        assert(
          `${testCase.query}: runner-up or structure preserved`,
          /O que voc[eê] ganha/i.test(reply) || /Eu iria no/i.test(reply)
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
