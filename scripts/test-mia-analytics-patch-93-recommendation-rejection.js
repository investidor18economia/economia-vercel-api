#!/usr/bin/env node
/**
 * PATCH 9.3 — Recommendation Rejection Signal Analytics audit.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { COMMERCIAL_PERMISSION } from "../lib/miaIntentAuthority.js";
import { MIA_INTERACTION_MODES } from "../lib/miaIntentRecognitionLayer.js";
import { COMMERCIAL_FOLLOW_UP_TYPES } from "../lib/miaCommercialFollowUpContinuity.js";
import { REFINEMENT_TYPES } from "../lib/miaCommercialConstraintRefinement.js";
import {
  MIA_RECOMMENDATION_REJECTION_ANALYTICS_EVENT,
  MIA_RECOMMENDATION_REJECTION_ANALYTICS_VERSION,
  MIA_REJECTION_SIGNAL_TYPES,
  MIA_REJECTION_SIGNAL_CLASSES,
  MIA_REJECTION_EVIDENCE_STRENGTHS,
  MIA_REJECTION_SIGNAL_TARGETS,
  MIA_REJECTION_SIGNAL_REASONS,
  MIA_REJECTION_CORRELATION_METHODS,
  MIA_REJECTION_CORRELATION_CONFIDENCE,
  classifyRejectionFromCognitiveTurn,
  classifyRejectionFromFollowUp,
  classifyRejectionFromNewSearch,
  classifyRejectionFromDecisionTransition,
  classifyRejectionFromSocialExit,
  resolveRejectionCorrelation,
  classifyRejectionTimeBucket,
  computeRejectionSecondsSinceDecision,
  buildRejectionSignalAnalyticsPayload,
  observeRejectionSignalsFromTurnContext,
  observeRejectionSignalFromDecisionTransition,
  isRejectionAnalyticsDomainAllowed,
} from "../lib/miaRecommendationRejectionAnalytics.js";
import { buildRejectionSignalDedupKey } from "../lib/miaRecommendationRejectionTracker.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CHAT_API = join(ROOT, "pages/api/chat-gpt4o.js");

const SQL_FILES = [
  "patch-93-query1-rejection-overview.sql",
  "patch-93-query2-signal-classes-types.sql",
  "patch-93-query3-rejection-reasons.sql",
  "patch-93-query4-decision-source.sql",
  "patch-93-query5-signal-targets.sql",
  "patch-93-query6-signal-outcomes.sql",
  "patch-93-query7-time-to-signal.sql",
  "patch-93-query8-recovery-after-rejection.sql",
  "patch-93-query9-abandonment.sql",
  "patch-93-query10-quality-fanout.sql",
];

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${label}`);
  } else {
    failed += 1;
    console.error(`  ❌ ${label}`);
  }
}

console.log("\nPATCH 9.3 — Recommendation Rejection Signal audit\n");

console.log("Contract");
assert("event name", MIA_RECOMMENDATION_REJECTION_ANALYTICS_EVENT === "mia_recommendation_rejection_signal");
assert("event version", MIA_RECOMMENDATION_REJECTION_ANALYTICS_VERSION === "9.3.0");

console.log("\nExplicit rejection");
const explicit = classifyRejectionFromCognitiveTurn({
  turnType: "OBJECTION",
  reasons: ["objection_generic"],
  normalizedQuery: "nao gostei desse celular",
});
assert("explicit type", explicit?.signal_type === MIA_REJECTION_SIGNAL_TYPES.EXPLICIT_REJECTION);
assert("explicit class", explicit?.signal_class === MIA_REJECTION_SIGNAL_CLASSES.REJECTION);
assert("explicit strength", explicit?.evidence_strength === MIA_REJECTION_EVIDENCE_STRENGTHS.EXPLICIT);
assert("rejection explicit flag", explicit?.rejection_explicit === true);

console.log("\nPrice rejection");
const price = classifyRejectionFromCognitiveTurn({
  turnType: "OBJECTION",
  reasons: ["objection_price"],
  normalizedQuery: "esta caro demais",
});
assert("price type", price?.signal_type === MIA_REJECTION_SIGNAL_TYPES.PRICE_REJECTION);
assert("price reason", price?.signal_reason === MIA_REJECTION_SIGNAL_REASONS.PRICE);

console.log("\nRefinement not rejection");
const budgetRefine = classifyRejectionFromFollowUp(COMMERCIAL_FOLLOW_UP_TYPES.CONSTRAINT_REFINEMENT, {
  constraintRefinement: { detected: true, refinementType: REFINEMENT_TYPES.BUDGET_REFINEMENT },
});
assert("budget refinement", budgetRefine?.signal_type === MIA_REJECTION_SIGNAL_TYPES.BUDGET_REFINEMENT);
assert("refinement class", budgetRefine?.signal_class === MIA_REJECTION_SIGNAL_CLASSES.REFINEMENT);
assert("not explicit rejection", budgetRefine?.rejection_explicit === false);

const brandRefine = classifyRejectionFromFollowUp(COMMERCIAL_FOLLOW_UP_TYPES.CONSTRAINT_REFINEMENT, {
  constraintRefinement: { detected: true, refinementType: REFINEMENT_TYPES.NEGATIVE_BRAND_REFINEMENT },
});
assert("brand refinement", brandRefine?.signal_type === MIA_REJECTION_SIGNAL_TYPES.BRAND_REFINEMENT);

console.log("\nAlternative requested without auto-rejection");
const alt = classifyRejectionFromFollowUp(COMMERCIAL_FOLLOW_UP_TYPES.RUNNER_UP_FOLLOW_UP, {});
assert("alternative type", alt?.signal_type === MIA_REJECTION_SIGNAL_TYPES.ALTERNATIVE_REQUESTED);
assert("alternative not explicit", alt?.rejection_explicit === false);
assert("alternative inconclusive class", alt?.signal_class === MIA_REJECTION_SIGNAL_CLASSES.INCONCLUSIVE);

console.log("\nSubstitution");
const newSearch = classifyRejectionFromNewSearch({
  allowNewSearch: true,
  priorDecisionRequestId: "dec-1",
});
assert("new search", newSearch?.signal_type === MIA_REJECTION_SIGNAL_TYPES.NEW_SEARCH_STARTED);
assert("substitution class", newSearch?.signal_class === MIA_REJECTION_SIGNAL_CLASSES.SUBSTITUTION);

const replaced = classifyRejectionFromDecisionTransition({
  previousDecisionRequestId: "dec-a",
  replacementDecisionRequestId: "dec-b",
});
assert("winner replaced", replaced?.signal_type === MIA_REJECTION_SIGNAL_TYPES.WINNER_REPLACED);
assert("winner replaced flag", replaced?.winner_replaced === true);

console.log("\nAbandonment explicit only");
const abandon = classifyRejectionFromCognitiveTurn({
  normalizedQuery: "nao quero comprar agora, desisto",
});
assert("explicit abandonment", abandon?.signal_type === MIA_REJECTION_SIGNAL_TYPES.PURCHASE_ABANDONED_EXPLICITLY);
assert("abandonment class", abandon?.signal_class === MIA_REJECTION_SIGNAL_CLASSES.ABANDONMENT);

const silence = classifyRejectionFromCognitiveTurn({ normalizedQuery: "" });
assert("silence no signal", silence == null);

console.log("\nPostponement / flow exit");
const farewell = classifyRejectionFromSocialExit({ farewell: true, priorDecisionRequestId: "dec-1" });
assert("postponement", farewell?.signal_type === MIA_REJECTION_SIGNAL_TYPES.PURCHASE_POSTPONED);

const topicSwitch = classifyRejectionFromFollowUp(COMMERCIAL_FOLLOW_UP_TYPES.TOPIC_SWITCH, {});
assert("flow exited", topicSwitch?.signal_type === MIA_REJECTION_SIGNAL_TYPES.COMMERCIAL_FLOW_EXITED);

console.log("\nTargets");
assert("winner target explicit", explicit?.signal_target === MIA_REJECTION_SIGNAL_TARGETS.WINNER);
assert("runner-up target alt", alt?.signal_target === MIA_REJECTION_SIGNAL_TARGETS.RUNNER_UP);

console.log("\nCorrelation");
const high = resolveRejectionCorrelation("req-1");
assert("high method", high.correlation_method === MIA_REJECTION_CORRELATION_METHODS.REQUEST_ID);
assert("high confidence", high.correlation_confidence === MIA_REJECTION_CORRELATION_CONFIDENCE.HIGH);

const transition = resolveRejectionCorrelation("req-1", { decisionTransition: true });
assert("transition method", transition.correlation_method === MIA_REJECTION_CORRELATION_METHODS.DECISION_TRANSITION);

const unresolved = resolveRejectionCorrelation(null);
assert("unresolved", unresolved.correlation_confidence === MIA_REJECTION_CORRELATION_CONFIDENCE.UNRESOLVED);

console.log("\nTemporal");
assert("same turn", classifyRejectionTimeBucket(30, true) === "same_turn");
assert("5 min", classifyRejectionTimeBucket(200, true) === "up_to_5_min");
assert("seconds", computeRejectionSecondsSinceDecision(1000, 4000) === 3);

console.log("\nPayload privacy");
const built = buildRejectionSignalAnalyticsPayload({
  requestId: "22222222-2222-4222-8222-222222222222",
  decisionRequestId: "11111111-1111-4111-8111-111111111111",
  signalType: MIA_REJECTION_SIGNAL_TYPES.PRICE_REJECTION,
  signalClass: MIA_REJECTION_SIGNAL_CLASSES.REJECTION,
  evidenceStrength: MIA_REJECTION_EVIDENCE_STRENGTHS.EXPLICIT,
  signalSource: "SERVER_CONVERSATION",
  signalTarget: MIA_REJECTION_SIGNAL_TARGETS.WINNER,
  signalReason: MIA_REJECTION_SIGNAL_REASONS.PRICE,
  signalObserved: true,
  rejectionExplicit: true,
  sourceEventId: "rej-1",
});
assert("no query_text", built.payload.query_text == null);
assert("version metadata", built.payload.metadata?.event_version === "9.3.0");
assert("no product_name", !("product_name" in (built.payload.metadata || {})));
assert("signal valid explicit", built.payload.metadata?.signal_valid === true);

const inconclusiveBuilt = buildRejectionSignalAnalyticsPayload({
  requestId: "22222222-2222-4222-8222-222222222222",
  decisionRequestId: "11111111-1111-4111-8111-111111111111",
  signalType: MIA_REJECTION_SIGNAL_TYPES.ALTERNATIVE_REQUESTED,
  signalClass: MIA_REJECTION_SIGNAL_CLASSES.INCONCLUSIVE,
  evidenceStrength: MIA_REJECTION_EVIDENCE_STRENGTHS.MODERATE,
  signalObserved: true,
  sourceEventId: "alt-1",
});
assert("inconclusive not valid metric", inconclusiveBuilt.payload.metadata?.signal_valid === false);

console.log("\nDedup");
assert(
  "dedup format",
  buildRejectionSignalDedupKey("d1", "r1", "PRICE_REJECTION", "WINNER", "sig-1", "9.3.0").includes("9.3.0")
);

console.log("\nObserve turn context");
const summaries = observeRejectionSignalsFromTurnContext(null, {
  decisionRequestId: "11111111-1111-4111-8111-111111111111",
  requestId: "22222222-2222-4222-8222-222222222222",
  userMessage: "nao gostei, esta caro",
  cognitiveTurn: { turnType: "OBJECTION", reasons: ["objection_price"] },
  commercialDomain: true,
});
assert("observe rejection summary", summaries.some((s) => s?.signal_type === "PRICE_REJECTION"));

const noDecision = observeRejectionSignalsFromTurnContext(null, {
  userMessage: "nao gostei",
  cognitiveTurn: { turnType: "OBJECTION" },
  commercialDomain: true,
});
assert("no decision skipped", noDecision.length === 0);

const transitionSummary = observeRejectionSignalFromDecisionTransition(null, {
  previousDecisionRequestId: "dec-a",
  replacementDecisionRequestId: "dec-b",
  commercialDomain: true,
});
assert("transition observe", transitionSummary?.signal_type === "WINNER_REPLACED");

console.log("\nDomain gate");
assert("commercial allowed", isRejectionAnalyticsDomainAllowed({ commercialPermission: COMMERCIAL_PERMISSION.ALLOW }));
assert("social denied", !isRejectionAnalyticsDomainAllowed({ interactionMode: MIA_INTERACTION_MODES.SOCIAL }));

console.log("\nHooks");
const chat = readFileSync(CHAT_API, "utf8");
assert("chat rejection import", chat.includes("miaRecommendationRejectionAnalytics"));
assert("turn observe hook", chat.includes("observeRejectionSignalsFromTurnContext"));
assert("decision transition hook", chat.includes("observeRejectionSignalFromDecisionTransition"));
assert("session context preserves decision id", chat.includes("lastRecommendationDecisionRequestId"));

console.log("\nSQL files");
for (const file of SQL_FILES) {
  const content = readFileSync(join(ROOT, "docs/analytics/sql", file), "utf8");
  assert(`${file} exists`, content.includes("9.3"));
}

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
