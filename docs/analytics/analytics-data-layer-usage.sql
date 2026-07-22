-- PATCH 6.4 — Data Layer Usage & Effectiveness Analytics (read-only · analytics_events)
-- Runtime instrumentation: lib/miaDataLayerUsageAnalytics.js · pages/api/chat-gpt4o.js
-- Event: data_layer_resolution (server-side INSERT)
-- NÃO duplica: PATCH 6.1 (cobertura catálogo) · 6.2 (qualidade) · 6.3 (estatísticas inventário) · 4.5 (integridade analytics_events)
-- Production filter: docs/analytics/analytics-production-scope.sql + data_layer_usage_test exclusion
-- Regra Fase 6: valor_absoluto + valor_relativo + registros_total + referencia_denominador
--
-- Query 1 — Effectiveness overview (hit / fallback / hybrid / coverage rates)
-- Query 2 — Classification & practical coverage by category / brand / family
-- Query 3 — Fallback analytics (kind · path · intent)
-- Query 4 — Daily evolution · operational gaps · capacity panel

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 1 — Effectiveness overview
-- ═══════════════════════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 2 — Classification & practical coverage by category / brand / family
-- ═══════════════════════════════════════════════════════════════════════════════

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
category_totals as (
  select
    coalesce(nullif(trim(category), ''), 'unknown') as categoria,
    count(*) as registros_total
  from production_resolution_events
  group by 1
),
category_classification as (
  select
    'cobertura_por_categoria'::text as tipo_analise,
    coalesce(nullif(trim(category), ''), 'unknown') as dimensao_valor,
    coalesce(metadata->>'response_classification', 'UNKNOWN') as metrica,
    count(*) as valor_absoluto
  from production_resolution_events
  group by 2, 3
),
brand_classification as (
  select
    'cobertura_por_marca'::text as tipo_analise,
    coalesce(nullif(trim(product_brand), ''), 'unknown') as dimensao_valor,
    coalesce(metadata->>'response_classification', 'UNKNOWN') as metrica,
    count(*) as valor_absoluto
  from production_resolution_events
  group by 2, 3
),
family_classification as (
  select
    'cobertura_por_familia'::text as tipo_analise,
    coalesce(nullif(trim(metadata->>'model_family'), ''), 'unknown') as dimensao_valor,
    coalesce(metadata->>'response_classification', 'UNKNOWN') as metrica,
    count(*) as valor_absoluto
  from production_resolution_events
  group by 2, 3
),
combined as (
  select * from category_classification
  union all select * from brand_classification
  union all select * from family_classification
)
select
  c.tipo_analise,
  c.metrica,
  case
    when c.tipo_analise = 'cobertura_por_categoria' then 'category'
    when c.tipo_analise = 'cobertura_por_marca' then 'brand'
    else 'model_family'
  end as dimensao,
  c.dimensao_valor,
  c.valor_absoluto,
  round(
    c.valor_absoluto::numeric
    / nullif(
      case
        when c.tipo_analise = 'cobertura_por_categoria' then ct.registros_total
        else sum(c.valor_absoluto) over (partition by c.tipo_analise, c.dimensao_valor)
      end,
      0
    ),
    4
  ) as valor_relativo,
  case
    when c.tipo_analise = 'cobertura_por_categoria' then ct.registros_total
    else sum(c.valor_absoluto) over (partition by c.tipo_analise, c.dimensao_valor)
  end as registros_total,
  case
    when c.tipo_analise = 'cobertura_por_categoria' then 'consultas_por_categoria'
    when c.tipo_analise = 'cobertura_por_marca' then 'consultas_por_marca'
    else 'consultas_por_familia'
  end as referencia_denominador,
  case
    when c.tipo_analise = 'cobertura_por_categoria' then ct.registros_total > 0
    else sum(c.valor_absoluto) over (partition by c.tipo_analise, c.dimensao_valor) > 0
  end as amostra_analisavel,
  null::text as limitacao,
  rd.dia_referencia
from combined c
left join category_totals ct
  on c.tipo_analise = 'cobertura_por_categoria'
 and c.dimensao_valor = ct.categoria
cross join reference_day rd
order by c.tipo_analise, c.dimensao_valor, c.valor_absoluto desc;

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 3 — Fallback analytics (kind · response path · intent)
-- ═══════════════════════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 4 — Daily evolution · operational gaps · capacity panel
-- ═══════════════════════════════════════════════════════════════════════════════

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
