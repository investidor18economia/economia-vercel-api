/**
 * PATCH 8.2 — Provider attempt classification (observational only).
 */

import {
  MIA_PROVIDER_ATTEMPT_STATUSES,
  MIA_PROVIDER_FAILURE_CATEGORIES,
  MIA_PROVIDER_HTTP_STATUS_GROUPS,
  MIA_PROVIDER_RUNTIME_MODES,
  MIA_PROVIDER_SKIP_REASONS,
} from "./miaProviderAttemptCatalog.js";
import { COMMERCIAL_RUNTIME_MODES, getCommercialRuntimeMode } from "./productSourceAdapter/commercialRuntimeMode.js";

/**
 * @param {string} [mode]
 */
export function resolveProviderAnalyticsRuntimeMode(mode = null) {
  const raw = String(mode ?? getCommercialRuntimeMode())
    .trim()
    .toLowerCase();
  if (raw === COMMERCIAL_RUNTIME_MODES.LEGACY) return MIA_PROVIDER_RUNTIME_MODES.LEGACY;
  if (raw === COMMERCIAL_RUNTIME_MODES.CONTROLLED) return MIA_PROVIDER_RUNTIME_MODES.CONTROLLED;
  if (raw === COMMERCIAL_RUNTIME_MODES.SHADOW) return MIA_PROVIDER_RUNTIME_MODES.SHADOW;
  return MIA_PROVIDER_RUNTIME_MODES.UNKNOWN;
}

/**
 * @param {number|null|undefined} statusCode
 * @param {{ networkError?: boolean }} [hints]
 */
export function resolveHttpStatusGroup(statusCode, hints = {}) {
  if (hints.networkError) return MIA_PROVIDER_HTTP_STATUS_GROUPS.NETWORK;
  const code = Number(statusCode);
  if (!Number.isFinite(code) || code <= 0) return MIA_PROVIDER_HTTP_STATUS_GROUPS.NOT_APPLICABLE;
  if (code >= 200 && code < 300) return MIA_PROVIDER_HTTP_STATUS_GROUPS.XX2;
  if (code >= 300 && code < 400) return MIA_PROVIDER_HTTP_STATUS_GROUPS.XX3;
  if (code >= 400 && code < 500) return MIA_PROVIDER_HTTP_STATUS_GROUPS.XX4;
  if (code >= 500) return MIA_PROVIDER_HTTP_STATUS_GROUPS.XX5;
  return MIA_PROVIDER_HTTP_STATUS_GROUPS.UNKNOWN;
}

/**
 * @param {string} [errorCode]
 */
export function resolveFailureCategoryFromErrorCode(errorCode = "") {
  const code = String(errorCode || "").trim().toLowerCase();
  if (!code) return MIA_PROVIDER_FAILURE_CATEGORIES.NOT_APPLICABLE;
  if (code.includes("timeout") || code === "timed_out") {
    return MIA_PROVIDER_FAILURE_CATEGORIES.TIMEOUT;
  }
  if (code === "forbidden" || code.includes("403")) {
    return MIA_PROVIDER_FAILURE_CATEGORIES.AUTHORIZATION;
  }
  if (code.includes("auth") || code === "missing_credentials" || code === "unauthorized") {
    return MIA_PROVIDER_FAILURE_CATEGORIES.AUTHENTICATION;
  }
  if (code.includes("rate_limit") || code === "rate_limited" || code === "rate_limited_or_empty") {
    return MIA_PROVIDER_FAILURE_CATEGORIES.RATE_LIMIT;
  }
  if (code.includes("network") || code === "fetch_failed" || code === "connection_error") {
    return MIA_PROVIDER_FAILURE_CATEGORIES.NETWORK;
  }
  if (code.includes("parse") || code === "invalid_response") {
    return MIA_PROVIDER_FAILURE_CATEGORIES.PARSING;
  }
  if (code.includes("config") || code === "provider_disabled" || code === "provider_skipped") {
    return MIA_PROVIDER_FAILURE_CATEGORIES.CONFIGURATION;
  }
  if (code === "provider_error" || code.includes("provider")) {
    return MIA_PROVIDER_FAILURE_CATEGORIES.PROVIDER_RESPONSE;
  }
  return MIA_PROVIDER_FAILURE_CATEGORIES.UNKNOWN;
}

/**
 * @param {string} [blockedReason]
 * @param {string} [errorCode]
 */
