#!/usr/bin/env node
/**
 * SUPABASE-01 — Local Supabase foundation audit.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SUPABASE_DIR = join(ROOT, "supabase");
const MIGRATIONS_DIR = join(SUPABASE_DIR, "migrations");

const REQUIRED_MIGRATIONS = [
  "20260719153000_analytics_events_storage_schema_v1.sql",
  "20260719153001_analytics_events_storage_security_v1.sql",
];

const FORBIDDEN_ROOT_PATTERNS = [
  /\bsupabase link\b/i,
  /\bsupabase db push\b/i,
  /\bsupabase db pull\b/i,
  /\bmigration repair\b/i,
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

console.log("\nSUPABASE-01 — local foundation audit\n");

assert("supabase/config.toml exists", existsSync(join(SUPABASE_DIR, "config.toml")));
assert("supabase/.gitignore exists", existsSync(join(SUPABASE_DIR, ".gitignore")));
assert("supabase/seed.sql exists", existsSync(join(SUPABASE_DIR, "seed.sql")));
assert("supabase/migrations directory exists", existsSync(MIGRATIONS_DIR));
assert("supabase/README.md exists", existsSync(join(SUPABASE_DIR, "README.md")));

{
  const config = read(join(SUPABASE_DIR, "config.toml"));
  assert("config.toml defines project_id", /project_id\s*=/.test(config));
  assert("config.toml enables db migrations", /\[db\.migrations\]/i.test(config));
  assert("config.toml db migrations enabled", /enabled\s*=\s*true/i.test(config));
}

{
  const pkg = JSON.parse(read(join(ROOT, "package.json")));
  assert("package.json pins supabase CLI devDependency", pkg.devDependencies?.supabase);
  assert("package.json has supabase:version script", pkg.scripts?.["supabase:version"]);
  assert("package.json has supabase:foundation test script", pkg.scripts?.["test:mia:supabase:foundation"]);
}

{
  const migrationFiles = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const file of REQUIRED_MIGRATIONS) {
    assert(`migration present: ${file}`, migrationFiles.includes(file));
  }
  assert("migration filenames follow timestamp convention", migrationFiles.every((f) => /^\d{14}_.+\.sql$/.test(f)));
}

{
  const pointer = read(join(ROOT, "docs/analytics/analytics-events-storage-schema-v1.sql"));
  assert("docs analytics SQL is reference-only", /REFERENCE ONLY/i.test(pointer));
  assert("docs pointer targets supabase/migrations", pointer.includes("supabase/migrations/"));
}

{
  const readme = read(join(SUPABASE_DIR, "README.md"));
  assert("README documents SUPABASE-01 scope", /SUPABASE-01/i.test(readme));
  assert("README forbids remote ops in this stage", /proibido|não.*link|SUPABASE-02/i.test(readme));
}

{
  const pkgLockExists = existsSync(join(ROOT, "package-lock.json"));
  assert("package-lock.json exists", pkgLockExists);
}

try {
  const result = spawnSync("npm", ["run", "supabase:version"], {
    cwd: ROOT,
    encoding: "utf8",
    shell: true,
  });
  const version = String(result.stdout || "").trim().split(/\r?\n/).pop() || "";
  assert(
    `Supabase CLI runnable (${version})`,
    result.status === 0 && /^\d+\.\d+\.\d+$/.test(version)
  );
} catch (err) {
  assert(`Supabase CLI runnable (${err.message})`, false);
}

console.log(`\nResultado: ${passed}/${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
