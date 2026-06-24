/**
 * PATCH 3 — Manual Price Alert Check Dry Run
 *
 * Simula checagem de alertas sem enviar e-mail, sem Resend, sem cron.
 */

import { runCommercialShadowPipeline } from "./productSourceAdapter/commercialRuntimeShadow.js";
import { parseNumericPrice, cleanProductTitle } from "./productSourceAdapter/normalizeProduct.js";
import { normalizePriceAlertProductKey } from "./miaPriceAlertsSafety.js";
import {
  PRICE_ALERT_DELIVERY_EVENTS,
  emitPriceAlertDeliveryLog,
  resolveDeliverySeverity,
  resolveDryRunDeliveryEventType,
} from "./miaPriceAlertDeliveryLogs.js";

export const MIA_PRICE_ALERT_DRY_RUN_VERSION = "3.0.0";
export const MIA_PRICE_ALERT_DRY_RUN_DEFAULT_LIMIT = 10;
export const MIA_PRICE_ALERT_DRY_RUN_MAX_LIMIT = 25;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SAFE_AUDIT_UPDATE_FIELDS = Object.freeze([
  "last_checked_at",
  "last_checked_price",
  "last_found_price",
  "last_found_url",
  "last_found_source",
  "check_count",
  "last_alert_status",
  "last_alert_error",
]);

const FORBIDDEN_AUDIT_UPDATE_FIELDS = Object.freeze([
  "last_alert_sent_at",
  "last_alert_sent_price",
  "last_alert_sent_url",
  "email_send_count",
]);

export function isPatch2PriceAlertsSchemaError(error = null) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("normalized_product_key") ||
    message.includes("monitoring_scope") ||
    message.includes("last_found_price") ||
    (message.includes("column") && message.includes("does not exist")) ||
    (message.includes("column") && message.includes("não existe"))
  );
}

export function validateMiaAdminApiKey(req = {}) {
  const configured = String(process.env.MIA_ADMIN_API_KEY || "").trim();
  if (!configured) {
    return {
      ok: false,
      status: 503,
      code: "admin_key_not_configured",
      error: "MIA_ADMIN_API_KEY não configurada no ambiente",
    };
  }

  const provided = String(
    req.headers?.["x-mia-admin-key"] ||
      req.headers?.["x-admin-api-key"] ||
      req.query?.admin_key ||
      ""
  ).trim();

  if (!provided) {
    return {
      ok: false,
      status: 401,
      code: "missing_admin_key",
      error: "Chave administrativa ausente",
    };
  }

  if (provided !== configured) {
    return {
      ok: false,
      status: 401,
      code: "invalid_admin_key",
      error: "Chave administrativa inválida",
    };
  }

  return { ok: true };
}

export function clampDryRunLimit(value) {
  const parsed = Number.parseInt(String(value ?? MIA_PRICE_ALERT_DRY_RUN_DEFAULT_LIMIT), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return MIA_PRICE_ALERT_DRY_RUN_DEFAULT_LIMIT;
  }
  return Math.min(parsed, MIA_PRICE_ALERT_DRY_RUN_MAX_LIMIT);
}

export function isValidAlertUserEmail(email = "") {
  const normalized = String(email || "").trim().toLowerCase();
  return !!normalized && EMAIL_REGEX.test(normalized);
}

