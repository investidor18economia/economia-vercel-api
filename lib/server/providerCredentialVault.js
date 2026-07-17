/**
 * SERVER-ONLY — DO NOT IMPORT FROM CLIENT COMPONENTS
 *
 * PATCH Comercial 05J.5 — Provider Credential Vault
 */

import { getSupabaseAdminClient, isSupabaseServiceRoleConfiguredForEnv } from "../supabaseClient.js";
import {
  decryptProviderCredentialPayload,
  encryptProviderCredentialPayload,
  assertProviderCredentialEncryptionReadiness,
  validateProviderCredentialEncryptionConfig,
} from "./providerCredentialEncryption.js";
import {
  sanitizeProviderCredentialDiagnostics,
} from "./providerCredentialSanitization.js";

export { sanitizeProviderCredentialDiagnostics } from "./providerCredentialSanitization.js";

export const PROVIDER_CREDENTIAL_VAULT_VERSION = "05J.7";

/** Static marker — vault intentionally stores no decrypted token cache. */
export const PROVIDER_CREDENTIAL_VAULT_PLAINTEXT_CACHE_ENABLED = false;
export const PROVIDER_CREDENTIALS_TABLE = "provider_credentials";
export const PROVIDER_CREDENTIAL_TYPE_OAUTH_TOKENS = "oauth_tokens";

export const PROVIDER_CREDENTIAL_STATUS = Object.freeze({
  ACTIVE: "active",
  REVOKED: "revoked",
});

export const PROVIDER_CREDENTIAL_READINESS = Object.freeze({
  ACTIVE: "active",
  EXPIRING_SOON: "expiring_soon",
  EXPIRED: "expired",
  REVOKED: "revoked",
  MISSING: "missing",
  DECRYPT_FAILED: "decrypt_failed",
  CONFIGURATION_MISSING: "configuration_missing",
});

export const PROVIDER_CREDENTIAL_ENVIRONMENTS = Object.freeze([
  "production",
  "preview",
  "development",
  "test",
]);

const DEFAULT_EXPIRY_SKEW_SECONDS = 300;
const DEFAULT_EXPIRING_SOON_SECONDS = 3600;
const DEFAULT_OAUTH_REFRESH_WINDOW_SECONDS = 3600;

export const PROVIDER_OAUTH_REFRESH_WINDOW_SECONDS_ENV = "PROVIDER_OAUTH_REFRESH_WINDOW_SECONDS";

