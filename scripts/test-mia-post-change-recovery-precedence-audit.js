/**
 * PATCH 8.4C — Post-Change Recovery Precedence Fix Audit
 */

import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";
import { shouldBlockCsoVerbalizer } from "../lib/miaRoutingGuardrails.js";
import { persistExplicitRecommendationChangeToSession } from "../lib/miaExplicitRecommendationChangeProtocol.js";
import {
  buildPostChangeRecoveryReply,
  detectsPostChangeRecoverySignal,
  hasRecentDecisionChange,
} from "../lib/miaPostChangeRecoveryLayer.js";
import {
  buildContradictionRecoveryReply,
  detectsReasoningBreakdownSignal,
} from "../lib/miaContradictionRecoveryLayer.js";
import {
  buildUserConfusionRecoveryReply,
  detectsExplanationBreakdownSignal,
} from "../lib/miaUserConfusionRecoveryLayer.js";
import { namesLikelyMatch } from "../lib/miaDecisionConsistencyFixes.js";

const ANCHOR = { product_name: "Produto Alpha 35", price: "R$ 1.950", source: "search" };
const CHEAPER = { product_name: "Notebook Beta 22", price: "R$ 1.700", source: "search" };
const CATALOG = [ANCHOR, CHEAPER];

const BASE_SESSION = {
  lastBestProduct: ANCHOR,
  lastProducts: CATALOG,
  lastAxis: "longevity",
  lastPriority: "longevity",
};

const CHANGED_SESSION = persistExplicitRecommendationChangeToSession(BASE_SESSION, {
  newWinner: CHEAPER,
  rankedProducts: [CHEAPER, ANCHOR],
  previousWinner: ANCHOR,
  winnerChanged: true,
  shift: {
    previousCriterion: "longevity",
    newCriterion: "value",
    previousLabel: "longevidade",
    newLabel: "menor custo",
    kind: "budget_down",
  },
});

const API = process.env.MIA_API_BASE || "http://localhost:3001";
const API_ENDPOINT = `${API}/api/chat-gpt4o`;
const API_KEY = process.env.MIA_API_KEY || "minha_chave_181199";
const HTTP_ENABLED = process.env.MIA_HTTP_AUDIT === "1" || process.env.MIA_HTTP_AUDIT === "true";

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

console.log("\nPATCH 8.4C — Post-Change Recovery Precedence Fix Audit\n");

console.log("── Decision change history persisted ──\n");

ok(hasRecentDecisionChange(CHANGED_SESSION), "hasRecentDecisionChange=true after 8.4B persist");
ok(!hasRecentDecisionChange(BASE_SESSION), "no change history without explicit change");
ok(
  namesLikelyMatch(CHANGED_SESSION.lastBestProduct?.product_name, CHEAPER.product_name),
  "current winner is new winner"
);
ok(
  namesLikelyMatch(
    CHANGED_SESSION.lastDecisionChange?.previousWinner?.product_name,
    ANCHOR.product_name
  ),
  "lastDecisionChange stores previousWinner"
);

console.log("\n── Post-change recovery detection ──\n");

const postChangeQueries = [
  "voce me confundiu",
  "mas antes era outro",
  "ue, mudou?",
  "nao entendi essa troca",
  "explica essa mudanca",
  "entao qual e afinal?",
  "pera, agora e esse?",
];

for (const q of postChangeQueries) {
  ok(
    detectsPostChangeRecoverySignal(q, {
      hasActiveAnchor: true,
      sessionContext: CHANGED_SESSION,
    }),
    `"${q}" → post-change recovery`
  );
}

const normalQueries = [
  ["nao entendi", "plain comprehension without change reference"],
  ["explica melhor", "generic clarity"],
  ["qual dos dois voce indica?", "binary choice"],
];

for (const [q, label] of normalQueries) {
  ok(
    !detectsPostChangeRecoverySignal(q, {
      hasActiveAnchor: true,
      sessionContext: CHANGED_SESSION,
    }),
    `"${q}" stays generic (${label})`
  );
}

ok(
  !detectsPostChangeRecoverySignal("voce me confundiu", {
    hasActiveAnchor: true,
    sessionContext: BASE_SESSION,
  }),
  "no post-change without history"
);

console.log("\n── Routing precedence ──\n");

const routing = buildRoutingDecision({
  userMessage: "voce me confundiu",
  resolvedQuery: "voce me confundiu",
  sessionContext: CHANGED_SESSION,
  incomingSessionContext: CHANGED_SESSION,
  intent: "search",
  contextAction: "decision",
  cognitiveRoutingSignal: {
    turnType: "CONVERSATIONAL_CONFUSION",
    confidence: 0.82,
    hasActiveAnchor: true,
  },
  signals: {
    hasClearNewCommercialSearch: false,
    isExplicitComparison: false,
    wantsNew: false,
  },
});

