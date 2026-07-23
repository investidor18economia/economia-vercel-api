# PATCH 9.1 — Recommendation Decision Analytics

**Evento:** `mia_recommendation_decision` · **Versão:** `9.1.0`  
**Status:** 🟢 **APROVADO** · produção `2585c8e` · build `2585c8eb5071`

## Modelo

Um evento observacional por `request_id` — captura a **decisão cognitiva final** da MIA após estabilização completa (ranking, selection, lock, sanitize, reset guard) e **antes** do Response Builder.

Correlaciona com:
- **8.1** — `mia_commercial_search`
- **8.2** — `mia_provider_attempt`
- **8.3** — `mia_offer_set`
- **7.x** — `mia_response_outcome`, `mia_latency_event`

Hub: `request_id`

## Princípio

Analytics observa. Nunca decide, recalcula ou altera a lógica cognitiva.

## Unidade de observação

- `selectedBestProduct` (primária)
- `displayProducts`, `lastRankingSnapshot`, `routingDecision` (complementares, degradação graciosa)

## Hooks

| Caminho | `decision_source` | Momento |
|---------|-------------------|---------|
| `return_seguro` | `COGNITIVE_PRIMARY` | Após reset guard, antes de `buildMiaSearchRecommendationCognition` |
| `commercial_only_fallback` | `COMMERCIAL_ONLY_FALLBACK` | Após winner estabilizado |
| `commercial_new_search_no_result` | `NO_RESULT` | Winner ausente pós-reset |
| `legacy_llm_search` / `legacy_llm_comparison` | `LEGACY_LLM` | Após sanitize, antes do return |

## Contrato

Ver [RECOMMENDATION_DECISION_ANALYTICS.md](./RECOMMENDATION_DECISION_ANALYTICS.md) e `EVENT_CONTRACT.md` §7.14.

## SQL

`docs/analytics/sql/patch-91-query1-decision-volume.sql` … `query5-decision-correlation.sql`

## Testes

```bash
npm run test:mia:analytics:patch-91:recommendation-decision
npm run test:mia:analytics:patch-91:prod-smoke
npm run test:mia:analytics:patch-91:prod-validation
```

## Produção

Evidência: [PATCH_9_1_PRODUCTION_EVIDENCE.json](./PATCH_9_1_PRODUCTION_EVIDENCE.json)

Cenários validados:
- **A** — Data Layer · `COGNITIVE_PRIMARY` · winner + runner-up · `CONTROLLED`
- **B** — Provider-only · `COMMERCIAL_ONLY_FALLBACK` · winner + runner-up
- **G** — Social · sem `mia_recommendation_decision`

## Limitações

- Runner-up inferido apenas de `rankedProducts` disponíveis — sem objeto runner-up formal persistido
- Scores observados (`localFallbackScore`, `_miaScore`, etc.) — nunca recalculados
- `winner_product_family` = hash SHA-256 de identificadores seguros — nunca título completo
- Domínio comercial apenas (gate Phase 8)

## Melhorias futuras (PATCH 9.2+)

- Acceptance/rejection signals
- Elimination trail
- Runner-up formal object
