#!/usr/bin/env node
/**
 * PATCH 3.3A.1 — Read-only email identity preflight for public.users.
 * Masks emails in output. Safe for remote audit via Supabase CLI.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function maskEmail(value = "") {
  const email = String(value || "").trim();
  const at = email.indexOf("@");
  if (at <= 0) return "[invalid]";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const localMasked =
    local.length <= 2 ? `${local[0] || "*"}*` : `${local.slice(0, 2)}***`;
  const domainParts = domain.split(".");
  const domainMasked =
    domainParts.length >= 2
      ? `${domainParts[0].slice(0, 1)}***.${domainParts.slice(-1)[0]}`
      : `${domain.slice(0, 1)}***`;
  return `${localMasked}@${domainMasked}`;
}

function parseSupabaseQueryOutput(combined = "") {
  const jsonStart = combined.indexOf("{");
  const jsonEnd = combined.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) {
    throw new Error(`Unexpected supabase query output: ${combined.slice(0, 200)}`);
  }
  const payload = JSON.parse(combined.slice(jsonStart, jsonEnd + 1));
  return payload.rows || [];
}

function runQuery(sql) {
  const oneLine = sql.replace(/\s+/g, " ").trim();
  const escaped = oneLine.replace(/"/g, '\\"');
  const result = spawnSync(`npx supabase db query --linked "${escaped}"`, {
    cwd: ROOT,
    encoding: "utf8",
    shell: true,
  });
  const combined = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
  if (result.status !== 0 && !combined.includes('"rows"')) {
    throw new Error(combined || "supabase db query failed");
  }
  return parseSupabaseQueryOutput(combined);
}

function printMetric(label, value, result = "ok") {
  console.log(`| ${label} | ${value} | ${result} |`);
}

console.log("\nPATCH 3.3A.1 — auth email preflight (read-only)\n");
console.log("| metric | quantity | result |");
console.log("| --- | ---: | --- |");

try {
  const totals = runQuery(
    "select count(*)::int as total_users, count(*) filter (where email is null)::int as null_email, count(*) filter (where btrim(coalesce(email, '')) = '')::int as empty_email, count(*) filter (where email is not null and email <> btrim(email))::int as has_spaces, count(*) filter (where email is not null and email <> lower(email))::int as has_uppercase from public.users"
  )[0];

  printMetric("total_users", totals.total_users);
  printMetric("null_email", totals.null_email, totals.null_email === 0 ? "ok" : "review");
  printMetric("empty_email", totals.empty_email, totals.empty_email === 0 ? "ok" : "review");
  printMetric("has_spaces", totals.has_spaces, totals.has_spaces === 0 ? "ok" : "review");
  printMetric("has_uppercase", totals.has_uppercase, totals.has_uppercase === 0 ? "ok" : "review");

  const exactDupes =
    runQuery(
      "select count(*)::int as groups from (select email from public.users group by email having count(*) > 1) d"
    )[0]?.groups || 0;
  printMetric("exact_duplicate_groups", exactDupes, exactDupes === 0 ? "ok" : "blocked");

  const normalizedDupes =
    runQuery(
      "select count(*)::int as groups from (select lower(btrim(email)) as email_norm from public.users where email is not null group by lower(btrim(email)) having count(*) > 1) d"
    )[0]?.groups || 0;
  printMetric(
    "normalized_duplicate_groups",
    normalizedDupes,
    normalizedDupes === 0 ? "ok" : "blocked"
  );

  const invalidEmails =
    runQuery(
      "select count(*)::int as invalid_count from public.users where email is not null and (btrim(email) = '' or length(btrim(email)) > 254 or position('@' in btrim(email)) = 0 or position('.' in btrim(email)) = 0)"
    )[0]?.invalid_count || 0;
  printMetric("invalid_email_rows", invalidEmails, invalidEmails === 0 ? "ok" : "review");

  if (normalizedDupes > 0) {
    const groups = runQuery(
      "select lower(btrim(email)) as email_norm, count(*)::int as ids from public.users where email is not null group by lower(btrim(email)) having count(*) > 1 order by count(*) desc limit 10"
    );
    console.log("\nNormalized duplicate groups (masked, max 10):");
    for (const group of groups) {
      console.log(`- ${maskEmail(group.email_norm)} → ${group.ids} ids`);
    }
    console.log("\nVerdict: PATCH 3.3A.1 INTERROMPIDO — DUPLICAÇÃO DE IDENTIDADE");
    process.exit(2);
  }

  console.log("\nVerdict: preflight passed — safe to apply email identity migration");
  process.exit(0);
} catch (error) {
  console.error(`\nPreflight failed: ${error.message}`);
  process.exit(1);
}
