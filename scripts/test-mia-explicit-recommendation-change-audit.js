/**
 * PATCH 8.3E — Explicit Recommendation Change Protocol Audit
 */

import { classifyMiaTurn, MIA_TURN_TYPES } from "../lib/miaCognitiveRouter.js";
import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";
import { isAnchoredSpendingAversion } from "../lib/miaRoutingSafety.js";
import {
  buildExplicitRecommendationChangeReply,
  buildExplicitChangeFromSession,
  detectsLegitimateDecisionContextChange,
  inferDecisionContextShift,
  resolveRecommendationAfterContextChange,
} from "../lib/miaExplicitRecommendationChangeProtocol.js";
import { namesLikelyMatch } from "../lib/miaDecisionConsistencyFixes.js";

const ANCHOR = { product_name: "Produto Alpha 35", price: "R$ 1.950", source: "search" };
const CHEAPER = { product_name: "Notebook Beta 22", price: "R$ 1.700", source: "search" };
const PREMIUM = { product_name: "Monitor Gamma 27", price: "R$ 2.200", source: "search" };
const CATALOG = [ANCHOR, CHEAPER, PREMIUM];

const SESSION = {
  lastBestProduct: ANCHOR,
  lastProducts: CATALOG,
  lastRankingSnapshot: CATALOG,
  lastAxis: "longevity",
  lastPriority: "longevity",
  lastCategory: "notebook",
};

let passed = 0;
let failed = 0;

function ok(cond, label) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}`);
  }
}

function normalizeText(s = "") {
  return String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

console.log("\nPATCH 8.3E — Explicit Recommendation Change Protocol Audit\n");

console.log("── Legitimate context change detection ──\n");

const positiveCases = [
  "quero gastar o minimo possivel",
  "agora quero economizar",
  "ta pesado no bolso",
  "quero gastar menos",
  "vou reduzir orcamento",
  "quero algo mais barato",
  "agora valorizo mais custo-beneficio",
  "minha prioridade mudou para bateria",
  "agora prioridade e camera",
  "mudei de ideia no orcamento",
  "qro gastar menos",
  "acho que vou gastar menos",
  "vou aumentar o orcamento",
];

for (const msg of positiveCases) {
  ok(
    detectsLegitimateDecisionContextChange(msg, { hasActiveAnchor: true }),
    `"${msg}" → detected`
  );
}

const negativeCases = [
  ["nao quero investir tanto", "spending aversion 8.3A"],
  ["sera que compensa? nao quero gastar muito", "spending aversion 8.3A"],
  ["e se eu gastar menos", "hypothetical constraint"],
  ["qual e mais seguro", "comparative reevaluation"],
  ["celular ate 2000", "new search"],
  ["voce me confundiu", "contradiction recovery"],
  ["nao entendi", "comprehension recovery"],
];

for (const [msg, label] of negativeCases) {
  ok(
    !detectsLegitimateDecisionContextChange(msg, { hasActiveAnchor: true }),
    `"${msg}" blocked (${label})`
  );
}

ok(
  isAnchoredSpendingAversion("nao quero gastar muito"),
  "8.3A spending aversion still isolated"
);

console.log("\n── Routing contract ──\n");

const routing = buildRoutingDecision({
  userMessage: "quero gastar o minimo possivel",
  resolvedQuery: "quero gastar o minimo possivel",
  sessionContext: SESSION,
  incomingSessionContext: SESSION,
  intent: "search",
  contextAction: "decision",
  cognitiveRoutingSignal: {
    turnType: "PRIORITY_SHIFT",
    confidence: 0.84,
    hasActiveAnchor: true,
  },
  signals: {
    hasClearNewCommercialSearch: false,
    isExplicitComparison: false,
    wantsNew: false,
  },
});

ok(routing.mode === "explicit_recommendation_change", `mode=${routing.mode}`);
ok(routing.allowReplaceWinner === true, "allowReplaceWinner=true");
ok(routing.shouldPreserveAnchor === false, "shouldPreserveAnchor=false");

console.log("\n── Winner rerank from state ──\n");

const shift = inferDecisionContextShift("quero gastar o minimo possivel", SESSION);
const resolved = resolveRecommendationAfterContextChange({
  catalogProducts: CATALOG,
  previousWinner: ANCHOR,
  shift,
});

ok(resolved.winnerChanged === true, "winner changes on budget_down");
ok(
  namesLikelyMatch(resolved.newWinner?.product_name, CHEAPER.product_name),
  "new winner is cheapest in catalog"
);

const reply = buildExplicitRecommendationChangeReply({
  previousWinner: ANCHOR,
  newWinner: resolved.newWinner,
  shift,
  winnerChanged: resolved.winnerChanged,
  sessionContext: SESSION,
});

ok(/sua prioridade mudou/i.test(reply), "acknowledges priority shift");
ok(/antes eu estava priorizando/i.test(reply), "states previous criterion");
ok(/agora estou priorizando/i.test(reply), "states new criterion");
ok(reply.includes(ANCHOR.product_name), "mentions previous winner");
ok(reply.includes(CHEAPER.product_name), "mentions new winner");
ok(/eu recomendo/i.test(normalizeText(reply)), "clear verdict");

console.log("\n── Session builder ──\n");

const built = buildExplicitChangeFromSession({
  message: "quero gastar o minimo possivel",
  sessionContext: SESSION,
});

ok(built.winnerChanged, "session builder detects winner change");
ok(!/\bmonitor gamma\b/i.test(built.reply), "no external product leak in reply");

console.log(`\nResult: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log("PATCH 8.3E audit: PASSED\n");
  process.exit(0);
} else {
  console.log("PATCH 8.3E audit: FAILED\n");
  process.exit(1);
}
