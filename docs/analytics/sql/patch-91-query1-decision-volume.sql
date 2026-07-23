-- PATCH 9.1 — Q1 Decision volume and completion
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
metric_rows as (
  select 'volume'::text as tipo_analise, 'decisions_total'::text as metrica, count(*)::numeric as valor_absoluto
  from production_decision_events
  union all
  select 'volume', 'decisions_completed',
    sum(case when coalesce((metadata->>'decision_completed')::boolean, false) then 1 else 0 end)::numeric
  from production_decision_events
  union all
  select 'volume', 'winner_present_total',
    sum(case when coalesce((metadata->>'winner_present')::boolean, false) then 1 else 0 end)::numeric
  from production_decision_events
  union all
  select 'volume', 'runner_up_present_total',
    sum(case when coalesce((metadata->>'runner_up_present')::boolean, false) then 1 else 0 end)::numeric
  from production_decision_events
  union all
  select 'volume', 'decision_valid_total',
    sum(case when coalesce((metadata->>'decision_valid')::boolean, false) then 1 else 0 end)::numeric
  from production_decision_events
)
select r.dia_referencia, m.tipo_analise, m.metrica, m.valor_absoluto
from metric_rows m
cross join reference_day r
order by m.metrica;
