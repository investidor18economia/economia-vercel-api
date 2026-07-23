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
daily_totals as (
  select
    (created_at at time zone 'UTC')::date as dia,
    count(*) as registros_total
  from production_response_events
  group by 1
),
daily_outcomes as (
  select
    'evolucao_diaria'::text as tipo_analise,
    coalesce(metadata->>'outcome', 'UNKNOWN') as metrica,
    null::text as dimensao,
    to_char((created_at at time zone 'UTC')::date, 'YYYY-MM-DD') as dimensao_valor,
    count(*) as valor_absoluto
  from production_response_events
  group by 2, 4
),
capacity_rows as (
  select
    'capacidade_instrumentacao'::text as tipo_analise,
    'total_eventos_mia_response_outcome'::text as metrica,
    null::text as dimensao,
    coalesce(metadata->>'event_version', 'unknown') as dimensao_valor,
    count(*) as valor_absoluto
  from production_response_events
  group by 4

  union all

  select
    'capacidade_instrumentacao',
    'eventos_com_analytics_context',
    null,
    'session_or_visitor_present',
    count(*) filter (
      where session_id is not null or visitor_id is not null
    )
  from production_response_events

  union all

  select
    'gap_operacional_caminho',
    'caminhos_sem_outcome_success',
    'response_path',
    coalesce(nullif(trim(metadata->>'response_path'), ''), 'unknown'),
    count(*) filter (
      where coalesce(metadata->>'outcome', '') <> 'SUCCESS'
    )
  from production_response_events
  group by 4
  having count(*) filter (where coalesce(metadata->>'outcome', '') <> 'SUCCESS') > 0
),
combined as (
  select
    d.tipo_analise,
    d.metrica,
    d.dimensao,
    d.dimensao_valor,
    d.valor_absoluto,
    dt.registros_total
  from daily_outcomes d
  join daily_totals dt on dt.dia = d.dimensao_valor::date

  union all

  select
    c.tipo_analise,
    c.metrica,
    c.dimensao,
    c.dimensao_valor,
    c.valor_absoluto,
    (select count(*) from production_response_events) as registros_total
  from capacity_rows c
)
select
  c.tipo_analise,
  c.metrica,
  c.dimensao,
  c.dimensao_valor,
  c.valor_absoluto,
  round(
    c.valor_absoluto::numeric / nullif(c.registros_total, 0),
    4
  ) as valor_relativo,
  c.registros_total,
  case
    when c.tipo_analise = 'evolucao_diaria' then 'respostas_no_dia'::text
    else 'respostas_instrumentadas'::text
  end as referencia_denominador,
  c.registros_total > 0 as amostra_analisavel,
  case
    when c.registros_total = 0 then 'sem_eventos_apos_deploy_patch_71'
    else null
  end as limitacao,
  rd.dia_referencia
from combined c
cross join reference_day rd
order by c.tipo_analise, c.dimensao_valor, c.metrica;
