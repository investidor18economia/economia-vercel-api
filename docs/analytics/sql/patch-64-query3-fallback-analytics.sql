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
  select count(*) as registros_total from production_resolution_events
),
fallback_rows as (
  select
    'fallback_por_tipo'::text as tipo_analise,
    coalesce(nullif(trim(metadata->>'fallback_kind'), ''), 'unknown') as metrica,
    'fallback_kind'::text as dimensao,
    null::text as dimensao_valor,
    count(*) as valor_absoluto
  from production_resolution_events
  where coalesce(metadata->>'fallback_used', '') = 'true'
  group by 2

  union all

  select
    'fallback_por_categoria',
    coalesce(nullif(trim(category), ''), 'unknown'),
    'category',
    coalesce(metadata->>'fallback_kind', 'unknown'),
    count(*)
  from production_resolution_events
  where coalesce(metadata->>'fallback_used', '') = 'true'
  group by 2, 4

  union all

  select
    'fallback_por_caminho',
    coalesce(nullif(trim(metadata->>'response_path'), ''), 'unknown'),
    'response_path',
    coalesce(metadata->>'fallback_kind', 'unknown'),
    count(*)
  from production_resolution_events
  where coalesce(metadata->>'fallback_used', '') = 'true'
  group by 2, 4

  union all

  select
    'fallback_por_intencao',
    coalesce(nullif(trim(metadata->>'intent'), ''), 'unknown'),
    'intent',
    coalesce(metadata->>'fallback_kind', 'unknown'),
    count(*)
  from production_resolution_events
  where coalesce(metadata->>'fallback_used', '') = 'true'
  group by 2, 4
)
select
  fr.tipo_analise,
  fr.metrica,
  fr.dimensao,
  fr.dimensao_valor,
  fr.valor_absoluto,
  round(fr.valor_absoluto::numeric / nullif(t.registros_total, 0), 4) as valor_relativo,
  t.registros_total,
  'consultas_com_fallback'::text as referencia_denominador,
  fr.valor_absoluto > 0 as amostra_analisavel,
  case
    when t.registros_total = 0 then 'sem_eventos_apos_deploy_patch_64'
    when fr.valor_absoluto = 0 then 'nenhum_fallback_no_periodo'
    else null
  end as limitacao,
  rd.dia_referencia
from fallback_rows fr
cross join totals t
cross join reference_day rd
order by fr.tipo_analise, fr.valor_absoluto desc;
