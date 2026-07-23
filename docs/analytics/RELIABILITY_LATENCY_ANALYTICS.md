# Latency Reliability Analytics — PATCH 7.3

**Fase:** 7 — Reliability Analytics  
**Patch:** 7.3 — Latency Analytics  
**Versão do evento:** `7.3.0`  
**Status:** 🟡 EM ANDAMENTO

---

## 1. Pergunta respondida

> **Quanto tempo a MIA leva para responder, quais etapas consomem mais tempo e quais cenários apresentam degradação?**

Observacional — não altera ranking, fallback, timeouts nem respostas.

---

## 2. Auditoria pré-implementação (Etapa 1)

### Medições existentes

| Origem | Campo | Início | Fim | Escopo | Persistido? |
|--------|-------|--------|-----|--------|-------------|
| PATCH 6.4 | `query_duration_ms` | Entrada pipeline DL comercial | Emit analytics DL | Subconjunto Data Layer | ✅ `data_layer_resolution` |
| PATCH 7.1 | `response_duration_ms` | POST aceito (`pipelineStartedAt`) | Instrumentação resposta | Handler completo | ✅ `mia_response_outcome` |
| PATCH 12E | `durationMs` | `withMiaObservability` entry | `finally` | Wrapper HTTP | ❌ logs + memória |
| PATCH 11A.2 | `gateMs` | Avaliação entry gate | Fim gate | Gate comercial | ❌ debug trace |
| OpenAI | (novo 7.3) | `callOpenAI` start | `finally` | Chamada LLM | ✅ stage `LLM` |
| Providers | (novo 7.3) | Antes `provider.fn` | Depois await | Por provider | ✅ stage `PROVIDER` |

### Delta formal vs PATCH 6.4 (Etapa 2)

| PATCH 6.4 | PATCH 7.3 |
|-----------|-----------|
| `query_duration_ms` — resolução/uso Data Layer | `total_duration_ms` — latência E2E servidor |
| Evento `data_layer_resolution` | Evento `mia_latency_event` |
| Apenas caminho comercial com DL | Toda resposta HTTP instrumentada |
| **Não renomear** `query_duration_ms` | Referência cruzada em `metadata.data_layer_query_duration_ms` |

Correlação: `request_id` — comparar DL subset vs total E2E.

---

## 3. Definições temporais (Etapa 3)

| Conceito | Definição |
|----------|-----------|
| **Request start** | `pipelineStartedAt` — POST válido aceito no core (`chat-gpt4o.js`) |
| **Response ready** | Momento da instrumentação em `instrumentLatencyAnalyticsForDelivery` (corpo funcional pronto) |
| **Response sent** | Início do `res.status().json()` imediatamente após instrumentação |
| **End-to-end server latency** | `total_duration_ms` = response ready − request start |
| **Stage latency** | Segmentos exclusivos entre marcos (`HTTP_VALIDATION` → … → `RESPONSE_BUILDER`) |
| **Provider latency** | Soma das tentativas medidas em `provider.fn()` |
| **Analytics overhead** | Fire-and-forget após response ready — **não** incluído em `total_duration_ms` |

Etapas inclusivas/paralelas: soma de stages **≠** total quando houver paralelismo — documentado em `metadata.stages`.

---

## 4. Taxonomia de etapas (Etapa 4)

`HTTP_VALIDATION` · `AUTH` (N/A no core autenticado) · `ROUTER` · `INTENT_CLASSIFICATION` · `DATA_LAYER` · `DECISION_ENGINE` · `PROVIDER` · `LLM` · `CONTRACTS` · `RESPONSE_BUILDER` · `TOTAL`

Etapas não marcadas no caminho: `measurement_available: false` + `limitation_reason`.

---

## 5. Evento `mia_latency_event` (Etapas 5–7)

- **Versão:** `7.3.0`
- **Categoria:** `reliability_latency`
- **Modelo:** Opção A — **1 evento por requisição** com `metadata.stages[]`
- **Dedup:** `request_id | mia_latency_event | 7.3.0`

Campos principais: `total_duration_ms`, `latency_band`, `slow_request`, `stages`, `response_outcome`, `error_present`, `measurement_gap_count`.

---

## 6. Thresholds documentais (Etapa 10 — baseline, não SLO)

| Faixa | Ms | Uso |
|-------|-----|-----|
| FAST | < 2000 | Baseline inicial |
| ACCEPTABLE | < 5000 | Baseline inicial |
| SLOW | < 10000 | Baseline inicial |
| CRITICAL | ≥ 10000 | Baseline inicial |

`slow_request = true` quando `total_duration_ms ≥ 5000`.

---

## 7. Percentis (Etapa 9)

- Método SQL: `percentile_cont(p) WITHIN GROUP (ORDER BY total_duration_ms)`
- População: eventos produção com duração válida ≥ 0
- `amostra_limitada_percentil` quando n < 20

---

## 8. Correlações (Etapa 11)

Por `request_id`:

- **6.4:** `data_layer_query_duration_ms` vs `total_duration_ms`
- **7.1:** `response_outcome`, `response_path`
- **7.2:** presença de `mia_error_event`

SQL: `patch-73-query3-stage-correlation.sql`

---

## 9. Overhead (Etapa 15)

- Timers locais (`Date.now()`)
- INSERT assíncrono (`scheduleLatencyAnalytics`)
- Payload sanitizado, stages limitados (≤ 20)
- Falha Supabase: `console.warn` — não afeta HTTP

---

## 10. SQL

- Principal: [analytics-reliability-latency.sql](./analytics-reliability-latency.sql)
- Q1: [patch-73-query1-latency-overview.sql](./sql/patch-73-query1-latency-overview.sql)
- Q2: [patch-73-query2-latency-dimensions.sql](./sql/patch-73-query2-latency-dimensions.sql)
- Q3: [patch-73-query3-stage-correlation.sql](./sql/patch-73-query3-stage-correlation.sql)
- Q4: [patch-73-query4-evolution-gaps-panel.sql](./sql/patch-73-query4-evolution-gaps-panel.sql)

---

## 11. Limitações

1. **401/405** — pré-ALS; sem evento de latência 7.3
2. **Relógio** — `Date.now()` wall clock (sem `performance.now()` no runtime Node atual)
3. **Stages paralelos** — durações exclusivas aproximadas; não somar automaticamente ao total
4. **DECISION_ENGINE / CONTRACTS** — marcados apenas quando hooks existirem no caminho
