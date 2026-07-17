/**
 * PATCH Comercial 05A — Commercial Provider Cost Audit
 *
 * Mapeamento arquitetural de consumo/custo de providers comerciais.
 * Observability-only — não chama APIs, não altera runtime, não otimiza.
 */

import { COMMERCIAL_PROVIDER_IDS } from "../productSourceAdapter/commercialProviderRegistry.js";
import { COMMERCIAL_RUNTIME_MODES } from "../productSourceAdapter/commercialRuntimeMode.js";

export const PROVIDER_COST_AUDIT_VERSION = "05A";

export const COMMERCIAL_COST_CLASSIFICATIONS = Object.freeze({
  REQUIRED: "required",
  IMPORTANT: "important",
  OPTIMIZABLE: "optimizable",
  SUSPICIOUS: "suspicious",
  UNNECESSARY: "unnecessary",
});

export const COMMERCIAL_COST_PROVIDER_TIERS = Object.freeze({
  PAID_EXTERNAL: "paid_external",
  FREE_EXTERNAL: "free_external",
  INTERNAL: "internal",
  DISABLED: "disabled",
});

export const COMMERCIAL_COST_PROVIDERS = Object.freeze([
  Object.freeze({
    id: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
    legacyIds: ["serpapi"],
    displayName: "Google Shopping (SerpAPI)",
    tier: COMMERCIAL_COST_PROVIDER_TIERS.PAID_EXTERNAL,
    billingUnit: "search_request",
    clientModule: "lib/productSourceAdapter/adapters/googleShoppingAdapter.js",
    transportModule: "lib/prices.js",
    envKeys: ["SERPAPI_KEY"],
    maxResultsDefault: 12,
    registryEnabled: true,
  }),
  Object.freeze({
    id: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO,
    legacyIds: ["dataforseo_google_shopping"],
    displayName: "Google Shopping (DataForSEO Merchant API)",
    tier: COMMERCIAL_COST_PROVIDER_TIERS.PAID_EXTERNAL,
    billingUnit: "merchant_task_serp",
    clientModule: "lib/productSourceAdapter/adapters/dataForSeoGoogleShoppingClient.js",
    transportModule: "lib/productSourceAdapter/adapters/dataForSeoGoogleShoppingClient.js",
    envKeys: ["DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"],
    maxResultsDefault: 12,
    registryEnabled: true,
  }),
  Object.freeze({
    id: COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE,
    legacyIds: ["apify_mercadolivre"],
    displayName: "Apify Mercado Livre Actor",
    tier: COMMERCIAL_COST_PROVIDER_TIERS.PAID_EXTERNAL,
    billingUnit: "actor_run_sync",
    clientModule: "lib/productSourceAdapter/adapters/apifyMercadoLivreClient.js",
    transportModule: "lib/productSourceAdapter/adapters/apifyMercadoLivreClient.js",
    envKeys: ["APIFY_API_TOKEN"],
    maxResultsDefault: 5,
    registryEnabled: true,
  }),
  Object.freeze({
    id: "mercadolivre_public",
    legacyIds: ["mercadolivre"],
    displayName: "Mercado Livre Public Search API",
    tier: COMMERCIAL_COST_PROVIDER_TIERS.FREE_EXTERNAL,
    billingUnit: "http_request",
    clientModule: "pages/api/chat-gpt4o.js",
    transportModule: "pages/api/chat-gpt4o.js",
    envKeys: [],
    maxResultsDefault: 12,
    registryEnabled: false,
  }),
  Object.freeze({
    id: "supabasecache",
    legacyIds: ["supabasecache"],
    displayName: "Supabase Commercial Cache",
    tier: COMMERCIAL_COST_PROVIDER_TIERS.INTERNAL,
    billingUnit: "database_read",
    clientModule: "pages/api/chat-gpt4o.js",
    transportModule: "pages/api/chat-gpt4o.js",
    envKeys: [],
    maxResultsDefault: 12,
    registryEnabled: false,
  }),
  Object.freeze({
    id: COMMERCIAL_PROVIDER_IDS.AMAZON,
    legacyIds: ["amazon"],
    displayName: "Amazon (planned)",
    tier: COMMERCIAL_COST_PROVIDER_TIERS.DISABLED,
    billingUnit: "none",
    clientModule: "lib/productSourceAdapter/adapters/stubAmazonAdapter.js",
    transportModule: null,
    envKeys: [],
    maxResultsDefault: 0,
    registryEnabled: false,
  }),
]);

