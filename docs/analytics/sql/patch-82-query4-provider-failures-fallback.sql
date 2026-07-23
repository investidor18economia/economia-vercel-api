-- PATCH 8.2 — Q4 Failures and fallback
with production_provider_attempt_events as (
  select *
  from analytics_events
  where event_name = 'mia_provider_attempt'
    and coalesce(metadata->>'event_version', '') = '8.2.0'
    and not (category in ('provider_attempt_test'))
)
select
  coalesce(metadata->>'provider_id', 'unknown') as provider_id,
  coalesce(metadata->>'failure_category', 'UNKNOWN') as failure_category,
  coalesce(metadata->>'http_status_group', 'UNKNOWN') as http_status_group,
  count(*) as attempts,
  count(*) filter (where coalesce(metadata->>'fallback_triggered', 'false') = 'true') as fallback_triggered_count,
  count(*) filter (where coalesce(metadata->>'attempt_status', '') = 'TIMEOUT') as timeout_count
from production_provider_attempt_events
where coalesce(metadata->>'attempt_status', '') in ('FAILED', 'TIMEOUT', 'EMPTY')
   or coalesce(metadata->>'fallback_triggered', 'false') = 'true'
group by 1, 2, 3
order by attempts desc;
