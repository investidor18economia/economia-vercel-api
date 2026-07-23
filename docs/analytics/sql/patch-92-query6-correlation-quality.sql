-- PATCH 9.2 — Q6 Correlation quality
with signal_events as (
  select *
  from analytics_events
  where event_name = 'mia_recommendation_acceptance_signal'
    and coalesce(metadata->>'event_version', '') = '9.2.0'
    and not (category in ('recommendation_acceptance_signal_test'))
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from signal_events
),
metric_rows as (
  select 'correlation'::text as dimensao, coalesce(metadata->>'correlation_confidence', 'UNKNOWN') as valor, count(*)::numeric as total
  from signal_events group by 1, 2
  union all
  select 'correlation_method', coalesce(metadata->>'correlation_method', 'UNKNOWN'), count(*)::numeric from signal_events group by 1, 2
),
rates as (
  select
    'rate'::text as dimensao,
    'request_id_coverage'::text as valor,
    round(100.0 * sum(case when metadata->>'correlation_method' = 'REQUEST_ID' then 1 else 0 end) / nullif(count(*), 0), 2) as total
  from signal_events
  union all
  select 'rate', 'session_only_coverage',
    round(100.0 * sum(case when metadata->>'correlation_method' in ('SESSION_SEQUENCE','SESSION_PRODUCT_WINDOW') then 1 else 0 end) / nullif(count(*), 0), 2)
  from signal_events
)
select r.dia_referencia, x.dimensao, x.valor, x.total
from (select * from metric_rows union all select * from rates) x
cross join reference_day r
order by x.dimensao, x.total desc;