export const COMMERCIAL_COST_CALL_GRAPH = Object.freeze({
  version: PROVIDER_COST_AUDIT_VERSION,
  flow: [
    "user_or_dev_trigger",
    "router_or_dev_endpoint",
    "commercial_runtime_mode_gate",
    "legacy_commercial_search_chain",
    "commercial_runtime_shadow_pipeline",
    "commercial_runtime_controlled_activation",
    "provider_registry_clients",
  ],
  nodes: Object.freeze([
    Object.freeze({ id: "user_chat", type: "entry", canIncurCost: true }),
    Object.freeze({ id: "dev_endpoint", type: "entry", canIncurCost: true }),
    Object.freeze({ id: "audit_script_http", type: "entry", canIncurCost: true }),
    Object.freeze({ id: "mia_cognitive_router", type: "router", canIncurCost: false }),
    Object.freeze({ id: "commercial_runtime_mode", type: "gate", canIncurCost: false }),
    Object.freeze({ id: "safe_fetch_serp_prices", type: "producer", canIncurCost: true }),
    Object.freeze({ id: "fetch_commercial_products_from_providers", type: "producer", canIncurCost: true }),
    Object.freeze({ id: "fetch_serp_prices_direct", type: "producer", canIncurCost: true }),
    Object.freeze({ id: "run_commercial_shadow_pipeline", type: "producer", canIncurCost: true }),
    Object.freeze({ id: "resolve_official_commercial_offer", type: "producer", canIncurCost: true }),
    Object.freeze({ id: "execute_commercial_runtime_shadow", type: "producer", canIncurCost: true }),
    Object.freeze({ id: "google_shopping_adapter", type: "provider_client", canIncurCost: true }),
    Object.freeze({ id: "apify_mercadolivre_client", type: "provider_client", canIncurCost: true }),
    Object.freeze({ id: "mercadolivre_public_inline", type: "provider_client", canIncurCost: true }),
    Object.freeze({ id: "supabase_cache", type: "provider_client", canIncurCost: false }),
    Object.freeze({ id: "commercial_deduplication_layer", type: "consumer", canIncurCost: false }),
    Object.freeze({ id: "commercial_selection_engine", type: "consumer", canIncurCost: false }),
    Object.freeze({ id: "commercial_fallback_pipeline", type: "consumer", canIncurCost: false }),
    Object.freeze({ id: "llm_verbalization", type: "consumer", canIncurCost: false }),
  ]),
  edges: Object.freeze([
    Object.freeze({ from: "user_chat", to: "mia_cognitive_router", label: "POST /api/chat-gpt4o" }),
    Object.freeze({ from: "dev_endpoint", to: "commercial_runtime_mode", label: "GET /api/dev/*" }),
    Object.freeze({ from: "mia_cognitive_router", to: "safe_fetch_serp_prices", label: "commercial_search_paths" }),
    Object.freeze({ from: "safe_fetch_serp_prices", to: "fetch_commercial_products_from_providers", label: "cache_miss" }),
    Object.freeze({ from: "fetch_commercial_products_from_providers", to: "mercadolivre_public_inline", label: "priority_1" }),
    Object.freeze({ from: "fetch_commercial_products_from_providers", to: "supabase_cache", label: "priority_2" }),
    Object.freeze({ from: "fetch_commercial_products_from_providers", to: "google_shopping_adapter", label: "priority_3_short_circuit" }),
    Object.freeze({ from: "user_chat", to: "fetch_serp_prices_direct", label: "image_search_and_multipart" }),
    Object.freeze({ from: "fetch_serp_prices_direct", to: "google_shopping_adapter", label: "direct_serpapi" }),
    Object.freeze({ from: "user_chat", to: "execute_commercial_runtime_shadow", label: "shadow_diagnostics_enabled" }),
    Object.freeze({ from: "execute_commercial_runtime_shadow", to: "run_commercial_shadow_pipeline", label: "force_or_flag" }),
    Object.freeze({ from: "user_chat", to: "resolve_official_commercial_offer", label: "controlled_activation_paths" }),
    Object.freeze({ from: "resolve_official_commercial_offer", to: "run_commercial_shadow_pipeline", label: "mode_controlled" }),
    Object.freeze({ from: "run_commercial_shadow_pipeline", to: "google_shopping_adapter", label: "parallel_fetch" }),
    Object.freeze({ from: "run_commercial_shadow_pipeline", to: "apify_mercadolivre_client", label: "parallel_fetch" }),
    Object.freeze({ from: "run_commercial_shadow_pipeline", to: "commercial_deduplication_layer", label: "merge_dedupe_select" }),
    Object.freeze({ from: "commercial_deduplication_layer", to: "commercial_selection_engine", label: "selection_only" }),
    Object.freeze({ from: "commercial_selection_engine", to: "commercial_fallback_pipeline", label: "observability_only" }),
    Object.freeze({ from: "commercial_fallback_pipeline", to: "llm_verbalization", label: "verbalize_only" }),
  ]),
});

