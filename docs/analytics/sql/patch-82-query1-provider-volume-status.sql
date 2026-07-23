-- PATCH 8.2 — Q1 Volume and status by provider
with production_provider_attempt_events as (
  select *
  from analytics_events
  where event_name = 'mia_provider_attempt'
    and coalesce(metadata->>'event_version', '') = '8.2.0'
    and not (
      category in ('provider_attempt_test')
      or coalesce(metadata->>'controlled_test', '') = 'true'
    )
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from production_provider_attempt_events
),
metric_rows as (
  select
    'volume_status'::text as tipo_analise,
    'total_attempts'::text as metrica,
    coalesce(metadata->>'provider_id', 'unknown') as dimensao_valor,
    count(*) as valor_absoluto
  from production_provider_attempt_events
  group by 1, 2, 3

  union all

  select
    'volume_status',
    'success_rate',
    coalesce(metadata->>'provider_id', 'unknown'),
    count(*) filter (where coalesce(metadata->>'attempt_status', '') = 'SUCCESS')
  from production_provider_attempt_events
  group by 1, 2, 3

  union all

  select
    'volume_status',
    'empty_rate',
    coalesce(metadata->>'provider_id', 'unknown'),
    count(*) filter (where coalesce(metadata->>'attempt_status', '') = 'EMPTY')
  from production_provider_attempt_events
  group by 1, 2, 3

  union all

  select
    'volume_status',
    'failed_rate',
    coalesce(metadata->>'provider_id', 'unknown'),
    count(*) filter (where coalesce(metadata->>'attempt_status', '') = 'FAILED')
  from production_provider_attempt_events
  group by 1, 2, 3

  union all

  select
    'volume_status',
    'timeout_rate',
    coalesce(metadata->>'provider_id', 'unknown'),
    count(*) filter (where coalesce(metadata->>'attempt_status', '') = 'TIMEOUT')
  from production_provider_attempt_events
  group by 1, 2, 3

  union all

  select
    'volume_status',
    'skipped_rate',
    coalesce(metadata->>'provider_id', 'unknown'),
    count(*) filter (where coalesce(metadata->>'attempt_status', '') = 'SKIPPED')
  from production_provider_attempt_events
  group by 1, 2, 3

  union all

  select
    'volume_status',
    'usable_response_rate',
    coalesce(metadata->>'provider_id', 'unknown'),
    count(*) filter (where coalesce(metadata->>'response_usable', 'false') = 'true')
  from production_provider_attempt_events
  group by 1, 2, 3
)
select
  r.dia_referencia,
  m.tipo_analise,
  m.metrica,
  m.dimensao_valor as provider_id,
  m.valor_absoluto
from metric_rows m
cross join reference_day r
order by m.metrica, m.dimensao_valor;
