/**
 * PATCH 3.2 — conversation_id identity tests.
 */
import {
  getCurrentAnalyticsConversationId,
  getOrCreateAnalyticsConversationId,
  startNewAnalyticsConversation,
  MIA_CONVERSATION_ID_KEY,
  MIA_ANALYTICS_VISITOR_ID_KEY,
  MIA_ANALYTICS_SESSION_ID_KEY,
  trackMiaEvent,
  trackMiaQuestionSent,
  trackMiaSessionStarted,
} from "../lib/analytics.js";
import {
  buildAnalyticsTrackPayload,
  assembleAnalyticsInsertRow,
  isAnalyticsUuid,
} from "../lib/miaAnalyticsPayload.js";
import { validateAnalyticsTrackRequest } from "../lib/miaAnalyticsAllowlist.js";

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
    _dump() {
      return Object.fromEntries(map.entries());
    },
  };
}

function installWindow({ sessionStorage, localStorage, crypto } = {}) {
  globalThis.window = {
    sessionStorage: sessionStorage || createMockStorage(),
    localStorage: localStorage || createMockStorage(),
    crypto: crypto || {
      randomUUID: () => "cccccccc-dddd-4eee-8fff-000000000001",
    },
    location: { pathname: "/app-mia" },
    navigator: { userAgent: "test-agent" },
  };
}

function clearWindow() {
  delete globalThis.window;
}

console.log("\nPATCH 3.2 — conversation_id tests\n");

// Test 1 — lazy: no id before conversation starts
{
  clearWindow();
  installWindow({ sessionStorage: createMockStorage(), localStorage: createMockStorage() });
  const current = getCurrentAnalyticsConversationId();
  assert("Test 1 — no conversation_id before chat starts", current === null);
  assert(
    "Test 1 — localStorage empty",
    globalThis.window.localStorage.getItem(MIA_CONVERSATION_ID_KEY) == null
  );
}

// Test 2 — getOrCreate generates valid UUID
{
  clearWindow();
  installWindow({ sessionStorage: createMockStorage(), localStorage: createMockStorage() });
  const id = getOrCreateAnalyticsConversationId();
  assert("Test 2 — generates valid conversation id", isAnalyticsUuid(id));
  assert(
    "Test 2 — persists in localStorage",
    globalThis.window.localStorage.getItem(MIA_CONVERSATION_ID_KEY) === id
  );
}

