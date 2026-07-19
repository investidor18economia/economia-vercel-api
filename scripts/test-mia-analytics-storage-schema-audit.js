#!/usr/bin/env node
/**
 * PATCH Analytics 1.4 — Official storage schema audit.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ANALYTICS_DIR = join(ROOT, "docs/analytics");

const OFFICIAL_COLUMNS = [
  "id",
  "event_name",
  "session_id",
  "user_id",
  "category",
  "product_name",
  "product_brand",
  "product_id",
  "query_text",
  "recommendation_name",
  "offer_store",
  "offer_price",
  "offer_url",
  "metadata",
  "created_at",
];

const RUNTIME_WRITE_COLUMNS = [
  "event_name",
  "session_id",
  "user_id",
  "category",
  "product_name",
  "product_brand",
  "product_id",
  "query_text",
  "recommendation_name",
  "offer_store",
  "offer_price",
  "offer_url",
  "metadata",
];

const FORBIDDEN_MIGRATION_PATTERNS = [
  /\bdrop\s+table\b/i,
  /\btruncate\b/i,
  /\bdelete\s+from\b/i,
  /\bdrop\s+column\b/i,
];

const DEFERRED_COLUMNS = ["environment", "schema_version", "event_schema_version", "payload_version", "visitor_id", "conversation_id", "turn_id"];

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

function read(path) {
  return readFileSync(path, "utf8");
}

function loadEnv() {
  const envFile = join(ROOT, ".env.local");
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL && existsSync(envFile)) {
    for (const line of read(envFile).split("\n")) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) process.env[match[1].trim()] = match[2].trim();
    }
  }
}

console.log("\nPATCH Analytics 1.4 — storage schema audit\n");

const migrationPath = join(ANALYTICS_DIR, "analytics-events-storage-schema-v1.sql");
const schemaDocPath = join(ANALYTICS_DIR, "ANALYTICS_SCHEMA.md");
const migration = read(migrationPath);
const schemaDoc = read(schemaDocPath);
const migrationExecutable = migration
  .replace(/--[^\n]*/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "");

assert("Migration file exists", migration.length > 0);
assert("ANALYTICS_SCHEMA.md exists", schemaDoc.length > 0);

for (const pattern of FORBIDDEN_MIGRATION_PATTERNS) {
  assert(`Migration has no destructive pattern ${pattern}`, !pattern.test(migrationExecutable));
}

assert("Migration creates analytics_events with IF NOT EXISTS", /create table if not exists public\.analytics_events/i.test(migration));
assert("Migration declares Storage Schema v1", /Storage Schema v1/i.test(migration));
assert("Migration enables RLS", /enable row level security/i.test(migration));
assert("Migration grants service_role insert", /grant select, insert on table public\.analytics_events to service_role/i.test(migration));

for (const column of OFFICIAL_COLUMNS) {
  assert(`Migration documents column ${column}`, new RegExp(`\\b${column}\\b`).test(migration));
}

for (const column of DEFERRED_COLUMNS) {
  const addsColumn = new RegExp(`\\b${column}\\s+(text|uuid|jsonb|integer|varchar)`, "i").test(migration);
  assert(`Migration does not add deferred column ${column}`, !addsColumn);
}

assert("Schema doc references migration file", schemaDoc.includes("analytics-events-storage-schema-v1.sql"));
assert("Schema doc declares v1", /Storage Schema v1/i.test(schemaDoc));
assert("Schema doc defers environment column", /Não existe.*environment|Sem coluna `environment`/i.test(schemaDoc));
assert("Schema doc defers event contract to FASE 2", /FASE 2/i.test(schemaDoc));

{
  const trackSource = read(join(ROOT, "pages/api/analytics/track/index.js"));
  for (const column of RUNTIME_WRITE_COLUMNS) {
    assert(`Track endpoint writes ${column}`, trackSource.includes(`${column}:`));
  }
  assert("Track endpoint targets analytics_events", trackSource.includes('"analytics_events"'));
}

{
  const allowlist = read(join(ROOT, "lib/miaAnalyticsAllowlist.js"));
  const publicEvents = [
    "session_started",
    "mia_question_sent",
    "mia_recommendation_shown",
    "offer_click",
    "favorite_created",
    "price_alert_created",
  ];
  for (const eventName of publicEvents) {
    assert(`Allowlist preserves ${eventName}`, allowlist.includes(`"${eventName}"`));
  }
}

{
  const dashboards = read(join(ANALYTICS_DIR, "DASHBOARDS.md"));
  assert("DASHBOARDS.md references ANALYTICS_SCHEMA.md", dashboards.includes("ANALYTICS_SCHEMA.md"));
}

{
  const scope = read(join(ANALYTICS_DIR, "analytics-production-scope.sql"));
  assert("Production scope still documents QA markers", scope.includes("price_alert_email_test"));
}

loadEnv();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (url && key) {
  try {
    const res = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
    });
    const openapi = await res.json();
    const table = openapi?.definitions?.analytics_events;
    const props = table?.properties ? Object.keys(table.properties).sort() : [];
    assert("Production OpenAPI exposes analytics_events", props.length > 0);
    assert("Production column count matches v1 (15)", props.length === 15);
    for (const column of OFFICIAL_COLUMNS) {
      assert(`Production has column ${column}`, props.includes(column));
    }
    for (const column of DEFERRED_COLUMNS) {
      assert(`Production does not expose deferred column ${column}`, !props.includes(column));
    }
  } catch (err) {
    assert(`Production OpenAPI inspection (${err.message})`, false);
  }
} else {
  console.log("  ℹ️  Skipping live Supabase inspection (credentials not loaded)");
}

console.log(`\nResultado: ${passed}/${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
