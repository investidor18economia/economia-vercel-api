/**
 * PATCH 3.2 — production browser validation (corrected lifecycle).
 */
import { chromium } from "playwright";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PROD_URL = process.env.PATCH32_PROD_URL || "https://economia-ai.vercel.app/app-mia";
const Q1 = "Qual celular você recomenda até R$ 2.500 para câmera e bateria?";
const Q2 = "E qual seria a segunda melhor opção?";
const Q_AFTER_RELOAD = "Qual celular compacto você recomenda?";

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

async function waitForTrack(page, timeoutMs = 45000) {
  return page.waitForRequest(
    (req) => req.url().includes("/api/analytics/track") && req.method() === "POST",
    { timeout: timeoutMs }
  );
}

async function sendQuestion(page, text) {
  const input = page.locator("input.mia-input");
  await input.waitFor({ state: "visible", timeout: 60000 });
  await input.fill(text);
  await page.locator("button.send-btn").click({ force: true });
  await page.waitForFunction(() => document.body.innerText.length > 400, { timeout: 120000 });
  await page.waitForTimeout(2500);
}

async function bootstrapFreshPage(page, analyticsPayloads) {
  await page.goto(PROD_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.evaluate(() => {
    try {
      localStorage.removeItem("mia_conversation_id");
      sessionStorage.removeItem("mia_session_started_tracked");
    } catch {
      /* ignore */
    }
  });
  analyticsPayloads.length = 0;
  const trackPromise = waitForTrack(page);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
  await trackPromise;
  await page.waitForTimeout(1500);
}

async function clearConversationViaSettings(page) {
  await page.locator("button.mia-menu-btn").click();
  await page.getByRole("button", { name: "Configurações" }).click();
  await page.locator("button.mia-settings-privacy-btn").click();
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: "Fechar preferências da MIΛ" }).click();
  await page.waitForTimeout(500);
  await page.locator(".mia-drawer-overlay").click({ force: true, timeout: 5000 }).catch(() => {});
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1000);
}

