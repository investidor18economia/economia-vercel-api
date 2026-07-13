/**
 * PATCH Comercial 05K — Commercial Runtime Production Freeze
 *
 * Validação e governança da arquitetura comercial congelada para o MVP.
 * Não executa runtime, não altera prioridade, winner ou reasoning.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PROVIDER_COST_AUDIT_VERSION } from "./providerCostAudit.js";
import { PROVIDER_COST_GUARD_VERSION, isPaidProviderObservabilityOptInEnabled } from "./providerCostGuard.js";
import { COMMERCIAL_REQUEST_DEDUP_VERSION } from "./commercialRequestDeduplication.js";
import {
  UNIVERSAL_COMMERCIAL_CACHE_VERSION,
  readUniversalCommercialCacheConfig,
} from "./universalCommercialCache.js";
import {
  CONDITIONAL_PROVIDER_FETCH_VERSION,
  readConditionalProviderFetchConfig,
} from "./conditionalProviderFetch.js";
import {
  PROVIDER_BUDGET_CIRCUIT_VERSION,
  readProviderBudgetCircuitConfig,
} from "./providerBudgetCircuitBreaker.js";
import {
  DEV_COMMERCIAL_COST_GUARD_VERSION,
  DEV_COMMERCIAL_REAL_EXECUTION_OPT_IN_ENV,
  isCommercialDevRealExternalCallsEnabled,
} from "./devCommercialCostGuard.js";
import { MERCADOLIVRE_RUNTIME_ACTIVATION_VERSION } from "./mercadolivreRuntimeActivation.js";
import {
  MULTI_PROVIDER_PRIORITY_ENGINE_VERSION,
  MULTI_PROVIDER_PRIORITY_ENABLED_ENV,
  MULTI_PROVIDER_PRIORITY_STRATEGY_ENV,
  readMultiProviderPriorityConfig,
  buildMultiProviderPriorityPlan,
} from "./multiProviderPriorityEngine.js";
import {
  COMMERCIAL_COVERAGE_VALIDATION_VERSION,
  COMMERCIAL_COVERAGE_REAL_VALIDATION_ENABLED_ENV,
  readCommercialCoverageValidationConfig,
} from "./commercialCoverageValidation.js";
import { GOVERNED_FALLBACK_PAYLOAD_BUILDER_VERSION } from "./governedFallbackPayloadBuilder.js";
import { UNIVERSAL_GOVERNED_FALLBACK_REASONING_VERSION } from "./universalGovernedFallbackReasoning.js";
import { UNIVERSAL_FALLBACK_PROMPT_CONTRACT_VERSION } from "./universalFallbackPromptContract.js";
import { UNIVERSAL_CATEGORY_SIGNAL_LIBRARY_VERSION } from "./universalCategorySignalLibrary.js";
import { COMMERCIAL_FALLBACK_PIPELINE_VERSION } from "./commercialFallbackProductionPipeline.js";
import {
  COMMERCIAL_PROVIDER_IDS,
  COMMERCIAL_PROVIDER_REGISTRY_VERSION,
  MERCADOLIVRE_COMMERCIAL_PROVIDER_ENABLED_ENV,
  getCommercialProviderOperationalMetadata,
  isMercadoLivreCommercialProviderRuntimeEnabled,
  listCommercialProviderOperationalMetadata,
} from "../productSourceAdapter/commercialProviderRegistry.js";
import {
  COMMERCIAL_RUNTIME_MODES,
  COMMERCIAL_RUNTIME_MODE_VERSION,
  getCommercialRuntimeMode,
  isCommercialRuntimeShadowDiagnosticsEnabled,
} from "../productSourceAdapter/commercialRuntimeMode.js";
import { COMMERCIAL_OFFER_MERGE_LAYER_VERSION } from "../productSourceAdapter/commercialOfferMergeLayer.js";
import { COMMERCIAL_DEDUPLICATION_LAYER_VERSION } from "../productSourceAdapter/commercialDeduplicationLayer.js";
import { COMMERCIAL_SELECTION_ENGINE_VERSION } from "../productSourceAdapter/commercialSelectionEngine.js";
import { COMMERCIAL_QUERY_PRODUCT_ALIGNMENT_VERSION } from "../productSourceAdapter/commercialQueryProductAlignmentLayer.js";
import { COMMERCIAL_RUNTIME_ACTIVATION_VERSION } from "../productSourceAdapter/commercialRuntimeActivation.js";
import { COMMERCIAL_RUNTIME_SHADOW_VERSION } from "../productSourceAdapter/commercialRuntimeShadow.js";
import { NORMALIZED_PRODUCT_VERSION } from "../productSourceAdapter/normalizedProduct.js";
import {
  evaluateCommercialResultSufficiency,
} from "./conditionalProviderFetch.js";
import {
  evaluateProviderRuntimeEligibility,
  MULTI_PROVIDER_PRIORITY_SKIP_REASONS,
} from "./multiProviderPriorityEngine.js";
import {
  evaluateProviderCostGuardForProvider,
} from "./providerCostGuard.js";
import { PAID_PROVIDER_OBSERVABILITY_OPT_IN_ENV } from "./providerCostGuard.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");

export const COMMERCIAL_RUNTIME_PRODUCTION_FREEZE_VERSION = "05K";
export const COMMERCIAL_RUNTIME_PRODUCTION_FREEZE_DATE = "2026-06-17";

export const COMMERCIAL_RUNTIME_FREEZE_STATUS = Object.freeze({
  PRODUCTION_FREEZE_APPROVED: "PRODUCTION_FREEZE_APPROVED",
  FREEZE_APPROVED_WITH_ACCEPTED_MVP_LIMITATIONS: "FREEZE_APPROVED_WITH_ACCEPTED_MVP_LIMITATIONS",
  FREEZE_BLOCKED: "FREEZE_BLOCKED",
});

export const COMMERCIAL_RUNTIME_RISK_LEVELS = Object.freeze({
  CRITICAL: "CRITICAL",
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
  ACCEPTED_MVP_LIMITATION: "ACCEPTED_MVP_LIMITATION",
});

export const OFFICIAL_COMMERCIAL_PIPELINE_LAYERS = Object.freeze([
  { id: "provider_registry", module: "commercialProviderRegistry.js", version: COMMERCIAL_PROVIDER_REGISTRY_VERSION, responsibility: "cadastro, enabled, capabilities, billing tier, metadata operacional" },
  { id: "runtime_eligibility", module: "multiProviderPriorityEngine.js", patch: "05I", responsibility: "elegibilidade por runtime/capability/auth/budget/circuit" },
  { id: "multi_provider_priority_engine", module: "multiProviderPriorityEngine.js", patch: "05I", version: MULTI_PROVIDER_PRIORITY_ENGINE_VERSION, responsibility: "ordem operacional de providers; nunca escolhe produto" },
  { id: "conditional_provider_fetch", module: "conditionalProviderFetch.js", patch: "05E", version: CONDITIONAL_PROVIDER_FETCH_VERSION, responsibility: "suficiência e short-circuit entre providers" },
  { id: "commercial_request_deduplication", module: "commercialRequestDeduplication.js", patch: "05C", version: COMMERCIAL_REQUEST_DEDUP_VERSION, responsibility: "evitar chamada equivalente na mesma request" },
  { id: "universal_commercial_cache", module: "universalCommercialCache.js", patch: "05D", version: UNIVERSAL_COMMERCIAL_CACHE_VERSION, responsibility: "reutilizar resultado recente entre requests" },
  { id: "provider_cost_guard", module: "providerCostGuard.js", patch: "05B", version: PROVIDER_COST_GUARD_VERSION, responsibility: "impedir custo não autorizado" },
  { id: "provider_budget_circuit_breaker", module: "providerBudgetCircuitBreaker.js", patch: "05F", version: PROVIDER_BUDGET_CIRCUIT_VERSION, responsibility: "limitar chamadas e isolar provider instável" },
  { id: "provider_fetch", module: "adapters/*", responsibility: "chamar fonte externa e normalizar resposta" },
  { id: "normalized_product", module: "normalizedProduct.js", version: NORMALIZED_PRODUCT_VERSION, responsibility: "contrato canônico de produto comercial" },
  { id: "commercial_query_product_alignment", module: "commercialQueryProductAlignmentLayer.js", version: COMMERCIAL_QUERY_PRODUCT_ALIGNMENT_VERSION, responsibility: "correspondência query ↔ oferta" },
  { id: "commercial_offer_merge", module: "commercialOfferMergeLayer.js", version: COMMERCIAL_OFFER_MERGE_LAYER_VERSION, responsibility: "combinar resultados de providers" },
  { id: "commercial_offer_dedup", module: "commercialDeduplicationLayer.js", version: COMMERCIAL_DEDUPLICATION_LAYER_VERSION, responsibility: "remover ofertas comerciais repetidas" },
  { id: "commercial_selection", module: "commercialSelectionEngine.js", version: COMMERCIAL_SELECTION_ENGINE_VERSION, responsibility: "selecionar oferta comercial conforme contrato atual" },
  { id: "governed_fallback_payload", module: "governedFallbackPayloadBuilder.js", patch: "4E-B.6", version: GOVERNED_FALLBACK_PAYLOAD_BUILDER_VERSION, responsibility: "estruturar dados do fallback" },
  { id: "universal_governed_fallback_reasoning", module: "universalGovernedFallbackReasoning.js", patch: "4E-B.7", version: UNIVERSAL_GOVERNED_FALLBACK_REASONING_VERSION, responsibility: "gerar reasoning seguro" },
  { id: "universal_category_signals", module: "universalCategorySignalLibrary.js", patch: "4E-B.9", version: UNIVERSAL_CATEGORY_SIGNAL_LIBRARY_VERSION, responsibility: "normalizar sinais de categoria" },
  { id: "universal_fallback_prompt_contract", module: "universalFallbackPromptContract.js", patch: "4E-B.8", version: UNIVERSAL_FALLBACK_PROMPT_CONTRACT_VERSION, responsibility: "limitar verbalização do LLM" },
  { id: "llm_verbalization", module: "chat-gpt4o.js / miaPrompt.js", responsibility: "apenas verbalizar; MIA owns intelligence" },
]);

export const OFFICIAL_COMMERCIAL_TRACER_KEYS = Object.freeze([
  "provider_cost_guard",
  "commercial_request_deduplication",
  "universal_commercial_cache",
  "conditional_provider_fetch",
  "provider_budget_circuit_breaker",
  "dev_commercial_cost_guard",
  "mercadolivre_runtime_activation",
  "multi_provider_priority_engine",
  "commercial_coverage_validation",
  "commercial_fallback_pipeline",
  "governed_fallback_payload",
  "universal_governed_fallback_reasoning",
  "universal_category_signals",
  "universal_fallback_prompt_contract",
]);

export const OFFICIAL_COMMERCIAL_ENV_FLAGS = Object.freeze([
  { name: "COMMERCIAL_RUNTIME_MODE", defaultValue: "legacy", purpose: "legacy | shadow | controlled", risk: "controlled inativo por default" },
  { name: "ENABLE_COMMERCIAL_RUNTIME_SHADOW", defaultValue: "false", purpose: "shadow diagnostics em legacy", risk: "LOW" },
  { name: MERCADOLIVRE_COMMERCIAL_PROVIDER_ENABLED_ENV, defaultValue: "false", purpose: "ativa ML em controlled", risk: "MEDIUM se true sem auth" },
  { name: MULTI_PROVIDER_PRIORITY_ENABLED_ENV, defaultValue: "true", purpose: "Priority Engine", risk: "LOW" },
  { name: MULTI_PROVIDER_PRIORITY_STRATEGY_ENV, defaultValue: "cost_balanced", purpose: "estratégia de ordem", risk: "LOW" },
  { name: "COMMERCIAL_CACHE_ENABLED", defaultValue: "true", purpose: "Universal Cache", risk: "LOW" },
  { name: "COMMERCIAL_CACHE_TTL_MS", defaultValue: "300000", purpose: "TTL cache positivo", risk: "LOW" },
  { name: "COMMERCIAL_EMPTY_CACHE_TTL_MS", defaultValue: "45000", purpose: "TTL cache vazio", risk: "LOW" },
  { name: "COMMERCIAL_CACHE_MAX_ENTRIES", defaultValue: "500", purpose: "limite de entradas", risk: "LOW" },
  { name: "COMMERCIAL_PROVIDER_BUDGET_ENABLED", defaultValue: "true", purpose: "budget por provider", risk: "LOW" },
  { name: "COMMERCIAL_PROVIDER_DEFAULT_MAX_CALLS_PER_WINDOW", defaultValue: "100", purpose: "budget default", risk: "LOW" },
  { name: "COMMERCIAL_PROVIDER_BUDGET_WINDOW_MS", defaultValue: "86400000", purpose: "janela budget", risk: "LOW" },
  { name: "COMMERCIAL_PROVIDER_CIRCUIT_ENABLED", defaultValue: "true", purpose: "circuit breaker", risk: "LOW" },
  { name: "COMMERCIAL_PROVIDER_CIRCUIT_FAILURE_THRESHOLD", defaultValue: "3", purpose: "falhas para abrir circuit", risk: "LOW" },
  { name: "COMMERCIAL_PROVIDER_CIRCUIT_OPEN_MS", defaultValue: "60000", purpose: "duração circuit open", risk: "LOW" },
  { name: "COMMERCIAL_PROVIDER_CIRCUIT_HALF_OPEN_MAX_PROBES", defaultValue: "1", purpose: "probes half-open", risk: "LOW" },
  { name: DEV_COMMERCIAL_REAL_EXECUTION_OPT_IN_ENV, defaultValue: "false", purpose: "DEV execução real", risk: "CRITICAL se true sem controle" },
  { name: PAID_PROVIDER_OBSERVABILITY_OPT_IN_ENV, defaultValue: "false", purpose: "observability paga", risk: "HIGH se true" },
  { name: COMMERCIAL_COVERAGE_REAL_VALIDATION_ENABLED_ENV, defaultValue: "false", purpose: "coverage real", risk: "HIGH se true sem opt-in CLI" },
  { name: "SERPAPI_KEY", defaultValue: "(secret)", purpose: "auth Google Shopping", risk: "secret" },
  { name: "APIFY_API_TOKEN", defaultValue: "(secret)", purpose: "auth Apify", risk: "secret" },
  { name: "MERCADOLIVRE_CLIENT_ID", defaultValue: "(secret)", purpose: "OAuth ML", risk: "secret" },
  { name: "MERCADOLIVRE_CLIENT_SECRET", defaultValue: "(secret)", purpose: "OAuth ML", risk: "secret" },
  { name: "MERCADOLIVRE_REDIRECT_URI", defaultValue: "(secret)", purpose: "OAuth ML", risk: "secret" },
  { name: "MERCADOLIVRE_ACCESS_TOKEN", defaultValue: "(secret)", purpose: "OAuth ML", risk: "secret" },
  { name: "MERCADOLIVRE_SITE_ID", defaultValue: "MLB", purpose: "site ML", risk: "LOW" },
  { name: "DEV_API_SECRET", defaultValue: "(secret)", purpose: "protege endpoints DEV em prod", risk: "secret" },
]);

export const ACCEPTED_MVP_LIMITATIONS = Object.freeze([
  {
    id: "legacy_commercial_router",
    level: COMMERCIAL_RUNTIME_RISK_LEVELS.ACCEPTED_MVP_LIMITATION,
    summary: "chat-gpt4o.js usa ordem hardcoded (ML → supabasecache → serpapi) fora do Priority Engine quando COMMERCIAL_RUNTIME_MODE=legacy",
    mitigation: "Ativar controlled runtime ou migrar legacy router em patch futuro",
  },
  {
    id: "legacy_functional_default_allow",
    level: COMMERCIAL_RUNTIME_RISK_LEVELS.ACCEPTED_MVP_LIMITATION,
    summary: "SerpAPI funcional em produção passa por Cost Guard com LEGACY_FUNCTIONAL_DEFAULT_ALLOW",
    mitigation: "Budget/Circuit/Cache/Dedup permanecem ativos via adapter",
  },
  {
    id: "dual_cache_layers",
    level: COMMERCIAL_RUNTIME_RISK_LEVELS.ACCEPTED_MVP_LIMITATION,
    summary: "COMMERCIAL_SEARCH_CACHE legacy coexiste com Universal Commercial Cache",
    mitigation: "Documentado; convergência pós-MVP",
  },
  {
    id: "supabasecache_legacy_only",
    level: COMMERCIAL_RUNTIME_RISK_LEVELS.ACCEPTED_MVP_LIMITATION,
    summary: "supabasecache existe apenas no legacy router e cost audit, não no Provider Registry 4B.3",
    mitigation: "Provider interno legacy; registry futuro se necessário",
  },
  {
    id: "coverage_real_not_executed",
    level: COMMERCIAL_RUNTIME_RISK_LEVELS.ACCEPTED_MVP_LIMITATION,
    summary: "FASE 2 coverage validation real aguarda autorização explícita",
    mitigation: "Executar scripts/run-mia-commercial-coverage-validation.js com opt-in",
  },
]);

function readRootFile(relativePath = "") {
  const fullPath = join(ROOT, relativePath);
  if (!existsSync(fullPath)) return "";
  return readFileSync(fullPath, "utf8");
}

function resolveProviderMvpStatus(metadata = {}) {
  if (metadata.id === COMMERCIAL_PROVIDER_IDS.AMAZON) return "planned";
  if (metadata.id === COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC) {
    return metadata.enabled ? "controlled_optional" : "controlled_optional";
  }
  if (metadata.enabled === true && metadata.billingTier === "paid_external") return "active";
  if (metadata.enabled === true && metadata.billingTier === "free_external") return "controlled_optional";
  return metadata.enabled ? "active" : "disabled";
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
export function buildCommercialRuntimeProductionFreezeManifest(env = process.env) {
  const providers = listCommercialProviderOperationalMetadata(env);
  const runtimeMode = getCommercialRuntimeMode(env?.COMMERCIAL_RUNTIME_MODE);
  const priorityPlan = buildMultiProviderPriorityPlan({
    runtimeMode: COMMERCIAL_RUNTIME_MODES.CONTROLLED,
    env,
  });
  const shadowPlan = buildMultiProviderPriorityPlan({
    runtimeMode: COMMERCIAL_RUNTIME_MODES.SHADOW,
    env,
  });

  return {
    version: COMMERCIAL_RUNTIME_PRODUCTION_FREEZE_VERSION,
    freezeDate: COMMERCIAL_RUNTIME_PRODUCTION_FREEZE_DATE,
    runtimeModeDefault: COMMERCIAL_RUNTIME_MODES.LEGACY,
    runtimeModeCurrent: runtimeMode,
    pipeline: OFFICIAL_COMMERCIAL_PIPELINE_LAYERS,
    patchVersions: {
      "05A": PROVIDER_COST_AUDIT_VERSION,
      "05B": PROVIDER_COST_GUARD_VERSION,
      "05C": COMMERCIAL_REQUEST_DEDUP_VERSION,
      "05D": UNIVERSAL_COMMERCIAL_CACHE_VERSION,
      "05E": CONDITIONAL_PROVIDER_FETCH_VERSION,
      "05F": PROVIDER_BUDGET_CIRCUIT_VERSION,
      "05G": DEV_COMMERCIAL_COST_GUARD_VERSION,
      "05H": MERCADOLIVRE_RUNTIME_ACTIVATION_VERSION,
      "05I": MULTI_PROVIDER_PRIORITY_ENGINE_VERSION,
      "05J": COMMERCIAL_COVERAGE_VALIDATION_VERSION,
      "4E-B": COMMERCIAL_RUNTIME_MODE_VERSION,
      "4E-B.1": COMMERCIAL_RUNTIME_ACTIVATION_VERSION,
      "4E-B.6": GOVERNED_FALLBACK_PAYLOAD_BUILDER_VERSION,
      "4E-B.7": UNIVERSAL_GOVERNED_FALLBACK_REASONING_VERSION,
      "4E-B.8": UNIVERSAL_FALLBACK_PROMPT_CONTRACT_VERSION,
      "4E-B.9": UNIVERSAL_CATEGORY_SIGNAL_LIBRARY_VERSION,
      "4E-C": COMMERCIAL_FALLBACK_PIPELINE_VERSION,
      "4E-A.2": COMMERCIAL_RUNTIME_SHADOW_VERSION,
    },
    providers: providers.map((metadata) => ({
      providerId: metadata.id,
      enabledDefault: metadata.id === COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC ? false : metadata.enabled === true,
      activationEnv:
        metadata.id === COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC
          ? MERCADOLIVRE_COMMERCIAL_PROVIDER_ENABLED_ENV
          : null,
      billingTier: metadata.billingTier,
      supportsControlled: metadata.supportsControlled === true,
      supportsShadow: metadata.supportsShadow === true,
      requiresAuth: metadata.requiresAuth === true,
      authEnvKeys: metadata.authEnvKeys || [],
      timeoutMs: metadata.timeoutMs,
      contractVersion: metadata.version,
      registryPosition: metadata.registryPosition,
      mvpStatus: resolveProviderMvpStatus(metadata),
    })),
    legacyProviders: Object.freeze([
      Object.freeze({
        providerId: "supabasecache",
        billingTier: "internal",
        mvpStatus: "active_legacy_only",
        notes: "Somente no legacy router chat-gpt4o.js",
      }),
    ]),
    envFlags: OFFICIAL_COMMERCIAL_ENV_FLAGS,
    tracerKeys: OFFICIAL_COMMERCIAL_TRACER_KEYS,
    controlledPriorityOrder: priorityPlan.orderedProviders.map((entry) => entry.providerId),
    shadowPriorityOrder: shadowPlan.orderedProviders.map((entry) => entry.providerId),
    shadowSkippedProviders: shadowPlan.skippedProviders,
    acceptedMvpLimitations: ACCEPTED_MVP_LIMITATIONS,
    configs: {
      priority: readMultiProviderPriorityConfig(env),
      cache: readUniversalCommercialCacheConfig(env),
      budgetCircuit: readProviderBudgetCircuitConfig(env),
      conditionalFetch: readConditionalProviderFetchConfig(env),
      paidObservabilityOptIn: isPaidProviderObservabilityOptInEnabled(env),
      coverage: readCommercialCoverageValidationConfig(env, []),
      devRealExternalCallsEnabled: isCommercialDevRealExternalCallsEnabled(env),
      shadowDiagnosticsEnabled: isCommercialRuntimeShadowDiagnosticsEnabled(runtimeMode),
    },
  };
}

/**
 * @param {Record<string, unknown>} [metadata]
 */
