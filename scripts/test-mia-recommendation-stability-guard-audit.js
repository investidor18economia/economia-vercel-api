/**
 * PATCH 8.3C — Recommendation Stability Guard Audit
 *
 * Valida que decision engine / allowedProducts respeitam discussion set ativo.
 */

import { namesLikelyMatch, resolveDecisionEngineWinners } from "../lib/miaDecisionConsistencyFixes.js";
import {
  buildDiscussionSetEstablishmentReply,
  replyMentionsProductOutsideAllowedSet,
  resolveAllowedProductsForDecision,
  resolveEffectiveDiscussionSet,
  scopeProductsToAllowedSet,
} from "../lib/miaRecommendationStabilityGuard.js";
import { mergeDiscussionSetIntoSessionContext } from "../lib/miaDiscussionSetEnforcement.js";

const ANCHOR = { product_name: "Produto Alpha 35", price: "R$ 1.950", source: "search" };
const BETA = { product_name: "Notebook Beta 22", price: null, source: "discussion_set" };
const GAMMA = { product_name: "Monitor Gamma 27", price: "R$ 1.800", source: "search" };
const DELTA = { product_name: "Teclado Delta 99", price: "R$ 450", source: "search" };

const CATALOG = [ANCHOR, GAMMA, DELTA];

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

console.log("\nPATCH 8.3C — Recommendation Stability Guard Audit\n");

console.log("── allowedProducts derivation ──\n");

const sessionWithSet = mergeDiscussionSetIntoSessionContext(
  { lastBestProduct: ANCHOR, lastProducts: CATALOG },
  { anchorProduct: ANCHOR, query: "estou em duvida entre esse e o Notebook Beta 22", rememberedProducts: CATALOG, preserveExisting: false }
);

const scoped = resolveAllowedProductsForDecision({
  sessionContext: sessionWithSet,
  query: "qual dos dois voce indica?",
  anchorProduct: ANCHOR,
  catalogProducts: CATALOG,
});

ok(scoped.discussionSetActive === true, "discussionSetActive=true with locked set");
ok(scoped.allowedProducts.length === 2, `allowedProducts length=2 (got ${scoped.allowedProducts.length})`);
ok(
  scoped.allowedProducts.every((p) =>
    [ANCHOR.product_name, BETA.product_name].some((n) => namesLikelyMatch(p.product_name, n))
  ),
  "allowedProducts only contains discussion set members"
);
ok(
  !scoped.allowedProducts.some((p) => namesLikelyMatch(p.product_name, GAMMA.product_name)),
  "allowedProducts excludes catalog leak (Gamma)"
);

const prospective = resolveEffectiveDiscussionSet({
  sessionContext: { lastBestProduct: ANCHOR },
  query: "to entre esse e o Monitor Gamma 27",
  anchorProduct: ANCHOR,
  catalogProducts: CATALOG,
});
ok(prospective.length === 2, "prospective discussion set on establishing turn");

console.log("\n── decision engine scoping ──\n");

const de = resolveDecisionEngineWinners(CATALOG, ANCHOR, {
  allowedProducts: [ANCHOR, BETA],
});
ok(namesLikelyMatch(de.best?.product_name, ANCHOR.product_name), "DE best stays anchor");
ok(
  !de.second || namesLikelyMatch(de.second?.product_name, BETA.product_name),
  "DE second is within discussion set"
);
ok(
  !namesLikelyMatch(de.best?.product_name, GAMMA.product_name),
  "DE does not pick external catalog product"
);

const scopedList = scopeProductsToAllowedSet(CATALOG, [ANCHOR, BETA]);
ok(scopedList.length === 2, "scopeProductsToAllowedSet keeps set size");

console.log("\n── establishment reply ──\n");

const establishReply = buildDiscussionSetEstablishmentReply({
  allowedProducts: [ANCHOR, BETA],
  anchorProduct: ANCHOR,
});
ok(!!establishReply && establishReply.includes(ANCHOR.product_name), "establishment reply mentions anchor");
ok(!!establishReply && establishReply.toLowerCase().includes("beta 22"), "establishment reply mentions cited product");
ok(
  !!establishReply && /^sobre o /i.test(establishReply),
  "establishment reply leads with anchor verbalization"
);
ok(
  replyMentionsProductOutsideAllowedSet(establishReply || "", [ANCHOR, BETA]).length === 0,
  "establishment reply has no external product mentions"
);

const leakReply =
  "Entre o iPhone 13 e as opcoes disponiveis, como o Samsung Galaxy S23 FE e o Samsung Galaxy A35.";
ok(
  replyMentionsProductOutsideAllowedSet(leakReply, [ANCHOR, BETA]).length > 0,
  "detects external product leak in reply"
);

console.log(`\nResult: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log("PATCH 8.3C PASSED\n");
  process.exit(0);
}
console.log("PATCH 8.3C FAILED\n");
process.exit(1);
