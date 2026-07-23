# Recommendation Acceptance Analytics — PATCH 9.2

## Evento agregado

| Campo | Valor |
|-------|-------|
| `event_name` | `mia_recommendation_acceptance_signal` |
| `event_version` | `9.2.0` |
| `category` | `recommendation_acceptance_signal` |

## Emissão

| Origem | Trigger |
|--------|---------|
| Client | `/api/analytics/track` → `observeAcceptanceSignalFromClientTrackEvent` |
| Server | Follow-up comercial autorizado → `observeAcceptanceSignalFromConversationFollowUp` |

Fire-and-forget — falhas nunca bloqueiam track, clique, favorito ou alerta.

## Taxonomias

Ver `lib/miaRecommendationAcceptanceCatalog.js`:
- `signal_type` — RECOMMENDATION_RENDERED, WINNER_OFFER_CLICKED, PRODUCT_FAVORITED, etc.
- `signal_strength` — WEAK, MEDIUM, STRONG, CONFIRMED
- `signal_target` — WINNER, RUNNER_UP, ALTERNATIVE, OFFER_ONLY, UNKNOWN
- `correlation_method` / `correlation_confidence`
- `time_bucket` — same_turn, up_to_1_min, up_to_5_min, up_to_30_min, same_session

## Deduplicação

Chave: `decision_request_id + signal_type + signal_target + source_event_id + 9.2.0`

Sinais legítimos distintos (clique + favorito + alerta) preservados via `acceptance_signal_id` único por interação.

## Fluxo analítico

```
mia_recommendation_decision (9.1)
        ↓
mia_recommendation_shown / offer_click / favorite / alert
        ↓
mia_recommendation_acceptance_signal (9.2)
```

## Implementação

| Módulo | Caminho |
|--------|---------|
| Catalog | `lib/miaRecommendationAcceptanceCatalog.js` |
| Classifier | `lib/miaRecommendationAcceptanceClassifier.js` |
| Correlation | `lib/miaRecommendationAcceptanceCorrelation.js` |
| Analytics | `lib/miaRecommendationAcceptanceAnalytics.js` |
| Track hook | `pages/api/analytics/track/index.js` |
| Conversation hook | `pages/api/chat-gpt4o.js` |
| Frontend | `components/MIAChat.jsx` |
