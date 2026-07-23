-- PATCH 10.2 — Q14 UI unverified assumption frequency
with savings as (
  select
    metadata->>'request_id' as request_id,
    nullif(metadata->>'savings_amount', '')::numeric as savings_amount,
    nullif(metadata->>'savings_percent', '')::numeric as savings_percent
  from analytics_events
  where event_name = 'mia_savings_estimation'
    and coalesce(metadata->>'event_version', '') = '10.2.0'
    and coalesce(metadata->>'calculation_method', '') = 'PERCENTAGE_ASSUMPTION'
    and coalesce(metadata->>'baseline_type', '') = 'ESTIMATED_UI_ASSUMPTION'
    and not (category in ('savings_estimation_test'))
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from analytics_events where event_name = 'mia_savings_estimation'
)
select r.dia_referencia,
  count(distinct s.request_id)::bigint as decision_count,
  round(avg(s.savings_amount), 2) as avg_ui_assumption_amount,
  round(avg(s.savings_percent), 2) as avg_ui_assumption_percent
from savings s
cross join reference_day r
group by 1;
