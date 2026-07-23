#!/usr/bin/env node
/**
 * PATCH 10.4 — production smoke (anti-regret foundation).
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

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

const BASE = process.env.PATCH104_PROD_BASE_URL || "https://economia-ai.vercel.app";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WAIT_MS = Number(process.env.PATCH104_PERSIST_WAIT_MS || 35000);

const checks = [];

function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
}

async function postChat(body) {
  const res = await fetch(`${BASE}/api/mia-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function fetchFoundation(sessionId, sinceIso) {
  if (!supabaseUrl || !serviceKey) return [];
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from("analytics_events")
    .select("id,event_name,category,session_id,metadata,created_at")
    .eq("event_name", "mia_anti_regret_foundation")
    .eq("session_id", sessionId)
    .gte("created_at", sinceIso)
    .not("category", "eq", "anti_regret_test")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

console.log("\nPATCH 10.4 — production smoke\n");

const health = await fetch(`${BASE}/api/health`);
const healthJson = await health.json().catch(() => ({}));
ok("health 200", health.ok, `build=${healthJson.build}`);

const sessionId = randomUUID();
const visitorId = randomUUID();
const conversationId = randomUUID();
const startedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();

const commercial = await postChat({
  text: "Quero um celular Samsung bom para jogos até 2500 reais",
  conversation_id: conversationId,
  analytics_context: { session_id: sessionId, visitor_id: visitorId },
});
ok("commercial HTTP 200", commercial.status === 200);

const requestId = commercial.json?.request_id;
ok("request_id present", !!requestId);
ok("offer_set inline 8.3", commercial.json?.offer_set_analytics?.offer_set_event_version === "8.3.0");

console.log(`\nWaiting ${WAIT_MS}ms for foundation persistence...`);
await new Promise((r) => setTimeout(r, WAIT_MS));

const foundation = await fetchFoundation(sessionId, startedAt);
const row = foundation.find((e) => e.metadata?.request_id === requestId) || foundation[0];

ok("foundation persisted", foundation.length >= 1, `count=${foundation.length}`);
ok("event_version 10.4.0", row?.metadata?.event_version === "10.4.0");
ok("decision_request_id correlation", row?.metadata?.decision_request_id === requestId);
ok("anti_regret_score range", row?.metadata?.anti_regret_score >= 0 && row?.metadata?.anti_regret_score <= 100);
ok("anti_regret_confidence present", !!row?.metadata?.anti_regret_confidence);
ok("observed_pattern present", !!row?.metadata?.observed_pattern);
ok("signal_count >= 1", (row?.metadata?.signal_count ?? 0) >= 1);
ok("regret_confirmed false", row?.metadata?.regret_confirmed === false);
ok("purchase_confirmed false", row?.metadata?.purchase_confirmed === false);

const blob = JSON.stringify(row?.metadata || {});
ok("privacy scan", !/product_name|https:\/\/|user_email|@/.test(blob));

writeFileSync(
  join(ROOT, "docs/analytics/PATCH_10_4_ANTI_REGRET_FOUNDATION_EVIDENCE.json"),
  JSON.stringify(
    {
      patch: "10.4",
      health: { ok: health.ok, build: healthJson.build },
      request_id: requestId,
      session_id: sessionId,
      foundation_count: foundation.length,
      sample: row?.metadata ?? null,
      checks: {
        total: checks.length,
        passed: checks.filter((c) => c.pass).length,
        failed: checks.filter((c) => !c.pass).length,
      },
    },
    null,
    2
  )
);

process.exit(checks.some((c) => !c.pass) ? 1 : 0);
