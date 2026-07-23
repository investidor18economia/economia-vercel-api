# PHASE 8 MASTER DOCUMENT
## Commercial Intelligence Analytics — Documento Mestre Oficial

Versão: 1.0  
Status: ✅ **FASE 8 CONCLUÍDA**  
Data de conclusão: Julho/2026

---

# 1. Visão geral

## Objetivo da Fase 8

Construir observabilidade completa da **camada comercial** da MIA: busca, providers e pipeline de ofertas — sem alterar decisões comerciais.

## Problema resolvido

Antes da Fase 8 era impossível responder analiticamente, por `request_id`:

- Houve busca comercial? Por qual caminho?
- Quais providers foram tentados e como terminaram?
- Quantas ofertas sobreviveram ao funil e qual foi entregue ao usuário?

## Valor entregue

Correlação ponta a ponta **Commercial Search → Provider Attempts → Offer Set → Outcome/Latency/Error → Interações**, com taxonomias centralizadas, SQL operacional e evidência de produção.

---

# 2. Arquitetura

```text
Entrada comercial
  → Intenção / gate comercial
  → Extração de query
  → Data Layer                    [data_layer_resolution · 6.4]
  → Decisão de continuação
  → Provider router / tentativas  [mia_provider_attempt · 8.2]
  → Normalização → merge → dedup → ranking → seleção
  → Offer pipeline agregado       [mia_offer_set · 8.3]
  → Response builder / delivery
  → Outcome / erro / latência     [7.x]
  → Frontend / interação          [mia_recommendation_shown, offer_click, …]
```

**Hub de correlação:** `request_id` (+ `session_id`, `visitor_id`, `conversation_id`).

**Busca comercial (8.1)** observa intenção, path, execução e resultado geral — **não** detalha tentativas individuais de provider nem funil de ofertas.

---

# 3. Patches

| Patch | Evento | Versão | Status |
|-------|--------|--------|--------|
| 8.0 | — | — | Auditoria arquitetural inicial |
| 8.1 | `mia_commercial_search` | 8.1.0 | ✅ Aprovado |
| 8.2 | `mia_provider_attempt` | 8.2.0 | ✅ Aprovado |
| 8.3 | `mia_offer_set` | 8.3.0 | ✅ Aprovado |
| 8.4 | — | — | ✅ Auditoria final |

---

# 4. Eventos

## 4.1 mia_commercial_search · 8.1.0

- **Responsabilidade:** busca comercial agregada por request
- **Emissão:** delivery HTTP (`sendHttpRuntimeResponse`)
- **Dedup:** `request_id + event_name + event_version`
- **Volume:** ≤ 1 por request comercial elegível
- **Doc:** [PATCH_8_1_COMMERCIAL_SEARCH_ANALYTICS.md](./PATCH_8_1_COMMERCIAL_SEARCH_ANALYTICS.md)

## 4.2 mia_provider_attempt · 8.2.0

- **Responsabilidade:** uma tentativa real de provider
- **Emissão:** fim de cada tentativa (legacy router, conditional fetch, shadow subset)
- **Dedup:** `request_id + provider_id + attempt_index + event_name + event_version`
- **Volume:** N por request (retries legítimos preservados)
- **Doc:** [PROVIDER_ANALYTICS.md](./PROVIDER_ANALYTICS.md)

## 4.3 mia_offer_set · 8.3.0

- **Responsabilidade:** funil agregado de ofertas por request
- **Emissão:** delivery HTTP, somente se pipeline alcançado
- **Dedup:** `request_id + event_name + event_version`
- **Volume:** ≤ 1 por request
- **Doc:** [OFFER_ANALYTICS.md](./OFFER_ANALYTICS.md)

---

# 5. Matriz de responsabilidades

