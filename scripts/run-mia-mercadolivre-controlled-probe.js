#!/usr/bin/env node
/**
 * PATCH Comercial 05J.2 — Mercado Livre Controlled Probe (protected fetch, opt-in only)
 *
 * Mode A (public): COMMERCIAL_ML_CONTROLLED_PROBE_ENABLED=true
 * Mode B (vault):  COMMERCIAL_ML_AUTHENTICATED_PROBE_ENABLED=true + Provider Credential Vault
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildMercadoLivreProtectedFetchDiagnostics,
  buildMercadoLivrePublicProbePlan,
  COMMERCIAL_ML_AUTHENTICATED_PROBE_ENABLED_ENV,
  MERCADOLIVRE_403_PROTECTED_FETCH_AUDIT_VERSION,
  validateMercadoLivreProbeProtectionStack,
} from "../lib/commercial/mercadolivre403ProtectedFetchAudit.js";
import {
  buildMercadoLivreAuthenticatedProbePlan,
  classifyMercadoLivreOAuthReadiness,
  MERCADOLIVRE_OAUTH_TOKEN_READINESS_AUDIT_VERSION,
} from "../lib/commercial/mercadolivreOAuthTokenReadinessAudit.js";
import {
  buildMercadoLivreFetchPathDiagnostics,
  COMMERCIAL_ML_CONTROLLED_PROBE_ENABLED_ENV,
  createCommercialProviderExecutionLifecycle,
  recordCommercialProviderExecutionStage,
} from "../lib/commercial/mercadolivreControlledFetchPathAudit.js";
import { buildMultiProviderPriorityPlan } from "../lib/commercial/multiProviderPriorityEngine.js";
import {
  evaluateProviderBudgetPermission,
  getProviderCircuitState,
} from "../lib/commercial/providerBudgetCircuitBreaker.js";
import {
  buildFunctionalProviderCostGuardContext,
  evaluateProviderCostGuardForProvider,
} from "../lib/commercial/providerCostGuard.js";
import { fetchMercadoLivreCommercialAdapterResult } from "../lib/productSourceAdapter/adapters/mercadoLivreAdapter.js";
import { buildMercadoLivreSearchUrl } from "../lib/productSourceAdapter/adapters/mercadoLivreClient.js";
import { isMercadoLivreOAuthTokenPersistenceConfigured } from "../lib/commercial/mercadolivreOAuthTokenPersistence.js";
import { hasLegacyAccessTokenEnv } from "../lib/server/providerAuthenticatedRuntimeProbe.js";
import { COMMERCIAL_PROVIDER_IDS } from "../lib/productSourceAdapter/commercialProviderRegistry.js";
import { COMMERCIAL_RUNTIME_MODES } from "../lib/productSourceAdapter/commercialRuntimeMode.js";

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

function sanitizeUrl(url = "") {
  return String(url || "").replace(/access_token=[^&]+/gi, "access_token=[REDACTED]");
}

function snapshotBudget(env) {
  const permission = evaluateProviderBudgetPermission({
    providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
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
  const query = readArg("query", "iPhone 13") || "iPhone 13";
  const maxCalls = parseMaxCalls();
  const real = argv.includes("--real");
  const allowExternal = argv.includes("--allow-external");
  const authenticated = argv.includes("--authenticated");
  const outputPath = readArg(
    "output",
    authenticated
      ? "tmp/mercadolivre-controlled-probe-authenticated.json"
      : "tmp/mercadolivre-controlled-probe.json"
  );

  const probePlan = authenticated
    ? buildMercadoLivreAuthenticatedProbePlan({ env, query })
    : buildMercadoLivrePublicProbePlan({ env, query });
  const probeVersion = authenticated
    ? MERCADOLIVRE_OAUTH_TOKEN_READINESS_AUDIT_VERSION
    : MERCADOLIVRE_403_PROTECTED_FETCH_AUDIT_VERSION;

  console.log(`\nMercado Livre Controlled Probe (${probeVersion})\n`);
  console.log(JSON.stringify(probePlan, null, 2));

  const blockedReasons = [];
  if (authenticated) {
    if (String(env[COMMERCIAL_ML_AUTHENTICATED_PROBE_ENABLED_ENV] || "").toLowerCase() !== "true") {
      blockedReasons.push("COMMERCIAL_ML_AUTHENTICATED_PROBE_ENABLED!=true");
    }
    if (!isMercadoLivreOAuthTokenPersistenceConfigured(env)) {
      blockedReasons.push("vault_unavailable");
    }
    if (hasLegacyAccessTokenEnv(env)) {
      blockedReasons.push("legacy_env_token_must_be_unset");
    }
    const readiness = classifyMercadoLivreOAuthReadiness({ env });
    for (const blocker of readiness.blockers) {
      if (blocker !== "vault_unavailable") {
        blockedReasons.push(blocker);
      }
    }
  } else if (String(env[COMMERCIAL_ML_CONTROLLED_PROBE_ENABLED_ENV] || "").toLowerCase() !== "true") {
    blockedReasons.push("COMMERCIAL_ML_CONTROLLED_PROBE_ENABLED!=true");
  }

  if (!real) blockedReasons.push("missing --real");
  if (!allowExternal) blockedReasons.push("missing --allow-external");
  if (String(env.COMMERCIAL_RUNTIME_MODE || "") !== COMMERCIAL_RUNTIME_MODES.CONTROLLED) {
    blockedReasons.push("COMMERCIAL_RUNTIME_MODE!=controlled");
  }
  if (String(env.COMMERCIAL_PROVIDER_MERCADOLIVRE_ENABLED || "").toLowerCase() !== "true") {
    blockedReasons.push("COMMERCIAL_PROVIDER_MERCADOLIVRE_ENABLED!=true");
  }
  if (String(env.SERPAPI_KEY || "").trim()) {
    blockedReasons.push("SERPAPI_KEY must be empty for this probe");
  }
  if (String(env.APIFY_API_TOKEN || "").trim()) {
    blockedReasons.push("APIFY_API_TOKEN must be empty for this probe");
  }

  const priorityPlan = buildMultiProviderPriorityPlan({
    runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
    env,
    invocationSource: "mercadolivre_controlled_probe",
  });
  const googleGuard = evaluateProviderCostGuardForProvider(COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING, {
    ...buildFunctionalProviderCostGuardContext({ runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED }),
    env,
    isManualAudit: true,
  });
  const apifyGuard = evaluateProviderCostGuardForProvider(COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE, {
    ...buildFunctionalProviderCostGuardContext({ runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED }),
    env,
    isManualAudit: true,
  });

  if (googleGuard.shouldCallProvider) blockedReasons.push("google_shopping would execute");
  if (apifyGuard.shouldCallProvider) blockedReasons.push("apify_mercadolivre would execute");
  if (priorityPlan.orderedProviders.some((p) => p.providerId !== COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC)) {
    blockedReasons.push("priority plan includes non-ML provider");
  }

  if (blockedReasons.length) {
    console.log("\nProbe blocked:");
    for (const reason of blockedReasons) console.log(`  - ${reason}`);
    console.log("\nCancel: omit --real or disable probe env flags.");
    process.exit(2);
  }

  const lifecycle = createCommercialProviderExecutionLifecycle({
    providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
    runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
    invocationSource: authenticated ? "mercadolivre_authenticated_probe" : "mercadolivre_controlled_probe",
  });

  const startedAt = Date.now();
  const sampleUrl = sanitizeUrl(buildMercadoLivreSearchUrl(query, maxCalls, env));
  const budgetBefore = snapshotBudget(env);
  const circuitBefore = getProviderCircuitState(COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC);

  recordCommercialProviderExecutionStage(lifecycle, {
    stage: "conditional_slot_started",
    reasonCode: authenticated ? "authenticated_probe_authorized" : "probe_authorized",
  });
  recordCommercialProviderExecutionStage(lifecycle, {
    stage: "budget_allowed",
    reasonCode: budgetBefore.reasonCode,
  });
  recordCommercialProviderExecutionStage(lifecycle, {
    stage: "circuit_allowed",
    reasonCode: circuitBefore.state,
  });

  const adapterResult = await fetchMercadoLivreCommercialAdapterResult({
    query,
    limit: maxCalls,
    env,
    invocationLayer: authenticated ? "mercadolivre_authenticated_probe" : "mercadolivre_controlled_probe",
    executionLifecycle: lifecycle,
    costGuardContext: buildFunctionalProviderCostGuardContext({
      invocationSource: authenticated ? "mercadolivre_authenticated_probe" : "mercadolivre_controlled_probe",
      runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
      env,
      isManualAudit: true,
    }),
  });

  const budgetAfter = snapshotBudget(env);
  const circuitAfter = getProviderCircuitState(COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC);

  recordCommercialProviderExecutionStage(lifecycle, {
    stage: "completed",
    reasonCode: adapterResult.reasonCode || adapterResult.error || null,
    externalCallExecuted: adapterResult.httpRequestStarted === true,
  });

  const protectedFetchDiagnostics = buildMercadoLivreProtectedFetchDiagnostics({
    protectedFetchEntered: adapterResult.protectedFetchEntered,
    externalCallRecorded: adapterResult.externalCallRecorded,
    providerFailureRecorded: adapterResult.ok !== true,
    budgetBefore,
    budgetAfter,
    circuitBefore,
    circuitAfter,
    providerResult: adapterResult,
    safeForbiddenDiagnostics: adapterResult.safeForbiddenDiagnostics,
    finalForbiddenClassification: adapterResult.safeForbiddenDiagnostics?.classification,
  });

  const protectionValidation = validateMercadoLivreProbeProtectionStack({
    providerResult: adapterResult,
    budgetBefore,
    budgetAfter,
  });

  const report = {
    ok: adapterResult.ok === true,
    version: MERCADOLIVRE_403_PROTECTED_FETCH_AUDIT_VERSION,
    probeMode: authenticated ? "vault_authenticated" : "public_no_token",
    query,
    maxCalls,
    latencyMs: Date.now() - startedAt,
    sampleSearchUrlSanitized: sampleUrl,
    httpStatus: adapterResult.httpStatus ?? null,
    rawResultCount: Array.isArray(adapterResult.products) ? adapterResult.products.length : 0,
    normalizedResultCount: adapterResult.count || 0,
    reasonCode: adapterResult.reasonCode || adapterResult.error || null,
    safeForbiddenDiagnostics: adapterResult.safeForbiddenDiagnostics || null,
    executionTelemetry: adapterResult.executionTelemetry || null,
    protectedFetchDiagnostics,
    protectionValidation,
    lifecycle,
    diagnostics: buildMercadoLivreFetchPathDiagnostics({
      providerResult: adapterResult,
      lifecycle,
      runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
    }),
    priorityPlan: {
      orderedProviders: priorityPlan.orderedProviders.map((entry) => entry.providerId),
    },
    externalCallsStarted: adapterResult.httpRequestStarted === true ? 1 : 0,
    externalCallsCompleted: adapterResult.httpRequestCompleted === true ? 1 : 0,
    budgetBefore,
    budgetAfter,
    circuitBefore,
    circuitAfter,
  };

  console.log("\n── Probe result ──");
  console.log(JSON.stringify(report, null, 2));

  const fullOutputPath = join(ROOT, outputPath);
  mkdirSync(dirname(fullOutputPath), { recursive: true });
  writeFileSync(fullOutputPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`\nJSON saved: ${outputPath}`);
  process.exit(report.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
