/**
 * PATCH Comercial 05L.2 — DataForSEO Google Shopping integration audit helpers
 *
 * Local-only structural checks and neutrality validation.
 */

import { createHash } from "node:crypto";
import {
  buildCommercialRequestDedupKey,
} from "./commercialRequestDeduplication.js";
import {
  buildUniversalCommercialCacheKey,
} from "./universalCommercialCache.js";
import {
  evaluateProviderBudgetPermission,
  getProviderCircuitState,
} from "./providerBudgetCircuitBreaker.js";
import {
  buildMultiProviderPriorityPlan,
} from "./multiProviderPriorityEngine.js";
import {
  COMMERCIAL_PROVIDER_IDS,
  DATAFORSEO_COMMERCIAL_PROVIDER_ENABLED_ENV,
  getCommercialProviderById,
  isCommercialProviderEnabled,
} from "../productSourceAdapter/commercialProviderRegistry.js";
import { COMMERCIAL_RUNTIME_MODES } from "../productSourceAdapter/commercialRuntimeMode.js";
import {
  DATAFORSEO_REASON_CODES,
  mapDataForSeoShoppingItemToNormalizedRaw,
  redactDataForSeoSecrets,
  validateDataForSeoEnv,
} from "../productSourceAdapter/adapters/dataForSeoGoogleShoppingClient.js";
import {
  fetchDataForSeoGoogleShoppingAdapterResult,
} from "../productSourceAdapter/adapters/dataForSeoGoogleShoppingAdapter.js";
import { PROVIDER_COST_GUARD_PROVIDER_IDS } from "./providerCostGuard.js";

export const DATAFORSEO_GOOGLE_SHOPPING_INTEGRATION_AUDIT_VERSION = "05L.2";
export const COMMERCIAL_DATAFORSEO_REAL_PROBE_ENABLED_ENV =
  "COMMERCIAL_DATAFORSEO_REAL_PROBE_ENABLED";

const AFFILIATE_FIELD_PATTERNS = [
  /affiliate/i,
  /commission/i,
  /payout/i,
  /cashback/i,
  /special_link/i,
  /tracking/i,
  /shop_ad_aclk/i,
  /coupon_code/i,
];

const NEUTRALITY_FORBIDDEN_PRODUCT_KEYS = Object.freeze([
  "commission",
  "payout",
  "affiliate_tag",
  "affiliate_link",
  "special_link",
  "cashback",
]);

function cleanText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * @param {Record<string, unknown>} product
 */
export function validateDataForSeoNormalizedProductNeutrality(product = {}) {
  const violations = [];

  for (const key of NEUTRALITY_FORBIDDEN_PRODUCT_KEYS) {
    if (product?.[key] != null && product[key] !== "") {
      violations.push(`forbidden_field:${key}`);
    }
  }

  const link = cleanText(product?.link || "");
  if (/tag=|affiliate|ref=|utm_source=partner/i.test(link)) {
    violations.push("affiliate_link_pattern");
  }

  return {
    ok: violations.length === 0,
    violations,
  };
}

/**
 * @param {unknown} payload
 */
export function validateDataForSeoRawPayloadNeutrality(payload) {
  const serialized = JSON.stringify(payload ?? {});
  const violations = [];

  for (const pattern of AFFILIATE_FIELD_PATTERNS) {
    if (pattern.test(serialized)) {
      violations.push(`raw_pattern:${pattern.source}`);
    }
  }

  return {
    ok: true,
    observedPromotionalFields: violations,
    note:
      violations.length > 0
        ? "Promotional API fields may exist but must not influence MIA ranking."
        : null,
  };
}

export function buildDataForSeoDisabledAuditEnv(overrides = {}) {
  return {
    COMMERCIAL_PROVIDER_DATAFORSEO_ENABLED: "false",
    COMMERCIAL_DATAFORSEO_REAL_PROBE_ENABLED: "false",
    DATAFORSEO_LOGIN: "",
    DATAFORSEO_PASSWORD: "",
    SERPAPI_KEY: "audit-serp-key",
    ...overrides,
  };
}

