-- PATCH 10.1 — Q2 Provider coverage
with price_intel as (
  select metadata
  from analytics_events
  where event_name = 'mia_price_intelligence'
    and coalesce(metadata->>'event_version', '') = '10.1.0'
    and not (category in ('price_intelligence_test'))
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from analytics_events where event_name = 'mia_price_intelligence'
),
metric_rows as (
  select 'coverage'::text as tipo, 'avg_provider_count'::text as metrica,
    round(avg((metadata->>'provider_count')::numeric), 2) as valor from price_intel
  union all
  select 'coverage', 'avg_price_sample_count', round(avg((metadata->>'price_sample_count')::numeric), 2) from price_intel
  union all
  select 'coverage', 'single_provider_rate',
    round(100.0 * count(*) filter (where (metadata->>'provider_count')::numeric = 1) / nullif(count(*), 0), 2)
  from price_intel
)
select r.dia_referencia, m.tipo, m.metrica, m.valor
from metric_rows m cross join reference_day r order by m.metrica;
