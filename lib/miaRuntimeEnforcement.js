/**
 * PATCH 11A.8B / 11A.9 — Runtime Enforcement Hardening & E2E Closure
 *
 * Lifecycle, sealing, invariant severity, repair ledger,
 * provider accounting, dedup/cost-guard hooks and fail-closed handling.
 *
 * MIA owns the intelligence. The LLM only verbalizes.
 */

import { COMMERCIAL_PERMISSION } from "./miaIntentAuthority.js";
import {
  resolveResponsePathRegistry,
  RUNTIME_CLASSES,
} from "./miaRuntimePrecedence.js";
import { COMMERCIAL_REQUEST_DEDUP_STATUS } from "./commercial/commercialRequestDeduplication.js";
import {
  PROVIDER_COST_GUARD_REASON_CODES,
} from "./commercial/providerCostGuard.js";

import {
  evaluateExternalProviderExecutionPolicy,
  isMiaTestMode,
} from "./commercial/externalProviderExecutionPolicy.js";
import {
  createExternalCallAccounting,
  externalCallAccountingToTrace,
  bindActiveExternalCallAccounting,
  clearActiveExternalCallAccounting,
} from "./commercial/externalProviderExecutionPolicy.js";

export const RUNTIME_ENFORCEMENT_VERSION = "11A.9A.1";

export const LIFECYCLE_STATES = Object.freeze({
  CREATED: "created",
  AUTHORIZED: "authorized",
  FINALIZED: "finalized",
  TRANSITIONED: "transitioned",
  VALIDATED: "validated",
  SEALED: "sealed",
  SENT: "sent",
});

export const INVARIANT_SEVERITY = Object.freeze({
  FATAL: "fatal",
  RECOVERABLE: "recoverable",
  DIAGNOSTIC: "diagnostic",
});

const INVARIANT_SEVERITY_MAP = Object.freeze({
  unknown_response_path: INVARIANT_SEVERITY.FATAL,
  earlyReturnUnauthorized: INVARIANT_SEVERITY.FATAL,
  missingIntentAuthority: INVARIANT_SEVERITY.FATAL,
  missingFinalRouting: INVARIANT_SEVERITY.FATAL,
  commercialGateMissing: INVARIANT_SEVERITY.FATAL,
  stateTransitionMissing: INVARIANT_SEVERITY.FATAL,
  provenanceMissing: INVARIANT_SEVERITY.FATAL,
  legacyDecisionWon: INVARIANT_SEVERITY.FATAL,
  csoUnauthorizedReturn: INVARIANT_SEVERITY.FATAL,
  postSealMutation: INVARIANT_SEVERITY.FATAL,
  doubleHttpResponse: INVARIANT_SEVERITY.FATAL,
  providerAfterGateDeny: INVARIANT_SEVERITY.FATAL,
  providerFreePathCalledProvider: INVARIANT_SEVERITY.RECOVERABLE,
  invalidWinnerOnDegradedPath: INVARIANT_SEVERITY.RECOVERABLE,
  invalidPricesOnNoResultPath: INVARIANT_SEVERITY.RECOVERABLE,
  degradationMissing: INVARIANT_SEVERITY.DIAGNOSTIC,
  authorityPathMismatch: INVARIANT_SEVERITY.FATAL,
});

const LIFECYCLE_ORDER = [
  LIFECYCLE_STATES.CREATED,
  LIFECYCLE_STATES.AUTHORIZED,
  LIFECYCLE_STATES.FINALIZED,
  LIFECYCLE_STATES.TRANSITIONED,
  LIFECYCLE_STATES.VALIDATED,
  LIFECYCLE_STATES.SEALED,
  LIFECYCLE_STATES.SENT,
];

function isStrictRuntimeMode() {
  return (
    process.env.MIA_RUNTIME_STRICT === "true" ||
    process.env.NODE_ENV === "test" ||
    process.env.MIA_RUNTIME_ENFORCEMENT_STRICT === "true"
  );
}

function isProductionRuntimeMode() {
  return process.env.NODE_ENV === "production" && !isStrictRuntimeMode();
}

