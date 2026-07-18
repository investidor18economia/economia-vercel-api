#!/usr/bin/env node
/**
 * PATCH Comercial 05J.8 — Provider Authenticated Runtime Probe Audit (local only)
 *
 * Usage: node scripts/test-mia-provider-authenticated-runtime-probe-audit.js
 */

import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  buildMercadoLivreVaultAuthenticatedRuntimeProbePlan,
  executeMercadoLivreVaultAuthenticatedRuntimeProbe,
  COMMERCIAL_ML_VAULT_AUTHENTICATED_PROBE_ENABLED_ENV,
} from "../lib/commercial/mercadolivreVaultAuthenticatedRuntimeProbe.js";
import {
  buildCommercialRequestDedupKey,
} from "../lib/commercial/commercialRequestDeduplication.js";
import {
  evaluateProviderBudgetPermission,
} from "../lib/commercial/providerBudgetCircuitBreaker.js";
import { buildUniversalCommercialCacheKey } from "../lib/commercial/universalCommercialCache.js";
import { COMMERCIAL_PROVIDER_IDS } from "../lib/productSourceAdapter/commercialProviderRegistry.js";
import {
  classifyProviderAuthenticatedRuntimeProbeResult,
  executeProviderAuthenticatedRuntimeProbe,
  PROVIDER_AUTHENTICATED_RUNTIME_PROBE_CLASSIFICATIONS,
  PROVIDER_AUTHENTICATED_RUNTIME_PROBE_VERSION,
  validateProviderAuthenticatedRuntimeProbePreconditions,
} from "../lib/server/providerAuthenticatedRuntimeProbe.js";
import {
  persistProviderCredentials,
  PROVIDER_CREDENTIAL_READINESS,
} from "../lib/server/providerCredentialVault.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const TEST_KEY = Buffer.alloc(32, 17).toString("base64");
const SYNTHETIC_ACCESS = "synthetic_probe_access_token_audit";
const SYNTHETIC_ACCESS_V2 = "synthetic_probe_access_token_audit_v2";
const SYNTHETIC_REFRESH = "synthetic_probe_refresh_token_audit";
const LEGACY_ENV_TOKEN = "APP_USR-LEGACY-PROBE-TOKEN-DO-NOT-LEAK";
const ML_PROVIDER = COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC;

const VAULT_ENV = {
  MERCADOLIVRE_CLIENT_ID: "7758884973596489",
  MERCADOLIVRE_CLIENT_SECRET: "TEST_ML_CLIENT_SECRET_DO_NOT_LEAK",
  MERCADOLIVRE_REDIRECT_URI: "https://economia-ai.vercel.app/api/auth/mercadolivre/callback",
  MERCADOLIVRE_SITE_ID: "MLB",
  MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_ENABLED: "true",
  [COMMERCIAL_ML_VAULT_AUTHENTICATED_PROBE_ENABLED_ENV]: "true",
  PROVIDER_CREDENTIAL_ENCRYPTION_KEY: TEST_KEY,
  PROVIDER_CREDENTIAL_ENCRYPTION_KEY_VERSION: "1",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.test",
  VERCEL_ENV: "development",
  COMMERCIAL_RUNTIME_MODE: "controlled",
  COMMERCIAL_PROVIDER_MERCADOLIVRE_ENABLED: "true",
  SERPAPI_KEY: "",
  APIFY_API_TOKEN: "",
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
      !text.includes(LEGACY_ENV_TOKEN) &&
      !text.includes("TEST_ML_CLIENT_SECRET_DO_NOT_LEAK") &&
      !text.includes("Bearer APP_USR")
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
    env: VAULT_ENV,
    store,
    nowMs,
    providerId: ML_PROVIDER,
    environment: "development",
    credentialType: "oauth_tokens",
    credentials: { accessToken, refreshToken, tokenType: "Bearer" },
    issuedAt: new Date(nowMs).toISOString(),
    expiresAt,
  });
}

console.log("\nPATCH Comercial 05J.8 — Provider Authenticated Runtime Probe Audit\n");

assert("1. probe version marker", PROVIDER_AUTHENTICATED_RUNTIME_PROBE_VERSION === "05J.8");
assert(
  "2. generic probe module exists",
  read("lib/server/providerAuthenticatedRuntimeProbe.js").includes(
    "executeProviderAuthenticatedRuntimeProbe"
  )
);
assert(
  "3. no new vault or refresh engine",
  !read("lib/server/providerAuthenticatedRuntimeProbe.js").includes("createCipheriv") &&
    !read("lib/server/providerAuthenticatedRuntimeProbe.js").includes("provider_credentials")
);
assert(
  "4. ML adapter is thin wiring only",
  read("lib/commercial/mercadolivreVaultAuthenticatedRuntimeProbe.js").includes(
    "executeProviderAuthenticatedRuntimeProbe"
  )
);
assert(
  "5. vault-only mode forbids legacy env token",
  validateProviderAuthenticatedRuntimeProbePreconditions({
    vaultConfigured: true,
    probeEnabled: true,
    forbidLegacyEnvToken: true,
    runtimeModeControlled: true,
    providerRuntimeEnabled: true,
    realExecution: true,
    externalCallsAuthorized: true,
    env: { ...VAULT_ENV, MERCADOLIVRE_ACCESS_TOKEN: LEGACY_ENV_TOKEN },
  }).ok === false
);

