/**
 * PATCH Comercial 05B — Provider Cost Guard Audit (local only)
 *
 * Usage:
 *   node scripts/test-mia-provider-cost-guard-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { COMMERCIAL_PROVIDER_IDS } from "../lib/productSourceAdapter/commercialProviderRegistry.js";
import { COMMERCIAL_RUNTIME_MODES } from "../lib/productSourceAdapter/commercialRuntimeMode.js";
import {
  PROVIDER_COST_GUARD_DECISIONS,
  PROVIDER_COST_GUARD_REASON_CODES,
  PROVIDER_COST_GUARD_VERSION,
  PAID_PROVIDER_OBSERVABILITY_OPT_IN_ENV,
  buildDevEndpointProviderCostGuardContext,
  buildFunctionalProviderCostGuardContext,
  buildObservabilityProviderCostGuardContext,
  buildProviderCostGuardTracePatch,
  evaluateProviderCostGuardForProvider,
  isPaidProviderObservabilityOptInEnabled,
} from "../lib/commercial/providerCostGuard.js";
import { fetchGoogleShoppingAdapterResult } from "../lib/productSourceAdapter/adapters/googleShoppingAdapter.js";
import { searchApifyMercadoLivreProducts } from "../lib/productSourceAdapter/adapters/apifyMercadoLivreClient.js";
import { runCommercialShadowPipeline } from "../lib/productSourceAdapter/commercialRuntimeShadow.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

let passed = 0;
let failed = 0;
const start = Date.now();

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

console.log(`\nPATCH Comercial 05B — Provider Cost Guard (${PROVIDER_COST_GUARD_VERSION})\n`);

console.log("── Module contract ──");
const moduleSource = read("lib/commercial/providerCostGuard.js");
assert("version 05B", PROVIDER_COST_GUARD_VERSION === "05B");
assert("no LLM imports", !moduleSource.match(/openai|callOpenAI|buildMiaPrompt/i));
assert("no subprocess imports", !moduleSource.match(/from\s+["']node:child_process["']/));
assert("no fetch in guard module", !moduleSource.match(/\bfetch\s*\(/));
assert("dev endpoint exists", read("pages/api/dev/provider-cost-guard.js").includes("evaluateProviderCostGuardForProvider"));
assert("opt-in env documented", moduleSource.includes(PAID_PROVIDER_OBSERVABILITY_OPT_IN_ENV));
assert("default opt-in disabled", isPaidProviderObservabilityOptInEnabled({}) === false);

console.log("\n── Core decision rules ──");
const observabilityBlocked = evaluateProviderCostGuardForProvider(
  COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE,
  buildObservabilityProviderCostGuardContext({ hasExplicitPaidProviderOptIn: false })
);
assert(
  "paid + observability + no opt-in = block",
  observabilityBlocked.decision === PROVIDER_COST_GUARD_DECISIONS.BLOCK &&
    observabilityBlocked.reasonCode === PROVIDER_COST_GUARD_REASON_CODES.PAID_OBSERVABILITY_BLOCKED
);
assert("blocked prevents provider call", observabilityBlocked.shouldCallProvider === false);

const observabilityAllowed = evaluateProviderCostGuardForProvider(
  "paid_provider_future",
  buildObservabilityProviderCostGuardContext({
    hasExplicitPaidProviderOptIn: true,
    billingTier: "paid_external",
  })
);
assert(
  "paid + observability + opt-in = allow",
  observabilityAllowed.decision === PROVIDER_COST_GUARD_DECISIONS.ALLOW
);

const devBlocked = evaluateProviderCostGuardForProvider(
  COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
  buildDevEndpointProviderCostGuardContext({ hasExplicitPaidProviderOptIn: false })
);
assert(
  "paid + DEV + no opt-in = dry_run",
  devBlocked.decision === PROVIDER_COST_GUARD_DECISIONS.DRY_RUN &&
    devBlocked.shouldCallProvider === false
);

const freeAllowed = evaluateProviderCostGuardForProvider("mercadolivre_public", {
  billingTier: "free_external",
  contextProvided: true,
  isObservabilityOnly: true,
});
assert(
  "free_external allowed",
  freeAllowed.decision === PROVIDER_COST_GUARD_DECISIONS.ALLOW
);

const internalAllowed = evaluateProviderCostGuardForProvider("internal_cache", {
  billingTier: "internal",
  contextProvided: true,
  isObservabilityOnly: true,
});
assert("internal allowed", internalAllowed.decision === PROVIDER_COST_GUARD_DECISIONS.ALLOW);

const disabledBlocked = evaluateProviderCostGuardForProvider(COMMERCIAL_PROVIDER_IDS.AMAZON, {
  billingTier: "disabled",
  contextProvided: true,
});
assert("disabled blocked", disabledBlocked.decision === PROVIDER_COST_GUARD_DECISIONS.BLOCK);

const unknownBlocked = evaluateProviderCostGuardForProvider("unknown_provider", {
  billingTier: "unknown",
  contextProvided: true,
  isObservabilityOnly: false,
});
assert("unknown external fail-closed", unknownBlocked.decision === PROVIDER_COST_GUARD_DECISIONS.BLOCK);

const functionalAllowed = evaluateProviderCostGuardForProvider(
  COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
  buildFunctionalProviderCostGuardContext({
    runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
  })
);
assert(
  "controlled functional allows paid",
  functionalAllowed.decision === PROVIDER_COST_GUARD_DECISIONS.ALLOW &&
    functionalAllowed.shouldCallProvider === true
);

const legacyDefault = evaluateProviderCostGuardForProvider(
  COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
  {}
);
assert(
  "legacy functional default allow without context",
  legacyDefault.decision === PROVIDER_COST_GUARD_DECISIONS.ALLOW &&
    legacyDefault.reasonCode === PROVIDER_COST_GUARD_REASON_CODES.LEGACY_FUNCTIONAL_DEFAULT_ALLOW
);

console.log("\n── Adapter integration (mocked, no API) ──");
const apifyBlocked = await searchApifyMercadoLivreProducts("pelicula iphone", 5, {
  env: { APIFY_API_TOKEN: "test-token" },
  costGuardContext: buildObservabilityProviderCostGuardContext({
    hasExplicitPaidProviderOptIn: false,
  }),
  fetcher: async () => {
    throw new Error("must_not_call_apify");
  },
});
assert("apify adapter blocked before fetch", apifyBlocked.error === "cost_guard_blocked");
assert("apify blocked neutral products", Array.isArray(apifyBlocked.products) && apifyBlocked.products.length === 0);

const googleBlocked = await fetchGoogleShoppingAdapterResult({
  query: "monitor gamer",
  limit: 5,
  costGuardContext: buildObservabilityProviderCostGuardContext({
    hasExplicitPaidProviderOptIn: false,
  }),
  fetcher: async () => {
    throw new Error("must_not_call_serpapi");
  },
});
assert("google adapter blocked before fetch", googleBlocked.error === "cost_guard_blocked");

console.log("\n── Shadow pipeline (mocked) ──");
const shadow = await runCommercialShadowPipeline({
  query: "controle play",
  limit: 5,
});
assert("shadow pipeline completes when paid blocked", shadow.trace?.costGuardDecisions?.length === 2);
assert(
  "shadow blocks google paid fetch",
  shadow.trace?.googleResult?.error === "cost_guard_blocked"
);
assert(
  "shadow blocks apify paid fetch",
  shadow.trace?.apifyResult?.error === "cost_guard_blocked"
);
assert(
  "shadow tracer patch available",
  !!shadow.trace?.costGuardTrace?.provider_cost_guard
);

console.log("\n── Generalization with synthetic providers ──");
for (const providerId of ["paid_provider_a", "paid_provider_future"]) {
  const decision = evaluateProviderCostGuardForProvider(providerId, {
    billingTier: "paid_external",
    contextProvided: true,
    isObservabilityOnly: true,
    hasExplicitPaidProviderOptIn: false,
  });
  assert(`${providerId} observability blocked`, decision.shouldCallProvider === false);
}

console.log("\n── Architecture preservation ──");
assert(
  "guard does not decide winner",
  !moduleSource.match(/selectWinner|rankWinner|decideWinner/i)
);
assert(
  "adapters wired to guard",
  read("lib/productSourceAdapter/adapters/apifyMercadoLivreClient.js").includes("evaluateProviderCostGuardForProvider")
);
assert(
  "shadow wired to observability context",
  read("lib/productSourceAdapter/commercialRuntimeShadow.js").includes("buildObservabilityProviderCostGuardContext")
);
assert(
  "chat tracer wired",
  read("pages/api/chat-gpt4o.js").includes("costGuardTrace")
);
assert(
  "trace patch helper",
  !!buildProviderCostGuardTracePatch([observabilityBlocked])?.provider_cost_guard
);

console.log("\n── Regressions ──");
console.log("  ⏭️ skipped — no nested audits (local-only mode)");

const elapsed = ((Date.now() - start) / 1000).toFixed(2);
console.log("\n── Verdict ──");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Time: ${elapsed}s\n`);

if (failed === 0) {
  console.log("A) ROBUST estruturalmente\n");
  process.exit(0);
}

console.log("B) PARTIAL\n");
process.exit(1);
