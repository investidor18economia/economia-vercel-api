-- PATCH 3.4 — Retention Foundation (reference queries only)
-- Source of truth: public.analytics_events (append-only)
-- Does NOT create tables, views, or materialized metrics.

-- ─────────────────────────────────────────────────────────────
-- 1. Visitor first / last activity
-- ─────────────────────────────────────────────────────────────

-- select
--   visitor_id,
--   min(created_at) as first_activity_at,
--   max(created_at) as last_activity_at,
--   min(created_at)::date as first_active_day,
--   max(created_at)::date as last_active_day,
--   count(distinct created_at::date) as active_day_count
-- from public.analytics_events
-- where visitor_id is not null
-- group by visitor_id;

-- ─────────────────────────────────────────────────────────────
-- 2. First session per visitor
-- ─────────────────────────────────────────────────────────────

-- select distinct on (visitor_id)
--   visitor_id,
--   session_id as first_session_id,
--   created_at as first_session_at
-- from public.analytics_events
-- where visitor_id is not null
--   and session_id is not null
-- order by visitor_id, created_at asc;

-- ─────────────────────────────────────────────────────────────
-- 3. First conversation per visitor
-- ─────────────────────────────────────────────────────────────

-- select distinct on (visitor_id)
--   visitor_id,
--   conversation_id as first_conversation_id,
--   created_at as first_conversation_at
-- from public.analytics_events
-- where visitor_id is not null
--   and conversation_id is not null
-- order by visitor_id, created_at asc;

-- ─────────────────────────────────────────────────────────────
-- 4. First login per user (PATCH 3.4 user_authenticated)
-- ─────────────────────────────────────────────────────────────

-- select distinct on (user_id)
--   user_id,
--   visitor_id,
--   session_id,
--   created_at as first_login_at
-- from public.analytics_events
-- where user_id is not null
--   and event_name = 'user_authenticated'
-- order by user_id, created_at asc;

-- Fallback when historical rows predate user_authenticated:
-- min(created_at) filter (where user_id is not null)

-- ─────────────────────────────────────────────────────────────
-- 5. Visitor → user identity link (prospective merge)
-- ─────────────────────────────────────────────────────────────

-- select
--   user_id,
--   array_agg(distinct visitor_id) as linked_visitor_ids,
--   min(created_at) filter (where event_name = 'user_authenticated') as first_login_at,
--   min(created_at) as first_authenticated_activity_at
-- from public.analytics_events
-- where user_id is not null
-- group by user_id;

-- ─────────────────────────────────────────────────────────────
-- 6. Daily active visitors (foundation for DAU — not computed here)
-- ─────────────────────────────────────────────────────────────

-- select
--   created_at::date as activity_day,
--   count(distinct visitor_id) as active_visitors
-- from public.analytics_events
-- where visitor_id is not null
-- group by 1
-- order by 1 desc;

-- Apply production filters from analytics-production-scope.sql before dashboards.
