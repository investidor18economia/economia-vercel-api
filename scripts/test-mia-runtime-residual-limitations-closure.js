/**
 * PATCH 11A.9A — Runtime Residual Limitations Closure
 */

import { runCommercialShadowPipeline } from "../lib/productSourceAdapter/commercialRuntimeShadow.js";
import { SHADOW_EXECUTION_POLICY } from "../lib/commercial/externalProviderExecutionPolicy.js";

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

console.log("\nPATCH 11A.9A — Runtime Residual Limitations Closure\n");

console.log("Grupo A — Shadow cost guard");
{
  const shadow = await runCommercialShadowPipeline({ query: "controle play", limit: 5 });
  expect(shadow.trace?.costGuardDecisions?.length === 2, "A: shadow cost guard decisions");
  expect(shadow.trace?.googleResult?.error === "cost_guard_blocked", "A: google blocked");
  expect(shadow.trace?.apifyResult?.error === "cost_guard_blocked", "A: apify blocked");
  expect(SHADOW_EXECUTION_POLICY.providerExecutionAllowed === false, "A: shadow policy default deny");
}

process.env.MIA_TEST_MODE = "true";
process.env.MIA_EXTERNAL_PROVIDER_CALLS_ENABLED = "false";
process.env.MIA_PAID_PROVIDER_CALLS_ENABLED = "false";
process.env.SERPAPI_KEY = "fake_key_present_for_safety_test";

const {
  authorizeProviderExecution,
  bindActiveExternalCallAccounting,
  createProviderAccounting,
  createRuntimeEnforcementContext,
  normalizeCostGuardBlockResult,
  recordProviderExecution,
  RUNTIME_ENFORCEMENT_VERSION,
} = await import("../lib/miaRuntimeEnforcement.js");
const {
  evaluateProviderCostGuardForProvider,
  PROVIDER_COST_GUARD_REASON_CODES,
} = await import("../lib/commercial/providerCostGuard.js");
const {
  evaluateExternalProviderExecutionPolicy,
  EXTERNAL_BLOCK_REASON_CODES,
  createExternalCallAccounting,
  recordExternalCallAccountingEvent,
} = await import("../lib/commercial/externalProviderExecutionPolicy.js");
const {
  evaluateProviderBudgetPermission,
  executeCommercialProviderProtectedFetch,
  resetProviderBudgetCircuitState,
  setProviderCircuitOpenUntilForTests,
  recordProviderExternalCall,
} = await import("../lib/commercial/providerBudgetCircuitBreaker.js");
const { COMMERCIAL_PROVIDER_IDS } = await import("../lib/productSourceAdapter/commercialProviderRegistry.js");
const { COMMERCIAL_PERMISSION } = await import("../lib/miaIntentAuthority.js");

console.log("\nGrupo C — External test isolation");
{
  const policy = evaluateExternalProviderExecutionPolicy({
    providerId: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
    env: process.env,
  });
  expect(policy.testMode === true, "C: test mode active");
  expect(policy.allowed === false, "C: paid blocked in test mode");
  expect(policy.reasonCode === EXTERNAL_BLOCK_REASON_CODES.BLOCKED_BY_TEST_POLICY, "C: test policy reason");
}

console.log("\nGrupo D — External call accounting");
{
  const acct = createExternalCallAccounting();
  recordExternalCallAccountingEvent(acct, {
    providerId: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
    allowed: false,
    blocked: true,
    reasonCode: EXTERNAL_BLOCK_REASON_CODES.BLOCKED_BY_TEST_POLICY,
  });
  expect(acct.considered === 1, "D: considered");
  expect(acct.blocked === 1, "D: blocked");
  expect(acct.executed === 0, "D: executed=0");
  expect(acct.paidExecuted === 0, "D: paid executed=0");
}

