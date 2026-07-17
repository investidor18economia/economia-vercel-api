/**
 * SERVER-ONLY — DO NOT IMPORT FROM CLIENT COMPONENTS
 *
 * PATCH Comercial 05J.7 — Provider OAuth Automatic Refresh Engine
 *
 * Provider-agnostic OAuth refresh with in-process concurrency lock.
 * Lock map coordinates in-flight refresh only — never caches plaintext tokens.
 */

import {
  PROVIDER_CREDENTIAL_READINESS,
  persistProviderCredentials,
  readProviderCredentials,
  readProviderCredentialPayload,
  shouldRefreshProviderOAuthCredential,
} from "./providerCredentialVault.js";
import { sanitizeProviderCredentialDiagnostics } from "./providerCredentialSanitization.js";

export const PROVIDER_OAUTH_REFRESH_ENGINE_VERSION = "05J.7";

export const PROVIDER_OAUTH_REFRESH_REASON_CODES = Object.freeze({
  REFRESH_TOKEN_INVALID: "refresh_token_invalid",
  REFRESH_TOKEN_REVOKED: "refresh_token_revoked",
  REFRESH_HTTP_ERROR: "refresh_http_error",
  REFRESH_TIMEOUT: "refresh_timeout",
  REFRESH_PROVIDER_ERROR: "refresh_provider_error",
  CREDENTIAL_EXPIRED: "credential_expired",
  CREDENTIAL_MISSING: "credential_missing",
  VAULT_WRITE_FAILED: "vault_write_failed",
  VAULT_READ_FAILED: "vault_read_failed",
  UNKNOWN_REFRESH_FAILURE: "unknown_refresh_failure",
});

export const PROVIDER_OAUTH_REFRESH_TIMEOUT_MS_ENV = "PROVIDER_OAUTH_REFRESH_TIMEOUT_MS";

const DEFAULT_REFRESH_TIMEOUT_MS = 10_000;

/** In-flight refresh coordination only — not a token cache. */
const inFlightRefreshOperations = new Map();

