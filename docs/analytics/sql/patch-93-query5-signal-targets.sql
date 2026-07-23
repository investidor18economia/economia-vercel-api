-- PATCH 9.3 — Q5 Signal targets
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
  s.metadata->>'signal_target' as signal_target,
  s.metadata->>'signal_class' as signal_class,
  count(*)::bigint as event_count,
  count(distinct s.metadata->>'decision_request_id')::bigint as unique_decisions
from signal_events s
cross join reference_day r
group by 1, 2, 3
order by event_count desc;
