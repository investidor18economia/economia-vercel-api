/**
 * PATCH 3.3A — Authentication trust foundation tests.
 */
import crypto from "crypto";
import {
  normalizeAuthEmail,
  isValidAuthEmailFormat,
} from "../lib/miaAuthEmailNormalize.js";
import {
  generateAuthOtpCode,
  hashAuthOtpCode,
  verifyAuthOtpCode,
  isAuthChallengeExpired,
  buildAuthChallengeExpiry,
  MIA_AUTH_OTP_LENGTH,
} from "../lib/miaAuthChallengeCrypto.js";
import {
  MIA_AUTH_REQUEST_MAX_PER_EMAIL,
  buildAuthRequestRateLimitKeys,
  evaluateDistributedRateLimitBucket,
  hashAuthRateLimitKey,
  parseAuthRateLimitRpcResult,
} from "../lib/miaAuthRateLimit.js";
import {
  evaluateAuthChallengeState,
  verifyAuthChallengeCode,
  AUTH_CHALLENGE_SENT_MESSAGE,
} from "../lib/miaAuthChallengeStore.js";
import {
  issueUserSessionToken,
  verifyUserSessionToken,
} from "../lib/miaUserSessionToken.js";
import { resolveAnalyticsTrackInsertUserId } from "../lib/miaAnalyticsAuth.js";
import { isAuthEmailDeliveryConfigured } from "../lib/miaAuthLoginEmail.js";
import registerUserHandler from "../pages/api/register-user.js";

const TEST_ENV = {
  MIA_USER_SESSION_SECRET: "patch-33a-test-secret",
  MIA_AUTH_CHALLENGE_SECRET: "patch-33a-challenge-secret",
};

const USER_U1 = "11111111-2222-4333-8444-555555555555";
const USER_U2 = "22222222-3333-4444-8555-666666666666";

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

function buildReq(body = {}, headers = {}) {
  return { method: "POST", body, headers };
}

function buildRes() {
  const res = {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    setHeader(key, value) {
      this.headers[key] = value;
    },
  };
  return res;
}

console.log("\nPATCH 3.3A — authentication trust foundation tests\n");

// Email normalization
{
  assert("normalize trims and lowercases", normalizeAuthEmail("  Test@Example.COM ") === "test@example.com");
  assert("invalid email rejected", normalizeAuthEmail("not-an-email") === null);
}

// OTP crypto
{
  const code = generateAuthOtpCode();
  assert("OTP length", code.length === MIA_AUTH_OTP_LENGTH);
  assert("OTP numeric", /^\d{6}$/.test(code));
  const challengeId = crypto.randomUUID();
  const hash = hashAuthOtpCode(challengeId, code, TEST_ENV);
  assert("hash stored not plaintext", hash !== code);
  assert("verify correct code", verifyAuthOtpCode(challengeId, code, hash, TEST_ENV));
  assert("verify wrong code fails", !verifyAuthOtpCode(challengeId, "000000", hash, TEST_ENV));
}

// Expiration
{
  const expiredAt = new Date(Date.now() - 1000).toISOString();
  assert("expired challenge detected", isAuthChallengeExpired(expiredAt));
  assert("active challenge valid", !isAuthChallengeExpired(buildAuthChallengeExpiry()));
}

// Challenge state
{
  const active = {
    id: crypto.randomUUID(),
    consumed_at: null,
    delivery_sent_at: new Date().toISOString(),
    delivery_failed_at: null,
    expires_at: buildAuthChallengeExpiry(),
    attempt_count: 0,
    max_attempts: 5,
  };
  assert("active challenge ok", evaluateAuthChallengeState(active).ok === true);
  assert("consumed rejected", evaluateAuthChallengeState({ ...active, consumed_at: new Date().toISOString() }).reasonCode === "auth_challenge_consumed");
  assert("expired rejected", evaluateAuthChallengeState({ ...active, expires_at: new Date(Date.now() - 1000).toISOString() }).reasonCode === "auth_challenge_expired");
  assert(
    "attempts exceeded rejected",
    evaluateAuthChallengeState({ ...active, attempt_count: 5, max_attempts: 5 }).reasonCode ===
      "auth_challenge_attempts_exceeded"
  );
}

// Challenge code verify wrapper
{
  const challengeId = crypto.randomUUID();
  const code = "123456";
  const challenge = {
    id: challengeId,
    token_hash: hashAuthOtpCode(challengeId, code, TEST_ENV),
  };
  assert("wrapper verifies valid code", verifyAuthChallengeCode(challenge, code, TEST_ENV));
  assert("wrapper rejects invalid code", !verifyAuthChallengeCode(challenge, "654321", TEST_ENV));
}

