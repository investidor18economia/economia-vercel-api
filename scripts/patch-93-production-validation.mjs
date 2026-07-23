#!/usr/bin/env node
/** PATCH 9.3 — SQL Q1-Q10 production validation */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.PATCH93_PROD_BASE_URL || "https://economia-ai.vercel.app";
const QUERIES = [
  "patch-93-query1-rejection-overview.sql",
  "patch-93-query2-signal-classes-types.sql",
  "patch-93-query3-rejection-reasons.sql",
  "patch-93-query4-decision-source.sql",
  "patch-93-query5-signal-targets.sql",
  "patch-93-query6-signal-outcomes.sql",
  "patch-93-query7-time-to-signal.sql",
  "patch-93-query8-recovery-after-rejection.sql",
  "patch-93-query9-abandonment.sql",
  "patch-93-query10-quality-fanout.sql",
];

const checks = [];
function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
}

function runSql(file) {
  const out = execSync(`npx supabase db query --linked -f "${join(ROOT, "docs/analytics/sql", file)}" -o json`, {
    cwd: ROOT,
    encoding: "utf8",
  });
  return JSON.parse(out).rows || [];
}

console.log("\nPATCH 9.3 — SQL validation\n");
{
  const res = await fetch(`${BASE}/api/health`);
  ok("health", res.ok, `status=${res.status}`);
}
try {
  ok("supabase linked", existsSync(join(ROOT, "supabase/.temp/linked-project.json")));
  for (const file of QUERIES) {
    const rows = runSql(file);
    ok(`SQL ${file}`, Array.isArray(rows), `rows=${rows.length}`);
  }
} catch (err) {
  ok("SQL validation", false, String(err.message).slice(0, 200));
}
process.exit(checks.some((c) => !c.pass) ? 1 : 0);
