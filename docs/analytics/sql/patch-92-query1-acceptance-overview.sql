-- PATCH 9.2 — Q1 Acceptance overview (signal rate denominators use unique decisions)
with decision_events as (
  select metadata->>'request_id' as decision_request_id
  from analytics_events
  where event_name = 'mia_recommendation_decision'
    and coalesce(metadata->>'event_version', '') = '9.1.0'
    and coalesce((metadata->>'decision_valid')::boolean, false) = true
    and not (category in ('recommendation_decision_test'))
    and metadata->>'request_id' is not null
  group by 1
),
signal_events as (
  select *
  from analytics_events
  where event_name = 'mia_recommendation_acceptance_signal'
    and coalesce(metadata->>'event_version', '') = '9.2.0'
    and not (category in ('recommendation_acceptance_signal_test'))
    and coalesce((metadata->>'signal_valid')::boolean, false) = true
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from signal_events
),
decision_signals as (
  select
    s.metadata->>'decision_request_id' as decision_request_id,
    max(case when s.metadata->>'signal_strength' = 'WEAK' then 1 else 0 end) as has_weak,
    max(case when s.metadata->>'signal_strength' = 'MEDIUM' then 1 else 0 end) as has_medium,
    max(case when s.metadata->>'signal_strength' = 'STRONG' then 1 else 0 end) as has_strong,
    max(case when s.metadata->>'signal_strength' = 'CONFIRMED' then 1 else 0 end) as has_confirmed,
    max(case when coalesce((s.metadata->>'signal_valid')::boolean, false) then 1 else 0 end) as has_any_signal
  from signal_events s
  group by 1
),
metric_rows as (
  select 'overview'::text as tipo, 'decisions_eligible'::text as metrica, count(*)::numeric as valor from decision_events
  union all
  select 'overview', 'decisions_with_any_signal', count(*)::numeric
  from decision_events d join decision_signals ds on d.decision_request_id = ds.decision_request_id where ds.has_any_signal = 1
  union all
  select 'overview', 'decisions_without_signal', count(*)::numeric
  from decision_events d
  left join decision_signals ds on d.decision_request_id = ds.decision_request_id and ds.has_any_signal = 1
  where ds.decision_request_id is null
  union all
  select 'overview', 'decisions_with_weak', count(*)::numeric from decision_events d join decision_signals ds on d.decision_request_id = ds.decision_request_id where ds.has_weak = 1
  union all
  select 'overview', 'decisions_with_medium', count(*)::numeric from decision_events d join decision_signals ds on d.decision_request_id = ds.decision_request_id where ds.has_medium = 1
  union all
  select 'overview', 'decisions_with_strong', count(*)::numeric from decision_events d join decision_signals ds on d.decision_request_id = ds.decision_request_id where ds.has_strong = 1
  union all
  select 'overview', 'decisions_with_confirmed', count(*)::numeric from decision_events d join decision_signals ds on d.decision_request_id = ds.decision_request_id where ds.has_confirmed = 1
)
select r.dia_referencia, m.tipo, m.metrica, m.valor,
  case when m.metrica = 'decisions_with_any_signal' then 'acceptance signal rate ≠ purchase conversion rate' else null end as nota
from metric_rows m cross join reference_day r order by m.metrica;
