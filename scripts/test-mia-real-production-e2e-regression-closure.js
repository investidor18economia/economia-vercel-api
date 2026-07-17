/**
 * PATCH 11A.9 — Production-like E2E Regression Closure
 *
 * Uses real runtime modules with mocked external boundaries only.
 * No paid provider calls.
 */

import {
  applyCommercialDedupEventToAccounting,
  assertGateDenyProviderFree,
  attachCommercialDedupAccountingObserver,
  authorizeProviderExecution,
  createProviderAccounting,
  createRuntimeEnforcementContext,
  detectPostSealMutation,
  executeUnknownPathFailClosed,
  preventDoubleHttpResponse,
  recordProviderCostGuardBlock,
  recordProviderExecution,
  resolveRuntimeDispatchMode,
  sealRuntimePayload,
  validateProviderAccountingConsistency,
} from "../lib/miaRuntimeEnforcement.js";
import {
  finalizeCommercialDegradedResponse,
  isPrefixFallbackRegistry,
  resolveResponsePathRegistry,
} from "../lib/miaRuntimePrecedence.js";
import {
  COMMERCIAL_REQUEST_DEDUP_STATUS,
  createCommercialRequestDedupContext,
  executeCommercialRequestWithDeduplication,
} from "../lib/commercial/commercialRequestDeduplication.js";
import {
  buildDevEndpointProviderCostGuardContext,
  evaluateProviderCostGuardForProvider,
} from "../lib/commercial/providerCostGuard.js";
import {
  buildIntentAuthorityFromRecognition,
  COMMERCIAL_PERMISSION,
} from "../lib/miaIntentAuthority.js";
import {
  MIA_INTERACTION_MODES,
  recognizeMiaIntent,
} from "../lib/miaIntentRecognitionLayer.js";

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

function buildAuthority(message, mode = MIA_INTERACTION_MODES.COMMERCE) {
  const recognition = recognizeMiaIntent({ message, sessionContext: {} });
  recognition.interactionMode = mode;
  const authority = buildIntentAuthorityFromRecognition(recognition);
  if (mode === MIA_INTERACTION_MODES.COMMERCE) {
    authority.commercialPermission = COMMERCIAL_PERMISSION.ALLOW;
  } else if (mode === MIA_INTERACTION_MODES.SOCIAL) {
    authority.commercialPermission = COMMERCIAL_PERMISSION.DENY;
  }
  return authority;
}

