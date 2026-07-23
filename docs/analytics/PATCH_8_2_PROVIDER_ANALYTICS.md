# PATCH 8.2 — Provider Analytics

**Evento:** `mia_provider_attempt` · **Versão:** `8.2.0`  
**Status:** 🟢 **PATCH 8.2 APROVADO** — deploy `43974ea` · produção validada · PATCH 8.3 não iniciado

---

## Status

| Etapa | Estado |
|-------|--------|
| Auditoria pré-implementação | ✅ |
| Modelo de eventos | ✅ |
| Implementação libs + hooks | ✅ |
| Testes unitários (45/45) | ✅ |
| Regressões 8.1 + 7.x | ✅ |
| SQL Q1–Q6 documentado | ✅ |
| Deploy produção | ✅ `43974ea4afe9` |
| Validação Supabase produção | ✅ |
| PATCH 8.3 | ❌ não iniciado |

---

## Evidências de produção (2026-07-23)

- **Health:** `/api/health` 200 · build `43974ea4afe9`
- **Smoke:** 24/26 (2 checks não bloqueantes de roteamento)
- **Cenários A–G:** provider_continuation comprovado (B3 · `PROVIDER_ONLY`)
- **SQL Q1–Q6:** 14/14
- **Eventos reais:** `mia_provider_attempt` · `8.2.0` · providers `google_shopping`, `supabase_cache`, `mercadolivre_public`
- **Correlação:** 3 fluxos `mia_commercial_search` → `mia_provider_attempt` → `mia_response_outcome`
- **Arquivo:** [PATCH_8_2_PRODUCTION_EVIDENCE.json](./PATCH_8_2_PRODUCTION_EVIDENCE.json)

---

## Veredito técnico

Implementação observacional concluída localmente. Um evento `mia_provider_attempt` por tentativa real de provider, correlacionável via `request_id` com `mia_commercial_search` (8.1), `data_layer_resolution` (6.4) e eventos 7.x. Sem alteração funcional de seleção, fallback, merge, ranking ou winner.

---

## Auditoria da arquitetura de providers

### Registry (`commercialProviderRegistry.js`)

| provider_id | Status prod | Family | Timeout |
|-------------|-------------|--------|---------|
| `google_shopping` | enabled | SEARCH_ENGINE | 12s |
| `google_shopping_dataforseo` | disabled (env) | DATA_PROVIDER | 15s |
| `mercadolivre_public` | disabled (env) | MARKETPLACE | 10s |
| `apify_mercadolivre` | enabled | SCRAPER | 120s |
| `amazon` | stub/disabled | MARKETPLACE | 15s |
| `supabase_cache` | legacy only | CACHE | — |

### Caminhos de execução (produção CONTROLLED)

**Funcional (resposta):** `safeFetchSerpPrices` → `fetchCommercialProductsFromProviders` — cadeia legacy first-win:

```text
mercadolivre_public (alias mercadolivre)
→ supabase_cache (alias supabasecache)
→ google_shopping (alias serpapi)
```

**Observacional shadow:** `executeCommercialRuntimeShadow` → `executeConditionalProviderFetch` — **inativo em CONTROLLED** (`!isCommercialRuntimeControlled()`).

**Controlled multi-provider:** `executeConditionalProviderFetch` — usado em shadow/dev; instrumentado para tentativas futuras.

### Hooks confiáveis

| Hook | Local | Momento |
|------|-------|---------|
| Início/fim tentativa legacy | `fetchCommercialProductsFromProviders` | após `provider.fn()` |
| Skip auth/cost guard | idem | antes de fetch |
| Conditional fetch | `executeConditionalProviderFetch` | após fetch / short-circuit skip |
| Shadow subset | `commercialRuntimeShadow.js` | após conditional execution |
| Winner/contribuição | `instrumentProviderAttemptAnalyticsForDelivery` | `sendHttpRuntimeResponse` |
| Persistência | `scheduleProviderAttemptAnalytics` | fire-and-forget |

---

## Modelo de eventos escolhido

**Apenas `mia_provider_attempt` (8.2.0).** Sem `mia_provider_summary` — resumos derivados por SQL Q1–Q5.

Justificativa: cada tentativa é observável independentemente; agregados redundantes aumentariam custo sem ganho analítico.

