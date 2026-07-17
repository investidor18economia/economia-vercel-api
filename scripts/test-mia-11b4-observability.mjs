/**
 * PATCH 11B.4.1 — Production Validation Observability
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { ROOT, fetchWithTimeout } from "./test-mia-11b4-shared.mjs";

export const FAILURE_TYPES = Object.freeze({
  ASSERTION_FAILURE: "ASSERTION_FAILURE",
  NETWORK_TIMEOUT: "NETWORK_TIMEOUT",
  CONNECTION_ERROR: "CONNECTION_ERROR",
  DNS_ERROR: "DNS_ERROR",
  HTTP_4XX: "HTTP_4XX",
  HTTP_429: "HTTP_429",
  HTTP_5XX: "HTTP_5XX",
  EMPTY_RESPONSE: "EMPTY_RESPONSE",
  INVALID_JSON: "INVALID_JSON",
  BROWSER_NAVIGATION_FAILURE: "BROWSER_NAVIGATION_FAILURE",
  BROWSER_SELECTOR_FAILURE: "BROWSER_SELECTOR_FAILURE",
  PAGE_ERROR: "PAGE_ERROR",
  CONSOLE_ERROR: "CONSOLE_ERROR",
  REQUEST_FAILED: "REQUEST_FAILED",
  SESSION_STATE_FAILURE: "SESSION_STATE_FAILURE",
  CONCURRENCY_ISOLATION_FAILURE: "CONCURRENCY_ISOLATION_FAILURE",
  PROVIDER_POLICY_FAILURE: "PROVIDER_POLICY_FAILURE",
  RUNNER_INTERNAL_ERROR: "RUNNER_INTERNAL_ERROR",
  UNKNOWN_FAILURE: "UNKNOWN_FAILURE",
});

export const RETRY_ELIGIBLE = new Set([
  FAILURE_TYPES.NETWORK_TIMEOUT,
  FAILURE_TYPES.CONNECTION_ERROR,
  FAILURE_TYPES.DNS_ERROR,
  FAILURE_TYPES.HTTP_429,
  FAILURE_TYPES.HTTP_502,
  FAILURE_TYPES.HTTP_5XX,
  FAILURE_TYPES.BROWSER_NAVIGATION_FAILURE,
  FAILURE_TYPES.REQUEST_FAILED,
]);

export const TIMEOUTS = Object.freeze({
  API_FAST: Number(process.env.MIA_TEST_API_FAST_TIMEOUT_MS) || 45000,
  API_CLARIFY: Number(process.env.MIA_TEST_API_CLARIFY_TIMEOUT_MS) || 45000,
  API_FOLLOWUP: Number(process.env.MIA_TEST_API_FOLLOWUP_TIMEOUT_MS) || 60000,
  API_COMMERCIAL: Number(process.env.MIA_TEST_API_COMMERCIAL_TIMEOUT_MS) || 120000,
  BROWSER_NAV: Number(process.env.MIA_TEST_BROWSER_NAV_TIMEOUT_MS) || 90000,
  BROWSER_RESPONSE: Number(process.env.MIA_TEST_BROWSER_RESPONSE_TIMEOUT_MS) || 120000,
  MULTITURN: Number(process.env.MIA_TEST_MULTITURN_TIMEOUT_MS) || 900000,
});

export const RETRY_BACKOFF_MS = Number(process.env.MIA_TEST_RETRY_BACKOFF_MS) || 3000;
export const MAX_RETRIES_PER_TURN = 1;

export function parseCliArgs(argv = process.argv.slice(2)) {
  const groups = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--group" && argv[i + 1]) {
      groups.push(...argv[i + 1].split(",").map((g) => g.trim()).filter(Boolean));
      i += 1;
    }
  }
  return { groups: groups.length ? groups : null, runCount: Number(process.env.MIA_TEST_RUN_COUNT) || 1 };
}

export function resolveCommitSha() {
  try {
    return execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return process.env.MIA_TEST_COMMIT_SHA || "unavailable";
  }
}

export function truncateText(value = "", max = 4096) {
  const text = String(value || "");
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…[truncated ${text.length - max} chars]`;
}

export function sanitizeStack(stack = "") {
  return truncateText(
    String(stack || "")
      .replace(/x-api-key:\s*[^\n]+/gi, "x-api-key: [redacted]")
      .replace(/API_SHARED_KEY=[^\s]+/gi, "API_SHARED_KEY=[redacted]")
      .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]"),
    8192
  );
}

export function sanitizeResponseSnapshot(metrics = {}, data = {}) {
  const sc = data?.session_context || {};
  return {
    httpStatus: metrics.httpStatus ?? null,
    reply: truncateText(metrics.reply || "", 2048),
    replyLen: metrics.replyLen ?? 0,
    anchor: sc?.lastBestProduct?.product_name || metrics.anchor || null,
    category: sc?.lastCategory || metrics.category || null,
    budgetMax: sc?.budgetMax ?? metrics.budgetMax ?? null,
    excludedBrands: sc?.lastCommercialConstraints?.excludedBrands || metrics.excludedBrands || [],
    paidExternal: metrics.paidExternal ?? 0,
    providerExecuted: metrics.providerExecuted ?? 0,
    commercialPermission: metrics.commercialPermission ?? null,
    followUpType: metrics.followUpType ?? null,
  };
}

export function classifyFetchError(error, timedOut = false, httpStatus = null) {
  if (timedOut) return FAILURE_TYPES.NETWORK_TIMEOUT;
  const msg = String(error?.message || error || "").toLowerCase();
  if (httpStatus === 429) return FAILURE_TYPES.HTTP_429;
  if (httpStatus >= 500) return FAILURE_TYPES.HTTP_5XX;
  if (httpStatus >= 400) return FAILURE_TYPES.HTTP_4XX;
  if (msg.includes("enotfound") || msg.includes("getaddrinfo")) return FAILURE_TYPES.DNS_ERROR;
  if (msg.includes("fetch failed") || msg.includes("econnreset") || msg.includes("econnrefused")) {
    return FAILURE_TYPES.CONNECTION_ERROR;
  }
  if (msg.includes("abort") || msg.includes("timeout")) return FAILURE_TYPES.NETWORK_TIMEOUT;
  return FAILURE_TYPES.UNKNOWN_FAILURE;
}

export function isRetryEligible(failureType, { commercialTurn = false, responseReceived = false } = {}) {
  if (!RETRY_ELIGIBLE.has(failureType)) return false;
  if (commercialTurn && responseReceived) return false;
  return true;
}

function nowIso() {
  return new Date().toISOString();
}

function emptyLatency() {
  return { count: 0, avg: 0, p50: 0, p95: 0, max: 0, samples: [] };
}

function computeLatency(samples = []) {
  if (!samples.length) return emptyLatency();
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1];
  return {
    count: sorted.length,
    avg: Math.round(sum / sorted.length),
    p50,
    p95,
    max: sorted[sorted.length - 1],
    samples: sorted,
  };
}

export class ValidationRunner {
  constructor({
    label = "11B.4",
    baseUrl = "",
    reportPath = path.join(ROOT, "tmp", "mia-11b4-validation-report.json"),
    failureArtifactsDir = path.join(ROOT, "tmp", "11b4-failures"),
  } = {}) {
    this.label = label;
    this.baseUrl = baseUrl;
    this.reportPath = reportPath;
    this.failureArtifactsDir = failureArtifactsDir;
    this.runId = `11b4-${Date.now()}`;
    this.startedAt = nowIso();
    this.finishedAt = null;
    this.cases = [];
    this.skippedCases = [];
    this.infrastructureFailure = null;
    this.groupLatency = {};
  }

  shouldRunGroup(group) {
    if (!this.activeGroups || !this.activeGroups.length) return true;
    return this.activeGroups.includes(group);
  }

  setActiveGroups(groups) {
    this.activeGroups = groups;
  }

  log(line) {
    console.log(line);
  }

  startCase(caseDef) {
    if (!this.shouldRunGroup(caseDef.group)) {
      this.skippedCases.push({ ...caseDef, reason: "group_filter" });
      return null;
    }
    if (this.infrastructureFailure) {
      this.skippedCases.push({ ...caseDef, reason: "skipped_due_to_infrastructure" });
      return null;
    }
    const caseResult = {
      caseId: caseDef.id,
      caseName: caseDef.name,
      group: caseDef.group,
      patchOrigin: caseDef.patchOrigin || "11B.4",
      executionMode: caseDef.executionMode || "api",
      retryPolicy: caseDef.retryPolicy || "controlled",
      status: "RUNNING",
      startedAt: nowIso(),
      finishedAt: null,
      durationMs: 0,
      attempts: 0,
      turns: [],
      failureType: null,
      failureMessage: null,
      failedAssertion: null,
      transientRecovered: false,
      initialFailure: null,
      finalOutcome: null,
      conversationId: caseDef.conversationId || null,
    };
    this.log(`[START] ${caseDef.id} — ${caseDef.name}`);
    this.cases.push(caseResult);
    return caseResult;
  }

  finishCase(caseResult, status, extra = {}) {
    if (!caseResult) return;
    caseResult.finishedAt = nowIso();
    caseResult.durationMs =
      new Date(caseResult.finishedAt).getTime() - new Date(caseResult.startedAt).getTime();
    caseResult.status = status;
    caseResult.finalOutcome = status;
    Object.assign(caseResult, extra);
    const icon = status === "PASS" ? "PASS" : status === "TRANSIENT_RECOVERED" ? "RECOVERED" : "FAIL";
    this.log(`[${icon}] ${caseResult.caseId} — ${caseResult.durationMs}ms`);
  }

  recordTurnStart(caseResult, turnIndex, totalTurns, input) {
    this.log(`[TURN] ${caseResult.caseId} ${turnIndex}/${totalTurns} — ${truncateText(input, 80)}`);
  }

  recordTurnPass(caseResult, turnResult) {
    this.log(
      `[PASS] ${caseResult.caseId} turn ${turnResult.turnIndex} — ${turnResult.durationMs}ms status=${turnResult.httpStatus ?? "n/a"}`
    );
    caseResult.turns.push(turnResult);
    if (!this.groupLatency[caseResult.group]) this.groupLatency[caseResult.group] = [];
    this.groupLatency[caseResult.group].push(turnResult.durationMs || 0);
  }

  recordTurnFailure(caseResult, turnResult, failure) {
    this.log(
      `[FAIL] ${caseResult.caseId} turn ${turnResult.turnIndex}\ntype=${failure.failureType}\nassertion=${failure.failedAssertion || "n/a"}\nstatus=${turnResult.httpStatus ?? "n/a"}\nduration=${turnResult.durationMs}ms`
    );
    turnResult.failure = failure;
    caseResult.turns.push(turnResult);
    if (!caseResult.initialFailure) {
      caseResult.initialFailure = {
        turnIndex: turnResult.turnIndex,
        input: turnResult.input,
        ...failure,
        sanitizedResponse: turnResult.sanitizedTrace,
      };
    }
    caseResult.failureType = failure.failureType;
    caseResult.failureMessage = failure.failureMessage;
    caseResult.failedAssertion = failure.failedAssertion || null;
  }

  assertCondition({
    caseResult,
    turnResult,
    name,
    condition,
    expected,
    actual,
    failureType = FAILURE_TYPES.ASSERTION_FAILURE,
  }) {
    if (condition) return true;
    const failure = {
      failureType,
      failedAssertion: name,
      failureMessage: `expected ${expected}; actual ${truncateText(String(actual), 256)}`,
      expected: String(expected),
      actual: truncateText(String(actual), 512),
    };
    this.recordTurnFailure(caseResult, turnResult, failure);
    return false;
  }

  markInfrastructureFailure(error) {
    this.infrastructureFailure = {
      failureType: FAILURE_TYPES.RUNNER_INTERNAL_ERROR,
      message: String(error?.message || error),
      stack: sanitizeStack(error?.stack || ""),
      at: nowIso(),
    };
  }

  buildSummary() {
    const cleanPass = this.cases.filter((c) => c.status === "PASS").length;
    const transientRecovered = this.cases.filter((c) => c.status === "TRANSIENT_RECOVERED").length;
    const failed = this.cases.filter((c) => c.status === "FAIL").length;
    const skipped = this.skippedCases.length;
    const latencyByGroup = {};
    for (const [group, samples] of Object.entries(this.groupLatency)) {
      const stats = computeLatency(samples);
      latencyByGroup[group] = {
        count: stats.count,
        avg: stats.avg,
        p50: stats.p50,
        p95: stats.p95,
        max: stats.max,
      };
    }
    return {
      total: this.cases.length + skipped,
      cleanPass,
      transientRecovered,
      failed,
      skipped,
      executed: this.cases.length,
      latencyByGroup,
    };
  }

  printHumanSummary() {
    const summary = this.buildSummary();
    console.log("\n=== PATCH 11B.4.1 VALIDATION SUMMARY ===");
    console.log(`TOTAL: ${summary.total}`);
    console.log(`CLEAN PASS: ${summary.cleanPass}`);
    console.log(`TRANSIENT RECOVERED: ${summary.transientRecovered}`);
    console.log(`FAILED: ${summary.failed}`);
    console.log(`SKIPPED: ${summary.skipped}`);

    const recovered = this.cases.filter((c) => c.status === "TRANSIENT_RECOVERED");
    if (recovered.length) {
      console.log("\nTRANSIENT RECOVERED");
      for (const c of recovered) {
        console.log(
          `- ${c.caseId} turn=${c.initialFailure?.turnIndex} initial=${c.initialFailure?.failureType} firstDuration=${c.initialFailure?.durationMs ?? "?"}ms final=PASS`
        );
      }
    }

    const failures = this.cases.filter((c) => c.status === "FAIL");
    if (failures.length) {
      console.log("\nFAILED CASES");
      for (const c of failures) {
        const t = c.initialFailure || {};
        console.log(
          `- ${c.caseId} turn=${t.turnIndex ?? "?"} type=${c.failureType} assertion=${c.failedAssertion || "n/a"} status=${t.httpStatus ?? "?"} duration=${t.durationMs ?? "?"}ms`
        );
        if (t.failureMessage) console.log(`  message: ${t.failureMessage}`);
        if (t.sanitizedResponse?.reply) {
          console.log(`  reply: ${truncateText(t.sanitizedResponse.reply, 200)}`);
        }
      }
    }

    if (this.infrastructureFailure) {
      console.log("\nINFRASTRUCTURE FAILURE");
      console.log(JSON.stringify(this.infrastructureFailure, null, 2));
    }

    console.log("\nLATENCY BY GROUP");
    for (const [group, stats] of Object.entries(summary.latencyByGroup)) {
      console.log(`${group}: count=${stats.count} avg=${stats.avg}ms p50=${stats.p50}ms p95=${stats.p95}ms max=${stats.max}ms`);
    }
  }

  writeJsonReport(extra = {}) {
    this.finishedAt = nowIso();
    const payload = {
      runId: this.runId,
      label: this.label,
      commitSha: resolveCommitSha(),
      environment: "production",
      baseUrl: this.baseUrl,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      durationMs: new Date(this.finishedAt).getTime() - new Date(this.startedAt).getTime(),
      nodeVersion: process.version,
      summary: this.buildSummary(),
      configuration: {
        timeouts: TIMEOUTS,
        retryBackoffMs: RETRY_BACKOFF_MS,
        maxRetriesPerTurn: MAX_RETRIES_PER_TURN,
        activeGroups: this.activeGroups || null,
      },
      cases: this.cases,
      skippedCases: this.skippedCases,
      infrastructureFailure: this.infrastructureFailure,
      ...extra,
    };
    fs.mkdirSync(path.dirname(this.reportPath), { recursive: true });
    fs.writeFileSync(this.reportPath, JSON.stringify(payload, null, 2));
    return payload;
  }

  getExitCode() {
    if (this.infrastructureFailure) return 1;
    if (this.cases.some((c) => c.status === "FAIL")) return 1;
    return 0;
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function executeApiTurn({
  runner,
  caseResult,
  session,
  apiKey,
  turnIndex,
  totalTurns,
  input,
  timeoutMs = TIMEOUTS.API_FAST,
  commercialTurn = false,
  assertions = [],
}) {
  runner.recordTurnStart(caseResult, turnIndex, totalTurns, input);

  let attempt = 0;
  let firstFailureRecord = null;

  while (true) {
    attempt += 1;
    caseResult.attempts = Math.max(caseResult.attempts || 0, attempt);
    const startedAt = nowIso();
    const result = await session.send(apiKey, input, { timeoutMs });

    const turnResult = {
      turnIndex,
      input,
      startedAt,
      durationMs: result.ms,
      httpStatus: result.httpStatus ?? null,
      networkError: result.networkError ? String(result.networkError.message || result.networkError) : null,
      timedOut: !!result.timedOut,
      responseReceived:
        !result.timedOut && !result.networkError && !!result.http200 && !result.parseError,
      attempt,
      assertions: [],
      sanitizedTrace: sanitizeResponseSnapshot(result, result.data),
      providerExecutedCount: result.providerExecuted ?? 0,
      paidExternalCallExecutedCount: result.paidExternal ?? 0,
    };

    const transportFailure =
      result.timedOut ||
      result.networkError ||
      !result.http200 ||
      result.parseError ||
      (result.httpStatus >= 500);

    if (transportFailure) {
      const failureType = result.parseError
        ? FAILURE_TYPES.INVALID_JSON
        : result.timedOut
          ? FAILURE_TYPES.NETWORK_TIMEOUT
          : classifyFetchError(result.networkError, result.timedOut, result.httpStatus);

      const failure = {
        failureType,
        failureMessage:
          result.networkError?.message ||
          (result.parseError ? "response body is not valid JSON" : `HTTP ${result.httpStatus}`),
        failedAssertion: null,
        durationMs: result.ms,
        httpStatus: result.httpStatus ?? null,
      };

      const canRetry =
        attempt <= MAX_RETRIES_PER_TURN &&
        isRetryEligible(failureType, {
          commercialTurn,
          responseReceived: turnResult.responseReceived,
        });

      if (canRetry) {
        if (!firstFailureRecord) {
          firstFailureRecord = { ...failure, attempt, turnResult: { ...turnResult } };
        }
        await sleep(RETRY_BACKOFF_MS);
        continue;
      }

      runner.recordTurnFailure(caseResult, turnResult, failure);
      return { pass: false, result, turnResult, transientRecovered: false };
    }

    let failedAssertion = null;
    for (const assertion of assertions) {
      const ok = assertion.check(result, result.data);
      turnResult.assertions.push({ name: assertion.name, pass: !!ok });
      if (!ok) {
        failedAssertion = assertion;
        break;
      }
    }

    if (failedAssertion) {
      const actual =
        typeof failedAssertion.actual === "function"
          ? failedAssertion.actual(result)
          : failedAssertion.actual ?? result.reply?.slice(0, 256);
      const failure = {
        failureType: FAILURE_TYPES.ASSERTION_FAILURE,
        failedAssertion: failedAssertion.name,
        failureMessage: failedAssertion.message || `expected ${failedAssertion.expected}`,
        expected: String(failedAssertion.expected ?? ""),
        actual: truncateText(String(actual), 512),
        durationMs: result.ms,
        httpStatus: result.httpStatus,
      };
      runner.recordTurnFailure(caseResult, turnResult, failure);
      return { pass: false, result, turnResult, transientRecovered: false };
    }

    if (firstFailureRecord) {
      turnResult.initialFailure = firstFailureRecord;
      turnResult.retryResult = "passed";
      caseResult.transientRecovered = true;
    }
    runner.recordTurnPass(caseResult, turnResult);
    return {
      pass: true,
      transientRecovered: !!firstFailureRecord,
      result,
      turnResult,
    };
  }
}

export async function runMultiTurnApiCase(runner, caseDef, steps, { apiKey, sessionFactory, defaultTimeout }) {
  const caseResult = runner.startCase(caseDef);
  if (!caseResult) return;

  const session = sessionFactory();
  caseResult.conversationId = session.conversationId;

  let anyTransient = false;
  try {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const turn = await executeApiTurn({
        runner,
        caseResult,
        session,
        apiKey,
        turnIndex: i + 1,
        totalTurns: steps.length,
        input: step.text,
        timeoutMs: step.timeoutMs || defaultTimeout || TIMEOUTS.API_FAST,
        commercialTurn: !!step.commercialTurn,
        assertions: step.assertions || [],
      });
      if (!turn.pass) {
        runner.finishCase(caseResult, "FAIL");
        return;
      }
      if (turn.transientRecovered) anyTransient = true;
    }
    runner.finishCase(caseResult, anyTransient ? "TRANSIENT_RECOVERED" : "PASS");
  } catch (error) {
    runner.markInfrastructureFailure(error);
    runner.finishCase(caseResult, "FAIL", {
      failureType: FAILURE_TYPES.RUNNER_INTERNAL_ERROR,
      failureMessage: String(error?.message || error),
    });
  }
}

export async function runSingleTurnApiCase(runner, caseDef, step, { apiKey, sessionFactory, defaultTimeout }) {
  return runMultiTurnApiCase(runner, caseDef, [step], { apiKey, sessionFactory, defaultTimeout });
}
