/**
 * PATCH Comercial 4E-B.6-AUDIT — Accessory Query Runtime Path Audit
 *
 * Mapeia o caminho completo de queries de acessório no runtime controlled.
 * Audit-only — não altera Decision Engine, Router, runtime ou UI.
 */

import { detectAccessoryIntent } from "./accessoryIntentLockGuard.js";
import { buildCommercialKnowledgeMetadata } from "./nonDataLayerCommercialResponseGuard.js";
import {
  filterDataLayerCandidatesForCommercialFallback,
} from "./nonDataLayerFallbackCandidateIsolation.js";
import {
  bootstrapSpecificProductLock,
} from "../miaSpecificProductResolutionLock.js";
import {
  buildAccessoryCommercialRuntimeDiagnostics,
  enforceAccessoryCommercialRuntimeSelection,
  isOfferCompatibleWithAccessoryIntent,
} from "../productSourceAdapter/accessoryCommercialRuntimeEnforcement.js";
import {
  buildCommercialRuntimeActivationDiagnostics,
  mapLegacyProductToCardShape,
  resolveAndApplyCommercialRuntimeActivation,
  resolveOfficialCommercialOffer,
} from "../productSourceAdapter/commercialRuntimeActivation.js";
import {
  getCommercialRuntimeMode,
  isCommercialRuntimeControlled,
} from "../productSourceAdapter/commercialRuntimeMode.js";
import { COMMERCIAL_PROVIDER_IDS } from "../productSourceAdapter/commercialProviderRegistry.js";
import { calculateCommercialAlignment } from "../productSourceAdapter/commercialQueryProductAlignmentLayer.js";
import { resolveOfferCardPresentationWithTrustLabels } from "../miaCommercialCardTrustLabels.js";
import {
  buildAccessoryWinnerPropagationDiagnostics,
  sanitizeAccessoryCommercialPayload,
} from "./accessoryCognitiveWinnerPropagationGuard.js";

export const ACCESSORY_QUERY_RUNTIME_PATH_AUDIT_VERSION = "4E-B.6-AUDIT";

const FAILURE_STAGES = Object.freeze([
  "accessory_intent_detection",
  "specific_product_lock",
  "data_layer_candidates",
  "cognitive_winner",
  "commercial_runtime_activation",
  "accessory_runtime_enforcement",
  "card_mapping",
  "response_builder",
  "none",
]);

function cleanText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function productName(value = "") {
  return cleanText(
    typeof value === "string"
      ? value
      : value?.product_name || value?.title || value?.official_name || ""
  );
}

function googleProduct(title, extra = {}) {
  return {
    product_name: title,
    price: Object.hasOwn(extra, "price") ? extra.price : "R$ 49,90",
    link: extra.url ?? extra.link ?? `https://shop.test/${encodeURIComponent(title)}`,
    thumbnail: extra.image ?? "https://shop.test/img.jpg",
    source: "Google Shopping",
  };
}

function apifyProduct(title, extra = {}) {
  return {
    title,
    price: Object.hasOwn(extra, "price") ? extra.price : 49.9,
    url: extra.url ?? extra.link ?? `https://mercadolivre.test/${encodeURIComponent(title)}`,
    image: extra.image ?? "https://shop.test/ml.jpg",
    source: COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE,
  };
}

function dataLayerCandidate(name, extra = {}) {
  return {
    product_name: name,
    category: extra.category || "phone",
    isDataLayerProduct: true,
    trustedSpecs: {
      official_name: name,
      strengths: ["desempenho estável"],
      ideal_for: ["uso diário"],
    },
    dataLayerScore: extra.dataLayerScore ?? 850,
  };
}

function legacyWinner(name, extra = {}) {
  return {
    product_name: name,
    price: extra.price ?? "R$ 3.499,00",
    link: extra.link ?? `https://legacy.test/${encodeURIComponent(name)}`,
    thumbnail: extra.thumbnail ?? "https://legacy.test/img.jpg",
    source: extra.source ?? "Google Shopping",
  };
}

/**
 * Perfis realistas baseados em falhas manuais observadas — simulação auditável.
 * @param {string} query
 */
