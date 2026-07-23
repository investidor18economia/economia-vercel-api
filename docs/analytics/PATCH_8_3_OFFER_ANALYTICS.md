# PATCH 8.3 — Offer Analytics

**Evento:** `mia_offer_set` · **Versão:** `8.3.0`  
**Status:** 🟢 **APROVADO** · produção `2158de6` · build `2158de61bc27`

## Modelo

Um evento agregado por `request_id` — sem evento individual por oferta (volume previsível).

Correlaciona com:
- **8.1** — busca comercial
- **8.2** — tentativas de provider
- **7.x** — outcome/erro/latência
- **Frontend** — `mia_recommendation_shown`, `offer_click`, `favorite_created`, `price_alert_created`

## Auditoria (pré-implementação)

### Pipeline observado
| Estágio | Hook |
|---------|------|
| Raw | `rawProducts.length` após DL/providers |
| Normalização/ranking | pós `rankProductsUnderContract` |
| Dedup (legacy) | pós `dedupeCommercialProducts` no router |
| Seleção | `displayProducts` + `selectedBestProduct` |
| Delivery | `body.prices` em `sendHttpRuntimeResponse` |

### Eventos existentes (não duplicados)
- `mia_recommendation_shown` — impressão client-side (sem `request_id` hoje)
- `offer_click`, `favorite_created`, `price_alert_created` — interações client

### Limitações
- `post_merge`/`dedup` counts parciais fora do router legacy
- Frete/parcelamento raramente disponíveis no card legacy
- Impressão real = client event; delivery = server `body.prices`

## Contrato

Ver [OFFER_ANALYTICS.md](./OFFER_ANALYTICS.md) e `EVENT_CONTRACT.md` §7.13.

## Produção

Evidência: [PATCH_8_3_PRODUCTION_EVIDENCE.json](./PATCH_8_3_PRODUCTION_EVIDENCE.json)

```bash
npm run test:mia:analytics:patch-83:prod-smoke
npm run test:mia:analytics:patch-83:prod-validation
```

Cenários validados:
- **A** — Data Layer · `SUCCESS` · `delivered_offers_count=3`
- **B** — Provider-only · `PARTIAL` · funil raw→ranked observado
- **G** — Social · sem `mia_offer_set`


## SQL

`docs/analytics/sql/patch-83-query1-offer-funnel.sql` … `query7-offer-loss-diagnostic.sql`
