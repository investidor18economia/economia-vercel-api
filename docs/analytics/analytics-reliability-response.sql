-- PATCH 7.1 — Response Reliability Analytics (read-only · analytics_events)
-- Runtime instrumentation: lib/miaResponseAnalytics.js · pages/api/chat-gpt4o.js
-- Event: mia_response_outcome (server-side INSERT)
-- NÃO duplica: PATCH 6.4 (efetividade Data Layer) · PATCH 7.2 (taxonomia de erro) · PATCH 7.3 (latência)
-- Production filter: docs/analytics/analytics-production-scope.sql + reliability_response_test exclusion
-- Regra Fase 6/7: valor_absoluto + valor_relativo + registros_total + referencia_denominador
--
-- Query 1 — Outcome overview (distribution · success · fallback · incomplete rates)
-- Query 2 — Outcome by response_path / intent / validity
-- Query 3 — Partial & fallback response analytics
-- Query 4 — Daily evolution · operational gaps · capacity panel

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 1 — Outcome overview
-- ═══════════════════════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 2 — Outcome by response_path / intent / validity
-- ═══════════════════════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 3 — Partial & fallback response analytics
-- ═══════════════════════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 4 — Daily evolution · operational gaps · capacity panel
-- ═══════════════════════════════════════════════════════════════════════════════

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