export const COMMERCIAL_COST_ENTRY_POINTS = Object.freeze([
  Object.freeze({
    id: "chat_gpt4o_safe_fetch",
    surface: "production",
    file: "pages/api/chat-gpt4o.js",
    functionName: "safeFetchSerpPrices",
    providers: ["mercadolivre_public", "supabasecache", COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING],
    classification: COMMERCIAL_COST_CLASSIFICATIONS.REQUIRED,
    reason: "Fonte legada principal de ofertas comerciais para respostas de busca.",
    modes: [COMMERCIAL_RUNTIME_MODES.LEGACY, COMMERCIAL_RUNTIME_MODES.SHADOW, COMMERCIAL_RUNTIME_MODES.CONTROLLED],
  }),
  Object.freeze({
    id: "chat_gpt4o_direct_serp",
    surface: "production",
    file: "pages/api/chat-gpt4o.js",
    functionName: "fetchSerpPrices",
    providers: [COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING],
    classification: COMMERCIAL_COST_CLASSIFICATIONS.IMPORTANT,
    reason: "Busca comercial auxiliar em image search e queries multipart.",
    modes: ["all"],
  }),
  Object.freeze({
    id: "chat_gpt4o_shadow_observation",
    surface: "production",
    file: "pages/api/chat-gpt4o.js",
    functionName: "executeCommercialRuntimeShadow",
    providers: [COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING, COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE],
    classification: COMMERCIAL_COST_CLASSIFICATIONS.SUSPICIOUS,
    reason: "Dispara Google+Apify em paralelo para observação mesmo quando a busca legada já ocorreu.",
    modes: [COMMERCIAL_RUNTIME_MODES.LEGACY, COMMERCIAL_RUNTIME_MODES.SHADOW],
    activationFlags: ["ENABLE_COMMERCIAL_RUNTIME_SHADOW", "COMMERCIAL_RUNTIME_MODE=shadow"],
  }),
  Object.freeze({
    id: "chat_gpt4o_controlled_activation",
    surface: "production",
    file: "pages/api/chat-gpt4o.js",
    functionName: "applyCommercialRuntimeActivationToResponsePrices",
    providers: [COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING, COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE],
    classification: COMMERCIAL_COST_CLASSIFICATIONS.IMPORTANT,
    reason: "Pipeline oficial em controlled mode; necessário mas pode duplicar busca legada.",
    modes: [COMMERCIAL_RUNTIME_MODES.CONTROLLED],
  }),
  Object.freeze({
    id: "get_final_price",
    surface: "production",
    file: "pages/api/get-final-price.js",
    functionName: "fetchSerpPrices",
    providers: [COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING],
    classification: COMMERCIAL_COST_CLASSIFICATIONS.IMPORTANT,
    reason: "Endpoint auxiliar de preço; pode gerar SerpAPI fora do chat principal.",
    modes: ["all"],
  }),
  Object.freeze({
    id: "test_serp_public",
    surface: "production",
    file: "pages/api/test-serp.js",
    functionName: "fetchSerpPrices",
    providers: [COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING],
    classification: COMMERCIAL_COST_CLASSIFICATIONS.UNNECESSARY,
    reason: "Endpoint de teste público; risco de consumo acidental se exposto.",
    modes: ["all"],
  }),
  Object.freeze({
    id: "dev_apify_search",
    surface: "dev",
    file: "pages/api/dev/apify-mercadolivre-search.js",
    functionName: "searchApifyMercadoLivreProducts",
    providers: [COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE],
    classification: COMMERCIAL_COST_CLASSIFICATIONS.SUSPICIOUS,
    reason: "Chamada Apify direta; alto risco durante desenvolvimento local.",
    modes: ["dev_only"],
  }),
  Object.freeze({
    id: "dev_commercial_shadow",
    surface: "dev",
    file: "pages/api/dev/commercial-shadow.js",
    functionName: "executeCommercialRuntimeShadow",
    providers: [COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING, COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE],
    classification: COMMERCIAL_COST_CLASSIFICATIONS.SUSPICIOUS,
    reason: "Busca legacy SerpAPI + pipeline shadow Google+Apify na mesma requisição DEV.",
    modes: ["dev_only"],
  }),
  Object.freeze({
    id: "dev_commercial_runtime_activation",
    surface: "dev",
    file: "pages/api/dev/commercial-runtime-activation.js",
    functionName: "resolveOfficialCommercialOffer",
    providers: [COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING, COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE],
    classification: COMMERCIAL_COST_CLASSIFICATIONS.SUSPICIOUS,
    reason: "Legacy SerpAPI antes do pipeline controlled; triplica custo em mode=controlled.",
    modes: ["dev_only"],
  }),
  Object.freeze({
    id: "dev_commercial_pipeline_probes",
    surface: "dev",
    file: "pages/api/dev/commercial-{deduplication,offer-merge,selection,alignment}.js",
    functionName: "Promise.all provider fetch",
    providers: [COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING, COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE],
    classification: COMMERCIAL_COST_CLASSIFICATIONS.OPTIMIZABLE,
    reason: "Endpoints DEV de diagnóstico; sempre disparam Google+Apify juntos.",
    modes: ["dev_only"],
  }),
  Object.freeze({
    id: "audit_scripts_http_flag",
    surface: "scripts",
    file: "scripts/test-mia-*-audit.js",
    functionName: "--http optional blocks",
    providers: [COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING, COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE],
    classification: COMMERCIAL_COST_CLASSIFICATIONS.SUSPICIOUS,
    reason: "Audits locais podem chamar APIs reais quando executados com --http.",
    modes: ["manual"],
  }),
  Object.freeze({
    id: "price_alert_dry_run",
    surface: "internal",
    file: "lib/miaPriceAlertDryRun.js",
    functionName: "runCommercialShadowPipeline",
    providers: [COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING, COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE],
    classification: COMMERCIAL_COST_CLASSIFICATIONS.OPTIMIZABLE,
    reason: "Dry-run interno; pode usar pipeline real se fetchers não forem mockados.",
    modes: ["internal_job"],
  }),
]);

