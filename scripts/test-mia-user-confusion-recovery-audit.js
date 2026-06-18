/**
 * PATCH 8.3G — User Confusion Recovery Layer Audit
 */

import { classifyMiaTurn, MIA_TURN_TYPES, isUserConfusionFamilyQuery } from "../lib/miaCognitiveRouter.js";
import {
  buildUserConfusionRecoveryReply,
  detectsExplanationBreakdownSignal,
} from "../lib/miaUserConfusionRecoveryLayer.js";
import { detectsReasoningBreakdownSignal } from "../lib/miaContradictionRecoveryLayer.js";
import { mergeDiscussionSetIntoSessionContext } from "../lib/miaDiscussionSetEnforcement.js";

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
  {
    anchorProduct: ANCHOR,
    query: "estou em duvida entre esse e o Notebook Beta 22",
    rememberedProducts: CATALOG,
    preserveExisting: false,
  }
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

console.log("\nPATCH 8.3G — User Confusion Recovery Layer Audit\n");

console.log("── Intent detection (generalization) ──\n");

const positiveCases = [
  "nao entendi",
  "nao compreendi sua explicacao",
  "nao saquei",
  "como assim?",
  "explica melhor",
  "ficou complicado",
  "nao ficou claro",
  "pode simplificar?",
  "entao me explica melhor",
  "o racional da recomendacao nao ficou claro",
  "n entendi",
  "resumindo...",
  "boiei",
  "viajei agora",
  "nao acompanhei",
];

for (const msg of positiveCases) {
  ok(
    detectsExplanationBreakdownSignal(msg, { hasActiveAnchor: true, sessionContext: SESSION }),
    `"${msg}" → detected`
  );
}

const negativeCases = [
  ["voce me confundiu", "contradiction recovery 8.3F"],
  ["mudou de ideia", "contradiction recovery 8.3F"],
  ["qual dos dois voce indica", "binary comparison choice"],
  ["celular ate 2000", "new search"],
];

for (const [msg, label] of negativeCases) {
  ok(
    !detectsExplanationBreakdownSignal(msg, { hasActiveAnchor: true, sessionContext: SESSION }),
    `"${msg}" blocked (${label})`
  );
}

console.log("\n── 8.3F separation ──\n");

ok(
  detectsReasoningBreakdownSignal("voce me confundiu", { hasActiveAnchor: true, sessionContext: SESSION }),
  "8.3F still catches trust accusation"
);
ok(
  !detectsReasoningBreakdownSignal("nao entendi", { hasActiveAnchor: true, sessionContext: SESSION }),
  "8.3F does not steal pure comprehension"
);

console.log("\n── Router classification ──\n");

const turn = classifyMiaTurn({
  query: "nao entendi",
  originalQuery: "nao entendi",
  sessionContext: SESSION,
  hasActiveAnchor: true,
});

ok(
  turn.turnType === MIA_TURN_TYPES.EXPLANATION_REQUEST || isUserConfusionFamilyQuery("nao entendi", { hasActiveAnchor: true }),
  `turnType=${turn.turnType} or family query`
);

console.log("\n── Recovery reply from state ──\n");

const reply = buildUserConfusionRecoveryReply({
  sessionContext: SESSION,
  allowedProducts: [ANCHOR, BETA],
  explanationCtx: {
    lastAxis: "value",
    lastConsequence: SESSION.lastMainConsequence,
    lastDecisionReason: SESSION.lastDecisionReason,
  },
});

ok(/vamos simplificar/i.test(reply), "opens with simplification");
ok(reply.includes(ANCHOR.product_name), "mentions anchor/winner");
ok(reply.includes(BETA.product_name), "mentions discussion set member");
ok(/recomendacao principal|continuo recomendando/i.test(normalizeText(reply)), "reaffirms current decision");
ok(/economizar|prioridade/i.test(normalizeText(reply)), "priority branches from state");
ok(!/\bmonitor gamma\b/i.test(reply), "does not leak external catalog product");

console.log(`\nResult: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log("PATCH 8.3G audit: PASSED\n");
  process.exit(0);
} else {
  console.log("PATCH 8.3G audit: FAILED\n");
  process.exit(1);
}
