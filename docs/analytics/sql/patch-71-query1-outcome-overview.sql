with production_response_events as (
  select *
  from analytics_events
  where event_name = 'mia_response_outcome'
    and not (
      category in (
        'price_alert_email_test',
        'price_alert_e2e_test',
        'data_layer_usage_test',
        'reliability_response_test'
      )
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
  from production_response_events
),
totals as (
  select count(*) as registros_total
  from production_response_events
),
metric_rows as (
  select
    'confiabilidade_global'::text as tipo_analise,
    'total_responses'::text as metrica,
    null::text as dimensao,
    null::text as dimensao_valor,
    count(*) as valor_absoluto
  from production_response_events

  union all

  select
    'confiabilidade_global',
    'success_rate',
    null,
    null,
    count(*) filter (
      where coalesce(metadata->>'outcome', '') = 'SUCCESS'
    )
  from production_response_events

  union all

  select
    'confiabilidade_global',
    'partial_success_rate',
    null,
    null,
    count(*) filter (
      where coalesce(metadata->>'outcome', '') = 'PARTIAL_SUCCESS'
    )
  from production_response_events

  union all

  select
    'confiabilidade_global',
    'fallback_rate',
    null,
    null,
    count(*) filter (
      where coalesce(metadata->>'outcome', '') = 'FALLBACK'
    )
  from production_response_events

  union all

  select
    'confiabilidade_global',
    'no_result_rate',
    null,
    null,
    count(*) filter (
      where coalesce(metadata->>'outcome', '') = 'NO_RESULT'
    )
  from production_response_events

  union all

  select
    'confiabilidade_global',
    'timeout_rate',
    null,
    null,
    count(*) filter (
      where coalesce(metadata->>'outcome', '') = 'TIMEOUT'
    )
  from production_response_events

  union all

  select
    'confiabilidade_global',
    'error_rate',
    null,
    null,
    count(*) filter (
      where coalesce(metadata->>'outcome', '') = 'ERROR'
    )
  from production_response_events

  union all

  select
    'confiabilidade_global',
    'cancelled_rate',
    null,
    null,
    count(*) filter (
      where coalesce(metadata->>'outcome', '') = 'CANCELLED'
    )
  from production_response_events

  union all

  select
    'capacidade_instrumentacao',
    'total_eventos_mia_response_outcome',
    null,
    null,
    count(*)
  from production_response_events
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
  'respostas_instrumentadas'::text as referencia_denominador,
  case
    when t.registros_total > 0 then true
    else false
  end as amostra_analisavel,
  case
    when t.registros_total = 0 then 'sem_eventos_apos_deploy_patch_71'
    else null
  end as limitacao,
  rd.dia_referencia
from metric_rows mr
cross join totals t
cross join reference_day rd
order by mr.tipo_analise, mr.metrica;
