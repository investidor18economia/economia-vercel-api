with production_latency_events as (
  select *
  from analytics_events
  where event_name = 'mia_latency_event'
    and category = 'reliability_latency'
    and not (coalesce(metadata->>'controlled_test', '') = 'true' or category = 'reliability_latency_test')
),
production_response_events as (
  select * from analytics_events
  where event_name = 'mia_response_outcome'
    and not (coalesce(metadata->>'controlled_test', '') = 'true' or category = 'reliability_response_test')
),
production_error_events as (
  select * from analytics_events
  where event_name = 'mia_error_event'
    and category = 'reliability_error'
    and not (coalesce(metadata->>'controlled_test', '') = 'true' or category = 'reliability_error_test')
),
production_dl_events as (
  select * from analytics_events
  where event_name = 'data_layer_resolution'
    and not (coalesce(metadata->>'controlled_test', '') = 'true' or category = 'data_layer_usage_test')
),
valid_latency as (
  select *, (metadata->>'total_duration_ms')::numeric as total_ms
  from production_latency_events
  where coalesce(metadata->>'total_duration_ms', '') ~ '^[0-9]+(\.[0-9]+)?$'
),
stage_unnest as (
  select
    l.metadata->>'request_id' as request_id,
    s->>'stage' as stage,
    nullif(s->>'duration_ms', '')::numeric as duration_ms
  from valid_latency l
  cross join lateral jsonb_array_elements(coalesce(l.metadata->'stages', '[]'::jsonb)) s
  where coalesce(s->>'measurement_available', 'true') = 'true'
    and nullif(s->>'duration_ms', '') is not null
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from production_latency_events
),
totals as (select count(*) as n from valid_latency),
stage_stats as (
  select stage, round(avg(duration_ms)) as avg_ms, count(*) as cnt
  from stage_unnest group by stage
),
corr_outcome as (
  select
    coalesce(l.metadata->>'response_outcome', 'unknown') as outcome,
    round(avg(l.total_ms)) as avg_ms,
    count(*) as cnt
  from valid_latency l
  group by 1
),
corr_error as (
  select
    case when e.id is not null then 'with_error' else 'without_error' end as bucket,
    round(avg(l.total_ms)) as avg_ms,
    count(*) as cnt
  from valid_latency l
  left join production_error_events e
    on e.metadata->>'request_id' = l.metadata->>'request_id'
  group by 1
),
corr_dl as (
  select
    case when d.id is not null then 'with_data_layer_event' else 'without_data_layer_event' end as bucket,
    round(avg(l.total_ms)) as avg_ms,
    round(avg(nullif((d.metadata->>'query_duration_ms')::numeric, null))) as avg_dl_ms,
    count(*) as cnt
  from valid_latency l
  left join production_dl_events d
    on d.metadata->>'request_id' = l.metadata->>'request_id'
  group by 1
)
select 'latencia_por_etapa'::text as tipo_analise, 'latency_by_stage'::text as metrica,
  'stage'::text as dimensao, ss.stage as dimensao_valor, ss.avg_ms as valor_absoluto,
  round(ss.cnt::numeric / nullif(t.n, 0), 4) as valor_relativo, t.n as registros_total,
  'requisicoes_com_duracao_valida'::text as referencia_denominador,
  t.n > 0 as amostra_analisavel, null::text as limitacao, rd.dia_referencia
from stage_stats ss cross join totals t cross join reference_day rd
union all
select 'correlacao_7_1', 'latency_by_outcome', 'outcome', co.outcome, co.avg_ms,
  round(co.cnt::numeric / nullif(t.n, 0), 4), t.n, 'requisicoes_com_duracao_valida', t.n > 0, null, rd.dia_referencia
from corr_outcome co cross join totals t cross join reference_day rd
union all
select 'correlacao_7_2', 'latency_with_error_correlation', 'error_bucket', ce.bucket, ce.avg_ms,
  round(ce.cnt::numeric / nullif(t.n, 0), 4), t.n, 'requisicoes_com_duracao_valida', t.n > 0, null, rd.dia_referencia
from corr_error ce cross join totals t cross join reference_day rd
union all
select 'correlacao_6_4', 'latency_data_layer_correlation', 'data_layer_bucket', cd.bucket, cd.avg_ms,
  round(cd.cnt::numeric / nullif(t.n, 0), 4), t.n, 'requisicoes_com_duracao_valida', t.n > 0, null, rd.dia_referencia
from corr_dl cd cross join totals t cross join reference_day rd
order by tipo_analise, metrica, dimensao_valor;
