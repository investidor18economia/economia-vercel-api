/**
 * PATCH 4 — Real Send Gate + Anti-Spam Lock
 *
 * Envio real de alertas elegíveis com múltiplas travas.
 * Reaproveita dry run; não cria cron; não envia por padrão.
 */

import { sendPriceDropEmail } from "./email.js";
import {
  PRICE_DROP_EMAIL_ANALYTICS_EVENTS,
  emitPriceAlertEmailAnalytics,
} from "./miaPriceAlertEmailAnalytics.js";
import {
  PRICE_ALERT_DELIVERY_EVENTS,
  emitPriceAlertDeliveryLog,
  resolveDeliverySeverity,
} from "./miaPriceAlertDeliveryLogs.js";
import { parseNumericPrice } from "./productSourceAdapter/normalizeProduct.js";
import {
  buildSafePriceAlertAuditUpdate,
  clampDryRunLimit,
  evaluatePriceAlertDryRun,
  isValidAlertUserEmail,
  isValidTrustedOfferUrl,
  loadActivePriceAlerts,
  validateMiaAdminApiKey,
} from "./miaPriceAlertDryRun.js";

export const MIA_PRICE_ALERT_SEND_GATE_VERSION = "4.1.0";
export const MIA_PRICE_ALERT_SEND_DEFAULT_LIMIT = 5;
export const MIA_PRICE_ALERT_SEND_MAX_LIMIT = 10;
export const MIA_PRICE_ALERT_MAX_EMAIL_SEND_COUNT = 3;
export const MIA_PRICE_ALERT_SEND_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const BLOCKED_URL_HOSTS = new Set(["example.com", "www.example.com"]);

