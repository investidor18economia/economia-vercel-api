/**
 * PATCH Analytics 1.2 — mia_question_sent for manual send and clickable suggestions.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createAnalyticsConversationId,
  getMiaSessionId,
  MIA_ANALYTICS_SESSION_ID_KEY,
  trackMiaQuestionSent,
} from "../lib/analytics.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CHAT_SOURCE = readFileSync(join(ROOT, "components/MIAChat.jsx"), "utf8");

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
  };
}

function installWindow({ sessionStorage, localStorage } = {}) {
  globalThis.window = {
    sessionStorage: sessionStorage || createMockStorage(),
    localStorage: localStorage || createMockStorage(),
    crypto: {
      randomUUID: () => "11111111-2222-4333-8444-555555555555",
    },
    location: { pathname: "/app-mia" },
    navigator: { userAgent: "test-agent" },
  };
}

function clearWindow() {
  delete globalThis.window;
  delete globalThis.fetch;
}

console.log("\nPATCH Analytics 1.2 — suggestion tracking tests\n");

// Test 1 — manual send contract via trackMiaQuestionSent
{
  clearWindow();
  installWindow();
  const captured = [];
  globalThis.fetch = async (_url, options) => {
    captured.push(JSON.parse(options.body));
    return { ok: true, status: 200, json: async () => ({ success: true }) };
  };

  await trackMiaQuestionSent("Quero um notebook para trabalho", {
    userId: null,
    hasImage: false,
    conversationId: createAnalyticsConversationId(),
  });

  assert("Test 1 — manual path records one event", captured.length === 1);
  assert("Test 1 — event_name is mia_question_sent", captured[0]?.event_name === "mia_question_sent");
  assert(
    "Test 1 — query_text matches question",
    captured[0]?.query_text === "Quero um notebook para trabalho"
  );
  assert("Test 1 — category detected", captured[0]?.category === "notebooks");
  assert(
    "Test 1 — session_id present",
    captured[0]?.session_id === globalThis.window.sessionStorage.getItem(MIA_ANALYTICS_SESSION_ID_KEY)
  );
}

// Test 2 — suggestion send uses same contract
{
  clearWindow();
  installWindow();
  const captured = [];
  globalThis.fetch = async (_url, options) => {
    captured.push(JSON.parse(options.body));
    return { ok: true, status: 200, json: async () => ({ success: true }) };
  };

  await trackMiaQuestionSent("📱 Celular até 2.000", {
    hasImage: false,
    conversationId: createAnalyticsConversationId(),
  });

  assert("Test 2 — suggestion path records one event", captured.length === 1);
  assert("Test 2 — query_text equals suggestion text", captured[0]?.query_text === "📱 Celular até 2.000");
  assert("Test 2 — category detected for smartphone suggestion", captured[0]?.category === "smartphones");
  assert(
    "Test 2 — client payload omits user_id (PATCH 3.3 server-side resolution)",
    !("user_id" in captured[0])
  );
}

// Test 3 — analytics failure does not throw
{
  clearWindow();
  installWindow();
  globalThis.fetch = async () => {
    throw new Error("analytics down");
  };

  let threw = false;
  try {
    await trackMiaQuestionSent("teste", {
      hasImage: false,
      conversationId: createAnalyticsConversationId(),
    });
  } catch {
    threw = true;
  }
  assert("Test 3 — analytics failure does not throw", threw === false);
}

// Test 4 — image metadata preserved for manual send
{
  clearWindow();
  installWindow();
  const captured = [];
  globalThis.fetch = async (_url, options) => {
    captured.push(JSON.parse(options.body));
    return { ok: true, status: 200, json: async () => ({ success: true }) };
  };

  await trackMiaQuestionSent("Imagem enviada", {
    userId: null,
    hasImage: true,
    conversationId: createAnalyticsConversationId(),
  });
  assert("Test 4 — has_image true when image sent", captured[0]?.metadata?.has_image === true);
}

// Test 5 — static wiring in MIAChat
{
  const manualCalls = (CHAT_SOURCE.match(/trackMiaQuestionSent\(/g) || []).length;
  const legacyInline = CHAT_SOURCE.includes('trackMiaEvent("mia_question_sent"');
  const suggestionHandlerUsesHelper = /function handleSuggestion[\s\S]*trackMiaQuestionSent\(/.test(
    CHAT_SOURCE
  );
  const enviarUsesHelper = /async function enviar\([\s\S]*trackMiaQuestionSent\(/.test(CHAT_SOURCE);
  const suggestionClickDoesNotTrackDirectly = !/onClick=\{\(\) => \{[\s\S]*trackMiaQuestionSent\(/.test(
    CHAT_SOURCE
  );
  const favoriteFnMatch = CHAT_SOURCE.match(
    /function handleAskMiaAboutFavorite\([\s\S]*?\n  \}/
  );
  const favoriteFnSource = favoriteFnMatch ? favoriteFnMatch[0] : "";
  const favoriteFillOnly = favoriteFnSource.includes("setMsg(");
  const favoriteDoesNotTrack = !favoriteFnSource.includes("trackMiaQuestionSent(");

  const enviarPassesConversationId = /async function enviar\([\s\S]*trackMiaQuestionSent\([\s\S]*conversationId/.test(
    CHAT_SOURCE
  );
  const usesInMemoryRef = CHAT_SOURCE.includes("conversationIdRef") &&
    CHAT_SOURCE.includes("getOrCreateCurrentConversationId");

  assert("Test 5 — enviar uses trackMiaQuestionSent", enviarUsesHelper);
  assert("Test 5 — handleSuggestion uses trackMiaQuestionSent", suggestionHandlerUsesHelper);
  assert("Test 5 — enviar passes conversationId explicitly", enviarPassesConversationId);
  assert("Test 5 — chat owns in-memory conversation ref", usesInMemoryRef);
  assert("Test 5 — exactly two send tracking call sites", manualCalls === 2);
  assert("Test 5 — no legacy inline mia_question_sent in chat", legacyInline === false);
  assert("Test 5 — suggestion button click does not track directly", suggestionClickDoesNotTrackDirectly);
  assert("Test 5 — favorite fill-only path exists", favoriteFillOnly);
  assert("Test 5 — favorite fill-only does not track before send", favoriteDoesNotTrack);
}

// Test 6 — session_id still works after helper introduction
{
  clearWindow();
  installWindow();
  const id = getMiaSessionId();
  assert("Test 6 — session_id still generated", typeof id === "string" && id.length > 0);
}

console.log(`\nResultado: ${passed}/${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
