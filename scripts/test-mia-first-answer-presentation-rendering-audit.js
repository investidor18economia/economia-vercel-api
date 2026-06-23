/**
 * PATCH 10.1B.1 — First Answer Presentation Rendering Audit
 *
 * Usage:
 *   node scripts/test-mia-first-answer-presentation-rendering-audit.js
 */

import {
  FIRST_ANSWER_RESPONSE_CONTRACT_VERSION,
  applyFirstAnswerResponseContract,
  buildFirstAnswerStructuredReply,
  sanitizeFirstAnswerReplyText,
  sanitizeSacrificeItems,
} from "../lib/miaFirstAnswerResponseContract.js";
import { renderTradeoffPresentationBlock } from "../lib/miaSpecialistPresentationContract.js";

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

function hasStructuredTradeoffBlock(reply = "") {
  const body = String(reply || "");
  const gainHeaderSeparated = /✅[^\n]+\n\n•/s.test(body);
  const sacrificeHeaderSeparated = /⚠️[^\n]+\n\n•/s.test(body);
  const bulletsOnOwnLines = !/✅[^\n]+•/.test(body) && !/⚠️[^\n]+•/.test(body);
  return gainHeaderSeparated && sacrificeHeaderSeparated && bulletsOnOwnLines;
}

console.log(
  `\nPATCH 10.1B.1 — First Answer Presentation Rendering Audit (${FIRST_ANSWER_RESPONSE_CONTRACT_VERSION})\n`
);

console.log("── Tradeoff renderer baseline ──");
const rawTradeoff = renderTradeoffPresentationBlock({
  gains: ["Tela fluida no cotidiano", "Bom desempenho para o dia a dia"],
  sacrifices: ["Autonomia abaixo do topo da categoria", "Preço mais alto que rivais"],
});
assert("renderer keeps header before bullets", hasStructuredTradeoffBlock(rawTradeoff));
assert("renderer uses double newlines", (rawTradeoff.match(/\n\n/g) || []).length >= 4);

console.log("\n── Structure builder preserves layout ──");
const structured = buildFirstAnswerStructuredReply({
  winnerName: "iPhone 15",
  query: "iPhone 15",
  gains: [
    "Tela fluida no cotidiano",
    "Bom desempenho para o dia a dia",
    "Câmera confiável para fotos e vídeos",
  ],
  sacrifices: sanitizeSacrificeItems([
    "Autonomia abaixo do topo da categoria",
    "Preço mais alto que rivais",
  ]),
});
assert("structured reply keeps tradeoff blocks", hasStructuredTradeoffBlock(structured));
assert(
  "sections separated by blank lines",
  structured.split(/\n\s*\n/).length >= 5
);
assert(
  "opening not collapsed into gains",
  !/Eu iria no iPhone 15 porque[^]*✅ O que você ganha •/i.test(structured)
);

console.log("\n── Sanitizer preserves multiline structure ──");
const multilineReply = [
  "Eu iria no iPhone 15 porque tela fluida no cotidiano.",
  "",
  rawTradeoff,
  "",
  "Mesmo com autonomia abaixo do topo da categoria, eu manteria o iPhone 15 porque tela fluida no cotidiano.",
].join("\n");
const sanitized = sanitizeFirstAnswerReplyText(multilineReply);
assert("sanitize keeps tradeoff layout", hasStructuredTradeoffBlock(sanitized));
assert("sanitize keeps section breaks", sanitized.includes("\n\n"));

console.log("\n── Contract application preserves layout ──");
const contractResult = applyFirstAnswerResponseContract({
  reply: "risco de arrependimento quando o uso real não cobre o que a busca pediu.",
  prices: [
    {
      product_name: "iPhone 15",
      source: "query_product_anchor",
      link: null,
    },
  ],
  responsePath: "return_seguro",
  query: "iPhone 15",
  winnerProduct: {
    product_name: "iPhone 15",
    specificProductQueryAnchor: true,
    presentation: {
      tradeoff: {
        gains: [
          "Tela fluida no cotidiano",
          "Bom desempenho para o dia a dia",
          "Câmera confiável para fotos e vídeos",
        ],
        sacrifices: ["Autonomia abaixo do topo da categoria", "Preço mais alto que rivais"],
      },
    },
  },
  presentation: {
    tradeoff: {
      gains: [
        "Tela fluida no cotidiano",
        "Bom desempenho para o dia a dia",
        "Câmera confiável para fotos e vídeos",
      ],
      sacrifices: ["Autonomia abaixo do topo da categoria", "Preço mais alto que rivais"],
    },
  },
});
assert("contract reply keeps tradeoff layout", hasStructuredTradeoffBlock(contractResult.reply));

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