export function parseBooleanSendFlag(value, defaultValue = false) {
  if (value == null || value === "") return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

export function isSendEnvEnabled() {
  return String(process.env.MIA_PRICE_DROP_EMAIL_SEND_ENABLED || "")
    .trim()
    .toLowerCase() === "true";
}

export function hasResendApiKey() {
  return !!String(process.env.RESEND_API_KEY || "").trim();
}

export function clampSendLimit(value) {
  const parsed = Number.parseInt(String(value ?? MIA_PRICE_ALERT_SEND_DEFAULT_LIMIT), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return MIA_PRICE_ALERT_SEND_DEFAULT_LIMIT;
  }
  return Math.min(parsed, MIA_PRICE_ALERT_SEND_MAX_LIMIT);
}

export function isBlockedPlaceholderUrl(url = "") {
  const raw = String(url || "").trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return BLOCKED_URL_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * @param {Record<string, unknown>} req
 */
export function extractSendRequestFlags(req = {}) {
  const querySource =
    req.method === "POST" ? { ...(req.query || {}), ...(req.body || {}) } : req.query || {};
  return {
    send: parseBooleanSendFlag(querySource.send, false),
    confirmSend: parseBooleanSendFlag(
      querySource.confirm_send ?? querySource.confirmSend,
      false
    ),
  };
}

/**
 * Valida autorização completa para envio real.
 * @param {Record<string, unknown>} req
 */
export function validateSendAuthorization(req = {}) {
  const auth = validateMiaAdminApiKey(req);
  if (!auth.ok) return auth;

  const flags = extractSendRequestFlags(req);

  if (!flags.send) {
    return {
      ok: false,
      status: 403,
      code: "send_not_requested",
      error: "Parâmetro send=true obrigatório para envio real",
    };
  }

  if (!flags.confirmSend) {
    return {
      ok: false,
      status: 403,
      code: "confirm_send_not_requested",
      error: "Parâmetro confirm_send=true obrigatório para envio real",
    };
  }

  if (!isSendEnvEnabled()) {
    return {
      ok: false,
      status: 503,
      code: "send_disabled",
      error: "MIA_PRICE_DROP_EMAIL_SEND_ENABLED não está true",
    };
  }

  if (!hasResendApiKey()) {
    return {
      ok: false,
      status: 503,
      code: "missing_resend_api_key",
      error: "RESEND_API_KEY não configurada",
    };
  }

  return { ok: true };
}

/**
 * @param {Record<string, unknown>} alert
 * @param {Record<string, unknown>} evaluation
 */
export function resolveSendEmailProductName(alert = {}, evaluation = {}) {
  const fromOffer = String(evaluation.best_found_product_name || "").trim();
  if (fromOffer) return fromOffer;
  return String(alert.product_name || "").trim();
}

/**
 * @param {Record<string, unknown>} alert
 * @param {Record<string, unknown>} evaluation
 */
export function resolveSendEmailOldPrice(alert = {}, evaluation = {}) {
  const lastChecked = parseNumericPrice(alert.last_checked_price);
  if (lastChecked != null && lastChecked > 0) return lastChecked;

  const current = parseNumericPrice(alert.current_price);
  if (current != null && current > 0) return current;

  const target = parseNumericPrice(alert.target_price);
  if (target != null && target > 0) return target;

  const best = parseNumericPrice(evaluation.best_found_price);
  if (best != null && best > 0) return best;

  return null;
}

/**
 * @param {Record<string, unknown>} alert
 * @param {Record<string, unknown>} evaluation
 */
export function evaluateAntiSpamRules(alert = {}, evaluation = {}) {
  if (evaluation.eligible_for_email !== true) {
    return { ok: false, reason: evaluation.reason || "not_eligible" };
  }

  const sendCount = Number.parseInt(String(alert.email_send_count ?? "0"), 10) || 0;
  if (sendCount >= MIA_PRICE_ALERT_MAX_EMAIL_SEND_COUNT) {
    return { ok: false, reason: "send_limit_reached" };
  }

  const lastSentAt = alert.last_alert_sent_at;
  if (lastSentAt) {
    const sentMs = new Date(String(lastSentAt)).getTime();
    if (Number.isFinite(sentMs) && Date.now() - sentMs < MIA_PRICE_ALERT_SEND_COOLDOWN_MS) {
      return { ok: false, reason: "recent_email_sent" };
    }
  }

  const lastSentPrice = parseNumericPrice(alert.last_alert_sent_price);
  const bestPrice = parseNumericPrice(evaluation.best_found_price);
  if (lastSentPrice != null && bestPrice != null && bestPrice >= lastSentPrice) {
    return { ok: false, reason: "not_better_than_last_sent" };
  }

  const url = String(evaluation.best_found_url || "").trim();
  if (!url) {
    return { ok: false, reason: "invalid_best_url" };
  }

  if (!isValidTrustedOfferUrl(url)) {
    return { ok: false, reason: "invalid_best_url" };
  }

  if (isBlockedPlaceholderUrl(url)) {
    return { ok: false, reason: "blocked_placeholder_url" };
  }

  if (!String(evaluation.best_found_source || "").trim()) {
    return { ok: false, reason: "missing_best_source" };
  }

  const productName = resolveSendEmailProductName(alert, evaluation);
  if (!productName) {
    return { ok: false, reason: "empty_product_name" };
  }

  if (!isValidAlertUserEmail(alert.user_email)) {
    return { ok: false, reason: "missing_or_invalid_user_email" };
  }

  return { ok: true, reason: evaluation.reason || "eligible" };
}

/**
 * @param {Record<string, unknown>} alert
 * @param {Record<string, unknown>} evaluation
 */
export function buildSendSkippedAuditUpdate(alert = {}, evaluation = {}) {
  return buildSafePriceAlertAuditUpdate(alert, {
    ...evaluation,
    eligible_for_email: false,
    reason: evaluation.reason || "skipped",
  });
}

/**
 * @param {Record<string, unknown>} alert
 * @param {Record<string, unknown>} evaluation
 */
export function buildSendSuccessUpdate(alert = {}, evaluation = {}) {
  const audit = buildSafePriceAlertAuditUpdate(alert, evaluation);

  return {
    last_checked_at: audit.last_checked_at,
    last_checked_price: audit.last_checked_price,
    last_found_price: audit.last_found_price,
    last_found_url: audit.last_found_url,
    last_found_source: audit.last_found_source,
    check_count: audit.check_count,
    last_alert_sent_at: new Date().toISOString(),
    last_alert_sent_price: evaluation.best_found_price ?? null,
    last_alert_sent_url: evaluation.best_found_url ?? null,
    last_alert_status: "sent",
    last_alert_error: null,
    email_send_count:
      (Number.parseInt(String(alert.email_send_count ?? "0"), 10) || 0) + 1,
  };
}

/**
 * @param {Record<string, unknown>} sendResult
 */
export function buildSendFailureUpdate(sendResult = {}) {
  const code = String(sendResult.code || sendResult.error || "send_failed").slice(0, 200);
  return {
    last_alert_status: "send_failed",
    last_alert_error: code,
  };
}

/**
 * @param {{
 *   supabase: import("@supabase/supabase-js").SupabaseClient,
 *   limit?: number,
 *   alertId?: string|null,
 *   alertLimit?: number,
 *   debug?: boolean,
 *   fetchPipeline?: Function,
 *   sendEmail?: Function,
 *   updateOnSkip?: boolean,
 *   analytics?: boolean,
 *   trackAnalytics?: Function,
 *   deliveryLogs?: boolean,
 *   deliveryLogSource?: string,
 *   recordDeliveryLog?: Function,
 * }} options
 */
export async function runPriceAlertsSend(options = {}) {
  const updateOnSkip = options.updateOnSkip !== false;
  const analyticsEnabled = options.analytics !== false;

  async function trackEmailAnalytics(input) {
    if (!analyticsEnabled) return;
    await emitPriceAlertEmailAnalytics(options.supabase, input, options.trackAnalytics);
  }

  async function logDelivery(event) {
    if (options.deliveryLogs === false || !options.supabase) return;
    await emitPriceAlertDeliveryLog(
      options.supabase,
      {
        mode: "send",
        source: options.deliveryLogSource || "send_gate",
        severity: resolveDeliverySeverity(event.eventType),
        ...event,
      },
      { recordFn: options.recordDeliveryLog, enabled: options.deliveryLogs !== false }
    );
  }

  function baseDeliveryFields(alert, evaluation) {
    return {
      alertId: alert.id,
      userId: alert.user_id,
      productName: alert.product_name,
      normalizedProductKey: alert.normalized_product_key,
      targetPrice: evaluation.target_price,
      foundPrice: evaluation.best_found_price,
      foundSource: evaluation.best_found_source,
      foundUrl: evaluation.best_found_url,
      reason: evaluation.reason,
      errorCode: evaluation.error_code,
    };
  }

  const resolvedLimit =
    options.alertLimit != null
      ? clampDryRunLimit(options.alertLimit)
      : clampSendLimit(options.limit);

  const loaded = await loadActivePriceAlerts(options.supabase, {
    limit: resolvedLimit,
    alertId: options.alertId,
  });

  if (!loaded.ok) {
    return {
      ok: false,
      dry_run: false,
      send_mode: true,
      code: loaded.code,
      error: loaded.error,
      version: MIA_PRICE_ALERT_SEND_GATE_VERSION,
      summary: {
        total_alerts_checked: 0,
        eligible_count: 0,
        sent_count: 0,
        skipped_count: 0,
        failed_count: 0,
        dry_run: false,
        send_mode: true,
      },
      results: [],
    };
  }

  const sendFn = options.sendEmail || sendPriceDropEmail;
  const results = [];
  let eligibleCount = 0;
  let sentCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const alert of loaded.alerts) {
    try {
      const evaluation = await evaluatePriceAlertDryRun(alert, {
        fetchPipeline: options.fetchPipeline,
        providerLimit: options.providerLimit,
        debug: options.debug,
        dryRun: false,
      });

      const antiSpam = evaluateAntiSpamRules(alert, evaluation);
      const eligibleForEmail = evaluation.eligible_for_email === true && antiSpam.ok;

      await logDelivery({
        ...baseDeliveryFields(alert, evaluation),
        eventType: PRICE_ALERT_DELIVERY_EVENTS.SEND_GATE_ALERT_CHECKED,
        metadata: {
          eligible_for_email: evaluation.eligible_for_email,
          anti_spam_ok: antiSpam.ok,
        },
      });

      const result = {
        alert_id: alert.id ?? null,
        product_name: alert.product_name ?? null,
        target_price: evaluation.target_price ?? null,
        best_found_price: evaluation.best_found_price ?? null,
        best_found_source: evaluation.best_found_source ?? null,
        best_found_url: evaluation.best_found_url ?? null,
        eligible_for_email: eligibleForEmail,
        email_sent: false,
        skipped: false,
        reason: eligibleForEmail ? evaluation.reason : antiSpam.reason || evaluation.reason,
        resend_result_id: null,
        updated: false,
      };

      if (!eligibleForEmail) {
        skippedCount += 1;
        result.skipped = true;

        await logDelivery({
          ...baseDeliveryFields(alert, evaluation),
          eventType:
            evaluation.eligible_for_email === true && antiSpam.ok === false
              ? PRICE_ALERT_DELIVERY_EVENTS.SEND_GATE_ANTISPAM_BLOCKED
              : PRICE_ALERT_DELIVERY_EVENTS.SEND_GATE_EMAIL_SKIPPED,
          reason: result.reason,
          errorCode: result.reason,
        });

        await trackEmailAnalytics({
          eventName: PRICE_DROP_EMAIL_ANALYTICS_EVENTS.SKIPPED,
          alert,
          evaluation,
          context: {
            reason: result.reason,
            blockedBy: result.reason,
            sendMode: true,
          },
        });

        if (updateOnSkip) {
          const skipPatch = buildSendSkippedAuditUpdate(alert, {
            ...evaluation,
            reason: result.reason,
            eligible_for_email: false,
          });
          const { error: updateError } = await options.supabase
            .from("price_alerts")
            .update(skipPatch)
            .eq("id", alert.id);

          if (!updateError) {
            result.updated = true;
          }
        }

        results.push(result);
        continue;
      }

      eligibleCount += 1;

      const productName = resolveSendEmailProductName(alert, evaluation);
      const oldPrice = resolveSendEmailOldPrice(alert, evaluation);

      await logDelivery({
        ...baseDeliveryFields(alert, evaluation),
        eventType: PRICE_ALERT_DELIVERY_EVENTS.SEND_GATE_EMAIL_ATTEMPTED,
      });

      await trackEmailAnalytics({
        eventName: PRICE_DROP_EMAIL_ANALYTICS_EVENTS.ATTEMPTED,
        alert,
        evaluation,
        context: {
          reason: evaluation.reason,
          sendMode: true,
        },
      });

      const sendResult = await sendFn(
        alert.user_email,
        productName,
        oldPrice,
        evaluation.best_found_price,
        evaluation.best_found_url
      );

      if (sendResult?.ok === true) {
        const successPatch = buildSendSuccessUpdate(alert, evaluation);
        const { error: updateError } = await options.supabase
          .from("price_alerts")
          .update(successPatch)
          .eq("id", alert.id);

        result.email_sent = true;
        result.resend_result_id = sendResult.id || null;
        result.updated = !updateError;
        sentCount += 1;

        await logDelivery({
          ...baseDeliveryFields(alert, evaluation),
          eventType: PRICE_ALERT_DELIVERY_EVENTS.SEND_GATE_EMAIL_SENT,
          emailSent: true,
          resendResultId: sendResult.id || null,
        });

        await trackEmailAnalytics({
          eventName: PRICE_DROP_EMAIL_ANALYTICS_EVENTS.SENT,
          alert,
          evaluation,
          context: {
            reason: evaluation.reason,
            resendResultId: sendResult.id || null,
            sendMode: true,
          },
        });

        if (updateError) {
          await trackEmailAnalytics({
            eventName: PRICE_DROP_EMAIL_ANALYTICS_EVENTS.FAILED,
            alert,
            evaluation,
            context: {
              reason: "post_send_update_failed",
              errorCode: "post_send_update_failed",
              resendResultId: sendResult.id || null,
              sendMode: true,
            },
          });
        }
      } else {
        const failurePatch = buildSendFailureUpdate(sendResult || {});
        const { error: updateError } = await options.supabase
          .from("price_alerts")
          .update(failurePatch)
          .eq("id", alert.id);

        result.skipped = false;
        result.reason = sendResult?.code || sendResult?.error || "send_failed";
        result.updated = !updateError;
        failedCount += 1;

        await logDelivery({
          ...baseDeliveryFields(alert, evaluation),
          eventType: PRICE_ALERT_DELIVERY_EVENTS.SEND_GATE_EMAIL_FAILED,
          reason: result.reason,
          errorCode: result.reason,
          errorMessage: sendResult?.error || null,
        });

        await trackEmailAnalytics({
          eventName: PRICE_DROP_EMAIL_ANALYTICS_EVENTS.FAILED,
          alert,
          evaluation,
          context: {
            reason: result.reason,
            errorCode: result.reason,
            sendMode: true,
          },
        });
      }

      if (options.debug && evaluation.debug) {
        result.debug = evaluation.debug;
      }

      results.push(result);
    } catch (err) {
      failedCount += 1;
      const errorCode = String(err?.message || "send_evaluation_error").slice(0, 120);

      await logDelivery({
        alertId: alert.id,
        userId: alert.user_id,
        productName: alert.product_name,
        eventType: PRICE_ALERT_DELIVERY_EVENTS.SEND_GATE_EMAIL_FAILED,
        reason: "send_evaluation_error",
        errorCode,
        errorMessage: errorCode,
      });

      await trackEmailAnalytics({
        eventName: PRICE_DROP_EMAIL_ANALYTICS_EVENTS.FAILED,
        alert,
        evaluation: {
          target_price: parseNumericPrice(alert.target_price),
        },
        context: {
          reason: "send_evaluation_error",
          errorCode,
          sendMode: true,
        },
      });

      results.push({
        alert_id: alert.id ?? null,
        product_name: alert.product_name ?? null,
        target_price: parseNumericPrice(alert.target_price),
        best_found_price: null,
        best_found_source: null,
        best_found_url: null,
        eligible_for_email: false,
        email_sent: false,
        skipped: false,
        reason: "send_evaluation_error",
        resend_result_id: null,
        updated: false,
        error_code: errorCode,
      });
    }
  }

  return {
    ok: true,
    dry_run: false,
    send_mode: true,
    version: MIA_PRICE_ALERT_SEND_GATE_VERSION,
    summary: {
      total_alerts_checked: results.length,
      eligible_count: eligibleCount,
      sent_count: sentCount,
      skipped_count: skippedCount,
      failed_count: failedCount,
      dry_run: false,
      send_mode: true,
    },
    results,
  };
}
