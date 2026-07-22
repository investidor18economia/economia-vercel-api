/**
 * PATCH 3.1 — production browser validation (Playwright).
 * Masks UUIDs in output; no secrets logged.
 */
import { chromium } from "playwright";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PROD_URL = process.env.PATCH31_PROD_URL || "https://economia-ai.vercel.app/app-mia";
const QUESTION =
  "Qual celular você recomenda para alguém que prioriza bateria e câmera, com orçamento de até R$ 2.500?";

function loadEnv() {
  const envFile = join(ROOT, ".env.local");
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, "utf8").split("\n")) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match && !process.env[match[1].trim()]) {
        process.env[match[1].trim()] = match[2].trim();
      }
    }
  }
}

function mask(value) {
  if (!value || typeof value !== "string") return "(null)";
  const v = value.trim();
  if (v.length < 12) return "(masked)";
  return `${v.slice(0, 4)}****-****-****-****-********${v.slice(-4)}`;
}

function isUuid(value) {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
}

loadEnv();

const results = [];

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function waitForTrack(page, timeoutMs = 30000) {
  return page.waitForRequest(
    (req) => req.url().includes("/api/analytics/track") && req.method() === "POST",
    { timeout: timeoutMs }
  );
}

async function resetIdentityAndBootstrap(page) {
  await page.evaluate(() => {
    try {
      localStorage.removeItem("mia_analytics_visitor_id");
      sessionStorage.removeItem("mia_session_started_tracked");
    } catch {
      /* ignore */
    }
  });
  const trackPromise = waitForTrack(page);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
  await trackPromise;
  await page.waitForTimeout(1000);
  return page.evaluate(() => localStorage.getItem("mia_analytics_visitor_id"));
}

async function main() {
  console.log("\nPATCH 3.1 — production browser validation\n");
  console.log(`URL: ${PROD_URL}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const analyticsPayloads = [];

  page.on("request", (req) => {
    if (req.url().includes("/api/analytics/track") && req.method() === "POST") {
      try {
        analyticsPayloads.push(JSON.parse(req.postData() || "{}"));
      } catch {
        /* ignore */
      }
    }
  });

  await page.goto(PROD_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(2000);

  const visitor1 = await resetIdentityAndBootstrap(page);
  record("creation after clear + session_started", isUuid(visitor1), mask(visitor1));

  await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(1500);
  const visitor2 = await page.evaluate(() => localStorage.getItem("mia_analytics_visitor_id"));
  record("reload preserves visitor_id", visitor1 === visitor2 && isUuid(visitor2), mask(visitor2));

  const page2 = await context.newPage();
  await page2.goto(PROD_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page2.waitForTimeout(2000);
  const visitorTab2 = await page2.evaluate(() => localStorage.getItem("mia_analytics_visitor_id"));
  record("same origin shares visitor_id", visitorTab2 === visitor1, mask(visitorTab2));

  const session1 = await page.evaluate(() => sessionStorage.getItem("mia_session_id"));
  const session2 = await page2.evaluate(() => sessionStorage.getItem("mia_session_id"));
  record(
    "session_id present per tab",
    !!session1 && !!session2,
    `tabA=${mask(session1)} tabB=${mask(session2)}`
  );

  await page.evaluate(() => {
    localStorage.setItem("mia_analytics_visitor_id", "invalid-value");
    sessionStorage.removeItem("mia_session_started_tracked");
  });
  const fixTrack = waitForTrack(page);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
  await fixTrack;
  const visitorFixed = await page.evaluate(() => localStorage.getItem("mia_analytics_visitor_id"));
  record("invalid value regenerated", isUuid(visitorFixed), mask(visitorFixed));

  const beforeClear = visitorFixed;
  await page.evaluate(() => {
    localStorage.removeItem("mia_analytics_visitor_id");
    sessionStorage.removeItem("mia_session_started_tracked");
  });
  const clearTrack = waitForTrack(page);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
  await clearTrack;
  const visitorAfterClear = await page.evaluate(() => localStorage.getItem("mia_analytics_visitor_id"));
  record(
    "clear storage creates new identity",
    isUuid(visitorAfterClear) && visitorAfterClear !== beforeClear,
    mask(visitorAfterClear)
  );

  analyticsPayloads.length = 0;
  const input = page.locator("input.mia-input");
  await input.waitFor({ state: "visible", timeout: 60000 });
  await input.fill(QUESTION);
  await page.locator("button.send-btn").click();

  await page.waitForFunction(
    () => document.body.innerText.length > 400,
    { timeout: 120000 }
  );
  record("MIA conversation response received", true, "response captured");

  const questionEvents = analyticsPayloads.filter((p) => p.event_name === "mia_question_sent");
  const questionVisitor = questionEvents.at(-1)?.visitor_id || null;
  record(
    "mia_question_sent emitted with visitor_id",
    isUuid(questionVisitor) && questionVisitor === visitorAfterClear,
    mask(questionVisitor)
  );

  await page.waitForTimeout(15000);
  const recommendationEvents = analyticsPayloads.filter(
    (p) => p.event_name === "mia_recommendation_shown"
  );
  record(
    "mia_recommendation_shown when applicable",
    recommendationEvents.length === 0 ||
      recommendationEvents.every((p) => p.visitor_id === questionVisitor),
    `${recommendationEvents.length} event(s)`
  );

  const page3 = await context.newPage();
  await page3.evaluate(() => {
    try {
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
  });
  const trackNewSession = waitForTrack(page3);
  await page3.goto(PROD_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
  await trackNewSession;
  const visitorShared = await page3.evaluate(() => localStorage.getItem("mia_analytics_visitor_id"));
  const sessionNew = await page3.evaluate(() => sessionStorage.getItem("mia_session_id"));
  record(
    "new session shares visitor_id",
    visitorShared === questionVisitor,
    mask(visitorShared)
  );
  record(
    "new session gets different session_id",
    !!sessionNew && sessionNew !== questionEvents.at(-1)?.session_id,
    mask(sessionNew)
  );

  await browser.close();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key && questionVisitor) {
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const since = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const { data: rows } = await supabase
      .from("analytics_events")
      .select("event_name, visitor_id, session_id, created_at, metadata")
      .eq("visitor_id", questionVisitor)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(10);

    record("remote rows persisted with visitor_id", (rows?.length || 0) > 0, `${rows?.length || 0} row(s)`);

    for (const row of rows || []) {
      const meta = row.metadata || {};
      const safeMeta = !meta.email && !meta.user_email && !meta.token;
      record(
        `remote ${row.event_name}`,
        row.visitor_id === questionVisitor && safeMeta,
        `visitor=${mask(row.visitor_id)} session=${mask(row.session_id)}`
      );
    }

    const sessions = [...new Set((rows || []).map((r) => r.session_id).filter(Boolean))];
    record(
      "same visitor_id across persisted events",
      rows?.every((r) => r.visitor_id === questionVisitor),
      `${sessions.length} session(s)`
    );
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => r.ok === false).length;
  console.log(`\nResultado: ${passed}/${passed + failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
