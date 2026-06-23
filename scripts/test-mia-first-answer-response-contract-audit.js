/**
 * PATCH 10.1B — First Answer Response Contract Audit
 *
 * Usage:
 *   node scripts/test-mia-first-answer-response-contract-audit.js
 *   node scripts/test-mia-first-answer-response-contract-audit.js --http
 */

import {
  FIRST_ANSWER_RESPONSE_CONTRACT_VERSION,
  applyFirstAnswerResponseContract,
  buildFirstAnswerStructuredReply,
  isFalseSacrificeText,
  sanitizeDisplaySource,
  sanitizeFirstAnswerReplyText,
  sanitizeSacrificeItems,
  shouldApplyFirstAnswerResponseContract,
} from "../lib/miaFirstAnswerResponseContract.js";

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
  `\nPATCH 10.1B — First Answer Response Contract Audit (${FIRST_ANSWER_RESPONSE_CONTRACT_VERSION})\n`
);

console.log("── Source sanitization ──");
assert(
  "query_product_anchor masked",
  sanitizeDisplaySource("query_product_anchor") === "Data Layer MIA"
);
assert(
  "regular store preserved",
  sanitizeDisplaySource("Mercado Livre") === "Mercado Livre"
);

console.log("\n── False sacrifice detection ──");
assert(
  "blocks menos sensação de limite",
  isFalseSacrificeText("Menos sensação de limite quando o aparelho é exigido")
);
assert(
  "allows real sacrifice",
  !isFalseSacrificeText("Pode pesar no bolso frente a linhas intermediárias")
);

console.log("\n── Banned phrase cleanup ──");
const dirtyReply =
  "risco de arrependimento quando o uso real não cobre o que a busca pediu. pesa mais do que parece. pesa mais do que parece. vale comparar preço, garantia, prazo de entrega, reputação.";
const cleaned = sanitizeFirstAnswerReplyText(dirtyReply);
assert("removes banned regret phrase", !/risco de arrependimento/i.test(cleaned));
assert("dedupes pesa mais do que parece", (cleaned.match(/pesa mais do que parece/gi) || []).length <= 1);
assert("removes generic compare phrase", !/vale comparar preço, garantia/i.test(cleaned));

console.log("\n── Structure builder ──");
const structured = buildFirstAnswerStructuredReply({
  winnerName: "iPhone 15",
  query: "iPhone 15",
  gains: ["Atende diretamente o modelo que você citou nesta busca"],
  sacrifices: sanitizeSacrificeItems([
    "Menos sensação de limite quando o aparelho é exigido",
  ]),
});
assert("has opening", /Eu iria no iPhone 15 porque/i.test(structured));
assert("has gains block", /O que voc[eê] ganha/i.test(structured));
assert("has sacrifice block", /O que voc[eê] abre m[aã]o/i.test(structured));
assert("has closing", /Mesmo com/i.test(structured) && /eu manteria o iPhone 15/i.test(structured));
assert(
  "no false sacrifice in output",
  !/menos sensação de limite/i.test(structured)
);
assert(
  "tradeoff headers separated from bullets",
  /✅[^\n]+\n\n•/s.test(structured) && /⚠️[^\n]+\n\n•/s.test(structured)
);
assert(
  "tradeoff bullets not collapsed on header line",
  !/✅[^\n]+•/.test(structured) && !/⚠️[^\n]+•/.test(structured)
);

console.log("\n── Contract application ──");
const contractResult = applyFirstAnswerResponseContract({
  reply: dirtyReply,
  prices: [
    {
      product_name: "iPhone 15",
      source: "query_product_anchor",
      link: null,
    },
  ],
  responsePath: "return_seguro",
  query: "iPhone 15",
  winnerProduct: { product_name: "iPhone 15", specificProductQueryAnchor: true },
});
assert("contract applied on return_seguro", contractResult.applied);
assert(
  "technical source removed from prices",
  contractResult.prices[0]?.source === "Data Layer MIA"
);
assert(
  "reply has structure after apply",
  /O que voc[eê] ganha/i.test(contractResult.reply) &&
    /O que voc[eê] abre m[aã]o/i.test(contractResult.reply)
);
assert(
  "audit fields present",
  contractResult.audit?.removedTechnicalSource === true &&
    typeof contractResult.audit?.gainsCount === "number"
);

assert(
  "skips non-first-answer paths",
  !shouldApplyFirstAnswerResponseContract("comparison_followup")
);

if (process.argv.includes("--http")) {
  console.log("\n── HTTP smoke (requires dev server) ──");
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": "minha_chave_181199",
  };

  const cases = [
    {
      query: "iPhone 15",
      expectCard: /iphone\s*15/i,
      checks: (data) => {
        const source = data?.prices?.[0]?.source || "";
        const reply = data?.reply || "";
        return (
          !/query_product_anchor/i.test(source) &&
          !/query_product_anchor/i.test(reply) &&
          /O que voc[eê] ganha/i.test(reply) &&
          /O que voc[eê] abre m[aã]o/i.test(reply) &&
          /Eu iria no/i.test(reply)
        );
      },
    },
    {
      query: "iPhone 16",
      expectCard: /iphone\s*16/i,
      checks: (data) => !/Tive um problema/i.test(data?.reply || ""),
    },
    {
      query: "Galaxy M35",
      expectCard: /galaxy\s*m35/i,
      checks: (data) =>
        /O que voc[eê] ganha/i.test(data?.reply || "") &&
        /O que voc[eê] abre m[aã]o/i.test(data?.reply || ""),
    },
    {
      query: "Galaxy S24 FE",
      expectCard: /galaxy\s*s24\s*fe/i,
      checks: (data) => !/menos sensação de limite/i.test(data?.reply || ""),
    },
    {
      query: "celular até 2000",
      expectCard: null,
      checks: (data) =>
        Array.isArray(data?.prices) &&
        data.prices.length > 0 &&
        !/query_product_anchor/i.test(JSON.stringify(data)),
    },
    {
      query: "melhor celular custo benefício",
      expectCard: null,
      checks: (data) =>
        Array.isArray(data?.prices) &&
        data.prices.length > 0 &&
        !/Tive um problema/i.test(data?.reply || ""),
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
      const cardName =
        data?.prices?.[0]?.product_name ||
        data?.session_context?.lastBestProduct?.product_name ||
        "";
      const hasError = /Tive um problema/i.test(data?.reply || "");

      assert(`${testCase.query}: status 200`, resp.status === 200, String(resp.status));
      assert(`${testCase.query}: no API error message`, !hasError, data?.reply?.slice(0, 120) || "");
      if (testCase.expectCard) {
        assert(
          `${testCase.query}: card matches expected product`,
          testCase.expectCard.test(cardName) || testCase.expectCard.test(data?.reply || ""),
          cardName || "(empty)"
        );
      }
      assert(
        `${testCase.query}: first-answer contract checks`,
        testCase.checks(data),
        data?.prices?.[0]?.source || data?.reply?.slice(0, 80) || ""
      );
    } catch (err) {
      failed += 1;
      console.log(`  ❌ ${testCase.query}: HTTP failed — ${err.message}`);
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
