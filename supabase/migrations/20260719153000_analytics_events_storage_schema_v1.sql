-- PATCH Analytics 1.4 — Analytics Storage Schema v1 (reconciliation)
-- Classification: baseline + reconciliation (existing production table)
-- Executable source of truth: supabase/migrations/
-- Documentation: docs/analytics/ANALYTICS_SCHEMA.md
--
-- Safe properties:
--   • No DROP / TRUNCATE / DELETE
--   • Fails on structural drift (does not silently accept mismatch)
--   • Idempotent indexes and comments
--   • Does NOT change RLS, grants, or policies (see 20260719153001_*)

begin;

-- ─────────────────────────────────────────────────────────────
-- 1. Create on empty database OR validate existing structure
-- ─────────────────────────────────────────────────────────────

do $$
declare
  table_exists boolean;
  col_count integer;
begin
  select exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'analytics_events'
  ) into table_exists;

  if not table_exists then
    create table public.analytics_events (
      id uuid primary key default gen_random_uuid(),
      event_name text not null,
      session_id text null,
      user_id uuid null,
      category text null,
      product_name text null,
      product_brand text null,
      product_id text null,
      query_text text null,
      recommendation_name text null,
      offer_store text null,
      offer_price numeric null,
      offer_url text null,
      metadata jsonb null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
    return;
  end if;

  select count(*)
  into col_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'analytics_events';

  if col_count <> 15 then
    raise exception
      'analytics_events reconciliation failed: expected 15 columns, found %',
      col_count;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'analytics_events'
      and column_name = 'id' and udt_name = 'uuid' and is_nullable = 'NO'
  ) then raise exception 'analytics_events drift: id uuid not null'; end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'analytics_events'
      and column_name = 'event_name' and udt_name = 'text' and is_nullable = 'NO'
  ) then raise exception 'analytics_events drift: event_name text not null'; end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'analytics_events'
      and column_name = 'session_id' and udt_name = 'text' and is_nullable = 'YES'
  ) then raise exception 'analytics_events drift: session_id text null'; end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'analytics_events'
      and column_name = 'user_id' and udt_name = 'uuid' and is_nullable = 'YES'
  ) then raise exception 'analytics_events drift: user_id uuid null'; end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'analytics_events'
      and column_name = 'category' and udt_name = 'text' and is_nullable = 'YES'
  ) then raise exception 'analytics_events drift: category text null'; end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'analytics_events'
      and column_name = 'product_name' and udt_name = 'text' and is_nullable = 'YES'
  ) then raise exception 'analytics_events drift: product_name text null'; end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'analytics_events'
      and column_name = 'product_brand' and udt_name = 'text' and is_nullable = 'YES'
  ) then raise exception 'analytics_events drift: product_brand text null'; end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'analytics_events'
      and column_name = 'product_id' and udt_name = 'text' and is_nullable = 'YES'
  ) then raise exception 'analytics_events drift: product_id text null'; end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'analytics_events'
      and column_name = 'query_text' and udt_name = 'text' and is_nullable = 'YES'
  ) then raise exception 'analytics_events drift: query_text text null'; end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'analytics_events'
      and column_name = 'recommendation_name' and udt_name = 'text' and is_nullable = 'YES'
  ) then raise exception 'analytics_events drift: recommendation_name text null'; end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'analytics_events'
      and column_name = 'offer_store' and udt_name = 'text' and is_nullable = 'YES'
  ) then raise exception 'analytics_events drift: offer_store text null'; end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'analytics_events'
      and column_name = 'offer_price' and udt_name = 'numeric' and is_nullable = 'YES'
  ) then raise exception 'analytics_events drift: offer_price numeric null'; end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'analytics_events'
      and column_name = 'offer_url' and udt_name = 'text' and is_nullable = 'YES'
  ) then raise exception 'analytics_events drift: offer_url text null'; end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'analytics_events'
      and column_name = 'metadata' and udt_name = 'jsonb' and is_nullable = 'YES'
  ) then raise exception 'analytics_events drift: metadata jsonb null'; end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'analytics_events'
      and column_name = 'created_at' and udt_name = 'timestamptz' and is_nullable = 'NO'
  ) then raise exception 'analytics_events drift: created_at timestamptz not null'; end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 2. Official comments (idempotent)
-- ─────────────────────────────────────────────────────────────

comment on table public.analytics_events is
  'Analytics Storage Schema v1 — append-only event log. Observational layer; never drives MIA cognition.';

comment on column public.analytics_events.id is
  'Primary key. Server-generated UUID.';
comment on column public.analytics_events.event_name is
  'Event identifier. Storage accepts public MIA events and legitimate server-side technical events. Event contract belongs to FASE 2.';
comment on column public.analytics_events.session_id is
  'Anonymous browser tab session (PATCH 1.1). Not user, visitor, device, conversation, DAU, or MAU.';
comment on column public.analytics_events.user_id is
  'Authenticated Supabase user UUID when available. Nullable for anonymous sessions.';
comment on column public.analytics_events.category is
  'Optional coarse category (e.g. product vertical or server-side QA category markers).';
comment on column public.analytics_events.product_name is
  'Product display name associated with the event, when applicable.';
comment on column public.analytics_events.product_brand is
  'Product brand associated with the event, when applicable.';
comment on column public.analytics_events.product_id is
  'Product identifier from Data Layer or offer context, when applicable.';
comment on column public.analytics_events.query_text is
  'User question text for question-oriented events. Not a secret field; still subject to ingestion limits in API allowlist.';
comment on column public.analytics_events.recommendation_name is
  'Recommended product name shown to the user, when applicable.';
comment on column public.analytics_events.offer_store is
  'Commercial provider or store label for offer-related events.';
comment on column public.analytics_events.offer_price is
  'Numeric offer price when applicable.';
comment on column public.analytics_events.offer_url is
  'Outbound offer URL when applicable.';
comment on column public.analytics_events.metadata is
  'JSONB bag for event-specific properties. Not the official event contract (FASE 2). Must not contain secrets.';
comment on column public.analytics_events.created_at is
  'Server insertion timestamp (timestamptz, UTC).';

-- ─────────────────────────────────────────────────────────────
-- 3. Operational indexes (PATCH 1.3 dashboards)
-- ─────────────────────────────────────────────────────────────
-- Justification:
--   event_name + created_at  → filtered aggregates / daily sessions
--   created_at desc          → time-ordered scans
--   session_id (partial)     → COUNT(DISTINCT session_id)
--   category (partial)       → production QA exclusion filters

create index if not exists idx_analytics_events_event_name_created_at
  on public.analytics_events (event_name, created_at desc);

create index if not exists idx_analytics_events_created_at
  on public.analytics_events (created_at desc);

create index if not exists idx_analytics_events_session_id
  on public.analytics_events (session_id)
  where session_id is not null;

create index if not exists idx_analytics_events_category
  on public.analytics_events (category)
  where category is not null;

commit;
