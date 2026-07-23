-- PATCH 9.3 — Q4 Rejection by decision source / routing
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
  coalesce(s.metadata->>'decision_source', 'UNKNOWN') as decision_source,
  coalesce(s.metadata->>'routing_mode', 'UNKNOWN') as routing_mode,
  coalesce(s.metadata->>'runtime_mode', 'UNKNOWN') as runtime_mode,
  coalesce(s.metadata->>'provider_id', 'UNKNOWN') as provider_id,
  coalesce(s.metadata->>'category', 'UNKNOWN') as category,
  count(*)::bigint as event_count,
  count(distinct s.metadata->>'decision_request_id')::bigint as unique_decisions
from signal_events s
cross join reference_day r
group by 1, 2, 3, 4, 5, 6
order by event_count desc;
