with production_resolution_events as (
  select *
  from analytics_events
  where event_name = 'data_layer_resolution'
    and not (
      category in ('price_alert_email_test', 'price_alert_e2e_test', 'data_layer_usage_test')
      or event_name like 'price_drop_email_test_%'
      or event_name like 'price_drop_email_e2e_%'
      or coalesce(metadata->>'controlled_test', '') = 'true'
      or (
        event_name = 'session_started'
        and coalesce(metadata->>'user_agent', '') = 'test-agent'
      )
    )
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from production_resolution_events
),
totals as (
  select count(*) as registros_total
  from production_resolution_events
),
metric_rows as (
  select
    'efetividade_global'::text as tipo_analise,
    'data_layer_hit_rate'::text as metrica,
    null::text as dimensao,
    null::text as dimensao_valor,
    count(*) filter (
      where coalesce(metadata->>'data_layer_used', '') = 'true'
    ) as valor_absoluto
  from production_resolution_events

  union all

  select
    'efetividade_global',
    'fallback_rate',
    null,
    null,
    count(*) filter (
      where coalesce(metadata->>'fallback_used', '') = 'true'
    )
  from production_resolution_events

  union all

  select
    'efetividade_global',
    'hybrid_rate',
    null,
    null,
    count(*) filter (
      where coalesce(metadata->>'hybrid_response', '') = 'true'
    )
  from production_resolution_events

  union all

  select
    'efetividade_global',
    'full_coverage_rate',
    null,
    null,
    count(*) filter (
      where coalesce(metadata->>'response_classification', '') = 'FULL_DATA_LAYER'
    )
  from production_resolution_events

  union all

  select
    'efetividade_global',
    'partial_coverage_rate',
    null,
    null,
    count(*) filter (
      where coalesce(metadata->>'response_classification', '') = 'PARTIAL_DATA_LAYER'
    )
  from production_resolution_events

  union all

  select
    'efetividade_global',
    'fallback_only_rate',
    null,
    null,
    count(*) filter (
      where coalesce(metadata->>'response_classification', '') = 'FALLBACK_ONLY'
    )
  from production_resolution_events

  union all

  select
    'efetividade_global',
    'no_commercial_result_rate',
    null,
    null,
    count(*) filter (
      where coalesce(metadata->>'response_classification', '') = 'NO_COMMERCIAL_RESULT'
    )
  from production_resolution_events

  union all

  select
    'capacidade_instrumentacao',
    'total_eventos_data_layer_resolution',
    null,
    null,
    count(*)
  from production_resolution_events
)
select
  mr.tipo_analise,
  mr.metrica,
  mr.dimensao,
  mr.dimensao_valor,
  mr.valor_absoluto,
  round(
    mr.valor_absoluto::numeric / nullif(t.registros_total, 0),
    4
  ) as valor_relativo,
  t.registros_total,
  'consultas_comerciais_instrumentadas'::text as referencia_denominador,
  case
    when t.registros_total > 0 then true
    else false
  end as amostra_analisavel,
  case
    when t.registros_total = 0 then 'sem_eventos_apos_deploy_patch_64'
    else null
  end as limitacao,
  rd.dia_referencia
from metric_rows mr
cross join totals t
cross join reference_day rd
order by mr.tipo_analise, mr.metrica;
