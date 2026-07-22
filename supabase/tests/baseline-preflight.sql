-- SUPABASE-06 — Baseline preflight (read-only)
-- Execute against local or remote before repair/apply in SUPABASE-07.
-- Does not modify data.

-- A) Expected public application tables (16)
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_type = 'BASE TABLE'
order by table_name;

-- B) Foreign keys (expect zero in current Teilor-MIA evidence)
select
  tc.table_name,
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name as foreign_table_name,
  ccu.column_name as foreign_column_name
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
 and tc.table_schema = kcu.table_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name
 and ccu.table_schema = tc.table_schema
where tc.table_schema = 'public'
  and tc.constraint_type = 'FOREIGN KEY'
order by tc.table_name, tc.constraint_name;

-- C) RLS enabled tables
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity = true
order by c.relname;

-- D) Policies snapshot
select schemaname, tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- E) analytics_events column count (expect 15)
select count(*) as analytics_events_columns
from information_schema.columns
where table_schema = 'public'
  and table_name = 'analytics_events';

-- F) provider_credentials column count (expect 16)
select count(*) as provider_credentials_columns
from information_schema.columns
where table_schema = 'public'
  and table_name = 'provider_credentials';

-- G) price_alerts safety columns present
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'price_alerts'
  and column_name in (
    'normalized_product_key', 'monitoring_scope', 'last_checked_at',
    'check_count', 'email_send_count', 'created_reason'
  )
order by column_name;

-- PASS criteria (manual):
--   • 16 public tables listed in section A
--   • section B empty (no FK) OR documented exceptions
--   • analytics_events_columns = 15
--   • provider_credentials_columns = 16
--   • section G returns 6 rows
