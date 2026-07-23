-- PATCH 9.2 — Q7 Multi-path funnel (non-sequential)
with decision_events as (
  select metadata->>'request_id' as decision_request_id
  from analytics_events
  where event_name = 'mia_recommendation_decision'
    and coalesce(metadata->>'event_version', '') = '9.1.0'
    and coalesce((metadata->>'decision_valid')::boolean, false) = true
    and metadata->>'request_id' is not null
  group by 1
),
signal_by_decision as (
  select
    metadata->>'decision_request_id' as decision_request_id,
    max(case when metadata->>'signal_type' = 'RECOMMENDATION_RENDERED' then 1 else 0 end) as rendered,
    max(case when metadata->>'signal_type' in ('WINNER_OFFER_CLICKED','ALTERNATIVE_OFFER_CLICKED') then 1 else 0 end) as clicked,
    max(case when metadata->>'signal_type' = 'PRODUCT_FAVORITED' then 1 else 0 end) as favorited,
    max(case when metadata->>'signal_type' = 'PRICE_ALERT_CREATED' then 1 else 0 end) as alert_created,
    max(case when metadata->>'signal_strength' = 'CONFIRMED' then 1 else 0 end) as confirmed
  from analytics_events
  where event_name = 'mia_recommendation_acceptance_signal'
    and coalesce(metadata->>'event_version', '') = '9.2.0'
    and coalesce((metadata->>'signal_valid')::boolean, false) = true
  group by 1
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from analytics_events
  where event_name = 'mia_recommendation_acceptance_signal'
),
metric_rows as (
  select 'funnel'::text as etapa, 'decision'::text as metrica, count(*)::numeric as valor from decision_events
  union all select 'funnel', 'rendered', count(*)::numeric from decision_events d join signal_by_decision s using (decision_request_id) where s.rendered = 1
  union all select 'funnel', 'clicked', count(*)::numeric from decision_events d join signal_by_decision s using (decision_request_id) where s.clicked = 1
  union all select 'funnel', 'favorited', count(*)::numeric from decision_events d join signal_by_decision s using (decision_request_id) where s.favorited = 1
  union all select 'funnel', 'alert_created', count(*)::numeric from decision_events d join signal_by_decision s using (decision_request_id) where s.alert_created = 1
  union all select 'funnel', 'confirmed', count(*)::numeric from decision_events d join signal_by_decision s using (decision_request_id) where s.confirmed = 1
)
select r.dia_referencia, m.etapa, m.metrica, m.valor from metric_rows m cross join reference_day r order by m.metrica;
