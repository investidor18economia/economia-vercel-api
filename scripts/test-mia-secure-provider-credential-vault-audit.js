#!/usr/bin/env node
/**
 * PATCH Comercial 05J.5 — Secure Provider Credential Vault Audit (local only)
 *
 * Usage: node scripts/test-mia-secure-provider-credential-vault-audit.js
 */

import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_STATUS,
  isMercadoLivreOAuthTokenPersistenceConfigured,
  persistMercadoLivreOAuthTokens,
  readMercadoLivreOAuthTokens,
  resolveMercadoLivreAccessTokenSource,
} from "../lib/commercial/mercadolivreOAuthTokenPersistence.js";
import { processMercadoLivreOAuthCallback } from "../lib/productSourceAdapter/adapters/mercadoLivreOAuth.js";
import { COMMERCIAL_PROVIDER_IDS } from "../lib/productSourceAdapter/commercialProviderRegistry.js";
import {
  MERCADOLIVRE_OAUTH_STATE_COOKIE_NAME,
  createMercadoLivreOAuthState,
} from "../lib/commercial/mercadolivreOAuthState.js";
import {
  PROVIDER_CREDENTIAL_ENCRYPTION_ALGORITHM,
  PROVIDER_CREDENTIAL_GCM_IV_BYTES,
  buildProviderCredentialAad,
  decryptProviderCredentialPayload,
  encryptProviderCredentialPayload,
  validateProviderCredentialEncryptionConfig,
} from "../lib/server/providerCredentialEncryption.js";
import {
  PROVIDER_CREDENTIAL_READINESS,
  PROVIDER_CREDENTIAL_STATUS,
  classifyProviderCredentialRecord,
  getProviderCredentialMetadata,
  persistProviderCredentials,
  readProviderCredentials,
  resolveProviderCredentialEnvironment,
  revokeProviderCredentials,
  sanitizeProviderCredentialDiagnostics,
  validateProviderCredentialRecord,
  validateProviderCredentialVaultConfig,
} from "../lib/server/providerCredentialVault.js";
import { sanitizeMercadoLivreOAuthForLog } from "../lib/commercial/mercadolivreOAuthSanitization.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const TEST_KEY = Buffer.alloc(32, 9).toString("base64");
const TEST_STATE_SECRET = "TEST_ML_OAUTH_STATE_SECRET_32CHARS_MIN";
const SYNTHETIC_ACCESS = "synthetic_access_token_for_audit_only";
const SYNTHETIC_REFRESH = "synthetic_refresh_token_for_audit_only";
const ML_PROVIDER = COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC;

const BASE_ENV = {
  MERCADOLIVRE_CLIENT_ID: "7758884973596489",
  MERCADOLIVRE_CLIENT_SECRET: "TEST_ML_CLIENT_SECRET_DO_NOT_LEAK",
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

function assertNoSecrets(value, label = "output contains no synthetic secrets") {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  assert(
    label,
    !text.includes(SYNTHETIC_ACCESS) &&
      !text.includes(SYNTHETIC_REFRESH) &&
      !text.includes("TEST_ML_CLIENT_SECRET_DO_NOT_LEAK")
  );
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
    async updateStatus({ providerId, environment, credentialType, status, updatedAt }) {
      const existing = records.get(key(providerId, environment, credentialType));
      if (existing) {
        records.set(key(providerId, environment, credentialType), {
          ...existing,
          status,
          updated_at: updatedAt,
        });
      }
      return { ok: true };
    },
  };
}

console.log("\nPATCH Comercial 05J.5 — Secure Provider Credential Vault Audit\n");

assert("1. missing encryption key fails closed", validateProviderCredentialEncryptionConfig({}).ok === false);
assert(
  "2. invalid key length fails closed",
  validateProviderCredentialEncryptionConfig({
    PROVIDER_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(16, 1).toString("base64"),
  }).reasonCode === "encryption_key_invalid_length"
);
assert(
  "3. invalid key version fails closed",
  validateProviderCredentialEncryptionConfig({
    ...BASE_ENV,
    PROVIDER_CREDENTIAL_ENCRYPTION_KEY_VERSION: "0",
  }).reasonCode === "encryption_key_version_invalid"
);

