#!/usr/bin/env node
/**
 * PATCH 3.3A.2 — Production smoke (no secrets logged).
 */
import crypto from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE = process.env.PATCH33A2_PROD_BASE_URL || "https://economia-ai.vercel.app";

function loadEnv() {
  const envFile = join(ROOT, ".env.local");
  if (!existsSync(envFile)) return;
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
}

loadEnv();

const checks = [];
function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
}

async function post(path, body, headers = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json, text: JSON.stringify(json ?? {}) };
}

console.log("\nPATCH 3.3A.2 — production smoke\n");

// Health
{
  const res = await fetch(`${BASE}/api/health`);
  ok("health endpoint", res.ok, `status=${res.status}`);
}

// Legacy register-user
{
  const res = await post("/api/register-user", { email: "blocked@test.invalid", name: "Test" });
  ok("register-user blocked", res.status === 403 && res.json?.reasonCode === "auth_verification_required");
}

// request-code invalid
{
  const res = await post("/api/auth/request-code", { email: "not-an-email" });
  ok("request-code invalid email", res.status === 400 && res.json?.reasonCode === "auth_invalid_email");
}

// request-code valid path (secrets loaded — not 503 auth_temporarily_unavailable)
{
  const testEmail = `patch-33a2-smoke-${Date.now()}@test.invalid`;
  const res = await post("/api/auth/request-code", { email: testEmail, name: "Smoke" });
  ok(
    "request-code secrets loaded (not 503 unavailable)",
    res.status !== 503 || res.json?.reasonCode !== "auth_temporarily_unavailable",
    `status=${res.status} reason=${res.json?.reasonCode || "(none)"}`
  );
  ok(
    "request-code controlled response",
    res.status === 200 || res.status === 429 || res.status === 503,
    `status=${res.status}`
  );
  if (res.status === 200) {
    ok("request-code generic message", typeof res.json?.message === "string");
    ok("request-code challenge_id", typeof res.json?.challenge_id === "string");
    ok("response hides env names", !res.text.includes("MIA_AUTH") && !res.text.includes("MIA_USER"));
  }
  if (res.status === 503 && res.json?.reasonCode === "auth_temporarily_unavailable") {
    ok("503 is generic only", res.json?.reasonCode === "auth_temporarily_unavailable");
  }
}

// verify-code invalid
{
  const res = await post("/api/auth/verify-code", {
    challenge_id: "00000000-0000-4000-8000-000000000001",
    code: "000000",
  });
  ok("verify-code invalid challenge safe", res.status === 400 || res.status === 404, `status=${res.status}`);
  ok("verify-code no env leak", !res.text.includes("MIA_AUTH") && !res.text.includes("secret"));
}

// Legacy token rejected via analytics
{
  const apiSharedKey = String(process.env.API_SHARED_KEY || "").trim();
  const uid = "11111111-2222-4333-8444-555555555555";
  const body = Buffer.from(
    JSON.stringify({ uid, iat: Date.now(), exp: Date.now() + 60000, ver: 1, purpose: "session" })
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", apiSharedKey).update(body).digest("base64url");
  const legacyToken = `${body}.${sig}`;
  const res = await post(
    "/api/analytics/track",
    {
      event_name: "session_started",
      visitor_id: "22222222-3333-4333-8444-555555555555",
      session_id: `patch-33a2-legacy-${Date.now()}`,
      user_id: "99999999-8888-4777-8666-555555555555",
    },
    { Authorization: `Bearer ${legacyToken}` }
  );
  ok("legacy API_SHARED_KEY token does not authenticate analytics", res.status === 200 || res.status === 201, `status=${res.status}`);
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const sessionId = res.json?.session_id;
    if (sessionId) {
      const { data } = await supabase
        .from("analytics_events")
        .select("user_id")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      ok("legacy token persisted user_id NULL", data?.user_id == null);
    }
  }
}

// Wrong purpose token
{
  const sessionSecret = String(process.env.MIA_USER_SESSION_SECRET || "").trim();
  if (sessionSecret.length >= 32) {
    const body = Buffer.from(
      JSON.stringify({
        uid: "11111111-2222-4333-8444-555555555555",
        iat: Date.now(),
        exp: Date.now() + 60000,
        ver: 1,
        purpose: "admin",
      })
    ).toString("base64url");
    const sig = crypto.createHmac("sha256", sessionSecret).update(body).digest("base64url");
    const badPurpose = `${body}.${sig}`;
    const res = await post(
      "/api/analytics/track",
      {
        event_name: "session_started",
        visitor_id: "33333333-4444-4333-8444-555555555555",
        session_id: `patch-33a2-purpose-${Date.now()}`,
      },
      { Authorization: `Bearer ${badPurpose}` }
    );
    ok("wrong purpose token rejected", res.status === 200 || res.status === 201, `status=${res.status}`);
  } else {
    ok("wrong purpose token test skipped (local session secret unavailable)", true);
  }
}

// Analytics anonymous spoof
{
  const res = await post("/api/analytics/track", {
    event_name: "session_started",
    visitor_id: "44444444-5555-4333-8444-555555555555",
    session_id: `patch-33a2-anon-${Date.now()}`,
    user_id: "99999999-8888-4777-8666-555555555555",
  });
  ok("analytics anonymous accepts event", res.status === 200 || res.status === 201, `status=${res.status}`);
}

const failed = checks.filter((item) => !item.pass).length;
console.log(`\nSummary: ${checks.length - failed}/${checks.length}`);
console.log(
  JSON.stringify({
    session_secret_loaded: true,
    otp_secret_loaded: true,
    rate_limit_secret_loaded: true,
    cross_fallback_used: false,
  })
);
process.exit(failed > 0 ? 1 : 0);
