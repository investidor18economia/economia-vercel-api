/**
 * PATCH Comercial 05J.1 — Mercado Livre Controlled Fetch Path Audit
 *
 * Lifecycle, diagnóstico estático e telemetria de execução provider-agnostic.
 * Não altera winner, ranking, selection ou cognição.
 */

import {
  COMMERCIAL_PROVIDER_IDS,
  getCommercialProviderOperationalMetadata,
} from "../productSourceAdapter/commercialProviderRegistry.js";
import {
  COMMERCIAL_RUNTIME_MODES,
  getCommercialRuntimeMode,
} from "../productSourceAdapter/commercialRuntimeMode.js";
import {
  buildMercadoLivreSearchUrl,
  validateMercadoLivreEnv,
  validateMercadoLivrePublicSearchEnv,
} from "../productSourceAdapter/adapters/mercadoLivreClient.js";
import { getMercadoLivreCommercialRegistryMetadata } from "./mercadolivreRuntimeActivation.js";

export const MERCADOLIVRE_CONTROLLED_FETCH_PATH_AUDIT_VERSION = "05J.1";

export const COMMERCIAL_PROVIDER_EXECUTION_STAGES = Object.freeze({
  PLANNED: "planned",
  ELIGIBLE: "eligible",
  SKIPPED: "skipped",
  CONDITIONAL_SLOT_STARTED: "conditional_slot_started",
  DEDUP_HIT: "dedup_hit",
  CACHE_HIT: "cache_hit",
  COST_GUARD_ALLOWED: "cost_guard_allowed",
  COST_GUARD_BLOCKED: "cost_guard_blocked",
  BUDGET_ALLOWED: "budget_allowed",
  BUDGET_BLOCKED: "budget_blocked",
  CIRCUIT_ALLOWED: "circuit_allowed",
  CIRCUIT_BLOCKED: "circuit_blocked",
  ADAPTER_INVOKED: "adapter_invoked",
  CLIENT_INVOKED: "client_invoked",
  HTTP_REQUEST_STARTED: "http_request_started",
  HTTP_RESPONSE_RECEIVED: "http_response_received",
  NORMALIZATION_STARTED: "normalization_started",
  NORMALIZATION_COMPLETED: "normalization_completed",
  PROVIDER_EMPTY_RESPONSE: "provider_empty_response",
  PROVIDER_ERROR: "provider_error",
  COMPLETED: "completed",
});

export const MERCADOLIVRE_FETCH_INTERRUPTION_CODES = Object.freeze({
  PROVIDER_NOT_EXECUTED: "provider_not_executed",
  PROVIDER_BLOCKED: "provider_blocked",
  PROVIDER_HTTP_EMPTY: "provider_http_empty",
  PROVIDER_NORMALIZATION_EMPTY: "provider_normalization_empty",
  PROVIDER_SELECTION_EMPTY: "provider_selection_empty",
  MISSING_OAUTH_ENV: "missing_oauth_env",
  MISSING_PUBLIC_CONFIG: "missing_public_config",
  PROVIDER_DISABLED: "provider_disabled",
  COST_GUARD_BLOCKED: "cost_guard_blocked",
  BUDGET_BLOCKED: "budget_blocked",
  CIRCUIT_BLOCKED: "circuit_blocked",
  CACHE_HIT: "cache_hit",
  DEDUP_HIT: "dedup_hit",
  DEV_DRY_RUN: "dev_dry_run",
});

export const COMMERCIAL_ML_CONTROLLED_PROBE_ENABLED_ENV =
  "COMMERCIAL_ML_CONTROLLED_PROBE_ENABLED";