export function getAccessoryQueryRuntimeFixture(query = "") {
  const q = cleanText(query).toLowerCase();

  if (/pelicula iphone 13|capa iphone 13|case iphone 13/.test(q)) {
    const main = "iPhone 13";
    const compatible = /pelicula|case/.test(q)
      ? (/pelicula/.test(q) ? "Película vidro iPhone 13" : "Capa silicone iPhone 13")
      : "Capa iPhone 13";
    return {
      dataLayerCandidates: [dataLayerCandidate(main)],
      rankedProducts: [legacyWinner(main), legacyWinner(compatible, { price: "R$ 29,90" })],
      pipelineMainOffer: main,
      pipelineCompatibleOffer: compatible,
      expectedFailureCard: main,
      responseSample: `O ${main} é uma boa escolha para quem busca desempenho estável.`,
    };
  }

  if (/controle ps5/.test(q)) {
    const main = "PlayStation 5 Console";
    return {
      dataLayerCandidates: [dataLayerCandidate(main, { category: "console" })],
      rankedProducts: [legacyWinner(main), legacyWinner("Controle DualSense PS5", { price: "R$ 399,00" })],
      pipelineMainOffer: main,
      pipelineCompatibleOffer: "Controle DualSense PS5",
      expectedFailureCard: main,
      responseSample: `O ${main} entrega a experiência completa de console.`,
    };
  }

  if (/controle remoto samsung/.test(q)) {
    const main = "TV Samsung 55";
    return {
      dataLayerCandidates: [dataLayerCandidate(main, { category: "tv" })],
      rankedProducts: [legacyWinner(main), legacyWinner("Controle remoto Samsung Smart TV", { price: "R$ 89,00" })],
      pipelineMainOffer: main,
      pipelineCompatibleOffer: "Controle remoto Samsung Smart TV",
      expectedFailureCard: main,
      responseSample: `A ${main} combina bem com salas amplas.`,
    };
  }

  if (/cabo hdmi/.test(q)) {
    const main = "Notebook Lenovo IdeaPad";
    return {
      dataLayerCandidates: [dataLayerCandidate(main, { category: "notebook" })],
      rankedProducts: [legacyWinner(main), legacyWinner("Cabo HDMI 2m", { price: "R$ 39,90" })],
      pipelineMainOffer: main,
      pipelineCompatibleOffer: "Cabo HDMI 2m",
      expectedFailureCard: main,
      responseSample: `O ${main} atende bem uso diário.`,
    };
  }

  if (/carregador notebook lenovo/.test(q)) {
    const main = "Notebook Lenovo IdeaPad";
    return {
      dataLayerCandidates: [dataLayerCandidate(main, { category: "notebook" })],
      rankedProducts: [legacyWinner(main), legacyWinner("Carregador notebook Lenovo 65W", { price: "R$ 129,00" })],
      pipelineMainOffer: main,
      pipelineCompatibleOffer: "Carregador notebook Lenovo 65W",
      expectedFailureCard: main,
      responseSample: `O ${main} é uma opção sólida para produtividade.`,
    };
  }

  if (/suporte monitor/.test(q)) {
    const main = "Monitor Gamer 27";
    return {
      dataLayerCandidates: [dataLayerCandidate(main, { category: "monitor" })],
      rankedProducts: [legacyWinner(main), legacyWinner("Suporte articulado monitor", { price: "R$ 199,00" })],
      pipelineMainOffer: main,
      pipelineCompatibleOffer: "Suporte articulado monitor",
      expectedFailureCard: main,
      responseSample: `O ${main} entrega boa fluidez para jogos.`,
    };
  }

  if (/dock notebook/.test(q)) {
    const main = "Notebook Lenovo IdeaPad";
    return {
      dataLayerCandidates: [dataLayerCandidate(main, { category: "notebook" })],
      rankedProducts: [legacyWinner(main), legacyWinner("Dock station notebook USB-C", { price: "R$ 349,00" })],
      pipelineMainOffer: main,
      pipelineCompatibleOffer: "Dock station notebook USB-C",
      expectedFailureCard: main,
      responseSample: `O ${main} cobre bem uso híbrido.`,
    };
  }

  if (/fonte pc gamer/.test(q)) {
    const main = "PC Gamer RTX 4060";
    return {
      dataLayerCandidates: [dataLayerCandidate(main, { category: "computer" })],
      rankedProducts: [legacyWinner(main), legacyWinner("Fonte PC Gamer 650W", { price: "R$ 499,00" })],
      pipelineMainOffer: main,
      pipelineCompatibleOffer: "Fonte PC Gamer 650W",
      expectedFailureCard: main,
      responseSample: `O ${main} roda bem títulos atuais.`,
    };
  }

  if (/mousepad gamer|headset gamer/.test(q)) {
    const main = /headset/.test(q) ? "PC Gamer RTX 4060" : "Mouse Gamer Pro";
    const compatible = /headset/.test(q) ? "Headset Gamer 7.1" : "Mousepad Gamer XL";
    return {
      dataLayerCandidates: [],
      rankedProducts: [legacyWinner(main), legacyWinner(compatible, { price: "R$ 149,00" })],
      pipelineMainOffer: main,
      pipelineCompatibleOffer: compatible,
      expectedFailureCard: main,
      responseSample: `O ${main} combina com setup gamer.`,
    };
  }

  if (/pelicula galaxy a55/.test(q)) {
    const main = "Samsung Galaxy A55";
    return {
      dataLayerCandidates: [dataLayerCandidate(main)],
      rankedProducts: [legacyWinner(main), legacyWinner("Película Galaxy A55", { price: "R$ 39,90" })],
      pipelineMainOffer: main,
      pipelineCompatibleOffer: "Película Galaxy A55",
      expectedFailureCard: main,
      responseSample: `O ${main} equilibra tela e bateria.`,
    };
  }

  if (/^iphone 13$/.test(q)) {
    const main = "iPhone 13";
    return {
      dataLayerCandidates: [dataLayerCandidate(main)],
      rankedProducts: [legacyWinner(main)],
      pipelineMainOffer: main,
      pipelineCompatibleOffer: main,
      isMainProductQuery: true,
      responseSample: `O ${main} continua sendo referência sólida.`,
    };
  }

  if (/galaxy a55/.test(q)) {
    const main = "Samsung Galaxy A55";
    return {
      dataLayerCandidates: [dataLayerCandidate(main)],
      rankedProducts: [legacyWinner(main)],
      pipelineMainOffer: main,
      pipelineCompatibleOffer: main,
      isMainProductQuery: true,
      responseSample: `O ${main} entrega boa relação tela/bateria.`,
    };
  }

  if (/^ps5$/.test(q)) {
    const main = "PlayStation 5 Console";
    return {
      dataLayerCandidates: [dataLayerCandidate(main, { category: "console" })],
      rankedProducts: [legacyWinner(main)],
      pipelineMainOffer: main,
      pipelineCompatibleOffer: main,
      isMainProductQuery: true,
      responseSample: `O ${main} segue como console forte.`,
    };
  }

  if (/notebook lenovo/.test(q) && !/carregador|dock/.test(q)) {
    const main = "Notebook Lenovo IdeaPad";
    return {
      dataLayerCandidates: [dataLayerCandidate(main, { category: "notebook" })],
      rankedProducts: [legacyWinner(main)],
      pipelineMainOffer: main,
      pipelineCompatibleOffer: main,
      isMainProductQuery: true,
      responseSample: `O ${main} atende produtividade.`,
    };
  }

  if (/monitor gamer/.test(q)) {
    const main = "Monitor Gamer 27";
    return {
      dataLayerCandidates: [dataLayerCandidate(main, { category: "monitor" })],
      rankedProducts: [legacyWinner(main)],
      pipelineMainOffer: main,
      pipelineCompatibleOffer: main,
      isMainProductQuery: true,
      responseSample: `O ${main} entrega boa taxa de atualização.`,
    };
  }

  if (/tv samsung/.test(q)) {
    const main = "TV Samsung 55 4K";
    return {
      dataLayerCandidates: [dataLayerCandidate("Samsung Galaxy S23 FE", { category: "phone" })],
      rankedProducts: [legacyWinner(main)],
      pipelineMainOffer: main,
      pipelineCompatibleOffer: main,
      isMainProductQuery: true,
      responseSample: `A ${main} combina imagem e smart features.`,
    };
  }

  if (/cadeira gamer/.test(q)) {
    const main = "Cadeira Gamer Ergonômica";
    return {
      dataLayerCandidates: [dataLayerCandidate("Notebook Lenovo IdeaPad", { category: "notebook" })],
      rankedProducts: [legacyWinner(main)],
      pipelineMainOffer: main,
      pipelineCompatibleOffer: main,
      isMainProductQuery: true,
      responseSample: `A ${main} ajuda em longas sessões.`,
    };
  }

  return {
    dataLayerCandidates: [],
    rankedProducts: [legacyWinner("Produto Genérico")],
    pipelineMainOffer: "Produto Genérico",
    pipelineCompatibleOffer: "Produto Genérico",
    responseSample: "Resposta genérica.",
  };
}

