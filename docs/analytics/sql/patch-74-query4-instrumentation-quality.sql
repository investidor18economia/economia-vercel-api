with production_response_events as (
  select * from analytics_events where event_name = 'mia_response_outcome' and category = 'reliability_response'
    and not (coalesce(metadata->>'controlled_test', '') = 'true')
),
production_error_events as (
  select * from analytics_events where event_name = 'mia_error_event' and category = 'reliability_error'
    and not (coalesce(metadata->>'controlled_test', '') = 'true')
),
production_latency_events as (
  select * from analytics_events where event_name = 'mia_latency_event' and category = 'reliability_latency'
    and not (coalesce(metadata->>'controlled_test', '') = 'true')
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from production_response_events
),
coverage as (
  select
    count(*) as response_count,
    count(*) filter (where coalesce(metadata->>'event_version', '') = '7.1.0') as response_v71,
    (select count(*) from production_error_events) as error_count,
    (select count(*) filter (where coalesce(metadata->>'event_version', '') = '7.2.0') from production_error_events) as error_v72,
    (select count(*) from production_latency_events) as latency_count,
    (select count(*) filter (where coalesce(metadata->>'event_version', '') = '7.3.0') from production_latency_events) as latency_v73,
    count(*) filter (
      where coalesce(metadata->>'request_id', '') <> ''
        and not exists (
          select 1 from production_latency_events l
          where l.metadata->>'request_id' = production_response_events.metadata->>'request_id'
        )
    ) as missing_latency_by_request
  from production_response_events
),
metric_rows as (
  select 'event_coverage'::text as dimensao, 'patch_7_1_response_events'::text as metrica, '7.1'::text as dimensao_valor, c.response_count::bigint as valor_absoluto from coverage c
  union all select 'event_coverage', 'patch_7_2_error_events', '7.2', c.error_count::bigint from coverage c
  union all select 'event_coverage', 'patch_7_3_latency_events', '7.3', c.latency_count::bigint from coverage c
  union all select 'version_coverage', 'response_event_version_7_1_0', '7.1.0', c.response_v71::bigint from coverage c
  union all select 'version_coverage', 'error_event_version_7_2_0', '7.2.0', c.error_v72::bigint from coverage c
  union all select 'version_coverage', 'latency_event_version_7_3_0', '7.3.0', c.latency_v73::bigint from coverage c
  union all select 'analytics_gap', 'missing_latency_event_by_request_id', '7.3_gap', c.missing_latency_by_request::bigint from coverage c
)
select
  'instrumentation_quality'::text as tipo_analise,
  mr.metrica,
  mr.dimensao,
  mr.dimensao_valor,
  mr.valor_absoluto,
  round(mr.valor_absoluto::numeric / nullif(c.response_count, 0), 4) as valor_relativo,
  c.response_count as registros_total,
  'respostas_instrumentadas_7_1'::text as referencia_denominador,
  c.response_count > 0 as amostra_analisavel,
  case when c.response_count = 0 then 'sem_dados_health_patch_74' else null end as limitacao,
  rd.dia_referencia
from metric_rows mr
cross join coverage c
cross join reference_day rd
order by mr.metrica;
