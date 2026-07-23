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
subset_totals as (
  select
    count(*) filter (
      where coalesce(metadata->>'outcome', '') in ('PARTIAL_SUCCESS', 'FALLBACK', 'NO_RESULT')
    ) as registros_total
  from production_response_events
),
partial_by_path as (
  select
    'resposta_incompleta_por_caminho'::text as tipo_analise,
    coalesce(nullif(trim(metadata->>'response_path'), ''), 'unknown') as dimensao_valor,
    coalesce(metadata->>'outcome', 'UNKNOWN') as metrica,
    count(*) as valor_absoluto
  from production_response_events
  where coalesce(metadata->>'outcome', '') in ('PARTIAL_SUCCESS', 'FALLBACK', 'NO_RESULT')
  group by 2, 3
),
fallback_delivery as (
  select
    'fallback_entrega'::text as tipo_analise,
    case
      when coalesce(metadata->>'has_offer_payload', '') = 'true' then 'with_offer_payload'
      when coalesce(metadata->>'reply_present', '') = 'true' then 'reply_only'
      else 'empty_delivery'
    end as dimensao_valor,
    'FALLBACK'::text as metrica,
    count(*) as valor_absoluto
  from production_response_events
  where coalesce(metadata->>'outcome', '') = 'FALLBACK'
  group by 2
),
dl_correlation as (
  select
    'correlacao_data_layer'::text as tipo_analise,
    coalesce(nullif(trim(metadata->>'data_layer_response_classification'), ''), 'none') as dimensao_valor,
    coalesce(metadata->>'outcome', 'UNKNOWN') as metrica,
    count(*) as valor_absoluto
  from production_response_events
  where coalesce(metadata->>'data_layer_correlation_present', '') = 'true'
  group by 2, 3
),
combined as (
  select * from partial_by_path
  union all select * from fallback_delivery
  union all select * from dl_correlation
)
select
  c.tipo_analise,
  c.metrica,
  null::text as dimensao,
  c.dimensao_valor,
  c.valor_absoluto,
  round(
    c.valor_absoluto::numeric / nullif(st.registros_total, 0),
    4
  ) as valor_relativo,
  st.registros_total,
  'respostas_parciais_ou_degradadas'::text as referencia_denominador,
  st.registros_total > 0 as amostra_analisavel,
  case
    when st.registros_total = 0 then 'sem_respostas_parciais_ou_degradadas'
    else null
  end as limitacao,
  rd.dia_referencia
from combined c
cross join subset_totals st
cross join reference_day rd
order by c.tipo_analise, c.dimensao_valor, c.metrica;
