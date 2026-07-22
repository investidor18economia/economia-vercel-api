#!/usr/bin/env node
/**
 * PATCH 3.4 — Post-OTP production validation (user_authenticated with resolved user_id).
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE = process.env.PATCH34_PROD_BASE_URL || "https://economia-ai.vercel.app";
const WINDOW_MINUTES = Number(process.env.PATCH34_WINDOW_MINUTES || 60);
const DEPLOY_SINCE = process.env.PATCH34_DEPLOY_SINCE || "2026-07-22T17:20:00.000Z";

function loadEnv() {
  const envFile = join(ROOT, ".env.local");
  if (!existsSync(envFile)) throw new Error(".env.local missing");
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
}

function maskUuid(value) {
  if (!value) return "(null)";
  const v = String(value);
  return `${v.slice(0, 4)}****${v.slice(-4)}`;
}

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();
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
  return { status: res.status, json };
}

console.log(`\nPATCH 3.4 — post-OTP validation (since ${since}, deploy ${DEPLOY_SINCE})\n`);

// 1) Anonymous smoke events persisted
{
  const res = await fetch(
    `${supabaseUrl}/rest/v1/analytics_events?event_name=eq.user_authenticated&created_at=gte.${encodeURIComponent(DEPLOY_SINCE)}&select=id,user_id,metadata,created_at&order=created_at.desc&limit=10`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
  );
  const rows = await res.json();
  ok("user_authenticated rows since deploy", Array.isArray(rows) && rows.length >= 1, `count=${rows?.length ?? 0}`);
  const withAuthMethod = (rows || []).filter((r) => r.metadata?.auth_method === "otp_email");
  ok("metadata.auth_method=otp_email", withAuthMethod.length >= 1, `count=${withAuthMethod.length}`);
}

// 2) Optional scripted OTP login (PATCH34_LOGIN_EMAIL + PATCH34_OTP_CODE)
const loginEmail = process.env.PATCH34_LOGIN_EMAIL || "";
const loginOtp = process.env.PATCH34_OTP_CODE || "";
const loginName = process.env.PATCH34_LOGIN_NAME || "PATCH 3.4 Validation";

if (loginEmail && loginOtp) {
  const req = await post("/api/auth/request-code", { email: loginEmail, name: loginName });
  ok("request-code", req.status === 200, `status=${req.status}`);
  const challengeId = req.json?.challenge_id;
  const verify = await post("/api/auth/verify-code", {
    challenge_id: challengeId,
    code: loginOtp,
    name: loginName,
  });
  ok("verify-code", verify.status === 200 && verify.json?.success, `status=${verify.status}`);
  const token = verify.json?.session_token;
  const userId = verify.json?.user?.id;
  const visitorId = crypto.randomUUID();
  const sessionId = `patch34-auth-${Date.now()}`;
  const track = await post(
    "/api/analytics/track",
    {
      event_name: "user_authenticated",
      visitor_id: visitorId,
      session_id: sessionId,
      metadata: { page: "/app-mia", auth_method: "otp_email" },
    },
    { Authorization: `Bearer ${token}` }
  );
  ok("user_authenticated track with bearer", track.status === 200, `status=${track.status}`);

  await new Promise((r) => setTimeout(r, 1500));
  const res = await fetch(
    `${supabaseUrl}/rest/v1/analytics_events?event_name=eq.user_authenticated&session_id=eq.${encodeURIComponent(sessionId)}&select=id,user_id,visitor_id,metadata,created_at`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
  );
  const rows = await res.json();
  const row = rows?.[0];
  ok("persisted user_id server-side", row?.user_id === userId, `user_id=${maskUuid(row?.user_id)}`);
  ok("visitor_id preserved", row?.visitor_id === visitorId);
} else {
  console.log("INFO — PATCH34_LOGIN_EMAIL + PATCH34_OTP_CODE not set; checking recent human/UI logins…");
}

// 3) Recent authenticated user_authenticated from real sessions (UI or API)
{
  const res = await fetch(
    `${supabaseUrl}/rest/v1/analytics_events?event_name=eq.user_authenticated&user_id=not.is.null&created_at=gte.${encodeURIComponent(since)}&select=id,user_id,visitor_id,session_id,metadata,created_at&order=created_at.desc&limit=5`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
  );
  const rows = await res.json();
  ok(
    "authenticated user_authenticated exists",
    Array.isArray(rows) && rows.length >= 1,
    `count=${rows?.length ?? 0}`
  );
  if (rows?.[0]) {
    ok("authenticated row has auth_method", rows[0].metadata?.auth_method === "otp_email");
    console.log(
      "\nLatest authenticated event:",
      JSON.stringify({
        id: maskUuid(rows[0].id),
        user_id: maskUuid(rows[0].user_id),
        visitor_id: maskUuid(rows[0].visitor_id),
        session_id: String(rows[0].session_id || "").slice(0, 12) + "…",
        created_at: rows[0].created_at,
      })
    );
  }
}

const failed = checks.filter((c) => !c.pass).length;
console.log(`\nResultado: ${checks.length - failed}/${checks.length}`);
process.exit(failed > 0 ? 1 : 0);
