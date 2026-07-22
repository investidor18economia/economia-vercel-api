-- PATCH 3.4 — Retention Foundation (indexes only; no schema columns)
-- Documentation: docs/analytics/RETENTION_FOUNDATION.md
--
-- Safe properties:
--   • Index-only (supports future DAU/WAU/MAU/cohort queries)
--   • No new tables
--   • No backfill / no data mutation
--   • Does NOT change RLS, grants, or policies

begin;

create index if not exists idx_analytics_events_visitor_id_created_at
  on public.analytics_events (visitor_id, created_at desc)
  where visitor_id is not null;

create index if not exists idx_analytics_events_user_id_created_at
  on public.analytics_events (user_id, created_at desc)
  where user_id is not null;

create index if not exists idx_analytics_events_conversation_id_created_at
  on public.analytics_events (conversation_id, created_at desc)
  where conversation_id is not null;

comment on index public.idx_analytics_events_visitor_id_created_at is
  'PATCH 3.4 — retention foundation: visitor activity timeline scans';

comment on index public.idx_analytics_events_user_id_created_at is
  'PATCH 3.4 — retention foundation: authenticated user activity timeline scans';

comment on index public.idx_analytics_events_conversation_id_created_at is
  'PATCH 3.4 — retention foundation: conversation thread timeline scans';

commit;
