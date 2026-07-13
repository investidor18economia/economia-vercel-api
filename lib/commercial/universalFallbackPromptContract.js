/**
 * PATCH Comercial 4E-B.8 — Universal Fallback Prompt Contract
 *
 * Transforma governedFallbackPayload + universalGovernedFallbackReasoning
 * em contrato explícito de verbalização e texto conservador governado.
 * A MIA decide; a verbalização apenas converte o contrato em linguagem natural.
 */

import { buildGovernedFallbackPayload } from "./governedFallbackPayloadBuilder.js";
import {
  UNIVERSAL_GOVERNED_FALLBACK_REASONING_TYPE,
  buildUniversalGovernedFallbackReasoning,
  shouldBuildUniversalGovernedFallbackReasoning,
} from "./universalGovernedFallbackReasoning.js";

export const UNIVERSAL_FALLBACK_PROMPT_CONTRACT_VERSION = "4E-B.8";

export const UNIVERSAL_FALLBACK_PROMPT_CONTRACT_TYPE = "universal_fallback_prompt_contract";

const ALLOWED_CLAIM_IDS = Object.freeze([
  "selected_commercial_item_recommendation",
  "conservative_commercial_reference",
  "transparency_no_full_audit",
  "limited_confidence_without_data_layer",
  "requested_item_alignment",
  "upstream_context_only",
  "explicit_offer_signals_only",
]);

const FORBIDDEN_CLAIM_IDS = Object.freeze([
  "technical_specification",
  "technical_advantage",
  "technical_disadvantage",
  "performance_superiority",
  "durability_superiority",
  "display_quality_superiority",
  "audio_quality_superiority",
  "speed_superiority",
  "category_best_claim",
  "review_or_rating",
  "benchmark_claim",
  "invented_tradeoff",
  "upstream_as_recommendation",
  "upstream_as_winner",
]);

const FORBIDDEN_RECOMMENDATION_PATTERNS = Object.freeze([
  /\beu iria no\b/i,
  /\beu iria na\b/i,
  /\brecomendaria o\b/i,
  /\brecomendaria a\b/i,
  /\b(?:melhor|superior|mais confort[aá]vel|protege melhor|som superior|mais dur[aá]vel|melhor imagem|mais r[aá]pido)\b/i,
  /\bnota\s+\d/i,
  /\bbenchmark\b/i,
]);

function cleanText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function namesEqual(a = "", b = "") {
  const left = cleanText(a).toLowerCase();
  const right = cleanText(b).toLowerCase();
  return !!left && !!right && left === right;
}

function extractShortCommercialLabel(productName = "") {
  const name = cleanText(productName);
  if (!name) return "esta opção encontrada";
  const words = name.split(" ");
  if (words.length <= 6) return name;
  return words.slice(0, 6).join(" ");
}

function significantTokens(value = "") {
  return cleanText(value)
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 3);
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * @param {{
 *   governedFallbackPayload?: Record<string, unknown>|null,
 *   universalGovernedFallbackReasoning?: Record<string, unknown>|null,
 *   query?: string,
 * }} input
 */
export function shouldApplyUniversalFallbackPromptContract(input = {}) {
  const payload = input.governedFallbackPayload || null;
  const reasoning =
    input.universalGovernedFallbackReasoning ||
    (payload ? buildUniversalGovernedFallbackReasoning(payload) : null);

  if (!payload || !reasoning) return false;
  if (payload.enabled !== true || payload.skipped === true) return false;
  if (payload.governance?.hasDataLayer === true) return false;
  return shouldBuildUniversalGovernedFallbackReasoning(payload) && reasoning.shouldUseFallbackReasoning === true;
}

