with production_response_events as (
  select *
  from analytics_events
  where event_name = 'mia_response_outcome'
    and category = 'reliability_response'
    and not (
      category in ('reliability_response_test', 'data_layer_usage_test')
      or coalesce(metadata->>'controlled_test', '') = 'true'
      or coalesce(metadata->>'not_market_real', '') = 'true'
    )
),
production_error_events as (
  select *
  from analytics_events
  where event_name = 'mia_error_event'
    and category = 'reliability_error'
    and not (
      category = 'reliability_error_test'
      or coalesce(metadata->>'controlled_test', '') = 'true'
      or coalesce(metadata->>'not_market_real', '') = 'true'
    )
),
production_latency_events as (
  select *
  from analytics_events
  where event_name = 'mia_latency_event'
    and category = 'reliability_latency'
    and not (
      category = 'reliability_latency_test'
      or coalesce(metadata->>'controlled_test', '') = 'true'
      or coalesce(metadata->>'not_market_real', '') = 'true'
    )
),
valid_latency as (
  select *, (metadata->>'total_duration_ms')::numeric as total_ms
  from production_latency_events
  where coalesce(metadata->>'total_duration_ms', '') ~ '^[0-9]+(\.[0-9]+)?$'
),
response_stats as (
  select
    count(*) as request_volume,
    count(*) filter (where coalesce(metadata->>'outcome', '') = 'SUCCESS') as success_count,
    count(*) filter (where coalesce(metadata->>'outcome', '') = 'PARTIAL_SUCCESS') as partial_success_count,
    count(*) filter (where coalesce(metadata->>'outcome', '') = 'ERROR') as error_outcome_count,
    count(*) filter (where coalesce(metadata->>'outcome', '') = 'FALLBACK') as fallback_count
  from production_response_events
),
error_stats as (
  select
    count(*) as error_event_count,
    count(distinct metadata->>'request_id') filter (
      where coalesce(metadata->>'request_id', '') <> ''
    ) as requests_with_error,
    count(*) filter (where coalesce(metadata->>'recovered', '') = 'true') as recovered_count,
    count(*) filter (where coalesce(metadata->>'recovered', '') = 'false') as unrecovered_count,
    count(*) filter (
      where coalesce(metadata->>'error_type', '') = 'UNKNOWN_ERROR'
         or coalesce(metadata->>'reason_code', '') = 'unknown_error'
    ) as unknown_count
  from production_error_events
),
latency_stats as (
  select
    count(*) as latency_sample_size,
    round(percentile_cont(0.95) within group (order by total_ms)) as p95_ms,
    round(percentile_cont(0.99) within group (order by total_ms)) as p99_ms,
    count(*) filter (where coalesce(metadata->>'slow_request', '') = 'true') as slow_count
  from valid_latency
),
gap_stats as (
  select count(*) as analytics_gap_count
  from production_response_events r
  left join production_latency_events l
    on l.metadata->>'request_id' = r.metadata->>'request_id'
  where coalesce(r.metadata->>'request_id', '') <> ''
    and l.id is null
),
reference_day as (
  select coalesce(
    max((created_at at time zone 'UTC')::date),
    current_date
  ) as dia_referencia
  from production_response_events
),
computed as (
  select
    rs.request_volume,
    rs.success_count,
    rs.partial_success_count,
    rs.error_outcome_count,
    rs.fallback_count,
    es.error_event_count,
    es.requests_with_error,
    es.recovered_count,
    es.unrecovered_count,
    es.unknown_count,
    ls.latency_sample_size,
    ls.p95_ms,
    ls.p99_ms,
    ls.slow_count,
    gs.analytics_gap_count,
    round(rs.success_count::numeric / nullif(rs.request_volume, 0), 4) as success_rate,
    round(rs.partial_success_count::numeric / nullif(rs.request_volume, 0), 4) as partial_success_rate,
    round(rs.error_outcome_count::numeric / nullif(rs.request_volume, 0), 4) as error_rate,
    round((rs.request_volume - rs.error_outcome_count)::numeric / nullif(rs.request_volume, 0), 4) as availability_rate,
    round(es.recovered_count::numeric / nullif(es.error_event_count, 0), 4) as recovered_error_rate,
    round(es.unrecovered_count::numeric / nullif(es.error_event_count, 0), 4) as unrecovered_error_rate,
    round(es.unknown_count::numeric / nullif(es.error_event_count, 0), 4) as unknown_error_rate,
    ls.p95_ms as latency_p95,
    ls.p99_ms as latency_p99,
    round(ls.slow_count::numeric / nullif(ls.latency_sample_size, 0), 4) as slow_request_rate,
    round(gs.analytics_gap_count::numeric / nullif(rs.request_volume, 0), 4) as analytics_gap_rate
  from response_stats rs
  cross join error_stats es
  cross join latency_stats ls
  cross join gap_stats gs
),
health_status_row as (
  select
    case
      when c.request_volume = 0 then 'INSUFFICIENT_DATA'
      when c.availability_rate < 0.90
        or coalesce(c.unrecovered_error_rate, 0) > 0.25
        or coalesce(c.error_rate, 0) > 0.35
        or (c.latency_sample_size >= 5 and coalesce(c.latency_p99, 0) >= 15000)
        then 'CRITICAL'
      when coalesce(c.error_rate, 0) > 0.20
        or coalesce(c.slow_request_rate, 0) > 0.40
        or coalesce(c.unknown_error_rate, 0) > 0.15
        then 'UNSTABLE'
      when coalesce(c.partial_success_rate, 0) > 0.40
        or coalesce(c.slow_request_rate, 0) > 0.20
        or (coalesce(c.recovered_error_rate, 0) > 0.30 and coalesce(c.error_rate, 0) > 0.05)
        then 'DEGRADED'
      else 'HEALTHY'
    end as health_status,
    c.*
  from computed c
),
metric_rows as (
  select 'health_overall'::text as tipo_analise, 'health_status'::text as metrica,
    null::text as dimensao, h.health_status as dimensao_valor, 1::bigint as valor_absoluto
  from health_status_row h
  union all
  select 'health_overall', 'availability_rate', 'pillar', 'availability',
    round(h.availability_rate * 10000)::bigint from health_status_row h
  union all
  select 'health_overall', 'success_rate', 'component', 'reliability',
    round(coalesce(h.success_rate, 0) * 10000)::bigint from health_status_row h
  union all
  select 'health_overall', 'error_rate', 'component', 'stability',
    round(coalesce(h.error_rate, 0) * 10000)::bigint from health_status_row h
  union all
  select 'health_overall', 'slow_request_rate', 'component', 'performance',
    round(coalesce(h.slow_request_rate, 0) * 10000)::bigint from health_status_row h
  union all
  select 'health_indicator', 'availability_rate', null, null,
    round(h.availability_rate * 10000)::bigint from health_status_row h
  union all
  select 'health_indicator', 'success_rate', null, null,
    round(h.success_rate * 10000)::bigint from health_status_row h
  union all
  select 'health_indicator', 'partial_success_rate', null, null,
    round(h.partial_success_rate * 10000)::bigint from health_status_row h
  union all
  select 'health_indicator', 'error_rate', null, null,
    round(h.error_rate * 10000)::bigint from health_status_row h
  union all
  select 'health_indicator', 'recovered_error_rate', null, null,
    round(coalesce(h.recovered_error_rate, 0) * 10000)::bigint from health_status_row h
  union all
  select 'health_indicator', 'unrecovered_error_rate', null, null,
    round(coalesce(h.unrecovered_error_rate, 0) * 10000)::bigint from health_status_row h
  union all
  select 'health_indicator', 'unknown_error_rate', null, null,
    round(coalesce(h.unknown_error_rate, 0) * 10000)::bigint from health_status_row h
  union all
  select 'health_indicator', 'latency_p95', null, null, coalesce(h.latency_p95, 0)::bigint from health_status_row h
  union all
  select 'health_indicator', 'latency_p99', null, null, coalesce(h.latency_p99, 0)::bigint from health_status_row h
  union all
  select 'health_indicator', 'slow_request_rate', null, null,
    round(coalesce(h.slow_request_rate, 0) * 10000)::bigint from health_status_row h
  union all
  select 'health_indicator', 'request_volume', null, null, h.request_volume from health_status_row h
  union all
  select 'health_indicator', 'analytics_gap_rate', null, null,
    round(coalesce(h.analytics_gap_rate, 0) * 10000)::bigint from health_status_row h
  union all
  select 'capacidade_instrumentacao', 'health_snapshot_sql_derived', null, null, 1::bigint
  from health_status_row h
)
select
  mr.tipo_analise,
  mr.metrica,
  mr.dimensao,
  mr.dimensao_valor,
  mr.valor_absoluto,
  round(
    case
      when mr.metrica in (
        'availability_rate', 'success_rate', 'partial_success_rate', 'error_rate',
        'recovered_error_rate', 'unrecovered_error_rate', 'unknown_error_rate',
        'slow_request_rate', 'analytics_gap_rate'
      ) then mr.valor_absoluto::numeric / 10000
      when mr.metrica = 'health_status' then null
      when mr.metrica in ('latency_p95', 'latency_p99') then null
      else mr.valor_absoluto::numeric / nullif((select request_volume from health_status_row), 0)
    end,
    4
  ) as valor_relativo,
  (select request_volume from health_status_row) as registros_total,
  case
    when mr.metrica in ('latency_p95', 'latency_p99') then 'requisicoes_latencia_valida'
    when mr.metrica like '%error%' and mr.metrica <> 'error_rate' then 'eventos_erro'
    else 'respostas_instrumentadas_7_1'
  end as referencia_denominador,
  (select request_volume from health_status_row) > 0 as amostra_analisavel,
  case
    when (select request_volume from health_status_row) = 0 then 'sem_dados_health_patch_74'
    when mr.metrica in ('latency_p95', 'latency_p99')
      and (select latency_sample_size from health_status_row) < 5
      then 'amostra_limitada_percentil'
    else null
  end as limitacao,
  rd.dia_referencia
from metric_rows mr
cross join reference_day rd
order by mr.tipo_analise, mr.metrica;