export function validateCommercialProviderFreezeMetadata(metadata = {}) {
  const issues = [];
  if (!metadata.id) issues.push("missing_provider_id");
  if (!metadata.billingTier) issues.push("missing_billing_tier");
  if (metadata.supportsShadow === true && metadata.supportsControlled !== true) {
    issues.push("shadow_without_controlled");
  }
  if (metadata.billingTier === "unknown" && metadata.enabled === true && metadata.supportsControlled) {
    issues.push("unknown_billing_enabled");
  }
  return { ok: issues.length === 0, issues };
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
export function validateCommercialRuntimeSafeDefaults(env = {}) {
  const issues = [];
  const safeEnv = {
    ...env,
    [DEV_COMMERCIAL_REAL_EXECUTION_OPT_IN_ENV]: env?.[DEV_COMMERCIAL_REAL_EXECUTION_OPT_IN_ENV] ?? "false",
    [COMMERCIAL_COVERAGE_REAL_VALIDATION_ENABLED_ENV]:
      env?.[COMMERCIAL_COVERAGE_REAL_VALIDATION_ENABLED_ENV] ?? "false",
    [PAID_PROVIDER_OBSERVABILITY_OPT_IN_ENV]:
      env?.[PAID_PROVIDER_OBSERVABILITY_OPT_IN_ENV] ?? "false",
    [MERCADOLIVRE_COMMERCIAL_PROVIDER_ENABLED_ENV]:
      env?.[MERCADOLIVRE_COMMERCIAL_PROVIDER_ENABLED_ENV] ?? "false",
  };

  if (isCommercialDevRealExternalCallsEnabled(safeEnv)) issues.push("dev_real_external_enabled");
  if (readCommercialCoverageValidationConfig(safeEnv, []).realValidationEnabled) {
    issues.push("coverage_real_enabled");
  }
  if (readUniversalCommercialCacheConfig(safeEnv).maxEntries <= 0) issues.push("cache_max_entries_invalid");
  if (readProviderBudgetCircuitConfig(safeEnv).budgetEnabled !== true) issues.push("budget_disabled");
  if (readProviderBudgetCircuitConfig(safeEnv).circuitEnabled !== true) issues.push("circuit_disabled");

  const mlShadow = evaluateProviderRuntimeEligibility({
    metadata: getCommercialProviderOperationalMetadata(COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC, safeEnv),
    runtimeMode: COMMERCIAL_RUNTIME_MODES.SHADOW,
    env: safeEnv,
  });
  if (mlShadow.eligible) issues.push("mercadolivre_allowed_in_shadow");

  return { ok: issues.length === 0, issues, safeEnv };
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
export function validateCommercialRuntimeProductionFreeze(env = process.env) {
  const manifest = buildCommercialRuntimeProductionFreezeManifest(env);
  const findings = [];
  let openCritical = 0;
  let openHigh = 0;

  for (const metadata of listCommercialProviderOperationalMetadata(env)) {
    const validation = validateCommercialProviderFreezeMetadata(metadata);
    if (!validation.ok) {
      findings.push({
        id: `provider_metadata_${metadata.id}`,
        level: COMMERCIAL_RUNTIME_RISK_LEVELS.MEDIUM,
        detail: validation.issues.join(","),
      });
    }
  }

  const defaults = validateCommercialRuntimeSafeDefaults(env);
  if (!defaults.ok) {
    for (const issue of defaults.issues) {
      const level =
        issue === "mercadolivre_allowed_in_shadow"
          ? COMMERCIAL_RUNTIME_RISK_LEVELS.HIGH
          : COMMERCIAL_RUNTIME_RISK_LEVELS.MEDIUM;
      findings.push({ id: issue, level, detail: issue });
      if (level === COMMERCIAL_RUNTIME_RISK_LEVELS.HIGH) openHigh += 1;
    }
  }

  const mlShadowSkip = manifest.shadowSkippedProviders.some(
    (entry) =>
      entry.providerId === COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC &&
      entry.skipReason === MULTI_PROVIDER_PRIORITY_SKIP_REASONS.SKIPPED_UNSUPPORTED_RUNTIME
  );
  if (!mlShadowSkip) {
    findings.push({
      id: "mercadolivre_shadow_ambiguity",
      level: COMMERCIAL_RUNTIME_RISK_LEVELS.HIGH,
      detail: "Mercado Livre não está explicitamente skipped em shadow",
    });
    openHigh += 1;
  }

  const chatSource = readRootFile("pages/api/chat-gpt4o.js");
  const getFinalPriceSource = readRootFile("pages/api/get-final-price.js");
  const freezeDocExists = existsSync(join(ROOT, "docs/commercial-runtime-production-freeze.md"));

  if (getFinalPriceSource.includes("fetchSerpPrices(") && !getFinalPriceSource.includes("fetchGoogleShoppingAdapterResult")) {
    findings.push({
      id: "get_final_price_unguarded_serp",
      level: COMMERCIAL_RUNTIME_RISK_LEVELS.CRITICAL,
      detail: "get-final-price ainda chama fetchSerpPrices sem adapter stack",
    });
    openCritical += 1;
  }

  if (chatSource.includes("fetchSerpPrices(")) {
    findings.push({
      id: "chat_direct_fetch_serp_prices",
      level: COMMERCIAL_RUNTIME_RISK_LEVELS.ACCEPTED_MVP_LIMITATION,
      detail: "Caminhos legacy residuais em chat-gpt4o.js — corrigir em patch dedicado se persistir",
      documented: chatSource.includes("fetchGoogleShoppingLegacyResult"),
    });
  }

  if (!chatSource.includes("isMercadoLivreCommercialProviderRuntimeEnabled")) {
    findings.push({
      id: "legacy_ml_un gated",
      level: COMMERCIAL_RUNTIME_RISK_LEVELS.HIGH,
      detail: "Legacy ML fetch não respeita COMMERCIAL_PROVIDER_MERCADOLIVRE_ENABLED",
    });
    openHigh += 1;
  }

  if (!freezeDocExists) {
    findings.push({
      id: "missing_freeze_document",
      level: COMMERCIAL_RUNTIME_RISK_LEVELS.MEDIUM,
      detail: "docs/commercial-runtime-production-freeze.md ausente",
    });
  }

  const requiredModules = [
    "lib/commercial/providerCostGuard.js",
    "lib/commercial/multiProviderPriorityEngine.js",
    "lib/commercial/commercialCoverageValidation.js",
    "lib/commercial/commercialRuntimeProductionFreeze.js",
  ];
  for (const modulePath of requiredModules) {
    if (!existsSync(join(ROOT, modulePath))) {
      findings.push({
        id: `missing_module_${modulePath}`,
        level: COMMERCIAL_RUNTIME_RISK_LEVELS.CRITICAL,
        detail: modulePath,
      });
      openCritical += 1;
    }
  }

  const paidShadowGuard = evaluateProviderCostGuardForProvider(
    COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
    {
      invocationSource: "commercial_runtime_shadow_pipeline",
      runtimeMode: COMMERCIAL_RUNTIME_MODES.SHADOW,
      endpointLevelDryRun: true,
    }
  );
  if (paidShadowGuard.shouldCallProvider === true && paidShadowGuard.reasonCode === "paid_observability_allowed_opt_in") {
    findings.push({
      id: "shadow_paid_default_allowed",
      level: COMMERCIAL_RUNTIME_RISK_LEVELS.MEDIUM,
      detail: "Shadow paid observability requer opt-in — confirmar default seguro",
    });
  }

  let status = COMMERCIAL_RUNTIME_FREEZE_STATUS.PRODUCTION_FREEZE_APPROVED;
  if (openCritical > 0) {
    status = COMMERCIAL_RUNTIME_FREEZE_STATUS.FREEZE_BLOCKED;
  } else if (openHigh > 0 || ACCEPTED_MVP_LIMITATIONS.length > 0) {
    status = COMMERCIAL_RUNTIME_FREEZE_STATUS.FREEZE_APPROVED_WITH_ACCEPTED_MVP_LIMITATIONS;
  }

  return {
    version: COMMERCIAL_RUNTIME_PRODUCTION_FREEZE_VERSION,
    status,
    ok: openCritical === 0,
    openCritical,
    openHigh,
    findings,
    manifest,
    defaults,
    acceptedMvpLimitations: ACCEPTED_MVP_LIMITATIONS,
  };
}

export function buildCommercialRuntimeFreezeDiagnostics(validation = null) {
  const result = validation || validateCommercialRuntimeProductionFreeze();
  return {
    version: COMMERCIAL_RUNTIME_PRODUCTION_FREEZE_VERSION,
    status: result.status,
    openCritical: result.openCritical,
    openHigh: result.openHigh,
    findingCount: result.findings.length,
    pipelineLayerCount: OFFICIAL_COMMERCIAL_PIPELINE_LAYERS.length,
    providerCount: result.manifest.providers.length,
    tracerKeyCount: OFFICIAL_COMMERCIAL_TRACER_KEYS.length,
  };
}

export function buildCommercialRuntimeRollbackChecklist() {
  return Object.freeze([
    Object.freeze({ step: 1, action: "Definir COMMERCIAL_RUNTIME_MODE=legacy", effect: "Desativa pipeline controlled" }),
    Object.freeze({ step: 2, action: `Definir ${MERCADOLIVRE_COMMERCIAL_PROVIDER_ENABLED_ENV}=false`, effect: "Desativa Mercado Livre controlled" }),
    Object.freeze({ step: 3, action: `Definir ${DEV_COMMERCIAL_REAL_EXECUTION_OPT_IN_ENV}=false`, effect: "Bloqueia execução real DEV" }),
    Object.freeze({ step: 4, action: `Definir ${COMMERCIAL_COVERAGE_REAL_VALIDATION_ENABLED_ENV}=false`, effect: "Bloqueia coverage real" }),
    Object.freeze({ step: 5, action: `Definir ${PAID_PROVIDER_OBSERVABILITY_OPT_IN_ENV}=false`, effect: "Bloqueia observability paga" }),
    Object.freeze({ step: 6, action: "Manter COMMERCIAL_PROVIDER_BUDGET_ENABLED=true", effect: "Budget permanece ativo" }),
    Object.freeze({ step: 7, action: "Manter COMMERCIAL_PROVIDER_CIRCUIT_ENABLED=true", effect: "Circuit permanece ativo" }),
    Object.freeze({ step: 8, action: "Reiniciar processo / redeploy", effect: "Aplica envs" }),
    Object.freeze({ step: 9, action: "Validar tracer e audits locais 05B–05J", effect: "Confirma rollback" }),
  ]);
}

export function buildCommercialRuntimeFreezeDevPayload(env = process.env) {
  const validation = validateCommercialRuntimeProductionFreeze(env);
  return {
    version: COMMERCIAL_RUNTIME_PRODUCTION_FREEZE_VERSION,
    validation: {
      status: validation.status,
      ok: validation.ok,
      openCritical: validation.openCritical,
      openHigh: validation.openHigh,
      findings: validation.findings,
    },
    manifest: validation.manifest,
    rollbackChecklist: buildCommercialRuntimeRollbackChecklist(),
    diagnostics: buildCommercialRuntimeFreezeDiagnostics(validation),
  };
}

export function validateCommercialRuntimeFreezeBehaviorChecks() {
  const sufficient = evaluateCommercialResultSufficiency({
    query: "iphone 13",
    result: {
      ok: true,
      products: [{
        product_name: "Apple iPhone 13 128GB",
        price: "R$ 3.299",
        numericPrice: 3299,
        link: "https://example.com/iphone-13",
        thumbnail: "https://example.com/iphone.jpg",
        source: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
      }],
      count: 1,
    },
  });

  return {
    conditionalFetchSufficient: sufficient.decision === "sufficient",
    priorityEnginePresent: MULTI_PROVIDER_PRIORITY_ENGINE_VERSION === "05I",
    cacheConfig: readUniversalCommercialCacheConfig(),
    budgetConfig: readProviderBudgetCircuitConfig(),
  };
}
