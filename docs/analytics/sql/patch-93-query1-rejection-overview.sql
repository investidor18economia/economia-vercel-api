-- PATCH 9.3 — Q1 Rejection / refinement overview
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
  where event_name = 'mia_recommendation_rejection_signal'
    and coalesce(metadata->>'event_version', '') = '9.3.0'
    and not (category in ('recommendation_rejection_signal_test'))
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from signal_events
),
decision_signals as (
  select
    s.metadata->>'decision_request_id' as decision_request_id,
    max(case when coalesce((s.metadata->>'rejection_explicit')::boolean, false) then 1 else 0 end) as has_explicit_rejection,
    max(case when coalesce((s.metadata->>'refinement_present')::boolean, false) then 1 else 0 end) as has_refinement,
    max(case when coalesce((s.metadata->>'winner_replaced')::boolean, false) then 1 else 0 end) as has_replacement,
    max(case when coalesce((s.metadata->>'purchase_postponed')::boolean, false) then 1 else 0 end) as has_postponement,
    max(case when coalesce((s.metadata->>'abandonment_observed')::boolean, false) then 1 else 0 end) as has_abandonment,
    max(case when s.metadata->>'signal_class' = 'INCONCLUSIVE' then 1 else 0 end) as has_inconclusive,
    max(case when coalesce((s.metadata->>'signal_valid')::boolean, false) then 1 else 0 end) as has_valid_signal
  from signal_events s
  group by 1
),
metric_rows as (
  select 'overview'::text as tipo, 'decisions_eligible'::text as metrica, count(*)::numeric as valor from decision_events
  union all
  select 'overview', 'decisions_with_explicit_rejection', count(*)::numeric
  from decision_events d join decision_signals ds on d.decision_request_id = ds.decision_request_id
  where ds.has_explicit_rejection = 1 and ds.has_valid_signal = 1
  union all
  select 'overview', 'decisions_with_refinement', count(*)::numeric
  from decision_events d join decision_signals ds on d.decision_request_id = ds.decision_request_id
  where ds.has_refinement = 1 and ds.has_valid_signal = 1
  union all
  select 'overview', 'decisions_replaced', count(*)::numeric
  from decision_events d join decision_signals ds on d.decision_request_id = ds.decision_request_id
  where ds.has_replacement = 1 and ds.has_valid_signal = 1
  union all
  select 'overview', 'decisions_with_postponement', count(*)::numeric
  from decision_events d join decision_signals ds on d.decision_request_id = ds.decision_request_id
  where ds.has_postponement = 1 and ds.has_valid_signal = 1
  union all
  select 'overview', 'decisions_with_abandonment_observed', count(*)::numeric
  from decision_events d join decision_signals ds on d.decision_request_id = ds.decision_request_id
  where ds.has_abandonment = 1 and ds.has_valid_signal = 1
  union all
  select 'overview', 'decisions_inconclusive_only', count(*)::numeric
  from decision_events d join decision_signals ds on d.decision_request_id = ds.decision_request_id
  where ds.has_inconclusive = 1 and ds.has_valid_signal = 0
)
select r.dia_referencia, m.tipo, m.metrica, m.valor,
  case when m.metrica = 'decisions_with_explicit_rejection' then 'explicit rejection rate denominator = decisions_eligible' else null end as nota
from metric_rows m cross join reference_day r order by m.metrica;