function buildForbiddenTargets(reasoning = {}) {
  const targets = [];
  const upstreamName = cleanText(reasoning.upstreamReference?.productName);
  const selectedName = cleanText(reasoning.selectedCommercialItem?.productName);
  const forbiddenFocus = cleanText(reasoning.verbalizationFocus?.forbiddenFocusProductName);

  if (upstreamName && !namesEqual(upstreamName, selectedName)) {
    targets.push({
      productName: upstreamName,
      role: "upstream_reference",
      reason: "must_not_be_verbalized_as_recommendation",
    });
  }

  if (forbiddenFocus && !targets.some((entry) => namesEqual(entry.productName, forbiddenFocus))) {
    targets.push({
      productName: forbiddenFocus,
      role: "forbidden_verbalization_focus",
      reason: "must_not_replace_selected_commercial_item",
    });
  }

  return targets;
}

function buildAllowedClaims(reasoning = {}) {
  const claims = [
    {
      id: ALLOWED_CLAIM_IDS[0],
      description: "Recomendar apenas o item comercial selecionado pelo runtime.",
    },
    {
      id: ALLOWED_CLAIM_IDS[1],
      description: "Tratar a indicação como referência comercial conservadora.",
    },
    {
      id: ALLOWED_CLAIM_IDS[3],
      description: "Manter confiança limitada pela ausência de Data Layer.",
    },
  ];

  if (reasoning.transparencyRequirement?.required) {
    claims.push({
      id: ALLOWED_CLAIM_IDS[2],
      description: "Informar que o produto ainda não passou pela auditoria completa da MIA.",
    });
  }

  if (reasoning.categorySignals?.accessoryIntent?.isAccessoryIntent) {
    claims.push({
      id: ALLOWED_CLAIM_IDS[4],
      description: "Manter foco no item solicitado pela intenção comercial detectada.",
    });
  }

  if (reasoning.upstreamReference?.productName) {
    claims.push({
      id: ALLOWED_CLAIM_IDS[5],
      description: "Mencionar referência upstream apenas como compatibilidade ou contexto.",
    });
  }

  const explicitSignals = reasoning.categorySignals?.explicitOfferSignals || [];
  if (explicitSignals.length > 0) {
    claims.push({
      id: ALLOWED_CLAIM_IDS[6],
      description: "Usar somente sinais explícitos presentes na oferta selecionada.",
      evidence: explicitSignals.map((signal) => signal.token || signal.id).filter(Boolean),
    });
  }

  return claims;
}

function buildForbiddenClaims(reasoning = {}) {
  const boundaries = Array.isArray(reasoning.unsafeReasoningBoundaries)
    ? reasoning.unsafeReasoningBoundaries
    : [];

  const claims = FORBIDDEN_CLAIM_IDS.map((id) => ({
    id,
    description: `Claim type "${id}" is forbidden without governed Data Layer evidence.`,
  }));

  if (reasoning.upstreamReference?.productName) {
    claims.push({
      id: "upstream_as_recommendation",
      description: "Não recomendar a referência upstream como produto principal.",
      productName: reasoning.upstreamReference.productName,
    });
    claims.push({
      id: "upstream_as_winner",
      description: "Não tratar a referência upstream como winner fallback.",
      productName: reasoning.upstreamReference.productName,
    });
  }

  for (const boundary of boundaries) {
    if (!claims.some((claim) => claim.id === boundary)) {
      claims.push({
        id: boundary,
        description: `Boundary "${boundary}" must not be verbalized without audit evidence.`,
      });
    }
  }

  return claims;
}

/**
 * @param {{
 *   governedFallbackPayload?: Record<string, unknown>|null,
 *   universalGovernedFallbackReasoning?: Record<string, unknown>|null,
 *   query?: string,
 * }} input
 */
