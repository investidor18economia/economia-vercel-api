#!/usr/bin/env node
/**
 * PATCH Analytics 1.3 — SQL dashboard semantics and production scope audit.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ANALYTICS_DIR = join(ROOT, "docs/analytics");

const PRODUCTION_SQL = [
  "analytics-overview.sql",
  "analytics-daily-sessions.sql",
  "analytics-dau.sql",
  "analytics-categories.sql",
  "analytics-products.sql",
  "analytics-ctr.sql",
  "analytics-buying-intent.sql",
];

const QA_SQL = ["analytics-qa-overview.sql"];

const FORBIDDEN_ALIASES = [
  /\bas\s+usuarios_ativos\b/i,
  /\bas\s+unique_users\b/i,
  /\bas\s+active_users\b/i,
  /\bas\s+dau\b/i,
  /\bas\s+wau\b/i,
  /\bas\s+mau\b/i,
];

const FORBIDDEN_HEURISTICS = [
  /query_text\s+like\s+'%teste%'/i,
  /query_text\s+ilike\s+'%test/i,
];

const REQUIRED_PRODUCTION_MARKERS = [
  "price_alert_email_test",
  "price_alert_e2e_test",
  "price_drop_email_test_%",
  "price_drop_email_e2e_%",
  "test-agent",
];

const REQUIRED_SESSION_ALIASES = [/sessoes_unicas/i, /sessoes_unicas_diarias/i];

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${label}`);
    return;
  }
  failed += 1;
  console.error(`  ❌ ${label}`);
}

function readSql(name) {
  return readFileSync(join(ANALYTICS_DIR, name), "utf8");
}

function isProductionDashboard(name) {
  return PRODUCTION_SQL.includes(name) && name !== "analytics-dau.sql";
}

console.log("\nPATCH Analytics 1.3 — SQL dashboard audit\n");

for (const file of PRODUCTION_SQL) {
  const sql = readSql(file);
  const label = `Production ${file}`;

  for (const pattern of FORBIDDEN_ALIASES) {
    assert(`${label} — no forbidden alias ${pattern}`, !pattern.test(sql));
  }

  for (const pattern of FORBIDDEN_HEURISTICS) {
    assert(`${label} — no query_text heuristic`, !pattern.test(sql));
  }

  if (isProductionDashboard(file) || file === "analytics-dau.sql") {
    for (const marker of REQUIRED_PRODUCTION_MARKERS) {
      assert(`${label} — production filter includes ${marker}`, sql.includes(marker));
    }
  }
}

{
  const dau = readSql("analytics-dau.sql");
  assert("analytics-dau.sql — no usuarios_ativos alias", !/\bas\s+usuarios_ativos\b/i.test(dau));
  assert("analytics-dau.sql — has sessoes_unicas_diarias", /sessoes_unicas_diarias/i.test(dau));
}

{
  const daily = readSql("analytics-daily-sessions.sql");
  assert("analytics-daily-sessions.sql — defines sessoes_unicas_diarias", /sessoes_unicas_diarias/i.test(daily));
  assert(
    "analytics-daily-sessions.sql — session_id scoped to MIA public events",
    daily.includes("'session_started'") && daily.includes("'offer_click'")
  );
}

{
  const overview = readSql("analytics-overview.sql");
  assert("analytics-overview.sql — sessoes_unicas alias", /as\s+sessoes_unicas/i.test(overview));
  assert(
    "analytics-overview.sql — distinct session_id uses MIA event filter",
    overview.includes("count(distinct session_id) filter")
  );
}

{
  const qa = readSql("analytics-qa-overview.sql");
  assert("analytics-qa-overview.sql — selects QA rows only", qa.includes("total_eventos_qa"));
  assert("analytics-qa-overview.sql — references test categories", qa.includes("price_alert_email_test"));
}

{
  const scope = readSql("analytics-production-scope.sql");
  assert("analytics-production-scope.sql — documents session semantics", scope.includes("session_id"));
  assert("analytics-production-scope.sql — documents limitation", scope.toLowerCase().includes("limitation"));
}

{
  const docs = readFileSync(join(ANALYTICS_DIR, "DASHBOARDS.md"), "utf8");
  assert("DASHBOARDS.md — session vs user documented", docs.includes("Sessão") && docs.includes("user_id"));
  assert(
    "DASHBOARDS.md — DAU not claimed",
    /not dau|não é dau/i.test(docs)
  );
}

{
  const sqlFiles = readdirSync(ANALYTICS_DIR).filter((f) => f.endsWith(".sql"));
  const SQL_STRUCTURE_EXCLUDED = new Set([
    "analytics-production-scope.sql",
    "analytics-events-storage-schema-v1.sql",
    "analytics-events-schema-inspection.sql",
    "analytics-events-schema-preflight.sql",
  ]);
  for (const file of sqlFiles) {
    const sql = readSql(file);
    if (file === "analytics-qa-overview.sql") continue;
    if (SQL_STRUCTURE_EXCLUDED.has(file)) continue;
    assert(`${file} — basic SQL structure`, /from\s+analytics_events/i.test(sql));
  }
}

{
  let hasSessionAlias = false;
  for (const file of PRODUCTION_SQL) {
    const sql = readSql(file);
    if (REQUIRED_SESSION_ALIASES.some((p) => p.test(sql))) hasSessionAlias = true;
  }
  assert("At least one production dashboard exposes session metric alias", hasSessionAlias);
}

console.log(`\nResultado: ${passed}/${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
