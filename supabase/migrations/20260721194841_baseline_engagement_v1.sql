-- SUPABASE-06 — baseline_engagement_v1
-- Classification: baseline reconciliation (schema)
-- Source: remote public schema dump (read-only, SUPABASE-06)
-- Tables: wishes
-- Idempotent: validate-or-create; no DROP/TRUNCATE/DELETE



begin;


CREATE TABLE IF NOT EXISTS "public"."wishes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "product_name" "text",
    "product_url" "text",
    "price" numeric,
    "last_price" numeric,
    "query" "text",
    "last_checked" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wishes_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."wishes"
    ADD CONSTRAINT "wishes_pkey" PRIMARY KEY ("id");
  END IF;
END $guard$;


commit;
