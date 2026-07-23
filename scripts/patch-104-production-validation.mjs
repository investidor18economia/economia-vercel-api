#!/usr/bin/env node
/** PATCH 10.4 — SQL Q1-Q15 production validation */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.PATCH104_PROD_BASE_URL || "https://economia-ai.vercel.app";
const QUERIES = [
  "patch-104-query1-score-distribution.sql",
  "patch-104-query2-score-avg-by-category.sql",
  "patch-104-query3-score-avg-by-search-path.sql",
  "patch-104-query4-acceptance-score-relation.sql",
  "patch-104-query5-rejection-score-relation.sql",
  "patch-104-query6-alert-score-relation.sql",
  "patch-104-query7-favorite-score-relation.sql",
  "patch-104-query8-observed-patterns.sql",
  "patch-104-query9-conflict-frequency.sql",
  "patch-104-query10-confidence-distribution.sql",
  "patch-104-query11-score-by-signal-count.sql",
  "patch-104-query12-score-temporal-evolution.sql",
  "patch-104-query13-price-quality-correlation.sql",
  "patch-104-query14-savings-type-correlation.sql",
  "patch-104-query15-provider-distribution.sql",
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

console.log("\nPATCH 10.4 — SQL validation\n");
{
  const res = await fetch(`${BASE}/api/health`);
  const healthJson = await res.json().catch(() => ({}));
  ok("health", res.ok, `build=${healthJson.build}`);
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
