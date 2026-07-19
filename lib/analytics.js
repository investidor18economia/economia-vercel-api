/**
 * PATCH Analytics 1.1 — session_id scoped to browser tab session (sessionStorage).
 *
 * session_id = anonymous tab session identifier (not a person, not a device visitor id).
 * user_id    = authenticated user when available (separate field on events).
 */

export const MIA_ANALYTICS_SESSION_ID_KEY = "mia_session_id";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export async function trackMiaEvent(eventName, payload = {}) {
  try {
    const sessionId = getMiaSessionId();

    await fetch("/api/analytics/track", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event_name: eventName,
        session_id: sessionId,
        ...payload,
      }),
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
  await trackMiaEvent("mia_question_sent", {
    query_text: queryText || "",
    category: detectAnalyticsCategory(queryText),
    user_id: userId,
    metadata: {
      has_image: !!hasImage,
    },
  });
}

export async function trackMiaSessionStarted() {
  if (typeof window === "undefined") return;

  const alreadyTracked = sessionStorage.getItem("mia_session_started_tracked");

  if (alreadyTracked) return;

  sessionStorage.setItem("mia_session_started_tracked", "true");

  await trackMiaEvent("session_started", {
    metadata: {
      page: window.location.pathname,
      user_agent: navigator.userAgent,
      referrer: document.referrer || null,
    },
  });
}

/** @internal Test helper — validates UUID v4 when crypto.randomUUID is available. */
export function isMiaAnalyticsSessionIdFormatValid(value) {
  if (!isValidStoredSessionId(value)) return false;
  if (String(value).startsWith("mia-sess-")) return true;
  return UUID_V4_PATTERN.test(String(value));
}