ok(routing.mode === "post_change_recovery_hold", `mode=${routing.mode}`);
ok(routing.shouldPreserveAnchor === true, "preserves current winner");
ok(shouldBlockCsoVerbalizer(routing) === true, "CSO verbalizer blocked");

console.log("\n── Reply builder ──\n");

const contradictionReply = buildPostChangeRecoveryReply({
  sessionContext: CHANGED_SESSION,
  query: "voce me confundiu",
  style: "contradiction",
});

ok(/voce tem razao/i.test(normalizeText(contradictionReply)), "contradiction style acknowledges user");
ok(contradictionReply.includes(ANCHOR.product_name), "mentions previous winner");
ok(contradictionReply.includes(CHEAPER.product_name), "mentions current winner");
ok(/prioridade|critério|criterio|menor custo/i.test(normalizeText(contradictionReply)), "explains criterion shift");
ok(/recomendacao atual|recomendação atual/i.test(normalizeText(contradictionReply)), "clear current verdict");

const comprehensionReply = buildPostChangeRecoveryReply({
  sessionContext: CHANGED_SESSION,
  query: "nao entendi essa troca",
  style: "comprehension",
});

ok(/vamos simplificar/i.test(comprehensionReply), "comprehension style opens simply");
ok(comprehensionReply.includes(CHEAPER.product_name), "comprehension uses current winner");

console.log("\n── Generic recovery unchanged without change history ──\n");

const genericSession = {
  ...BASE_SESSION,
  comparisonContextLocked: true,
  lastComparisonProducts: [ANCHOR, CHEAPER],
};

const genericContradiction = buildContradictionRecoveryReply({
  sessionContext: genericSession,
  allowedProducts: [ANCHOR, CHEAPER],
});

ok(
  /voce tem razao|vamos organizar/i.test(genericContradiction),
  "8.3F generic contradiction still works"
);
ok(
  detectsReasoningBreakdownSignal("voce me confundiu", {
    hasActiveAnchor: true,
    sessionContext: genericSession,
  }),
  "8.3F detection unchanged"
);
ok(
  detectsExplanationBreakdownSignal("nao entendi", {
    hasActiveAnchor: true,
    sessionContext: genericSession,
  }),
  "8.3G detection unchanged"
);

const genericConfusion = buildUserConfusionRecoveryReply({
  sessionContext: genericSession,
  allowedProducts: [ANCHOR, CHEAPER],
});

ok(/vamos simplificar/i.test(genericConfusion), "8.3G generic comprehension still works");

async function runHttpF2() {
  console.log("\n── HTTP F2 scenario (optional) ──\n");

  if (!HTTP_ENABLED) {
    console.log("  (skipped — set MIA_HTTP_AUDIT=1 to run HTTP)\n");
    return;
  }

  let sessionContext = {};
  let messages = [];
  const turns = [
    "celular ate 2000",
    "quero gastar o minimo possivel.",
    "voce me confundiu",
  ];

  for (let i = 0; i < turns.length; i++) {
    const resp = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
      body: JSON.stringify({
        text: turns[i],
        user_id: "audit-84c",
        conversation_id: `audit-84c-f2-${Date.now()}`,
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
      const path =
        data.mia_debug?.pipelineTrace?.response_path ||
        data.mia_debug?.pipelineTrace?.responsePath ||
        "";
      const sessionWinner = sessionContext.lastBestProduct?.product_name || "";
      const hasChangeHistory = !!sessionContext.lastDecisionChange?.winnerChanged;

      ok(hasChangeHistory, "HTTP F2: session has lastDecisionChange");
      ok(
        /voce tem razao|vamos organizar|vamos simplificar/i.test(reply),
        "HTTP F2: recovery protocol in reply"
      );
      ok(
        /iphone 13/i.test(normalizeText(reply)) && /galaxy a35|samsung galaxy a35/i.test(normalizeText(reply)),
        "HTTP F2: reply explains both previous and current winner"
      );
      ok(
        path === "post_change_recovery_reorganize" ||
          /recomendacao atual|recomendação atual/i.test(normalizeText(reply)),
        `HTTP F2: post-change path or verdict (path=${path})`
      );
      ok(
        sessionWinner && /galaxy a35|samsung galaxy a35/i.test(normalizeText(sessionWinner)),
        `HTTP F2: session keeps current winner (${sessionWinner})`
      );
    }
  }
}

await runHttpF2();

console.log(`\nResult: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log("PATCH 8.4C audit: PASSED\n");
  process.exit(0);
} else {
  console.log("PATCH 8.4C audit: FAILED\n");
  process.exit(1);
}
