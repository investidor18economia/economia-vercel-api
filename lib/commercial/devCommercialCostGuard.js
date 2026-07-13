/**
 * PATCH Comercial 05G — DEV Commercial Cost Guard
 *
 * Camada universal de segurança para ferramentas DEV.
 * Decide se o ambiente permite tentar execução real antes do Provider Cost Guard (05B).
 */

import {
  buildDevEndpointProviderCostGuardContext,
} from "./providerCostGuard.js";
import { getCommercialProviderBillingProfile } from "./providerCostAudit.js";

export const DEV_COMMERCIAL_COST_GUARD_VERSION = "05G";

export const DEV_COMMERCIAL_REAL_EXECUTION_OPT_IN_ENV =
  "COMMERCIAL_DEV_REAL_EXTERNAL_CALLS_ENABLED";

export const DEV_COMMERCIAL_COST_GUARD_DECISIONS = Object.freeze({
  DRY_RUN: "dry_run",
  ALLOW_REAL_EXECUTION: "allow_real_execution",
  BLOCK_MISSING_OPT_IN: "block_missing_opt_in",
  BLOCK_MISSING_DEV_SECRET: "block_missing_dev_secret",
  BLOCK_PRODUCTION_ENVIRONMENT: "block_production_environment",
  ALLOW_LOCAL_SYNTHETIC_TEST: "allow_local_synthetic_test",
  DEV_GUARD_NOT_APPLICABLE: "dev_guard_not_applicable",
});

export const DEV_COMMERCIAL_COST_GUARD_REASON_CODES = Object.freeze({
  DEV_DEFAULT_DRY_RUN: "dev_default_dry_run",
  DEV_REAL_EXECUTION_ALLOWED: "dev_real_execution_allowed",
  DEV_MISSING_ENV_OPT_IN: "dev_missing_env_opt_in",
  DEV_MISSING_REQUEST_OPT_IN: "dev_missing_request_opt_in",
  DEV_MISSING_DEV_SECRET: "dev_missing_dev_secret",
  DEV_PRODUCTION_BLOCKED: "dev_production_blocked",
  LOCAL_SYNTHETIC_ALLOWED: "local_synthetic_allowed",
  PRODUCTION_FUNCTIONAL_UNCHANGED: "production_functional_unchanged",
});

const REQUEST_REAL_OPT_IN_QUERY_KEYS = Object.freeze(["real", "execute"]);
const REQUEST_REAL_OPT_IN_HEADER = "x-dev-real-execution";

function cleanText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function resolveEnvironment(environment = "", env = process.env) {
  const resolved = cleanText(environment || env?.NODE_ENV || "development").toLowerCase();
  return resolved || "development";
}