export const COMMERCIAL_COST_DUPLICATION_PATTERNS = Object.freeze([
  Object.freeze({
    id: "legacy_serp_plus_shadow_serp",
    severity: "high",
    providers: [COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING],
    description: "Mesma query pode chamar SerpAPI via safeFetchSerpPrices e novamente via runCommercialShadowPipeline.",
    trigger: "ENABLE_COMMERCIAL_RUNTIME_SHADOW=true ou mode=shadow",
    classification: COMMERCIAL_COST_CLASSIFICATIONS.SUSPICIOUS,
  }),
  Object.freeze({
    id: "legacy_serp_plus_apify_shadow",
    severity: "critical",
    providers: [COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE],
    description: "Apify actor run-sync é disparado em shadow/controlled mesmo sem usuários finais, somente por observação.",
    trigger: "executeCommercialRuntimeShadow ou mode=controlled",
    classification: COMMERCIAL_COST_CLASSIFICATIONS.SUSPICIOUS,
  }),
  Object.freeze({
    id: "dev_legacy_then_pipeline",
    severity: "high",
    providers: [COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING, COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE],
    description: "Endpoints DEV commercial-shadow e commercial-runtime-activation chamam legacy SerpAPI e depois pipeline paralelo.",
    trigger: "GET /api/dev/commercial-shadow ou /api/dev/commercial-runtime-activation",
    classification: COMMERCIAL_COST_CLASSIFICATIONS.SUSPICIOUS,
  }),
  Object.freeze({
    id: "parallel_google_apify_always",
    severity: "medium",
    providers: [COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING, COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE],
    description: "runCommercialShadowPipeline sempre executa Google e Apify em Promise.all, sem short-circuit.",
    trigger: "qualquer execução do shadow pipeline",
    classification: COMMERCIAL_COST_CLASSIFICATIONS.OPTIMIZABLE,
  }),
  Object.freeze({
    id: "controlled_after_legacy_prices",
    severity: "high",
    providers: [COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING, COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE],
    description: "Em controlled mode, preços legados já buscados podem ser seguidos de nova busca no activation.",
    trigger: "COMMERCIAL_RUNTIME_MODE=controlled",
    classification: COMMERCIAL_COST_CLASSIFICATIONS.OPTIMIZABLE,
  }),
  Object.freeze({
    id: "no_apify_cache",
    severity: "critical",
    providers: [COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE],
    description: "Apify não possui cache/cooldown equivalente ao legacy SerpAPI chain.",
    trigger: "qualquer chamada Apify",
    classification: COMMERCIAL_COST_CLASSIFICATIONS.SUSPICIOUS,
  }),
]);

