# Recommendation Decision Analytics — PATCH 9.1

## Evento

| Campo | Valor |
|-------|-------|
| `event_name` | `mia_recommendation_decision` |
| `event_version` | `9.1.0` |
| `category` | `recommendation_decision` (produção) · `recommendation_decision_test` (smoke) |

## Responsabilidade

Mede **como a MIA decidiu** — não mede busca, providers, ofertas, outcome HTTP, frontend ou interações.

## Deduplicação

Chave: `request_id + event_name + event_version` — máximo 1 evento por request.

## Fire-and-forget

```javascript
void emitRecommendationDecisionAnalytics(...).catch(() => {});
```

Persistência nunca bloqueia resposta HTTP.

## Metadata (produção)

### Identificação
- `request_id`, `session_id` (via row), `event_name`, `event_version`, `timestamp` (via `created_at`)

### Origem
- `routing_mode`, `decision_source`, `runtime_mode`

### Winner
- `winner_present`, `winner_rank`, `winner_product_family` (hash), `winner_provider`, `winner_category`

### Runner-up
- `runner_up_present`, `runner_up_rank` — `false`/`null` quando inexistente

### Ranking agregado
- `candidate_count`, `display_count`, `winner_score`, `runner_up_score`, `score_gap`

### Restrições (flags)
- `budget_constraint`, `category_constraint`, `brand_constraint`
- `specific_product_lock`, `anchor_preserved`, `rerank_allowed`, `new_search`, `reset_applied`

### Estado
- `decision_completed`, `winner_sanitized`, `decision_valid`, `response_ready`, `response_path`

## Privacidade

Nunca persistir: prompts, mensagens, query, títulos, URLs, ranking completo, listas de produtos, PII.

## Implementação

| Módulo | Caminho |
|--------|---------|
| Catalog | `lib/miaRecommendationDecisionCatalog.js` |
| Classifier | `lib/miaRecommendationDecisionClassifier.js` |
| Identity | `lib/miaRecommendationDecisionIdentity.js` |
| Tracker | `lib/miaRecommendationDecisionTracker.js` |
| Analytics | `lib/miaRecommendationDecisionAnalytics.js` |
| Hook | `pages/api/chat-gpt4o.js` |

## Correlação

```
mia_commercial_search → mia_provider_attempt → mia_offer_set
  → mia_recommendation_decision → mia_response_outcome → mia_latency_event
```

Hub: `metadata.request_id`

## Inline response metadata

Campo `recommendation_decision_analytics` em respostas HTTP instrumentadas (espelho do summary persistido).
