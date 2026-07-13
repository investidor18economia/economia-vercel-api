/**
 * PATCH Comercial 4E-C — Commercial Runtime Production Hardening
 *
 * Consolida observabilidade e validação estrutural do pipeline comercial existente.
 * Não gera reasoning, não decide winner, não verbaliza, não altera comportamento.
 */

import {
  GOVERNED_FALLBACK_PAYLOAD_BUILDER_VERSION,
  buildGovernedFallbackPayloadDiagnostics,
} from "./governedFallbackPayloadBuilder.js";
import {
  UNIVERSAL_GOVERNED_FALLBACK_REASONING_VERSION,
  buildUniversalGovernedFallbackReasoningDiagnostics,
} from "./universalGovernedFallbackReasoning.js";
import {
  UNIVERSAL_CATEGORY_SIGNAL_LIBRARY_VERSION,
  buildUniversalCategorySignalDiagnostics,
} from "./universalCategorySignalLibrary.js";
import {
  UNIVERSAL_FALLBACK_PROMPT_CONTRACT_VERSION,
  buildUniversalFallbackPromptContractDiagnostics,
} from "./universalFallbackPromptContract.js";

export const COMMERCIAL_FALLBACK_PIPELINE_VERSION = "4E-C";

export const COMMERCIAL_FALLBACK_PIPELINE_LAYERS = Object.freeze([
  Object.freeze({
    id: "commercial_runtime",
    order: 1,
    owner: "Commercial Runtime",
    produces: ["selectedProduct", "commercialRuntimeActivation"],
    mustNot: ["reasoning", "verbalization", "winner_decision"],
  }),
  Object.freeze({
    id: "governed_fallback_payload_builder",
    order: 2,
    version: GOVERNED_FALLBACK_PAYLOAD_BUILDER_VERSION,
    owner: "Governed Fallback Payload Builder",
    produces: ["governedFallbackPayload"],
    mustNot: ["reasoning", "verbalization", "text_output"],
  }),
  Object.freeze({
    id: "universal_governed_fallback_reasoning",
    order: 3,
    version: UNIVERSAL_GOVERNED_FALLBACK_REASONING_VERSION,
    owner: "Universal Governed Fallback Reasoning",
    produces: ["universalGovernedFallbackReasoning"],
    mustNot: ["text_output", "winner_decision", "prompt_contract"],
  }),
  Object.freeze({
    id: "universal_category_signal_library",
    order: 4,
    version: UNIVERSAL_CATEGORY_SIGNAL_LIBRARY_VERSION,
    owner: "Universal Category Signal Library",
    produces: ["universalCategorySignals"],
    mustNot: ["reasoning", "text_output", "product_decision"],
  }),
  Object.freeze({
    id: "universal_fallback_prompt_contract",
    order: 5,
    version: UNIVERSAL_FALLBACK_PROMPT_CONTRACT_VERSION,
    owner: "Universal Fallback Prompt Contract",
    produces: ["universalFallbackPromptContract"],
    mustNot: ["cognition", "winner_decision", "data_invention"],
  }),
]);

const PAYLOAD_FORBIDDEN_FIELDS = Object.freeze([
  "safeReasoningSignals",
  "verbalizationFocus",
  "unsafeReasoningBoundaries",
  "reply",
]);

const REASONING_FORBIDDEN_FIELDS = Object.freeze([
  "reply",
  "verbalizedText",
  "verbalizedReply",
]);

const SIGNALS_FORBIDDEN_FIELDS = Object.freeze([
  "safeReasoningSignals",
  "unsafeReasoningBoundaries",
  "reply",
  "verbalizationFocus",
]);

function cleanText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function namesEqual(a = "", b = "") {
  const left = cleanText(a).toLowerCase();
  const right = cleanText(b).toLowerCase();
  return !!left && !!right && left === right;
}

function resolveAccessoryIntent(reasoning = {}, payload = {}) {
  return (
    reasoning.categorySignals?.accessoryIntent ||
    payload.commercialIntent?.accessoryIntent ||
    null
  );
}

function detectForbiddenFields(record = {}, forbidden = []) {
  if (!record || typeof record !== "object") return [];
  return forbidden.filter((field) => Object.prototype.hasOwnProperty.call(record, field));
}

/**
 * Valida limites estruturais entre camadas do pipeline comercial.
 * @param {{
 *   payload?: Record<string, unknown>|null,
 *   reasoning?: Record<string, unknown>|null,
 *   signals?: Record<string, unknown>|null,
 *   contract?: Record<string, unknown>|null,
 * }} input
 */
