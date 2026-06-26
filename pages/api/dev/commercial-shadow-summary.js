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

function isDevEndpointAllowed(req) {
  if (process.env.NODE_ENV !== "production") return true;

  const secret = String(process.env.DEV_API_SECRET || "").trim();
  if (!secret) return false;

  const provided = String(
    req.headers["x-dev-api-secret"] || req.query.secret || ""
  ).trim();

  return provided === secret;
}

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

  try {
    const legacyResult = await fetchGoogleShoppingLegacyResult(query, 5);
    const legacyProduct = legacyResult.products?.[0] || null;
    const legacyOffer = normalizeLegacyCommercialOfferForShadow(legacyProduct);

    const shadowExecution = await executeCommercialRuntimeShadow({
      query,
      winner: legacyProduct,
      legacyOffer: legacyProduct,
      force: true,
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
