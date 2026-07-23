-- PATCH 9.1 — Q4 Score gap buckets and constraint flags
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
gap_rows as (
  select 'score_gap_bucket'::text as dimensao,
    case
      when metadata->>'score_gap' is null then 'null'
      when (metadata->>'score_gap')::numeric <= 0 then 'zero_or_negative'
      when (metadata->>'score_gap')::numeric <= 2 then '0_2'
      when (metadata->>'score_gap')::numeric <= 5 then '2_5'
      when (metadata->>'score_gap')::numeric <= 10 then '5_10'
      else '10_plus'
    end as valor,
    count(*)::numeric as total
  from production_decision_events
  group by 1, 2
),
constraint_rows as (
  select 'specific_product_lock'::text as dimensao, 'true'::text as valor,
    sum(case when coalesce((metadata->>'specific_product_lock')::boolean, false) then 1 else 0 end)::numeric as total
  from production_decision_events
  union all
  select 'anchor_preserved', 'true',
    sum(case when coalesce((metadata->>'anchor_preserved')::boolean, false) then 1 else 0 end)::numeric
  from production_decision_events
  union all
  select 'reset_applied', 'true',
    sum(case when coalesce((metadata->>'reset_applied')::boolean, false) then 1 else 0 end)::numeric
  from production_decision_events
  union all
  select 'budget_constraint', 'true',
    sum(case when coalesce((metadata->>'budget_constraint')::boolean, false) then 1 else 0 end)::numeric
  from production_decision_events
),
combined as (
  select * from gap_rows
  union all
  select * from constraint_rows
)
select r.dia_referencia, c.dimensao, c.valor, c.total
from combined c
cross join reference_day r
order by c.dimensao, c.total desc;
