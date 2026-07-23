/**
 * PATCH Comercial 4E-A — Commercial Runtime Shadow Integration
 *
 * Executa o pipeline comercial novo em modo observação.
 * Não altera winner, ranking, card, resposta ou Decision Engine.
 */

import { fetchGoogleShoppingAdapterResult } from "./adapters/googleShoppingAdapter.js";
import { fetchDataForSeoGoogleShoppingAdapterResult } from "./adapters/dataForSeoGoogleShoppingAdapter.js";
import { fetchMercadoLivreCommercialAdapterResult } from "./adapters/mercadoLivreAdapter.js";
import { searchApifyMercadoLivreProducts } from "./adapters/apifyMercadoLivreClient.js";
import {
  buildObservabilityProviderCostGuardContext,
  buildProviderCostGuardTracePatch,
} from "../commercial/providerCostGuard.js";
import { getActiveRequestExecutionEnv } from "../commercial/externalProviderExecutionPolicy.js";
import {
  buildCommercialRequestDedupTracePatch,
  getActiveCommercialRequestDedupContext,
} from "../commercial/commercialRequestDeduplication.js";
import {
  buildUniversalCommercialCacheTracePatch,
} from "../commercial/universalCommercialCache.js";
import {
  buildConditionalProviderFetchTracePatch,
  executeConditionalProviderFetch,
} from "../commercial/conditionalProviderFetch.js";
import {
  buildProviderBudgetCircuitTracePatch,
} from "../commercial/providerBudgetCircuitBreaker.js";
import { getCommercialRuntimeMode } from "./commercialRuntimeMode.js";
import {
  clampMergeLimitPerProvider,
  mergeCommercialOfferBundle,
} from "./commercialOfferMergeLayer.js";
import { deduplicateCommercialOfferBundle } from "./commercialDeduplicationLayer.js";
import { selectCommercialOffers } from "./commercialSelectionEngine.js";
import {
  buildMercadoLivreRuntimeActivationTracePatch,
} from "../commercial/mercadolivreRuntimeActivation.js";
import {
  buildMultiProviderPriorityPlan,
  buildMultiProviderPriorityTracePatch,
} from "../commercial/multiProviderPriorityEngine.js";
import {
  COMMERCIAL_PROVIDER_IDS,
  getCommercialProviderOperationalMetadata,
  isCommercialProviderEnabled,
} from "./commercialProviderRegistry.js";
import { COMMERCIAL_RUNTIME_MODES } from "./commercialRuntimeMode.js";
import { normalizeProductNameKey } from "./normalizeProduct.js";
import { GOOGLE_SHOPPING_LEGACY_PROVIDER } from "./adapters/googleShoppingAdapter.js";
import { isCommercialRuntimeShadowDiagnosticsEnabled } from "./commercialRuntimeMode.js";

export const COMMERCIAL_RUNTIME_SHADOW_VERSION = "4E-A.3";

const SHADOW_DEFAULT_OBSERVABILITY_PROVIDER_IDS = [
  COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
  COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE,
];
const SHADOW_PIPELINE_TIMEOUT_MS = 15000;

const SHADOW_PIPELINE_RESULT_KEYS = Object.freeze({
  [COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING]: "googleResult",
  [COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO]: "googleDataForSeoResult",
  [COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC]: "mercadolivreResult",
  [COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE]: "apifyResult",
});

function buildDefaultProviderResult() {
  return { ok: false, products: [], error: null };
}

function cleanText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function resolvePipelinePriorityRuntimeMode(input = {}) {
  const explicit = cleanText(input.runtimeMode);
  if (explicit === COMMERCIAL_RUNTIME_MODES.CONTROLLED) {
    return COMMERCIAL_RUNTIME_MODES.CONTROLLED;
  }

  const fromContext = cleanText(input.costGuardContext?.runtimeMode);
  if (fromContext === COMMERCIAL_RUNTIME_MODES.CONTROLLED) {
    return COMMERCIAL_RUNTIME_MODES.CONTROLLED;
  }

  return COMMERCIAL_RUNTIME_MODES.SHADOW;
}

