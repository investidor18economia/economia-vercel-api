# PATCH 6.4 — Data Layer Usage & Effectiveness Analytics

**Status:** 🟡 EM ANDAMENTO — implementação concluída; aguardando deploy + validação em conversas reais  
**Data:** 2026-07-22  
**Fase:** 6 — Data Layer Analytics Estratégico

---

## 1. Resumo executivo

PATCH 6.4 introduz a **primeira instrumentação controlada de runtime** da Fase 6 para medir como o Data Layer é utilizado e quão efetivo é durante consultas comerciais reais. O comportamento da MIA permanece inalterado — apenas observação estruturada via evento server-side `data_layer_resolution`.

---

## 2. Arquitetura

- **Classificador:** `lib/miaDataLayerResolutionClassifier.js`
- **Analytics INSERT:** `lib/miaDataLayerUsageAnalytics.js`
- **Hook runtime:** `pages/api/chat-gpt4o.js` (paths comerciais)
- **Correlação identidade:** `components/MIAChat.jsx` → `analytics_context`
- **Dashboards:** `docs/analytics/analytics-data-layer-usage.sql`

---

## 3. Instrumentação implementada

| Ponto | Ação |
|-------|------|
| Busca DL + isolamento | Métricas `candidates_found`, `candidates_after_isolation`, `isolation_*` |
| Enriquecimento híbrido | `hybrid_enrich_count` |
| Fallback inteligente | `intelligent_fallback_used` |
| `return_seguro` | Emite evento + summary na resposta API |
| `commercial_only_fallback` | Emite `FALLBACK_ONLY` |
| `commercial_new_search_no_result` | Emite `NO_COMMERCIAL_RESULT` |
| `commercial_resolution_incomplete` | Emite `NO_COMMERCIAL_RESULT` |

---

## 4. Eventos criados

**Decisão:** evento único parametrizado (não 7 eventos redundantes).

| event_name | Versão | Writer |
|------------|--------|--------|
| `data_layer_resolution` | `6.4.0` | Server-side INSERT |

---

## 5. Contratos

- Estendido [EVENT_CONTRACT.md](./contracts/EVENT_CONTRACT.md) §7.5
- Versionamento: `metadata.event_version` (retrocompatível)
- Frontend: `mia_recommendation_shown` metadata estendido (opcional)

---

## 6. Dashboards

| Query | Split |
|-------|-------|
| Efetividade global | `sql/patch-64-query1-effectiveness-overview.sql` |
| Cobertura prática | `sql/patch-64-query2-coverage-dimensions.sql` |
| Fallback analytics | `sql/patch-64-query3-fallback-analytics.sql` |
| Evolução + gaps | `sql/patch-64-query4-evolution-gaps-panel.sql` |

---

## 7. Métricas

Hit Rate · Fallback Rate · Hybrid Rate · Full/Partial/No Coverage Rate · Fallback kinds (necessary/expected/avoidable)

---

## 8. Cobertura prática

Classificação objetiva por consulta comercial instrumentada, segmentável por categoria, marca e família (Query 2).

---

## 9. Uso do fallback

Query 3 separa fallback por `fallback_kind`, `response_path`, categoria e intent.

---

## 10. Efetividade

Query 1 calcula taxas a partir de eventos — sem estimativa.

---

## 11. Gaps operacionais

Query 4 deriva gaps de uso real (`sem_cobertura_recorrente`, `cobertura_parcial_recorrente`, `sempre_coberta`) — **não** reutiliza gaps do PATCH 6.1.

---

## 12. Testes

```bash
npm run test:mia:analytics:patch-64:data-layer-usage-analytics
npm run test:mia:analytics:patch-64:prod-validation
```

Regressões recomendadas: 6.1 · 6.2 · 6.3 · 4.5 · 5.5

---

## 13. Evidências de produção

| Check | Status |
|-------|--------|
| Health endpoint | A executar pós-merge |
| SQL dashboards linked | A executar |
| Eventos `data_layer_resolution` | **0 esperado até deploy + conversas reais** |
| Conversa real interface MIA | **Pendente deploy** |

---

## 14. Limitações

1. Requer deploy para emitir eventos
2. Dashboards vazios até tráfego comercial real
3. Follow-up de prioridade não reconsulta DL
4. Sem coluna `environment` no schema v1

---

## 15. Próximos passos

1. Deploy aprovado
2. Conversas comerciais reais pela interface MIA
3. Reexecutar prod validation com eventos > 0
4. Aprovação formal PATCH 6.4
5. **PATCH 6.5** — somente após aprovação explícita

---

*Relatório PATCH 6.4 — Data Layer Usage & Effectiveness Analytics*
