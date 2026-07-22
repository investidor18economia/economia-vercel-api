#!/usr/bin/env node
/**
 * PATCH 3.3A.1 — Production operational smoke (no secrets logged).
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE = process.env.PATCH33A1_PROD_BASE_URL || "https://economia-ai.vercel.app";

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

function mask(value) {
  if (!value) return "(null)";
  const v = String(value);
  return v.length < 10 ? "(masked)" : `${v.slice(0, 4)}****${v.slice(-4)}`;
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
  return { status: res.status, json, headers: Object.fromEntries(res.headers.entries()) };
}

console.log("\nPATCH 3.3A.1 — production smoke\n");

// register-user blocked
{
  const res = await post("/api/register-user", { email: "blocked@test.invalid", name: "Test" });
  ok("register-user blocked", res.status === 403 && res.json?.reasonCode === "auth_verification_required");
}

// request-code invalid email
{
  const res = await post("/api/auth/request-code", { email: "not-an-email" });
  ok("request-code invalid email", res.status === 400 && res.json?.reasonCode === "auth_invalid_email");
}

// request-code anti-enumeration path (may 200 or 503 depending on Resend)
{
  const testEmail = `patch-33a1-prod-${Date.now()}@test.invalid`;
  const res = await post("/api/auth/request-code", { email: testEmail, name: "Prod Smoke" });
  ok(
    "request-code controlled test",
    res.status === 200 || res.status === 429 || res.status === 503,
    `status=${res.status}`
  );
  if (res.status === 200) {
    ok("request-code generic message", typeof res.json?.message === "string");
    ok("request-code returns challenge_id", typeof res.json?.challenge_id === "string");
  }
}

// verify-code invalid payload
{
  const res = await post("/api/auth/verify-code", { challenge_id: "bad", code: "123" });
  ok("verify-code invalid challenge", res.status === 400);
}

// analytics track ignores body user_id without session
{
  const res = await post("/api/analytics/track", {
    event_name: "session_started",
    visitor_id: "11111111-2222-4333-8444-555555555555",
    session_id: `patch-33a1-smoke-${Date.now()}`,
    user_id: "99999999-8888-4777-8666-555555555555",
  });
  ok("analytics track accepts anonymous", res.status === 200 || res.status === 201, `status=${res.status}`);
}

// env presence (names only)
const requiredEnv = [
  "RESEND_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
];
for (const name of requiredEnv) {
  ok(`local env present: ${name}`, Boolean(process.env[name]));
}

const failed = checks.filter((item) => !item.pass).length;
console.log(`\nSummary: ${checks.length - failed}/${checks.length}`);
process.exit(failed > 0 ? 1 : 0);
