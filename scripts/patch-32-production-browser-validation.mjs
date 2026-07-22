/**
 * PATCH 3.2 — production browser validation (Playwright).
 */
import { chromium } from "playwright";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PROD_URL = process.env.PATCH32_PROD_URL || "https://economia-ai.vercel.app/app-mia";
const Q1 =
  "Qual celular você recomenda até R$ 2.500 para câmera e bateria?";
const Q2 = "E qual seria a segunda melhor opção?";

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

async function main() {
  console.log("\nPATCH 3.2 — production browser validation\n");
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
  await page.evaluate(() => {
    try {
      localStorage.removeItem("mia_conversation_id");
      sessionStorage.removeItem("mia_session_started_tracked");
    } catch {
      /* ignore */
    }
  });

  const sessionTrack = waitForTrack(page);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
  await sessionTrack;
  await page.waitForTimeout(1500);

  const sessionStarted = analyticsPayloads.find((p) => p.event_name === "session_started");
  record(
    "session_started without conversation_id",
    sessionStarted && sessionStarted.conversation_id == null,
    `conversation=${mask(sessionStarted?.conversation_id)}`
  );

  const convBefore = await page.evaluate(() => localStorage.getItem("mia_conversation_id"));
  record("no conversation_id before first question", convBefore == null, mask(convBefore));

  const input = page.locator("input.mia-input");
  await input.waitFor({ state: "visible", timeout: 60000 });

  analyticsPayloads.length = 0;
  await input.fill(Q1);
  await page.locator("button.send-btn").click();
  await page.waitForFunction(() => document.body.innerText.length > 400, { timeout: 120000 });
  await page.waitForTimeout(3000);

  const q1Event = analyticsPayloads.find((p) => p.event_name === "mia_question_sent");
  const convAfterQ1 = await page.evaluate(() => localStorage.getItem("mia_conversation_id"));
  record("first question creates conversation_id", isUuid(convAfterQ1), mask(convAfterQ1));
  record(
    "mia_question_sent includes conversation_id",
    isUuid(q1Event?.conversation_id) && q1Event.conversation_id === convAfterQ1,
    mask(q1Event?.conversation_id)
  );

  analyticsPayloads.length = 0;
  await input.fill(Q2);
  await page.locator("button.send-btn").click();
  await page.waitForFunction(
    (prevLen) => document.body.innerText.length > prevLen + 80,
    { timeout: 120000 },
    (await page.evaluate(() => document.body.innerText.length))
  );
  await page.waitForTimeout(3000);

  const q2Event = analyticsPayloads.find((p) => p.event_name === "mia_question_sent");
  record(
    "continuity reuses conversation_id",
    q2Event?.conversation_id === convAfterQ1,
    mask(q2Event?.conversation_id)
  );

  const visitorId = await page.evaluate(() => localStorage.getItem("mia_analytics_visitor_id"));
  const sessionId = await page.evaluate(() => sessionStorage.getItem("mia_session_id"));
  record("visitor_id stable", isUuid(visitorId), mask(visitorId));
  record("session_id stable in same tab", !!sessionId, mask(sessionId));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && serviceKey && sessionId) {
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: rows } = await supabase
      .from("analytics_events")
      .select("event_name, visitor_id, session_id, conversation_id, created_at")
      .eq("session_id", sessionId)
      .in("event_name", ["session_started", "mia_question_sent", "mia_recommendation_shown"])
      .order("created_at", { ascending: false })
      .limit(10);

    const questionRows = (rows || []).filter((r) => r.event_name === "mia_question_sent");
    record(
      "Supabase question rows share conversation_id",
      questionRows.length >= 1 &&
        questionRows.every((r) => r.conversation_id === convAfterQ1),
      `${questionRows.length} rows`
    );

    const sessionRow = (rows || []).find((r) => r.event_name === "session_started");
    record(
      "Supabase session_started conversation_id null",
      !sessionRow || sessionRow.conversation_id == null,
      mask(sessionRow?.conversation_id)
    );
  } else {
    console.log("  ℹ️  Skipping Supabase row verification");
  }

  await browser.close();

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nResultado: ${passed}/${passed + failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
