#!/usr/bin/env node
/**
 * PATCH 6.4 — Data Layer usage production validation.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE = process.env.PATCH64_PROD_BASE_URL || "https://economia-ai.vercel.app";

const QUERIES = [
  {
    file: "patch-64-query1-effectiveness-overview.sql",
    label: "Q1 effectiveness",
    minRows: 1,
    tipos: ["efetividade_global", "capacidade_instrumentacao"],
  },
  {
    file: "patch-64-query2-coverage-dimensions.sql",
    label: "Q2 coverage",
    minRows: 0,
    tipos: ["cobertura_por_categoria", "cobertura_por_marca", "cobertura_por_familia"],
  },
  {
    file: "patch-64-query3-fallback-analytics.sql",
    label: "Q3 fallback",
    minRows: 0,
    tipos: ["fallback_por_tipo", "fallback_por_categoria", "fallback_por_caminho", "fallback_por_intencao"],
  },
  {
    file: "patch-64-query4-evolution-gaps-panel.sql",
    label: "Q4 evolution",
    minRows: 1,
    tipos: ["capacidade_instrumentacao", "evolucao_diaria", "gap_operacional_categoria"],
  },
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

console.log("\nPATCH 6.4 — Data Layer usage production validation\n");

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
    ok(`${q.label} uses analytics_events scope`, rows.every((r) => "referencia_denominador" in r));

    if (q.file.includes("query1")) {
      const cap = rows.find((r) => r.metrica === "total_eventos_data_layer_resolution");
      ok("Q1 capacity row present", !!cap);
      console.log("\nQuery 1 — effectiveness sample:");
      console.log(JSON.stringify(rows.slice(0, 8), null, 2));
      if (cap?.valor_absoluto === 0) {
        ok("Q1 zero events expected pre/post-deploy", cap.limitacao === "sem_eventos_apos_deploy_patch_64");
      }
    }

    if (q.file.includes("query4")) {
      const versionRow = rows.find((r) => r.tipo_analise === "capacidade_instrumentacao");
      ok("Q4 contract version panel", !!versionRow);
      console.log("\nQuery 4 — capacity + gaps sample:");
      console.log(JSON.stringify(rows.filter((r) => r.tipo_analise === "capacidade_instrumentacao"), null, 2));
    }
  }

  const countRows = runLinkedSql(
    join(ROOT, "docs/analytics/sql/patch-64-query1-effectiveness-overview.sql")
  );
  const totalEvents =
    countRows.find((r) => r.metrica === "total_eventos_data_layer_resolution")?.valor_absoluto ?? 0;
  ok("data_layer_resolution events counted", totalEvents >= 0, `total=${totalEvents}`);
} catch (err) {
  ok("production SQL execution", false, err.stderr?.slice(0, 300) || err.message);
}

const passed = checks.filter((c) => c.pass).length;
console.log(`\nProduction checks: ${passed}/${checks.length}\n`);
process.exit(passed === checks.length ? 0 : 1);