export function validateCommercialFallbackPipelineLayers(input = {}) {
  const payload = input.payload || {};
  const reasoning = input.reasoning || {};
  const signals = input.signals || {};
  const contract = input.contract || null;
  const issues = [];

  for (const field of detectForbiddenFields(payload, PAYLOAD_FORBIDDEN_FIELDS)) {
    issues.push({
      layer: "governed_fallback_payload_builder",
      code: "payload_contains_reasoning_or_text_fields",
      field,
    });
  }

  for (const field of detectForbiddenFields(reasoning, REASONING_FORBIDDEN_FIELDS)) {
    issues.push({
      layer: "universal_governed_fallback_reasoning",
      code: "reasoning_contains_text_output_fields",
      field,
    });
  }

  for (const field of detectForbiddenFields(signals, SIGNALS_FORBIDDEN_FIELDS)) {
    issues.push({
      layer: "universal_category_signal_library",
      code: "signals_contains_reasoning_or_text_fields",
      field,
    });
  }

  if (reasoning.payloadVersion && payload.version && reasoning.payloadVersion !== payload.version) {
    issues.push({
      layer: "universal_governed_fallback_reasoning",
      code: "payload_version_mismatch",
      expected: payload.version,
      actual: reasoning.payloadVersion,
    });
  }

  if (signals.provenance?.payloadVersion && payload.version && signals.provenance.payloadVersion !== payload.version) {
    issues.push({
      layer: "universal_category_signal_library",
      code: "payload_version_mismatch",
      expected: payload.version,
      actual: signals.provenance.payloadVersion,
    });
  }

  if (
    contract?.provenance?.payloadVersion &&
    payload.version &&
    contract.provenance.payloadVersion !== payload.version
  ) {
    issues.push({
      layer: "universal_fallback_prompt_contract",
      code: "payload_version_mismatch",
      expected: payload.version,
      actual: contract.provenance.payloadVersion,
    });
  }

  const hasDataLayer = payload.governance?.hasDataLayer === true;
  if (hasDataLayer && reasoning.shouldUseFallbackReasoning === true) {
    issues.push({
      layer: "pipeline",
      code: "fallback_reasoning_active_with_data_layer",
    });
  }
  if (hasDataLayer && contract?.isActive === true) {
    issues.push({
      layer: "pipeline",
      code: "fallback_contract_active_with_data_layer",
    });
  }

  const upstreamName =
    cleanText(signals.upstreamReference?.productName) ||
    cleanText(reasoning.upstreamReference?.productName) ||
    cleanText(payload.relatedMainProduct?.productName);
  const selectedName =
    cleanText(signals.selectedCommercialItem?.productName) ||
    cleanText(reasoning.selectedCommercialItem?.productName) ||
    cleanText(payload.selectedProduct?.productName);
  const accessoryIntent = resolveAccessoryIntent(reasoning, payload);

  if (
    accessoryIntent?.isAccessoryIntent === true &&
    upstreamName &&
    selectedName &&
    namesEqual(upstreamName, selectedName)
  ) {
    issues.push({
      layer: "pipeline",
      code: "upstream_reference_collapsed_into_selected_on_accessory_intent",
      upstreamName,
      selectedName,
    });
  }

  if (
    contract?.isActive === true &&
    contract.verbalizationTarget?.productName &&
    reasoning.selectedCommercialItem?.productName &&
    !namesEqual(contract.verbalizationTarget.productName, reasoning.selectedCommercialItem.productName)
  ) {
    issues.push({
      layer: "universal_fallback_prompt_contract",
      code: "contract_verbalization_target_mismatch",
    });
  }

  return {
    version: COMMERCIAL_FALLBACK_PIPELINE_VERSION,
    valid: issues.length === 0,
    issues,
    layerStatus: {
      payload: {
        version: payload.version || GOVERNED_FALLBACK_PAYLOAD_BUILDER_VERSION,
        enabled: payload.enabled === true,
        skipped: payload.skipped === true,
        hasDataLayer,
      },
      reasoning: {
        version: reasoning.version || UNIVERSAL_GOVERNED_FALLBACK_REASONING_VERSION,
        active: reasoning.shouldUseFallbackReasoning === true,
        skipped: reasoning.skipped === true,
      },
      signals: {
        version: signals.version || UNIVERSAL_CATEGORY_SIGNAL_LIBRARY_VERSION,
        active: signals.isActive === true,
        skipped: signals.skipped === true,
      },
      contract: contract
        ? {
            version: contract.version || UNIVERSAL_FALLBACK_PROMPT_CONTRACT_VERSION,
            active: contract.isActive === true,
            skipped: contract.skipped === true,
          }
        : null,
    },
    responsibilities: COMMERCIAL_FALLBACK_PIPELINE_LAYERS.map((layer) => ({
      id: layer.id,
      order: layer.order,
      owner: layer.owner,
      version: layer.version || null,
    })),
  };
}

