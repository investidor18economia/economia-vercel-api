-- PATCH 3.1 — visitor_id (Identity Layer)
-- Classification: additive schema extension (Analytics Storage Schema v1 + PATCH 3.1)
-- Documentation: docs/analytics/VISITOR_ID.md
--
-- Safe properties:
--   • ADD COLUMN only (nullable uuid)
--   • No DROP / TRUNCATE / DELETE
--   • No backfill of historical rows
--   • Does NOT change RLS, grants, or policies

begin;

alter table public.analytics_events
  add column if not exists visitor_id uuid null;

comment on column public.analytics_events.visitor_id is
  'Anonymous persistent browser identity (PATCH 3.1). Nullable for historical rows and server-side events without browser context. Not session_id, not user_id.';

create index if not exists idx_analytics_events_visitor_id
  on public.analytics_events (visitor_id)
  where visitor_id is not null;

commit;
