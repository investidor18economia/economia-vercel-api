#!/usr/bin/env node
/**
 * PATCH 9.2 — production smoke (acceptance signal analytics).
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

const BASE =
  process.env.PATCH92_PROD_BASE_URL ||
  process.env.PATCH91_PROD_BASE_URL ||
  "https://economia-ai.vercel.app";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WAIT_MS = Number(process.env.PATCH92_PERSIST_WAIT_MS || 25000);

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

async function postTrack(payload) {
  const res = await fetch(`${BASE}/api/analytics/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function fetchAcceptanceSignals(sessionId, sinceIso) {
  if (!supabaseUrl || !serviceKey) return [];
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from("analytics_events")
    .select("id,event_name,category,session_id,metadata,created_at")
    .eq("event_name", "mia_recommendation_acceptance_signal")
    .eq("session_id", sessionId)
    .gte("created_at", sinceIso)
    .not("category", "eq", "recommendation_acceptance_signal_test")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

console.log("\nPATCH 9.2 — production smoke\n");

const health = await fetch(`${BASE}/api/health`);
const healthJson = await health.json().catch(() => ({}));
ok("health 200", health.ok, `build=${healthJson.build}`);

const sessionId = randomUUID();
const visitorId = randomUUID();
const conversationId = randomUUID();
const startedAt = new Date().toISOString();

const { status, json } = await postChat({
  text: "Quero um celular Samsung bom para jogos até 2500 reais",
  conversation_id: conversationId,
  analytics_context: { session_id: sessionId, visitor_id: visitorId },
});
ok("commercial HTTP 200", status === 200);
ok("response request_id", !!json?.request_id, json?.request_id?.slice(0, 8));
ok("decision analytics inline", json?.recommendation_decision_analytics?.recommendation_decision_event_version === "9.1.0");

const decisionRequestId = json?.request_id;
const winnerFamily = json?.recommendation_decision_analytics?.recommendation_decision_winner_product_family;
const decisionContext = {
  decision_source: json?.recommendation_decision_analytics?.recommendation_decision_source,
  decision_event_version: "9.1.0",
  winner_product_family: winnerFamily,
  decision_at_ms: Date.now(),
};

if (decisionRequestId) {
  const signalId1 = randomUUID();
  const trackShown = await postTrack({
    event_name: "mia_recommendation_shown",
    session_id: sessionId,
    visitor_id: visitorId,
    conversation_id: conversationId,
    category: "smartphone",
    product_name: "Samsung Galaxy",
    metadata: {
      decision_request_id: decisionRequestId,
      acceptance_signal_id: signalId1,
      decision_context: decisionContext,
      has_offer_card: true,
    },
  });
  ok("track recommendation_shown 200", trackShown.status === 200);

  const signalId2 = randomUUID();
  const trackClick = await postTrack({
    event_name: "offer_click",
    session_id: sessionId,
    visitor_id: visitorId,
    conversation_id: conversationId,
    category: "smartphone",
    product_id: "samsung-galaxy-test",
    metadata: {
      decision_request_id: decisionRequestId,
      acceptance_signal_id: signalId2,
      decision_context: decisionContext,
    },
  });
  ok("track offer_click 200", trackClick.status === 200);
}

const social = await postChat({
  text: "Boa tarde, como você está?",
  conversation_id: conversationId,
  analytics_context: { session_id: sessionId, visitor_id: visitorId },
});
ok("social HTTP 200", social.status === 200);
ok("social no request_id decision", !social.json?.recommendation_decision_analytics?.recommendation_decision_valid);

console.log(`\nWaiting ${WAIT_MS}ms...`);
await new Promise((r) => setTimeout(r, WAIT_MS));

const events = await fetchAcceptanceSignals(sessionId, startedAt);
ok("acceptance signals persisted", events.length >= 2, `count=${events.length}`);
ok("version 9.2.0", events.every((e) => e.metadata?.event_version === "9.2.0"));
ok("correlation HIGH", events.every((e) => e.metadata?.correlation_confidence === "HIGH"));
ok("has rendered", events.some((e) => e.metadata?.signal_type === "RECOMMENDATION_RENDERED"));
ok("has click", events.some((e) => e.metadata?.signal_type === "WINNER_OFFER_CLICKED"));
ok("not purchase confirmed", events.every((e) => !e.metadata?.purchase_confirmed));
ok("dedup keys unique", new Set(events.map((e) => e.metadata?.dedup_key)).size === events.length);

for (const e of events) {
  const blob = JSON.stringify(e.metadata || {}).toLowerCase();
  ok(`privacy ${e.metadata?.signal_type}`, !/bearer |product_name|https:\/\//.test(blob));
}

const evidence = {
  patch: "9.2",
  health: { ok: health.ok, build: healthJson.build },
  decision_request_id: decisionRequestId,
  events: events.map((e) => ({
    signal_type: e.metadata?.signal_type,
    signal_strength: e.metadata?.signal_strength,
    signal_target: e.metadata?.signal_target,
    correlation_method: e.metadata?.correlation_method,
    correlation_confidence: e.metadata?.correlation_confidence,
    decision_request_id: e.metadata?.decision_request_id,
  })),
  checks: {
    total: checks.length,
    passed: checks.filter((c) => c.pass).length,
    failed: checks.filter((c) => !c.pass).length,
  },
};

writeFileSync(join(ROOT, "docs/analytics/PATCH_9_2_PRODUCTION_EVIDENCE.json"), JSON.stringify(evidence, null, 2));
process.exit(checks.some((c) => !c.pass) ? 1 : 0);