// Rate limit (distributed bucket semantics)
{
  const store = new Map();
  const req = { headers: { "x-forwarded-for": "203.0.113.10" } };
  const email = "rate-limit@test.invalid";
  const { emailKeyHash } = buildAuthRequestRateLimitKeys({ emailNormalized: email, req }, TEST_ENV);
  const nowMs = Date.UTC(2026, 6, 22, 12, 0, 0);
  let okCount = 0;
  for (let index = 0; index < MIA_AUTH_REQUEST_MAX_PER_EMAIL; index += 1) {
    const result = evaluateDistributedRateLimitBucket(store, {
      scope: "request_email",
      keyHash: emailKeyHash,
      windowSeconds: 900,
      maxRequests: MIA_AUTH_REQUEST_MAX_PER_EMAIL,
      nowMs,
    });
    if (result.allowed) okCount += 1;
  }
  const blocked = evaluateDistributedRateLimitBucket(store, {
    scope: "request_email",
    keyHash: emailKeyHash,
    windowSeconds: 900,
    maxRequests: MIA_AUTH_REQUEST_MAX_PER_EMAIL,
    nowMs,
  });
  const parsed = parseAuthRateLimitRpcResult({
    ok: false,
    reason_code: "auth_rate_limited",
    retry_after_seconds: 30,
  });
  assert("first three email requests allowed", okCount === MIA_AUTH_REQUEST_MAX_PER_EMAIL);
  assert("fourth email request blocked", blocked.allowed === false);
  assert("rate limit rpc parser handles 429", parsed.ok === false);
  assert("rate key uses HMAC not raw email", !hashAuthRateLimitKey("request_email", email, TEST_ENV).includes("@"));
}

// Delivery gate
{
  const undelivered = {
    id: crypto.randomUUID(),
    consumed_at: null,
    delivery_sent_at: null,
    delivery_failed_at: null,
    expires_at: buildAuthChallengeExpiry(),
    attempt_count: 0,
    max_attempts: 5,
  };
  assert(
    "undelivered challenge rejected",
    evaluateAuthChallengeState(undelivered).reasonCode === "auth_challenge_delivery_failed"
  );
}

// Session token purpose
{
  const token = issueUserSessionToken(USER_U1, TEST_ENV);
  const verified = verifyUserSessionToken(token, TEST_ENV);
  assert("verified session token has purpose", verified.ok === true && verified.userId === USER_U1);
  const legacyBody = Buffer.from(JSON.stringify({ uid: USER_U1, iat: Date.now(), exp: Date.now() + 60000 })).toString("base64url");
  const legacySig = crypto.createHmac("sha256", TEST_ENV.MIA_USER_SESSION_SECRET).update(legacyBody).digest("base64url");
  const legacyToken = `${legacyBody}.${legacySig}`;
  assert("legacy token without purpose rejected", verifyUserSessionToken(legacyToken, TEST_ENV).ok === false);
}

// register-user no longer emits session
{
  const req = buildReq({ email: "impersonation@test.invalid", name: "Attacker" });
  const res = buildRes();
  await registerUserHandler(req, res);
  assert("register-user blocked", res.statusCode === 403);
  assert("register-user no session_token", !res.body?.session_token);
  assert("register-user verification_required", res.body?.reasonCode === "auth_verification_required");
}

// Analytics still server-side only
{
  const token = issueUserSessionToken(USER_U1, TEST_ENV);
  assert(
    "analytics resolves verified session",
    resolveAnalyticsTrackInsertUserId(buildReq({}, { authorization: `Bearer ${token}` }), TEST_ENV) === USER_U1
  );
  assert(
    "analytics ignores spoof body",
    resolveAnalyticsTrackInsertUserId(buildReq({ user_id: USER_U2 }, { authorization: `Bearer ${token}` }), TEST_ENV) === USER_U1
  );
  assert(
    "analytics anonymous without session",
    resolveAnalyticsTrackInsertUserId(buildReq({ user_id: USER_U1 }), TEST_ENV) === null
  );
}

// Anti-enumeration message exists
{
  assert("anti-enumeration message defined", AUTH_CHALLENGE_SENT_MESSAGE.includes("Se o endereço puder receber"));
}

// Email config helper
{
  assert("delivery configured only with key", isAuthEmailDeliveryConfigured({ RESEND_API_KEY: "re_test" }) === true);
  assert("delivery missing without key", isAuthEmailDeliveryConfigured({ RESEND_API_KEY: "" }) === false);
}

// Name is not identity proof (format only)
{
  assert("name alone does not normalize email", normalizeAuthEmail("João Silva") === null);
}

console.log(`\nResultado: ${passed}/${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
