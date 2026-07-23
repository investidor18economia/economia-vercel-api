# Provider Analytics — PATCH 8.2

Observabilidade server-side de tentativas de providers comerciais.

---

## Evento

| Campo | Valor |
|-------|-------|
| `event_name` | `mia_provider_attempt` |
| `event_version` | `8.2.0` |
| `category` | `provider_attempt` |
| Writer | `lib/miaProviderAttemptAnalytics.js` |
| Hook principal | `pages/api/chat-gpt4o.js` (`fetchCommercialProductsFromProviders`, delivery) |

---

## Princípios

- **Observacional only** — nunca altera seleção, fallback, merge, ranking ou winner
- **Fire-and-forget** — falha de analytics não interrompe requisição
- **Sem query ou oferta** no payload — correlação via `request_id` com 8.1
- **Data Layer não é provider** — continua em PATCH 6.4

---

## Metadata principal

```json
{
  "provider_id": "google_shopping",
  "provider_family": "SEARCH_ENGINE",
  "runtime_mode": "CONTROLLED",
  "execution_path": "LEGACY_CHAIN",
  "attempt_index": 1,
  "attempt_status": "SUCCESS",
  "duration_ms": 1200,
  "raw_results_count": 5,
  "normalized_results_count": 5,
  "contributed_results": true,
  "contributed_to_final_set": true,
  "winner_provider": true,
  "fallback_triggered": false,
  "response_usable": true
}
```

Campos `post_merge_results_count` e `post_dedup_results_count` permanecem `null` quando provenance não é preservada.

---

## Correlação

| Evento | Relação |
|--------|---------|
| `mia_commercial_search` (8.1) | hub — `provider_continuation_required` |
| `data_layer_resolution` (6.4) | DL hit → zero attempts esperados |
| `mia_error_event` (7.2) | erro operacional global |
| `mia_latency_event` (7.3) | latência total da requisição |

---

## SQL

Consultas em [`sql/patch-82-query1-provider-volume-status.sql`](./sql/patch-82-query1-provider-volume-status.sql) … [`patch-82-query6-provider-correlation.sql`](./sql/patch-82-query6-provider-correlation.sql).

---

## Referências

- [PATCH_8_2_PROVIDER_ANALYTICS.md](./PATCH_8_2_PROVIDER_ANALYTICS.md) — relatório completo
- [COMMERCIAL_SEARCH_ANALYTICS.md](./COMMERCIAL_SEARCH_ANALYTICS.md) — PATCH 8.1
- [COMMERCIAL_ANALYTICS_PHASE_AUDIT.md](./COMMERCIAL_ANALYTICS_PHASE_AUDIT.md) — PATCH 8.0

---

*Provider Analytics — PATCH 8.2 · event_version 8.2.0*
