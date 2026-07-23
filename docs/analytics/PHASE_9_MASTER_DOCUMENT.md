# PHASE 9 MASTER DOCUMENT
## Decision Analytics — Documento Mestre Oficial

Versão: 1.0  
Status: ✅ **FASE 9 CONCLUÍDA**  
Data de conclusão: Julho/2026

---

# 1. Visão geral

## Objetivo da Fase 9

Observar a **jornada completa de decisão comercial** da MIA — da estabilização cognitiva até sinais de aceitação, rejeição, alternativas e runner-up — sem alterar ranking, winner, routing ou resposta.

## Problema resolvido

Antes da Fase 9 era impossível responder analiticamente:

- Qual foi a decisão final (winner, runner-up, scores, constraints)?
- O usuário demonstrou interesse pós-decisão?
- Houve rejeição, refinamento ou substituição?
- O runner-up foi exibido, interagido ou escolhido?
- Houve recuperação após rejeição?

## Valor entregue

Três eventos server-side correlacionados + camada derivada 9.4, taxonomias fechadas, SQL operacional Q1–Q12 (Fase 9) e evidência de produção.

---

# 2. Arquitetura

```text
Decision Engine (ranking / selection / lock / sanitize / reset)
  ↓
9.1 mia_recommendation_decision          [decisão estabilizada]
  ↓ HTTP inline recommendation_decision_analytics
Frontend MIAChat (decision_context, decision_request_id)
  ↓
9.2 mia_recommendation_acceptance_signal [interesse pós-decisão]
  ↑ client track + server follow-up
  ↓
9.3 mia_recommendation_rejection_signal  [rejeição / refinamento / substituição]
  ↑ turn context + decision transition
  ↓
9.4 Runner-up / Alternative (derivado)   [enriquecimento 9.1 + SQL]
  ↓
Dashboards / SQL Q1–Q12
```

**Hub upstream:** Fase 8 (`mia_commercial_search`, `mia_provider_attempt`, `mia_offer_set`) via `request_id`.  
**Hub Fase 9:** `decision_request_id` (= `request_id` da decisão 9.1).

---

# 3. Patches

| Patch | Evento / Camada | Versão | Status |
|-------|-----------------|--------|--------|
| 9.0 | Auditoria arquitetural | — | ✅ Concluído |
| 9.1 | `mia_recommendation_decision` | 9.1.0 | ✅ Aprovado |
| 9.2 | `mia_recommendation_acceptance_signal` | 9.2.0 | ✅ Aprovado |
| 9.3 | `mia_recommendation_rejection_signal` | 9.3.0 | ✅ Aprovado |
| 9.4 | Camada derivada runner-up | 9.4.0 | ✅ Aprovado |
| 9.5 | Auditoria final | — | ✅ Aprovado |

---

# 4. Eventos

## 4.1 mia_recommendation_decision · 9.1.0

- **Responsabilidade:** decisão cognitiva final (winner, runner-up, scores, constraints, 9.4 enrichment)
- **Emissão:** `observeDecisionAnalyticsForStabilizedContext()` — 5 hook sites em `chat-gpt4o.js`
- **Dedup:** `request_id + event_name + event_version`
- **Volume:** ≤ 1 por request comercial com decisão válida
- **Doc:** [RECOMMENDATION_DECISION_ANALYTICS.md](./RECOMMENDATION_DECISION_ANALYTICS.md)

## 4.2 mia_recommendation_acceptance_signal · 9.2.0

- **Responsabilidade:** sinais positivos pós-decisão (render, clique, favorito, alerta, follow-up)
- **Emissão:** client `/api/analytics/track` + server follow-up
- **Dedup:** `decision_request_id + signal_type + signal_target + source_event_id + event_version`
- **Doc:** [RECOMMENDATION_ACCEPTANCE_ANALYTICS.md](./RECOMMENDATION_ACCEPTANCE_ANALYTICS.md)

## 4.3 mia_recommendation_rejection_signal · 9.3.0

- **Responsabilidade:** rejeição, refinamento, substituição, abandono explícito
- **Emissão:** turn context + decision transition
- **Dedup:** `decision_request_id + request_id + signal_type + signal_target + source_event_id + event_version`
- **Doc:** [RECOMMENDATION_REJECTION_ABANDONMENT_ANALYTICS.md](./RECOMMENDATION_REJECTION_ABANDONMENT_ANALYTICS.md)

## 4.4 Camada derivada 9.4 · 9.4.0

- **Sem evento novo** — enriquecimento additive em 9.1 + SQL sobre 9.1/9.2/9.3
- **Doc:** [RUNNER_UP_ALTERNATIVE_ANALYTICS.md](./RUNNER_UP_ALTERNATIVE_ANALYTICS.md)

---

# 5. Matriz de responsabilidades

| Evento | Responsabilidade | Não faz | Fonte | Server/Client | Dedup | SQL |
|--------|------------------|---------|-------|---------------|-------|-----|
| 9.1 decision | Winner/runner-up/constraints | Sinais usuário, busca, ofertas | Decision stabilize | Server | request_id | patch-91 Q1–Q5 |
| 9.2 acceptance | Interesse pós-decisão | Rejeição, compra confirmada | Track + follow-up | Both | decision_request_id + source_event_id | patch-92 Q1–Q8 |
| 9.3 rejection | Rejeição/refinamento/substituição | Inferir silêncio | Turn + transition | Server | decision_request_id + request_id | patch-93 Q1–Q10 |
| 9.4 derived | Runner-up analytics | Novo ranking | 9.1 enrich + SQL | Server/SQL | N/A | patch-94 Q1–Q12 |

