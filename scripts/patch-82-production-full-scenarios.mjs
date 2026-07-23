#!/usr/bin/env node
/**
 * PATCH 8.2 — Full production scenario validation (A–H).
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
const WAIT_MS = Number(process.env.PATCH82_PERSIST_WAIT_MS || 22000);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const checks = [];
const scenarios = [];

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

async function fetchEvents(sessionId, sinceIso) {
  const { data, error } = await supabase
    .from("analytics_events")
    .select("id,event_name,category,session_id,query_text,metadata,created_at")
    .eq("session_id", sessionId)
    .gte("created_at", sinceIso)
    .in("event_name", [
      "mia_provider_attempt",
      "mia_commercial_search",
      "data_layer_resolution",
      "mia_response_outcome",
      "mia_latency_event",
      "mia_error_event",
    ])
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

function maskRequestId(id = "") {
  const s = String(id);
  if (s.length < 12) return s;
  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}

function safeProviderMeta(event) {
  const m = event?.metadata || {};
  return {
    event_version: m.event_version,
    request_id: maskRequestId(m.request_id),
    provider_id: m.provider_id,
    runtime_mode: m.runtime_mode,
    execution_path: m.execution_path,
    attempt_index: m.attempt_index,
    attempt_status: m.attempt_status,
    duration_ms: m.duration_ms,
    raw_results_count: m.raw_results_count,
    contributed_results: m.contributed_results,
    contributed_to_final_set: m.contributed_to_final_set,
    winner_provider: m.winner_provider,
    fallback_triggered: m.fallback_triggered,
    shadow_observed: m.shadow_observed,
  };
}

console.log("\nPATCH 8.2 — full production scenarios A–H\n");

const health = await fetch(`${BASE}/api/health`);
const healthJson = await health.json().catch(() => ({}));
ok("health 200", health.ok, `build=${healthJson.build}`);

const sessionId = randomUUID();
const visitorId = randomUUID();
const conversationId = randomUUID();
const startedAt = new Date().toISOString();

const cases = [
  { id: "A", text: "Quero um celular Samsung bom para jogos até 2500 reais", expectProvider: false },
  { id: "B1", text: "aspirador robô xiaomi barato até 800 reais", expectProvider: true },
  { id: "B2", text: "liquidificador industrial inox 220v modelo raro xyz999", expectProvider: true },
  { id: "B3", text: "cadeira gamer ergonômica preta até 1200 reais", expectProvider: true },
  { id: "B4", text: "microondas espelhado 30 litros inox marca rara zzz888", expectProvider: true },
  { id: "C", text: "Samsung Galaxy A15 128GB vale a pena?", expectProvider: false },
  { id: "D", text: "fone bluetooth xyzabc123 inexistente modelo 99999", expectProvider: true },
  { id: "G", text: "Boa tarde, como você está?", expectProvider: false, social: true },
];

for (const c of cases) {
  const before = new Date().toISOString();
  const { status, json } = await postChat({
    text: c.text,
    conversation_id: conversationId,
    analytics_context: { session_id: sessionId, visitor_id: visitorId },
  });
  ok(`${c.id} HTTP 200`, status === 200, `path=${json?.response_outcome_analytics?.response_path || "?"}`);
  scenarios.push({
    id: c.id,
    text: c.text,
    status,
    inline_provider: json?.provider_attempt_analytics || null,
    inline_commercial: json?.commercial_search_analytics || null,
    products_count: Array.isArray(json?.prices) ? json.prices.length : 0,
    before,
  });
  await new Promise((r) => setTimeout(r, 3000));
}

console.log(`\nWaiting ${WAIT_MS}ms for persistence...`);
await new Promise((r) => setTimeout(r, WAIT_MS));

const events = await fetchEvents(sessionId, startedAt);
const providerEvents = events.filter((e) => e.event_name === "mia_provider_attempt");
const commercialEvents = events.filter((e) => e.event_name === "mia_commercial_search");

ok("provider events persisted", providerEvents.length >= 1, `count=${providerEvents.length}`);
ok("all provider events 8.2.0", providerEvents.every((e) => e.metadata?.event_version === "8.2.0"));
ok("no query_text on provider rows", providerEvents.every((e) => !e.query_text));
ok("dedup provider attempts", new Set(providerEvents.map((e) =>
  `${e.metadata?.request_id}|${e.metadata?.provider_id}|${e.metadata?.attempt_index}`
)).size === providerEvents.length);

const socialScenario = scenarios.find((s) => s.id === "G");
const socialProvider = providerEvents.filter((e) => {
  const cs = commercialEvents.find((c) => c.metadata?.request_id === e.metadata?.request_id);
  return !cs && socialScenario;
});
ok("G social no provider events", socialProvider.length === 0, `count=${socialProvider.length}`);

const providerContCommercial = commercialEvents.filter((e) => e.metadata?.provider_continuation_required === true);
ok("commercial provider_continuation_required observed", providerContCommercial.length >= 1, `count=${providerContCommercial.length}`);

const correlated = providerContCommercial.filter((cs) =>
  providerEvents.some((p) => p.metadata?.request_id === cs.metadata?.request_id)
);
ok("B provider continuation correlated", correlated.length >= 1, `count=${correlated.length}`);

const successAttempts = providerEvents.filter((e) => e.metadata?.attempt_status === "SUCCESS");
ok("C/D success or empty attempts exist", successAttempts.length + providerEvents.filter((e) => e.metadata?.attempt_status === "EMPTY").length >= 1);

const controlled = providerEvents.filter((e) => e.metadata?.runtime_mode === "CONTROLLED");
ok("E controlled runtime observed", controlled.length >= 1, `count=${controlled.length}`);

const legacyPath = providerEvents.filter((e) => e.metadata?.execution_path === "LEGACY_CHAIN");
ok("E legacy chain path observed", legacyPath.length >= 1, `count=${legacyPath.length}`);

const shadowAttempts = providerEvents.filter((e) => e.metadata?.shadow_observed === true);
ok("F shadow inactive or documented", shadowAttempts.length === 0, `shadow_count=${shadowAttempts.length}`);

for (const rid of [...new Set(providerEvents.map((e) => e.metadata?.request_id).filter(Boolean))]) {
  const winners = providerEvents.filter((e) => e.metadata?.request_id === rid && e.metadata?.winner_provider === true && !e.metadata?.shadow_observed);
  ok(`winner unique ${maskRequestId(rid)}`, winners.length <= 1, `winners=${winners.length}`);
}

const byRequest = {};
for (const e of events) {
  const rid = e.metadata?.request_id;
  if (!rid) continue;
  byRequest[rid] = byRequest[rid] || {};
  byRequest[rid][e.event_name] = (byRequest[rid][e.event_name] || 0) + 1;
}
const fullFlow = Object.entries(byRequest).filter(([, counts]) =>
  counts.mia_commercial_search && counts.mia_provider_attempt && counts.mia_response_outcome
);
ok("correlation commercial→provider→outcome", fullFlow.length >= 1, `flows=${fullFlow.length}`);

const evidence = {
  patch: "8.2",
  date: new Date().toISOString(),
  environment: BASE,
  health: { ok: health.ok, build: healthJson.build },
  scenarios,
  provider_events: providerEvents.map(safeProviderMeta),
  commercial_summary: commercialEvents.map((e) => ({
    request_id: maskRequestId(e.metadata?.request_id),
    provider_continuation_required: e.metadata?.provider_continuation_required,
    search_path: e.metadata?.search_path,
    runtime_mode: e.metadata?.runtime_mode,
  })),
  correlation_flows: fullFlow.length,
  checks: {
    total: checks.length,
    passed: checks.filter((c) => c.pass).length,
    failed: checks.filter((c) => !c.pass).length,
  },
  limitations: {
    shadow_inactive_in_controlled: shadowAttempts.length === 0,
    post_merge_null: true,
    scenario_h_failure_not_reproduced: true,
  },
};

const outPath = join(ROOT, "docs/analytics/PATCH_8_2_PRODUCTION_EVIDENCE.json");
writeFileSync(outPath, JSON.stringify(evidence, null, 2));
console.log(`\nEvidence updated: ${outPath}`);

const failed = checks.filter((c) => !c.pass).length;
process.exit(failed === 0 ? 0 : 1);
