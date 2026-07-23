# Analytics — Dashboards SQL (PATCH 1.3 + PATCH 4.1–4.5 + PATCH 5.1–5.4 + PATCH 6.1–6.4 + PATCH 7.1)

## Fase 4 vs Fase 5 vs Fase 6

| Camada | Pergunta | Patches |
|--------|----------|---------|
| **Operacional (Fase 4)** | O que aconteceu? | 4.1–4.5 dashboards SQL |
| **Estratégica (Fase 5)** | O que isso significa? | 5.1–5.4 analytics estratégico |
| **Data Layer (Fase 6)** | Cobertura · qualidade · estatísticas · **uso runtime** | 6.1 · 6.2 · 6.3 · **6.4** |
| **Reliability (Fase 7)** | Confiabilidade das respostas entregues | **7.1** (response outcomes) |

## Sessão vs visitante vs usuário

| Conceito | Campo / métrica | Significado |
|----------|-----------------|-------------|
| **Sessão** | `session_id` / `sessoes_unicas` | Sessão anônima da aba do navegador |
| **Visitante** | `visitor_id` / `dau_visitors` | Identidade anônima persistente (first-party) |
| **Usuário autenticado** | `user_id` / `dau_users` | Conta OTP verificada |

`COUNT(DISTINCT session_id)` = **sessões únicas**, nunca visitantes, usuários, DAU ou MAU.

**Definições canônicas de métricas executivas:** [EXECUTIVE_METRICS.md](./EXECUTIVE_METRICS.md) (PATCH 4.1)

## Schema e contrato

| Documento | Conteúdo |
|-----------|----------|
| [ANALYTICS_SCHEMA.md](./ANALYTICS_SCHEMA.md) | Analytics Storage Schema v1 |
| [contracts/EVENT_CONTRACT.md](./contracts/EVENT_CONTRACT.md) | Event Contract v1 — 7 eventos públicos / 19 totais |
| [EXECUTIVE_METRICS.md](./EXECUTIVE_METRICS.md) | Governança DAU/WAU/MAU Visitors + Users |
| [ANALYTICS_DATA_DICTIONARY.md](./ANALYTICS_DATA_DICTIONARY.md) | Colunas consultadas |
| [README.md](./README.md) | Índice oficial |

Migrations: `supabase/migrations/20260719153000_*` + `20260719153001_*` (PATCH 1.4)

## Arquivos

| Arquivo | Uso |
|---------|-----|
| `analytics-data-layer-coverage.sql` | **PATCH 6.1** — cobertura Data Layer (categoria · marca · lacunas) |
| `analytics-data-layer-quality.sql` | **PATCH 6.2** — qualidade Data Layer (completude · duplicações · integridade) |
| `analytics-data-layer-statistics.sql` | **PATCH 6.3** — estatísticas Data Layer (inventário · distribuição · concentração) |
| `analytics-data-layer-usage.sql` | **PATCH 6.4** — uso e efetividade Data Layer (runtime · fallback · cobertura prática) |
| `analytics-reliability-response.sql` | **PATCH 7.1** — confiabilidade de resposta (outcomes · taxas · evolução) |
| `analytics-buying-intent-strategic.sql` | **PATCH 5.4** — intenção de compra estratégica (sinais · antecedentes · tendências) |
| `analytics-conversion-strategic.sql` | **PATCH 5.3** — funil estratégico (gargalos · cohorts · tendências) |
| `analytics-conversation-strategic.sql` | **PATCH 5.2** — conversation estratégico (profundidade · recorrência · tendências) |
| `analytics-growth-strategic.sql` | **PATCH 5.1** — growth estratégico (cohorts · retenção · tendências) |
| `analytics-data-quality-dashboard.sql` | **PATCH 4.5** — qualidade dos dados (volume · cobertura · integridade) |
| `analytics-products-categories-dashboard.sql` | **PATCH 4.4** — produtos e categorias (ranking + evolução diária) |
| `analytics-conversion-dashboard.sql` | **PATCH 4.3** — conversão (funil + evolução diária + segmentos) |
| `analytics-growth-dashboard.sql` | **PATCH 4.2** — crescimento (evolução + comparação + aquisição) |
| `analytics-executive-dashboard.sql` | **PATCH 4.1** — snapshot executivo + evolução diária |
| `analytics-overview.sql` | Produção — totais e sessões únicas (MIA) |
| `analytics-daily-sessions.sql` | Produção — sessões únicas por dia |
| `analytics-categories.sql` | Produção — categorias de perguntas |
| `analytics-products.sql` | Produção — produtos recomendados / cliques |
| `analytics-ctr.sql` | Produção — CTR recomendação → clique |
| `analytics-buying-intent.sql` | Produção — sinais de intenção de compra |
| `analytics-qa-overview.sql` | QA — eventos de teste isolados |
| `analytics-production-scope.sql` | Referência do filtro produção |

## Produção × testes

Filtro determinístico aplicado nos dashboards de produção:

1. `category IN ('price_alert_email_test', 'price_alert_e2e_test')`
2. `event_name LIKE 'price_drop_email_test_%'` ou `'price_drop_email_e2e_%'`
3. `session_started` com `metadata.user_agent = 'test-agent'` (harness local)

**Limitação:** não existe coluna `environment` no Analytics Storage Schema v1 (PATCH 1.4). Eventos MIA reais sem esses marcadores entram na visão de produção. Separação estrutural universal está documentada no [Event Contract](./contracts/EVENT_CONTRACT.md).

## Métricas corrigidas

| Nome | Fórmula | Limitação |
|------|---------|-----------|
| `sessoes_unicas` | `COUNT(DISTINCT session_id)` nos 7 eventos MIA públicos | Uma pessoa pode abrir várias abas |
| `sessoes_unicas_diarias` | Idem, agrupado por `date(created_at)` UTC | Não é DAU — são sessões de aba |
| `dau_visitors` | `COUNT(DISTINCT visitor_id)` por dia UTC | Ver [EXECUTIVE_METRICS.md](./EXECUTIVE_METRICS.md) |
| `dau_users` | `COUNT(DISTINCT user_id)` por dia UTC | Apenas autenticados |

`analytics-dau.sql` foi renomeado para `analytics-daily-sessions.sql` (alias `usuarios_ativos` removido).

## Referências

- [EXECUTIVE_METRICS.md](./EXECUTIVE_METRICS.md) — governança PATCH 4.1
- [contracts/EVENT_CONTRACT.md](./contracts/EVENT_CONTRACT.md) — definição dos eventos filtrados
- [analytics-production-scope.sql](./analytics-production-scope.sql) — predicado reutilizável
- [ANALYTICS_CHANGELOG.md](./ANALYTICS_CHANGELOG.md) — PATCH 1.3 · PATCH 4.1–4.6 · PATCH 5.1–5.5 · PATCH 6.1–6.3
- [PATCH_5.5_PHASE_5_FINAL_AUDIT.md](./PATCH_5.5_PHASE_5_FINAL_AUDIT.md) — auditoria final Fase 5
- [README.md](./README.md) — índice oficial

---

*Dashboards SQL — PATCH 1.3 · PATCH 4.1–4.5 · PATCH 5.1–5.4 Strategic Analytics · PATCH 5.5 Final Audit*
