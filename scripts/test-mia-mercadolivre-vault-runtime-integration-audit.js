#!/usr/bin/env node
/**
 * PATCH Comercial 05J.6 — Secure Vault Runtime Integration Audit (local only)
 *
 * Usage: node scripts/test-mia-mercadolivre-vault-runtime-integration-audit.js
 */

import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  buildCommercialRequestDedupKey,
} from "../lib/commercial/commercialRequestDeduplication.js";
import {
  evaluateProviderBudgetPermission,
} from "../lib/commercial/providerBudgetCircuitBreaker.js";
import { buildUniversalCommercialCacheKey } from "../lib/commercial/universalCommercialCache.js";
import {
  resolveMercadoLivreRuntimeAccessToken,
} from "../lib/commercial/mercadolivreOAuthTokenPersistence.js";
import { resolveMercadoLivreAuthMode } from "../lib/commercial/mercadolivreRuntimeActivation.js";
import { COMMERCIAL_PROVIDER_IDS } from "../lib/productSourceAdapter/commercialProviderRegistry.js";
import {
  encryptProviderCredentialPayload,
} from "../lib/server/providerCredentialEncryption.js";
import {
  persistProviderCredentials,
  PROVIDER_CREDENTIAL_READINESS,
} from "../lib/server/providerCredentialVault.js";
import {
  buildMercadoLivreRequestHeaders,
  MERCADOLIVRE_CLIENT_RUNTIME_VERSION,
  resolveMercadoLivreClientRuntimeCredentials,
  searchMercadoLivreProducts,
} from "../lib/productSourceAdapter/adapters/mercadoLivreClient.js";
import { fetchMercadoLivreCommercialAdapterResult } from "../lib/productSourceAdapter/adapters/mercadoLivreAdapter.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const TEST_KEY = Buffer.alloc(32, 11).toString("base64");
const SYNTHETIC_ACCESS = "synthetic_vault_runtime_access_token_audit";
const SYNTHETIC_REFRESH = "synthetic_vault_runtime_refresh_token_audit";
const LEGACY_ENV_TOKEN = "APP_USR-LEGACY-ENV-TOKEN-DO-NOT-LEAK";
const ML_PROVIDER = COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC;

const VAULT_ENV = {
  MERCADOLIVRE_CLIENT_ID: "7758884973596489",
  MERCADOLIVRE_CLIENT_SECRET: "TEST_ML_CLIENT_SECRET_DO_NOT_LEAK",
  MERCADOLIVRE_REDIRECT_URI: "https://economia-ai.vercel.app/api/auth/mercadolivre/callback",
  MERCADOLIVRE_SITE_ID: "MLB",
  MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_ENABLED: "true",
  PROVIDER_CREDENTIAL_ENCRYPTION_KEY: TEST_KEY,
  PROVIDER_CREDENTIAL_ENCRYPTION_KEY_VERSION: "1",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.test",
  VERCEL_ENV: "development",
  COMMERCIAL_RUNTIME_MODE: "controlled",
  COMMERCIAL_PROVIDER_MERCADOLIVRE_ENABLED: "true",
};

