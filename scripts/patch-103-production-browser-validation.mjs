#!/usr/bin/env node
/**
 * PATCH 10.3 — production browser validation (real MIA UI alert creation).
 */
import { chromium } from "playwright";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PROD_URL = process.env.PATCH103_PROD_URL || "https://economia-ai.vercel.app/app-mia";
const COMMERCIAL_Q =
  process.env.PATCH103_BROWSER_QUERY ||
  "Quero um fone de ouvido bluetooth bom até 350 reais";

function loadEnv() {
  const envFile = join(ROOT, ".env.local");
  if (!existsSync(envFile)) return;
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase =
  supabaseUrl && serviceKey
    ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
    : null;

const checks = [];
function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
}

function extractOtpFromHtml(html = "") {
  const match = String(html).match(/\b(\d{6})\b/);
  return match?.[1] || null;
}

async function fetchOtpFromResend(email, startedAtMs) {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) return null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await new Promise((r) => setTimeout(r, attempt === 0 ? 2000 : 3000));
    const listRes = await fetch("https://api.resend.com/emails?limit=20", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!listRes.ok) continue;
    const listJson = await listRes.json().catch(() => ({}));
    const candidates = (listJson?.data || []).filter((item) => {
      const toList = Array.isArray(item.to) ? item.to : [item.to].filter(Boolean);
      const createdMs = Date.parse(String(item.created_at || ""));
      return (
        toList.some((to) => String(to).toLowerCase() === email.toLowerCase()) &&
        String(item.subject || "").includes("código de acesso") &&
        Number.isFinite(createdMs) &&
        createdMs >= startedAtMs - 5000
      );
    });
    if (!candidates.length) continue;
    const detailRes = await fetch(`https://api.resend.com/emails/${candidates[0].id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!detailRes.ok) continue;
    const detailJson = await detailRes.json().catch(() => ({}));
    const otp = extractOtpFromHtml(detailJson?.html || "");
    if (otp) return otp;
  }
  return null;
}

async function sendQuestion(page, text) {
  const input = page.locator("input.mia-input");
  await input.waitFor({ state: "visible", timeout: 60000 });
  await input.fill(text);
  await page.locator("button.send-btn").click({ force: true });
  await page.waitForFunction(() => document.body.innerText.length > 400, { timeout: 120000 });
  await page.waitForTimeout(3000);
}

async function loginViaOtp(page, email, name) {
  const startedAtMs = Date.now();
  await page.locator("button.mia-menu-btn").click();
  await page.getByRole("button", { name: "Entrar na sua conta" }).click();
  await page.locator("#popupNome").fill(name);
  await page.locator("#popupEmail").fill(email);
  await page.getByRole("button", { name: "Enviar código" }).click();
  await page.locator("#popupCode").waitFor({ state: "visible", timeout: 30000 });

  const otp = process.env.PATCH103_AUTH_OTP || (await fetchOtpFromResend(email, startedAtMs));
  if (!otp) throw new Error("OTP unavailable for browser login");

  await page.locator("#popupCode").fill(otp);

  const verifyResp = page.waitForResponse(
    (resp) => resp.url().includes("/api/auth/verify-code") && resp.request().method() === "POST",
    { timeout: 30000 }
  );
  await page.getByRole("button", { name: "Verificar código" }).click();
  const verify = await verifyResp;
  return verify.json();
}

console.log("\nPATCH 10.3 — production browser validation\n");

const startedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto(PROD_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.evaluate(() => {
  try {
    localStorage.removeItem("mia_user");
  } catch {
    /* ignore */
  }
});
await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForTimeout(1500);

const testEmail = process.env.PATCH103_AUTH_EMAIL || `patch103-ui-${Date.now()}@teilor-qa.invalid`;
const loginData = await loginViaOtp(page, testEmail, "Patch 103 UI");
const userId = loginData?.user?.id;
ok("UI OTP login user id", typeof userId === "string" && userId.length === 36, userId || "missing");

await sendQuestion(page, COMMERCIAL_Q);

const monitorBtn = page.locator('button.mia-offer-card-action-btn--mon[aria-label="Monitorar"]').first();
await monitorBtn.waitFor({ state: "visible", timeout: 120000 });

const createRespPromise = page.waitForResponse(
  (resp) => resp.url().includes("/api/create-price-alert") && resp.request().method() === "POST",
  { timeout: 60000 }
);
const trackPromise = page.waitForResponse(
  (resp) => resp.url().includes("/api/analytics/track") && resp.request().method() === "POST",
  { timeout: 60000 }
).catch(() => null);

await monitorBtn.click();
const createResp = await createRespPromise;
const createJson = await createResp.json().catch(() => ({}));
ok("UI create-price-alert 200", createResp.status() === 200, `status=${createResp.status()}`);

const alertRow = Array.isArray(createJson?.data) ? createJson.data[0] : null;
const alertId = alertRow?.id || null;
ok("UI alert persisted", !!alertId, alertId || "missing");

const trackResp = await trackPromise;
if (trackResp) {
  let trackBody = {};
  try {
    trackBody = JSON.parse(trackResp.request().postData() || "{}");
  } catch {
    trackBody = {};
  }
  ok("UI price_alert_created track", trackBody?.event_name === "price_alert_created", trackBody?.event_name || "none");
} else {
  ok("UI price_alert_created track", false, "no track response");
}

await page.waitForTimeout(8000);

if (supabase && alertId && userId) {
  const { data: lifecycle } = await supabase
    .from("analytics_events")
    .select("metadata,created_at")
    .eq("event_name", "mia_price_alert_lifecycle")
    .eq("user_id", userId)
    .gte("created_at", startedAt)
    .not("category", "eq", "price_alert_lifecycle_test")
    .order("created_at", { ascending: true });

  const filtered = (lifecycle || []).filter(
    (e) =>
      e.metadata?.lifecycle_stage === "REQUESTED" || e.metadata?.alert_id === alertId
  );
  const stages = [...new Set(filtered.map((e) => e.metadata?.lifecycle_stage))];
  ok("UI lifecycle REQUESTED", stages.includes("REQUESTED"));
  ok("UI lifecycle CREATED", stages.includes("CREATED"));
  ok("UI lifecycle ACTIVE", stages.includes("ACTIVE"));
  ok("UI lifecycle event_version", filtered.some((e) => e.metadata?.event_version === "10.3.0"));

  const blob = JSON.stringify(filtered.map((e) => e.metadata || {}));
  ok("UI privacy scan", !/product_name|https:\/\/|user_email|@/.test(blob));

  const { data: clientEvent } = await supabase
    .from("analytics_events")
    .select("event_name,metadata")
    .eq("user_id", userId)
    .eq("event_name", "price_alert_created")
    .gte("created_at", startedAt)
    .limit(1);

  ok("UI price_alert_created persisted", (clientEvent || []).length >= 1, `count=${clientEvent?.length || 0}`);

  writeFileSync(
    join(ROOT, "docs/analytics/PATCH_10_3_BROWSER_VALIDATION.json"),
    JSON.stringify({ alert_id: alertId, user_id: userId, stages, lifecycle_count: filtered.length }, null, 2)
  );
} else {
  ok("UI supabase lifecycle check", false, "missing supabase or ids");
}

await browser.close();

const evidencePath = join(ROOT, "docs/analytics/PATCH_10_3_PRICE_ALERT_LIFECYCLE_EVIDENCE.json");
let evidence = {};
if (existsSync(evidencePath)) {
  evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
}
evidence.browser_validation = {
  checks: {
    total: checks.length,
    passed: checks.filter((c) => c.pass).length,
    failed: checks.filter((c) => c.pass === false).length,
  },
  alert_id: alertId,
  user_id: userId,
};
writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));

process.exit(checks.some((c) => !c.pass) ? 1 : 0);