function buildShadowPipelineProviderSlots(input = {}) {
  const runtimeEnv = input.env || getActiveRequestExecutionEnv();
  const boundedLimit = clampMergeLimitPerProvider(input.limit ?? 5);
  const costGuardContext = input.costGuardContext;
  const trimmedQuery = String(input.query || "").trim();
  const runtimeMode = resolvePipelinePriorityRuntimeMode(input);
  const fetchBindings = {
    [COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING]:
      input.fetchGoogle ||
      (() =>
        fetchGoogleShoppingAdapterResult({
          query: trimmedQuery,
          limit: boundedLimit,
          costGuardContext,
          invocationLayer: "commercial_runtime_shadow_pipeline",
        })),
    [COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO]:
      input.fetchDataForSeoGoogle ||
      (() =>
        fetchDataForSeoGoogleShoppingAdapterResult({
          query: trimmedQuery,
          limit: boundedLimit,
          costGuardContext,
          invocationLayer: "commercial_runtime_shadow_pipeline",
          env: runtimeEnv,
        })),
    [COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC]:
      input.fetchMercadoLivre ||
      (() =>
        fetchMercadoLivreCommercialAdapterResult({
          query: trimmedQuery,
          limit: boundedLimit,
          costGuardContext,
          invocationLayer: "commercial_runtime_shadow_pipeline",
          env: runtimeEnv,
        })),
    [COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE]:
      input.fetchApify ||
      ((query, limit) =>
        searchApifyMercadoLivreProducts(query, limit, {
          costGuardContext,
          invocationLayer: "commercial_runtime_shadow_pipeline",
          env: runtimeEnv,
        })),
  };

  const priorityPlan = buildMultiProviderPriorityPlan({
    runtimeMode,
    invocationSource: "commercial_runtime_shadow_pipeline",
    query: trimmedQuery,
    limit: boundedLimit,
    env: runtimeEnv,
  });

  const orderedEntries =
    priorityPlan.orderedProviders?.length > 0
      ? priorityPlan.orderedProviders
      : SHADOW_DEFAULT_OBSERVABILITY_PROVIDER_IDS.map((providerId, registryPosition) => ({
          providerId,
          registryPosition,
          priorityScore: 100 - registryPosition,
        }));

  return {
    priorityPlan: {
      ...priorityPlan,
      orderedProviders: orderedEntries,
      shadowFallbackUsed: !priorityPlan.orderedProviders?.length,
    },
    slots: orderedEntries
      .filter((entry) => fetchBindings[entry.providerId])
      .map((entry) => ({
        providerId: entry.providerId,
        registryPosition: entry.registryPosition,
        priorityScore: entry.priorityScore,
        resultKey: SHADOW_PIPELINE_RESULT_KEYS[entry.providerId] || `${entry.providerId}Result`,
        fetch: () => {
          const binding = fetchBindings[entry.providerId];
          const promise =
            entry.providerId === COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING ||
            entry.providerId === COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO
              ? binding({ query: trimmedQuery, limit: boundedLimit })
              : binding(trimmedQuery, boundedLimit);

          return Promise.resolve(promise).catch((err) => ({
            ok: false,
            products: [],
            error: String(err?.message || "provider_error").slice(0, 120),
            threw: true,
          }));
        },
      })),
  };
}

export function isCommercialRuntimeShadowEnabled() {
  return isCommercialRuntimeShadowDiagnosticsEnabled();
}

function mapLegacyProvider(provider = "") {
  const key = String(provider || "").trim().toLowerCase();
  if (
    key === "serpapi" ||
    key === GOOGLE_SHOPPING_LEGACY_PROVIDER ||
    key === COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING
  ) {
    return COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING;
  }
  if (key === COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO) {
    return COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO;
  }
  return key || COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING;
}

/**
 * @param {Record<string, unknown>|null} legacy
 */
export function normalizeLegacyCommercialOfferForShadow(legacy = null) {
  if (!legacy) return null;

  const title = String(legacy.product_name || legacy.title || "").trim();
  if (!title) return null;

  return {
    title,
    price: legacy.price ?? null,
    url: legacy.link || legacy.url || "",
    image: legacy.thumbnail || legacy.image || null,
    source: legacy.source || "",
    provider: mapLegacyProvider(
      legacy.commercialProvider || legacy.provider || legacy.source
    ),
  };
}

/**
 * @param {Record<string, unknown>|null} offer
 */
export function normalizeShadowSelectedOffer(offer = null) {
  if (!offer) return null;

  return {
    title: String(offer.title || "").trim(),
    price: offer.price ?? null,
    url: offer.url || "",
    image: offer.image || null,
    source: offer.source || "",
    provider: offer.source || offer.provider || COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE,
  };
}

