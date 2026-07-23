# Savings Estimation & Confidence Analytics

PATCH 10.2 — camada observacional de estimativas de economia **sem afirmar economia real comprovada**.

## Evento

| Campo | Valor |
|-------|-------|
| `event_name` | `mia_savings_estimation` |
| `event_version` | `10.2.0` |
| `category` | `savings_estimation` |

## Arquitetura

```text
mia_offer_set (8.3) finalize metadata
  ↓ buildPriceIntelligenceFromOfferSetMetadata (10.1 — contexto)
  ↓ buildSavingsEstimationsFromOfferSetMetadata (10.2 — sem recálculo de ranking)
  ↓ mia_savings_estimation (até 2 métodos por request)
  ↓ SQL Q1–Q15
```

**Hook:** `instrumentOfferSetAnalyticsForDelivery` → `instrumentSavingsEstimationAnalyticsFromOfferSet`

**Dedup:** `request_id + event_name + event_version + calculation_method + baseline_type`

## Fontes

| Fonte | Uso |
|-------|-----|
| `mia_offer_set` metadata | Autoridade numérica (minimum, winner, deltas pré-computados) |
| `mia_price_intelligence` derivado | `price_quality`, `price_confidence`, `shipping_coverage` |
| `miaEstimatedSavings.js` | Espelhamento observacional da regra UI 4–6% (UNVERIFIED) |

**Não altera:** ranking, winner, Response Builder, UI, alertas.

## Taxonomias

### savings_type

| Valor | Significado |
|-------|-------------|
| `OBSERVED` | Diferença matemática entre preços válidos do mesmo conjunto |
| `ESTIMATED` | Reservado — regra calculada com baseline explícito futuro |
| `UNVERIFIED` | Estimativa sem baseline confiável (UI 4–6%) |
| `VERIFIED` | **Não emitido** — requer evidência transacional |
| `UNKNOWN` | Dados insuficientes |

### savings_nature

| Valor | Significado |
|-------|-------------|
| `OFFER_DIFFERENCE` | Diferença entre ofertas — **não é compra** |
| `ESTIMATED_SAVINGS` | Estimativa UI observada |
| `NO_SAVINGS_SIGNAL` | Winner = menor preço |
| `CONFIRMED_SAVINGS` | **Não emitido** |

### baseline_type (emitidos hoje)

| Valor | Status |
|-------|--------|
| `MINIMUM_OFFER` | Emitido — WINNER_VS_MINIMUM |
| `ESTIMATED_UI_ASSUMPTION` | Emitido — PERCENTAGE_ASSUMPTION |
| `HISTORICAL_PRICE`, `PURCHASE_PRICE`, `ALERT_TARGET` | Reservados |

### calculation_method (emitidos hoje)

| Método | Baseline |
|--------|----------|
| `WINNER_VS_MINIMUM` | `MINIMUM_OFFER` |
| `PERCENTAGE_ASSUMPTION` | `ESTIMATED_UI_ASSUMPTION` |

## Confiança (objetiva)

| Nível | Critérios |
|-------|-----------|
| `HIGH` | sample ≥ 3, price_quality HIGH, price_confidence HIGH, BRL, sem incompletos |
| `MEDIUM` | sample ≥ 2 ou sample ≥ 1 com frete conhecido/parcial |
| `LOW` | sample 1, frete desconhecido, ou UI assumption |
| `UNKNOWN` | Sem sample |

## Elegibilidade

`SAME_PRICE` quando winner = minimum.  
`savings_amount` positivo **somente** quando comparação observável e direção válida.  
Winner mais caro que minimum → `OFFER_DIFFERENCE`, `savings_amount = null`.

## Relação com miaEstimatedSavings

- Função UI **não alterada**
- Servidor observa mesma regra (`pickSavingsPercent`, `computeEstimatedSavingsAmount`)
- Classificação: `UNVERIFIED` + `ESTIMATED_UI_ASSUMPTION` + confiança `LOW`
- Separado de `WINNER_VS_MINIMUM` (OBSERVED)

## Métricas oficiais (SQL)

| Métrica | Definição |
|---------|-----------|
| `potential_savings_amount` | OBSERVED com savings_amount > 0 |
| `observed_offer_difference` | OFFER_DIFFERENCE (inclui winner acima do min) |
| `unverified_savings_amount` | PERCENTAGE_ASSUMPTION UNVERIFIED |
| `verified_savings_amount` | Esperado 0 — não emitido |

## SQL

`docs/analytics/sql/patch-102-query*.sql` (Q1–Q15)

## Limitações

- Sem histórico de preços → sem VERIFIED
- Sem compra confirmada → `purchase_confirmed` sempre false
- Amostra ≤6 ofertas (8.3)
- Frete não incluído nos valores
- Alertas: lifecycle reservado para PATCH 10.3

## Implementação

| Módulo | Caminho |
|--------|---------|
| Catálogo | `lib/miaSavingsEstimationCatalog.js` |
| Classificador | `lib/miaSavingsEstimationClassifier.js` |
| Analytics | `lib/miaSavingsEstimationAnalytics.js` |
| Hook | `lib/miaOfferSetAnalytics.js` |
