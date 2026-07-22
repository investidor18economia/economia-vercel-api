#!/usr/bin/env node
/**
 * PATCH 3.3A.2 — Operational setup (boolean output only; never prints secret values).
 */
import crypto from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getAuthOtpSecret,
  getAuthRateLimitSecret,
  getUserSessionSecret,
  isMiaAuthSecretError,
} from "../lib/miaAuthSecrets.js";
import { hashAuthOtpCode } from "../lib/miaAuthChallengeCrypto.js";
import { hashAuthRateLimitKey, MIA_AUTH_RATE_LIMIT_SCOPES } from "../lib/miaAuthRateLimit.js";
import { issueUserSessionToken, verifyUserSessionToken } from "../lib/miaUserSessionToken.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ENV_LOCAL = join(ROOT, ".env.local");
const PROD_SECRETS_FILE = join(ROOT, "tmp", "patch-33a2-prod-secrets.env");

const AUTH_VARS = [
  "MIA_USER_SESSION_SECRET",
  "MIA_AUTH_OTP_SECRET",
  "MIA_AUTH_RATE_LIMIT_SECRET",
];

function generateSecret() {
  return crypto.randomBytes(48).toString("base64");
}

function parseEnvFile(content) {
  const lines = content.split(/\r?\n/);
  const map = new Map();
  for (const line of lines) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) map.set(match[1].trim(), match[2]);
  }
  return { lines, map };
}

function upsertEnvVars(filePath, vars) {
  const existing = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
  const { lines, map } = parseEnvFile(existing);
  for (const [key, value] of Object.entries(vars)) {
    map.set(key, value);
  }
  const kept = lines.filter((line) => {
    const match = line.match(/^([^#=]+)=/);
    return !match || !vars[match[1].trim()];
  });
  const block = [
    "",
    "# PATCH 3.3A.2 — independent auth cryptographic secrets (local only; never commit)",
    ...AUTH_VARS.map((key) => `${key}=${map.get(key)}`),
    "",
  ];
  writeFileSync(filePath, [...kept, ...block].join("\n").replace(/\n{3,}/g, "\n\n"), "utf8");
}

function booleanChecks(values, apiSharedKey) {
  const present = AUTH_VARS.every((key) => String(values[key] ?? "").trim().length >= 32);
  const distinct =
    present &&
    new Set(AUTH_VARS.map((key) => values[key])).size === AUTH_VARS.length &&
    AUTH_VARS.every((key) => values[key] !== apiSharedKey);
  return { present, distinct };
}

function runLocalSmoke(env) {
  const userId = "11111111-2222-4333-8444-555555555555";
  const challengeId = crypto.randomUUID();
  const token = issueUserSessionToken(userId, env);
  const verified = verifyUserSessionToken(token, env);
  const otpHash = hashAuthOtpCode(challengeId, "123456", env);
  const rateHash = hashAuthRateLimitKey(
    MIA_AUTH_RATE_LIMIT_SCOPES.REQUEST_EMAIL,
    "user@example.com",
    env
  );
  return {
    session_issue_ok: verified.ok === true,
    otp_hash_ok: typeof otpHash === "string" && otpHash.length > 0,
    rate_hash_ok: typeof rateHash === "string" && rateHash.length > 0,
  };
}

function runNegativeSmoke(apiSharedKey) {
  const env = { API_SHARED_KEY: apiSharedKey };
  const results = { session: false, otp: false, rate: false };
  try {
    issueUserSessionToken("11111111-2222-4333-8444-555555555555", env);
  } catch (error) {
    results.session = isMiaAuthSecretError(error);
  }
  try {
    hashAuthOtpCode(crypto.randomUUID(), "123456", env);
  } catch (error) {
    results.otp = isMiaAuthSecretError(error);
  }
  try {
    hashAuthRateLimitKey(MIA_AUTH_RATE_LIMIT_SCOPES.REQUEST_EMAIL, "user@example.com", env);
  } catch (error) {
    results.rate = isMiaAuthSecretError(error);
  }
  return results;
}

mkdirSync(join(ROOT, "tmp"), { recursive: true });

const localSecrets = Object.fromEntries(AUTH_VARS.map((key) => [key, generateSecret()]));
const prodSecrets = Object.fromEntries(AUTH_VARS.map((key) => [key, generateSecret()]));

upsertEnvVars(ENV_LOCAL, localSecrets);
writeFileSync(
  PROD_SECRETS_FILE,
  [
    "# PATCH 3.3A.2 production secrets — DO NOT COMMIT",
    ...AUTH_VARS.map((key) => `${key}=${prodSecrets[key]}`),
    "",
  ].join("\n"),
  "utf8"
);

const localEnv = { ...parseEnvFile(readFileSync(ENV_LOCAL, "utf8")).map, ...localSecrets };
const apiSharedKey = String(localEnv.API_SHARED_KEY ?? "").trim();

const localChecks = booleanChecks(localSecrets, apiSharedKey);
const prodChecks = booleanChecks(prodSecrets, apiSharedKey);
const localAndProdSeparate = AUTH_VARS.every((key) => localSecrets[key] !== prodSecrets[key]);

const localSmoke = runLocalSmoke(localSecrets);
const negative = runNegativeSmoke(apiSharedKey);

console.log(JSON.stringify({
  local_all_present: localChecks.present,
  local_all_distinct: localChecks.distinct,
  local_distinct_from_api_shared_key: localChecks.distinct,
  production_all_present: prodChecks.present,
  production_all_distinct: prodChecks.distinct,
  production_distinct_from_api_shared_key: prodChecks.distinct,
  local_and_production_are_separate: localAndProdSeparate,
  local_smoke: localSmoke,
  negative_api_shared_key_only: negative,
  prod_secrets_file_written: existsSync(PROD_SECRETS_FILE),
}, null, 2));