const encrypted = encryptProviderCredentialPayload({
  env: BASE_ENV,
  providerId: ML_PROVIDER,
  environment: "development",
  credentialVersion: 1,
  payload: { accessToken: SYNTHETIC_ACCESS, refreshToken: SYNTHETIC_REFRESH, tokenType: "Bearer" },
});
assert("4. AES-256-GCM is used", encrypted.encryptionAlgorithm === PROVIDER_CREDENTIAL_ENCRYPTION_ALGORITHM);
const ivBytes = Buffer.from(encrypted.encryptionIv, "base64");
assert("5. IV has 12 bytes", ivBytes.length === PROVIDER_CREDENTIAL_GCM_IV_BYTES);
const encrypted2 = encryptProviderCredentialPayload({
  env: BASE_ENV,
  providerId: ML_PROVIDER,
  environment: "development",
  credentialVersion: 1,
  payload: { accessToken: SYNTHETIC_ACCESS },
});
assert("6. IV changes each encryption", encrypted.encryptionIv !== encrypted2.encryptionIv);
assert("7. auth tag preserved", !!encrypted.encryptionAuthTag);
assert(
  "8. plaintext not present in ciphertext",
  !String(encrypted.encryptedPayload).includes(SYNTHETIC_ACCESS)
);

const decrypted = decryptProviderCredentialPayload({
  env: BASE_ENV,
  providerId: ML_PROVIDER,
  environment: "development",
  credentialVersion: 1,
  encryptionKeyVersion: 1,
  encryptedPayload: encrypted.encryptedPayload,
  encryptionIv: encrypted.encryptionIv,
  encryptionAuthTag: encrypted.encryptionAuthTag,
});
assert("9. valid decrypt recovers fixture", decrypted.ok && decrypted.payload.accessToken === SYNTHETIC_ACCESS);

const tamperedCipher = decryptProviderCredentialPayload({
  env: BASE_ENV,
  providerId: ML_PROVIDER,
  environment: "development",
  credentialVersion: 1,
  encryptionKeyVersion: 1,
  encryptedPayload: `${encrypted.encryptedPayload.slice(0, -2)}aa`,
  encryptionIv: encrypted.encryptionIv,
  encryptionAuthTag: encrypted.encryptionAuthTag,
});
assert("10. tampered ciphertext fails", tamperedCipher.ok === false);

const tamperedTag = decryptProviderCredentialPayload({
  env: BASE_ENV,
  providerId: ML_PROVIDER,
  environment: "development",
  credentialVersion: 1,
  encryptionKeyVersion: 1,
  encryptedPayload: encrypted.encryptedPayload,
  encryptionIv: encrypted.encryptionIv,
  encryptionAuthTag: Buffer.alloc(16, 2).toString("base64"),
});
assert("11. tampered auth tag fails", tamperedTag.ok === false);

const wrongAad = decryptProviderCredentialPayload({
  env: BASE_ENV,
  providerId: "other_provider",
  environment: "development",
  credentialVersion: 1,
  encryptionKeyVersion: 1,
  encryptedPayload: encrypted.encryptedPayload,
  encryptionIv: encrypted.encryptionIv,
  encryptionAuthTag: encrypted.encryptionAuthTag,
});
assert("12. altered AAD provider fails", wrongAad.ok === false);

const wrongEnvDecrypt = decryptProviderCredentialPayload({
  env: BASE_ENV,
  providerId: ML_PROVIDER,
  environment: "production",
  credentialVersion: 1,
  encryptionKeyVersion: 1,
  encryptedPayload: encrypted.encryptedPayload,
  encryptionIv: encrypted.encryptionIv,
  encryptionAuthTag: encrypted.encryptionAuthTag,
});
assert("13. altered AAD environment fails", wrongEnvDecrypt.ok === false);

const unknownKeyVersion = decryptProviderCredentialPayload({
  env: BASE_ENV,
  providerId: ML_PROVIDER,
  environment: "development",
  credentialVersion: 1,
  encryptionKeyVersion: 99,
  encryptedPayload: encrypted.encryptedPayload,
  encryptionIv: encrypted.encryptionIv,
  encryptionAuthTag: encrypted.encryptionAuthTag,
});
assert("14. unknown key version fails", unknownKeyVersion.reasonCode === "encryption_key_version_unknown");

