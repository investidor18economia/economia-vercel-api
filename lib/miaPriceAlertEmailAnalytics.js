/**
 * PATCH 5 — Price Drop Email Analytics
 *
 * Registra eventos de envio real de alertas por e-mail em analytics_events.
 * Side-effect não bloqueante; nunca expõe secrets; não roda em dry run.
 */

import { parseNumericPrice } from "./productSourceAdapter/normalizeProduct.js";

export const MIA_PRICE_ALERT_EMAIL_ANALYTICS_VERSION = "5.0.0";
export const MIA_PRICE_ALERT_EMAIL_ANALYTICS_CATEGORY = "price_alert_email";

export const PRICE_DROP_EMAIL_ANALYTICS_EVENTS = Object.freeze({
  ATTEMPTED: "price_drop_email_attempted",
  SENT: "price_drop_email_sent",
  FAILED: "price_drop_email_failed",
  SKIPPED: "price_drop_email_skipped",
});

export const PRICE_DROP_EMAIL_TEST_ANALYTICS_EVENTS = Object.freeze({
  SENT: "price_drop_email_test_sent",
  FAILED: "price_drop_email_test_failed",
  SKIPPED: "price_drop_email_test_skipped",
});

export const MIA_PRICE_ALERT_EMAIL_TEST_ANALYTICS_CATEGORY = "price_alert_email_test";

export const PRICE_DROP_EMAIL_E2E_ANALYTICS_EVENTS = Object.freeze({
  SENT: "price_drop_email_e2e_sent",
  FAILED: "price_drop_email_e2e_failed",
  SKIPPED: "price_drop_email_e2e_skipped",
});

export const MIA_PRICE_ALERT_E2E_ANALYTICS_CATEGORY = "price_alert_e2e_test";

const FORBIDDEN_METADATA_KEYS = new Set([
  "user_email",
  "email",
  "resend_api_key",
  "api_key",
  "admin_key",
  "password",
  "token",
  "secret",
]);

function isValidUuid(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function sanitizeMetadataValue(value, depth = 0) {
  if (depth > 4) return null;
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.slice(0, 500);
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeMetadataValue(item, depth + 1));
  }
  if (typeof value === "object") {
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      const normalizedKey = String(key).toLowerCase();
      if (FORBIDDEN_METADATA_KEYS.has(normalizedKey)) continue;
      if (normalizedKey.includes("secret") || normalizedKey.includes("password")) continue;
      out[key] = sanitizeMetadataValue(nested, depth + 1);
    }
    return out;
  }
  return null;
}

/**
 * @param {{
 *   eventName: string,
 *   alert?: Record<string, unknown>,
 *   evaluation?: Record<string, unknown>,
 *   context?: Record<string, unknown>,
 * }} input
 */
export function buildPriceAlertEmailAnalyticsPayload(input = {}) {
  const alert = input.alert || {};
  const evaluation = input.evaluation || {};
  const context = input.context || {};

  const productName =
    String(evaluation.best_found_product_name || alert.product_name || "").trim() || null;

  const targetPrice =
    evaluation.target_price != null
      ? parseNumericPrice(evaluation.target_price)
      : parseNumericPrice(alert.target_price);

  const metadata = sanitizeMetadataValue({
    alert_id: alert.id ?? null,
    normalized_product_key: alert.normalized_product_key ?? null,
    target_price: targetPrice,
    best_found_price: evaluation.best_found_price ?? null,
    best_found_source: evaluation.best_found_source ?? null,
    best_found_url: evaluation.best_found_url ?? null,
    reason: context.reason ?? null,
    send_mode: context.sendMode !== false,
    dry_run: false,
    email_send_count:
      alert.email_send_count != null
        ? Number.parseInt(String(alert.email_send_count), 10) || 0
        : null,
    last_alert_sent_price: parseNumericPrice(alert.last_alert_sent_price),
    resend_result_id: context.resendResultId ?? null,
    blocked_by: context.blockedBy ?? null,
    error_code: context.errorCode ?? null,
  });

  return {
    event_name: input.eventName,
    session_id: context.sessionId ?? null,
    user_id: isValidUuid(alert.user_id) ? alert.user_id : null,
    category: input.category || MIA_PRICE_ALERT_EMAIL_ANALYTICS_CATEGORY,
    product_name: productName,
    product_brand: alert.product_brand ?? null,
    product_id: alert.product_id ?? null,
    query_text: evaluation.search_query ?? context.searchQuery ?? null,
    recommendation_name: productName,
    offer_store: evaluation.best_found_source ?? null,
    offer_price: evaluation.best_found_price ?? null,
    offer_url: evaluation.best_found_url ?? null,
    metadata,
  };
}

