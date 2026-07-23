#!/usr/bin/env node
/**
 * PATCH 7.3 — production smoke (social + commercial + latency persistence).
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

const BASE = process.env.PATCH73_PROD_BASE_URL || "https://economia-ai.vercel.app";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const checks = [];
const evidence = [];

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
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, requestId: res.headers.get("x-request-id") };
}

async function fetchLatencyEvents(sessionId, sinceIso) {
  if (!supabaseUrl || !serviceKey) return [];
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from("analytics_events")
    .select("id,event_name,category,session_id,metadata,created_at")
    .eq("event_name", "mia_latency_event")
    .eq("session_id", sessionId)
    .gte("created_at", sinceIso)
    .not("category", "eq", "reliability_latency_test")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

function sanitize(event) {
  if (!event) return null;
  const m = event.metadata || {};
  return {
    id: event.id,
    created_at: event.created_at,
    metadata: {
      event_version: m.event_version,
      request_id: m.request_id,
      total_duration_ms: m.total_duration_ms,
      latency_band: m.latency_band,
      slow_request: m.slow_request,
      response_path: m.response_path,
      response_outcome: m.response_outcome,
      stage_count: Array.isArray(m.stages) ? m.stages.length : 0,
      measurement_gap_count: m.measurement_gap_count,
    },
  };
}

console.log("\nPATCH 7.3 — production smoke\n");
console.log(`Base URL: ${BASE}`);

const health = await fetch(`${BASE}/api/health`);
const healthJson = await health.json().catch(() => ({}));
ok("production health", health.ok, `status=${health.status}`);

const sessionId = randomUUID();
const visitorId = randomUUID();
const conversationId = randomUUID();
const startedAt = new Date().toISOString();
let deployReady = false;

const scenarios = [
  { id: "L1", text: "Olá, tudo bem?" },
  { id: "L2", text: "Quero um celular até R$ 2.000 com boa câmera." },
];

for (const scenario of scenarios) {
  const t0 = new Date().toISOString();
  const { status, json } = await postChat({
    text: scenario.text,
    user_id: "guest",
    conversation_id: conversationId,
    analytics_context: { session_id: sessionId, visitor_id: visitorId, conversation_id: conversationId },
    messages: [],
  });
  const summary = json.latency_analytics || null;
  if (summary?.latency_event_version === "7.3.0" || summary?.total_duration_ms != null) {
    deployReady = true;
  }
  await new Promise((r) => setTimeout(r, 15000));
  const events = await fetchLatencyEvents(sessionId, t0);
  const matched = events.at(-1) || null;
  evidence.push({
    id: scenario.id,
    text: scenario.text,
    httpStatus: status,
    latencySummary: summary,
    persisted: sanitize(matched),
  });
  ok(`${scenario.id} chat OK`, status === 200, `status=${status}`);
  ok(`${scenario.id} latency summary`, !!summary?.total_duration_ms, `${summary?.total_duration_ms ?? "missing"}ms`);
  ok(`${scenario.id} event persisted`, !!matched, `events=${events.length}`);
  if (matched) {
    ok(`${scenario.id} event_version`, matched.metadata?.event_version === "7.3.0");
    ok(`${scenario.id} total_duration plausible`, Number(matched.metadata?.total_duration_ms) >= 0);
    ok(`${scenario.id} no secrets`, !JSON.stringify(matched.metadata || {}).match(/api_key|password|secret/i));
  }
}

ok("deploy exposes latency_analytics", deployReady, deployReady ? "7.3.0" : "not yet deployed");

const allEvents = await fetchLatencyEvents(sessionId, startedAt);
ok("at least one mia_latency_event", allEvents.length >= 1, `total=${allEvents.length}`);

writeFileSync(
  join(ROOT, "docs/analytics/PATCH_7.3_PRODUCTION_EVIDENCE.json"),
  JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      base_url: BASE,
      health_build: healthJson.build,
      session_id: sessionId,
      started_at: startedAt,
      scenarios: evidence,
      total_latency_events: allEvents.length,
      deploy_ready: deployReady,
    },
    null,
    2
  )
);

const passed = checks.filter((c) => c.pass).length;
console.log(`\nProduction smoke: ${passed}/${checks.length}\n`);
process.exit(passed === checks.length ? 0 : 1);
