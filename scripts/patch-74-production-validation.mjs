#!/usr/bin/env node
/**
 * PATCH 7.4 — Health metrics production validation (SQL consolidated).
 */
import { execSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE = process.env.PATCH74_PROD_BASE_URL || "https://economia-ai.vercel.app";

const QUERIES = [
  { file: "patch-74-query1-overall-health.sql", label: "Q1 overall health", minRows: 1 },
  { file: "patch-74-query2-component-breakdown.sql", label: "Q2 breakdown", minRows: 0 },
  { file: "patch-74-query3-health-trends.sql", label: "Q3 trends", minRows: 0 },
  { file: "patch-74-query4-instrumentation-quality.sql", label: "Q4 instrumentation", minRows: 1 },
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

console.log("\nPATCH 7.4 — Health metrics production validation\n");

{
  const res = await fetch(`${BASE}/api/health`);
  const json = await res.json().catch(() => ({}));
  ok("production health endpoint", res.ok, `status=${res.status} build=${json.build || "?"}`);
}

try {
  ok("supabase linked project", existsSync(join(ROOT, "supabase/.temp/linked-project.json")));

  let q1Rows = [];
  for (const q of QUERIES) {
    const path = join(ROOT, "docs/analytics/sql", q.file);
    const rows = runLinkedSql(path);
    if (q.file.includes("query1")) q1Rows = rows;
    ok(`SQL ${q.label} executed`, rows.length >= q.minRows, `rows=${rows.length}`);
    ok(`${q.label} has tipo_analise`, rows.every((r) => "tipo_analise" in r));
    ok(`${q.label} has registros_total`, rows.every((r) => "registros_total" in r));
    ok(`${q.label} has valor_absoluto`, rows.every((r) => "valor_absoluto" in r));
    ok(`${q.label} has referencia_denominador`, rows.every((r) => "referencia_denominador" in r));
  }

  const healthStatus = q1Rows.find((r) => r.metrica === "health_status");
  ok("Q1 health_status present", !!healthStatus, healthStatus?.dimensao_valor || "missing");
  console.log("\nQuery 1 — health overview sample:");
  console.log(JSON.stringify(q1Rows.filter((r) => r.tipo_analise === "health_indicator").slice(0, 12), null, 2));

  const requestVolume = q1Rows.find((r) => r.metrica === "request_volume");
  ok("request_volume > 0", (requestVolume?.valor_absoluto ?? 0) > 0, `volume=${requestVolume?.valor_absoluto ?? 0}`);

  writeFileSync(
    join(ROOT, "docs/analytics/PATCH_7.4_PRODUCTION_EVIDENCE.json"),
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        base_url: BASE,
        health_status: healthStatus?.dimensao_valor ?? null,
        request_volume: requestVolume?.valor_absoluto ?? 0,
        indicators: q1Rows.filter((r) => r.tipo_analise === "health_indicator"),
        q1_sample: q1Rows.slice(0, 15),
      },
      null,
      2
    )
  );
} catch (err) {
  ok("production SQL execution", false, err.stderr?.slice(0, 300) || err.message);
}

const passed = checks.filter((c) => c.pass).length;
console.log(`\nProduction checks: ${passed}/${checks.length}\n`);
process.exit(passed === checks.length ? 0 : 1);
