#!/usr/bin/env node
/**
 * PATCH 10.3 — production smoke (price alert lifecycle).
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { issueUserSessionToken } from "../lib/miaUserSessionToken.js";
import { obtainProductionSession } from "./patch-103-production-auth.mjs";

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

const BASE = process.env.PATCH103_PROD_BASE_URL || "https://economia-ai.vercel.app";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WAIT_MS = Number(process.env.PATCH103_PERSIST_WAIT_MS || 45000);
const POLL_MS = Number(process.env.PATCH103_POLL_MS || 5000);

const checks = [];

function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
}

async function fetchLifecycleEvents(alertId, userId, sinceIso) {
  if (!supabaseUrl || !serviceKey) return [];
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from("analytics_events")
    .select("id,event_name,category,user_id,metadata,created_at")
    .eq("event_name", "mia_price_alert_lifecycle")
    .eq("user_id", userId)
    .gte("created_at", sinceIso)
    .not("category", "eq", "price_alert_lifecycle_test")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).filter(
    (e) =>
      e.metadata?.lifecycle_stage === "REQUESTED" ||
      e.metadata?.alert_id === alertId
  );
}

console.log("\nPATCH 10.3 — production smoke\n");

const health = await fetch(`${BASE}/api/health`);
const healthJson = await health.json().catch(() => ({}));
ok("health 200", health.ok, `build=${healthJson.build}`);

const startedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
const auth = await obtainProductionSession();
const testUserId = auth.userId;
const sessionToken = auth.sessionToken;
ok("production session obtained", !!sessionToken, auth.source || "unknown");

const productSuffix = Date.now();
const createBody = {
  user_id: testUserId,
  user_email: process.env.PATCH103_TEST_USER_EMAIL || auth.email || `patch103+${productSuffix}@example.com`,
  product_name: `PATCH103 smoke product ${productSuffix}`,
  product_url: "https://www.amazon.com.br/dp/B0SMOKE103",
  current_price: 999.99,
  target_price: 899.99,
  source: "patch103_smoke",
};

const createRes = await fetch(`${BASE}/api/create-price-alert`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${sessionToken}`,
  },
  body: JSON.stringify(createBody),
});
const createJson = await createRes.json().catch(() => ({}));
ok("create HTTP 200", createRes.status === 200, `status=${createRes.status}`);
const alertRow = Array.isArray(createJson?.data) ? createJson.data[0] : createJson?.data?.[0];
const alertId = alertRow?.id || null;
ok("alert persisted with id", !!alertId, alertId || "missing");

console.log(`\nPolling lifecycle events up to ${WAIT_MS}ms for alert ${alertId}...`);
let lifecycle = [];
const deadline = Date.now() + WAIT_MS;
while (Date.now() < deadline) {
  if (alertId) lifecycle = await fetchLifecycleEvents(alertId, testUserId, startedAt);
  const stages = new Set(lifecycle.map((e) => e.metadata?.lifecycle_stage));
  if (stages.has("REQUESTED") && stages.has("CREATED") && stages.has("ACTIVE")) break;
  await new Promise((r) => setTimeout(r, POLL_MS));
}

ok("lifecycle events persisted", lifecycle.length >= 3, `count=${lifecycle.length}`);
const stages = [...new Set(lifecycle.map((e) => e.metadata?.lifecycle_stage))];
ok("REQUESTED stage", stages.includes("REQUESTED"));
ok("CREATED stage", stages.includes("CREATED"));
ok("ACTIVE stage", stages.includes("ACTIVE"));

const sample = lifecycle.find((e) => e.metadata?.lifecycle_stage === "CREATED")?.metadata || {};
ok("event_version 10.3.0", sample.event_version === "10.3.0");
ok("alert_id correlation", sample.alert_id === alertId);
ok("purchase_confirmed false", lifecycle.every((e) => e.metadata?.purchase_confirmed === false));
ok("no VERIFIED savings", !JSON.stringify(lifecycle).includes('"VERIFIED"'));

const blob = JSON.stringify(lifecycle.map((e) => e.metadata || {}));
ok("privacy scan", !/product_name|https:\/\/|user_email|@/.test(blob));

const evidence = {
  patch: "10.3",
  health: { ok: health.ok, build: healthJson.build },
  test_user_id: testUserId,
  alert_id: alertId,
  lifecycle_count: lifecycle.length,
  stages,
  checks: {
    total: checks.length,
    passed: checks.filter((c) => c.pass).length,
    failed: checks.filter((c) => !c.pass).length,
  },
};

writeFileSync(
  join(ROOT, "docs/analytics/PATCH_10_3_PRICE_ALERT_LIFECYCLE_EVIDENCE.json"),
  JSON.stringify(evidence, null, 2)
);
process.exit(checks.some((c) => !c.pass) ? 1 : 0);
