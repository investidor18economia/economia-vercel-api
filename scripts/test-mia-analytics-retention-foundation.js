#!/usr/bin/env node
/**
 * PATCH 3.4 — Retention foundation tests (derivation + user_authenticated wiring).
 */
import {
  RETENTION_LIFECYCLE,
  classifyVisitorLifecycle,
  deriveRetentionFoundationFromEvents,
  deriveUserRetentionTimeline,
  deriveVisitorRetentionTimeline,
} from "../lib/miaAnalyticsRetentionFoundation.js";
import { ALLOWED_ANALYTICS_EVENTS, validateAnalyticsTrackRequest } from "../lib/miaAnalyticsAllowlist.js";
import { buildMiaUserAuthenticatedPayload } from "../lib/miaAnalyticsPayload.js";

const VISITOR = "11111111-2222-4333-8444-555555555555";
const USER = "22222222-3333-4333-8444-555555555555";
const SESSION = "sess-abc";
const CONV = "33333333-4444-4333-8444-555555555555";

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

console.log("\nPATCH 3.4 — retention foundation tests\n");

// Allowlist
{
  assert("user_authenticated in allowlist", ALLOWED_ANALYTICS_EVENTS.includes("user_authenticated"));
  const validation = validateAnalyticsTrackRequest({
    event_name: "user_authenticated",
    visitor_id: VISITOR,
    session_id: SESSION,
  });
  assert("user_authenticated validates", validation.ok === true);
}

// Payload
{
  globalThis.window = {
    location: { pathname: "/app-mia" },
  };
  const payload = buildMiaUserAuthenticatedPayload();
  delete globalThis.window;
  assert("payload metadata auth_method", payload.metadata?.auth_method === "otp_email");
  assert("payload omits user_id client field", !("user_id" in payload));
}

// Visitor timeline
{
  const events = [
    {
      event_name: "session_started",
      visitor_id: VISITOR,
      session_id: SESSION,
      user_id: null,
      conversation_id: null,
      created_at: "2026-07-22T10:00:00.000Z",
    },
    {
      event_name: "user_authenticated",
      visitor_id: VISITOR,
      session_id: SESSION,
      user_id: USER,
      conversation_id: null,
      created_at: "2026-07-22T10:05:00.000Z",
    },
    {
      event_name: "mia_question_sent",
      visitor_id: VISITOR,
      session_id: SESSION,
      user_id: USER,
      conversation_id: CONV,
      created_at: "2026-07-22T10:06:00.000Z",
    },
  ];

  const timeline = deriveVisitorRetentionTimeline(events);
  assert("first activity", timeline.first_activity_at === events[0].created_at);
  assert("first session", timeline.first_session_id === SESSION);
  assert("first conversation", timeline.first_conversation_id === CONV);
  assert("first auth", timeline.first_user_id === USER);
  assert("first authenticated at login event", timeline.first_authenticated_at === events[1].created_at);
  assert("active days", timeline.active_day_count === 1);
}

// User timeline
{
  const events = [
    {
      event_name: "user_authenticated",
      visitor_id: VISITOR,
      user_id: USER,
      created_at: "2026-07-22T10:05:00.000Z",
    },
    {
      event_name: "mia_question_sent",
      visitor_id: VISITOR,
      user_id: USER,
      created_at: "2026-07-22T10:10:00.000Z",
    },
  ];
  const userTimeline = deriveUserRetentionTimeline(events);
  assert("user first login", userTimeline.first_login_at === events[0].created_at);
  assert("user visitor link", userTimeline.visitor_ids[0] === VISITOR);
}

// Lifecycle
{
  const timeline = {
    first_active_day: "2026-07-22",
    last_active_day: "2026-07-22",
    active_day_count: 1,
  };
  assert(
    "new visitor on first day",
    classifyVisitorLifecycle(timeline, "2026-07-22") === RETENTION_LIFECYCLE.NEW
  );

  const returningTimeline = {
    first_active_day: "2026-07-20",
    last_active_day: "2026-07-22",
    active_day_count: 2,
  };
  assert(
    "returning visitor",
    classifyVisitorLifecycle(returningTimeline, "2026-07-22") === RETENTION_LIFECYCLE.RETURNING
  );
}

// Foundation aggregator
{
  const foundation = deriveRetentionFoundationFromEvents([
    {
      visitor_id: VISITOR,
      user_id: null,
      created_at: "2026-07-22T10:00:00.000Z",
      event_name: "session_started",
      session_id: SESSION,
    },
    {
      visitor_id: VISITOR,
      user_id: USER,
      created_at: "2026-07-22T10:05:00.000Z",
      event_name: "user_authenticated",
      session_id: SESSION,
    },
  ]);
  assert("foundation visitors count", foundation.visitors.length === 1);
  assert("foundation users count", foundation.users.length === 1);
}

console.log(`\nResultado: ${passed}/${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
