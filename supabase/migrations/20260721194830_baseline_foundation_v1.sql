-- SUPABASE-06 — baseline_foundation_v1
-- Classification: baseline reconciliation (schema)
-- Source: remote public schema dump (read-only, SUPABASE-06)
-- Tables: usage_log, cache_results
-- Idempotent: validate-or-create; no DROP/TRUNCATE/DELETE



begin;


CREATE TABLE IF NOT EXISTS "public"."usage_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "gen_random_uuid"(),
    "model" "text",
    "prompt_tokens" bigint,
    "completion_tokens" bigint,
    "cost" numeric,
    "created_at" timestamp with time zone DEFAULT "now"()
);

CREATE TABLE IF NOT EXISTS "public"."cache_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_name" "text",
    "price" "text",
    "link" "text"
);

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cache_results_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."cache_results"
    ADD CONSTRAINT "cache_results_pkey" PRIMARY KEY ("id");
  END IF;
END $guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'usage_log_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."usage_log"
    ADD CONSTRAINT "usage_log_pkey" PRIMARY KEY ("id");
  END IF;
END $guard$;

CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;



commit;
