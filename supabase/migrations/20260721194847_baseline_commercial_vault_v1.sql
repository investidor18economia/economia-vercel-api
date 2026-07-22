-- SUPABASE-06 — baseline_commercial_vault_v1
-- Classification: baseline reconciliation (schema)
-- Source: remote public schema dump (read-only, SUPABASE-06)
-- Tables: provider_credentials
-- Idempotent: validate-or-create; no DROP/TRUNCATE/DELETE



begin;


CREATE TABLE IF NOT EXISTS "public"."provider_credentials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider_id" "text" NOT NULL,
    "environment" "text" NOT NULL,
    "credential_type" "text" NOT NULL,
    "encrypted_payload" "text" NOT NULL,
    "encryption_iv" "text" NOT NULL,
    "encryption_auth_tag" "text" NOT NULL,
    "encryption_key_version" integer NOT NULL,
    "credential_version" integer DEFAULT 1 NOT NULL,
    "issued_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "scopes" "jsonb",
    "provider_account_id" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

COMMENT ON TABLE "public"."provider_credentials" IS 'Server-only encrypted provider credentials. Plaintext secrets are forbidden.';

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'provider_credentials_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."provider_credentials"
    ADD CONSTRAINT "provider_credentials_pkey" PRIMARY KEY ("id");
  END IF;
END $guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'provider_credentials_unique_provider_env_type'
  ) THEN
    ALTER TABLE ONLY "public"."provider_credentials"
    ADD CONSTRAINT "provider_credentials_unique_provider_env_type" UNIQUE ("provider_id", "environment", "credential_type");
  END IF;
END $guard$;

CREATE INDEX IF NOT EXISTS "idx_provider_credentials_expires_at" ON "public"."provider_credentials" USING "btree" ("expires_at");

CREATE INDEX IF NOT EXISTS "idx_provider_credentials_provider_env" ON "public"."provider_credentials" USING "btree" ("provider_id", "environment");


-- Commercial Vault security (fail-closed for browser roles)
ALTER TABLE public.provider_credentials ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.provider_credentials FROM anon, authenticated, PUBLIC;

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.provider_credentials TO service_role;



commit;
