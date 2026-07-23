#!/usr/bin/env node
/**
 * PATCH 10.2 — production smoke (savings estimation).
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

const BASE = process.env.PATCH102_PROD_BASE_URL || "https://economia-ai.vercel.app";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WAIT_MS = Number(process.env.PATCH102_PERSIST_WAIT_MS || 45000);
const POLL_MS = Number(process.env.PATCH102_POLL_MS || 5000);

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

async function fetchEvents(sessionId, eventName, sinceIso) {
  if (!supabaseUrl || !serviceKey) return [];
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const testCategories = {
    mia_savings_estimation: "savings_estimation_test",
    mia_price_intelligence: "price_intelligence_test",
    mia_offer_set: "offer_set_test",
  };
  const { data, error } = await supabase
    .from("analytics_events")
    .select("id,event_name,category,session_id,metadata,created_at")
    .eq("event_name", eventName)
    .eq("session_id", sessionId)
    .gte("created_at", sinceIso)
    .not("category", "eq", testCategories[eventName] || "test")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

console.log("\nPATCH 10.2 — production smoke\n");

const health = await fetch(`${BASE}/api/health`);
const healthJson = await health.json().catch(() => ({}));
ok("health 200", health.ok, `build=${healthJson.build}`);

const sessionId = randomUUID();
const visitorId = randomUUID();
const conversationId = randomUUID();
const startedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();

const scenarios = [
  { id: "A", text: "Quero um celular Samsung bom para jogos até 2500 reais" },
  { id: "B", text: "cadeira gamer ergonômica preta até 1200 reais" },
];

let requestId = null;
for (const s of scenarios) {
  const commercial = await postChat({
    text: s.text,
    conversation_id: conversationId,
    analytics_context: { session_id: sessionId, visitor_id: visitorId },
  });
  ok(`${s.id} HTTP 200`, commercial.status === 200);
  ok(`${s.id} inline offer_set 8.3`, commercial.json?.offer_set_analytics?.offer_set_event_version === "8.3.0");
  requestId = commercial.json?.request_id || requestId;
  await new Promise((r) => setTimeout(r, 3000));
}

ok("request_id present", !!requestId);

console.log(`\nPolling up to ${WAIT_MS}ms...`);
let offerSet = [];
let savings = [];
const deadline = Date.now() + WAIT_MS;
while (Date.now() < deadline) {
  offerSet = await fetchEvents(sessionId, "mia_offer_set", startedAt);
  savings = await fetchEvents(sessionId, "mia_savings_estimation", startedAt);
  if (offerSet.length >= 1 && savings.length >= 1) break;
  await new Promise((r) => setTimeout(r, POLL_MS));
}

ok("offer_set persisted", offerSet.length >= 1, `count=${offerSet.length}`);
ok("savings_estimation persisted", savings.length >= 1, `count=${savings.length}`);

const observed = savings.find((e) => e.metadata?.calculation_method === "WINNER_VS_MINIMUM");
const uiAssumption = savings.find((e) => e.metadata?.calculation_method === "PERCENTAGE_ASSUMPTION");

if (observed) {
  ok("event_version 10.2.0", observed.metadata?.event_version === "10.2.0");
  ok("observed savings_type", observed.metadata?.savings_type === "OBSERVED");
  ok("decision_request_id", observed.metadata?.decision_request_id === requestId);
  ok("purchase_confirmed false", observed.metadata?.purchase_confirmed === false);
  ok("no verified type", observed.metadata?.savings_type !== "VERIFIED");
}

if (uiAssumption) {
  ok("ui unverified type", uiAssumption.metadata?.savings_type === "UNVERIFIED");
  ok("ui baseline", uiAssumption.metadata?.baseline_type === "ESTIMATED_UI_ASSUMPTION");
  ok("ui low confidence", uiAssumption.metadata?.savings_confidence === "LOW");
}

const blob = JSON.stringify(savings.map((e) => e.metadata || {}));
ok("privacy scan", !/product_name|https:\/\//.test(blob));
ok(
  "correlation same request",
  savings.every((e) => e.metadata?.request_id === requestId) &&
    offerSet.some((e) => e.metadata?.request_id === requestId)
);
ok("no VERIFIED in payload", !/"VERIFIED"/.test(blob));

const evidence = {
  patch: "10.2",
  health: { ok: health.ok, build: healthJson.build },
  request_id: requestId,
  session_id: sessionId,
  offer_set_count: offerSet.length,
  savings_estimation_count: savings.length,
  methods: savings.map((e) => e.metadata?.calculation_method),
  checks: {
    total: checks.length,
    passed: checks.filter((c) => c.pass).length,
    failed: checks.filter((c) => !c.pass).length,
  },
};

writeFileSync(
  join(ROOT, "docs/analytics/PATCH_10_2_SAVINGS_ESTIMATION_EVIDENCE.json"),
  JSON.stringify(evidence, null, 2)
);
process.exit(checks.some((c) => !c.pass) ? 1 : 0);
