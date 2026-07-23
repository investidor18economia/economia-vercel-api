-- PATCH 10.4 — Q8 Padrões observados
-- PATCH 10.4 base filter
with foundation as (
  select
    id,
    created_at,
    session_id,
    user_id,
    metadata->>'request_id' as request_id,
    metadata->>'decision_request_id' as decision_request_id,
    coalesce(metadata->>'event_version', '') as event_version,
    nullif(metadata->>'anti_regret_score', '')::numeric as anti_regret_score,
    coalesce(metadata->>'anti_regret_confidence', 'UNKNOWN') as anti_regret_confidence,
    coalesce(metadata->>'observed_pattern', 'UNKNOWN') as observed_pattern,
    coalesce(metadata->>'primary_signal_source', 'UNKNOWN') as primary_signal_source,
    coalesce(metadata->>'price_quality', 'UNKNOWN') as price_quality,
    coalesce(metadata->>'price_confidence', 'UNKNOWN') as price_confidence,
    coalesce(metadata->>'savings_type', 'UNKNOWN') as savings_type,
    coalesce(metadata->>'alert_stage', 'NONE') as alert_stage,
    coalesce(metadata->>'search_path', 'UNKNOWN') as search_path,
    coalesce(metadata->>'winner_provider_id', 'UNKNOWN') as winner_provider_id,
    coalesce(metadata->>'score_gap_bucket', 'UNKNOWN') as score_gap_bucket,
    coalesce((metadata->>'signal_count')::int, 0) as signal_count,
    coalesce((metadata->>'positive_signal_count')::int, 0) as positive_signal_count,
    coalesce((metadata->>'negative_signal_count')::int, 0) as negative_signal_count,
    coalesce((metadata->>'neutral_signal_count')::int, 0) as neutral_signal_count,
    coalesce((metadata->>'conflict_detected')::boolean, false) as conflict_detected,
    coalesce((metadata->>'regret_confirmed')::boolean, false) as regret_confirmed,
    coalesce((metadata->>'purchase_confirmed')::boolean, false) as purchase_confirmed
  from analytics_events
  where event_name = 'mia_anti_regret_foundation'
    and coalesce(metadata->>'event_version', '') = '10.4.0'
    and category not in ('anti_regret_test')
)
select
  observed_pattern,
  count(*)::bigint as eventos,
  round(avg(anti_regret_score), 2) as score_medio
from foundation
group by 1
order by eventos desc;
