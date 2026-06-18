/**
 * PATCH Comercial 3A/3B/3C-A — Universal Product Explanation Builder
 *
 * Resolve facts estruturados do produto vencedor e delega verbalização humana.
 * Não altera ranking, winner, routing ou decision engine.
 */

import {
  containsArchitectureLeak,
  verbalizeCommercialExplanation,
} from "./miaCommercialExplanationVerbalizer.js";
import {
  containsBannedConsequenceGenericPhrase,
  containsInternalTokenLeak,
  extractConsequenceTexts,
  translateDataLayerFieldsToConsequences,
} from "./miaConsequenceTranslationLayer.js";
import {
  buildGovernedFallbackExplanationFacts,
  containsUnsafeFallbackClaim,
} from "./miaGovernedFallbackIntelligenceLayer.js";

import {
  enrichConsequencesWithMicroImpacts,
  containsInventedMicroClaim,
} from "./miaCommercialMicroConsequenceLayer.js";

export const PRODUCT_EXPLANATION_BUILDER_VERSION = "3C-E.1";

export const BANNED_GENERIC_PHRASES = Object.freeze([
  "use como referência de preço",
  "boa opção",
  "ótimo produto",
  "otimo produto",
  "ótima opção",
  "otima opção",
  "excelente produto",
  "melhor produto",
]);

const FORBIDDEN_INVENTED_SPEC_PATTERNS = Object.freeze([
  /\b(?:snapdragon|mediatek|dimensity|exynos|apple a\d+|apple m\d+)\b/i,
  /\b(?:rtx|gtx|rx)\s*\d/i,
  /\b(?:core i[3579]|ryzen\s*[3579])\b/i,
  /\b\d+\s*gb\s*(?:de\s*)?ram\b/i,
  /\b\d+\s*mah\b/i,
  /\b\d+\s*mp\b/i,
  /\b(?:possui|tem|conta com|vem com)\s+(?:snapdragon|mediatek|bateria|memória|memoria|câmera|camera)\b/i,
]);

function cleanList(value, max = 3) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry || "").trim())
      .filter(Boolean)
      .slice(0, max);
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()].slice(0, max);
  }
  return [];
}

