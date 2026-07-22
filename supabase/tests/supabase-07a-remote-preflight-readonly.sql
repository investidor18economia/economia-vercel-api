-- SUPABASE-07A — Remote preflight bundle (SELECT only)
-- Do not add INSERT/UPDATE/DELETE/DDL.

-- 1) Public base tables (expect 16)
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_type = 'BASE TABLE'
order by table_name;

-- 2) Foreign keys (expect zero)
select count(*) as foreign_key_count
from information_schema.table_constraints
where table_schema = 'public'
  and constraint_type = 'FOREIGN KEY';

-- 3) RLS enabled tables
select c.relname as table_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity = true
order by c.relname;

-- 4) Policies snapshot
select tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 5) analytics_events columns (expect 15)
select count(*) as analytics_events_columns
from information_schema.columns
where table_schema = 'public'
  and table_name = 'analytics_events';

-- 6) analytics_events indexes
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'analytics_events'
order by indexname;

-- 7) analytics_events RLS
select c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'analytics_events';

-- 8) analytics_events grants
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'analytics_events'
order by grantee, privilege_type;

-- 9) analytics_events policies (expect zero before 53001)
select count(*) as analytics_events_policy_count
from pg_policies
where schemaname = 'public'
  and tablename = 'analytics_events';

-- 10) provider_credentials columns (expect 16)
select count(*) as provider_credentials_columns
from information_schema.columns
where table_schema = 'public'
  and table_name = 'provider_credentials';

-- 11) provider_credentials grants (expect service_role only with data privileges)
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'provider_credentials'
  and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
order by grantee, privilege_type;

-- 12) Remote migration history count (expect 0)
select count(*) as remote_migration_history_count
from supabase_migrations.schema_migrations;

-- 13) Aggregate row counts (no PII export)
select relname as table_name, n_live_tup::bigint as estimated_rows
from pg_stat_user_tables
where schemaname = 'public'
order by relname;
