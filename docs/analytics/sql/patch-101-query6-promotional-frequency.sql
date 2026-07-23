-- PATCH 10.1 — Q6 Promotional price frequency
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
  select 'promotional'::text as tipo, 'decisions_total'::text as metrica, count(*)::numeric as valor from price_intel
  union all
  select 'promotional', 'promotional_observed',
    count(*)::numeric from price_intel where coalesce((metadata->>'promotional_price_observed')::boolean, false)
  union all
  select 'promotional', 'promotional_comparison_valid',
    count(*)::numeric from price_intel where coalesce((metadata->>'promotional_comparison_valid')::boolean, false)
)
select r.dia_referencia, m.tipo, m.metrica, m.valor from metric_rows m cross join reference_day r order by m.metrica;
