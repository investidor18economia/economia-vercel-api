/**
 * PATCH Comercial 4E-A — Commercial Runtime Shadow Integration
 *
 * Executa o pipeline comercial novo em modo observação.
 * Não altera winner, ranking, card, resposta ou Decision Engine.
 */

import { fetchGoogleShoppingAdapterResult } from "./adapters/googleShoppingAdapter.js";
import { searchApifyMercadoLivreProducts } from "./adapters/apifyMercadoLivreClient.js";
import {
  clampMergeLimitPerProvider,
  mergeCommercialOfferBundle,
} from "./commercialOfferMergeLayer.js";
import { deduplicateCommercialOfferBundle } from "./commercialDeduplicationLayer.js";
import { selectCommercialOffers } from "./commercialSelectionEngine.js";
import { COMMERCIAL_PROVIDER_IDS } from "./commercialProviderRegistry.js";
import { normalizeProductNameKey } from "./normalizeProduct.js";
import { GOOGLE_SHOPPING_LEGACY_PROVIDER } from "./adapters/googleShoppingAdapter.js";
import { isCommercialRuntimeShadowDiagnosticsEnabled } from "./commercialRuntimeMode.js";

export const COMMERCIAL_RUNTIME_SHADOW_VERSION = "4E-A.1";
const SHADOW_PIPELINE_TIMEOUT_MS = 15000;

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
  const fetchGoogle = input.fetchGoogle || fetchGoogleShoppingAdapterResult;
  const fetchApify = input.fetchApify || searchApifyMercadoLivreProducts;

  let googleResult = { ok: false, products: [], error: null };
  let apifyResult = { ok: false, products: [], error: null };

  try {
    [googleResult, apifyResult] = await Promise.all([
      fetchGoogle({ query: trimmedQuery, limit: boundedLimit }).catch((err) => ({
        ok: false,
        products: [],
        error: String(err?.message || "provider_error").slice(0, 120),
        threw: true,
      })),
      fetchApify(trimmedQuery, boundedLimit).catch((err) => ({
        ok: false,
        products: [],
        error: String(err?.message || "provider_error").slice(0, 120),
        threw: true,
      })),
    ]);
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
        apifyResult,
        error,
      },
    };
  }

  const merged = mergeCommercialOfferBundle({
    googleShoppingOffers: (googleResult.products || []).slice(0, boundedLimit),
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
      apifyResult,
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
        fetchGoogle: input.fetchGoogle,
        fetchApify: input.fetchApify,
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
