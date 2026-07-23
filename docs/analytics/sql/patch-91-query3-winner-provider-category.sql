-- PATCH 9.1 — Q3 Winner distribution by provider and category
with production_decision_events as (
  select *
  from analytics_events
  where event_name = 'mia_recommendation_decision'
    and coalesce(metadata->>'event_version', '') = '9.1.0'
    and not (category in ('recommendation_decision_test'))
    and coalesce((metadata->>'winner_present')::boolean, false) = true
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from production_decision_events
),
provider_rows as (
  select 'winner_provider'::text as dimensao,
    coalesce(nullif(metadata->>'winner_provider', ''), 'unknown') as valor,
    count(*)::numeric as total
  from production_decision_events
  group by 1, 2
),
category_rows as (
  select 'winner_category'::text as dimensao,
    coalesce(nullif(metadata->>'winner_category', ''), 'unknown') as valor,
    count(*)::numeric as total
  from production_decision_events
  group by 1, 2
),
combined as (
  select * from provider_rows
  union all
  select * from category_rows
)
select r.dia_referencia, c.dimensao, c.valor, c.total
from combined c
cross join reference_day r
order by c.dimensao, c.total desc;
