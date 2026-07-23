-- PATCH 10.2 — Q11 Ineligibility reasons
with savings as (
  select
    metadata->>'request_id' as request_id,
    coalesce(metadata->>'eligibility_reason', 'UNKNOWN') as eligibility_reason
  from analytics_events
  where event_name = 'mia_savings_estimation'
    and coalesce(metadata->>'event_version', '') = '10.2.0'
    and coalesce((metadata->>'savings_estimation_eligible')::boolean, false) = false
    and not (category in ('savings_estimation_test'))
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from analytics_events where event_name = 'mia_savings_estimation'
)
select r.dia_referencia,
  s.eligibility_reason,
  count(distinct s.request_id)::bigint as decision_count
from savings s
cross join reference_day r
group by 1, 2
order by decision_count desc;
