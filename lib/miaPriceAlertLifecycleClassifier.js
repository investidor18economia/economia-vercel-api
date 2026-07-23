/**
 * PATCH 10.3 — Build price alert lifecycle metadata from existing functional data.
 */

import { parseNumericPrice } from "./productSourceAdapter/normalizeProduct.js";
import {
  MIA_ALERT_CHECK_FAILURE_REASON,
  MIA_ALERT_CREATION_FAILURE_REASON,
  MIA_ALERT_FAILURE_STAGE,
  MIA_ALERT_LIFECYCLE_STAGE,
  MIA_ALERT_OFFICIAL_CURRENCY,
  MIA_ALERT_SOURCE,
  MIA_ALERT_STATUS,
  MIA_ALERT_TARGET_REALISM,
  MIA_TARGET_AGGRESSIVE_MAX_PERCENT,
  MIA_TARGET_MODERATE_MAX_PERCENT,
  MIA_TARGET_NEAR_MAX_PERCENT,
} from "./miaPriceAlertLifecycleCatalog.js";

function num(value) {
  const n = parseNumericPrice(value);
  return n != null && Number.isFinite(n) ? n : null;
}

function roundMoney(value) {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function roundPercent(value) {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

/**
 * Infer alert source from create API input (no frontend change required).
 * @param {Record<string, unknown>} input
 */
export function resolveAlertSourceFromCreateInput(input = {}) {
  const current = num(input.current_price);
  const explicitTarget = num(input.target_price);
  const hasUrl = String(input.product_url || "").trim().length > 0;

  if (
    explicitTarget != null &&
    current != null &&
    Math.abs(explicitTarget - current) >= 0.01
  ) {
    return MIA_ALERT_SOURCE.PRICE_ALERT_PAGE;
  }
  if (hasUrl) return MIA_ALERT_SOURCE.OFFER_CARD;
  return MIA_ALERT_SOURCE.UNKNOWN;
}

/**
 * @param {number|null} currentPrice
 * @param {number|null} targetPrice
 */
export function resolveTargetRealism(currentPrice, targetPrice) {
  if (currentPrice == null || targetPrice == null || currentPrice <= 0) {
    return MIA_ALERT_TARGET_REALISM.UNKNOWN;
  }
  if (targetPrice >= currentPrice) {
    return targetPrice === currentPrice
      ? MIA_ALERT_TARGET_REALISM.TARGET_ALREADY_REACHED
      : MIA_ALERT_TARGET_REALISM.INVALID;
  }
  const deltaPercent = ((currentPrice - targetPrice) / currentPrice) * 100;
  if (deltaPercent <= MIA_TARGET_NEAR_MAX_PERCENT) return MIA_ALERT_TARGET_REALISM.TARGET_NEAR_CURRENT;
  if (deltaPercent <= MIA_TARGET_MODERATE_MAX_PERCENT) return MIA_ALERT_TARGET_REALISM.TARGET_MODERATE;
  if (deltaPercent <= MIA_TARGET_AGGRESSIVE_MAX_PERCENT) return MIA_ALERT_TARGET_REALISM.TARGET_AGGRESSIVE;
  return MIA_ALERT_TARGET_REALISM.TARGET_EXTREME;
}

/**
 * @param {number|null} currentPrice
 * @param {number|null} targetPrice
 */
export function computeTargetDelta(currentPrice, targetPrice) {
  if (currentPrice == null || targetPrice == null || currentPrice <= 0) {
    return { amount: null, percent: null };
  }
  const amount = roundMoney(currentPrice - targetPrice);
  const percent = roundPercent(((currentPrice - targetPrice) / currentPrice) * 100);
  return { amount, percent };
}

/**
 * Map dry-run / eligibility reason to check failure taxonomy when applicable.
 * @param {string|null} reason
 */
export function mapCheckFailureReason(reason = null) {
  const r = String(reason || "").toLowerCase();
  if (r.includes("provider")) return MIA_ALERT_CHECK_FAILURE_REASON.PROVIDER_UNAVAILABLE;
  if (r === "no_trusted_offer_found") return MIA_ALERT_CHECK_FAILURE_REASON.PRODUCT_NOT_FOUND;
  if (r.includes("invalid") && r.includes("price")) return MIA_ALERT_CHECK_FAILURE_REASON.INVALID_PRICE;
  if (r === "provider_error") return MIA_ALERT_CHECK_FAILURE_REASON.PROVIDER_UNAVAILABLE;
  return MIA_ALERT_CHECK_FAILURE_REASON.UNKNOWN;
}

/**
 * @param {{
 *   lifecycleStage: string,
 *   alertId?: string|null,
 *   userId?: string|null,
 *   sessionId?: string|null,
 *   requestId?: string|null,
 *   decisionRequestId?: string|null,
 *   alertSource?: string|null,
 *   alertStatus?: string|null,
 *   previousStatus?: string|null,
 *   newStatus?: string|null,
 *   currentPrice?: number|null,
 *   targetPrice?: number|null,
 *   observedPrice?: number|null,
 *   currency?: string|null,
 *   creationSuccess?: boolean|null,
 *   creationFailureReason?: string|null,
 *   checkSuccess?: boolean|null,
 *   checkFailureReason?: string|null,
 *   checkId?: string|null,
 *   checkSource?: string|null,
 *   checksUntilTarget?: number|null,
 *   targetReached?: boolean|null,
 *   notificationSuccess?: boolean|null,
 *   notificationFailureReason?: string|null,
 *   notificationAttempt?: number|null,
 *   notificationChannel?: string|null,
 *   notificationProvider?: string|null,
 *   failureStage?: string|null,
 *   failureReason?: string|null,
 *   retryable?: boolean|null,
 *   lifecycleOccurrenceKey?: string|null,
 *   normalizedProductKey?: string|null,
 *   providerId?: string|null,
 *   duplicateExisting?: boolean|null,
 *   controlledTest?: boolean,
 * }} input
 */
export function buildPriceAlertLifecycleMetadata(input = {}) {
  const currentPrice = input.currentPrice ?? null;
  const targetPrice = input.targetPrice ?? null;
  const observedPrice = input.observedPrice ?? null;
  const delta = computeTargetDelta(currentPrice, targetPrice);

  let potentialSavingsAmount = null;
  let potentialSavingsPercent = null;
  let savingsNature = null;

  if (currentPrice != null && targetPrice != null && targetPrice < currentPrice) {
    potentialSavingsAmount = delta.amount;
    potentialSavingsPercent = delta.percent;
    savingsNature = "ALERT_OPPORTUNITY";
  }

  if (input.targetReached === true && observedPrice != null && targetPrice != null) {
    potentialSavingsAmount = roundMoney(Math.max(0, currentPrice - observedPrice));
    if (currentPrice != null && currentPrice > 0 && observedPrice != null) {
      potentialSavingsPercent = roundPercent(((currentPrice - observedPrice) / currentPrice) * 100);
    }
    savingsNature = "ALERT_OPPORTUNITY";
  }

  return {
    event_version: "10.3.0",
    alert_id: input.alertId ?? null,
    request_id: input.requestId ?? null,
    decision_request_id: input.decisionRequestId ?? input.requestId ?? null,
    session_id: input.sessionId ?? null,
    user_id: input.userId ?? null,
    lifecycle_stage: input.lifecycleStage ?? MIA_ALERT_LIFECYCLE_STAGE.UNKNOWN,
    alert_status: input.alertStatus ?? MIA_ALERT_STATUS.UNKNOWN,
    previous_status: input.previousStatus ?? null,
    new_status: input.newStatus ?? null,
    alert_source: input.alertSource ?? MIA_ALERT_SOURCE.UNKNOWN,
    normalized_product_key: input.normalizedProductKey ?? null,
    current_price: currentPrice,
    target_price: targetPrice,
    observed_price: observedPrice,
    currency: input.currency ?? MIA_ALERT_OFFICIAL_CURRENCY,
    target_delta_amount: delta.amount,
    target_delta_percent: delta.percent,
    target_realism: resolveTargetRealism(currentPrice, targetPrice),
    target_reached: input.targetReached === true,
    checks_until_target: input.checksUntilTarget ?? null,
    check_success: input.checkSuccess ?? null,
    check_failure_reason: input.checkFailureReason ?? null,
    check_id: input.checkId ?? null,
    check_source: input.checkSource ?? null,
    creation_success: input.creationSuccess ?? null,
    creation_failure_reason: input.creationFailureReason ?? null,
    notification_success: input.notificationSuccess ?? null,
    notification_failure_reason: input.notificationFailureReason ?? null,
    notification_attempt: input.notificationAttempt ?? null,
    notification_channel: input.notificationChannel ?? "email",
    notification_provider: input.notificationProvider ?? "resend",
    failure_stage: input.failureStage ?? null,
    failure_reason: input.failureReason ?? null,
    retryable: input.retryable ?? null,
    lifecycle_occurrence_key: input.lifecycleOccurrenceKey ?? null,
    duplicate_existing: input.duplicateExisting === true,
    provider_id: input.providerId ?? null,
    potential_savings_amount: potentialSavingsAmount,
    potential_savings_percent: potentialSavingsPercent,
    savings_nature: savingsNature,
    savings_type: input.targetReached || savingsNature ? "OBSERVED" : null,
    purchase_confirmed: false,
    historical_baseline_available: false,
    transactional_evidence_available: false,
    source: "price_alert_pipeline",
    occurred_at: new Date().toISOString(),
  };
}

/**
 * @param {Record<string, unknown>} body
 * @param {{ userId?: string|null, sessionId?: string|null }} context
 */
export function buildRequestedLifecycleMetadata(body = {}, context = {}) {
  const currentPrice = num(body.current_price);
  const targetPrice = num(body.target_price);
  return buildPriceAlertLifecycleMetadata({
    lifecycleStage: MIA_ALERT_LIFECYCLE_STAGE.REQUESTED,
    alertStatus: MIA_ALERT_STATUS.PENDING,
    userId: context.userId ?? body.user_id ?? null,
    sessionId: context.sessionId ?? null,
    alertSource: resolveAlertSourceFromCreateInput(body),
    currentPrice,
    targetPrice,
    creationSuccess: null,
    lifecycleOccurrenceKey: context.requestAttemptId
      ? `request-${context.requestAttemptId}`
      : "request",
  });
}

/**
 * @param {Record<string, unknown>} alertRow
 * @param {Record<string, unknown>} body
 * @param {{ userId?: string|null, sessionId?: string|null, duplicate?: boolean }} context
 */
export function buildCreatedLifecycleMetadata(alertRow = {}, body = {}, context = {}) {
  const currentPrice = num(alertRow.current_price ?? body.current_price);
  const targetPrice = num(alertRow.target_price ?? body.target_price);
  return buildPriceAlertLifecycleMetadata({
    lifecycleStage: context.duplicate ? MIA_ALERT_LIFECYCLE_STAGE.CREATED : MIA_ALERT_LIFECYCLE_STAGE.CREATED,
    alertStatus: MIA_ALERT_STATUS.ACTIVE,
    alertId: alertRow.id ?? null,
    userId: alertRow.user_id ?? context.userId ?? null,
    sessionId: context.sessionId ?? null,
    alertSource: resolveAlertSourceFromCreateInput(body),
    normalizedProductKey: alertRow.normalized_product_key ?? null,
    currentPrice,
    targetPrice,
    creationSuccess: !context.duplicate,
    creationFailureReason: context.duplicate
      ? MIA_ALERT_CREATION_FAILURE_REASON.DUPLICATE_ALERT
      : null,
    duplicateExisting: context.duplicate === true,
    lifecycleOccurrenceKey: context.duplicate ? "duplicate" : "create",
  });
}

/**
 * @param {Record<string, unknown>} alertRow
 */
export function buildActiveLifecycleMetadata(alertRow = {}) {
  return buildPriceAlertLifecycleMetadata({
    lifecycleStage: MIA_ALERT_LIFECYCLE_STAGE.ACTIVE,
    alertStatus: MIA_ALERT_STATUS.ACTIVE,
    alertId: alertRow.id ?? null,
    userId: alertRow.user_id ?? null,
    alertSource: MIA_ALERT_SOURCE.UNKNOWN,
    normalizedProductKey: alertRow.normalized_product_key ?? null,
    currentPrice: num(alertRow.current_price),
    targetPrice: num(alertRow.target_price),
    creationSuccess: true,
    lifecycleOccurrenceKey: "active",
  });
}

/**
 * @param {Record<string, unknown>} alert
 * @param {Record<string, unknown>} evaluation
 * @param {{ checkSource?: string|null, dryRun?: boolean }} context
 */
export function buildCheckedLifecycleMetadata(alert = {}, evaluation = {}, context = {}) {
  const checkCount =
    (Number.parseInt(String(alert.check_count ?? "0"), 10) || 0) + 1;
  const checkSuccess = evaluation.reason !== "provider_error";
  return buildPriceAlertLifecycleMetadata({
    lifecycleStage: MIA_ALERT_LIFECYCLE_STAGE.CHECKED,
    alertStatus: MIA_ALERT_STATUS.ACTIVE,
    alertId: alert.id ?? evaluation.alert_id ?? null,
    userId: alert.user_id ?? evaluation.user_id ?? null,
    normalizedProductKey:
      alert.normalized_product_key ?? evaluation.normalized_product_key ?? null,
    currentPrice: num(alert.current_price),
    targetPrice: num(evaluation.target_price ?? alert.target_price),
    observedPrice: num(evaluation.best_found_price),
    providerId: evaluation.best_found_source ?? null,
    checkSuccess,
    checkFailureReason: checkSuccess
      ? null
      : mapCheckFailureReason(evaluation.reason || evaluation.error_code),
    checkSource: context.checkSource ?? (context.dryRun === false ? "send_gate" : "dry_run"),
    checkId: String(checkCount),
    lifecycleOccurrenceKey: `check-${checkCount}`,
  });
}

/**
 * @param {Record<string, unknown>} alert
 * @param {Record<string, unknown>} evaluation
 */
export function buildTargetReachedLifecycleMetadata(alert = {}, evaluation = {}) {
  const checkCount =
    Number.parseInt(String(alert.check_count ?? "0"), 10) || 0;
  const observed = num(evaluation.best_found_price);
  const target = num(evaluation.target_price ?? alert.target_price);
  return buildPriceAlertLifecycleMetadata({
    lifecycleStage: MIA_ALERT_LIFECYCLE_STAGE.TARGET_REACHED,
    alertStatus: MIA_ALERT_STATUS.ACTIVE,
    alertId: alert.id ?? evaluation.alert_id ?? null,
    userId: alert.user_id ?? evaluation.user_id ?? null,
    normalizedProductKey:
      alert.normalized_product_key ?? evaluation.normalized_product_key ?? null,
    currentPrice: num(alert.current_price),
    targetPrice: target,
    observedPrice: observed,
    providerId: evaluation.best_found_source ?? null,
    targetReached: true,
    checksUntilTarget: checkCount + 1,
    checkSuccess: true,
    lifecycleOccurrenceKey: `target-${checkCount + 1}`,
  });
}

/**
 * @param {Record<string, unknown>} alert
 * @param {Record<string, unknown>} evaluation
 * @param {{ stage: string, success?: boolean, failureReason?: string|null, attempt?: number|null }} context
 */
export function buildNotificationLifecycleMetadata(alert = {}, evaluation = {}, context = {}) {
  const attempt =
    context.attempt ??
    (Number.parseInt(String(alert.email_send_count ?? "0"), 10) || 0) + 1;
  return buildPriceAlertLifecycleMetadata({
    lifecycleStage: context.stage,
    alertStatus:
      context.stage === MIA_ALERT_LIFECYCLE_STAGE.NOTIFICATION_SENT
        ? MIA_ALERT_STATUS.COMPLETED
        : MIA_ALERT_STATUS.ACTIVE,
    alertId: alert.id ?? null,
    userId: alert.user_id ?? null,
    normalizedProductKey: alert.normalized_product_key ?? null,
    currentPrice: num(alert.current_price),
    targetPrice: num(evaluation.target_price ?? alert.target_price),
    observedPrice: num(evaluation.best_found_price),
    providerId: evaluation.best_found_source ?? null,
    targetReached: true,
    notificationSuccess: context.success ?? null,
    notificationFailureReason: context.failureReason ?? null,
    notificationAttempt: attempt,
    failureStage: context.success === false ? MIA_ALERT_FAILURE_STAGE.NOTIFICATION : null,
    failureReason: context.failureReason ?? null,
    lifecycleOccurrenceKey: `notification-${attempt}-${context.stage}`,
  });
}

/**
 * @param {{ stage?: string, failureStage?: string, failureReason?: string|null, userId?: string|null, sessionId?: string|null }} input
 */
export function buildFailedLifecycleMetadata(input = {}) {
  return buildPriceAlertLifecycleMetadata({
    lifecycleStage: MIA_ALERT_LIFECYCLE_STAGE.FAILED,
    alertStatus: MIA_ALERT_STATUS.FAILED,
    userId: input.userId ?? null,
    sessionId: input.sessionId ?? null,
    creationSuccess: false,
    failureStage: input.failureStage ?? MIA_ALERT_FAILURE_STAGE.UNKNOWN,
    failureReason: input.failureReason ?? MIA_ALERT_CREATION_FAILURE_REASON.UNKNOWN,
    lifecycleOccurrenceKey: `failed-${input.failureReason || "unknown"}`,
  });
}
