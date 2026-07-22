-- PATCH Analytics 1.4 — Preflight (read-only)
-- Execute BEFORE applying supabase/migrations/*analytics_events*
-- Save outputs for audit trail.

-- A) Row count baseline
select count(*) as total_eventos_antes from public.analytics_events;

-- B) Min/max id sample for integrity check after migration
select min(created_at) as primeiro_evento, max(created_at) as ultimo_evento
from public.analytics_events;

-- C) Column inventory
select column_name, data_type, udt_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'analytics_events'
order by ordinal_position;

-- D) Existing indexes
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'analytics_events'
order by indexname;

-- E) RLS status
select c.relname, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'analytics_events';

-- F) Table privileges (GRANT level — separate from RLS policies)
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'analytics_events'
order by grantee, privilege_type;

-- G) RLS policies (must be empty or non-browser before security migration)
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'analytics_events'
order by policyname;

-- H) Event distribution snapshot
select event_name, count(*) as total
from public.analytics_events
group by event_name
order by total desc;

-- Preflight PASS criteria for schema migration:
--   • 15 columns with expected types (see ANALYTICS_SCHEMA.md)
--   • total_eventos_antes recorded
--
-- Preflight PASS criteria for security migration (20260719153001_*):
--   • query G returns zero rows OR only service_role-safe policies
--   • if any policy grants anon/authenticated/public → STOP, do not apply security migration
