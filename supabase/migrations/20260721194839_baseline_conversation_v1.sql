-- SUPABASE-06 — baseline_conversation_v1
-- Classification: baseline reconciliation (schema)
-- Source: remote public schema dump (read-only, SUPABASE-06)
-- Tables: conversations, messages, mia_sessions
-- Idempotent: validate-or-create; no DROP/TRUNCATE/DELETE



begin;


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "gen_random_uuid"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);

CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" DEFAULT "gen_random_uuid"(),
    "role" "text",
    "content" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);

CREATE TABLE IF NOT EXISTS "public"."mia_sessions" (
    "session_key" "text" NOT NULL,
    "user_id" "text",
    "session_context" "jsonb" DEFAULT '{}'::"jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"()
);

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conversations_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");
  END IF;
END $guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'messages_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");
  END IF;
END $guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mia_sessions_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."mia_sessions"
    ADD CONSTRAINT "mia_sessions_pkey" PRIMARY KEY ("session_key");
  END IF;
END $guard$;


commit;
