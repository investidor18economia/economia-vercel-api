-- PATCH 10.2 — Q5 Total observed potential savings (not realized purchases)
with savings as (
  select
    metadata->>'request_id' as request_id,
    nullif(metadata->>'savings_amount', '')::numeric as savings_amount
  from analytics_events
  where event_name = 'mia_savings_estimation'
    and coalesce(metadata->>'event_version', '') = '10.2.0'
    and coalesce(metadata->>'savings_type', '') = 'OBSERVED'
    and nullif(metadata->>'savings_amount', '')::numeric > 0
    and not (category in ('savings_estimation_test'))
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from analytics_events where event_name = 'mia_savings_estimation'
)
select r.dia_referencia,
  count(distinct s.request_id)::bigint as decision_count,
  round(sum(s.savings_amount), 2) as total_observed_potential_savings
from savings s
cross join reference_day r
group by 1;
