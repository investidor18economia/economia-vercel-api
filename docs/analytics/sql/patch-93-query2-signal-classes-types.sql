-- PATCH 9.3 — Q2 Signal classes and types
with signal_events as (
  select *
  from analytics_events
  where event_name = 'mia_recommendation_rejection_signal'
    and coalesce(metadata->>'event_version', '') = '9.3.0'
    and not (category in ('recommendation_rejection_signal_test'))
    and coalesce((metadata->>'signal_valid')::boolean, false) = true
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from signal_events
)
select r.dia_referencia,
  s.metadata->>'signal_class' as signal_class,
  s.metadata->>'signal_type' as signal_type,
  s.metadata->>'evidence_strength' as evidence_strength,
  count(*)::bigint as event_count,
  count(distinct s.metadata->>'decision_request_id')::bigint as unique_decisions,
  count(distinct s.session_id)::bigint as unique_sessions
from signal_events s
cross join reference_day r
group by 1, 2, 3, 4
order by event_count desc;
