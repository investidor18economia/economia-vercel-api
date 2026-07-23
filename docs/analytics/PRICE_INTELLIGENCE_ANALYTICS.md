# Price Intelligence Analytics

PATCH 10.1 — camada observacional de qualidade e inteligência de preços.

## Evento

| Campo | Valor |
|-------|-------|
| `event_name` | `mia_price_intelligence` |
| `event_version` | `10.1.0` |
| `category` | `price_intelligence` |

## Arquitetura

```text
mia_offer_set (8.3) finalize metadata
  ↓ buildPriceIntelligenceFromOfferSetMetadata (derivado, sem recálculo)
  ↓ mia_price_intelligence (10.1)
  ↓ SQL Q1–Q10
```

**Hook:** `instrumentOfferSetAnalyticsForDelivery` → `instrumentPriceIntelligenceAnalyticsFromOfferSet`

**Dedup:** `request_id + event_name + event_version` (máx. 1 por request comercial)

## Taxonomias

| Campo | Valores |
|-------|---------|
| `price_quality` | HIGH · MEDIUM · LOW · UNKNOWN |
| `price_confidence` | HIGH · MEDIUM · LOW · UNKNOWN |
| `winner_price_position` | LOWEST_PRICE · NEAR_LOWEST · MIDDLE · HIGH · UNKNOWN |
| `shipping_coverage` | KNOWN · PARTIAL · UNKNOWN |

### Winner price position (limites)

- NEAR_LOWEST: delta ≤ 5%
- MIDDLE: delta ≤ 20%
- HIGH: delta > 20%

### Price quality (objetivo)

- HIGH: sample ≥ 3, providers ≥ 2, sem incompletos/inválidos
- MEDIUM: sample ≥ 1 com winner
- LOW: inválidos ou sample zero com winner
- UNKNOWN: sem dados

## Correlação

- `request_id` = hub same-turn (8.x, 9.1)
- `decision_request_id` = `request_id` (Fase 9)

## SQL

`docs/analytics/sql/patch-101-query*.sql` (Q1–Q10)

## Limitações

- Deriva exclusivamente de `mia_offer_set` metadata — não recalcula preços
- `lowest_price_provider_id` não disponível no 8.3 → null
- Sample limitado (≤6 ofertas no 8.3)
- Não mede economia (PATCH 10.2)

## Implementação

| Módulo | Caminho |
|--------|---------|
| Catálogo | `lib/miaPriceIntelligenceCatalog.js` |
| Classificador | `lib/miaPriceIntelligenceClassifier.js` |
| Analytics | `lib/miaPriceIntelligenceAnalytics.js` |
| Hook | `lib/miaOfferSetAnalytics.js` |
