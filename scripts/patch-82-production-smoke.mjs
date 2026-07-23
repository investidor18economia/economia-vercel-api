#!/usr/bin/env node
/**
 * PATCH 8.2 — production smoke (provider attempt analytics).
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

const BASE = process.env.PATCH82_PROD_BASE_URL || process.env.PATCH81_PROD_BASE_URL || "https://economia-ai.vercel.app";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WAIT_MS = Number(process.env.PATCH82_PERSIST_WAIT_MS || 20000);

const VALID_ATTEMPT_STATUSES = new Set([
  "SUCCESS", "EMPTY", "FAILED", "TIMEOUT", "SKIPPED", "CANCELLED", "UNKNOWN",
]);
const VALID_RUNTIME_MODES = new Set(["LEGACY", "CONTROLLED", "SHADOW", "UNKNOWN"]);
const VALID_EXECUTION_PATHS = new Set([
  "LEGACY_CHAIN", "CONTROLLED_MULTI_PROVIDER", "SHADOW_ONLY", "UNKNOWN",
]);
const FORBIDDEN_META_KEYS = [
  "query", "query_text", "product_name", "offer_url", "offer_price", "html", "payload", "authorization", "cookie",
];

const checks = [];
const evidence = { patch: "8.2", scenarios: [], events: [] };

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

async function fetchProviderAttemptEvents(sessionId, sinceIso) {
  if (!supabaseUrl || !serviceKey) return [];
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from("analytics_events")
    .select("id,event_name,category,session_id,query_text,metadata,created_at")
    .eq("event_name", "mia_provider_attempt")
    .eq("session_id", sessionId)
    .gte("created_at", sinceIso)
    .not("category", "eq", "provider_attempt_test")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

async function fetchCommercialSearchEvents(sessionId, sinceIso) {
  if (!supabaseUrl || !serviceKey) return [];
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from("analytics_events")
    .select("id,event_name,metadata,created_at")
    .eq("event_name", "mia_commercial_search")
    .eq("session_id", sessionId)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

function sanitizeProviderEvent(event) {
  if (!event) return null;
  const m = event.metadata || {};
  return {
    id: event.id,
    created_at: event.created_at,
    query_text: event.query_text,
    metadata: {
      event_version: m.event_version,
      request_id: m.request_id,
      provider_id: m.provider_id,
      provider_family: m.provider_family,
      runtime_mode: m.runtime_mode,
      execution_path: m.execution_path,
      attempt_index: m.attempt_index,
      attempt_status: m.attempt_status,
      duration_ms: m.duration_ms,
      raw_results_count: m.raw_results_count,
      fallback_triggered: m.fallback_triggered,
      winner_provider: m.winner_provider,
      shadow_observed: m.shadow_observed,
    },
  };
}

function validateProviderEventContract(event) {
  const m = event.metadata || {};
  const issues = [];
  if (m.event_version !== "8.2.0") issues.push("bad_version");
  if (!m.provider_id) issues.push("missing_provider_id");
  if (!VALID_ATTEMPT_STATUSES.has(m.attempt_status)) issues.push("bad_attempt_status");
  if (m.runtime_mode && !VALID_RUNTIME_MODES.has(m.runtime_mode)) issues.push("bad_runtime_mode");
  if (m.execution_path && !VALID_EXECUTION_PATHS.has(m.execution_path)) issues.push("bad_execution_path");
  if (event.query_text != null && String(event.query_text).trim()) issues.push("query_text_leak");
  for (const key of FORBIDDEN_META_KEYS) {
    if (key in m && m[key] != null) issues.push(`forbidden_${key}`);
  }
  const blob = JSON.stringify(m).toLowerCase();
  if (/bearer\s+|sk-[a-z0-9]|api[_-]?key|secret=/.test(blob)) issues.push("secret_pattern");
  if (Number(m.duration_ms) < 0) issues.push("negative_duration");
  return issues;
}

console.log("\nPATCH 8.2 — production smoke\n");
console.log(`Base URL: ${BASE}`);

const health = await fetch(`${BASE}/api/health`);
const healthJson = await health.json().catch(() => ({}));
ok("production health", health.ok, `status=${health.status} build=${healthJson?.build || "unknown"}`);

const sessionId = randomUUID();
const visitorId = randomUUID();
const conversationId = randomUUID();
const startedAt = new Date().toISOString();

const scenarios = [
  { id: "A", text: "Quero um celular Samsung bom para jogos até 2500 reais", expectProvider: false, expectCommercial: true },
  { id: "G", text: "Boa tarde, como você está?", expectProvider: false, expectCommercial: false },
  {
    id: "B1",
    text: "aspirador robô xiaomi barato até 800 reais",
    expectProvider: true,
    expectCommercial: true,
  },
  {
    id: "B2",
    text: "liquidificador industrial inox 220v modelo raro xyz999",
    expectProvider: true,
    expectCommercial: true,
  },
  {
    id: "B3",
    text: "cadeira gamer ergonômica preta até 1200 reais",
    expectProvider: true,
    expectCommercial: true,
  },
];

for (const scenario of scenarios) {
  const { status, json } = await postChat({
    text: scenario.text,
    conversation_id: conversationId,
    analytics_context: { session_id: sessionId, visitor_id: visitorId },
  });
  ok(`scenario ${scenario.id} HTTP`, status === 200, `status=${status}`);
  ok(
    `scenario ${scenario.id} response preserved`,
    typeof json?.reply === "string" && json.reply.length > 0,
    `reply_len=${String(json?.reply || "").length}`
  );
  if (scenario.expectCommercial) {
    ok(
      `scenario ${scenario.id} commercial inline 8.1`,
      json?.commercial_search_analytics?.commercial_search_event_version === "8.1.0",
      JSON.stringify(json?.commercial_search_analytics || {})
    );
  } else {
    ok(
      `scenario ${scenario.id} no commercial inline`,
      !json?.commercial_search_analytics?.commercial_search_event_version,
      "ok"
    );
  }
  evidence.scenarios.push({
    id: scenario.id,
    text: scenario.text,
    status,
    provider_attempt_analytics: json?.provider_attempt_analytics || null,
    commercial_search_analytics: json?.commercial_search_analytics || null,
    products_count: Array.isArray(json?.prices) ? json.prices.length : 0,
  });
  await new Promise((r) => setTimeout(r, 2500));
}

console.log(`\nWaiting ${WAIT_MS}ms for fire-and-forget persistence...`);
await new Promise((r) => setTimeout(r, WAIT_MS));

const providerEvents = await fetchProviderAttemptEvents(sessionId, startedAt);
const commercialEvents = await fetchCommercialSearchEvents(sessionId, startedAt);

ok("social G no provider events", !providerEvents.some((e) => {
  const cs = commercialEvents.find((c) => c.metadata?.request_id === e.metadata?.request_id);
  return !cs;
}));

for (const event of providerEvents) {
  const issues = validateProviderEventContract(event);
  ok(`contract ${event.metadata?.provider_id || "?"}`, issues.length === 0, issues.join(",") || "ok");
}

const dedupKeys = providerEvents.map(
  (e) => `${e.metadata?.request_id}|${e.metadata?.provider_id}|${e.metadata?.attempt_index}|8.2.0`
);
ok("no illegitimate dedup", dedupKeys.length === new Set(dedupKeys).size, `count=${providerEvents.length}`);

ok("at least one provider attempt in prod sample", providerEvents.length >= 1, `count=${providerEvents.length}`);

evidence.events = providerEvents.map(sanitizeProviderEvent);
evidence.commercial_events = commercialEvents.map((e) => ({
  request_id: e.metadata?.request_id,
  provider_continuation_required: e.metadata?.provider_continuation_required,
  search_path: e.metadata?.search_path,
}));
evidence.health = { ok: health.ok, build: healthJson?.build || null };
evidence.summary = {
  total_checks: checks.length,
  passed: checks.filter((c) => c.pass).length,
  failed: checks.filter((c) => !c.pass).length,
  provider_events: providerEvents.length,
};

const outPath = join(ROOT, "docs/analytics/PATCH_8_2_PRODUCTION_EVIDENCE.json");
writeFileSync(outPath, JSON.stringify(evidence, null, 2));
console.log(`\nEvidence written: ${outPath}`);

const failed = checks.filter((c) => !c.pass).length;
process.exit(failed === 0 ? 0 : 1);