| Pergunta analítica | Evento oficial | Campo(s) canônico(s) |
|--------------------|----------------|----------------------|
| Houve busca comercial? | `mia_commercial_search` | `search_execution_status` |
| Qual search path? | `mia_commercial_search` | `search_path` |
| Data Layer resolveu? | `data_layer_resolution` | `resolution_status` |
| Continuação para providers? | `mia_commercial_search` | `provider_continuation_required` |
| Qual provider tentado? | `mia_provider_attempt` | `provider_id`, `attempt_index` |
| Como terminou? | `mia_provider_attempt` | `attempt_status` |
| Houve fallback? | `mia_provider_attempt` | `fallback_triggered` |
| Funil de ofertas? | `mia_offer_set` | `raw_*` … `delivered_*` counts |
| Winner entregue? | `mia_offer_set` | `winner_present`, `winner_provider_id` |
| Resposta utilizável? | `mia_response_outcome` | `delivery_status` |
| Erro? | `mia_error_event` | `error_category` |
| Latência? | `mia_latency_event` | `total_duration_ms` |
| Card renderizado? | `mia_recommendation_shown` | client event |
| Clique? | `offer_click` | client event |
| Favorito / alerta? | `favorite_created` / `price_alert_created` | client event |

**Sobreposição válida:** `runtime_mode` em 8.1, 8.2 e 8.3 (observacional, mesma taxonomia).  
**Sobreposição indevida:** nenhuma identificada — counts de provider em 8.2 ≠ funil de ofertas em 8.3.

---

# 6. Taxonomias

## Runtime mode (compartilhada)

`LEGACY` · `CONTROLLED` · `SHADOW` · `UNKNOWN`

> `runtime_mode=CONTROLLED` + `execution_path=LEGACY_CHAIN` é válido: runtime controlado usando executor legacy internamente.

## Search path (8.1 / 8.3)

`DATA_LAYER_ONLY` · `PROVIDER_ONLY` · `HYBRID` · `FALLBACK` · `UNKNOWN` · `NO_SEARCH`

## Provider attempt status (8.2)

`SUCCESS` · `EMPTY` · `FAILED` · `TIMEOUT` · `SKIPPED` · `UNKNOWN`

## Offer pipeline status (8.3)

`SUCCESS` · `PARTIAL` · `EMPTY` · `FAILED` · `NOT_EXECUTED` · `UNKNOWN`

## Termination stage (8.3)

`RAW` · `NORMALIZATION` · `MERGE` · `DEDUP` · `RANKING` · `SELECTION` · `DELIVERY` · `UNKNOWN` · `NOT_APPLICABLE`

Catálogos: `lib/miaCommercialSearchCatalog.js`, `lib/miaProviderAttemptCatalog.js`, `lib/miaOfferSetCatalog.js`.

---

# 7. Correlação

## Server-side (forte)

Todos os eventos 8.x e 7.x compartilham `request_id` via `getSharedRequestState()`.

SQL de correlação: `patch-82-query6`, `patch-83-query6` — CTEs pré-agregam tentativas antes do join.

## Client-side (parcial)

`mia_recommendation_shown`, `offer_click`, `favorite_created`, `price_alert_created` usam `session_id` / `visitor_id`. **`request_id` ausente hoje** — correlação interação↔offer set via sessão + tempo. Melhoria futura, não bloqueante.

## Fire-and-forget delay

Inserts assíncronos: aguardar ~35s após request antes de consultar Supabase.

---

# 8. SQL e dashboards

| Patch | Queries | Foco |
|-------|---------|------|
| 8.1 | Q1–Q5 | Volume, extração, paths, resultados, correlação |
| 8.2 | Q1–Q6 | Volume/status, latência, contribuição, fallback, runtime, correlação |
| 8.3 | Q1–Q7 | Funil, preços/winner, diversidade, qualidade, interações, correlação, perdas |

**Fan-out:** Q5 interações agrega por `session_id` antes de join (PATCH 8.4). Demais queries usam CTEs por `request_id`.

---

# 9. Métricas derivadas (denominadores explícitos)

## Commercial Search

- `search_executed_rate` = EXECUTED / total events
- `provider_continuation_rate` = continuation_required / EXECUTED
- `data_layer_primary_rate` = DATA_LAYER_ONLY / EXECUTED

## Provider Analytics

- `attempt_success_rate` = SUCCESS / attempts
- `contribution_rate` = contributed_to_final_set / SUCCESS
- `fallback_rate` = fallback_triggered / attempts

## Offer Analytics

- `normalization_rate` = normalized / raw (quando raw > 0)
- `dedup_removal_rate` = removed_duplicate / merged
- `delivery_rate` = delivered / selected (quando selected > 0)
- **`delivery_ctr`** = clicks / delivered_offers (**não** impression CTR)
- `intent_rate` = (clicks + favorites + alerts) / delivered (session-level; dedup interação por oferta não definida)

