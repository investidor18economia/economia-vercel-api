#!/usr/bin/env node
/**
 * PATCH 3.3 — remote smoke test for authenticated user_id on /api/analytics/track.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { issueUserSessionToken } from "../lib/miaUserSessionToken.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

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

function maskUuid(value) {
  if (!value || typeof value !== "string") return "(null)";
  const v = value.trim();
  if (v.length < 12) return "(masked)";
  return `${v.slice(0, 4)}****-****-****-****-********${v.slice(-4)}`;
}

loadEnv();

const baseUrl = process.env.PATCH33_SMOKE_BASE_URL || "https://economia-ai.vercel.app";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SPOOF_USER = "99999999-8888-4777-8666-555555555555";
const QA_VISITOR = "11111111-2222-4333-8444-555555555555";
const QA_SESSION = `patch33-smoke-${Date.now()}`;

const tests = [];

async function postTrack(body, headers = {}) {
  const res = await fetch(`${baseUrl}/api/analytics/track`, {
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

async function fetchLatestEvent(sessionId, eventName) {
  if (!supabaseUrl || !serviceKey) return null;
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data } = await supabase
    .from("analytics_events")
    .select("user_id, visitor_id, session_id, event_name, created_at")
    .eq("session_id", sessionId)
    .eq("event_name", eventName)
    .order("created_at", { ascending: false })
    .limit(1);
  return data?.[0] || null;
}

async function registerTestUser() {
  const email = `patch33-smoke-${Date.now()}@teilor-qa.invalid`;
  const res = await fetch(`${baseUrl}/api/register-user`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, name: "Patch 33 Smoke" }),
  });
  const json = await res.json();
  if (!res.ok || !json?.success) {
    throw new Error(`register-user failed: ${res.status}`);
  }
  return { userId: json.user?.id, token: json.session_token, email };
}

async function run() {
  console.log("\nPATCH 3.3 — remote smoke test\n");
  console.log(`Base URL: ${baseUrl}`);

  {
    const sessionId = `${QA_SESSION}-anon-spoof`;
    const r = await postTrack({
      event_name: "session_started",
      visitor_id: QA_VISITOR,
      session_id: sessionId,
      user_id: SPOOF_USER,
      metadata: { page: "/patch-33-smoke", user_agent: "patch33-smoke-agent", qa: true, patch: "3.3" },
    });
    tests.push(["anonymous spoof accepted HTTP 200", r.status === 200, r.status]);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const row = await fetchLatestEvent(sessionId, "session_started");
    tests.push(["anonymous spoof persisted user_id NULL", row?.user_id == null, maskUuid(row?.user_id)]);
  }

  {
    const sessionId = `${QA_SESSION}-blocked`;
    const r = await postTrack({
      event_name: "not_allowed_event",
      session_id: sessionId,
      metadata: {},
    });
    tests.push(["blocked event rejected", r.status === 400, r.status]);
  }

  let registered = null;
  try {
    registered = await registerTestUser();
    tests.push(["register-user for auth smoke", !!registered?.token, maskUuid(registered?.userId)]);
  } catch (err) {
    tests.push(["register-user for auth smoke", false, err.message]);
  }

  if (registered?.token && registered?.userId) {
    const sessionId = `${QA_SESSION}-auth-spoof`;
    const r = await postTrack(
      {
        event_name: "session_started",
        visitor_id: QA_VISITOR,
        session_id: sessionId,
        user_id: SPOOF_USER,
        metadata: { page: "/patch-33-smoke-auth", user_agent: "patch33-smoke-agent", qa: true, patch: "3.3" },
      },
      { Authorization: `Bearer ${registered.token}` }
    );
    tests.push(["authenticated spoof HTTP 200", r.status === 200, r.status]);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const row = await fetchLatestEvent(sessionId, "session_started");
    tests.push([
      "authenticated spoof persists official user_id",
      row?.user_id === registered.userId,
      `expected=${maskUuid(registered.userId)} got=${maskUuid(row?.user_id)}`,
    ]);
    tests.push([
      "authenticated spoof ignores body attacker id",
      row?.user_id !== SPOOF_USER,
      maskUuid(row?.user_id),
    ]);
  }

  {
    const localToken = issueUserSessionToken(SPOOF_USER);
    const sessionId = `${QA_SESSION}-local-invalid`;
    const r = await postTrack(
      {
        event_name: "session_started",
        visitor_id: QA_VISITOR,
        session_id: sessionId,
        metadata: { page: "/patch-33-smoke-local", user_agent: "patch33-smoke-agent", qa: true },
      },
      localToken ? { Authorization: `Bearer ${localToken}` } : {}
    );
    tests.push(["local forged token HTTP 200", r.status === 200, r.status]);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const row = await fetchLatestEvent(sessionId, "session_started");
    tests.push(["local forged token user_id NULL in prod", row?.user_id == null, maskUuid(row?.user_id)]);
  }

  console.log("\nResults:");
  let passed = 0;
  for (const [name, ok, detail] of tests) {
    console.log(`${ok ? "✅" : "❌"} ${name}${detail != null && detail !== true ? ` — ${detail}` : ""}`);
    if (ok) passed += 1;
  }
  console.log(`\n${passed}/${tests.length} passed\n`);
  process.exit(passed === tests.length ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
