-- PATCH 9.3 — Q10 Quality / fan-out / dedup integrity
with signal_events as (
  select *
  from analytics_events
  where event_name = 'mia_recommendation_rejection_signal'
    and coalesce(metadata->>'event_version', '') = '9.3.0'
    and not (category in ('recommendation_rejection_signal_test'))
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from signal_events
),
dup_keys as (
  select metadata->>'dedup_key' as dedup_key, count(*)::bigint as cnt
  from signal_events
  where metadata->>'dedup_key' is not null
  group by 1
  having count(*) > 1
),
missing_decision as (
  select count(*)::bigint as cnt
  from signal_events
  where metadata->>'decision_request_id' is null
),
low_correlation_counted as (
  select count(*)::bigint as cnt
  from signal_events
  where coalesce((metadata->>'signal_valid')::boolean, false) = true
    and metadata->>'correlation_confidence' in ('LOW', 'UNRESOLVED')
),
metric_rows as (
  select 'quality'::text as tipo, 'total_events'::text as metrica, count(*)::numeric as valor from signal_events
  union all
  select 'quality', 'valid_signals', count(*)::numeric from signal_events where coalesce((metadata->>'signal_valid')::boolean, false) = true
  union all
  select 'quality', 'duplicate_dedup_keys', count(*)::numeric from dup_keys
  union all
  select 'quality', 'missing_decision_request_id', (select cnt::numeric from missing_decision)
  union all
  select 'quality', 'low_or_unresolved_valid', (select cnt::numeric from low_correlation_counted)
)
select r.dia_referencia, m.tipo, m.metrica, m.valor,
  case when m.metrica = 'duplicate_dedup_keys' then 'should be 0 after dedup' else null end as nota
from metric_rows m cross join reference_day r order by m.metrica;