export function createRuntimeEnforcementContext() {
  const externalCallAccounting = createExternalCallAccounting();
  return {
    version: RUNTIME_ENFORCEMENT_VERSION,
    externalCallAccounting,
    lifecycle: {
      state: LIFECYCLE_STATES.CREATED,
      history: [LIFECYCLE_STATES.CREATED],
      violations: [],
    },
    repairLedger: [],
    providerAccounting: createProviderAccounting(),
    externalCallAccounting,
    httpSendCount: 0,
    responseSent: false,
    doubleResponsePrevented: false,
    sealedPayload: null,
    sealedFingerprint: null,
    payloadFingerprintBeforeSeal: null,
    payloadFingerprintAtSend: null,
    postSealMutationDetected: false,
    providerAfterSealCount: 0,
    providerAfterHttpSendCount: 0,
    sessionMutationAfterSealCount: 0,
    sessionMutationAfterHttpSendCount: 0,
    postSealPayloadMutationCount: 0,
    transitionPrepared: null,
    transitionCommitted: false,
    stateRollbackApplied: false,
    unknownPathFailClosed: false,
    normalizedResponsePath: null,
    invariantFatalCount: 0,
    invariantRecoverableCount: 0,
    invariantDiagnosticCount: 0,
    legacyAuthorityViolation: false,
    csoAuthorityViolation: false,
    shadowAuthorityViolation: false,
  };
}

export function createProviderAccounting() {
  return {
    attempted: 0,
    executed: 0,
    blockedByGate: 0,
    blockedByBudget: 0,
    blockedByCircuit: 0,
    blockedByEnvironment: 0,
    blockedByProviderDisabled: 0,
    blockedByCredentials: 0,
    blockedByPolicy: 0,
    blockedByTestPolicy: 0,
    servedFromCache: 0,
    deduplicated: 0,
    inFlightPromiseReuse: 0,
    succeeded: 0,
    failed: 0,
    retries: 0,
    dedupEventsApplied: 0,
    costGuardDecisions: [],
    externalCallAccounting: createExternalCallAccounting(),
    providers: [],
  };
}

export function classifyInvariantSeverity(invariant = "") {
  return INVARIANT_SEVERITY_MAP[invariant] || INVARIANT_SEVERITY.RECOVERABLE;
}

export function advanceRuntimeLifecycle(enforcementCtx, nextState) {
  if (!enforcementCtx?.lifecycle) return enforcementCtx;

  const currentIdx = LIFECYCLE_ORDER.indexOf(enforcementCtx.lifecycle.state);
  const nextIdx = LIFECYCLE_ORDER.indexOf(nextState);

  if (nextIdx === -1) {
    enforcementCtx.lifecycle.violations.push(`invalid_lifecycle_state:${nextState}`);
    return enforcementCtx;
  }

  if (nextIdx < currentIdx) {
    enforcementCtx.lifecycle.violations.push(
      `lifecycle_regression:${enforcementCtx.lifecycle.state}_to_${nextState}`
    );
    if (isStrictRuntimeMode()) {
      throw new Error(`runtime_lifecycle_regression:${nextState}`);
    }
    return enforcementCtx;
  }

  if (nextIdx > currentIdx + 1 && nextState !== LIFECYCLE_STATES.SENT) {
    for (let i = currentIdx + 1; i <= nextIdx; i += 1) {
      const state = LIFECYCLE_ORDER[i];
      if (!enforcementCtx.lifecycle.history.includes(state)) {
        enforcementCtx.lifecycle.history.push(state);
      }
    }
  } else if (!enforcementCtx.lifecycle.history.includes(nextState)) {
    enforcementCtx.lifecycle.history.push(nextState);
  }

  enforcementCtx.lifecycle.state = nextState;
  return enforcementCtx;
}

export function appendRepairLedgerEntry(enforcementCtx, entry = {}) {
  if (!enforcementCtx) return;
  enforcementCtx.repairLedger.push({
    invariant: entry.invariant || null,
    severity: entry.severity || INVARIANT_SEVERITY.RECOVERABLE,
    originalValuePresent: !!entry.originalValuePresent,
    action: entry.action || null,
    responsePath: entry.responsePath || null,
    timestamp: Date.now(),
  });
  if (entry.severity === INVARIANT_SEVERITY.FATAL) {
    enforcementCtx.invariantFatalCount += 1;
  } else if (entry.severity === INVARIANT_SEVERITY.RECOVERABLE) {
    enforcementCtx.invariantRecoverableCount += 1;
  } else {
    enforcementCtx.invariantDiagnosticCount += 1;
  }
}

