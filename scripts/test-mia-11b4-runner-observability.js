/**
 * PATCH 11B.4.1 — Runner observability unit tests (no production calls)
 */
import {
  ValidationRunner,
  FAILURE_TYPES,
  classifyFetchError,
  isRetryEligible,
  sanitizeResponseSnapshot,
  sanitizeStack,
  truncateText,
  parseCliArgs,
} from "./test-mia-11b4-observability.mjs";

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
  expectTrue(label, actual === expected);
  if (actual !== expected) console.error(`  expected=${expected} actual=${actual}`);
}

// ── Taxonomy ──
expectEqual("classify timeout", classifyFetchError(new Error("AbortError"), true), FAILURE_TYPES.NETWORK_TIMEOUT);
expectEqual("classify 429", classifyFetchError(null, false, 429), FAILURE_TYPES.HTTP_429);
expectEqual("classify 503", classifyFetchError(null, false, 503), FAILURE_TYPES.HTTP_5XX);
expectEqual("classify dns", classifyFetchError(new Error("getaddrinfo ENOTFOUND"), false), FAILURE_TYPES.DNS_ERROR);

// ── Commercial timeout retry eligibility (responseReceived fix) ──
expectTrue(
  "commercial timeout retry eligible when no response",
  isRetryEligible(FAILURE_TYPES.NETWORK_TIMEOUT, { commercialTurn: true, responseReceived: false })
);
expectTrue(
  "commercial timeout retry blocked after response",
  !isRetryEligible(FAILURE_TYPES.NETWORK_TIMEOUT, { commercialTurn: true, responseReceived: true })
);
expectTrue("retry not eligible assertion", !isRetryEligible(FAILURE_TYPES.ASSERTION_FAILURE));
expectTrue(
  "retry not eligible commercial after response",
  !isRetryEligible(FAILURE_TYPES.HTTP_5XX, { commercialTurn: true, responseReceived: true })
);

// ── Sanitization ──
const sanitized = sanitizeStack("Error at x\nx-api-key: secret123\nBearer abc");
expectTrue("stack redacts api key", !sanitized.includes("secret123"));
expectTrue("truncate works", truncateText("a".repeat(100), 20).includes("truncated"));

const snap = sanitizeResponseSnapshot({ reply: "hello", httpStatus: 200, paidExternal: 0 }, {});
expectTrue("snapshot has reply", snap.reply === "hello");

// ── CLI groups ──
const args = parseCliArgs(["--group", "social,follow-up"]);
expectTrue("parse groups", args.groups.includes("social") && args.groups.includes("follow-up"));

// ── Assertion failure simulated ──
{
  const runner = new ValidationRunner({ label: "mock" });
  const caseResult = runner.startCase({ id: "MOCK-ASSERT-001", name: "assert fail", group: "mock" });
  const turnResult = { turnIndex: 1, input: "x", durationMs: 10, httpStatus: 200, sanitizedTrace: {} };
  runner.assertCondition({
    caseResult,
    turnResult,
    name: "excluded_brand_not_recommended",
    condition: false,
    expected: "zero Apple",
    actual: "iPhone returned",
  });
  runner.finishCase(caseResult, "FAIL");
  expectEqual("assertion failure type", caseResult.failureType, FAILURE_TYPES.ASSERTION_FAILURE);
  expectEqual("assertion name preserved", caseResult.failedAssertion, "excluded_brand_not_recommended");
}

// ── Timeout simulated ──
{
  const runner = new ValidationRunner({ label: "mock" });
  const caseResult = runner.startCase({ id: "MOCK-TIMEOUT-001", name: "timeout", group: "mock" });
  runner.recordTurnFailure(
    caseResult,
    { turnIndex: 2, input: "slow", durationMs: 30000, httpStatus: null },
    { failureType: FAILURE_TYPES.NETWORK_TIMEOUT, failureMessage: "timeout after 30000ms" }
  );
  runner.finishCase(caseResult, "FAIL");
  expectEqual("timeout classified", caseResult.failureType, FAILURE_TYPES.NETWORK_TIMEOUT);
}

// ── HTTP 5xx simulated ──
{
  const ft = classifyFetchError(null, false, 500);
  expectEqual("500 classified", ft, FAILURE_TYPES.HTTP_5XX);
}

