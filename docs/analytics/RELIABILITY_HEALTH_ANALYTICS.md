# Health Reliability Analytics — PATCH 7.4

**Fase:** 7 — Reliability Analytics  
**Patch:** 7.4 — Health Metrics  
**Versão do snapshot:** `7.4.0` (SQL-derived)  
**Status:** 🟡 EM ANDAMENTO

---

## 1. Pergunta respondida

> **Como está a saúde geral da plataforma neste momento?**

Health consolida PATCH 7.1 (outcomes), 7.2 (errors) e 7.3 (latency) **sem criar eventos runtime duplicados**.

---

## 2. Auditoria (Etapa 1)

### Métricas reaproveitáveis

| Origem | Métrica | Uso Health |
|--------|---------|------------|
| 7.1 | `success_rate`, `partial_success_rate`, `error_rate`, `fallback_rate` | Reliability / Stability |
| 7.2 | `error_request_rate`, `recovered_error_rate`, `unrecovered_error_rate`, `unknown_error_rate` | Stability |
| 7.3 | `p95/p99_latency_ms`, `slow_request_rate`, `analytics_gap_rate` | Performance |

### Redundâncias evitadas

- **Não** persiste `mia_health_snapshot` em runtime
- **Não** recalcula latência no handler HTTP
- **Não** altera PATCH 7.1 / 7.2 / 7.3

### Decisão Etapa 7

Health é **100% SQL-consolidado**. Justificativa:

- Dados fonte já existem em `analytics_events`
- Snapshot é derivável on-read (dashboards)
- Zero overhead no caminho de resposta
- Evita duplicação e drift entre evento health e fontes

`lib/miaHealthSnapshotBuilder.js` existe para **testes e consumo programático offline**, não para INSERT.

---

## 3. Definição formal (Etapa 2)

**Health** = visão consolidada da estabilidade operacional (disponibilidade, sucesso, erros, latência).

**Não mede:** satisfação, qualidade de recomendação, ranking.

---

## 4. Pilares (Etapa 3)

| Pilar | Definição | Indicadores principais |
|-------|-----------|------------------------|
| **Availability** | Capacidade de responder | `availability_rate`, `request_volume` |
| **Reliability** | Respostas corretas entregues | `success_rate`, `partial_success_rate` |
| **Stability** | Comportamento consistente | `error_rate`, `unknown_error_rate`, recovery |
| **Performance** | Tempo dentro do esperado | `latency_p95`, `latency_p99`, `slow_request_rate` |

---

## 5. Indicadores (Etapa 4)

Todos calculados em `patch-74-query1-overall-health.sql`:

- `availability_rate` = (volume − ERROR outcomes) / volume
- `success_rate`, `partial_success_rate` — PATCH 7.1
- `error_rate` — outcomes ERROR (7.1) + eventos 7.2 correlacionados
- `recovered_error_rate`, `unrecovered_error_rate`, `unknown_error_rate` — PATCH 7.2
- `latency_p95`, `latency_p99`, `slow_request_rate` — PATCH 7.3
- `request_volume` — total 7.1
- `analytics_gap_rate` — respostas 7.1 sem evento 7.3 por `request_id`

---

## 6. Health Status (Etapa 6 — documental)

| Status | Condições baseline (qualquer uma) |
|--------|-----------------------------------|
| **CRITICAL** | availability < 90% · unrecovered > 25% · error_rate > 35% · p99 ≥ 15s (n≥5) |
| **UNSTABLE** | error_rate > 20% · slow_rate > 40% · unknown > 15% |
| **DEGRADED** | partial_success > 40% · slow_rate > 20% · recovered errors elevados |
| **HEALTHY** | nenhuma condição acima |
| **INSUFFICIENT_DATA** | request_volume = 0 |

Estados **informativos** — nunca alteram runtime.

---

## 7. Health Score (Etapa 9)

**Não implementado.** Estados qualitativos são suficientes com amostra pequena; score numérico exigiria pesos arbitrários.

---

## 8. SQL

- [analytics-reliability-health.sql](./analytics-reliability-health.sql)
- Q1: [patch-74-query1-overall-health.sql](./sql/patch-74-query1-overall-health.sql)
- Q2: [patch-74-query2-component-breakdown.sql](./sql/patch-74-query2-component-breakdown.sql)
- Q3: [patch-74-query3-health-trends.sql](./sql/patch-74-query3-health-trends.sql)
- Q4: [patch-74-query4-instrumentation-quality.sql](./sql/patch-74-query4-instrumentation-quality.sql)

---

## 9. Overhead (Etapa 11)

**Zero** no runtime de chat — apenas consultas SQL offline/dashboard.

---

## 10. Amostra mínima

- Health status: ≥ 1 resposta 7.1
- Percentis latência em health: ≥ 5 eventos 7.3 (`amostra_limitada_percentil` abaixo disso)

---

## 11. Limitações

1. Health reflete janela acumulada em produção (não sliding window automática)
2. Gaps 7.3 elevam `analytics_gap_rate` — cobertura latency ainda em expansão
3. `/api/health` (liveness) ≠ Health Analytics (confiabilidade agregada)
