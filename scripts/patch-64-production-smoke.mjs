#!/usr/bin/env node
/**
 * PATCH 6.4 — production smoke (real /api/mia-chat + Supabase event correlation).
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

const BASE = process.env.PATCH64_PROD_BASE_URL || "https://economia-ai.vercel.app";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SCENARIOS = [
  { id: "P1", text: "Quero um celular até R$ 2.000 com boa câmera e bateria." },
  { id: "P2", text: "Qual o melhor Samsung para jogos até R$ 3.000?" },
  { id: "P3", text: "Quero um iPhone até R$ 4.000." },
  { id: "P4", text: "Me recomenda um Xiaomi barato com 256 GB." },
  { id: "P5", text: "Preciso de um notebook para trabalhar e estudar." },
  { id: "P6", text: "Quero uma televisão de 55 polegadas." },
  { id: "P7", text: "Qual celular tem a melhor câmera?" },
];

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
  return { status: res.status, json };
}

async function fetchEvents(sessionId, sinceIso) {
  if (!supabaseUrl || !serviceKey) return [];
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from("analytics_events")
    .select("*")
    .eq("event_name", "data_layer_resolution")
    .eq("session_id", sessionId)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

async function countRecentProdEvents(sinceIso) {
  if (!supabaseUrl || !serviceKey) return 0;
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { count, error } = await supabase
    .from("analytics_events")
    .select("id", { count: "exact", head: true })
    .eq("event_name", "data_layer_resolution")
    .gte("created_at", sinceIso)
    .not("category", "eq", "data_layer_usage_test");
  if (error) throw new Error(error.message);
  return count || 0;
}

console.log("\nPATCH 6.4 — production smoke\n");
console.log(`Base URL: ${BASE}`);

const health = await fetch(`${BASE}/api/health`);
ok("production health", health.ok, `status=${health.status}`);

const ui = await fetch(`${BASE}/app-mia`);
ok("MIA UI reachable", ui.ok, `status=${ui.status}`);

const sessionId = randomUUID();
const visitorId = randomUUID();
const conversationId = randomUUID();
const startedAt = new Date().toISOString();
let sessionContext = {};

for (const scenario of SCENARIOS) {
  const t0 = new Date().toISOString();
  const { status, json } = await postChat({
    text: scenario.text,
    user_id: "guest",
    conversation_id: conversationId,
    analytics_context: { session_id: sessionId, visitor_id: visitorId, conversation_id: conversationId },
    session_context: sessionContext,
    messages: [],
  });
  sessionContext = json.session_context || sessionContext;
  const summary = json.data_layer_usage_analytics || null;
  const events = await fetchEvents(sessionId, t0);

  evidence.push({
    id: scenario.id,
    text: scenario.text,
    at: t0,
    httpStatus: status,
    responseClassification: summary?.response_classification || null,
    dataLayerUsed: summary?.data_layer_used ?? null,
    fallbackUsed: summary?.fallback_used ?? null,
    hasRecommendation: Array.isArray(json.prices) && json.prices.length > 0,
    winner: json.prices?.[0]?.product_name || null,
    persistedEvent: events[0]
      ? {
          id: events[0].id,
          classification: events[0].metadata?.response_classification,
          event_version: events[0].metadata?.event_version,
          response_path: events[0].metadata?.response_path,
        }
      : null,
  });

  ok(`${scenario.id} chat OK`, status === 200, `status=${status}`);
  ok(`${scenario.id} summary present`, !!summary?.response_classification, summary?.response_classification || "missing");
  ok(`${scenario.id} event persisted`, events.length >= 1, `events=${events.length}`);
  ok(`${scenario.id} no duplicate`, events.length <= 1, `events=${events.length}`);
  if (events[0]) {
    ok(`${scenario.id} event_version`, events[0].metadata?.event_version === "6.4.0");
    ok(
      `${scenario.id} correlation`,
      events[0].metadata?.response_classification === summary?.response_classification
    );
  }

  await new Promise((r) => setTimeout(r, 2000));
}

// P8 follow-up
{
  const t0 = new Date().toISOString();
  const text = "Desses, priorize bateria e câmera.";
  const { status, json } = await postChat({
    text,
    user_id: "guest",
    conversation_id: conversationId,
    analytics_context: { session_id: sessionId, visitor_id: visitorId, conversation_id: conversationId },
    session_context: sessionContext,
    messages: [
      { role: "user", content: SCENARIOS[0].text },
      { role: "assistant", content: "ok" },
    ],
  });
  const summary = json.data_layer_usage_analytics || null;
  const events = await fetchEvents(sessionId, t0);
  evidence.push({
    id: "P8",
    text,
    at: t0,
    httpStatus: status,
    responseClassification: summary?.response_classification || null,
    persistedEvent: events[0]?.metadata || null,
  });
  ok("P8 follow-up OK", status === 200);
  ok("P8 event persisted", events.length >= 1, `events=${events.length}`);
}

const totalSessionEvents = (await fetchEvents(sessionId, startedAt)).length;
ok("session produced events", totalSessionEvents >= 1, `total=${totalSessionEvents}`);

const prodTotal = await countRecentProdEvents(startedAt);
ok("prod analytics_events incremented", prodTotal >= totalSessionEvents, `prod=${prodTotal}`);

const reportPath = join(ROOT, "docs/analytics/PATCH_6.4_PRODUCTION_EVIDENCE.json");
writeFileSync(
  reportPath,
  JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      base_url: BASE,
      session_id: sessionId,
      conversation_id: conversationId,
      started_at: startedAt,
      scenarios: evidence,
      total_session_events: totalSessionEvents,
      prod_events_since_start: prodTotal,
    },
    null,
    2
  )
);
console.log(`\nEvidence written: ${reportPath}`);

const passed = checks.filter((c) => c.pass).length;
console.log(`\nProduction smoke: ${passed}/${checks.length}\n`);
process.exit(passed === checks.length ? 0 : 1);
