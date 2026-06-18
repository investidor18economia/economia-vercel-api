/**
 * PATCH 8.4D — Final Decision Scope Guard Audit
 */

import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";
import { shouldBlockCsoVerbalizer } from "../lib/miaRoutingGuardrails.js";
import { persistExplicitRecommendationChangeToSession } from "../lib/miaExplicitRecommendationChangeProtocol.js";
import {
  buildFinalDecisionScopeReply,
  buildFinalDecisionRefocusReply,
  buildScopedAttributeFollowUpReply,
  detectsFinalDecisionRefocusQuery,
  detectsFinalDecisionScopeQuery,
  detectsScopedAttributeFollowUpQuery,
  hasActiveFinalDecisionScope,
  resolveFinalDecisionScopeProducts,
} from "../lib/miaFinalDecisionScopeGuard.js";
import {
  resolveAllowedProductsForDecision,
  replyMentionsProductOutsideAllowedSet,
} from "../lib/miaRecommendationStabilityGuard.js";
import { namesLikelyMatch } from "../lib/miaDecisionConsistencyFixes.js";

const ANCHOR = { product_name: "Produto Alpha 35", price: "R$ 1.950", source: "search" };
const CHEAPER = { product_name: "Notebook Beta 22", price: "R$ 1.700", source: "search" };
const EXTERNAL = { product_name: "Monitor Gamma 27", price: "R$ 2.200", source: "search" };
const CATALOG = [ANCHOR, CHEAPER, EXTERNAL];

const CHANGED_SESSION = persistExplicitRecommendationChangeToSession(
  {
    lastBestProduct: ANCHOR,
    lastProducts: CATALOG,
    lastAxis: "longevity",
    lastPriority: "longevity",
    lastMainConsequence: "melhor equilibrio no uso diario",
  },
  {
    newWinner: CHEAPER,
    rankedProducts: [CHEAPER, ANCHOR, EXTERNAL],
    previousWinner: ANCHOR,
    winnerChanged: true,
    shift: {
      previousCriterion: "longevity",
      newCriterion: "value",
      previousLabel: "longevidade",
      newLabel: "menor custo",
      kind: "budget_down",
    },
  }
);

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

console.log("\nPATCH 8.4D — Final Decision Scope Guard Audit\n");

console.log("── Active decision scope detection ──\n");

ok(hasActiveFinalDecisionScope(CHANGED_SESSION), "scope active after explicit change");
ok(!hasActiveFinalDecisionScope({ lastBestProduct: ANCHOR }), "no scope without change/discussion");

console.log("\n── Query detection ──\n");

const scopedQueries = [
  "entao qual e afinal?",
  "qual eu compro?",
  "mantem esse?",
  "e a bateria?",
  "e no desempenho?",
  "e camera?",
  "ainda vale?",
  "continua valendo?",
];

for (const q of scopedQueries) {
  ok(
    detectsFinalDecisionScopeQuery(q, {
      hasActiveAnchor: true,
      sessionContext: CHANGED_SESSION,
    }),
    `"${q}" → scoped follow-up`
  );
}

const reopenQueries = [
  "procura outros modelos",
  "quero ver outras opcoes",
  "agora quero notebook",
];

for (const q of reopenQueries) {
  ok(
    !detectsFinalDecisionScopeQuery(q, {
      hasActiveAnchor: true,
      sessionContext: CHANGED_SESSION,
    }),
    `"${q}" not scoped (new search)`
  );
}

console.log("\n── Scoped products (no full catalog) ──\n");

const scoped = resolveFinalDecisionScopeProducts(CHANGED_SESSION, CATALOG);
ok(scoped.length >= 2 && scoped.length <= 3, `scoped count=${scoped.length} (not full catalog)`);
ok(
  !scoped.some((p) => namesLikelyMatch(p.product_name, EXTERNAL.product_name)),
  "external Monitor Gamma excluded from scope"
);
ok(
  scoped.some((p) => namesLikelyMatch(p.product_name, CHEAPER.product_name)),
  "current winner in scope"
);
ok(
  scoped.some((p) => namesLikelyMatch(p.product_name, ANCHOR.product_name)),
  "previous winner in scope"
);

const resolved = resolveAllowedProductsForDecision({
  sessionContext: CHANGED_SESSION,
  query: "e a bateria?",
  anchorProduct: CHEAPER,
  catalogProducts: CATALOG,
});

