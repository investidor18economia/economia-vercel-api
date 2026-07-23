-- PATCH 10.2 — Q4 Potential savings amount avg/median (OBSERVED positive only)
with savings as (
  select
    metadata->>'request_id' as request_id,
    nullif(metadata->>'savings_amount', '')::numeric as savings_amount
  from analytics_events
  where event_name = 'mia_savings_estimation'
    and coalesce(metadata->>'event_version', '') = '10.2.0'
    and coalesce(metadata->>'savings_type', '') = 'OBSERVED'
    and coalesce(metadata->>'calculation_method', '') = 'WINNER_VS_MINIMUM'
    and nullif(metadata->>'savings_amount', '')::numeric > 0
    and not (category in ('savings_estimation_test'))
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from analytics_events where event_name = 'mia_savings_estimation'
)
select r.dia_referencia,
  count(distinct s.request_id)::bigint as decision_count,
  round(avg(s.savings_amount), 2) as avg_potential_savings,
  round((percentile_cont(0.5) within group (order by s.savings_amount))::numeric, 2) as median_potential_savings
from savings s
cross join reference_day r
group by 1;
