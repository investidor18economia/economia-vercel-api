with production_latency_events as (
  select *
  from analytics_events
  where event_name = 'mia_latency_event'
    and category = 'reliability_latency'
    and not (coalesce(metadata->>'controlled_test', '') = 'true' or category = 'reliability_latency_test')
),
valid_durations as (
  select *,
    (created_at at time zone 'UTC')::date as dia,
    (metadata->>'total_duration_ms')::numeric as total_ms,
    coalesce(metadata->>'latency_band', 'unknown') as latency_band,
    coalesce(metadata->>'event_version', 'unknown') as event_version,
    coalesce((metadata->>'measurement_gap_count')::int, 0) as gap_count
  from production_latency_events
  where coalesce(metadata->>'total_duration_ms', '') ~ '^[0-9]+(\.[0-9]+)?$'
),
reference_day as (
  select coalesce(max(dia), current_date) as dia_referencia from valid_durations
),
totals as (select count(*) as n from valid_durations),
daily as (
  select dia, count(*) as cnt, round(avg(total_ms)) as avg_ms
  from valid_durations group by dia
),
band_rows as (
  select latency_band as dimensao_valor, count(*) as cnt
  from valid_durations group by latency_band
),
version_rows as (
  select event_version as dimensao_valor, count(*) as cnt
  from valid_durations group by event_version
),
gap_rows as (
  select
    count(*) filter (where gap_count > 0) as gaps,
    count(*) as total
  from valid_durations
)
select 'evolucao_diaria'::text as tipo_analise, 'daily_latency_avg'::text as metrica,
  'day'::text as dimensao, d.dia::text as dimensao_valor, d.avg_ms as valor_absoluto,
  round(d.cnt::numeric / nullif(t.n, 0), 4) as valor_relativo, t.n as registros_total,
  'requisicoes_com_duracao_valida'::text as referencia_denominador, t.n > 0 as amostra_analisavel,
  case when t.n = 0 then 'sem_eventos_apos_deploy_patch_73' else null end as limitacao,
  rd.dia_referencia
from daily d cross join totals t cross join reference_day rd
union all
select 'faixa_latencia', 'latency_band_distribution', 'latency_band', br.dimensao_valor, br.cnt,
  round(br.cnt::numeric / nullif(t.n, 0), 4), t.n, 'requisicoes_com_duracao_valida', t.n > 0,
  null, rd.dia_referencia
from band_rows br cross join totals t cross join reference_day rd
union all
select 'versao_evento', 'event_version_distribution', 'event_version', vr.dimensao_valor, vr.cnt,
  round(vr.cnt::numeric / nullif(t.n, 0), 4), t.n, 'eventos_latencia', t.n > 0, null, rd.dia_referencia
from version_rows vr cross join totals t cross join reference_day rd
union all
select 'lacunas_medicao', 'measurement_gap_panel', 'gap_presence',
  case when gr.gaps > 0 then 'has_gaps' else 'no_gaps' end, gr.gaps,
  round(gr.gaps::numeric / nullif(gr.total, 0), 4), gr.total, 'eventos_latencia', gr.total > 0,
  case when gr.total = 0 then 'sem_eventos_apos_deploy_patch_73' else null end, rd.dia_referencia
from gap_rows gr cross join reference_day rd
order by tipo_analise, metrica, dimensao_valor;