export function buildUniversalFallbackPromptContract(input = {}) {
  const payload = input.governedFallbackPayload || null;
  const reasoning =
    input.universalGovernedFallbackReasoning ||
    (payload ? buildUniversalGovernedFallbackReasoning(payload) : null);
  const isActive = shouldApplyUniversalFallbackPromptContract({
    governedFallbackPayload: payload,
    universalGovernedFallbackReasoning: reasoning,
  });

  if (!isActive) {
    return {
      contractType: UNIVERSAL_FALLBACK_PROMPT_CONTRACT_TYPE,
      version: UNIVERSAL_FALLBACK_PROMPT_CONTRACT_VERSION,
      isActive: false,
      skipped: true,
      skipReason:
        payload?.skipReason ||
        (payload?.governance?.hasDataLayer ? "data_layer_present" : "fallback_contract_not_applicable"),
      query: cleanText(input.query || payload?.query || "") || null,
      dataLayerPolicy: {
        hasDataLayer: payload?.governance?.hasDataLayer === true,
        useStandardDataLayerFlow: payload?.governance?.hasDataLayer === true,
      },
    };
  }

  const verbalizationTarget = {
    targetType: reasoning.verbalizationFocus?.target || "selected_commercial_item",
    productName:
      reasoning.verbalizationFocus?.productName ||
      reasoning.selectedCommercialItem?.productName ||
      null,
    source: "universal_governed_fallback_reasoning.verbalizationFocus",
  };
  const forbiddenTargets = buildForbiddenTargets(reasoning);
  const upstreamName = cleanText(reasoning.upstreamReference?.productName);

  return {
    contractType: UNIVERSAL_FALLBACK_PROMPT_CONTRACT_TYPE,
    version: UNIVERSAL_FALLBACK_PROMPT_CONTRACT_VERSION,
    isActive: true,
    skipped: false,
    query: cleanText(input.query || payload?.query || reasoning.query || "") || null,
    reasoningType: reasoning.reasoningType || UNIVERSAL_GOVERNED_FALLBACK_REASONING_TYPE,
    verbalizationTarget,
    forbiddenTargets,
    allowedClaims: buildAllowedClaims(reasoning),
    forbiddenClaims: buildForbiddenClaims(reasoning),
    transparencyInstruction: {
      required: reasoning.transparencyRequirement?.required === true,
      auditNoticeRequired: reasoning.transparencyRequirement?.auditNoticeRequired === true,
      message:
        "Como esse produto ainda não passou pela auditoria completa da MIA, eu manteria a recomendação mais conservadora e baseada no resultado comercial encontrado, não em uma análise técnica completa.",
      preserveExistingUiNotice: true,
    },
    confidenceInstruction: {
      level: reasoning.confidenceBoundary?.level || "limited",
      reason: reasoning.confidenceBoundary?.reason || "no_data_layer_audit",
      mustAvoidTechnicalSuperiorityClaims:
        reasoning.confidenceBoundary?.mustAvoidTechnicalSuperiorityClaims === true,
      mustAvoidInventedSpecs: reasoning.confidenceBoundary?.mustAvoidInventedSpecs === true,
      mustAvoidInventedTradeoffs: reasoning.confidenceBoundary?.mustAvoidInventedTradeoffs === true,
      message:
        "Por isso, eu evitaria prometer conforto, durabilidade, desempenho ou qualidade técnica sem auditoria completa da MIA.",
    },
    sourceInstruction: {
      knowledgeSource: reasoning.dataLayerStatus?.knowledgeSource || "governed_fallback",
      decisionOrigin: reasoning.provenance?.decisionOrigin || reasoning.commercialRuntimeStatus?.decisionOrigin || null,
      dataOrigin: reasoning.provenance?.dataOrigin || null,
      llmRole: "verbalize_contract_only",
      llmMustNotDecideWinner: true,
      llmMustNotInventSpecs: true,
    },
    safeResponseFrame: {
      openingIntent: "recommend_selected_commercial_item",
      conservativeTone: true,
      excludeUpstreamAsRecommendation: forbiddenTargets.length > 0,
      focusOnRequestedItem: reasoning.categorySignals?.accessoryIntent?.isAccessoryIntent === true,
    },
    upstreamReferencePolicy: {
      hasUpstreamReference: !!upstreamName,
      upstreamProductName: upstreamName || null,
      allowContextMention: !!upstreamName,
      allowCompatibilityMention: !!upstreamName,
      forbidRecommendation: true,
      forbidWinnerFallback: true,
      message: upstreamName
        ? `${upstreamName} entra apenas como referência de compatibilidade ou contexto, não como o produto recomendado.`
        : null,
    },
    dataLayerPolicy: {
      hasDataLayer: false,
      useStandardDataLayerFlow: false,
      governedFallbackActive: true,
    },
    llmVerbalizationBoundary: {
      verbalize: verbalizationTarget,
      neverVerbalizeAsRecommendation: forbiddenTargets.map((entry) => entry.productName).filter(Boolean),
      allowedClaims: buildAllowedClaims(reasoning).map((claim) => claim.id),
      forbiddenClaims: buildForbiddenClaims(reasoning).map((claim) => claim.id),
    },
    provenance: {
      contractOrigin: "universal_fallback_prompt_contract",
      payloadVersion: payload?.version || null,
      reasoningVersion: reasoning.version || null,
    },
  };
}

