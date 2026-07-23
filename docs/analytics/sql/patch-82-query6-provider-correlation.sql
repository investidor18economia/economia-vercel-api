-- PATCH 8.2 — Q6 Correlation diagnostic (8.1 / 6.4 / 7.x)
with provider_attempts as (
  select
    metadata->>'request_id' as request_id,
    count(*) as provider_attempt_count,
    count(*) filter (where coalesce(metadata->>'attempt_status', '') = 'SUCCESS') as provider_success_count
  from analytics_events
  where event_name = 'mia_provider_attempt'
    and coalesce(metadata->>'event_version', '') = '8.2.0'
  group by 1
),
commercial_search as (
  select
    metadata->>'request_id' as request_id,
    metadata->>'search_path' as search_path,
    metadata->>'provider_continuation_required' as provider_continuation_required,
    metadata->>'search_execution_status' as search_execution_status
  from analytics_events
  where event_name = 'mia_commercial_search'
    and coalesce(metadata->>'event_version', '') = '8.1.0'
),
data_layer as (
  select metadata->>'request_id' as request_id, metadata->>'resolution_status' as dl_status
  from analytics_events
  where event_name = 'data_layer_resolution'
),
response_outcome as (
  select metadata->>'request_id' as request_id, metadata->>'delivery_status' as delivery_status
  from analytics_events
  where event_name = 'mia_response_outcome'
),
errors as (
  select metadata->>'request_id' as request_id, count(*) as error_count
  from analytics_events
  where event_name = 'mia_error_event'
  group by 1
),
latency as (
  select metadata->>'request_id' as request_id, (metadata->>'total_duration_ms')::numeric as total_duration_ms
  from analytics_events
  where event_name = 'mia_latency_event'
)
select
  cs.request_id,
  cs.search_path,
  cs.provider_continuation_required,
  cs.search_execution_status,
  dl.dl_status,
  coalesce(pa.provider_attempt_count, 0) as provider_attempt_count,
  coalesce(pa.provider_success_count, 0) as provider_success_count,
  ro.delivery_status,
  coalesce(er.error_count, 0) as error_count,
  la.total_duration_ms
from commercial_search cs
left join provider_attempts pa on pa.request_id = cs.request_id
left join data_layer dl on dl.request_id = cs.request_id
left join response_outcome ro on ro.request_id = cs.request_id
left join errors er on er.request_id = cs.request_id
left join latency la on la.request_id = cs.request_id
where cs.provider_continuation_required = 'true'
   or coalesce(pa.provider_attempt_count, 0) > 0
order by cs.request_id desc
limit 100;
