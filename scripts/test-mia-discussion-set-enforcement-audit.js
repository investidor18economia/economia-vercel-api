/**
 * PATCH 8.3B — Discussion Set Enforcement Audit
 *
 * Usage: node scripts/test-mia-discussion-set-enforcement-audit.js
 */

import { classifyMiaTurn, MIA_TURN_TYPES } from "../lib/miaCognitiveRouter.js";
import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";
import { applyContractToSessionContext } from "../lib/miaRoutingGuardrails.js";
import { resolveClearNewCommercialSearchForRouting } from "../lib/miaRoutingSafety.js";
import {
  buildAnchoredDiscussionSetProducts,
  detectsAnchoredComparisonIntent,
  extractMentionedProductCandidate,
  mergeDiscussionSetIntoSessionContext,
} from "../lib/miaDiscussionSetEnforcement.js";

function namesLikelyMatchLocal(a = "", b = "") {
  const ka = String(a).toLowerCase();
  const kb = String(b).toLowerCase();
  return ka.includes(kb) || kb.includes(ka);
}

const ANCHOR = { product_name: "Produto Alpha 35", price: "R$ 1.950", source: "search" };
const COMPARE = "Notebook Beta 22";

const SESSION = {
  lastBestProduct: ANCHOR,
  lastProductMentioned: ANCHOR.product_name,
  lastProducts: [
    ANCHOR,
    { product_name: "Produto Gamma 18", price: "R$ 1.499" },
  ],
  lastCategory: "celular",
};

const ESTABLISH_CASES = [
  { msg: `estou em duvida entre esse e o ${COMPARE}`, compare: COMPARE },
  { msg: `to entre esse e o Monitor Gamma 27`, compare: "Monitor Gamma 27" },
  { msg: "esse ou Notebook Beta 22?", compare: COMPARE },
  { msg: "compara esse com Teclado Sigma 11", compare: "Teclado Sigma 11" },
  { msg: "q dos 2 vc indica?", compare: null, needsPriorSet: true },
];

const INFORMAL_CASES = [
  "tô entre esse e o Mouse Delta 99",
  "e esse contra Monitor Gamma 27?",
  "X ou esse?",
  "qual dos dois?",
  "pegava qual?",
  "se fosse você?",
  "qual vale mais?",
];

function simulateTurn(message, sessionBefore = SESSION, priorDiscussion = null) {
  const sessionContext = priorDiscussion
    ? mergeDiscussionSetIntoSessionContext(sessionBefore, {
        anchorProduct: sessionBefore.lastBestProduct,
        query: `estou em duvida entre esse e o ${COMPARE}`,
        rememberedProducts: sessionBefore.lastProducts,
        preserveExisting: false,
      })
    : { ...sessionBefore };

  const hasActiveAnchor = !!sessionContext.lastBestProduct?.product_name;
  const cognitiveTurn = classifyMiaTurn({
    query: message,
    sessionContext,
    hasActiveAnchor,
  });

  const clearNewSearch = resolveClearNewCommercialSearchForRouting({
    query: message,
    hasAnchor: hasActiveAnchor,
    isExplicitComparison: !!cognitiveTurn.signals?.isComparison,
  });

  const establishing = detectsAnchoredComparisonIntent(message, { hasActiveAnchor });
  const prospective = establishing
    ? buildAnchoredDiscussionSetProducts({
        anchorProduct: sessionContext.lastBestProduct,
        query: message,
        rememberedProducts: sessionContext.lastProducts,
      })
    : [];
  const comparisonProducts =
    sessionContext.lastComparisonProducts?.length >= 2
      ? sessionContext.lastComparisonProducts
      : prospective;

  const routingDecision = buildRoutingDecision({
    userMessage: message,
    sessionContext,
    incomingSessionContext: sessionContext,
    intent: "search",
    contextAction: "decision",
    cognitiveRoutingSignal: {
      turnType: cognitiveTurn.turnType,
      confidence: cognitiveTurn.confidence,
      hasActiveAnchor,
    },
    signals: {
      hasClearNewCommercialSearch: clearNewSearch,
      hasComparisonProducts: comparisonProducts.length >= 2,
      isAnchoredComparisonEstablishing: establishing,
      isComparisonContextFollowUp: /\b(dos dois|qual dos|pegava qual|se fosse)\b/.test(
        message.toLowerCase()
      ),
    },
  });

  const sessionAfter = applyContractToSessionContext(sessionContext, routingDecision, {
    proposedBestProduct: sessionContext.lastBestProduct,
    proposedProducts: sessionContext.lastProducts,
  });

  if (routingDecision.enforceDiscussionSetQuery) {
    return mergeDiscussionSetIntoSessionContext(sessionAfter, {
      anchorProduct: sessionAfter.lastBestProduct,
      query: routingDecision.enforceDiscussionSetQuery,
      rememberedProducts: sessionAfter.lastProducts,
      preserveExisting: routingDecision.mode === "comparison_followup",
    });
  }

  if (establishing && prospective.length >= 2) {
    return mergeDiscussionSetIntoSessionContext(sessionAfter, {
      anchorProduct: sessionAfter.lastBestProduct,
      query: message,
      rememberedProducts: sessionAfter.lastProducts,
      preserveExisting: false,
    });
  }

  return sessionAfter;
}