// Test 3 — reuses existing valid UUID
{
  clearWindow();
  const localStorage = createMockStorage({
    [MIA_CONVERSATION_ID_KEY]: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  });
  installWindow({ sessionStorage: createMockStorage(), localStorage });
  const id = getOrCreateAnalyticsConversationId();
  assert("Test 3 — reuses valid UUID", id === "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
}

// Test 4 — replaces legacy non-UUID value
{
  clearWindow();
  const localStorage = createMockStorage({
    [MIA_CONVERSATION_ID_KEY]: "mia-12345-legacy",
  });
  installWindow({ sessionStorage: createMockStorage(), localStorage });
  const id = getOrCreateAnalyticsConversationId();
  assert("Test 4 — replaces legacy non-UUID", isAnalyticsUuid(id));
  assert("Test 4 — legacy value overwritten", localStorage.getItem(MIA_CONVERSATION_ID_KEY) === id);
}

// Test 5 — startNewAnalyticsConversation creates fresh UUID
{
  clearWindow();
  const localStorage = createMockStorage({
    [MIA_CONVERSATION_ID_KEY]: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  });
  let counter = 0;
  installWindow({
    sessionStorage: createMockStorage(),
    localStorage,
    crypto: {
      randomUUID: () => {
        counter += 1;
        return counter === 1
          ? "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff"
          : "cccccccc-dddd-4eee-8fff-000000000002";
      },
    },
  });
  const first = getOrCreateAnalyticsConversationId();
  const second = startNewAnalyticsConversation();
  assert("Test 5 — startNew returns UUID", isAnalyticsUuid(second));
  assert("Test 5 — new id differs from previous", second !== first);
  assert("Test 5 — localStorage updated", localStorage.getItem(MIA_CONVERSATION_ID_KEY) === second);
}

// Test 6 — independent from visitor_id and session_id keys
{
  clearWindow();
  const sessionStorage = createMockStorage({
    [MIA_ANALYTICS_SESSION_ID_KEY]: "sess-only",
  });
  const localStorage = createMockStorage({
    [MIA_ANALYTICS_VISITOR_ID_KEY]: "11111111-2222-4333-8444-555555555555",
  });
  installWindow({ sessionStorage, localStorage });
  const conversationId = getOrCreateAnalyticsConversationId();
  assert("Test 6 — conversation not in sessionStorage", sessionStorage.getItem(MIA_CONVERSATION_ID_KEY) == null);
  assert(
    "Test 6 — visitor key unchanged",
    localStorage.getItem(MIA_ANALYTICS_VISITOR_ID_KEY) === "11111111-2222-4333-8444-555555555555"
  );
  assert("Test 6 — conversation is UUID", isAnalyticsUuid(conversationId));
}

// Test 7 — SSR safe
{
  clearWindow();
  assert("Test 7 — getCurrent SSR null", getCurrentAnalyticsConversationId() === null);
  assert("Test 7 — getOrCreate SSR null", getOrCreateAnalyticsConversationId() === null);
  assert("Test 7 — startNew SSR null", startNewAnalyticsConversation() === null);
}

// Test 8 — session_started explicit null conversation_id
{
  clearWindow();
  installWindow({ sessionStorage: createMockStorage(), localStorage: createMockStorage() });
  const captured = [];
  globalThis.fetch = async (_url, init) => {
    captured.push(JSON.parse(init.body));
    return { ok: true };
  };

  await trackMiaSessionStarted();
  assert("Test 8 — session_started captured", captured.length === 1);
  assert("Test 8 — conversation_id null on session_started", captured[0].conversation_id === null);
  assert(
    "Test 8 — no conversation created in storage",
    globalThis.window.localStorage.getItem(MIA_CONVERSATION_ID_KEY) == null
  );

  delete globalThis.fetch;
}

// Test 9 — mia_question_sent ensures conversation_id
{
  clearWindow();
  installWindow({ sessionStorage: createMockStorage(), localStorage: createMockStorage() });
  const captured = [];
  globalThis.fetch = async (_url, init) => {
    captured.push(JSON.parse(init.body));
    return { ok: true };
  };

  await trackMiaQuestionSent("Qual celular até 2500?");
  assert("Test 9 — one event captured", captured.length === 1);
  assert("Test 9 — conversation_id is UUID", isAnalyticsUuid(captured[0].conversation_id));
  assert(
    "Test 9 — same id persisted",
    globalThis.window.localStorage.getItem(MIA_CONVERSATION_ID_KEY) === captured[0].conversation_id
  );

  delete globalThis.fetch;
}

// Test 10 — continuity reuses same conversation_id
{
  clearWindow();
  installWindow({ sessionStorage: createMockStorage(), localStorage: createMockStorage() });
  const captured = [];
  globalThis.fetch = async (_url, init) => {
    captured.push(JSON.parse(init.body));
    return { ok: true };
  };

  await trackMiaQuestionSent("Primeira pergunta");
  await trackMiaEvent("mia_recommendation_shown", { recommendation_name: "X", metadata: {} });
  assert("Test 10 — two events captured", captured.length === 2);
  assert(
    "Test 10 — same conversation_id across events",
    captured[0].conversation_id === captured[1].conversation_id
  );

  delete globalThis.fetch;
}

// Test 11 — buildAnalyticsTrackPayload canonical order
{
  const payload = buildAnalyticsTrackPayload(
    "mia_question_sent",
    "sess-1",
    { query_text: "test" },
    "11111111-2222-4333-8444-555555555555",
    "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
  );
  const keys = Object.keys(payload);
  assert("Test 11 — order event_name first", keys[0] === "event_name");
  assert("Test 11 — order visitor_id second", keys[1] === "visitor_id");
  assert("Test 11 — order session_id third", keys[2] === "session_id");
  assert("Test 11 — order conversation_id fourth", keys[3] === "conversation_id");
}

// Test 12 — assembleAnalyticsInsertRow default null
{
  const row = assembleAnalyticsInsertRow({ event_name: "session_started" });
  assert("Test 12 — insert row conversation_id null by default", row.conversation_id === null);
}

// Test 13 — validator accepts valid conversation_id
{
  const valid = validateAnalyticsTrackRequest({
    event_name: "mia_question_sent",
    visitor_id: "11111111-2222-4333-8444-555555555555",
    session_id: "sess-abc",
    conversation_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    metadata: {},
  });
  assert("Test 13 — validator accepts valid conversation_id", valid.ok === true);
  assert(
    "Test 13 — row includes conversation_id",
    valid.row.conversation_id === "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
  );
}

// Test 14 — absent conversation_id allowed
{
  const absent = validateAnalyticsTrackRequest({
    event_name: "session_started",
    session_id: "sess-abc",
    metadata: {},
  });
  assert("Test 14 — absent conversation_id allowed", absent.ok === true);
  assert("Test 14 — row conversation_id null when absent", absent.row.conversation_id == null);
}

// Test 15 — buildAnalyticsTrackPayload explicit false → null
{
  const payload = buildAnalyticsTrackPayload(
    "session_started",
    "sess-1",
    {},
    "11111111-2222-4333-8444-555555555555",
    false
  );
  assert("Test 15 — explicit false sets conversation_id null", payload.conversation_id === null);
}

console.log(`\nResultado: ${passed}/${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