/**
 * Converte contrato governado em texto final conservador.
 * @param {Record<string, unknown>} contract
 */
export function verbalizeUniversalFallbackPromptContract(contract = {}) {
  if (contract.isActive !== true) return "";

  const label = extractShortCommercialLabel(contract.verbalizationTarget?.productName);
  const upstreamPolicy = contract.upstreamReferencePolicy || {};
  const upstreamShort = extractShortCommercialLabel(upstreamPolicy.upstreamProductName);
  const paragraphs = [];

  if (upstreamPolicy.hasUpstreamReference && upstreamShort) {
    paragraphs.push(
      `Eu iria nessa opção encontrada para sua busca: ${label}. Minha indicação aqui não vale para ${upstreamShort} como produto principal recomendado.`
    );
  } else {
    paragraphs.push(`Eu iria nessa opção encontrada para sua busca: ${label}.`);
  }

  if (contract.transparencyInstruction?.required) {
    paragraphs.push(cleanText(contract.transparencyInstruction.message));
  }

  if (contract.confidenceInstruction?.message) {
    paragraphs.push(cleanText(contract.confidenceInstruction.message));
  }

  if (upstreamPolicy.allowContextMention && upstreamPolicy.message) {
    paragraphs.push(cleanText(upstreamPolicy.message));
  }

  return paragraphs.filter(Boolean).join(" ");
}

/**
 * @param {{
 *   query?: string,
 *   selectedProduct?: Record<string, unknown>|null,
 *   governedFallbackPayload?: Record<string, unknown>|null,
 *   universalGovernedFallbackReasoning?: Record<string, unknown>|null,
 *   payloadInput?: Record<string, unknown>|null,
 * }} input
 */
export function resolveUniversalFallbackPromptContractVerbalization(input = {}) {
  const payload =
    input.governedFallbackPayload ||
    (input.payloadInput ? buildGovernedFallbackPayload(input.payloadInput) : null);
  const reasoning =
    input.universalGovernedFallbackReasoning ||
    (payload ? buildUniversalGovernedFallbackReasoning(payload) : null);
  const contract = buildUniversalFallbackPromptContract({
    query: input.query,
    governedFallbackPayload: payload,
    universalGovernedFallbackReasoning: reasoning,
  });

  if (!contract.isActive) {
    return {
      applied: false,
      reply: null,
      contract,
      payload,
      reasoning,
      diagnostics: buildUniversalFallbackPromptContractDiagnostics(contract),
    };
  }

  const reply = verbalizeUniversalFallbackPromptContract(contract);
  return {
    applied: true,
    reply,
    contract,
    payload,
    reasoning,
    diagnostics: buildUniversalFallbackPromptContractDiagnostics(contract),
  };
}

/**
 * @param {Record<string, unknown>} contract
 */
