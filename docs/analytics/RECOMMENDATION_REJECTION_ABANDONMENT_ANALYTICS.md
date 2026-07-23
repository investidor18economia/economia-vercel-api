# Recommendation Rejection and Abandonment Analytics

Documentação analítica do PATCH 9.3 — camada observacional pós-decisão para sinais negativos e de interrupção.

## Evento

| Campo | Valor |
|-------|-------|
| `event_name` | `mia_recommendation_rejection_signal` |
| `event_version` | `9.3.0` |
| `category` | `recommendation_rejection_signal` |

## Taxonomias

### signal_class

`REJECTION` · `REFINEMENT` · `SUBSTITUTION` · `POSTPONEMENT` · `ABANDONMENT` · `INCONCLUSIVE` · `UNKNOWN`

### signal_type (observáveis)

`EXPLICIT_REJECTION` · `PRICE_REJECTION` · `CONSTRAINT_REFINEMENT` · `BUDGET_REFINEMENT` · `BRAND_REFINEMENT` · `FEATURE_REFINEMENT` · `ALTERNATIVE_REQUESTED` · `NEW_SEARCH_STARTED` · `WINNER_REPLACED` · `PURCHASE_POSTPONED` · `PURCHASE_ABANDONED_EXPLICITLY` · `COMMERCIAL_FLOW_EXITED` · …

### evidence_strength

`EXPLICIT` · `STRONG` · `MODERATE` · `WEAK` · `INCONCLUSIVE` · `UNKNOWN`

Ausência de interação **nunca** gera `WEAK` rejection.

### signal_target

`WINNER` · `RUNNER_UP` · `ALTERNATIVE` · `OFFER` · `DECISION_GENERIC` · `COMMERCIAL_FLOW` · `UNKNOWN`

## SQL (Q1–Q10)

| Query | Objetivo |
|-------|----------|
| Q1 | Visão geral e denominadores |
| Q2 | Classes e tipos |
| Q3 | Motivos observáveis |
| Q4 | Origem da decisão |
| Q5 | Alvos |
| Q6 | Resultados posteriores |
| Q7 | Tempo até o sinal |
| Q8 | Recuperação pós-rejeição |
| Q9 | Abandono (explícito / flow exit) |
| Q10 | Qualidade e fan-out |

Arquivos: `docs/analytics/sql/patch-93-query*.sql`

## Implementação

| Módulo | Caminho |
|--------|---------|
| Catálogo | `lib/miaRecommendationRejectionCatalog.js` |
| Classificador | `lib/miaRecommendationRejectionClassifier.js` |
| Correlação | `lib/miaRecommendationRejectionCorrelation.js` |
| Dedup | `lib/miaRecommendationRejectionTracker.js` |
| Analytics | `lib/miaRecommendationRejectionAnalytics.js` |
| Hook pipeline | `pages/api/chat-gpt4o.js` |

## Privacidade

Sem texto de mensagem, query, título, URL ou PII — apenas taxonomias, flags, hashes e IDs seguros.

## Relação 9.2

Sinais positivos e negativos coexistem temporalmente na mesma decisão/sessão sem sobrescrever histórico.
