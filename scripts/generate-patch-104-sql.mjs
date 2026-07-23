#!/usr/bin/env node
/** Generates PATCH 10.4 SQL queries Q1–Q15 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "docs/analytics/sql");
mkdirSync(OUT, { recursive: true });

const BASE_CTE = `-- PATCH 10.4 base filter
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
)`;

const queries = [
  {
    file: "patch-104-query1-score-distribution.sql",
    title: "Q1 Distribuição do anti_regret_score",
    body: `select
  width_bucket(anti_regret_score, 0, 100, 10) as score_bucket,
  count(*)::bigint as eventos
from foundation
where anti_regret_score is not null
group by 1
order by 1;`,
  },
  {
    file: "patch-104-query2-score-avg-by-category.sql",
    title: "Q2 Score médio por price_quality",
    body: `select
  price_quality as categoria,
  round(avg(anti_regret_score), 2) as score_medio,
  count(*)::bigint as eventos
from foundation
where anti_regret_score is not null
group by 1
order by score_medio desc nulls last;`,
  },
  {
    file: "patch-104-query3-score-avg-by-search-path.sql",
    title: "Q3 Score médio por search_path",
    body: `select
  search_path,
  round(avg(anti_regret_score), 2) as score_medio,
  count(*)::bigint as eventos
from foundation
where anti_regret_score is not null
group by 1
order by eventos desc;`,
  },
  {
    file: "patch-104-query4-acceptance-score-relation.sql",
    title: "Q4 Relação aceitação × score",
    body: `select
  f.decision_request_id,
  f.anti_regret_score,
  count(a.id)::bigint as acceptance_signals
from foundation f
left join analytics_events a
  on a.event_name = 'mia_recommendation_acceptance_signal'
 and a.metadata->>'decision_request_id' = f.decision_request_id
group by 1, 2
order by acceptance_signals desc
limit 50;`,
  },
  {
    file: "patch-104-query5-rejection-score-relation.sql",
    title: "Q5 Relação rejeição × score",
    body: `select
  f.decision_request_id,
  f.anti_regret_score,
  count(r.id)::bigint as rejection_signals
from foundation f
left join analytics_events r
  on r.event_name = 'mia_recommendation_rejection_signal'
 and r.metadata->>'decision_request_id' = f.decision_request_id
group by 1, 2
order by rejection_signals desc
limit 50;`,
  },
  {
    file: "patch-104-query6-alert-score-relation.sql",
    title: "Q6 Relação alertas × score",
    body: `select
  f.decision_request_id,
  f.anti_regret_score,
  count(l.id)::bigint as alert_lifecycle_events
from foundation f
left join analytics_events l
  on l.event_name = 'mia_price_alert_lifecycle'
 and l.metadata->>'decision_request_id' = f.decision_request_id
group by 1, 2
order by alert_lifecycle_events desc
limit 50;`,
  },
  {
    file: "patch-104-query7-favorite-score-relation.sql",
    title: "Q7 Relação favoritos × score",
    body: `select
  f.decision_request_id,
  f.anti_regret_score,
  count(fav.id)::bigint as favorite_events
from foundation f
left join analytics_events fav
  on fav.event_name = 'favorite_created'
 and fav.metadata->>'decision_request_id' = f.decision_request_id
group by 1, 2
order by favorite_events desc
limit 50;`,
  },
  {
    file: "patch-104-query8-observed-patterns.sql",
    title: "Q8 Padrões observados",
    body: `select
  observed_pattern,
  count(*)::bigint as eventos,
  round(avg(anti_regret_score), 2) as score_medio
from foundation
group by 1
order by eventos desc;`,
  },
  {
    file: "patch-104-query9-conflict-frequency.sql",
    title: "Q9 Frequência de conflitos",
    body: `select
  conflict_detected,
  count(*)::bigint as eventos,
  round(avg(anti_regret_score), 2) as score_medio
from foundation
group by 1
order by 1 desc;`,
  },
  {
    file: "patch-104-query10-confidence-distribution.sql",
    title: "Q10 Confiança do score",
    body: `select
  anti_regret_confidence,
  count(*)::bigint as eventos,
  round(avg(anti_regret_score), 2) as score_medio
from foundation
group by 1
order by eventos desc;`,
  },
  {
    file: "patch-104-query11-score-by-signal-count.sql",
    title: "Q11 Score por quantidade de sinais",
    body: `select
  signal_count,
  count(*)::bigint as eventos,
  round(avg(anti_regret_score), 2) as score_medio
from foundation
group by 1
order by 1;`,
  },
  {
    file: "patch-104-query12-score-temporal-evolution.sql",
    title: "Q12 Evolução temporal do score",
    body: `select
  (created_at at time zone 'UTC')::date as dia,
  round(avg(anti_regret_score), 2) as score_medio,
  count(*)::bigint as eventos
from foundation
where anti_regret_score is not null
group by 1
order by 1 desc
limit 30;`,
  },
  {
    file: "patch-104-query13-price-quality-correlation.sql",
    title: "Q13 Correlação com qualidade de preço",
    body: `select
  price_quality,
  price_confidence,
  round(avg(anti_regret_score), 2) as score_medio,
  count(*)::bigint as eventos
from foundation
group by 1, 2
order by eventos desc;`,
  },
  {
    file: "patch-104-query14-savings-type-correlation.sql",
    title: "Q14 Correlação com savings_type",
    body: `select
  savings_type,
  round(avg(anti_regret_score), 2) as score_medio,
  count(*)::bigint as eventos
from foundation
group by 1
order by eventos desc;`,
  },
  {
    file: "patch-104-query15-provider-distribution.sql",
    title: "Q15 Distribuição por provider",
    body: `select
  winner_provider_id as provider_id,
  round(avg(anti_regret_score), 2) as score_medio,
  count(*)::bigint as eventos
from foundation
where winner_provider_id <> 'UNKNOWN'
group by 1
order by eventos desc
limit 30;`,
  },
];

for (const q of queries) {
  const sql = `-- PATCH 10.4 — ${q.title}
${BASE_CTE}
${q.body}
`;
  writeFileSync(join(OUT, q.file), sql, "utf8");
  console.log("wrote", q.file);
}

console.log(`\nGenerated ${queries.length} SQL files.`);
