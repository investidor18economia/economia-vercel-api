/**

 * PATCH Comercial 4B — Commercial Provider Registry

 *

 * Camada passiva de governança de providers comerciais.

 * Não executa buscas, não altera ranking/winner e não integra na MIA.

 */



export const COMMERCIAL_PROVIDER_REGISTRY_VERSION = "4B.3";

export const MERCADOLIVRE_COMMERCIAL_PROVIDER_ENABLED_ENV =

  "COMMERCIAL_PROVIDER_MERCADOLIVRE_ENABLED";



export const COMMERCIAL_PROVIDER_TYPES = Object.freeze({

  SEARCH: "search",

});



export const COMMERCIAL_PROVIDER_IDS = Object.freeze({

  GOOGLE_SHOPPING: "google_shopping",

  MERCADOLIVRE_PUBLIC: "mercadolivre_public",

  APIFY_MERCADOLIVRE: "apify_mercadolivre",

  AMAZON: "amazon",

});



const REGISTRY = Object.freeze([

  Object.freeze({

    id: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,

    enabled: true,

    providerType: COMMERCIAL_PROVIDER_TYPES.SEARCH,

    version: "current",

    billingTier: "paid_external",

    supportsControlled: true,

    supportsShadow: true,

    requiresAuth: true,

    authEnvKeys: Object.freeze(["SERPAPI_KEY"]),

    timeoutMs: 12_000,

    reliabilityScore: 80,

    latencyMs: 3_000,

  }),

  Object.freeze({

    id: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,

    enabled: false,

    providerType: COMMERCIAL_PROVIDER_TYPES.SEARCH,

    version: "05H",

    billingTier: "free_external",

    supportsControlled: true,

    supportsShadow: false,

    requiresAuth: false,

    authEnvKeys: Object.freeze([

      "MERCADOLIVRE_CLIENT_ID",

      "MERCADOLIVRE_CLIENT_SECRET",

      "MERCADOLIVRE_REDIRECT_URI",

    ]),

    timeoutMs: 10_000,

    reliabilityScore: 70,

    latencyMs: 2_000,

  }),

  Object.freeze({

    id: COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE,

    enabled: true,

    providerType: COMMERCIAL_PROVIDER_TYPES.SEARCH,

    version: "4A.1",

    billingTier: "paid_external",

    supportsControlled: true,

    supportsShadow: true,

    requiresAuth: true,

    authEnvKeys: Object.freeze(["APIFY_API_TOKEN"]),

    timeoutMs: 120_000,

    reliabilityScore: 75,

    latencyMs: 45_000,

  }),

  Object.freeze({

    id: COMMERCIAL_PROVIDER_IDS.AMAZON,

    enabled: false,

    providerType: COMMERCIAL_PROVIDER_TYPES.SEARCH,

    version: "planned",

    billingTier: "unknown",

    supportsControlled: false,

    supportsShadow: false,

    requiresAuth: true,

    authEnvKeys: Object.freeze([]),

    timeoutMs: 15_000,

    reliabilityScore: 0,

    latencyMs: 5_000,

  }),

]);



function normalizeProviderId(id = "") {

  return String(id || "").trim().toLowerCase();

}



export function isMercadoLivreCommercialProviderRuntimeEnabled(env = process.env) {

  const raw = String(env?.[MERCADOLIVRE_COMMERCIAL_PROVIDER_ENABLED_ENV] || "")

    .trim()

    .toLowerCase();

  return raw === "true" || raw === "1";

}



function resolveProviderRuntimeEnabled(provider = null, env = process.env) {

  if (!provider) return false;

  if (provider.id === COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC) {

    return isMercadoLivreCommercialProviderRuntimeEnabled(env);

  }

  return provider.enabled === true;

}



function cloneProviderMetadata(provider = null, env = process.env) {

  if (!provider) return null;

  return {

    id: provider.id,

    enabled: resolveProviderRuntimeEnabled(provider, env),

    providerType: provider.providerType,

    version: provider.version,

    billingTier: provider.billingTier || "unknown",

    supportsControlled: provider.supportsControlled === true,

    supportsShadow: provider.supportsShadow === true,

    requiresAuth: provider.requiresAuth === true,

    authEnvKeys: provider.authEnvKeys || [],

    timeoutMs: provider.timeoutMs ?? null,

    reliabilityScore: provider.reliabilityScore ?? 0,

    latencyMs: provider.latencyMs ?? 0,

  };

}



/**

 * @param {string} id

 * @param {Record<string, string|undefined>} [env]

 */

export function getCommercialProviderOperationalMetadata(id = "", env = process.env) {

  const key = normalizeProviderId(id);

  if (!key) return null;



  const provider = REGISTRY.find((entry) => entry.id === key) || null;

  return cloneProviderMetadata(provider, env);

}



/**

 * @param {Record<string, string|undefined>} [env]

 */

export function listCommercialProviderOperationalMetadata(env = process.env) {

  return REGISTRY.map((provider, registryPosition) => ({

    ...cloneProviderMetadata(provider, env),

    registryPosition,

  }));

}



export function getCommercialProviderRegistry(env = process.env) {

  return REGISTRY.map((provider) => cloneProviderMetadata(provider, env));

}



/**

 * @param {string} id

 * @param {Record<string, string|undefined>} [env]

 */

export function getCommercialProviderById(id = "", env = process.env) {

  const key = normalizeProviderId(id);

  if (!key) return null;



  const provider = REGISTRY.find((entry) => entry.id === key) || null;

  return cloneProviderMetadata(provider, env);

}



/**

 * @param {string} id

 * @param {Record<string, string|undefined>} [env]

 */

export function isCommercialProviderEnabled(id = "", env = process.env) {

  const provider = getCommercialProviderById(id, env);

  return provider?.enabled === true;

}



/**

 * @param {Record<string, string|undefined>} [env]

 */

export function listEnabledCommercialProviders(env = process.env) {

  return REGISTRY.filter((provider) => resolveProviderRuntimeEnabled(provider, env)).map(

    (provider, registryPosition) => ({

      ...cloneProviderMetadata(provider, env),

      registryPosition,

    })

  );

}



/**

 * @param {Record<string, string|undefined>} [env]

 */

export function listDisabledCommercialProviders(env = process.env) {

  return REGISTRY.filter((provider) => !resolveProviderRuntimeEnabled(provider, env)).map(

    (provider, registryPosition) => ({

      ...cloneProviderMetadata(provider, env),

      registryPosition,

    })

  );

}



/**

 * @param {Record<string, string|undefined>} [env]

 */

export function getCommercialProviderRegistrySummary(env = process.env) {

  const providers = getCommercialProviderRegistry(env);

  const enabled = listEnabledCommercialProviders(env);



  return {

    version: COMMERCIAL_PROVIDER_REGISTRY_VERSION,

    count: providers.length,

    enabledCount: enabled.length,

    providers,

    enabledProviders: enabled.map((provider) => provider.id),

  };

}

