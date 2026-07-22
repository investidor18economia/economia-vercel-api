#!/usr/bin/env node
/**
 * PATCH 3.2 — remote smoke test for conversation_id on /api/analytics/track.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function loadEnv() {
  const envFile = join(ROOT, ".env.local");
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, "utf8").split("\n")) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match && !process.env[match[1].trim()]) {
        process.env[match[1].trim()] = match[2].trim();
      }
    }
  }
}

function maskUuid(value) {
  if (!value || typeof value !== "string") return "(null)";
  const v = value.trim();
  if (v.length < 12) return "(masked)";
  return `${v.slice(0, 4)}****-****-****-****-********${v.slice(-4)}`;
}

loadEnv();

const baseUrl = process.env.PATCH32_SMOKE_BASE_URL || "http://localhost:3000";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const QA_VISITOR = "11111111-2222-4333-8444-555555555555";
const QA_CONVERSATION = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const QA_SESSION = "patch32-smoke-session";
const QA_INVALID = "not-a-valid-uuid";

const tests = [];

async function postTrack(body) {
  const res = await fetch(`${baseUrl}/api/analytics/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function run() {
  console.log("\nPATCH 3.2 — remote smoke test\n");
  console.log(`Base URL: ${baseUrl}`);

  {
    const r = await postTrack({
      event_name: "session_started",
      visitor_id: QA_VISITOR,
      session_id: `${QA_SESSION}-legacy`,
      metadata: { page: "/patch-32-smoke", user_agent: "patch32-smoke-agent", qa: true, patch: "3.2" },
    });
    tests.push(["legacy payload without conversation_id", r.status === 200, r.status]);
  }

  {
    const r = await postTrack({
      event_name: "mia_question_sent",
      visitor_id: QA_VISITOR,
      session_id: `${QA_SESSION}-valid`,
      conversation_id: QA_CONVERSATION,
      query_text: "patch32 smoke question",
      metadata: { qa: true, patch: "3.2", case: "valid_conversation" },
    });
    tests.push(["valid conversation_id accepted", r.status === 200, r.status]);
  }

  {
    const r = await postTrack({
      event_name: "mia_question_sent",
      visitor_id: QA_VISITOR,
      session_id: `${QA_SESSION}-invalid`,
      conversation_id: QA_INVALID,
      query_text: "patch32 invalid conversation",
      metadata: { qa: true, patch: "3.2", case: "invalid_conversation" },
    });
    tests.push(["invalid conversation_id request accepted", r.status === 200, r.status]);
  }

  {
    const r = await postTrack({
      event_name: "price_drop_email_sent",
      visitor_id: QA_VISITOR,
      conversation_id: QA_CONVERSATION,
      session_id: `${QA_SESSION}-blocked`,
      metadata: { qa: true },
    });
    tests.push(["disallowed event rejected", r.status === 400, r.status]);
  }

  if (supabaseUrl && serviceKey) {
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: legacyRow } = await supabase
      .from("analytics_events")
      .select("conversation_id, session_id")
      .eq("session_id", `${QA_SESSION}-legacy`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    tests.push([
      "legacy session_started conversation_id null",
      legacyRow?.conversation_id == null,
      maskUuid(legacyRow?.conversation_id),
    ]);

    const { data: validRow } = await supabase
      .from("analytics_events")
      .select("conversation_id, session_id")
      .eq("session_id", `${QA_SESSION}-valid`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    tests.push([
      "valid conversation_id persisted",
      validRow?.conversation_id === QA_CONVERSATION,
      maskUuid(validRow?.conversation_id),
    ]);

    const { data: invalidRow } = await supabase
      .from("analytics_events")
      .select("conversation_id, session_id")
      .eq("session_id", `${QA_SESSION}-invalid`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    tests.push([
      "invalid conversation_id stored as null",
      invalidRow?.conversation_id == null,
      maskUuid(invalidRow?.conversation_id),
    ]);
  } else {
    console.log("  ℹ️  Skipping DB verification (Supabase env not loaded)");
  }

  let passed = 0;
  let failed = 0;
  for (const [label, ok, detail] of tests) {
    if (ok) {
      passed += 1;
      console.log(`  ✅ ${label}${detail != null ? ` (${detail})` : ""}`);
    } else {
      failed += 1;
      console.error(`  ❌ ${label}${detail != null ? ` (${detail})` : ""}`);
    }
  }

  console.log(`\nResultado: ${passed}/${passed + failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
