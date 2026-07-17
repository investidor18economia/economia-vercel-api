/**
 * PATCH 11B.4.1 — Browser validation (Playwright desktop + mobile)
 */
import fs from "node:fs";
import path from "node:path";
import { PROD_UI, GENERIC_ONLY, ROOT } from "./test-mia-11b4-shared.mjs";
import {
  ValidationRunner,
  parseCliArgs,
  TIMEOUTS,
  FAILURE_TYPES,
  sleep,
  RETRY_BACKOFF_MS,
  MAX_RETRIES_PER_TURN,
  isRetryEligible,
} from "./test-mia-11b4-observability.mjs";

const { groups } = parseCliArgs();
const runner = new ValidationRunner({
  label: "11B.4.1-browser",
  baseUrl: PROD_UI,
  reportPath: path.join(ROOT, "tmp", "mia-11b4-browser-validation-report.json"),
});
runner.setActiveGroups(groups);

console.log("\nPATCH 11B.4.1 — Browser Validation (Desktop + Mobile)\n");

async function saveFailureScreenshot(page, caseId, attempt) {
  const dir = path.join(ROOT, "tmp", "11b4-failures");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${caseId}-attempt-${attempt}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function runBrowserCase(runner, caseDef, executeFn) {
  const caseResult = runner.startCase(caseDef);
  if (!caseResult) return;
  try {
    const outcome = await executeFn({ caseResult, runner });
    if (outcome?.infrastructure) {
      runner.markInfrastructureFailure(outcome.error);
      runner.finishCase(caseResult, "FAIL");
      return;
    }
    if (outcome?.pass === false) {
      runner.finishCase(caseResult, "FAIL");
      return;
    }
    runner.finishCase(caseResult, outcome?.transientRecovered ? "TRANSIENT_RECOVERED" : "PASS");
  } catch (error) {
    runner.markInfrastructureFailure(error);
    runner.finishCase(caseResult, "FAIL", { failureType: FAILURE_TYPES.RUNNER_INTERNAL_ERROR });
  }
}

async function runViewportCases(viewportLabel, viewport, groupName) {
  if (groups && !groups.includes(groupName)) return;

  const { chromium } = await import("playwright");
  let browser;
  let page;
  let consoleErrors = [];
  let pageErrors = [];
  let failedRequests = [];

  const casePrefix = viewportLabel === "desktop" ? "11B4-DESKTOP" : "11B4-MOBILE";

  async function launch() {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport });
    page = await context.newPage();
    consoleErrors = [];
    pageErrors = [];
    failedRequests = [];
    page.on("pageerror", (e) => pageErrors.push(String(e.message || e)));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("requestfailed", (req) => {
      failedRequests.push({ url: req.url(), failure: req.failure()?.errorText || "unknown" });
    });
    await page.goto(PROD_UI, { waitUntil: "networkidle", timeout: TIMEOUTS.BROWSER_NAV });
  }

  async function uiTurn(text, turnIndex, totalTurns, assertions, caseResult) {
    runner.recordTurnStart(caseResult, turnIndex, totalTurns, text);
    let attempt = 0;
    let firstFailure = null;

    while (attempt <= MAX_RETRIES_PER_TURN) {
      attempt += 1;
      const started = Date.now();
      try {
        const input = page.locator(".mia-input");
        await input.waitFor({ state: "visible", timeout: 30000 });
        const respP = page.waitForResponse(
          (r) => r.url().includes("/api/chat-gpt4o") && r.request().method() === "POST",
          { timeout: TIMEOUTS.BROWSER_RESPONSE }
        );
        await input.fill(text);
        await page.locator(".send-btn").click();
        const resp = await respP;
        const data = await resp.json().catch(() => ({}));
        const reply = (data?.reply || "").trim();
        await page.waitForFunction(() => !document.querySelector(".send-btn.send-btn--loading"), {
          timeout: TIMEOUTS.BROWSER_RESPONSE,
        });
        await sleep(1500);
        await page.waitForFunction(
          () => {
            const bubbles = document.querySelectorAll(".mia-msg-assistant-bubble");
            if (!bubbles.length) return false;
            const last = bubbles[bubbles.length - 1];
            const t = (last?.textContent || "").replace(/\s+/g, " ").trim();
            return t.length > 15 && !t.endsWith("...");
          },
          { timeout: TIMEOUTS.BROWSER_RESPONSE }
        );
        const bubbleText = await page.locator(".mia-msg-assistant-bubble").last().innerText();
        const displayText = (reply || bubbleText).trim();
        const cards = await page.locator(".mia-offer-card, .offer-card, [class*='offer']").count();
        const inputBox = await input.boundingBox();
        const sendBox = await page.locator(".send-btn").boundingBox();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
        const durationMs = Date.now() - started;
        const turnResult = {
          turnIndex,
          input: text,
          durationMs,
          httpStatus: resp.status(),
          responseReceived: true,
          attempt,
          sanitizedTrace: {
            reply: displayText.slice(0, 512),
            cards,
            paidExternal: data?.mia_debug?.runtime_enforcement?.externalCallAccounting?.paidExternalCallExecutedCount || 0,
          },
        };

        for (const assertion of assertions) {
          const ctx = {
            status: resp.status(),
            reply,
            bubbleText: bubbleText.trim(),
            displayText,
            replyGenericOnly: GENERIC_ONLY.test(displayText),
            replyLen: displayText.length,
            cards,
            inputVisible: !!inputBox && inputBox.height > 0,
            sendVisible: !!sendBox && sendBox.width > 0,
            horizontalOverflow: overflow,
            paidExternal: turnResult.sanitizedTrace.paidExternal,
          };
          if (!assertion.check(ctx)) {
            const failure = {
              failureType: FAILURE_TYPES.ASSERTION_FAILURE,
              failedAssertion: assertion.name,
              failureMessage: assertion.message || `expected ${assertion.expected}`,
              durationMs,
              httpStatus: resp.status(),
            };
            await saveFailureScreenshot(page, caseResult.caseId, attempt);
            runner.recordTurnFailure(caseResult, turnResult, failure);
            return { pass: false };
          }
        }

        if (firstFailure) caseResult.transientRecovered = true;
        runner.recordTurnPass(caseResult, turnResult);
        return { pass: true, transientRecovered: !!firstFailure };
      } catch (error) {
        const durationMs = Date.now() - started;
        const msg = String(error?.message || error);
        const failureType = /timeout/i.test(msg)
          ? FAILURE_TYPES.NETWORK_TIMEOUT
          : /waiting for selector|locator/i.test(msg)
            ? FAILURE_TYPES.BROWSER_SELECTOR_FAILURE
            : FAILURE_TYPES.BROWSER_NAVIGATION_FAILURE;
        const failure = {
          failureType,
          failureMessage: msg,
          durationMs,
        };
        if (page) await saveFailureScreenshot(page, caseResult.caseId, attempt).catch(() => {});
        const canRetry = attempt <= MAX_RETRIES_PER_TURN && isRetryEligible(failureType);
        if (canRetry) {
          if (!firstFailure) firstFailure = failure;
          await sleep(RETRY_BACKOFF_MS);
          continue;
        }
        runner.recordTurnFailure(
          caseResult,
          { turnIndex, input: text, durationMs, attempt, httpStatus: null },
          failure
        );
        return { pass: false };
      }
    }
    return { pass: false };
  }

  try {
    await launch();

    const flow = [
      {
        id: `${casePrefix}-001`,
        name: "UI social opinion",
        text: "acho esse Galaxy bonito",
        assertions: [
          { name: "response_not_empty", expected: "reply > 20", check: (c) => c.status === 200 && c.replyLen > 20 },
          { name: "response_not_generic_only", expected: "non-generic", check: (c) => !c.replyGenericOnly },
          { name: "paid_external_zero", expected: "paidExternal=0", check: (c) => c.paidExternal === 0 },
        ],
      },
      {
        id: `${casePrefix}-002`,
        name: "UI commercial search",
        text: "qual celular você recomenda até 2500?",
        assertions: [{ name: "response_not_empty", expected: "reply > 40", check: (c) => c.status === 200 && c.replyLen > 40 }],
      },
      {
        id: `${casePrefix}-003`,
        name: "UI mixed intent",
        text: "estou cansado, mas quero um celular até 2500.",
        assertions: [
          { name: "response_not_empty", expected: "reply > 40", check: (c) => c.status === 200 && c.replyLen > 40 },
          { name: "response_not_generic_only", expected: "non-generic", check: (c) => !c.replyGenericOnly },
        ],
      },
      {
        id: `${casePrefix}-004`,
        name: "UI follow-up price",
        text: "e quanto custa?",
        assertions: [
          { name: "response_not_empty", expected: "reply > 15", check: (c) => c.status === 200 && c.replyLen > 15 },
          { name: "response_not_generic_only", expected: "non-generic", check: (c) => !c.replyGenericOnly },
        ],
      },
      {
        id: `${casePrefix}-005`,
        name: "UI refinement exclude brand",
        text: "sem iPhone",
        assertions: [
          { name: "excluded_brand_not_recommended", expected: "no iPhone 11/13", check: (c) => c.status === 200 && !/iPhone 13|iPhone 11/i.test(c.bubbleText) },
        ],
      },
      {
        id: `${casePrefix}-006`,
        name: "UI input accessible",
        text: "acho esse Galaxy bonito",
        skipSend: true,
        assertions: [
          { name: "mobile_input_visible", expected: "input visible", check: (c) => c.inputVisible && c.sendVisible },
        ],
      },
      {
        id: `${casePrefix}-007`,
        name: "UI no horizontal overflow",
        skipSend: true,
        assertions: [{ name: "mobile_no_horizontal_overflow", expected: "no overflow", check: (c) => !c.horizontalOverflow }],
      },
      {
        id: `${casePrefix}-008`,
        name: "UI scroll/messages visible",
        skipSend: true,
        assertions: [{ name: "response_not_empty", expected: "messages visible", check: () => true }],
      },
    ];

    for (let i = 0; i < flow.length; i++) {
      const step = flow[i];
      await runBrowserCase(
        runner,
        {
          id: step.id,
          name: step.name,
          group: groupName,
          patchOrigin: "11B.4",
          executionMode: "browser",
        },
        async ({ caseResult }) => {
          if (step.skipSend && step.id.endsWith("006")) {
            const input = page.locator(".mia-input");
            const inputBox = await input.boundingBox();
            const sendBox = await page.locator(".send-btn").boundingBox();
            const ctx = { inputVisible: !!inputBox && inputBox.height > 0, sendVisible: !!sendBox && sendBox.width > 0 };
            runner.recordTurnStart(caseResult, 1, 1, step.name);
            for (const a of step.assertions) {
              if (!a.check(ctx)) {
                runner.recordTurnFailure(caseResult, { turnIndex: 1, input: step.name, durationMs: 0 }, {
                  failureType: FAILURE_TYPES.ASSERTION_FAILURE,
                  failedAssertion: a.name,
                  failureMessage: a.expected,
                });
                return { pass: false };
              }
            }
            runner.recordTurnPass(caseResult, { turnIndex: 1, input: step.name, durationMs: 0, httpStatus: 200 });
            return { pass: true };
          }
          if (step.skipSend && step.id.endsWith("007")) {
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
            runner.recordTurnStart(caseResult, 1, 1, step.name);
            if (overflow) {
              runner.recordTurnFailure(caseResult, { turnIndex: 1, input: step.name, durationMs: 0 }, {
                failureType: FAILURE_TYPES.ASSERTION_FAILURE,
                failedAssertion: "mobile_no_horizontal_overflow",
                failureMessage: "horizontal overflow detected",
              });
              return { pass: false };
            }
            runner.recordTurnPass(caseResult, { turnIndex: 1, input: step.name, durationMs: 0, httpStatus: 200 });
            return { pass: true };
          }
          if (step.skipSend && step.id.endsWith("008")) {
            await page.locator(".mia-chat-messages").evaluate((el) => el.scrollTo(0, el.scrollHeight));
            const scrollOk = await page.locator(".mia-msg-assistant-bubble").first().isVisible();
            runner.recordTurnStart(caseResult, 1, 1, step.name);
            if (!scrollOk || consoleErrors.length > 0) {
              runner.recordTurnFailure(caseResult, { turnIndex: 1, input: step.name, durationMs: 0 }, {
                failureType: consoleErrors.length ? FAILURE_TYPES.CONSOLE_ERROR : FAILURE_TYPES.BROWSER_SELECTOR_FAILURE,
                failedAssertion: "response_not_empty",
                failureMessage: consoleErrors[0] || "messages not visible",
              });
              return { pass: false };
            }
            runner.recordTurnPass(caseResult, { turnIndex: 1, input: step.name, durationMs: 0, httpStatus: 200 });
            return { pass: true };
          }
          const turn = await uiTurn(step.text, 1, 1, step.assertions, caseResult);
          return turn;
        }
      );
    }
  } catch (error) {
    runner.markInfrastructureFailure(error);
  } finally {
    if (browser) await browser.close();
  }
}

await runViewportCases("desktop", { width: 1440, height: 900 }, "desktop");
await runViewportCases("mobile", { width: 390, height: 844 }, "mobile");

runner.printHumanSummary();
runner.writeJsonReport({
  mode: "browser",
  playwrightVersion: (await import("playwright")).chromium ? "available" : "unknown",
});
process.exit(runner.getExitCode());
