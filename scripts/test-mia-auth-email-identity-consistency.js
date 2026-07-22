/**
 * PATCH 3.3A.1 — Email identity consistency tests.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MIA_AUTH_EMAIL_MAX_LENGTH,
  normalizeAuthEmail,
} from "../lib/miaAuthEmailNormalize.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

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

console.log("\nPATCH 3.3A.1 — email identity consistency tests\n");

{
  assert("trim + lowercase", normalizeAuthEmail("  User@Example.COM ") === "user@example.com");
  assert("preserves plus alias", normalizeAuthEmail("user+tag@example.com") === "user+tag@example.com");
  assert("preserves dots in local part", normalizeAuthEmail("first.last@example.com") === "first.last@example.com");
  assert("invalid without @ rejected", normalizeAuthEmail("invalid") === null);
  assert("empty rejected", normalizeAuthEmail("   ") === null);
  assert(
    "max length enforced",
    normalizeAuthEmail(`${"a".repeat(MIA_AUTH_EMAIL_MAX_LENGTH)}@x.com`) === null
  );
}

{
  const migration = readFileSync(
    join(ROOT, "supabase/migrations/20260722161000_mia_auth_email_identity_v1.sql"),
    "utf8"
  );
  assert("migration adds email_normalized column", /add column if not exists email_normalized/i.test(migration));
  assert("migration defines mia_normalize_auth_email", /create or replace function public\.mia_normalize_auth_email/i.test(migration));
  assert("migration backfill uses mia_normalize_auth_email", /mia_normalize_auth_email\(email\)/i.test(migration));
  assert("normalization function uses lower(btrim)", /lower\(btrim\(p_email\)\)/i.test(migration));
  assert("migration creates unique index on email_normalized", /idx_users_email_normalized_unique/i.test(migration));
  assert("migration fails on collision guard", /mia_auth_email_identity_collision/i.test(migration));
  assert("migration has no DELETE", !/\bdelete from public\.users\b/i.test(migration));
  assert("migration has no TRUNCATE", !/\btruncate\b/i.test(migration));
}

{
  const foundationMigration = readFileSync(
    join(ROOT, "supabase/migrations/20260722143000_mia_auth_trust_foundation_v1.sql"),
    "utf8"
  );
  assert(
    "foundation migration defers unique index",
    !/create unique index if not exists idx_users_email_normalized/i.test(foundationMigration)
  );
}

{
  const userModule = readFileSync(join(ROOT, "lib/miaAuthUser.js"), "utf8");
  assert("user lookup uses email_normalized", /\.eq\("email_normalized"/.test(userModule));
  assert("user insert sets email_normalized", /email_normalized:\s*emailNormalized/.test(userModule));
}

console.log(`\nResultado: ${passed}/${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