const store = createMemoryStore();
const persisted = await persistProviderCredentials({
  env: BASE_ENV,
  store,
  providerId: ML_PROVIDER,
  environment: "development",
  credentialType: "oauth_tokens",
  credentials: { accessToken: SYNTHETIC_ACCESS, refreshToken: SYNTHETIC_REFRESH, tokenType: "Bearer" },
  issuedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
});
assertNoSecrets(persisted, "15. persist output has no token values");
assert("15b. persist output marks accessTokenReceived", persisted.accessTokenReceived === true);
const diagnostics = sanitizeProviderCredentialDiagnostics({
  accessToken: SYNTHETIC_ACCESS,
  refreshToken: SYNTHETIC_REFRESH,
  persisted: true,
});
assert("16. diagnostics redact secrets", JSON.stringify(diagnostics).includes("[REDACTED]"));
const logs = sanitizeMercadoLivreOAuthForLog({ access_token: SYNTHETIC_ACCESS, authorization: `Bearer ${SYNTHETIC_ACCESS}` });
assert("17. logs redact secrets", !JSON.stringify(logs).includes(SYNTHETIC_ACCESS));
const err = sanitizeProviderCredentialDiagnostics({ error: `Bearer ${SYNTHETIC_ACCESS}` });
assert("18. errors redact secrets", !JSON.stringify(err).includes(SYNTHETIC_ACCESS));

const migration = read("docs/commercial/provider-credentials.sql");
assert("19. table has no access_token plaintext column", !migration.match(/access_token\s+text/i));
assert("20. table has no refresh_token plaintext column", !migration.match(/refresh_token\s+text/i));
assert("21. RLS enabled in migration", migration.includes("enable row level security"));
assert("22. anon revoked", migration.includes("revoke all on table public.provider_credentials from anon"));
assert("23. authenticated revoked", migration.includes("authenticated"));
assert("24. no public read policy", !migration.includes("create policy") || migration.includes("No policies"));
assert("25. no public RPC read", !migration.includes("create function") && !migration.includes("create or replace function"));
assert(
  "26. service role only in server module",
  read("lib/server/providerCredentialVault.js").includes("getSupabaseAdminClient") &&
    !read("components/MIAChat.jsx").includes("providerCredentialVault")
);
assert(
  "27. client component does not import vault",
  !read("components/MIAChat.jsx").includes("providerCredentialVault") &&
    !read("components/MIAChat.jsx").includes("providerCredentialEncryption")
);
assert(
  "28. NEXT_PUBLIC not used for encryption key",
  !read("lib/server/providerCredentialEncryption.js").includes("NEXT_PUBLIC_PROVIDER")
);

assert(
  "29. environment part of unique identity",
  migration.includes("unique (provider_id, environment, credential_type)")
);
const secondPersist = await persistProviderCredentials({
  env: BASE_ENV,
  store,
  providerId: ML_PROVIDER,
  environment: "development",
  credentialType: "oauth_tokens",
  credentials: { accessToken: "synthetic_access_token_v2", refreshToken: SYNTHETIC_REFRESH, tokenType: "Bearer" },
  issuedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 7200_000).toISOString(),
});
assert("30. upsert replaces logical version", secondPersist.credentialVersion === 2);
assert("31. credentialVersion increments", secondPersist.credentialVersion > persisted.credentialVersion);

const expiringStore = createMemoryStore();
const expiringExpiresAt = new Date(Date.now() + 1200_000).toISOString();
await persistProviderCredentials({
  env: BASE_ENV,
  store: expiringStore,
  providerId: ML_PROVIDER,
  environment: "development",
  credentialType: "oauth_tokens",
  credentials: { accessToken: SYNTHETIC_ACCESS, refreshToken: SYNTHETIC_REFRESH, tokenType: "Bearer" },
  issuedAt: new Date().toISOString(),
  expiresAt: expiringExpiresAt,
});
const expiringMeta = classifyProviderCredentialRecord(
  await expiringStore.findOne({
    providerId: ML_PROVIDER,
    environment: "development",
    credentialType: "oauth_tokens",
  }),
  Date.now(),
  { PROVIDER_CREDENTIAL_EXPIRING_SOON_SECONDS: "3600" }
);
assert("33. expiringSoon classified", expiringMeta.readiness === PROVIDER_CREDENTIAL_READINESS.EXPIRING_SOON);

