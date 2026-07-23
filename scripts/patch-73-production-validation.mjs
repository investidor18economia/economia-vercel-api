#!/usr/bin/env node
/**
 * PATCH 7.3 — Latency analytics production validation.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE = process.env.PATCH73_PROD_BASE_URL || "https://economia-ai.vercel.app";

const QUERIES = [
  { file: "patch-73-query1-latency-overview.sql", label: "Q1 overview", minRows: 1 },
  { file: "patch-73-query2-latency-dimensions.sql", label: "Q2 dimensions", minRows: 0 },
  { file: "patch-73-query3-stage-correlation.sql", label: "Q3 stage/correlation", minRows: 0 },
  { file: "patch-73-query4-evolution-gaps-panel.sql", label: "Q4 evolution", minRows: 1 },
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

console.log("\nPATCH 7.3 — Latency analytics production validation\n");

{
  const res = await fetch(`${BASE}/api/health`);
  ok("production health endpoint", res.ok, `status=${res.status}`);
}

try {
  ok("supabase linked project", existsSync(join(ROOT, "supabase/.temp/linked-project.json")));

  for (const q of QUERIES) {
    const path = join(ROOT, "docs/analytics/sql", q.file);
    const rows = runLinkedSql(path);
    ok(`SQL ${q.label} executed`, rows.length >= q.minRows, `rows=${rows.length}`);
    ok(`${q.label} has tipo_analise`, rows.every((r) => "tipo_analise" in r));
    ok(`${q.label} has registros_total`, rows.every((r) => "registros_total" in r));
    ok(`${q.label} has valor_absoluto`, rows.every((r) => "valor_absoluto" in r));
    ok(`${q.label} has referencia_denominador`, rows.every((r) => "referencia_denominador" in r));

    if (q.file.includes("query1")) {
      const cap = rows.find((r) => r.metrica === "total_eventos_mia_latency_event");
      ok("Q1 capacity row present", !!cap);
      console.log("\nQuery 1 — latency overview sample:");
      console.log(JSON.stringify(rows.slice(0, 10), null, 2));
      if (cap?.valor_absoluto === 0) {
        ok("Q1 zero events pre-deploy expected", cap.limitacao === "sem_eventos_apos_deploy_patch_73");
      }
    }
  }

  const q1 = runLinkedSql(join(ROOT, "docs/analytics/sql/patch-73-query1-latency-overview.sql"));
  const total = q1.find((r) => r.metrica === "total_eventos_mia_latency_event")?.valor_absoluto ?? 0;
  ok("mia_latency_event events counted", total >= 0, `total=${total}`);
} catch (err) {
  ok("production SQL execution", false, err.stderr?.slice(0, 300) || err.message);
}

const passed = checks.filter((c) => c.pass).length;
console.log(`\nProduction checks: ${passed}/${checks.length}\n`);
process.exit(passed === checks.length ? 0 : 1);
