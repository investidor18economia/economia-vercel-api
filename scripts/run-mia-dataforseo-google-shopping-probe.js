#!/usr/bin/env node
/**
 * PATCH Comercial 05L.2 — DataForSEO Google Shopping real probe (opt-in only)
 *
 * Usage:
 *   COMMERCIAL_PROVIDER_DATAFORSEO_ENABLED=true \
 *   COMMERCIAL_DATAFORSEO_REAL_PROBE_ENABLED=true \
 *   node scripts/run-mia-dataforseo-google-shopping-probe.js --real --allow-external --max-calls=1
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildDataForSeoRealProbePlan,
  DATAFORSEO_GOOGLE_SHOPPING_INTEGRATION_AUDIT_VERSION,
} from "../lib/commercial/dataForSeoGoogleShoppingIntegrationAudit.js";
import {
  evaluateProviderBudgetPermission,
  getProviderCircuitState,
} from "../lib/commercial/providerBudgetCircuitBreaker.js";
import {
  evaluateProviderCostGuardForProvider,
  buildFunctionalProviderCostGuardContext,
} from "../lib/commercial/providerCostGuard.js";
import { fetchDataForSeoGoogleShoppingAdapterResult } from "../lib/productSourceAdapter/adapters/dataForSeoGoogleShoppingAdapter.js";
import { COMMERCIAL_PROVIDER_IDS } from "../lib/productSourceAdapter/commercialProviderRegistry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const argv = process.argv.slice(2);

function readArg(name, fallback = "") {
  const inline = argv.find((entry) => entry.startsWith(`--${name}=`));
  if (inline) return inline.split("=").slice(1).join("=").trim();
  return fallback;
}

function parseMaxCalls() {
  const raw = readArg("max-calls", "1");
  const parsed = Number.parseInt(String(raw), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 1) : 1;
}

function snapshotBudget(env) {
  const permission = evaluateProviderBudgetPermission({
    providerId: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO,
    env,
  });
  return {
    callsUsed: permission.callsUsed,
    callsRemaining: permission.callsRemaining,
    circuitState: permission.circuitState,
    decision: permission.decision,
    reasonCode: permission.reasonCode,
  };
}

async function main() {
  const env = process.env;
  const query = readArg("query", "fone bluetooth") || "fone bluetooth";
  const maxCalls = parseMaxCalls();
  const real = argv.includes("--real");
  const allowExternal = argv.includes("--allow-external");
  const outputPath = readArg("output", "tmp/dataforseo-google-shopping-probe.json");

  const probePlan = buildDataForSeoRealProbePlan(env);
  probePlan.query = query;
  probePlan.maxCalls = maxCalls;
  probePlan.real = real;
  probePlan.allowExternal = allowExternal;

  console.log(`\nDataForSEO Google Shopping Probe (${DATAFORSEO_GOOGLE_SHOPPING_INTEGRATION_AUDIT_VERSION})\n`);
  console.log(JSON.stringify(probePlan, null, 2));

  const blockedReasons = [...probePlan.blockers];
  if (!real) blockedReasons.push("--real_missing");
  if (!allowExternal) blockedReasons.push("--allow-external_missing");

  const costGuard = evaluateProviderCostGuardForProvider(
    COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO,
    buildFunctionalProviderCostGuardContext({
      providerId: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO,
      invocationSource: "dataforseo_real_probe",
      env,
    })
  );

  if (!costGuard.shouldCallProvider) {
    blockedReasons.push(`cost_guard:${costGuard.reasonCode || costGuard.decision}`);
  }

  const budgetBefore = snapshotBudget(env);
  const circuitBefore = getProviderCircuitState(
    COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO
  );

  const report = {
    version: DATAFORSEO_GOOGLE_SHOPPING_INTEGRATION_AUDIT_VERSION,
    providerId: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO,
    query,
    maxCalls,
    blockedReasons,
    executed: false,
    budgetBefore,
    circuitBefore,
    result: null,
    verdict: "PROBE_BLOCKED",
  };

  if (blockedReasons.length > 0) {
    mkdirSync(dirname(join(ROOT, outputPath)), { recursive: true });
    writeFileSync(join(ROOT, outputPath), JSON.stringify(report, null, 2));
    console.log(`\nProbe blocked: ${blockedReasons.join(", ")}`);
    console.log(`Report: ${outputPath}`);
    console.log("\n── Veredito ──\nDATAFORSEO_PROVIDER_IMPLEMENTED_CONFIGURATION_PENDING\n");
    process.exit(0);
  }

  const result = await fetchDataForSeoGoogleShoppingAdapterResult({
    query,
    limit: 5,
    env,
    invocationLayer: "dataforseo_real_probe",
    costGuardContext: buildFunctionalProviderCostGuardContext({
      providerId: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO,
      invocationSource: "dataforseo_real_probe",
      env,
    }),
  });

  report.executed = true;
  report.result = {
    ok: result.ok === true,
    error: result.error || null,
    reasonCode: result.reasonCode || null,
    count: Array.isArray(result.products) ? result.products.length : 0,
    firstProduct: result.products?.[0]
      ? {
          product_name: result.products[0].product_name,
          price: result.products[0].price,
          currency: result.products[0].currency,
          link: result.products[0].link,
          provider: result.products[0].provider,
          source: result.products[0].source,
        }
      : null,
    diagnostics: result.diagnostics || null,
  };
  report.budgetAfter = snapshotBudget(env);
  report.circuitAfter = getProviderCircuitState(
    COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO
  );
  report.verdict = result.ok ? "DATAFORSEO_REAL_PROBE_SUCCESS" : "DATAFORSEO_REAL_PROBE_FAILED";

  mkdirSync(dirname(join(ROOT, outputPath)), { recursive: true });
  writeFileSync(join(ROOT, outputPath), JSON.stringify(report, null, 2));

  console.log("\n── Probe Result ──");
  console.log(JSON.stringify(report.result, null, 2));
  console.log(`\nReport: ${outputPath}`);
  console.log(`\n── Veredito ──\n${report.verdict}\n`);
  process.exit(result.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
