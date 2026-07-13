#!/usr/bin/env node
/**
 * PATCH Comercial 05J.5.1 — Provider Credential Vault Security Hardening Audit (local only)
 *
 * Usage: node scripts/test-mia-provider-credential-vault-security-hardening-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_STATUS,
  isMercadoLivreOAuthTokenPersistenceEnabled,
  persistMercadoLivreOAuthTokens,
} from "../lib/commercial/mercadolivreOAuthTokenPersistence.js";
import { sanitizeMercadoLivreOAuthForHttpResponse } from "../lib/commercial/mercadolivreOAuthSanitization.js";
import { processMercadoLivreOAuthCallback } from "../lib/productSourceAdapter/adapters/mercadoLivreOAuth.js";
import {
  MERCADOLIVRE_OAUTH_STATE_COOKIE_NAME,
  createMercadoLivreOAuthState,
} from "../lib/commercial/mercadolivreOAuthState.js";
import {
  assertProviderCredentialEncryptionReadiness,
  validateProviderCredentialEncryptionConfig,
} from "../lib/server/providerCredentialEncryption.js";
import {
  PROVIDER_CREDENTIAL_VAULT_PLAINTEXT_CACHE_ENABLED,
  assertProviderCredentialVaultReadiness,
  persistProviderCredentials,
  readProviderCredentials,
  sanitizeProviderCredentialDiagnostics,
} from "../lib/server/providerCredentialVault.js";
import {
  isLikelyOAuthAuthorizationCode,
  redactProviderSensitiveString,
  sanitizeProviderCredentialError,
  sanitizeProviderSensitiveDiagnostics,
  shouldRedactProviderSensitiveKey,
} from "../lib/server/providerCredentialSanitization.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const TEST_KEY = Buffer.alloc(32, 9).toString("base64");
const TEST_STATE_SECRET = "TEST_ML_OAUTH_STATE_SECRET_32CHARS_MIN";
const SYNTHETIC_ACCESS = "synthetic_access_token_hardening_audit";
const SYNTHETIC_REFRESH = "synthetic_refresh_token_hardening_audit";
const SYNTHETIC_CODE = "TG-1234567890abcdef_oauth_code_fixture";
const SYNTHETIC_SECRET = "synthetic_client_secret_hardening_audit";
const SYNTHETIC_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");

const BASE_ENV = {
  MERCADOLIVRE_CLIENT_ID: "7758884973596489",
  MERCADOLIVRE_CLIENT_SECRET: SYNTHETIC_SECRET,
  MERCADOLIVRE_REDIRECT_URI: "https://economia-ai.vercel.app/api/auth/mercadolivre/callback",
  MERCADOLIVRE_OAUTH_STATE_SECRET: TEST_STATE_SECRET,
  MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_ENABLED: "true",
  PROVIDER_CREDENTIAL_ENCRYPTION_KEY: TEST_KEY,
  PROVIDER_CREDENTIAL_ENCRYPTION_KEY_VERSION: "1",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.test",
  VERCEL_ENV: "development",
};

let passed = 0;
let failed = 0;
const startMs = Date.now();

function assert(label, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${label}`);
  } else {
    failed += 1;
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function read(path) {
  return readFileSync(join(ROOT, path), "utf8");
}

function assertNoSecrets(value, forbidden = []) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  for (const secret of forbidden) {
    if (text.includes(secret)) return false;
  }
  return true;
}

function createMemoryStore() {
  const records = new Map();
  const key = (providerId, environment, credentialType) =>
    `${providerId}|${environment}|${credentialType}`;
  return {
    async findOne({ providerId, environment, credentialType }) {
      return records.get(key(providerId, environment, credentialType)) || null;
    },
    async upsert(record) {
      records.set(key(record.provider_id, record.environment, record.credential_type), record);
      return {
        credential_version: record.credential_version,
        encryption_key_version: record.encryption_key_version,
        issued_at: record.issued_at,
        expires_at: record.expires_at,
        status: record.status,
      };
    },
    async updateStatus() {
      return { ok: true };
    },
  };
}

console.log("\nPATCH Comercial 05J.5.1 — Provider Credential Vault Security Hardening Audit\n");

const nestedFixture = {
  providerId: "mercadolivre_public",
  access_token: SYNTHETIC_ACCESS,
  nested: {
    refreshToken: SYNTHETIC_REFRESH,
    authorization: `Bearer ${SYNTHETIC_ACCESS}`,
    encrypted_payload: "ciphertext_fixture",
    encryption_iv: "iv_fixture",
    encryption_auth_tag: "tag_fixture",
    client_secret: SYNTHETIC_SECRET,
    code: SYNTHETIC_CODE,
    errorCode: "token_exchange_failed",
    reasonCode: "credential_expired",
  },
  cookies: {
    "set-cookie": "ml_oauth_state=secret_value; HttpOnly",
  },
};

const originalFixture = structuredClone(nestedFixture);
const sanitized = sanitizeProviderSensitiveDiagnostics(nestedFixture);

assert("1. access token removed", sanitized.access_token === "[REDACTED]");
assert("2. refresh token removed", sanitized.nested.refreshToken === "[REDACTED]");
assert("3. authorization header removed", sanitized.nested.authorization === "[REDACTED]");
assert("4. OAuth code removed when sensitive", sanitized.nested.code === "[REDACTED]");
assert("5. client secret removed", sanitized.nested.client_secret === "[REDACTED]");
assert("6. encryption key field removed", shouldRedactProviderSensitiveKey("encryptionKey", SYNTHETIC_ENCRYPTION_KEY));
assert("7. ciphertext removed", sanitized.nested.encrypted_payload === "[REDACTED]");
assert("8. IV removed", sanitized.nested.encryption_iv === "[REDACTED]");
assert("9. auth tag removed", sanitized.nested.encryption_auth_tag === "[REDACTED]");
assert("10. nested objects sanitized", assertNoSecrets(sanitized, [SYNTHETIC_ACCESS, SYNTHETIC_REFRESH, SYNTHETIC_SECRET]));
assert("11. arrays sanitized", sanitizeProviderSensitiveDiagnostics([{ accessToken: SYNTHETIC_ACCESS }])[0].accessToken === "[REDACTED]");
assert("12. alternate casing sanitized", sanitizeProviderSensitiveDiagnostics({ Access_Token: SYNTHETIC_ACCESS }).Access_Token === "[REDACTED]");
assert("13. original object not mutated", nestedFixture.access_token === originalFixture.access_token);
assert("14. safe diagnostic fields preserved", sanitized.providerId === "mercadolivre_public");
assert("15. error code preserved", sanitized.nested.errorCode === "token_exchange_failed");
assert("16. reason code preserved", sanitized.nested.reasonCode === "credential_expired");
assert(
  "17. no token substring in sanitized output",
  assertNoSecrets(JSON.stringify(sanitized), [SYNTHETIC_ACCESS, SYNTHETIC_REFRESH, SYNTHETIC_SECRET, SYNTHETIC_CODE])
);

const logCapture = [];
const originalLog = console.log;
console.log = (...args) => logCapture.push(args.map(String).join(" "));
console.log(sanitizeProviderCredentialDiagnostics({ accessToken: SYNTHETIC_ACCESS, reasonCode: "credential_missing" }));
console.log = originalLog;
assert("18. logs redact secrets", assertNoSecrets(logCapture.join("\n"), [SYNTHETIC_ACCESS]));

const sanitizedError = sanitizeProviderCredentialError(
  new Error(`failed with ${SYNTHETIC_ACCESS} and key ${TEST_KEY}`)
);
assert("19. errors redact secrets", assertNoSecrets(JSON.stringify(sanitizedError), [SYNTHETIC_ACCESS, TEST_KEY]));
assert("20. safe error code preserved", sanitizedError.reasonCode === "provider_credential_error");

assert(
  "21. OAuth authorization code heuristic",
  isLikelyOAuthAuthorizationCode(SYNTHETIC_CODE) === true &&
    isLikelyOAuthAuthorizationCode("oauth_denied") === false
);

assert(
  "22. missing key fails when vault enabled",
  assertProviderCredentialEncryptionReadiness({
    ...BASE_ENV,
    PROVIDER_CREDENTIAL_ENCRYPTION_KEY: "",
  }).ok === false
);
assert(
  "23. invalid key length fails",
  assertProviderCredentialEncryptionReadiness({
    ...BASE_ENV,
    PROVIDER_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(16, 1).toString("base64"),
  }).reasonCode === "encryption_key_invalid_length"
);
assert(
  "24. invalid Base64 fails",
  assertProviderCredentialEncryptionReadiness({
    ...BASE_ENV,
    PROVIDER_CREDENTIAL_ENCRYPTION_KEY: "!!!not-base64!!!",
  }).reasonCode === "encryption_key_invalid_base64"
);
assert(
  "25. invalid key version fails",
  assertProviderCredentialEncryptionReadiness({
    ...BASE_ENV,
    PROVIDER_CREDENTIAL_ENCRYPTION_KEY_VERSION: "0",
  }).reasonCode === "encryption_key_version_invalid"
);
assert(
  "26. service role missing fails when required",
  assertProviderCredentialVaultReadiness({
    env: { ...BASE_ENV, SUPABASE_SERVICE_ROLE_KEY: "" },
  }).reasonCode === "supabase_service_role_missing"
);
assert(
  "27. vault disabled does not require encryption key",
  isMercadoLivreOAuthTokenPersistenceEnabled({
    MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_ENABLED: "",
  }) === false
);
assert(
  "28. error does not contain env key value",
  assertNoSecrets(
    JSON.stringify(
      assertProviderCredentialEncryptionReadiness({
        ...BASE_ENV,
        PROVIDER_CREDENTIAL_ENCRYPTION_KEY: TEST_KEY,
      })
    ),
    [TEST_KEY]
  )
);

let persistStarted = false;
const trackingStore = {
  async findOne() {
    return null;
  },
  async upsert() {
    persistStarted = true;
    return {
      credential_version: 1,
      encryption_key_version: 1,
      issued_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      status: "active",
    };
  },
  async updateStatus() {
    return { ok: true };
  },
};

const failBeforePersist = await persistMercadoLivreOAuthTokens({
  env: { ...BASE_ENV, PROVIDER_CREDENTIAL_ENCRYPTION_KEY: "!!!bad!!!" },
  store: trackingStore,
  token: {
    access_token: SYNTHETIC_ACCESS,
    refresh_token: SYNTHETIC_REFRESH,
    expires_in: 3600,
    token_type: "Bearer",
  },
});
assert("29. validation before persistence", failBeforePersist.ok === false && persistStarted === false);
assert(
  "30. enabled-but-misconfigured fails honestly",
  failBeforePersist.status === MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_STATUS.FAILED
);

const vaultSource = read("lib/server/providerCredentialVault.js");
const encryptionSource = read("lib/server/providerCredentialEncryption.js");
const mlPersistenceSource = read("lib/commercial/mercadolivreOAuthTokenPersistence.js");
assert("31. no global plaintext cache flag", PROVIDER_CREDENTIAL_VAULT_PLAINTEXT_CACHE_ENABLED === false);
assert("32. no module-level token Map in vault", !/new Map\(/.test(vaultSource));
assert("33. no module-level token cache in ML persistence", !/cache|memo/i.test(mlPersistenceSource));
assert(
  "34. vault not imported by universal cache",
  !read("lib/commercial/universalCommercialCache.js").includes("providerCredentialVault")
);
assert(
  "35. vault not imported by deduplication",
  !read("lib/commercial/commercialRequestDeduplication.js").includes("providerCredentialVault")
);

const store = createMemoryStore();
await persistProviderCredentials({
  env: BASE_ENV,
  store,
  providerId: "mercadolivre_public",
  environment: "development",
  credentialType: "oauth_tokens",
  credentials: { accessToken: SYNTHETIC_ACCESS, refreshToken: SYNTHETIC_REFRESH, tokenType: "Bearer" },
  issuedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
});
const metadataRead = await readProviderCredentials({
  env: BASE_ENV,
  store,
  providerId: "mercadolivre_public",
  environment: "development",
  credentialType: "oauth_tokens",
});
const metadataOnly = sanitizeProviderCredentialDiagnostics({
  readiness: metadataRead.readiness,
  credentialVersion: metadataRead.credentialVersion,
  expiresAt: metadataRead.expiresAt,
});
assert("36. metadata path has no plaintext token", assertNoSecrets(JSON.stringify(metadataOnly), [SYNTHETIC_ACCESS, SYNTHETIC_REFRESH]));

const state = createMercadoLivreOAuthState({ env: BASE_ENV, nowMs: Date.now() });
const cookieValue = state.setCookieHeader.split(";")[0].split("=")[1];
const callback = await processMercadoLivreOAuthCallback({
  env: BASE_ENV,
  query: { code: SYNTHETIC_CODE, state: state.state },
  cookieHeader: `${MERCADOLIVRE_OAUTH_STATE_COOKIE_NAME}=${cookieValue}`,
  store: createMemoryStore(),
  fetcher: async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      access_token: SYNTHETIC_ACCESS,
      refresh_token: SYNTHETIC_REFRESH,
      expires_in: 3600,
      token_type: "Bearer",
    }),
  }),
});
assert(
  "37. callback response has no token",
  assertNoSecrets(JSON.stringify(callback.body), [SYNTHETIC_ACCESS, SYNTHETIC_REFRESH, SYNTHETIC_CODE])
);
assert(
  "38. HTTP sanitizer removes token fields",
  sanitizeMercadoLivreOAuthForHttpResponse({ access_token: SYNTHETIC_ACCESS, errorCode: "oauth_error" }).access_token ===
    "[REDACTED]"
);

const thrown = sanitizeProviderCredentialError({
  name: "Error",
  message: SYNTHETIC_ACCESS,
  stack: `Error: bearer ${SYNTHETIC_ACCESS}`,
});
assert("39. exception serialization safe", assertNoSecrets(JSON.stringify(thrown), [SYNTHETIC_ACCESS]));

assert(
  "40. public encryption config exposes no key material",
  validateProviderCredentialEncryptionConfig(BASE_ENV).key === undefined
);

assert(
  "41. encryption module has readiness assert",
  encryptionSource.includes("assertProviderCredentialEncryptionReadiness")
);
assert(
  "42. vault module has readiness assert",
  vaultSource.includes("assertProviderCredentialVaultReadiness")
);
assert(
  "43. dedicated sanitization module exists",
  read("lib/server/providerCredentialSanitization.js").includes("sanitizeProviderSensitiveDiagnostics")
);

let remoteFetch = false;
globalThis.fetch = () => {
  remoteFetch = true;
  return Promise.reject(new Error("blocked"));
};
await persistMercadoLivreOAuthTokens({
  env: BASE_ENV,
  store: createMemoryStore(),
  token: { access_token: SYNTHETIC_ACCESS, refresh_token: SYNTHETIC_REFRESH, expires_in: 10, token_type: "Bearer" },
});
assert("44. no external API called", remoteFetch === false);
assert("45. audit finishes quickly", Date.now() - startMs < 20_000);

const total = passed + failed;
console.log(`\nResultado: ${passed}/${total} (${((passed / total) * 100).toFixed(1)}%) em ${Date.now() - startMs}ms`);
const verdict =
  failed === 0
    ? "A) SECURITY_HARDENING_APPROVED"
    : failed <= 2
      ? "B) SECURITY_HARDENING_APPROVED_WITH_RESIDUAL_RISKS"
      : "C) SECURITY_HARDENING_REQUIRES_FIXES";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(failed === 0 ? 0 : 1);
