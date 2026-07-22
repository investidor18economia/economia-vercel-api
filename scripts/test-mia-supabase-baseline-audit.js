#!/usr/bin/env node
/**
 * SUPABASE-06 — Baseline migration audit (local repository checks).
 */
import { createHash } from "node:crypto";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(ROOT, "supabase/migrations");
const PLANNING = join(ROOT, "supabase/planning");

const ANALYTICS = [
  "20260719153000_analytics_events_storage_schema_v1.sql",
  "20260719153001_analytics_events_storage_security_v1.sql",
];

const ANALYTICS_HASHES = {
  "20260719153000_analytics_events_storage_schema_v1.sql":
    "84FF4BB6DE8431578562BD0487CD63C85D199026FEC3ACD9D279CD7B24B041EA",
  "20260719153001_analytics_events_storage_security_v1.sql":
    "A512772634FB38316129EA0BA59553E074474DF04B22EF6B2E26A71DB6958678",
};

const BASELINE_CONCEPTS = [
  "baseline_foundation_v1",
  "baseline_catalog_v1",
  "baseline_users_v1",
  "baseline_conversation_v1",
  "baseline_engagement_v1",
  "baseline_commercial_v1",
  "baseline_commercial_vault_v1",
  "baseline_alerts_v1",
];

const BASELINE_TABLES = {
  baseline_foundation_v1: ["usage_log", "cache_results"],
  baseline_catalog_v1: ["phone_specs", "notebook_specs", "product_specs"],
  baseline_users_v1: ["users"],
  baseline_conversation_v1: ["conversations", "messages", "mia_sessions"],
  baseline_engagement_v1: ["wishes"],
  baseline_commercial_v1: ["commercial_products_cache", "commercial_candidates"],
  baseline_commercial_vault_v1: ["provider_credentials"],
  baseline_alerts_v1: ["price_alerts", "price_alert_delivery_logs"],
};

const FORBIDDEN = [
  /\bdrop\s+table\b/i,
  /\bdrop\s+column\b/i,
  /\btruncate\s+(table|only)\b/i,
  /\bdelete\s+from\b/i,
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

function sha256(path) {
  return createHash("sha256").update(read(path)).digest("hex").toUpperCase();
}

console.log("\nSUPABASE-06 — baseline audit\n");

const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

assert("Exactly 10 migrations", files.length === 10);
assert("Analytics migrations preserved", ANALYTICS.every((f) => files.includes(f)));

for (const file of ANALYTICS) {
  assert(`Analytics hash unchanged: ${file}`, sha256(join(MIGRATIONS_DIR, file)) === ANALYTICS_HASHES[file]);
}

assert("No artificial planning timestamps (20260701*)", !files.some((f) => /^20260701/.test(f)));

const baselineFiles = files.filter((f) => f.includes("_baseline_"));
assert("Eight baseline migrations present", baselineFiles.length === 8);

for (const concept of BASELINE_CONCEPTS) {
  const match = baselineFiles.find((f) => f.includes(`_${concept}.sql`));
  assert(`Baseline migration for ${concept}`, Boolean(match));
}

const timestamps = files.map((f) => f.slice(0, 14));
assert("Timestamps strictly sorted", timestamps.join(",") === [...timestamps].sort().join(","));
assert(
  "Analytics run before baseline chronologically",
  timestamps.indexOf("20260719153000") < timestamps.indexOf("20260721194830")
);

for (const file of baselineFiles) {
  const sql = read(join(MIGRATIONS_DIR, file));
  const executable = sql
    .replace(/--[^\n]*/g, "")
    .split("\n")
    .filter((line) => !/^\s*(revoke|grant)\b/i.test(line))
    .join("\n");
  assert(`${file} is transactional`, /\bbegin;/i.test(sql) && /\bcommit;/i.test(sql));
  for (const pattern of FORBIDDEN) {
    assert(`${file} has no forbidden ${pattern}`, !pattern.test(executable));
  }
  const concept = BASELINE_CONCEPTS.find((c) => file.includes(c));
  if (concept) {
    for (const table of BASELINE_TABLES[concept]) {
      assert(`${file} references table ${table}`, new RegExp(`"${table}"|${table}`, "i").test(sql));
    }
  }
}

const catalogFile = baselineFiles.find((f) => f.includes("catalog"));
const vaultFile = baselineFiles.find((f) => f.includes("vault"));
const alertsFile = baselineFiles.find((f) => f.includes("alerts"));

assert("Catalog migration includes RLS policies", /MIA read phone_specs/i.test(read(join(MIGRATIONS_DIR, catalogFile))));
assert("Vault migration enables RLS", /provider_credentials ENABLE ROW LEVEL SECURITY/i.test(read(join(MIGRATIONS_DIR, vaultFile))));
assert("Alerts migration secures delivery logs", /price_alert_delivery_logs ENABLE ROW LEVEL SECURITY/i.test(read(join(MIGRATIONS_DIR, alertsFile))));

assert("Baseline preflight SQL exists", existsSync(join(ROOT, "supabase/tests/baseline-preflight.sql")));
assert("Chronology decision doc exists", existsSync(join(PLANNING, "SUPABASE-06-chronology-decision.md")));
assert("Structural inventory doc exists", existsSync(join(PLANNING, "SUPABASE-06-structural-inventory.md")));
assert(
  "No secrets in baseline SQL",
  !/SUPABASE_SERVICE_ROLE_KEY|password\s*=|BEGIN PRIVATE KEY/i.test(
    baselineFiles.map((f) => read(join(MIGRATIONS_DIR, f))).join("\n")
  )
);

console.log(`\nResultado: ${passed}/${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