---

# 10. Privacidade

**Nunca persistido:** query completa, URLs, títulos, listas de ofertas, payload bruto, tokens, PII.

**Identidade segura:** `merchant_key` e `offer_fingerprint` via SHA-256 truncado (`lib/miaOfferIdentity.js`).

**Sanitização:** `lib/miaCommercialSearchQuerySanitizer.js`, forbidden keys em analytics libs.

---

# 11. Produção

| Item | Valor |
|------|-------|
| URL | `https://economia-ai.vercel.app` |
| Build (audit) | `23320b81e6e8` |
| Health | `/api/health` → 200 |

Evidências: `PATCH_8.1_PRODUCTION_EVIDENCE.json`, `PATCH_8_2_PRODUCTION_EVIDENCE.json`, `PATCH_8_3_PRODUCTION_EVIDENCE.json`, `PHASE_8_FINAL_AUDIT_EVIDENCE.json`.

Cenários validados: social (zero eventos 8.x), Data Layer SUCCESS, Provider-only PARTIAL, fallback ML→cache, shadow isolado.

---

# 12. Testes

```bash
npm run test:mia:analytics:patch-81:commercial-search-analytics   # 60/60
npm run test:mia:analytics:patch-82:provider-analytics            # 45/45
npm run test:mia:analytics:patch-83:offer-analytics               # 39/39
npm run test:mia:analytics:patch-84:phase8-final-audit            # meta
npm run test:mia:analytics:patch-81:prod-validation               # SQL
npm run test:mia:analytics:patch-82:prod-validation
npm run test:mia:analytics:patch-83:prod-validation
npm run test:mia:analytics:patch-84:prod-audit                    # produção
```

Regressões 7.x executadas nos ciclos de aprovação 8.2 e 8.3.

---

# 13. Overhead

| Cenário | Eventos esperados |
|---------|-------------------|
| Social | 0 comerciais |
| Data Layer only | 1 search + 0–N provider + 1 offer_set |
| Provider-only | 1 search + N attempts + 1 offer_set |
| Shadow | tentativas shadow flagadas; sem winner funcional |

Sem serialização de listas completas; mediana O(n) sobre amostra ≤ 12; fire-and-forget sem await bloqueante.

---

# 14. Limitações conhecidas

### Não bloqueantes

- Atraso ~35s persistência
- `selected_offers_count` null em provider-only
- Counts merge/dedup parciais fora legacy router
- Client sem `request_id`
- Frete/parcelamento raros no card legacy
- Perda ranking→delivery em FALLBACK_RESULT (observada, funcional intacto)

### Melhorias futuras

- Viewability real (IntersectionObserver)
- `request_id` em eventos frontend
- Provenance pós-merge enriquecida
- Dashboards operacionais dedicados

---

# 15. Operação futura

1. **Novo provider:** registrar em `miaProviderIdCatalog.js`; hook em router; SQL Q1/Q6 já filtram por `provider_id`.
2. **Novo campo analítico:** atualizar tracker → classifier → contrato → SQL → testes → changelog.
3. **Nova taxonomia:** adicionar ao catálogo central; nunca string solta no runtime.
4. **Validar regressão:** suites 8.1 + 8.2 + 8.3 + smoke prod.
5. **Auditar produção:** `patch-84-phase8-production-audit.mjs`.

---

# 16. Regras permanentes

- MIA owns the intelligence — Analytics **nunca** decide.
- Fire-and-forget obrigatório.
- Um evento = uma responsabilidade clara.
- Não persistir payload bruto.
- Não recalcular ranking/winner/score.
- Validar em produção antes de aprovar.
- Versionar eventos (`event_version`).
- Manter contrato + SQL sincronizados.

---

# Referências

| Documento | Conteúdo |
|-----------|----------|
| [PATCH_8_4_PHASE_8_FINAL_AUDIT.md](./PATCH_8_4_PHASE_8_FINAL_AUDIT.md) | Auditoria final |
| [contracts/EVENT_CONTRACT.md](./contracts/EVENT_CONTRACT.md) | Contratos §7.11–7.13 |
| [ANALYTICS_CHANGELOG.md](./ANALYTICS_CHANGELOG.md) | Histórico |
| [02_analytics_roadmap.md](./02_analytics_roadmap.md) | Roadmap |
