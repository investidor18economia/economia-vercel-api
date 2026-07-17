/**
 * PATCH 11A.8B — Runtime Enforcement Hardening & Full Closure
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  advanceRuntimeLifecycle,
  assertGateDenyProviderFree,
  authorizeProviderExecution,
  buildPayloadFingerprint,
  createProviderAccounting,
  createRuntimeEnforcementContext,
  detectPostSealMutation,
  executeUnknownPathFailClosed,
  INVARIANT_SEVERITY,
  LIFECYCLE_STATES,
  preventDoubleHttpResponse,
  recordInvariantRepairs,
  recordProviderExecution,
  resolveRuntimeDispatchMode,
  rollbackSemanticTransition,
  sealRuntimePayload,
  validateResponseExecutionConsistency,
  RUNTIME_ENFORCEMENT_VERSION,
} from "../lib/miaRuntimeEnforcement.js";
import {
  finalizeCommercialDegradedResponse,
  resolveResponsePathRegistry,
  RUNTIME_PRECEDENCE_VERSION,
} from "../lib/miaRuntimePrecedence.js";
import {
  buildIntentAuthorityFromRecognition,
  COMMERCIAL_PERMISSION,
} from "../lib/miaIntentAuthority.js";
import {
  MIA_INTERACTION_MODES,
  recognizeMiaIntent,
} from "../lib/miaIntentRecognitionLayer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HANDLER_PATH = path.join(__dirname, "..", "pages", "api", "chat-gpt4o.js");

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
  }
  return authority;
}

console.log("\nPATCH 11A.8B — Runtime Enforcement Hardening\n");

console.log("Grupo A — Single public interface");
{
  const src = fs.readFileSync(HANDLER_PATH, "utf8");
  expect(src.includes("function sendRuntimeResponse("), "A: sendRuntimeResponse exists");
  expect(src.includes("function __sendRuntimeGovernedResponse("), "A: governed wrapper internal");
  expect(src.includes("function __sendRuntimeTechnicalResponse("), "A: technical wrapper internal");
  expect(!src.match(/[^_]sendRuntimeGovernedResponse\(/), "A: no public governed wrapper calls");
  expect((src.match(/res\.status\(200\)\.json/g) || []).length === 1, "A: single HTTP 200 sender");
}

console.log("\nGrupo B — Lifecycle");
{
  const ctx = createRuntimeEnforcementContext();
  for (const state of [
    LIFECYCLE_STATES.CREATED,
    LIFECYCLE_STATES.AUTHORIZED,
    LIFECYCLE_STATES.FINALIZED,
    LIFECYCLE_STATES.VALIDATED,
    LIFECYCLE_STATES.SEALED,
    LIFECYCLE_STATES.SENT,
  ]) {
    advanceRuntimeLifecycle(ctx, state);
  }
  expect(ctx.lifecycle.history.includes(LIFECYCLE_STATES.SEALED), "B: sealed in history");
  expect(ctx.lifecycle.state === LIFECYCLE_STATES.SENT, "B: ends at sent");
}

console.log("\nGrupo C — Unknown path fail-closed");
{
  const unknown = resolveResponsePathRegistry("totally_unknown_path_xyz");
  expect(unknown.failClosed === true, "C: registry fail-closed");
  const fc = executeUnknownPathFailClosed({
    responsePath: "totally_unknown_path_xyz",
    body: { reply: "x", prices: [{ product_name: "fake" }], winner: "fake" },
  });
  expect(fc.normalizedResponsePath === "non_commercial_governed_fallback", "C: normalized path");
  expect(fc.body.prices.length === 0, "C: prices stripped");
  expect(fc.body.winner == null, "C: winner stripped");
}

console.log("\nGrupo D — Fatal invariants in strict mode");
{
  process.env.MIA_RUNTIME_ENFORCEMENT_STRICT = "true";
  let threw = false;
  try {
    recordInvariantRepairs(createRuntimeEnforcementContext(), {
      responsePath: "commercial_new_search_no_result",
      violations: ["missingIntentAuthority"],
      corrected: false,
    });
  } catch {
    threw = true;
  }
  expect(threw, "D: fatal invariant throws in strict mode");
  delete process.env.MIA_RUNTIME_ENFORCEMENT_STRICT;
}

console.log("\nGrupo E — Recoverable repair ledger");
{
  const ctx = createRuntimeEnforcementContext();
  recordInvariantRepairs(ctx, {
    responsePath: "commercial_new_search_no_result",
    violations: ["invalidWinnerOnDegradedPath"],
    corrected: true,
  });
  expect(ctx.repairLedger.length === 1, "E: repair ledger entry");
  expect(ctx.invariantRecoverableCount === 1, "E: recoverable count");
}

console.log("\nGrupo F — Post-seal mutation");
{
  const ctx = createRuntimeEnforcementContext();
  sealRuntimePayload(ctx, { reply: "ok", prices: [] });
  const result = detectPostSealMutation(ctx, { reply: "changed", prices: [{ x: 1 }] });
  expect(result.mutated, "F: mutation detected");
}

console.log("\nGrupo G — State transaction rollback");
{
  const ctx = createRuntimeEnforcementContext();
  ctx.transitionPrepared = { lastBestProduct: null };
  const rolled = rollbackSemanticTransition(ctx, {
    session_context: { lastBestProduct: { product_name: "bad" } },
  });
  expect(rolled.session_context.lastBestProduct == null, "G: rollback restores snapshot");
  expect(ctx.stateRollbackApplied === true, "G: rollback flag");
}

console.log("\nGrupo H — Double response protection");
{
  const ctx = createRuntimeEnforcementContext();
  ctx.responseSent = true;
  const blocked = preventDoubleHttpResponse(ctx, { headersSent: false });
  expect(blocked.blocked === true, "H: second send blocked");
  expect(ctx.doubleResponsePrevented === true, "H: doubleResponsePrevented");
}

console.log("\nGrupo I — Provider accounting");
{
  const pa = createProviderAccounting();
  const deny = buildAuthority("kkkk", MIA_INTERACTION_MODES.SOCIAL);
  const auth = authorizeProviderExecution({
    providerId: "serpapi",
    intentAuthority: deny,
    commercialEntryGate: { commercialEntryAllowed: false },
    providerAccounting: pa,
  });
  expect(!auth.allowed, "I: gate deny blocks provider");
  expect(pa.blockedByGate === 1, "I: blockedByGate counted");

  recordProviderExecution(pa, {
    providerId: "commercial_search_cache",
    executed: false,
    cacheHit: true,
    success: true,
    resultCount: 3,
  });
  expect(pa.servedFromCache === 1, "I: cache hit counted");
}

console.log("\nGrupo J — Normal commercial paths registry");
{
  for (const p of [
    "return_seguro",
    "legacy_llm_search",
    "commercial_success",
    "comparison_success",
    "specific_product_result",
    "commercial_continuation",
  ]) {
    const reg = resolveResponsePathRegistry(p);
    expect(reg.requiresIntentAuthority !== false || reg.registryKey, `J: ${p} registered`);
  }
}

console.log("\nGrupo K — Response/execution consistency");
{
  const bad = validateResponseExecutionConsistency({
    responsePath: "commercial_new_search_no_result",
    body: { prices: [{ product_name: "x" }], winner: "x" },
    providerAccounting: createProviderAccounting(),
    degradation: { reasonCode: "no_result" },
  });
  expect(!bad.valid, "K: no-result with cards blocked");
}

console.log("\nGrupo L — Gate deny global assertion");
{
  const pa = createProviderAccounting();
  pa.executed = 1;
  const result = assertGateDenyProviderFree({
    intentAuthority: buildAuthority("kkkk", MIA_INTERACTION_MODES.SOCIAL),
    commercialEntryGate: { commercialEntryAllowed: false },
    providerAccounting: pa,
    enforcementCtx: createRuntimeEnforcementContext(),
  });
  expect(!result.valid, "L: provider after deny invalid");
}

console.log("\nGrupo M — Dispatch mode routing");
{
  expect(resolveRuntimeDispatchMode("image_identification_failed") === "technical", "M: technical");
  expect(resolveRuntimeDispatchMode("image_search_success") === "pre_cognitive", "M: pre-cognitive");
  expect(
    resolveRuntimeDispatchMode("commercial_new_search_no_result") === "commercial_degraded",
    "M: degraded"
  );
  expect(resolveRuntimeDispatchMode("return_seguro") === "governed", "M: governed");
}

console.log("\nGrupo N — Version tags");
{
  expect(RUNTIME_ENFORCEMENT_VERSION === "11A.9A.1", "N: enforcement version");
  expect(RUNTIME_PRECEDENCE_VERSION === "11A.9.1", "N: precedence version");
}

console.log(`\n${"=".repeat(60)}`);
console.log(`PATCH 11A.8B hardening tests: ${passed} passed, ${failed} failed`);
console.log(`${"=".repeat(60)}\n`);

if (failed > 0) process.exit(1);
