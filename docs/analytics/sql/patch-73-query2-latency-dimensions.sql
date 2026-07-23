with production_latency_events as (
  select *
  from analytics_events
  where event_name = 'mia_latency_event'
    and category = 'reliability_latency'
    and not (
      coalesce(metadata->>'controlled_test', '') = 'true'
      or coalesce(metadata->>'not_market_real', '') = 'true'
      or category = 'reliability_latency_test'
    )
),
valid_durations as (
  select *
  from production_latency_events
  where coalesce(metadata->>'total_duration_ms', '') ~ '^[0-9]+(\.[0-9]+)?$'
    and (metadata->>'total_duration_ms')::numeric >= 0
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from production_latency_events
),
totals as (
  select count(*) as registros_total from valid_durations
),
dimension_rows as (
  select 'endpoint'::text as dimensao, coalesce(metadata->>'endpoint', 'unknown') as dimensao_valor,
    round(avg((metadata->>'total_duration_ms')::numeric)) as valor_absoluto,
    count(*) as cnt
  from valid_durations group by 1, 2
  union all
  select 'response_path', coalesce(metadata->>'response_path', 'unknown'),
    round(avg((metadata->>'total_duration_ms')::numeric)), count(*)
  from valid_durations group by 1, 2
  union all
  select 'intent', coalesce(metadata->>'intent', 'unknown'),
    round(avg((metadata->>'total_duration_ms')::numeric)), count(*)
  from valid_durations group by 1, 2
  union all
  select 'outcome', coalesce(metadata->>'response_outcome', 'unknown'),
    round(avg((metadata->>'total_duration_ms')::numeric)), count(*)
  from valid_durations group by 1, 2
  union all
  select 'provider', coalesce(metadata->>'provider', 'unknown'),
    round(avg((metadata->>'total_duration_ms')::numeric)), count(*)
  from valid_durations group by 1, 2
)
select
  'latencia_por_dimensao'::text as tipo_analise,
  'latency_by_' || dr.dimensao as metrica,
  dr.dimensao,
  dr.dimensao_valor,
  dr.valor_absoluto,
  round(dr.cnt::numeric / nullif(t.registros_total, 0), 4) as valor_relativo,
  t.registros_total,
  'requisicoes_com_duracao_valida'::text as referencia_denominador,
  t.registros_total > 0 as amostra_analisavel,
  case when t.registros_total = 0 then 'sem_eventos_apos_deploy_patch_73' else null end as limitacao,
  rd.dia_referencia
from dimension_rows dr
cross join totals t
cross join reference_day rd
order by dr.dimensao, dr.valor_absoluto desc nulls last;
