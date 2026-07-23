-- PATCH 9.2 — Q4 Signal target distribution
with signal_events as (
  select *
  from analytics_events
  where event_name = 'mia_recommendation_acceptance_signal'
    and coalesce(metadata->>'event_version', '') = '9.2.0'
    and not (category in ('recommendation_acceptance_signal_test'))
    and coalesce((metadata->>'signal_valid')::boolean, false) = true
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from signal_events
),
targets as (
  select
    coalesce(metadata->>'signal_target', 'UNKNOWN') as signal_target,
    count(*)::numeric as event_count,
    count(distinct metadata->>'decision_request_id')::numeric as unique_decision_count
  from signal_events
  group by 1
)
select r.dia_referencia, t.signal_target, t.event_count, t.unique_decision_count
from targets t cross join reference_day r
order by t.event_count desc;
