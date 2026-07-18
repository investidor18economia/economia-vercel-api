/**
 * PATCH 12D — Public analytics ingestion allowlist and payload limits.
 */

export const ALLOWED_ANALYTICS_EVENTS = Object.freeze([
  "session_started",
  "mia_question_sent",
  "mia_recommendation_shown",
  "favorite_created",
  "price_alert_created",
  "offer_click",
]);

export const ANALYTICS_MAX_STRING_CHARS = 512;
export const ANALYTICS_MAX_QUERY_CHARS = 2000;
export const ANALYTICS_MAX_METADATA_JSON_CHARS = 4000;

function cleanString(value, maxChars = ANALYTICS_MAX_STRING_CHARS) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, maxChars);
}

export function validateAnalyticsTrackRequest(body = {}) {
  const eventName = cleanString(body.event_name, 128);
  if (!eventName) {
    return {
      ok: false,
      statusCode: 400,
      payload: { error: "event_name_required", reasonCode: "analytics_event_required" },
    };
  }

  if (!ALLOWED_ANALYTICS_EVENTS.includes(eventName)) {
    return {
      ok: false,
      statusCode: 400,
      payload: { error: "event_not_allowed", reasonCode: "analytics_event_not_allowed" },
    };
  }

  let metadata = body.metadata;
  if (metadata != null && typeof metadata !== "object") {
    return {
      ok: false,
      statusCode: 400,
      payload: { error: "invalid_metadata", reasonCode: "analytics_invalid_metadata" },
    };
  }

  const metadataJson = metadata ? JSON.stringify(metadata) : "{}";
  if (metadataJson.length > ANALYTICS_MAX_METADATA_JSON_CHARS) {
    return {
      ok: false,
      statusCode: 413,
      payload: { error: "metadata_too_large", reasonCode: "analytics_payload_too_large" },
    };
  }

  return {
    ok: true,
    row: {
      event_name: eventName,
      session_id: cleanString(body.session_id, 128),
      user_id: cleanString(body.user_id, 128),
      category: cleanString(body.category, 64),
      product_name: cleanString(body.product_name),
      product_brand: cleanString(body.product_brand),
      product_id: cleanString(body.product_id),
      query_text: cleanString(body.query_text, ANALYTICS_MAX_QUERY_CHARS),
      recommendation_name: cleanString(body.recommendation_name),
      offer_store: cleanString(body.offer_store),
      offer_price: body.offer_price == null ? null : Number(body.offer_price),
      offer_url: cleanString(body.offer_url, 2048),
      metadata: metadata || {},
    },
  };
}
