/**
 * PATCH Comercial 4E-A.1 — Commercial Shadow Diagnostic Summary
 *
 * Observabilidade passiva do Commercial Runtime Shadow.
 * Não altera winner, ranking, cards, contracts ou pipeline principal.
 */

import { calculateCommercialAlignment } from "./commercialQueryProductAlignmentLayer.js";
import { COMMERCIAL_PROVIDER_IDS } from "./commercialProviderRegistry.js";
import {
  buildAccessoryIntentDiagnostic,
} from "../commercial/accessoryIntentLockGuard.js";
import {
  buildCommercialKnowledgeMetadata,
  buildCommercialKnowledgeSourceDiagnostic,
  formatCommercialKnowledgeSourceLabel,
} from "../commercial/nonDataLayerCommercialResponseGuard.js";
import {
  buildCommercialShadowDiagnostics,
  buildCommercialShadowPayload,
  normalizeLegacyCommercialOfferForShadow,
} from "./commercialRuntimeShadow.js";

export const COMMERCIAL_SHADOW_DIAGNOSTIC_SUMMARY_VERSION = "4E-A.1";

const PROVIDER_LABELS = Object.freeze({
  [COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING]: "Google Shopping",
  [COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE]: "Apify MercadoLivre",
});

function cleanText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function providerLabel(providerId = "") {
  return PROVIDER_LABELS[providerId] || String(providerId || "unknown");
}

function friendlyProviderError(error = "") {
  const message = cleanText(error).toLowerCase();
  if (!message) return null;
  if (message.includes("rate") && message.includes("limit")) return "rate limited";
  if (message.includes("timeout") || message === "shadow_timeout") return "timeout";
  if (message.includes("provider_down") || message.includes("provider_error")) return "provider error";
  return cleanText(error).slice(0, 120);
}

/**
 * @param {Record<string, unknown>|null} result
 * @param {string} providerId
 */
export function summarizeCommercialShadowProviderResult(result = null, providerId = "") {
  const products = Array.isArray(result?.products) ? result.products : [];
  const rawError = result?.error || result?.message || null;
  const friendlyError = friendlyProviderError(String(rawError || ""));
  const threw = result?.threw === true;
  const count = products.length;
  const ok = !threw && count > 0 && result?.ok !== false;

  let status = "OK";
  if (threw || result?.ok === false) {
    status = friendlyError || "error";
  } else if (count === 0) {
    status = "empty";
  } else if (friendlyError) {
    status = friendlyError;
  }

  return {
    providerId,
    label: providerLabel(providerId),
    ok,
    status,
    count,
    error: friendlyError,
    executed: result != null,
  };
}

/**
 * @param {Record<string, unknown>} trace
 */
export function buildCommercialShadowProviderSummary(trace = {}) {
  const google = summarizeCommercialShadowProviderResult(
    trace.googleResult,
    COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING
  );
  const apify = summarizeCommercialShadowProviderResult(
    trace.apifyResult,
    COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE
  );

  const executed = [google, apify].filter((entry) => entry.executed);
  const failed = executed.filter((entry) => !entry.ok);
  const winnerProvider = trace.selection?.selectedOffer?.source || trace.selection?.selectedOffer?.provider || null;

  const discarded = executed
    .map((entry) => entry.providerId)
    .filter((providerId) => providerId && providerId !== winnerProvider);

  let fallbackProvider = null;
  if (failed.length === 1 && executed.length === 2) {
    const surviving = executed.find((entry) => entry.ok);
    fallbackProvider = surviving?.providerId || null;
  }

  return {
    executed: executed.map((entry) => entry.providerId),
    failed: failed.map((entry) => ({
      providerId: entry.providerId,
      label: entry.label,
      status: entry.status,
      error: entry.error,
    })),
    google,
    apify,
    winnerProvider,
    discardedProviders: discarded,
    fallbackProvider,
  };
}

/**
 * @param {Record<string, unknown>} trace
 */
export function buildCommercialShadowPipelineSummary(trace = {}) {
  const merge = trace.merge?.diagnostics || {};
  const dedupe = trace.dedupe?.diagnostics || {};
  const selection = trace.selection?.diagnostics || {};
  const query = cleanText(trace.query || "");

  const alignmentRemoved = countAlignmentMisaligned(query, trace.dedupe?.offers || []);

  const pipelineError = trace.error || null;
  const timedOut = trace.timedOut === true || pipelineError === "shadow_timeout";

  let pipelineStatus = "SUCCESS";
  if (timedOut) {
    pipelineStatus = "TIMEOUT";
  } else if (pipelineError === "empty_selection" || pipelineError === "empty_query") {
    pipelineStatus = "EMPTY_SELECTION";
  } else if (pipelineError) {
    pipelineStatus = "FAILED";
  } else if (!trace.selection?.selectedOffer) {
    pipelineStatus = "EMPTY_SELECTION";
  }

  return {
    query,
    mergeCount: merge.mergedCount ?? trace.merge?.offers?.length ?? 0,
    googleCount: merge.googleCount ?? 0,
    apifyCount: merge.apifyCount ?? 0,
    dedupeCount: dedupe.afterCount ?? trace.dedupe?.offers?.length ?? 0,
    duplicatesRemoved: dedupe.duplicatesRemoved ?? 0,
    variantFiltered: dedupe.variantFiltered ?? 0,
    alignmentRemoved,
    pipelineStatus,
    pipelineSuccess: pipelineStatus === "SUCCESS",
    pipelineFailed: pipelineStatus === "FAILED" || pipelineStatus === "TIMEOUT",
    error: pipelineError,
    friendlyError: friendlyProviderError(String(pipelineError || "")),
    timedOut,
    durationMs: trace.durationMs ?? null,
    timeoutMs: trace.timeoutMs ?? null,
    selectionInputCount: selection.inputCount ?? null,
    selectionEligibleCount: selection.eligibleCount ?? null,
    selectionExcludedCount: selection.excludedCount ?? null,
  };
}

