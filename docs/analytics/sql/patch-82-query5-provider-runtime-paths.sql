-- PATCH 8.2 — Q5 Runtime and execution paths
with production_provider_attempt_events as (
  select *
  from analytics_events
  where event_name = 'mia_provider_attempt'
    and coalesce(metadata->>'event_version', '') = '8.2.0'
    and not (category in ('provider_attempt_test'))
),
per_request as (
  select
    metadata->>'request_id' as request_id,
    count(*) as attempts_per_request,
    count(distinct metadata->>'provider_id') as distinct_providers,
    bool_or(coalesce(metadata->>'fallback_triggered', 'false') = 'true') as had_fallback,
    bool_or(coalesce(metadata->>'shadow_observed', 'false') = 'true') as had_shadow
  from production_provider_attempt_events
  where metadata->>'request_id' is not null
  group by 1
)
select
  coalesce(e.metadata->>'runtime_mode', 'UNKNOWN') as runtime_mode,
  coalesce(e.metadata->>'execution_path', 'UNKNOWN') as execution_path,
  count(*) as attempt_count,
  round(avg(nullif((e.metadata->>'provider_priority')::numeric, null)), 2) as avg_priority,
  (select round(avg(attempts_per_request), 2) from per_request) as avg_attempts_per_request,
  (select count(*) filter (where distinct_providers = 1) from per_request) as single_provider_requests,
  count(*) filter (where coalesce(e.metadata->>'shadow_observed', 'false') = 'true') as shadow_attempts
from production_provider_attempt_events e
group by 1, 2
order by attempt_count desc;
