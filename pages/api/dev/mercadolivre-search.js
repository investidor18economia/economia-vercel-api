/**

 * PATCH Comercial 2B/05H — endpoint isolado para teste manual Mercado Livre

 *

 * Não usado pela MIA. Bloqueado em production sem DEV_API_SECRET.

 */



import {

  isDevEndpointAllowed,

  resolveDevCommercialEndpointGuard,

} from "../../../lib/commercial/devCommercialCostGuard.js";

import {

  getMercadoLivreCommercialRegistryMetadata,

  MERCADOLIVRE_RUNTIME_ACTIVATION_VERSION,

} from "../../../lib/commercial/mercadolivreRuntimeActivation.js";

import {

  fetchMercadoLivreCommercialAdapterResult,

} from "../../../lib/productSourceAdapter/adapters/mercadoLivreAdapter.js";

import {

  hasMercadoLivreAccessToken,

  redactMercadoLivreSecrets,

  validateMercadoLivreEnv,

} from "../../../lib/productSourceAdapter/adapters/mercadoLivreClient.js";

import {

  COMMERCIAL_PROVIDER_IDS,

  isCommercialProviderEnabled,

} from "../../../lib/productSourceAdapter/commercialProviderRegistry.js";



export default async function handler(req, res) {

  if (req.method !== "GET") {

    return res.status(405).json({ ok: false, error: "method_not_allowed" });

  }



  if (!isDevEndpointAllowed(req)) {

    return res.status(403).json({

      ok: false,

      error: "forbidden_in_production",

    });

  }



  const query = String(req.query.q || "").trim();

  const limit = Number.parseInt(String(req.query.limit || "12"), 10);

  const mode = String(req.query.mode || "items").trim().toLowerCase();

  const registryMetadata = getMercadoLivreCommercialRegistryMetadata(process.env);



  if (!query) {

    return res.status(400).json({

      ok: false,

      error: "missing_query",

      hint: "Use ?q=termo&limit=12&mode=items|products",

      activationVersion: MERCADOLIVRE_RUNTIME_ACTIVATION_VERSION,

      registryMetadata,

    });

  }



  if (mode !== "items" && mode !== "products") {

    return res.status(400).json({

      ok: false,

      error: "invalid_mode",

      hint: "Use mode=items or mode=products",

      activationVersion: MERCADOLIVRE_RUNTIME_ACTIVATION_VERSION,

    });

  }



  const endpointGuard = resolveDevCommercialEndpointGuard(req, {

    invocationSource: "dev_mercadolivre_search",

    providerId: COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,

    billingTier: "free_external",

    endpoint: "mercadolivre-search",

    plannedRequest: { query, limit, mode },

    endpointLevelDryRun: true,

  });



  if (endpointGuard.blocked) {

    return res.status(endpointGuard.statusCode).json({

      ...endpointGuard.body,

      activationVersion: MERCADOLIVRE_RUNTIME_ACTIVATION_VERSION,

      registryMetadata,

    });

  }



  if (endpointGuard.shouldReturnDryRunResponse) {

    return res.status(200).json({

      ...endpointGuard.body,

      activationVersion: MERCADOLIVRE_RUNTIME_ACTIVATION_VERSION,

      registryMetadata,

      providerEnabled: isCommercialProviderEnabled(COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC),

      count: 0,

      products: [],

      siteId: process.env.MERCADOLIVRE_SITE_ID || "MLB",

      mode,

      hasAccessToken: hasMercadoLivreAccessToken(process.env),

      externalCallExecuted: false,

    });

  }



  const envValidation = validateMercadoLivreEnv(process.env);



  try {

    const result = await fetchMercadoLivreCommercialAdapterResult({

      query,

      limit: Number.isFinite(limit) ? limit : 12,

      searchMode: mode,

      costGuardContext: endpointGuard.costGuardContext,

      invocationLayer: "dev_mercadolivre_search",

    });



    const payload = {

      ok: result.ok,

      provider: result.provider,

      providerId: result.providerId || COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC,

      count: result.count,

      products: result.products,

      error: result.error,

      reasonCode: result.reasonCode || null,

      siteId: process.env.MERCADOLIVRE_SITE_ID || "MLB",

      mode,

      searchMode: result.searchMode ?? mode,

      hasAccessToken: hasMercadoLivreAccessToken(process.env),

      envReady: envValidation.ok,

      missingEnv: envValidation.missing || [],

      httpStatus: result.httpStatus ?? null,

      httpStatusText: result.httpStatusText ?? null,

      safeErrorBodyPreview: result.safeErrorBodyPreview ?? null,

      requestUrl: result.requestUrl ?? null,

      activationVersion: MERCADOLIVRE_RUNTIME_ACTIVATION_VERSION,

      registryMetadata,

      providerEnabled: isCommercialProviderEnabled(COMMERCIAL_PROVIDER_IDS.MERCADOLIVRE_PUBLIC),

      externalCallExecuted: result.costGuardBlocked !== true && result.error !== "provider_disabled",

      dryRun: false,

      costGuardDecision: result.costGuardDecision || null,

      devCommercialCostGuard: endpointGuard.permission || null,

    };



    const safeJson = redactMercadoLivreSecrets(JSON.stringify(payload), process.env);

    return res.status(result.ok ? 200 : 502).json(JSON.parse(safeJson));

  } catch (err) {

    const message = redactMercadoLivreSecrets(String(err?.message || "provider_error"), process.env);

    return res.status(500).json({

      ok: false,

      error: "provider_error",

      message,

      activationVersion: MERCADOLIVRE_RUNTIME_ACTIVATION_VERSION,

      registryMetadata,

    });

  }

}

