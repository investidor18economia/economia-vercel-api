/**
 * PATCH Comercial 2D / 05J.4 — Mercado Livre OAuth (isolado, sem plug na MIA)
 */

import {
  createMercadoLivreOAuthState,
  isMercadoLivreOAuthStateSecretConfigured,
  validateMercadoLivreOAuthState,
} from "../../commercial/mercadolivreOAuthState.js";
import {
  buildMercadoLivreOAuthSafeErrorResponse,
  buildMercadoLivreOAuthSafeSuccessResponse,
  sanitizeMercadoLivreOAuthErrorMessage,
  sanitizeMercadoLivreOAuthForHttpResponse,
} from "../../commercial/mercadolivreOAuthSanitization.js";
import {
  MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_STATUS,
  persistMercadoLivreOAuthTokens,
} from "../../commercial/mercadolivreOAuthTokenPersistence.js";
import { redactMercadoLivreSecrets, validateMercadoLivreEnv } from "./mercadoLivreClient.js";

export const MERCADOLIVRE_OAUTH_AUTHORIZE_URL =
  "https://auth.mercadolivre.com.br/authorization";
export const MERCADOLIVRE_OAUTH_TOKEN_URL = "https://api.mercadolibre.com/oauth/token";

function readOAuthConfig(env = process.env) {
  return {
    clientId: String(env?.MERCADOLIVRE_CLIENT_ID || "").trim(),
    clientSecret: String(env?.MERCADOLIVRE_CLIENT_SECRET || "").trim(),
    redirectUri: String(env?.MERCADOLIVRE_REDIRECT_URI || "").trim(),
  };
}

export function validateMercadoLivreOAuthEnv(env = process.env) {
  return validateMercadoLivreEnv(env);
}

/**
 * @param {Record<string, string|undefined>} [env]
 * @param {Record<string, string>} [extraParams]
 */
export function buildMercadoLivreAuthorizationUrl(env = process.env, extraParams = {}) {
  const validation = validateMercadoLivreOAuthEnv(env);
  const config = readOAuthConfig(env);

  if (!validation.ok) {
    return {
      ok: false,
      error: "missing_env",
      missing: validation.missing,
      url: null,
    };
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
  });

  for (const [key, value] of Object.entries(extraParams || {})) {
    const text = String(value ?? "").trim();
    if (text) params.set(key, text);
  }

  return {
    ok: true,
    url: `${MERCADOLIVRE_OAUTH_AUTHORIZE_URL}?${params.toString()}`,
    error: null,
  };
}

/**
 * @param {unknown} payload
 */
export function mapMercadoLivreTokenResponse(payload = {}) {
  if (!payload || typeof payload !== "object") {
    return {
      access_token: null,
      refresh_token: null,
      expires_in: null,
      token_type: null,
    };
  }

  return {
    access_token: payload.access_token ?? null,
    refresh_token: payload.refresh_token ?? null,
    expires_in: payload.expires_in ?? null,
    token_type: payload.token_type ?? null,
  };
}

/**
 * @param {string} refreshToken
 * @param {{
 *   env?: Record<string, string|undefined>,
 *   fetcher?: Function,
 *   signal?: AbortSignal,
 * }} [options]
 */
export async function refreshMercadoLivreOAuthToken(refreshToken = "", options = {}) {
  const env = options.env || process.env;
  const fetcher = options.fetcher || globalThis.fetch;
  const validation = validateMercadoLivreOAuthEnv(env);
  const config = readOAuthConfig(env);
  const normalizedRefreshToken = String(refreshToken || "").trim();

  if (!validation.ok) {
    return {
      ok: false,
      error: "missing_env",
      reasonCode: "refresh_provider_error",
      missing: validation.missing,
    };
  }

  if (!normalizedRefreshToken) {
    return {
      ok: false,
      error: "missing_refresh_token",
      reasonCode: "refresh_token_invalid",
    };
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: normalizedRefreshToken,
  });

  try {
    const response = await fetcher(MERCADOLIVRE_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      signal: options.signal,
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response?.ok) {
      const previewSource =
        payload && typeof payload === "object"
          ? JSON.stringify(payload)
          : typeof response.text === "function"
            ? await response.text()
            : "";
      const safePreview = redactMercadoLivreSecrets(previewSource, env);
      const providerError = String(payload?.error || payload?.message || "").toLowerCase();
      let reasonCode = "refresh_http_error";
      if (response?.status === 401 || providerError.includes("revoked")) {
        reasonCode = "refresh_token_revoked";
      } else if (
        providerError.includes("invalid_grant") ||
        providerError.includes("invalid") ||
        response?.status === 400
      ) {
        reasonCode = "refresh_token_invalid";
      }

      return {
        ok: false,
        error: "token_refresh_failed",
        reasonCode,
        httpStatus: response?.status ?? 0,
        httpStatusText: response?.statusText ?? "",
        safeErrorBodyPreview: safePreview,
      };
    }

    return {
      ok: true,
      token: mapMercadoLivreTokenResponse(payload),
      error: null,
      reasonCode: null,
    };
  } catch (err) {
    if (err?.name === "AbortError" || /aborted|timeout/i.test(String(err?.message || ""))) {
      return {
        ok: false,
        error: "timeout",
        reasonCode: "refresh_timeout",
        message: redactMercadoLivreSecrets(String(err?.message || "timeout"), env),
      };
    }

    return {
      ok: false,
      error: "provider_error",
      reasonCode: "refresh_provider_error",
      message: redactMercadoLivreSecrets(String(err?.message || "provider_error"), env),
    };
  }
}

