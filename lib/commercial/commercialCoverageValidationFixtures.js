/**
 * PATCH Comercial 05J — Commercial Coverage Validation Fixtures
 *
 * Dataset auditável apenas para validação/coverage.
 * Não altera runtime, Decision Engine ou Data Layer.
 */

export const COMMERCIAL_COVERAGE_FIXTURES_VERSION = "05J";

/** @typedef {{ productName: string, queryUsed: string, brand?: string, notes?: string }} CommercialCoverageProductEntry */

/** Amostra representativa para auditoria sintética (10–15 produtos). */
export const COMMERCIAL_COVERAGE_AUDIT_DATASET = Object.freeze([
  Object.freeze({ productName: "iPhone 13", queryUsed: "iPhone 13", brand: "Apple" }),
  Object.freeze({ productName: "iPhone 15", queryUsed: "iPhone 15", brand: "Apple" }),
  Object.freeze({ productName: "Galaxy A15", queryUsed: "Samsung Galaxy A15", brand: "Samsung" }),
  Object.freeze({ productName: "Galaxy A55", queryUsed: "Samsung Galaxy A55", brand: "Samsung" }),
  Object.freeze({ productName: "Galaxy S23 FE", queryUsed: "Samsung Galaxy S23 FE", brand: "Samsung" }),
  Object.freeze({ productName: "Galaxy S24", queryUsed: "Samsung Galaxy S24", brand: "Samsung" }),
  Object.freeze({ productName: "Moto G54", queryUsed: "Motorola Moto G54", brand: "Motorola" }),
  Object.freeze({ productName: "Moto G84", queryUsed: "Motorola Moto G84", brand: "Motorola" }),
  Object.freeze({ productName: "Edge 40", queryUsed: "Motorola Edge 40", brand: "Motorola" }),
  Object.freeze({ productName: "Redmi Note 13", queryUsed: "Xiaomi Redmi Note 13", brand: "Xiaomi" }),
  Object.freeze({ productName: "POCO X6", queryUsed: "POCO X6", brand: "POCO" }),
  Object.freeze({ productName: "Realme C67", queryUsed: "Realme C67", brand: "Realme" }),
]);

/** Primeira rodada real controlada — máximo 5 produtos. */
export const COMMERCIAL_COVERAGE_REAL_INITIAL_DATASET = Object.freeze([
  Object.freeze({ productName: "iPhone 13", queryUsed: "iPhone 13", brand: "Apple" }),
  Object.freeze({ productName: "Galaxy A55", queryUsed: "Samsung Galaxy A55", brand: "Samsung" }),
  Object.freeze({ productName: "Galaxy S23 FE", queryUsed: "Samsung Galaxy S23 FE", brand: "Samsung" }),
  Object.freeze({ productName: "Moto G84", queryUsed: "Motorola Moto G84", brand: "Motorola" }),
  Object.freeze({ productName: "Redmi Note 13", queryUsed: "Xiaomi Redmi Note 13", brand: "Xiaomi" }),
]);

function validProduct(title, overrides = {}) {
  return {
    product_name: title,
    price: overrides.price ?? "R$ 2.499,00",
    numericPrice: overrides.numericPrice ?? 2499,
    link: overrides.link ?? `https://example.com/${encodeURIComponent(title)}`,
    thumbnail: overrides.thumbnail ?? "https://example.com/image.jpg",
    source: overrides.source ?? "google_shopping",
    provider: overrides.provider ?? "google_shopping",
  };
}

