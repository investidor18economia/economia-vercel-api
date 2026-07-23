-- PATCH 9.2 — Q8 Quality audit (fan-out, orphans, duplicates)
with acceptance_signals as (
  select *
  from analytics_events
  where event_name = 'mia_recommendation_acceptance_signal'
    and coalesce(metadata->>'event_version', '') = '9.2.0'
    and not (category in ('recommendation_acceptance_signal_test'))
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from acceptance_signals
),
dup_keys as (
  select metadata->>'dedup_key' as dedup_key, count(*) as cnt
  from acceptance_signals
  where metadata->>'dedup_key' is not null
  group by 1
  having count(*) > 1
),
orphans as (
  select count(*)::numeric as orphan_count
  from acceptance_signals s
  left join analytics_events d
    on d.event_name = 'mia_recommendation_decision'
    and d.metadata->>'request_id' = s.metadata->>'decision_request_id'
  where s.metadata->>'decision_request_id' is not null
    and d.id is null
),
multi_decision as (
  select count(*)::numeric as suspicious_requests
  from (
    select metadata->>'request_id' as request_id, count(*) as cnt
    from analytics_events
    where event_name = 'mia_recommendation_decision'
      and metadata->>'request_id' is not null
    group by 1 having count(*) > 1
  ) x
),
metric_rows as (
  select 'quality'::text as tipo, 'duplicate_dedup_keys'::text as metrica, coalesce((select count(*) from dup_keys), 0)::numeric as valor
  union all select 'quality', 'orphan_signals', coalesce((select orphan_count from orphans), 0)
  union all select 'quality', 'multi_decision_per_request', coalesce((select suspicious_requests from multi_decision), 0)
  union all select 'quality', 'total_acceptance_signals', count(*)::numeric from acceptance_signals
)
select r.dia_referencia, m.tipo, m.metrica, m.valor from metric_rows m cross join reference_day r order by m.metrica;