// ── Invalid JSON simulated ──
{
  const runner = new ValidationRunner({ label: "mock" });
  const caseResult = runner.startCase({ id: "MOCK-JSON-001", name: "json", group: "mock" });
  runner.recordTurnFailure(
    caseResult,
    { turnIndex: 1, input: "x", durationMs: 100, httpStatus: 200 },
    { failureType: FAILURE_TYPES.INVALID_JSON, failureMessage: "invalid json" }
  );
  runner.finishCase(caseResult, "FAIL");
  expectEqual("invalid json", caseResult.failureType, FAILURE_TYPES.INVALID_JSON);
}

// ── Transient recovered simulated ──
{
  const runner = new ValidationRunner({ label: "mock" });
  const caseResult = runner.startCase({ id: "MOCK-RECOVER-001", name: "recovered", group: "mock" });
  caseResult.initialFailure = { turnIndex: 6, failureType: FAILURE_TYPES.NETWORK_TIMEOUT, durationMs: 30000 };
  caseResult.transientRecovered = true;
  runner.recordTurnPass(caseResult, { turnIndex: 6, input: "retry", durationMs: 6421, httpStatus: 200 });
  runner.finishCase(caseResult, "TRANSIENT_RECOVERED");
  expectTrue("transient recovered status", caseResult.status === "TRANSIENT_RECOVERED");
  expectTrue("initial failure preserved", caseResult.initialFailure.firstFailure !== false);
}

// ── Retry not eligible ──
expectTrue("assertion not retry eligible", !isRetryEligible(FAILURE_TYPES.ASSERTION_FAILURE));

// ── Concurrent failures simulated ──
{
  const runner = new ValidationRunner({ label: "mock" });
  const a = runner.startCase({ id: "MOCK-CONC-A", name: "A", group: "concurrency" });
  const b = runner.startCase({ id: "MOCK-CONC-B", name: "B", group: "concurrency" });
  runner.recordTurnFailure(a, { turnIndex: 1, input: "a", durationMs: 1 }, { failureType: FAILURE_TYPES.ASSERTION_FAILURE, failedAssertion: "a" });
  runner.finishCase(a, "FAIL");
  runner.recordTurnPass(b, { turnIndex: 1, input: "b", durationMs: 1, httpStatus: 200 });
  runner.finishCase(b, "PASS");
  expectEqual("concurrent one fail one pass", runner.buildSummary().failed, 1);
  expectEqual("concurrent clean pass", runner.buildSummary().cleanPass, 1);
}

// ── Promise rejection / infrastructure ──
{
  const runner = new ValidationRunner({ label: "mock" });
  runner.markInfrastructureFailure(new Error("runner crashed"));
  const skipped = runner.startCase({ id: "MOCK-SKIP-001", name: "skipped", group: "mock" });
  expectTrue("infra skips case", skipped === null);
  expectEqual("infra exit code", runner.getExitCode(), 1);
}

// ── Exit codes ──
{
  const runner = new ValidationRunner({ label: "mock" });
  const ok = runner.startCase({ id: "MOCK-OK", name: "ok", group: "mock" });
  runner.finishCase(ok, "PASS");
  expectEqual("exit 0 on pass", runner.getExitCode(), 0);
}

{
  const runner = new ValidationRunner({ label: "mock" });
  const bad = runner.startCase({ id: "MOCK-BAD", name: "bad", group: "mock" });
  runner.finishCase(bad, "FAIL");
  expectEqual("exit 1 on fail", runner.getExitCode(), 1);
}

// ── Human summary does not hide failures ──
{
  const runner = new ValidationRunner({ label: "mock" });
  const c = runner.startCase({ id: "11B4-REFINEMENT-005", name: "refine", group: "refinement" });
  runner.recordTurnFailure(
    c,
    { turnIndex: 4, input: "sem iPhone", durationMs: 4210, httpStatus: 200, sanitizedTrace: { reply: "iPhone 15" } },
    {
      failureType: FAILURE_TYPES.ASSERTION_FAILURE,
      failedAssertion: "excluded_brand_not_recommended",
      failureMessage: "expected no Apple",
    }
  );
  runner.finishCase(c, "FAIL");
  const summary = runner.buildSummary();
  expectTrue("summary shows failed count", summary.failed === 1);
}

console.log(`\n=== RUNNER OBSERVABILITY TESTS ===`);
console.log(`passed=${passed} failed=${failed}`);
process.exit(failed > 0 ? 1 : 0);