/**
 * @param {{
 *   eventName: string,
 *   context?: Record<string, unknown>,
 * }} input
 */
export function buildPriceAlertEmailTestAnalyticsPayload(input = {}) {
  const context = input.context || {};
  const productName = String(context.productName || "").trim() || null;

  const metadata = sanitizeMetadataValue({
    controlled_test: true,
    not_market_real: true,
    mode: context.mode || "controlled-send",
    reason: context.reason ?? null,
    blocked_by: context.blockedBy ?? null,
    error_code: context.errorCode ?? null,
    resend_result_id: context.resendResultId ?? null,
    offer_store: context.offerStore ?? null,
    offer_price: context.offerPrice ?? null,
    offer_url: context.offerUrl ?? null,
    test_url_used: context.testUrlUsed ?? null,
  });

  return {
    event_name: input.eventName,
    session_id: null,
    user_id: null,
    category: MIA_PRICE_ALERT_EMAIL_TEST_ANALYTICS_CATEGORY,
    product_name: productName,
    product_brand: null,
    product_id: null,
    query_text: null,
    recommendation_name: productName,
    offer_store: context.offerStore ?? null,
    offer_price: context.offerPrice ?? null,
    offer_url: context.offerUrl ?? null,
    metadata,
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {{
 *   eventName: string,
 *   context?: Record<string, unknown>,
 * }} input
 */
export async function trackPriceAlertEmailTestAnalyticsEvent(supabase, input = {}) {
  if (!input.eventName) {
    return { ok: false, code: "missing_event_name" };
  }

  if (!supabase) {
    return { ok: false, code: "missing_supabase_client" };
  }

  try {
    const payload = buildPriceAlertEmailTestAnalyticsPayload(input);
    const { error } = await supabase.from("analytics_events").insert(payload);

    if (error) {
      console.warn("[MIA PriceAlert Test Analytics] insert failed:", {
        event: payload.event_name,
        code: String(error.code || "insert_error").slice(0, 80),
      });
      return {
        ok: false,
        code: "analytics_insert_failed",
        error: String(error.message || "insert_failed").slice(0, 160),
      };
    }

    return { ok: true, event_name: payload.event_name };
  } catch (err) {
    console.warn("[MIA PriceAlert Test Analytics] unexpected error:", {
      event: input.eventName,
      message: String(err?.message || "unknown_error").slice(0, 120),
    });
    return {
      ok: false,
      code: "analytics_internal_error",
      error: String(err?.message || "unknown_error").slice(0, 160),
    };
  }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {Parameters<typeof trackPriceAlertEmailTestAnalyticsEvent>[1]} input
 * @param {Function} [trackFn]
 */
export async function emitPriceAlertEmailTestAnalytics(supabase, input = {}, trackFn) {
  const tracker = trackFn || trackPriceAlertEmailTestAnalyticsEvent;
  try {
    return await tracker(supabase, input);
  } catch (err) {
    console.warn("[MIA PriceAlert Test Analytics] emit guard:", {
      event: input.eventName,
      message: String(err?.message || "emit_guard").slice(0, 120),
    });
    return { ok: false, code: "analytics_emit_guard", error: "emit_guard" };
  }
}

/**
 * @param {{
 *   eventName: string,
 *   context?: Record<string, unknown>,
 * }} input
 */
export function buildPriceAlertEmailE2eAnalyticsPayload(input = {}) {
  const context = input.context || {};
  const productName = String(context.productName || "").trim() || null;

  const metadata = sanitizeMetadataValue({
    controlled_test: true,
    not_market_real: true,
    mode: context.mode || "controlled-e2e",
    flow: "price_alert_e2e",
    reason: context.reason ?? null,
    blocked_by: context.blockedBy ?? null,
    error_code: context.errorCode ?? null,
    resend_result_id: context.resendResultId ?? null,
    template_rendered: context.templateRendered ?? null,
    offer_store: context.offerStore ?? null,
    offer_price: context.offerPrice ?? null,
    offer_url: context.offerUrl ?? null,
  });

  return {
    event_name: input.eventName,
    session_id: null,
    user_id: null,
    category: MIA_PRICE_ALERT_E2E_ANALYTICS_CATEGORY,
    product_name: productName,
    product_brand: null,
    product_id: null,
    query_text: null,
    recommendation_name: productName,
    offer_store: context.offerStore ?? null,
    offer_price: context.offerPrice ?? null,
    offer_url: context.offerUrl ?? null,
    metadata,
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {{
 *   eventName: string,
 *   context?: Record<string, unknown>,
 * }} input
 */
export async function trackPriceAlertEmailE2eAnalyticsEvent(supabase, input = {}) {
  if (!input.eventName) {
    return { ok: false, code: "missing_event_name" };
  }

  if (!supabase) {
    return { ok: false, code: "missing_supabase_client" };
  }

  try {
    const payload = buildPriceAlertEmailE2eAnalyticsPayload(input);
    const { error } = await supabase.from("analytics_events").insert(payload);

    if (error) {
      console.warn("[MIA PriceAlert E2E Analytics] insert failed:", {
        event: payload.event_name,
        code: String(error.code || "insert_error").slice(0, 80),
      });
      return {
        ok: false,
        code: "analytics_insert_failed",
        error: String(error.message || "insert_failed").slice(0, 160),
      };
    }

    return { ok: true, event_name: payload.event_name };
  } catch (err) {
    console.warn("[MIA PriceAlert E2E Analytics] unexpected error:", {
      event: input.eventName,
      message: String(err?.message || "unknown_error").slice(0, 120),
    });
    return {
      ok: false,
      code: "analytics_internal_error",
      error: String(err?.message || "unknown_error").slice(0, 160),
    };
  }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {Parameters<typeof trackPriceAlertEmailE2eAnalyticsEvent>[1]} input
 * @param {Function} [trackFn]
 */
export async function emitPriceAlertEmailE2eAnalytics(supabase, input = {}, trackFn) {
  const tracker = trackFn || trackPriceAlertEmailE2eAnalyticsEvent;
  try {
    return await tracker(supabase, input);
  } catch (err) {
    console.warn("[MIA PriceAlert E2E Analytics] emit guard:", {
      event: input.eventName,
      message: String(err?.message || "emit_guard").slice(0, 120),
    });
    return { ok: false, code: "analytics_emit_guard", error: "emit_guard" };
  }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {{
 *   eventName: string,
 *   alert?: Record<string, unknown>,
 *   evaluation?: Record<string, unknown>,
 *   context?: Record<string, unknown>,
 * }} input
 */
export async function trackPriceAlertEmailAnalyticsEvent(supabase, input = {}) {
  if (!input.eventName) {
    return { ok: false, code: "missing_event_name" };
  }

  if (!supabase) {
    return { ok: false, code: "missing_supabase_client" };
  }

  try {
    const payload = buildPriceAlertEmailAnalyticsPayload(input);
    const { error } = await supabase.from("analytics_events").insert(payload);

    if (error) {
      console.warn("[MIA PriceAlert Analytics] insert failed:", {
        event: payload.event_name,
        code: String(error.code || "insert_error").slice(0, 80),
      });
      return {
        ok: false,
        code: "analytics_insert_failed",
        error: String(error.message || "insert_failed").slice(0, 160),
      };
    }

    return { ok: true, event_name: payload.event_name };
  } catch (err) {
    console.warn("[MIA PriceAlert Analytics] unexpected error:", {
      event: input.eventName,
      message: String(err?.message || "unknown_error").slice(0, 120),
    });
    return {
      ok: false,
      code: "analytics_internal_error",
      error: String(err?.message || "unknown_error").slice(0, 160),
    };
  }
}

/**
 * Side-effect não bloqueante — nunca propaga exception.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {Parameters<typeof trackPriceAlertEmailAnalyticsEvent>[1]} input
 * @param {Function} [trackFn]
 */
export async function emitPriceAlertEmailAnalytics(supabase, input = {}, trackFn) {
  const tracker = trackFn || trackPriceAlertEmailAnalyticsEvent;
  try {
    return await tracker(supabase, input);
  } catch (err) {
    console.warn("[MIA PriceAlert Analytics] emit guard:", {
      event: input.eventName,
      message: String(err?.message || "emit_guard").slice(0, 120),
    });
    return { ok: false, code: "analytics_emit_guard", error: "emit_guard" };
  }
}
