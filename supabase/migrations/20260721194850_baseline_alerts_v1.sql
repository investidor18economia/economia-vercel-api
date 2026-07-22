-- SUPABASE-06 — baseline_alerts_v1
-- Classification: baseline reconciliation (schema)
-- Source: remote public schema dump (read-only, SUPABASE-06)
-- Tables: price_alerts, price_alert_delivery_logs
-- Idempotent: validate-or-create; no DROP/TRUNCATE/DELETE



begin;


CREATE TABLE IF NOT EXISTS "public"."price_alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "user_email" "text",
    "product_name" "text" NOT NULL,
    "product_url" "text",
    "product_thumbnail" "text",
    "source" "text",
    "current_price" numeric,
    "last_checked_price" numeric,
    "target_price" numeric,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "normalized_product_key" "text",
    "monitoring_scope" "text" DEFAULT 'trusted_sources'::"text",
    "original_product_url" "text",
    "original_source" "text",
    "last_checked_at" timestamp with time zone,
    "last_found_price" numeric,
    "last_found_url" "text",
    "last_found_source" "text",
    "last_alert_sent_at" timestamp with time zone,
    "last_alert_sent_price" numeric,
    "last_alert_sent_url" "text",
    "last_alert_status" "text",
    "last_alert_error" "text",
    "check_count" integer DEFAULT 0,
    "email_send_count" integer DEFAULT 0,
    "created_reason" "text" DEFAULT 'user_monitor_button'::"text"
);

CREATE TABLE IF NOT EXISTS "public"."price_alert_delivery_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "alert_id" "uuid",
    "user_id" "text",
    "event_type" "text" NOT NULL,
    "severity" "text" DEFAULT 'info'::"text",
    "source" "text",
    "mode" "text",
    "product_name" "text",
    "normalized_product_key" "text",
    "target_price" numeric,
    "found_price" numeric,
    "found_source" "text",
    "found_url" "text",
    "email_sent" boolean DEFAULT false,
    "resend_result_id" "text",
    "reason" "text",
    "error_code" "text",
    "error_message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb"
);

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'price_alert_delivery_logs_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."price_alert_delivery_logs"
    ADD CONSTRAINT "price_alert_delivery_logs_pkey" PRIMARY KEY ("id");
  END IF;
END $guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'price_alerts_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."price_alerts"
    ADD CONSTRAINT "price_alerts_pkey" PRIMARY KEY ("id");
  END IF;
END $guard$;

CREATE INDEX IF NOT EXISTS "idx_price_alert_delivery_logs_alert_id" ON "public"."price_alert_delivery_logs" USING "btree" ("alert_id");

CREATE INDEX IF NOT EXISTS "idx_price_alert_delivery_logs_created_at" ON "public"."price_alert_delivery_logs" USING "btree" ("created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_price_alert_delivery_logs_event_type" ON "public"."price_alert_delivery_logs" USING "btree" ("event_type");

CREATE INDEX IF NOT EXISTS "idx_price_alert_delivery_logs_severity" ON "public"."price_alert_delivery_logs" USING "btree" ("severity");

CREATE INDEX IF NOT EXISTS "idx_price_alert_delivery_logs_source" ON "public"."price_alert_delivery_logs" USING "btree" ("source");

CREATE INDEX IF NOT EXISTS "idx_price_alert_delivery_logs_user_id" ON "public"."price_alert_delivery_logs" USING "btree" ("user_id");

CREATE INDEX IF NOT EXISTS "idx_price_alerts_is_active" ON "public"."price_alerts" USING "btree" ("is_active");

CREATE INDEX IF NOT EXISTS "idx_price_alerts_last_checked_at" ON "public"."price_alerts" USING "btree" ("last_checked_at");

CREATE INDEX IF NOT EXISTS "idx_price_alerts_normalized_product_key" ON "public"."price_alerts" USING "btree" ("normalized_product_key");

CREATE INDEX IF NOT EXISTS "idx_price_alerts_user_id" ON "public"."price_alerts" USING "btree" ("user_id");

CREATE INDEX IF NOT EXISTS "idx_price_alerts_user_product_active" ON "public"."price_alerts" USING "btree" ("user_id", "normalized_product_key", "is_active");


-- Alerts delivery logs security (service_role only)
ALTER TABLE public.price_alert_delivery_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.price_alert_delivery_logs FROM anon, authenticated, PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.price_alert_delivery_logs FROM PUBLIC;

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT ON TABLE public.price_alert_delivery_logs TO service_role;



commit;
