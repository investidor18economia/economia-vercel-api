-- PATCH 10.2 — Q13 Verifiable vs unverified savings types
with savings as (
  select
    metadata->>'request_id' as request_id,
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
  count(distinct case when s.savings_type = 'OBSERVED' then s.request_id end)::bigint as observed_decisions,
  count(distinct case when s.savings_type = 'ESTIMATED' then s.request_id end)::bigint as estimated_decisions,
  count(distinct case when s.savings_type = 'UNVERIFIED' then s.request_id end)::bigint as unverified_decisions,
  count(distinct case when s.savings_type = 'VERIFIED' then s.request_id end)::bigint as verified_decisions,
  count(distinct s.request_id)::bigint as total_decisions
from savings s
cross join reference_day r
group by 1;