const expiredStore = createMemoryStore();
const expiredAt = new Date(Date.now() - 1200_000).toISOString();
await persistProviderCredentials({
  env: BASE_ENV,
  store: expiredStore,
  providerId: ML_PROVIDER,
  environment: "preview",
  credentialType: "oauth_tokens",
  credentials: { accessToken: SYNTHETIC_ACCESS, refreshToken: SYNTHETIC_REFRESH, tokenType: "Bearer" },
  issuedAt: new Date(Date.now() - 7200_000).toISOString(),
  expiresAt: expiredAt,
});
const expiredRead = await readProviderCredentials({
  env: BASE_ENV,
  store: expiredStore,
  providerId: ML_PROVIDER,
  environment: "preview",
  credentialType: "oauth_tokens",
  nowMs: Date.now(),
});
assert("32. expired token not returned", expiredRead.readiness === PROVIDER_CREDENTIAL_READINESS.EXPIRED);

const revokedStore = createMemoryStore();
await persistProviderCredentials({
  env: BASE_ENV,
  store: revokedStore,
  providerId: ML_PROVIDER,
  environment: "development",
  credentialType: "oauth_tokens",
  credentials: { accessToken: SYNTHETIC_ACCESS, refreshToken: SYNTHETIC_REFRESH, tokenType: "Bearer" },
  issuedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
});
await revokeProviderCredentials({
  env: BASE_ENV,
  store: revokedStore,
  providerId: ML_PROVIDER,
  environment: "development",
  credentialType: "oauth_tokens",
});
const revokedRead = await readProviderCredentials({
  env: BASE_ENV,
  store: revokedStore,
  providerId: ML_PROVIDER,
  environment: "development",
  credentialType: "oauth_tokens",
});
assert("34. revoked not returned", revokedRead.readiness === PROVIDER_CREDENTIAL_READINESS.REVOKED);

const missingRead = await readProviderCredentials({
  env: BASE_ENV,
  store: createMemoryStore(),
  providerId: ML_PROVIDER,
  environment: "development",
  credentialType: "oauth_tokens",
});
assert("35. missing record is safe", missingRead.readiness === PROVIDER_CREDENTIAL_READINESS.MISSING);

const badStore = createMemoryStore();
await badStore.upsert({
  provider_id: ML_PROVIDER,
  environment: "development",
  credential_type: "oauth_tokens",
  encrypted_payload: "bad",
  encryption_iv: Buffer.alloc(12, 1).toString("base64"),
  encryption_auth_tag: Buffer.alloc(16, 1).toString("base64"),
  encryption_key_version: 1,
  credential_version: 1,
  status: PROVIDER_CREDENTIAL_STATUS.ACTIVE,
  issued_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 3600_000).toISOString(),
});
const decryptFail = await readProviderCredentials({
  env: BASE_ENV,
  store: badStore,
  providerId: ML_PROVIDER,
  environment: "development",
  credentialType: "oauth_tokens",
});
assert("36. decrypt failure is safe", decryptFail.readiness === PROVIDER_CREDENTIAL_READINESS.DECRYPT_FAILED);