export function buildUniversalFallbackPromptContractDiagnostics(contract = {}) {
  return {
    version: contract.version || UNIVERSAL_FALLBACK_PROMPT_CONTRACT_VERSION,
    contractType: contract.contractType || UNIVERSAL_FALLBACK_PROMPT_CONTRACT_TYPE,
    isActive: contract.isActive === true,
    skipped: contract.skipped === true,
    skipReason: contract.skipReason || null,
    query: contract.query || null,
    verbalizationTargetName: contract.verbalizationTarget?.productName || null,
    forbiddenTargetNames: (contract.forbiddenTargets || [])
      .map((entry) => entry.productName)
      .filter(Boolean),
    transparencyRequired: contract.transparencyInstruction?.required === true,
    confidenceLevel: contract.confidenceInstruction?.level || null,
    upstreamReferenceName: contract.upstreamReferencePolicy?.upstreamProductName || null,
    allowedClaimCount: Array.isArray(contract.allowedClaims) ? contract.allowedClaims.length : 0,
    forbiddenClaimCount: Array.isArray(contract.forbiddenClaims) ? contract.forbiddenClaims.length : 0,
  };
}

/**
 * @param {Record<string, unknown>} contract
 */
export function buildUniversalFallbackPromptContractDevPayload(contract = {}) {
  return {
    version: contract.version || UNIVERSAL_FALLBACK_PROMPT_CONTRACT_VERSION,
    contractType: contract.contractType || UNIVERSAL_FALLBACK_PROMPT_CONTRACT_TYPE,
    isActive: contract.isActive === true,
    query: contract.query || null,
    verbalizationTarget: contract.verbalizationTarget || null,
    forbiddenTargets: contract.forbiddenTargets || [],
    allowedClaims: contract.allowedClaims || [],
    forbiddenClaims: contract.forbiddenClaims || [],
    transparencyInstruction: contract.transparencyInstruction || null,
    confidenceInstruction: contract.confidenceInstruction || null,
    sourceInstruction: contract.sourceInstruction || null,
    safeResponseFrame: contract.safeResponseFrame || null,
    upstreamReferencePolicy: contract.upstreamReferencePolicy || null,
    llmVerbalizationBoundary: contract.llmVerbalizationBoundary || null,
    diagnostics: buildUniversalFallbackPromptContractDiagnostics(contract),
  };
}

export function replyViolatesUniversalFallbackPromptContract(reply = "", contract = {}) {
  const text = cleanText(reply);
  if (!text || contract.isActive !== true) return false;

  for (const pattern of FORBIDDEN_RECOMMENDATION_PATTERNS) {
    if (pattern.test(text)) return true;
  }

  for (const forbidden of contract.forbiddenTargets || []) {
    const name = cleanText(forbidden.productName);
    if (!name) continue;
    const escaped = escapeRegExp(name);
    const upstreamRecommendationPatterns = [
      new RegExp(`eu iria no ${escaped}`, "i"),
      new RegExp(`eu iria na ${escaped}`, "i"),
      new RegExp(`recomendaria o ${escaped}`, "i"),
      new RegExp(`recomendaria a ${escaped}`, "i"),
      new RegExp(`^o ${escaped}\\b`, "i"),
      new RegExp(`^a ${escaped}\\b`, "i"),
    ];
    if (upstreamRecommendationPatterns.some((pattern) => pattern.test(text))) {
      return true;
    }
  }

  const targetName = cleanText(contract.verbalizationTarget?.productName);
  if (targetName) {
    const targetTokens = significantTokens(targetName);
    const textLower = text.toLowerCase();
    const mentionsTarget =
      textLower.includes(targetName.toLowerCase()) ||
      targetTokens.some((token) => textLower.includes(token));
    if (!mentionsTarget && contract.safeResponseFrame?.openingIntent === "recommend_selected_commercial_item") {
      return true;
    }
  }

  return false;
}

export function replyFocusesOnSelectedCommercialItem(reply = "", selectedProductName = "") {
  const text = cleanText(reply).toLowerCase();
  const selected = cleanText(selectedProductName).toLowerCase();
  if (!text || !selected) return false;
  if (text.includes(selected)) return true;
  return significantTokens(selectedProductName).some((token) => text.includes(token));
}
