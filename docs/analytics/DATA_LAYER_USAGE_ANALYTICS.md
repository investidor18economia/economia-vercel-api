# Data Layer Usage & Effectiveness Analytics — PATCH 6.4

**Fase 6 · Data Layer Analytics Estratégico**  
**Escopo:** uso real do Data Layer durante conversas comerciais (runtime observability)  
**Não mede:** cobertura de catálogo (6.1), qualidade de dados (6.2), estatísticas de inventário (6.3)

---

## 1. Objetivo

Responder:

> O Data Layer está sendo utilizado da maneira esperada e quão efetivo ele é durante conversas reais da MIA?

---

## 2. Arquitetura

```mermaid
flowchart LR
  A[MIAChat.jsx] -->|analytics_context| B[/api/mia-chat]
  B --> C[/api/chat-gpt4o]
  C --> D[Commercial pipeline]
  D --> E[miaDataLayerResolutionClassifier]
  D --> F[miaDataLayerUsageAnalytics]
  F -->|INSERT server-side| G[(analytics_events)]
  C -->|data_layer_usage_analytics summary| A
  A -->|metadata estendido| H[mia_recommendation_shown]
  G --> I[analytics-data-layer-usage.sql]
```

| Camada | Artefato | Papel |
|--------|----------|-------|
| Classificação | `lib/miaDataLayerResolutionClassifier.js` | Estados objetivos FULL / PARTIAL / FALLBACK / NO_RESULT |
| Instrumentação | `lib/miaDataLayerUsageAnalytics.js` | Payload + INSERT não bloqueante |
| Runtime | `pages/api/chat-gpt4o.js` | Observação após pipeline comercial |
| Frontend | `components/MIAChat.jsx` | Propaga `session_id` / `visitor_id` / espelha resumo em `mia_recommendation_shown` |
| Dashboard | `docs/analytics/analytics-data-layer-usage.sql` | Métricas derivadas de eventos |

**Princípio:** observar apenas — nenhuma alteração em ranking, fallback, prompts ou roteamento.

---

## 3. Event contract (server-side)

### Evento único parametrizado

Decisão técnica: **um evento** `data_layer_resolution` com classificação no metadata, em vez de 7 eventos redundantes (`data_layer_used`, `fallback_only`, etc.). Os flags booleanos permanecem no metadata para dashboards SQL simples.

| Campo | Valor |
|-------|-------|
| `event_name` | `data_layer_resolution` |
| `category` | `data_layer_usage` (produção) · `data_layer_usage_test` (smoke controlado) |
| Writer | Backend service role (`lib/miaDataLayerUsageAnalytics.js`) |
| Versionamento | `metadata.event_version = "6.4.0"` |

Convenção alinhada a `MIA_PRICE_ALERT_EMAIL_ANALYTICS_VERSION` (PATCH 5): versão semver no módulo + campo `event_version` no metadata. Eventos históricos **sem** `event_version` permanecem válidos; SQL trata ausência como `legacy_sem_versao`.

### Classificações (`metadata.response_classification`)

| Estado | Regra objetiva |
|--------|----------------|
| `FULL_DATA_LAYER` | Produtos retornados; DL foi fonte primária ou follow-up reutilizando produtos DL; sem híbrido nem fallback de ranking |
| `PARTIAL_DATA_LAYER` | DL utilizado + enriquecimento comercial híbrido, composição mista ou fallback inteligente pós-ranking |
| `FALLBACK_ONLY` | Produtos retornados sem uso do DL como fonte primária |
| `NO_COMMERCIAL_RESULT` | Nenhum produto comercial exibido |

### Fallback kinds (`metadata.fallback_kind`)

| Valor | Significado |
|-------|-------------|
| `none` | Sem fallback relevante |
| `necessary` | DL vazio → providers comerciais |
| `expected` | Enriquecimento híbrido DL + oferta comercial (comportamento esperado) |
| `avoidable` | Candidatos DL existiam mas isolamento bloqueou todos |

### Metadata principal

`request_id`, `response_path`, `intent`, `data_layer_used`, `fallback_used`, `hybrid_response`, `candidates_found`, `candidates_used`, `isolation_applied`, `hybrid_enrich_count`, `query_duration_ms`, `winner_source`, `final_provider`, `model_family`, `confidence`.

---

## 4. Métricas e fórmulas

Denominador padrão: **consultas comerciais instrumentadas** (`event_name = 'data_layer_resolution'` no escopo produção).

| Métrica SQL | Fórmula | Numerador |
|-------------|---------|-----------|
| `data_layer_hit_rate` | `count(data_layer_used=true) / total` | consultas com DL |
| `fallback_rate` | `count(fallback_used=true) / total` | consultas com fallback |
| `hybrid_rate` | `count(hybrid_response=true) / total` | respostas híbridas |
| `full_coverage_rate` | `count(FULL_DATA_LAYER) / total` | cobertura total |
| `partial_coverage_rate` | `count(PARTIAL_DATA_LAYER) / total` | cobertura parcial |
| `fallback_only_rate` | `count(FALLBACK_ONLY) / total` | só fallback |
| `no_commercial_result_rate` | `count(NO_COMMERCIAL_RESULT) / total` | sem resultado |

**Regra Fase 6:** sempre `valor_absoluto`, `valor_relativo`, `registros_total`, `referencia_denominador`. Sem percentuais artificiais — se `registros_total = 0`, `valor_relativo` é NULL e `limitacao = 'sem_eventos_apos_deploy_patch_64'`.

---

## 5. Dashboards SQL

| Arquivo | Conteúdo |
|---------|----------|
| `analytics-data-layer-usage.sql` | Consolidado (4 queries) |
| `sql/patch-64-query1-effectiveness-overview.sql` | Efetividade global |
| `sql/patch-64-query2-coverage-dimensions.sql` | Cobertura por categoria / marca / família |
| `sql/patch-64-query3-fallback-analytics.sql` | Fallback por tipo, categoria, path, intent |
| `sql/patch-64-query4-evolution-gaps-panel.sql` | Evolução diária + gaps operacionais + versão contrato |

Filtro produção: `analytics-production-scope.sql` + exclusão `data_layer_usage_test` + `metadata.controlled_test = true`.

---

## 6. Integração frontend (retrocompatível)

- Chat envia `analytics_context` para correlacionar eventos server-side com identidade analítica.
- Resposta inclui `data_layer_usage_analytics` (summary seguro).
- `mia_recommendation_shown` recebe campos opcionais `data_layer_*` no metadata — campos legados `has_offer_card` / `products_count` preservados.

---

## 7. Limitações

1. **Deploy obrigatório** — PATCH 6.4 altera runtime; dashboards podem estar vazios até conversas reais pós-deploy.
2. **Sem coluna `environment`** no Analytics Storage Schema v1 — testes controlados excluídos por categoria/metadata.
3. **Follow-up de prioridade** reutiliza produtos da sessão sem nova busca DL — classificado pelo conteúdo dos produtos, não por nova query ao catálogo.
4. **Gaps operacionais** derivados de uso real — não substituem gaps estruturais do PATCH 6.1.
5. **`query_duration_ms`** mede tempo desde início do pipeline comercial local, não latência E2E completa.

---

## 8. Referências

- [PATCH 6.1 — Coverage](./DATA_LAYER_COVERAGE_ANALYTICS.md)
- [PATCH 6.2 — Quality](./DATA_QUALITY_ANALYTICS.md)
- [PATCH 6.3 — Statistics](./DATA_LAYER_STATISTICS.md)
- [Event Contract §7.5](./contracts/EVENT_CONTRACT.md)
- [Production scope](./analytics-production-scope.sql)
