-- PATCH 10.1 — Q5 Provider reliability (winner provider distribution)
with price_intel as (
  select metadata
  from analytics_events
  where event_name = 'mia_price_intelligence'
    and coalesce(metadata->>'event_version', '') = '10.1.0'
    and metadata->>'winner_provider_id' is not null
    and not (category in ('price_intelligence_test'))
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from analytics_events where event_name = 'mia_price_intelligence'
)
select r.dia_referencia,
  p.metadata->>'winner_provider_id' as winner_provider_id,
  count(*)::bigint as decision_count,
  count(*) filter (where coalesce(p.metadata->>'price_confidence', '') = 'HIGH')::bigint as high_confidence_count
from price_intel p
cross join reference_day r
group by 1, 2
order by decision_count desc
limit 20;
