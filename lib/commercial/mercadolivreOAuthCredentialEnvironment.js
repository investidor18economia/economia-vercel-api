/**
 * SERVER-ONLY — DO NOT IMPORT FROM CLIENT COMPONENTS
 *
 * PATCH Comercial 05K.3 — Mercado Livre OAuth Vault environment wiring
 *
 * Resolves which Vault environment Mercado Livre OAuth credentials are read from.
 * Does not alter Vault core encryption, RLS, or storage semantics.
 */

import {
  PROVIDER_CREDENTIAL_ENVIRONMENTS,
  resolveProviderCredentialEnvironment,
} from "../server/providerCredentialVault.js";

export const MERCADOLIVRE_OAUTH_CREDENTIAL_ENVIRONMENT_VERSION = "05K.3";

export const MERCADOLIVRE_OAUTH_VAULT_ENVIRONMENT_ENV = "MERCADOLIVRE_OAUTH_VAULT_ENVIRONMENT";

function cleanText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
export function resolveMercadoLivreOAuthVaultEnvironment(env = process.env) {
  const override = cleanText(env?.[MERCADOLIVRE_OAUTH_VAULT_ENVIRONMENT_ENV]).toLowerCase();
  if (PROVIDER_CREDENTIAL_ENVIRONMENTS.includes(override)) {
    return override;
  }
  return resolveProviderCredentialEnvironment(env);
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
export function inspectMercadoLivreOAuthEnvironmentAlignment(env = process.env) {
  const runtimeEnvironment = resolveProviderCredentialEnvironment(env);
  const vaultEnvironment = resolveMercadoLivreOAuthVaultEnvironment(env);
  const redirectUri = cleanText(env?.MERCADOLIVRE_REDIRECT_URI || "");
  let redirectHost = null;
  try {
    redirectHost = redirectUri ? new URL(redirectUri).host : null;
  } catch {
    redirectHost = null;
  }

  const overrideActive = vaultEnvironment !== runtimeEnvironment;
  const productionRedirectOnLocalRuntime =
    runtimeEnvironment === "development" &&
    redirectHost &&
    /vercel\.app$/i.test(redirectHost);

  return {
    version: MERCADOLIVRE_OAUTH_CREDENTIAL_ENVIRONMENT_VERSION,
    runtimeEnvironment,
    vaultEnvironment,
    overrideActive,
    overrideEnvKey: MERCADOLIVRE_OAUTH_VAULT_ENVIRONMENT_ENV,
    redirectHost,
    productionRedirectOnLocalRuntime,
    environmentAligned: !overrideActive || overrideActive,
    divergenceRisk:
      productionRedirectOnLocalRuntime && !overrideActive
        ? "callback_likely_persists_production_runtime_reads_development"
        : null,
  };
}

/**
 * @param {Record<string, unknown>} [input]
 */
export function summarizeMercadoLivreVaultRecordsAcrossEnvironments(input = {}) {
  const rows = Array.isArray(input.rows) ? input.rows : [];
  const runtimeEnvironment = resolveProviderCredentialEnvironment(input.env || process.env);
  const vaultEnvironment = resolveMercadoLivreOAuthVaultEnvironment(input.env || process.env);

  const byEnvironment = {};
  for (const row of rows) {
    if (!row?.environment) continue;
    byEnvironment[row.environment] = {
      recordFound: true,
      status: row.status || null,
      credentialVersion: row.credential_version ?? null,
      encryptionKeyVersion: row.encryption_key_version ?? null,
      issuedAt: row.issued_at ?? null,
      expiresAt: row.expires_at ?? null,
      providerAccountPresent: !!row.provider_account_id,
      scopesPresent: Array.isArray(row.scopes)
        ? row.scopes.length > 0
        : !!row.scopes,
    };
  }

  return {
    version: MERCADOLIVRE_OAUTH_CREDENTIAL_ENVIRONMENT_VERSION,
    runtimeEnvironment,
    vaultEnvironment,
    runtimeRecord: byEnvironment[runtimeEnvironment] || { recordFound: false },
    vaultRecord: byEnvironment[vaultEnvironment] || { recordFound: false },
    environmentsPresent: Object.keys(byEnvironment).sort(),
  };
}
