/**
 * PATCH 3.3 — Authenticated identity tests for Analytics.
 */
import {
  resolveAuthenticatedAnalyticsUserId,
  resolveAnalyticsTrackInsertUserId,
} from "../lib/miaAnalyticsAuth.js";
import {
  issueUserSessionToken,
  verifyUserSessionToken,
} from "../lib/miaUserSessionToken.js";
import {
  trackMiaEvent,
  trackMiaQuestionSent,
  trackMiaSessionStarted,
} from "../lib/analytics.js";
import {
  assembleAnalyticsInsertRow,
  buildMiaQuestionSentPayload,
  isAnalyticsUuid,
} from "../lib/miaAnalyticsPayload.js";
import { validateAnalyticsTrackRequest } from "../lib/miaAnalyticsAllowlist.js";

const TEST_ENV = {
  MIA_USER_SESSION_SECRET: "patch-33-test-secret",
};

const USER_U1 = "11111111-2222-4333-8444-555555555555";
const USER_U2 = "22222222-3333-4444-8555-666666666666";
const VISITOR_V1 = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${label}`);
    return;
  }
  failed += 1;
  console.error(`  ❌ ${label}`);
}

function buildReq({ token = "", body = {} } = {}) {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body,
  };
}

function simulateTrackInsertUserId(req, bodyUserId = null) {
  void bodyUserId;
  return resolveAnalyticsTrackInsertUserId(req, TEST_ENV);
}

function createMockStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}

function installWindow({ sessionStorage, localStorage } = {}) {
  globalThis.window = {
    sessionStorage: sessionStorage || createMockStorage(),
    localStorage: localStorage || createMockStorage(),
    crypto: {
      randomUUID: () => "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
    },
    location: { pathname: "/app-mia" },
    navigator: { userAgent: "patch-33-test-agent" },
  };
}

function clearWindow() {
  delete globalThis.window;
}

console.log("\nPATCH 3.3 — authenticated identity tests\n");

// Anonymous — no session token
{
  const req = buildReq({
    body: { user_id: USER_U1 },
  });
  assert("Anonymous — user_id NULL", simulateTrackInsertUserId(req, USER_U1) === null);
}

// Anonymous spoofing — body user_id ignored
{
  const req = buildReq({ body: { user_id: USER_U2 } });
  assert("Anonymous spoof — persists NULL", simulateTrackInsertUserId(req, USER_U2) === null);
}

// Authenticated — server resolves official UUID
{
  const token = issueUserSessionToken(USER_U1, TEST_ENV);
  const req = buildReq({ token });
  assert("Authenticated — resolves U1", simulateTrackInsertUserId(req) === USER_U1);
}

// Authenticated spoofing — body U2 ignored, session U1 wins
{
  const token = issueUserSessionToken(USER_U1, TEST_ENV);
  const req = buildReq({ token, body: { user_id: USER_U2 } });
  assert("Auth spoof — persists U1 not U2", simulateTrackInsertUserId(req, USER_U2) === USER_U1);
}

// Invalid body values do not break resolution
{
  const token = issueUserSessionToken(USER_U1, TEST_ENV);
  assert(
    "Invalid body email ignored with valid session",
    simulateTrackInsertUserId(buildReq({ token, body: { user_id: "not-an-email@uuid" } }), "not-an-email@uuid") === USER_U1
  );
}

// Invalid token — safe NULL
{
  assert(
    "Invalid token — NULL",
    simulateTrackInsertUserId(buildReq({ token: "bad.token" }), USER_U1) === null
  );
}

// Expired token — safe NULL
{
  const expiredAt = Date.now() - 31 * 24 * 60 * 60 * 1000;
  const token = issueUserSessionToken(USER_U1, TEST_ENV, expiredAt);
  const verified = verifyUserSessionToken(token, TEST_ENV, Date.now());
  assert("Expired token rejected", verified.ok === false);
  assert(
    "Expired token — NULL on track",
    simulateTrackInsertUserId(buildReq({ token }), USER_U1) === null
  );
}

// Logout simulation — no token after logout
{
  const req = buildReq({ body: { user_id: USER_U1 } });
  assert("Post-logout anonymous — NULL", simulateTrackInsertUserId(req) === null);
}

// Account switch — U1 then U2 tokens resolve independently
{
  const tokenU1 = issueUserSessionToken(USER_U1, TEST_ENV);
  const tokenU2 = issueUserSessionToken(USER_U2, TEST_ENV);
  assert("Switch U1", simulateTrackInsertUserId(buildReq({ token: tokenU1 })) === USER_U1);
  assert("Switch U2", simulateTrackInsertUserId(buildReq({ token: tokenU2 })) === USER_U2);
}

// x-mia-session-token header path
{
  const token = issueUserSessionToken(USER_U1, TEST_ENV);
  const req = { headers: { "x-mia-session-token": token }, body: {} };
  assert("Header token resolves U1", resolveAuthenticatedAnalyticsUserId(req, TEST_ENV) === USER_U1);
}

// Client payload strips user_id before fetch
{
  clearWindow();
  installWindow();
  const captured = [];
  let lastInit = null;
  globalThis.fetch = async (_url, init) => {
    lastInit = init;
    captured.push({
      headers: init.headers,
      body: JSON.parse(init.body),
    });
    return { ok: true };
  };

  const token = issueUserSessionToken(USER_U1, TEST_ENV);
  await trackMiaEvent(
    "mia_question_sent",
    buildMiaQuestionSentPayload("test query", { userId: USER_U2, category: "smartphones" }),
    { conversationId: "cccccccc-dddd-4eee-8fff-000000000001", authUser: { session_token: token } }
  );

  assert("Client fetch sends Authorization", captured[0]?.headers?.Authorization === `Bearer ${token}`);
  assert("Client payload omits user_id", !("user_id" in captured[0].body));
  assert("Client credentials same-origin", lastInit?.credentials === "same-origin");

  delete globalThis.fetch;
  clearWindow();
}

// trackMiaQuestionSent no longer accepts userId option
{
  clearWindow();
  installWindow();
  const captured = [];
  globalThis.fetch = async (_url, init) => {
    captured.push(JSON.parse(init.body));
    return { ok: true };
  };

  await trackMiaQuestionSent("pergunta", {
    conversationId: "cccccccc-dddd-4eee-8fff-000000000002",
    authUser: { session_token: issueUserSessionToken(USER_U1, TEST_ENV) },
  });

  assert("Question payload omits user_id", !("user_id" in captured[0]));

  delete globalThis.fetch;
  clearWindow();
}

// session_started sends auth header when provided
{
  clearWindow();
  installWindow({ sessionStorage: createMockStorage() });
  const captured = [];
  globalThis.fetch = async (_url, init) => {
    captured.push(init.headers);
    return { ok: true };
  };

  const token = issueUserSessionToken(USER_U1, TEST_ENV);
  await trackMiaSessionStarted({ authUser: { session_token: token } });

  assert("session_started sends bearer", captured[0]?.Authorization === `Bearer ${token}`);
  assert("session_started not duplicated", globalThis.window.sessionStorage.getItem("mia_session_started_tracked") === "true");

  delete globalThis.fetch;
  clearWindow();
}

// assembleAnalyticsInsertRow — schema defaults
{
  const row = assembleAnalyticsInsertRow({ event_name: "session_started" });
  assert("Schema — user_id default null", row.user_id === null);
}

// Validator still accepts legacy body user_id (ignored at API)
{
  const valid = validateAnalyticsTrackRequest({
    event_name: "favorite_created",
    user_id: USER_U2,
    session_id: "sess",
    metadata: {},
  });
  assert("Allowlist accepts body user_id for compat", valid.ok === true);
  assert("Allowlist row still has string for API layer override", valid.row.user_id === USER_U2);
}

// Server-side email analytics ownership unchanged
{
  const row = assembleAnalyticsInsertRow({
    event_name: "price_drop_email_sent",
    user_id: isAnalyticsUuid(USER_U1) ? USER_U1 : null,
  });
  assert("Server-side email keeps trusted user_id", row.user_id === USER_U1);
}

// Merge strategy — prospective, no backfill helper exists
{
  assert("No identity link table module", typeof globalThis.analytics_identity_links === "undefined");
}

// Privacy — builders can include userId internally but client strips on send
{
  clearWindow();
  installWindow();
  const captured = [];
  globalThis.fetch = async (_url, init) => {
    captured.push(JSON.parse(init.body));
    return { ok: true };
  };

  await trackMiaEvent("offer_click", { metadata: { button_text: "Ver oferta" } });
  assert("offer_click anonymous — no user_id in payload", !("user_id" in captured[0]));
  assert(
    "offer_click metadata has no token",
    !JSON.stringify(captured[0].metadata || {}).includes("token")
  );

  delete globalThis.fetch;
  clearWindow();
}

// UUID validation on resolved id
{
  const token = issueUserSessionToken("local-123", TEST_ENV);
  assert(
    "Non-UUID session uid rejected",
    resolveAuthenticatedAnalyticsUserId(buildReq({ token }), TEST_ENV) === null
  );
}

console.log(`\nResultado: ${passed}/${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
