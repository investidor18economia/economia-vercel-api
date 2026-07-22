/**
 * PATCH 3.1 — visitor_id identity tests.
 */
import {
  getOrCreateAnalyticsVisitorId,
  getMiaSessionId,
  MIA_ANALYTICS_VISITOR_ID_KEY,
  MIA_ANALYTICS_SESSION_ID_KEY,
  trackMiaEvent,
} from "../lib/analytics.js";
import {
  buildAnalyticsTrackPayload,
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
      randomUUID: () => "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    },
    location: { pathname: "/app-mia" },
    navigator: { userAgent: "test-agent" },
  };
}

function clearWindow() {
  delete globalThis.window;
}

console.log("\nPATCH 3.1 — visitor_id tests\n");

// Test 1 — generates valid UUID when missing
{
  clearWindow();
  installWindow({ sessionStorage: createMockStorage(), localStorage: createMockStorage() });
  const id = getOrCreateAnalyticsVisitorId();
  assert("Test 1 — generates valid visitor id", isAnalyticsUuid(id));
  assert(
    "Test 1 — persists in localStorage",
    globalThis.window.localStorage.getItem(MIA_ANALYTICS_VISITOR_ID_KEY) === id
  );
}

// Test 2 — reuses existing valid UUID
{
  clearWindow();
  const localStorage = createMockStorage({
    [MIA_ANALYTICS_VISITOR_ID_KEY]: "11111111-2222-4333-8444-555555555555",
  });
  installWindow({ sessionStorage: createMockStorage(), localStorage });
  const id = getOrCreateAnalyticsVisitorId();
  assert("Test 2 — reuses existing localStorage id", id === "11111111-2222-4333-8444-555555555555");
}

// Test 3 — replaces invalid stored value
{
  clearWindow();
  const localStorage = createMockStorage({
    [MIA_ANALYTICS_VISITOR_ID_KEY]: "not-a-valid-uuid",
  });
  installWindow({ sessionStorage: createMockStorage(), localStorage });
  const id = getOrCreateAnalyticsVisitorId();
  assert("Test 3 — replaces invalid stored value", isAnalyticsUuid(id));
  assert("Test 3 — invalid value overwritten", localStorage.getItem(MIA_ANALYTICS_VISITOR_ID_KEY) === id);
}

// Test 4 — does not regenerate on repeated calls
{
  clearWindow();
  installWindow({ sessionStorage: createMockStorage(), localStorage: createMockStorage() });
  const first = getOrCreateAnalyticsVisitorId();
  const second = getOrCreateAnalyticsVisitorId();
  assert("Test 4 — stable across repeated calls", first === second);
}

// Test 5 — persists across simulated new session (empty sessionStorage)
{
  clearWindow();
  const localStorage = createMockStorage();
  installWindow({ sessionStorage: createMockStorage(), localStorage });
  const visitorId = getOrCreateAnalyticsVisitorId();
  const sessionA = getMiaSessionId();

  clearWindow();
  installWindow({
    sessionStorage: createMockStorage(),
    localStorage,
  });
  const visitorAfter = getOrCreateAnalyticsVisitorId();
  const sessionB = getMiaSessionId();

  assert("Test 5 — visitor_id persists after new session", visitorAfter === visitorId);
  assert("Test 5 — session_id changes between sessions", sessionA !== sessionB);
}

// Test 6 — shared localStorage across tabs simulation
{
  clearWindow();
  const localStorage = createMockStorage();
  installWindow({ sessionStorage: createMockStorage({ tab: "a" }), localStorage });
  const tabA = getOrCreateAnalyticsVisitorId();

  clearWindow();
  installWindow({ sessionStorage: createMockStorage({ tab: "b" }), localStorage });
  const tabB = getOrCreateAnalyticsVisitorId();

  assert("Test 6 — same visitor_id across tabs", tabA === tabB);
}