function normalizeUrlForCompare(url = "") {
  try {
    const parsed = new URL(String(url || "").trim());
    return `${parsed.hostname}${parsed.pathname}`.toLowerCase().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

/**
 * @param {Record<string, unknown>|null} legacyOffer
 * @param {Record<string, unknown>|null} shadowOffer
 */
export function areSameCommercialShadowOffers(legacyOffer = null, shadowOffer = null) {
  if (!legacyOffer || !shadowOffer) return false;

  const legacyUrl = normalizeUrlForCompare(legacyOffer.url);
  const shadowUrl = normalizeUrlForCompare(shadowOffer.url);
  if (legacyUrl && shadowUrl && legacyUrl === shadowUrl) return true;

  const legacyKey = normalizeProductNameKey(legacyOffer.title);
  const shadowKey = normalizeProductNameKey(shadowOffer.title);
  if (!legacyKey || !shadowKey) return false;
  if (legacyKey === shadowKey) return true;

  return legacyKey.includes(shadowKey) || shadowKey.includes(legacyKey);
}

/**
 * @param {Record<string, unknown>} input
 */
export function buildCommercialShadowPayload(input = {}) {
  const legacyOffer = normalizeLegacyCommercialOfferForShadow(
    input.legacyOffer || input.winner
  );
  const shadowOffer = normalizeShadowSelectedOffer(input.shadowOffer);

  return {
    query: String(input.query || "").trim(),
    winner: String(
      input.winnerLabel ||
        input.winner?.product_name ||
        legacyOffer?.title ||
        ""
    ).trim(),
    legacyOffer,
    shadowOffer,
    sameOffer: areSameCommercialShadowOffers(legacyOffer, shadowOffer),
    legacyProvider: legacyOffer?.provider || COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
    shadowProvider: shadowOffer?.provider || null,
    timestamp: input.timestamp || new Date().toISOString(),
  };
}

/**
 * @param {Record<string, unknown>|null} payload
 */
export function buildCommercialShadowDiagnostics(payload = null) {
  if (!payload) {
    return {
      enabled: isCommercialRuntimeShadowEnabled(),
      skipped: true,
      version: COMMERCIAL_RUNTIME_SHADOW_VERSION,
    };
  }

  return {
    enabled: true,
    skipped: false,
    version: COMMERCIAL_RUNTIME_SHADOW_VERSION,
    sameOffer: !!payload.sameOffer,
    legacyProvider: payload.legacyProvider || null,
    shadowProvider: payload.shadowProvider || null,
    winner: payload.winner || null,
    query: payload.query || null,
    hasShadowOffer: !!payload.shadowOffer,
    hasLegacyOffer: !!payload.legacyOffer,
    timestamp: payload.timestamp || null,
    pipelineOk: payload.pipelineOk !== false,
    pipelineError: payload.pipelineError || null,
  };
}

/**
 * @param {Record<string, unknown>|null} payload
 */
export function logCommercialShadowObservation(payload = null) {
  const diagnostics = buildCommercialShadowDiagnostics(payload);
  if (!diagnostics.enabled || diagnostics.skipped) return;

  const parts = [
    "[CommercialShadow]",
    `query=${diagnostics.query || "unknown"}`,
    `sameOffer=${diagnostics.sameOffer}`,
    `legacy=${diagnostics.legacyProvider || "unknown"}`,
    `shadow=${diagnostics.shadowProvider || "none"}`,
  ];

  if (diagnostics.pipelineError) {
    parts.push(`error=${diagnostics.pipelineError}`);
  }

  console.log(parts.join(" "));
}

/**
 * @param {{
 *   query?: string,
 *   limit?: number,
 *   fetchGoogle?: Function,
 *   fetchApify?: Function,
 * }} input
 */
export async function runCommercialShadowPipeline(input = {}) {
  const startedAt = Date.now();
  const pipelineEnv = input.env || getActiveRequestExecutionEnv();
  const trimmedQuery = String(input.query || "").trim();
  if (!trimmedQuery) {
    return {
      ok: false,
      shadowOffer: null,
      error: "empty_query",
      offerCount: 0,
      trace: {
        query: "",
        startedAt,
        durationMs: Date.now() - startedAt,
        timedOut: false,
        timeoutMs: input.timeoutMs || SHADOW_PIPELINE_TIMEOUT_MS,
        error: "empty_query",
      },
    };
  }

  const boundedLimit = clampMergeLimitPerProvider(input.limit ?? 5);
  const costGuardContext =
    input.costGuardContext ||
    buildObservabilityProviderCostGuardContext({
      invocationSource: "commercial_runtime_shadow_pipeline",
      runtimeMode: getCommercialRuntimeMode(),
      env: pipelineEnv,
    });

  let googleResult = buildDefaultProviderResult();
  let mercadolivreResult = buildDefaultProviderResult();
  let apifyResult = buildDefaultProviderResult();
  const costGuardDecisions = [];
  let conditionalExecution = null;
  let mercadolivreActivationTrace = null;

  let providerSlots = [];
  let priorityPlan = null;

  try {
    const pipelineProviders = buildShadowPipelineProviderSlots({
      ...input,
      env: pipelineEnv,
      query: trimmedQuery,
      limit: boundedLimit,
      costGuardContext,
    });
    priorityPlan = pipelineProviders.priorityPlan;
    providerSlots = pipelineProviders.slots;

    conditionalExecution = await executeConditionalProviderFetch({
      query: trimmedQuery,
      providers: providerSlots,
    });

    try {
      const { observeShadowConditionalProviderExecution } = await import(
        "../miaProviderAttemptAnalytics.js"
      );
      observeShadowConditionalProviderExecution(conditionalExecution);
    } catch {
      // Analytics must never affect shadow pipeline
    }

    googleResult = conditionalExecution.results.googleResult || googleResult;
    mercadolivreResult = conditionalExecution.results.mercadolivreResult || mercadolivreResult;
    apifyResult = conditionalExecution.results.apifyResult || apifyResult;

    for (const result of [googleResult, mercadolivreResult, apifyResult]) {
      if (result?.costGuardDecision) {
        costGuardDecisions.push(result.costGuardDecision);
      }
    }

    mercadolivreActivationTrace = buildMercadoLivreRuntimeActivationTracePatch({
      enabled: isCommercialProviderEnabled(COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC),
      activationMode: mercadolivreResult?.error === "provider_disabled" ? "disabled" : "controlled",
      authMode: mercadolivreResult?.registryMetadata?.authMode || null,
      registryPosition: providerSlots.findIndex(
        (slot) => slot.providerId === COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC
      ),
      invocationSource: "commercial_runtime_shadow_pipeline",
      runtimeMode: getCommercialRuntimeMode(),
      costGuardDecision: mercadolivreResult?.costGuardDecision || null,
      cacheStatus: mercadolivreResult?.universalCommercialCacheHit ? "hit" : mercadolivreResult ? "miss" : "skipped",
      dedupStatus: mercadolivreResult?.requestDeduplicated ? "reused" : mercadolivreResult ? "executed" : "skipped",
      budgetDecision: mercadolivreResult?.budgetCircuitDecision || null,
      circuitState: mercadolivreResult?.circuitState || null,
      requestExecuted: mercadolivreResult?.skipped !== true && mercadolivreResult?.error !== "provider_disabled",
      resultCount: mercadolivreResult?.count || 0,
      normalizationStatus: mercadolivreResult?.ok ? "normalized" : "neutral",
      reasonCode: mercadolivreResult?.reasonCode || mercadolivreResult?.error || null,
    });
  } catch (err) {
    const error = String(err?.message || "provider_error").slice(0, 80);
    return {
      ok: false,
      shadowOffer: null,
      error,
      offerCount: 0,
      trace: {
        query: trimmedQuery,
        startedAt,
        durationMs: Date.now() - startedAt,
        timedOut: false,
        timeoutMs: input.timeoutMs || SHADOW_PIPELINE_TIMEOUT_MS,
        googleResult,
        mercadolivreResult,
        apifyResult,
        error,
      },
    };
  }

  const merged = mergeCommercialOfferBundle({
    googleShoppingOffers: (googleResult.products || []).slice(0, boundedLimit),
    mercadolivrePublicOffers: (mercadolivreResult.products || []).slice(0, boundedLimit),
    apifyMercadoLivreOffers: (apifyResult.products || []).slice(0, boundedLimit),
  });

  const deduped = deduplicateCommercialOfferBundle(merged.offers);
  const selection = selectCommercialOffers({ query: trimmedQuery, offers: deduped.offers });
  const durationMs = Date.now() - startedAt;

  return {
    ok: !!selection.selectedOffer,
    shadowOffer: selection.selectedOffer || null,
    alternativeOffers: selection.alternativeOffers || [],
    diagnostics: selection.diagnostics || null,
    offerCount: deduped.offers.length,
    error: selection.selectedOffer ? null : "empty_selection",
    trace: {
      query: trimmedQuery,
      startedAt,
      durationMs,
      timedOut: false,
      timeoutMs: input.timeoutMs || SHADOW_PIPELINE_TIMEOUT_MS,
      googleResult,
      mercadolivreResult,
      apifyResult,
      costGuardDecisions,
      costGuardTrace: buildProviderCostGuardTracePatch(costGuardDecisions),
      ...(buildMultiProviderPriorityTracePatch(priorityPlan) || {}),
      ...(mercadolivreActivationTrace || {}),
      ...(buildCommercialRequestDedupTracePatch(
        input.commercialRequestDedupContext || getActiveCommercialRequestDedupContext()
      ) || {}),
      ...buildUniversalCommercialCacheTracePatch(),
      ...buildConditionalProviderFetchTracePatch(conditionalExecution),
      ...buildProviderBudgetCircuitTracePatch(),
      merge: merged,
      dedupe: deduped,
      selection,
      error: selection.selectedOffer ? null : "empty_selection",
    },
  };
}

function withShadowTimeout(promise, ms = SHADOW_PIPELINE_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("shadow_timeout")), ms);
    }),
  ]);
}

