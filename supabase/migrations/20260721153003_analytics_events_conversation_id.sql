-- PATCH 3.2 — conversation_id (Identity Layer)
-- Classification: additive schema extension (Analytics Storage Schema v1 + PATCH 3.2)
-- Documentation: docs/analytics/CONVERSATION_ID.md
--
-- Safe properties:
--   • ADD COLUMN only (nullable uuid)
--   • No DROP / TRUNCATE / DELETE
--   • No backfill of historical rows
--   • Does NOT change RLS, grants, or policies

begin;

alter table public.analytics_events
  add column if not exists conversation_id uuid null;

comment on column public.analytics_events.conversation_id is
  'Anonymous chat thread identity (PATCH 3.2). Nullable for session-only events, server-side events, and historical rows. Not session_id, not visitor_id, not user_id.';

create index if not exists idx_analytics_events_conversation_id
  on public.analytics_events (conversation_id)
  where conversation_id is not null;

commit;
