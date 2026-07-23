# Response Reliability Analytics — PATCH 7.1

**Fase:** 7 — Reliability Analytics  
**Patch:** 7.1 — Response Analytics  
**Versão do evento:** `7.1.0`  
**Status:** 🟡 EM ANDAMENTO

---

## 1. Pergunta respondida

> **As respostas produzidas pela MIA são confiáveis?**

Este patch mede o **resultado final entregue ao usuário** após o pipeline completo — não qualidade de catálogo (Fase 6), não taxonomia detalhada de erro (PATCH 7.2), não latência (PATCH 7.3), não saúde operacional (PATCH 7.4).

---

## 2. Definição formal de "Response"

| Conceito | Definição |
|----------|-----------|
| **Início** | Momento em que `miaChatCoreHandler` aceita o POST autenticado e registra `pipelineStartedAt` |
| **Término** | Momento em que a resposta HTTP é enviada (`sendHttpRuntimeResponse`, ou saídas 400/500 instrumentadas) |
| **Resposta válida** | HTTP 2xx com conteúdo útil (`reply` e/ou ofertas) classificada como `SUCCESS` ou `FALLBACK` |
| **Resposta parcial** | Conteúdo entregue, porém degradado ou incompleto — `PARTIAL_SUCCESS` |
| **Resposta inválida** | Sem entrega útil — `NO_RESULT` ou `ERROR` |
| **Resposta interrompida** | `TIMEOUT` ou `CANCELLED` (reservados; instrumentação mínima até PATCH 7.2/7.3) |

**Validade semântica (`response_validity`):**

| Valor | Outcomes associados |
|-------|---------------------|
| `valid` | `SUCCESS`, `FALLBACK` |
| `partial` | `PARTIAL_SUCCESS` |
| `invalid` | `NO_RESULT`, `ERROR` |
| `interrupted` | `TIMEOUT`, `CANCELLED` |

---

## 3. Taxonomia de outcome (única)

| Outcome | Significado |
|---------|-------------|
| `SUCCESS` | Resposta completa e utilizável entregue ao usuário |
| `PARTIAL_SUCCESS` | Resposta entregue, porém incompleta ou híbrida/degradada |
| `FALLBACK` | Resposta via caminho de fallback, ainda utilizável |
| `NO_RESULT` | Pipeline concluiu sem resultado comercial ou conteúdo útil |
| `ERROR` | Falha explícita (HTTP ≥400, paths de erro, exceção interna) |
| `TIMEOUT` | Reserva — sinal explícito de timeout (PATCH 7.3 expande) |
| `CANCELLED` | Reserva — cancelamento/interrupção explícita |

**Regra:** nomes únicos, sem duplicação com classificações 6.4 (`FULL_DATA_LAYER`, etc.). Correlação opcional via `data_layer_response_classification` no metadata.

---

## 4. Evento

| Campo | Valor |
|-------|-------|
| `event_name` | `mia_response_outcome` |
| `category` | `reliability_response` (produção) · `reliability_response_test` (smoke) |
| `metadata.event_version` | `7.1.0` |
| Writer | `emitResponseOutcomeAnalytics()` → `scheduleResponseOutcomeAnalytics()` |
| Hook | `sendHttpRuntimeResponse()` + saídas 400/500 em `chat-gpt4o.js` |

**Decisão:** evento único parametrizado (Opção A do PATCH 7.0) — alinhado ao padrão `data_layer_resolution` (6.4).

### Delta vs PATCH 6.4

| Dimensão | 6.4 `data_layer_resolution` | 7.1 `mia_response_outcome` |
|----------|----------------------------|------------------------------|
| Escopo | Consultas comerciais instrumentadas | **Toda resposta HTTP do chat** |
| Pergunta | Data Layer foi efetivo? | A resposta final foi confiável? |
| Taxonomia | FULL/PARTIAL/FALLBACK_ONLY/NO_COMMERCIAL | SUCCESS/PARTIAL_SUCCESS/FALLBACK/NO_RESULT/ERROR/… |
| Denominador SQL | consultas comerciais instrumentadas | respostas instrumentadas |

---

## 5. Métricas

Denominador padrão: **`respostas_instrumentadas`** (`event_name = 'mia_response_outcome'`, escopo produção).

| Métrica | Absoluto | Relativo | NULL quando |
|---------|----------|----------|-------------|
| `total_responses` | count(*) | 1.0000 (base) | nunca |
| `success_rate` | outcome = SUCCESS | / total | total = 0 |
| `partial_success_rate` | outcome = PARTIAL_SUCCESS | / total | total = 0 |
| `fallback_rate` | outcome = FALLBACK | / total | total = 0 |
| `no_result_rate` | outcome = NO_RESULT | / total | total = 0 |
| `timeout_rate` | outcome = TIMEOUT | / total | total = 0 |
| `error_rate` | outcome = ERROR | / total | total = 0 |
| `cancelled_rate` | outcome = CANCELLED | / total | total = 0 |

SQL: [analytics-reliability-response.sql](./analytics-reliability-response.sql)

---

## 6. Dashboards (4 queries)

| Query | Arquivo split | Conteúdo |
|-------|---------------|----------|
| Q1 | `sql/patch-71-query1-outcome-overview.sql` | Overview · taxas globais · capacidade |
| Q2 | `sql/patch-71-query2-outcome-dimensions.sql` | Outcome por caminho · intent · validade |
| Q3 | `sql/patch-71-query3-partial-fallback-analytics.sql` | Parciais · fallback · correlação 6.4 |
| Q4 | `sql/patch-71-query4-evolution-gaps-panel.sql` | Evolução diária · gaps · versão |

---

## 7. Runtime (observacional)

- INSERT **fire-and-forget** — não bloqueia resposta HTTP
- Summary exposto em `response_outcome_analytics` no body (retrocompatível)
- Falha de INSERT **nunca** altera resposta ao usuário
- **Nenhuma** lógica comercial alterada

---

## 8. Limitações conhecidas

1. **401/405** (pré-ALS): não instrumentados — ocorrem antes de `runWithSharedRequestState`
2. **TIMEOUT/CANCELLED**: taxonomia reservada; volume esperado ≈ 0 até PATCH 7.3
3. **Deploy necessário**: eventos reais só após deploy Vercel
4. **`response_duration_ms`**: observacional local; análise formal de latência = PATCH 7.3

---

## 9. Referências

- [PATCH_7.1_RESPONSE_ANALYTICS.md](./PATCH_7.1_RESPONSE_ANALYTICS.md) — relatório de entrega
- [contracts/EVENT_CONTRACT.md](./contracts/EVENT_CONTRACT.md) §7.6
- [PATCH_7.0_PHASE_7_ROADMAP_AUDIT.md](./PATCH_7.0_PHASE_7_ROADMAP_AUDIT.md)
- Runtime: `lib/miaResponseOutcomeClassifier.js` · `lib/miaResponseAnalytics.js`
