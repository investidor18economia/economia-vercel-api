/**
 * PATCH Comercial 05J — Commercial Coverage Validation
 *
 * Instrumento de medição de cobertura comercial.
 * Não altera runtime, prioridade, Decision Engine, winner ou reasoning.
 */

import {
  COMMERCIAL_COVERAGE_AUDIT_DATASET,
  COMMERCIAL_COVERAGE_REAL_INITIAL_DATASET,
  COMMERCIAL_COVERAGE_SYNTHETIC_SCENARIOS,
  listCommercialCoverageSyntheticScenarioIds,
} from "./commercialCoverageValidationFixtures.js";
import {
  CONDITIONAL_PROVIDER_FETCH_DECISION,
  CONDITIONAL_PROVIDER_FETCH_REASON_CODES,
  evaluateCommercialResultSufficiency,
} from "./conditionalProviderFetch.js";
import { buildMultiProviderPriorityPlan } from "./multiProviderPriorityEngine.js";
import {
  evaluateDevCommercialExecutionPermission,
  isCommercialDevRealExternalCallsEnabled,
} from "./devCommercialCostGuard.js";
import { evaluateProviderBudgetPermission } from "./providerBudgetCircuitBreaker.js";
import {
  COMMERCIAL_PROVIDER_IDS,
  listCommercialProviderOperationalMetadata,
} from "../productSourceAdapter/commercialProviderRegistry.js";
import {
  COMMERCIAL_ALIGNMENT_THRESHOLD,
  calculateCommercialAlignment,
} from "../productSourceAdapter/commercialQueryProductAlignmentLayer.js";
import {
  isBrokenCommercialOffer,
  isValidCommercialOfferUrl,
  selectCommercialOffers,
} from "../productSourceAdapter/commercialSelectionEngine.js";
import {
  mergeCommercialOfferBundle,
} from "../productSourceAdapter/commercialOfferMergeLayer.js";
import {
  deduplicateCommercialOfferBundle,
} from "../productSourceAdapter/commercialDeduplicationLayer.js";
import { parseNumericPrice } from "../productSourceAdapter/normalizeProduct.js";
import {
  isNormalizedProductShape,
  isNormalizedProductUsable,
} from "../productSourceAdapter/normalizedProduct.js";
import { COMMERCIAL_RUNTIME_MODES } from "../productSourceAdapter/commercialRuntimeMode.js";
import { resolveOfficialCommercialOffer } from "../productSourceAdapter/commercialRuntimeActivation.js";
import { buildFunctionalProviderCostGuardContext } from "./providerCostGuard.js";
import {
  buildCommercialCoverageExecutionTelemetry,
  classifyCommercialCoverageEmptyReason,
  deriveProviderExecutionTelemetry,
  isDefaultShadowProviderStub,
} from "./mercadolivreControlledFetchPathAudit.js";

export const COMMERCIAL_COVERAGE_VALIDATION_VERSION = "05J";

export const COMMERCIAL_COVERAGE_REAL_VALIDATION_ENABLED_ENV =
  "COMMERCIAL_COVERAGE_REAL_VALIDATION_ENABLED";
export const COMMERCIAL_COVERAGE_MAX_PRODUCTS_ENV = "COMMERCIAL_COVERAGE_MAX_PRODUCTS";
export const COMMERCIAL_COVERAGE_DELAY_MS_ENV = "COMMERCIAL_COVERAGE_DELAY_MS";

export const COMMERCIAL_COVERAGE_DEFAULT_MAX_PRODUCTS = 5;
export const COMMERCIAL_COVERAGE_ABSOLUTE_MAX_PRODUCTS = 15;

export const COMMERCIAL_COVERAGE_MODES = Object.freeze({
  SYNTHETIC: "synthetic",
  REAL: "real",
});

export const COMMERCIAL_COVERAGE_STATUS = Object.freeze({
  SUCCESS: "commercial_success",
  FAILURE: "commercial_failure",
  BLOCKED: "provider_not_executed_protection",
  DISABLED: "provider_disabled",
});

export const COMMERCIAL_COVERAGE_FAILURE_CLASSES = Object.freeze({
  COMMERCIAL_SUCCESS: "commercial_success",
  COMMERCIAL_FAILURE: "commercial_failure",
  PROVIDER_NOT_EXECUTED_PROTECTION: "provider_not_executed_protection",
  PROVIDER_DISABLED: "provider_disabled",
  AUTH_FAILURE: "auth_failure",
  RATE_LIMIT: "rate_limit",
  TIMEOUT: "timeout",
  PROVIDER_ERROR: "provider_error",
  EMPTY_RESULT: "empty_result",
  MISALIGNED_ONLY: "misaligned_only",
  BUDGET_BLOCKED: "budget_blocked",
  CIRCUIT_BLOCKED: "circuit_blocked",
  COST_GUARD_BLOCKED: "cost_guard_blocked",
  CACHE_HIT: "cache_hit",
});

const SECRET_PATTERN = /(api[_-]?key|token|secret|password|authorization|bearer)/i;

