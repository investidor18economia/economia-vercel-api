-- PATCH Analytics 1.4 — Analytics Storage Security v1
-- Classification: security reconciliation (apply ONLY after preflight)
-- Prerequisite: 20260719153000_analytics_events_storage_schema_v1.sql
--
-- Apply this file only when preflight queries confirm:
--   • no unexpected RLS policies granting anon/authenticated access
--   • service_role already used by runtime writers
--
-- Fails safely when unexpected policies exist.

begin;

do $$
declare
  unexpected_policies integer;
begin
  select count(*)
  into unexpected_policies
  from pg_policies
  where schemaname = 'public'
    and tablename = 'analytics_events'
    and (
      'anon' = any(roles)
      or 'authenticated' = any(roles)
      or 'public' = any(roles)
    );

  if unexpected_policies > 0 then
    raise exception
      'analytics_events security baseline blocked: % unexpected policy(ies) for anon/authenticated/public. Inspect pg_policies before retry.',
      unexpected_policies;
  end if;
end $$;

-- Fail-closed for browser roles. No permissive policies are created here.
alter table public.analytics_events enable row level security;

revoke all on table public.analytics_events from anon, authenticated, public;

grant usage on schema public to service_role;
grant select, insert on table public.analytics_events to service_role;

-- Intentionally NO policies for anon/authenticated.
-- service_role bypasses RLS on Supabase (runtime uses SUPABASE_SERVICE_ROLE_KEY).

commit;
