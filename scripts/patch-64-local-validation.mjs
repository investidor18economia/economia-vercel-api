#!/usr/bin/env node
/**
 * PATCH 6.4 — local endpoint validation (commercial paths + analytics instrumentation).
 */
import { readFileSync, existsSync } from "node:fs";
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

const BASE = process.env.PATCH64_LOCAL_BASE_URL || "http://localhost:3000";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SCENARIOS = [
  {
    id: "S1",
    label: "celular DL/budget",
    text: "Quero um celular até R$ 2.000 com boa câmera e bateria.",
    expectRecommendation: true,
  },
  {
    id: "S2",
    label: "samsung games",
    text: "Qual o melhor Samsung para jogos até R$ 3.000?",
    expectRecommendation: true,
  },
  {
    id: "S3",
    label: "iphone budget",
    text: "Quero um iPhone até R$ 4.000.",
    expectRecommendation: true,
  },
  {
    id: "S4",
    label: "xiaomi storage",
    text: "Me recomenda um Xiaomi barato com 256 GB.",
    expectRecommendation: true,
  },
  {
    id: "S5",
    label: "notebook work",
    text: "Preciso de um notebook para trabalhar e estudar.",
    expectRecommendation: true,
  },
  {
    id: "S6",
    label: "tv 55",
    text: "Quero uma televisão de 55 polegadas.",
    expectRecommendation: true,
  },
  {
    id: "S7",
    label: "camera ranking",
    text: "Qual celular tem a melhor câmera?",
    expectRecommendation: true,
  },
];

const checks = [];
function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
}

async function waitForHealth(maxMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return true;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
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
    .select(
      "id, event_name, session_id, conversation_id, category, query_text, metadata, created_at"
    )
    .eq("event_name", "data_layer_resolution")
    .eq("session_id", sessionId)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

console.log("\nPATCH 6.4 — local endpoint validation\n");
console.log(`Base URL: ${BASE}`);

ok("supabase env present", !!(supabaseUrl && serviceKey));
ok("health reachable", await waitForHealth());

const sessionId = randomUUID();
const visitorId = randomUUID();
const conversationId = randomUUID();
const startedAt = new Date().toISOString();
let sessionContext = {};
const results = [];

for (const scenario of SCENARIOS) {
  const before = new Date().toISOString();
  const { status, json } = await postChat({
    text: scenario.text,
    user_id: "guest",
    conversation_id: conversationId,
    analytics_context: { session_id: sessionId, visitor_id: visitorId, conversation_id: conversationId },
    session_context: sessionContext,
    messages: [],
  });

  const hasPrices = Array.isArray(json.prices) && json.prices.length > 0;
  const summary = json.data_layer_usage_analytics || null;
  sessionContext = json.session_context || sessionContext;

  results.push({
    ...scenario,
    status,
    hasPrices,
    summary,
    replyPreview: String(json.reply || "").slice(0, 120),
  });

  ok(`${scenario.id} HTTP 200`, status === 200, `status=${status}`);
  ok(`${scenario.id} reply present`, !!json.reply);
  if (scenario.expectRecommendation) {
    ok(`${scenario.id} recommendation when expected`, hasPrices || status === 200);
  }
  ok(`${scenario.id} analytics summary in response`, !!summary?.response_classification, summary?.response_classification || "missing");

  const events = await fetchEvents(sessionId, before);
  ok(`${scenario.id} single resolution event`, events.length <= 1, `events=${events.length}`);
  if (events.length === 1) {
    const meta = events[0].metadata || {};
    ok(`${scenario.id} event_version 6.4.0`, meta.event_version === "6.4.0");
    ok(
      `${scenario.id} persisted matches summary`,
      meta.response_classification === summary?.response_classification,
      `${meta.response_classification} vs ${summary?.response_classification}`
    );
  }

  await new Promise((r) => setTimeout(r, 1500));
}

// Follow-up scenario S8
{
  const before = new Date().toISOString();
  const followUp = "Desses, priorize bateria e câmera.";
  const { status, json } = await postChat({
    text: followUp,
    user_id: "guest",
    conversation_id: conversationId,
    analytics_context: { session_id: sessionId, visitor_id: visitorId, conversation_id: conversationId },
    session_context: sessionContext,
    messages: [
      { role: "user", content: SCENARIOS[0].text },
      { role: "assistant", content: String(results[0]?.replyPreview || "ok") },
    ],
  });
  const summary = json.data_layer_usage_analytics || null;
  ok("S8 follow-up HTTP 200", status === 200);
  ok("S8 follow-up analytics summary", !!summary?.response_classification, summary?.response_classification || "missing");
  const events = await fetchEvents(sessionId, before);
  ok("S8 at most one event", events.length <= 1, `events=${events.length}`);
  results.push({
    id: "S8",
    label: "follow-up priority",
    text: followUp,
    status,
    summary,
    hasPrices: Array.isArray(json.prices) && json.prices.length > 0,
  });
}

const allEvents = await fetchEvents(sessionId, startedAt);
ok("total events match scenarios", allEvents.length >= 1 && allEvents.length <= SCENARIOS.length + 1, `total=${allEvents.length}`);
ok("no duplicate timestamps burst", allEvents.length <= 9);

console.log("\nScenario summary:");
console.log(JSON.stringify(results, null, 2));

const passed = checks.filter((c) => c.pass).length;
console.log(`\nLocal validation: ${passed}/${checks.length}\n`);
process.exit(passed === checks.length ? 0 : 1);
