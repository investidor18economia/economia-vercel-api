-- PATCH 9.3 — Q9 Abandonment (explicit vs flow exit — no silence-based)
with signal_events as (
  select *
  from analytics_events
  where event_name = 'mia_recommendation_rejection_signal'
    and coalesce(metadata->>'event_version', '') = '9.3.0'
    and not (category in ('recommendation_rejection_signal_test'))
    and coalesce((metadata->>'signal_valid')::boolean, false) = true
    and metadata->>'signal_class' in ('ABANDONMENT', 'POSTPONEMENT')
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from analytics_events
  where event_name = 'mia_recommendation_rejection_signal'
)
select r.dia_referencia,
  s.metadata->>'signal_type' as signal_type,
  coalesce((s.metadata->>'abandonment_explicit')::boolean, false) as abandonment_explicit,
  coalesce((s.metadata->>'purchase_postponed')::boolean, false) as purchase_postponed,
  count(*)::bigint as event_count,
  count(distinct s.metadata->>'decision_request_id')::bigint as unique_decisions
from signal_events s
cross join reference_day r
group by 1, 2, 3, 4
order by event_count desc;