export const COMMERCIAL_COST_PROTECTIONS = Object.freeze({
  existing: Object.freeze([
    Object.freeze({
      id: "commercial_search_cache",
      scope: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
      type: "cache",
      location: "pages/api/chat-gpt4o.js",
      ttlMs: 600000,
      notes: "Cache in-memory 10 min por query+limit na cadeia legacy.",
    }),
    Object.freeze({
      id: "provider_cooldown_map",
      scope: "mercadolivre_public,supabasecache,serpapi",
      type: "cooldown",
      location: "pages/api/chat-gpt4o.js",
      ttlMs: "provider_specific",
      notes: "Cooldown por provider após erro/rate limit.",
    }),
    Object.freeze({
      id: "commercial_search_empty_cooldown",
      scope: "legacy_chain",
      type: "cooldown",
      location: "pages/api/chat-gpt4o.js",
      ttlMs: 45000,
      notes: "Bloqueio temporário após busca vazia.",
    }),
    Object.freeze({
      id: "legacy_provider_short_circuit",
      scope: "legacy_chain",
      type: "short_circuit",
      location: "pages/api/chat-gpt4o.js",
      notes: "Para no primeiro provider com resultados.",
    }),
    Object.freeze({
      id: "apify_max_results_clamp",
      scope: COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE,
      type: "limit",
      location: "lib/productSourceAdapter/adapters/apifyMercadoLivreClient.js",
      notes: "Máximo 5 resultados por run.",
    }),
    Object.freeze({
      id: "shadow_activation_timeout",
      scope: "shadow_pipeline,controlled_activation",
      type: "timeout",
      location: "lib/productSourceAdapter/commercialRuntimeShadow.js",
      ttlMs: 15000,
      notes: "Timeout de 15s; não cancela billing Apify após run iniciado.",
    }),
    Object.freeze({
      id: "dev_endpoint_production_gate",
      scope: "dev_endpoints",
      type: "access_control",
      location: "pages/api/dev/*.js",
      notes: "DEV bloqueado em production sem DEV_API_SECRET.",
    }),
    Object.freeze({
      id: "commercial_runtime_mode_default_legacy",
      scope: "runtime",
      type: "gate",
      location: "lib/productSourceAdapter/commercialRuntimeMode.js",
      notes: "Default legacy evita pipeline Apify em produção sem flag.",
    }),
  ]),
  absent: Object.freeze([
    Object.freeze({ id: "apify_cache", type: "cache", scope: COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE }),
    Object.freeze({ id: "shadow_pipeline_cache", type: "cache", scope: "google_shopping,apify_mercadolivre" }),
    Object.freeze({ id: "request_coalescing", type: "dedupe", scope: "all_paid_providers" }),
    Object.freeze({ id: "cross_layer_query_dedupe", type: "dedupe", scope: "legacy_vs_shadow_vs_controlled" }),
    Object.freeze({ id: "provider_budget", type: "budget", scope: "all_paid_providers" }),
    Object.freeze({ id: "daily_spend_cap", type: "budget", scope: "all_paid_providers" }),
    Object.freeze({ id: "circuit_breaker_apify", type: "circuit_breaker", scope: COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE }),
    Object.freeze({ id: "apify_cooldown", type: "cooldown", scope: COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE }),
    Object.freeze({ id: "conditional_parallel_fetch", type: "short_circuit", scope: "runCommercialShadowPipeline" }),
    Object.freeze({ id: "provider_priority_budget", type: "priority", scope: "all_paid_providers" }),
    Object.freeze({ id: "retry_with_backoff_paid", type: "retry", scope: "all_paid_providers" }),
  ]),
});

