-- PATCH 7.3 — Latency Reliability Analytics (read-only · analytics_events)
-- Runtime: lib/miaLatencyAnalytics.js · lib/miaLatencyTracker.js · pages/api/chat-gpt4o.js
-- Event: mia_latency_event (server-side INSERT) · category: reliability_latency
-- Correlação: request_id ↔ PATCH 6.4 (query_duration_ms) · 7.1 (outcome) · 7.2 (errors)
-- Delta 6.4: query_duration_ms = Data Layer subset; total_duration_ms = E2E server latency
-- Splits: docs/analytics/sql/patch-73-query1..4.sql

-- See patch-73-query1-latency-overview.sql through patch-73-query4-evolution-gaps-panel.sql
