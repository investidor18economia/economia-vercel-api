-- SUPABASE-06 — baseline_users_v1
-- Classification: baseline reconciliation (schema)
-- Source: remote public schema dump (read-only, SUPABASE-06)
-- Tables: users
-- Idempotent: validate-or-create; no DROP/TRUNCATE/DELETE



begin;


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plan" "text",
    "monthly_messages" bigint DEFAULT '0'::bigint,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "email" "text"
);

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");
  END IF;
END $guard$;


commit;