function mockFailureProviders(mainTitle, compatibleTitle = null) {
  const main = apifyProduct(mainTitle);
  const compatible = compatibleTitle ? googleProduct(compatibleTitle) : null;
  return {
    fetchGoogle: async () => ({
      ok: true,
      products: compatible ? [googleProduct(mainTitle), googleProduct(compatibleTitle)] : [googleProduct(mainTitle)],
    }),
    fetchApify: async () => ({
      ok: true,
      products: [main],
    }),
  };
}

function buildCardSnapshot(price = null, knowledgeMetadata = null) {
  if (!price) {
    return {
      productName: null,
      title: null,
      price: null,
      source: null,
      provider: null,
      hasUrl: false,
      hasImage: false,
      trustLabelMode: null,
    };
  }

  const presentation = resolveOfferCardPresentationWithTrustLabels(price, knowledgeMetadata);
  return {
    productName: productName(price),
    title: productName(price),
    price: price.price ?? null,
    source: price.source ?? null,
    provider: price.provider ?? price.commercialProvider ?? null,
    hasUrl: !!cleanText(price.link),
    hasImage: !!cleanText(price.thumbnail),
    trustLabelMode: presentation.trustLabelMode || null,
    badge: presentation.badge || null,
  };
}

function analyzeResponseText(query, text = "", cardName = "") {
  const accessory = detectAccessoryIntent(query);
  const normalized = cleanText(text).toLowerCase();
  const card = cleanText(cardName).toLowerCase();

  const textMentionsAccessory = accessory.matchedSignals.some((signal) =>
    normalized.includes(String(signal).replace(/_/g, " "))
  );
  const textMentionsProductPrincipal =
    !!card &&
    normalized.includes(card) &&
    accessory.isAccessoryIntent &&
    !isOfferCompatibleWithAccessoryIntent({ query, offer: { title: cardName } });

  return {
    responsePath: null,
    textMentionsProductPrincipal,
    textMentionsAccessory,
    transparencyRequired: null,
    sample: cleanText(text).slice(0, 180),
  };
}