function cleanText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseTimestamp(value = "") {
  if (!value) return null;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
export function resolveProviderCredentialEnvironment(env = process.env) {
  const vercelEnv = cleanText(env.VERCEL_ENV).toLowerCase();
  if (vercelEnv === "production") return "production";
  if (vercelEnv === "preview") return "preview";
  if (vercelEnv === "development") return "development";
  if (cleanText(env.NODE_ENV).toLowerCase() === "test") return "test";
  if (cleanText(env.NODE_ENV).toLowerCase() === "production") return "production";
  return "development";
}

/**
 * @param {Record<string, string|undefined>} [env]
 * @param {Record<string, unknown>} [options]
 */
export function validateProviderCredentialVaultConfig(env = process.env, options = {}) {
  const encryption = validateProviderCredentialEncryptionConfig(env);
  if (!encryption.ok) {
    return {
      ok: false,
      reasonCode: encryption.reasonCode,
      encryptionConfigured: false,
      supabaseConfigured: false,
    };
  }

  const allowInMemoryStore = options.allowInMemoryStore === true;
  const supabaseConfigured = isSupabaseServiceRoleConfiguredForEnv(env);
  if (!allowInMemoryStore && !supabaseConfigured) {
    return {
      ok: false,
      reasonCode: "supabase_service_role_missing",
      encryptionConfigured: true,
      supabaseConfigured: false,
    };
  }

  return {
    ok: true,
    reasonCode: null,
    encryptionConfigured: true,
    supabaseConfigured: allowInMemoryStore || supabaseConfigured,
    keyVersion: encryption.keyVersion,
  };
}

function validateVaultRuntime(input = {}) {
  return assertProviderCredentialVaultReadiness(input);
}

/**
 * Fail-fast boundary for vault operations — sanitized output only.
 *
 * @param {Record<string, unknown>} [input]
 */
export function assertProviderCredentialVaultReadiness(input = {}) {
  const env = input.env || process.env;
  const encryption = assertProviderCredentialEncryptionReadiness(env);
  if (!encryption.ok) {
    return sanitizeProviderCredentialDiagnostics({
      ok: false,
      reasonCode: encryption.reasonCode,
      encryptionConfigured: false,
      supabaseConfigured: false,
      keyVersion: null,
    });
  }

  const allowInMemoryStore = !!input.store;
  const supabaseConfigured = isSupabaseServiceRoleConfiguredForEnv(env);
  if (!allowInMemoryStore && !supabaseConfigured) {
    return sanitizeProviderCredentialDiagnostics({
      ok: false,
      reasonCode: "supabase_service_role_missing",
      encryptionConfigured: true,
      supabaseConfigured: false,
      keyVersion: encryption.keyVersion,
    });
  }

  return sanitizeProviderCredentialDiagnostics({
    ok: true,
    reasonCode: null,
    encryptionConfigured: true,
    supabaseConfigured: allowInMemoryStore || supabaseConfigured,
    keyVersion: encryption.keyVersion,
  });
}

/**
 * @param {Record<string, unknown>} [record]
 * @param {number} [nowMs]
 * @param {Record<string, string|undefined>} [env]
 */
export function classifyProviderCredentialRecord(record = null, nowMs = Date.now(), env = process.env) {
  if (!record) {
    return {
      readiness: PROVIDER_CREDENTIAL_READINESS.MISSING,
      reasonCode: "credential_missing",
    };
  }

  if (cleanText(record.status) === PROVIDER_CREDENTIAL_STATUS.REVOKED) {
    return {
      readiness: PROVIDER_CREDENTIAL_READINESS.REVOKED,
      reasonCode: "credential_revoked",
    };
  }

  const skewSeconds = Number.parseInt(
    String(env.PROVIDER_CREDENTIAL_EXPIRY_SKEW_SECONDS || DEFAULT_EXPIRY_SKEW_SECONDS),
    10
  );
  const expiringSoonSeconds = Number.parseInt(
    String(env.PROVIDER_CREDENTIAL_EXPIRING_SOON_SECONDS || DEFAULT_EXPIRING_SOON_SECONDS),
    10
  );
  const expiresAtMs = parseTimestamp(record.expires_at);
  if (expiresAtMs && expiresAtMs + skewSeconds * 1000 <= nowMs) {
    return {
      readiness: PROVIDER_CREDENTIAL_READINESS.EXPIRED,
      reasonCode: "credential_expired",
    };
  }
  if (expiresAtMs && expiresAtMs - expiringSoonSeconds * 1000 <= nowMs) {
    return {
      readiness: PROVIDER_CREDENTIAL_READINESS.EXPIRING_SOON,
      reasonCode: "credential_expiring_soon",
    };
  }

  return {
    readiness: PROVIDER_CREDENTIAL_READINESS.ACTIVE,
    reasonCode: null,
  };
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
export function readProviderOAuthRefreshWindowSeconds(env = process.env) {
  const configured = Number.parseInt(
    String(env?.[PROVIDER_OAUTH_REFRESH_WINDOW_SECONDS_ENV] || ""),
    10
  );
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }

  const expiringSoon = Number.parseInt(
    String(env?.PROVIDER_CREDENTIAL_EXPIRING_SOON_SECONDS || DEFAULT_EXPIRING_SOON_SECONDS),
    10
  );
  return Number.isFinite(expiringSoon) && expiringSoon > 0
    ? expiringSoon
    : DEFAULT_OAUTH_REFRESH_WINDOW_SECONDS;
}

/**
 * @param {Record<string, unknown>|null} [record]
 * @param {number} [nowMs]
 * @param {Record<string, string|undefined>} [env]
 */
export function shouldRefreshProviderOAuthCredential(record = null, nowMs = Date.now(), env = process.env) {
  if (!record) return false;

  const classification = classifyProviderCredentialRecord(record, nowMs, env);
  if (classification.readiness === PROVIDER_CREDENTIAL_READINESS.EXPIRED) return true;
  if (classification.readiness === PROVIDER_CREDENTIAL_READINESS.EXPIRING_SOON) return true;

  const refreshWindowSeconds = readProviderOAuthRefreshWindowSeconds(env);
  const expiresAtMs = parseTimestamp(record.expires_at);
  if (expiresAtMs && expiresAtMs - refreshWindowSeconds * 1000 <= nowMs) {
    return true;
  }

  return false;
}

/**
 * Server-side decrypt for refresh orchestration.
 * Returns payload for active, expiring, or expired credentials — never for revoked/missing.
 *
 * @param {Record<string, unknown>} [input]
 */
export async function readProviderCredentialPayload(input = {}) {
  const env = input.env || process.env;
  const config = validateVaultRuntime(input);
  const providerId = cleanText(input.providerId);
  const environment = cleanText(input.environment);
  const credentialType = cleanText(input.credentialType);
  const nowMs = Number.isFinite(input.nowMs) ? input.nowMs : Date.now();

  if (!config.ok) {
    return sanitizeProviderCredentialDiagnostics({
      ok: false,
      reasonCode: config.reasonCode,
      readiness: PROVIDER_CREDENTIAL_READINESS.CONFIGURATION_MISSING,
      providerId,
      environment,
      credentialType,
      credentials: null,
    });
  }

  const store = input.store || createSupabaseCredentialStore(env);
  let record;
  try {
    record = await store.findOne({ providerId, environment, credentialType });
  } catch {
    return sanitizeProviderCredentialDiagnostics({
      ok: false,
      reasonCode: "credential_store_read_failed",
      readiness: PROVIDER_CREDENTIAL_READINESS.CONFIGURATION_MISSING,
      providerId,
      environment,
      credentialType,
      credentials: null,
    });
  }

  const classification = classifyProviderCredentialRecord(record, nowMs, env);

  if (classification.readiness === PROVIDER_CREDENTIAL_READINESS.MISSING) {
    return sanitizeProviderCredentialDiagnostics({
      ok: false,
      reasonCode: classification.reasonCode,
      readiness: classification.readiness,
      providerId,
      environment,
      credentialType,
      credentials: null,
    });
  }

  if (classification.readiness === PROVIDER_CREDENTIAL_READINESS.REVOKED) {
    return sanitizeProviderCredentialDiagnostics({
      ok: false,
      reasonCode: classification.reasonCode,
      readiness: classification.readiness,
      providerId,
      environment,
      credentialType,
      credentialVersion: record.credential_version,
      keyVersion: record.encryption_key_version,
      issuedAt: record.issued_at,
      expiresAt: record.expires_at,
      credentials: null,
    });
  }

  const decrypted = decryptProviderCredentialPayload({
    env,
    providerId,
    environment,
    credentialVersion: record.credential_version,
    encryptionKeyVersion: record.encryption_key_version,
    encryptedPayload: record.encrypted_payload,
    encryptionIv: record.encryption_iv,
    encryptionAuthTag: record.encryption_auth_tag,
  });

  if (!decrypted.ok) {
    return sanitizeProviderCredentialDiagnostics({
      ok: false,
      reasonCode: decrypted.reasonCode,
      readiness: PROVIDER_CREDENTIAL_READINESS.DECRYPT_FAILED,
      providerId,
      environment,
      credentialType,
      credentials: null,
    });
  }

  return {
    ok: true,
    reasonCode: null,
    readiness: classification.readiness,
    providerId,
    environment,
    credentialType,
    credentialVersion: record.credential_version,
    keyVersion: record.encryption_key_version,
    issuedAt: record.issued_at,
    expiresAt: record.expires_at,
    credentials: decrypted.payload,
  };
}

function createSupabaseCredentialStore(env = process.env) {
  const client = getSupabaseAdminClient();
  if (!client) {
    const error = new Error("supabase_service_role_missing");
    error.reasonCode = "supabase_service_role_missing";
    throw error;
  }
  return {
    async findOne({ providerId, environment, credentialType }) {
      const { data, error } = await client
        .from(PROVIDER_CREDENTIALS_TABLE)
        .select("*")
        .eq("provider_id", providerId)
        .eq("environment", environment)
        .eq("credential_type", credentialType)
        .maybeSingle();
      if (error) throw new Error("credential_store_read_failed");
      return data || null;
    },
    async upsert(record) {
      const { data, error } = await client
        .from(PROVIDER_CREDENTIALS_TABLE)
        .upsert(record, { onConflict: "provider_id,environment,credential_type" })
        .select("credential_version, encryption_key_version, issued_at, expires_at, status")
        .single();
      if (error) throw new Error("credential_store_write_failed");
      return data;
    },
    async updateStatus({ providerId, environment, credentialType, status, updatedAt }) {
      const { error } = await client
        .from(PROVIDER_CREDENTIALS_TABLE)
        .update({ status, updated_at: updatedAt })
        .eq("provider_id", providerId)
        .eq("environment", environment)
        .eq("credential_type", credentialType);
      if (error) throw new Error("credential_store_revoke_failed");
      return { ok: true };
    },
  };
}

/**
 * @param {Record<string, unknown>} [input]
 */
export async function persistProviderCredentials(input = {}) {
  const env = input.env || process.env;
  const config = validateVaultRuntime(input);
  if (!config.ok) {
    return sanitizeProviderCredentialDiagnostics({
      ok: false,
      persisted: false,
      reasonCode: config.reasonCode,
      providerId: cleanText(input.providerId),
      environment: cleanText(input.environment),
      credentialType: cleanText(input.credentialType),
      status: PROVIDER_CREDENTIAL_READINESS.CONFIGURATION_MISSING,
    });
  }

  const providerId = cleanText(input.providerId);
  const environment = cleanText(input.environment);
  const credentialType = cleanText(input.credentialType);
  const store = input.store || createSupabaseCredentialStore(env);
  const nowIso = new Date(Number.isFinite(input.nowMs) ? input.nowMs : Date.now()).toISOString();

  const existing = await store.findOne({ providerId, environment, credentialType });
  const credentialVersion = (Number.parseInt(String(existing?.credential_version || 0), 10) || 0) + 1;
  const keyVersion = config.keyVersion;

  const encrypted = encryptProviderCredentialPayload({
    env,
    providerId,
    environment,
    credentialVersion,
    keyVersion,
    payload: input.credentials || {},
  });

  if (!encrypted.ok) {
    return sanitizeProviderCredentialDiagnostics({
      ok: false,
      persisted: false,
      reasonCode: encrypted.reasonCode,
      providerId,
      environment,
      credentialType,
    });
  }

  const row = {
    provider_id: providerId,
    environment,
    credential_type: credentialType,
    encrypted_payload: encrypted.encryptedPayload,
    encryption_iv: encrypted.encryptionIv,
    encryption_auth_tag: encrypted.encryptionAuthTag,
    encryption_key_version: encrypted.encryptionKeyVersion,
    credential_version: credentialVersion,
    issued_at: input.issuedAt || nowIso,
    expires_at: input.expiresAt || null,
    scopes: input.scopes || null,
    provider_account_id: input.providerAccountId || null,
    status: PROVIDER_CREDENTIAL_STATUS.ACTIVE,
    updated_at: nowIso,
    created_at: existing?.created_at || nowIso,
  };

  const saved = await store.upsert(row);

  return sanitizeProviderCredentialDiagnostics({
    ok: true,
    persisted: true,
    providerId,
    environment,
    credentialType,
    credentialVersion: saved.credential_version,
    keyVersion: saved.encryption_key_version,
    issuedAt: saved.issued_at,
    expiresAt: saved.expires_at,
    status: saved.status,
    accessTokenReceived: !!input.credentials?.accessToken,
    refreshTokenReceived: !!input.credentials?.refreshToken,
    reasonCode: null,
  });
}

/**
 * Provider-agnostic runtime OAuth access token resolution.
 * Decrypt-on-demand only — no cache, no singleton, no module-level retention.
 * Returns accessToken only to authorized server-side callers in local scope.
 *
 * @param {Record<string, unknown>} [input]
 */
export async function resolveActiveProviderOAuthAccessToken(input = {}) {
  const result = await readProviderCredentials(input);
  if (!result.ok || !result.credentials?.accessToken) {
    return {
      ok: false,
      accessToken: "",
      tokenType: "Bearer",
      readiness: result.readiness || PROVIDER_CREDENTIAL_READINESS.MISSING,
      reasonCode: result.reasonCode || "access_token_missing",
      expiresAt: result.expiresAt ?? null,
      credentialVersion: result.credentialVersion ?? null,
    };
  }

  return {
    ok: true,
    accessToken: cleanText(result.credentials.accessToken),
    tokenType: cleanText(result.credentials.tokenType) || "Bearer",
    readiness: result.readiness,
    reasonCode: null,
    expiresAt: result.expiresAt ?? null,
    credentialVersion: result.credentialVersion ?? null,
  };
}

/**
 * Server-side read result — credentials are returned only to authorized callers.
 * No module-level cache retains decrypted payloads.
 *
 * @param {Record<string, unknown>} [input]
 */
export async function readProviderCredentials(input = {}) {
  const env = input.env || process.env;
  const config = validateVaultRuntime(input);
  const providerId = cleanText(input.providerId);
  const environment = cleanText(input.environment);
  const credentialType = cleanText(input.credentialType);
  const nowMs = Number.isFinite(input.nowMs) ? input.nowMs : Date.now();

  if (!config.ok) {
    return sanitizeProviderCredentialDiagnostics({
      ok: false,
      reasonCode: config.reasonCode,
      readiness: PROVIDER_CREDENTIAL_READINESS.CONFIGURATION_MISSING,
      providerId,
      environment,
      credentialType,
      credentials: null,
    });
  }

  const store = input.store || createSupabaseCredentialStore(env);
  const record = await store.findOne({ providerId, environment, credentialType });
  const classification = classifyProviderCredentialRecord(record, nowMs, env);

  if (classification.readiness === PROVIDER_CREDENTIAL_READINESS.MISSING) {
    return sanitizeProviderCredentialDiagnostics({
      ok: false,
      reasonCode: classification.reasonCode,
      readiness: classification.readiness,
      providerId,
      environment,
      credentialType,
      credentials: null,
    });
  }

  if (
    classification.readiness === PROVIDER_CREDENTIAL_READINESS.REVOKED ||
    classification.readiness === PROVIDER_CREDENTIAL_READINESS.EXPIRED
  ) {
    return sanitizeProviderCredentialDiagnostics({
      ok: false,
      reasonCode: classification.reasonCode,
      readiness: classification.readiness,
      providerId,
      environment,
      credentialType,
      credentialVersion: record.credential_version,
      keyVersion: record.encryption_key_version,
      issuedAt: record.issued_at,
      expiresAt: record.expires_at,
      credentials: null,
    });
  }

  const decrypted = decryptProviderCredentialPayload({
    env,
    providerId,
    environment,
    credentialVersion: record.credential_version,
    encryptionKeyVersion: record.encryption_key_version,
    encryptedPayload: record.encrypted_payload,
    encryptionIv: record.encryption_iv,
    encryptionAuthTag: record.encryption_auth_tag,
  });

  if (!decrypted.ok) {
    return sanitizeProviderCredentialDiagnostics({
      ok: false,
      reasonCode: decrypted.reasonCode,
      readiness: PROVIDER_CREDENTIAL_READINESS.DECRYPT_FAILED,
      providerId,
      environment,
      credentialType,
      credentials: null,
    });
  }

  return {
    ok: true,
    reasonCode: null,
    readiness: classification.readiness,
    providerId,
    environment,
    credentialType,
    credentialVersion: record.credential_version,
    keyVersion: record.encryption_key_version,
    issuedAt: record.issued_at,
    expiresAt: record.expires_at,
    credentials: decrypted.payload,
  };
}

/**
 * @param {Record<string, unknown>} [input]
 */
export async function getProviderCredentialMetadata(input = {}) {
  const env = input.env || process.env;
  const providerId = cleanText(input.providerId);
  const environment = cleanText(input.environment);
  const credentialType = cleanText(input.credentialType);
  const nowMs = Number.isFinite(input.nowMs) ? input.nowMs : Date.now();

  if (!validateVaultRuntime(input).ok) {
    return sanitizeProviderCredentialDiagnostics({
      ok: false,
      configured: false,
      providerId,
      environment,
      credentialType,
      readiness: PROVIDER_CREDENTIAL_READINESS.CONFIGURATION_MISSING,
    });
  }

  const store = input.store || createSupabaseCredentialStore(env);
  const record = await store.findOne({ providerId, environment, credentialType });
  const classification = classifyProviderCredentialRecord(record, nowMs, env);

  return sanitizeProviderCredentialDiagnostics({
    ok: !!record,
    configured: true,
    providerId,
    environment,
    credentialType,
    status: record?.status || null,
    readiness: classification.readiness,
    credentialVersion: record?.credential_version ?? null,
    keyVersion: record?.encryption_key_version ?? null,
    issuedAt: record?.issued_at ?? null,
    expiresAt: record?.expires_at ?? null,
    expiringSoon: classification.readiness === PROVIDER_CREDENTIAL_READINESS.EXPIRING_SOON,
  });
}

/**
 * @param {Record<string, unknown>} [input]
 */
export async function revokeProviderCredentials(input = {}) {
  const env = input.env || process.env;
  const providerId = cleanText(input.providerId);
  const environment = cleanText(input.environment);
  const credentialType = cleanText(input.credentialType);
  const updatedAt = new Date(Number.isFinite(input.nowMs) ? input.nowMs : Date.now()).toISOString();

  if (!validateVaultRuntime(input).ok) {
    return sanitizeProviderCredentialDiagnostics({
      ok: false,
      revoked: false,
      reasonCode: "configuration_missing",
      providerId,
      environment,
      credentialType,
    });
  }

  const store = input.store || createSupabaseCredentialStore(env);
  await store.updateStatus({
    providerId,
    environment,
    credentialType,
    status: PROVIDER_CREDENTIAL_STATUS.REVOKED,
    updatedAt,
  });

  return sanitizeProviderCredentialDiagnostics({
    ok: true,
    revoked: true,
    providerId,
    environment,
    credentialType,
    status: PROVIDER_CREDENTIAL_STATUS.REVOKED,
  });
}

/**
 * @param {Record<string, unknown>} [record]
 */
export function validateProviderCredentialRecord(record = {}) {
  if (!record || typeof record !== "object") {
    return { ok: true, issues: [] };
  }

  const forbiddenPlaintextColumns = [
    "access_token",
    "refresh_token",
    "client_secret",
    "authorization_code",
    "encryption_key",
  ];
  const issues = [];
  for (const column of forbiddenPlaintextColumns) {
    if (Object.prototype.hasOwnProperty.call(record, column) && record[column] != null) {
      issues.push(`plaintext_column_${column}`);
    }
  }
  return {
    ok: issues.length === 0,
    issues,
  };
}
