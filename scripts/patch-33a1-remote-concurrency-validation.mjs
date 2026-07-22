#!/usr/bin/env node
/**
 * PATCH 3.3A.1 — Remote Postgres concurrency validation (service_role only).
 * Uses isolated test key hashes; does not log secrets, OTPs, tokens, or full emails.
 */
import crypto from "crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { buildAuthChallengeExpiry } from "../lib/miaAuthChallengeCrypto.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const RUN_ID = Date.now().toString(36);

function loadEnv() {
  const envFile = join(ROOT, ".env.local");
  if (!existsSync(envFile)) return;
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
}

function testEmail(suffix) {
  return `patch-33a1-${RUN_ID}-${suffix}@test.invalid`;
}

function testKeyHash(label) {
  return crypto.createHash("sha256").update(`patch-33a1:${RUN_ID}:${label}`).digest("hex").slice(0, 64);
}

async function cleanup(supabase, emails = []) {
  for (const email of emails) {
    await supabase.from("mia_auth_challenges").delete().eq("email_normalized", email);
  }
}

async function requestChallengeRpc(supabase, { email, emailKey, originKey, challengeId, tokenHash }) {
  const { data, error } = await supabase.rpc("mia_auth_request_challenge", {
    p_email_normalized: email,
    p_email_key_hash: emailKey,
    p_origin_key_hash: originKey,
    p_challenge_id: challengeId,
    p_token_hash: tokenHash,
    p_pending_name: "Patch 33A1 Concurrency",
    p_expires_at: buildAuthChallengeExpiry(),
    p_window_seconds: 900,
    p_max_per_email: 3,
    p_max_per_origin: 12,
  });
  if (error) throw error;
  return data;
}

async function insertDeliveredChallenge(supabase, { email, challengeId, tokenHash, maxAttempts = 5 }) {
  const { error } = await supabase.from("mia_auth_challenges").insert([
    {
      id: challengeId,
      email_normalized: email,
      token_hash: tokenHash,
      purpose: "login_otp",
      expires_at: buildAuthChallengeExpiry(),
      attempt_count: 0,
      max_attempts: maxAttempts,
      delivery_sent_at: new Date().toISOString(),
    },
  ]);
  if (error) throw error;
}

async function verifyChallenge(supabase, challengeId, codeHash) {
  const { data, error } = await supabase.rpc("mia_auth_verify_challenge", {
    p_challenge_id: challengeId,
    p_code_hash: codeHash,
  });
  if (error) throw error;
  return data;
}

const results = [];

function record(scenario, requests, successes, blocked, ok, detail = "") {
  results.push({ scenario, requests, successes, blocked, ok, detail });
  const icon = ok ? "PASS" : "FAIL";
  console.log(
    `[${icon}] ${scenario} — requests=${requests} success=${successes} blocked=${blocked}${detail ? ` — ${detail}` : ""}`
  );
}

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing Supabase admin configuration (.env.local)");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const trackedEmails = [];