// Test 7 — visitor_id independent from sessionStorage key
{
  clearWindow();
  const sessionStorage = createMockStorage({
    [MIA_ANALYTICS_SESSION_ID_KEY]: "session-only-value",
  });
  const localStorage = createMockStorage();
  installWindow({ sessionStorage, localStorage });
  const visitorId = getOrCreateAnalyticsVisitorId();
  assert("Test 7 — visitor not stored in sessionStorage", sessionStorage.getItem(MIA_ANALYTICS_VISITOR_ID_KEY) == null);
  assert("Test 7 — session not stored in visitor localStorage key", localStorage.getItem(MIA_ANALYTICS_SESSION_ID_KEY) == null);
  assert("Test 7 — visitor_id is UUID", isAnalyticsUuid(visitorId));
}

// Test 8 — SSR safe
{
  clearWindow();
  const id = getOrCreateAnalyticsVisitorId();
  assert("Test 8 — SSR returns null without throwing", id === null);
}

// Test 9 — localStorage throws
{
  clearWindow();
  installWindow({
    sessionStorage: createMockStorage(),
    localStorage: {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    },
  });
  let threw = false;
  let id = null;
  try {
    id = getOrCreateAnalyticsVisitorId();
  } catch {
    threw = true;
  }
  assert("Test 9 — localStorage failure does not throw", threw === false);
  assert("Test 9 — fallback UUID when storage blocked", isAnalyticsUuid(id));
}

// Test 10 — track payload includes visitor_id
{
  clearWindow();
  const localStorage = createMockStorage();
  installWindow({ sessionStorage: createMockStorage(), localStorage });
  const captured = [];
  globalThis.fetch = async (_url, init) => {
    captured.push(JSON.parse(init.body));
    return { ok: true };
  };

  await trackMiaEvent("mia_question_sent", { query_text: "test", metadata: {} });
  assert("Test 10 — one event captured", captured.length === 1);
  assert("Test 10 — payload includes visitor_id", isAnalyticsUuid(captured[0].visitor_id));
  assert("Test 10 — payload includes session_id", typeof captured[0].session_id === "string");
  assert(
    "Test 10 — canonical order starts event_name, visitor_id, session_id",
    Object.keys(captured[0])[0] === "event_name" &&
      Object.keys(captured[0])[1] === "visitor_id" &&
      Object.keys(captured[0])[2] === "session_id"
  );

  delete globalThis.fetch;
}

// Test 11 — buildAnalyticsTrackPayload merge
{
  const payload = buildAnalyticsTrackPayload(
    "session_started",
    "sess-1",
    {},
    "11111111-2222-4333-8444-555555555555"
  );
  assert("Test 11 — buildAnalyticsTrackPayload sets visitor_id", payload.visitor_id === "11111111-2222-4333-8444-555555555555");
}

// Test 12 — validator accepts valid visitor_id
{
  const valid = validateAnalyticsTrackRequest({
    event_name: "session_started",
    visitor_id: "11111111-2222-4333-8444-555555555555",
    session_id: "sess-abc",
    metadata: {},
  });
  assert("Test 12 — validator accepts valid visitor_id", valid.ok === true);
  assert(
    "Test 12 — row includes visitor_id",
    valid.row.visitor_id === "11111111-2222-4333-8444-555555555555"
  );
}

// Test 13 — validator passes invalid visitor_id through (normalized at API)
{
  const invalid = validateAnalyticsTrackRequest({
    event_name: "session_started",
    visitor_id: "bad-id",
    session_id: "sess-abc",
    metadata: {},
  });
  assert("Test 13 — validator accepts request with invalid visitor_id string", invalid.ok === true);
  assert("Test 13 — invalid visitor_id preserved in row for API normalization", invalid.row.visitor_id === "bad-id");
}

// Test 14 — absent visitor_id allowed
{
  const absent = validateAnalyticsTrackRequest({
    event_name: "offer_click",
    session_id: "sess-abc",
    metadata: {},
  });
  assert("Test 14 — absent visitor_id allowed", absent.ok === true);
  assert("Test 14 — row visitor_id null when absent", absent.row.visitor_id == null);
}

console.log(`\nResultado: ${passed}/${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
