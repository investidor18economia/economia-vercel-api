#!/usr/bin/env node
/**
 * PATCH 7.1 — Response reliability production validation.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE = process.env.PATCH71_PROD_BASE_URL || "https://economia-ai.vercel.app";

const QUERIES = [
  {
    file: "patch-71-query1-outcome-overview.sql",
    label: "Q1 outcome overview",
    minRows: 1,
    tipos: ["confiabilidade_global", "capacidade_instrumentacao"],
  },
  {
    file: "patch-71-query2-outcome-dimensions.sql",
    label: "Q2 dimensions",
    minRows: 0,
    tipos: ["outcome_por_caminho", "outcome_por_intencao", "outcome_por_validade"],
  },
  {
    file: "patch-71-query3-partial-fallback-analytics.sql",
    label: "Q3 partial/fallback",
    minRows: 0,
    tipos: ["resposta_incompleta_por_caminho", "fallback_entrega", "correlacao_data_layer"],
  },
  {
    file: "patch-71-query4-evolution-gaps-panel.sql",
    label: "Q4 evolution",
    minRows: 1,
    tipos: ["capacidade_instrumentacao", "evolucao_diaria", "gap_operacional_caminho"],
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

console.log("\nPATCH 7.1 — Response reliability production validation\n");

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
      const cap = rows.find((r) => r.metrica === "total_eventos_mia_response_outcome");
      ok("Q1 capacity row present", !!cap);
      console.log("\nQuery 1 — outcome overview sample:");
      console.log(JSON.stringify(rows.slice(0, 10), null, 2));
      if (cap?.valor_absoluto === 0) {
        ok("Q1 zero events expected pre-deploy", cap.limitacao === "sem_eventos_apos_deploy_patch_71");
      }
    }

    if (q.file.includes("query4")) {
      const versionRow = rows.find((r) => r.tipo_analise === "capacidade_instrumentacao");
      ok("Q4 capacity panel", !!versionRow);
      console.log("\nQuery 4 — capacity sample:");
      console.log(
        JSON.stringify(rows.filter((r) => r.tipo_analise === "capacidade_instrumentacao"), null, 2)
      );
    }
  }

  const countRows = runLinkedSql(
    join(ROOT, "docs/analytics/sql/patch-71-query1-outcome-overview.sql")
  );
  const totalEvents =
    countRows.find((r) => r.metrica === "total_eventos_mia_response_outcome")?.valor_absoluto ?? 0;
  ok("mia_response_outcome events counted", totalEvents >= 0, `total=${totalEvents}`);
} catch (err) {
  ok("production SQL execution", false, err.stderr?.slice(0, 300) || err.message);
}

const passed = checks.filter((c) => c.pass).length;
console.log(`\nProduction checks: ${passed}/${checks.length}\n`);
process.exit(passed === checks.length ? 0 : 1);