**Sobreposição válida:** client events (`offer_click`, `mia_recommendation_shown`) + server 9.2 (modelo híbrido PATCH 9.2).  
**Sobreposição controlada:** RUNNER_UP_FOLLOW_UP emite 9.2 acceptance + 9.3 INCONCLUSIVE — documentado.

---

# 6. Jornada observável

| Elo | Observado por | Status |
|-----|---------------|--------|
| Decision | 9.1 | ✅ |
| Recommendation Render | 9.2 `RECOMMENDATION_RENDERED` | ✅ |
| Acceptance (click/favorito/alerta) | 9.2 | ✅ |
| Rejection / Refinement | 9.3 | ✅ |
| Alternative Request | 9.3 `ALTERNATIVE_REQUESTED` + 9.2 follow-up | ✅ |
| Runner-up | 9.1 enrichment + 9.4 SQL | ✅ |
| Replacement | 9.3 `WINNER_REPLACED` + transition | ✅ |
| Recovery | 9.3 Q8 + 9.4 Q8 (corrigido 9.5) | ✅ |

**Pontos cegos documentados (não bloqueantes):**

- `SESSION_ABANDONED_OBSERVED` — catalogado, não emitido
- Silêncio/inatividade — sem heartbeat
- SECOND_BEST_DISCOVERY — sem evento 9.1 dedicado
- `recovered_after_rejection` — campo hardcoded false

---

# 7. Taxonomias

Catálogos:

- `lib/miaRecommendationDecisionCatalog.js`
- `lib/miaRecommendationAcceptanceCatalog.js`
- `lib/miaRecommendationRejectionCatalog.js`
- `lib/miaRecommendationAlternativeCatalog.js`

Score gap buckets (9.4): TIE ≤0 · VERY_CLOSE ≤2 · CLOSE ≤5 · MODERATE ≤10 · WIDE >10

---

# 8. SQL

| Patch | Queries | Pasta |
|-------|---------|-------|
| 9.1 | Q1–Q5 | `docs/analytics/sql/patch-91-query*.sql` |
| 9.2 | Q1–Q8 | `docs/analytics/sql/patch-92-query*.sql` |
| 9.3 | Q1–Q10 | `docs/analytics/sql/patch-93-query*.sql` |
| 9.4 | Q1–Q12 | `docs/analytics/sql/patch-94-query*.sql` |

**Total Fase 9:** 35 queries. Padrão: CTEs, pré-agregação por `decision_request_id`, guards fan-out em Q8/Q10/Q12.

---

# 9. Correlação

| Campo | Semântica |
|-------|-----------|
| `request_id` (9.1) | Hub decisão = `decision_request_id` downstream |
| `decision_request_id` (9.2/9.3) | Decisão referenciada |
| `request_id` (9.3) | Turno do sinal (distinto da decisão) |
| `replacement_decision_request_id` | Nova decisão após substituição |
| `session_id` | Coluna row — correlação sessão |

Frontend: `MIAChat.jsx` propaga `decision_request_id`, `runner_up_product_family`, `acceptance_signal_id`.

---

# 10. Privacidade

9.x metadata: hashes de família, fingerprints, taxonomias, scores, UUIDs.

Bloqueado em sanitizers: `query_text`, `product_name`, URLs, mensagens, tokens.

Client allowlist ainda pode persistir `product_name` em eventos legados — fora do escopo 9.x metadata.

---

# 11. Produção e commits

| Patch | Commit implementação | Evidência |
|-------|---------------------|-----------|
| 9.1 | ver git log | `PATCH_9_1_PRODUCTION_EVIDENCE.json` |
| 9.2 | ver git log | `PATCH_9_2_PRODUCTION_EVIDENCE.json` |
| 9.3 | `e117854` / fix `bbd9328` | `PATCH_9_3_PRODUCTION_EVIDENCE.json` |
| 9.4 | `1a73a05` / SQL fix `55f784d` | `PATCH_9_4_PRODUCTION_EVIDENCE.json` |
| 9.5 | auditoria final | `PATCH_9_5_FINAL_AUDIT_EVIDENCE.json` |

Build produção validado: `1a73a053dc28` (health 200).

---

# 12. Limitações

- Dedup 9.2/9.3 in-memory — não cross-instance (backlog)
- 9.2 `metadata.request_id` no client path = decision_request_id (ambiguidade documentada)
- Runner-up authority = rankedProducts scan, não displayProducts[1]
- Taxonomias órfãs em catálogos (reservadas)

---

# 13. Backlog (Fase 10+)

1. Dedup DB-level para 9.2/9.3
2. Emitir ou remover taxonomias órfãs (`SESSION_ABANDONED_OBSERVED`, `PURCHASE_CONFIRMED`)
3. Wire `recovered_after_rejection` ou remover campo
4. Índices JSONB `(event_name, metadata->>'decision_request_id')`
5. SECOND_BEST_DISCOVERY observability dedicada
6. Atualizar PATCH 9.2 doc (runner-up follow-up agora habilitado)

---

# 14. Próximos passos — Fase 10

Savings Analytics: economia, inteligência de preços, alertas, anti-arrependimento.

Ver [02_analytics_roadmap.md](./02_analytics_roadmap.md) § Fase 10.

---

**Veredito:** 🟢 **FASE 9 ENCERRADA E APROVADA**
