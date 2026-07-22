-- PATCH 3.3 — Partial index for authenticated analytics queries.
-- Prerequisite: analytics_events.user_id uuid NULL (storage schema v1).
-- Additive, idempotent, no data mutation.

begin;

create index if not exists idx_analytics_events_user_id
  on public.analytics_events (user_id)
  where user_id is not null;

comment on column public.analytics_events.user_id is
  'Authenticated account identity (PATCH 3.3). Resolved server-side from verified MIA session token → public.users.id. Never trusted from client body on /api/analytics/track. Nullable for anonymous sessions and server-side events without ownership context.';

commit;