export function resolveSkipReason(blockedReason = "", errorCode = "") {
  const reason = String(blockedReason || errorCode || "")
    .trim()
    .toLowerCase();
  if (!reason) return MIA_PROVIDER_SKIP_REASONS.NOT_APPLICABLE;
  if (reason.includes("disabled") || reason === "provider_disabled") {
    return MIA_PROVIDER_SKIP_REASONS.DISABLED;
  }
  if (reason.includes("credential") || reason.includes("missing_auth")) {
    return MIA_PROVIDER_SKIP_REASONS.MISSING_CREDENTIALS;
  }
  if (reason.includes("circuit") || reason.includes("budget")) {
    return MIA_PROVIDER_SKIP_REASONS.CIRCUIT_OPEN;
  }
  if (reason.includes("sufficient") || reason.includes("short_circuit") || reason.includes("prior_sufficient")) {
    return MIA_PROVIDER_SKIP_REASONS.SHORT_CIRCUIT;
  }
  if (reason.includes("data_layer")) {
    return MIA_PROVIDER_SKIP_REASONS.DATA_LAYER_RESOLVED;
  }
  if (reason.includes("not_eligible") || reason.includes("blocked")) {
    return MIA_PROVIDER_SKIP_REASONS.NOT_ELIGIBLE;
  }
  if (reason.includes("runtime")) {
    return MIA_PROVIDER_SKIP_REASONS.RUNTIME_RULE;
  }
  return MIA_PROVIDER_SKIP_REASONS.UNKNOWN;
}

/**
 * @param {{
 *   skipped?: boolean,
 *   ok?: boolean,
 *   resultCount?: number,
 *   error?: string|null,
 *   timedOut?: boolean,
 *   cancelled?: boolean,
 * }} input
 */
export function resolveProviderAttemptStatus(input = {}) {
  if (input.skipped) return MIA_PROVIDER_ATTEMPT_STATUSES.SKIPPED;
  if (input.cancelled) return MIA_PROVIDER_ATTEMPT_STATUSES.CANCELLED;
  if (input.timedOut) return MIA_PROVIDER_ATTEMPT_STATUSES.TIMEOUT;

  const error = String(input.error || "").trim().toLowerCase();
  if (error.includes("timeout") || error === "timed_out") {
    return MIA_PROVIDER_ATTEMPT_STATUSES.TIMEOUT;
  }

  const count = Math.max(0, Number(input.resultCount) || 0);
  if (input.ok === true && count > 0) return MIA_PROVIDER_ATTEMPT_STATUSES.SUCCESS;
  if (input.ok === true && count === 0) return MIA_PROVIDER_ATTEMPT_STATUSES.EMPTY;
  if (input.ok === false || error) return MIA_PROVIDER_ATTEMPT_STATUSES.FAILED;
  return MIA_PROVIDER_ATTEMPT_STATUSES.UNKNOWN;
}

/**
 * @param {string} attemptStatus
 * @param {string} [errorCode]
 * @param {{ timedOut?: boolean }} [hints]
 */
export function resolveFailureCategoryForAttempt(attemptStatus, errorCode = "", hints = {}) {
  if (
    attemptStatus === MIA_PROVIDER_ATTEMPT_STATUSES.SUCCESS ||
    attemptStatus === MIA_PROVIDER_ATTEMPT_STATUSES.EMPTY ||
    attemptStatus === MIA_PROVIDER_ATTEMPT_STATUSES.SKIPPED
  ) {
    return MIA_PROVIDER_FAILURE_CATEGORIES.NOT_APPLICABLE;
  }
  if (attemptStatus === MIA_PROVIDER_ATTEMPT_STATUSES.TIMEOUT || hints.timedOut) {
    return MIA_PROVIDER_FAILURE_CATEGORIES.TIMEOUT;
  }
  return resolveFailureCategoryFromErrorCode(errorCode);
}

/**
 * @param {string} attemptStatus
 * @param {number} [resultCount]
 */
export function resolveResponseUsable(attemptStatus, resultCount = 0) {
  if (attemptStatus !== MIA_PROVIDER_ATTEMPT_STATUSES.SUCCESS) return false;
  return Math.max(0, Number(resultCount) || 0) > 0;
}

/**
 * @param {string} attemptStatus
 * @param {number} [resultCount]
 */
export function resolveContributedResults(attemptStatus, resultCount = 0) {
  return (
    attemptStatus === MIA_PROVIDER_ATTEMPT_STATUSES.SUCCESS &&
    Math.max(0, Number(resultCount) || 0) > 0
  );
}
