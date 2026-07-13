/**
 * SERVER-ONLY — DO NOT IMPORT FROM CLIENT COMPONENTS
 *
 * PATCH Comercial 05J.5 — Provider credential encryption (AES-256-GCM)
 */

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

export const PROVIDER_CREDENTIAL_ENCRYPTION_VERSION = "05J.5";
export const PROVIDER_CREDENTIAL_ENCRYPTION_KEY_ENV = "PROVIDER_CREDENTIAL_ENCRYPTION_KEY";
export const PROVIDER_CREDENTIAL_ENCRYPTION_KEY_VERSION_ENV = "PROVIDER_CREDENTIAL_ENCRYPTION_KEY_VERSION";
export const PROVIDER_CREDENTIAL_GCM_IV_BYTES = 12;
export const PROVIDER_CREDENTIAL_GCM_KEY_BYTES = 32;
export const PROVIDER_CREDENTIAL_ENCRYPTION_ALGORITHM = "aes-256-gcm";

function normalizeBase64(value = "") {
  return String(value || "").trim().replace(/=+$/, "");
}

function isStrictBase64(value = "") {
  const trimmed = String(value || "").trim();
  if (!trimmed) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) return false;
  if (trimmed.length % 4 === 1) return false;
  return true;
}

/**
 * Internal key resolution — never log the returned object.
 *
 * @param {Record<string, string|undefined>} [env]
 */
export function resolveProviderCredentialEncryptionKey(env = process.env) {
  const keyBase64 = String(env?.[PROVIDER_CREDENTIAL_ENCRYPTION_KEY_ENV] || "").trim();
  if (!keyBase64) {
    return {
      ok: false,
      reasonCode: "encryption_key_missing",
      key: null,
      keyVersion: null,
    };
  }

  if (!isStrictBase64(keyBase64)) {
    return {
      ok: false,
      reasonCode: "encryption_key_invalid_base64",
      key: null,
      keyVersion: null,
    };
  }

  let key = null;
  try {
    key = Buffer.from(keyBase64, "base64");
  } catch {
    return {
      ok: false,
      reasonCode: "encryption_key_invalid_base64",
      key: null,
      keyVersion: null,
    };
  }

  if (key.length !== PROVIDER_CREDENTIAL_GCM_KEY_BYTES) {
    return {
      ok: false,
      reasonCode: "encryption_key_invalid_length",
      key: null,
      keyVersion: null,
    };
  }

  if (normalizeBase64(key.toString("base64")) !== normalizeBase64(keyBase64)) {
    return {
      ok: false,
      reasonCode: "encryption_key_invalid_base64",
      key: null,
      keyVersion: null,
    };
  }

  const keyVersion = Number.parseInt(
    String(env?.[PROVIDER_CREDENTIAL_ENCRYPTION_KEY_VERSION_ENV] || "1"),
    10
  );
  if (!Number.isFinite(keyVersion) || keyVersion < 1) {
    return {
      ok: false,
      reasonCode: "encryption_key_version_invalid",
      key: null,
      keyVersion: null,
    };
  }

  return {
    ok: true,
    reasonCode: null,
    key,
    keyVersion,
  };
}

/**
 * Public validation — does not expose key material.
 *
 * @param {Record<string, string|undefined>} [env]
 */
export function validateProviderCredentialEncryptionConfig(env = process.env) {
  const resolved = resolveProviderCredentialEncryptionKey(env);
  if (!resolved.ok) {
    return {
      ok: false,
      reasonCode: resolved.reasonCode,
      keyVersion: null,
    };
  }

  return {
    ok: true,
    reasonCode: null,
    keyVersion: resolved.keyVersion,
  };
}

/**
 * Fail-fast boundary for vault crypto — returns sanitized reason codes only.
 *
 * @param {Record<string, string|undefined>} [env]
 */
export function assertProviderCredentialEncryptionReadiness(env = process.env) {
  const result = validateProviderCredentialEncryptionConfig(env);
  return {
    ok: result.ok === true,
    reasonCode: result.ok ? null : result.reasonCode,
    keyVersion: result.keyVersion,
  };
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function buildProviderCredentialAad(input = {}) {
  const providerId = String(input.providerId || "").trim();
  const environment = String(input.environment || "").trim();
  const credentialVersion = Number.parseInt(String(input.credentialVersion ?? 1), 10) || 1;
  const keyVersion = Number.parseInt(String(input.keyVersion ?? 1), 10) || 1;
  return `${providerId}|${environment}|${credentialVersion}|${keyVersion}`;
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function encryptProviderCredentialPayload(input = {}) {
  const env = input.env || process.env;
  const config = resolveProviderCredentialEncryptionKey(env);
  if (!config.ok) {
    return {
      ok: false,
      reasonCode: config.reasonCode,
    };
  }

  const keyVersion = Number.isFinite(input.keyVersion) ? input.keyVersion : config.keyVersion;
  if (keyVersion !== config.keyVersion) {
    return {
      ok: false,
      reasonCode: "encryption_key_version_mismatch",
    };
  }

  const aad = buildProviderCredentialAad({
    providerId: input.providerId,
    environment: input.environment,
    credentialVersion: input.credentialVersion,
    keyVersion,
  });

  const iv = randomBytes(PROVIDER_CREDENTIAL_GCM_IV_BYTES);
  const cipher = createCipheriv(PROVIDER_CREDENTIAL_ENCRYPTION_ALGORITHM, config.key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));

  const plaintext = JSON.stringify(input.payload ?? {});
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ok: true,
    reasonCode: null,
    encryptedPayload: ciphertext.toString("base64"),
    encryptionIv: iv.toString("base64"),
    encryptionAuthTag: authTag.toString("base64"),
    encryptionKeyVersion: keyVersion,
    encryptionAlgorithm: PROVIDER_CREDENTIAL_ENCRYPTION_ALGORITHM,
  };
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function decryptProviderCredentialPayload(input = {}) {
  const env = input.env || process.env;
  const config = resolveProviderCredentialEncryptionKey(env);
  if (!config.ok) {
    return {
      ok: false,
      reasonCode: config.reasonCode,
      payload: null,
    };
  }

  const recordKeyVersion = Number.parseInt(String(input.encryptionKeyVersion ?? config.keyVersion), 10);
  if (recordKeyVersion !== config.keyVersion) {
    return {
      ok: false,
      reasonCode: "encryption_key_version_unknown",
      payload: null,
    };
  }

  const aad = buildProviderCredentialAad({
    providerId: input.providerId,
    environment: input.environment,
    credentialVersion: input.credentialVersion,
    keyVersion: recordKeyVersion,
  });

  try {
    const iv = Buffer.from(String(input.encryptionIv || ""), "base64");
    const authTag = Buffer.from(String(input.encryptionAuthTag || ""), "base64");
    const ciphertext = Buffer.from(String(input.encryptedPayload || ""), "base64");

    const decipher = createDecipheriv(PROVIDER_CREDENTIAL_ENCRYPTION_ALGORITHM, config.key, iv);
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(authTag);

    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    const payload = JSON.parse(plaintext);
    return {
      ok: true,
      reasonCode: null,
      payload,
    };
  } catch {
    return {
      ok: false,
      reasonCode: "decrypt_failed",
      payload: null,
    };
  }
}

/**
 * @param {string} left
 * @param {string} right
 */
export function safeEqualText(left = "", right = "") {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
