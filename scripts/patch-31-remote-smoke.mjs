#!/usr/bin/env node
/**
 * PATCH 3.1 — remote smoke test for /api/analytics/track (no secrets logged).
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

const baseUrl = process.env.PATCH31_SMOKE_BASE_URL || "http://localhost:3000";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const QA_VISITOR = "11111111-2222-4333-8444-555555555555";
const QA_SESSION = "patch31-smoke-session";
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
  console.log("\nPATCH 3.1 — remote smoke test\n");
  console.log(`Base URL: ${baseUrl}`);

  // 1 legacy payload without visitor_id
  {
    const r = await postTrack({
      event_name: "session_started",
      session_id: `${QA_SESSION}-legacy`,
      metadata: {
        page: "/patch-31-smoke",
        user_agent: "patch31-smoke-agent",
        qa: true,
        patch: "3.1",
      },
    });
    tests.push(["legacy payload without visitor_id", r.status === 200, r.status]);
  }

  // 2 valid visitor_id
  {
    const r = await postTrack({
      event_name: "session_started",
      visitor_id: QA_VISITOR,
      session_id: `${QA_SESSION}-valid`,
      metadata: {
        page: "/patch-31-smoke",
        user_agent: "patch31-smoke-agent",
        qa: true,
        patch: "3.1",
        case: "valid_visitor",
      },
    });
    tests.push(["valid visitor_id accepted", r.status === 200, r.status]);
  }

  // 3 invalid visitor_id normalized to null (still 200)
  {
    const r = await postTrack({
      event_name: "session_started",
      visitor_id: QA_INVALID,
      session_id: `${QA_SESSION}-invalid`,
      metadata: {
        page: "/patch-31-smoke",
        user_agent: "patch31-smoke-agent",
        qa: true,
        patch: "3.1",
        case: "invalid_visitor",
      },
    });
    tests.push(["invalid visitor_id request accepted", r.status === 200, r.status]);
  }

  // 4 disallowed event
  {
    const r = await postTrack({
      event_name: "price_drop_email_sent",
      visitor_id: QA_VISITOR,
      session_id: `${QA_SESSION}-blocked`,
      metadata: { qa: true },
    });
    tests.push(["disallowed event rejected", r.status === 400, r.status]);
  }

  if (supabaseUrl && serviceKey) {
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { data: validRow } = await supabase
      .from("analytics_events")
      .select("visitor_id, session_id, event_name")
      .eq("session_id", `${QA_SESSION}-valid`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    tests.push([
      "valid row persisted with visitor_id",
      validRow?.visitor_id === QA_VISITOR,
      maskUuid(validRow?.visitor_id),
    ]);

    const { data: invalidRow } = await supabase
      .from("analytics_events")
      .select("visitor_id, session_id")
      .eq("session_id", `${QA_SESSION}-invalid`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    tests.push([
      "invalid visitor_id stored as null",
      invalidRow?.visitor_id == null,
      maskUuid(invalidRow?.visitor_id),
    ]);

    const { data: legacyRow } = await supabase
      .from("analytics_events")
      .select("visitor_id, session_id")
      .eq("session_id", `${QA_SESSION}-legacy`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    tests.push([
      "legacy payload visitor_id null",
      legacyRow?.visitor_id == null,
      maskUuid(legacyRow?.visitor_id),
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
