-- PATCH 10.2 — Q8 Savings by price quality (from 10.1 correlation)
with savings as (
  select
    metadata->>'request_id' as request_id,
    coalesce(metadata->>'price_quality', 'UNKNOWN') as price_quality,
    coalesce(metadata->>'savings_confidence', 'UNKNOWN') as savings_confidence
  from analytics_events
  where event_name = 'mia_savings_estimation'
    and coalesce(metadata->>'event_version', '') = '10.2.0'
    and coalesce(metadata->>'calculation_method', '') = 'WINNER_VS_MINIMUM'
    and not (category in ('savings_estimation_test'))
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from analytics_events where event_name = 'mia_savings_estimation'
)
select r.dia_referencia,
  s.price_quality,
  s.savings_confidence,
  count(distinct s.request_id)::bigint as decision_count
from savings s
cross join reference_day r
group by 1, 2, 3
order by decision_count desc;
