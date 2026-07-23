-- PATCH 10.1 — Q4 Winner near lowest price
with price_intel as (
  select metadata
  from analytics_events
  where event_name = 'mia_price_intelligence'
    and coalesce(metadata->>'event_version', '') = '10.1.0'
    and coalesce((metadata->>'intelligence_valid')::boolean, false) = true
    and not (category in ('price_intelligence_test'))
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from analytics_events where event_name = 'mia_price_intelligence'
)
select r.dia_referencia,
  coalesce(p.metadata->>'winner_price_position', 'UNKNOWN') as winner_price_position,
  count(*)::bigint as decision_count
from price_intel p
cross join reference_day r
group by 1, 2
order by decision_count desc;