function cleanText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseBooleanEnv(value, defaultValue = false) {
  if (value == null || value === "") return defaultValue;
  const raw = String(value).trim().toLowerCase();
  if (raw === "false" || raw === "0" || raw === "no") return false;
  if (raw === "true" || raw === "1" || raw === "yes") return true;
  return defaultValue;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function clampMaxProducts(value, fallback = COMMERCIAL_COVERAGE_DEFAULT_MAX_PRODUCTS) {
  const parsed = parsePositiveInt(value, fallback);
  return Math.min(parsed, COMMERCIAL_COVERAGE_ABSOLUTE_MAX_PRODUCTS);
}

function sleep(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeRate(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }
  return Number((numerator / denominator).toFixed(4));
}

function mapProductToOffer(product = {}) {
  return {
    title: cleanText(product.product_name || product.title || product.normalizedName || ""),
    price: product.price ?? product.numericPrice ?? null,
    url: cleanText(product.link || product.url || ""),
    image: product.thumbnail || product.image || null,
    source: product.source || product.provider || "",
    provider: product.provider || null,
  };
}

function sanitizeForReport(value) {
  if (value == null) return value;
  if (typeof value === "string") {
    if (SECRET_PATTERN.test(value) && value.length > 12) return "[redacted]";
    return value;
  }
  if (Array.isArray(value)) return value.map((entry) => sanitizeForReport(entry));
  if (typeof value === "object") {
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      if (SECRET_PATTERN.test(key)) {
        out[key] = "[redacted]";
      } else {
        out[key] = sanitizeForReport(entry);
      }
    }
    return out;
  }
  return value;
}

function resolveProviderBuckets(providerResults = {}) {
  return {
    googleShoppingOffers: providerResults[COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING]?.products || [],
    mercadolivrePublicOffers: providerResults[COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC]?.products || [],
    apifyMercadoLivreOffers: providerResults[COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE]?.products || [],
  };
}

/**
 * @param {Record<string, string|undefined>} [env]
 * @param {string[]} [argv]
 */