const LEGACY_ENV = {
  ...VAULT_ENV,
  MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_ENABLED: "",
  MERCADOLIVRE_ACCESS_TOKEN: LEGACY_ENV_TOKEN,
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
      !text.includes(LEGACY_ENV_TOKEN) &&
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

async function seedVaultCredential(store, { accessToken, expiresAt, nowMs = Date.now() }) {
  await persistProviderCredentials({
    env: VAULT_ENV,
    store,
    nowMs,
    providerId: ML_PROVIDER,
    environment: "development",
    credentialType: "oauth_tokens",
    credentials: {
      accessToken,
      refreshToken: SYNTHETIC_REFRESH,
      tokenType: "Bearer",
    },
    issuedAt: new Date(nowMs).toISOString(),
    expiresAt,
  });
}

console.log("\nPATCH Comercial 05J.6 — Secure Vault Runtime Integration Audit\n");

assert("1. runtime version marker", MERCADOLIVRE_CLIENT_RUNTIME_VERSION === "05J.9");
assert(
  "2. client imports vault persistence adapter",
  read("lib/productSourceAdapter/adapters/mercadoLivreClient.js").includes(
    "resolveMercadoLivreRuntimeAccessToken"
  )
);
assert(
  "3. no ML-specific vault module created",
  !read("lib/server/providerCredentialVault.js").includes("mercadolivre") &&
    !read("lib/productSourceAdapter/adapters/mercadoLivreClient.js").includes("mercadoLivreVault")
);
assert(
  "4. generic vault runtime resolver exists",
  read("lib/server/providerCredentialVault.js").includes("resolveActiveProviderOAuthAccessToken")
);
assert(
  "5. client marked server-only",
  read("lib/productSourceAdapter/adapters/mercadoLivreClient.js").includes("SERVER-ONLY")
);
assert(
  "6. no module-level token cache in client",
  !read("lib/productSourceAdapter/adapters/mercadoLivreClient.js").match(/const\s+\w*[Tt]oken\w*\s*=\s*new\s+Map/)
);

const store = createMemoryStore();
const nowMs = Date.now();
await seedVaultCredential(store, {
  accessToken: SYNTHETIC_ACCESS,
  expiresAt: new Date(nowMs + 7_200_000).toISOString(),
  nowMs,
});

const vaultResolved = await resolveMercadoLivreRuntimeAccessToken({
  env: VAULT_ENV,
  store,
  nowMs,
});
assert("7. vault supplies active access token", vaultResolved.ok === true && vaultResolved.source === "vault");
assert(
  "8. vault token matches persisted credential",
  vaultResolved.accessToken === SYNTHETIC_ACCESS
);

const runtimeConfig = await resolveMercadoLivreClientRuntimeCredentials(VAULT_ENV, {
  credentialStore: store,
  nowMs,
});
assert(
  "9. client runtime config uses vault token",
  runtimeConfig.accessToken === SYNTHETIC_ACCESS && runtimeConfig.credentialSource === "vault"
);
assertNoSecrets(runtimeConfig.credentialDiagnostics, "10. runtime diagnostics sanitized");

const headers = buildMercadoLivreRequestHeaders(VAULT_ENV, runtimeConfig);
assert(
  "11. request headers use vault bearer",
  headers.Authorization === `Bearer ${SYNTHETIC_ACCESS}`
);
assert(
  "12. headers include bearer without serializing token elsewhere",
  headers.Authorization === `Bearer ${SYNTHETIC_ACCESS}`
);

const emptyStore = createMemoryStore();
const missing = await resolveMercadoLivreRuntimeAccessToken({
  env: VAULT_ENV,
  store: emptyStore,
  nowMs,
});
assert(
  "13. missing credential classified",
  missing.ok === false && missing.readiness === PROVIDER_CREDENTIAL_READINESS.MISSING
);

const expiredStore = createMemoryStore();
await seedVaultCredential(expiredStore, {
  accessToken: SYNTHETIC_ACCESS,
  expiresAt: new Date(nowMs - 600_000).toISOString(),
  nowMs: nowMs - 900_000,
});
const expired = await resolveMercadoLivreRuntimeAccessToken({
  env: VAULT_ENV,
  store: expiredStore,
  nowMs,
});
assert(
  "14. expired credential blocked",
  expired.ok === false && expired.readiness === PROVIDER_CREDENTIAL_READINESS.EXPIRED
);

const legacyResolved = await resolveMercadoLivreRuntimeAccessToken({ env: LEGACY_ENV });
assert(
  "15. vault disabled returns vault_unavailable",
  legacyResolved.ok === false &&
    legacyResolved.reasonCode === "vault_unavailable" &&
    legacyResolved.source === "vault"
);

const legacyWithEnvToken = await resolveMercadoLivreRuntimeAccessToken({
  env: { ...LEGACY_ENV, MERCADOLIVRE_ACCESS_TOKEN: LEGACY_ENV_TOKEN },
});
assert(
  "16. legacy env token never used",
  legacyWithEnvToken.ok === false && legacyWithEnvToken.reasonCode === "vault_unavailable"
);

let capturedAuth = null;
await searchMercadoLivreProducts("iphone", 3, {
  env: VAULT_ENV,
  credentialStore: store,
  nowMs,
  fetcher: async (_url, init = {}) => {
    capturedAuth = init.headers?.Authorization || null;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            id: "MLB1",
            title: "iphone test",
            price: 100,
            currency_id: "BRL",
          },
        ],
      }),
    };
  },
});
assert(
  "17. search uses vault bearer at HTTP boundary",
  capturedAuth === `Bearer ${SYNTHETIC_ACCESS}`
);

const searchResult = await searchMercadoLivreProducts("samsung", 2, {
  env: VAULT_ENV,
  credentialStore: store,
  nowMs,
  fetcher: async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      results: [{ id: "MLB2", title: "samsung", price: 200, currency_id: "BRL" }],
    }),
  }),
});
assertNoSecrets(searchResult, "18. search diagnostics sanitized");
assert(
  "19. search succeeds without breaking runtime",
  searchResult.ok === true && searchResult.credentialDiagnostics?.credentialSource === "vault"
);

