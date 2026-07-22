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
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
  }
}

loadEnv();

const email = `patch-33a1-rate-${Date.now()}@test.invalid`;
const results = [];

for (let i = 1; i <= 4; i += 1) {
  const res = await fetch(`${BASE}/api/auth/request-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, name: "Rate Limit Test" }),
  });
  const json = await res.json().catch(() => null);
  results.push({ i, status: res.status, reason: json?.reasonCode || json?.error });
}

console.log("Rate limit production test (same email, 4 requests):");
for (const row of results) {
  console.log(`  #${row.i} status=${row.status} reason=${row.reason || "(none)"}`);
}

const allowed = results.filter((r) => r.status === 200).length;
const blocked = results.filter((r) => r.status === 429).length;
console.log(`allowed=${allowed} blocked=${blocked}`);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const { data: limits } = await supabase
  .from("mia_auth_rate_limits")
  .select("scope, request_count")
  .eq("scope", "request_email")
  .order("updated_at", { ascending: false })
  .limit(3);
console.log("recent email rate limit rows (masked scope only):", limits?.map((r) => ({ scope: r.scope, count: r.request_count })));

await supabase.from("mia_auth_challenges").delete().eq("email_normalized", email);
process.exit(allowed === 3 && blocked === 1 ? 0 : 1);
