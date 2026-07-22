#!/usr/bin/env node
/**
 * PATCH 3.3A.2 — Post-OTP operational validation via Supabase (no secrets/PII logged).
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const WINDOW_MINUTES = Number(process.env.PATCH33A2_WINDOW_MINUTES || 30);

function loadEnv() {
  const envFile = join(ROOT, ".env.local");
  if (!existsSync(envFile)) throw new Error(".env.local missing");
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
}

function maskUuid(value) {
  if (!value) return "(null)";
  const v = String(value);
  return `${v.slice(0, 4)}****${v.slice(-4)}`;
}

function maskEmail(value) {
  if (!value) return "(null)";
  const v = String(value);
  const [local, domain] = v.split("@");
  if (!domain) return "(masked)";
  return `${local.slice(0, 2)}****@${domain}`;
}

loadEnv();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();
const checks = [];
function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
}

console.log(`\nPATCH 3.3A.2 — post-OTP Supabase validation (since ${since})\n`);

const { data: challenges, error: chErr } = await supabase
  .from("mia_auth_challenges")
  .select(
    "id, email_normalized, delivery_sent_at, consumed_at, attempt_count, created_at, expires_at"
  )
  .gte("created_at", since)
  .order("created_at", { ascending: false })
  .limit(10);

ok("challenges query", !chErr, chErr?.message || `rows=${challenges?.length ?? 0}`);

const delivered = (challenges || []).filter((c) => c.delivery_sent_at);
const consumed = (challenges || []).filter((c) => c.consumed_at);
const latestConsumed = consumed[0] || null;

ok("recent challenge delivered", delivered.length >= 1, `count=${delivered.length}`);
ok("recent challenge consumed", consumed.length >= 1, `count=${consumed.length}`);

if (latestConsumed) {
  ok("consumed has delivery_sent_at", Boolean(latestConsumed.delivery_sent_at));
  ok("attempt_count within bounds", (latestConsumed.attempt_count ?? 0) >= 1);
  ok("single consume timestamp", Boolean(latestConsumed.consumed_at));

  const { data: tokenRow } = await supabase
    .from("mia_auth_challenges")
    .select("token_hash")
    .eq("id", latestConsumed.id)
    .maybeSingle();
  ok("challenge stores hash only", Boolean(tokenRow?.token_hash) && !String(tokenRow.token_hash).match(/^\d{6}$/));

  const emailNorm = latestConsumed.email_normalized;
  const { data: users } = await supabase
    .from("users")
    .select("id, email_normalized, email_verified_at, created_at")
    .eq("email_normalized", emailNorm)
    .limit(5);

  ok("user exists for consumed challenge", (users?.length ?? 0) >= 1);
  const user = users?.[0];
  if (user) {
    ok("email_verified_at set", Boolean(user.email_verified_at));
    ok("email_normalized matches challenge", user.email_normalized === emailNorm);

    const { count: dupCount } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("email_normalized", emailNorm);
    ok("no duplicate users for email_normalized", (dupCount ?? 0) === 1);

    const { data: analytics } = await supabase
      .from("analytics_events")
      .select("id, event_name, visitor_id, session_id, conversation_id, user_id, created_at")
      .eq("user_id", user.id)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20);

    ok("authenticated analytics events exist", (analytics?.length ?? 0) >= 1, `count=${analytics?.length ?? 0}`);

    const spoofProbe = (analytics || []).find(
      (row) =>
        row.metadata &&
        typeof row.metadata === "object" &&
        row.metadata.spoof_probe === true
    );

    const { data: rateRows } = await supabase
      .from("mia_auth_rate_limits")
      .select("scope, key_hash, request_count, window_start, updated_at")
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(10);

    ok("rate limit rows updated recently", (rateRows?.length ?? 0) >= 1, `count=${rateRows?.length ?? 0}`);
    for (const row of rateRows || []) {
      ok(`rate scope ${row.scope} uses key_hash`, Boolean(row.key_hash));
    }

    console.log("\nMasked summary:");
    console.log(
      JSON.stringify(
        {
          user_id: maskUuid(user.id),
          email: maskEmail(emailNorm),
          challenge_id: maskUuid(latestConsumed.id),
          consumed_at: latestConsumed.consumed_at,
          analytics_authenticated_events: (analytics || []).length,
          latest_events: (analytics || []).slice(0, 5).map((row) => ({
            event_name: row.event_name,
            visitor_id: maskUuid(row.visitor_id),
            session_id: maskUuid(row.session_id),
            conversation_id: maskUuid(row.conversation_id),
            user_id: maskUuid(row.user_id),
          })),
          spoof_probe_seen: Boolean(spoofProbe),
        },
        null,
        2
      )
    );
  }
}

const failed = checks.filter((c) => !c.pass).length;
console.log(`\nSummary: ${checks.length - failed}/${checks.length}`);
process.exit(failed > 0 ? 1 : 0);
