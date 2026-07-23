#!/usr/bin/env node
/** PATCH 10.2 — SQL Q1-Q15 production validation */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.PATCH102_PROD_BASE_URL || "https://economia-ai.vercel.app";
const QUERIES = [
  "patch-102-query1-savings-type-distribution.sql",
  "patch-102-query2-savings-nature-distribution.sql",
  "patch-102-query3-savings-confidence-distribution.sql",
  "patch-102-query4-potential-savings-avg-median.sql",
  "patch-102-query5-total-potential-savings.sql",
  "patch-102-query6-savings-by-calculation-method.sql",
  "patch-102-query7-savings-by-baseline.sql",
  "patch-102-query8-savings-by-price-quality.sql",
  "patch-102-query9-savings-by-search-path-provider.sql",
  "patch-102-query10-ineligible-frequency.sql",
  "patch-102-query11-ineligibility-reasons.sql",
  "patch-102-query12-winner-vs-minimum.sql",
  "patch-102-query13-verifiable-vs-unverified.sql",
  "patch-102-query14-ui-unverified-frequency.sql",
  "patch-102-query15-confidence-by-sample-count.sql",
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

console.log("\nPATCH 10.2 — SQL validation\n");
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
