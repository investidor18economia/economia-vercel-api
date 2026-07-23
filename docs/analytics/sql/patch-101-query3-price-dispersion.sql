-- PATCH 10.1 — Q3 Price dispersion averages
with price_intel as (
  select metadata
  from analytics_events
  where event_name = 'mia_price_intelligence'
    and coalesce(metadata->>'event_version', '') = '10.1.0'
    and coalesce((metadata->>'price_sample_count')::numeric, 0) > 0
    and not (category in ('price_intelligence_test'))
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from analytics_events where event_name = 'mia_price_intelligence'
)
select r.dia_referencia,
  count(*)::bigint as sample_size,
  round(avg((metadata->>'price_range')::numeric), 2) as avg_price_range,
  round(avg((metadata->>'price_range_percent')::numeric), 2) as avg_range_percent,
  round(avg((metadata->>'minimum_price')::numeric), 2) as avg_minimum_price,
  round(avg((metadata->>'maximum_price')::numeric), 2) as avg_maximum_price,
  round(avg((metadata->>'median_price')::numeric), 2) as avg_median_price
from price_intel p
cross join reference_day r
group by 1;
