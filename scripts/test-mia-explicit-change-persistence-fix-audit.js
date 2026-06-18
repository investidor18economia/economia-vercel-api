/**
 * PATCH 8.4B — Explicit Change Persistence Fix Audit
 *
 * Valida que explicit_recommendation_change verbaliza E persiste o novo winner,
 * inclusive com discussion set locked (caso F1 do 8.4A).
 */

import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";
import { applyContractToSessionContext } from "../lib/miaRoutingGuardrails.js";
import {
  buildExplicitChangeFromSession,
  persistExplicitRecommendationChangeToSession,
  detectsLegitimateDecisionContextChange,
} from "../lib/miaExplicitRecommendationChangeProtocol.js";
import { namesLikelyMatch } from "../lib/miaDecisionConsistencyFixes.js";
import { extractMentionedProductFromReply } from "../lib/miaDecisionConsistencyAudit.js";

const API = process.env.MIA_API_BASE || "http://localhost:3000";
const API_ENDPOINT = `${API}/api/chat-gpt4o`;
const API_KEY = process.env.MIA_API_KEY || "minha_chave_181199";
const HTTP_ENABLED = process.env.MIA_HTTP_AUDIT === "1" || process.env.MIA_HTTP_AUDIT === "true";

const ANCHOR = { product_name: "Produto Alpha 35", price: "R$ 1.950", source: "search" };
const CHEAPER = { product_name: "Notebook Beta 22", price: "R$ 1.700", source: "search" };
const PREMIUM = { product_name: "Monitor Gamma 27", price: "R$ 2.200", source: "search" };
const CATALOG = [ANCHOR, CHEAPER, PREMIUM];

const LOCKED_SESSION = {
  lastBestProduct: ANCHOR,
  lastProducts: CATALOG,
  lastRankingSnapshot: CATALOG,
  lastAxis: "longevity",
  lastPriority: "longevity",
  comparisonContextLocked: true,
  lastComparisonProducts: [ANCHOR, CHEAPER],
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

function pickName(p) {
  return p?.product_name || null;
}

console.log("\nPATCH 8.4B — Explicit Change Persistence Fix Audit\n");

console.log("── Routing precedence over comparison_followup ──\n");

const routingLocked = buildRoutingDecision({
  userMessage: "quero gastar o minimo possivel",
  resolvedQuery: "quero gastar o minimo possivel",
  sessionContext: LOCKED_SESSION,
  incomingSessionContext: LOCKED_SESSION,
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
    hasComparisonProducts: true,
    isComparisonFollowUpLocked: true,
    isComparisonContextFollowUp: true,
  },
});

ok(
  routingLocked.mode === "explicit_recommendation_change",
  `locked discussion set → mode=${routingLocked.mode}`
);
ok(routingLocked.allowReplaceWinner === true, "allowReplaceWinner=true");
ok(routingLocked.shouldPreserveAnchor === false, "shouldPreserveAnchor=false");

console.log("\n── Session builder + persist helper ──\n");

const built = buildExplicitChangeFromSession({
  message: "quero gastar o minimo possivel",
  sessionContext: LOCKED_SESSION,
});

ok(built.winnerChanged, "winner changes on budget_down with locked set");
ok(
  namesLikelyMatch(built.newWinner?.product_name, CHEAPER.product_name),
  "new winner is cheapest in catalog"
);
ok(
  namesLikelyMatch(built.sessionOut?.lastBestProduct?.product_name, CHEAPER.product_name),
  "sessionOut.lastBestProduct = new winner"
);
ok(
  built.sessionOut?.lastProductMentioned === CHEAPER.product_name,
  "sessionOut.lastProductMentioned aligned"
);
ok(
  namesLikelyMatch(
    built.sessionOut?.lastComparisonProducts?.[0]?.product_name,
    CHEAPER.product_name
  ) ||
    built.sessionOut?.lastComparisonProducts?.some((p) =>
      namesLikelyMatch(p?.product_name, CHEAPER.product_name)
    ),
  "discussion set includes new winner"
);

const persisted = persistExplicitRecommendationChangeToSession(LOCKED_SESSION, {
  newWinner: CHEAPER,
  rankedProducts: [CHEAPER, ANCHOR, PREMIUM],
  previousWinner: ANCHOR,
  winnerChanged: true,
  shift: { newCriterion: "value" },
});

ok(
  namesLikelyMatch(persisted.lastBestProduct?.product_name, CHEAPER.product_name),
  "persist helper sets lastBestProduct"
);
ok(persisted.lastPriority === "value", "persist helper updates lastPriority");

console.log("\n── Contract apply does not revert explicit change ──\n");

const contractOut = applyContractToSessionContext(
  built.sessionOut,
  routingLocked,
  {
    proposedBestProduct: built.newWinner,
    proposedProducts: built.rankedProducts,
    incomingLastBest: ANCHOR,
  }
);

ok(
  namesLikelyMatch(contractOut.lastBestProduct?.product_name, CHEAPER.product_name),
  "applyContractToSessionContext keeps new winner"
);

console.log("\n── Illegitimate changes still blocked ──\n");

const blockedQueries = [
  "nao quero gastar muito",
  "sera que compensa?",
  "e se eu gastar menos?",
  "voce me confundiu",
  "nao entendi",
];

for (const q of blockedQueries) {
  ok(
    !detectsLegitimateDecisionContextChange(q, { hasActiveAnchor: true }),
    `"${q}" not treated as explicit change`
  );
}

async function runHttpF1() {
  console.log("\n── HTTP F1 scenario (optional) ──\n");

  if (!HTTP_ENABLED) {
    console.log("  (skipped — set MIA_HTTP_AUDIT=1 to run HTTP)\n");
    return;
  }

  let sessionContext = {};
  let messages = [];
  const turns = [
    "celular ate 2000",
    "estou em duvida entre esse e o Galaxy A35",
    "quero gastar o minimo possivel.",
  ];

  for (let i = 0; i < turns.length; i++) {
    const resp = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
      body: JSON.stringify({
        text: turns[i],
        user_id: "audit-84b",
        conversation_id: `audit-84b-f1-${Date.now()}`,
        messages,
        session_context: sessionContext,
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!resp.ok) {
      ok(false, `HTTP turn ${i + 1} status ${resp.status}`);
      return;
    }

    const data = await resp.json();
    const reply = String(data.reply || "");
    messages = [...messages, { role: "user", content: turns[i] }, { role: "assistant", content: reply }];
    sessionContext = data.session_context || sessionContext;

    if (i === 2) {
      const sessionWinner = pickName(sessionContext.lastBestProduct);
      const verbalized = extractMentionedProductFromReply(reply);
      const path =
        data.mia_debug?.pipelineTrace?.response_path ||
        data.mia_debug?.pipelineTrace?.responsePath ||
        "";
      const mode = data.mia_debug?.pipelineTrace?.routingDecision?.mode || "";

      ok(/sua prioridade mudou/i.test(reply), "HTTP F1: explicit change protocol in reply");
      ok(
        sessionWinner && verbalized && namesLikelyMatch(sessionWinner, verbalized),
        `HTTP F1: session winner aligned with verbalized (${sessionWinner} ≈ ${verbalized})`
      );
      ok(
        path === "explicit_recommendation_change_reply" || mode === "explicit_recommendation_change",
        `HTTP F1: routing path/mode correct (path=${path}, mode=${mode})`
      );
    }
  }
}

await runHttpF1();

console.log(`\nResult: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log("PATCH 8.4B audit: PASSED\n");
  process.exit(0);
} else {
  console.log("PATCH 8.4B audit: FAILED\n");
  process.exit(1);
}
