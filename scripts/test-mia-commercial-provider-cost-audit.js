/**
 * PATCH Comercial 05A — Commercial Provider Cost Audit (local only)
 *
 * Usage:
 *   node scripts/test-mia-commercial-provider-cost-audit.js
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { COMMERCIAL_PROVIDER_IDS } from "../lib/productSourceAdapter/commercialProviderRegistry.js";
import {
  PROVIDER_COST_AUDIT_VERSION,
  COMMERCIAL_COST_CLASSIFICATIONS,
  COMMERCIAL_COST_PROVIDER_TIERS,
  buildCommercialProviderCostAudit,
  buildCommercialProviderCostAuditDevPayload,
  buildCommercialProviderCostAuditDiagnostics,
  buildCommercialProviderCostCallGraph,
  buildCommercialProviderCostProtectionStatus,
  buildCommercialProviderCostRiskMap,
  getCommercialProviderCostEntryPoint,
  getCommercialProviderCostProfile,
} from "../lib/commercial/providerCostAudit.js";

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

console.log(`\nPATCH Comercial 05A — Commercial Provider Cost Audit (${PROVIDER_COST_AUDIT_VERSION})\n`);

console.log("── Module contract ──");
const moduleSource = read("lib/commercial/providerCostAudit.js");
assert("version 05A", PROVIDER_COST_AUDIT_VERSION === "05A");
assert("no LLM imports", !moduleSource.match(/openai|callOpenAI|buildMiaPrompt/i));
assert("no child_process imports", !moduleSource.match(/from\s+["']node:child_process["']/));
assert("no fetch in module", !moduleSource.match(/\bfetch\s*\(/));
assert("no axios in module", !moduleSource.includes("axios"));
assert("no serpapi calls", !moduleSource.includes("serpapi.com"));
assert("no apify calls", !moduleSource.includes("api.apify.com"));
assert("dev endpoint exists", read("pages/api/dev/provider-cost-audit.js").includes("buildCommercialProviderCostAudit"));

console.log("\n── Provider coverage ──");
const audit = buildCommercialProviderCostAudit();
assert("audit builds", !!audit.version);
assert("google shopping mapped", !!getCommercialProviderCostProfile(COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING));
assert("apify mapped", !!getCommercialProviderCostProfile(COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE));
assert("legacy serpapi mapped", !!getCommercialProviderCostProfile("serpapi"));
assert("mercadolivre public mapped", !!getCommercialProviderCostProfile("mercadolivre"));
assert("supabase cache mapped", !!getCommercialProviderCostProfile("supabasecache"));
assert(
  "paid providers identified",
  audit.providers.filter((p) => p.tier === COMMERCIAL_COST_PROVIDER_TIERS.PAID_EXTERNAL).length >= 2
);

console.log("\n── Call graph ──");
const graph = buildCommercialProviderCostCallGraph();
assert("graph has nodes", graph.nodes.length >= 10);
assert("graph has edges", graph.edges.length >= 10);
assert("graph lists paid clients", graph.paidProviderClients.includes(COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE));
assert(
  "fallback pipeline is non-billing consumer",
  graph.nonBillingConsumers.includes("commercial_fallback_pipeline")
);
assert(
  "llm verbalization is non-billing consumer",
  graph.nonBillingConsumers.includes("llm_verbalization")
);

console.log("\n── Entry points vs codebase ──");
const chatSource = read("pages/api/chat-gpt4o.js");
assert("chat has safeFetchSerpPrices", chatSource.includes("safeFetchSerpPrices"));
assert("chat has shadow execution", chatSource.includes("executeCommercialRuntimeShadow"));
assert("chat has runtime activation", chatSource.includes("applyCommercialRuntimeActivationToResponsePrices"));
assert("shadow pipeline exists", read("lib/productSourceAdapter/commercialRuntimeShadow.js").includes("runCommercialShadowPipeline"));
assert("apify client exists", read("lib/productSourceAdapter/adapters/apifyMercadoLivreClient.js").includes("searchApifyMercadoLivreProducts"));
assert("entry chat safe fetch documented", !!getCommercialProviderCostEntryPoint("chat_gpt4o_safe_fetch"));
assert("entry shadow documented", !!getCommercialProviderCostEntryPoint("chat_gpt4o_shadow_observation"));
assert("entry dev apify documented", !!getCommercialProviderCostEntryPoint("dev_apify_search"));

console.log("\n── Duplication & risk ──");
assert("duplication patterns present", audit.duplicationPatterns.length >= 4);
assert(
  "apify no cache pattern documented",
  audit.duplicationPatterns.some((entry) => entry.id === "no_apify_cache")
);
assert(
  "legacy+shadow duplication documented",
  audit.duplicationPatterns.some((entry) => entry.id === "legacy_serp_plus_shadow_serp")
);
const risk = buildCommercialProviderCostRiskMap();
assert("risk map suspicious entries", risk.byClassification.suspicious.length >= 3);
assert("hotspots ranked", audit.hotspots[0].rank === 1);
assert("apify is top hotspot", audit.hotspots[0].provider === COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE);

console.log("\n── Protections ──");
const protections = buildCommercialProviderCostProtectionStatus();
assert("existing protections documented", protections.existing.length >= 5);
assert("absent protections documented", protections.absent.length >= 5);
assert(
  "legacy cache documented",
  protections.existing.some((entry) => entry.id === "commercial_search_cache")
);
assert(
  "apify cache absent documented",
  protections.absent.some((entry) => entry.id === "apify_cache")
);
assert(
  "provider budget absent documented",
  protections.absent.some((entry) => entry.id === "provider_budget")
);

console.log("\n── DEV payload ──");
const devPayload = buildCommercialProviderCostAuditDevPayload(audit);
const diagnostics = buildCommercialProviderCostAuditDiagnostics(audit);
assert("dev payload has callGraph", !!devPayload.callGraph);
assert("dev payload has riskMap", !!devPayload.riskMap);
assert("diagnostics no external calls", diagnostics.callsExternalApis === false);
assert("optimization order listed", devPayload.optimizationOrder.length >= 5);

console.log("\n── Architecture preservation ──");
assert(
  "provider registry still passive",
  !read("lib/productSourceAdapter/commercialProviderRegistry.js").includes("searchApifyMercadoLivreProducts")
);
assert(
  "fallback pipeline untouched",
  !read("lib/commercial/commercialFallbackProductionPipeline.js").includes("providerCostAudit")
);
assert(
  "audit script no subprocess imports",
  !read("scripts/test-mia-commercial-provider-cost-audit.js").match(
    /from\s+["']node:child_process["']|require\(\s*["']child_process["']\s*\)/
  )
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