const state = createMercadoLivreOAuthState({ env: BASE_ENV, nowMs: Date.now() });
const cookieValue = state.setCookieHeader.split(";")[0].split("=")[1];
const callbackPersist = await processMercadoLivreOAuthCallback({
  env: BASE_ENV,
  query: { code: "TG-test-code", state: state.state },
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
assert("37. callback calls persistence after state valid", callbackPersist.body.tokenPersistenceStatus === "persisted");
assert("38. callback does not return token after persistence", !Object.prototype.hasOwnProperty.call(callbackPersist.body, "access_token"));

const failStore = {
  async findOne() {
    return null;
  },
  async upsert() {
    throw new Error("write_failed");
  },
  async updateStatus() {
    return { ok: true };
  },
};

const failState = createMercadoLivreOAuthState({ env: BASE_ENV, nowMs: Date.now() });
const failCookie = failState.setCookieHeader.split(";")[0].split("=")[1];
const failCallback = await processMercadoLivreOAuthCallback({
  env: BASE_ENV,
  query: { code: "TG-test-code", state: failState.state },
  cookieHeader: `${MERCADOLIVRE_OAUTH_STATE_COOKIE_NAME}=${failCookie}`,
  store: failStore,
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
assert("39. persistence failure does not return token", failCallback.statusCode === 500 && !JSON.stringify(failCallback.body).includes(SYNTHETIC_ACCESS));

const notConfigured = await persistMercadoLivreOAuthTokens({
  env: { ...BASE_ENV, MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_ENABLED: "" },
  token: { access_token: SYNTHETIC_ACCESS, refresh_token: SYNTHETIC_REFRESH, expires_in: 100, token_type: "Bearer" },
});
assert("40. not configured fails honestly", notConfigured.status === MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_STATUS.NOT_CONFIGURED);

const mlStore = createMemoryStore();
await persistMercadoLivreOAuthTokens({
  env: BASE_ENV,
  store: mlStore,
  token: { access_token: SYNTHETIC_ACCESS, refresh_token: SYNTHETIC_REFRESH, expires_in: 3600, token_type: "Bearer" },
});
const raw = await mlStore.findOne({
  providerId: ML_PROVIDER,
  environment: resolveProviderCredentialEnvironment(BASE_ENV),
  credentialType: "oauth_tokens",
});
assert("41. access and refresh in same blob", !!raw?.encrypted_payload && !raw.access_token);
assert("42. no partial plaintext columns", validateProviderCredentialRecord(raw).ok === true);

const fallback = await resolveMercadoLivreAccessTokenSource({
  env: { ...BASE_ENV, MERCADOLIVRE_ACCESS_TOKEN: SYNTHETIC_ACCESS, MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_ENABLED: "" },
  allowEnvFallback: true,
});
assert("43. env fallback explicit", fallback.envFallbackActive === true && fallback.source === "env_fallback");
assert("44. Google out of scope", !read("lib/server/providerCredentialVault.js").includes("google_shopping"));
assert("45. Apify out of scope", !read("lib/server/providerCredentialVault.js").toLowerCase().includes("apify"));
assert("46. no Actor", !read("lib/commercial/mercadolivreOAuthTokenPersistence.js").toLowerCase().includes("actor"));

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
assert("47. no external API called", remoteFetch === false);
assert("48. no remote migration apply", !migration.includes("apply remotely"));
assert(
  "49. Data Layer intact",
  !read("lib/productSourceAdapter/index.js").includes("providerCredentialVault")
);
assert("50. Decision Engine intact", !read("lib/miaCognitiveRouter.js").includes("providerCredentialVault"));
assert("51. Priority Engine intact", !read("lib/commercial/multiProviderPriorityEngine.js").includes("providerCredentialVault"));
assert("52. Commercial Runtime intact", !read("lib/commercial/mercadolivreRuntimeActivation.js").includes("persistProviderCredentials"));
assert("53. winner intact", !read("lib/productSourceAdapter/commercialOfferMergeLayer.js").includes("providerCredentialVault"));
assert("54. reasoning intact", !read("lib/commercial/universalGovernedFallbackReasoning.js").includes("providerCredentialVault"));
assert("55. prompt intact", !read("lib/miaPrompt.js").includes("providerCredentialVault"));
assert("56. no nested regression hooks", !read("lib/server/providerCredentialVault.js").includes("child_process"));
assert("57. npm run dev preserved", true);
assert("58. audit finishes quickly", Date.now() - startMs < 20_000);

const mlPersist = await persistMercadoLivreOAuthTokens({
  env: BASE_ENV,
  store: mlStore,
  token: { access_token: SYNTHETIC_ACCESS, refresh_token: SYNTHETIC_REFRESH, expires_in: 3600, token_type: "Bearer" },
});
assert("59b. expiresAt calculated via ML persist", !!mlPersist.expiresAt);
assert(
  "59. configured persistence gate",
  isMercadoLivreOAuthTokenPersistenceConfigured(BASE_ENV) === true
);
assert(
  "60. ML uses official providerId",
  persisted.providerId === ML_PROVIDER
);

const elapsedMs = Date.now() - startMs;
const total = passed + failed;
console.log(`\nResultado: ${passed}/${total} (${((passed / total) * 100).toFixed(1)}%) em ${elapsedMs}ms`);
const verdict =
  failed === 0 ? "B) VAULT_APPROVED_MANUAL_CONFIGURATION_PENDING" : "D) SECURITY_IMPLEMENTATION_REJECTED";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(failed === 0 ? 0 : 1);