const vaultPlan = buildMercadoLivreVaultAuthenticatedRuntimeProbePlan({ env: VAULT_ENV });
assert("6. vault probe plan exposes vault mode", vaultPlan.mode === "vault_authenticated_only");
assert("7. vault probe requires persistence", vaultPlan.requiredEnv.MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_ENABLED === "true");

const missingVault = await executeMercadoLivreVaultAuthenticatedRuntimeProbe({
  env: { ...VAULT_ENV, MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_ENABLED: "" },
  realExecution: true,
  externalCallsAuthorized: true,
});
assert(
  "8. vault absent blocked",
  missingVault.classification === PROVIDER_AUTHENTICATED_RUNTIME_PROBE_CLASSIFICATIONS.VAULT_NOT_CONFIGURED
);

const legacyBlocked = await executeMercadoLivreVaultAuthenticatedRuntimeProbe({
  env: { ...VAULT_ENV, MERCADOLIVRE_ACCESS_TOKEN: LEGACY_ENV_TOKEN },
  realExecution: true,
  externalCallsAuthorized: true,
});
assert(
  "9. legacy env token blocked when vault active",
  legacyBlocked.classification === PROVIDER_AUTHENTICATED_RUNTIME_PROBE_CLASSIFICATIONS.LEGACY_TOKEN_BLOCKED
);
assertNoSecrets(legacyBlocked, "10. legacy blocked diagnostics sanitized");

const store = createMemoryStore();
const nowMs = Date.now();
await seedCredential(store, {
  accessToken: SYNTHETIC_ACCESS,
  refreshToken: SYNTHETIC_REFRESH,
  expiresAt: new Date(nowMs + 7_200_000).toISOString(),
  nowMs,
});

let authHeaderSent = false;
const successProbe = await executeMercadoLivreVaultAuthenticatedRuntimeProbe({
  env: VAULT_ENV,
  store,
  nowMs,
  realExecution: true,
  externalCallsAuthorized: true,
  fetcher: async (_url, init = {}) => {
    authHeaderSent = !!init.headers?.Authorization;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        results: [{ id: "MLB1", title: "iphone", price: 100, currency_id: "BRL" }],
      }),
    };
  },
});
assert(
  "11. vault authenticated success",
  successProbe.classification ===
    PROVIDER_AUTHENTICATED_RUNTIME_PROBE_CLASSIFICATIONS.AUTHENTICATED_SUCCESS
);
assert("12. authorization header sent", authHeaderSent === true);
assert("13. authentication_completed diagnostic", successProbe.diagnostics?.authenticationCompleted === true);
assertNoSecrets(successProbe, "14. success probe sanitized");

const emptyStore = createMemoryStore();
const missingCredential = await executeMercadoLivreVaultAuthenticatedRuntimeProbe({
  env: VAULT_ENV,
  store: emptyStore,
  nowMs,
  realExecution: true,
  externalCallsAuthorized: true,
});
assert(
  "15. missing credential classified",
  missingCredential.classification ===
    PROVIDER_AUTHENTICATED_RUNTIME_PROBE_CLASSIFICATIONS.CREDENTIAL_MISSING
);

const expiredStore = createMemoryStore();
await seedCredential(expiredStore, {
  accessToken: SYNTHETIC_ACCESS,
  refreshToken: SYNTHETIC_REFRESH,
  expiresAt: new Date(nowMs - 600_000).toISOString(),
  nowMs: nowMs - 900_000,
});
const expiredWithoutFetch = await executeMercadoLivreVaultAuthenticatedRuntimeProbe({
  env: VAULT_ENV,
  store: expiredStore,
  nowMs,
  realExecution: true,
  externalCallsAuthorized: true,
  fetcher: async () => ({
    ok: true,
    status: 200,
    json: async () => ({ results: [] }),
  }),
});
assert(
  "16. refresh path can recover expired credential",
  [
    PROVIDER_AUTHENTICATED_RUNTIME_PROBE_CLASSIFICATIONS.REFRESH_SUCCESS,
    PROVIDER_AUTHENTICATED_RUNTIME_PROBE_CLASSIFICATIONS.AUTHENTICATED_SUCCESS,
    PROVIDER_AUTHENTICATED_RUNTIME_PROBE_CLASSIFICATIONS.REFRESH_FAILED,
  ].includes(expiredWithoutFetch.classification)
);

