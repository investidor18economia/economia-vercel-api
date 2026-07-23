-- PATCH 10.2 — Q15 Estimation confidence by offer sample count
with savings as (
  select
    metadata->>'request_id' as request_id,
    coalesce(nullif(metadata->>'price_sample_count', '')::int, 0) as price_sample_count,
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
  case
    when s.price_sample_count >= 3 then '3+'
    when s.price_sample_count = 2 then '2'
    when s.price_sample_count = 1 then '1'
    else '0'
  end as sample_bucket,
  s.savings_confidence,
  count(distinct s.request_id)::bigint as decision_count
from savings s
cross join reference_day r
group by 1, 2, 3
order by sample_bucket, decision_count desc;