/** Cenários sintéticos marcados explicitamente como synthetic. */
export const COMMERCIAL_COVERAGE_SYNTHETIC_SCENARIOS = Object.freeze({
  full_coverage: Object.freeze({
    id: "full_coverage",
    synthetic: true,
    queryUsed: "iPhone 13",
    productName: "iPhone 13",
    providerResults: Object.freeze({
      google_shopping: Object.freeze({
        ok: true,
        products: [validProduct("Apple iPhone 13 128GB")],
        count: 1,
      }),
    }),
  }),
  missing_image: Object.freeze({
    id: "missing_image",
    synthetic: true,
    queryUsed: "Galaxy A55",
    productName: "Galaxy A55",
    providerResults: Object.freeze({
      google_shopping: Object.freeze({
        ok: true,
        products: [validProduct("Samsung Galaxy A55 128GB", { thumbnail: null })],
        count: 1,
      }),
    }),
  }),
  missing_price: Object.freeze({
    id: "missing_price",
    synthetic: true,
    queryUsed: "Moto G84",
    productName: "Moto G84",
    providerResults: Object.freeze({
      google_shopping: Object.freeze({
        ok: true,
        products: [validProduct("Motorola Moto G84", { price: null, numericPrice: null })],
        count: 1,
      }),
    }),
  }),
  missing_url: Object.freeze({
    id: "missing_url",
    synthetic: true,
    queryUsed: "Galaxy S23 FE",
    productName: "Galaxy S23 FE",
    providerResults: Object.freeze({
      google_shopping: Object.freeze({
        ok: true,
        products: [validProduct("Samsung Galaxy S23 FE", { link: "" })],
        count: 1,
      }),
    }),
  }),
  misaligned: Object.freeze({
    id: "misaligned",
    synthetic: true,
    queryUsed: "iPhone 13",
    productName: "iPhone 13",
    providerResults: Object.freeze({
      google_shopping: Object.freeze({
        ok: true,
        products: [validProduct("Capa silicone iPhone 13")],
        count: 1,
      }),
    }),
  }),
  empty: Object.freeze({
    id: "empty",
    synthetic: true,
    queryUsed: "iPhone 15",
    productName: "iPhone 15",
    providerResults: Object.freeze({
      google_shopping: Object.freeze({ ok: true, products: [], count: 0 }),
    }),
  }),
  auth_failure: Object.freeze({
    id: "auth_failure",
    synthetic: true,
    queryUsed: "Galaxy A55",
    productName: "Galaxy A55",
    providerResults: Object.freeze({
      google_shopping: Object.freeze({
        ok: false,
        products: [],
        count: 0,
        error: "auth_failed",
        reasonCode: "auth_failed",
      }),
    }),
  }),
  rate_limit: Object.freeze({
    id: "rate_limit",
    synthetic: true,
    queryUsed: "Moto G54",
    productName: "Moto G54",
    providerResults: Object.freeze({
      mercadolivre_public: Object.freeze({
        ok: false,
        products: [],
        count: 0,
        error: "rate_limited",
        reasonCode: "rate_limited",
      }),
    }),
  }),
  timeout: Object.freeze({
    id: "timeout",
    synthetic: true,
    queryUsed: "Edge 40",
    productName: "Edge 40",
    providerResults: Object.freeze({
      apify_mercadolivre: Object.freeze({
        ok: false,
        products: [],
        count: 0,
        error: "timeout",
        reasonCode: "timeout",
      }),
    }),
  }),
  provider_error: Object.freeze({
    id: "provider_error",
    synthetic: true,
    queryUsed: "POCO X6",
    productName: "POCO X6",
    providerResults: Object.freeze({
      apify_mercadolivre: Object.freeze({
        ok: false,
        products: [],
        count: 0,
        error: "provider_error",
        reasonCode: "provider_error",
      }),
    }),
  }),
  cache_hit: Object.freeze({
    id: "cache_hit",
    synthetic: true,
    queryUsed: "Redmi Note 13",
    productName: "Redmi Note 13",
    providerResults: Object.freeze({
      google_shopping: Object.freeze({
        ok: true,
        products: [validProduct("Xiaomi Redmi Note 13 128GB")],
        count: 1,
        universalCommercialCacheHit: true,
        cacheStatus: "hit",
      }),
    }),
  }),
  cost_guard_block: Object.freeze({
    id: "cost_guard_block",
    synthetic: true,
    queryUsed: "Galaxy S24",
    productName: "Galaxy S24",
    providerResults: Object.freeze({
      google_shopping: Object.freeze({
        ok: false,
        products: [],
        count: 0,
        error: "cost_guard_blocked",
        costGuardDecision: Object.freeze({ shouldCallProvider: false, decision: "dry_run" }),
      }),
    }),
  }),
  budget_block: Object.freeze({
    id: "budget_block",
    synthetic: true,
    queryUsed: "Realme C67",
    productName: "Realme C67",
    providerResults: Object.freeze({
      google_shopping: Object.freeze({
        ok: false,
        products: [],
        count: 0,
        error: "budget_blocked",
        budgetCircuitDecision: Object.freeze({ decision: "block_budget_exhausted" }),
      }),
    }),
  }),
  circuit_open: Object.freeze({
    id: "circuit_open",
    synthetic: true,
    queryUsed: "Galaxy A15",
    productName: "Galaxy A15",
    providerResults: Object.freeze({
      apify_mercadolivre: Object.freeze({
        ok: false,
        products: [],
        count: 0,
        error: "circuit_breaker_open",
        budgetCircuitDecision: Object.freeze({ decision: "block_circuit_open" }),
      }),
    }),
  }),
  provider_disabled: Object.freeze({
    id: "provider_disabled",
    synthetic: true,
    queryUsed: "Moto G84",
    productName: "Moto G84",
    providerResults: Object.freeze({
      mercadolivre_public: Object.freeze({
        ok: false,
        products: [],
        count: 0,
        error: "provider_disabled",
        reasonCode: "provider_disabled",
      }),
    }),
  }),
});

export function listCommercialCoverageSyntheticScenarioIds() {
  return Object.keys(COMMERCIAL_COVERAGE_SYNTHETIC_SCENARIOS);
}

export function getCommercialCoverageSyntheticScenario(id = "") {
  return COMMERCIAL_COVERAGE_SYNTHETIC_SCENARIOS[id] || null;
}
