#!/usr/bin/env node
/**
 * PATCH 10.1 — production smoke (price intelligence).
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

const BASE = process.env.PATCH101_PROD_BASE_URL || "https://economia-ai.vercel.app";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WAIT_MS = Number(process.env.PATCH101_PERSIST_WAIT_MS || 28000);

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
  const testCategory =
    eventName === "mia_price_intelligence" ? "price_intelligence_test" : "offer_set_test";
  const { data, error } = await supabase
    .from("analytics_events")
    .select("id,event_name,category,session_id,metadata,created_at")
    .eq("event_name", eventName)
    .eq("session_id", sessionId)
    .gte("created_at", sinceIso)
    .not("category", "eq", testCategory)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

console.log("\nPATCH 10.1 — production smoke\n");

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
ok("inline offer_set 8.3", commercial.json?.offer_set_analytics?.offer_set_event_version === "8.3.0");

console.log(`\nWaiting ${WAIT_MS}ms...`);
await new Promise((r) => setTimeout(r, WAIT_MS));

const offerSet = await fetchEvents(sessionId, "mia_offer_set", startedAt);
const intel = await fetchEvents(sessionId, "mia_price_intelligence", startedAt);

ok("offer_set persisted", offerSet.length >= 1, `count=${offerSet.length}`);
ok("price_intelligence persisted", intel.length >= 1, `count=${intel.length}`);

const row = intel[0];
if (row) {
  ok("event_version 10.1.0", row.metadata?.event_version === "10.1.0");
  ok("price_quality present", !!row.metadata?.price_quality);
  ok("decision_request_id", row.metadata?.decision_request_id === requestId);
  ok("intelligence_valid", row.metadata?.intelligence_valid === true);
  const blob = JSON.stringify(row.metadata || {});
  ok("privacy scan", !/product_name|https:\/\//.test(blob));
}

ok(
  "offer_set correlation",
  offerSet.some((e) => e.metadata?.request_id === requestId) &&
    intel.some((e) => e.metadata?.request_id === requestId)
);

const evidence = {
  patch: "10.1",
  health: { ok: health.ok, build: healthJson.build },
  request_id: requestId,
  session_id: sessionId,
  offer_set_count: offerSet.length,
  price_intelligence_count: intel.length,
  checks: {
    total: checks.length,
    passed: checks.filter((c) => c.pass).length,
    failed: checks.filter((c) => !c.pass).length,
  },
};

writeFileSync(
  join(ROOT, "docs/analytics/PATCH_10_1_PRICE_INTELLIGENCE_EVIDENCE.json"),
  JSON.stringify(evidence, null, 2)
);
process.exit(checks.some((c) => !c.pass) ? 1 : 0);