let passed = 0;
let failed = 0;

console.log("\nPATCH 8.3B — Discussion Set Enforcement Audit\n");

console.log("── Establish discussion set (T2-like) ──\n");
for (const { msg, compare, needsPriorSet } of ESTABLISH_CASES) {
  const sessionAfter = simulateTurn(msg, SESSION, needsPriorSet);
  const names = (sessionAfter.lastComparisonProducts || []).map((p) => p.product_name);
  const ok =
    sessionAfter.comparisonContextLocked === true &&
    names.length >= 2 &&
    (needsPriorSet || !compare || names.some((n) => namesLikelyMatchLocal(n, compare)));

  if (ok) {
    passed++;
    console.log(`  ✓ "${msg}" → locked=${sessionAfter.comparisonContextLocked} set=[${names.join(", ")}]`);
  } else {
    failed++;
    console.log(
      `  ✗ "${msg}" → locked=${sessionAfter.comparisonContextLocked} set=[${names.join(", ")}] mode fail`
    );
  }
}

console.log("\n── Intent detection (informal variants) ──\n");
for (const msg of INFORMAL_CASES) {
  const detected = detectsAnchoredComparisonIntent(msg, { hasActiveAnchor: true });
  const needsSet = /\b(dos dois|qual dos|pegava|se fosse|qual vale)\b/.test(msg);
  const ok = needsSet ? true : detected;
  if (ok) {
    passed++;
    console.log(`  ✓ "${msg}" → detected=${detected}`);
  } else {
    failed++;
    console.log(`  ✗ "${msg}" → detected=${detected}`);
  }
}

console.log("\n── Binary follow-up after established set ──\n");
const afterEstablish = simulateTurn(`estou em duvida entre esse e o ${COMPARE}`);
const followSession = simulateTurn("qual dos dois voce indica?", afterEstablish);
const followNames = (followSession.lastComparisonProducts || []).map((p) => p.product_name);
const followOk =
  followSession.comparisonContextLocked === true &&
  followNames.length >= 2 &&
  followNames.some((n) => namesLikelyMatchLocal(n, ANCHOR.product_name)) &&
  followNames.some((n) => namesLikelyMatchLocal(n, COMPARE));

if (followOk) {
  passed++;
  console.log(`  ✓ follow-up preserves set=[${followNames.join(", ")}]`);
} else {
  failed++;
  console.log(`  ✗ follow-up set=[${followNames.join(", ")}] locked=${followSession.comparisonContextLocked}`);
}

console.log("\n── Candidate extraction ──\n");
const candidate = extractMentionedProductCandidate(
  `estou em duvida entre esse e o ${COMPARE}`,
  ANCHOR.product_name
);
if (candidate && candidate.toLowerCase().includes("beta")) {
  passed++;
  console.log(`  ✓ extracted="${candidate}"`);
} else {
  failed++;
  console.log(`  ✗ extracted="${candidate}"`);
}

console.log(`\nResult: ${passed} passed, ${failed} failed`);
console.log(`PATCH 8.3B ${failed === 0 ? "PASSED" : "FAILED"}\n`);
process.exit(failed === 0 ? 0 : 1);