export function isValidTrustedOfferUrl(url = "") {
  const raw = String(url || "").trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * @param {Record<string, unknown>} alert
 */
export function buildPriceAlertSearchQuery(alert = {}) {
  const productName = cleanProductTitle(alert.product_name || "");
  if (productName) return productName;

  const key = String(alert.normalized_product_key || "").trim();
  return key || "";
}

/**
 * @param {Record<string, unknown>|null} offer
 */
export function normalizeTrustedOfferResult(offer = null) {
  if (!offer) return null;

  const price = parseNumericPrice(offer.price);
  const url = String(offer.url || "").trim();
  const source = String(offer.source || offer.provider || "").trim();
  const title = cleanProductTitle(offer.title || offer.product_name || "");

  if (!title || price == null || price <= 0 || !isValidTrustedOfferUrl(url) || !source) {
    return null;
  }

  return {
    best_found_product_name: title,
    best_found_price: price,
    best_found_source: source,
    best_found_url: url,
  };
}

/**
 * @param {Record<string, unknown>} alert
 * @param {{
 *   bestFound?: Record<string, unknown>|null,
 *   providerError?: string|null,
 *   dryRun?: boolean,
 * }} context
 */
export function evaluatePriceAlertEligibility(alert = {}, context = {}) {
  const dryRun = context.dryRun !== false;
  const targetPrice = parseNumericPrice(alert.target_price);
  const lastCheckedPrice = parseNumericPrice(alert.last_checked_price);
  const lastAlertSentPrice = parseNumericPrice(alert.last_alert_sent_price);
  const bestFound = context.bestFound || null;

  const base = {
    alert_id: alert.id ?? null,
    user_id: alert.user_id ?? null,
    product_name: alert.product_name ?? null,
    normalized_product_key:
      alert.normalized_product_key ||
      normalizePriceAlertProductKey(alert.product_name || ""),
    target_price: targetPrice,
    original_source: alert.original_source || alert.source || null,
    original_product_url: alert.original_product_url || alert.product_url || null,
    last_checked_price: lastCheckedPrice,
    last_alert_sent_price: lastAlertSentPrice,
    best_found_product_name: bestFound?.best_found_product_name ?? null,
    best_found_price: bestFound?.best_found_price ?? null,
    best_found_source: bestFound?.best_found_source ?? null,
    best_found_url: bestFound?.best_found_url ?? null,
    eligible_for_email: false,
    would_send_email: false,
    dry_run: dryRun,
    reason: "unknown",
    error_code: context.providerError || null,
  };

  if (alert.is_active !== true) {
    return { ...base, reason: "alert_inactive" };
  }

  if (!isValidAlertUserEmail(alert.user_email)) {
    return { ...base, reason: "missing_or_invalid_user_email" };
  }

  if (targetPrice == null || targetPrice <= 0) {
    return { ...base, reason: "missing_or_invalid_target_price" };
  }

  if (context.providerError) {
    return { ...base, reason: "provider_error", error_code: context.providerError };
  }

  if (!bestFound) {
    return { ...base, reason: "no_trusted_offer_found" };
  }

  if (bestFound.best_found_price == null || bestFound.best_found_price <= 0) {
    return { ...base, reason: "invalid_best_price" };
  }

  if (!isValidTrustedOfferUrl(bestFound.best_found_url)) {
    return { ...base, reason: "invalid_best_url" };
  }

  if (!String(bestFound.best_found_source || "").trim()) {
    return { ...base, reason: "missing_best_source" };
  }

  if (bestFound.best_found_price > targetPrice) {
    return {
      ...base,
      reason: "price_above_target",
    };
  }

  const reason =
    bestFound.best_found_price === targetPrice
      ? "eligible_at_target"
      : "eligible_below_target";

  return {
    ...base,
    eligible_for_email: true,
    would_send_email: true,
    reason,
    error_code: null,
  };
}

/**
 * @param {Record<string, unknown>} alert
 * @param {{ limit?: number, fetchPipeline?: Function }} options
 */
export async function fetchTrustedBestOfferForAlert(alert = {}, options = {}) {
  const query = buildPriceAlertSearchQuery(alert);
  if (!query) {
    return {
      ok: false,
      query: "",
      bestFound: null,
      error: "empty_search_query",
      offerCount: 0,
    };
  }

  const fetchPipeline = options.fetchPipeline || runCommercialShadowPipeline;

  try {
    const pipelineResult = await fetchPipeline({
      query,
      limit: options.limit ?? 5,
      fetchGoogle: options.fetchGoogle,
      fetchApify: options.fetchApify,
    });

    const bestFound = normalizeTrustedOfferResult(pipelineResult.shadowOffer);

    if (!bestFound) {
      return {
        ok: false,
        query,
        bestFound: null,
        error: pipelineResult.error || "no_trusted_offer_found",
        offerCount: pipelineResult.offerCount ?? 0,
        diagnostics: pipelineResult.diagnostics || null,
      };
    }

    return {
      ok: true,
      query,
      bestFound,
      error: null,
      offerCount: pipelineResult.offerCount ?? 0,
      diagnostics: pipelineResult.diagnostics || null,
    };
  } catch (err) {
    return {
      ok: false,
      query,
      bestFound: null,
      error: String(err?.message || "provider_error").slice(0, 120),
      offerCount: 0,
    };
  }
}

/**
 * @param {Record<string, unknown>} alert
 * @param {Record<string, unknown>} evaluation
 */
export function buildSafePriceAlertAuditUpdate(alert = {}, evaluation = {}) {
  const patch = {
    last_checked_at: new Date().toISOString(),
    last_checked_price:
      evaluation.best_found_price ??
      parseNumericPrice(alert.last_checked_price) ??
      parseNumericPrice(alert.current_price),
    last_found_price: evaluation.best_found_price ?? null,
    last_found_url: evaluation.best_found_url ?? null,
    last_found_source: evaluation.best_found_source ?? null,
    check_count: (Number.parseInt(String(alert.check_count ?? "0"), 10) || 0) + 1,
    last_alert_status: evaluation.eligible_for_email
      ? "dry_run_eligible"
      : "dry_run_not_eligible",
    last_alert_error: evaluation.eligible_for_email
      ? null
      : evaluation.error_code || evaluation.reason || "dry_run_not_eligible",
  };

  for (const forbidden of FORBIDDEN_AUDIT_UPDATE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(patch, forbidden)) {
      delete patch[forbidden];
    }
  }

  return patch;
}

