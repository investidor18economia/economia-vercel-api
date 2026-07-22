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
daily_evolution as (
  select
    'evolucao_diaria'::text as tipo_analise,
    to_char((created_at at time zone 'UTC')::date, 'YYYY-MM-DD') as metrica,
    coalesce(metadata->>'response_classification', 'UNKNOWN') as dimensao_valor,
    'response_classification'::text as dimensao,
    count(*) as valor_absoluto
  from production_resolution_events
  group by 2, 3
),
category_gaps as (
  select
    'gap_operacional_categoria'::text as tipo_analise,
    coalesce(nullif(trim(category), ''), 'unknown') as metrica,
    case
      when count(*) filter (where metadata->>'response_classification' = 'NO_COMMERCIAL_RESULT') > 0
        then 'sem_cobertura_recorrente'
      when count(*) filter (where metadata->>'response_classification' = 'PARTIAL_DATA_LAYER') > 0
        then 'cobertura_parcial_recorrente'
      when count(*) filter (where metadata->>'response_classification' = 'FULL_DATA_LAYER') = count(*)
        then 'sempre_coberta'
      else 'mista'
    end as dimensao_valor,
    'gap_tipo'::text as dimensao,
    count(*) as valor_absoluto
  from production_resolution_events
  group by 2
),
capacity_panel as (
  select
    'capacidade_instrumentacao'::text as tipo_analise,
    'eventos_com_event_version'::text as metrica,
    'metadata'::text as dimensao,
    coalesce(metadata->>'event_version', 'legacy_sem_versao') as dimensao_valor,
    count(*) as valor_absoluto
  from production_resolution_events
  group by 4
),
empty_capacity_fallback as (
  select
    'capacidade_instrumentacao'::text as tipo_analise,
    'total_eventos_data_layer_resolution'::text as metrica,
    'instrumentacao'::text as dimensao,
    'sem_eventos'::text as dimensao_valor,
    0::bigint as valor_absoluto
  where not exists (select 1 from production_resolution_events)
),
combined as (
  select * from daily_evolution
  union all select * from category_gaps
  union all select * from capacity_panel
  union all select * from empty_capacity_fallback
),
scoped_totals as (
  select
    tipo_analise,
    sum(valor_absoluto) as registros_total
  from combined
  group by 1
)
select
  c.tipo_analise,
  c.metrica,
  c.dimensao,
  c.dimensao_valor,
  c.valor_absoluto,
  round(
    c.valor_absoluto::numeric / nullif(st.registros_total, 0),
    4
  ) as valor_relativo,
  st.registros_total,
  case
    when c.tipo_analise = 'evolucao_diaria' then 'eventos_no_dia_por_classificacao'
    when c.tipo_analise = 'gap_operacional_categoria' then 'consultas_por_categoria'
    else 'eventos_por_versao_contrato'
  end as referencia_denominador,
  st.registros_total > 0 as amostra_analisavel,
  case
    when st.registros_total = 0 then 'sem_eventos_apos_deploy_patch_64'
    when c.tipo_analise = 'gap_operacional_categoria'
      and c.dimensao_valor = 'sem_cobertura_recorrente'
      then 'gap_derivado_de_uso_real_nao_do_patch_61'
    when c.tipo_analise = 'capacidade_instrumentacao'
      and c.dimensao_valor = 'sem_eventos'
      then 'sem_eventos_apos_deploy_patch_64'
    else null
  end as limitacao,
  rd.dia_referencia
from combined c
join scoped_totals st using (tipo_analise)
cross join reference_day rd
order by c.tipo_analise, c.metrica, c.valor_absoluto desc;

