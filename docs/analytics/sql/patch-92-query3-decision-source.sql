-- PATCH 9.2 — Q3 Acceptance signals by decision origin
with signal_events as (
  select s.*, d.metadata->>'decision_source' as joined_decision_source, d.metadata->>'routing_mode' as joined_routing_mode, d.metadata->>'runtime_mode' as joined_runtime_mode
  from analytics_events s
  left join analytics_events d
    on d.event_name = 'mia_recommendation_decision'
    and d.metadata->>'request_id' = s.metadata->>'decision_request_id'
  where s.event_name = 'mia_recommendation_acceptance_signal'
    and coalesce(s.metadata->>'event_version', '') = '9.2.0'
    and not (s.category in ('recommendation_acceptance_signal_test'))
    and coalesce((s.metadata->>'signal_valid')::boolean, false) = true
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from signal_events
),
pre_agg as (
  select
    coalesce(metadata->>'decision_source', joined_decision_source, 'UNKNOWN') as decision_source,
    coalesce(joined_routing_mode, 'UNKNOWN') as routing_mode,
    coalesce(joined_runtime_mode, 'UNKNOWN') as runtime_mode,
    coalesce(metadata->>'category', 'unknown') as category,
    coalesce(metadata->>'provider_id', 'unknown') as provider_id,
    count(distinct metadata->>'decision_request_id')::numeric as unique_decisions
  from signal_events
  group by 1, 2, 3, 4, 5
)
select r.dia_referencia, p.decision_source, p.routing_mode, p.runtime_mode, p.category, p.provider_id, p.unique_decisions
from pre_agg p cross join reference_day r
order by p.unique_decisions desc;