/**
 * @param {Record<string, unknown>} report
 */
export function evaluateAccessoryRuntimePathVerdict(report = {}) {
  const query = cleanText(report.query || "");
  const accessoryIntent = report.accessoryIntent || {};
  const isAccessory = accessoryIntent.isAccessoryIntent === true;
  const isMainProductQuery = report.fixture?.isMainProductQuery === true;
  const cardName = productName(report.card || {});

  if (isMainProductQuery) {
    const wronglyBlocked =
      report.dataLayer?.isolationApplied === true &&
      (report.dataLayer?.candidatesAfterIsolation || []).length === 0 &&
      (report.dataLayer?.candidatesBeforeIsolation || []).length > 0 &&
      /iphone|galaxy|ps5|notebook|monitor|cadeira|tv/i.test(query);

    const passed =
      !isAccessory &&
      (!cardName || isOfferCompatibleWithAccessoryIntent({ query, offer: { title: cardName } }) || !accessoryIntent.isAccessoryIntent);

    return {
      passed,
      failureStage: wronglyBlocked ? "data_layer_candidates" : "none",
      failureReason: wronglyBlocked
        ? "Isolamento indevido bloqueou produto principal auditado"
        : null,
      severity: wronglyBlocked ? "high" : "none",
      recommendedPatch: wronglyBlocked ? "4E-B.3 isolation refinement" : null,
    };
  }

  if (!isAccessory) {
    return {
      passed: false,
      failureStage: "accessory_intent_detection",
      failureReason: "Query esperada como acessório não foi detectada",
      severity: "critical",
      recommendedPatch: "4E-A.2 accessory intent guard",
    };
  }

  const cardCompatible =
    !cardName || isOfferCompatibleWithAccessoryIntent({ query, offer: { title: cardName } });
  const cardEmpty = !cardName;
  const enforcement = report.accessoryRuntimeEnforcement || {};
  const runtime = report.commercialRuntime || {};
  const cognitiveWinner = productName(report.cognitiveWinner?.winnerProduct || "");
  const lock = report.specificProductLock || {};
  const dataLayer = report.dataLayer || {};

  if (cardCompatible || cardEmpty) {
    return {
      passed: true,
      failureStage: "none",
      failureReason: cardEmpty ? "Sem oferta específica — fallback seguro" : "Card compatível com acessório",
      severity: "none",
      recommendedPatch: null,
    };
  }

  let failureStage = "card_mapping";
  let failureReason = `Card final "${cardName}" é produto principal incompatível`;
  let recommendedPatch = "4E-B.6 corrective patch — card mapping / winner propagation";

  if (lock.active && cognitiveWinner && !isOfferCompatibleWithAccessoryIntent({ query, offer: { title: cognitiveWinner } })) {
    failureStage = "specific_product_lock";
    failureReason = `Specific Product Lock ativo travou produto principal (${cognitiveWinner})`;
    recommendedPatch = "4E-A.2 / lock integration — accessory bypass incomplete";
  } else if (
    dataLayer.candidatesAfterIsolation?.length > 0 &&
    dataLayer.candidatesAfterIsolation.some(
      (c) => !isOfferCompatibleWithAccessoryIntent({ query, offer: { title: productName(c) } })
    )
  ) {
    failureStage = "data_layer_candidates";
    failureReason = "Candidatos Data Layer incompatíveis sobreviveram ao isolamento";
    recommendedPatch = "4E-B.3 isolation — accessory-aware filtering";
  } else if (
    cognitiveWinner &&
    !isOfferCompatibleWithAccessoryIntent({ query, offer: { title: cognitiveWinner } })
  ) {
    failureStage = "cognitive_winner";
    failureReason = `Winner cognitivo "${cognitiveWinner}" contaminou o card/resposta`;
    recommendedPatch = "4E-B.6 — block main-product winner for accessory queries before card";
  } else if (!runtime.enforcementWouldRun) {
    failureStage = "commercial_runtime_activation";
    failureReason = `Runtime mode "${runtime.mode}" não executa enforcement comercial de acessório`;
    recommendedPatch = "4E-B.1 — extend accessory enforcement beyond controlled-only path";
  } else if (!enforcement.active || !enforcement.blockedIncompatibleOffer) {
    failureStage = "accessory_runtime_enforcement";
    failureReason = "Accessory runtime enforcement não bloqueou oferta principal";
    recommendedPatch = "4E-B.1 accessoryCommercialRuntimeEnforcement integration";
  } else if (runtime.fallbackToLegacy && runtime.usedNewPipeline === false) {
    failureStage = "commercial_runtime_activation";
    failureReason = `Fallback legacy aplicou oferta principal (${runtime.fallbackReason || "unknown"})`;
    recommendedPatch = "4E-B.1 — suppress legacy fallback for incompatible accessory queries";
  } else if (report.response?.textMentionsProductPrincipal) {
    failureStage = "response_builder";
    failureReason = "Resposta verbaliza produto principal como se fosse o acessório";
    recommendedPatch = "Response builder / winner propagation audit (outside commercial runtime)";
  }

  return {
    passed: false,
    failureStage,
    failureReason,
    severity: "critical",
    recommendedPatch,
  };
}

