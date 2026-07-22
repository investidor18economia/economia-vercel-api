#!/usr/bin/env node
/**
 * PATCH 3.4 — Production smoke (retention foundation).
 * Validates user_authenticated allowlist + optional retention indexes in Supabase.
 */
import crypto from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE = process.env.PATCH34_PROD_BASE_URL || "https://economia-ai.vercel.app";

const RETENTION_INDEXES = [
  "idx_analytics_events_visitor_id_created_at",
  "idx_analytics_events_user_id_created_at",
  "idx_analytics_events_conversation_id_created_at",
];

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
  return { status: res.status, json };
}

console.log("\nPATCH 3.4 — retention foundation production smoke\n");

{
  const res = await fetch(`${BASE}/api/health`);
  ok("health endpoint", res.ok, `status=${res.status}`);
}

{
  const visitorId = crypto.randomUUID();
  const sessionId = `patch-34-smoke-${Date.now()}`;
  const res = await post("/api/analytics/track", {
    event_name: "user_authenticated",
    visitor_id: visitorId,
    session_id: sessionId,
    metadata: { page: "/app-mia", auth_method: "otp_email" },
  });
  ok(
    "user_authenticated accepted by production allowlist",
    res.status === 200 && res.json?.success === true,
    `status=${res.status} body=${JSON.stringify(res.json ?? {})}`
  );
}

{
  const res = await post("/api/analytics/track", {
    event_name: "session_started",
    visitor_id: crypto.randomUUID(),
    session_id: `patch-34-regression-${Date.now()}`,
    metadata: { page: "/app-mia" },
  });
  ok(
    "session_started regression",
    res.status === 200 && res.json?.success === true,
    `status=${res.status}`
  );
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (supabaseUrl && serviceKey) {
  try {
    const sql = `
      select indexname
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'analytics_events'
        and indexname = any($1::text[])
    `.trim();

    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql, params: [RETENTION_INDEXES] }),
    });

    if (res.status === 404) {
      const countRes = await fetch(
        `${supabaseUrl}/rest/v1/analytics_events?event_name=eq.user_authenticated&select=id&limit=1`,
        {
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
        }
      );
      ok(
        "retention indexes (skipped — no exec_sql RPC)",
        countRes.ok,
        "apply migration 20260722180000 via supabase db push"
      );
    } else {
      const body = await res.json();
      const found = Array.isArray(body) ? body.map((r) => r.indexname) : [];
      for (const indexName of RETENTION_INDEXES) {
        ok(`retention index ${indexName}`, found.includes(indexName));
      }
    }
  } catch (err) {
    ok("supabase retention index check", false, err.message);
  }
} else {
  console.log("SKIP — Supabase credentials not loaded (index check)");
}

const failed = checks.filter((c) => !c.pass).length;
console.log(`\nResultado: ${checks.length - failed}/${checks.length}`);
process.exit(failed > 0 ? 1 : 0);
