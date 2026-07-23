#!/usr/bin/env node
/**
 * PATCH 8.2 — Provider Attempt production SQL validation (Q1–Q6).
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE = process.env.PATCH82_PROD_BASE_URL || process.env.PATCH81_PROD_BASE_URL || "https://economia-ai.vercel.app";

const QUERIES = [
  { file: "patch-82-query1-provider-volume-status.sql", label: "Q1 volume/status", minRows: 0 },
  { file: "patch-82-query2-provider-latency.sql", label: "Q2 latency", minRows: 0 },
  { file: "patch-82-query3-provider-contribution.sql", label: "Q3 contribution", minRows: 0 },
  { file: "patch-82-query4-provider-failures-fallback.sql", label: "Q4 failures", minRows: 0 },
  { file: "patch-82-query5-provider-runtime-paths.sql", label: "Q5 runtime", minRows: 0 },
  { file: "patch-82-query6-provider-correlation.sql", label: "Q6 correlation", minRows: 0 },
];

const checks = [];
function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
}

function runLinkedSql(filePath) {
  const out = execSync(`npx supabase db query --linked -f "${filePath}" -o json`, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  return JSON.parse(out).rows || [];
}

console.log("\nPATCH 8.2 — Provider Attempt production SQL validation\n");

{
  const res = await fetch(`${BASE}/api/health`);
  const json = await res.json().catch(() => ({}));
  ok("production health endpoint", res.ok, `status=${res.status} build=${json?.build || "?"}`);
}

try {
  ok("supabase linked project", existsSync(join(ROOT, "supabase/.temp/linked-project.json")));

  for (const q of QUERIES) {
    const path = join(ROOT, "docs/analytics/sql", q.file);
    const rows = runLinkedSql(path);
    ok(`SQL ${q.label} executed`, rows.length >= q.minRows, `rows=${rows.length}`);
    ok(`${q.label} returns rows array`, Array.isArray(rows));
    if (q.file.includes("query1") && rows.length) {
      console.log("\nQuery 1 sample:");
      console.log(JSON.stringify(rows.slice(0, 6), null, 2));
    }
    if (q.file.includes("query6") && rows.length) {
      console.log("\nQuery 6 sample:");
      console.log(JSON.stringify(rows.slice(0, 3), null, 2));
    }
  }
} catch (err) {
  ok("SQL validation", false, String(err.message || err).slice(0, 240));
}

const failed = checks.filter((c) => !c.pass).length;
console.log(`\nValidation: ${checks.length - failed}/${checks.length}\n`);
process.exit(failed === 0 ? 0 : 1);
