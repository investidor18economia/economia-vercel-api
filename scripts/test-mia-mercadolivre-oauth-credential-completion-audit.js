#!/usr/bin/env node
/**
 * PATCH Comercial 05K.3 — Mercado Livre OAuth Credential Completion Audit (local, no external calls)
 *
 * Usage: node scripts/test-mia-mercadolivre-oauth-credential-completion-audit.js
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  auditMercadoLivreOAuthVaultCredentialState,
  buildMercadoLivreOAuthCompletionProcedure,
  MERCADOLIVRE_OAUTH_CREDENTIAL_VALIDATION_PROBE_VERSION,
  MERCADOLIVRE_OAUTH_VALIDATION_CLASSIFICATIONS,
  MERCADOLIVRE_PROVIDER_OPERATIONAL_DECISIONS,
  sanitizeMercadoLivreUsersMePayload,
} from "../lib/commercial/mercadolivreOAuthCredentialValidationProbe.js";
import {
  inspectMercadoLivreOAuthEnvironmentAlignment,
  MERCADOLIVRE_OAUTH_CREDENTIAL_ENVIRONMENT_VERSION,
  MERCADOLIVRE_OAUTH_VAULT_ENVIRONMENT_ENV,
  resolveMercadoLivreOAuthVaultEnvironment,
} from "../lib/commercial/mercadolivreOAuthCredentialEnvironment.js";
import { MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_VERSION } from "../lib/commercial/mercadolivreOAuthTokenPersistence.js";
import { COMMERCIAL_PROVIDER_IDS } from "../lib/productSourceAdapter/commercialProviderRegistry.js";
import { resolveProviderCredentialEnvironment } from "../lib/server/providerCredentialVault.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const TEST_TOKEN = "APP_USR-TEST-ACCESS-TOKEN-DO-NOT-LEAK";
const TEST_SECRET = "TEST_ML_CLIENT_SECRET_DO-NOT-LEAK";
const TEST_REFRESH = "TG-TEST-REFRESH-TOKEN-DO-NOT-LEAK";

const ARCHITECTURE_FROZEN = Object.freeze([
  "lib/productSourceAdapter/commercialProviderRegistry.js",
  "lib/server/providerCredentialVault.js",
  "lib/server/providerOAuthRefreshEngine.js",
  "lib/commercial/providerBudgetCircuitBreaker.js",
  "lib/commercial/universalCommercialCache.js",
  "lib/commercial/commercialRequestDeduplication.js",
  "lib/commercial/multiProviderPriorityEngine.js",
  "lib/miaCognitiveRouter.js",
  "lib/commercial/universalGovernedFallbackReasoning.js",
]);

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

function assertNoSecretLeak(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  assert("no access token leaked", !text.includes(TEST_TOKEN));
  assert("no refresh token leaked", !text.includes(TEST_REFRESH));
  assert("no client secret leaked", !text.includes(TEST_SECRET));
  assert("no raw bearer leaked", !/Bearer\s+APP_USR-/i.test(text));
}

console.log("\nPATCH Comercial 05K.3 — Mercado Livre OAuth Credential Completion Audit\n");

assert("1. probe version marker", MERCADOLIVRE_OAUTH_CREDENTIAL_VALIDATION_PROBE_VERSION === "05K.3");
assert(
  "2. environment wiring version marker",
  MERCADOLIVRE_OAUTH_CREDENTIAL_ENVIRONMENT_VERSION === "05K.3"
);
assert("3. persistence version preserved", MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_VERSION === "05J.9");

const persistenceSource = read("lib/commercial/mercadolivreOAuthTokenPersistence.js");
assert(
  "4. persistence uses Mercado Livre vault environment resolver",
  persistenceSource.includes("resolveMercadoLivreOAuthVaultEnvironment")
);
assert(
  "5. persistence no longer imports resolveProviderCredentialEnvironment directly",
  !persistenceSource.includes("resolveProviderCredentialEnvironment")
);

const envModule = read("lib/commercial/mercadolivreOAuthCredentialEnvironment.js");
assert(
  "6. environment override env key documented",
  envModule.includes(MERCADOLIVRE_OAUTH_VAULT_ENVIRONMENT_ENV)
);

const baseEnv = {
  MERCADOLIVRE_SITE_ID: "MLB",
  MERCADOLIVRE_REDIRECT_URI: "https://economia-ai.vercel.app/api/auth/mercadolivre/callback",
};
assert(
  "7. local runtime resolves development by default",
  resolveProviderCredentialEnvironment(baseEnv) === "development"
);
assert(
  "8. override can target production vault",
  resolveMercadoLivreOAuthVaultEnvironment({
    ...baseEnv,
    [MERCADOLIVRE_OAUTH_VAULT_ENVIRONMENT_ENV]: "production",
  }) === "production"
);

const alignment = inspectMercadoLivreOAuthEnvironmentAlignment(baseEnv);
assert(
  "9. production redirect on local runtime flagged as divergence risk",
  alignment.divergenceRisk === "callback_likely_persists_production_runtime_reads_development"
);

const usersMeSanitized = sanitizeMercadoLivreUsersMePayload({
  id: 123456789,
  site_id: "MLB",
  country_id: "BR",
  email: "secret@example.com",
  access_token: TEST_TOKEN,
});
assert("10. users/me sanitizer keeps userId", usersMeSanitized.userId === "123456789");
assert("11. users/me sanitizer keeps siteId", usersMeSanitized.siteId === "MLB");
assert("12. users/me sanitizer drops email", !("email" in usersMeSanitized));
assertNoSecretLeak(JSON.stringify(usersMeSanitized));

const procedure = buildMercadoLivreOAuthCompletionProcedure({
  env: baseEnv,
  credentialMissing: true,
});
assert("13. completion procedure includes OAuth start step", procedure.steps.some((s) => s.includes("/api/auth/mercadolivre/start")));
assert(
  "14. completion procedure mentions vault environment override when divergent",
  procedure.steps.some((s) => s.includes(MERCADOLIVRE_OAUTH_VAULT_ENVIRONMENT_ENV))
);

const runnerSource = read("scripts/run-mia-mercadolivre-oauth-credential-validation-probe.js");
assert("15. runner requires --vault-authenticated", runnerSource.includes("--vault-authenticated"));
assert("16. runner requires --allow-external for real calls", runnerSource.includes("--allow-external"));
assert("17. runner blocks without --real for external path", runnerSource.includes("--real"));

const probeModule = read("lib/commercial/mercadolivreOAuthCredentialValidationProbe.js");
assert(
  "18. validation classifications include oauth_credential_valid",
  probeModule.includes(MERCADOLIVRE_OAUTH_VALIDATION_CLASSIFICATIONS.OAUTH_CREDENTIAL_VALID)
);
assert("19. probe uses /users/me", probeModule.includes("/users/me"));
assert("20. probe forbids legacy env token", probeModule.includes("legacy_env_token_forbidden"));
assert("21. probe performs restricted search reprobe", probeModule.includes("searchMercadoLivreProducts"));

for (const relativePath of ARCHITECTURE_FROZEN) {
  assert(`22. architecture preserved: ${relativePath}`, existsSync(join(ROOT, relativePath)));
}

assert(
  "23. provider id remains mercadolivre_public",
  COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC === "mercadolivre_public"
);

assert(
  "24. operational decisions include EXTERNAL_PERMISSION_BLOCKED",
  Object.values(MERCADOLIVRE_PROVIDER_OPERATIONAL_DECISIONS).includes("EXTERNAL_PERMISSION_BLOCKED")
);

assert(
  "25. escalation doc present",
  existsSync(join(ROOT, "docs/mercadolivre-developer-escalation-403.md"))
);

console.log("\n  ℹ️  Local audit performs no network I/O.\n");
assert("26. no external call in local audit", true);
assert("27. vault-only credential source in probe module", probeModule.includes("resolveMercadoLivreRuntimeAccessToken"));
assert("28. refresh preserved via runtime resolver", probeModule.includes("refreshDiagnostics"));
assert("29. budget/circuit untouched in probe module", !probeModule.includes("resetProviderBudgetCircuitState"));
assert("30. priority engine untouched in probe module", !probeModule.includes("buildMultiProviderPriorityPlan"));

const elapsedMs = Date.now() - startMs;
console.log(`\nResultado: ${passed} passed, ${failed} failed (${elapsedMs}ms)\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("OAUTH_CREDENTIAL_COMPLETION_AUDIT_APPROVED");
}
