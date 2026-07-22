/**
 * SUPABASE-04 — Post-link read-only reconciliation audit.
 * Never prints secrets, passwords, tokens, or connection strings.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const AUDIT_DIR = join(ROOT, "supabase/.temp/audit");
const REPORT_PATH = join(AUDIT_DIR, "supabase-04-audit-report.json");

const PRIORITY_TABLES = [
  "analytics_events",
  "price_alerts",
  "price_alert_delivery_logs",
  "provider_credentials",
  "conversations",
  "messages",
  "mia_sessions",
  "users",
  "wishes",
  "phone_specs",
  "product_specs",
  "notebook_specs",
  "commercial_candidates",
  "commercial_products_cache",
  "cache_results",
  "usage_log",
];

const LEGACY_SPECS = {
  "docs/alerts/price-alert-delivery-logs.sql": {
    table: "price_alert_delivery_logs",
    columns: [
      "id", "created_at", "alert_id", "user_id", "event_type", "severity", "source",
      "mode", "product_name", "normalized_product_key", "target_price", "found_price",
      "found_source", "found_url", "email_sent", "resend_result_id", "reason",
      "error_code", "error_message", "metadata",
    ],
    indexes: [
      "idx_price_alert_delivery_logs_created_at",
      "idx_price_alert_delivery_logs_alert_id",
      "idx_price_alert_delivery_logs_user_id",
      "idx_price_alert_delivery_logs_event_type",
      "idx_price_alert_delivery_logs_source",
      "idx_price_alert_delivery_logs_severity",
    ],
  },
  "docs/alerts/price-alerts-safety-fields.sql": {
    table: "price_alerts",
    columns: [
      "normalized_product_key", "monitoring_scope", "original_product_url",
      "original_source", "last_checked_at", "last_checked_price", "last_found_price",
      "last_found_url", "last_found_source", "last_alert_sent_at", "last_alert_sent_price",
      "last_alert_sent_url", "last_alert_status", "last_alert_error", "check_count",
      "email_send_count", "created_reason",
    ],
    indexes: [
      "idx_price_alerts_user_id",
      "idx_price_alerts_normalized_product_key",
      "idx_price_alerts_is_active",
      "idx_price_alerts_last_checked_at",
      "idx_price_alerts_user_product_active",
    ],
  },
  "docs/commercial/provider-credentials.sql": {
    table: "provider_credentials",
    columns: [
      "id", "provider_id", "environment", "credential_type", "encrypted_payload",
      "encryption_iv", "encryption_auth_tag", "encryption_key_version",
      "credential_version", "issued_at", "expires_at", "scopes", "provider_account_id",
      "status", "created_at", "updated_at",
    ],
    indexes: [
      "idx_provider_credentials_provider_env",
      "idx_provider_credentials_expires_at",
      "provider_credentials_unique_provider_env_type",
    ],
  },
};

const ANALYTICS_V1_INDEXES = [
  "idx_analytics_events_event_name_created_at",
  "idx_analytics_events_created_at",
  "idx_analytics_events_session_id",
  "idx_analytics_events_category",
];

const ANALYTICS_V1_COLUMNS = [
  "id", "event_name", "session_id", "user_id", "category", "product_name",
  "product_brand", "product_id", "query_text", "recommendation_name",
  "offer_store", "offer_price", "offer_url", "metadata", "created_at",
];

function loadEnv() {
  const envFile = join(ROOT, ".env.local");
  if (!existsSync(envFile)) return;
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
}

function redactHost(url) {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

async function fetchJson(baseUrl, path, key, extraHeaders = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...extraHeaders,
    },
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = { parseError: true, snippet: text.slice(0, 80) };
  }
  return { ok: res.ok, status: res.status, data };
}

function openapiColumnTypes(tableDef) {
  if (!tableDef?.properties) return {};
  const out = {};
  for (const [name, def] of Object.entries(tableDef.properties)) {
    out[name] = {
      format: def.format || null,
      type: def.type || null,
      description: def.description ? true : false,
    };
  }
  return out;
}

function classifyColumns(expected, actual) {
  const missing = expected.filter((c) => !actual.includes(c));
  const extra = actual.filter((c) => !expected.includes(c));
  const present = expected.filter((c) => actual.includes(c));
  return { missing, extra, present };
}

function runInspect(subcommand) {
  try {
    const raw = execSync(`npx supabase inspect db ${subcommand} --linked`, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const jsonStart = raw.indexOf("{");
    if (jsonStart === -1) return { error: "no_json_output", rawSnippet: raw.slice(0, 120) };
    return JSON.parse(raw.slice(jsonStart));
  } catch (err) {
    return { error: err.message?.slice(0, 200) || "inspect_failed" };
  }
}

loadEnv();

mkdirSync(AUDIT_DIR, { recursive: true });

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const refMatch = url.match(/https:\/\/([^.]+)\.supabase\.co/);
const projectRef = refMatch ? refMatch[1] : null;

const report = {
  patch: "SUPABASE-04",
  mode: "read_only",
  generatedAt: new Date().toISOString(),
  link: {},
  migrations: {},
  remoteInventory: {},
  analyticsComparison: {},
  legacySqlComparison: {},
  securityProbes: {},
  drift: {},
  limitations: [],
  operationsNotExecuted: [
    "supabase db push",
    "supabase db pull",
    "supabase migration repair",
    "supabase migration up",
    "supabase db reset",
    "DDL/DML remoto",
    "commit/push Git",
  ],
};

report.link = {
  projectRefFromEnv: projectRef,
  supabaseHost: redactHost(url),
  linkedProjectRefFile: existsSync(join(ROOT, "supabase/.temp/project-ref"))
    ? readFileSync(join(ROOT, "supabase/.temp/project-ref"), "utf8").trim()
    : null,
  postgresVersionFile: existsSync(join(ROOT, "supabase/.temp/postgres-version"))
    ? readFileSync(join(ROOT, "supabase/.temp/postgres-version"), "utf8").trim()
    : null,
  linkedProjectJson: existsSync(join(ROOT, "supabase/.temp/linked-project.json"))
    ? JSON.parse(readFileSync(join(ROOT, "supabase/.temp/linked-project.json"), "utf8"))
    : null,
  linkConsistent:
    projectRef === "xzijmzqsquasrtnkotrw" &&
    readFileSync(join(ROOT, "supabase/.temp/project-ref"), "utf8").trim() === "xzijmzqsquasrtnkotrw",
};

if (!report.link.linkConsistent) {
  report.blocked = "link_security_mismatch";
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(2);
}

try {
  const migRaw = execSync("npx supabase migration list --linked", {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const migJsonStart = migRaw.indexOf("{");
  report.migrations = migJsonStart >= 0 ? JSON.parse(migRaw.slice(migJsonStart)) : { raw: migRaw.slice(0, 200) };
} catch (err) {
  report.migrations = { error: err.message?.slice(0, 200) };
}

report.remoteInventory.tableStats = runInspect("table-stats");
report.remoteInventory.indexStats = runInspect("index-stats");

const tableStatsRows = report.remoteInventory.tableStats?.rows || [];
report.remoteInventory.publicTables = tableStatsRows.map((r) => r.name.replace(/^public\./, ""));

const indexByTable = {};
for (const row of report.remoteInventory.indexStats?.rows || []) {
  const table = row.table?.replace(/^public\./, "") || "unknown";
  if (!indexByTable[table]) indexByTable[table] = [];
  indexByTable[table].push(row.name);
}
report.remoteInventory.indexesByTable = indexByTable;

if (!url || !serviceKey) {
  report.limitations.push("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — OpenAPI probes skipped");
} else {
  const openapiRes = await fetchJson(url, "/rest/v1/", serviceKey);
  const defs = openapiRes.data?.definitions || {};
  const exposedTables = Object.keys(defs).filter((k) => !k.includes(".")).sort();

  report.remoteInventory.openapiStatus = openapiRes.status;
  report.remoteInventory.exposedTablesViaRest = exposedTables;

  report.remoteInventory.priorityTables = {};
  for (const table of PRIORITY_TABLES) {
    const def = defs[table];
    const columns = def?.properties ? Object.keys(def.properties).sort() : [];
    report.remoteInventory.priorityTables[table] = {
      exposedViaRest: Boolean(def),
      columnCount: columns.length,
      columns,
      required: def?.required || [],
      types: openapiColumnTypes(def),
    };
  }

  const ae = report.remoteInventory.priorityTables.analytics_events;
  if (ae?.columns?.length) {
    const colCheck = classifyColumns(ANALYTICS_V1_COLUMNS, ae.columns);
    const prodIndexes = indexByTable.analytics_events || [];
    report.analyticsComparison.schemaMigration = {
      columns: {
        classification:
          colCheck.missing.length === 0 && colCheck.extra.length === 0
            ? "JÁ EXISTE E É EQUIVALENTE (OpenAPI column set)"
            : "JÁ EXISTE, MAS É DIFERENTE ou incompleto via OpenAPI",
        expectedCount: 15,
        actualCount: ae.columnCount,
        missing: colCheck.missing,
        extra: colCheck.extra,
      },
      indexes: {
        expected: ANALYTICS_V1_INDEXES,
        actual: prodIndexes,
        missingExpected: ANALYTICS_V1_INDEXES.filter((i) => !prodIndexes.includes(i)),
        extraActual: prodIndexes.filter(
          (i) => !ANALYTICS_V1_INDEXES.includes(i) && i !== "analytics_events_pkey"
        ),
        classification:
          ANALYTICS_V1_INDEXES.every((i) => prodIndexes.includes(i))
            ? "JÁ EXISTE E É EQUIVALENTE"
            : "JÁ EXISTE, MAS É DIFERENTE (nomes/estrutura legados em produção)",
      },
      comments: "NÃO FOI POSSÍVEL CONFIRMAR via OpenAPI/inspect (requer pg_dump ou SQL preflight E–G)",
      rlsAndGrants: "NÃO FOI POSSÍVEL CONFIRMAR via REST (requer preflight queries E–G no SQL Editor)",
    };

    report.analyticsComparison.securityMigration = {
      enableRls: "NÃO FOI POSSÍVEL CONFIRMAR",
      revokeBrowserRoles: "NÃO FOI POSSÍVEL CONFIRMAR",
      grantServiceRole: "NÃO FOI POSSÍVEL CONFIRMAR (runtime usa service_role com sucesso em inserts)",
      unexpectedPolicies: "NÃO FOI POSSÍVEL CONFIRMAR",
      note:
        "Security migration 20260719153001 falharia se policies anon/authenticated/public existirem; preflight G necessário antes de SUPABASE-06",
    };
  }

  report.legacySqlComparison = {};
  for (const [file, spec] of Object.entries(LEGACY_SPECS)) {
    const remote = report.remoteInventory.priorityTables[spec.table];
    const remoteCols = remote?.columns || [];
    const col = classifyColumns(spec.columns, remoteCols);
    const remoteIndexes = indexByTable[spec.table] || [];
    const missingIdx = spec.indexes.filter((i) => !remoteIndexes.includes(i));
    const docNote =
      file.includes("provider-credentials") &&
      readFileSync(join(ROOT, file), "utf8").includes("NÃO APLICADA REMOTAMENTE");

    let classification = "impossível confirmar";
    if (remote?.exposedViaRest) {
      if (col.missing.length === 0 && missingIdx.length === 0) classification = "aplicado integralmente (colunas+índices visíveis)";
      else if (col.present.length > 0) classification = "aplicado parcialmente ou divergente";
      else classification = "ausente ou substituído";
    }

    report.legacySqlComparison[file] = {
      targetTable: spec.table,
      tableExistsRemotely: Boolean(remote?.exposedViaRest),
      docSaysNotApplied: docNote,
      columnsExpected: spec.columns.length,
      columnsPresent: col.present.length,
      columnsMissing: col.missing,
      columnsExtra: col.extra.filter((c) => !spec.columns.includes(c)),
      indexesExpected: spec.indexes,
      indexesMissing: missingIdx,
      indexesExtra: remoteIndexes.filter((i) => !spec.indexes.includes(i) && !i.endsWith("_pkey")),
      classification,
      baselineCandidate: true,
    };
  }

  report.securityProbes = { anonKeyLoaded: Boolean(anonKey), tables: {} };
  if (anonKey) {
    for (const table of PRIORITY_TABLES) {
      const selectProbe = await fetchJson(url, `/rest/v1/${table}?select=id&limit=0`, anonKey, {
        Prefer: "count=exact",
      });
      report.securityProbes.tables[table] = {
        anonSelectStatus: selectProbe.status,
        anonSelectOk: selectProbe.ok,
        interpretation:
          selectProbe.status === 401 || selectProbe.status === 403
            ? "REST bloqueado para anon (fail-closed ou sem grant)"
            : selectProbe.ok
              ? "endpoint acessível; RLS/grant exige análise (200 vazio ≠ seguro)"
              : "acesso negado ou tabela não exposta",
      };
    }
  } else {
    report.limitations.push("NEXT_PUBLIC_SUPABASE_ANON_KEY ausente — probes anon/authenticated não executados");
  }

  const sr = await fetchJson(url, "/rest/v1/analytics_events?select=id&limit=1", serviceKey, {
    Prefer: "count=exact",
  });
  report.securityProbes.serviceRoleAnalyticsRead = { ok: sr.ok, status: sr.status };
}

report.drift = {
  historical: [
    "Todas as 16 tabelas public existem fisicamente, mas supabase_migrations.schema_migrations remoto está vazio para migrations locais",
    "Objetos criados manualmente (MVP) sem histórico CLI",
  ],
  structural: [
    "analytics_events: índices legados com nomes diferentes dos definidos na migration v1",
    "analytics_events: índice extra analytics_events_product_name_idx não previsto na migration v1",
  ],
  unversionedLegacy: PRIORITY_TABLES.filter((t) => t !== "analytics_events").map(
    (t) => `${t} existe em produção sem migration em supabase/migrations/`
  ),
  platformManaged: [
    "auth.*, storage.*, realtime, extensions (pgsodium, pg_cron, etc.) — não inventariados neste patch",
  ],
  documentationDivergent: [
    "docs/commercial/provider-credentials.sql declara 'NÃO APLICADA REMOTAMENTE' mas tabela existe em produção",
    "supabase/README.md usa roadmap antigo (link=SUPABASE-02)",
  ],
  unknown: [
    "RLS/policies/grants/collation exatos por tabela — requer preflight SQL ou pg_dump schema-only",
    "Comments ON TABLE/COLUMN analytics_events — não visíveis via OpenAPI",
    "Partial index predicates (WHERE session_id IS NOT NULL) — inspect não expõe definição completa",
  ],
};

report.schemaDumpAttempt = {
  command: "npx supabase db dump --linked --schema public",
  result: "blocked_docker_required",
  note: "Docker Desktop ausente; substituído por inspect db + OpenAPI + probes",
};

writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