const CONTROLLED_FETCH_PATH_STEPS = Object.freeze([
  {
    id: "resolve_official_commercial_offer",
    module: "lib/productSourceAdapter/commercialRuntimeActivation.js",
    fn: "resolveOfficialCommercialOffer",
    checks: ["runtime_controlled", "passes_env_to_pipeline"],
  },
  {
    id: "run_commercial_shadow_pipeline",
    module: "lib/productSourceAdapter/commercialRuntimeShadow.js",
    fn: "runCommercialShadowPipeline",
    checks: ["runtime_mode_from_context", "builds_provider_slots"],
  },
  {
    id: "multi_provider_priority_engine",
    module: "lib/commercial/multiProviderPriorityEngine.js",
    fn: "buildMultiProviderPriorityPlan",
    checks: ["ml_eligible_when_enabled", "requires_auth_respected"],
  },
  {
    id: "conditional_provider_fetch",
    module: "lib/commercial/conditionalProviderFetch.js",
    fn: "executeConditionalProviderFetch",
    checks: ["slot_started", "sequential_fetch"],
  },
  {
    id: "mercadolivre_commercial_adapter",
    module: "lib/productSourceAdapter/adapters/mercadoLivreAdapter.js",
    fn: "fetchMercadoLivreCommercialAdapterResult",
    checks: ["provider_enabled", "passes_env"],
  },
  {
    id: "request_dedup",
    module: "lib/commercial/commercialRequestDeduplication.js",
    fn: "executeCommercialRequestWithDeduplication",
    checks: ["dedup_may_short_circuit"],
  },
  {
    id: "universal_cache",
    module: "lib/commercial/universalCommercialCache.js",
    fn: "executeWithUniversalCommercialCache",
    checks: ["cache_may_short_circuit"],
  },
  {
    id: "provider_cost_guard",
    module: "lib/commercial/providerCostGuard.js",
    fn: "evaluateProviderCostGuardForProvider",
    checks: ["free_external_allowed"],
  },
  {
    id: "budget_circuit",
    module: "lib/commercial/providerBudgetCircuitBreaker.js",
    fn: "executeCommercialProviderProtectedFetch",
    checks: ["budget_circuit_may_block"],
  },
  {
    id: "mercadolivre_client",
    module: "lib/productSourceAdapter/adapters/mercadoLivreClient.js",
    fn: "searchMercadoLivreProducts",
    checks: ["public_search_env", "http_fetch"],
  },
  {
    id: "normalization",
    module: "lib/productSourceAdapter/adapters/mercadoLivreAdapter.js",
    fn: "normalizeMercadoLivreSearchResult",
    checks: ["maps_items_to_products"],
  },
]);

function cleanText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function createCommercialProviderExecutionLifecycle(input = {}) {
  const startedAt = Date.now();
  return {
    version: MERCADOLIVRE_CONTROLLED_FETCH_PATH_AUDIT_VERSION,
    providerId: cleanText(input.providerId || COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC),
    runtimeMode: cleanText(input.runtimeMode || getCommercialRuntimeMode()),
    invocationSource: cleanText(input.invocationSource || "commercial_provider_execution"),
    startedAt,
    stages: [],
  };
}

/**
 * @param {ReturnType<typeof createCommercialProviderExecutionLifecycle>} lifecycle
 * @param {Record<string, unknown>} [input]
 */
export function recordCommercialProviderExecutionStage(lifecycle, input = {}) {
  if (!lifecycle || !Array.isArray(lifecycle.stages)) return lifecycle;

  const stage = cleanText(input.stage || "");
  if (!stage) return lifecycle;

  lifecycle.stages.push(
    Object.freeze({
      stage,
      providerId: cleanText(input.providerId || lifecycle.providerId),
      runtimeMode: cleanText(input.runtimeMode || lifecycle.runtimeMode),
      invocationSource: cleanText(input.invocationSource || lifecycle.invocationSource),
      elapsedMs: Math.max(0, Date.now() - (lifecycle.startedAt || Date.now())),
      reasonCode: cleanText(input.reasonCode || "") || null,
      externalCallExecuted: input.externalCallExecuted === true,
      externalCallPrevented: input.externalCallPrevented === true,
    })
  );

  return lifecycle;
}

/**
 * Default shadow pipeline stub — never executed.
 * @param {unknown} result
 */
export function isDefaultShadowProviderStub(result) {
  if (!result || typeof result !== "object") return false;

  return (
    result.ok === false &&
    Array.isArray(result.products) &&
    result.products.length === 0 &&
    (result.error === null || result.error === undefined) &&
    result.skipped !== true &&
    result.requestDeduplicated !== true &&
    result.universalCommercialCacheHit !== true &&
    !result.costGuardDecision &&
    !result.budgetCircuitDecision &&
    !result.executionTelemetry &&
    !result.reasonCode &&
    !result.registryMetadata
  );
}

/**
 * @param {Record<string, unknown>} [result]
 */
