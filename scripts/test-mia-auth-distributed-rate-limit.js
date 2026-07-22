/**
 * PATCH 3.3A.1 — Distributed auth rate limit tests.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MIA_AUTH_REQUEST_MAX_PER_EMAIL,
  MIA_AUTH_REQUEST_MAX_PER_IP,
  MIA_AUTH_REQUEST_WINDOW_SECONDS,
  MIA_AUTH_RATE_LIMIT_SCOPES,
  buildAuthRequestRateLimitKeys,
  evaluateDistributedRateLimitBucket,
  hashAuthRateLimitKey,
  parseAuthRateLimitRpcResult,
} from "../lib/miaAuthRateLimit.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const TEST_ENV = {
  MIA_AUTH_RATE_LIMIT_SECRET: "patch-33a1-rate-secret",
  MIA_AUTH_CHALLENGE_SECRET: "patch-33a1-challenge-secret",
};

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${label}`);
    return;
  }
  failed += 1;
  console.error(`  ❌ ${label}`);
}

console.log("\nPATCH 3.3A.1 — distributed auth rate limit tests\n");

{
  const hashA = hashAuthRateLimitKey("request_email", "user@example.com", TEST_ENV);
  const hashB = hashAuthRateLimitKey("request_email", "user@example.com", TEST_ENV);
  assert("rate key hash is deterministic", hashA === hashB && hashA.length === 64);
  assert("rate key hash hides raw email", !hashA.includes("user@example.com"));
  assert(
    "different scopes produce different hashes",
    hashAuthRateLimitKey("request_email", "203.0.113.1", TEST_ENV) !==
      hashAuthRateLimitKey("request_origin", "203.0.113.1", TEST_ENV)
  );
}

{
  const keys = buildAuthRequestRateLimitKeys(
    { emailNormalized: "test@example.com", req: { headers: { "x-forwarded-for": "203.0.113.10" } } },
    TEST_ENV
  );
  assert("email key hash generated", keys.emailKeyHash.length === 64);
  assert("origin key hash generated", keys.originKeyHash.length === 64);
}

{
  const store = new Map();
  const scope = MIA_AUTH_RATE_LIMIT_SCOPES.REQUEST_EMAIL;
  const keyHash = hashAuthRateLimitKey(scope, "parallel@test.invalid", TEST_ENV);
  const nowMs = Date.UTC(2026, 6, 22, 12, 0, 0);

  let allowed = 0;
  let blocked = 0;
  for (let index = 0; index < 10; index += 1) {
    const result = evaluateDistributedRateLimitBucket(store, {
      scope,
      keyHash,
      windowSeconds: MIA_AUTH_REQUEST_WINDOW_SECONDS,
      maxRequests: MIA_AUTH_REQUEST_MAX_PER_EMAIL,
      nowMs,
    });
    if (result.allowed) allowed += 1;
    else blocked += 1;
  }

  assert("parallel email requests allow only limit", allowed === MIA_AUTH_REQUEST_MAX_PER_EMAIL);
  assert("parallel email requests block overflow", blocked === 10 - MIA_AUTH_REQUEST_MAX_PER_EMAIL);
}

{
  const store = new Map();
  const scope = MIA_AUTH_RATE_LIMIT_SCOPES.REQUEST_ORIGIN;
  const keyHash = hashAuthRateLimitKey(scope, "203.0.113.55", TEST_ENV);
  const nowMs = Date.UTC(2026, 6, 22, 12, 0, 0);
  let allowed = 0;

  for (let index = 0; index < MIA_AUTH_REQUEST_MAX_PER_IP + 2; index += 1) {
    const result = evaluateDistributedRateLimitBucket(store, {
      scope,
      keyHash,
      windowSeconds: MIA_AUTH_REQUEST_WINDOW_SECONDS,
      maxRequests: MIA_AUTH_REQUEST_MAX_PER_IP,
      nowMs,
    });
    if (result.allowed) allowed += 1;
  }

  assert("origin limit enforced", allowed === MIA_AUTH_REQUEST_MAX_PER_IP);
}

{
  const store = new Map();
  const scope = MIA_AUTH_RATE_LIMIT_SCOPES.REQUEST_EMAIL;
  const keyHash = hashAuthRateLimitKey(scope, "persist@test.invalid", TEST_ENV);
  const windowStart = Date.UTC(2026, 6, 22, 12, 0, 0);

  evaluateDistributedRateLimitBucket(store, {
    scope,
    keyHash,
    windowSeconds: MIA_AUTH_REQUEST_WINDOW_SECONDS,
    maxRequests: MIA_AUTH_REQUEST_MAX_PER_EMAIL,
    nowMs: windowStart,
  });

  const restartedStore = new Map(store);
  const blocked = evaluateDistributedRateLimitBucket(restartedStore, {
    scope,
    keyHash,
    windowSeconds: MIA_AUTH_REQUEST_WINDOW_SECONDS,
    maxRequests: MIA_AUTH_REQUEST_MAX_PER_EMAIL,
    nowMs: windowStart + 1000,
  });

  assert("simulated restart keeps persisted bucket count", blocked.count === 2);
}

{
  const parsed = parseAuthRateLimitRpcResult({
    ok: false,
    reason_code: "auth_rate_limited",
    scope: "email",
    retry_after_seconds: 120,
  });
  assert("rpc rate limit parser blocks", parsed.ok === false && parsed.retryAfterSeconds === 120);
}

{
  const migration = readFileSync(
    join(ROOT, "supabase/migrations/20260722160000_mia_auth_abuse_protection_v1.sql"),
    "utf8"
  );
  assert("migration creates mia_auth_rate_limits", /create table if not exists public\.mia_auth_rate_limits/i.test(migration));
  assert("migration defines consume_rate_limit RPC", /mia_auth_consume_rate_limit/i.test(migration));
  assert("migration defines request_challenge RPC", /mia_auth_request_challenge/i.test(migration));
  assert("migration defines verify_challenge RPC", /mia_auth_verify_challenge/i.test(migration));
  assert("migration enables RLS on rate limits", /alter table public\.mia_auth_rate_limits enable row level security/i.test(migration));
  assert("migration grants service_role only", /grant execute on function public\.mia_auth_verify_challenge/u.test(migration));
  assert("migration has no DROP users", !/\bdrop table public\.users\b/i.test(migration));
  assert("migration has no raw email storage", !/\bemail text not null\b/i.test(migration));
}

console.log(`\nResultado: ${passed}/${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
