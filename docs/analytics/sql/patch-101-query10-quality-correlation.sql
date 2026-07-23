-- PATCH 10.1 — Q10 Quality by provider + correlation with offer_set
with price_intel as (
  select
    metadata->>'request_id' as request_id,
    metadata
  from analytics_events
  where event_name = 'mia_price_intelligence'
    and coalesce(metadata->>'event_version', '') = '10.1.0'
    and not (category in ('price_intelligence_test'))
),
offer_set as (
  select metadata->>'request_id' as request_id
  from analytics_events
  where event_name = 'mia_offer_set'
    and coalesce(metadata->>'event_version', '') = '8.3.0'
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from analytics_events where event_name = 'mia_price_intelligence'
),
metric_rows as (
  select 'correlation'::text as tipo, 'price_intel_total'::text as metrica, count(*)::numeric as valor from price_intel
  union all
  select 'correlation', 'with_offer_set',
    count(*)::numeric from price_intel p join offer_set o on o.request_id = p.request_id
  union all
  select 'quality_by_provider', coalesce(p.metadata->>'winner_provider_id', 'UNKNOWN'),
    count(*)::numeric from price_intel p group by 2
)
select r.dia_referencia, m.tipo, m.metrica, m.valor from metric_rows m cross join reference_day r order by m.tipo, m.metrica;
