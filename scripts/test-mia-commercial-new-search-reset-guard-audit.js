/**
 * PATCH Comercial 3C-B — Commercial New Search Reset Guard Audit
 *
 * Usage: node scripts/test-mia-commercial-new-search-reset-guard-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  buildCommercialNoResultReply,
  detectCommercialQueryCore,
  isLikelyCommercialFollowUp,
  isLikelyNewCommercialSearch,
  pickCommercialPresentationProduct,
  resolveCommercialPresentationWinner,
  shouldResetCommercialOfferContext,
  shouldReusePreviousCommercialExplanation,
  commercialOfferMatchesQueryCore,
} from "../lib/miaCommercialNewSearchResetGuard.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const NOTEBOOK_OFFER = {
  product_name: "Notebook Gamer Lenovo LOQ-e RTX 4050",
  category: "notebook",
};

const CHAIR_OFFER = {
  product_name: "Cadeira Gamer DT Lite",
  category: "chair",
};

const COGNITIVE_GUARD_FILES = [
  "lib/miaCognitiveRouter.js",
  "lib/miaRoutingDecisionContract.js",
  "lib/miaPrompt.js",
  "lib/miaToneComplianceGuard.js",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const CASES = [];

function test(name, fn) {
  CASES.push({ name, fn });
}

function resetDecision(currentQuery, previousQuery, previousOffer) {
  return shouldResetCommercialOfferContext({
    currentQuery,
    previousQuery,
    previousOffer,
    routingDecision: { allowNewSearch: true, allowReplaceWinner: true },
  });
}

test('1. "notebook pra trabalho" → "cadeira gamer" reseta', () => {
  const decision = resetDecision("cadeira gamer", "notebook pra trabalho", NOTEBOOK_OFFER);
  assert(decision.shouldReset, `expected reset got ${decision.reason}`);
  assert(decision.confidence === "high" || decision.confidence === "medium", "confidence");
});

test('2. "iphone 13" → "monitor gamer" reseta', () => {
  const decision = resetDecision(
    "monitor gamer",
    "iphone 13",
    { product_name: "Apple iPhone 13 128GB", category: "phone" }
  );
  assert(decision.shouldReset, decision.reason);
});

test('3. "tv 55" → "fone bluetooth" reseta', () => {
  const decision = resetDecision(
    "fone bluetooth",
    "tv 55",
    { product_name: "Smart TV Samsung 55 4K", category: "tv" }
  );
  assert(decision.shouldReset, decision.reason);
});

test('4. "geladeira frost free" → "mouse sem fio" reseta', () => {
  const decision = resetDecision(
    "mouse sem fio",
    "geladeira frost free",
    { product_name: "Geladeira Brastemp Frost Free 443L", category: "fridge" }
  );
  assert(decision.shouldReset, decision.reason);
});

test('5. "notebook pra trabalho" → "mais barato" preserva', () => {
  const decision = resetDecision("mais barato", "notebook pra trabalho", NOTEBOOK_OFFER);
  assert(!decision.shouldReset, decision.reason);
  assert(isLikelyCommercialFollowUp("mais barato"), "follow-up marker");
});

test('6. "iphone 13" → "vale a pena?" preserva', () => {
  const decision = resetDecision(
    "vale a pena?",
    "iphone 13",
    { product_name: "Apple iPhone 13", category: "phone" }
  );
  assert(!decision.shouldReset, decision.reason);
});

test('7. "galaxy a55" → "e a bateria?" preserva', () => {
  const decision = resetDecision(
    "e a bateria?",
    "galaxy a55",
    { product_name: "Samsung Galaxy A55 5G", category: "phone" }
  );
  assert(!decision.shouldReset, decision.reason);
});

test('8. "monitor gamer" → "outro melhor" preserva', () => {
  const decision = resetDecision(
    "outro melhor",
    "monitor gamer",
    { product_name: "Monitor LG UltraGear 27", category: "monitor" }
  );
  assert(!decision.shouldReset, decision.reason);
});

test('9. "cadeira gamer" não pode retornar notebook anterior', () => {
  const decision = resetDecision("cadeira gamer", "notebook pra trabalho", NOTEBOOK_OFFER);
  const picked = pickCommercialPresentationProduct(
    [NOTEBOOK_OFFER, CHAIR_OFFER],
    "cadeira gamer",
    decision
  );
  assert(picked?.product_name?.includes("Cadeira"), "must pick chair");
  assert(!picked?.product_name?.includes("Notebook"), "must not pick notebook");

  const wrongOnly = pickCommercialPresentationProduct([NOTEBOOK_OFFER], "cadeira gamer", decision);
  assert(wrongOnly === null, "must not reuse notebook when no chair exists");
});

test("10. nova busca sem resultado não pode repetir oferta antiga", () => {
  const reply = buildCommercialNoResultReply("cadeira gamer");
  assert(!/Notebook Gamer Lenovo/i.test(reply), "no previous product in reply");
  assert(/não encontrei uma oferta confiável/i.test(reply), "safe no-result reply");
});

test("11. explanation anterior não pode ser reaproveitada em nova busca", () => {
  const decision = resetDecision("cadeira gamer", "notebook pra trabalho", NOTEBOOK_OFFER);
  const reuse = shouldReusePreviousCommercialExplanation({
    currentQuery: "cadeira gamer",
    previousOffer: NOTEBOOK_OFFER,
    previousQuery: "notebook pra trabalho",
    candidateProduct: NOTEBOOK_OFFER,
    resetDecision: decision,
  });
  assert(!reuse, "must not reuse previous explanation");
});

test("12. follow-up real preserva anchor semantics", () => {
  const decision = resetDecision("mais barato", "notebook pra trabalho", NOTEBOOK_OFFER);
  assert(!decision.shouldReset, decision.reason);
  assert(decision.reason === "commercial_follow_up_preserved", "follow-up reason");
});

test("13. follow-up real preserva winner semantics", () => {
  const decision = resetDecision("qual o ponto fraco?", "iphone 13", {
    product_name: "Apple iPhone 13",
    category: "phone",
  });
  assert(!decision.shouldReset, decision.reason);
});

test("14. nova busca comercial reseta lastCommercialOffer semantics", () => {
  const decision = resetDecision("cadeira gamer", "notebook pra trabalho", NOTEBOOK_OFFER);
  assert(decision.shouldReset, decision.reason);
  assert(decision.currentCore === "cadeira", `currentCore ${decision.currentCore}`);
  assert(decision.previousCore === "notebook", `previousCore ${decision.previousCore}`);
});

test("15. nova busca comercial não altera Decision Engine contract surface", () => {
  for (const relativePath of COGNITIVE_GUARD_FILES) {
    const content = readFileSync(join(ROOT, relativePath), "utf8");
    assert(!content.includes("miaCommercialNewSearchResetGuard"), `${relativePath} untouched`);
  }
});

test("16. guard retorna reason auditável", () => {
  const decision = resetDecision("cadeira gamer", "notebook pra trabalho", NOTEBOOK_OFFER);
  assert(typeof decision.reason === "string" && decision.reason.length > 0, "reason");
});

test("17. guard retorna confidence", () => {
  const decision = resetDecision("cadeira gamer", "notebook pra trabalho", NOTEBOOK_OFFER);
  assert(["low", "medium", "high"].includes(decision.confidence), "confidence");
});

test("18. não há menção de arquitetura interna ao usuário", () => {
  const reply = buildCommercialNoResultReply("monitor gamer");
  assert(!/data layer|provider|router|ranking|winner|adapter|decision engine/i.test(reply), reply);
});

test("detectCommercialQueryCore extracts category nucleus", () => {
  assert(detectCommercialQueryCore("cadeira gamer").core === "cadeira", "cadeira core");
  assert(detectCommercialQueryCore("notebook pra trabalho").category === "notebook", "notebook category");
});

test("isLikelyNewCommercialSearch recognizes category switch", () => {
  assert(
    isLikelyNewCommercialSearch("cadeira gamer", NOTEBOOK_OFFER),
    "new commercial search"
  );
  assert(
    !isLikelyNewCommercialSearch("mais barato", NOTEBOOK_OFFER),
    "follow-up is not new search"
  );
});

test("chat wiring imports reset guard", () => {
  const chatSource = readFileSync(join(ROOT, "pages/api/chat-gpt4o.js"), "utf8");
  assert(chatSource.includes("shouldResetCommercialOfferContext"), "chat uses reset guard");
  assert(chatSource.includes("resolveCommercialPresentationWinner"), "presentation winner hook");
  assert(chatSource.includes("commercialOfferReset"), "reset decision wired");
});

test("resolveCommercialPresentationWinner respects reset on mixed list", () => {
  const decision = resetDecision("cadeira gamer", "notebook pra trabalho", NOTEBOOK_OFFER);
  const winner = resolveCommercialPresentationWinner({
    displayProducts: [NOTEBOOK_OFFER, CHAIR_OFFER],
    currentQuery: "cadeira gamer",
    previousOffer: NOTEBOOK_OFFER,
    resetDecision: decision,
    pickWinnerUnderContract: () => NOTEBOOK_OFFER,
    routingDecision: { allowReplaceWinner: false },
  });
  assert(winner?.product_name?.includes("Cadeira"), "reset picks aligned product");
});

console.log("PATCH Comercial 3C-B — Commercial New Search Reset Guard Audit\n");

let pass = 0;
let fail = 0;

for (const spec of CASES) {
  try {
    spec.fn();
    pass += 1;
    console.log(`✓ ${spec.name}`);
  } catch (err) {
    fail += 1;
    console.log(`✗ ${spec.name} → ${err.message}`);
  }
}

const total = pass + fail;
console.log(`\nResultado: ${pass}/${total} (${((pass / total) * 100).toFixed(1)}%)`);
const verdict =
  fail === 0
    ? "A) COMMERCIAL NEW SEARCH RESET GUARD ROBUST"
    : "B) COMMERCIAL NEW SEARCH RESET GUARD GAP";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(fail === 0 ? 0 : 1);