export const COMMERCIAL_COST_HOTSPOTS = Object.freeze([
  Object.freeze({
    rank: 1,
    id: "apify_actor_run_sync",
    provider: COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE,
    financialRisk: "critical",
    reason: "Cada run-sync-get-dataset-items executa actor completo e consome créditos mesmo sem usuário final.",
  }),
  Object.freeze({
    rank: 2,
    id: "shadow_pipeline_dual_fetch",
    provider: "google_shopping+apify_mercadolivre",
    financialRisk: "high",
    reason: "Promise.all dispara dois providers pagos/free-high-limit por execução.",
  }),
  Object.freeze({
    rank: 3,
    id: "dev_commercial_endpoints",
    provider: "all_paid",
    financialRisk: "high",
    reason: "npm run dev + endpoints DEV podem consumir Apify/SerpAPI durante testes locais.",
  }),
  Object.freeze({
    rank: 4,
    id: "legacy_serp_duplicate",
    provider: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
    financialRisk: "medium",
    reason: "SerpAPI pode ser chamado na cadeia legacy e novamente no shadow/activation.",
  }),
  Object.freeze({
    rank: 5,
    id: "audit_scripts_http",
    provider: "all_paid",
    financialRisk: "medium",
    reason: "Scripts com flag --http podem disparar APIs reais manualmente.",
  }),
]);

