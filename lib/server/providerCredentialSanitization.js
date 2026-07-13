/**
 * SERVER-ONLY — DO NOT IMPORT FROM CLIENT COMPONENTS
 *
 * PATCH Comercial 05J.5.1 — Provider credential / OAuth sensitive output sanitization
 */

export const PROVIDER_CREDENTIAL_SANITIZATION_VERSION = "05J.5.1";

const SENSITIVE_KEY_PATTERN =
  /^(access[_-]?token|refresh[_-]?token|client[_-]?secret|authorization(?:code)?|bearer|id[_-]?token|encrypted[_-]?payload|encryption[_-]?iv|encryption[_-]?auth[_-]?tag|encryptionkey|encryption[_-]?key|service[_-]?role|provider[_-]?credential[_-]?encryption[_-]?key|cookie|set[_-]?cookie|token)$/i;

const SAFE_DIAGNOSTIC_KEY_PATTERN =
  /^(errorcode|reasoncode|readiness|status|operation|providerid|environment|credentialtype|credentialversion|encryptionkeyversion|issuedat|expiresat|expiringsoon|persisted|configured|ok|message|nextstep|source|envfallbackactive|tokenpersistencestatus|accesstokenreceived|refreshtokenreceived|expiresinreceived|tokentypereceived|httpstatus|requestid|version|wrotefile|wrotedatabase|updatedenv|revoked|keyversion)$/i;

const SAFE_BOOLEAN_SUFFIX_PATTERN =
  /(Received|Configured|Present|Sent|Enabled|Valid|Known|Expired|WillBeSent|Active)$/;

function cleanText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * @param {string} key
 * @param {unknown} value
 */
export function shouldRedactProviderSensitiveKey(key = "", value = undefined) {
  const normalized = cleanText(key);
  if (!normalized) return false;
  if (SAFE_DIAGNOSTIC_KEY_PATTERN.test(normalized)) return false;
  if (SAFE_BOOLEAN_SUFFIX_PATTERN.test(normalized)) return false;
  if (/^tokenPersistence/i.test(normalized)) return false;
  if (SENSITIVE_KEY_PATTERN.test(normalized)) return true;
  if (normalized === "credentials" || normalized === "payload" || normalized === "token") return true;
  if (normalized === "code") return isLikelyOAuthAuthorizationCode(value);
  return false;
}

/**
 * @param {unknown} value
 */
export function isLikelyOAuthAuthorizationCode(value) {
  if (typeof value !== "string") return false;
  const text = value.trim();
  if (text.length < 12) return false;
  if (/^(oauth_|token_|credential_|encryption_|supabase_)/i.test(text)) return false;
  return /^[A-Za-z0-9._-]+$/.test(text);
}

/**
 * @param {string} value
 */
export function redactProviderSensitiveString(value = "") {
  let safe = String(value ?? "");
  safe = safe.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]");
  safe = safe.replace(/access_token=[^&\s"]+/gi, "access_token=[REDACTED]");
  safe = safe.replace(/refresh_token=[^&\s"]+/gi, "refresh_token=[REDACTED]");
  safe = safe.replace(/client_secret=[^&\s"]+/gi, "client_secret=[REDACTED]");
  safe = safe.replace(/code=[^&\s"]+/gi, "code=[REDACTED]");
  safe = safe.replace(/"access_token"\s*:\s*"[^"]+"/gi, '"access_token":"[REDACTED]"');
  safe = safe.replace(/"refresh_token"\s*:\s*"[^"]+"/gi, '"refresh_token":"[REDACTED]"');
  safe = safe.replace(/"client_secret"\s*:\s*"[^"]+"/gi, '"client_secret":"[REDACTED]"');
  safe = safe.replace(/"authorization"\s*:\s*"[^"]+"/gi, '"authorization":"[REDACTED]"');
  safe = safe.replace(/"encrypted_payload"\s*:\s*"[^"]+"/gi, '"encrypted_payload":"[REDACTED]"');
  safe = safe.replace(/"encryption_iv"\s*:\s*"[^"]+"/gi, '"encryption_iv":"[REDACTED]"');
  safe = safe.replace(/"encryption_auth_tag"\s*:\s*"[^"]+"/gi, '"encryption_auth_tag":"[REDACTED]"');
  safe = safe.replace(/PROVIDER_CREDENTIAL_ENCRYPTION_KEY=[^\s&"]+/gi, "PROVIDER_CREDENTIAL_ENCRYPTION_KEY=[REDACTED]");
  safe = safe.replace(/SUPABASE_SERVICE_ROLE_KEY=[^\s&"]+/gi, "SUPABASE_SERVICE_ROLE_KEY=[REDACTED]");
  safe = safe.replace(/\b[A-Za-z0-9+/]{40,}={0,2}\b/g, "[REDACTED]");
  safe = safe.replace(/\b[A-Za-z0-9._-]{32,}\b/g, "[REDACTED]");
  return safe;
}

/**
 * Deep-clone sanitization — never mutates the input object.
 *
 * @param {unknown} value
 * @param {Set<object>} [seen]
 */
export function sanitizeProviderSensitiveDiagnostics(value, seen = new Set()) {
  if (value == null) return value;
  if (typeof value === "string") return redactProviderSensitiveString(value);
  if (typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeProviderSensitiveDiagnostics(entry, seen));
  }

  if (value instanceof Error) {
    return sanitizeProviderCredentialError(value);
  }

  const output = {};
  for (const [key, entry] of Object.entries(value)) {
    if (shouldRedactProviderSensitiveKey(key, entry)) {
      output[key] = "[REDACTED]";
      continue;
    }
    output[key] = sanitizeProviderSensitiveDiagnostics(entry, seen);
  }
  return output;
}

/**
 * @param {unknown} error
 */
export function sanitizeProviderCredentialError(error) {
  if (!error) {
    return {
      name: "Error",
      message: "provider_credential_error",
      reasonCode: "provider_credential_error",
    };
  }

  if (typeof error === "string") {
    return {
      name: "Error",
      message: redactProviderSensitiveString(error),
      reasonCode: "provider_credential_error",
    };
  }

  if (error instanceof Error) {
    const explicitReason = cleanText(error.reasonCode);
    const explicitCode = cleanText(error.code);
    const reasonCode =
      explicitReason ||
      (explicitCode && explicitCode.length <= 64 && !explicitCode.includes(" ")
        ? explicitCode
        : "provider_credential_error");

    return sanitizeProviderSensitiveDiagnostics({
      name: cleanText(error.name) || "Error",
      message: redactProviderSensitiveString(error.message || reasonCode),
      reasonCode,
    });
  }

  const explicitReason = cleanText(error.reasonCode);
  const explicitCode = cleanText(error.code);
  const reasonCode =
    explicitReason ||
    (explicitCode && explicitCode.length <= 64 && !explicitCode.includes(" ")
      ? explicitCode
      : "provider_credential_error");

  return sanitizeProviderSensitiveDiagnostics({
    name: cleanText(error.name) || "Error",
    message: redactProviderSensitiveString(error.message || "provider_credential_error"),
    reasonCode,
  });
}

/**
 * @param {unknown} value
 */
export function sanitizeProviderCredentialDiagnostics(value) {
  return sanitizeProviderSensitiveDiagnostics(value);
}