/**
 * @param {{
 *   query?: string,
 *   mode?: string,
 *   routing?: Record<string, unknown>,
 *   fixture?: Record<string, unknown>,
 * }} input
 */
export async function auditAccessoryQueryRuntimePath(input = {}) {
  const query = cleanText(input.query || "");
  const fixture = input.fixture || getAccessoryQueryRuntimeFixture(query);
  const mode = input.mode || getCommercialRuntimeMode() || "controlled";
  const accessoryIntent = detectAccessoryIntent(query);

  const lock = bootstrapSpecificProductLock({
    query,
    products: fixture.rankedProducts || [],
  });

  const dlBefore = Array.isArray(fixture.dataLayerCandidates) ? fixture.dataLayerCandidates : [];
  const isolation = filterDataLayerCandidatesForCommercialFallback({
    query,
    candidates: dlBefore,
  });
  const dlAfter = isolation.candidates || [];

  const cognitiveWinnerProduct =
    (lock.active && lock.lockedProduct) ||
    fixture.rankedProducts?.[0] ||
    null;

  const legacyCardProduct = legacyWinner(
    productName(cognitiveWinnerProduct || fixture.pipelineMainOffer)
  );

  const pipelineMocks = mockFailureProviders(
    fixture.pipelineMainOffer,
    fixture.pipelineCompatibleOffer
  );

  const activation = await resolveOfficialCommercialOffer({
    query,
    legacyOffer: legacyCardProduct,
    winnerProduct: legacyCardProduct,
    mode: isCommercialRuntimeControlled(mode) ? "controlled" : mode,
    ...pipelineMocks,
  });

  const applied = await resolveAndApplyCommercialRuntimeActivation({
    query,
    prices: [legacyCardProduct],
    winnerProduct: legacyCardProduct,
    mode: isCommercialRuntimeControlled(mode) ? "controlled" : mode,
    ...pipelineMocks,
  });

  const enforcementPreview = enforceAccessoryCommercialRuntimeSelection({
    query,
    selectedOffer: activation.newPipelineOffer || {
      title: fixture.pipelineMainOffer,
      url: legacyCardProduct.link,
      price: legacyCardProduct.price,
    },
    alternativeOffers: activation.pipelineResult?.alternativeOffers || [],
    candidateOffers: activation.pipelineResult?.trace?.dedupe?.offers || [],
    legacyOffer: legacyCardProduct,
  });

  const selectedOfferTitle = productName(
    activation.accessoryEnforcement?.selectedOfferAfter ||
      enforcementPreview.selectedOfferAfter ||
      activation.officialOffer
  );

  const propagation = sanitizeAccessoryCommercialPayload({
    query,
    winnerProduct: cognitiveWinnerProduct,
    prices: applied.prices || [],
    selectedOfferTitle,
    rankedCandidates: fixture.rankedProducts || [],
    reply: input.responseText || fixture.responseSample || "",
    responsePath: input.routing?.responsePath || "commercial_only_fallback",
  });

  const finalCardProduct =
    propagation.prices?.[0] ||
    mapLegacyProductToCardShape(activation.officialOffer) ||
    null;

  const knowledgeMetadata = buildCommercialKnowledgeMetadata({
    product: {
      product_name: productName(finalCardProduct || cognitiveWinnerProduct),
      trustedSpecs: cognitiveWinnerProduct?.trustedSpecs || null,
    },
    hasDataLayer: dlAfter.length > 0,
  });

  const card = buildCardSnapshot(finalCardProduct, knowledgeMetadata);
  const response = analyzeResponseText(
    query,
    propagation.reply || input.responseText || fixture.responseSample || "",
    card.productName || ""
  );
  response.transparencyRequired = knowledgeMetadata.transparencyRequired === true;
  response.responsePath = input.routing?.responsePath || null;

  const alignment = calculateCommercialAlignment({
    query,
    offer: { title: card.productName || "" },
  });

  const report = {
    version: ACCESSORY_QUERY_RUNTIME_PATH_AUDIT_VERSION,
    query,
    normalizedQuery: accessoryIntent.normalizedQuery,
    fixtureProfile: fixture.isMainProductQuery ? "main_product" : "accessory_failure_profile",
    accessoryIntent: {
      isAccessoryIntent: accessoryIntent.isAccessoryIntent,
      confidence: accessoryIntent.confidence,
      matchedSignals: accessoryIntent.matchedSignals,
    },
    routing: {
      detectedIntent: input.routing?.detectedIntent || null,
      contextAction: input.routing?.contextAction || null,
      routingMode: input.routing?.routingMode || null,
      responsePath: input.routing?.responsePath || null,
    },
    specificProductLock: {
      active: lock.active === true,
      bypassed: accessoryIntent.isAccessoryIntent && lock.active === false,
      reason: lock.reason || null,
      lockedProduct: productName(lock.lockedProduct),
      matchSource: lock.matchSource || null,
    },
    dataLayer: {
      candidatesBeforeIsolation: dlBefore.map((c) => productName(c)),
      candidatesAfterIsolation: dlAfter.map((c) => productName(c)),
      firstCandidateBefore: productName(dlBefore[0]),
      firstCandidateAfter: productName(dlAfter[0]),
      isolationApplied: isolation.applied === true,
      isolationReason: isolation.reason || null,
      blockedCandidate: isolation.blockedDataLayerCandidate || null,
    },
    cognitiveWinner: {
      winnerProduct: productName(cognitiveWinnerProduct),
      winnerSource: lock.active
        ? lock.matchSource || "specific_product_lock"
        : "ranked_products[0]",
      rankingReason: lock.active ? "specific_product_lock" : "pre_ranking_first",
      finalResponseProduct: productName(finalCardProduct || cognitiveWinnerProduct),
    },
    commercialRuntime: {
      mode,
      enforcementWouldRun: isCommercialRuntimeControlled(mode),
      usedNewPipeline: activation.usedNewPipeline === true,
      fallbackToLegacy: activation.fallbackToLegacy === true,
      fallbackReason: activation.fallbackReason || null,
      selectedOfferBeforeAccessoryEnforcement: productName(
        activation.newPipelineOffer || { title: fixture.pipelineMainOffer }
      ),
      selectedOfferAfterAccessoryEnforcement: productName(
        activation.accessoryEnforcement?.selectedOfferAfter ||
          enforcementPreview.selectedOfferAfter
      ),
      diagnostics: buildCommercialRuntimeActivationDiagnostics(activation),
    },
    accessoryRuntimeEnforcement: buildAccessoryCommercialRuntimeDiagnostics(
      activation.accessoryEnforcement || enforcementPreview
    ),
    propagationGuard: buildAccessoryWinnerPropagationDiagnostics(propagation),
    card,
    alignment: {
      alignmentScore: alignment.alignmentScore,
      isAligned: alignment.isAligned,
      alignmentReason: alignment.alignmentReason,
      queryIsAccessoryIntent: alignment.queryIsAccessoryIntent,
      offerHasAccessorySignals: alignment.offerHasAccessorySignals,
    },
    response,
    fixture,
  };

  report.verdict = evaluateAccessoryRuntimePathVerdict(report);
  return report;
}