function countAlignmentMisaligned(query = "", offers = []) {
  if (!query) return 0;
  return offers.filter((offer) => {
    const alignment = calculateCommercialAlignment({ query, offer });
    return alignment?.isAligned === false;
  }).length;
}

/**
 * @param {Record<string, unknown>} selection
 */
export function buildCommercialShadowSelectionSummary(selection = {}) {
  const selected = selection.selectedOffer || null;
  const diagnostics = selection.diagnostics || {};

  return {
    winner: selected?.source || selected?.provider || null,
    winnerLabel: providerLabel(selected?.source || selected?.provider || ""),
    commercialScore: selected?.commercialScore ?? diagnostics.topScore ?? null,
    selectedScore: diagnostics.selectedScore ?? selected?.commercialScore ?? null,
    selectionReasonCode: diagnostics.selectionReason || null,
    tieGroupSize: diagnostics.tieGroupSize ?? 0,
    alternativeCount: Array.isArray(selection.alternativeOffers)
      ? selection.alternativeOffers.length
      : 0,
    title: selected?.title || null,
    price: selected?.price ?? null,
    url: selected?.url || null,
    scoreBreakdown: selected?.scoreBreakdown || null,
    alignment: selected?.alignment || null,
  };
}

/**
 * @param {Record<string, unknown>} selection
 */
export function buildCommercialShadowReasonSummary(selection = {}) {
  const selected = selection.selectedOffer || null;
  const diagnostics = selection.diagnostics || {};
  const lines = [];

  if (diagnostics.selectionReason === "no_eligible_offers") {
    lines.push("Nenhuma oferta elegível após validação comercial.");
    return lines;
  }

  if (diagnostics.selectionReason === "top_commercial_score") {
    lines.push("Maior score comercial.");
  } else if (diagnostics.selectionReason === "top_score_with_relevant_tie") {
    lines.push("Maior score comercial com empate relevante.");
  }

  const breakdown = selected?.scoreBreakdown || {};
  if (Number(breakdown.price) >= 20) {
    lines.push("Preço competitivo.");
  }
  if (Number(breakdown.quality) >= 15) {
    if (cleanText(selected?.title).length >= 12) {
      lines.push("Título mais completo.");
    }
    if (cleanText(selected?.image)) {
      lines.push("Imagem presente.");
    }
    if (cleanText(selected?.url)) {
      lines.push("URL válida.");
    }
  }
  if (Number(breakdown.providerConfidence) >= 8) {
    lines.push("Maior confiança do provider.");
  }

  const alignment = selected?.alignment;
  if (alignment?.alignmentReason) {
    lines.push(cleanText(alignment.alignmentReason));
  } else if (alignment?.isAligned === true) {
    lines.push("Alinhamento forte com a busca.");
  } else if (alignment?.isAligned === false) {
    lines.push("Alinhamento parcial com ajuste de score.");
  }

  return [...new Set(lines.filter(Boolean))];
}

/**
 * @param {Record<string, unknown>} input
 */
