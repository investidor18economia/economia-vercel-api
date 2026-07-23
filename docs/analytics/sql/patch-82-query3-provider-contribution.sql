-- PATCH 8.2 — Q3 Results and contribution
with production_provider_attempt_events as (
  select *
  from analytics_events
  where event_name = 'mia_provider_attempt'
    and coalesce(metadata->>'event_version', '') = '8.2.0'
    and not (category in ('provider_attempt_test'))
)
select
  coalesce(metadata->>'provider_id', 'unknown') as provider_id,
  count(*) as attempts,
  round(avg(nullif((metadata->>'raw_results_count')::numeric, null)), 2) as avg_raw_results,
  round(avg(nullif((metadata->>'normalized_results_count')::numeric, null)), 2) as avg_normalized_results,
  count(*) filter (where coalesce(metadata->>'contributed_results', 'false') = 'true') as contributed_results_count,
  count(*) filter (where coalesce(metadata->>'contributed_to_final_set', 'false') = 'true') as contributed_to_final_count,
  count(*) filter (where coalesce(metadata->>'winner_provider', 'false') = 'true') as winner_count,
  count(*) filter (where coalesce(metadata->>'attempt_status', '') = 'EMPTY') as empty_count
from production_provider_attempt_events
group by 1
order by attempts desc;
