/**

 * PATCH Comercial 4A — endpoint DEV isolado Apify Mercado Livre

 *

 * Não usado pela MIA. Bloqueado em production sem DEV_API_SECRET.

 */



import {

  isDevEndpointAllowed,

  resolveDevCommercialEndpointGuard,

} from "../../../lib/commercial/devCommercialCostGuard.js";

import {

  hasApifyMercadoLivreToken,

  redactApifyMercadoLivreSecrets,

  searchApifyMercadoLivreProducts,

  validateApifyMercadoLivreEnv,

  clampApifyMaxResults,

  APIFY_MERCADOLIVRE_SOURCE,

} from "../../../lib/productSourceAdapter/adapters/apifyMercadoLivreClient.js";



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

  const limit = clampApifyMaxResults(

    Number.parseInt(String(req.query.limit || "5"), 10)

  );



  if (!query) {

    return res.status(400).json({

      ok: false,

      error: "missing_query",

      hint: "Use ?q=termo&limit=5",

      provider: APIFY_MERCADOLIVRE_SOURCE,

      hasToken: hasApifyMercadoLivreToken(process.env),

      maxResults: limit,

    });

  }



  const endpointGuard = resolveDevCommercialEndpointGuard(req, {

    invocationSource: "dev_apify_mercadolivre_search",

    providerId: "apify_mercadolivre",

    endpoint: "apify-mercadolivre-search",

    plannedRequest: { query, limit },

    endpointLevelDryRun: true,

  });



  if (endpointGuard.blocked) {

    return res.status(endpointGuard.statusCode).json(endpointGuard.body);

  }



  if (endpointGuard.shouldReturnDryRunResponse) {

    return res.status(200).json({

      ...endpointGuard.body,

      provider: APIFY_MERCADOLIVRE_SOURCE,

      hasToken: hasApifyMercadoLivreToken(process.env),

      maxResults: limit,

      count: 0,

      products: [],

    });

  }



  const envValidation = validateApifyMercadoLivreEnv(process.env);

  if (!envValidation.ok) {

    return res.status(503).json({

      ok: false,

      error: "missing_env",

      missing: envValidation.missing,

      provider: APIFY_MERCADOLIVRE_SOURCE,

      hasToken: false,

      maxResults: limit,

    });

  }



  try {

    const costGuardContext = endpointGuard.costGuardContext;

    const result = await searchApifyMercadoLivreProducts(query, limit, { costGuardContext });



    const payload = {

      ok: result.ok,

      provider: result.provider,

      count: result.count,

      products: result.products,

      error: result.error,

      hasToken: result.hasToken ?? hasApifyMercadoLivreToken(process.env),

      maxResults: result.maxResults ?? limit,

      query: result.query ?? query,

      httpStatus: result.httpStatus ?? null,

      httpStatusText: result.httpStatusText ?? null,

      safeErrorBodyPreview: result.safeErrorBodyPreview ?? null,

      requestUrl: result.requestUrl ?? null,

      rawItemCount: result.rawItemCount ?? null,

    };



    const safeJson = redactApifyMercadoLivreSecrets(JSON.stringify(payload), process.env);

    return res.status(result.ok ? 200 : 502).json(JSON.parse(safeJson));

  } catch (err) {

    const message = redactApifyMercadoLivreSecrets(

      String(err?.message || "provider_error"),

      process.env

    );

    return res.status(500).json({

      ok: false,

      error: "provider_error",

      message,

      provider: APIFY_MERCADOLIVRE_SOURCE,

      hasToken: hasApifyMercadoLivreToken(process.env),

      maxResults: limit,

    });

  }

}

