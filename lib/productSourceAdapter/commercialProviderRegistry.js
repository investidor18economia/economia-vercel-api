/**
 * PATCH Comercial 4B — Commercial Provider Registry
 *
 * Camada passiva de governança de providers comerciais.
 * Não executa buscas, não altera ranking/winner e não integra na MIA.
 */

import { APIFY_MERCADOLIVRE_CLIENT_VERSION } from "./adapters/apifyMercadoLivreClient.js";

export const COMMERCIAL_PROVIDER_REGISTRY_VERSION = "4B.1";

export const COMMERCIAL_PROVIDER_TYPES = Object.freeze({
  SEARCH: "search",
});

export const COMMERCIAL_PROVIDER_IDS = Object.freeze({
  GOOGLE_SHOPPING: "google_shopping",
  APIFY_MERCADOLIVRE: "apify_mercadolivre",
  AMAZON: "amazon",
});

const REGISTRY = Object.freeze([
  Object.freeze({
    id: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
    enabled: true,
    providerType: COMMERCIAL_PROVIDER_TYPES.SEARCH,
    version: "current",
  }),
  Object.freeze({
    id: COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE,
    enabled: true,
    providerType: COMMERCIAL_PROVIDER_TYPES.SEARCH,
    version: APIFY_MERCADOLIVRE_CLIENT_VERSION,
  }),
  Object.freeze({
    id: COMMERCIAL_PROVIDER_IDS.AMAZON,
    enabled: false,
    providerType: COMMERCIAL_PROVIDER_TYPES.SEARCH,
    version: "planned",
  }),
]);

function normalizeProviderId(id = "") {
  return String(id || "").trim().toLowerCase();
}

function cloneProviderMetadata(provider = null) {
  if (!provider) return null;
  return {
    id: provider.id,
    enabled: provider.enabled,
    providerType: provider.providerType,
    version: provider.version,
  };
}

export function getCommercialProviderRegistry() {
  return REGISTRY.map((provider) => cloneProviderMetadata(provider));
}

/**
 * @param {string} id
 */
export function getCommercialProviderById(id = "") {
  const key = normalizeProviderId(id);
  if (!key) return null;

  const provider = REGISTRY.find((entry) => entry.id === key) || null;
  return cloneProviderMetadata(provider);
}

/**
 * @param {string} id
 */
export function isCommercialProviderEnabled(id = "") {
  const provider = getCommercialProviderById(id);
  return provider?.enabled === true;
}

export function listEnabledCommercialProviders() {
  return REGISTRY.filter((provider) => provider.enabled).map((provider) =>
    cloneProviderMetadata(provider)
  );
}

export function listDisabledCommercialProviders() {
  return REGISTRY.filter((provider) => !provider.enabled).map((provider) =>
    cloneProviderMetadata(provider)
  );
}

export function getCommercialProviderRegistrySummary() {
  const providers = getCommercialProviderRegistry();
  const enabled = listEnabledCommercialProviders();

  return {
    version: COMMERCIAL_PROVIDER_REGISTRY_VERSION,
    count: providers.length,
    enabledCount: enabled.length,
    providers,
    enabledProviders: enabled.map((provider) => provider.id),
  };
}
