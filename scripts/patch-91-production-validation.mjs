#!/usr/bin/env node
/** PATCH 9.1 — SQL Q1-Q5 production validation */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.PATCH91_PROD_BASE_URL || "https://economia-ai.vercel.app";
const QUERIES = [
  "patch-91-query1-decision-volume.sql",
  "patch-91-query2-decision-source-routing.sql",
  "patch-91-query3-winner-provider-category.sql",
  "patch-91-query4-score-gap-constraints.sql",
  "patch-91-query5-decision-correlation.sql",
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

console.log("\nPATCH 9.1 — SQL validation\n");
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