---

## Contrato

- `query_text`: sempre `null` (sem query em 8.2)
- `metadata.event_version`: `8.2.0`
- `metadata.request_id`: correlação primária
- Chave dedup: `request_id + provider_id + attempt_index + event_name + event_version`

Campos `post_merge_results_count` e `post_dedup_results_count`: **`null`** — provenance por provider não preservada após merge/dedup global.

---

## Taxonomias

Centralizadas em `lib/miaProviderAttemptCatalog.js`: family, runtime_mode, execution_path, config_status, attempt_status, skip_reason, failure_category, http_status_group.

---

## Providers instrumentados

IDs estáveis via `lib/miaProviderIdCatalog.js` com aliases legacy (`serpapi` → `google_shopping`, etc.).

---

## Runtime legacy, controlled e shadow

| Modo | execution_path | Winner funcional |
|------|----------------|------------------|
| LEGACY / CONTROLLED + legacy chain | `LEGACY_CHAIN` | observado em delivery |
| Controlled fetch | `CONTROLLED_MULTI_PROVIDER` | observado em delivery |
| Shadow | `SHADOW_ONLY` | **nunca** (`winner_provider=false`) |

---

## Lifecycle

`recordProviderAttemptObservation` → acumula no bucket request-scoped → `instrumentProviderAttemptAnalyticsForDelivery` aplica contribuição/winner → `scheduleProviderAttemptAnalytics` (fire-and-forget).

---

## Shadow trace subset

Adaptador `miaProviderShadowTraceAdapter.js` materializa apenas: provider_id, status, counts, skip — **sem** payload bruto, HTML, URLs completas, tokens ou listas de produtos.

---

## Deduplicação e retries

- Retries legítimos: `attempt_index` incrementado por provider
- Dupla finalização: bloqueada por `dedupKey` + store request-scoped
- SKIPPED: emitido para short-circuit conditional e blocks auth/cost em legacy

---

## Counts, contribuição e winner

| Campo | Definição |
|-------|-----------|
| `raw_results_count` | produtos retornados pelo adapter |
| `normalized_results_count` | igual a raw na cadeia legacy atual |
| `contributed_results` | SUCCESS com count > 0 |
| `contributed_to_final_set` | source/provider aparece em `body.prices` |
| `winner_provider` | primeiro price source — **observado**, não recalculado |

---

## Privacidade

Sanitização defensiva: sem tokens, secrets, query, ofertas, URLs assinadas, stack.

---

## Relação com 6.4, 7.x e 8.1

- **6.4:** DL resolve → nenhum provider attempt esperado
- **8.1:** hub da busca; correlação por `request_id`
- **7.2/7.3:** erros/latência global — não duplicados
- **8.3:** não iniciado — sem detalhe de oferta

---

## SQL

| Query | Arquivo |
|-------|---------|
| Q1 Volume/status | `sql/patch-82-query1-provider-volume-status.sql` |
| Q2 Latência | `sql/patch-82-query2-provider-latency.sql` |
| Q3 Contribuição | `sql/patch-82-query3-provider-contribution.sql` |
| Q4 Falhas/fallback | `sql/patch-82-query4-provider-failures-fallback.sql` |
| Q5 Runtime | `sql/patch-82-query5-provider-runtime-paths.sql` |
| Q6 Correlação | `sql/patch-82-query6-provider-correlation.sql` |

---

## Testes

```bash
npm run test:mia:analytics:patch-82:provider-analytics
```

**Resultado local:** 45/45 · regressões 8.1 (60/60) + 7.1–7.3 intactas.

---

## Limitações (não bloqueantes)

- Shadow inativo em produção CONTROLLED
- Mercado Livre / DataForSEO disabled
- `post_merge` / `post_dedup` por provider não mensurável
- Amostra produção pendente pós-deploy
- Cenário B (continuação real provider) depende de miss no Data Layer

---

## Próximo passo

1. Commit + push + deploy Vercel  
2. Validar `/api/health` + eventos 8.2.0 em Supabase  
3. Executar SQL Q1–Q6 em produção  
4. Declarar 🟢 APROVADO após evidências

**PATCH 8.3 — Offer Analytics:** não iniciado.
