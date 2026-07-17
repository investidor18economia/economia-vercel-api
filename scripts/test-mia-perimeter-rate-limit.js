/**
 * PATCH 12B — Perimeter rate limit unit tests (no external calls).
 */
import {
  evaluatePerimeterRateLimit,
  resetPerimeterRateLimitStore,
  resolvePerimeterRateLimitConfig,
  hashPerimeterClientIdentifier,
  buildPerimeterRateLimit429Payload,
  PERIMETER_RATE_LIMIT_REASON_CODE,
} from "../lib/miaPerimeterRateLimit.js";

let passed = 0;
let failed = 0;

function expectTrue(label, condition) {
  if (condition) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`FAIL: ${label}`);
}

function expectEqual(label, actual, expected) {
  if (actual === expected) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`FAIL: ${label} expected=${expected} actual=${actual}`);
}

function makeReq(ip = "203.0.113.10", forwarded = null) {
  return {
    headers: forwarded ? { "x-forwarded-for": forwarded } : { "x-forwarded-for": ip },
    socket: { remoteAddress: ip },
  };
}

{
  const store = new Map();
  const env = {
    MIA_PERIMETER_RATE_LIMIT_ENABLED: "true",
    MIA_PERIMETER_RATE_LIMIT_WINDOW_MS: "60000",
    MIA_PERIMETER_RATE_LIMIT_MAX_REQUESTS: "3",
  };

  resetPerimeterRateLimitStore(store);

  const first = evaluatePerimeterRateLimit({ req: makeReq("1.2.3.4") }, env, store);
  const second = evaluatePerimeterRateLimit({ req: makeReq("1.2.3.4") }, env, store);
  const third = evaluatePerimeterRateLimit({ req: makeReq("1.2.3.4") }, env, store);
  const fourth = evaluatePerimeterRateLimit({ req: makeReq("1.2.3.4") }, env, store);

  expectTrue("below limit allowed", first.allowed && second.allowed && third.allowed);
  expectTrue("above limit blocked", fourth.allowed === false && fourth.limited === true);
  expectEqual("429 reason code", fourth.reasonCode, PERIMETER_RATE_LIMIT_REASON_CODE);
  expectTrue("retry-after seconds present", (fourth.retryAfterSeconds || 0) >= 1);
}

{
  const store = new Map();
  const env = {
    MIA_PERIMETER_RATE_LIMIT_ENABLED: "true",
    MIA_PERIMETER_RATE_LIMIT_WINDOW_MS: "1000",
    MIA_PERIMETER_RATE_LIMIT_MAX_REQUESTS: "1",
  };

  resetPerimeterRateLimitStore(store);
  evaluatePerimeterRateLimit({ req: makeReq("9.9.9.9") }, env, store);
  const blocked = evaluatePerimeterRateLimit({ req: makeReq("9.9.9.9") }, env, store);
  expectTrue("second request blocked", blocked.allowed === false);

  await new Promise((resolve) => setTimeout(resolve, 1100));

  const afterWindow = evaluatePerimeterRateLimit({ req: makeReq("9.9.9.9") }, env, store);
  expectTrue("expired window allows again", afterWindow.allowed === true);
}

{
  const store = new Map();
  const env = {
    MIA_PERIMETER_RATE_LIMIT_ENABLED: "true",
    MIA_PERIMETER_RATE_LIMIT_WINDOW_MS: "60000",
    MIA_PERIMETER_RATE_LIMIT_MAX_REQUESTS: "2",
  };

  resetPerimeterRateLimitStore(store);
  evaluatePerimeterRateLimit({ req: makeReq("5.5.5.5") }, env, store);
  evaluatePerimeterRateLimit({ req: makeReq("5.5.5.5") }, env, store);
  const sameIpDifferentConversation = evaluatePerimeterRateLimit(
    { req: makeReq("5.5.5.5"), conversationId: "conv-a" },
    env,
    store
  );
  expectTrue(
    "different conversation_id on same IP does not bypass primary limit",
    sameIpDifferentConversation.allowed === false
  );
}

{
  const store = new Map();
  const env = {
    MIA_PERIMETER_RATE_LIMIT_ENABLED: "true",
    MIA_PERIMETER_RATE_LIMIT_WINDOW_MS: "60000",
    MIA_PERIMETER_RATE_LIMIT_MAX_REQUESTS: "2",
  };

  resetPerimeterRateLimitStore(store);
  evaluatePerimeterRateLimit({ req: makeReq("8.8.8.8") }, env, store);
  evaluatePerimeterRateLimit({ req: makeReq("8.8.4.4") }, env, store);
  expectEqual("separate identifiers keep separate counters", store.size, 2);
}

{
  const store = new Map();
  const env = { MIA_PERIMETER_RATE_LIMIT_ENABLED: "false" };
  resetPerimeterRateLimitStore(store);

  for (let index = 0; index < 20; index += 1) {
    const result = evaluatePerimeterRateLimit({ req: makeReq("1.1.1.1") }, env, store);
    expectTrue(`disabled limiter allows request ${index + 1}`, result.allowed === true);
  }
}

{
  const hash = hashPerimeterClientIdentifier("203.0.113.55");
  expectTrue("hash does not contain raw ip", !hash.includes("203.0.113.55"));
  expectEqual("hash length", hash.length, 32);
}

{
  const payload = buildPerimeterRateLimit429Payload();
  expectEqual("429 payload error", payload.error, "rate_limited");
  expectTrue("429 payload has human reply", typeof payload.reply === "string" && payload.reply.length > 10);
  expectTrue("429 payload hides internals", !JSON.stringify(payload).includes("hash"));
}

{
  const config = resolvePerimeterRateLimitConfig({
    MIA_PERIMETER_RATE_LIMIT_ENABLED: "true",
    MIA_PERIMETER_RATE_LIMIT_WINDOW_MS: "60000",
    MIA_PERIMETER_RATE_LIMIT_MAX_REQUESTS: "10",
  });
  expectEqual("default window", config.windowMs, 60000);
  expectEqual("default max requests", config.maxRequests, 10);
}

{
  const badStore = {
    get size() {
      return 0;
    },
    get() {
      throw new Error("store_failure");
    },
    set() {},
    delete() {},
    entries() {
      return [];
    },
  };
  const env = {
    MIA_PERIMETER_RATE_LIMIT_ENABLED: "true",
    MIA_PERIMETER_RATE_LIMIT_WINDOW_MS: "60000",
    MIA_PERIMETER_RATE_LIMIT_MAX_REQUESTS: "1",
  };

  const failOpen = evaluatePerimeterRateLimit({ req: makeReq("1.1.1.1") }, env, badStore);
  expectTrue("fail-open on limiter internal error", failOpen.allowed === true && failOpen.failOpen === true);
}

console.log(`\nPerimeter rate limit tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
