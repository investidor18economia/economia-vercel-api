-- PATCH 9.4 — Q8 Recovery after rejection by runner-up / alternative / new search
with rejected as (
  select distinct metadata->>'decision_request_id' as decision_request_id
  from analytics_events
  where event_name = 'mia_recommendation_rejection_signal'
    and coalesce(metadata->>'event_version', '') = '9.3.0'
    and coalesce((metadata->>'signal_valid')::boolean, false) = true
    and (
      coalesce((metadata->>'rejection_explicit')::boolean, false)
      or coalesce((metadata->>'refinement_present')::boolean, false)
    )
),
replacements as (
  select distinct
    metadata->>'previous_decision_request_id' as prior_decision,
    metadata->>'replacement_decision_request_id' as replacement_decision
  from analytics_events
  where event_name = 'mia_recommendation_rejection_signal'
    and metadata->>'replacement_decision_request_id' is not null
    and metadata->>'previous_decision_request_id' is not null
),
new_search as (
  select distinct metadata->>'decision_request_id' as decision_request_id
  from analytics_events
  where event_name = 'mia_recommendation_rejection_signal'
    and metadata->>'signal_type' = 'NEW_SEARCH_STARTED'
    and coalesce((metadata->>'signal_valid')::boolean, false) = true
),
acceptance_after as (
  select distinct rp.prior_decision as decision_request_id, a.metadata->>'signal_target' as signal_target
  from analytics_events a
  join replacements rp on rp.replacement_decision = a.metadata->>'decision_request_id'
  where a.event_name = 'mia_recommendation_acceptance_signal'
    and coalesce((a.metadata->>'signal_valid')::boolean, false) = true
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from analytics_events
  where event_name = 'mia_recommendation_rejection_signal'
),
metric_rows as (
  select 'recovery'::text as tipo, 'rejected_decisions'::text as metrica, count(*)::numeric as valor from rejected
  union all
  select 'recovery', 'with_replacement', count(*)::numeric from rejected r join replacements rp on r.decision_request_id = rp.prior_decision
  union all
  select 'recovery', 'recovered_by_runner_up', count(*)::numeric from acceptance_after where signal_target = 'RUNNER_UP'
  union all
  select 'recovery', 'recovered_by_other_alternative', count(*)::numeric from acceptance_after where signal_target = 'ALTERNATIVE'
  union all
  select 'recovery', 'recovered_by_new_search', count(*)::numeric from rejected r join new_search ns on r.decision_request_id = ns.decision_request_id
)
select r.dia_referencia, m.tipo, m.metrica, m.valor from metric_rows m cross join reference_day r order by m.metrica;
