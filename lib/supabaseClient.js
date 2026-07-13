/**
 * Server-only Supabase admin client (service_role).
 * Não importar em componentes React / código client-side.
 */

import { createClient } from "@supabase/supabase-js";

let adminClient = null;
let adminClientKey = null;

function readSupabaseUrlFromEnv(env = process.env) {
  return String(env?.NEXT_PUBLIC_SUPABASE_URL || env?.SUPABASE_URL || "").trim();
}

function readServiceRoleKeyFromEnv(env = process.env) {
  return String(env?.SUPABASE_SERVICE_ROLE_KEY || "").trim();
}

function readSupabaseUrl() {
  return readSupabaseUrlFromEnv(process.env);
}

function readServiceRoleKey() {
  return readServiceRoleKeyFromEnv(process.env);
}

/**
 * @param {string} key
 */
export function readSupabaseJwtRole(key = "") {
  const token = String(key || "").trim();
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof payload?.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

/**
 * @param {Record<string, string|undefined>} [env]
 * @returns {string|null}
 */
export function getSupabaseAdminConfigErrorForEnv(env = process.env) {
  if (!readSupabaseUrlFromEnv(env)) return "supabase_url_missing";
  const key = readServiceRoleKeyFromEnv(env);
  if (!key) return "service_role_key_missing";
  const role = readSupabaseJwtRole(key);
  if (role && role !== "service_role") return "invalid_service_role_key";
  return null;
}

/**
 * @returns {string|null}
 */
export function getSupabaseAdminConfigError() {
  return getSupabaseAdminConfigErrorForEnv(process.env);
}

/**
 * @param {Record<string, string|undefined>} [env]
 * @returns {boolean}
 */
export function isSupabaseServiceRoleConfiguredForEnv(env = process.env) {
  return getSupabaseAdminConfigErrorForEnv(env) === null;
}

/**
 * @returns {boolean}
 */
export function isSupabaseServiceRoleConfigured() {
  return isSupabaseServiceRoleConfiguredForEnv(process.env);
}

/**
 * Cliente Supabase com service_role — somente backend/API routes.
 * @returns {import("@supabase/supabase-js").SupabaseClient|null}
 */
export function getSupabaseAdminClient() {
  const configError = getSupabaseAdminConfigError();
  if (configError) {
    return null;
  }

  const url = readSupabaseUrl();
  const key = readServiceRoleKey();

  if (adminClient && adminClientKey === key) {
    return adminClient;
  }

  adminClient = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  adminClientKey = key;

  if (process.env.NODE_ENV !== "production") {
    const role = readSupabaseJwtRole(key);
    console.log("[Supabase Admin] client ready", { role: role || "unknown" });
  }

  return adminClient;
}

/**
 * Compat: APIs server-side existentes importam `supabase`.
 * Inicialização lazy — evita createClient com key undefined no import.
 */
export const supabase = new Proxy(
  {},
  {
    get(_target, prop) {
      const client = getSupabaseAdminClient();
      if (!client) {
        const code = getSupabaseAdminConfigError() || "service_role_key_missing";
        throw new Error(code);
      }
      const value = client[prop];
      return typeof value === "function" ? value.bind(client) : value;
    },
  }
);

export const supabaseAdmin = supabase;
