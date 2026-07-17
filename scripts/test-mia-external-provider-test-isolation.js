/**
 * PATCH 11A.9A — External Provider Test Isolation
 */

process.env.MIA_TEST_MODE = "true";
process.env.MIA_EXTERNAL_PROVIDER_CALLS_ENABLED = "false";
process.env.MIA_PAID_PROVIDER_CALLS_ENABLED = "false";
process.env.SERPAPI_KEY = "present_but_must_not_authorize";
process.env.APIFY_API_TOKEN = "present_but_must_not_authorize";

import {
  bindActiveExternalCallAccounting,
  createRuntimeEnforcementContext,
} from "../lib/miaRuntimeEnforcement.js";
import {
  evaluateExternalProviderExecutionPolicy,
  EXTERNAL_BLOCK_REASON_CODES,
} from "../lib/commercial/externalProviderExecutionPolicy.js";
import {
  executeCommercialProviderProtectedFetch,
} from "../lib/commercial/providerBudgetCircuitBreaker.js";
import { COMMERCIAL_PROVIDER_IDS } from "../lib/productSourceAdapter/commercialProviderRegistry.js";

let passed = 0;
let failed = 0;

function expect(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed += 1;
  } else {
    console.log(`  ✗ ${label}`);
    failed += 1;
  }
}

console.log("\nPATCH 11A.9A — External Provider Test Isolation\n");

for (const providerId of [
  COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
  COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE,
  COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
]) {
  const policy = evaluateExternalProviderExecutionPolicy({ providerId, env: process.env });
  expect(
    policy.credentialReadiness === "ready" ||
      policy.credentialReadiness === "not_required" ||
      policy.credentialReadiness === "missing",
    `${providerId}: credential readiness tracked`
  );
  expect(policy.allowed === false, `${providerId}: blocked in test mode`);
}

{
  const ctx = createRuntimeEnforcementContext();
  bindActiveExternalCallAccounting(ctx);
  let fetchCalled = false;
  await executeCommercialProviderProtectedFetch({
    providerId: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
    env: process.env,
    executeExternalFetch: async () => {
      fetchCalled = true;
      return { ok: true, products: [] };
    },
  });
  expect(fetchCalled === false, "protected fetch blocked in test mode");
  expect(ctx.externalCallAccounting.executed === 0, "externalCallExecutedCount=0");
  expect(ctx.externalCallAccounting.paidExecuted === 0, "paidExternalCallExecutedCount=0");
  expect(ctx.externalCallAccounting.blocked >= 1, "externalCallBlockedCount>=1");
}

console.log(`\nResultado: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