/**
 * @param {Array<Record<string, unknown>>} reports
 */
export function summarizeAccessoryQueryRuntimePathAudits(reports = []) {
  const list = Array.isArray(reports) ? reports : [];
  const failuresByStage = Object.fromEntries(FAILURE_STAGES.map((s) => [s, 0]));
  const recommendedPatches = new Set();
  const rows = [];

  for (const report of list) {
    const verdict = report.verdict || {};
    if (!verdict.passed && verdict.failureStage) {
      failuresByStage[verdict.failureStage] = (failuresByStage[verdict.failureStage] || 0) + 1;
      if (verdict.recommendedPatch) recommendedPatches.add(verdict.recommendedPatch);
    }
    rows.push({
      query: report.query,
      passed: verdict.passed === true,
      failureStage: verdict.failureStage || "none",
      failureReason: verdict.failureReason || null,
      card: report.card?.productName || null,
      winner: report.cognitiveWinner?.winnerProduct || null,
    });
  }

  return {
    version: ACCESSORY_QUERY_RUNTIME_PATH_AUDIT_VERSION,
    total: list.length,
    passed: list.filter((r) => r.verdict?.passed).length,
    failed: list.filter((r) => !r.verdict?.passed).length,
    failuresByStage,
    recommendedPatches: [...recommendedPatches],
    rows,
  };
}

/**
 * @param {Record<string, unknown>} report
 */
export function buildAccessoryQueryRuntimePathDevPayload(report = {}) {
  return {
    query: report.query,
    accessoryIntent: report.accessoryIntent,
    verdict: report.verdict,
    specificProductLock: report.specificProductLock,
    dataLayer: report.dataLayer,
    cognitiveWinner: report.cognitiveWinner,
    commercialRuntime: report.commercialRuntime,
    accessoryRuntimeEnforcement: report.accessoryRuntimeEnforcement,
    propagationGuard: report.propagationGuard || null,
    card: report.card,
  };
}
