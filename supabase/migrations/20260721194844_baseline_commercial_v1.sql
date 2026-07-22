-- SUPABASE-06 — baseline_commercial_v1
-- Classification: baseline reconciliation (schema)
-- Source: remote public schema dump (read-only, SUPABASE-06)
-- Tables: commercial_products_cache, commercial_candidates
-- Idempotent: validate-or-create; no DROP/TRUNCATE/DELETE



begin;


CREATE TABLE IF NOT EXISTS "public"."commercial_products_cache" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_key" "text" NOT NULL,
    "product_name" "text" NOT NULL,
    "price" "text",
    "link" "text",
    "thumbnail" "text",
    "source" "text",
    "category" "text",
    "query" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "normalized_name" "text",
    "family_key" "text",
    "numeric_price" numeric,
    "is_valid" boolean DEFAULT true,
    "last_seen_at" timestamp with time zone DEFAULT "now"()
);

CREATE TABLE IF NOT EXISTS "public"."commercial_candidates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "raw_product_name" "text" NOT NULL,
    "normalized_query" "text",
    "category" "text",
    "suggested_official_name" "text",
    "suggested_specs" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "source" "text" DEFAULT 'mia_runtime'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_at" timestamp with time zone
);

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'commercial_products_cache_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."commercial_products_cache"
    ADD CONSTRAINT "commercial_products_cache_pkey" PRIMARY KEY ("id");
  END IF;
END $guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'commercial_products_cache_product_key_key'
  ) THEN
    ALTER TABLE ONLY "public"."commercial_products_cache"
    ADD CONSTRAINT "commercial_products_cache_product_key_key" UNIQUE ("product_key");
  END IF;
END $guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_specs_candidates_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."commercial_candidates"
    ADD CONSTRAINT "product_specs_candidates_pkey" PRIMARY KEY ("id");
  END IF;
END $guard$;

CREATE INDEX IF NOT EXISTS "commercial_products_cache_category_idx" ON "public"."commercial_products_cache" USING "btree" ("category");

CREATE INDEX IF NOT EXISTS "commercial_products_cache_updated_at_idx" ON "public"."commercial_products_cache" USING "btree" ("updated_at" DESC);

CREATE INDEX IF NOT EXISTS "product_specs_candidates_raw_product_name_idx" ON "public"."commercial_candidates" USING "btree" ("raw_product_name");

CREATE INDEX IF NOT EXISTS "product_specs_candidates_status_idx" ON "public"."commercial_candidates" USING "btree" ("status");


commit;