export function assertSafePriceAlertAuditPatch(patch = {}) {
  for (const forbidden of FORBIDDEN_AUDIT_UPDATE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(patch, forbidden)) {
      return { ok: false, code: "forbidden_send_field", field: forbidden };
    }
  }

  const keys = Object.keys(patch);
  for (const key of keys) {
    if (!SAFE_AUDIT_UPDATE_FIELDS.includes(key)) {
      return { ok: false, code: "unsafe_audit_field", field: key };
    }
  }

  return { ok: true };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ limit?: number, alertId?: string|null }} options
 */
export async function loadActivePriceAlerts(supabase, options = {}) {
  const limit = clampDryRunLimit(options.limit);
  let query = supabase
    .from("price_alerts")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (options.alertId) {
    query = query.eq("id", options.alertId);
  }

  const { data, error } = await query;

  if (error) {
    if (isPatch2PriceAlertsSchemaError(error)) {
      return {
        ok: false,
        code: "patch2_schema_required",
        error:
          "Campos do PATCH 2 ausentes em price_alerts. Execute docs/alerts/price-alerts-safety-fields.sql no Supabase.",
        alerts: [],
      };
    }
    return {
      ok: false,
      code: "load_alerts_failed",
      error: error.message,
      alerts: [],
    };
  }

  return {
    ok: true,
    alerts: Array.isArray(data) ? data : [],
  };
}

/**
 * @param {Record<string, unknown>} alert
 * @param {{
 *   fetchPipeline?: Function,
 *   providerLimit?: number,
 *   dryRun?: boolean,
 *   debug?: boolean,
 * }} options
 */
export async function evaluatePriceAlertDryRun(alert = {}, options = {}) {
  const offerResult = await fetchTrustedBestOfferForAlert(alert, {
    limit: options.providerLimit ?? 5,
    fetchPipeline: options.fetchPipeline,
    fetchGoogle: options.fetchGoogle,
    fetchApify: options.fetchApify,
  });

  const evaluation = evaluatePriceAlertEligibility(alert, {
    bestFound: offerResult.bestFound,
    providerError: offerResult.ok ? null : offerResult.error,
    dryRun: options.dryRun !== false,
  });

  const auditPatch = buildSafePriceAlertAuditUpdate(alert, evaluation);

  return {
    ...evaluation,
    search_query: offerResult.query,
    offer_count: offerResult.offerCount ?? 0,
    audit_patch: auditPatch,
    debug: options.debug
      ? {
          pipeline_error: offerResult.error,
          pipeline_diagnostics: offerResult.diagnostics || null,
        }
      : undefined,
  };
}

/**
 * @param {{
 *   supabase: import("@supabase/supabase-js").SupabaseClient,
 *   limit?: number,
 *   alertId?: string|null,
 *   update?: boolean,
 *   debug?: boolean,
 *   fetchPipeline?: Function,
 *   deliveryLogs?: boolean,
 *   deliveryLogSource?: string,
 *   recordDeliveryLog?: Function,
 * }} options
 */
