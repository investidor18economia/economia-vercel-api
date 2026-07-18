#!/usr/bin/env node
/**
 * PATCH Comercial 05J.9 — Legacy Token Removal Audit (local only)
 *
 * Usage: node scripts/test-mia-legacy-token-removal-audit.js
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_VERSION,
  resolveMercadoLivreRuntimeAccessToken,
} from "../lib/commercial/mercadolivreOAuthTokenPersistence.js";
import {
  MERCADOLIVRE_CLIENT_RUNTIME_VERSION,
  resolveMercadoLivreClientRuntimeCredentials,
} from "../lib/productSourceAdapter/adapters/mercadoLivreClient.js";
import { classifyMercadoLivreOAuthReadiness } from "../lib/commercial/mercadolivreOAuthTokenReadinessAudit.js";
import { buildMercadoLivreAuthenticatedProbePlan } from "../lib/commercial/mercadolivre403ProtectedFetchAudit.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LEGACY_TOKEN = "APP_USR-LEGACY-ENV-TOKEN-DO-NOT-LEAK";

const ALLOWED_REFERENCE_FILES = new Set([
  "lib/commercial/mercadolivreOAuthSanitization.js",
  "lib/server/providerAuthenticatedRuntimeProbe.js",
  "lib/commercial/mercadolivreOAuthTokenReadinessAudit.js",
  "lib/productSourceAdapter/adapters/mercadoLivreClient.js",
  "lib/commercial/mercadolivreVaultAuthenticatedRuntimeProbe.js",
  "scripts/test-mia-legacy-token-removal-audit.js",
  "scripts/test-mia-provider-authenticated-runtime-probe-audit.js",
  "scripts/test-mia-mercadolivre-oauth-token-readiness-audit.js",
  "scripts/test-mia-mercado-livre-client-real-isolated-audit.js",
  "scripts/test-mia-mercado-livre-products-search-fallback-audit.js",
  "scripts/test-mia-mercado-livre-product-id-flow-probe-audit.js",
  "scripts/run-mia-mercadolivre-vault-authenticated-probe.js",
  "scripts/test-mia-mercadolivre-vault-runtime-integration-audit.js",
  "scripts/test-mia-commercial-provider-registry-audit.js",
  "scripts/test-mia-mercadolivre-403-protected-fetch-audit.js",
  "scripts/test-mia-secure-provider-credential-vault-audit.js",
  "lib/commercial/mercadolivreOAuthCredentialValidationProbe.js",
  "lib/commercial/mercadolivreOAuthCredentialEnvironment.js",
  "scripts/run-mia-mercadolivre-oauth-credential-validation-probe.js",
  "scripts/test-mia-mercadolivre-oauth-credential-completion-audit.js",
  "lib/productSourceAdapter/adapters/dataForSeoGoogleShoppingClient.js",
  "scripts/run-mia-dataforseo-google-shopping-probe.js",
]);

const OPERATIONAL_DIRS = ["lib", "pages", "scripts"];

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

function read(relativePath) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function walkFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === ".git") continue;
      walkFiles(full, acc);
      continue;
    }
    if (/\.(js|ts|tsx|jsx|md|sql|json|env\.example)$/i.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

function relativeFromRoot(fullPath) {
  return fullPath.replace(`${ROOT}${fullPath.includes("\\") ? "\\" : "/"}`, "").replace(/\\/g, "/");
}

function findOperationalLegacyReads() {
  const hits = [];
  for (const dir of OPERATIONAL_DIRS) {
    const base = join(ROOT, dir);
    for (const file of walkFiles(base)) {
      const rel = relativeFromRoot(file);
      const content = readFileSync(file, "utf8");
      if (!content.includes("MERCADOLIVRE_ACCESS_TOKEN")) continue;
      if (ALLOWED_REFERENCE_FILES.has(rel)) continue;
      hits.push(rel);
    }
  }
  return hits;
}

console.log("\nPATCH Comercial 05J.9 — Legacy Token Removal Audit\n");

assert("1. persistence version marker", MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_VERSION === "05J.9");
assert("2. client runtime version marker", MERCADOLIVRE_CLIENT_RUNTIME_VERSION === "05J.9");

const persistenceSource = read("lib/commercial/mercadolivreOAuthTokenPersistence.js");
assert(
  "3. persistence module has no env token fallback",
  !persistenceSource.includes("allowEnvFallback") &&
    !persistenceSource.includes('env.MERCADOLIVRE_ACCESS_TOKEN') &&
    persistenceSource.includes("vault_unavailable")
);
const clientSource = read("lib/productSourceAdapter/adapters/mercadoLivreClient.js");
const readEnvBlock = clientSource.match(/function readEnv[\s\S]*?^}/m)?.[0] || "";
assert(
  "4. client readEnv has no operational env token read",
  !readEnvBlock.includes("MERCADOLIVRE_ACCESS_TOKEN")
);
assert(
  "4b. client redact supports legacy env sanitization only",
  clientSource.includes("redactMercadoLivreSecrets") &&
    clientSource.includes("legacyEnvToken")
);

const noVault = await resolveMercadoLivreRuntimeAccessToken({
  env: {
    MERCADOLIVRE_CLIENT_ID: "id",
    MERCADOLIVRE_CLIENT_SECRET: "secret",
    MERCADOLIVRE_REDIRECT_URI: "https://example.test/callback",
    MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_ENABLED: "",
    MERCADOLIVRE_ACCESS_TOKEN: LEGACY_TOKEN,
  },
});
assert(
  "5. legacy env token ignored at runtime",
  noVault.ok === false && noVault.reasonCode === "vault_unavailable" && noVault.source === "vault"
);

const runtimeCredentials = await resolveMercadoLivreClientRuntimeCredentials({
  MERCADOLIVRE_CLIENT_ID: "id",
  MERCADOLIVRE_CLIENT_SECRET: "secret",
  MERCADOLIVRE_REDIRECT_URI: "https://example.test/callback",
  MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_ENABLED: "",
  MERCADOLIVRE_ACCESS_TOKEN: LEGACY_TOKEN,
});
assert(
  "6. client runtime credentials fail closed without vault",
  !runtimeCredentials.accessToken && runtimeCredentials.credentialReasonCode === "vault_unavailable"
);

const readiness = classifyMercadoLivreOAuthReadiness({
  env: {
    MERCADOLIVRE_CLIENT_ID: "id",
    MERCADOLIVRE_CLIENT_SECRET: "secret",
    MERCADOLIVRE_REDIRECT_URI: "https://example.test/callback",
    MERCADOLIVRE_ACCESS_TOKEN: LEGACY_TOKEN,
  },
});
assert(
  "7. readiness audit uses vault not env token",
  readiness.blockers.includes("vault_unavailable") && !readiness.accessTokenPresent
);

const probePlan = buildMercadoLivreAuthenticatedProbePlan({
  env: {
    MERCADOLIVRE_CLIENT_ID: "id",
    MERCADOLIVRE_CLIENT_SECRET: "secret",
    MERCADOLIVRE_REDIRECT_URI: "https://example.test/callback",
    MERCADOLIVRE_ACCESS_TOKEN: LEGACY_TOKEN,
    COMMERCIAL_ML_AUTHENTICATED_PROBE_ENABLED: "true",
  },
});
assert(
  "8. authenticated probe plan requires vault",
  probePlan.mode === "vault_authenticated" && !probePlan.requiredEnv.MERCADOLIVRE_ACCESS_TOKEN
);

const operationalHits = findOperationalLegacyReads();
assert(
  "9. no unexpected operational MERCADOLIVRE_ACCESS_TOKEN reads",
  operationalHits.length === 0,
  operationalHits.join(", ")
);

assert(
  "10. vault-only flag in persistence contract",
  read("lib/commercial/mercadolivreOAuthTokenPersistence.js").includes("vaultOnlyCredentialSource")
);
assert(
  "11. production freeze no longer lists legacy access token env",
  !read("lib/commercial/commercialRuntimeProductionFreeze.js").includes("MERCADOLIVRE_ACCESS_TOKEN")
);
assert(
  "12. controlled probe script uses vault check",
  read("scripts/run-mia-mercadolivre-controlled-probe.js").includes("vault_unavailable") &&
    !read("scripts/run-mia-mercadolivre-controlled-probe.js").includes("MERCADOLIVRE_ACCESS_TOKEN missing")
);

const elapsedMs = Date.now() - startMs;
const total = passed + failed;
console.log(`\nResultado: ${passed}/${total} (${((passed / total) * 100).toFixed(1)}%) em ${elapsedMs}ms`);
const verdict = failed === 0 ? "A) LEGACY TOKEN REMOVAL PASSED" : "E) AUDIT_REJECTED";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(failed === 0 ? 0 : 1);