function cleanText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function buildRefreshLockKey(input = {}) {
  return [
    cleanText(input.providerId).toLowerCase(),
    cleanText(input.environment).toLowerCase(),
    cleanText(input.credentialType).toLowerCase(),
  ].join("|");
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
export function readProviderOAuthRefreshConfig(env = process.env) {
  return {
    refreshTimeoutMs: parsePositiveInt(
      env?.[PROVIDER_OAUTH_REFRESH_TIMEOUT_MS_ENV],
      DEFAULT_REFRESH_TIMEOUT_MS
    ),
  };
}

/**
 * @param {string} lockKey
 * @param {() => Promise<unknown>} executor
 */
async function withProviderOAuthRefreshLock(lockKey, executor) {
  const existing = inFlightRefreshOperations.get(lockKey);
  if (existing) {
    return existing;
  }

  const operation = (async () => {
    try {
      return await executor();
    } finally {
      inFlightRefreshOperations.delete(lockKey);
    }
  })();

  inFlightRefreshOperations.set(lockKey, operation);
  return operation;
}

function buildRefreshDiagnostics(input = {}) {
  return sanitizeProviderCredentialDiagnostics({
    refreshAttempted: input.refreshAttempted === true,
    refreshSucceeded: input.refreshSucceeded === true,
    refreshReasonCode: input.refreshReasonCode || null,
    refreshOperation: input.refreshOperation || null,
    credentialVersion: input.credentialVersion ?? null,
    expiresAt: input.expiresAt ?? null,
    readiness: input.readiness || null,
  });
}

function mapPersistFailureReason(reasonCode = "") {
  const normalized = cleanText(reasonCode);
  if (normalized === "credential_store_write_failed") {
    return PROVIDER_OAUTH_REFRESH_REASON_CODES.VAULT_WRITE_FAILED;
  }
  return PROVIDER_OAUTH_REFRESH_REASON_CODES.UNKNOWN_REFRESH_FAILURE;
}

/**
 * Provider-agnostic OAuth refresh orchestration.
 *
 * @param {Record<string, unknown>} [input]
 */
export async function ensureActiveProviderOAuthAccessToken(input = {}) {
  const env = input.env || process.env;
  const nowMs = Number.isFinite(input.nowMs) ? input.nowMs : Date.now();
  const providerId = cleanText(input.providerId);
  const environment = cleanText(input.environment);
  const credentialType = cleanText(input.credentialType);
  const refreshHandler = typeof input.refreshHandler === "function" ? input.refreshHandler : null;

  const baseInput = {
    env,
    store: input.store,
    nowMs,
    providerId,
    environment,
    credentialType,
  };

  let activeRead;
  try {
    activeRead = await readProviderCredentials(baseInput);
  } catch {
    return {
      ok: false,
      accessToken: "",
      tokenType: "Bearer",
      readiness: PROVIDER_CREDENTIAL_READINESS.CONFIGURATION_MISSING,
      reasonCode: PROVIDER_OAUTH_REFRESH_REASON_CODES.VAULT_READ_FAILED,
      expiresAt: null,
      credentialVersion: null,
      refreshDiagnostics: buildRefreshDiagnostics({
        refreshAttempted: false,
        refreshReasonCode: PROVIDER_OAUTH_REFRESH_REASON_CODES.VAULT_READ_FAILED,
      }),
    };
  }

  const needsRefresh =
    refreshHandler &&
    activeRead.ok &&
    activeRead.credentials?.accessToken &&
    shouldRefreshProviderOAuthCredential(
      {
        expires_at: activeRead.expiresAt,
        status: "active",
      },
      nowMs,
      env
    );

  if (activeRead.ok && activeRead.credentials?.accessToken && !needsRefresh) {
    return {
      ok: true,
      accessToken: cleanText(activeRead.credentials.accessToken),
      tokenType: cleanText(activeRead.credentials.tokenType) || "Bearer",
      readiness: activeRead.readiness,
      reasonCode: null,
      expiresAt: activeRead.expiresAt ?? null,
      credentialVersion: activeRead.credentialVersion ?? null,
      refreshDiagnostics: buildRefreshDiagnostics({
        refreshAttempted: false,
        refreshSucceeded: false,
        readiness: activeRead.readiness,
        credentialVersion: activeRead.credentialVersion,
        expiresAt: activeRead.expiresAt,
      }),
    };
  }

  if (!refreshHandler) {
    if (activeRead.ok && activeRead.credentials?.accessToken) {
      return {
        ok: true,
        accessToken: cleanText(activeRead.credentials.accessToken),
        tokenType: cleanText(activeRead.credentials.tokenType) || "Bearer",
        readiness: activeRead.readiness,
        reasonCode: null,
        expiresAt: activeRead.expiresAt ?? null,
        credentialVersion: activeRead.credentialVersion ?? null,
        refreshDiagnostics: buildRefreshDiagnostics({
          refreshAttempted: false,
          readiness: activeRead.readiness,
        }),
      };
    }

    return {
      ok: false,
      accessToken: "",
      tokenType: "Bearer",
      readiness: activeRead.readiness || PROVIDER_CREDENTIAL_READINESS.MISSING,
      reasonCode: activeRead.reasonCode || PROVIDER_OAUTH_REFRESH_REASON_CODES.CREDENTIAL_MISSING,
      expiresAt: activeRead.expiresAt ?? null,
      credentialVersion: activeRead.credentialVersion ?? null,
      refreshDiagnostics: buildRefreshDiagnostics({
        refreshAttempted: false,
        refreshReasonCode: activeRead.reasonCode || PROVIDER_OAUTH_REFRESH_REASON_CODES.CREDENTIAL_MISSING,
        readiness: activeRead.readiness,
      }),
    };
  }

  const lockKey = buildRefreshLockKey(baseInput);

  return withProviderOAuthRefreshLock(lockKey, async () => {
    let currentRead;
    try {
      currentRead = await readProviderCredentials(baseInput);
    } catch {
      return {
        ok: false,
        accessToken: "",
        tokenType: "Bearer",
        readiness: PROVIDER_CREDENTIAL_READINESS.CONFIGURATION_MISSING,
        reasonCode: PROVIDER_OAUTH_REFRESH_REASON_CODES.VAULT_READ_FAILED,
        expiresAt: null,
        credentialVersion: null,
        refreshDiagnostics: buildRefreshDiagnostics({
          refreshAttempted: true,
          refreshReasonCode: PROVIDER_OAUTH_REFRESH_REASON_CODES.VAULT_READ_FAILED,
        }),
      };
    }

    const stillNeedsRefresh =
      !currentRead.ok ||
      !currentRead.credentials?.accessToken ||
      shouldRefreshProviderOAuthCredential(
        {
          expires_at: currentRead.expiresAt,
          status: "active",
        },
        nowMs,
        env
      );

    if (currentRead.ok && currentRead.credentials?.accessToken && !stillNeedsRefresh) {
      return {
        ok: true,
        accessToken: cleanText(currentRead.credentials.accessToken),
        tokenType: cleanText(currentRead.credentials.tokenType) || "Bearer",
        readiness: currentRead.readiness,
        reasonCode: null,
        expiresAt: currentRead.expiresAt ?? null,
        credentialVersion: currentRead.credentialVersion ?? null,
        refreshDiagnostics: buildRefreshDiagnostics({
          refreshAttempted: true,
          refreshSucceeded: false,
          refreshOperation: "reuse_after_lock",
          readiness: currentRead.readiness,
          credentialVersion: currentRead.credentialVersion,
          expiresAt: currentRead.expiresAt,
        }),
      };
    }

    let payloadRead;
    try {
      payloadRead = await readProviderCredentialPayload(baseInput);
    } catch {
      return {
        ok: false,
        accessToken: "",
        tokenType: "Bearer",
        readiness: PROVIDER_CREDENTIAL_READINESS.CONFIGURATION_MISSING,
        reasonCode: PROVIDER_OAUTH_REFRESH_REASON_CODES.VAULT_READ_FAILED,
        expiresAt: currentRead.expiresAt ?? null,
        credentialVersion: currentRead.credentialVersion ?? null,
        refreshDiagnostics: buildRefreshDiagnostics({
          refreshAttempted: true,
          refreshReasonCode: PROVIDER_OAUTH_REFRESH_REASON_CODES.VAULT_READ_FAILED,
        }),
      };
    }

    if (!payloadRead.ok || !payloadRead.credentials?.refreshToken) {
      const reasonCode =
        payloadRead.readiness === PROVIDER_CREDENTIAL_READINESS.EXPIRED
          ? PROVIDER_OAUTH_REFRESH_REASON_CODES.CREDENTIAL_EXPIRED
          : payloadRead.reasonCode === "credential_missing"
            ? PROVIDER_OAUTH_REFRESH_REASON_CODES.CREDENTIAL_MISSING
            : PROVIDER_OAUTH_REFRESH_REASON_CODES.REFRESH_TOKEN_INVALID;

      return {
        ok: false,
        accessToken: "",
        tokenType: "Bearer",
        readiness: payloadRead.readiness || PROVIDER_CREDENTIAL_READINESS.MISSING,
        reasonCode,
        expiresAt: payloadRead.expiresAt ?? null,
        credentialVersion: payloadRead.credentialVersion ?? null,
        refreshDiagnostics: buildRefreshDiagnostics({
          refreshAttempted: true,
          refreshReasonCode: reasonCode,
          readiness: payloadRead.readiness,
        }),
      };
    }

    const refreshConfig = readProviderOAuthRefreshConfig(env);
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = controller
      ? setTimeout(() => controller.abort(), refreshConfig.refreshTimeoutMs)
      : null;

    let refreshResult;
    try {
      refreshResult = await refreshHandler({
        env,
        fetcher: input.fetcher,
        nowMs,
        refreshToken: cleanText(payloadRead.credentials.refreshToken),
        signal: controller?.signal,
      });
    } catch (err) {
      const isTimeout =
        err?.name === "AbortError" || /aborted|timeout/i.test(String(err?.message || ""));
      return {
        ok: false,
        accessToken: "",
        tokenType: "Bearer",
        readiness: payloadRead.readiness || PROVIDER_CREDENTIAL_READINESS.EXPIRED,
        reasonCode: isTimeout
          ? PROVIDER_OAUTH_REFRESH_REASON_CODES.REFRESH_TIMEOUT
          : PROVIDER_OAUTH_REFRESH_REASON_CODES.REFRESH_PROVIDER_ERROR,
        expiresAt: payloadRead.expiresAt ?? null,
        credentialVersion: payloadRead.credentialVersion ?? null,
        refreshDiagnostics: buildRefreshDiagnostics({
          refreshAttempted: true,
          refreshReasonCode: isTimeout
            ? PROVIDER_OAUTH_REFRESH_REASON_CODES.REFRESH_TIMEOUT
            : PROVIDER_OAUTH_REFRESH_REASON_CODES.REFRESH_PROVIDER_ERROR,
        }),
      };
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    if (!refreshResult?.ok) {
      return {
        ok: false,
        accessToken: "",
        tokenType: "Bearer",
        readiness: payloadRead.readiness || PROVIDER_CREDENTIAL_READINESS.EXPIRED,
        reasonCode: refreshResult?.reasonCode || PROVIDER_OAUTH_REFRESH_REASON_CODES.UNKNOWN_REFRESH_FAILURE,
        expiresAt: payloadRead.expiresAt ?? null,
        credentialVersion: payloadRead.credentialVersion ?? null,
        refreshDiagnostics: buildRefreshDiagnostics({
          refreshAttempted: true,
          refreshReasonCode:
            refreshResult?.reasonCode || PROVIDER_OAUTH_REFRESH_REASON_CODES.UNKNOWN_REFRESH_FAILURE,
        }),
      };
    }

    const token = refreshResult.token && typeof refreshResult.token === "object" ? refreshResult.token : {};
    const accessToken = cleanText(token.access_token || token.accessToken);
    if (!accessToken) {
      return {
        ok: false,
        accessToken: "",
        tokenType: "Bearer",
        readiness: PROVIDER_CREDENTIAL_READINESS.EXPIRED,
        reasonCode: PROVIDER_OAUTH_REFRESH_REASON_CODES.UNKNOWN_REFRESH_FAILURE,
        expiresAt: payloadRead.expiresAt ?? null,
        credentialVersion: payloadRead.credentialVersion ?? null,
        refreshDiagnostics: buildRefreshDiagnostics({
          refreshAttempted: true,
          refreshReasonCode: PROVIDER_OAUTH_REFRESH_REASON_CODES.UNKNOWN_REFRESH_FAILURE,
        }),
      };
    }

    const refreshToken = cleanText(token.refresh_token || token.refreshToken) ||
      cleanText(payloadRead.credentials.refreshToken);
    const expiresInSeconds = Number.parseInt(String(token.expires_in ?? ""), 10);
    const issuedAt = new Date(nowMs).toISOString();
    const expiresAt =
      Number.isFinite(expiresInSeconds) && expiresInSeconds > 0
        ? new Date(nowMs + expiresInSeconds * 1000).toISOString()
        : null;

    let persisted;
    try {
      persisted = await persistProviderCredentials({
        env,
        store: input.store,
        nowMs,
        providerId,
        environment,
        credentialType,
        credentials: {
          accessToken,
          refreshToken,
          tokenType: cleanText(token.token_type || token.tokenType) || "Bearer",
        },
        issuedAt,
        expiresAt,
        source: cleanText(input.source) || "provider_oauth_refresh",
      });
    } catch {
      persisted = { ok: false, reasonCode: "credential_store_write_failed" };
    }

    if (!persisted.ok) {
      return {
        ok: false,
        accessToken: "",
        tokenType: "Bearer",
        readiness: PROVIDER_CREDENTIAL_READINESS.EXPIRED,
        reasonCode: mapPersistFailureReason(persisted.reasonCode),
        expiresAt: payloadRead.expiresAt ?? null,
        credentialVersion: payloadRead.credentialVersion ?? null,
        refreshDiagnostics: buildRefreshDiagnostics({
          refreshAttempted: true,
          refreshReasonCode: mapPersistFailureReason(persisted.reasonCode),
        }),
      };
    }

    return {
      ok: true,
      accessToken,
      tokenType: cleanText(token.token_type || token.tokenType) || "Bearer",
      readiness: PROVIDER_CREDENTIAL_READINESS.ACTIVE,
      reasonCode: null,
      expiresAt: persisted.expiresAt ?? expiresAt,
      credentialVersion: persisted.credentialVersion ?? null,
      refreshDiagnostics: buildRefreshDiagnostics({
        refreshAttempted: true,
        refreshSucceeded: true,
        refreshOperation: "refreshed",
        readiness: PROVIDER_CREDENTIAL_READINESS.ACTIVE,
        credentialVersion: persisted.credentialVersion,
        expiresAt: persisted.expiresAt ?? expiresAt,
      }),
    };
  });
}

/**
 * Test-only visibility into in-flight refresh lock state.
 */
export function getProviderOAuthRefreshLockCountForTests() {
  return inFlightRefreshOperations.size;
}

/**
 * Test-only reset for in-flight refresh lock state.
 */
export function resetProviderOAuthRefreshLocksForTests() {
  inFlightRefreshOperations.clear();
}