export function readCommercialCoverageValidationConfig(env = process.env, argv = []) {
  const wantsReal =
    argv.includes("--real") ||
    argv.includes("--live") ||
    argv.includes("--http");
  const maxProductsArg = argv.find((entry) => entry.startsWith("--max-products="));
  const maxProductsFromArg = maxProductsArg ? maxProductsArg.split("=")[1] : null;

  return {
    mode: wantsReal ? COMMERCIAL_COVERAGE_MODES.REAL : COMMERCIAL_COVERAGE_MODES.SYNTHETIC,
    realValidationEnabled: parseBooleanEnv(
      env?.[COMMERCIAL_COVERAGE_REAL_VALIDATION_ENABLED_ENV],
      false
    ),
    allowExternalFlag: argv.includes("--allow-external"),
    allowPaidExternalFlag: argv.includes("--allow-paid-external"),
    maxProducts: clampMaxProducts(
      maxProductsFromArg ?? env?.[COMMERCIAL_COVERAGE_MAX_PRODUCTS_ENV],
      COMMERCIAL_COVERAGE_DEFAULT_MAX_PRODUCTS
    ),
    delayMs: parsePositiveInt(env?.[COMMERCIAL_COVERAGE_DELAY_MS_ENV], 1000),
    outputJson: argv.includes("--json"),
    outputPath: cleanText(
      argv.find((entry) => entry.startsWith("--output="))?.split("=")[1] || ""
    ),
  };
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function buildCommercialCoverageValidationPlan(input = {}) {
  const config = input.config || readCommercialCoverageValidationConfig(input.env, input.argv);
  const dataset =
    input.dataset ||
    (config.mode === COMMERCIAL_COVERAGE_MODES.REAL
      ? COMMERCIAL_COVERAGE_REAL_INITIAL_DATASET
      : COMMERCIAL_COVERAGE_AUDIT_DATASET);

  const products = dataset.slice(0, config.maxProducts);
  const priorityPlan = buildMultiProviderPriorityPlan({
    runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
    invocationSource: "commercial_coverage_validation",
    env: input.env,
  });

  return {
    version: COMMERCIAL_COVERAGE_VALIDATION_VERSION,
    validationMode: config.mode,
    productsPlanned: products.length,
    maxProducts: config.maxProducts,
    products,
    priorityPlan,
    orderedProviders: priorityPlan.orderedProviders?.map((entry) => entry.providerId) || [],
    skippedProviders: priorityPlan.skippedProviders || [],
    syntheticScenarioIds:
      config.mode === COMMERCIAL_COVERAGE_MODES.SYNTHETIC
        ? listCommercialCoverageSyntheticScenarioIds()
        : [],
  };
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function evaluateCommercialOfferCoverage(input = {}) {
  const query = cleanText(input.query || "");
  const product = input.product || {};
  const offer = input.offer || mapProductToOffer(product);
  const minAlignmentScore =
    input.minAlignmentScore ?? COMMERCIAL_ALIGNMENT_THRESHOLD;

  const title = cleanText(offer.title || product.product_name || "");
  const numericPrice = parseNumericPrice(offer.price ?? product.numericPrice ?? product.price);
  const url = cleanText(offer.url || product.link || "");
  const image = offer.image ?? product.thumbnail ?? null;

  const hasValidTitle = title.length >= 3;
  const hasValidPrice = numericPrice != null && numericPrice > 0;
  const hasValidUrl = isValidCommercialOfferUrl(url);
  const hasValidImage = !!cleanText(image);
  const normalizedContractValid =
    isNormalizedProductShape(product) || (hasValidTitle && hasValidPrice && hasValidUrl);
  const normalizedUsable = isNormalizedProductUsable(product);

  const alignment = calculateCommercialAlignment({
    query,
    offer: { title },
  });
  const alignmentScore = alignment?.alignmentScore ?? 0;
  const alignmentPass = alignment?.isAligned === true && alignmentScore >= minAlignmentScore;
  const broken = isBrokenCommercialOffer(offer);
  const isUsable =
    hasValidTitle &&
    hasValidPrice &&
    hasValidUrl &&
    alignmentPass &&
    !broken &&
    (normalizedContractValid || normalizedUsable);

  return {
    title,
    hasValidTitle,
    hasValidPrice,
    hasValidUrl,
    hasValidImage,
    alignmentScore,
    alignmentPass,
    alignmentReason: alignment?.alignmentReason || null,
    normalizedContractValid,
    isUsable,
    broken,
  };
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function classifyCommercialCoverageFailure(input = {}) {
  const providerResult = input.providerResult || {};
  const error = cleanText(providerResult.error || providerResult.reasonCode || "").toLowerCase();
  const productResult = input.productResult || {};

  if (productResult.finalCommercialStatus === COMMERCIAL_COVERAGE_STATUS.SUCCESS) {
    return COMMERCIAL_COVERAGE_FAILURE_CLASSES.COMMERCIAL_SUCCESS;
  }
  if (error === "provider_disabled") {
    return COMMERCIAL_COVERAGE_FAILURE_CLASSES.PROVIDER_DISABLED;
  }
  if (error === "auth_failed" || error === "missing_token") {
    return COMMERCIAL_COVERAGE_FAILURE_CLASSES.AUTH_FAILURE;
  }
  if (error === "rate_limited") {
    return COMMERCIAL_COVERAGE_FAILURE_CLASSES.RATE_LIMIT;
  }
  if (error === "timeout") {
    return COMMERCIAL_COVERAGE_FAILURE_CLASSES.TIMEOUT;
  }
  if (error === "cost_guard_blocked" || providerResult.costGuardDecision?.shouldCallProvider === false) {
    return COMMERCIAL_COVERAGE_FAILURE_CLASSES.COST_GUARD_BLOCKED;
  }
  if (
    error === "budget_blocked" ||
    providerResult.budgetCircuitDecision?.decision === "block_budget_exhausted"
  ) {
    return COMMERCIAL_COVERAGE_FAILURE_CLASSES.BUDGET_BLOCKED;
  }
  if (
    error === "circuit_breaker_open" ||
    providerResult.budgetCircuitDecision?.decision === "block_circuit_open"
  ) {
    return COMMERCIAL_COVERAGE_FAILURE_CLASSES.CIRCUIT_BLOCKED;
  }
  if (providerResult.universalCommercialCacheHit === true) {
    return COMMERCIAL_COVERAGE_FAILURE_CLASSES.CACHE_HIT;
  }
  if (error === "provider_error" || error === "http_error") {
    return COMMERCIAL_COVERAGE_FAILURE_CLASSES.PROVIDER_ERROR;
  }
  if (
    productResult.usableOfferCount === 0 &&
    productResult.rawResultCount > 0 &&
    productResult.alignmentPassRate === 0
  ) {
    return COMMERCIAL_COVERAGE_FAILURE_CLASSES.MISALIGNED_ONLY;
  }
  if (productResult.rawResultCount === 0) {
    return COMMERCIAL_COVERAGE_FAILURE_CLASSES.EMPTY_RESULT;
  }
  return COMMERCIAL_COVERAGE_FAILURE_CLASSES.COMMERCIAL_FAILURE;
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function buildCommercialProductCoverageResult(input = {}) {
  const product = input.product || {};
  const queryUsed = cleanText(input.queryUsed || product.queryUsed || product.productName || "");
  const providerResults = input.providerResults || {};
  const priorityPlan = input.priorityPlan || null;
  const startedAt = Number.isFinite(input.startedAt) ? input.startedAt : Date.now();
  const latencyMs = Number.isFinite(input.latencyMs)
    ? input.latencyMs
    : Math.max(0, Date.now() - startedAt);

  const providerIds = Object.keys(providerResults);
  const providerAttempts = [];
  let externalCallsExecuted = 0;
  let externalCallsPrevented = 0;
  let cacheHits = 0;
  let dedupHits = 0;
  let rawResultCount = 0;
  const offerEvaluations = [];

  const executionTelemetry = buildCommercialCoverageExecutionTelemetry({
    priorityPlan,
    providerResults,
    conditionalExecution: input.conditionalExecution,
  });

  for (const providerId of providerIds) {
    const result = providerResults[providerId] || {};
    if (isDefaultShadowProviderStub(result)) continue;

    const providerTelemetry = deriveProviderExecutionTelemetry(result);
    const sufficiency = evaluateCommercialResultSufficiency({
      query: queryUsed,
      result,
      env: input.env,
    });
    const attempted =
      executionTelemetry.providersAttempted.includes(providerId) ||
      (result?.skipped !== true && !isDefaultShadowProviderStub(result));

    if (providerTelemetry.httpRequestStarted) {
      externalCallsExecuted += 1;
    } else if (
      attempted &&
      (providerTelemetry.blockedBeforeFetch ||
        result?.costGuardDecision?.decision === "dry_run" ||
        result?.universalCommercialCacheHit === true ||
        result?.requestDeduplicated === true ||
        result?.error === "provider_disabled")
    ) {
      externalCallsPrevented += 1;
    }

    if (result?.universalCommercialCacheHit === true) cacheHits += 1;
    if (result?.requestDeduplicated === true) dedupHits += 1;

    rawResultCount += Array.isArray(result.products) ? result.products.length : 0;
    providerAttempts.push({
      providerId,
      attempted,
      skipped: result?.skipped === true,
      adapterInvoked: providerTelemetry.adapterInvoked,
      clientInvoked: providerTelemetry.clientInvoked,
      httpRequestStarted: providerTelemetry.httpRequestStarted,
      httpRequestCompleted: providerTelemetry.httpRequestCompleted,
      blockedBeforeFetch: providerTelemetry.blockedBeforeFetch,
      sufficiencyDecision: sufficiency.decision,
      sufficiencyReasonCode: sufficiency.reasonCode,
      usableOfferCount: sufficiency.usableOfferCount,
      failureClass: classifyCommercialCoverageFailure({ providerResult: result }),
      cacheStatus: result?.universalCommercialCacheHit ? "hit" : attempted ? "miss" : "skipped",
      requestDedupStatus: result?.requestDeduplicated ? "reused" : attempted ? "executed" : "skipped",
      interruptionCode: classifyCommercialCoverageEmptyReason({
        providerResult: result,
        rawResultCount: Array.isArray(result.products) ? result.products.length : 0,
        normalizedResultCount: Array.isArray(result.products) ? result.products.length : 0,
        usableOfferCount: sufficiency.usableOfferCount,
      }),
    });
  }

  const merged = mergeCommercialOfferBundle(resolveProviderBuckets(providerResults));
  const deduped = deduplicateCommercialOfferBundle(merged.offers);
  const normalizedResultCount = deduped.offers.length;

  for (const offer of deduped.offers) {
    offerEvaluations.push(
      evaluateCommercialOfferCoverage({
        query: queryUsed,
        offer,
      })
    );
  }

  const usableOffers = offerEvaluations.filter((entry) => entry.isUsable === true);
  const selection = selectCommercialOffers({ query: queryUsed, offers: deduped.offers });
  const selectedOfferEvaluation = selection.selectedOffer
    ? evaluateCommercialOfferCoverage({ query: queryUsed, offer: selection.selectedOffer })
    : null;

  const finalCommercialStatus =
    usableOffers.length > 0
      ? COMMERCIAL_COVERAGE_STATUS.SUCCESS
      : providerAttempts.some((entry) =>
          [
            COMMERCIAL_COVERAGE_FAILURE_CLASSES.COST_GUARD_BLOCKED,
            COMMERCIAL_COVERAGE_FAILURE_CLASSES.BUDGET_BLOCKED,
            COMMERCIAL_COVERAGE_FAILURE_CLASSES.CIRCUIT_BLOCKED,
          ].includes(entry.failureClass)
        )
        ? COMMERCIAL_COVERAGE_STATUS.BLOCKED
        : COMMERCIAL_COVERAGE_STATUS.FAILURE;

  const reasonCode =
    finalCommercialStatus === COMMERCIAL_COVERAGE_STATUS.SUCCESS
      ? CONDITIONAL_PROVIDER_FETCH_REASON_CODES.USABLE_OFFERS
      : classifyCommercialCoverageEmptyReason({
          providerResult: providerResults[providerIds.find((id) => providerResults[id])],
          rawResultCount,
          normalizedResultCount,
          usableOfferCount: usableOffers.length,
          selectionEmpty: !selection.selectedOffer && deduped.offers.length > 0,
        }) ||
        providerAttempts.find((entry) => entry.sufficiencyReasonCode)?.sufficiencyReasonCode ||
        CONDITIONAL_PROVIDER_FETCH_REASON_CODES.NO_USABLE_OFFERS;

  return sanitizeForReport({
    version: COMMERCIAL_COVERAGE_VALIDATION_VERSION,
    synthetic: input.synthetic === true,
    productName: product.productName || product.product_name || queryUsed,
    queryUsed,
    aliasesTested: input.aliasesTested || [],
    providerPlan: executionTelemetry.providerPlan,
    providersEligible: executionTelemetry.providersEligible,
    providersAttempted: executionTelemetry.providersAttempted,
    adaptersInvoked: executionTelemetry.adaptersInvoked,
    clientsInvoked: executionTelemetry.clientsInvoked,
    externalCallsStarted: executionTelemetry.externalCallsStarted,
    externalCallsCompleted: executionTelemetry.externalCallsCompleted,
    providersBlockedBeforeFetch: executionTelemetry.providersBlockedBeforeFetch,
    neutralResults: executionTelemetry.neutralResults,
    providersSkipped: providerAttempts.filter((entry) => entry.skipped).map((entry) => entry.providerId),
    providerUsed: selection.selectedOffer?.provider || selection.selectedOffer?.source || null,
    cacheStatus: cacheHits > 0 ? "hit" : providerAttempts.some((entry) => entry.cacheStatus === "miss") ? "miss" : "none",
    requestDedupStatus: dedupHits > 0 ? "reused" : "executed",
    externalCallsExecuted,
    externalCallsPrevented,
    rawResultCount,
    normalizedResultCount,
    usableOfferCount: usableOffers.length,
    hasValidPrice: usableOffers.some((entry) => entry.hasValidPrice),
    hasValidImage: usableOffers.some((entry) => entry.hasValidImage),
    hasValidUrl: usableOffers.some((entry) => entry.hasValidUrl),
    alignmentScore: selectedOfferEvaluation?.alignmentScore ?? usableOffers[0]?.alignmentScore ?? null,
    alignmentPassRate: safeRate(
      usableOffers.filter((entry) => entry.alignmentPass).length,
      offerEvaluations.length
    ),
    misalignedResultCount: offerEvaluations.filter((entry) => !entry.alignmentPass).length,
    selectionStatus: selection.selectedOffer ? "selected" : selection.diagnostics?.reason || "none",
    finalCommercialStatus,
    reasonCode,
    latencyMs,
    providerAttempts,
    diagnostics: {
      mergeCount: merged.offers.length,
      dedupedCount: deduped.offers.length,
      selectionDiagnostics: selection.diagnostics || null,
      failureClass: classifyCommercialCoverageFailure({
        productResult: {
          finalCommercialStatus,
          usableOfferCount: usableOffers.length,
          rawResultCount,
          alignmentPassRate: safeRate(
            usableOffers.filter((entry) => entry.alignmentPass).length,
            offerEvaluations.length
          ),
        },
        providerResult: providerResults[providerIds[0]],
      }),
    },
  });
}

/**
 * @param {Array<Record<string, unknown>>} productResults
 */
export function aggregateCommercialProviderCoverage(productResults = []) {
  const byProvider = new Map();

  for (const productResult of productResults) {
    for (const attempt of productResult.providerAttempts || []) {
      const providerId = attempt.providerId;
      if (!byProvider.has(providerId)) {
        byProvider.set(providerId, {
          providerId,
          queriesPlanned: 0,
          queriesAttempted: 0,
          externalCallsExecuted: 0,
          externalCallsPrevented: 0,
          adaptersInvoked: 0,
          clientsInvoked: 0,
          cacheHits: 0,
          dedupHits: 0,
          successfulQueries: 0,
          emptyQueries: 0,
          failedQueries: 0,
          usableOfferTotal: 0,
          validPriceTotal: 0,
          validImageTotal: 0,
          validUrlTotal: 0,
          alignmentScoreTotal: 0,
          alignmentScoreCount: 0,
          latencyTotalMs: 0,
          budgetBlocks: 0,
          circuitBlocks: 0,
          costGuardBlocks: 0,
          authFailures: 0,
          rateLimits: 0,
          timeouts: 0,
          providerErrors: 0,
        });
      }

      const bucket = byProvider.get(providerId);
      bucket.queriesPlanned += 1;
      if (attempt.attempted) bucket.queriesAttempted += 1;
      if (attempt.httpRequestStarted) bucket.externalCallsExecuted += 1;
      if (attempt.blockedBeforeFetch && !attempt.httpRequestStarted) {
        bucket.externalCallsPrevented = (bucket.externalCallsPrevented || 0) + 1;
      }
      if (attempt.adapterInvoked) bucket.adaptersInvoked = (bucket.adaptersInvoked || 0) + 1;
      if (attempt.clientInvoked) bucket.clientsInvoked = (bucket.clientsInvoked || 0) + 1;
      if (attempt.cacheStatus === "hit") bucket.cacheHits += 1;
      if (attempt.requestDedupStatus === "reused") bucket.dedupHits += 1;
      if (attempt.usableOfferCount > 0) bucket.successfulQueries += 1;
      if (attempt.failureClass === COMMERCIAL_COVERAGE_FAILURE_CLASSES.EMPTY_RESULT) bucket.emptyQueries += 1;
      if (
        attempt.failureClass &&
        attempt.failureClass !== COMMERCIAL_COVERAGE_FAILURE_CLASSES.COMMERCIAL_SUCCESS &&
        attempt.failureClass !== COMMERCIAL_COVERAGE_FAILURE_CLASSES.CACHE_HIT
      ) {
        bucket.failedQueries += 1;
      }
      bucket.usableOfferTotal += attempt.usableOfferCount || 0;
      if (attempt.failureClass === COMMERCIAL_COVERAGE_FAILURE_CLASSES.BUDGET_BLOCKED) bucket.budgetBlocks += 1;
      if (attempt.failureClass === COMMERCIAL_COVERAGE_FAILURE_CLASSES.CIRCUIT_BLOCKED) bucket.circuitBlocks += 1;
      if (attempt.failureClass === COMMERCIAL_COVERAGE_FAILURE_CLASSES.COST_GUARD_BLOCKED) bucket.costGuardBlocks += 1;
      if (attempt.failureClass === COMMERCIAL_COVERAGE_FAILURE_CLASSES.AUTH_FAILURE) bucket.authFailures += 1;
      if (attempt.failureClass === COMMERCIAL_COVERAGE_FAILURE_CLASSES.RATE_LIMIT) bucket.rateLimits += 1;
      if (attempt.failureClass === COMMERCIAL_COVERAGE_FAILURE_CLASSES.TIMEOUT) bucket.timeouts += 1;
      if (attempt.failureClass === COMMERCIAL_COVERAGE_FAILURE_CLASSES.PROVIDER_ERROR) bucket.providerErrors += 1;
    }
  }

  for (const productResult of productResults) {
    if (productResult.hasValidPrice && productResult.providerUsed) {
      const bucket = byProvider.get(productResult.providerUsed);
      if (bucket) bucket.validPriceTotal += 1;
    }
    if (productResult.hasValidImage && productResult.providerUsed) {
      const bucket = byProvider.get(productResult.providerUsed);
      if (bucket) bucket.validImageTotal += 1;
    }
    if (productResult.hasValidUrl && productResult.providerUsed) {
      const bucket = byProvider.get(productResult.providerUsed);
      if (bucket) bucket.validUrlTotal += 1;
    }
    if (Number.isFinite(productResult.alignmentScore) && productResult.providerUsed) {
      const bucket = byProvider.get(productResult.providerUsed);
      if (bucket) {
        bucket.alignmentScoreTotal += productResult.alignmentScore;
        bucket.alignmentScoreCount += 1;
      }
    }
    if (Number.isFinite(productResult.latencyMs)) {
      for (const attempt of productResult.providerAttempts || []) {
        const bucket = byProvider.get(attempt.providerId);
        if (bucket) bucket.latencyTotalMs += productResult.latencyMs;
      }
    }
  }

  return [...byProvider.values()].map((bucket) => ({
    ...bucket,
    usableOfferRate: safeRate(bucket.successfulQueries, bucket.queriesAttempted),
    validPriceRate: safeRate(bucket.validPriceTotal, bucket.successfulQueries),
    validImageRate: safeRate(bucket.validImageTotal, bucket.successfulQueries),
    validUrlRate: safeRate(bucket.validUrlTotal, bucket.successfulQueries),
    averageAlignmentScore:
      bucket.alignmentScoreCount > 0
        ? Number((bucket.alignmentScoreTotal / bucket.alignmentScoreCount).toFixed(2))
        : null,
    averageLatencyMs:
      bucket.queriesAttempted > 0
        ? Number((bucket.latencyTotalMs / bucket.queriesAttempted).toFixed(2))
        : null,
  }));
}

/**
 * @param {Array<Record<string, unknown>>} productResults
 * @param {Array<Record<string, unknown>>} [providerCoverage]
 */
export function aggregateCommercialCoverageSummary(
  productResults = [],
  providerCoverage = []
) {
  const totalProductsTested = productResults.length;
  const productsWithCommercialCoverage = productResults.filter(
    (entry) => entry.finalCommercialStatus === COMMERCIAL_COVERAGE_STATUS.SUCCESS
  ).length;
  const productsWithoutCommercialCoverage =
    totalProductsTested - productsWithCommercialCoverage;

  const failureReasons = {};
  for (const entry of productResults) {
    const reason = entry.reasonCode || entry.diagnostics?.failureClass || "unknown";
    failureReasons[reason] = (failureReasons[reason] || 0) + 1;
  }

  return sanitizeForReport({
    version: COMMERCIAL_COVERAGE_VALIDATION_VERSION,
    totalProductsTested,
    productsWithCommercialCoverage,
    productsWithoutCommercialCoverage,
    commercialCoverageRate: safeRate(productsWithCommercialCoverage, totalProductsTested),
    priceCoverageRate: safeRate(
      productResults.filter((entry) => entry.hasValidPrice).length,
      totalProductsTested
    ),
    imageCoverageRate: safeRate(
      productResults.filter((entry) => entry.hasValidImage).length,
      totalProductsTested
    ),
    urlCoverageRate: safeRate(
      productResults.filter((entry) => entry.hasValidUrl).length,
      totalProductsTested
    ),
    alignmentPassRate: safeRate(
      productResults.filter((entry) => Number(entry.alignmentScore) >= COMMERCIAL_ALIGNMENT_THRESHOLD).length,
      totalProductsTested
    ),
    averageUsableOffersPerProduct:
      totalProductsTested > 0
        ? Number(
            (
              productResults.reduce((sum, entry) => sum + (entry.usableOfferCount || 0), 0) /
              totalProductsTested
            ).toFixed(2)
          )
        : null,
    totalExternalCallsExecuted: productResults.reduce(
      (sum, entry) => sum + (entry.externalCallsExecuted || 0),
      0
    ),
    totalExternalCallsPrevented: productResults.reduce(
      (sum, entry) => sum + (entry.externalCallsPrevented || 0),
      0
    ),
    coverageByProvider: providerCoverage,
    failureReasons,
    productsNeedingInvestigation: productResults
      .filter((entry) => entry.finalCommercialStatus !== COMMERCIAL_COVERAGE_STATUS.SUCCESS)
      .map((entry) => ({
        productName: entry.productName,
        queryUsed: entry.queryUsed,
        reasonCode: entry.reasonCode,
        failureClass: entry.diagnostics?.failureClass || null,
      })),
  });
}

/**
 * @param {Record<string, unknown>} [report]
 */
export function validateCommercialCoverageResult(report = {}) {
  const products = Array.isArray(report.productResults) ? report.productResults : [];
  const summary = report.summary || {};
  const issues = [];

  if (!report.version) issues.push("missing_version");
  if (!Array.isArray(products)) issues.push("missing_product_results");
  if (products.length > COMMERCIAL_COVERAGE_ABSOLUTE_MAX_PRODUCTS) {
    issues.push("max_products_exceeded");
  }
  if (summary.commercialCoverageRate != null && Number.isNaN(summary.commercialCoverageRate)) {
    issues.push("invalid_coverage_rate");
  }

  const serialized = JSON.stringify(report);
  if (SECRET_PATTERN.test(serialized) && /sk-|apikey|token=/.test(serialized)) {
    issues.push("possible_secret_leak");
  }

  return {
    ok: issues.length === 0,
    issues,
    productCount: products.length,
  };
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function buildCommercialCoverageDiagnostics(input = {}) {
  return sanitizeForReport({
    version: COMMERCIAL_COVERAGE_VALIDATION_VERSION,
    validationMode: input.validationMode || COMMERCIAL_COVERAGE_MODES.SYNTHETIC,
    productsPlanned: input.productsPlanned ?? 0,
    productsCompleted: input.productsCompleted ?? 0,
    currentProduct: input.currentProduct || null,
    providersAttempted: input.providersAttempted || [],
    coverageStatus: input.coverageStatus || null,
    externalCallsExecuted: input.externalCallsExecuted ?? 0,
    externalCallsPrevented: input.externalCallsPrevented ?? 0,
    stopReason: input.stopReason || null,
    summary: input.summary || null,
  });
}

/**
 * @param {Record<string, unknown>|null} [report]
 */
export function buildCommercialCoverageDevPayload(report = null) {
  return sanitizeForReport({
    version: COMMERCIAL_COVERAGE_VALIDATION_VERSION,
    config: readCommercialCoverageValidationConfig(),
    report,
    diagnostics: buildCommercialCoverageDiagnostics({
      validationMode: report?.validationMode,
      productsPlanned: report?.plan?.productsPlanned,
      productsCompleted: report?.productResults?.length,
      summary: report?.summary,
      externalCallsExecuted: report?.summary?.totalExternalCallsExecuted,
      externalCallsPrevented: report?.summary?.totalExternalCallsPrevented,
    }),
  });
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function canExecuteRealCommercialCoverageValidation(input = {}) {
  const config = readCommercialCoverageValidationConfig(input.env, input.argv);
  const instructions = buildRealValidationInstructions(config);

  if (config.mode !== COMMERCIAL_COVERAGE_MODES.REAL) {
    return { allowed: false, reason: "not_real_mode", instructions };
  }
  if (!config.realValidationEnabled) {
    return { allowed: false, reason: "env_disabled", instructions };
  }
  if (!config.allowExternalFlag) {
    return { allowed: false, reason: "missing_allow_external_flag", instructions };
  }

  const devPermission = evaluateDevCommercialExecutionPermission({
    env: input.env,
    invocationSource: "commercial_coverage_validation",
    isManualAudit: true,
    requestOptIn: config.allowPaidExternalFlag,
  });

  if (devPermission.realExecutionAllowed !== true) {
    return {
      allowed: false,
      reason: "dev_cost_guard_blocked",
      instructions,
      devPermission,
    };
  }

  return {
    allowed: true,
    reason: "authorized",
    instructions,
    devPermission,
  };
}

/**
 * @param {Record<string, unknown>} [config]
 */
export function buildRealValidationInstructions(config = readCommercialCoverageValidationConfig()) {
  return [
    "Validação real controlada exige TODAS as condições:",
    `1) ${COMMERCIAL_COVERAGE_REAL_VALIDATION_ENABLED_ENV}=true`,
    "2) --real --allow-external",
    "3) COMMERCIAL_DEV_REAL_EXTERNAL_CALLS_ENABLED=true + --allow-paid-external (providers pagos)",
    "4) Providers enabled/auth prontos no ambiente",
    `5) Máximo ${config.maxProducts} produtos (absoluto ${COMMERCIAL_COVERAGE_ABSOLUTE_MAX_PRODUCTS})`,
    "6) Execução sequencial — sem Promise.all",
  ].join("\n");
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function buildRealValidationPreflight(input = {}) {
  const config = readCommercialCoverageValidationConfig(input.env, input.argv);
  const plan = buildCommercialCoverageValidationPlan({ ...input, config });
  const guard = canExecuteRealCommercialCoverageValidation(input);
  const providers = listCommercialProviderOperationalMetadata(input.env);

  const paidProviders = providers
    .filter((entry) => entry.billingTier === "paid_external" && entry.enabled === true)
    .map((entry) => entry.id);

  const budgetSnapshot = plan.orderedProviders.map((providerId) => {
    const decision = evaluateProviderBudgetPermission({
      providerId,
      invocationSource: "commercial_coverage_validation_preflight",
      env: input.env,
    });
    return {
      providerId,
      shouldCallProvider: decision.shouldCallProvider,
      callsRemaining: decision.callsRemaining ?? null,
      circuitState: decision.circuitState || null,
      reasonCode: decision.reasonCode || null,
    };
  });

  const maxTheoreticalCalls = plan.products.length * plan.orderedProviders.length;

  return sanitizeForReport({
    version: COMMERCIAL_COVERAGE_VALIDATION_VERSION,
    authorized: guard.allowed === true,
    guard,
    instructions: buildRealValidationInstructions(config),
    productsPlanned: plan.products.map((entry) => entry.productName),
    queriesPlanned: plan.products.map((entry) => entry.queryUsed),
    providersEnabled: providers.filter((entry) => entry.enabled).map((entry) => entry.id),
    priorityEngineOrder: plan.orderedProviders,
    skippedProviders: plan.skippedProviders,
    paidProviders,
    maxProducts: config.maxProducts,
    maxTheoreticalExternalCalls: maxTheoreticalCalls,
    cacheMayPreventCalls: true,
    budgetSnapshot,
    requiredFlags: {
      [COMMERCIAL_COVERAGE_REAL_VALIDATION_ENABLED_ENV]: "true",
      COMMERCIAL_DEV_REAL_EXTERNAL_CALLS_ENABLED: "true (paid providers)",
      cli: "--real --allow-external --allow-paid-external",
    },
    cancelHint: "Pressione Ctrl+C antes da confirmação ou não defina as envs/flags acima.",
  });
}

/**
 * @param {Record<string, unknown>} [input]
 */
export async function executeSyntheticCommercialCoverageValidation(input = {}) {
  const config = readCommercialCoverageValidationConfig(input.env, input.argv);
  const plan = buildCommercialCoverageValidationPlan({ ...input, config });
  const scenarioIds =
    input.scenarioIds || listCommercialCoverageSyntheticScenarioIds();

  const productResults = [];

  for (const scenarioId of scenarioIds) {
    const scenario = COMMERCIAL_COVERAGE_SYNTHETIC_SCENARIOS[scenarioId];
    if (!scenario) continue;

    productResults.push(
      buildCommercialProductCoverageResult({
        product: {
          productName: scenario.productName,
          queryUsed: scenario.queryUsed,
        },
        queryUsed: scenario.queryUsed,
        providerResults: scenario.providerResults,
        priorityPlan: plan.priorityPlan,
        synthetic: true,
        env: input.env,
        startedAt: Date.now(),
        latencyMs: 1,
      })
    );
  }

  const providerCoverage = aggregateCommercialProviderCoverage(productResults);
  const summary = aggregateCommercialCoverageSummary(productResults, providerCoverage);

  const report = {
    version: COMMERCIAL_COVERAGE_VALIDATION_VERSION,
    validationMode: COMMERCIAL_COVERAGE_MODES.SYNTHETIC,
    synthetic: true,
    plan,
    productResults,
    providerCoverage,
    summary,
    diagnostics: buildCommercialCoverageDiagnostics({
      validationMode: COMMERCIAL_COVERAGE_MODES.SYNTHETIC,
      productsPlanned: scenarioIds.length,
      productsCompleted: productResults.length,
      externalCallsExecuted: summary.totalExternalCallsExecuted,
      externalCallsPrevented: summary.totalExternalCallsPrevented,
      summary,
    }),
    validation: validateCommercialCoverageResult({
      version: COMMERCIAL_COVERAGE_VALIDATION_VERSION,
      productResults,
      summary,
    }),
  };

  return report;
}

function extractProviderResultsFromActivationTrace(trace = {}, conditionalExecution = null) {
  const mapping = {
    googleResult: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
    mercadolivreResult: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,
    apifyResult: COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE,
  };
  const attemptedFromConditional = new Set(
    (conditionalExecution?.attempts || []).map((entry) => entry.providerId)
  );
  const hasConditionalAttempts = attemptedFromConditional.size > 0;
  const entries = {};

  for (const [traceKey, providerId] of Object.entries(mapping)) {
    const result = trace[traceKey];
    if (!result || isDefaultShadowProviderStub(result)) continue;
    if (hasConditionalAttempts && !attemptedFromConditional.has(providerId)) continue;
    entries[providerId] = result;
  }

  return entries;
}

/**
 * @param {Record<string, unknown>} [input]
 */
export async function executeRealCommercialCoverageValidation(input = {}) {
  const guard = canExecuteRealCommercialCoverageValidation(input);
  const preflight = buildRealValidationPreflight(input);

  if (!guard.allowed) {
    return {
      ok: false,
      blocked: true,
      validationMode: COMMERCIAL_COVERAGE_MODES.REAL,
      guard,
      preflight,
      instructions: guard.instructions || buildRealValidationInstructions(),
    };
  }

  const config = readCommercialCoverageValidationConfig(input.env, input.argv);
  const plan = buildCommercialCoverageValidationPlan({ ...input, config });
  const productResults = [];
  let stopReason = null;
  let consecutiveFailures = 0;

  for (const product of plan.products) {
    const startedAt = Date.now();

    const activation = await resolveOfficialCommercialOffer({
      query: product.queryUsed,
      mode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
      limit: 5,
      env: input.env,
      costGuardContext:
        input.costGuardContext ||
        buildFunctionalProviderCostGuardContext({
          invocationSource: "commercial_coverage_validation",
          runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
          env: input.env,
        }),
      fetchGoogle: input.fetchGoogle,
      fetchApify: input.fetchApify,
      fetchMercadoLivre: input.fetchMercadoLivre,
    });

    const trace = activation.pipelineResult?.trace || {};
    const conditionalExecution = trace.conditional_provider_fetch || null;
    const providerResults = {};
    for (const [providerId, result] of Object.entries(
      extractProviderResultsFromActivationTrace(trace, conditionalExecution)
    )) {
      if (result) providerResults[providerId] = result;
    }

    const productResult = buildCommercialProductCoverageResult({
      product,
      queryUsed: product.queryUsed,
      providerResults,
      priorityPlan: plan.priorityPlan,
      conditionalExecution,
      env: input.env,
      startedAt,
      latencyMs: Date.now() - startedAt,
      synthetic: false,
    });
    productResults.push(productResult);

    if (productResult.finalCommercialStatus !== COMMERCIAL_COVERAGE_STATUS.SUCCESS) {
      consecutiveFailures += 1;
    } else {
      consecutiveFailures = 0;
    }

    if (input.stopAfterConsecutiveFailures && consecutiveFailures >= input.stopAfterConsecutiveFailures) {
      stopReason = "consecutive_failures";
      break;
    }

    if (config.delayMs > 0) {
      await sleep(config.delayMs);
    }
  }

  const providerCoverage = aggregateCommercialProviderCoverage(productResults);
  const summary = aggregateCommercialCoverageSummary(productResults, providerCoverage);

  return {
    ok: true,
    blocked: false,
    validationMode: COMMERCIAL_COVERAGE_MODES.REAL,
    synthetic: false,
    preflight,
    plan,
    productResults,
    providerCoverage,
    summary,
    stopReason,
    diagnostics: buildCommercialCoverageDiagnostics({
      validationMode: COMMERCIAL_COVERAGE_MODES.REAL,
      productsPlanned: plan.products.length,
      productsCompleted: productResults.length,
      externalCallsExecuted: summary.totalExternalCallsExecuted,
      externalCallsPrevented: summary.totalExternalCallsPrevented,
      stopReason,
      summary,
    }),
    validation: validateCommercialCoverageResult({
      version: COMMERCIAL_COVERAGE_VALIDATION_VERSION,
      productResults,
      summary,
    }),
  };
}

export function formatCommercialCoverageConsoleReport(report = {}) {
  const lines = [];
  lines.push(`\nPATCH Comercial 05J — Commercial Coverage Validation (${report.version || COMMERCIAL_COVERAGE_VALIDATION_VERSION})`);
  lines.push(`Modo: ${report.validationMode || "unknown"}${report.synthetic ? " (synthetic fixtures)" : ""}`);
  lines.push(`Produtos medidos: ${report.productResults?.length || 0}`);

  const summary = report.summary || {};
  if (summary.totalProductsTested != null) {
    lines.push(`Cobertura comercial: ${summary.productsWithCommercialCoverage}/${summary.totalProductsTested} (${((summary.commercialCoverageRate || 0) * 100).toFixed(1)}%)`);
    lines.push(`Preço: ${((summary.priceCoverageRate || 0) * 100).toFixed(1)}% | Imagem: ${((summary.imageCoverageRate || 0) * 100).toFixed(1)}% | URL: ${((summary.urlCoverageRate || 0) * 100).toFixed(1)}%`);
    lines.push(`Chamadas externas: ${summary.totalExternalCallsExecuted} executadas / ${summary.totalExternalCallsPrevented} evitadas`);
  }

  for (const productResult of report.productResults || []) {
    lines.push(`\n• ${productResult.productName} (${productResult.queryUsed})`);
    lines.push(`  status=${productResult.finalCommercialStatus} usable=${productResult.usableOfferCount} provider=${productResult.providerUsed || "none"}`);
    lines.push(`  price=${productResult.hasValidPrice} image=${productResult.hasValidImage} url=${productResult.hasValidUrl} alignment=${productResult.alignmentScore ?? "n/a"}`);
    lines.push(`  reason=${productResult.reasonCode}`);
  }

  if (report.blocked) {
    lines.push("\nExecução real bloqueada.");
    lines.push(report.instructions || buildRealValidationInstructions());
  }

  return lines.join("\n");
}

export {
  isCommercialDevRealExternalCallsEnabled,
};
