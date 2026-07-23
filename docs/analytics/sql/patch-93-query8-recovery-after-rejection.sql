-- PATCH 9.3 — Q8 Recovery after rejection (rejection → new decision → acceptance)
with rejection_decisions as (
  select distinct metadata->>'decision_request_id' as decision_request_id
  from analytics_events
  where event_name = 'mia_recommendation_rejection_signal'
    and coalesce(metadata->>'event_version', '') = '9.3.0'
    and not (category in ('recommendation_rejection_signal_test'))
    and coalesce((metadata->>'signal_valid')::boolean, false) = true
    and coalesce((metadata->>'rejection_explicit')::boolean, false) = true
    and metadata->>'decision_request_id' is not null
),
replacements as (
  select distinct
    metadata->>'previous_decision_request_id' as prior_decision,
    metadata->>'replacement_decision_request_id' as replacement_decision
  from analytics_events
  where event_name = 'mia_recommendation_rejection_signal'
    and coalesce(metadata->>'event_version', '') = '9.3.0'
    and metadata->>'replacement_decision_request_id' is not null
    and metadata->>'previous_decision_request_id' is not null
),
acceptance as (
  select distinct metadata->>'decision_request_id' as decision_request_id
  from analytics_events
  where event_name = 'mia_recommendation_acceptance_signal'
    and coalesce(metadata->>'event_version', '') = '9.2.0'
    and coalesce((metadata->>'signal_valid')::boolean, false) = true
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from analytics_events
  where event_name = 'mia_recommendation_rejection_signal'
),
metric_rows as (
  select 'recovery'::text as tipo, 'rejected_decisions'::text as metrica, count(*)::numeric as valor from rejection_decisions
  union all
  select 'recovery', 'rejected_with_replacement', count(*)::numeric
  from rejection_decisions rd
  join replacements rp on rd.decision_request_id = rp.prior_decision
  union all
  select 'recovery', 'replacement_with_acceptance', count(*)::numeric
  from replacements rp
  join acceptance a on rp.replacement_decision = a.decision_request_id
)
select r.dia_referencia, m.tipo, m.metrica, m.valor,
  'recovery rate = replacement_with_acceptance / rejected_with_replacement' as nota
from metric_rows m cross join reference_day r order by m.metrica;
