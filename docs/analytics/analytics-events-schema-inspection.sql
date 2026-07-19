-- PATCH Analytics 1.4 — Read-only inspection queries
-- Execute no Supabase SQL Editor após aplicar analytics-events-storage-schema-v1.sql

-- 1) Colunas oficiais
select
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'analytics_events'
order by ordinal_position;

-- 2) Índices
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'analytics_events'
order by indexname;

-- 3) RLS
select relname, relrowsecurity
from pg_class
where relname = 'analytics_events';

-- 4) Grants (roles com privilégio na tabela)
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'analytics_events'
order by grantee, privilege_type;

-- 5) Volume (read-only)
select count(*) as total_eventos from public.analytics_events;

-- 6) Distribuição por event_name (amostra operacional)
select event_name, count(*) as total
from public.analytics_events
group by event_name
order by total desc
limit 20;
