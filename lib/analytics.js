/**
 * PATCH Analytics 1.1 — session_id scoped to browser tab session (sessionStorage).
 * PATCH 2.2 — payload assembly delegated to miaAnalyticsPayload.js
 * PATCH 3.1 — visitor_id scoped to browser origin (localStorage).
 * PATCH 3.2 — conversation_id owned by MIAChat in-memory (not persisted in localStorage).
 * PATCH 3.3 — user_id resolved server-side from verified MIA session token (never from client body).
 */

import {
  buildAnalyticsTrackPayload,
  buildMiaQuestionSentPayload,
  buildMiaSessionStartedPayload,
  isAnalyticsUuid,
} from "./miaAnalyticsPayload.js";

export {
  buildMiaFavoriteCreatedPayload,
  buildMiaOfferClickPayload,
  buildMiaPriceAlertCreatedPayload,
  buildMiaRecommendationShownPayload,
} from "./miaAnalyticsPayload.js";

export const MIA_ANALYTICS_SESSION_ID_KEY = "mia_session_id";
export const MIA_ANALYTICS_VISITOR_ID_KEY = "mia_analytics_visitor_id";
/** Legacy key — no longer used as source of truth; removed on safe cleanup only. */
export const MIA_CONVERSATION_ID_KEY = "mia_conversation_id";

function createMiaSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const random = Math.random().toString(16).slice(2);
  const time = Date.now().toString(16);
  return `mia-sess-${time}-${random}`;
}

function isValidStoredSessionId(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Removes legacy persistent session id from localStorage without throwing.
 * Does not migrate the old value into sessionStorage.
 */
export function removeLegacyAnalyticsSessionIdFromLocalStorage(storage = null) {
  if (typeof window === "undefined") return false;

  const target = storage || window.localStorage;
  if (!target || typeof target.removeItem !== "function") return false;

  try {
    target.removeItem(MIA_ANALYTICS_SESSION_ID_KEY);
    return true;
  } catch {
    return false;
  }
}

export function getMiaSessionId() {
  if (typeof window === "undefined") return null;

  removeLegacyAnalyticsSessionIdFromLocalStorage();

  try {
    const existing = window.sessionStorage.getItem(MIA_ANALYTICS_SESSION_ID_KEY);
    if (isValidStoredSessionId(existing)) {
      return existing.trim();
    }
  } catch {
    // fall through to create a new in-memory id without persisting
  }

  const sessionId = createMiaSessionId();

  try {
    window.sessionStorage.setItem(MIA_ANALYTICS_SESSION_ID_KEY, sessionId);
  } catch {
    // Analytics must never break the app if storage is unavailable.
  }

  return sessionId;
}

function createAnalyticsVisitorId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return null;
}

/**
 * Returns a persistent anonymous visitor UUID for this browser origin.
 * Stored in localStorage; independent from session_id (sessionStorage).
 */
export function getOrCreateAnalyticsVisitorId() {
  if (typeof window === "undefined") return null;

  let storage = null;
  try {
    storage = window.localStorage;
  } catch {
    return createAnalyticsVisitorId();
  }

  if (!storage || typeof storage.getItem !== "function") {
    return createAnalyticsVisitorId();
  }

  try {
    const existing = storage.getItem(MIA_ANALYTICS_VISITOR_ID_KEY);
    if (isAnalyticsUuid(existing)) {
      return existing.trim();
    }
  } catch {
    // fall through to create a new id without persisting
  }

  const visitorId = createAnalyticsVisitorId();
  if (!visitorId) return null;

  try {
    storage.setItem(MIA_ANALYTICS_VISITOR_ID_KEY, visitorId);
  } catch {
    // Analytics must never break the app if storage is unavailable.
  }

  return visitorId;
}

/**
 * Creates a random conversation UUID. Does not read or write storage.
 * Official generation primitive — lifecycle is owned by MIAChat (in-memory ref).
 */
export function createAnalyticsConversationId() {
  if (typeof window === "undefined") return null;

  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return null;
}

/**
 * Removes legacy conversation id from localStorage without throwing.
 * Does not migrate the old value into the active chat thread.
 */
