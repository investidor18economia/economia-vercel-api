/**
 * PATCH 11C — Conversation Polish property tests
 */
import {
  selectHumanAck,
  isEmptyGenericOpener,
  hasGenericClosing,
  buildFirstAnswerOpening,
  matchesPolishedFirstAnswerOpening,
  polishPriceFollowUpReply,
  polishRunnerUpFollowUpReply,
  polishRefinementAck,
  polishRefinementRecommendation,
  polishClarificationQuestion,
  polishIntentDiscoveryFallback,
  stripLeadingEmptyAck,
} from "../lib/miaConversationPolish.js";
import { buildSpecificGovernedFallback } from "../lib/miaSocialResponsePerception.js";
import { buildConstraintRefinementDeterministicReply } from "../lib/miaCommercialConstraintRefinement.js";
import { buildCommercialFollowUpDeterministicReply } from "../lib/miaCommercialFollowUpContinuity.js";
import { buildFirstAnswerStructuredReply, matchesStrictFirstAnswerContract, applyFirstAnswerResponseContract } from "../lib/miaFirstAnswerResponseContract.js";
import { REFINEMENT_TYPES } from "../lib/miaCommercialConstraintRefinement.js";

let passed = 0;
let failed = 0;

function expectTrue(label, condition) {
  if (condition) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`FAIL: ${label}`);
}

function expectFalse(label, condition) {
  expectTrue(label, !condition);
}

// ── Generic opener detection ──
expectTrue("detects empty ack Entendo", isEmptyGenericOpener("Entendo."));
expectTrue("contextual ack ok", !isEmptyGenericOpener("Comparar opções cansa mesmo."));
expectTrue("detects generic closing", hasGenericClosing("Posso ajudar em mais alguma coisa?"));

// ── Human ack diversity ──
const ack1 = selectHumanAck({ anchors: ["cansaco"], depth: "brief", message: "estou cansado" });
const ack2 = selectHumanAck({ anchors: ["frustracao"], depth: "brief", message: "estou frustrado" });
expectFalse("cansaco ack not bare Entendo", isEmptyGenericOpener(ack1));
expectFalse("frustracao ack not bare Entendo", isEmptyGenericOpener(ack2));

// ── Social fallback no longer defaults to Entendo for casual comment ──
const socialFallback = buildSpecificGovernedFallback(
  {
    contentAnchors: ["trabalho"],
    responseDepth: "brief",
    userMessageForSpecificity: "dia de trabalho foi pesado",
    repetitionSignals: { recentResponseOpeners: [] },
  },
  {}
);
expectFalse("social fallback contextual", isEmptyGenericOpener(socialFallback));

// ── First answer opening variants ──
const fa = buildFirstAnswerStructuredReply({
  winnerName: "Galaxy A55",
  query: "celular até 2500",
  gains: ["Boa bateria para o dia a dia.", "Tela forte na faixa."],
  sacrifices: ["Desempenho não é foco para jogos pesados."],
});
expectTrue("first answer has structure", /O que voc[eê] ganha/i.test(fa));
expectTrue("first answer opening polished", matchesPolishedFirstAnswerOpening(fa));
expectTrue("strict contract accepts polished opening", matchesStrictFirstAnswerContract(fa, "Galaxy A55"));
expectTrue("winner preserved", fa.includes("Galaxy A55"));

// ── Refinement polish ──
const refinementReply = buildConstraintRefinementDeterministicReply({
  selectedProduct: { product_name: "Galaxy S23 FE", price: "2200" },
  refinement: { refinementType: REFINEMENT_TYPES.NEGATIVE_BRAND_REFINEMENT, value: "apple" },
  mergedConstraints: { budgetMax: 2500 },
  priorConstraints: { budgetMax: 2500 },
});
expectTrue("refinement reply exists", !!refinementReply?.reply);
expectTrue("refinement excludes apple wording", /Retiro apple|retiro apple/i.test(refinementReply.reply));
expectTrue("refinement product preserved", refinementReply.reply.includes("Galaxy S23 FE"));
expectFalse("refinement no Perfeito", /^Perfeito/i.test(refinementReply.reply));

// ── Follow-up polish ──
const priceFu = buildCommercialFollowUpDeterministicReply(
  {
    contextualCommercialAuthorized: true,
    followUpType: "price_follow_up",
    resolvedProduct: { product_name: "Galaxy A55", price: "R$ 2.199,00", source: "ML" },
  },
  {}
);
expectTrue("price follow-up", priceFu?.reply?.includes("Galaxy A55"));
expectTrue("price follow-up has value", /\d/.test(priceFu?.reply || ""));

const runnerFu = buildCommercialFollowUpDeterministicReply(
  {
    contextualCommercialAuthorized: true,
    followUpType: "runner_up_follow_up",
    resolvedProduct: { product_name: "Moto Edge 40", price: "1900" },
  },
  {}
);
expectTrue("runner-up tradeoff hint", /tradeoff|segundo/i.test(runnerFu?.reply || ""));

// ── Pure helpers ──
expectTrue(
  "price helper",
  polishPriceFollowUpReply("Galaxy", "R$ 100", "") === "Galaxy está por cerca de R$ 100 nas ofertas encontradas."
);
expectTrue(
  "clarification shorter",
  polishClarificationQuestion("price_refinement").length < 80
);
expectTrue(
  "intent discovery contextual",
  polishIntentDiscoveryFallback([]).includes("preço")
);
expectTrue(
  "strip empty ack",
  stripLeadingEmptyAck("Entendo. A bateria é forte.") === "A bateria é forte."
);

// Regression: mixed reply sections import must exist in first-answer contract
const mixedApplied = applyFirstAnswerResponseContract({
  reply: "Comparar opções cansa.\n\nEu iria no Galaxy A55 porque boa bateria.\n\nO que você ganha\n• Bateria\n\nO que você abre mão\n• Jogos\n\nMesmo com jogos eu manteria o Galaxy A55 porque bateria.",
  prices: [],
  responsePath: "return_seguro",
  query: "celular",
  winnerProduct: { product_name: "Galaxy A55" },
  rankedCandidates: [{ product_name: "Galaxy A55" }],
  gains: ["Bateria forte"],
  sacrifices: ["Jogos pesados"],
});
expectTrue("mixed first answer contract applies", !!mixedApplied?.reply?.includes("Galaxy A55"));

console.log(`\nPATCH 11C polish tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
