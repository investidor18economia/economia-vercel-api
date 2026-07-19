-- PATCH Analytics 1.4 — Official Analytics Storage Schema v1
-- Teilor / MIA — executar manualmente no Supabase SQL Editor
--
-- Objetivo: fonte oficial, versionada e reproduzível do schema de armazenamento
--           da tabela public.analytics_events.
--
-- Versão: Analytics Storage Schema v1
-- Tabela: public.analytics_events
--
-- Regras deste patch:
--   • Não usa DROP TABLE, TRUNCATE ou DELETE
--   • Não recria a tabela existente
--   • Idempotente (pode rodar mais de uma vez)
--   • Compatível com produção já populada
--   • Não adiciona colunas de contrato de evento (FASE 2)
--   • Não adiciona environment / schema_version por linha
--
-- Pré-requisito: tabela analytics_events já existente em produção (criada manualmente
-- antes deste patch). Este arquivo formaliza o estado canônico v1.

-- ─────────────────────────────────────────────────────────────
-- 1. Tabela oficial — analytics_events (Storage Schema v1)
-- ─────────────────────────────────────────────────────────────

create table if not exists public.analytics_events (
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
-- 2. Índices operacionais (dashboards PATCH 1.3)
-- ─────────────────────────────────────────────────────────────

create index if not exists idx_analytics_events_created_at
  on public.analytics_events (created_at desc);

create index if not exists idx_analytics_events_event_name
  on public.analytics_events (event_name);

create index if not exists idx_analytics_events_session_id
  on public.analytics_events (session_id)
  where session_id is not null;

create index if not exists idx_analytics_events_category
  on public.analytics_events (category)
  where category is not null;

create index if not exists idx_analytics_events_event_name_created_at
  on public.analytics_events (event_name, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- 3. RLS + grants (fail closed for browser roles)
-- ─────────────────────────────────────────────────────────────
--
-- Backend oficial: lib/supabaseClient.js → SUPABASE_SERVICE_ROLE_KEY
-- service_role bypassa RLS no Supabase.

alter table public.analytics_events enable row level security;

revoke all on table public.analytics_events from anon, authenticated, public;

grant usage on schema public to service_role;
grant select, insert on table public.analytics_events to service_role;

-- Sem policies para anon/authenticated → PostgREST não expõe linhas ao browser.

-- ─────────────────────────────────────────────────────────────
-- 4. Validação read-only (descomente após aplicar)
-- ─────────────────────────────────────────────────────────────

-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'analytics_events'
-- order by ordinal_position;

-- select indexname, indexdef
-- from pg_indexes
-- where schemaname = 'public'
--   and tablename = 'analytics_events'
-- order by indexname;

-- select count(*) as total_eventos from public.analytics_events;