export function removeLegacyAnalyticsConversationIdFromLocalStorage(storage = null) {
  if (typeof window === "undefined") return false;

  const target = storage || window.localStorage;
  if (!target || typeof target.removeItem !== "function") return false;

  try {
    target.removeItem(MIA_CONVERSATION_ID_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {Record<string, unknown>} partial
 */
function stripClientControlledUserId(partial = {}) {
  if (!partial || typeof partial !== "object") return {};
  const next = { ...partial };
  delete next.user_id;
  return next;
}

/**
 * @param {{ session_token?: string|null }|null|undefined} authUser
 * @returns {Record<string, string>}
 */
function buildAnalyticsAuthHeaders(authUser = null) {
  const headers = {};
  if (authUser?.session_token) {
    headers.Authorization = `Bearer ${authUser.session_token}`;
  }
  return headers;
}

/**
 * @param {string} eventName
 * @param {Record<string, unknown>} [payload]
 * @param {{ conversationId?: string|null|false, authUser?: { session_token?: string|null }|null }} [options]
 */
export async function trackMiaEvent(eventName, payload = {}, options = {}) {
  try {
    const sessionId = getMiaSessionId();
    const visitorId = getOrCreateAnalyticsVisitorId();
    const sanitizedPayload = stripClientControlledUserId(payload);

    let resolvedConversationId = undefined;
    if (options.conversationId === false) {
      resolvedConversationId = false;
    } else if (typeof options.conversationId === "string") {
      resolvedConversationId = options.conversationId;
    }

    await fetch("/api/analytics/track", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAnalyticsAuthHeaders(options.authUser),
      },
      credentials: "same-origin",
      body: JSON.stringify(
        buildAnalyticsTrackPayload(
          eventName,
          sessionId,
          sanitizedPayload,
          visitorId,
          resolvedConversationId
        )
      ),
    });
  } catch (err) {
    console.warn("Analytics failed silently:", err);
  }
}

export function detectAnalyticsCategory(text = "") {
  const q = String(text).toLowerCase();

  if (/\b(celular|smartphone|iphone|galaxy|motorola|xiaomi|redmi|poco|realme)\b/.test(q)) {
    return "smartphones";
  }

  if (/\b(notebook|laptop|macbook|ultrabook)\b/.test(q)) {
    return "notebooks";
  }

  if (/\b(tv|televisão|televisao|smart tv|oled|qled)\b/.test(q)) {
    return "tv";
  }

  if (/\b(câmera|camera|canon|nikon|sony alpha|gopro)\b/.test(q)) {
    return "camera";
  }

  if (/\b(placa de vídeo|placa de video|gpu|rtx|gtx|radeon)\b/.test(q)) {
    return "placa_de_video";
  }

  if (/\b(fone|headphone|earbuds|airpods|galaxy buds)\b/.test(q)) {
    return "audio";
  }

  if (/\b(console|ps5|playstation|xbox|nintendo switch)\b/.test(q)) {
    return "games";
  }

  return "unknown";
}

/**
 * PATCH Analytics 1.2 — single contract for questions accepted for send.
 * Call once per question, regardless of manual input or clickable suggestion.
 */
export async function trackMiaQuestionSent(
  queryText = "",
  { hasImage = false, conversationId = null, authUser = null } = {}
) {
  const eventOptions = { authUser };
  if (typeof conversationId === "string" && conversationId) {
    eventOptions.conversationId = conversationId;
  }

  await trackMiaEvent(
    "mia_question_sent",
    buildMiaQuestionSentPayload(queryText, {
      hasImage,
      category: detectAnalyticsCategory(queryText),
    }),
    eventOptions
  );
}

export async function trackMiaSessionStarted(options = {}) {
  if (typeof window === "undefined") return;

  let storage = null;
  try {
    storage = window.sessionStorage;
  } catch {
    return;
  }

  if (!storage || typeof storage.getItem !== "function") return;

  const alreadyTracked = storage.getItem("mia_session_started_tracked");

  if (alreadyTracked) return;

  storage.setItem("mia_session_started_tracked", "true");

  await trackMiaEvent("session_started", buildMiaSessionStartedPayload(), {
    conversationId: false,
    authUser: options.authUser || null,
  });
}

/** @internal Test helper — validates UUID v4 when crypto.randomUUID is available. */
export function isMiaAnalyticsSessionIdFormatValid(value) {
  if (!isValidStoredSessionId(value)) return false;
  if (String(value).startsWith("mia-sess-")) return true;
  return isAnalyticsUuid(value);
}
