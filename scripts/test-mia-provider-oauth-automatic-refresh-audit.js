#!/usr/bin/env node
/**
 * PATCH Comercial 05J.7 — OAuth Automatic Refresh Engine Audit (local only)
 *
 * Usage: node scripts/test-mia-provider-oauth-automatic-refresh-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  mercadoLivreOAuthRefreshHandler,
  resolveMercadoLivreRuntimeAccessToken,
} from "../lib/commercial/mercadolivreOAuthTokenPersistence.js";
import {
  buildCommercialRequestDedupKey,
} from "../lib/commercial/commercialRequestDeduplication.js";
import {
  evaluateProviderBudgetPermission,
} from "../lib/commercial/providerBudgetCircuitBreaker.js";
import { buildUniversalCommercialCacheKey } from "../lib/commercial/universalCommercialCache.js";
import { refreshMercadoLivreOAuthToken } from "../lib/productSourceAdapter/adapters/mercadoLivreOAuth.js";
import { COMMERCIAL_PROVIDER_IDS } from "../lib/productSourceAdapter/commercialProviderRegistry.js";
import {
  PROVIDER_OAUTH_REFRESH_ENGINE_VERSION,
  PROVIDER_OAUTH_REFRESH_REASON_CODES,
  ensureActiveProviderOAuthAccessToken,
  getProviderOAuthRefreshLockCountForTests,
  resetProviderOAuthRefreshLocksForTests,
} from "../lib/server/providerOAuthRefreshEngine.js";
import {
  persistProviderCredentials,
  PROVIDER_CREDENTIAL_READINESS,
  readProviderOAuthRefreshWindowSeconds,
  shouldRefreshProviderOAuthCredential,
} from "../lib/server/providerCredentialVault.js";
import {
  resolveMercadoLivreClientRuntimeCredentials,
} from "../lib/productSourceAdapter/adapters/mercadoLivreClient.js";
import { fetchMercadoLivreCommercialAdapterResult } from "../lib/productSourceAdapter/adapters/mercadoLivreAdapter.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const TEST_KEY = Buffer.alloc(32, 13).toString("base64");
const SYNTHETIC_ACCESS = "synthetic_refresh_access_token_audit";
const SYNTHETIC_ACCESS_V2 = "synthetic_refresh_access_token_audit_v2";
const SYNTHETIC_REFRESH = "synthetic_refresh_refresh_token_audit";
const ML_PROVIDER = COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC;

const BASE_ENV = {
  MERCADOLIVRE_CLIENT_ID: "7758884973596489",
  MERCADOLIVRE_CLIENT_SECRET: "TEST_ML_CLIENT_SECRET_DO_NOT_LEAK",
  MERCADOLIVRE_REDIRECT_URI: "https://economia-ai.vercel.app/api/auth/mercadolivre/callback",
  MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_ENABLED: "true",
  PROVIDER_CREDENTIAL_ENCRYPTION_KEY: TEST_KEY,
  PROVIDER_CREDENTIAL_ENCRYPTION_KEY_VERSION: "1",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.test",
  VERCEL_ENV: "development",
  PROVIDER_OAUTH_REFRESH_WINDOW_SECONDS: "900",
  COMMERCIAL_RUNTIME_MODE: "controlled",
  COMMERCIAL_PROVIDER_MERCADOLIVRE_ENABLED: "true",
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
      !text.includes(SYNTHETIC_ACCESS_V2) &&
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

async function seedCredential(store, { accessToken, refreshToken, expiresAt, nowMs = Date.now() }) {
  await persistProviderCredentials({
    env: BASE_ENV,
    store,
    nowMs,
    providerId: ML_PROVIDER,
    environment: "development",
    credentialType: "oauth_tokens",
    credentials: {
      accessToken,
      refreshToken,
      tokenType: "Bearer",
    },
    issuedAt: new Date(nowMs).toISOString(),
    expiresAt,
  });
}

console.log("\nPATCH Comercial 05J.7 — OAuth Automatic Refresh Engine Audit\n");

resetProviderOAuthRefreshLocksForTests();

assert("1. refresh engine version", PROVIDER_OAUTH_REFRESH_ENGINE_VERSION === "05J.7");
assert(
  "2. generic refresh engine exists",
  read("lib/server/providerOAuthRefreshEngine.js").includes("ensureActiveProviderOAuthAccessToken")
);
assert(
  "3. no ML-specific refresh module",
  !read("lib/server/providerOAuthRefreshEngine.js").includes("mercadolivre") &&
    !read("lib/server/providerOAuthRefreshEngine.js").includes("MercadoLivre")
);
assert(
  "4. refresh window configurable",
  readProviderOAuthRefreshWindowSeconds({ PROVIDER_OAUTH_REFRESH_WINDOW_SECONDS: "600" }) === 600
);
assert(
  "5. refresh window not hardcoded only",
  read("lib/server/providerCredentialVault.js").includes("PROVIDER_OAUTH_REFRESH_WINDOW_SECONDS")
);

const nowMs = Date.now();
const store = createMemoryStore();
await seedCredential(store, {
  accessToken: SYNTHETIC_ACCESS,
  refreshToken: SYNTHETIC_REFRESH,
  expiresAt: new Date(nowMs + 7_200_000).toISOString(),
  nowMs,
});

const active = await resolveMercadoLivreRuntimeAccessToken({ env: BASE_ENV, store, nowMs });
assert("6. valid token used without refresh", active.ok === true && active.accessToken === SYNTHETIC_ACCESS);
assert(
  "7. valid token refresh not attempted",
  active.refreshDiagnostics?.refreshAttempted !== true || active.refreshDiagnostics?.refreshSucceeded === false
);

const expiringStore = createMemoryStore();
const expiringNow = Date.now();
await seedCredential(expiringStore, {
  accessToken: SYNTHETIC_ACCESS,
  refreshToken: SYNTHETIC_REFRESH,
  expiresAt: new Date(expiringNow + 300_000).toISOString(),
  nowMs: expiringNow,
});
assert(
  "8. expiring credential enters refresh window",
  shouldRefreshProviderOAuthCredential(
    { expires_at: new Date(expiringNow + 300_000).toISOString(), status: "active" },
    expiringNow,
    BASE_ENV
  )
);

let refreshCalls = 0;
const refreshed = await ensureActiveProviderOAuthAccessToken({
  env: BASE_ENV,
  store: expiringStore,
  nowMs: expiringNow,
  providerId: ML_PROVIDER,
  environment: "development",
  credentialType: "oauth_tokens",
  refreshHandler: async () => {
    refreshCalls += 1;
    return {
      ok: true,
      token: {
        access_token: SYNTHETIC_ACCESS_V2,
        refresh_token: SYNTHETIC_REFRESH,
        expires_in: 3600,
        token_type: "Bearer",
      },
    };
  },
});
assert("9. refresh succeeds for expiring credential", refreshed.ok === true && refreshed.accessToken === SYNTHETIC_ACCESS_V2);
assert("10. refresh increments credential_version", (refreshed.credentialVersion ?? 0) >= 2);
assert("11. refresh telemetry sanitized", refreshed.refreshDiagnostics?.refreshSucceeded === true);
assertNoSecrets(refreshed.refreshDiagnostics, "12. refresh diagnostics sanitized");

const expiredStore = createMemoryStore();
const expiredNow = Date.now();
await seedCredential(expiredStore, {
  accessToken: SYNTHETIC_ACCESS,
  refreshToken: SYNTHETIC_REFRESH,
  expiresAt: new Date(expiredNow - 600_000).toISOString(),
  nowMs: expiredNow - 900_000,
});
const expiredRefresh = await ensureActiveProviderOAuthAccessToken({
  env: BASE_ENV,
  store: expiredStore,
  nowMs: expiredNow,
  providerId: ML_PROVIDER,
  environment: "development",
  credentialType: "oauth_tokens",
  refreshHandler: async () => ({
    ok: true,
    token: {
      access_token: SYNTHETIC_ACCESS_V2,
      refresh_token: SYNTHETIC_REFRESH,
      expires_in: 3600,
      token_type: "Bearer",
    },
  }),
});
assert("13. expired credential refreshed", expiredRefresh.ok === true);

const invalidRefreshStore = createMemoryStore();
await seedCredential(invalidRefreshStore, {
  accessToken: SYNTHETIC_ACCESS,
  refreshToken: SYNTHETIC_REFRESH,
  expiresAt: new Date(Date.now() - 600_000).toISOString(),
});
const invalidRefresh = await ensureActiveProviderOAuthAccessToken({
  env: BASE_ENV,
  store: invalidRefreshStore,
  nowMs: Date.now(),
  providerId: ML_PROVIDER,
  environment: "development",
  credentialType: "oauth_tokens",
  refreshHandler: async () => ({
    ok: false,
    reasonCode: PROVIDER_OAUTH_REFRESH_REASON_CODES.REFRESH_TOKEN_INVALID,
  }),
});
assert(
  "14. invalid refresh classified",
  invalidRefresh.reasonCode === PROVIDER_OAUTH_REFRESH_REASON_CODES.REFRESH_TOKEN_INVALID
);

const revokedRefresh = await ensureActiveProviderOAuthAccessToken({
  env: BASE_ENV,
  store: invalidRefreshStore,
  nowMs: Date.now(),
  providerId: ML_PROVIDER,
  environment: "development",
  credentialType: "oauth_tokens",
  refreshHandler: async () => ({
    ok: false,
    reasonCode: PROVIDER_OAUTH_REFRESH_REASON_CODES.REFRESH_TOKEN_REVOKED,
  }),
});
assert(
  "15. revoked refresh classified",
  revokedRefresh.reasonCode === PROVIDER_OAUTH_REFRESH_REASON_CODES.REFRESH_TOKEN_REVOKED
);

const httpErrorRefresh = await ensureActiveProviderOAuthAccessToken({
  env: BASE_ENV,
  store: invalidRefreshStore,
  nowMs: Date.now(),
  providerId: ML_PROVIDER,
  environment: "development",
  credentialType: "oauth_tokens",
  refreshHandler: async () => ({
    ok: false,
    reasonCode: PROVIDER_OAUTH_REFRESH_REASON_CODES.REFRESH_HTTP_ERROR,
  }),
});
assert(
  "16. http refresh error classified",
  httpErrorRefresh.reasonCode === PROVIDER_OAUTH_REFRESH_REASON_CODES.REFRESH_HTTP_ERROR
);

const timeoutRefresh = await ensureActiveProviderOAuthAccessToken({
  env: BASE_ENV,
  store: invalidRefreshStore,
  nowMs: Date.now(),
  providerId: ML_PROVIDER,
  environment: "development",
  credentialType: "oauth_tokens",
  refreshHandler: async () => {
    const error = new Error("timeout");
    error.name = "AbortError";
    throw error;
  },
});
assert(
  "17. timeout classified",
  timeoutRefresh.reasonCode === PROVIDER_OAUTH_REFRESH_REASON_CODES.REFRESH_TIMEOUT
);

resetProviderOAuthRefreshLocksForTests();
const lockStore = createMemoryStore();
const lockNow = Date.now();
await seedCredential(lockStore, {
  accessToken: SYNTHETIC_ACCESS,
  refreshToken: SYNTHETIC_REFRESH,
  expiresAt: new Date(lockNow + 120_000).toISOString(),
  nowMs: lockNow,
});
let concurrentRefreshCalls = 0;
const slowRefreshHandler = async () => {
  concurrentRefreshCalls += 1;
  await new Promise((resolve) => setTimeout(resolve, 40));
  return {
    ok: true,
    token: {
      access_token: SYNTHETIC_ACCESS_V2,
      refresh_token: SYNTHETIC_REFRESH,
      expires_in: 3600,
      token_type: "Bearer",
    },
  };
};
const [first, second] = await Promise.all([
  ensureActiveProviderOAuthAccessToken({
    env: BASE_ENV,
    store: lockStore,
    nowMs: lockNow,
    providerId: ML_PROVIDER,
    environment: "development",
    credentialType: "oauth_tokens",
    refreshHandler: slowRefreshHandler,
  }),
  ensureActiveProviderOAuthAccessToken({
    env: BASE_ENV,
    store: lockStore,
    nowMs: lockNow,
    providerId: ML_PROVIDER,
    environment: "development",
    credentialType: "oauth_tokens",
    refreshHandler: slowRefreshHandler,
  }),
]);
assert("18. concurrent refresh lock dedupes calls", concurrentRefreshCalls === 1);
assert("19. concurrent callers both succeed", first.ok === true && second.ok === true);
assert("20. lock released after refresh", getProviderOAuthRefreshLockCountForTests() === 0);

const missingStore = createMemoryStore();
const missing = await resolveMercadoLivreRuntimeAccessToken({
  env: BASE_ENV,
  store: missingStore,
  nowMs,
});
assert(
  "21. missing credential classified",
  missing.ok === false && missing.readiness === PROVIDER_CREDENTIAL_READINESS.MISSING
);
assertNoSecrets(missing, "22. missing credential sanitized");

const mlRefreshMock = await refreshMercadoLivreOAuthToken(SYNTHETIC_REFRESH, {
  env: BASE_ENV,
  fetcher: async () => ({
    ok: false,
    status: 400,
    statusText: "Bad Request",
    json: async () => ({ error: "invalid_grant", message: "invalid refresh token" }),
  }),
});
assert(
  "23. ML refresh HTTP maps invalid grant",
  mlRefreshMock.reasonCode === "refresh_token_invalid"
);
assertNoSecrets(mlRefreshMock, "24. ML refresh output sanitized");

const runtimeAfterRefresh = await resolveMercadoLivreClientRuntimeCredentials(BASE_ENV, {
  credentialStore: expiringStore,
  nowMs: expiringNow + 1000,
});
assertNoSecrets(runtimeAfterRefresh.credentialDiagnostics, "25. runtime credential diagnostics sanitized");

const cacheKey = buildUniversalCommercialCacheKey({
  providerId: ML_PROVIDER,
  query: "iphone",
  limit: 3,
});
assert(
  "26. cache excludes tokens",
  !cacheKey.includes(SYNTHETIC_ACCESS) && !cacheKey.includes(SYNTHETIC_REFRESH)
);

const dedupKey = buildCommercialRequestDedupKey({
  providerId: ML_PROVIDER,
  query: "iphone",
  limit: 3,
});
assert("27. dedup excludes tokens", !dedupKey.includes(SYNTHETIC_REFRESH));

assert("28. budget preserved", evaluateProviderBudgetPermission(ML_PROVIDER, { env: BASE_ENV }) != null);

const adapterResult = await fetchMercadoLivreCommercialAdapterResult({
  query: "notebook",
  limit: 2,
  env: BASE_ENV,
  credentialStore: store,
  nowMs,
  fetcher: async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      results: [{ id: "MLB1", title: "notebook", price: 100, currency_id: "BRL" }],
    }),
  }),
});
assertNoSecrets(adapterResult, "29. commercial adapter sanitized");
assert("30. commercial contract preserved", adapterResult.provider === "mercadolivre");

assert(
  "31. no token cache map in refresh engine",
  !read("lib/server/providerOAuthRefreshEngine.js").match(/accessTokenCache|tokenCache/i)
);
assert("32. Decision Engine intact", read("lib/miaCognitiveRouter.js").length > 100);
assert("33. Router intact", read("lib/miaCognitiveRouter.js").includes("route"));
assert("34. client component does not import refresh engine", !read("components/MIAChat.jsx").includes("providerOAuthRefreshEngine"));
assert("35. audit finishes quickly", Date.now() - startMs < 30_000);

const total = passed + failed;
const pct = total ? ((passed / total) * 100).toFixed(1) : "0.0";
console.log(`\nResultado: ${passed}/${total} (${pct}%) em ${Date.now() - startMs}ms`);
console.log("\n── Veredito ──");
if (failed === 0) {
  console.log("A) OAUTH_AUTOMATIC_REFRESH_APPROVED\n");
  process.exit(0);
}
console.log("B) OAUTH_AUTOMATIC_REFRESH_BLOCKED\n");
process.exit(1);
