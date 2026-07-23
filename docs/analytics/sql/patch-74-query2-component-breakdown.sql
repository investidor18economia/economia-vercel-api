with production_response_events as (
  select * from analytics_events
  where event_name = 'mia_response_outcome' and category = 'reliability_response'
    and not (coalesce(metadata->>'controlled_test', '') = 'true')
),
production_error_events as (
  select * from analytics_events
  where event_name = 'mia_error_event' and category = 'reliability_error'
    and not (coalesce(metadata->>'controlled_test', '') = 'true')
),
production_latency_events as (
  select * from analytics_events
  where event_name = 'mia_latency_event' and category = 'reliability_latency'
    and not (coalesce(metadata->>'controlled_test', '') = 'true')
),
valid_latency as (
  select *, (metadata->>'total_duration_ms')::numeric as total_ms
  from production_latency_events
  where coalesce(metadata->>'total_duration_ms', '') ~ '^[0-9]+(\.[0-9]+)?$'
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from production_response_events
),
totals as (select count(*) as n from production_response_events),
breakdown as (
  select 'success'::text as component, count(*) filter (where metadata->>'outcome' = 'SUCCESS') as cnt
  from production_response_events
  union all select 'partial_success', count(*) filter (where metadata->>'outcome' = 'PARTIAL_SUCCESS') from production_response_events
  union all select 'fallback', count(*) filter (where metadata->>'outcome' = 'FALLBACK') from production_response_events
  union all select 'error_outcome', count(*) filter (where metadata->>'outcome' = 'ERROR') from production_response_events
  union all select 'error_events', count(*) from production_error_events
  union all select 'recovered_errors', count(*) filter (where metadata->>'recovered' = 'true') from production_error_events
  union all select 'latency_events', count(*) from valid_latency
  union all select 'slow_requests', count(*) filter (where metadata->>'slow_request' = 'true') from production_latency_events
  union all select 'request_volume', count(*) from production_response_events
)
select
  'health_component'::text as tipo_analise,
  'component_' || b.component as metrica,
  'component'::text as dimensao,
  b.component as dimensao_valor,
  b.cnt as valor_absoluto,
  round(b.cnt::numeric / nullif(t.n, 0), 4) as valor_relativo,
  t.n as registros_total,
  'respostas_instrumentadas_7_1'::text as referencia_denominador,
  t.n > 0 as amostra_analisavel,
  case when t.n = 0 then 'sem_dados_health_patch_74' else null end as limitacao,
  rd.dia_referencia
from breakdown b
cross join totals t
cross join reference_day rd
order by b.component;