/**
 * @param {string} code
 * @param {{
 *   env?: Record<string, string|undefined>,
 *   fetcher?: (url: string, init?: RequestInit) => Promise<{
 *     ok: boolean,
 *     status?: number,
 *     statusText?: string,
 *     json: () => Promise<unknown>,
 *     text?: () => Promise<string>,
 *   }>,
 * }} [options]
 */
export async function exchangeMercadoLivreAuthorizationCode(code = "", options = {}) {
  const env = options.env || process.env;
  const fetcher = options.fetcher || globalThis.fetch;
  const validation = validateMercadoLivreOAuthEnv(env);
  const config = readOAuthConfig(env);

  if (!validation.ok) {
    return {
      ok: false,
      error: "missing_env",
      missing: validation.missing,
    };
  }

  const authorizationCode = String(code || "").trim();
  if (!authorizationCode) {
    return {
      ok: false,
      error: "missing_code",
    };
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code: authorizationCode,
    redirect_uri: config.redirectUri,
  });

  try {
    const response = await fetcher(MERCADOLIVRE_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response?.ok) {
      const previewSource =
        payload && typeof payload === "object"
          ? JSON.stringify(payload)
          : typeof response.text === "function"
            ? await response.text()
            : "";

      return {
        ok: false,
        error: "token_exchange_failed",
        httpStatus: response?.status ?? 0,
        httpStatusText: response?.statusText ?? "",
        safeErrorBodyPreview: redactMercadoLivreSecrets(previewSource, env),
      };
    }

    return {
      ok: true,
      token: mapMercadoLivreTokenResponse(payload),
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      error: "provider_error",
      message: redactMercadoLivreSecrets(String(err?.message || "provider_error"), env),
    };
  }
}