async function main() {
  console.log("\nPATCH 3.2 — production browser validation (lifecycle corrected)\n");
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

  await bootstrapFreshPage(page, analyticsPayloads);

  const sessionStarted = analyticsPayloads.find((p) => p.event_name === "session_started");
  record(
    "C1 session_started without conversation_id",
    sessionStarted && sessionStarted.conversation_id == null,
    `conversation=${mask(sessionStarted?.conversation_id)}`
  );

  const legacyBefore = await page.evaluate(() => localStorage.getItem("mia_conversation_id"));
  record("C1 no legacy localStorage conversation_id", legacyBefore == null, mask(legacyBefore));

  analyticsPayloads.length = 0;
  await sendQuestion(page, Q1);
  const q1 = analyticsPayloads.find((p) => p.event_name === "mia_question_sent");
  const convA = q1?.conversation_id;
  record("C2 first question creates conversation_id", isUuid(convA), mask(convA));

  analyticsPayloads.length = 0;
  await sendQuestion(page, Q2);
  const q2 = analyticsPayloads.find((p) => p.event_name === "mia_question_sent");
  record(
    "C2 continuity same conversation_id",
    q2?.conversation_id === convA,
    `A=${mask(convA)} B=${mask(q2?.conversation_id)}`
  );

  const visitorA = await page.evaluate(() => localStorage.getItem("mia_analytics_visitor_id"));
  const sessionA = await page.evaluate(() => sessionStorage.getItem("mia_session_id"));
  record("C2 visitor_id stable", isUuid(visitorA), mask(visitorA));
  record("C2 session_id stable", !!sessionA, mask(sessionA));

  const convBeforeReload = convA;
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(2000);
  const legacyAfterReload = await page.evaluate(() => localStorage.getItem("mia_conversation_id"));
  record("C3 reload no localStorage conversation_id", legacyAfterReload == null, mask(legacyAfterReload));

  analyticsPayloads.length = 0;
  await sendQuestion(page, Q_AFTER_RELOAD);
  const qReload = analyticsPayloads.find((p) => p.event_name === "mia_question_sent");
  record(
    "C3 reload creates new conversation_id",
    isUuid(qReload?.conversation_id) && qReload.conversation_id !== convBeforeReload,
    `before=${mask(convBeforeReload)} after=${mask(qReload?.conversation_id)}`
  );

  const convBeforeClear = qReload?.conversation_id;
  await clearConversationViaSettings(page);
  analyticsPayloads.length = 0;
  await sendQuestion(page, "Preciso de um fone de ouvido até R$ 400");
  const qAfterClear = analyticsPayloads.find((p) => p.event_name === "mia_question_sent");
  record(
    "C4 clear cache new conversation_id",
    isUuid(qAfterClear?.conversation_id) && qAfterClear.conversation_id !== convBeforeClear,
    `before=${mask(convBeforeClear)} after=${mask(qAfterClear?.conversation_id)}`
  );
  const visitorAfterClear = await page.evaluate(() => localStorage.getItem("mia_analytics_visitor_id"));
  const sessionAfterClear = await page.evaluate(() => sessionStorage.getItem("mia_session_id"));
  record("C4 visitor_id preserved after clear", visitorAfterClear === visitorA, mask(visitorAfterClear));
  record(
    "C4 session_id preserved same tab",
    sessionAfterClear === sessionA,
    mask(sessionAfterClear)
  );

  const page2 = await context.newPage();
  const payloadsTab2 = [];
  page2.on("request", (req) => {
    if (req.url().includes("/api/analytics/track") && req.method() === "POST") {
      try {
        payloadsTab2.push(JSON.parse(req.postData() || "{}"));
      } catch {
        /* ignore */
      }
    }
  });
  await bootstrapFreshPage(page2, payloadsTab2);
  payloadsTab2.length = 0;
  await sendQuestion(page2, Q1);
  const qTab2 = payloadsTab2.find((p) => p.event_name === "mia_question_sent");
  const visitorTab2 = await page2.evaluate(() => localStorage.getItem("mia_analytics_visitor_id"));
  const sessionTab2 = await page2.evaluate(() => sessionStorage.getItem("mia_session_id"));
  record("C5 same visitor_id across tabs", visitorTab2 === visitorA, mask(visitorTab2));
  record(
    "C5 different conversation_id in new tab",
    isUuid(qTab2?.conversation_id) && qTab2.conversation_id !== qAfterClear?.conversation_id,
    `tab1=${mask(qAfterClear?.conversation_id)} tab2=${mask(qTab2?.conversation_id)}`
  );
  record(
    "C5 new tab new session_id",
    !!sessionTab2 && sessionTab2 !== sessionA,
    `tabA=${mask(sessionA)} tabB=${mask(sessionTab2)}`
  );

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && serviceKey && sessionA && convA && qReload?.conversation_id) {
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: rowsA } = await supabase
      .from("analytics_events")
      .select("event_name, visitor_id, session_id, conversation_id")
      .eq("session_id", sessionA)
      .eq("conversation_id", convA)
      .in("event_name", ["mia_question_sent"])
      .limit(5);
    record(
      "Supabase conversation A rows share ID",
      (rowsA || []).length >= 1 && (rowsA || []).every((r) => r.conversation_id === convA),
      `${(rowsA || []).length} rows`
    );

    const { data: rowsReload } = await supabase
      .from("analytics_events")
      .select("event_name, conversation_id")
      .eq("session_id", sessionA)
      .eq("conversation_id", qReload.conversation_id)
      .limit(3);
    record(
      "Supabase post-reload uses new ID",
      (rowsReload || []).length >= 1 && rowsReload[0].conversation_id !== convA,
      mask(rowsReload?.[0]?.conversation_id)
    );
  } else {
    console.log("  ℹ️  Skipping Supabase verification");
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
