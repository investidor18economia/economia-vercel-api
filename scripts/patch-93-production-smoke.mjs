#!/usr/bin/env node
/**
 * PATCH 9.3 — production smoke (rejection signal analytics).
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
  process.env.PATCH93_PROD_BASE_URL ||
  process.env.PATCH92_PROD_BASE_URL ||
  "https://economia-ai.vercel.app";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WAIT_MS = Number(process.env.PATCH93_PERSIST_WAIT_MS || 28000);

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

async function fetchRejectionSignals(sessionId, sinceIso) {
  if (!supabaseUrl || !serviceKey) return [];
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from("analytics_events")
    .select("id,event_name,category,session_id,metadata,created_at")
    .eq("event_name", "mia_recommendation_rejection_signal")
    .eq("session_id", sessionId)
    .gte("created_at", sinceIso)
    .not("category", "eq", "recommendation_rejection_signal_test")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

console.log("\nPATCH 9.3 — production smoke\n");

const health = await fetch(`${BASE}/api/health`);
const healthJson = await health.json().catch(() => ({}));
ok("health 200", health.ok, `build=${healthJson.build}`);

const sessionId = randomUUID();
const visitorId = randomUUID();
const conversationId = randomUUID();
const startedAt = new Date().toISOString();

const initial = await postChat({
  text: "Quero um celular Samsung bom para jogos até 2500 reais",
  conversation_id: conversationId,
  analytics_context: { session_id: sessionId, visitor_id: visitorId },
});
ok("commercial HTTP 200", initial.status === 200);
ok("decision 9.1", initial.json?.recommendation_decision_analytics?.recommendation_decision_event_version === "9.1.0");

const decisionRequestId = initial.json?.request_id;
const sessionContext = initial.json?.session_context || {};

if (decisionRequestId) {
  const reject = await postChat({
    text: "Não gostei desse, está caro demais",
    conversation_id: conversationId,
    analytics_context: { session_id: sessionId, visitor_id: visitorId },
    session_context: {
      ...sessionContext,
      lastRecommendationDecisionRequestId: decisionRequestId,
      lastRecommendationDecisionAtMs: Date.now() - 5000,
      lastRecommendationDecisionSource:
        initial.json?.recommendation_decision_analytics?.recommendation_decision_source,
      lastRecommendationDecisionWinnerFamily:
        initial.json?.recommendation_decision_analytics?.recommendation_decision_winner_product_family,
    },
    messages: [
      { role: "user", content: "Quero um celular Samsung bom para jogos até 2500 reais" },
      { role: "assistant", content: initial.json?.reply || "Recomendação entregue." },
    ],
  });
  ok("rejection turn HTTP 200", reject.status === 200);

  const refine = await postChat({
    text: "Quero até 2000 reais agora",
    conversation_id: conversationId,
    analytics_context: { session_id: sessionId, visitor_id: visitorId },
    session_context: {
      ...reject.json?.session_context,
      lastRecommendationDecisionRequestId: decisionRequestId,
      lastRecommendationDecisionAtMs: Date.now() - 3000,
    },
    messages: [
      { role: "user", content: "Quero um celular Samsung bom para jogos até 2500 reais" },
      { role: "assistant", content: initial.json?.reply || "Recomendação entregue." },
      { role: "user", content: "Não gostei desse, está caro demais" },
      { role: "assistant", content: reject.json?.reply || "Entendi." },
    ],
  });
  ok("refinement turn HTTP 200", refine.status === 200);

  const alt = await postChat({
    text: "Tem outra opção?",
    conversation_id: conversationId,
    analytics_context: { session_id: sessionId, visitor_id: visitorId },
    session_context: {
      ...refine.json?.session_context,
      lastRecommendationDecisionRequestId: decisionRequestId,
    },
    messages: [
      { role: "user", content: "Quero um celular Samsung bom para jogos até 2500 reais" },
      { role: "assistant", content: initial.json?.reply || "Recomendação entregue." },
      { role: "user", content: "Tem outra opção?" },
    ],
  });
  ok("alternative turn HTTP 200", alt.status === 200);
}

const social = await postChat({
  text: "Boa tarde, como você está?",
  conversation_id: conversationId,
  analytics_context: { session_id: sessionId, visitor_id: visitorId },
});
ok("social HTTP 200", social.status === 200);

console.log(`\nWaiting ${WAIT_MS}ms...`);
await new Promise((r) => setTimeout(r, WAIT_MS));

const events = await fetchRejectionSignals(sessionId, startedAt);
ok("rejection signals persisted", events.length >= 1, `count=${events.length}`);
ok("version 9.3.0", events.every((e) => e.metadata?.event_version === "9.3.0"));
ok("correlation HIGH when valid", events.filter((e) => e.metadata?.signal_valid).every((e) => e.metadata?.correlation_confidence === "HIGH"));
ok(
  "has rejection or refinement",
  events.some((e) =>
    ["REJECTION", "REFINEMENT", "SUBSTITUTION"].includes(e.metadata?.signal_class)
  )
);
ok(
  "refinement distinct from rejection",
  !events.some(
    (e) =>
      e.metadata?.signal_class === "REFINEMENT" && e.metadata?.rejection_explicit === true
  )
);
ok("no silence abandonment", !events.some((e) => e.metadata?.signal_type === "SESSION_ABANDONED_OBSERVED"));
ok("unique source events", new Set(events.map((e) => e.metadata?.source_event_id)).size === events.length);

for (const e of events) {
  const blob = JSON.stringify(e.metadata || {}).toLowerCase();
  ok(`privacy ${e.metadata?.signal_type}`, !/bearer |product_name|https:\/\//.test(blob));
}

const evidence = {
  patch: "9.3",
  health: { ok: health.ok, build: healthJson.build },
  decision_request_id: decisionRequestId,
  abandonment_definition: "explicit declaration or flow exit only — no silence-based abandonment",
  events: events.map((e) => ({
    signal_type: e.metadata?.signal_type,
    signal_class: e.metadata?.signal_class,
    evidence_strength: e.metadata?.evidence_strength,
    signal_target: e.metadata?.signal_target,
    signal_reason: e.metadata?.signal_reason,
    correlation_method: e.metadata?.correlation_method,
    correlation_confidence: e.metadata?.correlation_confidence,
    signal_outcome: e.metadata?.signal_outcome,
    signal_valid: e.metadata?.signal_valid,
    decision_request_id: e.metadata?.decision_request_id,
  })),
  checks: {
    total: checks.length,
    passed: checks.filter((c) => c.pass).length,
    failed: checks.filter((c) => !c.pass).length,
  },
};

writeFileSync(join(ROOT, "docs/analytics/PATCH_9_3_PRODUCTION_EVIDENCE.json"), JSON.stringify(evidence, null, 2));
process.exit(checks.some((c) => !c.pass) ? 1 : 0);
