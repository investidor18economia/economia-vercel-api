/**
 * PATCH Comercial 4E-B.8 — DEV endpoint: Universal Fallback Prompt Contract
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
  UNIVERSAL_FALLBACK_PROMPT_CONTRACT_VERSION,
  buildUniversalFallbackPromptContractDevPayload,
  resolveUniversalFallbackPromptContractVerbalization,
  replyFocusesOnSelectedCommercialItem,
  replyViolatesUniversalFallbackPromptContract,
} from "../../../lib/commercial/universalFallbackPromptContract.js";
import {
  buildUniversalCategorySignals,
} from "../../../lib/commercial/universalCategorySignalLibrary.js";
import {
  buildCommercialFallbackPipelineDevPayload,
} from "../../../lib/commercial/commercialFallbackProductionPipeline.js";
import {
  resolveAndApplyCommercialRuntimeActivation,
} from "../../../lib/productSourceAdapter/commercialRuntimeActivation.js";
import { getCommercialRuntimeMode } from "../../../lib/productSourceAdapter/commercialRuntimeMode.js";
import { COMMERCIAL_PROVIDER_IDS } from "../../../lib/productSourceAdapter/commercialProviderRegistry.js";

function isDevEndpointAllowed(req) {
  if (process.env.NODE_ENV !== "production") return true;

  const secret = String(process.env.DEV_API_SECRET || "").trim();
  if (!secret) return false;

  const provided = String(
    req.headers["x-dev-api-secret"] || req.query.secret || ""
  ).trim();

  return provided === secret;
}

function legacyProduct(name, extra = {}) {
  return {
    product_name: name,
    price: extra.price ?? "R$ 100,00",
    link: extra.link ?? `https://shop.test/${encodeURIComponent(name)}`,
    thumbnail: extra.thumbnail ?? "https://shop.test/img.jpg",
    source: extra.source ?? "Google Shopping",
  };
}

function googleProduct(title) {
  return {
    product_name: title,
    price: "R$ 49,90",
    link: `https://shop.test/${encodeURIComponent(title)}`,
    thumbnail: "https://shop.test/img.jpg",
    source: "Google Shopping",
  };
}

function apifyProduct(title) {
  return {
    title,
    price: 49.9,
    url: `https://mercadolivre.test/${encodeURIComponent(title)}`,
    image: "https://shop.test/ml.jpg",
    source: COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE,
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
    res.status(403).json({
      ok: false,
      error: "forbidden_in_production",
    });
    return;
  }

  const query = String(req.query.q || "").trim();
  const mode = getCommercialRuntimeMode(req.query.mode || "controlled");
  const legacyTitle = String(req.query.legacy || "").trim();
  const compatibleTitle = String(req.query.compatible || "").trim();
  const cognitiveWinnerTitle = String(req.query.cognitiveWinner || legacyTitle).trim();
  const useDataLayer = String(req.query.dataLayer || "").trim() === "1";

  if (!query) {
    res.status(400).json({
      ok: false,
      error: "missing_query",
      hint: "Use ?q=pelicula%20iphone%2013&legacy=iPhone%2013&compatible=Pel%C3%ADcula%20iPhone%2013",
      version: UNIVERSAL_FALLBACK_PROMPT_CONTRACT_VERSION,
    });
    return;
  }

  let payload;
  if (useDataLayer) {
    payload = buildGovernedFallbackPayload({
      query,
      selectedProduct: dataLayerProduct(legacyTitle || query),
      hasDataLayer: true,
      responsePath: "return_seguro",
    });
  } else {
    const legacyOffer = legacyProduct(legacyTitle || "Produto legado");
    const cognitiveWinner = legacyProduct(cognitiveWinnerTitle || legacyTitle || "Produto legado");

    const applied = await resolveAndApplyCommercialRuntimeActivation({
      query,
      prices: [legacyOffer],
      winnerProduct: cognitiveWinner,
      mode,
      fetchGoogle: async () => ({
        ok: true,
        products: [
          googleProduct(legacyTitle || legacyOffer.product_name),
          ...(compatibleTitle ? [googleProduct(compatibleTitle)] : []),
        ],
      }),
      fetchApify: async () => ({
        ok: true,
        products: [apifyProduct(legacyTitle || legacyOffer.product_name)],
      }),
    });

    payload = buildGovernedFallbackPayload({
      query,
      selectedProduct: applied.prices?.[0] || legacyOffer,
      hasDataLayer: false,
      categoryHint: String(req.query.category || "").trim() || null,
      responsePath: "commercial_only_fallback",
      commercialRuntimeActivation: applied.activation || null,
      cognitiveWinnerProduct: cognitiveWinner,
      relatedProductRole: "cognitive_context_reference",
      relatedProductSource: "ranked_products_or_lock",
    });
  }

  const reasoning = buildUniversalGovernedFallbackReasoning(payload);
  const signals = buildUniversalCategorySignals({
    query,
    governedFallbackPayload: payload,
    universalGovernedFallbackReasoning: reasoning,
  });
  const resolved = resolveUniversalFallbackPromptContractVerbalization({
    query,
    governedFallbackPayload: payload,
    universalGovernedFallbackReasoning: reasoning,
  });

  res.status(200).json({
    ok: true,
    version: UNIVERSAL_FALLBACK_PROMPT_CONTRACT_VERSION,
    payloadVersion: GOVERNED_FALLBACK_PAYLOAD_BUILDER_VERSION,
    reasoningVersion: UNIVERSAL_GOVERNED_FALLBACK_REASONING_VERSION,
    mode,
    payload: buildGovernedFallbackPayloadDevPayload(payload),
    reasoning,
    contract: buildUniversalFallbackPromptContractDevPayload(resolved.contract),
    verbalization: {
      applied: resolved.applied === true,
      reply: resolved.reply,
      focusesOnSelected: replyFocusesOnSelectedCommercialItem(
        resolved.reply,
        resolved.contract?.verbalizationTarget?.productName
      ),
      violatesContract: replyViolatesUniversalFallbackPromptContract(
        resolved.reply,
        resolved.contract
      ),
    },
    pipeline: buildCommercialFallbackPipelineDevPayload({
      payload,
      reasoning,
      signals,
      contract: resolved.contract,
    }),
  });
  return;
}