/**
 * @param {{
 *   payload?: Record<string, unknown>|null,
 *   reasoning?: Record<string, unknown>|null,
 *   signals?: Record<string, unknown>|null,
 *   contract?: Record<string, unknown>|null,
 * }} input
 */
export function buildCommercialFallbackPipelineDiagnostics(input = {}) {
  const validation = validateCommercialFallbackPipelineLayers(input);
  const payload = input.payload || {};
  const reasoning = input.reasoning || {};
  const signals = input.signals || {};
  const contract = input.contract || null;

  return {
    version: COMMERCIAL_FALLBACK_PIPELINE_VERSION,
    valid: validation.valid,
    issueCount: validation.issues.length,
    hasDataLayer: payload.governance?.hasDataLayer === true,
    payloadEnabled: payload.enabled === true,
    reasoningActive: reasoning.shouldUseFallbackReasoning === true,
    signalsActive: signals.isActive === true,
    contractActive: contract?.isActive === true,
    upstreamReferenceName:
      signals.upstreamReference?.productName ||
      reasoning.upstreamReference?.productName ||
      payload.relatedMainProduct?.productName ||
      null,
    selectedCommercialItemName:
      signals.selectedCommercialItem?.productName ||
      reasoning.selectedCommercialItem?.productName ||
      payload.selectedProduct?.productName ||
      null,
    layerVersions: {
      payload: payload.version || GOVERNED_FALLBACK_PAYLOAD_BUILDER_VERSION,
      reasoning: reasoning.version || UNIVERSAL_GOVERNED_FALLBACK_REASONING_VERSION,
      signals: signals.version || UNIVERSAL_CATEGORY_SIGNAL_LIBRARY_VERSION,
      contract: contract?.version || null,
    },
    validation,
  };
}

/**
 * Patch unificado de observabilidade para tracer/DEV.
 * @param {{
 *   payload?: Record<string, unknown>|null,
 *   reasoning?: Record<string, unknown>|null,
 *   signals?: Record<string, unknown>|null,
 *   contract?: Record<string, unknown>|null,
 *   contractDiagnostics?: Record<string, unknown>|null,
 *   activation?: Record<string, unknown>|null,
 *   activationDiagnostics?: Record<string, unknown>|null,
 *   accessoryRuntimeDiagnostics?: Record<string, unknown>|null,
 *   propagation?: Record<string, unknown>|null,
 *   propagationDiagnostics?: Record<string, unknown>|null,
 * }} input
 */
export function buildCommercialFallbackPipelineObservabilityPatch(input = {}) {
  const payload = input.payload || {};
  const reasoning = input.reasoning || {};
  const signals = input.signals || {};
  const contract = input.contract || null;

  const patch = {
    governed_fallback_payload: buildGovernedFallbackPayloadDiagnostics(payload),
    governed_fallback_payload_full: payload,
    universal_governed_fallback_reasoning:
      buildUniversalGovernedFallbackReasoningDiagnostics(reasoning),
    universal_governed_fallback_reasoning_full: reasoning,
    universal_category_signals: buildUniversalCategorySignalDiagnostics(signals),
    universal_category_signals_full: signals,
    commercial_fallback_pipeline: buildCommercialFallbackPipelineDiagnostics({
      payload,
      reasoning,
      signals,
      contract,
    }),
  };

  if (input.activationDiagnostics || input.activation) {
    patch.commercial_runtime_activation = input.activationDiagnostics || input.activation;
  }

  if (input.accessoryRuntimeDiagnostics) {
    patch.commercial_accessory_runtime_enforcement = input.accessoryRuntimeDiagnostics;
  }

  if (input.propagationDiagnostics || input.propagation) {
    patch.accessory_cognitive_winner_propagation =
      input.propagationDiagnostics || input.propagation;
  }

  if (contract) {
    patch.universal_fallback_prompt_contract =
      input.contractDiagnostics || buildUniversalFallbackPromptContractDiagnostics(contract);
    patch.universal_fallback_prompt_contract_full = contract;
  }

  return patch;
}

/**
 * @param {{
 *   payload?: Record<string, unknown>|null,
 *   reasoning?: Record<string, unknown>|null,
 *   signals?: Record<string, unknown>|null,
 *   contract?: Record<string, unknown>|null,
 * }} input
 */
export function buildCommercialFallbackPipelineDevPayload(input = {}) {
  const validation = validateCommercialFallbackPipelineLayers(input);
  return {
    version: COMMERCIAL_FALLBACK_PIPELINE_VERSION,
    layers: COMMERCIAL_FALLBACK_PIPELINE_LAYERS,
    diagnostics: buildCommercialFallbackPipelineDiagnostics(input),
    validation,
  };
}
