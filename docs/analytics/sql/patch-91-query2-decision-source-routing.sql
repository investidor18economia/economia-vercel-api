-- PATCH 9.1 — Q2 Decision source, routing mode, runtime mode distributions
with production_decision_events as (
  select *
  from analytics_events
  where event_name = 'mia_recommendation_decision'
    and coalesce(metadata->>'event_version', '') = '9.1.0'
    and not (category in ('recommendation_decision_test'))
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from production_decision_events
),
source_rows as (
  select 'decision_source'::text as dimensao,
    coalesce(nullif(metadata->>'decision_source', ''), 'UNKNOWN') as valor,
    count(*)::numeric as total
  from production_decision_events
  group by 1, 2
),
routing_rows as (
  select 'routing_mode'::text as dimensao,
    coalesce(nullif(metadata->>'routing_mode', ''), 'UNKNOWN') as valor,
    count(*)::numeric as total
  from production_decision_events
  group by 1, 2
),
runtime_rows as (
  select 'runtime_mode'::text as dimensao,
    coalesce(nullif(metadata->>'runtime_mode', ''), 'UNKNOWN') as valor,
    count(*)::numeric as total
  from production_decision_events
  group by 1, 2
),
combined as (
  select * from source_rows
  union all
  select * from routing_rows
  union all
  select * from runtime_rows
)
select r.dia_referencia, c.dimensao, c.valor, c.total
from combined c
cross join reference_day r
order by c.dimensao, c.total desc;