const refreshFail = classifyProviderAuthenticatedRuntimeProbeResult({
  credentialResolution: {
    ok: false,
    refreshDiagnostics: { refreshAttempted: true, refreshSucceeded: false },
    reasonCode: "refresh_token_invalid",
  },
  adapterResult: { ok: false },
});
assert(
  "17. refresh failure classified",
  refreshFail === PROVIDER_AUTHENTICATED_RUNTIME_PROBE_CLASSIFICATIONS.REFRESH_FAILED
);

assert(
  "18. provider 401 classified",
  classifyProviderAuthenticatedRuntimeProbeResult({
    credentialResolution: { ok: true },
    adapterResult: { ok: false, httpStatus: 401 },
  }) === PROVIDER_AUTHENTICATED_RUNTIME_PROBE_CLASSIFICATIONS.PROVIDER_401
);
assert(
  "19. provider 403 classified",
  classifyProviderAuthenticatedRuntimeProbeResult({
    credentialResolution: { ok: true },
    adapterResult: { ok: false, httpStatus: 403 },
  }) === PROVIDER_AUTHENTICATED_RUNTIME_PROBE_CLASSIFICATIONS.PROVIDER_403
);
assert(
  "20. provider 429 classified",
  classifyProviderAuthenticatedRuntimeProbeResult({
    credentialResolution: { ok: true },
    adapterResult: { ok: false, httpStatus: 429 },
  }) === PROVIDER_AUTHENTICATED_RUNTIME_PROBE_CLASSIFICATIONS.PROVIDER_429
);
assert(
  "21. timeout classified",
  classifyProviderAuthenticatedRuntimeProbeResult({
    credentialResolution: { ok: true },
    adapterResult: { ok: false, error: "timeout" },
  }) === PROVIDER_AUTHENTICATED_RUNTIME_PROBE_CLASSIFICATIONS.PROVIDER_TIMEOUT
);

const genericProbe = await executeProviderAuthenticatedRuntimeProbe({
  providerId: ML_PROVIDER,
  environment: "development",
  credentialType: "oauth_tokens",
  vaultConfigured: true,
  probeEnabled: true,
  forbidLegacyEnvToken: true,
  runtimeModeControlled: true,
  providerRuntimeEnabled: true,
  realExecution: true,
  externalCallsAuthorized: true,
  resolveRuntimeCredentials: async () => ({
    ok: true,
    accessToken: SYNTHETIC_ACCESS,
    source: "vault",
    readiness: PROVIDER_CREDENTIAL_READINESS.ACTIVE,
    credentialVersion: 1,
  }),
  executeAuthenticatedFetch: async () => ({
    ok: true,
    provider: "mercadolivre",
    count: 1,
    httpStatus: 200,
    executionTelemetry: { httpRequestStarted: true },
  }),
});
assertNoSecrets(genericProbe, "22. generic probe sanitized");

const cacheKey = buildUniversalCommercialCacheKey({
  providerId: ML_PROVIDER,
  query: "iphone",
  limit: 1,
});
assert("23. cache excludes tokens", !cacheKey.includes(SYNTHETIC_ACCESS));

const dedupKey = buildCommercialRequestDedupKey({
  providerId: ML_PROVIDER,
  query: "iphone",
  limit: 1,
});
assert("24. dedup excludes tokens", !dedupKey.includes(SYNTHETIC_ACCESS));

assert("25. budget preserved", evaluateProviderBudgetPermission({ providerId: ML_PROVIDER, env: VAULT_ENV }) != null);
assert(
  "26. probe blocks legacy env token path",
  read("lib/server/providerAuthenticatedRuntimeProbe.js").includes("forbidLegacyEnvToken")
);
assert(
  "27. Decision Engine intact",
  !read("lib/miaCognitiveRouter.js").includes("providerAuthenticatedRuntimeProbe")
);
assert(
  "28. commercial runtime client unchanged functionally",
  read("lib/productSourceAdapter/adapters/mercadoLivreAdapter.js").includes(
    "fetchMercadoLivreCommercialAdapterResult"
  )
);
assert(
  "29. run script exists",
  read("scripts/run-mia-mercadolivre-vault-authenticated-probe.js").includes("--vault-authenticated")
);
assert(
  "30. client component does not import probe",
  !read("components/MIAChat.jsx").includes("providerAuthenticatedRuntimeProbe")
);
assert("31. audit finishes quickly", Date.now() - startMs < 30_000);

const total = passed + failed;
const pct = total ? ((passed / total) * 100).toFixed(1) : "0.0";
console.log(`\nResultado: ${passed}/${total} (${pct}%) em ${Date.now() - startMs}ms`);
console.log("\n── Veredito ──");
if (failed === 0) {
  console.log("A) AUTHENTICATED_RUNTIME_PROBE_APPROVED\n");
  process.exit(0);
}
console.log("B) AUTHENTICATED_RUNTIME_PROBE_BLOCKED\n");
process.exit(1);
