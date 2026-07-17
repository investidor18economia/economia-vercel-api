/**
 * PATCH 11A.9 — Provider Accounting Uniformity (dedup + cost guard)
 */

import {
  applyCommercialDedupEventToAccounting,
  attachCommercialDedupAccountingObserver,
  authorizeProviderExecution,
  createProviderAccounting,
  createRuntimeEnforcementContext,
  mapCostGuardReasonToBlockCategory,
  recordProviderCostGuardBlock,
  recordProviderExecution,
  validateProviderAccountingConsistency,
  RUNTIME_ENFORCEMENT_VERSION,
} from "../lib/miaRuntimeEnforcement.js";
import {
  COMMERCIAL_REQUEST_DEDUP_STATUS,
  createCommercialRequestDedupContext,
  executeCommercialRequestWithDeduplication,
} from "../lib/commercial/commercialRequestDeduplication.js";
import {
  PROVIDER_COST_GUARD_REASON_CODES,
  evaluateProviderCostGuardForProvider,
  buildDevEndpointProviderCostGuardContext,
} from "../lib/commercial/providerCostGuard.js";
import { COMMERCIAL_PERMISSION } from "../lib/miaIntentAuthority.js";

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

async function runTests() {
console.log("\nPATCH 11A.9 — Provider Accounting Uniformity\n");

console.log("Grupo A — Dedup central contract");
{
  const ctx = createRuntimeEnforcementContext();
  applyCommercialDedupEventToAccounting(ctx, {
    hit: true,
    status: COMMERCIAL_REQUEST_DEDUP_STATUS.IN_FLIGHT_REUSE,
    providerId: "google_shopping",
    externalCallPrevented: true,
    canonicalKeyHash: "abc123",
    at: Date.now(),
  });
  expect(ctx.providerAccounting.deduplicated === 1, "A: dedup hit counted centrally");
  expect(ctx.providerAccounting.inFlightPromiseReuse === 1, "A: in-flight reuse counted");

  applyCommercialDedupEventToAccounting(ctx, {
    hit: true,
    status: COMMERCIAL_REQUEST_DEDUP_STATUS.IN_FLIGHT_REUSE,
    providerId: "google_shopping",
    externalCallPrevented: true,
    canonicalKeyHash: "abc123",
    at: Date.now(),
  });
  expect(ctx.providerAccounting.deduplicated === 1, "A: no double dedup count");
}

console.log("\nGrupo B — Dedup miss vs hit execution");
{
  let executions = 0;
  const dedupContext = createCommercialRequestDedupContext({ requestId: "test-1" });
  attachCommercialDedupAccountingObserver(dedupContext, createRuntimeEnforcementContext());

  const run = () =>
    executeCommercialRequestWithDeduplication({
      commercialRequestDedupContext: dedupContext,
      providerId: "google_shopping",
      query: "iphone 15",
      execute: async () => {
        executions += 1;
        return { ok: true, products: [{ product_name: "iPhone 15" }] };
      },
    });

  await Promise.all([run(), run()]);
  expect(executions === 1, "B: single provider execution on concurrent dedup");
  expect(
    dedupContext.events.filter((event) => event.hit === true).length >= 1,
    "B: dedup hit event recorded"
  );
}

console.log("\nGrupo C — Cache vs dedup distinction");
{
  const pa = createProviderAccounting();
  recordProviderExecution(pa, {
    providerId: "supabasecache",
    executed: false,
    cacheHit: true,
    success: true,
    resultCount: 2,
  });
  recordProviderExecution(pa, {
    providerId: "google_shopping",
    executed: false,
    deduplicated: true,
    success: true,
    resultCount: 2,
  });
  expect(pa.servedFromCache === 1, "C: cache hit counted");
  expect(pa.executed === 0, "C: cache/dedup do not increment executed");
}

console.log("\nGrupo D — Budget block accounting");
{
  const pa = createProviderAccounting();
  pa.attempted += 1;
  const decision = evaluateProviderCostGuardForProvider("google_shopping", {
    ...buildDevEndpointProviderCostGuardContext(),
    hasExplicitPaidProviderOptIn: false,
  });
  recordProviderCostGuardBlock(pa, { providerId: "serpapi", decision });
  expect(decision.shouldCallProvider !== true, "D: dev paid dry-run blocks call");
  expect(pa.blockedByEnvironment >= 1 || pa.blockedByBudget >= 1, "D: block category incremented");
  expect(pa.executed === 0, "D: budget block executed=0");
}

console.log("\nGrupo E — Gate deny");
{
  const pa = createProviderAccounting();
  authorizeProviderExecution({
    providerId: "google_shopping",
    intentAuthority: { commercialPermission: COMMERCIAL_PERMISSION.DENY },
    commercialEntryGate: { commercialEntryAllowed: false },
    providerAccounting: pa,
  });
  expect(pa.blockedByGate >= 1, "E: gate deny blocked");
  expect(pa.executed === 0, "E: gate deny executed=0");
}

console.log("\nGrupo F — Accounting consistency invariants");
{
  const pa = createProviderAccounting();
  pa.attempted = 2;
  pa.executed = 1;
  pa.deduplicated = 1;
  const check = validateProviderAccountingConsistency(pa);
  expect(check.valid === true, "F: attempted=executed+dedup valid");
}

console.log("\nGrupo G — Version");
{
  expect(RUNTIME_ENFORCEMENT_VERSION === "11A.9A.1", "G: enforcement version");
  expect(
    mapCostGuardReasonToBlockCategory(PROVIDER_COST_GUARD_REASON_CODES.PROVIDER_DISABLED) ===
      "blockedByProviderDisabled",
    "G: disabled maps correctly"
  );
}

console.log(`\nResultado: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
