-- PATCH 9.1 — Q5 Correlation hub by request_id (no fan-out)
with decision_events as (
  select
    metadata->>'request_id' as request_id,
    min(created_at) as decision_at,
    max(coalesce((metadata->>'winner_present')::boolean, false)::int) as winner_present,
    max(coalesce((metadata->>'runner_up_present')::boolean, false)::int) as runner_up_present,
    max(metadata->>'decision_source') as decision_source
  from analytics_events
  where event_name = 'mia_recommendation_decision'
    and coalesce(metadata->>'event_version', '') = '9.1.0'
    and not (category in ('recommendation_decision_test'))
    and metadata->>'request_id' is not null
  group by 1
),
search_events as (
  select metadata->>'request_id' as request_id, count(*) as search_count
  from analytics_events
  where event_name = 'mia_commercial_search'
    and metadata->>'request_id' is not null
  group by 1
),
provider_events as (
  select metadata->>'request_id' as request_id, count(*) as provider_count
  from analytics_events
  where event_name = 'mia_provider_attempt'
    and metadata->>'request_id' is not null
  group by 1
),
offer_events as (
  select metadata->>'request_id' as request_id, count(*) as offer_count
  from analytics_events
  where event_name = 'mia_offer_set'
    and metadata->>'request_id' is not null
  group by 1
),
outcome_events as (
  select metadata->>'request_id' as request_id, count(*) as outcome_count
  from analytics_events
  where event_name = 'mia_response_outcome'
    and metadata->>'request_id' is not null
  group by 1
),
reference_day as (
  select coalesce(max((decision_at at time zone 'UTC')::date), current_date) as dia_referencia
  from decision_events
),
metric_rows as (
  select 'correlation'::text as tipo_analise, 'decision_requests'::text as metrica, count(*)::numeric as valor
  from decision_events
  union all
  select 'correlation', 'with_commercial_search',
    count(*)::numeric
  from decision_events d
  join search_events s using (request_id)
  union all
  select 'correlation', 'with_provider_attempt',
    count(*)::numeric
  from decision_events d
  join provider_events p using (request_id)
  union all
  select 'correlation', 'with_offer_set',
    count(*)::numeric
  from decision_events d
  join offer_events o using (request_id)
  union all
  select 'correlation', 'with_response_outcome',
    count(*)::numeric
  from decision_events d
  join outcome_events r using (request_id)
  union all
  select 'correlation', 'winner_with_offer_set',
    count(*)::numeric
  from decision_events d
  join offer_events o using (request_id)
  where d.winner_present = 1
)
select ref.dia_referencia, m.tipo_analise, m.metrica, m.valor
from metric_rows m
cross join reference_day ref
order by m.metrica;