/**
 * @param {{
 *   query?: string,
 *   winner?: Record<string, unknown>|null,
 *   legacyOffer?: Record<string, unknown>|null,
 *   limit?: number,
 *   fetchGoogle?: Function,
 *   fetchApify?: Function,
 *   force?: boolean,
 * }} input
 */
export async function executeCommercialRuntimeShadow(input = {}) {
  const force = input.force === true;
  if (!force && !isCommercialRuntimeShadowEnabled()) {
    return {
      skipped: true,
      diagnostics: buildCommercialShadowDiagnostics(null),
      payload: null,
      pipelineResult: null,
    };
  }

  const query = String(input.query || "").trim();
  const legacyOffer = normalizeLegacyCommercialOfferForShadow(
    input.legacyOffer || input.winner
  );

  try {
    const pipelineResult = await withShadowTimeout(
      runCommercialShadowPipeline({
        query,
        limit: input.limit,
        env: input.env || getActiveRequestExecutionEnv(),
        fetchGoogle: input.fetchGoogle,
        fetchApify: input.fetchApify,
        fetchMercadoLivre: input.fetchMercadoLivre,
      })
    );

    const payload = buildCommercialShadowPayload({
      query,
      winner: input.winner,
      legacyOffer,
      shadowOffer: pipelineResult.shadowOffer,
      timestamp: new Date().toISOString(),
    });

    const diagnostics = buildCommercialShadowDiagnostics({
      ...payload,
      pipelineOk: pipelineResult.ok,
      pipelineError: pipelineResult.error || null,
    });

    logCommercialShadowObservation({
      ...payload,
      pipelineOk: pipelineResult.ok,
      pipelineError: pipelineResult.error || null,
    });

    return {
      skipped: false,
      payload,
      diagnostics,
      pipelineResult,
    };
  } catch (err) {
    const errorCode = String(err?.message || "shadow_failed").slice(0, 80);
    const payload = buildCommercialShadowPayload({
      query,
      winner: input.winner,
      legacyOffer,
      shadowOffer: null,
    });

    logCommercialShadowObservation({
      ...payload,
      pipelineOk: false,
      pipelineError: errorCode,
    });

    return {
      skipped: false,
      payload,
      diagnostics: buildCommercialShadowDiagnostics({
        ...payload,
        pipelineOk: false,
        pipelineError: errorCode,
      }),
      pipelineResult: {
        ok: false,
        shadowOffer: null,
        error: errorCode,
        offerCount: 0,
        trace: {
          query,
          durationMs: null,
          timedOut: errorCode === "shadow_timeout",
          timeoutMs: SHADOW_PIPELINE_TIMEOUT_MS,
          error: errorCode,
        },
      },
    };
  }
}

/**
 * @param {Record<string, unknown>|null} legacyProduct
 */
export function buildLegacyOfferFromGoogleShoppingProduct(legacyProduct = null) {
  return normalizeLegacyCommercialOfferForShadow(legacyProduct);
}
