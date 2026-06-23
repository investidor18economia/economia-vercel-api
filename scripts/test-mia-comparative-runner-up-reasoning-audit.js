/**
 * PATCH 10.1C — Comparative Runner-Up Reasoning Audit
 *
 * Usage:
 *   node scripts/test-mia-comparative-runner-up-reasoning-audit.js
 *   node scripts/test-mia-comparative-runner-up-reasoning-audit.js --http
 */

import {
  COMPARATIVE_RUNNER_UP_REASONING_VERSION,
  findTrustedRunnerUp,
  isSameProductFamily,
  isTrustedRunnerUpCandidate,
  resolveComparativeRunnerUpReasoning,
  resolveProductDisplayName,
} from "../lib/miaComparativeRunnerUpReasoning.js";
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

function product(name, extra = {}) {
  return {
    product_name: name,
    familyKey: extra.familyKey || name.toLowerCase(),
    trustedSpecs: {
      official_name: name,
      strengths: extra.strengths || ["bom desempenho para o dia a dia"],
      weaknesses: extra.weaknesses || ["preço mais alto que rivais"],
      ideal_for: extra.ideal_for || [],
      avoid_if: extra.avoid_if || [],
      ...(extra.trustedSpecs || {}),
    },
    scoreEngine: {
      scores: extra.scores || {
        value: 80,
        performance: 75,
        battery: 70,
        longevity: 72,
      },
    },
    ...extra,
  };
}

console.log(
  `\nPATCH 10.1C — Comparative Runner-Up Reasoning Audit (${COMPARATIVE_RUNNER_UP_REASONING_VERSION})\n`
);

console.log("── Runner-up selection ──");
const winner = product("Samsung Galaxy A35", {
  familyKey: "galaxy a35",
  scores: { value: 88, performance: 70, battery: 75, longevity: 70 },
});
const runner = product("Motorola Moto G84", {
  familyKey: "moto g84",
  scores: { value: 82, performance: 68, battery: 78, longevity: 68 },
});
const sameFamily = product("Samsung Galaxy A35 5G", { familyKey: "galaxy a35" });
const commercialOnly = {
  product_name: "Loja X Phone",
  source: "google_shopping",
};

assert("trusted data layer candidate accepted", isTrustedRunnerUpCandidate(runner));
assert("commercial-only without specs rejected", !isTrustedRunnerUpCandidate(commercialOnly));
assert("same family detected", isSameProductFamily(winner, sameFamily));

const picked = findTrustedRunnerUp({
  winner,
  candidates: [winner, sameFamily, runner, commercialOnly],
});
assert("runner-up is rank 2 trusted product", resolveProductDisplayName(picked.runnerUp) === "Motorola Moto G84");
assert("runner-up source classified", !!picked.runnerUpSource);

console.log("\n── Comparative reasoning payload ──");
const reasoning = resolveComparativeRunnerUpReasoning({
  query: "celular até 2000",
  winner,
  rankedCandidates: [winner, runner],
  primaryAxis: "value",
  querySignals: { priceSensitive: true },
});
assert("generic search applies comparative reasoning", reasoning.applied);
assert("reason mentions runner-up", /Moto G84|Motorola/i.test(reasoning.reason || ""));
assert("reason mentions winner edge", /custo-benef|encaixa|vantagem/i.test(reasoning.reason || ""));

console.log("\n── Specific product lock soft behavior ──");
const anchorWinner = {
  product_name: "iPhone 15",
  familyKey: "iphone 15",
  source: "query_product_anchor",
  specificProductQueryAnchor: true,
};
const anchorReasoning = resolveComparativeRunnerUpReasoning({
  query: "iPhone 15",
  winner: anchorWinner,
  rankedCandidates: [anchorWinner, runner],
  primaryAxis: "performance",
  specificProductLockActive: true,
  specificProductQueryAnchor: true,
});
if (anchorReasoning.applied) {
  assert(
    "specific lock uses softer comparative tone",
    /alternativa|manteria o iPhone 15|busca direta/i.test(anchorReasoning.reason || "")
  );
} else {
  assert("specific lock skips when no trusted runner-up", true);
}

console.log("\n── First answer contract integration ──");
const integrated = applyFirstAnswerResponseContract({
  reply: "",
  prices: [{ product_name: "Samsung Galaxy A35", source: "Data Layer MIA" }],
  responsePath: "return_seguro",
  query: "celular até 2000",
  winnerProduct: winner,
  rankedCandidates: [winner, runner],
  primaryAxis: "value",
  querySignals: { priceSensitive: true },
});
assert(
  "integrated reply contains comparative paragraph",
  /chegou perto|Quase te recomendaria|também entrou forte/i.test(integrated.reply || "")
);
assert(
  "integrated reply keeps first-answer structure",
  /O que voc[eê] ganha/i.test(integrated.reply || "") &&
    /O que voc[eê] abre m[aã]o/i.test(integrated.reply || "")
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
      expectCard: null,
      expectComparative: true,
    },
    {
      query: "melhor celular custo benefício",
      expectCard: null,
      expectComparative: true,
    },
    {
      query: "iPhone 15",
      expectCard: /iphone\s*15/i,
      expectComparative: false,
    },
    {
      query: "iPhone 16",
      expectCard: /iphone\s*16/i,
      expectComparative: false,
    },
    {
      query: "Galaxy M35",
      expectCard: /galaxy\s*m35/i,
      expectComparative: false,
    },
    {
      query: "Galaxy S24 FE",
      expectCard: /galaxy\s*s24\s*fe/i,
      expectComparative: false,
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
      const reply = data?.reply || "";
      const hasError = /Tive um problema/i.test(reply);
      const comparative =
        /chegou perto|Quase te recomendaria|também entrou forte|Como alternativa/i.test(reply);

      assert(`${testCase.query}: status 200`, resp.status === 200, String(resp.status));
      assert(`${testCase.query}: no API error message`, !hasError, reply.slice(0, 120));

      if (testCase.expectCard) {
        assert(
          `${testCase.query}: card preserved`,
          testCase.expectCard.test(cardName) || testCase.expectCard.test(reply),
          cardName || "(empty)"
        );
      }

      if (testCase.expectComparative) {
        assert(`${testCase.query}: comparative runner-up cited`, comparative, reply.slice(0, 160));
      }

      assert(
        `${testCase.query}: first-answer structure preserved`,
        /O que voc[eê] ganha/i.test(reply) && /O que voc[eê] abre m[aã]o/i.test(reply)
      );
    } catch (err) {
      failed += 1;
      console.log(`  ❌ ${testCase.query}: HTTP failed — ${err.message}`);
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