try {
  console.log("\nPATCH 3.3A.1 — remote Postgres concurrency validation\n");

  // Scenario A — parallel email requests
  {
    const email = testEmail("email-a");
    trackedEmails.push(email);
    const emailKey = testKeyHash("email-a");
    const originKey = testKeyHash("origin-a");
    const parallel = 10;
    const responses = await Promise.all(
      Array.from({ length: parallel }, () => {
        const challengeId = crypto.randomUUID();
        return requestChallengeRpc(supabase, {
          email,
          emailKey,
          originKey,
          challengeId,
          tokenHash: testKeyHash(`token-a-${challengeId}`),
        });
      })
    );
    const allowed = responses.filter((item) => item?.ok === true).length;
    const blocked = responses.filter((item) => item?.reason_code === "auth_rate_limited").length;
    record(
      "A email parallel",
      parallel,
      allowed,
      blocked,
      allowed === 3 && blocked === 7,
      `allowed=${allowed}`
    );
  }

  // Scenario B — parallel origin rate limit
  {
    const originKey = testKeyHash("origin-b");
    const parallel = 14;
    const responses = await Promise.all(
      Array.from({ length: parallel }, () =>
        supabase.rpc("mia_auth_consume_rate_limit", {
          p_scope: "request_origin",
          p_key_hash: originKey,
          p_window_seconds: 900,
          p_max_requests: 12,
        })
      )
    );
    const allowed = responses.filter(({ data }) => data?.allowed === true).length;
    const blocked = responses.filter(({ data }) => data?.allowed === false).length;
    record(
      "B origin parallel",
      parallel,
      allowed,
      blocked,
      allowed === 12 && blocked === 2,
      `allowed=${allowed}`
    );
  }

  // Scenario C — parallel wrong OTP
  {
    const email = testEmail("wrong-c");
    trackedEmails.push(email);
    const challengeId = crypto.randomUUID();
    const correctHash = testKeyHash(`correct-${challengeId}`);
    await insertDeliveredChallenge(supabase, { email, challengeId, tokenHash: correctHash });
    const parallel = 5;
    const responses = await Promise.all(
      Array.from({ length: parallel }, () => verifyChallenge(supabase, challengeId, testKeyHash("wrong")))
    );
    const invalid = responses.filter((item) => item?.reason_code === "auth_code_invalid").length;
    const { data: row } = await supabase
      .from("mia_auth_challenges")
      .select("attempt_count, consumed_at")
      .eq("id", challengeId)
      .single();
    record(
      "C wrong OTP parallel",
      parallel,
      invalid,
      parallel - invalid,
      invalid === parallel && Number(row?.attempt_count) === parallel && !row?.consumed_at,
      `attempt_count=${row?.attempt_count}`
    );
  }

  // Scenario D — parallel correct OTP (single consume)
  {
    const email = testEmail("correct-d");
    trackedEmails.push(email);
    const challengeId = crypto.randomUUID();
    const correctHash = testKeyHash(`correct-${challengeId}`);
    await insertDeliveredChallenge(supabase, { email, challengeId, tokenHash: correctHash });
    const parallel = 4;
    const responses = await Promise.all(
      Array.from({ length: parallel }, () => verifyChallenge(supabase, challengeId, correctHash))
    );
    const consumed = responses.filter((item) => item?.ok === true).length;
    const rejected = responses.filter((item) => item?.ok !== true).length;
    const { data: row } = await supabase
      .from("mia_auth_challenges")
      .select("consumed_at")
      .eq("id", challengeId)
      .single();
    record(
      "D correct OTP parallel",
      parallel,
      consumed,
      rejected,
      consumed === 1 && rejected === parallel - 1 && row?.consumed_at,
      `consumed=${consumed}`
    );
  }

  // Scenario E — parallel resend / invalidate
  {
    const email = testEmail("resend-e");
    trackedEmails.push(email);
    const emailKey = testKeyHash("email-e");
    const originKey = testKeyHash("origin-e");
    const firstId = crypto.randomUUID();
    const first = await requestChallengeRpc(supabase, {
      email,
      emailKey,
      originKey,
      challengeId: firstId,
      tokenHash: testKeyHash(`token-e-1-${firstId}`),
    });
    await supabase.rpc("mia_auth_mark_challenge_delivered", { p_challenge_id: firstId });
    const parallel = 3;
    const responses = await Promise.all(
      Array.from({ length: parallel }, () => {
        const challengeId = crypto.randomUUID();
        return requestChallengeRpc(supabase, {
          email,
          emailKey,
          originKey,
          challengeId,
          tokenHash: testKeyHash(`token-e-${challengeId}`),
        });
      })
    );
    const allowed = responses.filter((item) => item?.ok === true).length;
    const { data: activeRows } = await supabase
      .from("mia_auth_challenges")
      .select("id, consumed_at")
      .eq("email_normalized", email)
      .is("consumed_at", null);
    const { data: firstRow } = await supabase
      .from("mia_auth_challenges")
      .select("consumed_at")
      .eq("id", firstId)
      .single();
    const activeCount = activeRows?.length || 0;
    record(
      "E resend parallel",
      parallel,
      allowed,
      parallel - allowed,
      first?.ok === true && allowed >= 1 && activeCount === 1 && firstRow?.consumed_at,
      `active=${activeCount}`
    );
  }
} finally {
  await cleanup(supabase, trackedEmails);
}

const failed = results.filter((item) => !item.ok).length;
console.log(`\nSummary: ${results.length - failed}/${results.length} scenarios passed`);
process.exit(failed > 0 ? 1 : 0);