export const COMMERCIAL_COST_OPTIMIZATION_ORDER = Object.freeze([
  "05B — Apify/shadow pipeline gate: não chamar Apify em shadow observability-only sem opt-in explícito",
  "05C — Cross-layer query dedupe: reutilizar resultados legacy no shadow/controlled quando mesma query/limit",
  "05D — Apify cache + cooldown universal por query",
  "05E — Conditional parallel fetch: short-circuit quando um provider já satisfaz seleção",
  "05F — Provider budget / daily cap / circuit breaker provider-agnostic",
  "05G — DEV cost guard: dry-run default nos endpoints DEV comerciais",
  "05H — Request coalescing para chamadas concorrentes idênticas",
  "05I — Telemetria de billing counters por provider no tracer",
]);

/**
 * Mapa completo de auditoria de custo (estático, provider-agnostic).
 */
export function buildCommercialProviderCostAudit() {
  return {
    version: PROVIDER_COST_AUDIT_VERSION,
    providers: COMMERCIAL_COST_PROVIDERS.map((provider) => ({ ...provider })),
    callGraph: buildCommercialProviderCostCallGraph(),
    entryPoints: COMMERCIAL_COST_ENTRY_POINTS.map((entry) => ({ ...entry })),
    duplicationPatterns: COMMERCIAL_COST_DUPLICATION_PATTERNS.map((entry) => ({ ...entry })),
    protections: buildCommercialProviderCostProtectionStatus(),
    riskMap: buildCommercialProviderCostRiskMap(),
    hotspots: COMMERCIAL_COST_HOTSPOTS.map((entry) => ({ ...entry })),
    optimizationOrder: [...COMMERCIAL_COST_OPTIMIZATION_ORDER],
    runtimeModes: Object.values(COMMERCIAL_RUNTIME_MODES),
    notes: {
      apifyMotivation:
        "Apify motivou esta auditoria, mas o modelo cobre qualquer provider registrado ou legado.",
      behaviorChange: false,
      callsExternalApis: false,
    },
  };
}

export function buildCommercialProviderCostCallGraph() {
  return {
    version: PROVIDER_COST_AUDIT_VERSION,
    ...COMMERCIAL_COST_CALL_GRAPH,
    paidProviderClients: COMMERCIAL_COST_PROVIDERS.filter(
      (provider) => provider.tier === COMMERCIAL_COST_PROVIDER_TIERS.PAID_EXTERNAL
    ).map((provider) => provider.id),
    nonBillingConsumers: COMMERCIAL_COST_CALL_GRAPH.nodes
      .filter((node) => node.canIncurCost === false)
      .map((node) => node.id),
  };
}

export function buildCommercialProviderCostRiskMap() {
  return {
    version: PROVIDER_COST_AUDIT_VERSION,
    byClassification: {
      required: COMMERCIAL_COST_ENTRY_POINTS.filter(
        (entry) => entry.classification === COMMERCIAL_COST_CLASSIFICATIONS.REQUIRED
      ).map((entry) => entry.id),
      important: COMMERCIAL_COST_ENTRY_POINTS.filter(
        (entry) => entry.classification === COMMERCIAL_COST_CLASSIFICATIONS.IMPORTANT
      ).map((entry) => entry.id),
      optimizable: COMMERCIAL_COST_ENTRY_POINTS.filter(
        (entry) => entry.classification === COMMERCIAL_COST_CLASSIFICATIONS.OPTIMIZABLE
      ).map((entry) => entry.id),
      suspicious: COMMERCIAL_COST_ENTRY_POINTS.filter(
        (entry) => entry.classification === COMMERCIAL_COST_CLASSIFICATIONS.SUSPICIOUS
      ).map((entry) => entry.id),
      unnecessary: COMMERCIAL_COST_ENTRY_POINTS.filter(
        (entry) => entry.classification === COMMERCIAL_COST_CLASSIFICATIONS.UNNECESSARY
      ).map((entry) => entry.id),
    },
    duplicationPatterns: COMMERCIAL_COST_DUPLICATION_PATTERNS.map((entry) => ({
      id: entry.id,
      severity: entry.severity,
      classification: entry.classification,
      providers: [...entry.providers],
    })),
    hotspots: COMMERCIAL_COST_HOTSPOTS.map((entry) => ({ ...entry })),
  };
}

