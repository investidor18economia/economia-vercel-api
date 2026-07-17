/**
 * SERVER-ONLY — DO NOT IMPORT FROM CLIENT COMPONENTS
 *
 * PATCH Comercial 05J.5 — Mercado Livre OAuth token persistence (Vault consumer)
 */

import { COMMERCIAL_PROVIDER_IDS } from "../productSourceAdapter/commercialProviderRegistry.js";
import { refreshMercadoLivreOAuthToken } from "../productSourceAdapter/adapters/mercadoLivreOAuth.js";
import { ensureActiveProviderOAuthAccessToken } from "../server/providerOAuthRefreshEngine.js";
import {
  PROVIDER_CREDENTIAL_TYPE_OAUTH_TOKENS,
  PROVIDER_CREDENTIAL_READINESS,
  assertProviderCredentialVaultReadiness,
  getProviderCredentialMetadata,
  persistProviderCredentials,
  readProviderCredentials,
  revokeProviderCredentials,
  sanitizeProviderCredentialDiagnostics,
  validateProviderCredentialVaultConfig,
} from "../server/providerCredentialVault.js";
import { resolveMercadoLivreOAuthVaultEnvironment } from "./mercadolivreOAuthCredentialEnvironment.js";

export const MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_VERSION = "05J.9";
export const MERCADOLIVRE_OAUTH_CREDENTIAL_TYPE = PROVIDER_CREDENTIAL_TYPE_OAUTH_TOKENS;
export const MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_ENABLED_ENV =
  "MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_ENABLED";

export const MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_STATUS = Object.freeze({
  NOT_CONFIGURED: "not_configured",
  CONFIGURED: "configured",
  PERSISTED: "persisted",
  FAILED: "failed",
});

