/**
 * PATCH ProductSourceAdapter V1 — public surface
 *
 * Camada plugável para futuras fontes comerciais.
 * Não integrada ao pipeline cognitivo neste patch.
 */

export {
  NORMALIZED_PRODUCT_VERSION,
  PRODUCT_SOURCE_IDS,
  createEmptyNormalizedProduct,
  isNormalizedProductUsable,
  isNormalizedProductShape,
} from "./normalizedProduct.js";

export {
  cleanProductTitle,
  normalizeProductNameKey,
  deriveProductFamilyKey,
  parseNumericPrice,
  formatBrlPrice,
  normalizeRawProductBase,
  normalizeRawProductsBase,
} from "./normalizeProduct.js";

export { dedupeProducts } from "./dedupeProducts.js";

export {
  ADAPTER_CONTRACT_VERSION,
  ADAPTER_REQUIRED_FIELDS,
  validateProductSourceAdapter,
  createNotIntegratedFetchResult,
} from "./adapterContract.js";

export {
  registerProductSourceAdapter,
  unregisterProductSourceAdapter,
  getProductSourceAdapter,
  hasProductSourceAdapter,
  listProductSourceAdapters,
  getEnabledProductSourceAdapters,
  clearProductSourceRegistry,
  getProductSourceRegistrySize,
} from "./sourceRegistry.js";

export { mercadoLivreAdapterStub } from "./adapters/stubMercadoLivreAdapter.js";
export {
  mercadoLivreAdapter,
  MERCADO_LIVRE_PROVIDER,
  fetchMercadoLivreAdapterResult,
  fetchMercadoLivreMockSearch,
  normalizeMercadoLivreItem,
  dedupeMercadoLivreProducts,
} from "./adapters/mercadoLivreAdapter.js";
export {
  buildMercadoLivreSearchUrl,
  buildMercadoLivreProductsSearchUrl,
  buildMercadoLivreProductUrl,
  buildMercadoLivreProductItemsUrl,
  searchMercadoLivreProducts,
  searchMercadoLivreCatalogProducts,
  getMercadoLivreProductById,
  getMercadoLivreProductItemsById,
  probeMercadoLivreProductFlow,
  validateMercadoLivreEnv,
  mapMercadoLivreApiResponseToItems,
  mapMercadoLivreCatalogApiResponseToItems,
  mapMercadoLivreProductDetailResponse,
  mapMercadoLivreProductItemsResponse,
  mapMercadoLivreProductDetailToNormalizedRaw,
  mapMercadoLivreProductItemToNormalizedRaw,
  redactMercadoLivreSecrets,
  buildMercadoLivreHttpErrorDiagnostics,
  hasMercadoLivreAccessToken,
  buildMercadoLivreRequestHeaders,
} from "./adapters/mercadoLivreClient.js";
export {
  MERCADOLIVRE_OAUTH_AUTHORIZE_URL,
  MERCADOLIVRE_OAUTH_TOKEN_URL,
  buildMercadoLivreAuthorizationUrl,
  exchangeMercadoLivreAuthorizationCode,
  mapMercadoLivreTokenResponse,
  validateMercadoLivreOAuthEnv,
  redactMercadoLivreOAuthSecrets,
} from "./adapters/mercadoLivreOAuth.js";
export { amazonAdapterStub } from "./adapters/stubAmazonAdapter.js";
export { serpAdapterStub } from "./adapters/stubSerpAdapter.js";
export {
  googleShoppingAdapter,
  fetchGoogleShoppingLegacyResult,
  fetchGoogleShoppingAdapterResult,
  mapNormalizedProductsToLegacy,
  toLegacyCommercialProduct,
  isLegacyUsableCommercialProduct,
  GOOGLE_SHOPPING_LEGACY_PROVIDER,
} from "./adapters/googleShoppingAdapter.js";
export {
  googleShoppingDataForSeoAdapter,
  fetchDataForSeoGoogleShoppingAdapterResult,
  dedupeDataForSeoGoogleShoppingProducts,
  DATAFORSEO_GOOGLE_SHOPPING_PROVIDER,
  DATAFORSEO_GOOGLE_SHOPPING_ADAPTER_VERSION,
} from "./adapters/dataForSeoGoogleShoppingAdapter.js";
export {
  searchDataForSeoGoogleShoppingProducts,
  validateDataForSeoEnv,
  redactDataForSeoSecrets,
  mapDataForSeoShoppingItemToNormalizedRaw,
  DATAFORSEO_REASON_CODES,
  DATAFORSEO_BRAZIL_LOCATION_CODE,
  DATAFORSEO_BRAZIL_LANGUAGE_CODE,
  DATAFORSEO_GOOGLE_SHOPPING_CLIENT_VERSION,
} from "./adapters/dataForSeoGoogleShoppingClient.js";

import {
  hasProductSourceAdapter,
  listProductSourceAdapters,
  registerProductSourceAdapter,
} from "./sourceRegistry.js";
import { mercadoLivreAdapter } from "./adapters/mercadoLivreAdapter.js";
import { amazonAdapterStub } from "./adapters/stubAmazonAdapter.js";
import { googleShoppingAdapter } from "./adapters/googleShoppingAdapter.js";

let defaultRegistryBootstrapped = false;

/**
 * Registra stubs desabilitados para futuras integrações.
 * Idempotente — não altera adapters já registrados com o mesmo id.
 */
export function bootstrapDefaultProductSourceRegistry() {
  if (defaultRegistryBootstrapped) {
    return listProductSourceAdapters();
  }

  for (const adapter of [googleShoppingAdapter, mercadoLivreAdapter, amazonAdapterStub]) {
    if (!hasProductSourceAdapter(adapter.id)) {
      registerProductSourceAdapter(adapter);
    }
  }

  defaultRegistryBootstrapped = true;
  return listProductSourceAdapters();
}
