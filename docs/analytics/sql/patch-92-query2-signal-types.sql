-- PATCH 9.2 — Q2 Signal type volumes (deduped by decision + signal type)
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
aggregated as (
  select
    coalesce(metadata->>'signal_type', 'UNKNOWN') as signal_type,
    coalesce(metadata->>'signal_strength', 'UNKNOWN') as signal_strength,
    count(*)::numeric as event_count,
    count(distinct metadata->>'decision_request_id')::numeric as unique_decision_count,
    count(distinct session_id)::numeric as unique_session_count
  from signal_events
  group by 1, 2
)
select r.dia_referencia, a.signal_type, a.signal_strength, a.event_count, a.unique_decision_count, a.unique_session_count
from aggregated a cross join reference_day r
order by a.event_count desc;
