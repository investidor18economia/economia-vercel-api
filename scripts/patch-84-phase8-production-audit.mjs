#!/usr/bin/env node
/**
 * PATCH 8.4 — Phase 8 production audit (health, events, correlation, privacy scan).
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
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

const BASE = process.env.PATCH84_PROD_BASE_URL || "https://economia-ai.vercel.app";
const WAIT_MS = Number(process.env.PATCH84_PERSIST_WAIT_MS || 35000);
const checks = [];

function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
}

function mask(id = "") {
  const s = String(id);
  if (s.length < 12) return s;
  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}

function scanSecrets(blob = "") {
  const patterns = [
    /bearer\s+/i,
    /access_token/i,
    /refresh_token/i,
    /api_key/i,
    /authorization/i,
    /sk-[a-z0-9]{10,}/i,
  ];
  return patterns.some((p) => p.test(blob));
}

console.log("\nPATCH 8.4 — Phase 8 production audit\n");

const healthRes = await fetch(`${BASE}/api/health`);
const health = await healthRes.json().catch(() => ({}));
ok("health 200", healthRes.ok, `build=${health.build}`);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
for (const [event, version] of [
  ["mia_commercial_search", "8.1.0"],
  ["mia_provider_attempt", "8.2.0"],
  ["mia_offer_set", "8.3.0"],
]) {
  const { data, error } = await supabase
    .from("analytics_events")
    .select("id,metadata,query_text,category")
    .eq("event_name", event)
    .gte("created_at", since)
    .limit(200);
  if (error) throw error;
  const prod = (data || []).filter((e) => !String(e.category || "").endsWith("_test"));
  const versioned = prod.filter((e) => e.metadata?.event_version === version);
  ok(`${event} present`, versioned.length > 0, `count=${versioned.length}`);
  if (event === "mia_commercial_search") {
    ok(
      `${event} query sanitized`,
      versioned.every(
        (e) =>
          !e.query_text ||
          (!/bearer\s+/i.test(String(e.query_text)) &&
            !/@/.test(String(e.query_text)) &&
            String(e.query_text).length <= 512)
      )
    );
  } else {
    ok(`${event} no query_text column`, versioned.every((e) => !e.query_text));
  }
  ok(`${event} no secrets`, !versioned.some((e) => scanSecrets(JSON.stringify(e.metadata || {}))));
}

const { data: correlated } = await supabase
  .from("analytics_events")
  .select("metadata")
  .eq("event_name", "mia_offer_set")
  .eq("category", "offer_set")
  .gte("created_at", since)
  .limit(20);

const offerRequestIds = new Set((correlated || []).map((e) => e.metadata?.request_id).filter(Boolean));
let correlationHits = 0;
for (const rid of offerRequestIds) {
  const { data: cs } = await supabase
    .from("analytics_events")
    .select("id")
    .eq("event_name", "mia_commercial_search")
    .filter("metadata->>request_id", "eq", rid)
    .limit(1);
  if (cs?.length) correlationHits += 1;
}
ok("offer_set ↔ commercial_search correlation", correlationHits > 0, `hits=${correlationHits}/${offerRequestIds.size}`);

const sessionId = randomUUID();
const startedAt = new Date().toISOString();
const social = await fetch(`${BASE}/api/mia-chat`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    text: "Boa tarde, como você está?",
    conversation_id: randomUUID(),
    analytics_context: { session_id: sessionId, visitor_id: randomUUID() },
  }),
});
const socialJson = await social.json().catch(() => ({}));
ok("social HTTP 200", social.status === 200);
ok("social no commercial inline", !socialJson?.commercial_search_analytics?.commercial_search_event_version);
ok("social no offer inline", !socialJson?.offer_set_analytics?.offer_set_event_version);

await new Promise((r) => setTimeout(r, WAIT_MS));
const { data: socialEvents } = await supabase
  .from("analytics_events")
  .select("event_name")
  .eq("session_id", sessionId)
  .gte("created_at", startedAt)
  .in("event_name", ["mia_commercial_search", "mia_provider_attempt", "mia_offer_set"]);
ok("social no phase8 events", (socialEvents || []).length === 0, `count=${socialEvents?.length || 0}`);

const evidence = {
  patch: "8.4",
  date: new Date().toISOString().slice(0, 10),
  build: health.build,
  checks: {
    total: checks.length,
    passed: checks.filter((c) => c.pass).length,
    failed: checks.filter((c) => !c.pass).length,
  },
  correlation_sample: [...offerRequestIds].slice(0, 3).map(mask),
};

writeFileSync(
  join(ROOT, "docs/analytics/PHASE_8_PROD_AUDIT_RUN.json"),
  JSON.stringify(evidence, null, 2)
);
process.exit(checks.some((c) => !c.pass) ? 1 : 0);