function cleanText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeMercadoLivreAccessToken(raw = "") {
  let token = cleanText(raw);
  if (/^Bearer\s+/i.test(token)) {
    token = token.replace(/^Bearer\s+/i, "").trim();
  }
  return token;
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
export function isMercadoLivreOAuthTokenPersistenceEnabled(env = process.env) {
  return (
    cleanText(env?.[MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_ENABLED_ENV]).toLowerCase() === "true"
  );
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
export function isMercadoLivreOAuthTokenPersistenceConfigured(env = process.env) {
  return isMercadoLivreOAuthTokenPersistenceEnabled(env) && validateProviderCredentialVaultConfig(env).ok;
}

/**
 * @param {Record<string, unknown>} [input]
 */
export async function persistMercadoLivreOAuthTokens(input = {}) {
  const env = input.env || process.env;
  const token = input.token && typeof input.token === "object" ? input.token : {};
  const nowMs = Number.isFinite(input.nowMs) ? input.nowMs : Date.now();

  if (!isMercadoLivreOAuthTokenPersistenceEnabled(env)) {
    return sanitizeProviderCredentialDiagnostics({
      ok: false,
      status: MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_STATUS.NOT_CONFIGURED,
      persisted: false,
      wroteFile: false,
      wroteDatabase: false,
      updatedEnv: false,
      reasonCode: "token_persistence_not_configured",
      message:
        "Authorization completed, but tokens were not persisted. Configure secure persistence before repeating OAuth.",
      accessTokenReceived: !!token.access_token,
      refreshTokenReceived: !!token.refresh_token,
      expiresInReceived: token.expires_in != null,
      tokenTypeReceived: !!token.token_type,
    });
  }

  const vaultReadiness = assertProviderCredentialVaultReadiness({
    env,
    store: input.store,
  });
  if (!vaultReadiness.ok) {
    return sanitizeProviderCredentialDiagnostics({
      ok: false,
      status: MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_STATUS.FAILED,
      persisted: false,
      wroteFile: false,
      wroteDatabase: false,
      updatedEnv: false,
      reasonCode: vaultReadiness.reasonCode || "token_persistence_configuration_invalid",
      message:
        "Authorization completed, but secure persistence is misconfigured. Fix vault configuration before repeating OAuth.",
      accessTokenReceived: !!token.access_token,
      refreshTokenReceived: !!token.refresh_token,
      expiresInReceived: token.expires_in != null,
      tokenTypeReceived: !!token.token_type,
    });
  }

  const expiresInSeconds = Number.parseInt(String(token.expires_in ?? ""), 10);
  const issuedAt = new Date(nowMs).toISOString();
  const expiresAt =
    Number.isFinite(expiresInSeconds) && expiresInSeconds > 0
      ? new Date(nowMs + expiresInSeconds * 1000).toISOString()
      : null;

  try {
    const result = await persistProviderCredentials({
      env,
      store: input.store,
      nowMs,
      providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
      environment: resolveMercadoLivreOAuthVaultEnvironment(env),
      credentialType: MERCADOLIVRE_OAUTH_CREDENTIAL_TYPE,
      credentials: {
        accessToken: cleanText(token.access_token),
        refreshToken: cleanText(token.refresh_token),
        tokenType: cleanText(token.token_type) || "Bearer",
      },
      issuedAt,
      expiresAt,
      scopes: input.scopes || null,
      providerAccountId: input.providerAccountId || null,
      source: cleanText(input.source) || "mercadolivre_oauth_callback",
    });

    if (!result.ok) {
      return sanitizeProviderCredentialDiagnostics({
        ok: false,
        status: MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_STATUS.FAILED,
        persisted: false,
        wroteFile: false,
        wroteDatabase: false,
        updatedEnv: false,
        reasonCode: result.reasonCode || "token_persistence_failed",
        message: "Authorization succeeded but secure persistence failed. Repeat OAuth after fixing storage.",
        accessTokenReceived: !!token.access_token,
        refreshTokenReceived: !!token.refresh_token,
        expiresInReceived: token.expires_in != null,
        tokenTypeReceived: !!token.token_type,
      });
    }

    return sanitizeProviderCredentialDiagnostics({
      ok: true,
      status: MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_STATUS.PERSISTED,
      persisted: true,
      wroteFile: false,
      wroteDatabase: true,
      updatedEnv: false,
      reasonCode: null,
      message: "OAuth credentials stored securely.",
      providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
      environment: resolveMercadoLivreOAuthVaultEnvironment(env),
      credentialVersion: result.credentialVersion,
      keyVersion: result.keyVersion,
      issuedAt: result.issuedAt,
      expiresAt: result.expiresAt,
      accessTokenReceived: !!token.access_token,
      refreshTokenReceived: !!token.refresh_token,
      expiresInReceived: token.expires_in != null,
      tokenTypeReceived: !!token.token_type,
    });
  } catch {
    return sanitizeProviderCredentialDiagnostics({
      ok: false,
      status: MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_STATUS.FAILED,
      persisted: false,
      wroteFile: false,
      wroteDatabase: false,
      updatedEnv: false,
      reasonCode: "token_persistence_failed",
      message: "Authorization succeeded but secure persistence failed. Repeat OAuth after fixing storage.",
      accessTokenReceived: !!token.access_token,
      refreshTokenReceived: !!token.refresh_token,
      expiresInReceived: token.expires_in != null,
      tokenTypeReceived: !!token.token_type,
    });
  }
}

/**
 * @param {Record<string, unknown>} [input]
 */
export async function readMercadoLivreOAuthTokens(input = {}) {
  const env = input.env || process.env;
  return readProviderCredentials({
    env,
    store: input.store,
    nowMs: input.nowMs,
    providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
    environment: resolveMercadoLivreOAuthVaultEnvironment(env),
    credentialType: MERCADOLIVRE_OAUTH_CREDENTIAL_TYPE,
  });
}

/**
 * Provider-specific OAuth refresh handler — HTTP only, no vault logic.
 *
 * @param {Record<string, unknown>} [input]
 */
export async function mercadoLivreOAuthRefreshHandler(input = {}) {
  const result = await refreshMercadoLivreOAuthToken(input.refreshToken, {
    env: input.env,
    fetcher: input.fetcher,
    signal: input.signal,
  });

  if (!result.ok) {
    return {
      ok: false,
      reasonCode: result.reasonCode || "unknown_refresh_failure",
      httpStatus: result.httpStatus ?? null,
    };
  }

  return {
    ok: true,
    reasonCode: null,
    token: result.token,
  };
}

/**
 * Server-only runtime token resolution for Mercado Livre HTTP consumers.
 * Vault-first when persistence is configured; automatic refresh when needed.
 *
 * @param {Record<string, unknown>} [input]
 */
export async function resolveMercadoLivreRuntimeAccessToken(input = {}) {
  const env = input.env || process.env;

  if (!isMercadoLivreOAuthTokenPersistenceEnabled(env)) {
    return {
      ok: false,
      accessToken: "",
      tokenType: "Bearer",
      source: "vault",
      readiness: PROVIDER_CREDENTIAL_READINESS.CONFIGURATION_MISSING,
      reasonCode: "vault_unavailable",
      expiresAt: null,
      credentialVersion: null,
    };
  }

  if (!validateProviderCredentialVaultConfig(env).ok) {
    return {
      ok: false,
      accessToken: "",
      tokenType: "Bearer",
      source: "vault",
      readiness: PROVIDER_CREDENTIAL_READINESS.CONFIGURATION_MISSING,
      reasonCode: "vault_unavailable",
      expiresAt: null,
      credentialVersion: null,
    };
  }

  try {
    const ensured = await ensureActiveProviderOAuthAccessToken({
      env,
      store: input.store,
      nowMs: input.nowMs,
      fetcher: input.fetcher,
      providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
      environment: resolveMercadoLivreOAuthVaultEnvironment(env),
      credentialType: MERCADOLIVRE_OAUTH_CREDENTIAL_TYPE,
      refreshHandler: mercadoLivreOAuthRefreshHandler,
      source: "mercadolivre_oauth_refresh",
    });

    return {
      ok: ensured.ok,
      accessToken: ensured.accessToken || "",
      tokenType: ensured.tokenType || "Bearer",
      source: "vault",
      readiness: ensured.readiness,
      reasonCode: ensured.ok
        ? null
        : ensured.reasonCode || "credential_missing",
      expiresAt: ensured.expiresAt ?? null,
      credentialVersion: ensured.credentialVersion ?? null,
      refreshDiagnostics: ensured.refreshDiagnostics || null,
    };
  } catch {
    return {
      ok: false,
      accessToken: "",
      tokenType: "Bearer",
      source: "vault",
      readiness: PROVIDER_CREDENTIAL_READINESS.CONFIGURATION_MISSING,
      reasonCode: "vault_unavailable",
      expiresAt: null,
      credentialVersion: null,
      refreshDiagnostics: sanitizeProviderCredentialDiagnostics({
        refreshAttempted: true,
        refreshReasonCode: "vault_read_failed",
      }),
    };
  }
}

/**
 * @param {Record<string, unknown>} [input]
 */
export async function resolveMercadoLivreAccessTokenSource(input = {}) {
  const env = input.env || process.env;

  if (!isMercadoLivreOAuthTokenPersistenceConfigured(env)) {
    return sanitizeProviderCredentialDiagnostics({
      ok: false,
      source: "vault",
      readiness: PROVIDER_CREDENTIAL_READINESS.CONFIGURATION_MISSING,
      envFallbackActive: false,
      reasonCode: "vault_unavailable",
    });
  }

  const vaultRead = await readMercadoLivreOAuthTokens(input);
  if (vaultRead.ok && vaultRead.credentials?.accessToken) {
    return sanitizeProviderCredentialDiagnostics({
      ok: true,
      source: "vault",
      readiness: vaultRead.readiness,
      envFallbackActive: false,
      expiresAt: vaultRead.expiresAt,
      credentialVersion: vaultRead.credentialVersion,
    });
  }

  return sanitizeProviderCredentialDiagnostics({
    ok: false,
    source: "vault",
    readiness: vaultRead.readiness || PROVIDER_CREDENTIAL_READINESS.MISSING,
    envFallbackActive: false,
    reasonCode: vaultRead.reasonCode || "credential_missing",
    expiresAt: vaultRead.expiresAt ?? null,
    credentialVersion: vaultRead.credentialVersion ?? null,
  });
}

/**
 * @param {Record<string, unknown>} [input]
 */
export async function revokeMercadoLivreOAuthTokens(input = {}) {
  const env = input.env || process.env;
  return revokeProviderCredentials({
    env,
    store: input.store,
    nowMs: input.nowMs,
    providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
    environment: resolveMercadoLivreOAuthVaultEnvironment(env),
    credentialType: MERCADOLIVRE_OAUTH_CREDENTIAL_TYPE,
  });
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
export function buildMercadoLivreOAuthPersistenceDiagnostics(env = process.env) {
  const configured = isMercadoLivreOAuthTokenPersistenceConfigured(env);
  return sanitizeProviderCredentialDiagnostics({
    version: MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_VERSION,
    configured,
    status: configured
      ? MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_STATUS.CONFIGURED
      : MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_STATUS.NOT_CONFIGURED,
    environment: resolveMercadoLivreOAuthVaultEnvironment(env),
    providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
    writesEnv: false,
    writesRepositoryFiles: false,
    writesDatabase: configured,
    exposesTokensToClient: false,
    vaultOnlyCredentialSource: true,
  });
}

/**
 * @param {Record<string, unknown>} [input]
 */
export async function buildMercadoLivreOAuthCredentialStatusDiagnostics(input = {}) {
  const env = input.env || process.env;
  const metadata = await getProviderCredentialMetadata({
    env,
    store: input.store,
    nowMs: input.nowMs,
    providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
    environment: resolveMercadoLivreOAuthVaultEnvironment(env),
    credentialType: MERCADOLIVRE_OAUTH_CREDENTIAL_TYPE,
  });
  return sanitizeProviderCredentialDiagnostics(metadata);
}
