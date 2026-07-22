/**
 * PATCH 3.3 — production browser validation (authenticated identity).
 */
import { chromium } from "playwright";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PROD_URL = process.env.PATCH33_PROD_URL || "https://economia-ai.vercel.app/app-mia";
const Q1 = "Qual celular você recomenda até R$ 2.500 para câmera e bateria?";
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

async function loginViaPopup(page, email, name) {
  await page.locator("button.mia-menu-btn").click();
  await page.getByRole("button", { name: "Entrar na sua conta" }).click();
  await page.locator("#popupNome").fill(name);
  await page.locator("#popupEmail").fill(email);
  const registerResp = page.waitForResponse(
    (resp) => resp.url().includes("/api/register-user") && resp.request().method() === "POST",
    { timeout: 30000 }
  );
  await page.getByRole("button", { name: "Continuar" }).click();
  const resp = await registerResp;
  const data = await resp.json();
  await page.waitForTimeout(1000);
  return data;
}

async function main() {
  console.log("\nPATCH 3.3 — production browser validation\n");
  console.log(`URL: ${PROD_URL}`);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase =
    supabaseUrl && serviceKey
      ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
      : null;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const trackRequests = [];
  page.on("request", (req) => {
    if (req.url().includes("/api/analytics/track") && req.method() === "POST") {
      let body = null;
      try {
        body = JSON.parse(req.postData() || "{}");
      } catch {
        body = null;
      }
      trackRequests.push({
        headers: req.headers(),
        body,
      });
    }
  });

  await page.goto(PROD_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.evaluate(() => {
    try {
      sessionStorage.removeItem("mia_session_started_tracked");
      localStorage.removeItem("mia_user");
    } catch {
      /* ignore */
    }
  });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(2000);

  const anonTracks = trackRequests.filter((t) => t.body?.event_name);
  const anonQuestionTrack = anonTracks.find((t) => t.body?.event_name === "mia_question_sent");

  await sendQuestion(page, Q1);
  const anonQuestion = trackRequests.findLast((t) => t.body?.event_name === "mia_question_sent");

  record(
    "B1 anonymous payload omits user_id",
    anonQuestion && !("user_id" in anonQuestion.body),
    anonQuestion ? "no user_id key" : "missing track"
  );
  record(
    "B2 anonymous track has no Authorization",
    anonQuestion && !anonQuestion.headers?.authorization,
    anonQuestion?.headers?.authorization ? "had auth" : "no auth"
  );

  const testEmail = `patch33-browser-${Date.now()}@teilor-qa.invalid`;
  const registerData = await loginViaPopup(page, testEmail, "Patch 33 Browser");
  const officialUserId = registerData?.user?.id;
  const sessionToken = registerData?.session_token;

  record("B3 login returns official user id", isUuid(officialUserId), mask(officialUserId));
  record("B4 login returns session token", typeof sessionToken === "string" && sessionToken.includes("."), "(token)");

  const beforeAuthCount = trackRequests.length;
  await sendQuestion(page, Q2);
  const authQuestion = trackRequests.slice(beforeAuthCount).find((t) => t.body?.event_name === "mia_question_sent");

  record(
    "B5 authenticated track sends Authorization",
    authQuestion?.headers?.authorization?.startsWith("Bearer "),
    authQuestion?.headers?.authorization ? "bearer present" : "missing"
  );
  record(
    "B6 authenticated payload still omits user_id",
    authQuestion && !("user_id" in authQuestion.body),
    "client does not declare user_id"
  );

  if (supabase && authQuestion?.body?.session_id && officialUserId) {
    await page.waitForTimeout(2000);
    const { data } = await supabase
      .from("analytics_events")
      .select("user_id, visitor_id, session_id, conversation_id, event_name")
      .eq("session_id", authQuestion.body.session_id)
      .eq("event_name", "mia_question_sent")
      .order("created_at", { ascending: false })
      .limit(1);

    const row = data?.[0];
    record(
      "B7 Supabase persisted official user_id",
      row?.user_id === officialUserId,
      `db=${mask(row?.user_id)}`
    );
    record(
      "B8 visitor_id preserved with auth",
      isUuid(row?.visitor_id),
      mask(row?.visitor_id)
    );
    record(
      "B9 conversation_id present when authenticated",
      isUuid(row?.conversation_id),
      mask(row?.conversation_id)
    );
  } else {
    record("B7 Supabase persisted official user_id", false, "supabase unavailable");
    record("B8 visitor_id preserved with auth", false, "skipped");
    record("B9 conversation_id present when authenticated", false, "skipped");
  }

  await page.locator("button.mia-menu-btn").click();
  await page.getByRole("button", { name: "Sair da conta" }).click();
  await page.waitForTimeout(1000);

  const storedUser = await page.evaluate(() => {
    try {
      return localStorage.getItem("mia_user");
    } catch {
      return "error";
    }
  });
  record("B10 logout clears mia_user", storedUser == null, storedUser ? "still stored" : "cleared");

  const beforeLogoutCount = trackRequests.length;
  await sendQuestion(page, "Qual fone custo-benefício você recomenda?");
  const postLogoutTrack = trackRequests.slice(beforeLogoutCount).find((t) => t.body?.event_name === "mia_question_sent");

  record(
    "B11 post-logout track has no Authorization",
    postLogoutTrack && !postLogoutTrack.headers?.authorization,
    postLogoutTrack?.headers?.authorization ? "still authed" : "anonymous"
  );

  if (supabase && postLogoutTrack?.body?.session_id) {
    await page.waitForTimeout(2000);
    const { data } = await supabase
      .from("analytics_events")
      .select("user_id")
      .eq("session_id", postLogoutTrack.body.session_id)
      .eq("event_name", "mia_question_sent")
      .order("created_at", { ascending: false })
      .limit(1);
    record("B12 post-logout user_id NULL in Supabase", data?.[0]?.user_id == null, mask(data?.[0]?.user_id));
  } else {
    record("B12 post-logout user_id NULL in Supabase", false, "skipped");
  }

  await browser.close();

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} browser checks passed\n`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
