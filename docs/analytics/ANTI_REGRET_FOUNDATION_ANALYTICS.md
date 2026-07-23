# Anti-Regret Foundation Analytics — PATCH 10.4

Observabilidade oficial da **fundação analítica anti-regret**. Este patch **não mede arrependimento real** — apenas consolida evidências objetivas já disponíveis para medição futura.

## Princípios

- Analytics observa; não interpreta emoções
- Não assume satisfação, compra ou arrependimento confirmado
- Não altera Decision Engine, ranking, cards, respostas ou alertas
- Fire-and-forget obrigatório

## Evento

| Campo | Valor |
|-------|-------|
| `event_name` | `mia_anti_regret_foundation` |
| `event_version` | `10.4.0` |
| `category` | `anti_regret` |

## Arquitetura

```
mia_offer_set (8.3) delivery
  → mia_price_intelligence (10.1)
  → mia_savings_estimation (10.2)
  → mia_anti_regret_foundation (10.4)   ← novo

Post-decision (opcional, enriquecido):
  mia_recommendation_acceptance_signal (9.2)
  mia_recommendation_rejection_signal (9.3)
    → scheduleAntiRegretFoundationFromPostDecisionSignal (se ainda não emitido)
```

**Writers:** `instrumentAntiRegretFoundationFromOfferSet` · `scheduleAntiRegretFoundationFromPostDecisionSignal`

## Separação semântica

| Conceito | PATCH 10.4 |
|----------|------------|
| Decisão tomada | Correlacionada via `decision_request_id` |
| Satisfação presumida | **Nunca** — `satisfaction_assumed: false` |
| Arrependimento potencial | `anti_regret_score` (observacional) |
| Arrependimento observado | Padrões + conflitos objetivos |
| Arrependimento confirmado | **Nunca** — `regret_confirmed: false` |

## Taxonomias

### Polaridade dos sinais

`POSITIVE_SIGNAL` · `NEUTRAL_SIGNAL` · `UNCERTAIN_SIGNAL` · `NEGATIVE_SIGNAL` · `UNKNOWN`

### Fontes

`ACCEPTANCE_SIGNAL` · `REJECTION_SIGNAL` · `ALTERNATIVE_REQUEST` · `SECOND_BEST` · `PRICE_ALERT` · `FAVORITE` · `OFFER_CLICK` · `CONSTRAINT_CHANGE` · `FOLLOW_UP` · `MULTI_TURN` · `DECISION_CONTEXT` · `PRICE_INTELLIGENCE` · `SAVINGS_ESTIMATION` · `UNKNOWN`

## Score observacional (`anti_regret_score`)

- Faixa: **0–100** (interno; nunca exibido ao usuário)
- Base neutra: **50**
- Ajustes por peso objetivo por sinal (+ positivo, − negativo, −35% peso incerto)
- **Fórmula documentada** em `lib/miaAntiRegretFoundationClassifier.js`

Exemplos de evidências:

| Evidência | Efeito |
|-----------|--------|
| `winner_is_lowest_price` | +12 |
| Alta qualidade/confiança de preço | +10 |
| Savings OBSERVED | +8 |
| Gap runner-up VERY_CLOSE/CLOSE | −10 |
| `new_search` / `reset_applied` | −8 |
| Múltiplas constraints | −6 (uncertain) |

## Confiança (`anti_regret_confidence`)

`HIGH` · `MEDIUM` · `LOW` · `UNKNOWN`

Baseada em: quantidade de sinais, diversidade de fontes, conflitos, turns conversacionais.

## Padrões observados

`DIRECT_ACCEPTANCE` · `COMPARISON_BEFORE_ACCEPTANCE` · `MULTIPLE_REJECTIONS` · `PRICE_WAITING` · `MULTIPLE_CONSTRAINT_CHANGES` · `LONG_EXPLORATION` · `UNKNOWN`

## Conflitos objetivos

Exemplos registrados (fatos, não psicologia):

- `mixed_signal_polarity`
- `new_search_with_anchor_preserved`
- `acceptance_and_rejection_same_decision`
- `alert_after_acceptance_proxy`
- `runner_up_selected_over_winner`
- `rejection_despite_clear_gap`

## Correlação

Reutiliza IDs existentes:

- `request_id`
- `decision_request_id`
- `session_id` · `conversation_id` · `visitor_id` · `user_id`

## Deduplicação

```
request_id + decision_request_id + event_name + event_version
```

Um evento por decisão comercial.

## Privacidade

**Proibido:** query, prompt, message, response, product_name, url, email, PII.

**Permitido:** IDs, taxonomias, scores, contadores, booleanos, versões.

## SQL

Q1–Q15 em `docs/analytics/sql/patch-104-query*.sql`

## Limitações

- Score não é satisfação nem arrependimento confirmado
- Emissão primária no delivery usa evidências same-turn; sinais pós-decisão enriquecem via hook assíncrono se foundation ainda não existir
- Fluxo `anti_regret` conversacional sem pipeline comercial não emite foundation derivada de offer_set
- `anti_regret_score` nunca influencia ranking neste patch

## Exemplos válidos

- Score 72, confidence HIGH, pattern COMPARISON_BEFORE_ACCEPTANCE, conflict_detected false
- Score 38, pattern MULTIPLE_REJECTIONS, conflict_detected true

## Exemplos proibidos

- `"user_regretted_purchase": true`
- `"satisfaction_score": 85`
- `"user_feels_bad": true`