console.log("\nGrupo E — Budget block");
{
  resetProviderBudgetCircuitState(COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING);
  const env = {
    ...process.env,
    COMMERCIAL_PROVIDER_BUDGET_ENABLED: "true",
    COMMERCIAL_PROVIDER_DEFAULT_MAX_CALLS_PER_WINDOW: "1",
  };
  recordProviderExternalCall(COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING, { env });
  const permission = evaluateProviderBudgetPermission({
    providerId: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
    env,
  });
  expect(permission.shouldCallProvider === false, "E: budget deny");
  expect(permission.reasonCode === "budget_exhausted", "E: budget reason");
  const pa = createProviderAccounting();
  recordProviderExecution(pa, {
    providerId: "serpapi",
    executed: false,
    blockedReason: "budget_blocked",
  });
  expect(pa.blockedByBudget === 1, "E: blockedByBudget");
  expect(pa.executed === 0, "E: executed=0");
}

console.log("\nGrupo F — Circuit block");
{
  resetProviderBudgetCircuitState(COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE);
  setProviderCircuitOpenUntilForTests(
    COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE,
    Date.now() + 60_000
  );
  const permission = evaluateProviderBudgetPermission({
    providerId: COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE,
    env: process.env,
  });
  expect(permission.shouldCallProvider === false, "F: circuit deny");
  const pa = createProviderAccounting();
  recordProviderExecution(pa, {
    providerId: "apify",
    executed: false,
    blockedReason: "circuit_breaker_open",
  });
  expect(pa.blockedByCircuit === 1, "F: blockedByCircuit");
}

console.log("\nGrupo G — Missing credentials");
{
  const decision = evaluateProviderCostGuardForProvider(COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING, {
    env: { ...process.env, SERPAPI_KEY: "" },
    enforceCredentialReadiness: true,
    contextProvided: true,
    _contextProvided: true,
  });
  expect(decision.shouldCallProvider === false, "G: credentials block");
  expect(
    decision.reasonCode === PROVIDER_COST_GUARD_REASON_CODES.BLOCKED_BY_MISSING_CREDENTIALS,
    "G: missing credentials reason"
  );
  const pa = createProviderAccounting();
  recordProviderExecution(pa, {
    providerId: "serpapi",
    executed: false,
    blockedReason: PROVIDER_COST_GUARD_REASON_CODES.BLOCKED_BY_MISSING_CREDENTIALS,
  });
  expect(pa.blockedByCredentials === 1, "G: blockedByCredentials");
}

console.log("\nGrupo I — Gate deny");
{
  const pa = createProviderAccounting();
  authorizeProviderExecution({
    providerId: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
    intentAuthority: { commercialPermission: COMMERCIAL_PERMISSION.DENY },
    commercialEntryGate: { commercialEntryAllowed: false },
    providerAccounting: pa,
  });
  expect(pa.blockedByGate >= 1, "I: gate deny");
  expect(pa.executed === 0, "I: executed=0");
}

console.log("\nGrupo L — Credentials present safety");
{
  let executed = false;
  const ctx = createRuntimeEnforcementContext();
  bindActiveExternalCallAccounting(ctx);
  const result = await executeCommercialProviderProtectedFetch({
    providerId: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
    env: process.env,
    executeExternalFetch: async () => {
      executed = true;
      return { ok: true, products: [{ product_name: "x" }] };
    },
  });
  expect(executed === false, "L: no external fetch in test mode");
  expect(result.externalCallPrevented === true || result.error === "test_policy_blocked", "L: blocked");
  expect(ctx.externalCallAccounting.paidExecuted === 0, "L: paidExecuted=0");
}

console.log("\nGrupo — Cost guard normalization");
{
  const normalized = normalizeCostGuardBlockResult({
    shouldCallProvider: false,
    reasonCode: PROVIDER_COST_GUARD_REASON_CODES.BLOCKED_BY_TEST_POLICY,
    externalCallPrevented: true,
  });
  expect(normalized.applied === true, "normalization: applied");
  expect(normalized.category === "test_policy", "normalization: category");
}

console.log("\nGrupo — Version");
{
  expect(RUNTIME_ENFORCEMENT_VERSION === "11A.9A.1", "version 11A.9A.1");
}

console.log(`\nResultado: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
