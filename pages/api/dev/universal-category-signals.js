/**
 * PATCH Comercial 4E-B.9 — DEV endpoint: Universal Category Signal Library
 *
 * Não usado pela MIA em produção. Bloqueado em production sem DEV_API_SECRET.
 */

import {
  GOVERNED_FALLBACK_PAYLOAD_BUILDER_VERSION,
  buildGovernedFallbackPayload,
  buildGovernedFallbackPayloadDevPayload,
} from "../../../lib/commercial/governedFallbackPayloadBuilder.js";
import {
  UNIVERSAL_GOVERNED_FALLBACK_REASONING_VERSION,
  buildUniversalGovernedFallbackReasoning,
} from "../../../lib/commercial/universalGovernedFallbackReasoning.js";
import {
  UNIVERSAL_CATEGORY_SIGNAL_LIBRARY_VERSION,
  buildUniversalCategorySignalDevPayload,
  buildUniversalCategorySignals,
} from "../../../lib/commercial/universalCategorySignalLibrary.js";
import {
  buildCommercialFallbackPipelineDevPayload,
} from "../../../lib/commercial/commercialFallbackProductionPipeline.js";

function isDevEndpointAllowed(req) {
  if (process.env.NODE_ENV !== "production") return true;

  const secret = String(process.env.DEV_API_SECRET || "").trim();
  if (!secret) return false;

  const provided = String(
    req.headers["x-dev-api-secret"] || req.query.secret || ""
  ).trim();

  return provided === secret;
}

function offer(name) {
  return {
    product_name: name,
    price: "R$ 149,00",
    link: `https://shop.test/${encodeURIComponent(name)}`,
    thumbnail: "https://shop.test/img.jpg",
    source: "Google Shopping",
  };
}

function dataLayerProduct(name) {
  return {
    product_name: name,
    isDataLayerProduct: true,
    trustedSpecs: {
      official_name: name,
      strengths: ["desempenho estável"],
      ideal_for: ["uso diário"],
    },
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  if (!isDevEndpointAllowed(req)) {
    res.status(403).json({ ok: false, error: "forbidden_in_production" });
    return;
  }

  const query = String(req.query.q || "").trim();
  const selected = String(req.query.selected || req.query.compatible || "").trim();
  const upstream = String(req.query.legacy || req.query.cognitiveWinner || "").trim();
  const useDataLayer = String(req.query.dataLayer || "").trim() === "1";

  if (!query) {
    res.status(400).json({
      ok: false,
      error: "missing_query",
      hint: "Use ?q=pelicula%20iphone%2013&selected=Pel%C3%ADcula%20iPhone%2013&legacy=iPhone%2013",
      version: UNIVERSAL_CATEGORY_SIGNAL_LIBRARY_VERSION,
    });
    return;
  }

  const payload = buildGovernedFallbackPayload({
    query,
    selectedProduct: useDataLayer
      ? dataLayerProduct(selected || query)
      : offer(selected || "Produto selecionado"),
    hasDataLayer: useDataLayer,
    cognitiveWinnerProduct: upstream ? offer(upstream) : null,
    responsePath: useDataLayer ? "return_seguro" : "commercial_only_fallback",
  });
  const reasoning = buildUniversalGovernedFallbackReasoning(payload);
  const signals = buildUniversalCategorySignals({
    query,
    governedFallbackPayload: payload,
    universalGovernedFallbackReasoning: reasoning,
  });

  res.status(200).json({
    ok: true,
    version: UNIVERSAL_CATEGORY_SIGNAL_LIBRARY_VERSION,
    payloadVersion: GOVERNED_FALLBACK_PAYLOAD_BUILDER_VERSION,
    reasoningVersion: UNIVERSAL_GOVERNED_FALLBACK_REASONING_VERSION,
    inputs: { query, selected, upstream, useDataLayer },
    payload: buildGovernedFallbackPayloadDevPayload(payload),
    reasoning,
    universalCategorySignals: buildUniversalCategorySignalDevPayload(signals),
    pipeline: buildCommercialFallbackPipelineDevPayload({
      payload,
      reasoning,
      signals,
    }),
  });
  return;
}
