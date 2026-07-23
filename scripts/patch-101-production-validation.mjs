#!/usr/bin/env node
/** PATCH 10.1 — SQL Q1-Q10 production validation */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.PATCH101_PROD_BASE_URL || "https://economia-ai.vercel.app";
const QUERIES = [
  "patch-101-query1-price-quality-distribution.sql",
  "patch-101-query2-provider-coverage.sql",
  "patch-101-query3-price-dispersion.sql",
  "patch-101-query4-winner-price-position.sql",
  "patch-101-query5-provider-reliability.sql",
  "patch-101-query6-promotional-frequency.sql",
  "patch-101-query7-invalid-price-frequency.sql",
  "patch-101-query8-confidence-distribution.sql",
  "patch-101-query9-quality-by-search-path.sql",
  "patch-101-query10-quality-correlation.sql",
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

console.log("\nPATCH 10.1 — SQL validation\n");
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