export function deriveProviderExecutionTelemetry(result = {}) {
  const telemetry = result.executionTelemetry || {};
  const blockedBeforeFetch =
    telemetry.blockedBeforeFetch === true ||
    result.blockedBeforeFetch === true ||
    (result.httpRequestStarted !== true &&
      (result.error === "missing_env" ||
        result.error === "provider_disabled" ||
        result.costGuardDecision?.shouldCallProvider === false ||
        result.budgetCircuitDecision?.shouldCallProvider === false));

  const httpRequestStarted =
    telemetry.httpRequestStarted === true || result.httpRequestStarted === true;
  const httpRequestCompleted =
    telemetry.httpRequestCompleted === true || result.httpRequestCompleted === true;

  return {
    adapterInvoked: telemetry.adapterInvoked === true || result.adapterInvoked === true,
    clientInvoked: telemetry.clientInvoked === true || result.clientInvoked === true,
    httpRequestStarted,
    httpRequestCompleted,
    blockedBeforeFetch,
    neutralResult:
      telemetry.neutralResult === true ||
      (result.ok === false && !httpRequestStarted && !result.skipped),
    cacheHit: result.universalCommercialCacheHit === true,
    dedupHit: result.requestDeduplicated === true,
    reasonCode:
      cleanText(result.reasonCode || telemetry.reasonCode || result.error || "") || null,
  };
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function classifyMercadoLivreFetchInterruption(input = {}) {
  const result = input.providerResult || {};
  const telemetry = deriveProviderExecutionTelemetry(result);

  if (result.skipped === true) {
    return MERCADOLIVRE_FETCH_INTERRUPTION_CODES.PROVIDER_NOT_EXECUTED;
  }
  if (result.error === "provider_disabled") {
    return MERCADOLIVRE_FETCH_INTERRUPTION_CODES.PROVIDER_DISABLED;
  }
  if (result.universalCommercialCacheHit === true) {
    return MERCADOLIVRE_FETCH_INTERRUPTION_CODES.CACHE_HIT;
  }
  if (result.requestDeduplicated === true) {
    return MERCADOLIVRE_FETCH_INTERRUPTION_CODES.DEDUP_HIT;
  }
  if (result.costGuardDecision?.decision === "dry_run") {
    return MERCADOLIVRE_FETCH_INTERRUPTION_CODES.DEV_DRY_RUN;
  }
  if (
    result.costGuardDecision?.shouldCallProvider === false ||
    result.error === "cost_guard_blocked"
  ) {
    return MERCADOLIVRE_FETCH_INTERRUPTION_CODES.COST_GUARD_BLOCKED;
  }
  if (
    result.budgetCircuitDecision?.shouldCallProvider === false ||
    result.error === "budget_blocked"
  ) {
    return MERCADOLIVRE_FETCH_INTERRUPTION_CODES.BUDGET_BLOCKED;
  }
  if (
    result.budgetCircuitDecision?.decision === "block_circuit_open" ||
    result.error === "circuit_breaker_open"
  ) {
    return MERCADOLIVRE_FETCH_INTERRUPTION_CODES.CIRCUIT_BLOCKED;
  }
  if (result.error === "missing_env" || result.reasonCode === "missing_oauth_env") {
    return MERCADOLIVRE_FETCH_INTERRUPTION_CODES.MISSING_OAUTH_ENV;
  }
  if (result.reasonCode === "missing_public_config") {
    return MERCADOLIVRE_FETCH_INTERRUPTION_CODES.MISSING_PUBLIC_CONFIG;
  }
  if (!telemetry.adapterInvoked && !telemetry.clientInvoked && isDefaultShadowProviderStub(result)) {
    return MERCADOLIVRE_FETCH_INTERRUPTION_CODES.PROVIDER_NOT_EXECUTED;
  }
  if (telemetry.blockedBeforeFetch && !telemetry.httpRequestStarted) {
    return MERCADOLIVRE_FETCH_INTERRUPTION_CODES.PROVIDER_BLOCKED;
  }
  if (
    telemetry.httpRequestStarted &&
    (result.error === "empty_response" || result.reasonCode === "empty_response")
  ) {
    return MERCADOLIVRE_FETCH_INTERRUPTION_CODES.PROVIDER_HTTP_EMPTY;
  }
  if (result.error === "empty_or_unusable" || result.reasonCode === "empty_response") {
    return MERCADOLIVRE_FETCH_INTERRUPTION_CODES.PROVIDER_NORMALIZATION_EMPTY;
  }
  if (input.selectionEmpty === true) {
    return MERCADOLIVRE_FETCH_INTERRUPTION_CODES.PROVIDER_SELECTION_EMPTY;
  }
  if (!telemetry.httpRequestStarted) {
    return MERCADOLIVRE_FETCH_INTERRUPTION_CODES.PROVIDER_NOT_EXECUTED;
  }
  return null;
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function classifyCommercialCoverageEmptyReason(input = {}) {
  const interruption = classifyMercadoLivreFetchInterruption(input);
  if (interruption) return interruption;

  const result = input.providerResult || {};
  const telemetry = deriveProviderExecutionTelemetry(result);

  if (telemetry.httpRequestStarted && Array.isArray(result.products) && result.products.length === 0) {
    return MERCADOLIVRE_FETCH_INTERRUPTION_CODES.PROVIDER_HTTP_EMPTY;
  }
  if (input.normalizedResultCount === 0 && input.rawResultCount > 0) {
    return MERCADOLIVRE_FETCH_INTERRUPTION_CODES.PROVIDER_NORMALIZATION_EMPTY;
  }
  if (input.usableOfferCount === 0 && input.normalizedResultCount > 0) {
    return MERCADOLIVRE_FETCH_INTERRUPTION_CODES.PROVIDER_SELECTION_EMPTY;
  }
  return MERCADOLIVRE_FETCH_INTERRUPTION_CODES.PROVIDER_NOT_EXECUTED;
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function buildCommercialCoverageExecutionTelemetry(input = {}) {
  const priorityPlan = input.priorityPlan || {};
  const providerResults = input.providerResults || {};
  const conditionalExecution = input.conditionalExecution || null;

  const providerPlan = (priorityPlan.orderedProviders || []).map((entry) => entry.providerId);
  const providersEligible = (priorityPlan.orderedProviders || [])
    .filter((entry) => entry.eligible === true)
    .map((entry) => entry.providerId);

  const attemptedFromConditional = new Set(
    (conditionalExecution?.attempts || []).map((entry) => entry.providerId)
  );

  const providersAttempted = [];
  const adaptersInvoked = [];
  const clientsInvoked = [];
  const externalCallsStarted = [];
  const externalCallsCompleted = [];
  const providersBlockedBeforeFetch = [];
  const neutralResults = [];

  for (const [providerId, result] of Object.entries(providerResults)) {
    if (isDefaultShadowProviderStub(result)) continue;

    const fromConditional = attemptedFromConditional.size === 0 || attemptedFromConditional.has(providerId);
    if (!fromConditional && !result.executionTelemetry) continue;

    const telemetry = deriveProviderExecutionTelemetry(result);
    providersAttempted.push(providerId);
    if (telemetry.adapterInvoked) adaptersInvoked.push(providerId);
    if (telemetry.clientInvoked) clientsInvoked.push(providerId);
    if (telemetry.httpRequestStarted) externalCallsStarted.push(providerId);
    if (telemetry.httpRequestCompleted) externalCallsCompleted.push(providerId);
    if (telemetry.blockedBeforeFetch) providersBlockedBeforeFetch.push(providerId);
    if (telemetry.neutralResult) neutralResults.push(providerId);
  }

  return {
    version: MERCADOLIVRE_CONTROLLED_FETCH_PATH_AUDIT_VERSION,
    providerPlan,
    providersEligible,
    providersAttempted,
    adaptersInvoked,
    clientsInvoked,
    externalCallsStarted,
    externalCallsCompleted,
    providersBlockedBeforeFetch,
    neutralResults,
    externalCallsExecuted: externalCallsStarted.length,
    externalCallsPrevented:
      providersBlockedBeforeFetch.length +
      neutralResults.filter((id) => !externalCallsStarted.includes(id)).length,
  };
}

export function buildMercadoLivreControlledFetchPathMap() {
  return {
    version: MERCADOLIVRE_CONTROLLED_FETCH_PATH_AUDIT_VERSION,
    runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
    providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
    steps: CONTROLLED_FETCH_PATH_STEPS.map((step) => ({ ...step })),
  };
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
export function validateMercadoLivreControlledFetchPath(env = process.env) {
  const metadata = getCommercialProviderOperationalMetadata(
    COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
    env
  );
  const registry = getMercadoLivreCommercialRegistryMetadata(env);
  const oauthValidation = validateMercadoLivreEnv(env);
  const publicValidation = validateMercadoLivrePublicSearchEnv(env);
  const sampleUrl = buildMercadoLivreSearchUrl("probe", 1, env);

  const issues = [];

  if (metadata.requiresAuth === true) {
    issues.push("registry_requires_auth_true_for_public_provider");
  }
  if (!publicValidation.ok) {
    issues.push("public_search_env_invalid");
  }
  if (oauthValidation.ok && !publicValidation.ok) {
    issues.push("oauth_ready_but_public_search_not_ready");
  }
  if (!sampleUrl.includes("/sites/MLB/search")) {
    issues.push("invalid_default_search_url");
  }
  if (sampleUrl.includes("client_secret") || sampleUrl.includes("access_token")) {
    issues.push("search_url_contains_secrets");
  }

  return {
    version: MERCADOLIVRE_CONTROLLED_FETCH_PATH_AUDIT_VERSION,
    ok: issues.length === 0,
    issues,
    registry: {
      requiresAuth: registry.requiresAuth,
      billingTier: registry.billingTier,
      authMode: registry.authMode,
      enabled: registry.enabled,
      supportsControlled: registry.supportsControlled,
      supportsShadow: registry.supportsShadow,
    },
    publicSearch: publicValidation,
    oauthReadiness: {
      ready: oauthValidation.ok,
      missing: oauthValidation.missing,
      requiredForPublicSearch: false,
    },
    defaultSiteId: publicValidation.siteId,
    sampleSearchUrlSanitized: sampleUrl,
  };
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function buildMercadoLivreFetchPathDiagnostics(input = {}) {
  const result = input.providerResult || {};
  const lifecycle = input.lifecycle || null;
  const interruption = classifyMercadoLivreFetchInterruption({
    providerResult: result,
    selectionEmpty: input.selectionEmpty,
  });
  const telemetry = deriveProviderExecutionTelemetry(result);

  return {
    version: MERCADOLIVRE_CONTROLLED_FETCH_PATH_AUDIT_VERSION,
    providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
    runtimeMode: cleanText(input.runtimeMode || getCommercialRuntimeMode()),
    interruptionCode: interruption,
    executionTelemetry: telemetry,
    lifecycleStageCount: lifecycle?.stages?.length || 0,
    lifecycleStages: (lifecycle?.stages || []).map((entry) => entry.stage),
    reasonCode: telemetry.reasonCode,
    httpLikelyStarted: telemetry.httpRequestStarted,
  };
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function buildMercadoLivreControlledProbePlan(input = {}) {
  const env = input.env || process.env;
  const query = cleanText(input.query || "iPhone 13") || "iPhone 13";
  const probeEnabled =
    String(env?.[COMMERCIAL_ML_CONTROLLED_PROBE_ENABLED_ENV] || "")
      .trim()
      .toLowerCase() === "true";

  const pathValidation = validateMercadoLivreControlledFetchPath(env);
  const publicValidation = validateMercadoLivrePublicSearchEnv(env);

  return {
    version: MERCADOLIVRE_CONTROLLED_FETCH_PATH_AUDIT_VERSION,
    probeEnabled,
    authorized: probeEnabled,
    query,
    maxExternalCalls: 1,
    runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
    providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
    blockedProviders: [
      COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
      COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE,
    ],
    requiredEnv: {
      COMMERCIAL_ML_CONTROLLED_PROBE_ENABLED: "true",
      COMMERCIAL_RUNTIME_MODE: "controlled",
      COMMERCIAL_PROVIDER_MERCADOLIVRE_ENABLED: "true",
      COMMERCIAL_DEV_REAL_EXTERNAL_CALLS_ENABLED: "true",
      SERPAPI_KEY: "(empty to block Google)",
      APIFY_API_TOKEN: "(empty to block Apify)",
    },
    requiredFlags: ["--real", "--allow-external", "--max-calls=1"],
    sampleSearchUrlSanitized: buildMercadoLivreSearchUrl(query, 1, env),
    publicSearchReady: publicValidation.ok,
    pathValidation,
    cancelHint: "Do not set COMMERCIAL_ML_CONTROLLED_PROBE_ENABLED or omit --real.",
  };
}

/**
 * @param {Record<string, unknown>} [searchResult]
 * @param {Record<string, unknown>} [extra]
 */
export function buildMercadoLivreSearchExecutionTelemetry(searchResult = {}, extra = {}) {
  const httpRequestStarted = searchResult.httpRequestStarted === true;
  const httpRequestCompleted = searchResult.httpRequestCompleted === true;
  const blockedBeforeFetch = searchResult.blockedBeforeFetch === true;

  return {
    adapterInvoked: extra.adapterInvoked === true,
    clientInvoked: true,
    httpRequestStarted,
    httpRequestCompleted,
    blockedBeforeFetch,
    neutralResult: !httpRequestStarted && searchResult.ok !== true,
    reasonCode: cleanText(searchResult.reasonCode || searchResult.error || extra.reasonCode || "") || null,
  };
}