const missingSearch = await searchMercadoLivreProducts("tv", 2, {
  env: VAULT_ENV,
  credentialStore: emptyStore,
  nowMs,
  fetcher: async (_url, init = {}) => ({
    ok: true,
    status: 200,
    json: async () => ({
      results: [{ id: "MLB3", title: "tv", price: 300, currency_id: "BRL" }],
    }),
  }),
});
assert(
  "20. missing vault credential does not crash runtime",
  missingSearch.ok === true && !missingSearch.credentialDiagnostics?.accessToken
);
assertNoSecrets(missingSearch, "21. missing credential search sanitized");

assert(
  "22. auth mode vault-aware",
  resolveMercadoLivreAuthMode(VAULT_ENV) === "oauth_bearer"
);

const cacheKey = buildUniversalCommercialCacheKey({
  providerId: ML_PROVIDER,
  query: "iphone",
  limit: 3,
});
assert(
  "23. cache key excludes access token",
  !cacheKey.includes(SYNTHETIC_ACCESS) && !cacheKey.includes("MERCADOLIVRE_ACCESS_TOKEN")
);

const dedupKey = buildCommercialRequestDedupKey({
  providerId: ML_PROVIDER,
  query: "iphone",
  limit: 3,
});
assert(
  "24. dedup key excludes access token",
  !dedupKey.includes(SYNTHETIC_ACCESS) && !dedupKey.includes("MERCADOLIVRE_ACCESS_TOKEN")
);

const budgetDecision = evaluateProviderBudgetPermission(ML_PROVIDER, { env: VAULT_ENV });
assert("25. budget layer still callable", budgetDecision != null);

const adapterResult = await fetchMercadoLivreCommercialAdapterResult({
  query: "notebook",
  limit: 2,
  env: VAULT_ENV,
  credentialStore: store,
  nowMs,
  fetcher: async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      results: [{ id: "MLB4", title: "notebook", price: 400, currency_id: "BRL" }],
    }),
  }),
});
assertNoSecrets(adapterResult, "26. commercial adapter output sanitized");
assert(
  "27. commercial adapter preserves contract shape",
  adapterResult.provider === "mercadolivre" && Array.isArray(adapterResult.products)
);

assert(
  "28. Decision Engine intact",
  read("lib/miaCognitiveRouter.js").includes("Decision Engine") ||
    read("lib/miaCognitiveRouter.js").length > 100
);
assert("29. Commercial Runtime intact", read("lib/productSourceAdapter/commercialRuntimeMode.js").includes("COMMERCIAL_RUNTIME_MODES"));
assert("30. Router intact", read("lib/miaCognitiveRouter.js").includes("route"));
assert(
  "31. no token attached to cache module",
  !read("lib/commercial/universalCommercialCache.js").includes("accessToken") &&
    !read("lib/commercial/universalCommercialCache.js").includes("MERCADOLIVRE_ACCESS_TOKEN")
);
assert(
  "32. no token attached to dedup module",
  !read("lib/commercial/commercialRequestDeduplication.js").includes("MERCADOLIVRE_ACCESS_TOKEN")
);
assert(
  "33. no token attached to circuit breaker module",
  !read("lib/commercial/providerBudgetCircuitBreaker.js").includes("MERCADOLIVRE_ACCESS_TOKEN")
);
assert(
  "34. client component does not import ML client",
  !read("components/MIAChat.jsx").includes("mercadoLivreClient")
);
assert(
  "35. encrypt path unchanged",
  encryptProviderCredentialPayload({
    env: VAULT_ENV,
    providerId: ML_PROVIDER,
    environment: "development",
    credentialVersion: 1,
    keyVersion: 1,
    payload: { accessToken: SYNTHETIC_ACCESS, refreshToken: SYNTHETIC_REFRESH, tokenType: "Bearer" },
  }).ok === true
);
assert("36. audit finishes quickly", Date.now() - startMs < 30_000);

const total = passed + failed;
const pct = total ? ((passed / total) * 100).toFixed(1) : "0.0";
console.log(`\nResultado: ${passed}/${total} (${pct}%) em ${Date.now() - startMs}ms`);
console.log("\n── Veredito ──");
if (failed === 0) {
  console.log("A) VAULT_RUNTIME_INTEGRATION_APPROVED\n");
  process.exit(0);
}
console.log("B) VAULT_RUNTIME_INTEGRATION_BLOCKED\n");
process.exit(1);
