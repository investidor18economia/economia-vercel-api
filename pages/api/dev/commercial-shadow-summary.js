/**
 * PATCH Comercial 4E-A.1 — DEV endpoint: Commercial Shadow Diagnostic Summary
 *
 * Não usado pela MIA. Bloqueado em production sem DEV_API_SECRET.
 */

import { fetchGoogleShoppingLegacyResult } from "../../../lib/productSourceAdapter/adapters/googleShoppingAdapter.js";
import {
  COMMERCIAL_RUNTIME_SHADOW_VERSION,
  executeCommercialRuntimeShadow,
  normalizeLegacyCommercialOfferForShadow,
} from "../../../lib/productSourceAdapter/commercialRuntimeShadow.js";
import {
  COMMERCIAL_SHADOW_DIAGNOSTIC_SUMMARY_VERSION,
  buildCommercialShadowDiagnosticReport,
} from "../../../lib/productSourceAdapter/commercialShadowDiagnosticSummary.js";
import {
  isDevEndpointAllowed,
  resolveDevCommercialEndpointGuard,
} from "../../../lib/commercial/devCommercialCostGuard.js";
import { COMMERCIAL_PROVIDER_IDS } from "../../../lib/productSourceAdapter/commercialProviderRegistry.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  if (!isDevEndpointAllowed(req)) {
    return res.status(403).json({
      ok: false,
      error: "forbidden_in_production",
    });
  }

  const query = String(req.query.q || "").trim();
  if (!query) {
    return res.status(400).json({
      ok: false,
      error: "missing_query",
      hint: "Use ?q=termo",
      shadowVersion: COMMERCIAL_RUNTIME_SHADOW_VERSION,
      summaryVersion: COMMERCIAL_SHADOW_DIAGNOSTIC_SUMMARY_VERSION,
    });
  }

  const endpointGuard = resolveDevCommercialEndpointGuard(req, {
    invocationSource: "dev_commercial_shadow_summary",
    providerId: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
    endpoint: "commercial-shadow-summary",
    plannedRequest: { query, limit: 5 },
    endpointLevelDryRun: true,
  });

  if (endpointGuard.blocked) {
    return res.status(endpointGuard.statusCode).json(endpointGuard.body);
  }

  if (endpointGuard.shouldReturnDryRunResponse) {
    return res.status(200).json({
      ...endpointGuard.body,
      shadowVersion: COMMERCIAL_RUNTIME_SHADOW_VERSION,
      summaryVersion: COMMERCIAL_SHADOW_DIAGNOSTIC_SUMMARY_VERSION,
      query,
      shadowPipelineSkipped: true,
      summary: null,
      legacyOffer: null,
      shadowOffer: null,
      sameOffer: false,
    });
  }

  try {
    const costGuardContext = endpointGuard.costGuardContext;
    const legacyResult = await fetchGoogleShoppingLegacyResult(query, 5, { costGuardContext });
    const legacyProduct = legacyResult.products?.[0] || null;
    const legacyOffer = normalizeLegacyCommercialOfferForShadow(legacyProduct);

    const shadowExecution = await executeCommercialRuntimeShadow({
      query,
      winner: legacyProduct,
      legacyOffer: legacyProduct,
      force: true,
      costGuardContext,
    });

    const report = buildCommercialShadowDiagnosticReport({
      shadowExecution,
      winner: legacyProduct,
      legacyOffer,
    });

    return res.status(200).json({
      ok: true,
      shadowVersion: COMMERCIAL_RUNTIME_SHADOW_VERSION,
      summaryVersion: COMMERCIAL_SHADOW_DIAGNOSTIC_SUMMARY_VERSION,
      query,
      accessoryIntent: {
        enabled: report.accessoryIntent?.enabled === true,
        isAccessoryIntent: report.accessoryIntent?.isAccessoryIntent === true,
        matchedSignals: report.accessoryIntent?.matchedSignals || [],
      },
      knowledgeSource: {
        type: report.knowledgeSource?.type || report.knowledgeMetadata?.knowledgeSource || "governed_fallback",
        isAudited: report.knowledgeSource?.isAudited === true,
        transparencyRequired: report.knowledgeSource?.transparencyRequired === true,
      },
      summary: report.summary,
      diagnostics: report.diagnostics,
      providerResults: report.providerResults,
      selection: report.selection,
      pipeline: report.pipeline,
      timings: report.timings,
      reasonLines: report.reasonLines,
      legacyOffer: report.legacyOffer,
      shadowOffer: report.shadowOffer,
      sameOffer: report.sameOffer,
      structured: report.structured,
      legacyProviderResult: {
        ok: legacyResult.ok,
        count: legacyResult.products?.length || 0,
        error: legacyResult.error || null,
      },
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "commercial_shadow_summary_dev_error",
      message: String(err?.message || "summary_error").slice(0, 120),
      shadowVersion: COMMERCIAL_RUNTIME_SHADOW_VERSION,
      summaryVersion: COMMERCIAL_SHADOW_DIAGNOSTIC_SUMMARY_VERSION,
    });
  }
}