export function redactMercadoLivreOAuthSecrets(value = "", env = process.env) {
  return redactMercadoLivreSecrets(value, env);
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function buildMercadoLivreOAuthStartResult(input = {}) {
  const env = input.env || process.env;
  const oauthValidation = validateMercadoLivreOAuthEnv(env);

  if (!oauthValidation.ok) {
    return {
      statusCode: 503,
      headers: {},
      body: buildMercadoLivreOAuthSafeErrorResponse({
        errorCode: "oauth_configuration_incomplete",
        message: "Mercado Livre OAuth environment is incomplete.",
        nextStep: "Configure MERCADOLIVRE_CLIENT_ID, MERCADOLIVRE_CLIENT_SECRET and MERCADOLIVRE_REDIRECT_URI.",
      }),
    };
  }

  if (!isMercadoLivreOAuthStateSecretConfigured(env)) {
    return {
      statusCode: 503,
      headers: {},
      body: buildMercadoLivreOAuthSafeErrorResponse({
        errorCode: "oauth_configuration_incomplete",
        message: "Mercado Livre OAuth state protection is not configured.",
        nextStep: "Configure MERCADOLIVRE_OAUTH_STATE_SECRET before starting OAuth.",
      }),
    };
  }

  const stateResult = createMercadoLivreOAuthState({
    env,
    nowMs: input.nowMs,
  });

  if (!stateResult.ok || !stateResult.state) {
    return {
      statusCode: 503,
      headers: {},
      body: buildMercadoLivreOAuthSafeErrorResponse({
        errorCode: stateResult.errorCode || "oauth_configuration_incomplete",
        message: "Unable to initialize OAuth state protection.",
        nextStep: "Configure MERCADOLIVRE_OAUTH_STATE_SECRET and retry.",
      }),
    };
  }

  const authorization = buildMercadoLivreAuthorizationUrl(env, { state: stateResult.state });
  if (!authorization.ok || !authorization.url) {
    return {
      statusCode: 503,
      headers: {},
      body: buildMercadoLivreOAuthSafeErrorResponse({
        errorCode: "oauth_configuration_incomplete",
        message: "Unable to build Mercado Livre authorization URL.",
        nextStep: "Review OAuth configuration and retry.",
      }),
    };
  }

  return {
    statusCode: 302,
    headers: {
      Location: authorization.url,
      "Set-Cookie": stateResult.setCookieHeader,
    },
    body: null,
  };
}

/**
 * @param {Record<string, unknown>} [input]
 */
export async function processMercadoLivreOAuthCallback(input = {}) {
  const env = input.env || process.env;
  const query = input.query && typeof input.query === "object" ? input.query : {};
  const cookieHeader = String(input.cookieHeader || "");
  const nowMs = Number.isFinite(input.nowMs) ? input.nowMs : Date.now();

  const oauthValidation = validateMercadoLivreOAuthEnv(env);
  if (!oauthValidation.ok) {
    return {
      statusCode: 503,
      headers: {},
      body: buildMercadoLivreOAuthSafeErrorResponse({
        errorCode: "oauth_configuration_incomplete",
        message: "Mercado Livre OAuth environment is incomplete.",
        nextStep: "Configure required OAuth environment variables.",
      }),
    };
  }

  if (!isMercadoLivreOAuthStateSecretConfigured(env)) {
    return {
      statusCode: 503,
      headers: {},
      body: buildMercadoLivreOAuthSafeErrorResponse({
        errorCode: "oauth_configuration_incomplete",
        message: "Mercado Livre OAuth state protection is not configured.",
        nextStep: "Configure MERCADOLIVRE_OAUTH_STATE_SECRET before completing OAuth.",
      }),
    };
  }

  const oauthError = String(query.error || "").trim();
  if (oauthError) {
    return {
      statusCode: 400,
      headers: {},
      body: buildMercadoLivreOAuthSafeErrorResponse({
        errorCode: "oauth_denied",
        message: "Mercado Livre authorization was denied.",
        nextStep: "Restart OAuth from /api/auth/mercadolivre/start.",
      }),
    };
  }

  const stateValidation = validateMercadoLivreOAuthState({
    env,
    queryState: query.state,
    cookieHeader,
    nowMs,
  });

  const stateClearCookie = stateValidation.clearCookieHeader;
  const stateHeaders = stateClearCookie ? { "Set-Cookie": stateClearCookie } : {};

  if (!stateValidation.ok) {
    return {
      statusCode: 400,
      headers: stateHeaders,
      body: buildMercadoLivreOAuthSafeErrorResponse({
        errorCode: stateValidation.errorCode || "oauth_state_invalid",
        message: "OAuth state validation failed.",
        nextStep: "Restart OAuth from /api/auth/mercadolivre/start.",
      }),
    };
  }

  const code = String(query.code || "").trim();
  if (!code) {
    return {
      statusCode: 400,
      headers: stateHeaders,
      body: buildMercadoLivreOAuthSafeErrorResponse({
        errorCode: "authorization_code_missing",
        message: "Authorization code is missing.",
        nextStep: "Restart OAuth from /api/auth/mercadolivre/start.",
      }),
    };
  }

  const exchange = await exchangeMercadoLivreAuthorizationCode(code, {
    env,
    fetcher: input.fetcher,
  });

  if (!exchange.ok) {
    return {
      statusCode: exchange.error === "token_exchange_failed" ? 502 : 500,
      headers: stateHeaders,
      body: sanitizeMercadoLivreOAuthForHttpResponse({
        ok: false,
        errorCode: exchange.error === "token_exchange_failed" ? "token_exchange_failed" : "provider_error",
        message: sanitizeMercadoLivreOAuthErrorMessage(
          exchange.safeErrorBodyPreview || exchange.message || "Token exchange failed.",
          env
        ),
        httpStatus: exchange.httpStatus ?? null,
        nextStep: "Restart OAuth from /api/auth/mercadolivre/start after reviewing configuration.",
      }),
    };
  }

  const token = exchange.token || {};
  const persistence = await persistMercadoLivreOAuthTokens({
    env,
    token,
    nowMs: Number.isFinite(input.nowMs) ? input.nowMs : Date.now(),
    fetcher: input.fetcher,
    store: input.store,
  });

  if (!persistence.ok) {
    const isNotConfigured =
      persistence.status === MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_STATUS.NOT_CONFIGURED;
    if (isNotConfigured) {
      return {
        statusCode: 200,
        headers: stateHeaders,
        body: buildMercadoLivreOAuthSafeSuccessResponse({
          accessTokenReceived: !!token.access_token,
          refreshTokenReceived: !!token.refresh_token,
          expiresInReceived: token.expires_in != null,
          tokenTypeReceived: !!token.token_type,
          tokenPersistenceStatus: MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_STATUS.NOT_CONFIGURED,
          nextStep:
            "Authorization completed, but tokens were not persisted. Configure secure persistence before repeating OAuth.",
        }),
      };
    }

    return {
      statusCode: 500,
      headers: stateHeaders,
      body: buildMercadoLivreOAuthSafeErrorResponse({
        errorCode: persistence.reasonCode || "token_persistence_failed",
        message: persistence.message || "Secure token persistence failed.",
        nextStep: "Fix vault configuration and repeat OAuth. Tokens were not returned to the browser.",
      }),
    };
  }

  return {
    statusCode: 200,
    headers: stateHeaders,
    body: buildMercadoLivreOAuthSafeSuccessResponse({
      accessTokenReceived: persistence.accessTokenReceived === true,
      refreshTokenReceived: persistence.refreshTokenReceived === true,
      expiresInReceived: persistence.expiresInReceived === true,
      tokenTypeReceived: persistence.tokenTypeReceived === true,
      tokenPersistenceStatus: MERCADOLIVRE_OAUTH_TOKEN_PERSISTENCE_STATUS.PERSISTED,
      nextStep: persistence.message || "OAuth credentials stored securely.",
    }),
  };
}