function stableSerialize(value) {
  if (value == null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
}

export function buildPayloadFingerprint(body = {}) {
  const prices = Array.isArray(body?.prices) ? body.prices : [];
  const session = body?.session_context || {};
  const provenance = session?.semanticStateProvenance || body?.runtime_provenance || null;
  const miaDebug = body?.mia_debug || null;
  return stableSerialize({
    reply: String(body?.reply || ""),
    prices: prices.map((item) => ({
      product_name: item?.product_name ?? null,
      price: item?.price ?? null,
      source: item?.source ?? null,
    })),
    winner: body?.winner ?? session?.lastBestProduct?.product_name ?? null,
    reasonCode: body?.reasonCode ?? session?.lastCommercialReasonCode ?? null,
    lastInteractionType: session?.lastInteractionType || null,
    provenance,
    miaDebugTraceKeys: miaDebug?.trace ? Object.keys(miaDebug.trace).sort() : [],
  });
}

export function deepSealPayload(body = {}) {
  return JSON.parse(JSON.stringify(body));
}

export function sealRuntimePayload(enforcementCtx, body = {}) {
  if (!enforcementCtx) return { body, fingerprint: null };
  const snapshot = deepSealPayload(body);
  const fingerprint = buildPayloadFingerprint(snapshot);
  enforcementCtx.sealedPayload = snapshot;
  enforcementCtx.sealedFingerprint = fingerprint;
  enforcementCtx.payloadFingerprintBeforeSeal = fingerprint;
  advanceRuntimeLifecycle(enforcementCtx, LIFECYCLE_STATES.SEALED);
  return { body: snapshot, fingerprint };
}

export function detectPostSealMutation(enforcementCtx, body = {}) {
  if (!enforcementCtx?.sealedFingerprint) {
    return { mutated: false, fingerprint: buildPayloadFingerprint(body) };
  }
  const current = buildPayloadFingerprint(body);
  const mutated = current !== enforcementCtx.sealedFingerprint;
  if (mutated) {
    enforcementCtx.postSealMutationDetected = true;
    appendRepairLedgerEntry(enforcementCtx, {
      invariant: "postSealMutation",
      severity: INVARIANT_SEVERITY.FATAL,
      originalValuePresent: true,
      action: "post_finalizer_mutation_blocked",
      responsePath: null,
    });
    if (isStrictRuntimeMode()) {
      throw new Error("runtime_post_seal_mutation");
    }
  }
  enforcementCtx.payloadFingerprintAtSend = current;
  return { mutated, fingerprint: current };
}

export function recordInvariantRepairs(enforcementCtx, {
  responsePath = "",
  violations = [],
  corrected = false,
  bodyBefore = {},
  bodyAfter = {},
} = {}) {
  if (!enforcementCtx || !violations.length) return;

  for (const violation of violations) {
    const severity = classifyInvariantSeverity(violation);
    let action = null;
    if (violation === "invalidWinnerOnDegradedPath") action = "winner_removed_from_no_result";
    if (violation === "invalidPricesOnNoResultPath") action = "prices_removed_from_no_result";
    if (violation === "providerFreePathCalledProvider") action = "prices_removed_from_provider_free";
    if (violation === "unknown_response_path") action = "unknown_path_payload_sanitized";

    appendRepairLedgerEntry(enforcementCtx, {
      invariant: violation,
      severity,
      originalValuePresent: true,
      action: corrected ? action || "auto_repaired" : null,
      responsePath,
    });

    if (severity === INVARIANT_SEVERITY.FATAL && isStrictRuntimeMode() && !corrected) {
      throw new Error(`runtime_fatal_invariant:${violation}`);
    }
  }
}

export function executeUnknownPathFailClosed({
  responsePath = "",
  body = {},
  intentAuthority = null,
  commercialEntryGate = null,
} = {}) {
  return {
    unknownPathFailClosed: true,
    originalResponsePath: responsePath,
    normalizedResponsePath: "non_commercial_governed_fallback",
    body: {
      reply:
        body?.reply ||
        "Consigo te ajudar, mas precisei simplificar a resposta para manter a conversa coerente.",
      prices: [],
      session_context: body?.session_context ? { ...body.session_context } : {},
      winner: null,
    },
    reasonCode: "unknown_response_path",
    providerExecutedCount: 0,
    gateDeny:
      intentAuthority?.commercialPermission === COMMERCIAL_PERMISSION.DENY ||
      commercialEntryGate?.commercialEntryAllowed === false,
  };
}

export {
  bindActiveExternalCallAccounting,
  clearActiveExternalCallAccounting,
  bindActiveRequestExecutionEnv,
  clearActiveRequestExecutionEnv,
  createExternalCallAccounting,
  externalCallAccountingToTrace,
  evaluateExternalProviderExecutionPolicy,
  isMiaTestMode,
  isExternalProviderCallsEnabled,
  isPaidProviderCallsEnabled,
  EXTERNAL_BLOCK_REASON_CODES,
  SHADOW_EXECUTION_POLICY,
} from "./commercial/externalProviderExecutionPolicy.js";

export function normalizeCostGuardBlockResult(decision = {}) {
  const reasonCode = decision.reasonCode || decision.diagnostics?.reasonCode || null;
  let category = "policy";
  if (reasonCode === PROVIDER_COST_GUARD_REASON_CODES.BLOCKED_BY_TEST_POLICY) category = "test_policy";
  if (reasonCode === PROVIDER_COST_GUARD_REASON_CODES.BLOCKED_BY_MISSING_CREDENTIALS) category = "credentials";
  if (reasonCode === PROVIDER_COST_GUARD_REASON_CODES.PAID_OBSERVABILITY_BLOCKED) category = "budget";
  if (reasonCode === "budget_exhausted" || reasonCode === "budget_blocked") category = "budget";
  if (reasonCode === "circuit_open" || reasonCode === "circuit_breaker_open") category = "circuit";
  return {
    applied: true,
    allowed: decision.shouldCallProvider === true,
    reasonCode,
    category,
    providerExecutionAvoided: decision.externalCallPrevented === true,
  };
}

export function resolveCommercialProviderCostGuardId(providerName = "") {
  const map = {
    mercadolivre: "mercadolivre_public",
    supabasecache: "supabasecache",
    serpapi: "google_shopping",
    google_shopping: "google_shopping",
    mercadolivre_public: "mercadolivre_public",
    apify_mercadolivre: "apify_mercadolivre",
    commercial_search_cache: "supabasecache",
  };
  return map[String(providerName || "").toLowerCase()] || String(providerName || "").toLowerCase();
}

export function mapCostGuardReasonToBlockCategory(reasonCode = "") {
  const code = String(reasonCode || "");
  if (code === PROVIDER_COST_GUARD_REASON_CODES.PROVIDER_DISABLED) {
    return "blockedByProviderDisabled";
  }
  if (code === PROVIDER_COST_GUARD_REASON_CODES.BLOCKED_BY_MISSING_CREDENTIALS) {
    return "blockedByCredentials";
  }
  if (code === PROVIDER_COST_GUARD_REASON_CODES.BLOCKED_BY_TEST_POLICY) {
    return "blockedByTestPolicy";
  }
  if (code === "budget_exhausted" || code === "budget_blocked") {
    return "blockedByBudget";
  }
  if (code === "circuit_open" || code === "circuit_breaker_open") {
    return "blockedByCircuit";
  }
  if (
    code === PROVIDER_COST_GUARD_REASON_CODES.DEV_PAID_BLOCKED ||
    code === PROVIDER_COST_GUARD_REASON_CODES.PAID_OBSERVABILITY_BLOCKED ||
    code === PROVIDER_COST_GUARD_REASON_CODES.UNKNOWN_EXTERNAL_BLOCKED
  ) {
    return "blockedByBudget";
  }
  if (
    code === PROVIDER_COST_GUARD_REASON_CODES.DEV_PAID_DRY_RUN ||
    code === PROVIDER_COST_GUARD_REASON_CODES.PAID_OBSERVABILITY_ALLOWED_OPT_IN
  ) {
    return "blockedByEnvironment";
  }
  return "blockedByPolicy";
}

export function recordProviderCostGuardBlock(providerAccounting, {
  providerId = "",
  decision = {},
} = {}) {
  if (!providerAccounting) return;

  const reasonCode = decision.reasonCode || decision.diagnostics?.reasonCode || null;
  const category = mapCostGuardReasonToBlockCategory(reasonCode);
  providerAccounting[category] = (providerAccounting[category] || 0) + 1;

  providerAccounting.costGuardDecisions.push({
    providerId,
    costGuardApplied: true,
    costGuardAllowed: decision.shouldCallProvider === true,
    costGuardReason: reasonCode,
    providerExecutionAvoided: decision.externalCallPrevented === true,
    decision: decision.decision || null,
  });

  providerAccounting.providers.push({
    providerId,
    attempted: true,
    executed: false,
    blockedReason: category,
    costGuardApplied: true,
    costGuardAllowed: decision.shouldCallProvider === true,
    costGuardReason: reasonCode,
    providerExecutionAvoided: true,
    cacheHit: false,
    deduplicated: false,
  });
}

export function applyCommercialDedupEventToAccounting(enforcementCtx, event = {}) {
  const providerAccounting = enforcementCtx?.providerAccounting;
  if (!providerAccounting || !event) return;

  providerAccounting.dedupEventsApplied += 1;

  if (event.hit !== true) {
    return;
  }

  const eventKey = `${event.status}:${event.canonicalKeyHash}:${event.providerId}`;
  const seen =
    enforcementCtx._dedupAccountingSeen ||
    (enforcementCtx._dedupAccountingSeen = new Set());
  if (seen.has(eventKey)) return;
  seen.add(eventKey);

  providerAccounting.deduplicated += 1;
  if (event.status === COMMERCIAL_REQUEST_DEDUP_STATUS.IN_FLIGHT_REUSE) {
    providerAccounting.inFlightPromiseReuse += 1;
  }

  providerAccounting.providers.push({
    providerId: event.providerId || null,
    attempted: true,
    executed: false,
    deduplicated: true,
    dedupSource: "cross_layer_request_dedup",
    dedupStatus: event.status || null,
    reusedInFlightPromise: event.status === COMMERCIAL_REQUEST_DEDUP_STATUS.IN_FLIGHT_REUSE,
    providerExecutionAvoided: event.externalCallPrevented === true,
    cacheHit: false,
  });
}

export function syncCommercialDedupEventsToAccounting(enforcementCtx, dedupContext = null) {
  if (!enforcementCtx?.providerAccounting || !dedupContext?.events?.length) {
    return { applied: 0 };
  }

  const seen = enforcementCtx._dedupEventsSeen || (enforcementCtx._dedupEventsSeen = new Set());
  let applied = 0;

  for (const event of dedupContext.events) {
    const key = `${event.at}:${event.providerId}:${event.status}:${event.canonicalKeyHash}:${event.hit}`;
    if (seen.has(key)) continue;
    seen.add(key);
    applyCommercialDedupEventToAccounting(enforcementCtx, event);
    applied += 1;
  }

  return { applied };
}

export function attachCommercialDedupAccountingObserver(dedupContext, enforcementCtx) {
  if (!dedupContext || !enforcementCtx) return dedupContext;
  dedupContext.accountingObserver = (event) => {
    applyCommercialDedupEventToAccounting(enforcementCtx, event);
  };
  return dedupContext;
}

export function validateProviderAccountingConsistency(providerAccounting = null) {
  const pa = providerAccounting || createProviderAccounting();
  const violations = [];

  if (pa.executed > pa.attempted && pa.deduplicated === 0) {
    violations.push("executed_exceeds_attempted");
  }
  if (pa.succeeded + pa.failed > pa.executed) {
    violations.push("success_failure_exceeds_executed");
  }
  if (pa.blockedByGate > 0 && pa.executed > 0) {
    violations.push("executed_after_gate_deny");
  }
  if (pa.blockedByBudget > 0 && pa.executed > 0) {
    violations.push("executed_after_budget_block");
  }

  return {
    valid: violations.length === 0,
    violations,
    attempted: pa.attempted,
    executed: pa.executed,
    deduplicated: pa.deduplicated,
    servedFromCache: pa.servedFromCache,
    blockedByGate: pa.blockedByGate,
    blockedByBudget: pa.blockedByBudget,
  };
}

export function authorizeProviderExecution({
  providerId = "",
  intentAuthority = null,
  commercialEntryGate = null,
  routingDecision = null,
  providerAccounting = null,
} = {}) {
  const permission = intentAuthority?.commercialPermission;
  const gateAllowed = commercialEntryGate?.commercialEntryAllowed !== false;
  const routingAllows =
    routingDecision?.allowNewSearch !== false ||
    routingDecision?.allowRerank === true ||
    routingDecision?.mode === "commercial_search";

  if (permission === COMMERCIAL_PERMISSION.DENY || !gateAllowed) {
    if (providerAccounting) {
      providerAccounting.blockedByGate += 1;
    }
    return {
      allowed: false,
      blockedReason: permission === COMMERCIAL_PERMISSION.DENY ? "intent_authority_deny" : "commercial_gate_deny",
    };
  }

  if (routingDecision && routingDecision.allowNewSearch === false && routingDecision.allowRerank !== true) {
    return { allowed: false, blockedReason: "routing_denied" };
  }

  if (providerAccounting) {
    providerAccounting.attempted += 1;
  }

  return {
    allowed: true,
    blockedReason: null,
    providerId,
    routingAllows,
  };
}

export function recordProviderExecution(providerAccounting, {
  providerId = "",
  executed = false,
  blockedReason = null,
  cacheHit = false,
  deduplicated = false,
  success = false,
  failed = false,
  resultCount = 0,
  retryCount = 0,
  costGuardApplied = false,
  costGuardAllowed = null,
  costGuardReason = null,
  providerExecutionAvoided = false,
} = {}) {
  if (!providerAccounting) return;

  if (blockedReason === "intent_authority_deny" || blockedReason === "commercial_gate_deny") {
    providerAccounting.blockedByGate += 1;
  } else if (blockedReason === PROVIDER_COST_GUARD_REASON_CODES.PROVIDER_DISABLED) {
    providerAccounting.blockedByProviderDisabled += 1;
  } else if (blockedReason === PROVIDER_COST_GUARD_REASON_CODES.BLOCKED_BY_MISSING_CREDENTIALS) {
    providerAccounting.blockedByCredentials += 1;
  } else if (blockedReason === PROVIDER_COST_GUARD_REASON_CODES.BLOCKED_BY_TEST_POLICY) {
    providerAccounting.blockedByTestPolicy += 1;
  } else if (blockedReason === "budget_blocked" || blockedReason === "budget_exhausted") {
    providerAccounting.blockedByBudget += 1;
  } else if (blockedReason === "circuit_breaker_open" || blockedReason === "circuit_open") {
    providerAccounting.blockedByCircuit += 1;
  } else if (
    blockedReason === PROVIDER_COST_GUARD_REASON_CODES.UNKNOWN_EXTERNAL_BLOCKED ||
    blockedReason === PROVIDER_COST_GUARD_REASON_CODES.PAID_OBSERVABILITY_BLOCKED
  ) {
    providerAccounting.blockedByBudget += 1;
  } else if (blockedReason === PROVIDER_COST_GUARD_REASON_CODES.DEV_PAID_DRY_RUN) {
    providerAccounting.blockedByEnvironment += 1;
  } else if (blockedReason) {
    providerAccounting.blockedByPolicy += 1;
  }

  if (cacheHit) providerAccounting.servedFromCache += 1;
  if (retryCount > 0) providerAccounting.retries += retryCount;

  if (executed) {
    providerAccounting.executed += 1;
    if (success) providerAccounting.succeeded += 1;
    if (failed) providerAccounting.failed += 1;
  }

  providerAccounting.providers.push({
    providerId,
    attempted: true,
    executed,
    blockedReason,
    cacheHit,
    deduplicated,
    success,
    resultCount,
    retryCount,
    costGuardApplied,
    costGuardAllowed,
    costGuardReason,
    providerExecutionAvoided,
  });
}

export function assertGateDenyProviderFree({
  intentAuthority = null,
  commercialEntryGate = null,
  providerAccounting = null,
  enforcementCtx = null,
} = {}) {
  const deny =
    intentAuthority?.commercialPermission === COMMERCIAL_PERMISSION.DENY ||
    commercialEntryGate?.commercialEntryAllowed === false;

  if (!deny || !providerAccounting) {
    return { valid: true, violation: null };
  }

  if (
    providerAccounting.executed > 0 ||
    providerAccounting.retries > 0 ||
    (providerAccounting.attempted > 0 && providerAccounting.blockedByGate === 0)
  ) {
    if (enforcementCtx) {
      appendRepairLedgerEntry(enforcementCtx, {
        invariant: "providerAfterGateDeny",
        severity: INVARIANT_SEVERITY.FATAL,
        originalValuePresent: true,
        action: "provider_execution_after_gate_deny",
      });
    }
    if (isStrictRuntimeMode()) {
      throw new Error("runtime_provider_after_gate_deny");
    }
    return { valid: false, violation: "providerAfterGateDeny" };
  }

  return { valid: true, violation: null };
}

export function validateResponseExecutionConsistency({
  responsePath = "",
  body = {},
  providerAccounting = null,
  degradation = {},
} = {}) {
  const registry = resolveResponsePathRegistry(responsePath);
  const prices = Array.isArray(body?.prices) ? body.prices : [];
  const violations = [];

  if (registry.pricesAllowed === false && prices.length > 0) {
    violations.push("invalidPricesOnNoResultPath");
  }

  if (registry.winnerAllowed === false && body?.winner != null) {
    violations.push("invalidWinnerOnDegradedPath");
  }

  if (registry.providersAllowed === false && providerAccounting?.executed > 0) {
    violations.push("providerFreePathCalledProvider");
  }

  if (
    degradation?.reasonCode === "no_result" &&
    (prices.length > 0 || body?.winner != null)
  ) {
    violations.push("invalidPricesOnNoResultPath");
  }

  if (
    providerAccounting?.servedFromCache > 0 &&
    providerAccounting?.executed > 0 &&
    String(responsePath).includes("cache")
  ) {
    // cache success should not also count as fresh execution without trace distinction
  }

  return { valid: violations.length === 0, violations };
}

export function prepareSemanticTransition(enforcementCtx, sessionSnapshot = null) {
  if (!enforcementCtx) return;
  enforcementCtx.transitionPrepared = sessionSnapshot
    ? JSON.parse(JSON.stringify(sessionSnapshot))
    : null;
}

export function commitSemanticTransition(enforcementCtx) {
  if (!enforcementCtx) return;
  enforcementCtx.transitionCommitted = true;
  advanceRuntimeLifecycle(enforcementCtx, LIFECYCLE_STATES.TRANSITIONED);
}

export function rollbackSemanticTransition(enforcementCtx, body = {}) {
  if (!enforcementCtx?.transitionPrepared || !body?.session_context) {
    return body;
  }
  enforcementCtx.stateRollbackApplied = true;
  return {
    ...body,
    session_context: JSON.parse(JSON.stringify(enforcementCtx.transitionPrepared)),
  };
}

export function preventDoubleHttpResponse(enforcementCtx, res) {
  if (!enforcementCtx) return { blocked: false };

  if (enforcementCtx.responseSent || res?.headersSent) {
    enforcementCtx.doubleResponsePrevented = true;
    appendRepairLedgerEntry(enforcementCtx, {
      invariant: "doubleHttpResponse",
      severity: INVARIANT_SEVERITY.FATAL,
      originalValuePresent: true,
      action: "second_http_send_blocked",
    });
    if (isStrictRuntimeMode()) {
      throw new Error("runtime_double_http_response");
    }
    return { blocked: true };
  }

  return { blocked: false };
}

export function markHttpResponseSent(enforcementCtx) {
  if (!enforcementCtx) return;
  enforcementCtx.httpSendCount += 1;
  enforcementCtx.responseSent = true;
  advanceRuntimeLifecycle(enforcementCtx, LIFECYCLE_STATES.SENT);
}

export function runtimeEnforcementToTrace(enforcementCtx = {}) {
  const pa = enforcementCtx.providerAccounting || createProviderAccounting();
  const accountingConsistency = validateProviderAccountingConsistency(pa);
  return {
    version: RUNTIME_ENFORCEMENT_VERSION,
    responseLifecycleState: enforcementCtx.lifecycle?.state || null,
    responseLifecycleHistory: enforcementCtx.lifecycle?.history || [],
    responseSealed: enforcementCtx.lifecycle?.history?.includes(LIFECYCLE_STATES.SEALED) || false,
    payloadFingerprintBeforeSeal: enforcementCtx.payloadFingerprintBeforeSeal || null,
    payloadFingerprintAtSend: enforcementCtx.payloadFingerprintAtSend || null,
    payloadFingerprintAtSeal: enforcementCtx.sealedFingerprint || null,
    postSealMutationDetected: !!enforcementCtx.postSealMutationDetected,
    postSealMutationAuditComplete: enforcementCtx.postSealMutationAuditComplete !== false,
    invariantFatalCount: enforcementCtx.invariantFatalCount || 0,
    invariantRecoverableCount: enforcementCtx.invariantRecoverableCount || 0,
    repairLedgerCount: enforcementCtx.repairLedger?.length || 0,
    repairLedger: enforcementCtx.repairLedger || [],
    unknownPathFailClosed: !!enforcementCtx.unknownPathFailClosed,
    normalizedResponsePath: enforcementCtx.normalizedResponsePath || null,
    stateTransitionPrepared: enforcementCtx.transitionPrepared != null,
    stateTransitionCommitted: !!enforcementCtx.transitionCommitted,
    stateCommittedBeforeSend:
      !!enforcementCtx.transitionCommitted &&
      enforcementCtx.lifecycle?.history?.includes(LIFECYCLE_STATES.SEALED),
    stateRollbackApplied: !!enforcementCtx.stateRollbackApplied,
    httpSendCount: enforcementCtx.httpSendCount || 0,
    doubleResponsePrevented: !!enforcementCtx.doubleResponsePrevented,
    providerAttemptedCount: pa.attempted || 0,
    providerExecutedCount: pa.executed || 0,
    providerBlockedByGateCount: pa.blockedByGate || 0,
    providerBlockedByBudgetCount: pa.blockedByBudget || 0,
    providerBlockedByCircuitCount: pa.blockedByCircuit || 0,
    providerBlockedByEnvironmentCount: pa.blockedByEnvironment || 0,
    providerBlockedByProviderDisabledCount: pa.blockedByProviderDisabled || 0,
    providerBlockedByCredentialsCount: pa.blockedByCredentials || 0,
    providerBlockedByPolicyCount: pa.blockedByPolicy || 0,
    providerCacheHitCount: pa.servedFromCache || 0,
    providerDeduplicatedCount: pa.deduplicated || 0,
    inFlightPromiseReuseCount: pa.inFlightPromiseReuse || 0,
    providerRetryCount: pa.retries || 0,
    providerSucceededCount: pa.succeeded || 0,
    providerFailedCount: pa.failed || 0,
    dedupAccountingUniform: pa.dedupEventsApplied > 0 || pa.deduplicated === 0,
    providerAccountingConsistency: accountingConsistency,
    costGuardDecisions: pa.costGuardDecisions || [],
    externalCallAccounting: externalCallAccountingToTrace(
      enforcementCtx.externalCallAccounting || pa.externalCallAccounting
    ),
    providerAfterSealCount: enforcementCtx.providerAfterSealCount || 0,
    providerAfterHttpSendCount: enforcementCtx.providerAfterHttpSendCount || 0,
    sessionMutationAfterHttpSendCount: enforcementCtx.sessionMutationAfterHttpSendCount || 0,
    postSealPayloadMutationCount: enforcementCtx.postSealPayloadMutationCount || 0,
    legacyAuthorityViolation: !!enforcementCtx.legacyAuthorityViolation,
    csoAuthorityViolation: !!enforcementCtx.csoAuthorityViolation,
    shadowAuthorityViolation: !!enforcementCtx.shadowAuthorityViolation,
    cognitiveRouterShadowOnly: true,
    finalRoutingDecisionSource: "authoritative",
  };
}

export function resolveRuntimeDispatchMode(responsePath = "") {
  const registry = resolveResponsePathRegistry(responsePath);
  if (registry.failClosed) return "unknown_fail_closed";
  if (registry.runtimeClass === RUNTIME_CLASSES.TRANSPORT) return "technical";
  if (registry.preCognitive) {
    return registry.degradationRequired ? "pre_cognitive_degraded" : "pre_cognitive";
  }
  if (registry.category === "commercial_degraded" || registry.degradationRequired) {
    return "commercial_degraded";
  }
  return "governed";
}