function resolveBillingTier(providerId = "", billingTier = "") {
  const tier = cleanText(billingTier);
  if (tier) return tier;
  return getCommercialProviderBillingProfile(cleanText(providerId))?.tier || "unknown";
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
export function isCommercialDevRealExternalCallsEnabled(env = process.env) {
  const raw = String(env?.[DEV_COMMERCIAL_REAL_EXECUTION_OPT_IN_ENV] || "")
    .trim()
    .toLowerCase();
  return raw === "true" || raw === "1";
}

/**
 * @param {import("http").IncomingMessage|Record<string, unknown>|null} [req]
 * @param {boolean|null} [requestOverride]
 */
export function hasRequestRealExecutionOptIn(req = null, requestOverride = null) {
  if (requestOverride === true) return true;
  if (requestOverride === false) return false;
  if (!req || typeof req !== "object") return false;

  const query = req.query || {};
  for (const key of REQUEST_REAL_OPT_IN_QUERY_KEYS) {
    const raw = String(query[key] ?? "").trim().toLowerCase();
    if (raw === "1" || raw === "true") return true;
  }

  const headers = req.headers || {};
  const headerValue = String(
    headers[REQUEST_REAL_OPT_IN_HEADER] || headers[REQUEST_REAL_OPT_IN_HEADER.toLowerCase()] || ""
  )
    .trim()
    .toLowerCase();
  return headerValue === "1" || headerValue === "true";
}

/**
 * @param {import("http").IncomingMessage|Record<string, unknown>|null} [req]
 * @param {Record<string, string|undefined>} [env]
 */
export function isDevSecretValid(req = null, env = process.env) {
  const environment = resolveEnvironment("", env);
  if (environment !== "production") return true;

  const secret = String(env?.DEV_API_SECRET || "").trim();
  if (!secret) return false;

  const provided = String(
    req?.headers?.["x-dev-api-secret"] ||
      req?.query?.secret ||
      ""
  ).trim();

  return provided === secret;
}

/**
 * @param {import("http").IncomingMessage|Record<string, unknown>|null} [req]
 * @param {Record<string, string|undefined>} [env]
 */
export function isDevEndpointAllowed(req = null, env = process.env) {
  return isDevSecretValid(req, env);
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function shouldDevCommercialCostGuardApply(input = {}) {
  if (input.devGuardApplies === false) return false;
  if (input.devGuardApplies === true) return true;
  if (input.isSyntheticTest === true) return false;
  if (input.isDevEndpoint === true) return true;
  if (input.isManualAudit === true || input.invocationSource === "manual_script") return true;
  if (input.isTestEndpoint === true) return true;

  const source = cleanText(input.invocationSource);
  if (source.startsWith("dev_") || source === "dev_endpoint" || source === "test_endpoint") {
    return true;
  }

  const environment = resolveEnvironment(input.environment, input.env || process.env);
  if (environment !== "production" && input.isNonProductionExternalCall === true) {
    return true;
  }

  return false;
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function evaluateDevCommercialExecutionPermission(input = {}) {
  const env = input.env || process.env;
  const environment = resolveEnvironment(input.environment, env);
  const invocationSource = cleanText(input.invocationSource || "unspecified");
  const providerId = cleanText(input.providerId || "");
  const billingTier = resolveBillingTier(providerId, cleanText(input.billingTier));
  const req = input.req || null;
  const isSyntheticTest =
    input.isSyntheticTest === true ||
    billingTier === "internal" ||
    billingTier === "disabled";
  const envOptIn = isCommercialDevRealExternalCallsEnabled(env);
  const requestOptIn = hasRequestRealExecutionOptIn(req, input.requestOptIn);
  const devSecretValid = isDevSecretValid(req, env);
  const devGuardApplies = shouldDevCommercialCostGuardApply({
    ...input,
    invocationSource,
    billingTier,
  });

  const base = {
    version: DEV_COMMERCIAL_COST_GUARD_VERSION,
    decision: DEV_COMMERCIAL_COST_GUARD_DECISIONS.DEV_GUARD_NOT_APPLICABLE,
    reasonCode: DEV_COMMERCIAL_COST_GUARD_REASON_CODES.PRODUCTION_FUNCTIONAL_UNCHANGED,
    environment,
    invocationSource,
    providerId: providerId || null,
    billingTier,
    hasDevSecret: devSecretValid,
    hasExplicitRealExecutionOptIn: false,
    envOptIn,
    requestOptIn,
    devGuardApplies,
    shouldCallExternalProvider: true,
    shouldReturnDryRun: false,
    externalCallPrevented: false,
    realExecutionAllowed: false,
  };

  if (isSyntheticTest) {
    return finalizeDevGuardDecision(base, {
      decision: DEV_COMMERCIAL_COST_GUARD_DECISIONS.ALLOW_LOCAL_SYNTHETIC_TEST,
      reasonCode: DEV_COMMERCIAL_COST_GUARD_REASON_CODES.LOCAL_SYNTHETIC_ALLOWED,
      shouldCallExternalProvider: false,
      shouldReturnDryRun: false,
      externalCallPrevented: true,
      realExecutionAllowed: false,
      devGuardApplies: true,
    });
  }

  if (!devGuardApplies) {
    return finalizeDevGuardDecision(base, {
      decision: DEV_COMMERCIAL_COST_GUARD_DECISIONS.DEV_GUARD_NOT_APPLICABLE,
      reasonCode: DEV_COMMERCIAL_COST_GUARD_REASON_CODES.PRODUCTION_FUNCTIONAL_UNCHANGED,
      shouldCallExternalProvider: true,
      shouldReturnDryRun: false,
      externalCallPrevented: false,
      realExecutionAllowed: true,
    });
  }

  if (environment === "production" && !devSecretValid) {
    return finalizeDevGuardDecision(base, {
      decision: DEV_COMMERCIAL_COST_GUARD_DECISIONS.BLOCK_MISSING_DEV_SECRET,
      reasonCode: DEV_COMMERCIAL_COST_GUARD_REASON_CODES.DEV_MISSING_DEV_SECRET,
      shouldCallExternalProvider: false,
      shouldReturnDryRun: false,
      externalCallPrevented: true,
      realExecutionAllowed: false,
      blocked: true,
      statusCode: 403,
    });
  }

  const hasExplicitRealExecutionOptIn = envOptIn && requestOptIn && devSecretValid;

  if (!hasExplicitRealExecutionOptIn) {
    const reasonCode = !envOptIn
      ? DEV_COMMERCIAL_COST_GUARD_REASON_CODES.DEV_MISSING_ENV_OPT_IN
      : !requestOptIn
        ? DEV_COMMERCIAL_COST_GUARD_REASON_CODES.DEV_MISSING_REQUEST_OPT_IN
        : DEV_COMMERCIAL_COST_GUARD_REASON_CODES.DEV_MISSING_DEV_SECRET;

    return finalizeDevGuardDecision(base, {
      decision: DEV_COMMERCIAL_COST_GUARD_DECISIONS.DRY_RUN,
      reasonCode: DEV_COMMERCIAL_COST_GUARD_REASON_CODES.DEV_DEFAULT_DRY_RUN,
      shouldCallExternalProvider: false,
      shouldReturnDryRun: true,
      externalCallPrevented: true,
      realExecutionAllowed: false,
      missingOptInReason: reasonCode,
    });
  }

  return finalizeDevGuardDecision(base, {
    decision: DEV_COMMERCIAL_COST_GUARD_DECISIONS.ALLOW_REAL_EXECUTION,
    reasonCode: DEV_COMMERCIAL_COST_GUARD_REASON_CODES.DEV_REAL_EXECUTION_ALLOWED,
    hasExplicitRealExecutionOptIn: true,
    shouldCallExternalProvider: true,
    shouldReturnDryRun: false,
    externalCallPrevented: false,
    realExecutionAllowed: true,
  });
}

function finalizeDevGuardDecision(base, extra = {}) {
  const decision = {
    ...base,
    ...extra,
    hasExplicitRealExecutionOptIn:
      extra.hasExplicitRealExecutionOptIn === true ||
      base.hasExplicitRealExecutionOptIn === true,
    diagnostics: buildDevCommercialCostGuardDiagnostics({
      ...base,
      ...extra,
    }),
    requiredOptIn: buildRequiredDevCommercialOptIn(),
  };

  decision.safetyMessage = buildDevCommercialSafetyMessage(decision);
  return decision;
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function shouldRunCommercialDevDryRun(input = {}) {
  const permission = evaluateDevCommercialExecutionPermission(input);
  return permission.shouldReturnDryRun === true;
}

/**
 * @param {Record<string, unknown>} [overrides]
 */
export function buildDevCommercialCostGuardContext(overrides = {}) {
  const { req, ...rest } = overrides;
  const permission = evaluateDevCommercialExecutionPermission({
    req,
    isDevEndpoint: true,
    ...rest,
  });

  return buildDevEndpointProviderCostGuardContext({
    ...rest,
    hasExplicitPaidProviderOptIn: permission.hasExplicitRealExecutionOptIn,
    _devCommercialCostGuardLocked: true,
    devCommercialCostGuardDecision: permission,
  });
}

export function buildRequiredDevCommercialOptIn() {
  return {
    env: DEV_COMMERCIAL_REAL_EXECUTION_OPT_IN_ENV,
    envValue: "true",
    requestQuery: "real=1 or execute=1",
    requestHeader: REQUEST_REAL_OPT_IN_HEADER,
    productionSecretHeader: "x-dev-api-secret",
    productionSecretQuery: "secret",
    scriptFlag: "--allow-paid-external",
  };
}

/**
 * @param {Record<string, unknown>} [decision]
 */
export function buildDevCommercialCostGuardDiagnostics(decision = {}) {
  return {
    version: decision.version || DEV_COMMERCIAL_COST_GUARD_VERSION,
    endpoint: cleanText(decision.endpoint) || null,
    providerId: decision.providerId || null,
    decision: decision.decision || null,
    reasonCode: decision.reasonCode || null,
    dryRun: decision.shouldReturnDryRun === true,
    realExecutionAllowed: decision.realExecutionAllowed === true,
    externalCallPrevented: decision.externalCallPrevented === true,
    envOptIn: decision.envOptIn === true,
    requestOptIn: decision.requestOptIn === true,
    devSecretValid: decision.hasDevSecret === true,
    environment: decision.environment || null,
    invocationSource: decision.invocationSource || null,
    billingTier: decision.billingTier || null,
    missingOptInReason: decision.missingOptInReason || null,
  };
}

/**
 * @param {Record<string, unknown>} [decision]
 */
export function buildDevCommercialSafetyMessage(decision = {}) {
  if (decision.realExecutionAllowed === true) {
    return "Execução real autorizada em DEV com opt-in explícito. Chamadas externas podem consumir créditos.";
  }

  if (decision.decision === DEV_COMMERCIAL_COST_GUARD_DECISIONS.BLOCK_MISSING_DEV_SECRET) {
    return "Bloqueado: em produção, endpoints DEV exigem DEV_API_SECRET válido. Nenhuma API externa foi chamada.";
  }

  if (decision.decision === DEV_COMMERCIAL_COST_GUARD_DECISIONS.ALLOW_LOCAL_SYNTHETIC_TEST) {
    return "Teste sintético local permitido. Nenhuma chamada externa será executada.";
  }

  if (decision.shouldReturnDryRun === true) {
    const providerLabel = decision.providerId ? ` (${decision.providerId})` : "";
    return [
      "Modo dry-run em DEV: nenhuma API externa foi chamada e nenhum custo foi gerado.",
      `Provider planejado${providerLabel}.`,
      `Para execução real: defina ${DEV_COMMERCIAL_REAL_EXECUTION_OPT_IN_ENV}=true,`,
      "adicione real=1 ou execute=1 na request e, em produção, envie DEV_API_SECRET.",
      "Chamadas reais podem consumir créditos de provider.",
    ].join(" ");
  }

  return "Ambiente de produção funcional — DEV Cost Guard não se aplica.";
}

/**
 * @param {Record<string, unknown>} permission
 * @param {Record<string, unknown>} [extra]
 */
export function buildDevCommercialCostGuardResponse(permission = {}, extra = {}) {
  const plannedRequest = extra.plannedRequest || permission.plannedRequest || null;

  return {
    ok: true,
    dryRun: permission.shouldReturnDryRun === true,
    externalCallExecuted: false,
    externalCallPrevented: permission.externalCallPrevented === true,
    providerId: permission.providerId || extra.providerId || null,
    plannedRequest,
    reasonCode: permission.reasonCode || null,
    requiredOptIn: permission.requiredOptIn || buildRequiredDevCommercialOptIn(),
    safetyMessage: permission.safetyMessage || buildDevCommercialSafetyMessage(permission),
    devCommercialCostGuard: buildDevCommercialCostGuardDevPayload(permission),
    ...extra,
  };
}

/**
 * @param {Record<string, unknown>} [decision]
 */
export function buildDevCommercialCostGuardDevPayload(decision = {}) {
  return {
    version: DEV_COMMERCIAL_COST_GUARD_VERSION,
    decision,
    diagnostics: buildDevCommercialCostGuardDiagnostics(decision),
  };
}

/**
 * @param {Record<string, unknown>|null} [decision]
 */
export function buildDevCommercialCostGuardTracePatch(decision = null) {
  if (!decision) return null;

  return {
    dev_commercial_cost_guard: buildDevCommercialCostGuardDiagnostics(decision),
    dev_commercial_cost_guard_full: decision,
  };
}

/**
 * @param {import("http").IncomingMessage|Record<string, unknown>|null} req
 * @param {Record<string, unknown>} [options]
 */
export function resolveDevCommercialEndpointGuard(req, options = {}) {
  const providerId = cleanText(options.providerId || options.providerIds?.[0] || "");
  const permission = evaluateDevCommercialExecutionPermission({
    req,
    providerId,
    isDevEndpoint: true,
    invocationSource: options.invocationSource || "dev_endpoint",
    plannedRequest: options.plannedRequest || null,
    billingTier: options.billingTier || "",
    environment: options.environment,
    env: options.env,
  });

  if (permission.blocked === true) {
    return {
      permission,
      blocked: true,
      statusCode: permission.statusCode || 403,
      body: {
        ok: false,
        error: "dev_commercial_cost_guard_blocked",
        reasonCode: permission.reasonCode,
        safetyMessage: permission.safetyMessage,
        devCommercialCostGuard: buildDevCommercialCostGuardDevPayload(permission),
      },
      shouldReturnDryRunResponse: false,
      costGuardContext: null,
    };
  }

  if (permission.shouldReturnDryRun === true && options.endpointLevelDryRun !== false) {
    return {
      permission,
      blocked: false,
      shouldReturnDryRunResponse: true,
      body: buildDevCommercialCostGuardResponse(permission, {
        endpoint: options.endpoint || null,
        plannedRequest: options.plannedRequest || null,
        providerId: providerId || null,
      }),
      costGuardContext: buildDevCommercialCostGuardContext({
        req,
        providerId,
        invocationSource: options.invocationSource || "dev_endpoint",
        plannedRequest: options.plannedRequest || null,
      }),
    };
  }

  return {
    permission,
    blocked: false,
    shouldReturnDryRunResponse: false,
    costGuardContext: buildDevCommercialCostGuardContext({
      req,
      providerId,
      invocationSource: options.invocationSource || "dev_endpoint",
      plannedRequest: options.plannedRequest || null,
    }),
  };
}

/**
 * @param {string[]} [argv]
 * @param {Record<string, string|undefined>} [env]
 */
export function evaluateDevManualScriptCommercialExecution(
  argv = process.argv,
  env = process.env
) {
  const wantsRealHttp =
    argv.includes("--http") || argv.includes("--live") || argv.includes("--real");

  if (!wantsRealHttp) {
    return {
      applies: false,
      allowed: true,
      skipped: true,
    };
  }

  const permission = evaluateDevCommercialExecutionPermission({
    env,
    invocationSource: "manual_script",
    isManualAudit: true,
    requestOptIn: argv.includes("--allow-paid-external"),
    providerId: cleanText(
      argv.find((entry) => entry.startsWith("--provider="))?.split("=")[1] || ""
    ),
  });

  return {
    applies: true,
    allowed: permission.realExecutionAllowed === true,
    permission,
    safetyMessage: permission.safetyMessage,
  };
}

/**
 * @param {string[]} [argv]
 * @param {Record<string, string|undefined>} [env]
 */
export function enforceDevManualScriptCommercialExecution(
  argv = process.argv,
  env = process.env
) {
  const evaluation = evaluateDevManualScriptCommercialExecution(argv, env);
  if (!evaluation.applies) return evaluation;

  if (!evaluation.allowed) {
    console.error("\nDEV Commercial Cost Guard — execução real bloqueada.");
    console.error(evaluation.safetyMessage || "Opt-in explícito ausente.");
    console.error(
      `Requisitos: ${DEV_COMMERCIAL_REAL_EXECUTION_OPT_IN_ENV}=true + --allow-paid-external + (--http|--live|--real)`
    );
    process.exit(1);
  }

  console.warn("\n⚠️  DEV Commercial Cost Guard — execução real autorizada. Chamadas externas podem consumir créditos.\n");
  return evaluation;
}
