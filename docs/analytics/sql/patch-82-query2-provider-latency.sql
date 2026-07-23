-- PATCH 8.2 — Q2 Latency by provider
with production_provider_attempt_events as (
  select *
  from analytics_events
  where event_name = 'mia_provider_attempt'
    and coalesce(metadata->>'event_version', '') = '8.2.0'
    and not (category in ('provider_attempt_test'))
),
filtered as (
  select
    coalesce(metadata->>'provider_id', 'unknown') as provider_id,
    nullif((metadata->>'duration_ms')::numeric, null) as duration_ms,
    coalesce(metadata->>'attempt_status', '') as attempt_status
  from production_provider_attempt_events
  where (metadata->>'duration_ms') is not null
)
select
  provider_id,
  count(*) as sample_size,
  round(avg(duration_ms), 2) as avg_ms,
  min(duration_ms) as min_ms,
  max(duration_ms) as max_ms,
  percentile_cont(0.50) within group (order by duration_ms) as p50_ms,
  percentile_cont(0.75) within group (order by duration_ms) as p75_ms,
  percentile_cont(0.90) within group (order by duration_ms) as p90_ms,
  percentile_cont(0.95) within group (order by duration_ms) as p95_ms,
  percentile_cont(0.99) within group (order by duration_ms) as p99_ms,
  count(*) filter (where attempt_status = 'TIMEOUT') as timeout_count
from filtered
group by provider_id
having count(*) >= 1
order by provider_id;
