/**
 * PATCH 8.3F — Contradiction Recovery Layer Audit
 */

import { classifyMiaTurn, MIA_TURN_TYPES, isConversationalConfusionFamilyQuery } from "../lib/miaCognitiveRouter.js";
import {
  buildContradictionRecoveryReply,
  detectsReasoningBreakdownSignal,
} from "../lib/miaContradictionRecoveryLayer.js";
import { mergeDiscussionSetIntoSessionContext } from "../lib/miaDiscussionSetEnforcement.js";
import { namesLikelyMatch } from "../lib/miaDecisionConsistencyFixes.js";

const ANCHOR = { product_name: "Produto Alpha 35", price: "R$ 1.950", source: "search" };
const BETA = { product_name: "Notebook Beta 22", price: "R$ 1.700", source: "discussion_set" };
const CATALOG = [ANCHOR, { product_name: "Monitor Gamma 27", price: "R$ 1.800", source: "search" }];

const SESSION = mergeDiscussionSetIntoSessionContext(
  {
    lastBestProduct: ANCHOR,
    lastProducts: CATALOG,
    lastAxis: "value",
    lastMainConsequence: "melhor retorno pelo investimento no uso diário",
    lastDecisionReason: "equilíbrio entre preço e longevidade",
    comparisonContextLocked: true,
  },
  { anchorProduct: ANCHOR, query: "estou em duvida entre esse e o Notebook Beta 22", rememberedProducts: CATALOG, preserveExisting: false }
);

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

console.log("\nPATCH 8.3F — Contradiction Recovery Layer Audit\n");

console.log("── Intent detection (generalization) ──\n");

const positiveCases = [
  "voce me confundiu",
  "mas antes era outro",
  "nao fez sentido",
  "vc mudou d ideia",
  "entao qual e afinal",
  "sua recomendacao atual diverge da anterior",
];

for (const msg of positiveCases) {
  ok(
    detectsReasoningBreakdownSignal(msg, { hasActiveAnchor: true, sessionContext: SESSION }),
    `"${msg}" → detected`
  );
}

const delegatedTo85C = [
  "agora fiquei perdido",
  "agora buguei",
  "nao to entendendo",
  "pera ai",
  "nao to acompanhando",
  "to mais confuso agora",
];

console.log("\n── Delegated to 8.5C / 8.3G (not 8.3F) ──\n");

for (const msg of delegatedTo85C) {
  ok(
    !detectsReasoningBreakdownSignal(msg, { hasActiveAnchor: true, sessionContext: SESSION }),
    `"${msg}" → not 8.3F`
  );
}

const negativeCases = [
  ["nao entendi", "comprehension clarity"],
  ["quero notebook ate 3000", "new search"],
  ["qual dos dois voce indica", "binary comparison choice"],
];

for (const [msg, label] of negativeCases) {
  ok(
    !detectsReasoningBreakdownSignal(msg, { hasActiveAnchor: true, sessionContext: SESSION }),
    `"${msg}" blocked (${label})`
  );
}

console.log("\n── Router classification ──\n");

const turn = classifyMiaTurn({
  query: "voce me confundiu",
  originalQuery: "voce me confundiu",
  sessionContext: SESSION,
  hasActiveAnchor: true,
});

ok(turn.turnType === MIA_TURN_TYPES.CONVERSATIONAL_CONFUSION, `turnType=${turn.turnType}`);
ok(!!turn.signals?.isConversationalConfusion, "signal isConversationalConfusion=true");

console.log("\n── Recovery reply from state ──\n");

const reply = buildContradictionRecoveryReply({
  sessionContext: SESSION,
  allowedProducts: [ANCHOR, BETA],
  explanationCtx: {
    lastAxis: "value",
    lastConsequence: SESSION.lastMainConsequence,
    lastDecisionReason: SESSION.lastDecisionReason,
  },
});

ok(/voce tem razao|vamos organizar/i.test(reply), "acknowledges reorganization");
ok(reply.includes(ANCHOR.product_name), "mentions anchor/winner");
ok(reply.includes(BETA.product_name), "mentions discussion set member");
ok(/recomendacao principal|continua sendo/i.test(normalizeText(reply)), "reaffirms current decision");
ok(
  !/\bmonitor gamma\b/i.test(reply),
  "does not leak external catalog product"
);

console.log(`\nResult: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log("PATCH 8.3F PASSED\n");
  process.exit(0);
}
console.log("PATCH 8.3F FAILED\n");
process.exit(1);
