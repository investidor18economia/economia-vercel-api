-- PATCH 10.2 — Q6 Savings by calculation method
with savings as (
  select
    metadata->>'request_id' as request_id,
    coalesce(metadata->>'calculation_method', 'UNKNOWN') as calculation_method,
    coalesce(metadata->>'savings_type', 'UNKNOWN') as savings_type
  from analytics_events
  where event_name = 'mia_savings_estimation'
    and coalesce(metadata->>'event_version', '') = '10.2.0'
    and not (category in ('savings_estimation_test'))
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from analytics_events where event_name = 'mia_savings_estimation'
)
select r.dia_referencia,
  s.calculation_method,
  s.savings_type,
  count(distinct s.request_id)::bigint as decision_count,
  count(*)::bigint as event_count
from savings s
cross join reference_day r
group by 1, 2, 3
order by decision_count desc;