export function buildDataForSeoEnabledAuditEnv(overrides = {}) {
  return buildDataForSeoDisabledAuditEnv({
    COMMERCIAL_PROVIDER_DATAFORSEO_ENABLED: "true",
    DATAFORSEO_LOGIN: "audit-login@example.test",
    DATAFORSEO_PASSWORD: "audit-password-not-real",
    ...overrides,
  });
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
export function buildDataForSeoRealProbePlan(env = process.env) {
  const blockers = [];
  const query = "fone bluetooth";

  if (String(env?.[COMMERCIAL_DATAFORSEO_REAL_PROBE_ENABLED_ENV] || "").toLowerCase() !== "true") {
    blockers.push(`${COMMERCIAL_DATAFORSEO_REAL_PROBE_ENABLED_ENV}!=true`);
  }

  if (!isCommercialProviderEnabled(COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO, env)) {
    blockers.push("COMMERCIAL_PROVIDER_DATAFORSEO_ENABLED!=true");
  }

  const envValidation = validateDataForSeoEnv(env);
  if (!envValidation.ok) {
    blockers.push(`missing_env:${envValidation.missing.join(",")}`);
  }

  return {
    version: DATAFORSEO_GOOGLE_SHOPPING_INTEGRATION_AUDIT_VERSION,
    providerId: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO,
    query,
    maxCalls: 1,
    blockers,
    canExecuteExternal: blockers.length === 0,
    executionModel: "merchant_task_post_poll_task_get",
    endpoint: "https://api.dataforseo.com/v3/merchant/google/products/task_post",
  };
}

/**
 * @param {Record<string, unknown>} input
 */
export function buildDataForSeoIntegrationAuditSnapshot(input = {}) {
  const env = input.env || buildDataForSeoDisabledAuditEnv();
  const provider = getCommercialProviderById(
    COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO,
    env
  );
  const query = cleanText(input.query || "iphone 13");
  const limit = 5;

  const cacheKeyGoogle = buildUniversalCommercialCacheKey({
    providerId: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
    query,
    limit,
  });
  const cacheKeyDataForSeo = buildUniversalCommercialCacheKey({
    providerId: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO,
    query,
    limit,
  });

  const dedupKeyGoogle = buildCommercialRequestDedupKey({
    providerId: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
    query,
    limit,
  });
  const dedupKeyDataForSeo = buildCommercialRequestDedupKey({
    providerId: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO,
    query,
    limit,
  });

  const googleBudget = evaluateProviderBudgetPermission({
    providerId: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
    env,
  });
  const dataForSeoBudget = evaluateProviderBudgetPermission({
    providerId: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO,
    env,
  });

  const priorityPlanDisabled = buildMultiProviderPriorityPlan({
    runtimeMode: COMMERCIAL_RUNTIME_MODES.SHADOW,
    env: buildDataForSeoDisabledAuditEnv(),
    query,
    limit,
  });

  const priorityPlanEnabled = buildMultiProviderPriorityPlan({
    runtimeMode: COMMERCIAL_RUNTIME_MODES.SHADOW,
    env: buildDataForSeoEnabledAuditEnv(),
    query,
    limit,
  });

  const sampleRaw = mapDataForSeoShoppingItemToNormalizedRaw(
    {
      type: "google_shopping_serp",
      title: "Fone Bluetooth JBL Tune 520BT",
      seller: "Magazine Luiza",
      price: 249.9,
      currency: "BRL",
      shopping_url: "https://www.google.com/shopping/product/123",
      product_images: ["https://encrypted-tbn0.gstatic.com/shopping?q=sample"],
      reviews_count: 120,
      product_rating: { value: 4.6, votes_count: 120 },
      old_price: 299.9,
      special_offer_info: {
        coupon_code: "IGNORED",
        percentage_discount: 10,
      },
    },
    { itemType: "google_shopping_serp", sponsored: false }
  );

  return {
    version: DATAFORSEO_GOOGLE_SHOPPING_INTEGRATION_AUDIT_VERSION,
    provider,
    providerEnabledByDefault: isCommercialProviderEnabled(
      COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO,
      buildDataForSeoDisabledAuditEnv()
    ),
    providerEnabledWhenFlagOn: isCommercialProviderEnabled(
      COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO,
      buildDataForSeoEnabledAuditEnv()
    ),
    cacheKeysDistinct: cacheKeyGoogle !== cacheKeyDataForSeo,
    dedupKeysDistinct: dedupKeyGoogle !== dedupKeyDataForSeo,
    budgetStatesDistinct:
      googleBudget.providerId !== dataForSeoBudget.providerId ||
      googleBudget.callsUsed !== dataForSeoBudget.callsUsed,
    googleCircuit: getProviderCircuitState(COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING),
    dataForSeoCircuit: getProviderCircuitState(
      COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO
    ),
    priorityContainsDataForSeoWhenEnabled: priorityPlanEnabled.orderedProviders.some(
      (entry) => entry.providerId === COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO
    ),
    priorityExcludesDataForSeoWhenDisabled: !priorityPlanDisabled.orderedProviders.some(
      (entry) => entry.providerId === COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO
    ),
    sampleRaw,
    sampleNeutrality: validateDataForSeoNormalizedProductNeutrality(sampleRaw || {}),
    costGuardProviderId: PROVIDER_COST_GUARD_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO,
    reasonCodes: Object.values(DATAFORSEO_REASON_CODES),
    credentialsSanitized: !JSON.stringify(
      redactDataForSeoSecrets({
        login: "secret-login@example.test",
        password: "secret-password-value",
        Authorization: "Basic c2VjcmV0",
      })
    ).includes("secret-password-value"),
  };
}

/**
 * @param {Record<string, unknown>} [input]
 */
export async function runDataForSeoAdapterMockScenario(input = {}) {
  const env = buildDataForSeoEnabledAuditEnv(input.env || {});
  const mockFetcher = async () => ({
    ok: true,
    reasonCode: DATAFORSEO_REASON_CODES.SUCCESS,
    products: [
      {
        product_name: "Notebook Dell Inspiron 15",
        price: 3499.99,
        numericPrice: 3499.99,
        currency: "BRL",
        link: "https://www.google.com/shopping/product/999",
        thumbnail: "https://encrypted-tbn0.gstatic.com/shopping?q=notebook",
        source: "Dell Official",
        merchant: "Dell Official",
        provider: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING_DATAFORSEO,
      },
    ],
    count: 1,
    diagnostics: { mock: true },
  });

  return fetchDataForSeoGoogleShoppingAdapterResult({
    query: input.query || "notebook dell",
    limit: 3,
    env,
    fetcher: mockFetcher,
    costGuardContext: {
      _contextProvided: true,
      skipCostGuard: true,
    },
    invocationLayer: "dataforseo_integration_audit_mock",
  });
}

export function hashAuditMarker(value = "") {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 12);
}