export function buildCommercialShadowSummary(input = {}) {
  const trace = input.trace || {};
  const payload =
    input.payload ||
    buildCommercialShadowPayload({
      query: trace.query,
      winner: input.winner,
      legacyOffer: input.legacyOffer,
      shadowOffer: trace.selection?.selectedOffer || input.shadowOffer,
    });

  const providers = buildCommercialShadowProviderSummary(trace);
  const pipeline = buildCommercialShadowPipelineSummary(trace);
  const selection = buildCommercialShadowSelectionSummary(trace.selection || {});
  const reasonLines = buildCommercialShadowReasonSummary(trace.selection || {});
  const accessoryIntent = buildAccessoryIntentDiagnostic(pipeline.query || payload.query || "");
  const winnerProduct = input.winner || input.legacyOffer || payload?.legacyOffer || null;
  const knowledgeMetadata = buildCommercialKnowledgeMetadata({
    product: winnerProduct,
    trustedSpecs: winnerProduct?.trustedSpecs || null,
    knowledgeMetadata: input.knowledgeMetadata || null,
    factsMode: input.factsMode || null,
  });
  const knowledgeSourceLabel = formatCommercialKnowledgeSourceLabel(knowledgeMetadata);

  const legacyLabel = providerLabel(payload.legacyProvider);
  const shadowLabel = providerLabel(payload.shadowProvider);

  const textLines = [
    "Commercial Shadow Summary",
    "",
    "Query:",
    pipeline.query || payload.query || "",
    "",
    "Accessory Intent:",
    accessoryIntent.isAccessoryIntent ? "YES" : "NO",
  ];

  if (accessoryIntent.isAccessoryIntent && accessoryIntent.matchedSignals.length) {
    textLines.push("", "Signals:", accessoryIntent.matchedSignals.join(", "));
  }

  textLines.push("", "Knowledge Source", "", knowledgeSourceLabel);

  textLines.push(
    "",
    "Providers",
    "",
    `${providers.google.label}:`,
    providers.google.status === "OK" ? "OK" : providers.google.status,
    `${providers.google.count} ofertas`,
    "",
    `${providers.apify.label}:`,
    providers.apify.status === "OK" ? "OK" : providers.apify.status,
    `${providers.apify.count} ofertas`,
    "",
    "Merge:",
    String(pipeline.mergeCount),
    "",
    "Dedup:",
    String(pipeline.dedupeCount),
    "",
    "Duplicates removed:",
    String(pipeline.duplicatesRemoved),
    "",
    "Variant filtered:",
    String(pipeline.variantFiltered),
    "",
    "Alignment removed:",
    String(pipeline.alignmentRemoved),
    "",
    "Winner:",
    selection.winnerLabel || "none",
    "",
    "Commercial Score:",
    selection.commercialScore != null ? String(selection.commercialScore) : "n/a",
    "",
    "Legacy:",
    legacyLabel,
    "",
    "Shadow:",
    shadowLabel,
    "",
    "Same Offer:",
    String(payload.sameOffer),
    "",
    "Reason:",
    reasonLines.join(" ") || selection.selectionReasonCode || "n/a",
    "",
    "Pipeline:",
    pipeline.pipelineStatus,
    "",
    "Duration:",
    pipeline.durationMs != null ? `${pipeline.durationMs} ms` : "n/a"
  );

  if (providers.fallbackProvider) {
    textLines.push("", "Fallback:", providerLabel(providers.fallbackProvider));
  }
  if (pipeline.friendlyError) {
    textLines.push("", "Error:", pipeline.friendlyError);
  }

  return {
    version: COMMERCIAL_SHADOW_DIAGNOSTIC_SUMMARY_VERSION,
    text: textLines.join("\n"),
    query: pipeline.query || payload.query || "",
    accessoryIntent,
    knowledgeMetadata,
    knowledgeSource: buildCommercialKnowledgeSourceDiagnostic(knowledgeMetadata),
    providers,
    pipeline,
    selection,
    reasonLines,
    legacyOffer: payload.legacyOffer,
    shadowOffer: payload.shadowOffer,
    sameOffer: payload.sameOffer,
    legacyProvider: payload.legacyProvider,
    shadowProvider: payload.shadowProvider,
  };
}

/**
 * @param {Record<string, unknown>} input
 */
export function buildCommercialShadowDiagnosticReport(input = {}) {
  const shadowExecution = input.shadowExecution || {};
  const trace = shadowExecution.pipelineResult?.trace || input.trace || {};
  const payload = shadowExecution.payload || input.payload || null;
  const diagnostics =
    shadowExecution.diagnostics ||
    buildCommercialShadowDiagnostics(payload) ||
    input.diagnostics ||
    null;

  const summary = buildCommercialShadowSummary({
    trace,
    payload,
    winner: input.winner,
    legacyOffer: input.legacyOffer || payload?.legacyOffer,
    shadowOffer: payload?.shadowOffer,
    knowledgeMetadata: input.knowledgeMetadata,
    factsMode: input.factsMode,
  });

  return {
    version: COMMERCIAL_SHADOW_DIAGNOSTIC_SUMMARY_VERSION,
    summary: summary.text,
    diagnostics,
    accessoryIntent: summary.accessoryIntent,
    knowledgeSource: summary.knowledgeSource,
    knowledgeMetadata: summary.knowledgeMetadata,
    providerResults: {
      google: summary.providers.google,
      apify: summary.providers.apify,
      executed: summary.providers.executed,
      failed: summary.providers.failed,
      fallbackProvider: summary.providers.fallbackProvider,
    },
    selection: summary.selection,
    pipeline: summary.pipeline,
    reasonLines: summary.reasonLines,
    timings: {
      durationMs: summary.pipeline.durationMs,
      timedOut: summary.pipeline.timedOut,
      timeoutMs: summary.pipeline.timeoutMs,
    },
    legacyOffer: summary.legacyOffer,
    shadowOffer: summary.shadowOffer,
    sameOffer: summary.sameOffer,
    structured: summary,
  };
}

/**
 * @param {Record<string, unknown>|null} payload
 * @param {Record<string, unknown>} trace
 */
export function attachCommercialShadowDiagnosticSummary(payload = null, trace = {}) {
  return buildCommercialShadowDiagnosticReport({ payload, trace });
}