export async function runPriceAlertsDryRun(options = {}) {
  const updateMode = options.update === true;

  async function logDelivery(event) {
    if (options.deliveryLogs === false || !options.supabase) return;
    await emitPriceAlertDeliveryLog(
      options.supabase,
      {
        mode: "dry_run",
        source: options.deliveryLogSource || "dry_run",
        severity: resolveDeliverySeverity(event.eventType),
        ...event,
      },
      { recordFn: options.recordDeliveryLog, enabled: options.deliveryLogs !== false }
    );
  }

  const loaded = await loadActivePriceAlerts(options.supabase, {
    limit: options.limit,
    alertId: options.alertId,
  });

  if (!loaded.ok) {
    return {
      ok: false,
      dry_run: true,
      update_mode: updateMode,
      code: loaded.code,
      error: loaded.error,
      summary: {
        total_alerts_checked: 0,
        eligible_count: 0,
        not_eligible_count: 0,
        errors_count: 1,
        update_mode: updateMode,
        dry_run: true,
      },
      results: [],
    };
  }

  await logDelivery({
    eventType: PRICE_ALERT_DELIVERY_EVENTS.DRY_RUN_STARTED,
    metadata: {
      alert_count: loaded.alerts.length,
      update_mode: updateMode,
    },
  });

  const results = [];
  let eligibleCount = 0;
  let notEligibleCount = 0;
  let errorsCount = 0;

  for (const alert of loaded.alerts) {
    try {
      const evaluation = await evaluatePriceAlertDryRun(alert, {
        fetchPipeline: options.fetchPipeline,
        providerLimit: options.providerLimit,
        debug: options.debug,
        dryRun: true,
      });

      if (evaluation.eligible_for_email) {
        eligibleCount += 1;
      } else {
        notEligibleCount += 1;
      }

      if (evaluation.reason === "provider_error") {
        errorsCount += 1;
      }

      await logDelivery({
        alertId: alert.id,
        userId: alert.user_id,
        eventType: resolveDryRunDeliveryEventType(evaluation),
        productName: alert.product_name,
        normalizedProductKey: alert.normalized_product_key,
        targetPrice: evaluation.target_price,
        foundPrice: evaluation.best_found_price,
        foundSource: evaluation.best_found_source,
        foundUrl: evaluation.best_found_url,
        reason: evaluation.reason,
        errorCode: evaluation.error_code,
        metadata: {
          eligible_for_email: evaluation.eligible_for_email,
          would_send_email: evaluation.would_send_email,
        },
      });

      let updateResult = null;
      if (updateMode) {
        const safeCheck = assertSafePriceAlertAuditPatch(evaluation.audit_patch);
        if (!safeCheck.ok) {
          errorsCount += 1;
          updateResult = {
            ok: false,
            code: safeCheck.code,
            field: safeCheck.field,
          };
        } else {
          const { error: updateError } = await options.supabase
            .from("price_alerts")
            .update(evaluation.audit_patch)
            .eq("id", alert.id);

          updateResult = updateError
            ? { ok: false, error: updateError.message }
            : { ok: true };
          if (updateError) errorsCount += 1;
        }
      }

      const { audit_patch, ...publicEvaluation } = evaluation;
      results.push({
        ...publicEvaluation,
        update_applied: updateMode && updateResult?.ok === true,
        update_result: updateMode ? updateResult : null,
      });
    } catch (err) {
      errorsCount += 1;
      results.push({
        alert_id: alert.id ?? null,
        user_id: alert.user_id ?? null,
        product_name: alert.product_name ?? null,
        eligible_for_email: false,
        would_send_email: false,
        dry_run: true,
        reason: "evaluation_error",
        error_code: String(err?.message || "evaluation_error").slice(0, 120),
      });
    }
  }

  await logDelivery({
    eventType: PRICE_ALERT_DELIVERY_EVENTS.DRY_RUN_COMPLETED,
    metadata: {
      total_alerts_checked: results.length,
      eligible_count: eligibleCount,
      not_eligible_count: notEligibleCount,
      errors_count: errorsCount,
    },
  });

  return {
    ok: true,
    dry_run: true,
    update_mode: updateMode,
    version: MIA_PRICE_ALERT_DRY_RUN_VERSION,
    summary: {
      total_alerts_checked: results.length,
      eligible_count: eligibleCount,
      not_eligible_count: notEligibleCount,
      errors_count: errorsCount,
      update_mode: updateMode,
      dry_run: true,
    },
    results,
  };
}
