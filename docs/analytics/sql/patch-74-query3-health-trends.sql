with production_response_events as (
  select *, (created_at at time zone 'UTC')::date as dia
  from analytics_events
  where event_name = 'mia_response_outcome' and category = 'reliability_response'
    and not (coalesce(metadata->>'controlled_test', '') = 'true')
),
production_error_events as (
  select *, (created_at at time zone 'UTC')::date as dia
  from analytics_events
  where event_name = 'mia_error_event' and category = 'reliability_error'
    and not (coalesce(metadata->>'controlled_test', '') = 'true')
),
daily_response as (
  select
    dia,
    count(*) as request_volume,
    round(count(*) filter (where metadata->>'outcome' = 'SUCCESS')::numeric / nullif(count(*), 0), 4) as success_rate,
    round(count(*) filter (where metadata->>'outcome' = 'ERROR')::numeric / nullif(count(*), 0), 4) as error_rate,
    round(count(*) filter (where metadata->>'outcome' = 'PARTIAL_SUCCESS')::numeric / nullif(count(*), 0), 4) as partial_success_rate
  from production_response_events
  group by dia
),
daily_errors as (
  select dia, count(*) as error_events
  from production_error_events
  group by dia
),
combined as (
  select
    dr.dia,
    dr.request_volume,
    dr.success_rate,
    dr.error_rate,
    dr.partial_success_rate,
    coalesce(de.error_events, 0) as error_events,
    case
      when dr.request_volume = 0 then 'INSUFFICIENT_DATA'
      when dr.error_rate > 0.20 then 'UNSTABLE'
      when dr.partial_success_rate > 0.40 then 'DEGRADED'
      else 'HEALTHY'
    end as daily_health_status
  from daily_response dr
  left join daily_errors de on de.dia = dr.dia
)
select
  'health_trend'::text as tipo_analise,
  'daily_health_status'::text as metrica,
  'day'::text as dimensao,
  c.dia::text as dimensao_valor,
  c.request_volume as valor_absoluto,
  c.error_rate as valor_relativo,
  c.request_volume as registros_total,
  'respostas_instrumentadas_7_1'::text as referencia_denominador,
  c.request_volume > 0 as amostra_analisavel,
  null::text as limitacao,
  c.dia as dia_referencia
from combined c
order by c.dia desc;
