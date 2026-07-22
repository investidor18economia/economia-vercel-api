-- PATCH Analytics 1.4 — Postflight (read-only)
-- Execute AFTER each migration step.

-- STEP 1 — after 20260719153000_analytics_events_storage_schema_v1.sql

-- 1) Row count must match preflight
select count(*) as total_eventos_depois from public.analytics_events;

-- 2) Columns still 15
select count(*) as total_colunas
from information_schema.columns
where table_schema = 'public'
  and table_name = 'analytics_events';

-- 3) Expected indexes (4)
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'analytics_events'
  and indexname in (
    'idx_analytics_events_event_name_created_at',
    'idx_analytics_events_created_at',
    'idx_analytics_events_session_id',
    'idx_analytics_events_category'
  )
order by indexname;

-- 4) Table comment present
select obj_description('public.analytics_events'::regclass) as table_comment;

-- STEP 2 — after 20260719153001_analytics_events_storage_security_v1.sql

-- 5) RLS enabled
select c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'analytics_events';

-- 6) Grants — service_role only for SELECT/INSERT among app roles
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'analytics_events'
  and grantee in ('anon', 'authenticated', 'service_role', 'postgres')
order by grantee, privilege_type;

-- 7) No browser policies
select count(*) as browser_policies
from pg_policies
where schemaname = 'public'
  and tablename = 'analytics_events'
  and (
    'anon' = any(roles)
    or 'authenticated' = any(roles)
    or 'public' = any(roles)
  );

-- 8) Dashboard smoke (PATCH 1.3) — production overview fragment
select count(distinct session_id) filter (
  where session_id is not null
    and event_name in (
      'session_started',
      'mia_question_sent',
      'mia_recommendation_shown',
      'favorite_created',
      'price_alert_created',
      'offer_click'
    )
) as sessoes_unicas
from analytics_events
where not (
  category in ('price_alert_email_test', 'price_alert_e2e_test')
  or event_name like 'price_drop_email_test_%'
  or event_name like 'price_drop_email_e2e_%'
  or (
    event_name = 'session_started'
    and coalesce(metadata->>'user_agent', '') = 'test-agent'
  )
);

-- Postflight PASS:
--   total_eventos_depois = total_eventos_antes
--   total_colunas = 15
--   4 expected indexes present
--   rls_enabled = true (after step 2)
--   browser_policies = 0
--   service_role has SELECT + INSERT