export function buildCommercialProviderCostProtectionStatus() {
  return {
    version: PROVIDER_COST_AUDIT_VERSION,
    existing: COMMERCIAL_COST_PROTECTIONS.existing.map((entry) => ({ ...entry })),
    absent: COMMERCIAL_COST_PROTECTIONS.absent.map((entry) => ({ ...entry })),
    summary: {
      existingCount: COMMERCIAL_COST_PROTECTIONS.existing.length,
      absentCount: COMMERCIAL_COST_PROTECTIONS.absent.length,
      apifySpecificProtectionCount: COMMERCIAL_COST_PROTECTIONS.existing.filter((entry) =>
        String(entry.scope || "").includes("apify")
      ).length,
    },
  };
}

export function buildCommercialProviderCostAuditDiagnostics(audit = buildCommercialProviderCostAudit()) {
  return {
    version: audit.version || PROVIDER_COST_AUDIT_VERSION,
    providerCount: audit.providers?.length || 0,
    paidProviderCount:
      audit.providers?.filter((provider) => provider.tier === COMMERCIAL_COST_PROVIDER_TIERS.PAID_EXTERNAL)
        .length || 0,
    entryPointCount: audit.entryPoints?.length || 0,
    duplicationPatternCount: audit.duplicationPatterns?.length || 0,
    hotspotCount: audit.hotspots?.length || 0,
    suspiciousEntryPointCount:
      audit.entryPoints?.filter(
        (entry) => entry.classification === COMMERCIAL_COST_CLASSIFICATIONS.SUSPICIOUS
      ).length || 0,
    protectionsExisting: audit.protections?.summary?.existingCount || 0,
    protectionsAbsent: audit.protections?.summary?.absentCount || 0,
    callsExternalApis: false,
  };
}

export function buildCommercialProviderCostAuditDevPayload(audit = buildCommercialProviderCostAudit()) {
  return {
    version: audit.version || PROVIDER_COST_AUDIT_VERSION,
    providers: audit.providers,
    callGraph: audit.callGraph,
    entryPoints: audit.entryPoints,
    duplicationPatterns: audit.duplicationPatterns,
    protections: audit.protections,
    riskMap: audit.riskMap,
    hotspots: audit.hotspots,
    optimizationOrder: audit.optimizationOrder,
    diagnostics: buildCommercialProviderCostAuditDiagnostics(audit),
  };
}

/**
 * @param {string} entryPointId
 */
export function getCommercialProviderCostEntryPoint(entryPointId = "") {
  const key = String(entryPointId || "").trim();
  return COMMERCIAL_COST_ENTRY_POINTS.find((entry) => entry.id === key) || null;
}

/**
 * @param {string} providerId
 */
export function getCommercialProviderCostProfile(providerId = "") {
  const key = String(providerId || "").trim().toLowerCase();
  return (
    COMMERCIAL_COST_PROVIDERS.find(
      (provider) => provider.id === key || (provider.legacyIds || []).includes(key)
    ) || null
  );
}

/**
 * @param {string} providerId
 */
export function getCommercialProviderBillingProfile(providerId = "") {
  const profile = getCommercialProviderCostProfile(providerId);
  if (!profile) {
    return {
      id: String(providerId || "").trim().toLowerCase() || null,
      tier: "unknown",
      billingUnit: null,
    };
  }
  return {
    id: profile.id,
    tier: profile.tier,
    billingUnit: profile.billingUnit || null,
    legacyIds: profile.legacyIds || [],
    envKeys: profile.envKeys || [],
  };
}
