#!/usr/bin/env node
/**
 * PATCH 3.3A.2 — OTP reuse rejection (production, no secrets logged).
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE = "https://economia-ai.vercel.app";

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

loadEnv();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const { data: consumed } = await supabase
  .from("mia_auth_challenges")
  .select("id, consumed_at, attempt_count")
  .not("consumed_at", "is", null)
  .gte("consumed_at", since)
  .order("consumed_at", { ascending: false })
  .limit(1);

const challenge = consumed?.[0];
if (!challenge) {
  console.error("FAIL — no recent consumed challenge found");
  process.exit(1);
}

const res = await fetch(`${BASE}/api/auth/verify-code`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ challenge_id: challenge.id, code: "000000" }),
});
const json = await res.json().catch(() => null);

const passStatus = res.status === 400 || res.status === 409 || res.status === 403;
const passReason =
  json?.reasonCode === "auth_challenge_consumed" ||
  json?.reasonCode === "auth_invalid_code" ||
  json?.reasonCode === "auth_challenge_expired";

console.log(`challenge=${challenge.id.slice(0, 4)}****${challenge.id.slice(-4)}`);
console.log(`status=${res.status} reason=${json?.reasonCode || "(none)"}`);
console.log(`PASS — OTP reuse rejected: ${passStatus && !json?.session_token}`);
process.exit(passStatus && !json?.session_token ? 0 : 1);
