/**
 * PATCH Analytics 1.1 — session_id scoped to browser tab session (sessionStorage).
 * PATCH 2.2 — payload assembly delegated to miaAnalyticsPayload.js
 * PATCH 3.1 — visitor_id scoped to browser origin (localStorage).
 *
 * visitor_id = anonymous persistent browser identity (not authenticated, not session).
 * session_id = anonymous tab session identifier (not a person, not a device visitor id).
 * user_id    = authenticated user when available (separate field on events).
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

export async function trackMiaEvent(eventName, payload = {}) {
  try {
    const sessionId = getMiaSessionId();
    const visitorId = getOrCreateAnalyticsVisitorId();

    await fetch("/api/analytics/track", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildAnalyticsTrackPayload(eventName, sessionId, payload, visitorId)),
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
export async function trackMiaQuestionSent(queryText = "", { userId = null, hasImage = false } = {}) {
  await trackMiaEvent(
    "mia_question_sent",
    buildMiaQuestionSentPayload(queryText, {
      userId,
      hasImage,
      category: detectAnalyticsCategory(queryText),
    })
  );
}

export async function trackMiaSessionStarted() {
  if (typeof window === "undefined") return;

  const alreadyTracked = sessionStorage.getItem("mia_session_started_tracked");

  if (alreadyTracked) return;

  sessionStorage.setItem("mia_session_started_tracked", "true");

  await trackMiaEvent("session_started", buildMiaSessionStartedPayload());
}

/** @internal Test helper — validates UUID v4 when crypto.randomUUID is available. */
export function isMiaAnalyticsSessionIdFormatValid(value) {
  if (!isValidStoredSessionId(value)) return false;
  if (String(value).startsWith("mia-sess-")) return true;
  return isAnalyticsUuid(value);
}
