with production_latency_events as (
  select *
  from analytics_events
  where event_name = 'mia_latency_event'
    and category = 'reliability_latency'
    and not (
      category in (
        'price_alert_email_test',
        'price_alert_e2e_test',
        'data_layer_usage_test',
        'reliability_response_test',
        'reliability_error_test',
        'reliability_latency_test'
      )
      or event_name like 'price_drop_email_test_%'
      or event_name like 'price_drop_email_e2e_%'
      or coalesce(metadata->>'controlled_test', '') = 'true'
      or coalesce(metadata->>'not_market_real', '') = 'true'
      or (
        event_name = 'session_started'
        and coalesce(metadata->>'user_agent', '') = 'test-agent'
      )
    )
),
valid_durations as (
  select
    *,
    nullif((metadata->>'total_duration_ms')::numeric, null) as total_duration_ms
  from production_latency_events
  where coalesce(metadata->>'total_duration_ms', '') ~ '^[0-9]+(\.[0-9]+)?$'
    and (metadata->>'total_duration_ms')::numeric >= 0
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from production_latency_events
),
latency_totals as (
  select count(*) as registros_total
  from production_latency_events
),
valid_totals as (
  select count(*) as registros_total
  from valid_durations
),
duration_stats as (
  select
    count(*) as n,
    round(avg(total_duration_ms)) as avg_ms,
    min(total_duration_ms) as min_ms,
    max(total_duration_ms) as max_ms,
    round(percentile_cont(0.50) within group (order by total_duration_ms)) as p50_ms,
    round(percentile_cont(0.75) within group (order by total_duration_ms)) as p75_ms,
    round(percentile_cont(0.90) within group (order by total_duration_ms)) as p90_ms,
    round(percentile_cont(0.95) within group (order by total_duration_ms)) as p95_ms,
    round(percentile_cont(0.99) within group (order by total_duration_ms)) as p99_ms,
    count(*) filter (where coalesce(metadata->>'slow_request', '') = 'true') as slow_count,
    count(*) filter (
      where coalesce((metadata->>'measurement_gap_count')::int, 0) > 0
    ) as measurement_gap_count
  from valid_durations
),
metric_rows as (
  select 'latencia_global'::text as tipo_analise, 'total_instrumented_requests'::text as metrica,
    null::text as dimensao, null::text as dimensao_valor, count(*)::bigint as valor_absoluto
  from production_latency_events
  union all
  select 'latencia_global', 'average_latency_ms', null, null, ds.avg_ms::bigint from duration_stats ds
  union all
  select 'latencia_global', 'minimum_latency_ms', null, null, ds.min_ms::bigint from duration_stats ds
  union all
  select 'latencia_global', 'maximum_latency_ms', null, null, ds.max_ms::bigint from duration_stats ds
  union all
  select 'latencia_global', 'p50_latency_ms', null, null, ds.p50_ms::bigint from duration_stats ds
  union all
  select 'latencia_global', 'p75_latency_ms', null, null, ds.p75_ms::bigint from duration_stats ds
  union all
  select 'latencia_global', 'p90_latency_ms', null, null, ds.p90_ms::bigint from duration_stats ds
  union all
  select 'latencia_global', 'p95_latency_ms', null, null, ds.p95_ms::bigint from duration_stats ds
  union all
  select 'latencia_global', 'p99_latency_ms', null, null, ds.p99_ms::bigint from duration_stats ds
  union all
  select 'latencia_global', 'slow_request_count', null, null, ds.slow_count::bigint from duration_stats ds
  union all
  select 'latencia_global', 'slow_request_rate', null, null, ds.slow_count::bigint from duration_stats ds
  union all
  select 'latencia_global', 'measurement_gap_count', null, null, ds.measurement_gap_count::bigint from duration_stats ds
  union all
  select 'latencia_global', 'measurement_gap_rate', null, null, ds.measurement_gap_count::bigint from duration_stats ds
  union all
  select 'capacidade_instrumentacao', 'total_eventos_mia_latency_event', null, null, count(*)::bigint
  from production_latency_events
)
select
  mr.tipo_analise,
  mr.metrica,
  mr.dimensao,
  mr.dimensao_valor,
  mr.valor_absoluto,
  round(
    mr.valor_absoluto::numeric / nullif(
      case
        when mr.metrica in ('slow_request_rate', 'measurement_gap_rate')
          then vt.registros_total
        when mr.metrica like 'p%_latency_ms' then vt.registros_total
        else lt.registros_total
      end,
      0
    ),
    4
  ) as valor_relativo,
  case
    when mr.metrica in ('slow_request_rate', 'measurement_gap_rate')
      then vt.registros_total
    when mr.metrica like 'p%_latency_ms' then vt.registros_total
    else lt.registros_total
  end as registros_total,
  case
    when mr.metrica in ('slow_request_rate', 'measurement_gap_rate')
      then 'requisicoes_com_duracao_valida'::text
    when mr.metrica like 'p%_latency_ms' then 'requisicoes_com_duracao_valida'::text
    else 'eventos_latencia'::text
  end as referencia_denominador,
  case
    when mr.metrica like 'p%_latency_ms' and vt.registros_total < 20 then false
    else lt.registros_total > 0
  end as amostra_analisavel,
  case
    when lt.registros_total = 0 then 'sem_eventos_apos_deploy_patch_73'
    when mr.metrica like 'p%_latency_ms' and vt.registros_total < 20 then 'amostra_limitada_percentil'
    else null
  end as limitacao,
  rd.dia_referencia
from metric_rows mr
cross join latency_totals lt
cross join valid_totals vt
cross join reference_day rd
order by mr.tipo_analise, mr.metrica;