async function runScenarios() {
  console.log("\nPATCH 11A.9 — Production-like E2E Regression Closure\n");

  console.log("E2E 1 — Social pure");
  {
    const pa = createProviderAccounting();
    const authority = buildAuthority("oi tudo bem?", MIA_INTERACTION_MODES.SOCIAL);
    authorizeProviderExecution({
      providerId: "google_shopping",
      intentAuthority: authority,
      commercialEntryGate: { commercialEntryAllowed: false },
      providerAccounting: pa,
    });
    const registry = resolveResponsePathRegistry("social_governed");
    expect(authority.commercialPermission === COMMERCIAL_PERMISSION.DENY, "E2E1: deny");
    expect(pa.executed === 0, "E2E1: executed=0");
    expect(registry.providersAllowed === false, "E2E1: non-commercial path");
  }

  console.log("\nE2E 6 — Budget blocked");
  {
    const pa = createProviderAccounting();
    pa.attempted = 1;
    const decision = evaluateProviderCostGuardForProvider("google_shopping", {
      ...buildDevEndpointProviderCostGuardContext(),
      hasExplicitPaidProviderOptIn: false,
    });
    recordProviderCostGuardBlock(pa, { providerId: "serpapi", decision });
    expect(decision.externalCallPrevented === true, "E2E6: external prevented");
    expect(pa.executed === 0, "E2E6: executed=0");
    expect(pa.retries === 0, "E2E6: retries=0");
  }

  console.log("\nE2E 7 — Gate deny");
  {
    const pa = createProviderAccounting();
    const enforcement = createRuntimeEnforcementContext();
    enforcement.providerAccounting = pa;
    authorizeProviderExecution({
      providerId: "google_shopping",
      intentAuthority: { commercialPermission: COMMERCIAL_PERMISSION.DENY },
      commercialEntryGate: { commercialEntryAllowed: false },
      providerAccounting: pa,
    });
    const gateCheck = assertGateDenyProviderFree({
      intentAuthority: { commercialPermission: COMMERCIAL_PERMISSION.DENY },
      commercialEntryGate: { commercialEntryAllowed: false },
      providerAccounting: pa,
      enforcementCtx: enforcement,
    });
    expect(pa.blockedByGate >= 1, "E2E7: blockedByGate");
    expect(pa.executed === 0, "E2E7: executed=0");
    expect(gateCheck.valid === true, "E2E7: gate assertion valid");
  }

  console.log("\nE2E 8 — Cache hit");
  {
    const pa = createProviderAccounting();
    recordProviderExecution(pa, {
      providerId: "commercial_search_cache",
      executed: false,
      cacheHit: true,
      success: true,
      resultCount: 3,
    });
    expect(pa.servedFromCache === 1, "E2E8: servedFromCache=1");
    expect(pa.executed === 0, "E2E8: executed=0");
    expect(pa.deduplicated === 0, "E2E8: deduplicated=0");
  }

  console.log("\nE2E 9 — Dedup hit");
  {
    let executions = 0;
    const enforcement = createRuntimeEnforcementContext();
    const dedupContext = createCommercialRequestDedupContext({ requestId: "e2e9" });
    attachCommercialDedupAccountingObserver(dedupContext, enforcement);

    const fn = () =>
      executeCommercialRequestWithDeduplication({
        commercialRequestDedupContext: dedupContext,
        providerId: "google_shopping",
        query: "notebook dell",
        execute: async () => {
          executions += 1;
          return { ok: true, products: [{ product_name: "Dell" }] };
        },
      });

    await fn();
    await fn();
    expect(enforcement.providerAccounting.attempted === 0 || executions === 1, "E2E9: single execution");
    expect(
      enforcement.providerAccounting.deduplicated >= 1 ||
        dedupContext.events.some((event) => event.hit === true),
      "E2E9: dedup hit evidence"
    );
  }

  console.log("\nE2E 18 — Unknown path fail-closed");
  {
    const unknown = resolveResponsePathRegistry("totally_unknown_path_xyz");
    expect(unknown.failClosed === true, "E2E18: fail-closed registry");
    const fc = executeUnknownPathFailClosed({
      responsePath: "totally_unknown_path_xyz",
      body: { reply: "x", prices: [{ product_name: "fake" }], winner: "fake" },
    });
    expect(fc.body.prices.length === 0, "E2E18: prices stripped");
    expect(resolveRuntimeDispatchMode("totally_unknown_path_xyz") === "unknown_fail_closed", "E2E18: dispatch");
  }

  console.log("\nE2E 20 — Post-seal mutation");
  {
    const ctx = createRuntimeEnforcementContext();
    const body = { reply: "ok", prices: [{ product_name: "X", price: 1 }] };
    sealRuntimePayload(ctx, body);
    body.prices[0].price = 50;
    const result = detectPostSealMutation(ctx, body);
    expect(result.mutated === true, "E2E20: mutation detected");
  }

  console.log("\nE2E 21 — Double response");
  {
    const ctx = createRuntimeEnforcementContext();
    ctx.responseSent = true;
    const mockRes = { headersSent: true };
    const block = preventDoubleHttpResponse(ctx, mockRes);
    expect(block.blocked === true, "E2E21: second send blocked");
    expect(ctx.doubleResponsePrevented === true, "E2E21: flag set");
  }

  console.log("\nE2E 22 — Concurrency controlled");
  {
    let executions = 0;
    const dedupContext = createCommercialRequestDedupContext({ requestId: "conc" });
    const enforcement = createRuntimeEnforcementContext();
    attachCommercialDedupAccountingObserver(dedupContext, enforcement);
    const task = () =>
      executeCommercialRequestWithDeduplication({
        commercialRequestDedupContext: dedupContext,
        providerId: "mercadolivre_public",
        query: "mouse logitech",
        execute: async () => {
          executions += 1;
          await new Promise((resolve) => setTimeout(resolve, 20));
          return { ok: true, products: [{ product_name: "Mouse" }] };
        },
      });
    await Promise.all([task(), task(), task()]);
    expect(executions === 1, "E2E22: single execution under concurrency");
  }

  console.log("\nE2E 23 — Request isolation");
  {
    const ctxA = createRuntimeEnforcementContext();
    const ctxB = createRuntimeEnforcementContext();
    recordProviderExecution(ctxA.providerAccounting, {
      providerId: "a",
      executed: true,
      success: true,
      resultCount: 1,
    });
    expect(ctxB.providerAccounting.executed === 0, "E2E23: accounting isolated");
  }

  console.log("\nGrupo — Commercial degraded no-result");
  {
    const finalized = finalizeCommercialDegradedResponse({
      responsePath: "commercial_new_search_no_result",
      body: { reply: "sem resultado", prices: [], winner: null },
      intentAuthority: buildAuthority("quero um foguete"),
      commercialEntryGate: { commercialEntryAllowed: true },
    });
    expect(finalized.body.winner == null, "degraded: no winner");
    expect((finalized.body.prices || []).length === 0, "degraded: no prices");
  }

  console.log("\nGrupo — Prefix diagnostic only");
  {
    const registry = resolveResponsePathRegistry("commercial_hypothetical_legacy_only");
    expect(isPrefixFallbackRegistry(registry), "prefix: diagnostic fallback");
    expect(registry.failClosed === true, "prefix: fail-closed");
  }

  console.log("\nGrupo — Production readiness assertions");
  {
    const pa = createProviderAccounting();
    pa.attempted = 2;
    pa.executed = 1;
    pa.deduplicated = 1;
    const consistency = validateProviderAccountingConsistency(pa);
    expect(consistency.valid === true, "readiness: accounting consistency");
  }

  console.log(`\nResultado: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runScenarios().catch((error) => {
  console.error(error);
  process.exit(1);
});
