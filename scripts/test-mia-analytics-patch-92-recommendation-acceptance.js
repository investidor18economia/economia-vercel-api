#!/usr/bin/env node
/**
 * PATCH 9.2 — Recommendation Acceptance Signal Analytics audit.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { COMMERCIAL_PERMISSION } from "../lib/miaIntentAuthority.js";
import { MIA_INTERACTION_MODES } from "../lib/miaIntentRecognitionLayer.js";
import { COMMERCIAL_FOLLOW_UP_TYPES } from "../lib/miaCommercialFollowUpContinuity.js";
import {
  MIA_RECOMMENDATION_ACCEPTANCE_ANALYTICS_EVENT,
  MIA_RECOMMENDATION_ACCEPTANCE_ANALYTICS_VERSION,
  MIA_ACCEPTANCE_SIGNAL_TYPES,
  MIA_ACCEPTANCE_SIGNAL_STRENGTHS,
  MIA_ACCEPTANCE_SIGNAL_TARGETS,
  MIA_ACCEPTANCE_CORRELATION_METHODS,
  MIA_ACCEPTANCE_CORRELATION_CONFIDENCE,
  classifyAcceptanceSignalFromClientEvent,
  classifyAcceptanceSignalFromFollowUp,
  resolveAcceptanceCorrelation,
  classifyAcceptanceTimeBucket,
  computeSecondsSinceDecision,
  buildAcceptanceSignalAnalyticsPayload,
  observeAcceptanceSignalFromClientTrackEvent,
  isAcceptanceAnalyticsDomainAllowed,
} from "../lib/miaRecommendationAcceptanceAnalytics.js";
import { buildAcceptanceSignalDedupKey } from "../lib/miaRecommendationAcceptanceTracker.js";
import { hashSafeFamilyKey } from "../lib/miaRecommendationDecisionIdentity.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CHAT_API = join(ROOT, "pages/api/chat-gpt4o.js");
const TRACK_API = join(ROOT, "pages/api/analytics/track/index.js");
const MIA_CHAT = join(ROOT, "components/MIAChat.jsx");

const SQL_FILES = [
  "patch-92-query1-acceptance-overview.sql",
  "patch-92-query2-signal-types.sql",
  "patch-92-query3-decision-source.sql",
  "patch-92-query4-signal-targets.sql",
  "patch-92-query5-time-to-signal.sql",
  "patch-92-query6-correlation-quality.sql",
  "patch-92-query7-acceptance-funnel.sql",
  "patch-92-query8-quality-fanout.sql",
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

console.log("\nPATCH 9.2 — Recommendation Acceptance Signal audit\n");

console.log("Contract");
assert("event name", MIA_RECOMMENDATION_ACCEPTANCE_ANALYTICS_EVENT === "mia_recommendation_acceptance_signal");
assert("event version", MIA_RECOMMENDATION_ACCEPTANCE_ANALYTICS_VERSION === "9.2.0");

console.log("\nClient signal classification");
const render = classifyAcceptanceSignalFromClientEvent(
  "mia_recommendation_shown",
  { product_id: "abc", category: "smartphone", metadata: { acceptance_signal_id: "s1" } },
  { winner_product_family: "hash1" }
);
assert("render type", render?.signal_type === MIA_ACCEPTANCE_SIGNAL_TYPES.RECOMMENDATION_RENDERED);
assert("render weak", render?.signal_strength === MIA_ACCEPTANCE_SIGNAL_STRENGTHS.WEAK);

const familyKey = "samsung-galaxy-a55";
const familyHash = hashSafeFamilyKey(familyKey);
const click = classifyAcceptanceSignalFromClientEvent(
  "offer_click",
  { product_id: familyKey, metadata: {} },
  { winner_product_family: familyHash }
);
assert("winner click", click?.signal_type === MIA_ACCEPTANCE_SIGNAL_TYPES.WINNER_OFFER_CLICKED);
assert("winner target", click?.signal_target === MIA_ACCEPTANCE_SIGNAL_TARGETS.WINNER);

const altClick = classifyAcceptanceSignalFromClientEvent(
  "offer_click",
  { product_id: "other", metadata: {} },
  { winner_product_family: "winner-hash" }
);
assert("alt click", altClick?.signal_type === MIA_ACCEPTANCE_SIGNAL_TYPES.ALTERNATIVE_OFFER_CLICKED);

const favorite = classifyAcceptanceSignalFromClientEvent("favorite_created", {}, {});
assert("favorite strong", favorite?.signal_strength === MIA_ACCEPTANCE_SIGNAL_STRENGTHS.STRONG);
assert("favorite type", favorite?.signal_type === MIA_ACCEPTANCE_SIGNAL_TYPES.PRODUCT_FAVORITED);

console.log("\nFollow-up signals");
const priceFollowUp = classifyAcceptanceSignalFromFollowUp(COMMERCIAL_FOLLOW_UP_TYPES.PRICE_FOLLOW_UP, {});
assert("price follow-up", priceFollowUp?.signal_type === MIA_ACCEPTANCE_SIGNAL_TYPES.PRICE_REQUESTED);
assert("price medium", priceFollowUp?.signal_strength === MIA_ACCEPTANCE_SIGNAL_STRENGTHS.MEDIUM);

const constraint = classifyAcceptanceSignalFromFollowUp(COMMERCIAL_FOLLOW_UP_TYPES.CONSTRAINT_REFINEMENT, {});
assert("constraint excluded", constraint == null);

const runnerUp = classifyAcceptanceSignalFromFollowUp(COMMERCIAL_FOLLOW_UP_TYPES.RUNNER_UP_FOLLOW_UP, {});
assert("runner-up follow-up excluded", runnerUp == null);

console.log("\nCorrelation");
const high = resolveAcceptanceCorrelation("req-1");
assert("high method", high.correlation_method === MIA_ACCEPTANCE_CORRELATION_METHODS.REQUEST_ID);
assert("high confidence", high.correlation_confidence === MIA_ACCEPTANCE_CORRELATION_CONFIDENCE.HIGH);

const unresolved = resolveAcceptanceCorrelation(null);
assert("unresolved", unresolved.correlation_confidence === MIA_ACCEPTANCE_CORRELATION_CONFIDENCE.UNRESOLVED);

console.log("\nTemporal buckets");
assert("same turn", classifyAcceptanceTimeBucket(30, true) === "same_turn");
assert("5 min bucket", classifyAcceptanceTimeBucket(200, true) === "up_to_5_min");
assert("seconds compute", computeSecondsSinceDecision(1000, 4000) === 3);

console.log("\nPayload privacy");
const built = buildAcceptanceSignalAnalyticsPayload({
  requestId: "11111111-1111-4111-8111-111111111111",
  decisionRequestId: "11111111-1111-4111-8111-111111111111",
  signalType: MIA_ACCEPTANCE_SIGNAL_TYPES.WINNER_OFFER_CLICKED,
  signalStrength: MIA_ACCEPTANCE_SIGNAL_STRENGTHS.WEAK,
  signalSource: "CLIENT_INTERACTION",
  signalTarget: MIA_ACCEPTANCE_SIGNAL_TARGETS.WINNER,
  signalObserved: true,
  sourceEventId: "sig-1",
  sourceEventName: "offer_click",
});
assert("no query_text", built.payload.query_text == null);
assert("version metadata", built.payload.metadata?.event_version === "9.2.0");
assert("no product_name", !("product_name" in (built.payload.metadata || {})));
assert("acceptance proxy weak click", built.payload.metadata?.acceptance_proxy === true);
assert("not purchase confirmed", built.payload.metadata?.purchase_confirmed === false);

console.log("\nDedup key");
assert(
  "dedup format",
  buildAcceptanceSignalDedupKey("d1", "WINNER_OFFER_CLICKED", "WINNER", "sig-1", "9.2.0").includes("9.2.0")
);

console.log("\nClient track observe");
const observed = observeAcceptanceSignalFromClientTrackEvent(null, {
  row: {
    event_name: "offer_click",
    session_id: "sess",
    metadata: {
      decision_request_id: "dec-req",
      acceptance_signal_id: "sig-99",
      decision_context: { winner_product_family: "hash1", decision_source: "COGNITIVE_PRIMARY" },
    },
  },
});
assert("observe returns summary", observed?.signal_type === MIA_ACCEPTANCE_SIGNAL_TYPES.WINNER_OFFER_CLICKED);

const noDecision = observeAcceptanceSignalFromClientTrackEvent(null, {
  row: { event_name: "offer_click", metadata: { acceptance_signal_id: "x" } },
});
assert("no decision skipped", noDecision == null);

console.log("\nDomain gate");
assert("commercial allowed", isAcceptanceAnalyticsDomainAllowed({ commercialPermission: COMMERCIAL_PERMISSION.ALLOW }));
assert("social denied", !isAcceptanceAnalyticsDomainAllowed({ interactionMode: MIA_INTERACTION_MODES.SOCIAL }));

console.log("\nHooks");
const chat = readFileSync(CHAT_API, "utf8");
const track = readFileSync(TRACK_API, "utf8");
const miaChat = readFileSync(MIA_CHAT, "utf8");
assert("chat acceptance import", chat.includes("miaRecommendationAcceptanceAnalytics"));
assert("follow-up observe", chat.includes("observeAcceptanceSignalFromConversationFollowUp"));
assert("request_id response", chat.includes("request_id: _sharedStateForCommercialSearch?.requestId"));
assert("track observe hook", track.includes("observeAcceptanceSignalFromClientTrackEvent"));
assert("frontend decision context", miaChat.includes("captureDecisionContextFromApiResponse"));
assert("frontend acceptance metadata", miaChat.includes("buildAcceptanceTrackingMetadata"));

console.log("\nSQL files");
for (const file of SQL_FILES) {
  const path = join(ROOT, "docs/analytics/sql", file);
  assert(`exists ${file}`, existsSync(path));
  assert(`uses event ${file}`, readFileSync(path, "utf8").includes("mia_recommendation_acceptance_signal"));
}

console.log(`\nResultado: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
