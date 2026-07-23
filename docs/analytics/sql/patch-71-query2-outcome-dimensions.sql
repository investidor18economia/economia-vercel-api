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
path_outcomes as (
  select
    'outcome_por_caminho'::text as tipo_analise,
    'response_path'::text as dimensao,
    coalesce(nullif(trim(metadata->>'response_path'), ''), 'unknown') as dimensao_valor,
    coalesce(metadata->>'outcome', 'UNKNOWN') as metrica,
    count(*) as valor_absoluto
  from production_response_events
  group by 3, 4
),
intent_outcomes as (
  select
    'outcome_por_intencao'::text as tipo_analise,
    'intent'::text as dimensao,
    coalesce(nullif(trim(metadata->>'intent'), ''), 'unknown') as dimensao_valor,
    coalesce(metadata->>'outcome', 'UNKNOWN') as metrica,
    count(*) as valor_absoluto
  from production_response_events
  group by 3, 4
),
validity_outcomes as (
  select
    'outcome_por_validade'::text as tipo_analise,
    'response_validity'::text as dimensao,
    coalesce(nullif(trim(metadata->>'response_validity'), ''), 'unknown') as dimensao_valor,
    coalesce(metadata->>'outcome', 'UNKNOWN') as metrica,
    count(*) as valor_absoluto
  from production_response_events
  group by 3, 4
),
combined as (
  select * from path_outcomes
  union all select * from intent_outcomes
  union all select * from validity_outcomes
),
dimension_totals as (
  select
    tipo_analise,
    dimensao_valor,
    sum(valor_absoluto) as registros_total
  from combined
  group by 1, 2
)
select
  c.tipo_analise,
  c.metrica,
  c.dimensao,
  c.dimensao_valor,
  c.valor_absoluto,
  round(
    c.valor_absoluto::numeric / nullif(dt.registros_total, 0),
    4
  ) as valor_relativo,
  dt.registros_total,
  case
    when c.dimensao = 'response_path' then 'respostas_por_caminho'::text
    when c.dimensao = 'intent' then 'respostas_por_intencao'::text
    else 'respostas_por_validade'::text
  end as referencia_denominador,
  dt.registros_total > 0 as amostra_analisavel,
  null::text as limitacao,
  rd.dia_referencia
from combined c
join dimension_totals dt
  on dt.tipo_analise = c.tipo_analise
 and dt.dimensao_valor = c.dimensao_valor
cross join reference_day rd
order by c.tipo_analise, c.dimensao_valor, c.metrica;