function cleanProductName(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function collectDataLayerNotes(trustedSpecs = {}) {
  return cleanList(
    [
      ...cleanList(trustedSpecs.notes, 2),
      ...cleanList(trustedSpecs.market_notes, 2),
      ...cleanList(trustedSpecs.strategic_notes, 2),
    ],
    3
  );
}

export function hasUsableDataLayerContent(trustedSpecs = {}) {
  if (!trustedSpecs || typeof trustedSpecs !== "object") return false;
  return (
    cleanList(trustedSpecs.strengths).length > 0 ||
    cleanList(trustedSpecs.weaknesses).length > 0 ||
    cleanList(trustedSpecs.ideal_for).length > 0 ||
    cleanList(trustedSpecs.avoid_if).length > 0 ||
    collectDataLayerNotes(trustedSpecs).length > 0 ||
    cleanList(trustedSpecs.risk_notes).length > 0
  );
}

function extractExplicitTitleSignals(productName = "") {
  const title = cleanProductName(productName).toLowerCase();
  if (!title) return [];

  const signals = [];

  if (/\bgamer\b|\bgaming\b/.test(title)) {
    signals.push("perfil voltado a jogos no título");
  }
  if (/\bsem fio\b|\bwireless\b|\bbluetooth\b/.test(title)) {
    signals.push("conectividade sem fio indicada no título");
  }
  if (/\bsmart\b|\bsmart tv\b/.test(title)) {
    signals.push("referência smart explícita no título");
  }
  if (/\b4k\b|\b8k\b|\buhd\b|\bfhd\b|\bfull hd\b/.test(title)) {
    signals.push("resolução mencionada explicitamente no título");
  }
  if (/\b\d{2,3}(?:\/|\s)?(?:hz|hertz)\b/.test(title)) {
    signals.push("taxa de atualização mencionada no título");
  }
  if (/\b(pro|plus|ultra|max|premium)\b/.test(title)) {
    signals.push("variante mais completa indicada no nome");
  }

  return cleanList(signals, 3);
}

function buildAllowedEvidenceText({ product = {}, trustedSpecs = null, hasDataLayer = false } = {}) {
  const chunks = [
    product.product_name,
    product.category,
    product.price,
  ];

  if (hasDataLayer && trustedSpecs) {
    chunks.push(
      trustedSpecs.official_name,
      trustedSpecs.product_name,
      trustedSpecs.category,
      ...cleanList(trustedSpecs.strengths, 5),
      ...cleanList(trustedSpecs.weaknesses, 5),
      ...cleanList(trustedSpecs.ideal_for, 5),
      ...cleanList(trustedSpecs.avoid_if, 5),
      ...collectDataLayerNotes(trustedSpecs),
      ...cleanList(trustedSpecs.risk_notes, 5),
      trustedSpecs.chipset,
      trustedSpecs.cpu,
      trustedSpecs.gpu,
      trustedSpecs.ram_gb != null ? `${trustedSpecs.ram_gb}GB` : "",
      trustedSpecs.storage_gb != null ? `${trustedSpecs.storage_gb}GB` : "",
      trustedSpecs.battery_mah != null ? `${trustedSpecs.battery_mah}mAh` : "",
      trustedSpecs.main_camera_mp != null ? `${trustedSpecs.main_camera_mp}MP` : ""
    );
  }

  return chunks
    .map((entry) => String(entry || "").trim())
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function containsBannedGenericPhrase(text = "") {
  const normalized = String(text || "").toLowerCase();
  return BANNED_GENERIC_PHRASES.some((phrase) => normalized.includes(phrase));
}

export function findInventedSpecViolations(text = "", allowedEvidence = "") {
  const body = String(text || "");
  const evidence = String(allowedEvidence || "").toLowerCase();
  const violations = [];

  for (const pattern of FORBIDDEN_INVENTED_SPEC_PATTERNS) {
    const match = body.match(pattern);
    if (!match) continue;
    const token = String(match[0] || "").toLowerCase();
    if (!token) continue;
    if (evidence.includes(token)) continue;

    const ramAlias = token.match(/^(\d+)\s*gb\s*(?:de\s*)?ram$/);
    if (ramAlias && evidence.includes(`${ramAlias[1]}gb`)) continue;

    const coreAlias = token.match(/^core i([3579])$/);
    if (coreAlias && (evidence.includes(`i${coreAlias[1]}`) || evidence.includes(`core i${coreAlias[1]}`))) {
      continue;
    }

    violations.push(token);
  }

  return violations;
}

function finalizeProductExplanation(paragraphs = [], meta = {}) {
  const cleanParagraphs = paragraphs
    .map((paragraph) => String(paragraph || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 4);

  const text = cleanParagraphs.join("\n\n");
  const violations = findInventedSpecViolations(text, meta.allowedEvidence || "");

  if (violations.length > 0) {
    return {
      ok: false,
      text: "",
      paragraphs: [],
      source: meta.source || "invalid",
      hasDataLayer: !!meta.hasDataLayer,
      violations,
      error: "invented_spec_detected",
    };
  }

  if (!text || containsBannedGenericPhrase(text) || containsArchitectureLeak(text)) {
    return {
      ok: false,
      text: "",
      paragraphs: [],
      source: meta.source || "invalid",
      hasDataLayer: !!meta.hasDataLayer,
      error: containsArchitectureLeak(text)
        ? "architecture_leak_detected"
        : "generic_or_empty_explanation",
    };
  }

  if (containsInternalTokenLeak(text) || containsBannedConsequenceGenericPhrase(text)) {
    return {
      ok: false,
      text: "",
      paragraphs: [],
      source: meta.source || "invalid",
      hasDataLayer: !!meta.hasDataLayer,
      error: containsInternalTokenLeak(text)
        ? "internal_token_leak_detected"
        : "generic_consequence_language_detected",
    };
  }

  if (containsUnsafeFallbackClaim(text, meta.allowedEvidence || "")) {
    return {
      ok: false,
      text: "",
      paragraphs: [],
      source: meta.source || "invalid",
      hasDataLayer: !!meta.hasDataLayer,
      error: "unsafe_fallback_claim_detected",
    };
  }

  if (containsInventedMicroClaim(text, meta.allowedEvidence || "")) {
    return {
      ok: false,
      text: "",
      paragraphs: [],
      source: meta.source || "invalid",
      hasDataLayer: !!meta.hasDataLayer,
      error: "invented_micro_claim_detected",
    };
  }

  return {
    ok: true,
    text,
    paragraphs: cleanParagraphs,
    source: meta.source || "unknown",
    hasDataLayer: !!meta.hasDataLayer,
    violations: [],
    error: null,
  };
}

/**
 * @param {{
 *   product?: Record<string, unknown>,
 *   query?: string,
 *   trustedSpecs?: Record<string, unknown>|null,
 *   hasDataLayer?: boolean,
 * }} input
 */
export function buildStructuredExplanationFacts(input = {}) {
  const product = input.product && typeof input.product === "object" ? input.product : {};
  const trustedSpecs =
    input.trustedSpecs ||
    product.trustedSpecs ||
    null;
  const hasDataLayer =
    input.hasDataLayer ??
    (!!product.isDataLayerProduct || hasUsableDataLayerContent(trustedSpecs));

  const productName =
    cleanProductName(trustedSpecs?.official_name) ||
    cleanProductName(product.product_name) ||
    "este produto";

  if (hasDataLayer && trustedSpecs) {
    const translated = translateDataLayerFieldsToConsequences(trustedSpecs);

    return {
      mode: "data_layer",
      productName,
      category: cleanProductName(trustedSpecs.category || product.category),
      price: product.price || null,
      query: cleanProductName(input.query || ""),
      strengthConsequences: extractConsequenceTexts(translated.strengths, 3),
      weaknessConsequences: extractConsequenceTexts(translated.weaknesses, 2),
      idealForConsequences: extractConsequenceTexts(translated.idealFor, 2),
      avoidIfConsequences: extractConsequenceTexts(translated.avoidIf, 2),
      noteConsequences: extractConsequenceTexts(translated.notes, 2),
      riskConsequences: extractConsequenceTexts(translated.riskNotes, 1),
      titleSignals: [],
      allowedEvidence: buildAllowedEvidenceText({
        product,
        trustedSpecs,
        hasDataLayer: true,
      }),
    };
  }

  const governedFallback = buildGovernedFallbackExplanationFacts(product, input.query || "");

  return {
    mode: governedFallback.mode,
    productName: governedFallback.productName,
    category: governedFallback.category || cleanProductName(product.category),
    price: product.price || null,
    query: cleanProductName(input.query || ""),
    openingSummary: governedFallback.openingSummary || "",
    strengthConsequences: governedFallback.strengthConsequences || [],
    weaknessConsequences: governedFallback.weaknessConsequences || [],
    idealForConsequences: [],
    avoidIfConsequences: [],
    noteConsequences: [],
    riskConsequences: [],
    titleSignals: [],
    hasUsefulSignals: !!governedFallback.hasUsefulSignals,
    allowedEvidence: governedFallback.allowedEvidence || buildAllowedEvidenceText({ product, hasDataLayer: false }),
  };
}

/**
 * @param {{
 *   product?: Record<string, unknown>,
 *   query?: string,
 *   trustedSpecs?: Record<string, unknown>|null,
 *   hasDataLayer?: boolean,
 * }} input
 */
export function buildProductExplanation(input = {}) {
  const facts = enrichConsequencesWithMicroImpacts(buildStructuredExplanationFacts(input));
  const paragraphs = verbalizeCommercialExplanation(facts);

  return finalizeProductExplanation(paragraphs, {
    source:
      facts.mode === "data_layer"
        ? "data_layer"
        : facts.mode === "governed_fallback"
          ? "governed_fallback"
          : facts.mode === "fallback_cautious"
            ? "fallback_cautious"
            : "fallback_no_data_layer",
    hasDataLayer: facts.mode === "data_layer",
    allowedEvidence: facts.allowedEvidence,
  });
}

export function isGenericCommercialOfferReply(text = "") {
  const raw = String(text || "").trim();
  if (!raw) return true;
  if (containsBannedGenericPhrase(raw)) return true;
  if (/aparece como a opção mais alinhada para essa busca/i.test(raw) && raw.length < 140) {
    return true;
  }
  if (/Encontrei uma oferta real via Google Shopping/i.test(raw)) return true;
  return false;
}

export function looksLikeLegacySearchNarrativeReply(text = "") {
  const raw = String(text || "").trim();
  if (!raw) return true;
  return (
    /folga no uso pesado|no limite cedo demais|tarefas exigentes/i.test(raw) ||
    /aparece como a opção mais alinhada/i.test(raw) ||
    isGenericCommercialOfferReply(raw)
  );
}

export function shouldForceCommercialProductExplanation(product = {}, reply = "") {
  if (!product?.product_name) return false;

  const trustedSpecs = product.trustedSpecs || null;
  if (product.isDataLayerProduct || hasUsableDataLayerContent(trustedSpecs)) {
    return true;
  }

  return looksLikeLegacySearchNarrativeReply(reply);
}

export function resolveCommercialOfferExplanation(product = {}, query = "", options = {}) {
  const trustedSpecs = options.trustedSpecs || product?.trustedSpecs || null;
  const hasDataLayer =
    options.hasDataLayer ??
    (!!(product?.isDataLayerProduct || hasUsableDataLayerContent(trustedSpecs)));

  const built = buildProductExplanation({
    product,
    query,
    trustedSpecs,
    hasDataLayer,
  });

  if (built.ok && built.text) {
    return built.text;
  }

  const productName = cleanProductName(product.product_name) || "este produto";
  return (
    `Esse ${productName} parece uma opção interessante para quem está comparando ofertas agora. ` +
    `Mantenho a leitura prudente com base apenas no que o anúncio deixa explícito.`
  );
}
