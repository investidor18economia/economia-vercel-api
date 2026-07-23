# PATCH 9.2 — Recommendation Acceptance Signals

**Evento:** `mia_recommendation_acceptance_signal` · **Versão:** `9.2.0`  
**Status:** 🟡 **IMPLEMENTAÇÃO**

## Arquitetura escolhida — Modelo Híbrido (C)

| Camada | Responsabilidade |
|--------|------------------|
| Eventos originais | `mia_recommendation_shown`, `offer_click`, `favorite_created`, `price_alert_created` permanecem |
| Evento agregado 9.2 | Camada analítica derivada, correlacionável por `decision_request_id` |
| SQL Q1–Q8 | Dashboards sobre evento agregado + decisões 9.1 |
| Frontend mínimo | Propaga `request_id` + `decision_context` nos eventos client |

**Justificativa:** SQL puro (A) não resolve correlação HIGH sem `request_id` nos client events. Evento agregado isolado (B) duplicaria sem fontes. Híbrido preserva eventos originais e adiciona camada rastreável.

## Princípio

**Sinal observado ≠ aceitação inferida ≠ compra confirmada**

Cliques são `WEAK` + `acceptance_proxy: true`. Favoritos/alertas são `STRONG`. `CONFIRMED` reservado para compra real (não implementado neste patch).

## Correlação

1. `REQUEST_ID` (HIGH) — via `decision_request_id` propagado do HTTP response
2. `SESSION_PRODUCT_WINDOW` (MEDIUM) — reservado para evolução
3. `SESSION_SEQUENCE` (LOW)
4. `UNRESOLVED` — não contabilizado como aceitação

## Produção

```bash
npm run test:mia:analytics:patch-92:recommendation-acceptance
npm run test:mia:analytics:patch-92:prod-smoke
npm run test:mia:analytics:patch-92:prod-validation
```

Evidência: [PATCH_9_2_PRODUCTION_EVIDENCE.json](./PATCH_9_2_PRODUCTION_EVIDENCE.json)

## Limitações

- Eventos client antigos sem `decision_request_id` não geram sinal 9.2 (retrocompatível)
- Target WINNER vs ALTERNATIVE depende de `product_id` ↔ hash de família
- Runner-up follow-up excluído (PATCH 9.4)
- Constraint refinement excluído (PATCH 9.3)

## Métricas oficiais

- **Decision signal rate** = decisões com ≥1 sinal válido / decisões elegíveis
- **Strong signal rate** = decisões com STRONG ou CONFIRMED / elegíveis
- **acceptance signal rate ≠ purchase conversion rate**
