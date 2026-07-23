-- PATCH 10.2 — Q2 Savings nature distribution
with savings as (
  select
    metadata->>'request_id' as request_id,
    coalesce(metadata->>'savings_nature', 'UNKNOWN') as savings_nature
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
  s.savings_nature,
  count(distinct s.request_id)::bigint as decision_count,
  count(*)::bigint as event_count
from savings s
cross join reference_day r
group by 1, 2
order by decision_count desc;
