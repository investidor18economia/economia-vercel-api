#!/usr/bin/env node
/**
 * PATCH 3.3A.2 — Spoofing + anonymous analytics validation (production).
 */
import crypto from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { issueUserSessionToken } from "../lib/miaUserSessionToken.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE = "https://economia-ai.vercel.app";
const SPOOF_U2 = "99999999-8888-4777-8666-555555555555";

function loadEnvFile(path) {
  const env = {};
  if (!existsSync(path)) return env;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
  }
  return env;
}

function mask(value) {
  if (!value) return "(null)";
  const v = String(value);
  return `${v.slice(0, 4)}****${v.slice(-4)}`;
}

const localEnv = loadEnvFile(join(ROOT, ".env.local"));
const prodSecrets = loadEnvFile(join(ROOT, "tmp", "patch-33a2-prod-secrets.env"));
const prodEnv = { ...localEnv, ...prodSecrets };

const supabase = createClient(
  localEnv.NEXT_PUBLIC_SUPABASE_URL,
  localEnv.SUPABASE_SERVICE_ROLE_KEY
);

const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const { data: users } = await supabase
  .from("users")
  .select("id, email_verified_at")
  .not("email_verified_at", "is", null)
  .gte("email_verified_at", since)
  .order("email_verified_at", { ascending: false })
  .limit(1);

const u1 = users?.[0]?.id;
if (!u1) {
  console.error("FAIL — no recently verified user");
  process.exit(1);
}

async function track(body, headers = {}) {
  const sessionId = body.session_id;
  const res = await fetch(`${BASE}/api/analytics/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json, sessionId };
}

const checks = [];
function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
}

console.log("\nPATCH 3.3A.2 — spoofing validation\n");
console.log(`U1=${mask(u1)} U2=${mask(SPOOF_U2)}`);

// Anonymous body spoof
{
  const sessionId = `patch-33a2-anon-spoof-${Date.now()}`;
  const res = await track({
    event_name: "session_started",
    visitor_id: crypto.randomUUID(),
    session_id: sessionId,
    user_id: SPOOF_U2,
  });
  ok("anonymous track accepts", res.status === 200 || res.status === 201, `status=${res.status}`);
  const { data } = await supabase
    .from("analytics_events")
    .select("user_id")
    .eq("session_id", sessionId)
    .maybeSingle();
  ok("anonymous body user_id NULL", data?.user_id == null);
}

// Authenticated spoof with production session token
{
  const token = issueUserSessionToken(u1, prodEnv);
  const sessionId = `patch-33a2-auth-spoof-${Date.now()}`;
  const res = await track(
    {
      event_name: "session_started",
      visitor_id: crypto.randomUUID(),
      session_id: sessionId,
      user_id: SPOOF_U2,
      metadata: { spoof_probe: true },
    },
    { Authorization: `Bearer ${token}` }
  );
  ok("authenticated track accepts", res.status === 200 || res.status === 201, `status=${res.status}`);
  const { data } = await supabase
    .from("analytics_events")
    .select("user_id")
    .eq("session_id", sessionId)
    .maybeSingle();
  ok("authenticated spoof persists U1 not U2", data?.user_id === u1, `persisted=${mask(data?.user_id)}`);
}

// Legacy token
{
  const apiSharedKey = String(localEnv.API_SHARED_KEY || "").trim();
  const body = Buffer.from(
    JSON.stringify({ uid: u1, iat: Date.now(), exp: Date.now() + 60000, ver: 1, purpose: "session" })
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", apiSharedKey).update(body).digest("base64url");
  const legacyToken = `${body}.${sig}`;
  const sessionId = `patch-33a2-legacy-spoof-${Date.now()}`;
  await track(
    {
      event_name: "session_started",
      visitor_id: crypto.randomUUID(),
      session_id: sessionId,
      user_id: SPOOF_U2,
    },
    { Authorization: `Bearer ${legacyToken}` }
  );
  const { data } = await supabase
    .from("analytics_events")
    .select("user_id")
    .eq("session_id", sessionId)
    .maybeSingle();
  ok("legacy token user_id NULL", data?.user_id == null);
}

const failed = checks.filter((c) => !c.pass).length;
console.log(`\nSummary: ${checks.length - failed}/${checks.length}`);
process.exit(failed > 0 ? 1 : 0);