ok(resolved.finalDecisionScopeActive === true, "resolveAllowedProducts scopes active decision");
ok(
  !resolved.allowedProducts.some((p) =>
    namesLikelyMatch(p.product_name, EXTERNAL.product_name)
  ),
  "allowedProducts excludes external catalog item"
);

console.log("\n── Reply builders ──\n");

const refocusReply = buildFinalDecisionRefocusReply({
  sessionContext: CHANGED_SESSION,
});
ok(refocusReply.includes(CHEAPER.product_name), "refocus mentions current winner");
ok(refocusReply.includes(ANCHOR.product_name), "refocus mentions previous winner");
ok(!refocusReply.includes(EXTERNAL.product_name), "refocus no external product");

const attrReply = buildScopedAttributeFollowUpReply({
  sessionContext: CHANGED_SESSION,
  query: "e a bateria?",
});
ok(attrReply.includes(CHEAPER.product_name), "attribute reply anchors current winner");
ok(/bateria/i.test(attrReply), "attribute reply names queried axis");
ok(!attrReply.includes(EXTERNAL.product_name), "attribute reply no external product");

console.log("\n── Routing + leak guard ──\n");

const routing = buildRoutingDecision({
  userMessage: "e a bateria?",
  resolvedQuery: "e a bateria?",
  sessionContext: CHANGED_SESSION,
  incomingSessionContext: CHANGED_SESSION,
  intent: "search",
  contextAction: "decision",
  signals: {
    hasClearNewCommercialSearch: false,
    isExplicitComparison: false,
    wantsNew: false,
  },
});

ok(routing.mode === "final_decision_scope_hold", `mode=${routing.mode}`);
ok(shouldBlockCsoVerbalizer(routing) === true, "CSO blocked for final scope hold");

const leakReply = "Eu iria no Monitor Gamma 27 por causa da bateria.";
ok(
  replyMentionsProductOutsideAllowedSet(leakReply, scoped).length > 0,
  "leak guard catches external product mention"
);

async function runHttpF3() {
  console.log("\n── HTTP F3 scenario (optional) ──\n");

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
    "entao qual e afinal",
    "e a bateria?",
  ];

  for (let i = 0; i < turns.length; i++) {
    const resp = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
      body: JSON.stringify({
        text: turns[i],
        user_id: "audit-84d",
        conversation_id: `audit-84d-f3-${Date.now()}`,
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

    if (i === 3) {
      const path =
        data.mia_debug?.pipelineTrace?.response_path ||
        data.mia_debug?.pipelineTrace?.responsePath ||
        "";
      const winner = sessionContext.lastBestProduct?.product_name || "";
      ok(
        /galaxy a35|samsung galaxy a35/i.test(normalizeText(winner)),
        `HTTP F3 T4 session winner=${winner}`
      );
      ok(
        /galaxy a35|samsung galaxy a35/i.test(normalizeText(reply)),
        "HTTP F3 T4 refocus verbalizes current winner"
      );
      ok(!/s23 fe/i.test(normalizeText(reply)), "HTTP F3 T4 no S23 FE leak");
      ok(
        path === "final_decision_scope_reply" ||
          path === "post_change_recovery_reorganize",
        `HTTP F3 T4 path=${path}`
      );
    }

    if (i === 4) {
      const path =
        data.mia_debug?.pipelineTrace?.response_path ||
        data.mia_debug?.pipelineTrace?.responsePath ||
        "";
      const winner = sessionContext.lastBestProduct?.product_name || "";
      ok(
        /galaxy a35|samsung galaxy a35/i.test(normalizeText(reply)),
        "HTTP F3 T5 attribute reply uses current winner"
      );
      ok(!/s23 fe/i.test(normalizeText(reply)), "HTTP F3 T5 no S23 FE leak");
      ok(
        /bateria/i.test(normalizeText(reply)),
        "HTTP F3 T5 addresses battery attribute"
      );
      ok(
        path === "final_decision_scope_reply",
        `HTTP F3 T5 path=${path}`
      );
      ok(
        /galaxy a35|samsung galaxy a35/i.test(normalizeText(winner)),
        `HTTP F3 T5 session preserves winner=${winner}`
      );
    }
  }
}

await runHttpF3();

console.log(`\nResult: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log("PATCH 8.4D audit: PASSED\n");
  process.exit(0);
} else {
  console.log("PATCH 8.4D audit: FAILED\n");
  process.exit(1);
}
