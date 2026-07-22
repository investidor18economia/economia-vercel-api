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
const MIGRATIONS_DIR = join(ROOT, "supabase/migrations");

const SCHEMA_MIGRATION = join(
  MIGRATIONS_DIR,
  "20260719153000_analytics_events_storage_schema_v1.sql"
);
const SECURITY_MIGRATION = join(
  MIGRATIONS_DIR,
  "20260719153001_analytics_events_storage_security_v1.sql"
);
const REFERENCE_POINTER = join(ANALYTICS_DIR, "analytics-events-storage-schema-v1.sql");

const VISITOR_ID_MIGRATION = join(
  MIGRATIONS_DIR,
  "20260721153002_analytics_events_visitor_id.sql"
);

const CONVERSATION_ID_MIGRATION = join(
  MIGRATIONS_DIR,
  "20260721153003_analytics_events_conversation_id.sql"
);

const RETENTION_FOUNDATION_MIGRATION = join(
  MIGRATIONS_DIR,
  "20260722180000_analytics_retention_foundation_v1.sql"
);

const OFFICIAL_COLUMNS = [
  "id",
  "event_name",
  "session_id",
  "user_id",
  "visitor_id",
  "conversation_id",
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
  "visitor_id",
  "session_id",
  "conversation_id",
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

const DEFERRED_COLUMNS = [
  "environment",
  "schema_version",
  "event_schema_version",
  "payload_version",
  "turn_id",
];

const EXPECTED_INDEXES = [
  "idx_analytics_events_event_name_created_at",
  "idx_analytics_events_created_at",
  "idx_analytics_events_session_id",
  "idx_analytics_events_category",
  "idx_analytics_events_visitor_id",
  "idx_analytics_events_conversation_id",
];

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

function stripSqlComments(sql) {
  return sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
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

const schemaMigration = read(SCHEMA_MIGRATION);
const securityMigration = read(SECURITY_MIGRATION);
const referencePointer = read(REFERENCE_POINTER);
const schemaDoc = read(join(ANALYTICS_DIR, "ANALYTICS_SCHEMA.md"));
const schemaExecutable = stripSqlComments(schemaMigration);
const securityExecutable = stripSqlComments(securityMigration);

assert("Schema migration exists in supabase/migrations", schemaMigration.length > 0);
assert("Security migration exists in supabase/migrations", securityMigration.length > 0);
assert("supabase/README.md exists", existsSync(join(ROOT, "supabase/README.md")));
assert("ANALYTICS_SCHEMA.md exists", schemaDoc.length > 0);
assert("Preflight SQL exists", existsSync(join(ANALYTICS_DIR, "analytics-events-schema-preflight.sql")));

assert(
  "docs/analytics SQL is reference-only pointer",
  /REFERENCE ONLY/i.test(referencePointer) && !/create table/i.test(referencePointer)
);

for (const [label, sql] of [
  ["schema", schemaExecutable],
  ["security", securityExecutable],
]) {
  for (const pattern of FORBIDDEN_MIGRATION_PATTERNS) {
    assert(`${label} migration has no destructive pattern ${pattern}`, !pattern.test(sql));
  }
}

assert("Schema migration validates drift explicitly", /raise exception/i.test(schemaMigration));
assert("Schema migration is transactional", /\bbegin;/i.test(schemaMigration) && /\bcommit;/i.test(schemaMigration));
assert("Security migration is transactional", /\bbegin;/i.test(securityMigration) && /\bcommit;/i.test(securityMigration));
assert("Schema migration does not change RLS", !/enable row level security/i.test(schemaMigration));
assert("Security migration enables RLS", /enable row level security/i.test(securityMigration));
assert("Security migration grants service_role insert", /grant select, insert on table public\.analytics_events to service_role/i.test(securityMigration));
assert("Security migration blocks unexpected browser policies", /unexpected policy/i.test(securityMigration));

for (const column of OFFICIAL_COLUMNS.filter((c) => c !== "visitor_id" && c !== "conversation_id")) {
  assert(`Schema migration defines column ${column}`, new RegExp(`\\b${column}\\b`).test(schemaMigration));
}

assert("Visitor id migration exists in supabase/migrations", existsSync(VISITOR_ID_MIGRATION));

const visitorMigration = existsSync(VISITOR_ID_MIGRATION) ? read(VISITOR_ID_MIGRATION) : "";
const visitorExecutable = stripSqlComments(visitorMigration);

assert(
  "Visitor migration adds visitor_id column",
  /\bvisitor_id\b/i.test(visitorMigration) && /add column/i.test(visitorMigration)
);

for (const pattern of FORBIDDEN_MIGRATION_PATTERNS) {
  assert(`Visitor migration has no destructive pattern ${pattern}`, !pattern.test(visitorExecutable));
}

assert(
  "Visitor migration defines index idx_analytics_events_visitor_id",
  visitorMigration.includes("idx_analytics_events_visitor_id")
);

assert("Conversation id migration exists in supabase/migrations", existsSync(CONVERSATION_ID_MIGRATION));

const conversationMigration = existsSync(CONVERSATION_ID_MIGRATION) ? read(CONVERSATION_ID_MIGRATION) : "";
const conversationExecutable = stripSqlComments(conversationMigration);

assert(
  "Conversation migration adds conversation_id column",
  /\bconversation_id\b/i.test(conversationMigration) && /add column/i.test(conversationMigration)
);

for (const pattern of FORBIDDEN_MIGRATION_PATTERNS) {
  assert(`Conversation migration has no destructive pattern ${pattern}`, !pattern.test(conversationExecutable));
}

assert(
  "Conversation migration defines index idx_analytics_events_conversation_id",
  conversationMigration.includes("idx_analytics_events_conversation_id")
);

assert("Retention foundation migration exists in supabase/migrations", existsSync(RETENTION_FOUNDATION_MIGRATION));

const retentionMigration = existsSync(RETENTION_FOUNDATION_MIGRATION) ? read(RETENTION_FOUNDATION_MIGRATION) : "";
const retentionExecutable = stripSqlComments(retentionMigration);

for (const pattern of FORBIDDEN_MIGRATION_PATTERNS) {
  assert(`Retention migration has no destructive pattern ${pattern}`, !pattern.test(retentionExecutable));
}

assert(
  "Retention migration defines visitor timeline index",
  retentionMigration.includes("idx_analytics_events_visitor_id_created_at")
);
assert(
  "Retention migration defines user timeline index",
  retentionMigration.includes("idx_analytics_events_user_id_created_at")
);
assert(
  "Retention migration defines conversation timeline index",
  retentionMigration.includes("idx_analytics_events_conversation_id_created_at")
);
assert(
  "Retention migration has no new table",
  !/\bcreate\s+table\b/i.test(retentionExecutable)
);

for (const column of DEFERRED_COLUMNS) {
  const addsColumn = new RegExp(`\\b${column}\\s+(text|uuid|jsonb|integer|varchar)`, "i").test(
    `${schemaMigration}\n${securityMigration}`
  );
  assert(`Migrations do not add deferred column ${column}`, !addsColumn);
}

for (const indexName of EXPECTED_INDEXES.filter(
  (n) => n !== "idx_analytics_events_visitor_id" && n !== "idx_analytics_events_conversation_id"
)) {
  assert(`Schema migration defines index ${indexName}`, schemaMigration.includes(indexName));
}

assert(
  "Schema doc references supabase migration path",
  schemaDoc.includes("supabase/migrations/20260719153000_analytics_events_storage_schema_v1.sql")
);
assert("Schema doc declares v1", /Storage Schema v1/i.test(schemaDoc));
assert("Schema doc documents visitor_id", /\bvisitor_id\b/i.test(schemaDoc));
assert("Schema doc documents conversation_id", /\bconversation_id\b/i.test(schemaDoc));
assert("Schema doc defers environment column", /Não existe.*environment|Sem coluna `environment`/i.test(schemaDoc));
assert("Schema doc defers event contract to FASE 2", /FASE 2/i.test(schemaDoc));

{
  const trackSource = read(join(ROOT, "pages/api/analytics/track/index.js"));
  const supabaseClient = read(join(ROOT, "lib/supabaseClient.js"));
  for (const column of RUNTIME_WRITE_COLUMNS) {
    assert(`Track endpoint writes ${column}`, trackSource.includes(`${column}:`));
  }
  assert("Track endpoint targets analytics_events", trackSource.includes('"analytics_events"'));
  assert("Runtime uses service_role client", supabaseClient.includes("SUPABASE_SERVICE_ROLE_KEY"));
  assert("Frontend does not import supabase client", !existsSync(join(ROOT, "components/supabaseClient.js")));
}

{
  const allowlist = read(join(ROOT, "lib/miaAnalyticsAllowlist.js"));
  const publicEvents = [
    "session_started",
    "user_authenticated",
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
  assert("DASHBOARDS.md references supabase migrations", dashboards.includes("supabase/migrations/20260719153000"));
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
    if (props.includes("conversation_id")) {
      assert("Production column count matches v1 + visitor_id + conversation_id (17)", props.length === 17);
    } else if (props.includes("visitor_id")) {
      assert("Production column count matches v1 + visitor_id (16)", props.length === 16);
    } else {
      console.log("  ℹ️  Production migration 53002 not yet applied (15 columns)");
      assert("Production column count matches baseline v1 (15)", props.length === 15);
    }
    for (const column of OFFICIAL_COLUMNS) {
      if (column === "visitor_id" && !props.includes("visitor_id")) continue;
      if (column === "conversation_id" && !props.includes("conversation_id")) continue;
      assert(`Production has column ${column}`, props.includes(column));
    }
    for (const column of DEFERRED_COLUMNS) {
      assert(`Production does not expose deferred column ${column}`, !props.includes(column));
    }

    const countRes = await fetch(`${url}/rest/v1/analytics_events?select=id&limit=1`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "count=exact",
      },
    });
    assert("Production service_role can read analytics_events", countRes.ok);
  } catch (err) {
    assert(`Production OpenAPI inspection (${err.message})`, false);
  }
} else {
  console.log("  ℹ️  Skipping live Supabase inspection (credentials not loaded)");
}

console.log(`\nResultado: ${passed}/${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
